<script lang="ts" generics="E">
  import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
  import Popover from '../misc/Popover.svelte';
  import { useUI } from '../runtime/index.js';
  import { buildMultiSelectItems, type MultiSelectOptionID } from './multi-select';

  // The picking layer of a multi-select: a filter box over a virtual list where the selected
  // options come first (✓, × on hover to remove) and a click on any other adds it. The owner
  // (SelectMultiple, CellMultiSelect) keeps the open state, the selection and the filter.
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
    onPick: (option: E) => void;
    onRemove: (option: E) => void;
    onClose: () => void;
  }

  let {
    referenceElement, open, options, keyId, keyName, selectedIDs, filterValue = $bindable(''), inputID,
    onPick, onRemove, onClose,
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
            if (firstUnselected) { onPick(firstUnselected.option); }
          }
        }}
      />
    </div>
    <!-- The virtual list is the only scroll container; pr-10 keeps the rows clear of its scrollbar. -->
    <div class="h-200">
      <SvelteVirtualList items={listItems}>
        {#snippet renderItem(item)}
          <div class="pr-10 pb-1">
            {#if item.isSelected}
              <div class="_selected group relative h-32 pl-8 pr-32 rounded-[6px] flex items-center">
                <span class="truncate">{item.option[keyName]}</span>
                <!-- The check and the remove button share the right corner: hover swaps one for the other. -->
                <i class="icon-[fa--check] absolute right-11 text-[10px] group-hover:opacity-0"></i>
                <button type="button" class="_remove absolute top-4 right-4 w-24 h-24 rounded-[4px] flex items-center justify-center
                  opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                  aria-label="{ui.translate('Remove|Quitar')} {item.option[keyName]}"
                  onclick={(ev) => { ev.stopPropagation(); onRemove(item.option); }}
                >
                  <i class="icon-[fa--times] text-[12px]"></i>
                </button>
              </div>
            {:else}
              <div class="_option h-32 px-8 rounded-[6px] flex items-center"
                role="button"
                tabindex="-1"
                onclick={(ev) => { ev.stopPropagation(); onPick(item.option); }}
                onkeydown={(ev) => { if (ev.key === 'Enter') { onPick(item.option); } }}
              >
                <span class="truncate">{item.option[keyName]}</span>
              </div>
            {/if}
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
  ._selected {
    user-select: none;
    background-color: var(--accent-bg);
    color: var(--accent-fg);
    border: 1px solid var(--accent-border);
  }
  ._remove {
    background-color: var(--surface);
    color: var(--red-solid);
  }
  ._remove:hover {
    background-color: var(--red-solid);
    color: var(--surface);
  }
  @media (hover: none) {
    ._remove { opacity: 1; }
  }
</style>
