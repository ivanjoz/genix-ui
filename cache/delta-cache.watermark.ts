import { deltaOverlapMillis, type IDeltaWatermark } from './delta-cache.types'

// mixUpdated hashes one `upd` exactly like genix-orm/dynamo's mixUpdated: its two 32-bit halves
// folded, then murmur3's finalizer. Math.imul and `>>> 0` keep every step in Go's uint32 arithmetic.
export const mixUpdated = (updated: number): number => {
  const lowHalf = updated >>> 0
  const highHalf = Math.floor(updated / 0x100000000) >>> 0
  let mixed = (lowHalf ^ Math.imul(highHalf, 0x9E3779B1)) >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x85EBCA6B)
  mixed ^= mixed >>> 13
  mixed = Math.imul(mixed, 0xC2B2AE35)
  mixed ^= mixed >>> 16
  return mixed >>> 0
}

// deltaFingerprint is genix-orm/dynamo's DeltaFingerprint: the sum, mod 2³², of every value mixed.
// A sum ignores order, so the client and the backend agree however each one listed the records.
export const deltaFingerprint = (updatedValues: Iterable<number>): number => {
  let fingerprint = 0
  for (const updated of updatedValues) {
    fingerprint = (fingerprint + mixUpdated(updated)) >>> 0
  }
  return fingerprint
}

export const makeEmptyWatermark = (): IDeltaWatermark => ({ upd: 0, window: {} })

export const formatWatermark = (watermark: IDeltaWatermark): string => {
  return `${watermark.upd || 0}.${deltaFingerprint(Object.values(watermark.window || {}))}`
}

// mergeIntoWatermark adds the records a delta brought for one response key, as [record ID, upd]:
// `upd` moves to the highest one, each record enters the window with its latest `upd`, and entries
// that fall below the overlap leave it. `hasChanged` is false when the delta only repeated what the
// watermark already held, which is what a resent window usually is.
export const mergeIntoWatermark = (
  current: IDeltaWatermark,
  receivedUpdated: [recordID: string, upd: number][],
): { watermark: IDeltaWatermark, hasChanged: boolean } => {
  let nextUpd = current.upd
  for (const [, upd] of receivedUpdated) {
    if (upd > nextUpd) nextUpd = upd
  }

  const windowStart = nextUpd - deltaOverlapMillis
  const nextWindow: Record<string, number> = {}
  for (const [recordID, upd] of Object.entries(current.window || {})) {
    if (upd >= windowStart) nextWindow[recordID] = upd
  }

  let hasChanged = nextUpd !== current.upd
  for (const [recordID, upd] of receivedUpdated) {
    // A record without `upd` (0) can't be fingerprinted, and an older copy never replaces a newer one.
    if (upd <= 0 || upd < windowStart || (nextWindow[recordID] || 0) >= upd) continue
    nextWindow[recordID] = upd
    hasChanged = true
  }
  return { watermark: { upd: nextUpd, window: nextWindow }, hasChanged }
}

// lowestWatermark picks the watermark a single-watermark backend reads (`up`) on a multi-key route:
// the lowest, so it never skips a record of any key. A key that never received a record (upd 0)
// doesn't count, or one empty key would force a full sync every time.
export const lowestWatermark = (watermarks: IDeltaWatermark[]): IDeltaWatermark => {
  let lowest = makeEmptyWatermark()
  for (const watermark of watermarks) {
    if (watermark.upd > 0 && (lowest.upd === 0 || watermark.upd < lowest.upd)) lowest = watermark
  }
  return lowest
}
