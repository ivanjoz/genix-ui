# RATIONALE — genix-ui

Design decisions for the shared UI package, newest first.

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
