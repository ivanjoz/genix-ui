<script lang="ts" generics="T,E">
  import { useUI } from '../runtime/index.js';
  import Popover from '../misc/Popover.svelte';
  import { type AgentOption } from '../agent/registry';
  import { getVTableAgentContext } from '../vTable/agentContext';
  const ui = useUI();

  // The pick-only twin of CellSelect, for short fixed lists: clicking the cell opens one button per
  // option, like SelectBox, with no typing. Chosen per column with `cellSelectMode: 'pick'`.
  interface ICellSelectBox<T,E> {
    id: number | string;
    saveOn?: T;
    save?: keyof T;
    contentClass?: string;
    onChange?: (newValue: string | number) => void;
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    // Cell coordinate within its parent table; assigned by the table.
    cellID?: number;
    // Columns of option buttons in the list.
    columns?: 1 | 2;
  }

  let { id, options, saveOn, save, keyId, keyName, contentClass, onChange, cellID, columns = 1 }: ICellSelectBox<T,E> = $props();

  // One popover open at a time across the app, the same switch CellSelect uses.
  const isOpen = $derived(ui.state.popoverId === id);
  let triggerElement: HTMLDivElement | null = $state(null);
  let listElement: HTMLDivElement | null = $state(null);
  // Overwritten on every pick so the cell repaints even when saveOn is not a reactive proxy.
  let selectedID = $derived(saveOn && save ? saveOn[save] as unknown : undefined);
  const selectedOption = $derived(options.find((option) => String(option[keyId]) === String(selectedID ?? '')));
  const optionName = (option: E) => ui.translate(String(option[keyName] ?? ''));

  const close = () => { if (isOpen) ui.state.popoverId = 0 };

  const pick = (option: E) => {
    close();
    if (String(option[keyId]) === String(selectedID ?? '')) return;
    selectedID = option[keyId];
    if (saveOn && save) { saveOn[save] = option[keyId] as unknown as NonNullable<T>[keyof T] }
    onChange?.(option[keyId] as string | number);
  };

  // There is no input to blur, so a press outside the cell and its list closes it.
  $effect(() => {
    if (!isOpen) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerElement?.contains(target) || listElement?.contains(target)) return;
      close();
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() };
    window.addEventListener('mousedown', closeOnOutsidePress, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeOnOutsidePress, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  });

  // The cell hands its methods to the parent table, which is the lone agent handle.
  const tableAgentCtx = getVTableAgentContext();
  $effect(() => {
    if (!tableAgentCtx || cellID === undefined) return;
    return tableAgentCtx.registerCell(cellID, {
      search: () => { ui.state.popoverId = id },
      select: (...ids) => {
        const matched = options.find((option) => String(option[keyId]) === String(ids[0]));
        if (matched) pick(matched);
      },
      getOptions: (max = 50): AgentOption[] => options.slice(0, max)
        .map((option) => ({ ID: option[keyId] as number | string, Value: optionName(option) })),
    });
  });

  const agentDataID = $derived(tableAgentCtx && cellID !== undefined ? `${tableAgentCtx.tableID}:${cellID}` : undefined);
</script>

<div class="_root"
  data-id={agentDataID}
  data-cell-type={agentDataID ? 'CellSelect' : undefined}
  data-value={selectedOption ? `[${selectedOption[keyId]}] ${selectedOption[keyName]}` : ''}
  data-label={String(save || '')}
  data-type="other"
>
  <div class="_2">{selectedOption ? optionName(selectedOption) : ''}</div>
  <div class="_1" class:_open={isOpen} bind:this={triggerElement} role="button" tabindex="0" aria-haspopup="listbox" aria-expanded={isOpen}
    onmousedown={(ev) => { ev.stopPropagation() }}
    onclick={(ev) => { ev.stopPropagation(); ui.state.popoverId = isOpen ? 0 : id }}
    onkeydown={(ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ui.state.popoverId = isOpen ? 0 : id }
    }}
  >
    <div class="{contentClass} line-clamp-2 whitespace-normal grow">{selectedOption ? optionName(selectedOption) : ''}</div>
    <i class="icon-[mdi--unfold-more-horizontal] _arrow"></i>
  </div>
  <Popover referenceElement={triggerElement} open={isOpen} placement="bottom-start">
    <div bind:this={listElement} class="_list p-6 max-h-[50vh] overflow-y-auto grid gap-4 {columns === 2 ? 'grid-cols-2 min-w-360' : 'grid-cols-1 min-w-200'}" role="listbox">
      {#each options as option (option[keyId])}
        {@const isCurrent = String(option[keyId]) === String(selectedID ?? '')}
        <button type="button" class="_option" class:_current={isCurrent} role="option" aria-selected={isCurrent}
          onclick={(ev) => { ev.stopPropagation(); pick(option) }}>
          <span class="truncate">{optionName(option)}</span>
        </button>
      {/each}
    </div>
  </Popover>
</div>

<style>
  ._root {
    display: contents;
    border-radius: inherit; /* follows the table's corner radius, see VTable */
  }
  ._1 {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px 0 6px;
    width: 100%;
    height: 100%;
    border: 1px solid transparent;
    border-radius: inherit;
    cursor: pointer;
  }
  ._1:hover {
    border: 1px solid color-mix(in srgb, var(--fg) 60%, transparent);
  }
  ._1._open {
    box-shadow: inset 0 0 0px 1px var(--purple-border);
    border-color: var(--purple-solid);
    background-color: var(--purple-bg);
  }
  /* The arrow only shows on hover or while open, so a read-looking table stays quiet. */
  ._arrow {
    flex-shrink: 0;
    font-size: 18px;
    color: var(--fg-soft);
    visibility: hidden;
  }
  ._1:hover ._arrow, ._1._open ._arrow {
    visibility: visible;
  }
  /* Invisible copy of the value: gives the cell its width, since the trigger is absolute. */
  ._2 {
    opacity: 0;
    pointer-events: none;
    padding-right: 22px;
    /* Up to 2 lines, like the visible value: this copy is what grows the row, the trigger is absolute. */
    white-space: normal;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  ._list {
    background-color: var(--surface);
    border-radius: 7px;
    box-shadow: rgba(0, 0, 0, 0.24) 0px 3px 8px, 0 0 0 1px var(--layer-edge);
  }
  ._option {
    display: flex;
    align-items: center;
    min-height: 36px;
    padding: 4px 10px;
    border-radius: 6px;
    outline: 1px solid var(--line);
    border: 1px solid transparent;
    background-color: var(--surface);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  ._option:hover {
    background-color: var(--surface-muted);
  }
  /* Same selected look as SelectBox's options. */
  ._option._current {
    outline: 1px solid #5a7be9;
    border-color: #ccd4ff;
    background-color: var(--blue-bg);
    color: #2653eb;
  }
  :global(body.dark) ._option._current {
    outline-color: var(--blue-solid);
    border-color: var(--blue-border);
    color: var(--blue-fg);
  }
</style>
