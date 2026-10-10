# Cache By IDs

This folder contains the `cache_by_ids` flow used to resolve records by `ID` with:

- in-memory cache
- IndexedDB persistence
- backend validation using the per-slot `upd` (the `Updated` of the slot's last write)

This is the cache used by features that ask for many individual records by `ID` and want to avoid downloading unchanged rows repeatedly.

## Files

- `cache-by-ids.svelte.ts`
  Public API for reads, batching, stale detection, and server delta fetch.
- `cache-by-ids.idb.ts`
  IndexedDB persistence layer keyed by `ID`.

## Frontend Flow

### 1. Caller asks for one or many IDs

Main APIs:

- `getRecordsByID(apiRoute, ids)`
- `getRecordByID(apiRoute, id)`
- `getRecordWithCache(apiRoute, id)`

### 2. Cache checks happen in this order

For each requested ID:

1. memory map
2. IndexedDB
3. backend request only if missing or stale

If a record is found in IndexedDB, it is promoted to memory.

### 3. Stale detection

Each cached record stores:

- `ID`: unique record identifier
- `upd`: the slot's last write, as returned by the backend (`0` = unknown, always forces a fetch)
- `_fch`: fetch timestamp in seconds
- `ss`: status, where `0` means deleted/tombstone

A record is considered stale when:

```ts
nowSeconds() - _fch > CACHE_TIME
```

Fresh local records return immediately without network.

### 4. Delta request sent to backend

When the frontend needs server validation, it sends:

- `ids`
  IDs that do not exist locally
- `cc-ids`
  IDs that exist locally
- `cc-upd`
  the slot `upd` held for each `cc-id`

Important:

- `cc-ids` and `cc-upd` are positional pairs
- they must stay aligned after compact encoding. `cc-ids` uses `concatenateInts`, which buckets by
  magnitude; `cc-upd` uses `concatenateUint48s` (`utilities/parsers.ts`), one base64url array of
  6-byte little-endian values, reordered into the same bucket order so bucketing cannot break the
  alignment
- `0` means "nothing held" and always forces a read

If backend does not return a cached ID, frontend treats that row as unchanged and only refreshes `_fch`.

## Backend Flow

The backend endpoint reads the params and calls `QueryCachedIDs` (`genix-orm/dynamo/cache_by_ids.go`):

```go
cachedIDs := req.ExtractCachedIDs() // []db.CachedID{ID, Updated}
records, err := types.Products.QueryCachedIDs(cachedIDs, partitionValues...)
```

Records are bucketed into 256 slots per partition by `uint8(ID)`. One slot item per partition holds,
for each slot, the `Updated` of its last write; every write sets it after the records are written.
`QueryCachedIDs` reads that item once and compares each client value against its slot's.

Behavior:

- matching value: row is omitted from response
- different value (or `0`): row is read consistently from the main table and returned
- the returned row's `upd` is overwritten with its **slot** value, not its own `Updated` — that is
  the value the client must send back next time
- a slot value younger than 4 seconds is returned as `0`: a concurrent write could still stamp that
  millisecond or land late, so it is not trusted yet, and the next revalidation reads the row again

### Why the slot value, not the record's own

A write moves the whole slot. If the client kept a record's own `upd`, a record sharing a slot with a
more recently written one would mismatch forever and be refetched on every request. Returning the
slot value makes the comparison converge after one fetch.

The cost: a record that reached this cache from a **delta** list carries its own `upd`, which equals
the slot value only if it was the slot's last write. Otherwise that costs exactly one revalidation
fetch, after which the record holds the right value. This is expected, not a bug. For the same
reason, IndexedDB rows written before a protocol change heal themselves: an old value never matches a
slot.

So the response contains only:

- missing records
- changed records

Unchanged cached records are not sent again.

## Requirements To Use This

### Frontend record shape

The frontend record type must include at least:

```ts
export interface IMinimalRecord {
	ID: number
	ss: number
	_fch?: number
	upd: number
}
```

Minimum practical requirements:

- `ID`
  Required. Used as cache key.
- `upd`
  Required for backend delta validation, and read by `getRecordByIDUpdated`.
- `ss`
  Required. `0` is treated as deleted.
- `_fch`
  Internal frontend timestamp used for stale detection.

### Backend schema requirements

The backend table schema must enable the by-IDs cache:

```go
func (table ProductTable) GetSchema() db.Schema {
	return db.Schema{
		Entity:     "example_product",
		Keys:       db.Cols(table.ID.Size(32)),
		CacheByIDs: true,
	}
}
```

Requirements enforced by the ORM:

- `CacheByIDs: true`
- exactly one integer `Keys` column (the ID)
- an `int64` field named `Updated` (`json:"upd"`)
- a `Partition` is optional; when present, pass its values to `QueryCachedIDs`

### Backend response struct requirements

The response struct must expose the managed `Updated`:

```go
type Product struct {
	ID      int32 `json:"ID" cb:"1"`
	Status  int8  `json:"ss" cb:"7"`
	Updated int64 `json:"upd" cb:"8"`
}
```

Requirements:

- field name `Updated`, type `int64`, JSON tag `upd`, in **both** the record and the table struct
- the ORM stamps it on every write; handlers never set it
- `ID` must be present in the response

If `upd` is missing from the response, the frontend cannot validate cached rows correctly.

## Expected Endpoint Pattern

The `*-ids` endpoint usually does this:

1. parse `ids`, `cc-ids`, `cc-upd` (`req.ExtractCachedIDs()`)
2. guard against an empty list
3. call `Repo.QueryCachedIDs`
4. return only changed/new rows

Example:

```go
func GetClientsByIDs(req *core.HandlerArgs) core.HandlerResponse {
	cachedIDs := req.ExtractCachedIDs()
	if len(cachedIDs) == 0 {
		return req.MakeErr("No client IDs were sent.")
	}
	clients, err := types.Clients.QueryCachedIDs(cachedIDs)
	if err != nil {
		return req.MakeErrCode(http.StatusInternalServerError, "Could not load the clients:", err)
	}
	return req.MakeResponse(clients)
}
```

## IndexedDB Rules

Each route gets its own object store.

- store name = `apiRoute`
- key path = `ID`

IndexedDB stores the full record object, including:

- `ID`
- `upd`
- `_fch`
- `ss`
- domain fields

## Batching Rules

`getRecordByID` uses a small buffer window (`buffetMaxTime`) so many card/component requests become one backend request per route.

This means:

- many components can ask for records independently
- frontend still sends one batched request per table/route

## Conditions For Correct Behavior

This cache works correctly only if all of these are true:

1. frontend sends `ID` and `upd` for cached rows
2. backend response includes the slot `upd`
3. backend schema has `CacheByIDs: true`
4. backend response model exposes `Updated int64` as `upd`
5. `cc-ids` and `cc-upd` stay aligned in the same order
6. returned records are merged into memory and IndexedDB
7. unchanged cached records refresh `_fch`

If any of these fail, the usual symptom is:

- backend keeps returning the same rows again and again

## Important Limitation

The backend groups slot state by `uint8(id)`, one value per slot in each partition's slot item.

That means different IDs share the same slot when:

```text
uint8(idA) == uint8(idB)
```

Example:

- `26`
- `282`
- `538`

All share the same group key modulo `256`.

This is compact and fast, but it means unrelated rows can invalidate together.

## Debugging Checklist

If the same rows keep coming back from backend:

1. check frontend request snapshot for `ID`, `upd`, `_fch`
2. check IndexedDB stored value for the same `ID`
3. check backend received the slot `upd`
4. check backend response `upd`
5. confirm `cc-ids` and `cc-upd` stay aligned

Typical failure patterns:

- IndexedDB has correct `upd`, but backend receives another one
  Usually transport ordering/alignment bug.
- backend returns rows with no `upd`
  Response struct is missing `Updated`.
- backend returns `upd` 0
  The slot was written less than 4 seconds ago; it settles on the next revalidation.
- every cached row always fetches again
  `_fch` is not refreshed, local rows are always stale, or the rows came from a delta list and still
  carry their own `upd` instead of the slot's (self-heals after one fetch).

## Related References

- `backend/genix-orm/dynamo/cache_by_ids.go`
- `backend/core/cache_by_ids.go` (`ExtractCachedIDs`, `parseConcatenatedUint48s`)
