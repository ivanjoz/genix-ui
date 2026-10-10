<script lang="ts" generics="T">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();

  /* One field of `saveOn` whose selection is shown as tags. Same `save` (and `options`, `keyId`,
     `keyName`) as the SearchSelect / CheckboxOptions / Checkbox / Input that writes it. */
  interface SelectedTagsField<T> {
    save: keyof T
    /* Resolves the stored id(s) to the option name. Without it the tag shows a string value as
       typed (Input) or `label` for a ticked boolean / 0|1 (Checkbox). */
    options?: readonly object[]
    keyId?: string
    keyName?: string
    label?: string
  }

  const { saveOn = $bindable(), fields, css = "", useBorder = false }: {
    saveOn: T
    fields: SelectedTagsField<T>[]
    css?: string
    /* A 1px border a shade darker than the tag's background. */
    useBorder?: boolean
  } = $props();

  // One colour per field, in field order, so tags of the same field read as a group.
  const FIELD_COLORS = [
    { background: "var(--accent-bg-strong)", text: "var(--accent-fg)", border: "var(--accent-border)" },
    { background: "var(--green-bg-strong)", text: "var(--green-fg)", border: "var(--green-border)" },
    { background: "var(--amber-bg-strong)", text: "var(--amber-fg)", border: "var(--amber-border)" },
    { background: "var(--pink-bg-strong)", text: "var(--pink-fg)", border: "var(--pink-border)" },
    { background: "var(--blue-bg-strong)", text: "var(--blue-fg)", border: "var(--blue-border)" },
    { background: "var(--purple-bg-strong)", text: "var(--purple-fg)", border: "var(--purple-border)" },
  ];

  type SelectedID = number | string | boolean

  const tagName = (field: SelectedTagsField<T>, selectedID: SelectedID): string | undefined => {
    if (field.options && field.keyId && field.keyName) {
      const keyId = field.keyId, keyName = field.keyName
      const option = field.options.find((option) => String((option as Record<string, unknown>)[keyId]) === String(selectedID))
      return option ? String((option as Record<string, unknown>)[keyName] ?? "") : undefined
    }
    if (typeof selectedID === "string") { return selectedID }
    return field.label ? ui.translate(field.label) : undefined
  }

  // Reads saveOn directly: the fields can be unmounted (inside a closed ButtonLayer) and the tags
  // still show what is selected. An id whose option is not loaded yet shows no tag until it is.
  const tags = $derived(fields.flatMap((field, fieldIndex) => {
    const storedValue = saveOn[field.save] as SelectedID | SelectedID[] | null | undefined
    const selectedIDs = Array.isArray(storedValue) ? storedValue : (storedValue ? [storedValue] : [])
    return selectedIDs.flatMap((selectedID) => {
      const name = tagName(field, selectedID)
      return name ? [{ field, selectedID, name, color: FIELD_COLORS[fieldIndex % FIELD_COLORS.length] }] : []
    })
  }))

  // Writes the field's empty value; the component bound to the same `save` follows it.
  const removeTag = (field: SelectedTagsField<T>, selectedID: SelectedID) => {
    const storedValue = saveOn[field.save] as unknown
    let emptiedValue: unknown = undefined
    if (Array.isArray(storedValue)) { emptiedValue = storedValue.filter((id) => id !== selectedID) }
    else if (typeof storedValue === "boolean") { emptiedValue = false }
    else if (typeof storedValue === "number") { emptiedValue = 0 }
    else if (typeof storedValue === "string") { emptiedValue = "" }
    saveOn[field.save] = emptiedValue as T[keyof T]
  }
</script>

{#if tags.length > 0}
  <div class="flex flex-wrap items-center gap-6 {css}">
    {#each tags as tag (`${String(tag.field.save)}:${String(tag.selectedID)}`)}
      <!-- leading 1.4, not lower: `truncate` hides overflow, and a tighter line box clips the
           descenders (g, p, y) once browser zoom rounds the font metrics (seen at 110%). -->
      <span class="_tag group relative flex items-center justify-center h-27 pt-1 min-w-64 px-8 rounded-[6px] text-[14px] leading-[1.4] cursor-default select-none"
        class:_bordered={useBorder}
        style="--field-bg: {tag.color.background}; --field-text: {tag.color.text}; --field-border: {tag.color.border}">
        <span class="max-w-200 truncate">{tag.name}</span>
        <!-- Drawn over the end of the text, no space reserved for it: its fill and 2px outline in
             the tag's background hide the letters under it. Shown on hover; always on touch
             screens, which cannot hover. -->
        <button type="button" class="_remove absolute right-3 flex items-center justify-center w-20 h-20 rounded-[4px] cursor-pointer
          opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="{ui.translate('Remove|Quitar')} {tag.name}"
          onclick={(ev) => { ev.stopPropagation(); removeTag(tag.field, tag.selectedID) }}
        >
          <i class="icon-[fa--times] text-[12px]"></i>
        </button>
      </span>
    {/each}
  </div>
{/if}

<style>
  /* The field colours come inline as --field-*; --tag-* is what is painted, so the hover rule below
     can override it (a stylesheet rule cannot override an inline custom property). */
  ._tag {
    --tag-bg: var(--field-bg);
    --tag-text: var(--field-text);
    --tag-border: var(--field-border);
    background-color: var(--tag-bg);
    color: var(--tag-text);
  }
  ._tag._bordered {
    border: 1px solid var(--tag-border);
  }
  /* Hovering the ✕ previews the removal on the whole tag: red outline and text on white. The border
     goes transparent so only the outline is drawn. The ✕ follows through --tag-bg, so it stays
     blended with the tag. */
  ._tag:has(._remove:hover) {
    --tag-bg: var(--surface);
    --tag-text: var(--red-solid);
    --tag-border: transparent;
    outline: 1px solid var(--red-solid);
  }
  ._remove {
    background-color: var(--tag-bg);
    outline: 2px solid var(--tag-bg);
  }
  @media (hover: none) {
    ._remove { opacity: 1; }
  }
</style>
