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
