import { describe, expect, it } from 'bun:test'
import { readDeltaKeyResponse } from './delta-cache.cursor'
import { decodeDeltaWindowMetadata, deltaRecordHash, sumDeltaRecordHashes } from './delta-window.wire'
import { encodeSafe85 } from './safe85'

// Vectors copied from genix-orm/db/cache/testdata/delta_window_vectors.json (generated apart from
// both implementations): keep them in sync.
const recordVectors: [id: number, version: number, hash: number][] = [
	[1, 1, 2980047484],
	[2, 1, 2117216093],
	[1, 2, 232174035],
	[87, 5, 1142326658],
	[412, 32767, 1156860886],
	[1234567890123, 3, 2768639810],
	[4398046511103, 1, 949399778],
	[9007199254740991, 12, 297253237],
]
const windowVectors: { records: [number, number][]; hash: number }[] = [
	{ records: [], hash: 0 },
	{ records: [[1, 1]], hash: 2980047484 },
	{ records: [[1, 1], [87, 5], [412, 32767]], hash: 984267732 },
	{ records: [[412, 32767], [1, 1], [87, 5]], hash: 984267732 },
	{ records: [[1234567890123, 3], [9007199254740991, 12], [2, 1]], hash: 888141844 },
]
const metadataVectors = [
	{
		hex: '088088debe018a88debe01be84debe01fb87debe0115cd5b070273730102030c4bc502',
		metadata: {
			isReplace: false, nextCursor: 400000000, readTime: 400000010, windowFrom: 399999550, windowTo: 399999995,
			windowHash: 123456789, filterField: 'ss', filterValues: [1], removedIDs: [12, 87, 412],
		},
	},
	{
		hex: '0afb88debe018289debe010000000000000553746174650300040500',
		metadata: {
			isReplace: true, nextCursor: 400000123, readTime: 400000130, windowFrom: 0, windowTo: 0,
			windowHash: 0, filterField: 'State', filterValues: [0, 2, -3], removedIDs: [],
		},
	},
	{
		hex: '0805070000ffffffff000000',
		metadata: {
			isReplace: false, nextCursor: 5, readTime: 7, windowFrom: 0, windowTo: 0,
			windowHash: 4294967295, filterField: '', filterValues: [], removedIDs: [],
		},
	},
]

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16))

// windowMetadataRecord builds the Metadata record of a window sync: ss filter on [1], no removals
// unless given (one-byte uvarints: every value < 128).
const windowMetadataRecord = (window: {
	from: number; to: number; hash: number; next: number; readTime: number; removed?: number[]
}) => {
	const hashBytes = new Uint8Array(4)
	new DataView(hashBytes.buffer).setUint32(0, window.hash, true)
	const removedIDs = window.removed || []
	const removedDeltas = removedIDs.map((id, i) => id - (removedIDs[i - 1] ?? 0))
	return {
		ID: -1,
		mdt: encodeSafe85(Uint8Array.from([
			8, window.next, window.readTime, window.from, window.to, ...hashBytes, 2, 0x73, 0x73, 1, 2,
			removedIDs.length, ...removedDeltas,
		])),
	}
}
const recordIDOfServerID = (serverID: number) => serverID
const heldOf = (records: any[]) => ({ records, serverIDOfRecord: (record: any) => record.ID as number })

describe('deltaRecordHash', () => {
	it('matches the Go vectors', () => {
		for (const [id, version, hash] of recordVectors) expect(deltaRecordHash(id, version)).toBe(hash)
		for (const window of windowVectors) expect(sumDeltaRecordHashes(window.records)).toBe(window.hash)
	})
})

describe('decodeDeltaWindowMetadata', () => {
	it('matches the Go vectors', () => {
		for (const vector of metadataVectors) {
			expect(decodeDeltaWindowMetadata(encodeSafe85(fromHex(vector.hex)))).toEqual(vector.metadata)
		}
	})
})

describe('readDeltaKeyResponse on the window protocol', () => {
	// Held cursor "60.62": C = 60, V = 62, so the unsettled slice is [54, 60] (window [54, 61)).
	const heldCursor = '60.62'
	const heldRecords = [
		{ ID: 1, upd: 55, ver: 1, ss: 1 },
		{ ID: 87, upd: 60, ver: 5, ss: 1 },
		// Out of the filter and out of the slice: neither counts.
		{ ID: 90, upd: 60, ver: 3, ss: 0 },
		{ ID: 91, upd: 10, ver: 3, ss: 1 },
	]
	const serverSliceHash = sumDeltaRecordHashes([[1, 1], [87, 5]])

	it('keeps "C.V" when the held slice hashes as the server', () => {
		const response = readDeltaKeyResponse([
			{ ID: 5, upd: 99, ver: 1, ss: 1 },
			windowMetadataRecord({ from: 54, to: 61, hash: serverSliceHash, next: 99, readTime: 100 }),
		], heldCursor, recordIDOfServerID, heldOf(heldRecords))
		expect(response.records).toEqual([{ ID: 5, upd: 99, ver: 1, ss: 1 }])
		expect(response.cursor).toBe('99.100')
		expect(response.isWindowMismatch).toBe(false)
		expect(response.isReplace).toBe(false)
	})

	it('leaves out the records the response brought or removed', () => {
		// 87 was edited again (it comes back) and 1 moved out of the prefix: the server hashes neither.
		const response = readDeltaKeyResponse([
			{ ID: 87, upd: 98, ver: 6, ss: 1 },
			windowMetadataRecord({ from: 54, to: 61, hash: 0, next: 98, readTime: 100, removed: [1] }),
		], heldCursor, recordIDOfServerID, heldOf(heldRecords))
		expect(response.removedRecordIDs).toEqual([1])
		expect(response.isWindowMismatch).toBe(false)
	})

	it('asks for the slice again on a missed write, from the held V', () => {
		const response = readDeltaKeyResponse([
			{ ID: 5, upd: 99, ver: 1, ss: 1 },
			windowMetadataRecord({ from: 54, to: 61, hash: sumDeltaRecordHashes([[1, 2], [87, 5]]), next: 99, readTime: 100 }),
		], heldCursor, recordIDOfServerID, heldOf(heldRecords))
		expect(response.isWindowMismatch).toBe(true)
		// The new C (record 5 is applied), the held V: its slice is the one that missed the write.
		expect(response.cursor).toBe('99.62.r')
	})

	it('hashes nothing on a settled cursor', () => {
		const response = readDeltaKeyResponse([
			windowMetadataRecord({ from: 0, to: 0, hash: 0, next: 60, readTime: 120 }),
		], heldCursor, recordIDOfServerID, heldOf(heldRecords))
		expect(response.isWindowMismatch).toBe(false)
		expect(response.cursor).toBe('60.120')
	})
})
