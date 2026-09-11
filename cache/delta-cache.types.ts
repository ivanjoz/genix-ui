export type CacheRecordID = string | number

export interface ILastSync {
  fetchTime: number
  updatedStatus: { [key: string]: IWatermarkPair }
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

// Both watermarks a response key can be synced on: `upv` is the write sequence of a db.TypeDelta
// table, `upd` the updated timestamp. The client keeps both and sends both — which one bounds the
// query is the backend's decision, not something the client infers from the records it received.
export interface IWatermarkPair {
  upv: number
  upd: number
}

// The two numbers travel as one query param per response key, `"<upv>.<upd>"`. A single-array route
// has no response key of its own, so it sends them under `up`.
export const watermarkParamOfDefaultKey = 'up'

export const formatWatermarkPair = (watermark: IWatermarkPair): string => {
  return `${watermark.upv || 0}.${watermark.upd || 0}`
}

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
