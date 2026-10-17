/**
 * The delta log as the browser reads it. Pure: no fetch, no Svelte.
 *
 * Every write to a record appends an entry to its TypeDelta index's 10-minute file. A delta response
 * carries, next to the records, one Metadata record per file it read: a record with a negative ID
 * (−bucket) whose `mdt` holds, in Safe85:
 *
 *   [flags: u8][bucket: uvarint][log ID column count: u8][Size of each column: u8 …][the file's bytes]
 *
 * and the file is a sequence of entries, bit-packed big-endian:
 *
 *   header 0..2  [header:2][deleted:1][log ID:w][version:13]
 *                w: 16, 24, 32 bits on the 32-bit scale; 32, 48, 64 on the 64-bit scale
 *   header 3     [3:2][deleted:1][version:13][count:8] + count uvarint log ID deltas, ascending
 *
 * The Go side is genix-orm/dynamo/delta_log_codec.go; both are pinned by
 * genix-orm/db/cache/testdata/delta_log_vectors.json.
 */
import { decodeSafe85 } from './safe85'

const VERSION_BITS = 13
const VERSION_MODULO = 2 ** VERSION_BITS - 1
const GROUP_HEADER = 3
const LOG_ID_WIDTHS = [[16, 24, 32], [32, 48, 64]] as const

export const DELTA_METADATA_FLAG_64_BIT_SCALE = 1
// The response holds every record of the view: drop the held records it doesn't hold.
export const DELTA_METADATA_FLAG_REPLACE = 2
// No append reaches the file anymore: apply it, then forget it from the cursor.
export const DELTA_METADATA_FLAG_SEALED = 4

export interface DeltaLogEntry {
	logID: number
	version: number // 1..8191
	isDeleted: boolean
}

export interface DeltaMetadata {
	flags: number
	bucket: number
	// The Size of each log ID column when the log ID packs several (empty for one column).
	logIDColumnBits: number[]
	fileBytes: Uint8Array
}

// wireVersion folds a record's `ver` (1..32767) into an entry's 13 bits: compare the two by equality.
export const wireVersion = (version: number): number => ((version - 1) % VERSION_MODULO) + 1

// packDeltaLogID packs a record's log ID columns, the first one in the high bits. The backend keeps a
// packed log ID within 53 bits, so a JS number holds it exactly.
export const packDeltaLogID = (values: number[], columnBits: number[]): number => {
	let logID = 0
	values.forEach((value, i) => { logID = logID * 2 ** (columnBits[i] as number) + value })
	return logID
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
	throw new Error(`delta log: truncated uvarint at byte ${position}`)
}

export const decodeDeltaMetadata = (safe85Text: string): DeltaMetadata => {
	const bytes = decodeSafe85(safe85Text)
	const flags = bytes[0] as number
	const [bucket, columnCountPosition] = readUvarint(bytes, 1)
	const columnCount = bytes[columnCountPosition] as number
	const columnsStart = columnCountPosition + 1
	return {
		flags,
		bucket,
		logIDColumnBits: Array.from(bytes.subarray(columnsStart, columnsStart + columnCount)),
		fileBytes: bytes.subarray(columnsStart + columnCount),
	}
}

// decodeDeltaLogEntries reads a file, or the part of it past a byte offset, entry by entry.
export const decodeDeltaLogEntries = (bytes: Uint8Array, is64BitScale: boolean): DeltaLogEntry[] => {
	const entries: DeltaLogEntry[] = []
	let bitPosition = 0
	const readBits = (bitCount: number): number => {
		if (bitPosition + bitCount > bytes.length * 8) {
			throw new Error(`delta log: entry at byte ${Math.floor(bitPosition / 8)} is truncated`)
		}
		let value = 0
		for (let i = 0; i < bitCount; i++, bitPosition++) {
			value = value * 2 + (((bytes[bitPosition >> 3] as number) >> (7 - (bitPosition & 7))) & 1)
		}
		return value
	}
	while (bitPosition < bytes.length * 8) {
		const entryStart = bitPosition / 8
		const header = readBits(2)
		const isDeleted = readBits(1) === 1
		if (header === GROUP_HEADER) {
			const version = readBits(VERSION_BITS)
			const count = readBits(8)
			if (count === 0 || version === 0) throw new Error(`delta log: group at byte ${entryStart} is malformed`)
			let position = bitPosition / 8
			let logID = 0
			for (let i = 0; i < count; i++) {
				const [logIDDelta, nextPosition] = readUvarint(bytes, position)
				position = nextPosition
				logID += logIDDelta
				entries.push({ logID, version, isDeleted })
			}
			bitPosition = position * 8
			continue
		}
		const logID = readBits(LOG_ID_WIDTHS[is64BitScale ? 1 : 0][header] as number)
		const version = readBits(VERSION_BITS)
		if (version === 0) throw new Error(`delta log: entry at byte ${entryStart} has version 0`)
		entries.push({ logID, version, isDeleted })
	}
	return entries
}
