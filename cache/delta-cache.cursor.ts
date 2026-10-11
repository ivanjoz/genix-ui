/**
 * The delta cursor of a response key and how a delta response moves it. Pure: no IndexedDB, no fetch.
 *
 * A delta response carries the changed records plus one Metadata record per log file the backend read
 * (delta-log.wire.ts): `mdt` holds the file's whole content, and the cursor is what the browser held of
 * each file still open: `{ [bucket]: bytes applied }`. It travels as `<bucket>.<bytes>` pairs joined
 * by dots, in the key's query param (`up` for a bare-array response). The backend reads every file
 * from those offsets on, so no entry is missed whatever order the writes landed in.
 */
import type { CacheRecordID, DeltaCursor } from './delta-cache.types'
import {
	DELTA_METADATA_FLAG_64_BIT_SCALE,
	DELTA_METADATA_FLAG_REPLACE,
	DELTA_METADATA_FLAG_SEALED,
	decodeDeltaLogEntries,
	decodeDeltaMetadata,
	type DeltaMetadata,
} from './delta-log.wire'

export const formatDeltaCursor = (cursor: DeltaCursor): string => {
	return Object.entries(cursor)
		.sort(([leftBucket], [rightBucket]) => Number(leftBucket) - Number(rightBucket))
		.map(([bucket, heldBytes]) => `${bucket}.${heldBytes}`)
		.join('.')
}

export const isDeltaMetadataRecord = (record: any): boolean => typeof record?.mdt === 'string'

export interface DeltaKeyResponse {
	// The records of the response, without its Metadata records.
	records: any[]
	// The cached records the log says left the view: deleted, soft-deleted, or moved out of it.
	removedRecordIDs: CacheRecordID[]
	// The response holds every record of the view: the held ones it doesn't hold go.
	isReplace: boolean
	// The cursor to send next time; undefined when the response carried no Metadata record (a route
	// not backed by a delta log), which leaves the held one as it was.
	cursor?: DeltaCursor
}

/**
 * readDeltaKeyResponse splits a response key's records into data and Metadata, and applies the log
 * entries past the held cursor. Per log ID the last entry wins: deleted removes the record, any other
 * entry comes with its record in the same response (or, when a soft delete landed after the backend
 * read the file, the deleted entry comes in the next one). `recordIDOfLogID` maps a log ID to the
 * cached record's ID: the ID itself for a one-column key, a lookup over the held records for a packed
 * one (`logIDColumnBits`).
 */
export const readDeltaKeyResponse = (
	responseRecords: any[],
	heldCursor: DeltaCursor,
	recordIDOfLogID: (logID: number, logIDColumnBits: number[]) => CacheRecordID | undefined,
): DeltaKeyResponse => {
	const records = responseRecords.filter((record) => !isDeltaMetadataRecord(record))
	const metadataList: DeltaMetadata[] = responseRecords
		.filter(isDeltaMetadataRecord)
		.map((record) => decodeDeltaMetadata(record.mdt))
		.sort((left, right) => left.bucket - right.bucket)
	if (metadataList.length === 0) {
		return { records, removedRecordIDs: [], isReplace: false }
	}

	const isReplace = metadataList.some((metadata) => (metadata.flags & DELTA_METADATA_FLAG_REPLACE) !== 0)
	const cursor: DeltaCursor = isReplace ? {} : { ...heldCursor }
	const isDeletedByLogID = new Map<number, boolean>()
	let logIDColumnBits: number[] = []
	for (const metadata of metadataList) {
		logIDColumnBits = metadata.logIDColumnBits
		// A replace carries every record already: its entries add nothing.
		const heldBytes = isReplace ? metadata.fileBytes.length : (heldCursor[metadata.bucket] ?? 0)
		// A file shorter than what is held was not appended to by this backend: read it whole.
		const unreadBytes = metadata.fileBytes.subarray(heldBytes <= metadata.fileBytes.length ? heldBytes : 0)
		const is64BitScale = (metadata.flags & DELTA_METADATA_FLAG_64_BIT_SCALE) !== 0
		for (const entry of decodeDeltaLogEntries(unreadBytes, is64BitScale)) {
			isDeletedByLogID.set(entry.logID, entry.isDeleted)
		}
		if ((metadata.flags & DELTA_METADATA_FLAG_SEALED) !== 0) {
			delete cursor[metadata.bucket]
		} else {
			cursor[metadata.bucket] = metadata.fileBytes.length
		}
	}

	const removedRecordIDs: CacheRecordID[] = []
	for (const [logID, isDeleted] of isDeletedByLogID) {
		if (!isDeleted) continue
		const recordID = recordIDOfLogID(logID, logIDColumnBits)
		if (recordID !== undefined) removedRecordIDs.push(recordID)
	}
	return { records, removedRecordIDs, isReplace, cursor }
}
