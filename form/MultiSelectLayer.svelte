<script lang="ts" generics="E">
  import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
  import Popover from '../misc/Popover.svelte';
  import { useUI } from '../runtime/index.js';
  import { buildMultiSelectItems, type MultiSelectOptionID } from './multi-select';

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
  }

  let {
    referenceElement, open, options, keyId, keyName, selectedIDs, filterValue = $bindable(''), inputID,
    onToggle, onClose,
  }: MultiSelectLayerProps<E> = $props();

  const ui = useUI();
  let filterInputRef: HTMLInputElement | null = $state(null);

  const listItems = $derived(buildMultiSelectItems(options, selectedIDs, filterValue, keyId, keyName));

  $effect(() => {
    // preventScroll: the Popover mounts at top:0 of the document before it is positioned, and a
    // plain focus() would scroll the page up to it.
    if (open && filterInputRef) { filterInputRef.focus({ preventScroll: true }); }
  });

  // The layer closes on the filter input's blur, so clicks inside it must not steal the focus.
  const keepFilterFocus = (ev: MouseEvent) => {
    if (ev.target !== filterInputRef) { ev.preventDefault(); }
  };
</script>

<Popover {referenceElement} {open} placement="bottom-start" offset={4}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="_layer w-320 p-6 flex flex-col gap-6" onmousedown={keepFilterFocus}>
    <div class="relative flex items-center">
      <i class="icon-[fa--search] _filter-icon absolute left-8 text-[14px] pointer-events-none"></i>
      <input bind:this={filterInputRef} id={inputID}
        class="_filter w-full h-32 pl-30 pr-8"
        placeholder={ui.translate('Search...|Buscar...')}
        oninput={(ev) => { filterValue = ((ev.target as HTMLInputElement).value || '').trim().toLowerCase(); }}
        onblur={onClose}
        onkeydown={(ev) => {
          if (ev.key === 'Escape') { onClose(); }
          // Enter picks the first unselected match.
          if (ev.key === 'Enter') {
            const firstUnselected = listItems.find((item) => !item.isSelected);
            if (firstUnselected) { onToggle(firstUnselected.option); }
          }
        }}
      />
    </div>
    <!-- The virtual list is the only scroll container; pr-10 keeps the rows clear of its scrollbar. -->
    <div class="h-200">
      <SvelteVirtualList items={listItems}>
        {#snippet renderItem(item)}
          <div class="pr-10 pb-1">
            <div class="_option h-32 px-8 rounded-[6px] flex items-center"
              class:_selected={item.isSelected}
              role="option"
              aria-selected={item.isSelected}
              tabindex="-1"
              onclick={(ev) => { ev.stopPropagation(); onToggle(item.option); }}
              onkeydown={(ev) => { if (ev.key === 'Enter') { onToggle(item.option); } }}
            >
              <span class="truncate">{item.option[keyName]}</span>
            </div>
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
