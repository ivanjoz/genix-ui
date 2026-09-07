## `size="small"` is a `FieldShell` flag, not a `FilterInput` override

**Context** — `FilterInput` needed a 32px variant. Its height is not its own: the row is
`--input-height - 4` and the box starts 7px down, both owned by `field-shell.module.css`.

**Decision** — `size?: "normal" | "small"` on `FieldShell`, which adds an `is-small` global class,
and two rules beside the pill variant: `.row { height: 32px }` and `.box { inset: 0 }`. `FilterInput`
forwards the prop and drops its icon to `text-[13px]`.

**Rationale** — Setting `--input-height` from the caller would have shrunk the row while leaving the
7px top inset, so the visible box would have lost twice the height asked for. That inset is clearance
for a notch label, which a small field cannot spare and a pill never draws — hence `inset: 0`. Living
on `FieldShell` means every field can take the size, not only this one. **Watch out:** the `.is-small`
row rule ties with `.field.no-label .row` on specificity and wins only on source order.

## `Checkbox` gets a `size` prop, and "tiny" is a 20px box

**Context** — The default 28×26px box is taller than the 13px line it sits in when checkboxes are
packed into a dense row — the sub-access rows of the users/profiles access editor. Callers were
patching it from the outside with devtools-shaped overrides.

**Decision** — `size?: "normal" | "tiny"`. `tiny` swaps `w-28 h-26` for `w-20 h-20 mb-1 text-[11px]`
on the box span; everything else (border, checked colours, hover, label) is shared.

**Rationale** — The `text-[11px]` is what shrinks the check glyph: the icon is sized in `em`, so the
box's font-size scales its content without a second knob. Both are Tailwind classes, not CSS, because
a font-size in a component stylesheet is what the project's frontend conventions forbid. A union
rather than a boolean `tiny` so a third size does not need a second prop.

## `LabelCell` is the read-only field, and it overlaps `LabelText`

**Context** — The assets layer drew its four figures as a hand-rolled label/value pair, with the label
painted from `--input-label-color` by a page-local `.stat-label` class so it read as a field label.
The user layer's access tab needed the same thing for three identity fields it only displays.

**Decision** — `LabelCell`: `label` (translated), `value`, an `emptyText` dash so a cell never
collapses to a bare label, an optional `children` snippet for values a string cannot express, and
`valueCss` defaulting to the assets figure style. The assets page now uses it and its `.stat-label`
is gone.

**Rationale** — Sits in `form/` rather than `misc/` because the point is that it matches a field: it
reads the same `--input-label-color` token `FieldShell` paints its `<label>` with, so a theme
override moves both together. **Known overlap:** `form/LabelText.svelte` is the same shape with a
grey label and no empty handling, and `misc/KeyValueStrip.svelte` is a numbered-props variant of the
same idea. Three components for one pattern is one too many — folding `LabelText` into `LabelCell` as
a variant is the obvious cleanup, deliberately not done here because it touches unrelated callers.

## A multi-column SearchSelect dropdown gives up virtualization

**Context** — `optionRenderer` already let a caller draw an option however it likes, but the dropdown
only ever stacked those renders one per row. A card-shaped option wants columns; a list of 60 access
cards one per row is a scroll no one reads.

**Decision** — `columns={n}` lays the dropdown out as a CSS grid of `n` equal tracks. Above 1 it
turns virtualization off and adds `_card_option` to each row, which strips the row's padding,
min-height and hover tint so the card's own frame is the only one drawn.

**Rationale** — `SvelteVirtualList` emits one item per row and measures rows, so a grid inside it
lays out wrong; chunking options into row-groups to keep it would add a second, always-wrong-by-one
notion of "row" to the keyboard navigation. Rendering every filtered option is the honest trade for
a list that is short precisely because it is a catalog. Left unsolved: arrow keys still move by one
option, which in a grid reads as moving sideways.

## SearchSelect `placeholderAsLabel` paints the placeholder in the label colour

**Context** — An unlabelled `SearchSelect` uses its placeholder as the field's only identification,
but the placeholder is painted `--input-placeholder-color` (#8a8fb0) — deliberately washed out, so
it reads as absent text rather than as the field's name.

**Decision** — New optional prop `placeholderAsLabel` (default `false`). When set, the placeholder
takes `--input-label-color` (#6d5dad), the same token the notched label uses: class `_11` on the
desktop `<input>` (`::placeholder`, with `opacity: 1` for Firefox) and `_12` in place of `_10` on the
mobile picker's div.

**Rationale** — A prop rather than inferring it from a missing `label`, because plenty of unlabelled
selects are filters where the grey is correct. Reusing the label token rather than a literal keeps
the two in step when a theme overrides it. The `::placeholder` override wins over FieldShell's
`.inp::placeholder` purely on the scoping class Svelte appends — a lower-specificity trick that
breaks if FieldShell ever raises its own selector.

## SearchSelect italicises only the fallback placeholder

**Context** — `SearchSelect` painted every placeholder as italic 14px, including one passed as a
`placeholder` prop. That made a real caller-written hint ("PERFILES ::") look like the same greyed
filler as the generic `— select —` fallback, and smaller than the surrounding field text.

**Decision** — The italic/14px treatment now applies only when no `placeholder` prop is given. With a
prop, the placeholder renders at 15px upright. Two `$derived` class strings (`placeholderCss` for the
desktop `<input>`, `mobilePlaceholderCss` for the mobile picker's div) carry the branch, so the
literal Tailwind classes stay in the file for the scanner.

**Rationale** — Italic here means "nothing chosen and no guidance"; once the caller writes the hint
it is content and should read like content. Cost is one more conditional class per render path, and
callers who wanted the italic look must now drop the prop.

## A checkbox is one control, and it takes a controlled value

**Context** — `Checkbox` and `CheckboxOptions` drew a clickable box with a `<label>` beside it, and
only the box was clickable. Clicking the word next to a checkbox is what everyone tries first, and
the label is the larger target of the two. Separately, `Checkbox` could only bind through
`saveOn`/`save`, so a value that is not a property of an object — a `Map` entry, a derived set —
could not use it at all.

**Decision** — Both components render one `<button role="checkbox" aria-checked>` wrapping the box
and the text, so either half toggles. `Checkbox` gains an optional controlled mode: pass `checked`
and `onToggle` and the caller owns the value; `saveOn`/`save` still works and is untouched when
`checked` is `undefined`.

**Rationale** — One element rather than a `<label for>` pair because these are not native inputs:
`role="checkbox"` plus `aria-checked` on a button is the accessible spelling, gets keyboard
activation for free, and needs no generated id to link the two halves. The hover rules moved from
`._1:hover` to `._row:hover ._1` so hovering the text lights the box, which is the whole point.

The controlled mode is what the sub-access row in `security/users-profiles` needed: its value lives
in a `Map<accesoID, subAccesoID[]>` and its toggle rule is not "flip this one" — selecting "Todos"
clears the rest. `saveOn` cannot express either, and the alternative was a second checkbox component
next to this one.

## Password fields own the suffix slot with a reveal toggle

**Context** — `type="password"` gave no way to check what was typed, which matters most where the value is pasted rather than remembered (`CompanyTab`'s Culqi live/test keys). The suffix slot is where an adornment would go, but it already carries `postValue` and the validity glyph, and `.field.has-suffix .inp` reserves 34px — room for exactly one.

**Decision** — when `type === "password"`, the suffix renders a `<button>` toggling `icon-[mdi--eye-outline]` / `icon-[mdi--eye-off-outline]` at `#6b6b8e`, and the input's `type` flips to `text` while revealed. The button takes the slot outright: the validity glyph is suppressed for password fields, but `showInvalid` is left untouched so `FieldShell` still tints the border red. The button re-enables `pointer-events`, which `.suffix` disables so the slot cannot swallow clicks meant for the value.

**Rationale** — one glyph fits, and a reveal control is worth more than a green check on a field whose value is unreadable by design; the `mdi` outline pair over `fa--eye`/`fa--eye-slash` because at the suffix's real 18px the fa slash collapses into the pupil and the two states stop being distinguishable; the red border already carries the failure state, so nothing is lost on the error side. Flipping the attribute rather than rendering a second `<input>` keeps `bind:value` and the whole parse → validate → persist pipeline on one element — Svelte accepts a dynamic `type` here because the binding is a plain value binding. Cost: a revealed password is a plain-text field, so it is legible to a shoulder-surfer and to anything that screenshots the page; state is per-field and resets on remount, never persisted.

## The `pill` variant is a field drawn round, not a grey search box

**Context** — `FilterInput` (and `SearchSelect` with `useStyle=1`) painted a grey `#f5f3fa` fill, a near-transparent `#47465521` hairline and its own two-part drop shadow, driven by six `--input-pill-*` colour tokens of its own. Next to the notched fields it sits beside on a toolbar it read as a foreign control: different fill, different border colour, no focus ring, and a hover that only deepened a shadow.

**Decision** — the variant now declares exactly two things: the 16px radius (`--input-pill-radius`) and `mask-image: none` (no label, so no notch to punch). Fill, hairline, hover tint, focus ring and placeholder colour all fall through to the base `.field` rules, so a filter box is the same chrome as an input — white gradient fill, `#d0d4e7` line, `#b9bede` on hover, `#8b87d6` plus the 3px halo on focus. `--input-pill-bg`, `--input-pill-border-color{,-hover}`, `--input-pill-shadow{,-hover}` and `--input-pill-placeholder-color` are deleted, along with the pill row-height override (a filter is now the same height as an input) and the `:global(.is-pill) ._10` placeholder rule in `SearchSelect` the entry below added.

**Rationale** — the shared shell exists so fields cannot disagree; a variant that re-declares every colour defeats it, and each token was one more thing to keep in sync when the palette moves. Round shape kept because a search box is legible as one. Cost: a pill can no longer be tinted independently of the other fields — retheming `--input-border-color` on `body` now moves filters too, which is the point.

## Mobile `SearchSelect` placeholder reads FieldShell's placeholder tokens

**Context** — on mobile the field renders as a layer-picker trigger: a `<div>`, not an `<input>`. `FieldShell`'s `.inp::placeholder` rule therefore never applied, and the trigger's own `._10` class hardcoded `#6d5dad` — which is exactly `--input-label-color`. The empty state rendered in the label's purple instead of grey, so a `SearchSelect` with nothing chosen looked filled.

**Decision** — `._10` now resolves `var(--input-placeholder-color, #8a8fb0)`, with a `:global(.is-pill) ._10` override for `var(--input-pill-placeholder-color, #7f80a8)`, mirroring the two `::placeholder` rules `field-shell.module.css` already declares for real inputs.

**Rationale** — the tokens exist precisely so a consumer can retheme placeholders on `body` or on one field; a literal hex in the component would have opted the mobile branch out of that and re-introduced the desktop/mobile divergence the entry above closed. The pill override is a separate rule because the variant class lives on the `FieldShell` root, an ancestor, so it cannot be expressed as a fallback. Cost: one more `:global()` ancestor selector coupling this component to `FieldShell`'s variant class names.

## Default `SearchSelect` placeholder is a shared bilingual constant

**Context** — the desktop `<input>` fell back to a hardcoded Spanish-only `":: seleccione ::"`, while the mobile layer picker fell back to an empty string, so the same component showed two different empty states and bypassed the `EN|ES` translation contract.

**Decision** — a single `defaultPlaceholder = "— select —|— seleccione —"` feeds both branches, styled italic at 14px (`placeholder:italic placeholder:text-[14px]` on the input, `italic text-[14px]` on the mobile trigger). The dead `fs15` class on the mobile trigger — defined nowhere in the app's CSS — was dropped in the process.

**Rationale** — the user asked for `— seleccione —`; expressing it as an `EN|ES` pair keeps it consistent with every other string in the library, since `ui.translate` / `T` already resolve that format and a Spanish-only literal would render as-is for English users. Sizing goes through Tailwind rather than a CSS rule, per the project's font-size convention. Cost: consumers that relied on an empty mobile placeholder now see the default hint.
