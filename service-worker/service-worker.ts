import {
  applyExternalDeltaResponse,
  clearDeltaEnvironmentCache,
  clearDeltaModuleCache,
  fetchDeltaCache,
  getDeltaCacheStats,
  getDeltaUpdatedStatus,
  readDeltaCacheSubObject,
  refreshDeltaRoutes,
  setDeltaRouteForceNetwork,
  triggerDeltaForceFetchWindow,
} from '../cache/index.js';
import type { ICacheSyncUpdate, IGetCacheSubObject, serviceHttpProps } from '../cache/index.js';
import { HandlersMap } from './service-worker-cache';

export type { ICacheSyncUpdate, IGetCacheSubObject }

// Action 3 is the main delta-cache entrypoint used by cached services.
HandlersMap.set(3, async (args: serviceHttpProps) => {
  return await fetchDeltaCache(args)
})

// Action 11 opens a short force-fetch window for subsequent cache reads.
HandlersMap.set(11, async () => {
  return await triggerDeltaForceFetchWindow()
})

// Action 12 exposes the latest per-response updated watermark for a route.
HandlersMap.set(12, async (args: serviceHttpProps) => {
  return await getDeltaUpdatedStatus(args)
})

// Action 13 applies delta payloads produced by write endpoints into the cache.
HandlersMap.set(13, async (args: ICacheSyncUpdate) => {
  return await applyExternalDeltaResponse(args)
})

// Action 14 marks a route to bypass cache on the next fetch.
HandlersMap.set(14, async (args: serviceHttpProps) => {
  return await setDeltaRouteForceNetwork(args)
})

// Action 15 reads a cached response block or filtered records from a route.
HandlersMap.set(15, async (args: IGetCacheSubObject) => {
  return await readDeltaCacheSubObject(args)
})

// Action 21 is still used by the client to acknowledge delivered responses.
const acknowledgeResponses: Set<number> = new Set()
HandlersMap.set(21, async (args: serviceHttpProps) => {
  const requestID = (args.__req__ || 0) * 1000 + args.__client__
  acknowledgeResponses.add(requestID)
})

// Action 22 returns cache stats grouped by module for the current environment.
HandlersMap.set(22, async (args: { __enviroment__: string, __companyID__?: number }) => {
  return await getDeltaCacheStats(args)
})

// Action 23 clears a whole module cache in the selected environment.
HandlersMap.set(23, async (args: { __enviroment__: string, __companyID__?: number, cacheName: string }) => {
  return await clearDeltaModuleCache(args)
})

// Action 24 marks matching routes for refresh without deleting their rows.
HandlersMap.set(24, async (args: { __enviroment__: string, __companyID__?: number, module: string, routes: string[] }) => {
  return await refreshDeltaRoutes(args)
})

// Action 26 removes the full delta cache for one environment.
HandlersMap.set(26, async (args: { __enviroment__: string, __companyID__?: number }) => {
  return await clearDeltaEnvironmentCache(args)
})
