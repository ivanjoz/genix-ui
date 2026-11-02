# Delta Cache

The delta cache stores each response key as independent IndexedDB rows and rebuilds the grouped response when the service reads from cache.

## Response contract

Normal cached payloads return arrays keyed by response name:

```ts
{
  records: [{ ID: 1, ver: 3 }],
  summary: [{ ID: "today", ver: 12 }],
}
```

Delta responses may also include removal flags. A key ending in `_IDsToRemove` is not persisted as records. It is interpreted as a list of cached IDs to delete from the response key with the same prefix.

```ts
{
  records: [{ ID: 2, ver: 1 }],
  records_IDsToRemove: [1, 7, 9],
}
```

Rules:

- `records_IDsToRemove` deletes rows from the cached `records` group before applying incoming `records` deltas.
- The flag value must be an array of `string | number` IDs matching the configured cache key for that response key.
- Keys ending in `_IDsToRemove` are ignored by snapshot rebuild, stats, and cursor calculations.
- Removal flags are processed as a real cache change even if no incoming record arrives.

A response carrying a record or a removal is applied; an empty one means nothing new. A record whose
`ver` equals the held one's is the same record and is not rewritten in IndexedDB.

## Two protocols

A response key's Metadata says which protocol answered it. Flag `8` is the **window protocol**
(genix-orm's Scylla driver, below); anything else is the **delta log** (the Dynamo driver, the
section after it). Both keep their cursor in `deltaCursors[key]`, and `readDeltaKeyResponse` picks the
branch.

## The window protocol

There is no change log. A `TypeDelta` index is a slim materialized view `(ID, upd, ver, filter)`, and
the cursor is a plain number: the highest `upd` (SUnixTime, 2-second ticks) the browser holds.

```
GET example-clients?up=400000000
```

The server answers the records the view lists with `upd ≥ C − 10 s`, read by ID in every status,
plus one Metadata record (`ID = −1`). Its `mdt` (`delta-window.wire.ts`) carries the next cursor,
the window `[from, to)` = `[C − 15 min, C − 10 s)` and its hash, the sync filter field and values,
and the IDs that moved out of the pinned prefix. The client:

- removes the moved IDs, and every returned record whose filter value is not in the values (it left
  the view: a soft delete, an annulment);
- hashes the records it holds with `upd` in the window and a matching filter value, leaving out the
  IDs the response brought or removed (sum mod 2³² of `deltaRecordHash(ID, ver)`);
- on a mismatch (a missed write: one that landed late, view lag, a lost move) drops the key's cursor
  and asks again at once: a request without a cursor gets a **replace**.

A replace (flag `2`) comes on a first sync, or more changed or moved records than the index's
threshold (100 by default). The cursor's age alone never causes one. `genix-orm/db/cache/delta_window.go` is the Go side; the
vectors in `genix-orm/db/cache/testdata/delta_window_vectors.json` are copied into
`delta-window.wire.test.ts`.

## The delta log and its cursor

Every record carries `ver`, an int16 the backend raises on each write (1 on insert). For each delta
index, genix-orm appends one entry per write to a change-log file of that index's partition and
10-minute bucket (`bucket = floor(SUnixTime / 300)`): `(log ID, ver mod 8191, deleted)`. The format
lives in `delta-log.wire.ts`; `genix-orm/dynamo/delta_log_codec.go` is its Go side, and both are
pinned by `genix-orm/db/cache/testdata/delta_log_vectors.json`.

A delta response holds the changed records plus one **Metadata record** per log file it read:
`ID = −bucket`, `mdt` = Safe85 of `[flags][bucket uvarint][log ID column count][widths…][file]`.
Flags: `1` 64-bit IDs, `2` replace (the response holds the whole view), `4` sealed (no more appends).
Metadata records never reach the store: `readDeltaKeyResponse` (`delta-cache.cursor.ts`) strips them
and moves the response key's cursor, kept in the route row's `deltaCursors[key]`:

- `{ [bucket]: bytes of the file applied }`, for every file still open;
- entries past the held bytes are read, the last per log ID wins, and a `deleted` one removes the
  held record (hard delete, `ss` 0, or it left the view);
- a sealed file leaves the cursor; a replace starts it over and removes every held record the
  response doesn't bring.

Every later sync sends the cursor as `<bucket>.<bytes>` pairs, in bucket order:

```
GET example-clients?up=5887211.40.5887212.8
GET warehouse-product-stock?warehouse-id=1&ProductStock=5887211.40
```

The param is named after the response key; a bare-array route sends `up`. A key with no cursor sends
nothing, and a first sync sends no param at all. The backend reads it with `req.GetDeltaCursor()` and
answers from the files at those offsets: append order is landing order, so no time overlap is
needed and no write is lost to clock skew. A cursor more than 7 days (or one day of files) behind
gets a `replace` answer.

The IndexedDB delta cache is at version 8: the upgrade drops every cached route, since the
watermark became the cursor.

Note `upd` on `*-ids` routes is the record's slot's last write, not its own — see `CACHE_BY_IDS.md`.
