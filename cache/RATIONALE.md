# RATIONALE — cache

Design decisions, newest first.

## The window protocol is checked by the client, and picked by the Metadata
**Context** — genix-orm's Scylla driver dropped the S3 delta log for a view on `updated`, which alone loses late writes (clock skew, a stalled Lambda, view lag). The Dynamo driver (berryapps) keeps the log.
**Decision** — A Metadata with flag `8` is the window protocol: the cursor is a number, and the client hashes the `(ID, ver)` of the records it holds in the server's window `[C − 15 min, C − 10 s)` and compares with the server's hash. On a mismatch it drops the key's cursor and re-requests at once, which the server answers with a replace. Any other Metadata is the delta log, unchanged.
**Rationale** — Only the client knows which held records the response replaced: a record edited inside the window and again after the cursor moved out of the server's window but not out of the client's, so the client excludes the returned and removed IDs before hashing. Picking by flag needs no per-app config, so berryapps keeps working untouched.

## Concurrent syncs of one route join, only when the request is identical
**Context** — A sync reads the route's cursor before its request and saves the next one after it. Two syncs of one route that overlap (two pages, or two services, of `products`) both sent the old cursor and both downloaded the same delta: 2 × 12 s of a 1.2 MB catalog after a mass rewrite.
**Decision** — `fetchDeltaCache` keeps the network syncs under way in `inFlightSyncs`; a sync whose key matches one under way awaits it and gets its answer. The key is the database, route, cache version, parsed route, cache mode and `fields`. `offline` reads are not joined.
**Rationale** — The joiner must get the first sync's *answer*, not just wait for it: run afterwards, an `updateOnly` sync would answer `null` (nothing new) and its page would keep the stale offline copy it showed first. Keying on the cache mode keeps that answer correct for the caller (an `updateOnly` and a `refresh` of one route still both reach the server). The map lives in the service worker, so it covers every tab of the app.
