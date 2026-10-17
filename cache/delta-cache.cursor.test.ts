import { describe, expect, it } from 'bun:test'
import { formatDeltaCursor, readDeltaKeyResponse } from './delta-cache.cursor'
import { encodeSafe85 } from './safe85'

const fromHex = (hex: string) => Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16))

// metadataRecord builds what the backend sends for one log file (bucket < 128, one-byte uvarint).
const metadataRecord = (bucket: number, flags: number, fileHex: string) => ({
	ID: -bucket,
	mdt: encodeSafe85(Uint8Array.from([flags, bucket, 0, ...fromHex(fileHex)])),
})

// Entries from genix-orm/db/cache/testdata/delta_log_vectors.json.
const record1234AtVersion7 = '009a4007'
const record70000Deleted = '60222e1fff'
const recordIDOfLogID = (logID: number) => logID

describe('formatDeltaCursor', () => {
	it('joins bucket.bytes pairs in bucket order', () => {
		expect(formatDeltaCursor({ 12: 40, 11: 4 })).toBe('11.4.12.40')
		expect(formatDeltaCursor({})).toBe('')
	})
})

describe('readDeltaKeyResponse', () => {
	it('strips Metadata records, removes deleted records and moves the cursor', () => {
		const response = readDeltaKeyResponse([
			{ ID: 1234, ver: 7 },
			metadataRecord(11, 0, record1234AtVersion7 + record70000Deleted),
		], {}, recordIDOfLogID)
		expect(response.records).toEqual([{ ID: 1234, ver: 7 }])
		expect(response.removedRecordIDs).toEqual([70000])
		expect(response.cursor).toEqual({ 11: 9 })
		expect(response.isReplace).toBe(false)
	})

	it('reads only the bytes past the held cursor', () => {
		const response = readDeltaKeyResponse([
			metadataRecord(11, 0, record70000Deleted + record1234AtVersion7),
		], { 11: 5 }, recordIDOfLogID)
		expect(response.removedRecordIDs).toEqual([])
		expect(response.cursor).toEqual({ 11: 9 })
	})

	it('forgets a sealed file and keeps the newer one', () => {
		const response = readDeltaKeyResponse([
			metadataRecord(12, 0, ''),
			metadataRecord(11, 4, record70000Deleted),
		], { 11: 0 }, recordIDOfLogID)
		expect(response.removedRecordIDs).toEqual([70000])
		expect(response.cursor).toEqual({ 12: 0 })
	})

	it('a replace ignores the entries and the held cursor', () => {
		const response = readDeltaKeyResponse([
			{ ID: 1 },
			metadataRecord(20, 2, record70000Deleted),
		], { 11: 3, 12: 8 }, recordIDOfLogID)
		expect(response.isReplace).toBe(true)
		expect(response.removedRecordIDs).toEqual([])
		expect(response.cursor).toEqual({ 20: 5 })
	})

	it('leaves a route without Metadata records alone', () => {
		const response = readDeltaKeyResponse([{ ID: 1 }], { 11: 3 }, recordIDOfLogID)
		expect(response.cursor).toBeUndefined()
		expect(response.records).toEqual([{ ID: 1 }])
	})
})
