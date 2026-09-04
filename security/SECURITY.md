# Security runtime

`createSecurity` owns the reusable half of session handling: token persistence and expiry,
the cross-tab refresh lock, the periodic refresh checker, and access checks over the
backend's two bit-packed grant payloads. Everything app-specific — the route→access
catalog, which routes are public, user-facing copy, and where to go after logout — is
injected, so the module has no host imports.

Applications normally do not call it directly: `createUiRuntime` takes the same options
under its `security` key and exposes the instance as `runtime.security`, keeping one
configuration entry per app. Call `createSecurity` when a project needs sessions without
the UI runtime.

```ts
import { createSecurity } from '@genix/ui/security';

export const security = createSecurity<IUser>({
  storageNamespace: 'myapp',
  onLogout: () => navigate('/welcome'),
  messages: {
    sessionExpired: 'Your session expired, please sign in again.',
    sessionExpiresIn: (minutes) => `Your session expires in ${minutes} minutes`,
  },
  notify: Notify,
  resolveRouteAccessEntries: getAccessEntriesForRoute,
  isPublicRoute: (route) => route === '/' || route === '/welcome',
  getCompanyID: () => activeCompanyID,
  autoStartRefreshCheck: true,
});
```

## Persisted keys

All keys are prefixed with `storageNamespace`: `UserToken`, `TokenExpTime`, `TokenCreated`,
`UserInfo`, `AccesosV2`, `AccesosSub`, `CompanyID`, `TokenRefreshLock`. `clearSession()` removes
all of them, stops the refresh checker, drops the in-memory caches, and then calls `onLogout`.

`AccesosV2` is a bump, not a rename: the payload used to be little-endian `uint16`s and is now the
raw big-endian byte blob. A stale value still decodes — into accesses nobody granted — so the key
changed to discard it rather than misread it.

## Access checks

The backend packs each granted access into a big-endian `u16` grant word,
`[14 bits accesoID][2 bits nivel-1]`, and splits them across **two** base64 payloads:

| Payload | Holds | Shape |
| --- | --- | --- |
| `AccesosComputed` | accesses with **no** granted sub-access | grant words only, fixed 2-byte stride, binary searchable |
| `AccesosSubComputed` | accesses with **at least one** | every grant word followed by its sub bytes, variable width, scanned linearly |

Which payload an access is in *is* the "has sub-accesses" flag, which is what lets the grant word
keep all 14 of its id bits. The consequence to keep in mind: **an access lives in exactly one
payload**, so a lookup that misses the first must try the second. `checkAcceso` does; a hand-rolled
check over `AccesosComputed` alone would deny a user something they hold.

A higher granted level satisfies a lower request. Results are memoized per
`(accesoID, nivel, subAccesoID)` — all three, because one answer about an access must not stand in
for a later question about it at another level or about a different sub-access — and the cache is
dropped whenever either stored payload changes, which is how a login in another tab is picked up.

`checkSubAcceso(accesoID, subAccesoID)` reads a flag *inside* an access. It says nothing about the
level, so a caller that needs both asks both. Sub-access id 1 is `"Todos"`: it is never declared in
the backend catalog and satisfies every check on its access. That expansion happens here and in Go
only — the `fareward` daemon returns the raw mask and holds no catalog.

Both stored payloads are wrapped with a 4-character checksum (2 leading, 2 trailing chars), and
both are structurally validated on load by `validateAccesosBlobs`: ordering must strictly increase,
every sub-access run must terminate, and no entry in the sub payload may carry an empty mask. A
payload that fails either check is discarded whole rather than searched, so every check then
answers `false`. `decodeStoredAccesosComputed`, `wrapAccesosComputed`, `findAccesoNivel`,
`findAccesoSubGrant`, `hasAcceso`, `hasSubAcceso` and `validateAccesosBlobs` are exported for
backend parity tests — this is the third hand-written parser of that format, alongside
`backend/core/accesos-blob.go` (the only encoder) and `fareward/src/limiter/access.rs`.

`canAccessRoute(route)` returns `true` for public routes and for routes absent from the
catalog; otherwise the route needs at least one matching access at level 1.

The catalog can be registered after creation with
`setRouteAccessResolver(resolveRouteAccessEntries)`. That is what a host does when one
runtime file is shared by an authenticated app and a public bundle: only the authenticated
app registers the resolver, so the catalog is never part of the public bundle's import graph.
Until it is registered, every non-public route resolves to "no catalog entry" → allowed, so
register it at app boot before any access check matters.

## Token refresh

`parseLogin` records `TokenCreated`, and the checker (every `tokenCheckIntervalSeconds`,
default 4 min) calls the registered refresher once the token is older than
`tokenRefreshThresholdSeconds` (default 40 min). `refreshLockSeconds` (default 30) bounds the
localStorage lock that keeps parallel tabs from refreshing simultaneously.

Register the refresher from the host login service — this is what avoids a circular import
between the login service and the security runtime:

```ts
security.setSessionRefresher(reloadLogin);
```

`getToken()` notifies through `notify.failure` and clears the session when the token has
expired; pass `getToken(true)` for silent probes such as route guards. The http client only
calls it for authenticated routes: a route prefixed with `p-` is public (the backend does not
validate a token for it), so `buildHeaders` sends no `Authorization` at all — otherwise signing
in with an expired token still in localStorage would toast "session expired" during the login
request itself. It also emits a
throttled `notify.warning` when the session is within 15 (then 5) minutes of expiring.
