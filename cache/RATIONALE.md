# RATIONALE — cache

Design decisions, newest first.

## Concurrent syncs of one route join, only when the request is identical
**Context** — A sync reads the route's cursor before its request and saves the next one after it. Two syncs of one route that overlap (two pages, or two services, of `products`) both sent the old cursor and both downloaded the same delta: 2 × 12 s of a 1.2 MB catalog after a mass rewrite.
**Decision** — `fetchDeltaCache` keeps the network syncs under way in `inFlightSyncs`; a sync whose key matches one under way awaits it and gets its answer. The key is the database, route, cache version, parsed route, cache mode and `fields`. `offline` reads are not joined.
**Rationale** — The joiner must get the first sync's *answer*, not just wait for it: run afterwards, an `updateOnly` sync would answer `null` (nothing new) and its page would keep the stale offline copy it showed first. Keying on the cache mode keeps that answer correct for the caller (an `updateOnly` and a `refresh` of one route still both reach the server). The map lives in the service worker, so it covers every tab of the app.
