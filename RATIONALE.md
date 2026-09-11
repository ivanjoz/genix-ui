# RATIONALE — genix-ui

Design decisions for the shared UI package, newest first.

## `disableVirtualizer` turns off the desktop window only

**Context** — The prop has to neutralize four things: the attach effect, the `setCount`
bookkeeping, the spacer `<tr>`s and the per-row `use:virtualizer.observeRow` action — and a Svelte
action cannot be attached conditionally.

**Decision** — `use:observeRow` now goes through a local wrapper that returns nothing when the prop
is set, `visibleRowIndices` falls back to every index, and both spacers are wrapped in `{#if
!disableVirtualizer}`. The mobile card view is untouched: `MobileCardsVirtualList` keeps its own
virtualization.

**Rationale** — Wrapping the action is the only way to keep one `<tr>` template for both modes; the
alternative was a duplicated `{#if}` branch of the entire row markup. Mobile stays virtualized
because its list is a different component with its own measuring, and a consumer asking for "a
plain table" is talking about the table it can see. Cost: the prop's name promises slightly more
than it does on a phone, hence this entry.

## VTable's `onRowHover` action anchors to the last cell, not the row

**Context** — A row action that only shows on hover has to be positioned against the row's right
edge, but `position: absolute` inside a `<tr>` is not a reliable containing block: `position:
relative` on a table row is honoured unevenly, and the rows here are already driven by a
virtualizer that measures each `<tr>`.

**Decision** — `onRowHover` is a `Snippet<[record, rowIndex]>` rendered inside the **last** flat
column's `<td>`, which gets `position: relative` only when the prop is present. Visibility is pure
CSS (`.vtable-row:hover .vtable-row-hover-action`), so there is no mouseenter/mouseleave handler
and no per-row state. Mobile card view ignores the prop.

**Rationale** — A `<td>` is a dependable containing block and its right edge is the row's right
edge anyway, so the anchor costs nothing and avoids the `<tr>` quirk. The wrapper sits flush
(`right: 0`) and carries no inset or transition: spacing is a margin class on whatever the consumer
renders, and the reveal is instant. The cost: the action overlaps
the last column's content instead of reserving space for itself — consumers that need the value
readable under it give the action its own background — and a consumer whose remove affordance must
survive the mobile card view cannot use this prop.

## The client sends both watermarks and stops guessing which one the route speaks

**Context** — a route's watermark field was inferred from the records of its first response (`upv`
if they carried it, `upd` otherwise) and persisted on the route row. A route that inferred wrong —
because its first sync returned no records, or because the row predates its table's delta index —
sent a watermark its handler does not read. The handler saw none, answered with the whole table, the
cache merged it, and nothing reported an error: a 1.2 MB payload on every refresh, indefinitely.
`resetCacheRouteRow` did not clear the field either, so a `ver` bump carried the dead choice across.

**Decision** — Both watermarks travel on every sync, as one param per response key shaped
`"<upv>.<upd>"` (`up` for a bare-array route). `updatedStatus` holds an `{upv, upd}` pair per key,
both halves advancing independently. The detection, the persisted `watermarkFields` and
`WatermarkField` are gone; the backend reads its half through `req.GetUpVersion()` /
`req.GetUpdated()`. The cache schema goes to v6, which drops every route row on upgrade.

**Rationale** — The bug was never `upv` vs `upd`, it was that the *client* decided. Sending both
moves the decision to the only side that knows — the handler that writes the query — for ~15 bytes a
request. A one-way `upd → upv` upgrade would have healed the stuck rows too, but it keeps the
inference alive, and with it the rule that a timestamp-watermarked route must never ship `upv` in its
records: one added column in a `Select` and a storefront starts full-syncing. The schema bump is what
makes the switch safe — a v5 row holds a single number whose meaning lived in the field that no
longer exists, and read as a `upv` it would offer a timestamp as a write sequence, which the backend
answers with nothing at all. One full re-sync per browser is the price.

## FileDropZone stays out of the agent registry

**Context** — every clickable component in the package registers a handle (`Button`, `Checkbox`,
`OptionsStrip`), so the automation agent can drive it. A drop zone is clickable too, and the
obvious move was to register a `click` that opens the native file picker.

**Decision** — `FileDropZone` registers nothing, like the `FileUploadSelector` it sits next to.

**Rationale** — the agent cannot supply a `File`: it has no path into the page's filesystem, and the
native picker it would open is an OS dialog outside the tab. A registered handle would therefore be
a handle that always fails, and worse, it would leave the browser blocked on a modal dialog nothing
in the session can dismiss. The cost is that an agent reading the page sees the zone in the
screenshot and not in the registry — the documented signal for "this component forgot to register".
Whoever wires an upload flow that an agent must complete has to give it a different entry point (a
route that accepts base64), not a handle here.

## The page owns the routes it read, recorded at read time and not at construction

**Context** — the header refresh button had to force the *current page's* services to re-fetch from
the server on the next reload. Nothing knew which routes a page depends on: a page served entirely
from IndexedDB issues no request, so request telemetry sees nothing, and a `GetHandler` subclass
cannot register itself in its own constructor either — `route` is a subclass field, still `''` while
`super()` runs.

**Decision** — `http/page-services-registry.ts` keys a `Map` by `pathname`, and the entry is written
from `GetHandler.canFetch()` and from the cached branch of `GET()` — i.e. on every *read attempt*,
whichever layer answers it. `markPageServicesForRefresh()` (runtime) reads the current pathname's
set and sends action 24 per module. The registry is in-memory only: the durable part is the
`forceNetwork` flag the service worker writes to IndexedDB, which is what actually survives the
reload.

**Rationale** — recording at read time is what makes "no matter if it used the local cache or called
the server" work, and it self-corrects: a fresh load of a page re-runs its reads and re-registers
them under that page. The cost is a shared service instantiated on page A and then merely *read from
memory* on page B — B never calls `canFetch()` for it, so B's set misses it until a load that starts
on B. It also means a page must have been visited in this session before its refresh can mark
anything; a route the button never saw is silently not marked, which the console reports as a
0-match.

Action 24 grew an `exact` flag (`refreshRoutesByPrefix` → `markRoutesForRefresh`). POST keeps prefix
matching, where invalidating `products` is *meant* to drag `products-stock` along; the button asks
for exact matching so a page refresh does not force routes the page never read. Marking only sets
`forceNetwork`, so the forced request still carries the watermark and the server answers with the
delta — the button fixes "the cache decided nothing changed", it is not a full re-download.

`AppHeader.handleReload` wrote `localStorage['force_sync_cache_until']`, a key no code has ever
read; the button was a plain `location.reload()`. That write is gone.

## One header look for `VTable` and `TableGrid`, and defaults that yield to `headerCss`

**Context** — the two tables painted different headers: `VTable` a 36px-tall, bold-15px, centered
cell with its own bottom rule; `TableGrid` a content-height cell with `color: #495057`, a dead
`font-family: bold` and the bottom rule on the header *container*. `TableGrid` was told to adopt
`VTable`'s look, with `disableHeaderPadding` recovering the compact header it had.

**Decision** — the shared tokens (min-height 36px, `#f8f9fa` ground, `#e9ecef` right rule,
`rgb(204,204,204)` bottom rule per cell, `font-bold text-[15px]`) now live in both components with
the same values, and each emits them through one function — `headerBaseCss` / `getHeaderBaseClassName`.
Those functions **skip a default when the column's (or the table's) `headerCss` already declares that
utility family**: any `px-*`/`pl-*`/`pr-*` cancels the `px-6`, any `text-[…]`/`text-sm`-style class
cancels `text-[15px]`, any `text-left|center|right` (`justify-*` in `VTable`) cancels the alignment.
Header text now also follows an explicit `column.align` in `VTable`, which previously always centered.
`disableHeaderPadding` drops the side padding and the 36px floor in both.

**Rationale** — the guard exists because Tailwind decides between two classes of the same utility by
its own output order, not by the order they appear in the `class` attribute. Emitting `text-[15px]`
unconditionally would have silently beaten the `headerCss="text-[14px]"` that
`ProductSupplyManagement` passes, and `text-center` would have beaten a consumer's `text-left`. The
cost is a regex per header cell per render and two places to keep in sync — the alternative, a shared
stylesheet, is worse here: Svelte's scoped-CSS specificity beats a single Tailwind utility outright,
so consumers could no longer override anything with a class.

Size and weight moved out of the components' CSS into Tailwind classes, per the project rule against
`font-size`/`font-weight` in a CSS class.

## The security runtime reads two `Uint8Array` grant payloads, and caches on all three inputs

**Context** — `checkAcceso` held the backend's grants as a sorted `Uint16Array` and binary-searched
a `[requested nivel, nivel 4]` range inside one access's bucket. Sub-accesses changed the format
underneath it: the grant word is now big-endian, the container is raw bytes, and grants are split
across **two** payloads by whether the access carries a granted sub-access.

**Decision** — `decodeStoredAccesosComputed` returns `Uint8Array`; `base64ToUInt16` is replaced by
`base64ToBytes`. `accesos.ts` gains `findAccesoNivel` (binary search over the fixed 2-byte stride),
`findAccesoSubGrant` (linear walk of the variable-width payload with an early exit), `hasAcceso`,
`hasSubAcceso` and `validateAccesosBlobs`. The runtime holds both payloads, exposes
`checkSubAcceso(accesoID, subAccesoID)`, and `accesoResultCache` keys on
`accesoID * 1000 + subAccesoID * 10 + nivel`.

**Rationale** — The range trick worked because the level occupied the low two bits of the *whole
searched value*, so "any level ≥ N in this access's bucket" was a contiguous range. That does not
survive a payload where an entry may be 3 or 4 bytes and position is load-bearing, so the search
resolves the entry and then compares the unpacked level — which also reads better than a range whose
correctness depended on a bit layout.

The cache key is the part worth stating: keying on the access id alone — which a single-payload
reader could get away with — would let the first answer about an access stand in for every later
question about it, at another level or about a different sub-access. Three inputs, one cache, and it
is dropped whenever **either** stored payload changes, which is how a login in another tab is still
picked up.

`AccesosV2` is a storage-key bump rather than a rename because a stale value still decodes. A
single-entry little-endian blob read big-endian is a *valid* payload naming a different access, so
validation alone would not catch it: the user would simply be denied everything with no explanation.
Bumping the key discards it instead. The old `Accesos` key is left behind rather than cleaned up —
pre-alpha, and a removal list that names a key nothing writes is its own kind of confusion.

The recurring cost, named here because it is not visible from any one file: this is the **third
hand-written parser** of that byte format, alongside `backend/core/accesos-blob.go` (the only
encoder) and `fareward/src/limiter/access.rs`. All three are pinned by hand-written fixture tests,
because endianness and bit positions cannot fail loudly — read the wrong way round the bytes still
decode, into a different access or a different sub-access. A concrete near-miss from writing them:
sub-access 13 is bit 12, which lands at bit **5** of the second byte (`0x20`), not bit 6 (`0x40`).
Nothing about `0x40` looks wrong, and a reader making the same slip grants sub-access 14.

## A Modal's focus override is `data-autofocus`, resolved in its own query

**Context** — `Modal.focusDialogContent` read as if it preferred an explicit target:
`querySelector('[autofocus], input:not([disabled]), …')`. It does not. `querySelector` returns the
first match in **document order** across the whole selector list, so an earlier input always beat
the flag and the override had never worked. It surfaced on the Activos edit dialog, whose first
unlocked field is a `DateInput` — and `DateInput` opens its calendar on focus, covering the form
it belongs to.

**Decision** — Two queries: `[data-autofocus]` first, then the first enabled control, then any
focusable, then the dialog. `Input.svelte` gained a `focusOnOpen` prop that emits the marker
attribute.

**Rationale** — `data-autofocus` rather than the real `autofocus`: the HTML attribute fires on
mount, which is the wrong moment for a dialog, and svelte-check rejects it on a11y grounds. A
marker attribute says "this is the one Modal should pick" and nothing else, which is exactly the
contract. The prop is on `Input` alone for now — that is where the need is, and adding it to every
control before one asks for it would be speculative.

## `misc/Info.svelte` carries its palette inline, not in scoped CSS classes

**Context** — The hint lines under form fields were plain `text-sm c-gray` divs (a class that is
not defined anywhere, so they rendered as body text). They needed a note/callout look: light
background, colored left rule, in yellow or green.

**Decision** — One component with a `color` prop. The base geometry — the 3px left rule, padding,
radius, line-height — lives in the scoped `<style>` block; the three palette values
(background, rule, text) are applied with `style:` directives from a literal `infoPalettes` map.

**Rationale** — A `.info-{color}` class built by interpolation is the obvious alternative, but
Svelte's unused-CSS pass reasons about static selectors, and Tailwind's scanner about literal
strings; both are fragile under a dynamic class name. Inline custom properties can't be pruned by
either. Cost: the colors are not overridable from a stylesheet — a new variant means editing the
map, which is also what makes it grepable.
