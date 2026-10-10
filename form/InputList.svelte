<script lang="ts" generics="T extends Record<string, any>">
  import { tick } from 'svelte';
  import Button from '../buttons/Button.svelte';
  import T from '../misc/T.svelte';
  import { useUI } from '../runtime/index.js';
  import Checkbox from './Checkbox.svelte';
  const ui = useUI();

  // An editable list of one-line texts — checklists, acceptance criteria, steps. Each row is a
  // borderless text box inside one framed list, so the rows read as a list and not as a stack of
  // separate fields. The remove ✕ shows only on the row under the pointer or being typed in.
  interface Props {
    items: T[]
    /** Key of each item holding its text. */
    textKey: keyof T
    /** Key of each item holding a boolean: adds a checkbox per row and the "done x / n" count. */
    checkKey?: keyof T
    /** The item the + button appends. */
    makeItem: () => T
    title?: string
    /** Label of the checked count, right-aligned on the title row. */
    countLabel?: string
    placeholder?: string
    /** Shown when the list is empty and disabled. */
    emptyText?: string
    /** Read-only: plain text, no add, no remove. */
    disabled?: boolean
    css?: string
  }

  let {
    items = $bindable(), textKey, checkKey, makeItem, title, countLabel = 'Done|Hechos', placeholder, emptyText,
    disabled = false, css = '',
  }: Props = $props()

  // svelte-ignore non_reactive_update
  let listElement: HTMLDivElement

  const checkedCount = $derived(checkKey ? items.filter((item) => item[checkKey]).length : 0)

  // The new row is empty, so the cursor goes straight to it.
  const addItem = async () => {
    items = [...items, makeItem()]
    await tick()
    listElement?.lastElementChild?.querySelector('input')?.focus()
  }

  const removeItem = (removedIndex: number) => {
    items = items.filter((_, keptIndex) => keptIndex !== removedIndex)
  }
</script>

<div class="flex flex-col {css}">
  <div class="flex items-center gap-10 mb-8">
    {#if title}<div class="h3"><T text={title} /></div>{/if}
    {#if !disabled}
      <Button icon="icon-[fa--plus]" color="green" useCircle={true} label="Add|Agregar" onClick={addItem} />
    {/if}
    {#if checkKey && items.length > 0}
      <div class="ml-auto text-[14px] text-fg-muted"><T text={countLabel} />: {checkedCount} / {items.length}</div>
    {/if}
  </div>
  {#if items.length > 0}
    <div class="_list" bind:this={listElement}>
      {#each items as item, itemIndex (item)}
        {@const isChecked = !!(checkKey && item[checkKey])}
        <div class="_row group flex items-center gap-6 pl-8 pr-4 min-h-40">
          {#if checkKey}
            {#if disabled}
              <i class="{isChecked ? 'icon-[fa--check-square-o] text-green-solid' : 'icon-[fa--square-o] text-fg-subtle'} shrink-0 mr-4"></i>
            {:else}
              <Checkbox saveOn={item} save={checkKey} size="tiny" />
            {/if}
          {/if}
          {#if disabled}
            <span class="grow py-8 {isChecked ? 'line-through text-fg-muted' : ''}">{item[textKey]}</span>
          {:else}
            <input class="_text grow min-w-0 h-38 {isChecked ? 'line-through text-fg-muted' : ''}" type="text"
              bind:value={item[textKey]} placeholder={placeholder ? ui.translate(placeholder) : undefined}
              aria-label={ui.translate(placeholder || title || '')} />
            <Button icon="icon-[fa--times]" label="Remove|Quitar" onClick={() => removeItem(itemIndex)}
              css="shrink-0 w-30 h-30 rounded text-fg-muted hover:text-red-solid hover:bg-red-bg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" />
          {/if}
        </div>
      {/each}
    </div>
  {:else if disabled && emptyText}
    <span class="text-[14px] text-fg-muted"><T text={emptyText} /></span>
  {/if}
</div>

<style>
  ._list {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  ._row + ._row {
    border-top: 1px solid var(--line-soft);
  }
  ._row:hover,
  ._row:focus-within {
    background-color: var(--surface-muted);
  }
  ._text {
    background-color: transparent;
    border: none;
    outline: none;
    color: inherit;
  }
  ._text::placeholder {
    color: var(--fg-subtle);
  }
</style>
