<script lang="ts" generics="T,E">
  import { useUI } from '../runtime/index.js';
  import { getVTableAgentContext } from '../vTable/agentContext';
  import MultiSelectLayer from '../form/MultiSelectLayer.svelte';
  import { buildMultiSelectItems, findOptionsByIDs, toMultiSelectAgentOptions, type MultiSelectOptionID } from '../form/multi-select';

  export interface ICellMultiSelect<T,E> {
    id: number | string;
    saveOn: T;
    // Field of saveOn holding the selected option ids as an array.
    save: keyof T;
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    contentClass?: string;
    onChange?: (selectedIDs: MultiSelectOptionID[]) => void;
    // Cell coordinate within its parent table; assigned by the table.
    cellID?: number;
  }

  let {
    id, saveOn, save, options, keyId, keyName, contentClass = '', onChange, cellID,
  }: ICellMultiSelect<T,E> = $props();

  const ui = useUI();

  const show = $derived(ui.state.popoverId === id);
  let cellElement: HTMLDivElement | null = $state(null);
  let filterValue = $state('');

  // Writable derived: follows the record, and is overwritten locally on every pick/removal so
  // the cell repaints even when saveOn is not a reactive proxy.
  let selectedIDs = $derived(((saveOn[save] || []) as MultiSelectOptionID[]).slice());

  const optionsByID = $derived(new Map(options.map((option) => [option[keyId] as MultiSelectOptionID, option])));
  const selectedOptions = $derived(findOptionsByIDs(optionsByID, selectedIDs));

  const saveSelectedIDs = (nextSelectedIDs: MultiSelectOptionID[]) => {
    selectedIDs = nextSelectedIDs;
    saveOn[save] = nextSelectedIDs as T[keyof T];
    onChange?.(nextSelectedIDs);
  };

  const closePopover = () => {
    if (ui.state.popoverId === id) { ui.state.popoverId = 0; }
  };

  // A click adds an unselected option or removes a selected one, and closes the layer: one change per open.
  const toggleOption = (option: E) => {
    const optionID = option[keyId] as MultiSelectOptionID;
    saveSelectedIDs(selectedIDs.includes(optionID)
      ? selectedIDs.filter((selectedID) => selectedID !== optionID)
      : [...selectedIDs, optionID]);
    closePopover();
  };

  const openPopover = () => {
    filterValue = '';
    ui.state.popoverId = id;
  };

  // The cell hands its methods to the parent table via context; the table is the lone Agent
  // handle and dispatches by cellID. `select` adds options, the same as a click.
  const tableAgentCtx = getVTableAgentContext();

  $effect(() => {
    if (!tableAgentCtx || cellID === undefined) { return; }
    return tableAgentCtx.registerCell(cellID, {
      search: (text: string) => { filterValue = String(text || '').toLowerCase(); },
      select: (...ids) => {
        const addedIDs = findOptionsByIDs(optionsByID, ids).map((option) => option[keyId] as MultiSelectOptionID);
        saveSelectedIDs([...new Set([...selectedIDs, ...addedIDs])]);
      },
      getOptions: (max = 50) => toMultiSelectAgentOptions(
        buildMultiSelectItems(options, selectedIDs, filterValue, keyId, keyName), keyId, keyName, max),
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
<MultiSelectLayer referenceElement={cellElement} open={show} {options} {keyId} {keyName} {selectedIDs}
  bind:filterValue inputID={String(id)} onToggle={toggleOption} onClose={closePopover} />

<style>
  ._chip {
    background-color: #eeecff;
    color: var(--accent-fg);
  }
  /* The light hex would glare on the dark surface: dark mode keeps the accent token. */
  :global(body.dark) ._chip {
    background-color: var(--accent-bg-strong);
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
</style>
