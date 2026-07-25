import { BROWSER } from 'esm-env'
import { concatenateInts } from '../utilities/index.js'
import {
	makeGroupCacheKey,
	makeGroupQueryShape,
	readGroupCacheMetadata,
	readGroupCacheRows,
	upsertGroupCacheRows,
	type IGroupCacheRecord,
} from './group-cache.idb.js'

export interface GroupCacheGetterRuntime {
	get: (route: string) => Promise<unknown>
	isBrowser?: () => boolean
}

export type GroupCacheGetter = <T = unknown>(
	route: string,
	uriParams: Record<string, string>,
) => Promise<IGroupCacheRecord<T>[]>

const normalizeGroupCacheResponse = <T>(responsePayload: unknown): IGroupCacheRecord<T>[] => {
	if (Array.isArray(responsePayload)) return responsePayload as IGroupCacheRecord<T>[]
	if (
		responsePayload
		&& typeof responsePayload === 'object'
		&& Array.isArray((responsePayload as { records?: unknown }).records)
	) {
		return (responsePayload as { records: IGroupCacheRecord<T>[] }).records
	}
	if (
		responsePayload
		&& typeof responsePayload === 'object'
		&& Array.isArray((responsePayload as { response?: unknown }).response)
	) {
		return (responsePayload as { response: IGroupCacheRecord<T>[] }).response
	}
	return []
}

const makeGroupCacheRoute = (route: string, uriParams: Record<string, string>): string => {
	const requestParams = new URLSearchParams()
	for (const paramName of Object.keys(uriParams).sort()) {
		requestParams.set(paramName, uriParams[paramName])
	}
	const queryString = requestParams.toString()
	return queryString ? `${route}?${queryString}` : route
}

export const createGroupCacheGetter = (runtime: GroupCacheGetterRuntime): GroupCacheGetter => {
	const isBrowser = runtime.isBrowser ?? (() => BROWSER)

	return async <T = unknown>(
		route: string,
		uriParams: Record<string, string>,
	): Promise<IGroupCacheRecord<T>[]> => {
		if (!isBrowser()) {
			return normalizeGroupCacheResponse<T>(
				await runtime.get(makeGroupCacheRoute(route, uriParams)),
			)
		}

		// The tenant-aware database name scopes rows; the key only needs the route shape.
		const queryShape = makeGroupQueryShape(route, Object.keys(uriParams))
		const cachedMetadataRows = await readGroupCacheMetadata(queryShape)
		const requestParams = new URLSearchParams()
		for (const paramName of Object.keys(uriParams).sort()) {
			requestParams.set(paramName, uriParams[paramName])
		}

		if (cachedMetadataRows.length > 0) {
			// Group IDs stay signed in IndexedDB and become uint32 only for compact transport.
			requestParams.set('cc-gh', concatenateInts(cachedMetadataRows.map((row) => row.id >>> 0)))
			requestParams.set('cc-upc', concatenateInts(cachedMetadataRows.map((row) => row.upc)))
		}

		const queryString = requestParams.toString()
		const routeWithCacheParams = queryString ? `${route}?${queryString}` : route
		console.debug('[group-cache] Fetching grouped route.', {
			route,
			queryShape,
			cachedGroups: cachedMetadataRows.length,
		})

		const responseGroups = normalizeGroupCacheResponse<T>(await runtime.get(routeWithCacheParams))
		const responseKeys = responseGroups.map(makeGroupCacheKey).filter(Boolean)
		const cachedRowsByKey = await readGroupCacheRows<T>(queryShape, responseKeys)
		const rowsToPersist: IGroupCacheRecord<T>[] = []
		const mergedGroups: IGroupCacheRecord<T>[] = []

		for (const responseGroup of responseGroups) {
			const responseRecords = Array.isArray(responseGroup.records) ? responseGroup.records : []

			// Direct lookup results do not belong to an indexed group and pass through uncached.
			if (responseGroup.ig === -1) {
				mergedGroups.push({ ...responseGroup, records: responseRecords })
				continue
			}

			const key = makeGroupCacheKey(responseGroup)
			if (!key) {
				console.warn('[group-cache] Ignoring grouped response without igVal.', responseGroup)
				continue
			}

			const cachedRow = cachedRowsByKey.get(key)
			if (cachedRow && cachedRow.upc === responseGroup.upc && responseRecords.length === 0) {
				mergedGroups.push({
					ig: responseGroup.ig,
					id: responseGroup.id,
					igVal: responseGroup.igVal,
					records: cachedRow.records || [],
					upc: responseGroup.upc,
				})
				continue
			}

			const freshGroup = { ...responseGroup, records: responseRecords }
			rowsToPersist.push(freshGroup)
			mergedGroups.push(freshGroup)
		}

		await upsertGroupCacheRows(queryShape, rowsToPersist)
		console.debug('[group-cache] Grouped cache merged.', {
			route,
			queryShape,
			responseGroups: responseGroups.length,
			persistedGroups: rowsToPersist.length,
			mergedGroups: mergedGroups.length,
		})
		return mergedGroups
	}
}
