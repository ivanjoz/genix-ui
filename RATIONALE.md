# RATIONALE — genix-ui

Design decisions for the shared UI package, newest first.

## Caches sync on one millisecond `upd`: a fingerprinted overlap window, slot `upd` by ID

**Context** — The backend dropped `upv`, the per-partition write sequence that cost a DynamoDB call
before every write. Its only managed stamp is now `upd`: milliseconds since `[dynamo].unix_time_start`,
taken from the Lambda's clock. A clock is not a sequence: two Lambdas can stamp the same millisecond,
and a write stamped just before a client synced can land after it, so a bare `> upd` delta would lose
it for good. The by-IDs cache compared `upv` slot versions sent as `cc-ver` (uint16) and had the same
problem.

**Decision** — The delta cache keeps per response key an `IDeltaWatermark`: `upd`, the highest
received, and `window`, the `upd` of every record received in `[upd − 4000, upd]` (deleted ones
included). It sends `<upd>.<fingerprint of window>`; the backend returns every record past `upd` and
resends the window only when its own fingerprint of it differs. A multi-key route sends the lowest
key's watermark as `up`. The IndexedDB delta cache goes to v7, dropping every route. The by-IDs cache
sends `cc-upd` (6-byte values, `concatenateUint48s`) aligned with `cc-ids`; the backend answers each
record with its slot's last `upd`, or 0 while that value is younger than 4 seconds. Its IndexedDB
version is unchanged.

**Rationale** — The overlap catches a late or same-millisecond write; the fingerprint keeps a quiet
sync from resending it, so a poll with nothing new still returns nothing. The cost: a window map per
key on the route row, a window resent once after a first sync that filtered out
soft-deleted rows inside it, the non-lowest keys of a multi-key route resent every sync, and a write
landing more than 4 s after its stamp still missed. The by-IDs rows need no migration: an old value
never equals a slot `upd`, so each costs one refetch and heals.

## Color tokens: one palette, dark mode as one class

**Context** — Dark mode needed a single CSS toggle, but the components held about 400 distinct
color literals and 170 Tailwind palette classes, plus a few scattered `prefers-color-scheme` and
`:global(.dark)` overrides.

**Decision** — `tailwind.css` declares every color as a token on `body`: neutrals (`surface*`,
`line*`, `fg*`, `on-solid`, `overlay`), the brand (`primary`, `secondary`, `label`) and ten
families (`accent` + nine hues) of five steps each (`-bg`, `-bg-strong`, `-border`, `-solid`,
`-fg`). `body.dark` redeclares them, so the toggle is the existing `body.dark` class. Dark tints and
borders are `color-mix` of the family's solid over the dark surface, so each family declares two dark
values. `@theme inline` exposes every token as a Tailwind color (`bg-surface`, `text-red-fg`).
Components map each literal by role to a token; the old one-off variables (`--white`,
`--gray-purple-2`, `--light-blue-1`, `--color-11`) are gone. Black-alpha shadows, white highlights on
solid fills, mask stops, the always-dark desktop menu and the editor's text-color presets stay
literal.

**Rationale** — Semantic roles (surface, line, fg) rather than a mirrored numeric scale: a role knows
which way it moves in dark mode, and a flipped `gray-100` would read as a lie. Families follow
Tailwind's 50/100/300/600/700 steps, so ~400 near-duplicate shades collapse into ~70 tokens. Cost:
light mode shifts slightly where a one-off shade snapped to its nearest token, and the host's own
pages still use Tailwind palette classes that do not follow the toggle.

## Gantt: own date math, today always in range, display-only labels

**Context** — The projects module needed a Gantt (stories and sprints over time). Open: a
third-party chart or an own component, how to number the timeline, where it opens, and who
translates the labels.

**Decision** — `gantt/Gantt.svelte` over pure functions in `gantt/gantt.ts`, reusing the calendar's
integer day math (Unix days, ISO weeks). Two zooms: `week` (28px a day, day ticks) and `month` (6px
a day, ISO-week ticks). The range is the bars and markers plus today, with a 3-day margin snapped to
whole weeks or months, and it opens scrolled to center today (again only when the range or zoom
change). Rows are a tree through `parentId`, collapsible. Labels are shown as given and bars become
buttons only with `onBarClick`. No Agent registration: it is a read-only view.

**Rationale** — The libraries checked bring their own date handling and styling, and the need is a
few hundred lines. Translating labels would be the calendar's mistake to avoid: the host owns its
data, so it passes translated text. Cost: no drag to reschedule, no dependency arrows, and a range
of several years in `week` zoom is a very wide element.

## Calendar: activities over several days (`endDate`)

**Context** — Sprints span two weeks; the calendar only placed an activity on one day.

**Decision** — `CalendarActivity.endDate` (optional, inclusive). The month view draws one bar per
week row across the covered days, packed in lanes by `layoutWeekBars`, with square ends where it
continues into another week. The week view repeats the activity on each day.

**Rationale** — A bar reads as a span at a glance in the month grid; in the week grid days are rows,
so a cross-row bar would fight the layout. Cost: bars take a lane above the single-day cards of
those days.

## ChatThread: virtualized in place, with in-flow spacers

**Context** — The user wanted a long chat not to keep every message in the DOM (RAM, heavy
scroll). Open: paging from the server or virtualizing the DOM, and whether to reuse
`misc/Virtualizer.svelte`.

**Decision** — `ChatThread` renders only the items within 900px of the view; the rest are two
spacer divs sized from heights measured per item id (120px until measured). While stuck to the
bottom the window is computed from the end, so a long thread opens on its last messages. Each
item is measured when it mounts and again by a ResizeObserver; a change in an item wholly above
the view shifts `scrollTop` by the same delta (native `overflow-anchor` is off so it isn't
doubled). The 8px gap moved into each item's wrapper so it is part of the measure.

**Rationale** — The messages are already in memory: the weight was the DOM, so no server API
change. `Virtualizer` positions items absolutely and resets on a new array reference; the chat
mutates its array in place while streaming and needs `align-self` for user bubbles, which in-flow
spacers keep. Cost: a message remounts (and re-parses its Markdown) when scrolled back into view,
and the programmatic scroll is no longer smooth.

## Calendar: own integer date math, ISO weeks, display-only

**Context** — The user asked for a month/week calendar over 4-digit codes (YYMM, YYWW) and Unix
days. Open: which week numbering, whether to reuse `utilities/date.ts`, and what the component
does beyond showing activities.

**Decision** — `calendar/calendar.ts` converts codes and days with integer arithmetic over
`Date.UTC`: no time zone can shift a day. Weeks are ISO (Monday start, the week belongs to its
Thursday's year), the codes read as 20YY. `activityRender` replaces the card's content but the
colored card stays, so `color` keeps meaning. The component has no navigation, click callbacks
or activity title translation — the host drives the codes and passes its own data.

**Rationale** — `DateHelper` works on 6-digit week codes (202406) through local `Date` objects
and date-fns; the new functions are a few lines and tested in isolation. Cost: codes before 2000
or after 2099 can't be expressed, and clicks on days or cards need a prop when a page needs them.

## `ifcss`: the caller's `css` overrides only width, height, margin and padding

**Context** — Components appended `css` after their defaults, but Tailwind sorts utilities of the
same property by name, so a default `w-800` beat a custom `w-100`. The user asked for a merge
limited to width, height (both with min/max), margin and padding.

**Decision** — `utilities/css.ts` `ifcss(css, defaultCss)`, about 40 lines with no dependency: a
custom class drops the default of the same group under the same variants, and a shorthand
(`p`, `px`, `py`, `m`, `mx`, `my`) also drops its sides. Applied where a component's defaults hold
those utilities: Layer, Modal, Label, InlineButton, OptionsStrip, FileDropZone, ShowroomBlock.
The Modal's `pt-50` stays outside the merge: it reserves the title bar's room.

**Rationale** — `tailwind-merge` covers every utility but adds a dependency and ~7 KB for conflicts
the components don't have. Cost: a conflict outside those groups (colors, font size) still resolves
by Tailwind's order; it gets a group in `css.ts` when one shows up.

## Route user guides: own Markdown parser, the host's glob of GUIDE.md

**Context** — The hosts show each page's user guide in the header's Information tab (ported from
smartberry). Open: how to render Markdown in a package that keeps parsers out (see `ChatMessage`'s
`content` snippet), and how a page hands over its guide, given the package never imports host routes.

**Decision** — `markdown/markdown-parser.ts` is smartberry's dependency-free parser, ported with
its tests; `MarkdownView` renders the tree as Svelte elements, never `{@html}`. The host passes its
lazy `import.meta.glob` of `GUIDE.md` files and SvelteKit's route id to `showRouteGuide`; the file
beside `+page.svelte` is found by path. smartberry instead has each page register its `.md` from code.

**Rationale** — The parser needs no `marked` + `DOMPurify` pair and no allowlist, since embedded HTML
is plain text. Its cost: only the subset guides use (no HTML, no images). The glob leaves nothing to
wire per page and keeps each guide in its own chunk.

## genix-ui ships its global CSS in `tailwind.css`

**Context** — The CSS the components depend on (the `--spacing: 1px` theme and breakpoints, the
custom properties they read, element resets, the `bx-*` button classes, `.color-label`, `.c-*`,
the `mdi--delete` zoom, `.w-page-clipped`) lived in each host's `app.css`/`tailwind.css`. berryapps
and genix kept hand-copied versions that drifted. genix lacked `.w-page-clipped`, the delete zoom and
`.bx-red:hover`, so the same component rendered differently in each host.

**Decision** — `tailwind.css` at the package root holds all of it, and every host imports it right
after `@import 'tailwindcss'`. A host redeclares the custom properties on `body` to restyle. CSS
that a single component uses lives in that component (`.w-page` in Layer.svelte). One-off helper
classes became Tailwind utilities (`lh-10` → `leading-none`, `bnr-1` → `w-32 h-32 rounded-full`).
Classes only an app uses stay in the app.

**Rationale** — There is one copy, so a fix reaches both hosts with the submodule bump. The `bx-*`
classes stay global, not scoped to Button.svelte, because Modal, ButtonLayer and ButtonList put them
on their own `<button>`. The cost: a host must import the file from its Tailwind entry, since
`@theme` and `@source` only work there. A plain `import` from a component would not do.

## `Button`'s icon/label gap is a margin on the label

**Context** — With `hideNameOnMobile`, the label was hidden on mobile but the icon kept its 5px
`margin-right`, so an icon-only button rendered off-centre.

**Decision** — The gap moved from the icon (`icon-lead`/`icon-trail`) to the label span
(`label-after-icon`/`label-before-icon`).

**Rationale** — The margin is now hidden together with the label, so the button needs no media
query that would have to repeat the host's `md` breakpoint (749px in berryapps).

## SideMenu animates the mobile drawer from any change to `open`

**Context** — The drawer only slid on close. Only SideMenu's own close buttons started the view
transition, and hosts open it by writing the bound `open` (berryapps' header burger).

**Decision** — The DOM follows an internal `drawerShownOpen`. An `$effect` on `open` updates it
inside `document.startViewTransition` (with `flushSync`), so the old snapshot is the previous
state. The internal close paths now just set `open = false`.

**Rationale** — Fixed in the library, not in each host, so no caller can bypass the animation.
Cost: the drawer DOM trails `open` by one transition frame.

## Delete and layer-close icons come from `mdi`, not `fa`

**Context** — FA4's `fa--trash` (striped can) and `fa--close` (heavy X) looked bulky; a more
minimal delete icon and a thinner close X were requested for modals and layers.

**Decision** — Every `fa--trash` became `mdi--delete`. `fa--close` became `mdi--close-thick` only
in `layers/` (Modal, Layer, TopLayerSelector, TopLayerDatePicker). The other X icons (file chips,
side/mobile menu, chat attachments) still use `fa--close` / `fa--times`. `mdi--delete` only fills
18 of its 24 grid units, so genix-ui's `tailwind.css` zooms its mask to 133%. The icon keeps its
1em box, so buttons keep their size.

**Rationale** — `@iconify-json/mdi` is already installed, so this adds no dependency. Keeping the
change to the layer close buttons stays within what was asked. The cost: the X icons now look
different between layers and those other widgets.

## TableGrid reads `subcols`, so a group label can sit over its columns

**Context** — `VTable` has had two-level headers for a while (`subcols` + `colspan`/`rowspan` on
`<th>`), and `TableGrid` has had `useRowRenderer` for full-width section rows. A calendar needs
both at once: a weekday label over its Día / Compra / Venta columns, and a month separator row.
Neither component could do it alone.

**Decision** — `TableGrid` now understands the same `subcols` contract. A `processedColumns`
derived flattens the subcolumns into the grid tracks — which is what every body row, the mobile
cards and `grid-template-columns` already consumed as `visibleColumns` — and keeps two header
lists beside it. Both branches (plain scroll and virtualized) render one shared `tableHeaderRow`
snippet instead of a copy each.

**Rationale** — Placement is explicit (`grid-column: <start> / span <n>` on the group,
`grid-row: 2` on its subcolumns) rather than left to auto-placement, because a table that mixes
grouped and plain columns needs the plain ones to span both header rows, and auto-placement leaves
a hole in row 2 the moment it has to do that. `hasInteractiveCell` moved to the flattened list in
the same pass: under a two-level header the editable cells are the subcolumns, so reading the
top-level columns left the agent without a Table handle.

## Every VTable cell is a positioning context, not all but the last

**Context** — `.vtable-row > td:not(:last-of-type)` carried both the column separator and
`position: relative`. The exclusion only ever made sense for the border, but it took the
positioning with it, so the last column was the one cell in the table that was not a containing
block. `CellInput` renders its editor absolutely at `top/left: 0, width/height: 100%`, so in the
last column that editor resolved against the table and covered it whole: the cell's own value was
painted across the grid and the click target swallowed every other cell. It only showed up now
because the exchange rate maintainer is the first table whose last column is editable.

**Decision** — Split the rule: `position`, `display` and `vertical-align` apply to every
`td`, and `:not(:last-of-type)` keeps only `border-right`.

**Rationale** — It is what `TableGrid` and `TableTree` already do — both set `position: relative`
on every cell and drop only the border on the last one — so this removes a divergence rather than
inventing a rule. The last cell gaining a containing block also fixes `_edit-icon`, which was
escaping the same way, and costs nothing for `.vtable-row-hover-anchor`, which was already setting
`position: relative` on that very cell.

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
