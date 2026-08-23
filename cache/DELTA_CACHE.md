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

Set `doNothingOnSameValue: true` on a service to get the old behaviour back: an unmoved watermark
discards the delta. Only correct when the watermark moves on every write (a `upv` delta index), and
worth it only for routes where re-persisting an identical payload costs real IndexedDB writes.

## Watermark: `upv`, not `upd`

A table with a `db.TypeDelta` index watermarks its sync on `upv` (`updated_version`), the record's
write sequence number, and the client sends it back as the `upv` query parameter. `upd` remains the
human-facing timestamp and is still the fallback watermark for routes whose table has not moved to a
delta index yet — see `getRecordUpdateValue` in `delta-cache.fetch.ts`.

Why a sequence and not a timestamp: several writes can land in the same second, so a client that
syncs mid-second gets a watermark that hides records it never received. The ORM assigns `upv` from a
per-partition counter, so it is strictly increasing and never collides. That makes the server's
`>= watermark + 1` bound exact — the boundary rows are not re-sent on every poll, which is what a
timestamp watermark had to do to stay correct.

### Known limitation: concurrent writers

Versions are reserved before the write commits, so two overlapping writers can commit out of order:
writer A reserves 100, writer B reserves 101 and commits first, a client polls and stores watermark
101, then A commits. A's records are never delivered until they are written again.

The window is the few milliseconds between two concurrent writes on the same tenant and table, with
a poll landing inside it. This is accepted rather than fixed: closing it needs a per-partition
"all versions below this are committed" watermark and cross-process in-flight tracking. If it ever
shows up in practice, that is the fix.

Note `upv` means something different on `*-ids` routes — see `CACHE_BY_IDS.md`.
