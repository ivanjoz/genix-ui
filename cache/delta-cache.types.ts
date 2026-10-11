export type CacheRecordID = string | number

export interface ILastSync {
  fetchTime: number
  // The delta cursor of each response key (delta-cache.cursor.ts).
  deltaCursors: { [key: string]: DeltaCursor }
  fetchedRecordsCount: number
  fetchedBytes: number
  forceNetwork?: boolean
  __version__: number
}

export interface IDeltaCacheRouteRef {
  env: string
  companyID: number
  dbName: string
  module: string
  route: string
  partitionValue: string
  cacheKey: string
  routeLookupKey: string
  version: number
}

export interface ICacheRouteRow extends ILastSync {
  id?: number
  dbName: string
  routeLookupKey: string
  env: string
  module: string
  route: string
  partitionValue: string
  cacheKey: string
  responseKeys: string[]
  // Routes whose backend responses are bare arrays (normalized to `_default`) persist records
  // in `cacheRecordsSingle` and skip the `_k` field. The flag is set on the first fetch.
  isSingle?: boolean
}

// What a response key holds of its delta log: per log file still open (its 10-minute bucket), how many
// of its bytes the browser applied.
export type DeltaCursor = Record<number, number>

// A cursor travels as one query param per response key; a bare-array response's key sends `up`.
export const deltaCursorParamOfDefaultKey = 'up'

export interface ICacheRecordRowMulti {
  _r: number
  _k: number
  ID: CacheRecordID
  ss: number
  [field: string]: any
}

export interface ICacheRecordRowSingle {
  _r: number
  ID: CacheRecordID
  ss: number
  [field: string]: any
}

export type ICacheRecordRow = ICacheRecordRowMulti | ICacheRecordRowSingle

// Action 24: mark cached routes so their next read bypasses the cache and hits the server.
// `exact` off means prefix matching, which is what a POST needs to invalidate derived routes.
export interface IRefreshDeltaRoutesArgs {
  __enviroment__: string
  __companyID__?: number
  module: string
  routes: string[]
  exact?: boolean
}

export interface IRequestLogRow {
  id: number /* unix milliseconds timestamp */
  route: string
  qp: string /* query params */
  sPs: number /* server pre-parsing request time */
  sF: number /* server final request time */
  req: number /* client request time */
  spc: number /* client serialize, parse and cache loading time  */
  size: number /* size in kb */
}
