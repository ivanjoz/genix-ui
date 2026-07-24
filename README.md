# @genix/ui

Reusable Svelte 5 UI components and utilities shared by Genix applications.

The package is consumed as a Git submodule and a Bun workspace package. Stateful
components require a `UiRuntime` to be created and provided once per Svelte component
tree. Business data, authentication, routing policy, and backend services remain in the
host application.

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
  popover2/
  runtime/
  service-worker/
  typed-idb/
  utilities/
  vTable/
  workers/
```

## Runtime

Create and set one runtime at the root of each Svelte render tree:

```svelte
<script lang="ts">
  import { createUiRuntime, provideUi } from '@genix/ui';

  const ui = provideUi(createUiRuntime());
</script>
```

Descendants read and update the same package-owned UI state:

```svelte
<script lang="ts">
  import { useUI } from '@genix/ui';

  const ui = useUI();
</script>

<button onclick={() => { ui.state.mobileMenuOpen = true }}>
  Open menu
</button>
```

Use a separate runtime for every fresh `mount()` tree. `UiProvider` is available when a
component wrapper is more convenient than calling `provideUi` directly.

## Host-owned policies

`SideMenu` receives its model, active path, access policy, translator, navigation callback,
branding, and bindable open state as props. `MobileMenu` receives generic items and a
selection callback. Neither component imports host routing, security, services, or global
singletons.

Pure encoding, compact-response, date/week, and object-mapping helpers are exported from
`@genix/ui/utilities`. They have no host configuration or Svelte runtime dependency.

Delta, record-by-ID, group, route, and IndexedDB caches are exported from
`@genix/ui/cache`. The host injects tenant-aware IO once without coupling package source
to application modules:

```ts
import { configureCacheRuntime } from '@genix/ui/cache';

configureCacheRuntime({
  getCompanyID: () => activeCompanyID,
  getEnvironment: () => activeEnvironment,
  get: authenticatedGet,
  navigate,
});
```

Excel import/export is exported from `@genix/ui/excel`. Each host supplies its WASM asset
URL, application name, and optional translator to an isolated runtime:

```ts
import { createExcelRuntime, ExcelBuilder } from '@genix/ui/excel';

const excelRuntime = createExcelRuntime({
  wasmUrl: '/vendor/excelize.wasm.bin',
  applicationName: 'My application',
  translate,
});
const builder = new ExcelBuilder<MyRecord>(excelRuntime);
```

The reusable GET/POST/PUT/upload transport is exported from `@genix/ui/http`. Authentication,
routing, cache transport, request reporting, and notifications remain explicit host adapters:

```ts
import { createHttpClient } from '@genix/ui/http';

const http = createHttpClient({
  makeRoute,
  getToken,
  transformResponse,
  notify,
  fetchCached,
  refreshRoutes,
});
```

The service-worker entrypoint and browser RPC client are exported from
`@genix/ui/service-worker`. Hosts compile
`service-worker/service-worker.ts` to their chosen public URL and inject application
reporting separately:

```ts
import { configureServiceWorkerRuntime } from '@genix/ui/service-worker';

configureServiceWorkerRuntime({
  getWorkerUrl: () => '/sw.js',
  getEnvironment: () => activeEnvironment,
  getCompanyID: () => activeCompanyID,
  makeRoute,
  verifyRouteMemoryState: () => false,
  reportFetch,
  reportProgress,
  notifyFailure,
});
```

Canvas and compact cell charts are exported from `@genix/ui/charts`. The removed
`Charts.svelte` billboard wrapper had no consumers and depended on an obsolete API, so it
is intentionally not part of the package.

The import-free `Renderer` and its `ElementAST` contract are exported from `@genix/ui`.
AST callbacks are supplied by the host, keeping actions and business behavior outside the
component.

All UI groups are available through source-first wildcard exports, for example
`@genix/ui/form/Input.svelte` and `@genix/ui/vTable/TableGrid.svelte`. Genix retains
`$components/*` as an alias directly to the package root.

The vendored Typed-IDB adapter is exported separately from `@genix/ui/typed-idb`. Its
upstream README and MIT license are retained beside the source.

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
@source "../packages/genix-ui/{buttons,cards,charts,editor,files,form,layers,menu,misc,navigation,popover2,runtime,vTable}/**/*.svelte";

@theme {
  --spacing: 1px;
}
```
