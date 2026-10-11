/**
 * Goal:
 * Resolve records by IDs using a 3-layer strategy:
 * 1) in-memory map, 2) IndexedDB persistent cache, 3) server delta sync.
 * One request (`cc`, cache-by-ids.wire.ts) names the IDs per partition with the year tick held for
 * each of their slots, so the backend returns only new/changed records.
 *
 * `upd` on a record fetched through this path is its *slot's* last write, not its own: the backend
 * groups records into 256 slots per partition and keeps, per slot, the year tick (2 seconds) of its
 * last write. The record carries that tick as an Updated value, which `toYearTick` turns back. The
 * backend returns 0 while the tick is too recent to trust, which forces one more revalidation.
 *
 * A partitioned table (IDs unique only inside a partition, e.g. stories per project) caches each
 * partition under its own namespace, `<apiRoute>:<partition>`; partition 0 is `<apiRoute>`.
 */
import { clearCacheByIDsDatabase, readRecordsFromIDBByIDs, upsertRecordsIntoIDB } from "./cache-by-ids.idb"
import {
	cycleStartUpdated, encodeCachedIDsRequest, toYearTick, yearCycleOf, type CachedIDsPartitionRequest,
} from './cache-by-ids.wire.js'
import { clearQueryByIdMemoryCache } from "./cache-query-by-id"
import { getCacheRuntime } from './runtime.js'

const CACHE_TIME = 5

export interface IMinimalRecord {
	ID: number /* ID f the record */
	ss: number /* status: 1 active, 0 deleted */
	_fch?: number /* fetched: when the record was last fetched (in seconds) */
	upd: number /* the slot's year tick as an Updated value (see above); 0 means "unknown" and always forces a fetch */
}

const cacheRecordIdTable: Map<string,Map<number,IMinimalRecord>> = new Map()
const inFlightRecordsBatchPromiseByTable: Map<
	string,
	Map<number, Promise<Map<number, IMinimalRecord>>>
> = new Map()

// Static records (e.g. catalog rows that don't need version/update checks) live in a parallel cache.
// Same memory+IDB layout, but lookups are cache-first by ID with no freshness revalidation.
const staticCacheRecordIdTable: Map<string, Map<number, { ID: number }>> = new Map()
const inFlightStaticBatchPromiseByTable: Map<
	string,
	Map<number, Promise<Map<number, { ID: number }>>>
> = new Map()

const LOG_PREFIX = "[cache-by-ids]"

// cacheNamespaceOf is where a partition's records are cached, in memory and in IndexedDB.
const cacheNamespaceOf = (apiRoute: string, partition: number): string =>
	partition ? `${apiRoute}:${partition}` : apiRoute

// One partition of a by-IDs response: the records that moved. The backend's minijson omits a zero
// partition, so `p` is missing for a table without Partition.
export interface CachedPartitionResponse<T> {
	partition: number
	records: T[]
}

export type CacheByIDsFetchFromServer = <T extends IMinimalRecord>(
	apiRoute: string,
	cycleYear: number,
	partitions: CachedIDsPartitionRequest[],
) => Promise<CachedPartitionResponse<T>[]>

// The default fetcher throws when the request fails, so the caller doesn't take the silence for
// "nothing changed".
let fetchFromServer: CacheByIDsFetchFromServer = async <T extends IMinimalRecord>(
	apiRoute: string,
	cycleYear: number,
	partitions: CachedIDsPartitionRequest[],
): Promise<CachedPartitionResponse<T>[]> => {
	// `apiRoute` is treated as the backend route (example: `p-productos-ids`).
	const responsePayload = await getCacheRuntime().get({
		route: `${apiRoute}?cc=${encodeCachedIDsRequest(cycleYear, partitions)}`,
	})
	if (!Array.isArray(responsePayload)) {
		throw new Error(`${LOG_PREFIX} ${apiRoute} unexpected server response shape`)
	}
	return responsePayload.map((cachedPartition) => ({
		partition: cachedPartition?.p || 0,
		records: Array.isArray(cachedPartition?.r) ? cachedPartition.r : [],
	}))
}

export const configureCacheByIDs = (fetcher: CacheByIDsFetchFromServer) => {
	fetchFromServer = fetcher
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

const getOrCreateTableCache = (cacheNamespace: string): Map<number, IMinimalRecord> => {
	const existingTableCache = cacheRecordIdTable.get(cacheNamespace)
	if (existingTableCache) return existingTableCache
	const createdTableCache = new Map<number, IMinimalRecord>()
	cacheRecordIdTable.set(cacheNamespace, createdTableCache)
	return createdTableCache
}

const getOrCreateInFlightRecordsTable = (
	cacheNamespace: string,
): Map<number, Promise<Map<number, IMinimalRecord>>> => {
	const existingInFlightTable = inFlightRecordsBatchPromiseByTable.get(cacheNamespace)
	if (existingInFlightTable) return existingInFlightTable
	const createdInFlightTable = new Map<number, Promise<Map<number, IMinimalRecord>>>()
	inFlightRecordsBatchPromiseByTable.set(cacheNamespace, createdInFlightTable)
	return createdInFlightTable
}

const mergeFetchedRecordsIntoCache = async <T extends IMinimalRecord>(
	cacheNamespace: string,
	records: T[],
	fetchedAtSeconds: number,
): Promise<Map<number, T>> => {
	const tableCache = getOrCreateTableCache(cacheNamespace)
	const mergedRecords = new Map<number, T>()

	// Normalize server rows before writing so memory and IDB keep the same invariant.
	for (const fetchedRecord of records) {
		if (!fetchedRecord || typeof fetchedRecord.ID !== "number") {
			console.warn(`${LOG_PREFIX} Invalid record received from server. Skipping.`, fetchedRecord)
			continue
		}
		fetchedRecord._fch = fetchedAtSeconds
		if (typeof fetchedRecord.upd !== "number") fetchedRecord.upd = 0
		// The API's minijson skips zero values: a record without `ss` is a deleted one (ss = 0).
		if (typeof fetchedRecord.ss !== "number") fetchedRecord.ss = 0
		tableCache.set(fetchedRecord.ID, fetchedRecord)
		mergedRecords.set(fetchedRecord.ID, fetchedRecord)
	}

	if (mergedRecords.size > 0) {
		await upsertRecordsIntoIDB<T>(cacheNamespace, Array.from(mergedRecords.values()))
	}
	return mergedRecords
}

const normalizePositiveIDs = (ids: number[]): number[] => {
	const normalizedIDs: number[] = []
	const seenIDs = new Set<number>()

	for (const rawID of ids) {
		const numericID = Number(rawID)
		if (!Number.isFinite(numericID)) continue
		if (numericID <= 0) continue
		if (seenIDs.has(numericID)) continue
		seenIDs.add(numericID)
		normalizedIDs.push(numericID)
	}

	return normalizedIDs
}

// What a by-IDs call knows locally about one partition, and what it must ask the server.
interface PartitionLookup {
	partition: number
	cacheNamespace: string
	requestedIDs: number[]
	idTicks: [number, number][] // every requested ID but tombstones, with the tick held (0: not held)
	heldIDs: number[] // the ones held locally: a request revalidates them
	needsServer: boolean // a record is missing, or a held one went stale
}

// lookUpPartition resolves a partition's IDs from memory, then IndexedDB. A held record older than
// CACHE_TIME still answers, but makes the call revalidate the whole partition with the server.
const lookUpPartition = async <T extends IMinimalRecord>(
	apiRoute: string,
	partition: number,
	ids: number[],
	cycleStart: number,
	currentTimeSeconds: number,
	cacheHintsByID?: Map<number, T | false>,
): Promise<PartitionLookup> => {
	const cacheNamespace = cacheNamespaceOf(apiRoute, partition)
	const tableCache = getOrCreateTableCache(cacheNamespace)
	const lookup: PartitionLookup = {
		partition, cacheNamespace, requestedIDs: normalizePositiveIDs(ids), idTicks: [], heldIDs: [], needsServer: false,
	}

	const holdRecord = (id: number, record: T) => {
		// Tombstone: never fetch again, and never return as "active" record.
		if (record.ss === 0) return
		lookup.heldIDs.push(id)
		lookup.idTicks.push([id, toYearTick(record.upd, cycleStart)])
		if (currentTimeSeconds - (record._fch || 0) > CACHE_TIME) lookup.needsServer = true
	}
	const markMissing = (id: number) => {
		lookup.idTicks.push([id, 0])
		lookup.needsServer = true
	}

	const idsMissingFromMemory: number[] = []
	for (const id of lookup.requestedIDs) {
		// Optional hint path: caller already knows local cache state for this ID.
		if (cacheHintsByID?.has(id)) {
			const hintedRecord = cacheHintsByID.get(id)
			if (!hintedRecord) {
				markMissing(id)
				continue
			}
			// Keep memory cache aligned with caller-provided local state.
			tableCache.set(id, hintedRecord)
			holdRecord(id, hintedRecord)
			continue
		}
		const memoryRecord = tableCache.get(id) as T | undefined
		if (memoryRecord) {
			holdRecord(id, memoryRecord)
			continue
		}
		idsMissingFromMemory.push(id)
	}

	// Resolve all memory misses from persistent cache in one batch read.
	if (idsMissingFromMemory.length > 0) {
		const idbRecordsByID = await readRecordsFromIDBByIDs<T>(cacheNamespace, idsMissingFromMemory)
		for (const id of idsMissingFromMemory) {
			const idbRecord = idbRecordsByID.get(id)
			if (!idbRecord) {
				markMissing(id)
				continue
			}
			// Promote from IndexedDB to memory cache.
			tableCache.set(id, idbRecord)
			holdRecord(id, idbRecord)
		}
	}
	return lookup
}

/**
 * doGetRecordsByIDs resolves IDs of any number of partitions with at most one request: only the
 * partitions with a missing or stale record are sent, each with every ID it holds, so the backend
 * revalidates them all at once. Hints apply to partition 0, the only one getRecordByID buffers.
 */
export const doGetRecordsByIDs = async <T extends IMinimalRecord>(
	apiRoute: string,
	idsByPartition: Map<number, number[]>,
	cacheHintsByID?: Map<number, T | false>,
): Promise<Map<number, Map<number, T>>> => {
	const currentTimeSeconds = nowSeconds()
	const cycleYear = yearCycleOf(Date.now())
	const cycleStart = cycleStartUpdated(cycleYear)

	const lookups = await Promise.all([...idsByPartition].map(([partition, ids]) =>
		lookUpPartition<T>(apiRoute, partition, ids, cycleStart, currentTimeSeconds, partition === 0 ? cacheHintsByID : undefined)))
	const lookupsToFetch = lookups.filter((lookup) => lookup.needsServer && lookup.idTicks.length > 0)

	let fetchedPartitions: CachedPartitionResponse<T>[] = []
	let isFetchAnswered = false
	if (lookupsToFetch.length > 0) {
		console.debug(`${LOG_PREFIX} ${apiRoute} fetching | partitions=${lookupsToFetch.length}`
			+ ` | ids=${lookupsToFetch.reduce((count, lookup) => count + lookup.idTicks.length, 0)}`)
		try {
			fetchedPartitions = await fetchFromServer<T>(apiRoute, cycleYear,
				lookupsToFetch.map(({ partition, idTicks }) => ({ partition, idTicks })))
			isFetchAnswered = true
		} catch (error) {
			console.warn(`${LOG_PREFIX} ${apiRoute} server fetch failed. Using local cache only.`, error)
		}
	}
	const fetchedRecordsByPartition = new Map(fetchedPartitions.map(({ partition, records }) => [partition, records]))

	const recordsByPartition = new Map<number, Map<number, T>>()
	for (const lookup of lookups) {
		const tableCache = getOrCreateTableCache(lookup.cacheNamespace)
		if (isFetchAnswered && lookupsToFetch.includes(lookup)) {
			// The response holds only the changed records: a held ID it leaves out is validated as
			// unchanged, so its fetch time is refreshed.
			const fetchedRecords = fetchedRecordsByPartition.get(lookup.partition) || []
			const returnedIDs = new Set(fetchedRecords.map((record) => record?.ID))
			for (const heldID of lookup.heldIDs) {
				const heldRecord = tableCache.get(heldID)
				if (heldRecord && !returnedIDs.has(heldID)) heldRecord._fch = currentTimeSeconds
			}
			if (fetchedRecords.length > 0) {
				await mergeFetchedRecordsIntoCache<T>(lookup.cacheNamespace, fetchedRecords, currentTimeSeconds)
			}
		}
		// Final read is stable by requested ID order; tombstones remain hidden.
		const resolvedRecordsByID = new Map<number, T>()
		for (const id of lookup.requestedIDs) {
			const record = tableCache.get(id) as T | undefined
			if (record && record.ss !== 0) resolvedRecordsByID.set(id, record)
		}
		recordsByPartition.set(lookup.partition, resolvedRecordsByID)
	}
	return recordsByPartition
}

// resolveRecordsByPartition is getRecordsByID for any number of partitions: fresh memory hits answer
// at once, IDs another call is already fetching wait for it, and the rest go in one request.
const resolveRecordsByPartition = async <T extends IMinimalRecord>(
	apiRoute: string,
	idsByPartition: Map<number, number[]>,
): Promise<Map<number, Map<number, T>>> => {
	const currentTimeSeconds = nowSeconds()
	const recordsByPartition = new Map<number, Map<number, T>>()
	const pendingByPartition = new Map<number, Map<number, Promise<Map<number, T>>>>()
	const idsToFetchByPartition = new Map<number, number[]>()

	for (const [partition, ids] of idsByPartition) {
		const cacheNamespace = cacheNamespaceOf(apiRoute, partition)
		const tableCache = cacheRecordIdTable.get(cacheNamespace)
		const inFlightTable = getOrCreateInFlightRecordsTable(cacheNamespace)
		const resolvedRecordsByID = new Map<number, T>()
		const pendingByID = new Map<number, Promise<Map<number, T>>>()
		const idsToFetch: number[] = []
		for (const id of normalizePositiveIDs(ids)) {
			const cachedRecord = tableCache?.get(id) as T | undefined
			if (cachedRecord?.ss === 0) continue
			// Fresh memory rows are authoritative for this call and must not re-enter batching.
			if (cachedRecord && currentTimeSeconds - (cachedRecord._fch || 0) <= CACHE_TIME) {
				resolvedRecordsByID.set(id, cachedRecord)
				continue
			}
			const existingBatchPromise = inFlightTable.get(id) as Promise<Map<number, T>> | undefined
			if (existingBatchPromise) {
				pendingByID.set(id, existingBatchPromise)
				continue
			}
			idsToFetch.push(id)
		}
		recordsByPartition.set(partition, resolvedRecordsByID)
		pendingByPartition.set(partition, pendingByID)
		if (idsToFetch.length > 0) idsToFetchByPartition.set(partition, idsToFetch)
	}

	if (idsToFetchByPartition.size > 0) {
		const createdFetchPromise = doGetRecordsByIDs<T>(apiRoute, idsToFetchByPartition)
		// One shared batch promise per partition, registered for each of its IDs.
		for (const [partition, idsToFetch] of idsToFetchByPartition) {
			const cacheNamespace = cacheNamespaceOf(apiRoute, partition)
			const partitionPromise = createdFetchPromise.then((fetched) => fetched.get(partition) || new Map<number, T>())
			const inFlightTable = getOrCreateInFlightRecordsTable(cacheNamespace)
			for (const id of idsToFetch) {
				inFlightTable.set(id, partitionPromise as Promise<Map<number, IMinimalRecord>>)
				pendingByPartition.get(partition)!.set(id, partitionPromise)
			}
			void partitionPromise.finally(() => {
				const currentInFlightTable = inFlightRecordsBatchPromiseByTable.get(cacheNamespace)
				if (!currentInFlightTable) return
				for (const id of idsToFetch) {
					if (currentInFlightTable.get(id) === (partitionPromise as Promise<Map<number, IMinimalRecord>>)) {
						currentInFlightTable.delete(id)
					}
				}
				if (currentInFlightTable.size === 0) inFlightRecordsBatchPromiseByTable.delete(cacheNamespace)
			})
		}
	}

	for (const [partition, pendingByID] of pendingByPartition) {
		const resolvedRecordsByID = recordsByPartition.get(partition)!
		for (const [id, pendingBatchPromise] of pendingByID) {
			const record = (await pendingBatchPromise).get(id)
			if (record && record.ss !== 0) resolvedRecordsByID.set(id, record)
		}
	}
	return recordsByPartition
}

/**
 * getRecordsByID resolves records by ID, cache first and revalidated with the server.
 * - `getRecordsByID(route, ids)`: a table without Partition → Map<ID, record>.
 * - `getRecordsByID(route, { [partition]: ids })`: a partitioned table, any number of partitions in
 *   one request → Map<partition, Map<ID, record>>.
 */
export function getRecordsByID<T extends IMinimalRecord>(apiRoute: string, ids: number[]): Promise<Map<number, T>>
export function getRecordsByID<T extends IMinimalRecord>(
	apiRoute: string, idsByPartition: Record<number, number[]>,
): Promise<Map<number, Map<number, T>>>
export async function getRecordsByID<T extends IMinimalRecord>(
	apiRoute: string, ids: number[] | Record<number, number[]>,
): Promise<Map<number, T> | Map<number, Map<number, T>>> {
	if (Array.isArray(ids)) {
		const recordsByPartition = await resolveRecordsByPartition<T>(apiRoute, new Map([[0, ids]]))
		return recordsByPartition.get(0) || new Map<number, T>()
	}
	const idsByPartition = new Map(Object.entries(ids).map(([partition, partitionIDs]) => [Number(partition), partitionIDs]))
	return resolveRecordsByPartition<T>(apiRoute, idsByPartition)
}

const buffetMaxTime = 80 // milliseconds
const recordIDsBufferByTable: Map<string, Set<number>> = new Map()
const bufferedPromiseByTableAndID: Map<string, Promise<any>> = new Map()
const bufferedCacheHintByTableAndID: Map<string, IMinimalRecord | false> = new Map()
const bufferedResolversByTableAndID: Map<
	string,
	{ resolve: (value: any) => void; reject: (reason?: any) => void }
> = new Map()
const updatedRecordIDsBufferByTable: Map<string, Set<number>> = new Map()
const bufferedUpdatedPromiseByTableAndID: Map<string, Promise<any>> = new Map()
const bufferedUpdatedResolversByTableAndID: Map<
	string,
	{ resolve: (value: any) => void; reject: (reason?: any) => void }
> = new Map()
let bufferStarTime = 0
let bufferFlushTimer: ReturnType<typeof setTimeout> | null = null
let updatedBufferStarTime = 0
let updatedBufferFlushTimer: ReturnType<typeof setTimeout> | null = null

const resetPendingBufferState = (
	pendingResolvers: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>,
	pendingPromises: Map<string, Promise<any>>,
	bufferedIDsByTable: Map<string, Set<number>>,
	bufferedHints?: Map<string, IMinimalRecord | false>,
) => {
	for (const pending of pendingResolvers.values()) {
		pending.reject(new Error(`${LOG_PREFIX} cache cleared while request was pending`))
	}
	pendingResolvers.clear()
	pendingPromises.clear()
	bufferedIDsByTable.clear()
	bufferedHints?.clear()
}

export const clearCacheByIDs = async (): Promise<{ databaseName: string; clearedMemoryTables: number }> => {
	// Memory maps are global in this module, so clear them before dropping persisted IndexedDB state.
	const clearedMemoryTables = cacheRecordIdTable.size + staticCacheRecordIdTable.size
	cacheRecordIdTable.clear()
	inFlightRecordsBatchPromiseByTable.clear()
	staticCacheRecordIdTable.clear()
	inFlightStaticBatchPromiseByTable.clear()
	// The route-keyed query cache shares this database; drop its memory layer too.
	clearQueryByIdMemoryCache()

	resetPendingBufferState(
		bufferedResolversByTableAndID,
		bufferedPromiseByTableAndID,
		recordIDsBufferByTable,
		bufferedCacheHintByTableAndID,
	)
	resetPendingBufferState(
		bufferedUpdatedResolversByTableAndID,
		bufferedUpdatedPromiseByTableAndID,
		updatedRecordIDsBufferByTable,
	)

	if (bufferFlushTimer) {
		clearTimeout(bufferFlushTimer)
		bufferFlushTimer = null
	}
	if (updatedBufferFlushTimer) {
		clearTimeout(updatedBufferFlushTimer)
		updatedBufferFlushTimer = null
	}
	bufferStarTime = 0
	updatedBufferStarTime = 0

	const runtime = getCacheRuntime()
	const clearedDatabase = await clearCacheByIDsDatabase(runtime.getCompanyID(), runtime.getEnvironment())
	console.debug(`${LOG_PREFIX} Cache cleared.`, {
		databaseName: clearedDatabase.databaseName,
		clearedMemoryTables,
	})
	return {
		databaseName: clearedDatabase.databaseName,
		clearedMemoryTables,
	}
}

// Runs once per buffer window and resolves every pending getRecordByID Promise.
// It batches IDs per table, does one request per table, then fans out each result by ID.
const flushBufferedRequests = async () => {
	const bufferedStartTime = bufferStarTime
	bufferStarTime = 0
	if (bufferFlushTimer) {
		clearTimeout(bufferFlushTimer)
		bufferFlushTimer = null
	}

	// Snapshot and clear current buffer so new calls can start a fresh window.
	const idsByTableToFetch: Array<{ apiRoute: string; ids: number[] }> = []
	for (const [apiRoute, idsSet] of recordIDsBufferByTable) {
		if (idsSet.size === 0) continue
		idsByTableToFetch.push({ apiRoute, ids: Array.from(idsSet) })
		idsSet.clear()
	}

	if (idsByTableToFetch.length === 0) return

	console.debug(
		`${LOG_PREFIX} flush buffered getRecordByID` +
		` | bufferedMs=${bufferedStartTime ? Date.now() - bufferedStartTime : 0}` +
		` | tables=${idsByTableToFetch.length}`,
	)

	for (const { apiRoute, ids } of idsByTableToFetch) {
		try {
			const cacheHintsByID = new Map<number, IMinimalRecord | false>()
			for (const id of ids) {
				const key = `${apiRoute}:${id}`
				const bufferedCacheHint = bufferedCacheHintByTableAndID.get(key)
				if (bufferedCacheHint === undefined) continue
				cacheHintsByID.set(id, bufferedCacheHint)
				bufferedCacheHintByTableAndID.delete(key)
			}

			// One batched call per table, then fan out by ID.
			console.debug(`${LOG_PREFIX} ${apiRoute} flush table batch | ids=${ids.length} | hints=${cacheHintsByID.size}`)
			const recordsByID = (await doGetRecordsByIDs<any>(apiRoute, new Map([[0, ids]]), cacheHintsByID)).get(0)!

			for (const id of ids) {
				const key = `${apiRoute}:${id}`
				const pending = bufferedResolversByTableAndID.get(key)
				if (!pending) continue
				bufferedResolversByTableAndID.delete(key)
				bufferedPromiseByTableAndID.delete(key)
				pending.resolve(recordsByID.get(id))
			}
		} catch (error) {
			console.warn(`${LOG_PREFIX} ${apiRoute} buffered fetch failed; rejecting pending promises`, error)
			for (const id of ids) {
				const key = `${apiRoute}:${id}`
				const pending = bufferedResolversByTableAndID.get(key)
				if (!pending) continue
				bufferedResolversByTableAndID.delete(key)
				bufferedPromiseByTableAndID.delete(key)
				pending.reject(error)
			}
		}
	}
}

export interface GetRecordByIDOptions<T extends IMinimalRecord> {
	cachedRecord?: T | false
}

const flushBufferedUpdatedRequests = async () => {
	const bufferedStartTime = updatedBufferStarTime
	updatedBufferStarTime = 0
	if (updatedBufferFlushTimer) {
		clearTimeout(updatedBufferFlushTimer)
		updatedBufferFlushTimer = null
	}

	const idsByTableToFetch: Array<{ apiRoute: string; ids: number[] }> = []
	for (const [apiRoute, idsSet] of updatedRecordIDsBufferByTable) {
		if (idsSet.size === 0) continue
		idsByTableToFetch.push({ apiRoute, ids: Array.from(idsSet) })
		idsSet.clear()
	}

	if (idsByTableToFetch.length === 0) return

	console.debug(
		`${LOG_PREFIX} flush buffered getRecordByIDUpdated` +
		` | bufferedMs=${bufferedStartTime ? Date.now() - bufferedStartTime : 0}` +
		` | tables=${idsByTableToFetch.length}`,
	)

	for (const { apiRoute, ids } of idsByTableToFetch) {
		try {
			console.debug(`${LOG_PREFIX} ${apiRoute} flush updated table batch | ids=${ids.length}`)
			// Nothing held is sent: every record comes back.
			const fetchedPartitions = await fetchFromServer<any>(apiRoute, yearCycleOf(Date.now()),
				[{ partition: 0, idTicks: ids.map((id): [number, number] => [id, 0]) }])
			const fetchedRecords = fetchedPartitions.flatMap((cachedPartition) => cachedPartition.records)
			const fetchedRecordsByID = await mergeFetchedRecordsIntoCache<any>(apiRoute, fetchedRecords, nowSeconds())

			for (const id of ids) {
				const key = `${apiRoute}:${id}`
				const pending = bufferedUpdatedResolversByTableAndID.get(key)
				if (!pending) continue
				bufferedUpdatedResolversByTableAndID.delete(key)
				bufferedUpdatedPromiseByTableAndID.delete(key)
				const fetchedRecord = fetchedRecordsByID.get(id)
				pending.resolve(fetchedRecord && fetchedRecord.ss !== 0 ? fetchedRecord : undefined)
			}
		} catch (error) {
			console.warn(`${LOG_PREFIX} ${apiRoute} buffered updated fetch failed; rejecting pending promises`, error)
			for (const id of ids) {
				const key = `${apiRoute}:${id}`
				const pending = bufferedUpdatedResolversByTableAndID.get(key)
				if (!pending) continue
				bufferedUpdatedResolversByTableAndID.delete(key)
				bufferedUpdatedPromiseByTableAndID.delete(key)
				pending.reject(error)
			}
		}
	}
}

export const getRecordByID = async <T extends IMinimalRecord>(
	apiRoute: string,
	id: number,
	options?: GetRecordByIDOptions<T>,
): Promise<T | undefined> => {
	const numericID = Number(id)
	if (!Number.isFinite(numericID) || numericID <= 0) return undefined
	const currentTimeSeconds = nowSeconds()

	// Explicit cache hint path avoids repeating local lookups already done by caller.
	// Still goes through buffered pipeline to prevent parallel per-ID requests.
	if (options && options.cachedRecord !== undefined) {
		const knownCachedRecord = options.cachedRecord
		if (!!knownCachedRecord) {
			if (knownCachedRecord.ss === 0) return undefined
			const cachedRecordIsStale = isRecordStale(knownCachedRecord, currentTimeSeconds)
			if (!cachedRecordIsStale) {
				return knownCachedRecord
			}
		}
	}

	// Fast path optimization:
	// return immediately only for fresh memory hits; stale hits must go through buffered revalidation.
	const cacheTable = cacheRecordIdTable.get(apiRoute)
	if (cacheTable) {
		const cachedRecord = cacheTable.get(numericID) as T | undefined
		if (cachedRecord) {
			if (cachedRecord.ss === 0) return undefined
			const cachedRecordAgeSeconds = currentTimeSeconds - (cachedRecord._fch || 0)
			const cachedRecordIsStale = cachedRecordAgeSeconds > CACHE_TIME
			if (!cachedRecordIsStale) {
				return cachedRecord
			}
		}
	}

	const promiseKey = `${apiRoute}:${numericID}`
	const existingPromise = bufferedPromiseByTableAndID.get(promiseKey)
	if (existingPromise) return existingPromise as Promise<T | undefined>

	if (!bufferStarTime) bufferStarTime = Date.now()

	let idsBuffer = recordIDsBufferByTable.get(apiRoute)
	if (!idsBuffer) {
		idsBuffer = new Set()
		recordIDsBufferByTable.set(apiRoute, idsBuffer)
	}
	idsBuffer.add(numericID)

	const createdPromise = new Promise<T | undefined>((resolve, reject) => {
		bufferedResolversByTableAndID.set(promiseKey, { resolve, reject })
	})
	bufferedPromiseByTableAndID.set(promiseKey, createdPromise)
	if (options && options.cachedRecord !== undefined) {
		bufferedCacheHintByTableAndID.set(promiseKey, options.cachedRecord)
	}
	// Start one timer per active buffer window; all requests inside this window are batched.
	if (!bufferFlushTimer) {
		bufferFlushTimer = setTimeout(() => {
			void flushBufferedRequests()
		}, buffetMaxTime)
	}

	return createdPromise
}

export const getRecordByIDUpdated = async <T extends IMinimalRecord>(
	apiRoute: string, id: number,	updated: number,
): Promise<T | undefined> => {
	const numericID = Number(id)
	if (!Number.isFinite(numericID) || numericID <= 0) return undefined

	const localResolution = await getLocalRecordByID<T>(apiRoute, numericID)
	if (localResolution.record && localResolution.record.upd >= updated) {
		return localResolution.record
	}

	let returnedRecord: T | undefined
	try {
		const promiseKey = `${apiRoute}:${numericID}`
		const existingPromise = bufferedUpdatedPromiseByTableAndID.get(promiseKey)
		if (existingPromise) {
			returnedRecord = await existingPromise as T | undefined
		} else {
			if (!updatedBufferStarTime) updatedBufferStarTime = Date.now()

			let idsBuffer = updatedRecordIDsBufferByTable.get(apiRoute)
			if (!idsBuffer) {
				idsBuffer = new Set()
				updatedRecordIDsBufferByTable.set(apiRoute, idsBuffer)
			}
			idsBuffer.add(numericID)

			const createdPromise = new Promise<T | undefined>((resolve, reject) => {
				bufferedUpdatedResolversByTableAndID.set(promiseKey, { resolve, reject })
			})
			bufferedUpdatedPromiseByTableAndID.set(promiseKey, createdPromise)

			if (!updatedBufferFlushTimer) {
				updatedBufferFlushTimer = setTimeout(() => {
					void flushBufferedUpdatedRequests()
				}, buffetMaxTime)
			}

			returnedRecord = await createdPromise
		}
	} catch (fetchError) {
		console.warn(`${LOG_PREFIX} Failed to refresh record by updated.`, {
			apiRoute,
			id: numericID,
			updated,
		}, fetchError)
		return undefined
	}

	// Once we fetched from server, that row is authoritative even when its `upd` advanced.
	const fetchedRecord = returnedRecord
	if (!fetchedRecord || fetchedRecord.ss === 0) return undefined
	return fetchedRecord
}

const getOrCreateStaticTableCache = <T extends { ID: number }>(apiRoute: string): Map<number, T> => {
	const existing = staticCacheRecordIdTable.get(apiRoute)
	if (existing) return existing as Map<number, T>
	const created = new Map<number, T>()
	staticCacheRecordIdTable.set(apiRoute, created)
	return created
}

const getOrCreateStaticInFlightTable = <T extends { ID: number }>(
	apiRoute: string,
): Map<number, Promise<Map<number, T>>> => {
	const existing = inFlightStaticBatchPromiseByTable.get(apiRoute)
	if (existing) return existing as Map<number, Promise<Map<number, T>>>
	const created = new Map<number, Promise<Map<number, T>>>()
	inFlightStaticBatchPromiseByTable.set(apiRoute, created)
	return created
}

const fetchStaticRecordsFromServer = async <T extends { ID: number }>(
	apiRoute: string,
	ids: number[],
): Promise<T[]> => {
	if (ids.length === 0) return []
	try {
		// The by-IDs request with nothing held: the backend returns every record.
		const fetchedPartitions = await fetchFromServer<any>(apiRoute, yearCycleOf(Date.now()),
			[{ partition: 0, idTicks: ids.map((id): [number, number] => [id, 0]) }])
		return fetchedPartitions.flatMap((cachedPartition) => cachedPartition.records) as T[]
	} catch (serverFetchError) {
		console.warn(`${LOG_PREFIX} ${apiRoute} static fetch failed; returning empty list`, serverFetchError)
		return []
	}
}

/**
 * Resolve records by ID from a "static" endpoint that doesn't use the cache-version protocol:
 * lookups are cache-first (memory → IndexedDB) and the server is only asked for IDs that aren't
 * present locally. Once fetched, a record is assumed immutable for its ID — there's no `upd`
 * revalidation and no staleness timer. Use for catalog-like tables (e.g. product-stock-lots).
 */
export interface GetStaticRecordsByIDOptions {
	cacheNamespace?: string
	databaseCompanyID?: number
}

export const getStaticRecordsByID = async <T extends { ID: number }>(
	apiRoute: string,
	ids: number[],
	options?: GetStaticRecordsByIDOptions,
): Promise<Map<number, T>> => {
	const normalizedIDs = normalizePositiveIDs(ids)
	if (normalizedIDs.length === 0) return new Map<number, T>()

	// A custom namespace lets global pre-login records stay isolated by selected environment.
	const cacheNamespace = options?.cacheNamespace || apiRoute
	const tableCache = getOrCreateStaticTableCache<T>(cacheNamespace)
	const inFlightTable = getOrCreateStaticInFlightTable<T>(cacheNamespace)
	const resolvedRecordsByID = new Map<number, T>()

	// 1) Memory hits resolve immediately.
	const idsMissingFromMemory: number[] = []
	for (const id of normalizedIDs) {
		const memRecord = tableCache.get(id)
		if (memRecord) {
			resolvedRecordsByID.set(id, memRecord)
			continue
		}
		idsMissingFromMemory.push(id)
	}
	if (idsMissingFromMemory.length === 0) return resolvedRecordsByID

	// 2) Reuse in-flight batches for IDs that another caller is already fetching.
	const existingPromisesByID = new Map<number, Promise<Map<number, T>>>()
	const idsNotInFlight: number[] = []
	for (const id of idsMissingFromMemory) {
		const pendingPromise = inFlightTable.get(id)
		if (pendingPromise) {
			existingPromisesByID.set(id, pendingPromise)
			continue
		}
		idsNotInFlight.push(id)
	}

	// 3) For fresh IDs, resolve from IDB first.
	let idsMissingFromIDB: number[] = []
	if (idsNotInFlight.length > 0) {
		const idbRecordsByID = await readRecordsFromIDBByIDs<T>(cacheNamespace, idsNotInFlight, options?.databaseCompanyID)
		for (const id of idsNotInFlight) {
			const idbRecord = idbRecordsByID.get(id)
			if (idbRecord) {
				tableCache.set(id, idbRecord)
				resolvedRecordsByID.set(id, idbRecord)
				continue
			}
			idsMissingFromIDB.push(id)
		}
	}

	// 4) Only hit the server for IDs that aren't in any cache layer.
	if (idsMissingFromIDB.length > 0) {
		const fetchPromise: Promise<Map<number, T>> = (async () => {
			const fetchedRecords = await fetchStaticRecordsFromServer<T>(apiRoute, idsMissingFromIDB)
			const fetchedByID = new Map<number, T>()
			for (const fetchedRecord of fetchedRecords) {
				if (!fetchedRecord || typeof fetchedRecord.ID !== 'number') continue
				tableCache.set(fetchedRecord.ID, fetchedRecord)
				fetchedByID.set(fetchedRecord.ID, fetchedRecord)
			}
			if (fetchedByID.size > 0) {
				await upsertRecordsIntoIDB<T>(cacheNamespace, Array.from(fetchedByID.values()), options?.databaseCompanyID)
			}
			return fetchedByID
		})()

		for (const id of idsMissingFromIDB) {
			inFlightTable.set(id, fetchPromise)
			existingPromisesByID.set(id, fetchPromise)
		}
		void fetchPromise.finally(() => {
			const currentInFlight = inFlightStaticBatchPromiseByTable.get(cacheNamespace)
			if (!currentInFlight) return
			for (const id of idsMissingFromIDB) {
				if (currentInFlight.get(id) === (fetchPromise as unknown as Promise<Map<number, { ID: number }>>)) {
					currentInFlight.delete(id)
				}
			}
			if (currentInFlight.size === 0) inFlightStaticBatchPromiseByTable.delete(cacheNamespace)
		})
	}

	// 5) Drain all in-flight / freshly-dispatched batches and merge into the return map.
	const resolvedEntries = await Promise.all(
		Array.from(existingPromisesByID.entries()).map(async ([id, pendingPromise]) => {
			const batchResultsByID = await pendingPromise
			const record = batchResultsByID.get(id)
			return record ? [id, record] as const : null
		}),
	)
	for (const resolvedEntry of resolvedEntries) {
		if (!resolvedEntry) continue
		resolvedRecordsByID.set(resolvedEntry[0], resolvedEntry[1])
	}

	return resolvedRecordsByID
}

const isRecordStale = (record: IMinimalRecord, nowTimeSeconds: number): boolean => {
	const fetchedAtSeconds = record._fch || 0
	const ageSeconds = nowTimeSeconds-fetchedAtSeconds
	return ageSeconds > CACHE_TIME
}

const getLocalRecordByID = async <T extends IMinimalRecord>(
	apiRoute: string,
	id: number,
): Promise<{ record: T | null, stale: boolean }> => {
	const numericID = Number(id)
	if (!Number.isFinite(numericID) || numericID <= 0) {
		return { record: null, stale: false }
	}

	const currentTimeSeconds = nowSeconds()
	const cacheTable = getOrCreateTableCache(apiRoute)
	const memoryRecord = cacheTable.get(numericID) as T | undefined
	if (memoryRecord) {
		if (memoryRecord.ss === 0) return { record: null, stale: false }
		return { record: memoryRecord, stale: isRecordStale(memoryRecord, currentTimeSeconds) }
	}

	const idbRecordsByID = await readRecordsFromIDBByIDs<T>(apiRoute, [numericID])
	const idbRecord = idbRecordsByID.get(numericID)
	if (!idbRecord) {
		return { record: null, stale: false }
	}

	// Promote IDB hit into memory cache for subsequent synchronous reads.
	cacheTable.set(numericID, idbRecord)
	if (idbRecord.ss === 0) return { record: null, stale: false }
	return { record: idbRecord, stale: isRecordStale(idbRecord, currentTimeSeconds) }
}

export interface IRecordRef<T extends IMinimalRecord> {
	readonly record: T | null
	readonly loading: boolean
	refresh: () => Promise<T | null>
}

export const getRecordWithCache = <T extends IMinimalRecord>(
	apiRoute: string,
	id: number,
): IRecordRef<T> => {
	let record = $state<T | null>(null)
	let loading = $state(false)

	const refresh = async (): Promise<T | null> => {
		const numericID = Number(id)
		if (!Number.isFinite(numericID) || numericID <= 0) {
			record = null
			loading = false
			return null
		}

		const localResolution = await getLocalRecordByID<T>(apiRoute, numericID)
		// Show loading spinner only when we don't have local data for first paint.
		loading = !Boolean(localResolution.record)
		if (localResolution.record) {
			record = localResolution.record
		}

		// Fresh local hit: skip network and complete.
		if (localResolution.record && !localResolution.stale) {
			loading = false
			return localResolution.record
		}

		// Local miss or stale local hit: refresh from server and update ref if changed/new.
		const refreshedRecord = await getRecordByID<T>(apiRoute, numericID, {
			cachedRecord: localResolution.record || false,
		})
		const isRecordChanged =
			Boolean(refreshedRecord) &&
			(
				!localResolution.record ||
				refreshedRecord!.upd !== localResolution.record.upd ||
				refreshedRecord!.ss !== localResolution.record.ss
			)
		if (isRecordChanged && refreshedRecord) {
			record = refreshedRecord
		}

		loading = false
		return refreshedRecord || localResolution.record
	}

	// Kick-off on creation so component only reads state.
	void refresh()

	return {
		get record() {
			return record
		},
		get loading() {
			return loading
		},
		refresh,
	}
}
