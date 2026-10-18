import { BROWSER } from 'esm-env'
import { makeFrameFileKey, readFrameFileRows, storeFrameFileRows, type IFrameFileRow } from './frame-cache.idb.js'
import { decodeFrameAnswer, decodeFrameFile, formatHeldFrameFiles, type FrameAnswer, type FrameFile } from './frame.wire.js'

/**
 * The files of a frame to read: a range of its first Key and, optionally, the values of the Keys
 * right after it (the backend's dataframe.Selection).
 */
export interface FrameSelection {
	fromKey: number
	toKey: number
	pinnedKeys?: number[]
}

/** A file of the selection, decoded: its Keys, and its rows as columns (FrameFile). */
export interface FrameFileRows extends FrameFile {
	keys: number[]
}

export interface FrameFilesResult {
	// The frame's snapshot (SUnixTime): every file is at least this current, "data as of".
	snapshot: number
	// Sorted by keys.
	files: FrameFileRows[]
}

export interface FrameFilesGetterRuntime {
	// GET returning the raw body; it rejects (and notifies) on a non-200 answer.
	getBytes: (route: string) => Promise<Uint8Array>
	isBrowser?: () => boolean
}

export type FrameFilesGetter = (route: string, frame: string, selection: FrameSelection) => Promise<FrameFilesResult>

export const isFrameFileSelected = (keys: number[], selection: FrameSelection): boolean => {
	const firstKey = keys[0] as number
	if (firstKey < selection.fromKey || firstKey > selection.toKey) return false
	return (selection.pinnedKeys || []).every((pinnedKey, i) => keys[i + 1] === pinnedKey)
}

export const makeFrameRoute = (route: string, frame: string, selection: FrameSelection, generation: string, heldText: string): string => {
	const params = new URLSearchParams({ f: frame, from: String(selection.fromKey), to: String(selection.toKey) })
	if (selection.pinnedKeys?.length) params.set('k', selection.pinnedKeys.join('_'))
	if (generation) params.set('g', generation)
	if (heldText) params.set('h', heldText)
	return `${route}${route.includes('?') ? '&' : '?'}${params.toString()}`
}

/**
 * mergeFrameAnswer lays the answered files over the held copies of the selection: the rows to store
 * (all of the frame replaced when the answer is of another generation) and the selection decoded.
 */
export const mergeFrameAnswer = (route: string, frame: string, heldSelectedRows: IFrameFileRow[], heldGeneration: string, answer: FrameAnswer) => {
	const isNewGeneration = answer.generation !== heldGeneration
	const answeredRows: IFrameFileRow[] = answer.files.map((file) => ({
		route,
		frame,
		fileKey: makeFrameFileKey(file.keys),
		keys: file.keys,
		generation: answer.generation,
		snapshot: file.snapshot,
		slot: file.slot,
		content: file.content,
	}))
	const rowsByFileKey = new Map<string, IFrameFileRow>()
	if (!isNewGeneration) heldSelectedRows.forEach((row) => rowsByFileKey.set(row.fileKey, row))
	answeredRows.forEach((row) => rowsByFileKey.set(row.fileKey, row))

	const files: FrameFileRows[] = []
	for (const row of rowsByFileKey.values()) {
		if (row.content.length === 0) continue // a file without rows
		files.push({ keys: row.keys, ...decodeFrameFile(row.content, answer.rowColumnCount, answer.sumsCount) })
	}
	files.sort((a, b) => {
		for (let i = 0; i < a.keys.length; i++) {
			if (a.keys[i] !== b.keys[i]) return (a.keys[i] as number) - (b.keys[i] as number)
		}
		return 0
	})
	return { answeredRows, isNewGeneration, result: { snapshot: answer.snapshot, files } as FrameFilesResult }
}

/**
 * createFrameFilesGetter reads a frame's files through a frame route (backend: FrameQuery.ExecChanged),
 * keeping the raw files in IndexedDB: each call sends what it holds of the selection and receives
 * only the files that changed since, as current as the records.
 */
export const createFrameFilesGetter = (runtime: FrameFilesGetterRuntime): FrameFilesGetter => {
	const isBrowser = runtime.isBrowser ?? (() => BROWSER)

	return async (route, frame, selection) => {
		const heldRows = isBrowser() ? await readFrameFileRows(route, frame) : []
		// Only the copies of the selection travel; they all share one generation (a new one replaces all).
		const heldSelectedRows = heldRows.filter((row) => isFrameFileSelected(row.keys, selection))
		const heldGeneration = heldRows[0]?.generation || ''
		const body = await runtime.getBytes(makeFrameRoute(route, frame, selection, heldGeneration, formatHeldFrameFiles(heldSelectedRows)))

		const { answeredRows, isNewGeneration, result } = mergeFrameAnswer(route, frame, heldSelectedRows, heldGeneration, decodeFrameAnswer(body))
		if (isBrowser()) await storeFrameFileRows(route, frame, answeredRows, isNewGeneration)
		console.debug('[frame-cache] Frame files merged.', {
			route, frame, held: heldSelectedRows.length, answered: answeredRows.length, isNewGeneration,
		})
		return result
	}
}
