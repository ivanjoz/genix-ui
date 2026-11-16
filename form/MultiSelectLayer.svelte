<script lang="ts" generics="E">
  import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
  import Popover from '../misc/Popover.svelte';
  import { useUI } from '../runtime/index.js';
  import { buildMultiSelectItems, type MultiSelectItem, type MultiSelectOptionID } from './multi-select';

  // The picking layer of a multi-select: a filter box over a virtual list where the selected
  // options come first, highlighted. A click toggles the option. The owner (SelectMultiple,
  // CellMultiSelect) keeps the open state, the selection and the filter.
  interface MultiSelectLayerProps<E> {
    referenceElement: HTMLElement | null;
    open: boolean;
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    selectedIDs: MultiSelectOptionID[];
    /** Lowercased, trimmed text of the filter box. Bindable so the owner's agent `search` can set it. */
    filterValue?: string;
    inputID?: string;
    /** Adds the option if unselected, removes it if selected. */
    onToggle: (option: E) => void;
    onClose: () => void;
    /** No filter box, for lists of a few options. */
    hideSearch?: boolean;
    /** Options per row. */
    columns?: 1 | 2 | 3;
  }

  let {
    referenceElement, open, options, keyId, keyName, selectedIDs, filterValue = $bindable(''), inputID,
    onToggle, onClose, hideSearch = false, columns = 1,
  }: MultiSelectLayerProps<E> = $props();

  const ui = useUI();
  let layerElement: HTMLDivElement | null = $state(null);
  let filterInputRef: HTMLInputElement | null = $state(null);

  // Literal class names so Tailwind generates them.
  const LAYER_WIDTH = { 1: 'w-320', 2: 'w-420', 3: 'w-540' };
  const GRID_COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };
  // An option row: h-32 + pb-1. The list is as tall as its rows, up to 200px, then scrolls.
  const ROW_HEIGHT = 33;
  const MAX_LIST_HEIGHT = 200;

  const listItems = $derived(buildMultiSelectItems(options, selectedIDs, filterValue, keyId, keyName));
  // The virtual list draws one item per row, so the options are grouped `columns` per row.
  const listRows = $derived.by(() => {
    const rows: MultiSelectItem<E>[][] = [];
    for (let index = 0; index < listItems.length; index += columns) { rows.push(listItems.slice(index, index + columns)); }
    return rows;
  });

  // The layer closes when the focused element blurs: the filter box, or the layer itself
  // without one. preventScroll: the Popover mounts at top:0 of the document before it is
  // positioned, and a plain focus() would scroll the page up to it.
  $effect(() => {
    const focusTarget = hideSearch ? layerElement : filterInputRef;
    if (open && focusTarget) { focusTarget.focus({ preventScroll: true }); }
  });

  // Clicks inside the layer must not steal the focus, or it would close.
  const keepFocus = (ev: MouseEvent) => {
    if (ev.target !== filterInputRef) { ev.preventDefault(); }
  };
</script>

<Popover {referenceElement} {open} placement="bottom-start" offset={4}>
  <!-- Only focused itself when there is no filter box; with one, its blur never fires. -->
  <div bind:this={layerElement} class="_layer {LAYER_WIDTH[columns]} p-6 flex flex-col gap-6 outline-none"
    role="listbox" tabindex="-1"
    onmousedown={keepFocus}
    onblur={onClose}
    onkeydown={(ev) => { if (ev.key === 'Escape') { onClose(); } }}
  >
    {#if !hideSearch}
      <div class="relative flex items-center">
        <i class="icon-[fa--search] _filter-icon absolute left-8 text-[14px] pointer-events-none"></i>
        <input bind:this={filterInputRef} id={inputID}
          class="_filter w-full h-32 pl-30 pr-8"
          placeholder={ui.translate('Search...|Buscar...')}
          oninput={(ev) => { filterValue = ((ev.target as HTMLInputElement).value || '').trim().toLowerCase(); }}
          onblur={onClose}
          onkeydown={(ev) => {
            // Enter picks the first unselected match.
            if (ev.key === 'Enter') {
              const firstUnselected = listItems.find((item) => !item.isSelected);
              if (firstUnselected) { onToggle(firstUnselected.option); }
            }
          }}
        />
      </div>
    {/if}
    <!-- The virtual list is the only scroll container; pr-10 keeps the rows clear of its scrollbar. -->
    <div style:height="{Math.min(listRows.length * ROW_HEIGHT, MAX_LIST_HEIGHT)}px">
      <SvelteVirtualList items={listRows}>
        {#snippet renderItem(row)}
          <div class="pr-10 pb-1 grid gap-4 {GRID_COLUMNS[columns]}">
            {#each row as item (item.option[keyId])}
              <div class="_option h-32 px-8 rounded-[6px] flex items-center min-w-0"
                class:_selected={item.isSelected}
                role="option"
                aria-selected={item.isSelected}
                tabindex="-1"
                onclick={(ev) => { ev.stopPropagation(); onToggle(item.option); }}
                onkeydown={(ev) => { if (ev.key === 'Enter') { onToggle(item.option); } }}
              >
                <span class="truncate">{ui.translate(String(item.option[keyName] ?? ''))}</span>
              </div>
            {/each}
          </div>
        {/snippet}
      </SvelteVirtualList>
    </div>
  </div>
</Popover>

<style>
  ._layer {
    background-color: var(--surface);
    border-radius: 7px;
    box-shadow: rgba(0, 0, 0, 0.24) 0px 3px 8px, 0 0 0 1px var(--layer-edge);
  }
  /* The virtual list's viewport is `overflow-y: scroll`, which draws an empty scrollbar track
     when a few options fit without scrolling. */
  ._layer :global(.virtual-list-viewport) {
    overflow-y: auto;
  }
  /* Underline-only search field: no box, a tinted background and a bottom border. */
  ._filter {
    border: none;
    border-bottom: 1px solid var(--line-soft);
    background-color: var(--surface-muted);
    outline: none;
  }
  ._filter:focus {
    border-bottom-color: var(--purple-solid);
  }
  ._filter-icon {
    color: color-mix(in srgb, var(--fg) 45%, transparent);
  }
  ._option {
    user-select: none;
    cursor: pointer;
  }
  ._option:hover {
    background-color: var(--surface-muted);
  }
  ._option._selected {
    background-color: var(--accent-bg);
    color: var(--accent-fg);
    border: 1px solid var(--accent-border);
  }
  ._option._selected:hover {
    background-color: var(--accent-bg-strong);
  }
</style>
