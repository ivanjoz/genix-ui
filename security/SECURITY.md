# Security runtime

`createSecurity` owns the reusable half of session handling: token persistence and expiry,
the cross-tab refresh lock, the periodic refresh checker, and access checks over the
backend's bit-packed `AccesosComputed` payload. Everything app-specific — the route→access
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
`UserInfo`, `Accesos`, `CompanyID`, `TokenRefreshLock`. `clearSession()` removes all of them,
stops the refresh checker, drops the in-memory caches, and then calls `onLogout`.

## Access checks

The backend packs each granted access as `(accesoID << 2) | (nivel - 1)` into a sorted
`Uint16Array`, base64-encoded. `checkAcceso(accesoID, nivel)` binary-searches the
`[requested nivel, nivel 4]` range, so a higher granted level satisfies a lower request.
Results are memoized per `accesoID`/`nivel` and invalidated whenever the stored payload
changes — which is how a login in another tab is picked up.

The stored payload is wrapped with a 4-character checksum (2 leading, 2 trailing chars).
A tampered or truncated value decodes to an empty array instead of granting accesses;
`decodeStoredAccesosComputed` and `wrapAccesosComputed` are exported for backend parity tests.

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
expired; pass `getToken(true)` for silent probes such as route guards. It also emits a
throttled `notify.warning` when the session is within 15 (then 5) minutes of expiring.
