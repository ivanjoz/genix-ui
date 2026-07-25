# @genix/ui

Reusable Svelte 5 UI components and utilities shared by Genix applications.

The package is consumed as a Git submodule and a Bun workspace package. Stateful
components require one configured `UiRuntime`; business data, authentication, routing
policy, and backend services remain in the host application.

Package exports point directly to the package root, so consumers compile the source and editor
navigation opens the implementation rather than generated declarations in `dist/`.

## Structure

The source is intentionally flat and has no `src/` or `lib/` wrapper:

```text
genix-ui/
  package.json
  index.ts
  agent/
  assets/
  buttons/
  cache/
  cards/
  charts/
  editor/
  excel/
  files/
  form/
  http/
  layers/
  menu/
  misc/
  navigation/
  runtime/
  security/
  service-worker/
  utilities/
  vTable/
  workers/
```

## Runtime

`createUiRuntime` is the only runtime factory and the single place a host configures the
package. It configures HTTP, cache, service worker, Excel, images, persistence, session
security, and component state, then returns one flat runtime:

```ts
import { createUiRuntime } from '@genix/ui';
import { GetHandler as ReusableGetHandler } from '@genix/ui/http';

export const ui = createUiRuntime({
  applicationName: 'My application',
  translate,
  makeRoute,
  security: { storageNamespace: 'myapp', onLogout },
  getCompanyID: () => activeCompanyID,
  getEnvironment: () => activeEnvironment,
  getWorkerUrl: () => '/sw.js',
  navigate,
  verifyRouteMemoryState,
  notify,
  reportFetch,
  reportProgress,
  addProcess,
  updateProcess,
});

export const { GET, GETWithGroupCache, POST, PUT, POST_XMLHR } = ui.http;
export const { fileToImage, bitmapToImage } = ui.imageConverter;

export class GetHandler<T extends { ID: number; ss?: number }>
  extends ReusableGetHandler<T> {
  constructor() {
    super(ui.getHandlerRuntime);
  }
}
```

Provide that runtime at each Svelte mount root. Descendants read and update the same
package-owned state:

```svelte
<script lang="ts">
  import { provideUi } from '@genix/ui';
  import { ui } from './ui-runtime';

  provideUi(ui);
</script>
```

`UiProvider` is available when a component wrapper is more convenient than
`provideUi`. Server-rendered applications should create runtime instances at the
appropriate request/app boundary because the runtime contains mutable Svelte state.

## Security

Session handling is part of the runtime: `createUiRuntime` builds the security instance from
the `security` options block and exposes it as `runtime.security`. HTTP authorization
(`getToken`), the cached-service route guard (`canAccessRoute`), and `onUnauthorized` default
to that instance, so a host configures them only to override the defaults.

```ts
export const ui = createUiRuntime<IUser>({
  applicationName: 'My application',
  makeRoute,
  getCompanyID,
  getEnvironment,
  getWorkerUrl,
  getPathname,
  navigate,
  notify,
  security: {
    storageNamespace: 'myapp',
    onLogout: () => navigate('/login'),
    messages: { sessionExpired, sessionExpiresIn },
    isPublicRoute,
    resolveRouteAccessEntries: getAccessEntriesForRoute,
    autoStartRefreshCheck: true,
  },
});

export const security = ui.security;
security.setSessionRefresher(reloadLogin);
```

`createSecurity` from `@genix/ui/security` remains available for applications that need the
session runtime without the UI runtime. When one runtime file is shared by an authenticated
app and a public bundle, omit `resolveRouteAccessEntries` and register it from the
authenticated app instead — `security.setRouteAccessResolver(getAccessEntriesForRoute)` —
so the access catalog never reaches the public bundle. See `security/SECURITY.md` for the
persisted keys, the access-packing contract, and the refresh timings.

## Host-owned policies

`SideMenu` receives its model, active path, access policy, translator, navigation callback,
branding, and bindable open state as props. `MobileMenu` receives generic items and a
selection callback. Neither component imports host routing, security, services, or global
singletons.

Pure encoding, compact-response, date/week, and object-mapping helpers are exported from
`@genix/ui/utilities`. They have no host configuration or Svelte runtime dependency.

`ui.images` is the runtime-wide reactive in-memory image queue. Its `get()`,
`getBase64()`, and `isInFlight()` methods normalize CDN folders and `-xN` suffixes.
`ui.imageConverter` lazily creates and pools the package-owned image worker on the
first conversion, so consumers do not configure or initialize workers.
`ui.fieldPersistence` stores component values by environment, company, and grouped
component ID.

Excel import/export is exported directly from `@genix/ui/excel`. The package owns the
WASM asset and lazily initializes it on first use; `createUiRuntime` supplies application
name and translation once:

```ts
import { ExcelBuilder, downloadExcel } from '@genix/ui/excel';

const builder = new ExcelBuilder<MyRecord>();
await downloadExcel(options);
```

`GetHandler` treats `ss === 0` as a tombstone when `inferRemoveFromStatus` is enabled.
By default, `post()` logs failures and returns `[]`; set
`returnEmptyOnPostFailure = false` in a service when callers must receive the rejection.
The class uses Svelte 5 runes and must be consumed through a Svelte-aware build.

The lower-level HTTP, cache, and service-worker constructors remain available for
specialized infrastructure, but applications normally configure only `createUiRuntime`.

Canvas and compact cell charts are exported from `@genix/ui/charts`. The removed
`Charts.svelte` billboard wrapper had no consumers and depended on an obsolete API, so it
is intentionally not part of the package.

The import-free `Renderer` and its `ElementAST` contract are exported from `@genix/ui`.
AST callbacks are supplied by the host, keeping actions and business behavior outside the
component.

All UI groups are available through source-first wildcard exports, for example
`@genix/ui/form/Input.svelte` and `@genix/ui/vTable/TableGrid.svelte`. Genix retains
`$components/*` as an alias directly to the package root.

## Development

```sh
# Validate the source-first workspace package.
bun run check
```

The package is private and distributed as a Git submodule. A future registry build should
introduce a dedicated staging/source directory; `svelte-package --input .` is not used
because it recursively scans package metadata, dependencies, and generated directories.

Tailwind CSS v4 hosts must scan the package source and use the Genix spacing contract:

```css
/* Package components use one Tailwind spacing unit as one pixel. */
@source "../packages/genix-ui/{buttons,cards,charts,editor,files,form,layers,menu,misc,navigation,runtime,vTable}/**/*.svelte";

@theme {
  --spacing: 1px;
}
```
