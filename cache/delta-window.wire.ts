/**
 * The delta window protocol as the browser reads it (genix-orm's Scylla driver). Pure: no fetch, no Svelte.
 *
 * There is no change log: the cursor is the highest `upd` (SUnixTime) the browser holds, sent as a
 * plain number. The server answers the records the view lists past `cursor − 10 s`, read by ID, plus
 * one Metadata record (ID −1) whose `mdt` holds, in Safe85:
 *
 *   [flags: u8]                      8 (window protocol), | 2 (replace)
 *   [next cursor: uvarint]
 *   [window from: uvarint][window to: uvarint]
 *   [window hash: u32 LE]
 *   [filter field length: u8][filter field: UTF-8]
 *   [filter value count: uvarint][filter value: zigzag varint] × count
 *   [removed ID count: uvarint][removed ID delta: uvarint] × count   ascending, the first absolute
 *
 * The window hash is the sum (mod 2³²) of deltaRecordHash(ID, ver) over the view rows with `upd` in
 * [from, to) whose filter field holds one of the filter values. The browser hashes what it holds in
 * the same window and, on a mismatch, asks again without a cursor (a replace).
 *
 * The Go side is genix-orm/db/cache/delta_window.go; both are pinned by
 * genix-orm/db/cache/testdata/delta_window_vectors.json.
 */
import { decodeSafe85 } from './safe85'

// Every window Metadata carries it: it tells this protocol apart from a delta log file.
export const DELTA_WINDOW_FLAG = 8
const DELTA_WINDOW_FLAG_REPLACE = 2

export interface DeltaWindowMetadata {
	isReplace: boolean
	nextCursor: number
	windowFrom: number
	windowTo: number
	windowHash: number
	// The JSON name of the sync filter field, "" when the index has none.
	filterField: string
	filterValues: number[]
	// The IDs that left the pinned prefix inside the window.
	removedIDs: number[]
}

const readUvarint = (bytes: Uint8Array, position: number): [value: number, nextPosition: number] => {
	let value = 0
	let multiplier = 1
	for (let i = position; i < bytes.length; i++) {
		const byte = bytes[i] as number
		value += (byte & 0x7f) * multiplier
		if (byte < 0x80) return [value, i + 1]
		multiplier *= 128
	}
	throw new Error(`delta window: truncated uvarint at byte ${position}`)
}

export const isDeltaWindowMetadataText = (safe85Text: string): boolean =>
	((decodeSafe85(safe85Text)[0] ?? 0) & DELTA_WINDOW_FLAG) !== 0

export const decodeDeltaWindowMetadata = (safe85Text: string): DeltaWindowMetadata => {
	const bytes = decodeSafe85(safe85Text)
	const flags = bytes[0] as number
	let position = 1
	let nextCursor: number, windowFrom: number, windowTo: number
	;[nextCursor, position] = readUvarint(bytes, position)
	;[windowFrom, position] = readUvarint(bytes, position)
	;[windowTo, position] = readUvarint(bytes, position)
	const windowHash = new DataView(bytes.buffer, bytes.byteOffset + position, 4).getUint32(0, true)
	position += 4
	const filterFieldLength = bytes[position] as number
	const filterField = new TextDecoder().decode(bytes.subarray(position + 1, position + 1 + filterFieldLength))
	position += 1 + filterFieldLength

	let filterValueCount: number
	;[filterValueCount, position] = readUvarint(bytes, position)
	const filterValues: number[] = []
	for (let i = 0; i < filterValueCount; i++) {
		let zigzagValue: number
		;[zigzagValue, position] = readUvarint(bytes, position)
		// Zigzag: even values are the non-negative ones.
		filterValues.push(zigzagValue % 2 === 0 ? zigzagValue / 2 : -(zigzagValue + 1) / 2)
	}

	let removedCount: number
	;[removedCount, position] = readUvarint(bytes, position)
	const removedIDs: number[] = []
	let previousID = 0
	for (let i = 0; i < removedCount; i++) {
		let idDelta: number
		;[idDelta, position] = readUvarint(bytes, position)
		previousID += idDelta
		removedIDs.push(previousID)
	}
	return {
		isReplace: (flags & DELTA_WINDOW_FLAG_REPLACE) !== 0,
		nextCursor, windowFrom, windowTo, windowHash, filterField, filterValues, removedIDs,
	}
}

// deltaRecordHash is one record's term of the window hash: the murmur3 32-bit finalizer over the ID's
// two 32-bit halves and the version, as Go's cache.DeltaRecordHash.
export const deltaRecordHash = (recordID: number, version: number): number => {
	const lowHalf = recordID >>> 0
	const highHalf = Math.floor(recordID / 4294967296) >>> 0
	const rotatedHighHalf = ((highHalf << 16) | (highHalf >>> 16)) >>> 0
	let mixed = (lowHalf ^ rotatedHighHalf ^ Math.imul(version & 0xffff, 0x9e3779b1)) >>> 0
	mixed ^= mixed >>> 16
	mixed = Math.imul(mixed, 0x85ebca6b) >>> 0
	mixed ^= mixed >>> 13
	mixed = Math.imul(mixed, 0xc2b2ae35) >>> 0
	mixed ^= mixed >>> 16
	return mixed >>> 0
}

export const sumDeltaRecordHashes = (records: [recordID: number, version: number][]): number => {
	let windowHash = 0
	for (const [recordID, version] of records) {
		windowHash = (windowHash + deltaRecordHash(recordID, version)) >>> 0
	}
	return windowHash
}

/**
 * hashHeldDeltaWindow hashes the held records the server's window covers: `upd` in [from, to), a
 * matching filter value, and none the response brought or removed — a record edited again after the
 * cursor moved out of the server's window but not out of the held one.
 */
export const hashHeldDeltaWindow = (
	heldRecords: any[],
	metadata: DeltaWindowMetadata,
	excludedServerIDs: Set<number>,
	serverIDOfRecord: (record: any) => number,
): number => {
	const filterValues = new Set(metadata.filterValues)
	const windowRecords: [number, number][] = []
	for (const record of heldRecords) {
		const updated = Number(record?.upd ?? 0)
		if (updated < metadata.windowFrom || updated >= metadata.windowTo) continue
		// An omitted field is its zero value, as the backend stores it.
		if (metadata.filterField && !filterValues.has(Number(record?.[metadata.filterField] ?? 0))) continue
		const serverID = serverIDOfRecord(record)
		if (excludedServerIDs.has(serverID)) continue
		windowRecords.push([serverID, Number(record?.ver ?? 0)])
	}
	return sumDeltaRecordHashes(windowRecords)
}
