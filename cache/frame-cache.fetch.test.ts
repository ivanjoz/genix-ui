import { describe, expect, it } from 'bun:test'
import { isFrameFileSelected, makeFrameRoute, mergeFrameAnswer } from './frame-cache.fetch'
import type { IFrameFileRow } from './frame-cache.idb'

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16))

// "one-rows-column" of genix-orm/dataframe/testdata/frame_wire_vectors.json: 4 rows, 2 sums.
const fileContent = fromHex('0407a8b7f4bc0104e90701020640f0024f0a069022020005030a01')

const heldRow = (keys: number[], generation: string): IFrameFileRow => ({
	route: 'r', frame: 'f', fileKey: keys.join('_'), keys, generation, snapshot: 5, slot: 1, content: fileContent,
})

describe('frame files selection and request', () => {
	it('selects a range of the first key and the pinned keys after it', () => {
		const selection = { fromKey: 2601, toKey: 2603, pinnedKeys: [4] }
		expect(isFrameFileSelected([2602, 4], selection)).toBe(true)
		expect(isFrameFileSelected([2602, 5], selection)).toBe(false)
		expect(isFrameFileSelected([2604, 4], selection)).toBe(false)
		expect(isFrameFileSelected([2600], { fromKey: 2600, toKey: 2600 })).toBe(true)
	})

	it('sends the selection, the generation and the held files', () => {
		expect(makeFrameRoute('vol-frames', 'enrollment-month', { fromKey: 2601, toKey: 2612 }, 'P4F', '2601.5.1'))
			.toBe('vol-frames?f=enrollment-month&from=2601&to=2612&g=P4F&h=2601.5.1')
		expect(makeFrameRoute('vol-frames?x=1', 'a', { fromKey: 1, toKey: 1, pinnedKeys: [2, 3] }, '', ''))
			.toBe('vol-frames?x=1&f=a&from=1&to=1&k=2_3')
	})
})

describe('mergeFrameAnswer', () => {
	const answerOf = (generation: string, files: { keys: number[]; content: Uint8Array }[]) => ({
		generation, rowColumnCount: 1, sumsCount: 2, snapshot: 9,
		files: files.map((file) => ({ ...file, snapshot: 9, slot: 2 })),
	})

	it('keeps the held copies the answer leaves out and replaces the answered ones', () => {
		const merged = mergeFrameAnswer('r', 'f', [heldRow([2601], 'g1'), heldRow([2602], 'g1')], 'g1',
			answerOf('g1', [{ keys: [2602], content: new Uint8Array() }, { keys: [2603], content: fileContent }]))
		expect(merged.isNewGeneration).toBe(false)
		expect(merged.answeredRows.map((row) => row.fileKey)).toEqual(['2602', '2603'])
		// 2602 now has no rows: left out of the result, still stored so it is sent back as held.
		expect(merged.result.files.map((file) => file.keys)).toEqual([[2601], [2603]])
		expect(merged.result.files[0]!.rows).toEqual([[1001, 1002, 1005, 1100]])
		expect(merged.result.snapshot).toBe(9)
	})

	it('drops every held copy on another generation', () => {
		const merged = mergeFrameAnswer('r', 'f', [heldRow([2601], 'g1')], 'g1', answerOf('g2', [{ keys: [2602], content: fileContent }]))
		expect(merged.isNewGeneration).toBe(true)
		expect(merged.result.files.map((file) => file.keys)).toEqual([[2602]])
	})
})
