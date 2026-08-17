<script lang="ts" generics="T">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import { SvelteMap } from 'svelte/reactivity';
  import Renderer, { type ElementAST } from '../misc/Renderer.svelte';
  import MobileCardsVirtualList from './MobileCardsVirtualList.svelte';
  import { Agent } from '../agent/registry';
  import type { ITableColumn, IMobileCardsListCell } from './types';

  interface TableStreamProps<T> {
    columns: ITableColumn<T>[];
    data?: T[];
    maxRecords: number;
    maxHeight?: string;
    css?: string;
    tableCss?: string;
    onRowClick?: (row: T, index: number, rerender: () => void) => void;
    // Widened to the shared card-list contract so the same props feed table and card mode.
    selected?: T | string | number;
    isSelected?: (row: T, selected: T | string | number) => boolean;
    emptyMessage?: string;
    mobileBreakpointPx?: number;
    mobileCardCss?: string;
  }

  let {
    columns,
    data,
    maxRecords,
    maxHeight = '430px',
    css = '',
    tableCss = '',
    onRowClick,
    selected,
    isSelected,
    emptyMessage = 'No records found.|No se encontraron registros.',
    mobileBreakpointPx = 580,
    mobileCardCss = '',
  }: TableStreamProps<T> = $props();

  let streamRecords = $state<T[]>([]);
  // Per-row version counters bumped when `onRowClick` invokes its `rerender` callback;
  // included in the row `#each` key so only the affected row remounts.
  const rowVersions = new SvelteMap<number, number>();

  const rerenderRow = (rowIndex: number) => {
    rowVersions.set(rowIndex, (rowVersions.get(rowIndex) || 0) + 1);
  };

  // Keep an internal bounded buffer so append operations always enforce maxRecords.
  const normalizeRecords = (incomingRecords: T[]) => {
    const normalizedMaxRecords = Math.max(1, maxRecords || 1);
    return incomingRecords.slice(0, normalizedMaxRecords);
  };

  // Mirrors external data updates while preserving bounded behavior.
  $effect(() => {
    if (data === undefined) return;
    streamRecords = normalizeRecords(data || []);
  });

  const getVisibleColumns = () => columns.filter((columnDefinition) => !columnDefinition.hidden);

  // Narrow screens cannot show a stream table without horizontal scrolling, so the same
  // `column.mobile` contract used by VTable/TableGrid flips the stream into a card list.
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);

  $effect(() => {
    const handleResize = () => {
      windowWidth = window.innerWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  // Flatten `column.mobile` into the shared card-cell shape so the renderer stays the single source of truth.
  const mobileColumns = $derived.by((): IMobileCardsListCell<T, ITableColumn<T>>[] => {
    return columns
      .filter((columnDefinition) => !columnDefinition.hidden && columnDefinition.mobile)
      .sort((a, b) => (a.mobile?.order || 0) - (b.mobile?.order || 0))
      .map((columnDefinition) => ({
        ...columnDefinition,
        source: columnDefinition,
        itemCss: columnDefinition.mobile?.css || 'col-span-full',
        contentCss: columnDefinition.mobile?.contentCss,
        labelTop: columnDefinition.mobile?.labelTop,
        labelLeft: columnDefinition.mobile?.labelLeft,
        labelCss: 'color-label',
        icon: columnDefinition.mobile?.icon,
        iconCss: columnDefinition.mobile?.iconCss,
        elementLeft: columnDefinition.mobile?.elementLeft,
        elementRight: columnDefinition.mobile?.elementRight,
        mobileRender: columnDefinition.mobile?.render,
        if: columnDefinition.mobile?.if,
      }));
  });

  // Card mode only engages when the caller opted in with at least one `mobile` column.
  const isMobileView = $derived(windowWidth < mobileBreakpointPx && mobileColumns.length > 0);

  const getHeaderContent = (columnDefinition: ITableColumn<T>) => {
    return ui.translate(typeof columnDefinition.header === 'function'
      ? columnDefinition.header()
      : columnDefinition.header);
  };

  const getCellValue = (columnDefinition: ITableColumn<T>, rowRecord: T, rowIndex: number) => {
    if (columnDefinition.getValue) {
      return columnDefinition.getValue(rowRecord, rowIndex) as string | number;
    }
    return '';
  };

  const getCellRenderedContent = (columnDefinition: ITableColumn<T>, rowRecord: T, rowIndex: number) => {
    if (!columnDefinition.render) return null;
    return columnDefinition.render(rowRecord, rowIndex) as string | ElementAST | ElementAST[];
  };

  const getRowSelected = (rowRecord: T) => {
    if (!selected || !isSelected) return false;
    return isSelected(rowRecord, selected);
  };

  const appendTop = (incomingRecordOrList: T | T[]) => {
    const incomingRecords = Array.isArray(incomingRecordOrList)
      ? incomingRecordOrList
      : [incomingRecordOrList];

    // Insert newest records at the beginning and trim the tail in one pass.
    streamRecords = normalizeRecords([...incomingRecords, ...streamRecords]);
  };

  const replaceRecords = (incomingRecords: T[]) => {
    streamRecords = normalizeRecords(incomingRecords || []);
  };

  const clearRecords = () => {
    streamRecords = [];
  };

  // Expose imperative handlers so streaming modules can append records without array cloning in parents.
  export { appendTop, replaceRecords, clearRecords };

  const resolveStreamRowId = (rowRecord: T, rowIndex: number): string | number => {
    const fallback = (rowRecord as any)?.ID;
    return fallback === undefined ? rowIndex : (fallback as number | string);
  };

  const componentID = ui.nextComponentId();

  // In card mode MobileCardsVirtualList registers its own CardList handle, so the table
  // must stay unregistered to avoid two agent handles pointing at the same rows.
  const shouldRegisterTable = $derived(Boolean(onRowClick) && !isMobileView);

  $effect(() => {
    if (!shouldRegisterTable) { return; }
    return Agent.register({
      id: componentID,
      type: "Table",
      label: "",
      selectRow: (...ids) => {
        // Composite id ("<tableID>:<rowID>") is what the agent receives in the
        // HTML snapshot; strip the parent prefix to compare against record ids.
        const targets = new Set(
          ids.map((raw) => {
            const s = String(raw);
            const colon = s.indexOf(':');
            return colon >= 0 ? s.slice(colon + 1) : s;
          }),
        );
        for (let i = 0; i < streamRecords.length; i++) {
          const record = streamRecords[i];
          if (targets.has(String(resolveStreamRowId(record, i)))) {
            onRowClick?.(record, i, () => rerenderRow(i));
          }
        }
      },
    });
  });
</script>

<div data-id={shouldRegisterTable ? `Table:${componentID}` : undefined}
  class="stream-table-card {css}">
  {#if isMobileView}
    <div class="stream-mobile-cards" style="max-height: {maxHeight};">
      <MobileCardsVirtualList
        data={streamRecords}
        cells={mobileColumns}
        variant="compact"
        cardCss={`mb-6 ${mobileCardCss}`.trim()}
        nonVirtual={true}
        emptyMessage={emptyMessage}
        selected={selected}
        isSelected={isSelected}
        onRowClick={onRowClick}
        debugName="TableStream"
      />
    </div>
  {:else}
  <div class="stream-table-scroll" style="max-height: {maxHeight};">
    <table class="stream-table {tableCss}">
      <thead>
        <tr>
          {#each getVisibleColumns() as columnDefinition}
            <th class={columnDefinition.headerCss || ''}>
              {getHeaderContent(columnDefinition)}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody data-id={onRowClick ? `TableBody:${componentID}` : undefined}>
        {#if streamRecords.length === 0}
          <tr>
            <td colspan={Math.max(1, getVisibleColumns().length)} class="stream-empty">{ui.translate(emptyMessage)}</td>
          </tr>
        {:else}
          {#each streamRecords as rowRecord, rowIndex (`${rowIndex}_${rowVersions.get(rowIndex) || 0}`)}
            <tr
              data-id={onRowClick ? `Row:${componentID}:${resolveStreamRowId(rowRecord, rowIndex)}` : undefined}
              data-selected={getRowSelected(rowRecord) ? "true" : undefined}
              class:stream-row-selected={getRowSelected(rowRecord)}
              class:stream-row-even={rowIndex % 2 === 0}
              class:stream-row-odd={rowIndex % 2 !== 0}
              onclick={() => onRowClick?.(rowRecord, rowIndex, () => rerenderRow(rowIndex))}
            >
              {#each getVisibleColumns() as columnDefinition}
                {@const renderedCellContent = getCellRenderedContent(columnDefinition, rowRecord, rowIndex)}
                <td class={columnDefinition.css || ''}>
                  {#if typeof renderedCellContent === 'string'}
                    {@html renderedCellContent}
                  {:else if renderedCellContent}
                    <Renderer elements={renderedCellContent}/>
                  {:else}
                    {getCellValue(columnDefinition, rowRecord, rowIndex)}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  {/if}
</div>

<style>
  /* Cards scroll inside the same bounded box the desktop table uses. */
  .stream-mobile-cards {
    overflow-y: auto;
    padding: 8px;
  }

  .stream-table-card {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    overflow: hidden;
  }

  .stream-table-scroll {
    overflow: auto;
  }

  .stream-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  .stream-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #0f172a;
    color: #e2e8f0;
    text-align: left;
    font-weight: 700;
    padding: 10px 8px;
    border-bottom: 1px solid #1e293b;
    white-space: nowrap;
  }

  .stream-table tbody td {
    padding: 8px;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  .stream-row-even {
    background: #f8fafc;
  }

  .stream-row-selected {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
  }

  .stream-empty {
    color: #64748b;
    text-align: center;
    padding: 22px 8px !important;
    font-family: inherit !important;
  }
</style>
