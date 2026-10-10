# Delta Cache

The delta cache stores each response key as independent IndexedDB rows and rebuilds the grouped response when the service reads from cache.

## Response contract

Normal cached payloads return arrays keyed by response name:

```ts
{
  records: [{ ID: 1, upd: 10 }],
  summary: [{ ID: "today", upd: 10 }],
}
```

Delta responses may also include removal flags. A key ending in `_IDsToRemove` is not persisted as records. It is interpreted as a list of cached IDs to delete from the response key with the same prefix.

```ts
{
  records: [{ ID: 2, upd: 11 }],
  records_IDsToRemove: [1, 7, 9],
}
```

Rules:

- `records_IDsToRemove` deletes rows from the cached `records` group before applying incoming `records` deltas.
- The flag value must be an array of `string | number` IDs matching the configured cache key for that response key.
- Keys ending in `_IDsToRemove` are ignored by snapshot rebuild, stats, and `updatedStatus` calculations.
- Removal flags are processed as a real cache change even if no incoming record has a newer `upd`.

## When a delta is applied: `doNothingOnSameValue`

A response that carries at least one record is always applied. The watermark is the *bound of the
question*, not proof of what came back: a route that rewrites a live aggregate row in place — today's
credit usage row, keyed by today's time frame — sends the same `upd` all day, so comparing only the
highest watermark per response key concluded "nothing happened" and froze the route until the next
day. An empty response still means nothing new, which is what the backend answers when the client's
watermark already covers everything.

Set `doNothingOnSameValue: true` on a service to get the watermark comparison back: a delta that
neither moves `upd` nor adds a newer entry to the window is discarded — typically a resent window
that only repeats what the client holds. Only correct when every write moves the record's `upd`
(genix-orm's managed `Updated` does), and worth it only for routes where re-persisting an identical
payload costs real IndexedDB writes.

## The watermark: `"<upd>.<fingerprint>"`

`upd` is the backend's managed `Updated`: milliseconds since its `unix_time_start`
(`VITE_UNIX_TIME_START` in the app; `updatedToUnixMillis` turns it into a unix time). Per response
key the route row keeps, in `updatedStatus[key]`, an `IDeltaWatermark`:

- `upd` — the highest `upd` received;
- `window` — `{ [recordID]: upd }` for every record received with `upd` in
  `[upd − 4000, upd]` (`deltaOverlapMillis`, genix-orm's `DeltaOverlap`), deleted records included.

Every sync sends `<upd>.<fingerprint of window>` (`formatWatermark`):

```
GET example-clients?up=1234567.3051184921
GET warehouse-product-stock?warehouse-id=1&ProductStock=1234567.3051184921&up=1234567.3051184921
```

The param is named after the response key; a route whose response is a bare array has no key of its
own and sends `up`. A multi-key route also sends `up` last, carrying the lowest key's watermark
(`lowestWatermark`; keys that never received a record don't count), because the backend reads only
`up`. No key skips a record, but the fingerprint only matches the lowest key's window, so the other
keys get theirs resent on every sync.

The backend parses it with `req.GetDeltaSince()` and passes it to `Query().Delta(since, ...)`
(`genix-orm/dynamo/delta.go`): it returns every record with `Updated > upd`, re-reads the window
below it, and resends the whole window only when its own fingerprint of it differs. A missing param
or `upd` 0 is a first sync. A handler doing its own delta reads `req.GetDeltaSince().Updated`.

### Why a window and a fingerprint

`Updated` is a clock, not a sequence: two Lambdas can stamp the same millisecond, and a write stamped
inside the window can land after the client read past it (still in flight, or stamped by a Lambda
whose clock lags). A bare `> upd` bound would lose it for good. Re-reading the 4 seconds below the
watermark catches it; the fingerprint keeps that overlap from being resent on every poll when nothing
is missing, so a quiet sync costs the backend one keys-only query and returns nothing.

The fingerprint is an order-independent sum, mod 2³², of a murmur3-style mix of each `upd`
(`deltaFingerprint` in `delta-cache.watermark.ts`, `DeltaFingerprint` in genix-orm): a missing, extra
or rewritten record changes it. Both sides must compute it identically; a shared test vector pins
them together. A resent window is upserted by ID, and `mergeIntoWatermark` reports no change when it
only repeated what the window held.

Expected quirks:

- A first sync filtered to active records leaves out the soft-deleted ones inside the window, which
  the backend's fingerprint counts. The next sync resends that window once; after it, they match.
- A write that lands more than 4 seconds after its stamp, past a client's sync, is still missed
  until the record is written again.

The IndexedDB delta cache is at version 7: the upgrade drops every cached route, since both the
watermark shape and the unit of `upd` changed.

Note `upd` on `*-ids` routes is the record's slot's last write, not its own — see `CACHE_BY_IDS.md`.
