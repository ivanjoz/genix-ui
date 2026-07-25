# @genix/ui

Reusable Svelte 5 UI components, data layer, and session runtime shared by Genix
applications.

**What the package owns:** form controls, virtualized tables, overlays, menus, charts,
the HTTP client, the delta/group/by-ID caches, the service-worker client, Excel
import/export, image conversion, and session/access control.

**What the host owns:** business data, backend routes, translations, notification
implementation, navigation, and the access catalog. The package never imports host
modules — every capability comes in through one `createUiRuntime` call.

- [Install](#install) · [Quick start](#quick-start-for-an-integrating-agent) ·
  [Runtime options](#runtime-options) · [Security](#security) ·
  [Data layer](#data-layer-http--caches) · [Component catalog](#component-catalog) ·
  [Conventions](#conventions--gotchas) · [Reference docs](#reference-docs)

---

## Install

The package is private and consumed as a Git submodule inside a Bun workspace.

```sh
# 1. Add the submodule wherever your workspace globs pick it up.
git submodule add git@github.com:ivanjoz/genix-ui.git frontend/packages/genix-ui
git submodule update --init --recursive
```

```jsonc
// 2. host package.json
{
  "workspaces": ["./packages/*"],
  "dependencies": { "@genix/ui": "workspace:*" }
}
```

```js
// 3. svelte.config.js — optional shorthand alias to the package root
kit: { alias: { $components: path.resolve('./packages/genix-ui') } }
```

```sh
bun install
```

Peer dependency: `svelte ^5.46.0`. The package ships **source, not a build** — exports
point at `.ts`/`.svelte` files, so the host's Vite/Svelte pipeline compiles them and
editor navigation opens the real implementation.

### Tailwind CSS v4 setup (required)

Components are styled with Tailwind utilities and Iconify icon classes. Without these
three pieces they render unstyled:

```css
@import 'tailwindcss';

/* Icon classes such as `icon-[fa--floppy-o]` used across the package. */
@plugin "@iconify/tailwind4" { prefix: "icon"; scale: 1; }

/* Tailwind must scan the package source for class names. */
@source "../packages/genix-ui/{buttons,cards,charts,editor,files,form,layers,menu,misc,navigation,runtime,vTable}/**/*.svelte";

@theme {
  /* One Tailwind spacing unit is ONE PIXEL. `h-4` is 4px, not 1rem. */
  --spacing: 1px;
}
```

Install `@iconify/tailwind4` plus the icon sets the components use (`@iconify-json/fa`
covers most; Genix also installs `mdi`, `emojione`, `flat-color-icons`).

---

## Quick start (for an integrating agent)

Six steps, in order. Steps 1–3 are mandatory for anything stateful.

### 1. Create one runtime file

Put every host parameter in a single module — this is the only configuration entry.

```ts
// libs/ui-runtime.svelte.ts
import { createUiRuntime } from '@genix/ui';
import { Env } from '$core/env';
import { Notify } from '$libs/helpers';
import type { IUser } from '$core/types/common';

const isPublicRoute = (route: string) => route === '/' || route === '/login';

export const ui = createUiRuntime<IUser>({
  applicationName: 'My application',
  defaultLanguage: 1,                       // 1 = Spanish, 2 = English
  translate: (value) => value,              // or your own "EN|ES" resolver
  makeRoute: (route) => `/api/${route}`,    // service route -> absolute URL
  makeCdnRoute: (...segments) => segments.join('/'),
  getCompanyID: () => activeCompanyID,      // tenant, scopes caches + storage
  getEnvironment: () => 'main',             // scopes caches per API endpoint
  getWorkerUrl: () => '/sw.js',
  getPathname: () => location.pathname,
  navigate: (target) => goto(target),
  notify: Notify,                           // { failure, success, warning?, info? }
  security: {
    storageNamespace: 'myapp',
    onLogout: () => goto('/login'),
    isPublicRoute,
    autoStartRefreshCheck: true,
  },
  // Optional telemetry hooks
  reportProgress: (bytes) => trackDownload(bytes),
  addProcess, updateProcess,                // long-running upload/process banners
});

export const security = ui.security;
export const { GET, GETWithGroupCache, POST, PUT, POST_XMLHR } = ui.http;
export const { fileToImage, bitmapToImage } = ui.imageConverter;
```

### 2. Provide the runtime at every mount root

39 of the 54 components call `useUI()` and **throw without a provider**.

```svelte
<!-- routes/+layout.svelte -->
<script lang="ts">
  import { provideUi } from '@genix/ui';
  import { ui } from '$libs/ui-runtime.svelte';

  const uiRuntime = provideUi(ui);
  uiRuntime.state.deviceType = window.innerWidth < 750 ? 2 : 1;
</script>
```

`UiProvider` is the component form of the same thing, for when a wrapper is easier:

```svelte
<UiProvider runtime={ui}>{@render children()}</UiProvider>
```

An app with several independent mount trees (admin + public storefront, an embedded
builder canvas) calls `provideUi` in each one. SSR apps must create the runtime at the
request/app boundary — it holds mutable Svelte state.

### 3. Mount the mobile overlay singletons once

`DateInput` and `SearchSelect` delegate to full-screen pickers on mobile by writing to
`ui.state.mobileDateLayer` / `ui.state.mobileSearchLayer`. Those two components take **no
props** and must exist once in the tree, or mobile pickers silently never open.

```svelte
<TopLayerSelector />
<TopLayerDatePicker />
```

### 4. Wire the data layer

```ts
// One zero-argument base class keeps services free of runtime plumbing.
import { GetHandler as ReusableGetHandler } from '@genix/ui/http';
import { ui } from './ui-runtime.svelte';

export class GetHandler<T extends { ID: number; ss?: number }> extends ReusableGetHandler<T> {
  constructor() { super(ui.getHandlerRuntime); }
}
```

### 5. Register the session refresher and access catalog

```ts
security.setSessionRefresher(reloadLogin);                  // from the login service
security.setRouteAccessResolver(getAccessEntriesForRoute);  // from the authenticated app
```

### 6. Verify

```sh
bun run check   # inside the package: svelte-check must stay at 0 errors
bun test        # pure-logic tests (accesos packing, caches, utilities)
```

Smoke test in the host: an `Input` renders styled, an icon appears (Tailwind + Iconify
wired), a `GET` carries the `Authorization` header (runtime + security wired), and a
mobile-width `DateInput` opens the full-screen picker (singletons mounted).

---

## Runtime options

`createUiRuntime<UserInfoType>(options)` returns one flat runtime. Required options are
marked; everything else has a working default.

| Option | Req. | Purpose |
| --- | --- | --- |
| `makeRoute` | ✅ | Turns a service route into a request URL. Every fetch goes through it. |
| `getCompanyID` | ✅ | Tenant id. Scopes IndexedDB caches and field persistence. |
| `getEnvironment` | ✅ | Environment key (per API endpoint). Also scopes caches. |
| `getWorkerUrl` | ✅ | Service-worker script URL. |
| `navigate` | ✅ | Router navigation, used by cache invalidation and logout. |
| `security` | — | Session policy block, see [Security](#security). |
| `applicationName` | — | Shown in Excel metadata and process labels. |
| `defaultLanguage` | — | `1` Spanish (default), `2` English. |
| `translate` | — | Resolver for `"EN\|ES"` strings; defaults to the built-in splitter. |
| `notify` | — | `{ failure, success, warning?, info? }`; defaults to `console.error`. |
| `makeCdnRoute` | — | Builds image/asset URLs; defaults to joining segments with `/`. |
| `getPathname` | — | Current path; defaults to `location.pathname`. |
| `getToken` | — | Override only if tokens live outside the security runtime. |
| `canAccessRoute` | — | Cached-service guard; defaults to `security.canAccessRoute(getPathname())`. |
| `onUnauthorized` | — | 401 handler; defaults to `security.clearSession()`. |
| `startRequest` / `finishRequest` / `reportFetch` / `reportProgress` | — | Request telemetry hooks. |
| `addProcess` / `updateProcess` | — | Progress banners for uploads and long tasks. |
| `verifyRouteMemoryState` | — | Enables expensive route-cache verification (off by default). |
| `storageNamespace` | — | Prefix for persisted field values, and for the session keys when `security.storageNamespace` is omitted. |
| `nextComponentId` | — | Override the component id counter. |

What the returned runtime exposes:

| Member | Use |
| --- | --- |
| `ui.http` | `GET`, `GETWithGroupCache`, `POST`, `PUT`, `POST_XMLHR`, `buildHeaders` |
| `ui.getHandlerRuntime` | Pass to `GetHandler`'s constructor |
| `ui.security` | Session + access control (`SecurityRuntime`) |
| `ui.state` | Reactive UI state: `deviceType`, `mobileMenuOpen`, `pageTitle`, `pageOptions`, `sideLayerId`, `popoverId`, `openModalIds`, mobile layer slots |
| `ui.images` | Reactive in-memory image queue: `get()`, `getBase64()`, `isInFlight()` — normalizes CDN folders and `-xN` suffixes |
| `ui.imageConverter` | `fileToImage`, `bitmapToImage`; lazily creates and pools the package's image worker |
| `ui.fieldPersistence` | Component values stored by environment + company + component id |
| `ui.uploads` | Upload adapter (`get`, `post`, `convertImage`, `addProcess`, `updateProcess`) used by `ImageUploader` |
| `ui.translate` | `"EN\|ES"` resolution |
| `ui.notify` | Normalized notification adapter |
| `ui.openModal` / `closeModal` / `closeAllModals` / `openSideLayer` | Overlay control |
| `ui.resolveRecord(apiRoute, id)` | Lazy by-ID record lookup (used by `RecordByIDText`) |

---

## Security

Session handling is part of the runtime: `createUiRuntime` builds the security instance
from the `security` options block and exposes it as `ui.security`. HTTP authorization
(`getToken`), the cached-service route guard (`canAccessRoute`), and `onUnauthorized`
default to that instance, so a host overrides them only for special cases.

```ts
export const ui = createUiRuntime<IUser>({
  /* …transport options… */
  security: {
    storageNamespace: 'myapp',
    onLogout: () => navigate('/login'),
    messages: { sessionExpired, sessionExpiresIn },   // optional, English defaults
    isPublicRoute,
    resolveRouteAccessEntries: getAccessEntriesForRoute,
    autoStartRefreshCheck: true,
    tokenRefreshThresholdSeconds: 40 * 60,           // defaults shown
    tokenCheckIntervalSeconds: 4 * 60,
    refreshLockSeconds: 30,
  },
});
```

| `ui.security` member | Purpose |
| --- | --- |
| `getToken(silent?)` | Current token; notifies and clears the session when expired unless `silent` |
| `checkIsLogin()` | `0` server-side, `2` logged in, `3` client without a valid token |
| `isLogged()` / `isTokenValid()` | Tenant + token, and additionally a decoded access payload |
| `getUserInfo()` / `setUserInfo()` | Typed session user (`UserInfoType`, may be `null`) |
| `parseLogin(login, cipherKey)` | Stores a login response and starts the refresh checker |
| `checkAcceso(id, nivel?)` | Access check against the bit-packed payload |
| `canAccessRoute(route)` | Route-level check through the registered catalog |
| `clearSession()` | Clears every persisted key, stops timers, calls `onLogout` |
| `setSessionRefresher(fn)` | Registered by the login service (avoids a circular import) |
| `setRouteAccessResolver(fn)` | Registered by the authenticated app (see below) |
| `startRefreshCheck()` / `stopRefreshCheck()` / `initRefreshCheck()` | Manual timer control |

**Keeping an access catalog out of a public bundle.** When one runtime file is shared by
an authenticated app and a public bundle, do not pass `resolveRouteAccessEntries` — a
static import would put the catalog in both bundles. Register it from the authenticated
app instead:

```ts
// routes/+layout.svelte (authenticated app only)
security.setRouteAccessResolver(getAccessEntriesForRoute);
```

`createSecurity` from `@genix/ui/security` is also exported for projects that want the
session runtime without the UI runtime. See `security/SECURITY.md` for persisted keys,
the access-packing contract, and refresh timings.

---

## Data layer (HTTP + caches)

### One-off requests

```ts
import { GET, POST } from '$libs/http.svelte';

const rows = await GET({ route: 'products?category-id=3' });
await POST({ data: record, route: 'products', refreshRoutes: ['products'] });
```

`refreshRoutes` invalidates the matching cached services after a write.

### Cached services (`GetHandler`)

Delta-synced master data: the handler stores records in IndexedDB and asks the backend
only for rows changed since the last watermark.

```ts
export class ProductsService extends GetHandler<IProduct> {
  route = 'products';
  useCache = { min: 5, ver: 6 };   // min: re-sync after N minutes; ver: bump to invalidate

  handler(response: { products: IProduct[] }) {
    // Optional post-processing once records arrive.
  }
}

const productsService = new ProductsService();
// productsService.records / .recordsMap are $state and drive components directly.
```

Useful fields: `route`, `routeByID`, `keyID` / `keysIDs` (when the id field is not `ID`),
`useCache`, `conversion`, `routePost`, `refreshRoutes`, `records`, `recordsMap`,
`nameToRecordMap`, `isReady`, `prependOnSave`.

Behaviour worth knowing:
- Fetched records need an `upd` (updated) and `ID` field, or a configured `keyID`.
- `ss === 0` is treated as a tombstone when `inferRemoveFromStatus` is enabled.
- `post()` logs failures and returns `[]` by default; set `returnEmptyOnPostFailure = false`
  when callers must receive the rejection.
- The class uses runes, so it only works in a Svelte-aware build.

Three cache engines live in `@genix/ui/cache`: the delta cache (watermark sync), the group
cache (`GETWithGroupCache`, response-level), and cache-by-IDs (resolve specific ids through
memory → IndexedDB → server). Each has its own document: `cache/DELTA_CACHE.md`,
`cache/GET_CACHED_PLAN.md`, `cache/CACHE_BY_IDS.md`.

### Service worker

```ts
import { doInitServiceWorker, sendServiceMessage } from '@genix/ui/service-worker';

await doInitServiceWorker();      // registers the worker configured via getWorkerUrl
await sendServiceMessage(26, {}); // e.g. clear the worker-side delta cache
```

---

## Component catalog

54 components. Import any of them through the wildcard export
(`@genix/ui/form/Input.svelte`), or through `$components/*` if the alias is configured.
Only `Renderer`, the menus, the editor, and the charts are re-exported from the package
root. **(ui)** marks components that require `provideUi`.

### `form/` — value editors

Most controls use the **`saveOn` + `save` pattern**: pass the object and the key, and the
component writes straight into it (bindable, no event plumbing).

```svelte
<Input saveOn={form} save="Name" label="Name|Nombre" css="col-span-12" required />
<Input saveOn={form} save="Price" type="number" baseDecimals={2} />
<SearchSelect saveOn={form} save="CategoryID" options={categories}
  keyId="ID" keyName="Name" label="Category|Categoría" />
<DateInput saveOn={form} save="Date" type="unix" label="Date|Fecha" usePopover />
<Checkbox saveOn={form} save="IsActive" label="Active|Activo" useNumber />
```

| Component | Purpose | Key props |
| --- | --- | --- |
| `Input` **(ui)** | Text/number/password/textarea field with validation | `saveOn`, `save`, `label`, `type`, `required`, `validator`, `baseDecimals`, `transform`, `useTextArea`, `rows`, `postValue`, `dependencyValue`, `disabled`, `onChange` |
| `SearchSelect` **(ui)** | Searchable single-select over a record list; mobile opens `TopLayerSelector` | `options`, `keyId`, `keyName`, `saveOn`, `save`, `selected`, `onChange`, `max`, `avoidIDs`, `optionRenderer`, `getSearchText`, `clearOnSelect`, `noStyle`, `icon`, `useCache` |
| `Checkbox` **(ui)** | Single boolean | `saveOn`, `save`, `label`, `useNumber` (store `0\|1`) |
| `CheckboxOptions` **(ui)** | Single/multi option set, optionally rendered as buttons | `options`, `keyId`, `keyName`, `type: 'single'\|'multiple'`, `useButtons`, `onChange` |
| `DateInput` **(ui)** | Calendar input over Unix day / SUnix values | `saveOn`, `save`, `type: 'unix'\|'sunix'`, `usePopover`, `useInlineStyle`, `required`, `onChange` |
| `FilterInput` **(ui)** | Throttled search box | `value` (bindable), `throttle`, `icon`, `placeholder` |
| `ColorPicker` **(ui)** | Color value picker | `saveOn`, `save`, `label`, `onChange` |
| `LabelText` | Read-only label + value pair | `label`, `text`, `css`, `contentCss` |
| `LoginForm` | Skeleton user/password layout (no submit logic — wire your own) | `css`, `isMobile` |

### `vTable/` — tables and record lists

All table components share `ITableColumn<T>` from `@genix/ui/vTable`, which covers value
extraction (`getValue`, `render`, `renderHTML`, `renderPrefix`), layout (`width`, `align`,
`hidden`, `subcols`, `splitString`, `useLineClamp`), mobile cards (`cardColumn`,
`cardCss`, `cardRender`), and inline editing (`cellInputType`, `cellOptions`, `onCellEdit`,
`onCellSelect`, `onCellClick`, `onBeforeCellChange`, `disableCellInteractions`).

```svelte
<script lang="ts">
  import TableGrid from '@genix/ui/vTable/TableGrid.svelte';
  import type { ITableColumn } from '@genix/ui/vTable';

  const columns: ITableColumn<IProduct>[] = [
    { id: 'name', header: 'Name|Nombre', width: 'minmax(0, 1fr)',
      getValue: (product) => product.Name, cardColumn: [1] },
    { id: 'price', header: 'Price|Precio', width: '90px', align: 'right',
      getValue: (product) => formatN(product.Price, 2) },
  ];
</script>

<TableGrid {columns} data={productsService.records} height="460px" rowHeight={36}
  getRowId={(product) => product.ID} onRowClick={openProduct} />
```

| Component | Purpose | Key props |
| --- | --- | --- |
| `TableGrid` **(ui)** | CSS-grid virtualized table, desktop rows + mobile cards. The default table. | `columns`, `data`, `height`, `rowHeight`, `getRowHeight`, `getRowId`, `selectedRowId`, `onRowClick`, `cellRenderer`, `headerRenderer`, `rowRenderer`, `mobileBreakpointPx`, `emptyMessage` |
| `VTable` **(ui)** | `<table>`-based virtualized table with built-in filtering | `columns`, `data`, `maxHeight`, `filterText`, `getFilterContent`, `useFilterCache`, `selected`, `isSelected`, `cellRenderer`, `estimateSize`, `overscan` |
| `TableStream` **(ui)** | Fixed-window table for streaming/live rows | `columns`, `data`, `maxRecords`, `maxHeight`, `onRowClick` |
| `TableTree` **(ui)** | Two-level parent/child table | `columns`, `data`, `selectedId`, `selectedChildId`, `getChildId`, `onNodeClick`, `onChildClick` |
| `CardsList` **(ui)** | Virtualized card list with filtering and row delete | `cells`, `data`, `height`, `estimateSize`, `nonVirtual`, `filterText`, `buttonDeleteHandler`, `buttonDeleteIf` |
| `MobileCardsVirtualList` **(ui)** | Mobile card virtualizer used by the tables | `data`, `filterText`, `resolveRecord`, `cardCellRenderer`, `tableCellRenderer`, `gridCellRenderer` |
| `CellInput` | In-cell editable value | `saveOn`, `save`, `type`, `render`, `getValue`, `onBeforeCellChange`, `onChange` |
| `CellSelect` **(ui)** | In-cell option select | `options`, `keyId`, `keyName`, `saveOn`, `save`, `render`, `onChange` |

### `layers/` — overlays

```svelte
<!-- Side panel with save/delete actions and tabbed sections -->
<Layer type="side" id={12} title="Product|Producto" onSave={save} onDelete={remove}
  options={[[1, 'General'], [2, 'Stock']]} selected={tab}>
  {#snippet children()}…{/snippet}
</Layer>

<!-- Modal opened through the runtime -->
<Modal id={MODAL_ID} title="Import|Importar" onSave={confirm} size={2} />
<button onclick={() => ui.openModal(MODAL_ID)}>Open</button>
```

| Component | Purpose | Key props |
| --- | --- | --- |
| `Layer` **(ui)** | Side / bottom / content panel with title, tabs, save-delete-close actions | `type: 'side'\|'bottom'\|'content'`, `id`, `title`, `options`, `selected`, `onSave`, `onDelete`, `onClose`, `actions`, `sideLayerSize`, `contentOverflow` |
| `LayerStatic` **(ui)** | Always-present side panel (no open/close animation) | `show`, `css`, `mobileLayerTitle`, `useMobileLayerVertical` |
| `Modal` **(ui)** | Centered dialog, optionally with file import + error list | `id`, `title`, `size`, `isEdit`, `onSave`, `onDelete`, `onClose`, `useFileImportWithErrors`, `onFileChange`, `fileErrors` |
| `MobileLayerVertical` **(ui)** | Collapsible bottom sheet | `title`, `show`, `closedHeightPx`, `onToggle` |
| `TopLayerSelector` **(ui)** | Mount-once full-screen search picker for `SearchSelect` on mobile | none — driven by `ui.state.mobileSearchLayer` |
| `TopLayerDatePicker` **(ui)** | Mount-once full-screen calendar for `DateInput` on mobile | none — driven by `ui.state.mobileDateLayer` |

### `buttons/`

| Component | Purpose | Key props |
| --- | --- | --- |
| `Button` **(ui)** | Icon/text button with color variants. `icon` renders before the label, `iconRight` after; both get a 7px gap only when `name` is set, so icon-only buttons keep their exact geometry | `icon`, `iconRight`, `name`, `label`, `color`, `onClick`, `useCircle`, `hideNameOnMobile`, `disabled` |
| `ButtonLayer` **(ui)** | Button that toggles an anchored panel (filters, pickers) | `isOpen` (bindable), `buttonText`, `icon`, `iconOnShow`, `horizontalOffset`, `edgeMargin`, `onOpen`, `onClose`, `children`, `button` |
| `ButtonList` | Button that opens a list of actions | `items: { id, name, icon, handler }[]`, `name`, `icon` |
| `InlineButton` **(ui)** | Compact inline toggle/tag | `label`, `mode: 'default'\|'checked'`, `color` |

### `cards/`

| Component | Purpose | Key props |
| --- | --- | --- |
| `Card` **(ui)** | Clickable content surface | `id`, `label`, `onClick`, `children` |
| `SearchCard` **(ui)** | Multi-select search that renders picks as cards | `options`, `keyId`, `keyName`, `saveOn`, `save`, `onChange`, `cardCss` |
| `SearchDualCard` **(ui)** | Two linked searches producing paired selections | `leftOptions`/`rightOptions` + their `keyId`/`keyName`, `saveLeft`, `saveRight`, `selectedItem` snippet |

### `navigation/`

| Component | Purpose | Key props |
| --- | --- | --- |
| `OptionsStrip` **(ui)** | Tab/section strip; the standard sub-view switcher | `options`, `keyId`, `keyName`, `selected`, `onSelect`, `useMobileGrid`, `activeClass`, `inactiveClass` |
| `ArrowSteps` **(ui)** | Chevron step/stage picker | `options`, `selected`, `onSelect`, `optionRender`, `columnsTemplate` |

### `menu/` — fully host-driven

Neither menu imports routing, security, or services; all policy arrives as props.

```svelte
<SideMenu model={menuGroups} activePath={page.url.pathname} bind:open
  canAccess={(item) => security.canAccessRoute(item.route)}
  translate={ui.translate} onNavigate={(route) => goto(route)}
  desktopLogoSrc={logo} desktopBrandName="My app" />
```

| Component | Purpose | Key props |
| --- | --- | --- |
| `SideMenu` | Grouped sidebar with access filtering and branding | `model: MenuGroup[]`, `activePath`, `open` (bindable), `canAccess`, `translate`, `onNavigate`, `useTopMinimalMenu`, `desktopLogoSrc`, `mobileLogoSrc`, `desktopBrandName`, `mobileBrandName` |
| `MobileMenu` | Full-screen mobile item list | `items: MobileMenuItem[]`, `open` (bindable), `onSelect`, `closeLabel` |

### `files/` — images and uploads

| Component | Purpose | Key props |
| --- | --- | --- |
| `Image` **(ui)** | CDN image with resolution suffixes and in-flight/queued state | `src`, `folder`, `size: 1..9`, `types`, `alt`, `onRemove` |
| `Imagehash` | Image with a thumbhash placeholder | `src`, `hash`, `size`, `folder`, `alt` |
| `ImageUploader` **(ui)** | Convert (AVIF/WebP), queue, and upload images | `src`, `saveAPI`, `refreshRoutes`, `convertResolutions`, `useConvertAvif`, `folder`, `onChange`, `onUploaded`, `setDataToSend`, `hideForm`, `processName` |
| `FileUploadSelector` **(ui)** | File picker with extension filtering | `selectedFile` (bindable), `accept`, `extensions`, `buttonLabel`, `onChange` |

### `charts/`

| Component | Purpose | Key props |
| --- | --- | --- |
| `ChartCanvas` | Canvas time series with cached rendering | `data`, `dateLabels`, `dateLabelFormatter`, `dateLabelEvery`, `height`, `fixedPointWidthPx`, `useHtmlRendered` |
| `CellSimpleChart` | Table-cell bar sparkline | `values`, `labels`, `barWidth`, `barGap`, `barColor`, `barColors`, `colorScale` |
| `CellHorizontalBars` | Table-cell total/pending horizontal bars | `values: [total, pending][]`, `maxValue`, `logScaleFactor`, `totalBarColor`, `pendingBarColor` |

### `misc/` — primitives

| Component | Purpose | Key props |
| --- | --- | --- |
| `T` **(ui)** | Renders an `"EN\|ES"` string through `ui.translate` | `text`, `css` |
| `Popover` | Portal-to-body anchored overlay that escapes clipped ancestors | `referenceElement`, `open`, `placement`, `offset`, `fitViewport`, `onPositionUpdate` |
| `Portal` | Renders children into `document.body` (or a target) | `target`, `zIndex`, `children` |
| `Renderer` | Renders an `ElementAST` tree (`{ tagName, css, text, onClick, children }`) with no imports | `elements` |
| `Virtualizer` **(ui)** | Generic vertical virtual list | `items`, `height`, `estimatedItemHeight`, `bufferSize`, `emptyMessage`, `children` snippet |
| `VirtualCards` **(ui)** | Responsive virtualized card grid | `items`, `maxColumns`, `estimatedRowHeight`, `rowGapPx`, `columnGapPx`, `mobileBreakpointPx` |
| `KeyValueStrip` **(ui)** | Compact strip of up to 10 label/value pairs | `label1..label10`, `value1..value10`, `getContent1..10` |
| `HighlightText` | Highlights matched words inside a string | `text`, `words` |
| `RecordByIDText` **(ui)** | Resolves and shows a record name from an id | `apiRoute`, `recordID`, `placeholder` |
| `SquareBarSized` **(ui)** | Proportional square/bar KPI tile | `label`, `value`, `size`, `background`, `backgroundColor`, `sublabel` |
| `LoadingBar` **(ui)** | Indeterminate progress bar | `css`, `label` |

### `editor/`

| Component | Purpose | Key props |
| --- | --- | --- |
| `HTMLEditor` | RoosterJS rich-text editor bound with `saveOn`/`save` | `saveOn`, `save`, `css` |

### `runtime/`

| Component | Purpose | Key props |
| --- | --- | --- |
| `UiProvider` | Component form of `provideUi` | `runtime`, `children` |

---

## Excel

The package owns the WASM binary and initializes it lazily on first use;
`createUiRuntime` supplies application name and translation once.

```ts
import { ExcelBuilder } from '@genix/ui/excel';

// Export
await new ExcelBuilder<IProduct>()
  .setColumns(columns)
  .setRecords(products)
  .setExportSheet('Products', 'Product catalog')
  .download('products.xlsx');

// Import: parse first, then validate row by row
const result = await new ExcelBuilder<IProduct>()
  .setColumns(columns)
  .loadFile(file);
const { rows, rowsWithoutErrors, errors } = result.extractRecords((record) => {
  if (!record.Name) { return ['Name is required']; }
});
```

`downloadExcel` / `buildExcelBuffer` / `parseExcelFile` are also exported directly. Full
contract — header mapping, number parsing, error formatting, result shape — is in
`excel/EXCEL_BUILDER.md`.

---

## Conventions & gotchas

Ordered by how often they bite an integrator.

1. **`provideUi` is mandatory.** 39 of 54 components call `useUI()` and throw without a
   provider. Provide it in every mount root, including secondary trees.
2. **Mount `TopLayerSelector` and `TopLayerDatePicker` once**, or mobile `SearchSelect`
   and `DateInput` appear to do nothing.
3. **`--spacing: 1px`.** Package classes assume one spacing unit is one pixel: `h-32` is
   32px, `p-12` is 12px. A host with default Tailwind spacing renders everything huge.
4. **Bilingual strings are `"English|Spanish"`.** `translate` splits on `|` and picks by
   language (`1` Spanish → second part, `2` English → first part). Labels, headers, and
   empty messages all accept this format; wrap free text in `<T text="Save|Guardar" />`.
5. **`saveOn` + `save` instead of `bind:value`.** Controls write into the object you pass.
   Keep that object in `$state` and read the same fields back for reactivity.
6. **Svelte 5 runes only.** The package uses `$state`/`$derived`/`$props`, so it must be
   compiled by a Svelte 5 pipeline; `GetHandler` also relies on runes.
7. **SSR:** the runtime holds mutable state — create it per request/app boundary, never as
   a shared module-level singleton across requests. Storage access is SSR-guarded, so
   `getToken()` returns `''` and `checkIsLogin()` returns `0` on the server.
8. **The package never imports host code.** No `services`, `domain-components`, host
   security, or route modules. New capabilities arrive as runtime options or props — this
   is what keeps the package reusable.
9. **Icons come from Iconify classes** (`icon-[fa--floppy-o]`). Missing icon sets render
   as empty boxes.
10. **Caches are scoped by company + environment.** Wrong `getCompanyID`/`getEnvironment`
    values silently mix tenants' cached data.
11. **Tailwind must scan the package source**, otherwise classes used only inside the
    package are stripped from the CSS build.

### Agentic components

Interactive components register themselves with the agent registry (`agent/registry.ts`)
so an automation agent can list and drive them by id, with a stable DOM contract and a
shared method vocabulary. Registration is opt-in per component and no-ops when the agent
is disabled. See `docs/AGENTIC_COMPONENTS.md` for the method vocabulary, the DOM contract,
and how to make a new component agent-visible.

---

## Structure

The source is intentionally flat — no `src/` or `lib/` wrapper:

```text
genix-ui/
  package.json
  index.ts            # root re-exports: runtime, menu, editor, charts, utilities,
                      # cache, service-worker, security, Renderer, image helpers
  agent/              # agent registry (automation contract)
  assets/             # raw SVG assets
  buttons/ cards/ charts/ editor/ files/ form/ layers/ menu/ misc/ navigation/ vTable/
  cache/              # delta cache, group cache, cache-by-IDs
  excel/              # import/export + WASM asset
  http/               # HTTP client + GetHandler
  runtime/            # createUiRuntime, context, field persistence
  security/           # session + access control
  service-worker/     # worker script and client
  utilities/          # pure helpers (no runtime, no Svelte)
  workers/            # image worker
```

`@genix/ui/utilities` is dependency-free: encoding/parsers (`checksum`,
`base64ToUInt16`, `concatenateInts`), dates (`dateToFechaUnix`, `getFechaUnix`,
`DateHelper`, `semanaFromCode`), object mapping (`simplifyObject`, `recreateObject`,
`unmarshall`), strings (`normalizeStringN`, `highlString`), `throttle`, and `decrypt`
(AES-GCM). Safe to use anywhere, including outside Svelte.

Subpath exports: `@genix/ui`, `/runtime`, `/http`, `/cache`, `/security`,
`/service-worker`, `/excel`, `/charts`, `/menu`, `/editor`, `/utilities`, `/workers/*`,
plus a wildcard for any file (`@genix/ui/form/Input.svelte`).

---

## Development

```sh
bun run check   # svelte-check across the package source
bun test        # bun:test unit tests for pure logic
```

Keep `bun run check` at zero errors — the host relies on the package's types.

`svelte-package --input .` is deliberately not used: it recursively scans package
metadata, dependencies, and generated directories. A future registry build should
introduce a dedicated staging/source directory instead.

## Reference docs

| Document | Covers |
| --- | --- |
| `docs/COMPONENTS_LAYOUT.md` | Folder taxonomy and rules for adding a component |
| `docs/AGENTIC_COMPONENTS.md` | Agent registry, DOM contract, method vocabulary |
| `security/SECURITY.md` | Persisted keys, access packing, refresh timings |
| `cache/DELTA_CACHE.md` | Watermark-based delta sync |
| `cache/GET_CACHED_PLAN.md` | Group cache / `GETWithGroupCache` |
| `cache/CACHE_BY_IDS.md` | By-ID resolution across memory → IndexedDB → server |
| `excel/EXCEL_BUILDER.md` | Excel column config, mapping, parsing, error contract |
