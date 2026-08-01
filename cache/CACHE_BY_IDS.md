# Cache By IDs

This folder contains the `cache_by_ids` flow used to resolve records by `ID` with:

- in-memory cache
- IndexedDB persistence
- backend validation using the per-slot version (`upv`)

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
- `upv`: slot version returned by backend
- `_fch`: fetch timestamp in seconds
- `ss`: status, where `0` means deleted/tombstone
- `upd`: updated value used by `getRecordByIDUpdated`

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
- `cc-ver`
  slot-version for each `cc-id`

Important:

- `cc-ids` and `cc-ver` are positional pairs
- they must stay aligned after compact encoding. `cc-ids` uses `concatenateInts`, which buckets by
  magnitude; `cc-ver` uses `concatenateUint16s`, a single fixed-width array, precisely so that
  bucketing cannot reorder it out of alignment
- `cc-ver` must fit in `uint16`, so `0..65535`. `0` means "no version held" and always forces a read

If backend does not return a cached ID, frontend treats that row as unchanged and only refreshes `_fch`.

## Backend Flow

The backend endpoint receives the IDs and calls:

```go
err := db.QueryCachedIDs(&records, cachedIDs)
```

`QueryCachedIDs` compares the client `upv` against the current slot version in `cache_updated_version`.

Behavior:

- matching version: row is omitted from response
- different version: row is selected from the main table and returned
- the returned row's `upv` is overwritten with its **slot** version, not its own write version — that
  is the value the client must send back next time

### Why the slot version, not the record's own

Records are bucketed into 256 slots by `uint8(ID)`, and a write bumps the whole slot. If the client
kept a record's own write version, a record sharing a slot with a more recently written one would
mismatch forever and be refetched on every request. Stamping the slot version makes the comparison
converge after one fetch.

The cost: a record that reached this cache from a **delta** list carries its own write version
instead, which never equals a slot version. That costs exactly one revalidation fetch, after which
the record holds the right value. This is expected, not a bug.

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
	upv?: number
	ss: number
	_fch?: number
	upd: number
}
```

Minimum practical requirements:

- `ID`
  Required. Used as cache key.
- `upv`
  Required for backend delta validation.
- `ss`
  Required. `0` is treated as deleted.
- `_fch`
  Internal frontend timestamp used for stale detection.
- `upd`
  Required only if you use `getRecordByIDUpdated`.

### Backend schema requirements

The backend table schema must enable slot-version support:

```go
func (t ProductoTable) GetSchema() db.TableSchema {
	return db.TableSchema{
		Name:             "productos",
		Partition:        t.EmpresaID,
		SaveUpdatedVersion: true,
		Keys:             []db.Coln{t.ID.Autoincrement(0)},
	}
}
```

Requirements enforced by the ORM:

- `SaveUpdatedVersion: true`
- exactly one key column
- key column must be `int16`, `int32`, or `int64`
- table must have a partition column
- partition column must be `int32` or `int64`

### Backend response struct requirements

The response struct must expose a slot-version field:

```go
type Producto struct {
	ID           int32 `json:",omitempty"`
	Status       int8  `json:"ss,omitempty"`
	Updated      int32 `json:"upd,omitempty"`
	UpdatedVersion int32 `json:"upv,omitempty"`
}
```

Requirements:

- field name `UpdatedVersion` with JSON tag `upv`, in **both** the record and the table struct
- type must be `uint8`
- `ID` must be present in the response

If `upv` is missing from the response, the frontend cannot validate cached rows correctly.

## Expected Endpoint Pattern

The `*-ids` endpoint usually does this:

1. parse `ids`, `cc-ids`, `cc-ver`
2. build `[]db.IDUpdatedVersion`
3. call `db.QueryCachedIDs`
4. return only changed/new rows

Example:

```go
func GetProductosByIDs(req *core.HandlerArgs) core.HandlerResponse {
	cachedIDs := req.ExtractUpdatedVersionValues()
	if len(cachedIDs) == 0 {
		return req.MakeErr("No se enviaron ids a buscar.")
	}

	productos := []negocioTypes.Producto{}
	if err := db.QueryCachedIDs(&productos, cachedIDs); err != nil {
		return req.MakeErr("Error al obtener los productos.", err)
	}

	return core.MakeResponse(req, &productos)
}
```

## IndexedDB Rules

Each route gets its own object store.

- store name = `apiRoute`
- key path = `ID`

IndexedDB stores the full record object, including:

- `ID`
- `upv`
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

1. frontend sends `ID` and `upv` for cached rows
2. backend response includes the correct `upv`
3. backend schema has `SaveUpdatedVersion: true`
4. backend response model exposes `UpdatedVersion int32` as `upv`
5. `cc-ver` never exceeds `65535`
6. `cc-ids` and `cc-ver` stay aligned in the same order
7. returned records are merged into memory and IndexedDB
8. unchanged cached records refresh `_fch`

If any of these fail, the usual symptom is:

- backend keeps returning the same rows again and again

## Important Limitation

The backend groups slot-version state by `uint8(id)`, one row per slot in `cache_updated_version`.

That means different IDs can share the same slot-version bucket when:

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

1. check frontend request snapshot for `ID`, `upv`, `_fch`
2. check IndexedDB stored value for the same `ID`
3. check backend received the slot version
4. check backend response `upv`
5. confirm `cc-ver` values are `0..65535`
6. confirm `cc-ids` and `cc-ver` stay aligned

Typical failure patterns:

- IndexedDB has correct `upv`, but backend receives another one
  Usually transport ordering/alignment bug.
- backend returns rows with no `upv`
  Response struct is missing `UpdatedVersion`.
- every cached row always fetches again
  `_fch` is not refreshed, local rows are always stale, or the rows came from a delta list and still
  carry their own write version instead of a slot version (self-heals after one fetch).

## Related References

- `backend/docs/ORM_DATABASE_QUERY.md`
- `backend/genix-orm/scylla/cache_updated_version.go`
