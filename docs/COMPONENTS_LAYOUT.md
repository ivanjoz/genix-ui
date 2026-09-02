# UI Components Layout

This is the canonical classification for the root-level folders in `genix-ui/`. Every
component lives in exactly one subfolder, picked by **what the component is
for**, not by who happens to use it. New components must be placed
according to this scheme; if no bucket fits, propose a new one before
adding to `misc/`.

## Folders

### `buttons/` — interactive triggers (button-shaped UI)
Click targets that produce an action or toggle a transient surface.
- `Button.svelte` — base button.
- `ButtonLayer.svelte` — button + popover layer attached to it.
- `ButtonList.svelte` — button with a hover-revealed action menu.
- `InlineButton.svelte` — small inline pill-shaped button (chip-like).

### `cards/` — record-shaped picker / display surfaces
Card UIs that present a single record or a pair, often used as inputs.
- `SearchCard.svelte` — searchable card picker (single record).
- `SearchDualCard.svelte` — paired card picker (two records side-by-side).

### `charts/` — data visualization
Anything whose primary purpose is rendering quantitative graphics.
- `Charts.svelte` — billboard.js-backed chart wrapper.
- `ChartCanvas.svelte` — canvas-rendered chart primitive.
- `CellHorizontalBars.svelte` — inline bar visualization for table cells.

### `files/` — file selection, upload, image rendering
Components that handle binary assets (upload, preview, hash-based loading).
- `FileUploadSelector.svelte` — file selector with upload trigger.
- `ImageUploader.svelte` — image-specific uploader with previews.
- `Imagehash.svelte` — hash-based progressive image renderer.

### `form/` — form controls (input → value)
Anything that captures user input into a typed value. The line between
`form/` and `cards/` is: a form control returns a primitive or atom
(string, number, ID); a card returns a record-shaped selection.
- `Input.svelte`, `DateInput.svelte`, `date-input.helpers.ts`
- `Checkbox.svelte`, `CheckboxOptions.svelte`
- `ColorPicker.svelte`, `SearchSelect.svelte`
- `FilterInput.svelte` — typeable filter/search input.
- `LabelText.svelte` — read-only labeled value pair (label above text).
- `LoginForm.svelte` — auth form (kept here while it's the only auth piece;
  promote to `auth/` if more auth UIs land).

### `layers/` — overlay surfaces (modals, popovers, drawers)
Components whose job is to render *above* page content, with their own
positioning + lifecycle. Note: `vTable/` keeps its own self-contained table
implementation; this bucket is for the shared overlay primitives the rest of
the app composes. The low-level `Popover`/`Portal` primitives these compose
live in `misc/`.
- `Layer.svelte`, `LayerStatic.svelte`
- `Modal.svelte`, `MobileLayerVertical.svelte`
- `TopLayerDatePicker.svelte`, `TopLayerSelector.svelte`

### `navigation/` — section/step/tab pickers
Components whose job is to switch the current section / step / view.
- `ArrowSteps.svelte` — horizontal stepper with chevron-shaped steps.
- `OptionsStrip.svelte` — segmented options strip (tab-like selector).

### `svg/` — raw SVG assets
Currently only icons used by tooling (`excel-icon.svg`, `pdf-icon.svg`).
Most icons live with the consumer or under `libs/assets/`.

### `vTable/` — virtualized table package (self-contained)
Table, tree, grid, mobile cards-list, plus the per-cell components
(`CellInput`, `CellSelect`) and shared agent context. Treat as a unit;
do not pull individual files into other folders.

### `misc/` — low-level utilities that don't belong elsewhere
Reserved for primitives consumed everywhere or one-off building blocks
that don't justify their own folder.
- `Renderer.svelte` — generic AST→DOM renderer used by table cells and
  rich-text spots.
- `Virtualizer.svelte`, `VirtualCards.svelte` — virtualization primitives
  (used by tables, lists, card grids).
- `HighlightText.svelte` — renders a string with substrings highlighted.
- `Info.svelte` — note/hint box: light background with a colored left rule,
  `yellow` or `green`, taking a translatable `text` or a children snippet.
- `KeyValueStrip.svelte` — multi-cell label/value strip layout.
- `LoadingBar.svelte` — animated indeterminate loading bar.
- `RecordByIDText.svelte` — resolves a record by ID through the cache and
  renders its display text.
- `SquareBarSized.svelte` — proportional square bar with label/value.
- `Popover.svelte` — floating element positioned against a reference element,
  rendered through `Portal` so it escapes clipped/`overflow:hidden` ancestors.
  Used by `form/DateInput` and `vTable/CellSelect`.
- `Portal.svelte` — teleports its children to `document.body` (or a given
  target) after mount. Also used by `layers/Modal`.
- `popover.positioning.ts` — `calculatePosition`/`detectOverflow` helpers and
  the `Placement` type behind `Popover`.
- `popover.css` — optional plain (non-module) `.popover-container` /
  `.popover-content` skin. `Popover` itself renders unstyled, so consumers
  import this only when they want the default bubble look.

## Files that stay at the package root

- `components.module.css` — shared CSS module imported by several form
  components (`Input`, `SearchSelect`, `DateInput`, `ColorPicker`). Kept at
  root to avoid awkward relative paths from multiple subfolders.
- `AGENTIC_COMPONENTS.md` — agent-side contract for the components.
- `COMPONENTS_LAYOUT.md` — this file.

## Rules for adding a new component

1. Pick the most specific existing folder before considering `misc/`.
2. Only give a component its own folder when it is a genuine sub-package with
   several mutually dependent components and its own consumers (`vTable/`).
   A couple of files plus a helper belongs in an existing folder — that is why
   `Popover`/`Portal` live in `misc/` rather than a folder of their own.
3. Helper `.ts` files live next to their consumer in the same folder, prefixed
   with the consumer's name (e.g. `date-input.helpers.ts` in `form/`,
   `popover.positioning.ts` in `misc/`).
4. Component-specific styles inline into the component's `<style>` block.
   Only promote to a sibling `.module.css` when the styles are shared
   across multiple components in the same folder; promote to root only
   when shared across folders.
5. Update this document when adding a new folder or moving an existing
   component between folders.
