## HTMLEditor: resizable table columns, widths in pixels
**Context** — Columns must be resizable by dragging their borders.
**Decision** — tiptap's `resizable` table option: a dragged column keeps its width in pixels (`colwidth` on its cells, a `<colgroup>` in the saved HTML); untouched columns share the remaining space. A table wider than the editor scrolls sideways inside it.
**Rationale** — It is tiptap's built-in resizing, no custom code. Cost: pixel widths don't adapt to narrower screens, hence the sideways scroll instead of squeezing the columns.

## HTMLEditor: table rows and columns edited from handles, not the toolbar
**Context** — Modeled on tiptap's own editor: a size grid to insert tables and handles on the table borders.
**Decision** — `EditorTablePicker` is an 8x8 grid plus cols/rows inputs (up to 20) for bigger tables. `EditorTableHandles` shows a pill on the left border of the hovered row and on the top border of the hovered column; clicking one selects that whole row/column and opens its menu (insert before/after, delete, delete table). The add/delete row/column toolbar buttons are gone, and tiptap's cell handle (merge, split, cell color) is not built.
**Rationale** — The actions sit next to the row or column they change, and the toolbar no longer grows when the cursor enters a table. Merging cells was never offered by the former RoosterJS editor, so it stays out until someone asks for it.

## HTMLEditor: tiptap schema replaces the style sanitizers
**Context** — The former RoosterJS editor stripped pasted inline styles (`div` margins, `td` widths and borders) with a sanitizer, a post-render pass and a MutationObserver.
**Decision** — The tiptap editor has none of them: tiptap parses HTML through its schema, so only the marks and attributes of the registered extensions (StarterKit, TextStyleKit, TextAlign, TableKit) survive.
**Rationale** — The schema is the filter, so there is no DOM patching after the fact. Cost: markup outside the schema (fonts other than those set by the toolbar, arbitrary `div` styles) is dropped when an old document is loaded.

## HTMLEditor: empty document stored as ""
**Context** — tiptap serializes an empty document as `<p></p>`.
**Decision** — When `editor.isEmpty`, the bound field gets `""`.
**Rationale** — An untouched field stays empty, so required-field checks and "has description" tests keep working as with the former RoosterJS editor.

## HTMLEditor: color swatches follow the cursor
**Context** — The former RoosterJS editor showed the last color picked in the text/background color buttons.
**Decision** — The color buttons show the color of the text under the cursor (`textStyle` mark), falling back to the theme colors.
**Rationale** — It tells the user what the selection already has; tiptap exposes it for free through `getAttributes`.

## HTMLEditor: StarterKit kept whole, links not opened on click
**Context** — StarterKit also brings headings, blockquote, code, code block and link (autolink on paste/typing), which have no toolbar button.
**Decision** — Kept as is (reachable through Markdown shortcuts like `# ` or `> `), with `link.openOnClick: false`.
**Rationale** — Disabling them is more configuration for no gain; opening a new tab on every click inside a link would get in the way of editing it.
