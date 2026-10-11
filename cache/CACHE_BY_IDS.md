# Cache By IDs

This folder contains the `cache_by_ids` flow used to resolve records by `ID` with:

- in-memory cache
- IndexedDB persistence
- backend validation using the per-slot **year tick** (the 2-second tick of the slot's last write)

This is the cache used by features that ask for many individual records by `ID` and want to avoid
downloading unchanged rows repeatedly. It also serves partitioned tables, whose IDs are unique only
inside a partition (stories per project): one request can cover several partitions.

## Files

- `cache-by-ids.svelte.ts`
  Public API for reads, batching, stale detection, and server delta fetch.
- `cache-by-ids.wire.ts`
  Pure: year cycles, `toYearTick`, and `encodeCachedIDsRequest` (the `cc` parameter).
- `cache-by-ids.idb.ts`
  IndexedDB persistence layer keyed by `[storeName, ID]`.

## Frontend Flow

### 1. Caller asks for one or many IDs

Main APIs:

- `getRecordsByID(apiRoute, ids)`: a table without Partition → `Map<ID, record>`
- `getRecordsByID(apiRoute, { [partition]: ids })`: a partitioned table, any number of partitions
  in one request → `Map<partition, Map<ID, record>>`
- `getRecordByID(apiRoute, id)`, `getRecordWithCache(apiRoute, id)`: partition 0

### 2. Cache checks happen in this order

For each requested ID:

1. memory map
2. IndexedDB
3. backend request only if missing or stale

If a record is found in IndexedDB, it is promoted to memory. A partition is cached under its own
namespace: `<apiRoute>:<partition>`, or `<apiRoute>` for partition 0. The namespace is the memory map
key and the IndexedDB `storeName`.

### 3. Stale detection

Each cached record stores:

- `ID`: unique record identifier (inside its partition)
- `upd`: the slot's year tick as an Updated value, as returned by the backend (`0` = unknown,
  always forces a fetch)
- `_fch`: fetch timestamp in seconds
- `ss`: status, where `0` means deleted/tombstone

A record is considered stale when:

```ts
nowSeconds() - _fch > CACHE_TIME
```

Fresh local records return immediately without network.

### 4. The request sent to the backend

When a partition has a missing or stale record, the frontend sends that partition with **every** ID
it requests from it, in one `cc` parameter for all partitions (`encodeCachedIDsRequest`):

```
GET <apiRoute>?cc=<base64url>

[cycle year − 2000: u8]
[partition count: uvarint]
per partition, ascending:
  [partition delta: uvarint]                  the first one is absolute
  [slot count: uvarint]
  [slot: u8][year tick: u24 LE] × slot count   ascending by slot, ticks ≥ 1
  [ID count: uvarint]
  [ID delta: uvarint] × ID count              ascending IDs, the first one absolute
```

- A held record's tick is `toYearTick(upd)`. A record not held counts as tick 0.
- One tick per slot: the **lowest** among the slot's requested IDs. A held tick is never above the
  slot's, so "lowest == slot" proves every record of the slot current. A lower one makes the
  backend return them all, after which they agree. A slot with tick 0 isn't listed.
- The format is pinned by `backend/genix-orm/dynamo/testdata/year_tick_vectors.json`, which the Go
  decoder and berryapps' `frontend/core/cache-by-ids-wire.test.ts` both check.

If the backend does not return a requested ID, the frontend treats that row as unchanged and only
refreshes `_fch`. A failed request refreshes nothing.

## Year ticks

A year cycle starts on **January 1 at 07:00 UTC**. A tick counts 2 seconds from it, one Updated
(SUnixTime) unit (a leap year is 15,811,200 ticks, under uint24's 16,777,215):

| Tick | Meaning |
|---|---|
| 0 | unknown: always forces a read |
| 1 | no write to the slot in this cycle |
| ≥ 2 | a write: `Updated − cycleStart + 2` |

The backend returns a tick as `upd = cycleStart + tick − 1`, the end of its window, and
`toYearTick(upd) = upd − cycleStart + 1` turns it back. A value from an earlier cycle converts to 0,
so on January 1 every record is read once more: that is the yearly reset, with no job and no browser
clear. `cycleStart` is the cycle's start as SUnixTime, `(unix seconds − 1e9) / 2`.

## Backend Flow

The backend endpoint decodes the request and calls `QueryCachedIDs`
(`genix-orm/dynamo/cache_by_ids.go`):

```go
func GetStoriesByIDs(req *core.HandlerArgs) core.HandlerResponse {
	cachedIDs, err := req.ExtractCachedIDs() // db.CachedIDsRequest{CycleYear, IDs: []{Partition, ID, YearTick}}
	if err != nil {
		return req.MakeErr(err)
	}
	if len(cachedIDs.IDs) == 0 {
		return req.MakeErr("No story IDs were sent.")
	}
	cachedPartitions, err := types.Stories.QueryCachedIDs(cachedIDs)
	if err != nil {
		return req.MakeErrCode(http.StatusInternalServerError, "Could not load the stories:", err)
	}
	return req.MakeResponse(cachedPartitions) // [{p: 3, r: [...]}, ...]
}
```

Records are bucketed into 256 slots per partition by `uint8(ID)`. Each partition has, per cycle, a
768-byte slot file in S3 (256 uint24 ticks); every write raises its slot after the records are
written. `QueryCachedIDs` reads the file of each requested partition and compares each held tick
against its slot's.

Behavior:

- matching tick: row is omitted from the response
- different tick (or `0`): row is read consistently from the main table and returned
- the returned row's `upd` is its **slot's** tick, not its own `Updated`: that is the value the
  client must send back next time
- a tick whose window ended less than 4 seconds ago is returned as `upd` 0: a write stamped inside
  it may still land, so it is not trusted yet, and the next revalidation reads the row again
- a request whose cycle year isn't the backend's has every tick ignored

The response is one entry per partition with changed records: `[{ p: <partition>, r: [records] }]`.
minijson omits a zero `p`, so the frontend reads `p || 0`.

### Why the slot tick, not the record's own

A write moves the whole slot. If the client kept a record's own `upd`, a record sharing a slot with a
more recently written one would mismatch forever and be refetched on every request. Returning the
slot tick makes the comparison converge after one fetch.

The cost: a record that reached this cache from a **delta** list carries its own `upd`, which converts
to a tick one below its slot's. That costs exactly one revalidation fetch, after which the record
holds the right value. For the same reason, IndexedDB rows written before a protocol change heal
themselves.

## Requirements To Use This

### Frontend record shape

```ts
export interface IMinimalRecord {
	ID: number
	ss: number
	_fch?: number
	upd: number
}
```

- `ID`: required, the cache key inside its partition.
- `upd`: required for backend validation, and read by `getRecordByIDUpdated`.
- `ss`: required. `0` is treated as deleted.
- `_fch`: internal frontend timestamp used for stale detection.

### Backend schema requirements

```go
func (table StoryTable) GetSchema() db.Schema {
	return db.Schema{
		Entity:     "projects_story",
		Partition:  db.Cols(table.ProjectID.Size(32)), // optional: at most one integer column
		Keys:       db.Cols(table.ID.Size(32)),        // exactly one integer column
		CacheByIDs: true,
	}
}
```

Requirements enforced by the ORM:

- `CacheByIDs: true`
- exactly one integer `Keys` column (the ID), at most one `Partition` column
- an `int32` field named `Updated` (`json:"upd"`), in **both** the record and the table struct
- berryapps: `[file_store].bucket` set, where the slot files live (`ids-cache/`)

The ORM stamps `Updated` on every write; handlers never set it. If `upd` is missing from the
response, the frontend cannot validate cached rows.

## IndexedDB Rules

One shared Dexie table, keyed by `[storeName, ID]`.

- store name = the cache namespace (`apiRoute`, or `apiRoute:partition`)
- the full record object is stored: `ID`, `upd`, `_fch`, `ss`, domain fields

## Batching Rules

`getRecordByID` uses a small buffer window (`buffetMaxTime`) so many card/component requests become
one backend request per route. `getRecordsByID` with several partitions makes one request for all of
them.

## Important Limitation

Different IDs of one partition share a slot when `uint8(idA) == uint8(idB)` (26, 282, 538...). A
write to one refetches the others once. This is compact and fast, but unrelated rows invalidate
together.

## Debugging Checklist

If the same rows keep coming back from the backend:

1. check the record's `upd` in memory and IndexedDB, and `toYearTick(upd)`
2. decode the `cc` parameter (`DecodeCachedIDsRequest`) and check the tick sent for its slot
3. check the backend response `upd`

Typical failure patterns:

- backend returns rows with no `upd`: the response struct is missing `Updated`.
- backend returns `upd` 0: the slot was written less than 4 seconds ago; it settles on the next
  revalidation.
- every cached row always fetches again: `_fch` is not refreshed, the epoch is wrong, or the rows
  came from a delta list (self-heals after one fetch).

## Related References

- `backend/genix-orm/dynamo/cache_by_ids.go`
- `backend/core/cache_by_ids.go` (`ExtractCachedIDs`), `backend/core/filestore` (the S3 store)
