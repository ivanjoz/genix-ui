<script lang="ts" generics="T,E">
  import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
  import { useUI } from '../runtime/index.js';
  import Popover from '../misc/Popover.svelte';
  import { type AgentOption } from '../agent/registry';
  import { getVTableAgentContext } from '../vTable/agentContext';

  type OptionID = string | number;

  export interface ICellMultiSelect<T,E> {
    id: number | string;
    saveOn: T;
    // Field of saveOn holding the selected option ids as an array.
    save: keyof T;
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    contentClass?: string;
    onChange?: (selectedIDs: OptionID[]) => void;
    // Cell coordinate within its parent table; assigned by the table.
    cellID?: number;
  }

  let {
    id, saveOn, save, options, keyId, keyName, contentClass = '', onChange, cellID,
  }: ICellMultiSelect<T,E> = $props();

  const ui = useUI();

  const show = $derived(ui.state.popoverId === id);
  let cellElement: HTMLDivElement | null = $state(null);
  let filterInputRef: HTMLInputElement | null = $state(null);
  let filterValue = $state('');

  // Writable derived: follows the record, and is overwritten locally on every pick/removal so
  // the cell repaints even when saveOn is not a reactive proxy.
  let selectedIDs = $derived(((saveOn[save] || []) as OptionID[]).slice());

  const optionsByID = $derived(new Map(options.map((option) => [option[keyId] as OptionID, option])));
  const selectedOptions = $derived(selectedIDs.map((selectedID) => optionsByID.get(selectedID)).filter((option): option is NonNullable<E> => option != null));

  // Selected options go first so they can be removed without scrolling; both groups honor the filter.
  const listItems = $derived.by(() => {
    const matchesFilter = (option: E) => !filterValue || String(option[keyName] || '').toLowerCase().includes(filterValue);
    const selectedSet = new Set(selectedIDs);
    return [
      ...selectedOptions.filter(matchesFilter).map((option) => ({ option, isSelected: true })),
      ...options.filter((option) => !selectedSet.has(option[keyId] as OptionID) && matchesFilter(option))
        .map((option) => ({ option, isSelected: false })),
    ];
  });

  const saveSelectedIDs = (nextSelectedIDs: OptionID[]) => {
    selectedIDs = nextSelectedIDs;
    saveOn[save] = nextSelectedIDs as T[keyof T];
    onChange?.(nextSelectedIDs);
  };

  const closePopover = () => {
    if (ui.state.popoverId === id) { ui.state.popoverId = 0; }
  };

  // Picking an option adds it and closes the layer: one pick per open.
  const addOption = (option: E) => {
    const optionID = option[keyId] as OptionID;
    if (!selectedIDs.includes(optionID)) { saveSelectedIDs([...selectedIDs, optionID]); }
    closePopover();
  };

  // Removing keeps the layer open so several options can be dropped in a row.
  const removeOption = (option: E) => {
    saveSelectedIDs(selectedIDs.filter((selectedID) => selectedID !== option[keyId]));
  };

  const openPopover = () => {
    filterValue = '';
    ui.state.popoverId = id;
  };

  $effect(() => {
    // preventScroll: the Popover mounts at top:0 of the document before it is positioned, and a
    // plain focus() would scroll the page up to it.
    if (show && filterInputRef) { filterInputRef.focus({ preventScroll: true }); }
  });

  // The layer closes on the filter input's blur, so clicks inside it must not steal the focus.
  const keepFilterFocus = (ev: MouseEvent) => {
    if (ev.target !== filterInputRef) { ev.preventDefault(); }
  };

  // The cell hands its methods to the parent table via context; the table is the lone Agent
  // handle and dispatches by cellID. `select` adds options, the same as a click.
  const tableAgentCtx = getVTableAgentContext();

  $effect(() => {
    if (!tableAgentCtx || cellID === undefined) { return; }
    return tableAgentCtx.registerCell(cellID, {
      search: (text: string) => { filterValue = String(text || '').toLowerCase(); },
      select: (...ids) => {
        const optionsToAdd = ids.map((rawID) => optionsByID.get(rawID) || optionsByID.get(Number(rawID)) || optionsByID.get(String(rawID)));
        const addedIDs = optionsToAdd.filter((option): option is NonNullable<E> => option != null).map((option) => option[keyId] as OptionID);
        saveSelectedIDs([...new Set([...selectedIDs, ...addedIDs])]);
      },
      getOptions: (max = 50): AgentOption[] => listItems
        .slice(0, Math.max(0, max | 0) || listItems.length)
        .map(({ option }) => ({ ID: option[keyId] as OptionID, Value: String(option[keyName] ?? '') })),
    });
  });

  // Mirror the selection into the DOM as "[id] name, ..." so the agent can read it.
  const agentDataValue = $derived(selectedOptions.map((option) => `[${option[keyId]}] ${option[keyName]}`).join(', '));
  const agentDataID = $derived(
    tableAgentCtx && cellID !== undefined ? `${tableAgentCtx.tableID}:${cellID}` : undefined,
  );
</script>

<div class="_cell-content flex items-center gap-4 overflow-hidden {contentClass}">
  {#each selectedOptions as option (option[keyId])}
    <span class="_chip shrink-0 h-23 pb-1 px-6 rounded-[5px] flex items-center">{option[keyName]}</span>
  {/each}
</div>
<div class="_overlay" bind:this={cellElement}
  data-id={agentDataID}
  data-cell-type={agentDataID ? 'CellMultiSelect' : undefined}
  data-value={agentDataValue}
  data-label={String(save)}
  data-type="other"
  class:_open={show}
  role="button"
  tabindex="0"
  onmousedown={(ev) => {
    // Open from mousedown so the filter input can take focus without an immediate blur cycle.
    ev.preventDefault();
    ev.stopPropagation();
    if (!show) { openPopover(); }
  }}
  onkeydown={(ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && !show) {
      ev.preventDefault();
      openPopover();
    }
  }}
  onclick={(ev) => { ev.stopPropagation(); }}
></div>
<Popover referenceElement={cellElement} open={show} placement="bottom-start" offset={4}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="_layer w-320 p-6 flex flex-col gap-6" onmousedown={keepFilterFocus}>
    <div class="relative flex items-center">
      <i class="icon-[fa--search] _filter-icon absolute left-8 text-[14px] pointer-events-none"></i>
    <input bind:this={filterInputRef} id={String(id)}
      class="_filter w-full h-32 pl-30 pr-8"
      placeholder={ui.translate('Search...|Buscar...')}
      oninput={(ev) => { filterValue = ((ev.target as HTMLInputElement).value || '').trim().toLowerCase(); }}
      onblur={closePopover}
      onkeydown={(ev) => {
        if (ev.key === 'Escape') { closePopover(); }
        // Enter picks the first unselected match.
        if (ev.key === 'Enter') {
          const firstUnselected = listItems.find((item) => !item.isSelected);
          if (firstUnselected) { addOption(firstUnselected.option); }
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
                  onclick={(ev) => { ev.stopPropagation(); removeOption(item.option); }}
                >
                  <i class="icon-[fa--times] text-[12px]"></i>
                </button>
              </div>
            {:else}
              <div class="_option h-32 px-8 rounded-[6px] flex items-center"
                role="button"
                tabindex="-1"
                onclick={(ev) => { ev.stopPropagation(); addOption(item.option); }}
                onkeydown={(ev) => { if (ev.key === 'Enter') { addOption(item.option); } }}
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
  ._chip {
    background-color: var(--accent-bg-strong);
    color: var(--accent-fg);
  }
  ._overlay {
    position: absolute;
    border-radius: inherit; /* follows the table's corner radius, see VTable */
    inset: 0;
    border: 1px solid transparent;
    cursor: pointer;
  }
  ._overlay:hover {
    border-color: color-mix(in srgb, var(--fg) 60%, transparent);
  }
  ._overlay._open {
    box-shadow: inset 0 0 0px 1px var(--purple-border);
    border-color: var(--purple-solid);
  }
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
