<script lang="ts" generics="TRecord">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import Renderer, { type ElementAST } from '../misc/Renderer.svelte';
  import CellInput from '../vTable/CellInput.svelte';
  import { createFixedTableVirtualizer } from './vtable-virtual-fixed.svelte';
  import { splitTwoStrings } from '../utilities/ui.js';
  import MobileCardsVirtualList from '../vTable/MobileCardsVirtualList.svelte';
  import T from '../misc/T.svelte';
  import { Agent } from '../agent/registry';
  import {
    setVTableAgentContext,
    buildCellID,
    buildRowID,
    parseChildID,
    rowIndexFromRowID,
    type CellAgentMethods,
  } from '../vTable/agentContext';
  import type {
    IMobileCardsListCell,
    ITableColumn,
    TableGridCellAlign,
    TableGridCellRendererSnippet,
    TableGridHeaderRendererSnippet,
    TableGridRowRendererSnippet,
  } from './types';

  interface TableGridProps<TRecord> {
    columns: ITableColumn<TRecord>[];
    data: TRecord[];
    height?: string;
    rowHeight?: number;
    getRowHeight?: (rowRecord: TRecord, rowIndex: number) => number | undefined;
    bufferSize?: number;
    mobileBreakpointPx?: number;
    useInnerMobilePadding?: boolean;
    css?: string;
    headerCss?: string;
    rowCss?: string;
    cellCss?: string;
    mobileCardCss?: string;
    emptyMessage?: string;
    debug?: boolean;
    onRowClick?: (rowRecord: TRecord, rowIndex: number, rerender: () => void) => void;
    selectedRowId?: string | number;
    selectedRecord?: TRecord;
    getRowId?: (rowRecord: TRecord, rowIndex: number) => string | number;
    cellRenderer?: TableGridCellRendererSnippet<TRecord>;
    headerRenderer?: TableGridHeaderRendererSnippet<TRecord>;
    // When `useRowRenderer(record, idx)` returns true, the row's per-column cells are replaced
    // by `rowRenderer` rendered in a single full-row container (e.g. for section headers).
    useRowRenderer?: (record: TRecord, rowIndex: number) => boolean;
    rowRenderer?: TableGridRowRendererSnippet<TRecord>;
    cellInputType?: 'number';
    // Collapses the header to its content height with no horizontal padding.
    disableHeaderPadding?: boolean;
  }

  interface TableGridPrefixContent {
    prefixHTML?: string;
    prefixAST?: ElementAST | ElementAST[];
  }

  let {
    columns,
    data,
    height = '460px',
    rowHeight = 36,
    getRowHeight,
    bufferSize = 12,
    mobileBreakpointPx = 580,
    useInnerMobilePadding = false,
    css = '',
    headerCss = '',
    rowCss = '',
    cellCss = '',
    mobileCardCss = '',
    emptyMessage = 'No records found.|No se encontraron registros.',
    debug = false,
    onRowClick,
    selectedRowId,
    selectedRecord,
    getRowId,
    cellRenderer,
    headerRenderer,
    useRowRenderer,
    rowRenderer,
    cellInputType,
    disableHeaderPadding = false,
  }: TableGridProps<TRecord> = $props();

  // Two header levels, the same `subcols` contract VTable uses: a column carrying subcolumns becomes
  // a group label and its subcolumns become the real grid tracks. Placement is explicit — the
  // group sits on row 1 spanning its tracks, its subcolumns on row 2 — because auto-placement
  // leaves holes as soon as one column has no subcolumns and has to span both rows.
  const processedColumns = $derived.by(() => {
    const headerGroups: {
      column: ITableColumn<TRecord>, startTrack: number, trackSpan: number, hasOwnSubcols: boolean,
    }[] = [];
    const subHeaders: { column: ITableColumn<TRecord>, startTrack: number }[] = [];
    const flatColumns: ITableColumn<TRecord>[] = [];
    let nextTrack = 1;

    for (const columnDefinition of columns) {
      if (columnDefinition.hidden) { continue; }
      const visibleSubcols = (columnDefinition.subcols || []).filter((subcol) => !subcol.hidden);

      headerGroups.push({
        column: columnDefinition,
        startTrack: nextTrack,
        trackSpan: visibleSubcols.length || 1,
        hasOwnSubcols: visibleSubcols.length > 0,
      });

      for (const subcol of visibleSubcols) {
        subHeaders.push({ column: subcol, startTrack: nextTrack });
        flatColumns.push(subcol);
        nextTrack++;
      }
      if (visibleSubcols.length === 0) {
        flatColumns.push(columnDefinition);
        nextTrack++;
      }
    }

    return { headerGroups, subHeaders, flatColumns, hasSubcols: subHeaders.length > 0 };
  });
  // Keep a stable flattened list so hidden columns never affect row rendering logic.
  const visibleColumns = $derived(processedColumns.flatColumns);
  // Reuse a `VTable`-style mobile contract so existing column definitions can opt into cards incrementally.
  const mobileColumns = $derived.by(() => {
    return visibleColumns
      .filter((columnDefinition) => columnDefinition.mobile)
      .sort((leftColumn, rightColumn) => {
        return (leftColumn.mobile?.order || 0) - (rightColumn.mobile?.order || 0);
      });
  });
  const gridTemplateColumns = $derived(
    visibleColumns
      .map((columnDefinition) => columnDefinition.width || 'minmax(80px, 1fr)')
      .join(' '),
  );
  const normalizedRowHeight = $derived(Math.max(24, Math.round(rowHeight)));
  const resolveRowShellStyle = (rowRecord: TRecord, rowIndex: number): string => {
    const customHeight = getRowHeight?.(rowRecord, rowIndex);
    if (typeof customHeight === 'number' && customHeight > 0) {
      const px = Math.max(24, Math.round(customHeight));
      return `height: ${px}px; --table-grid-row-height: ${px}px;`;
    }
    return 'height: var(--table-grid-row-height);';
  };
  const estimatedMobileCardHeight = $derived(Math.max(128, normalizedRowHeight * 3 + 24));
  const useVirtualScroll = $derived(data.length >= 30);
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  let shellElement = $state<HTMLDivElement | undefined>(undefined);
  let verticalScrollbarWidth = $state(0);

  // Resolve the selected record identity only when a resolver exists.
  const selectedRecordResolvedId = $derived.by(() => {
    if (!selectedRecord || !getRowId) return undefined;
    return getRowId(selectedRecord, -1);
  });

  const getCellValue = (
    rowRecord: TRecord,
    columnDefinition: ITableColumn<TRecord>,
    rowIndex: number,
  ): string | number => {
    if (!columnDefinition.getValue) return '';
    return columnDefinition.getValue(rowRecord, rowIndex);
  };

  const getSplitCellValue = (
    cellValue: string | number,
    columnDefinition: ITableColumn<TRecord>,
  ): [string, string] => {
    if (typeof cellValue !== 'string' || !columnDefinition.splitString) {
      return [String(cellValue ?? ''), ''];
    }

    // Split long labels into two balanced lines so adjacent columns remain visible.
    return splitTwoStrings(cellValue, columnDefinition.splitString);
  };

  const getAlignClassName = (align: TableGridCellAlign | undefined) => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  // Shared header look with VTable: bold 15px, centered unless the column declares an
  // `align` (a right-aligned numeric column keeps its header over the digits), 6px sides.
  // Each default is dropped when `headerCss` already declares that same utility, so a
  // consumer asking for `text-[14px]` or `text-left` still wins.
  const getHeaderBaseClassName = (columnDefinition: ITableColumn<TRecord>) => {
    const declaredCss = `${headerCss} ${columnDefinition.headerCss || ''}`;
    const paddingCss = disableHeaderPadding || /px-|pr-|pl-/.test(declaredCss) ? '' : 'px-6';
    const fontSizeCss = /text-\[|text-xs|text-sm|text-base|text-lg/.test(declaredCss) ? '' : 'text-[15px]';
    const alignCss = /text-left|text-center|text-right/.test(declaredCss)
      ? ''
      : (columnDefinition.align ? getAlignClassName(columnDefinition.align) : 'text-center');
    return `font-bold ${fontSizeCss} ${paddingCss} ${alignCss}`;
  };

  // Reuse the same shared card renderer as VTable/CardsList while keeping grid-specific align classes.
  const mobileCardCells = $derived.by((): IMobileCardsListCell<TRecord, ITableColumn<TRecord>>[] => {
    return mobileColumns.map((columnDefinition) => ({
      ...columnDefinition,
      source: columnDefinition,
      itemCss: columnDefinition.mobile?.css || 'col-span-full',
      contentCss: columnDefinition.mobile?.contentCss || getAlignClassName(columnDefinition.align),
      labelTop: columnDefinition.mobile?.labelTop,
      labelLeft: columnDefinition.mobile?.labelLeft,
      icon: columnDefinition.mobile?.icon,
      iconCss: columnDefinition.mobile?.iconCss,
      elementLeft: columnDefinition.mobile?.elementLeft,
      elementRight: columnDefinition.mobile?.elementRight,
      mobileRender: columnDefinition.mobile?.render,
      // Card cells read `type`; grid columns declare the same intent as `cellInputType`.
      type: columnDefinition.cellInputType,
      if: columnDefinition.mobile?.if,
      onCellClick: columnDefinition.onCellClick,
      disableCellInteractions: columnDefinition.disableCellInteractions,
      showEditIcon: columnDefinition.showEditIcon,
      useRenderer: Boolean(cellRenderer && columnDefinition.useCellRenderer),
    }));
  });
  const isMobileView = $derived(windowWidth < mobileBreakpointPx && mobileCardCells.length > 0);

  const isHtmlContent = (contentValue: unknown): contentValue is string => {
    return typeof contentValue === 'string';
  };

  const getPrefixContent = (
    rowRecord: TRecord,
    columnDefinition: ITableColumn<TRecord>,
    rowIndex: number,
  ): TableGridPrefixContent => {
    const resolvedPrefix: TableGridPrefixContent = {};
    const renderedPrefix = columnDefinition.renderPrefix?.(rowRecord, rowIndex);

    // Match VTable's contract: strings are trusted HTML, AST values go through Renderer.
    if (typeof renderedPrefix === 'string') {
      resolvedPrefix.prefixHTML = renderedPrefix;
    } else if (renderedPrefix) {
      resolvedPrefix.prefixAST = renderedPrefix;
    }

    return resolvedPrefix;
  };

  const getHeaderContent = (columnDefinition: ITableColumn<TRecord>): string => {
    return typeof columnDefinition.header === 'function'
      ? columnDefinition.header()
      : columnDefinition.header;
  };

  const isSelectedRow = (rowRecord: TRecord, rowIndex: number): boolean => {
    // Fast path for record-reference selection used by existing VTable screens.
    if (selectedRecord && rowRecord === selectedRecord) {
      return true;
    }

    if (!getRowId) {
      return false;
    }

    const currentRowId = getRowId(rowRecord, rowIndex);

    // ID-based selection is useful when record references change between fetches.
    if (selectedRowId !== undefined && selectedRowId !== null && currentRowId === selectedRowId) {
      return true;
    }

    // Keep selectedRecord compatible even when parent sends a cloned object.
    if (
      selectedRecordResolvedId !== undefined
      && selectedRecordResolvedId !== null
      && currentRowId === selectedRecordResolvedId
    ) {
      return true;
    }

    return false;
  };

  const isSelectedRowByValue = (
    rowRecord: TRecord,
    selectedValue: TRecord | string | number,
  ): boolean => {
    // Reuse the same selection rules from desktop without mutating parent-bound state.
    if (selectedRecord && rowRecord === selectedRecord) {
      return true;
    }

    const resolvedIndex = data.indexOf(rowRecord);
    const rowIndex = resolvedIndex >= 0 ? resolvedIndex : -1;

    if (typeof selectedValue === 'string' || typeof selectedValue === 'number') {
      if (!getRowId) {
        return false;
      }
      return getRowId(rowRecord, rowIndex) === selectedValue;
    }

    if (selectedValue === rowRecord) {
      return true;
    }

    if (!getRowId) {
      return false;
    }

    const currentRowId = getRowId(rowRecord, rowIndex);
    return getRowId(selectedValue, -1) === currentRowId;
  };

  // Per-row version counters bumped when cell handlers invoke their `rerender` callback;
  // included in the cells' each-key so only the affected row remounts.
  const rowVersions = new SvelteMap<number, number>();

  const rerenderRow = (rowIndex: number) => {
    rowVersions.set(rowIndex, (rowVersions.get(rowIndex) || 0) + 1);
  };

  const handleRowClick = (rowRecord: TRecord, rowIndex: number) => {
    if (debug) {
      console.debug('[TableGrid] row click', { rowIndex, rowRecord });
    }
    onRowClick?.(rowRecord, rowIndex, () => rerenderRow(rowIndex));
  };

  // Custom virtualizer that drives the OUTER shell's scroll (vs. SvelteVirtualList's
  // internal viewport). The shell owns overflow: auto, so the scrollbar appears on
  // the rounded outer container instead of a nested div. Fixed-height variant —
  // rows are pinned via `.table-grid-row { height/max-height: var(--table-grid-row-height); overflow: hidden }`,
  // so no per-row measurement is needed.
  const virtualizer = createFixedTableVirtualizer({
    getScrollElement: () => shellElement ?? null,
    rowHeight: () => normalizedRowHeight,
    overscan: () => bufferSize,
  });

  // Attach the virtualizer once the shell mounts and we're in the virtual branch.
  // Re-runs if useVirtualScroll or isMobileView flips (e.g. row count crosses 30).
  $effect(() => {
    if (isMobileView || !useVirtualScroll) { return; }
    if (!shellElement) { return; }
    const ok = virtualizer.attach();
    if (!ok) { return; }
    return () => virtualizer.detach();
  });

  // Keep the virtualizer's row count in sync with the dataset.
  $effect(() => {
    if (isMobileView || !useVirtualScroll) { return; }
    virtualizer.setCount(data.length);
  });

  // Indices of rows inside the current visible window (with overscan).
  const visibleRowIndices = $derived.by(() => {
    const { start, end } = virtualizer.range;
    const indices: number[] = [];
    for (let i = start; i < end; i++) { indices.push(i); }
    return indices;
  });

  onMount(() => {
    const handleResize = () => {
      windowWidth = window.innerWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  const componentID = ui.nextComponentId();

  // Cells (CellInput / CellSelect) hand their methods here keyed by cellID.
  // The table is the only agent handle; methods route by id.
  const cellRegistry = new Map<number, CellAgentMethods>();

  setVTableAgentContext({
    tableID: componentID,
    registerCell: (cellID, methods) => {
      cellRegistry.set(cellID, methods);
      return () => {
        if (cellRegistry.get(cellID) === methods) { cellRegistry.delete(cellID); }
      };
    },
  });

  // Register when there is any row interaction OR any column with cell editing
  // / selection. Without one of those there's nothing for the agent to drive.
  // Read the flattened columns: under a two-level header the editable cells are the subcolumns,
  // and the group that carries them has no handlers of its own.
  const hasInteractiveCell = $derived(
    visibleColumns.some((column) => column.onCellEdit || column.onCellSelect),
  );
  // Mobile branch hands the agent over to MobileCardsVirtualList (CardList type),
  // so skip registering a Table here to avoid a ghost handle with no rows.
  const shouldRegisterTable = $derived(!isMobileView && (Boolean(onRowClick) || hasInteractiveCell));

  // Row select drives the existing onRowClick. Row IDs are buildRowID(rowIndex)
  // = (rowIndex+1)*100 by convention; cells live in the same row above the row
  // id and below the next one.
  const dispatchRowSelect = (rowID: number) => {
    if (!onRowClick) { return; }
    const rowIndex = rowIndexFromRowID(rowID);
    if (rowIndex < 0 || rowIndex >= data.length) { return; }
    handleRowClick(data[rowIndex], rowIndex);
  };

  $effect(() => {
    if (!shouldRegisterTable) { return; }
    return Agent.register({
      id: componentID,
      type: "Table",
      label: "",
      // Row actions are explicit on TableBody; select remains cell-only.
      ...(onRowClick ? { selectRow: (...ids: (number | string)[]) => {
        for (const rowID of ids) { dispatchRowSelect(parseChildID(rowID)); }
      }} : {}),
      select: (...ids) => {
        if (ids.length === 0) { return; }
        const first = parseChildID(ids[0]);
        cellRegistry.get(first)?.select?.(...ids.slice(1));
      },
      setValueChild: (cellID, value) => {
        cellRegistry.get(parseChildID(cellID))?.setValue?.(value);
      },
      searchChild: (cellID, text) => {
        cellRegistry.get(parseChildID(cellID))?.search?.(String(text ?? ''));
      },
      getOptionsChild: (cellID, max) => {
        return cellRegistry.get(parseChildID(cellID))?.getOptions?.(Number(max ?? 50)) ?? [];
      },
    });
  });
</script>

<!-- One header for both branches: the plain scroll and the virtualized one render the same row,
     and a second level appears only when some column declares `subcols`. -->
{#snippet tableHeaderRow()}
  <div class="table-grid-header table-grid-header-sticky {headerCss}" role="row">
    {#each processedColumns.headerGroups as headerGroup, groupIndex (headerGroup.column.id || groupIndex)}
      {@const headerBaseCss = getHeaderBaseClassName(headerGroup.column)}
      <div class="table-grid-header-cell {headerBaseCss} {headerGroup.column.headerCss || ''}"
        class:_no-header-padding={disableHeaderPadding}
        style="grid-column: {headerGroup.startTrack} / span {headerGroup.trackSpan}; grid-row: {processedColumns.hasSubcols && !headerGroup.hasOwnSubcols ? '1 / span 2' : '1'};"
        role="columnheader"
      >
        {#if headerRenderer}
          {@render headerRenderer(headerGroup.column, groupIndex)}
        {:else}
          <T text={getHeaderContent(headerGroup.column)}/>
        {/if}
      </div>
    {/each}
    {#each processedColumns.subHeaders as subHeader, subHeaderIndex (subHeader.column.id || `sub_${subHeaderIndex}`)}
      {@const headerBaseCss = getHeaderBaseClassName(subHeader.column)}
      <div class="table-grid-header-cell {headerBaseCss} {subHeader.column.headerCss || ''}"
        class:_no-header-padding={disableHeaderPadding}
        style="grid-column: {subHeader.startTrack}; grid-row: 2;"
        role="columnheader"
      >
        {#if headerRenderer}
          {@render headerRenderer(subHeader.column, subHeaderIndex)}
        {:else}
          <T text={getHeaderContent(subHeader.column)}/>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<div data-id={shouldRegisterTable ? `Table:${componentID}` : undefined}
  class="table-grid-shell {css}"
  class:table-grid-shell-mobile={isMobileView}
  bind:this={shellElement}
  style="height: {isMobileView || useVirtualScroll ? height : 'auto'}; max-height: {height}; --table-grid-template-columns: {gridTemplateColumns}; --table-grid-row-height: {normalizedRowHeight}px; --table-grid-scrollbar-width: {verticalScrollbarWidth}px;"
>
  {#if isMobileView}
    <div class="table-grid-mobile-shell"
      class:table-grid-mobile-shell-inner-padding={useInnerMobilePadding}
    >
      <MobileCardsVirtualList
        data={data}
        cells={mobileCardCells}
        variant="compact"
        cardCss={`mb-6 ${mobileCardCss}`.trim()}
        showSelectedCard={true}
        estimateSize={estimatedMobileCardHeight}
        overscan={bufferSize}
        emptyMessage={emptyMessage}
        onRowClick={onRowClick ? handleRowClick : undefined}
        selected={selectedRecord || selectedRowId}
        isSelected={isSelectedRowByValue}
        getRecordIndex={(rowRecord, fallbackIndex) => {
          const resolvedIndex = data.indexOf(rowRecord);
          return resolvedIndex >= 0 ? resolvedIndex : fallbackIndex;
        }}
        debugName="TableGrid"
        useRowRenderer={useRowRenderer}
        rowRenderer={rowRenderer}
        gridCellRenderer={cellRenderer}
      />
    </div>
  {:else if !useVirtualScroll}
    <div class="table-grid-plain-scroll">
      {@render tableHeaderRow()}

      <div data-id={onRowClick ? `TableBody:${componentID}` : undefined} style="display: contents;">
      {#if data.length === 0}
        <div class="table-grid-empty">{ui.translate(emptyMessage)}</div>
      {:else}
        <div class="table-grid-edge-spacer" aria-hidden="true"></div>
        {#each data as rowRecord, rowIndex (getRowId ? getRowId(rowRecord, rowIndex) : rowIndex)}
          {@const selected = isSelectedRow(rowRecord, rowIndex)}
          <div class="table-grid-row {rowCss}"
            class:table-grid-row-even={rowIndex % 2 === 0}
            class:table-grid-row-odd={rowIndex % 2 !== 0}
            class:table-grid-row-selected={selected}
            data-id={onRowClick ? `Row:${componentID}:${buildRowID(rowIndex)}` : undefined}
            data-selected={selected ? "true" : undefined}
            style={resolveRowShellStyle(rowRecord, rowIndex)}
            role="row"
            tabindex="0"
            onclick={() => handleRowClick(rowRecord, rowIndex)}
            onkeydown={(eventInfo) => {
              if (eventInfo.key === 'Enter' || eventInfo.key === ' ') {
                handleRowClick(rowRecord, rowIndex);
              }
            }}
          >
            {#if useRowRenderer?.(rowRecord, rowIndex) && rowRenderer}
              <div class="table-grid-cell tg-row-custom" style="grid-column: 1 / -1;" role="cell">
                {@render rowRenderer(rowRecord, rowIndex)}
              </div>
            {:else}
            {#each visibleColumns as colDef, columnIndex (`${colDef.id || columnIndex}_${rowVersions.get(rowIndex) || 0}`)}
              {@const defaultCellValue = getCellValue(rowRecord, colDef, rowIndex)}
              {@const [splitCellFirstLine, splitCellSecondLine] = getSplitCellValue(defaultCellValue, colDef)}
              {@const prefixContent = getPrefixContent(rowRecord, colDef, rowIndex)}
              {@const combinedCellCss = `${cellCss || ""} ${colDef.css || ""} ${colDef.setCellCss?.(rowRecord) || ""} ${colDef.css || ""}`}
              {@const cellPaddingCss = /px-|pr-|pl-/.test(combinedCellCss) ? "" : "px-6"}
              {@const contentPaddingCss = /px-|pr-|pl-/.test(colDef.css || "") ? "" : "px-6"}
              {@const inputPaddingCss = /px-|pr-|pl-/.test(colDef.inputCss || "") ? "" : "px-6"}

              <div class="table-grid-cell [&:last-child]:border-r-0 {cellPaddingCss} {getAlignClassName(colDef.align)} {combinedCellCss}"
                  class:tg-cell-hover-effect={colDef.showHoverEffect}
                role="cell"
                title={`${defaultCellValue}`}
              >
                <div class="tg-cell-layout">
                  {#if prefixContent.prefixAST}
                    <span class="table-grid-cell-prefix">
                      <Renderer elements={prefixContent.prefixAST}/>
                    </span>
                  {:else if prefixContent.prefixHTML}
                    <span class="table-grid-cell-prefix">
                      {@html prefixContent.prefixHTML}
                    </span>
                  {/if}
                  {#if colDef.onCellEdit && !colDef.disableCellInteractions?.(rowRecord, rowIndex)}
                    <CellInput contentClass={`${contentPaddingCss} ${colDef.css || ""}${colDef.align === 'right' ? ' justify-end' : ''}`}
                      inputClass={`${inputPaddingCss} ${colDef.inputCss || ""}${colDef.align === 'right' ? ' text-right' : ''}`}
                      type={colDef.cellInputType || cellInputType}
                      cellID={buildCellID(rowIndex, columnIndex)}
                      getValue={() => String(defaultCellValue)}
                      render={colDef.render ? () => colDef.render!(rowRecord, rowIndex) : undefined}
                      onBeforeCellChange={colDef.onBeforeCellChange ? (value) => colDef.onBeforeCellChange!(rowRecord, value) : undefined}
                      onChange={(value) => colDef.onCellEdit?.(rowRecord, value, () => rerenderRow(rowIndex))}
                    />
                  {:else if cellRenderer && colDef.useCellRenderer}
                    {@render cellRenderer(rowRecord, colDef, rowIndex)}
                  {:else if colDef.buttonEditHandler || colDef.buttonDeleteHandler}
                    <div class="flex gap-4 items-center justify-center w-full">
                      {#if colDef.buttonEditHandler && (!colDef.buttonEditIf || colDef.buttonEditIf(rowRecord))}
                        <button class="_11 _e" title="edit" onclick={(ev) => {
                          ev.stopPropagation();
                          colDef.buttonEditHandler?.(rowRecord);
                        }}>
                          <i class="icon-[fa--pencil]"></i>
                        </button>
                      {/if}
                      {#if colDef.buttonDeleteHandler && (!colDef.buttonDeleteIf || colDef.buttonDeleteIf(rowRecord))}
                        <button class="_11 _d" title="delete" onclick={(ev) => {
                          ev.stopPropagation();
                          colDef.buttonDeleteHandler?.(rowRecord);
                        }}>
                          <i class="icon-[mdi--delete]"></i>
                        </button>
                      {/if}
                    </div>
                  {:else if colDef.render}
                    {@const renderedContent = colDef.render(rowRecord, rowIndex)}
                    <div class="tg-cell-content" class:tg-cell-line-clamp={colDef.useLineClamp}>
                      {#if isHtmlContent(renderedContent)}
                        {@html renderedContent}
                      {:else}
                        <Renderer elements={renderedContent}/>
                      {/if}
                    </div>
                  {:else if splitCellSecondLine}
                    <div class="tg-cell-content" class:tg-cell-line-clamp={colDef.useLineClamp}>
                      <div>{splitCellFirstLine}</div>
                      <div>{splitCellSecondLine}</div>
                    </div>
                  {:else}
                    <span class="tg-cell-content" class:tg-cell-line-clamp={colDef.useLineClamp}>{defaultCellValue}</span>
                  {/if}
                </div>
              </div>
            {/each}
            {/if}
          </div>
        {/each}
        <div class="table-grid-edge-spacer" aria-hidden="true"></div>
      {/if}
      </div>
    </div>
  {:else}
    {@const range = virtualizer.range}
    {@const topSpacerHeight = range.offsetAtStart}
    {@const bottomSpacerHeight = Math.max(0, virtualizer.totalSize - range.offsetAtEnd)}
    <div class="table-grid-scroll-host use-virtual-scroll">
      {@render tableHeaderRow()}

      <div class="table-grid-body" data-id={onRowClick ? `TableBody:${componentID}` : undefined}>
        <div class="table-grid-virtual-spacer" aria-hidden="true" style="height: {topSpacerHeight}px;"></div>

        {#each visibleRowIndices as rowIndex (`${getRowId ? getRowId(data[rowIndex], rowIndex) : rowIndex}_${rowVersions.get(rowIndex) || 0}`)}
          {@const rowRecord = data[rowIndex]}
          {#if rowRecord}
            {@const selected = isSelectedRow(rowRecord, rowIndex)}
            <div class="table-grid-row {rowCss}"
              use:virtualizer.observeRow={rowIndex}
              class:table-grid-row-even={rowIndex % 2 === 0}
              class:table-grid-row-odd={rowIndex % 2 !== 0}
              class:table-grid-row-selected={selected}
              data-id={onRowClick ? `Row:${componentID}:${buildRowID(rowIndex)}` : undefined}
              data-selected={selected ? "true" : undefined}
              style={resolveRowShellStyle(rowRecord, rowIndex)}
              role="row"
              tabindex="0"
              onclick={() => handleRowClick(rowRecord, rowIndex)}
              onkeydown={(eventInfo) => {
                if (eventInfo.key === 'Enter' || eventInfo.key === ' ') {
                  handleRowClick(rowRecord, rowIndex);
                }
              }}
            >
              {#if useRowRenderer?.(rowRecord, rowIndex) && rowRenderer}
                <div class="table-grid-cell tg-row-custom" style="grid-column: 1 / -1;" role="cell">
                  {@render rowRenderer(rowRecord, rowIndex)}
                </div>
              {:else}
              {#each visibleColumns as colDef, columnIndex (`${colDef.id || columnIndex}_${rowVersions.get(rowIndex) || 0}`)}
                {@const defaultCellValue = getCellValue(rowRecord, colDef, rowIndex)}
                {@const [splitCellFirstLine, splitCellSecondLine] = getSplitCellValue(defaultCellValue, colDef)}
                {@const prefixContent = getPrefixContent(rowRecord, colDef, rowIndex)}
                {@const combinedCellCss = `${cellCss || ""} ${colDef.css || ""} ${colDef.setCellCss?.(rowRecord) || ""} ${colDef.css || ""}`}
                {@const cellPaddingCss = /px-|pr-|pl-/.test(combinedCellCss) ? "" : "px-6"}
                {@const contentPaddingCss = /px-|pr-|pl-/.test(colDef.css || "") ? "" : "px-6"}
                {@const inputPaddingCss = /px-|pr-|pl-/.test(colDef.inputCss || "") ? "" : "px-6"}
                <div class="table-grid-cell [&:last-child]:border-r-0 {cellPaddingCss} {getAlignClassName(colDef.align)} {combinedCellCss}"
                  class:tg-cell-hover-effect={colDef.showHoverEffect}
                  role="cell"
                  title={`${defaultCellValue}`}
                >
                  <div class="tg-cell-layout">
                    {#if prefixContent.prefixAST}
                      <span class="table-grid-cell-prefix">
                        <Renderer elements={prefixContent.prefixAST}/>
                      </span>
                    {:else if prefixContent.prefixHTML}
                      <span class="table-grid-cell-prefix">
                        {@html prefixContent.prefixHTML}
                      </span>
                    {/if}
                    {#if colDef.onCellEdit && !colDef.disableCellInteractions?.(rowRecord, rowIndex)}
                      <CellInput contentClass={`${contentPaddingCss} ${colDef.css || ""}${colDef.align === 'right' ? ' justify-end' : ''}`}
                        inputClass={`${inputPaddingCss} ${colDef.inputCss || ""}${colDef.align === 'right' ? ' text-right' : ''}`}
                        type={colDef.cellInputType || cellInputType}
                        cellID={buildCellID(rowIndex, columnIndex)}
                        getValue={() => String(defaultCellValue)}
                        render={colDef.render ? () => colDef.render!(rowRecord, rowIndex) : undefined}
                        onBeforeCellChange={colDef.onBeforeCellChange ? (value) => colDef.onBeforeCellChange!(rowRecord, value) : undefined}
                        onChange={(value) => colDef.onCellEdit?.(rowRecord, value, () => rerenderRow(rowIndex))}
                      />
                    {:else if cellRenderer && colDef.useCellRenderer}
                      {@render cellRenderer(rowRecord, colDef, rowIndex)}
                    {:else if colDef.buttonEditHandler || colDef.buttonDeleteHandler}
                      <div class="flex gap-4 items-center justify-center w-full">
                        {#if colDef.buttonEditHandler && (!colDef.buttonEditIf || colDef.buttonEditIf(rowRecord))}
                          <button class="_11 _e" title="edit" onclick={(ev) => {
                            ev.stopPropagation();
                            colDef.buttonEditHandler?.(rowRecord);
                          }}>
                            <i class="icon-[fa--pencil]"></i>
                          </button>
                        {/if}
                        {#if colDef.buttonDeleteHandler && (!colDef.buttonDeleteIf || colDef.buttonDeleteIf(rowRecord))}
                          <button class="_11 _d" title="delete" onclick={(ev) => {
                            ev.stopPropagation();
                            colDef.buttonDeleteHandler?.(rowRecord);
                          }}>
                            <i class="icon-[mdi--delete]"></i>
                          </button>
                        {/if}
                      </div>
                    {:else if colDef.render}
                      {@const renderedContent = colDef.render(rowRecord, rowIndex)}
                      <div class="tg-cell-content" class:tg-cell-line-clamp={colDef.useLineClamp}>
                        {#if isHtmlContent(renderedContent)}
                          {@html renderedContent}
                        {:else}
                          <Renderer elements={renderedContent}/>
                        {/if}
                      </div>
                    {:else if splitCellSecondLine}
                      <div class="tg-cell-content" class:tg-cell-line-clamp={colDef.useLineClamp}>
                        <div>{splitCellFirstLine}</div>
                        <div>{splitCellSecondLine}</div>
                      </div>
                    {:else}
                      <span class="tg-cell-content" class:tg-cell-line-clamp={colDef.useLineClamp}>{defaultCellValue}</span>
                      {/if}
                  </div>
                </div>
              {/each}
              {/if}
            </div>
          {/if}
        {/each}

        <div class="table-grid-virtual-spacer" aria-hidden="true" style="height: {bottomSpacerHeight}px;"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .table-grid-shell {
    border: 1px solid var(--line);
    border-radius: 8px;
    background-color: var(--surface);
    overflow: auto;
    min-height: 0;
    box-sizing: border-box;
  }

  .table-grid-shell-mobile {
    border: none;
    width: calc(100% + 8px);
    margin-left: -4px;
    margin-right: -4px;
  }

  .table-grid-scroll-host {
    /* Passive wrapper — the shell owns scrolling now, so this just needs to
       grow with its content (sticky header + spacers + visible rows). */
    min-height: 0;
    border-radius: inherit;
  }

  .table-grid-plain-scroll {
    max-height: inherit;
    /*
    scrollbar-gutter: stable;
    scrollbar-width: auto;
    scrollbar-color: #94a3b8 #f1f5f9;
    */
  }

  .table-grid-edge-spacer {
    height: 2px;
  }
  
  .table-grid-header,
  .table-grid-row {
    display: grid;
    grid-template-columns: var(--table-grid-template-columns);
    width: 100%;
    /* Grow to fit fixed column tracks so the scroll container can scroll horizontally
       when the viewport is narrower than the sum of fixed widths. */
    min-width: min-content;
  }

  .table-grid-header {
    background: var(--surface-soft);
    position: relative;
    z-index: 2;
    padding-left: 2px;
    padding-right: calc(2px + var(--table-grid-scrollbar-width));
    box-sizing: border-box;
  }

  .table-grid-header-sticky {
    position: sticky;
    top: 0;
    z-index: 4;
    padding-left: 0;
    padding-right: 0;
  }

  /* Same header tokens as VTable: 36px tall, own bottom rule, --surface-soft ground. */
  .table-grid-header-cell {
    min-height: 36px;
    border-right: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-strong);
    background-color: var(--surface-soft);
    line-height: 1.1;
    display: grid;
    align-content: center;
    min-width: 0;
  }

  .table-grid-header-cell:last-child {
    border-right: none;
  }

  /* `disableHeaderPadding`: header shrinks to its content, no side padding. */
  .table-grid-header-cell._no-header-padding {
    min-height: 0;
  }

  .table-grid-body {
    min-height: 0;
    position: relative;
    box-sizing: border-box;
  }

  /* Spacers above/below the rendered window; inline `height` extends the body
     to the dataset's full virtual height so the shell's scrollbar reflects it. */
  .table-grid-virtual-spacer {
    width: 100%;
  }

  .table-grid-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 140px;
    color: var(--fg-muted);
    padding: 16px;
  }

  /* Container for caller-provided row renderer; spans every grid column. */
  .tg-row-custom {
    display: flex;
    align-items: center;
    width: 100%;
    border-right: 0;
  }

  /* Edit/delete action-button styles mirror VTable so action columns look consistent. */
  ._11 {
    border-radius: 50%;
    width: 26px;
    height: 26px;
    font-size: 13px;
    color: var(--accent-fg);
    box-shadow: color-mix(in srgb, var(--accent-solid) 62%, transparent) 0px 1px 2px 0px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    cursor: pointer;
    flex-shrink: 0;
  }
  ._11._e {
    color: var(--accent-fg);
    background-color: var(--accent-bg-strong);
  }
  ._11._e:hover {
    outline: 1px solid var(--accent-fg);
    background-color: var(--accent-bg);
  }
  ._11._d {
    color: var(--red-solid);
    background-color: var(--red-bg-strong);
    box-shadow: color-mix(in srgb, var(--red-solid) 70%, transparent) 0px 1px 1px 0px;
  }
  ._11._d:hover {
    background-color: var(--red-solid);
    color: var(--on-solid);
  }

  .table-grid-mobile-shell {
    height: 100%;
    min-height: 0;
  }

  .table-grid-mobile-shell-inner-padding {
    box-sizing: border-box;
  }

  .table-grid-mobile-shell-inner-padding :global(.virtual-list-viewport) {
    padding: 4px;
  }

  .table-grid-mobile-card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 12px;
    cursor: pointer;
    transition: box-shadow 0.2s ease;
  }

  .table-grid-mobile-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .table-grid-mobile-card-selected,
  .table-grid-mobile-card-selected.table-grid-mobile-card:hover {
    background-color: var(--accent-bg);
    outline: 2px solid var(--accent-border);
    outline-offset: -1px;
  }

  .table-grid-mobile-card:focus-visible {
    outline: 2px solid var(--blue-solid);
    outline-offset: -2px;
  }

  .table-grid-mobile-card-grid {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 4px;
  }

  .table-grid-mobile-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .table-grid-mobile-item-vertical {
    flex-direction: column;
    align-items: flex-start;
    row-gap: 0;
  }

  .table-grid-mobile-label-top {
    font-size: 14px;
    color: var(--fg-muted);
    line-height: 1;
  }

  .table-grid-mobile-content-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .table-grid-mobile-label-left {
    font-size: 14px;
    color: var(--fg-muted);
    flex-shrink: 0;
  }

  .table-grid-mobile-left,
  .table-grid-mobile-right {
    flex-shrink: 0;
  }

  .table-grid-mobile-content {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }

  .table-grid-row {
    height: var(--table-grid-row-height);
    max-height: var(--table-grid-row-height);
    overflow: hidden;
    cursor: pointer;
    border-bottom: 1px solid var(--line-soft);
    transition: background-color 0.15s ease;
    position: relative;
    box-sizing: border-box;
  }

  .table-grid-row:focus-visible {
    outline: none;
  }

  .table-grid-row:hover {
    background-color: var(--surface-muted);
  }

  .table-grid-row-even {
    background: var(--surface);
  }

  .table-grid-row-odd {
    background: var(--surface-soft);
  }

  .table-grid-row-selected,
  .table-grid-row-selected.table-grid-row:hover {
    background-color: var(--accent-bg);
    outline: 2px solid var(--accent-border);
    outline-offset: -1px;
    border-radius: 4px;
    border-bottom-color: transparent;
    z-index: 12;
  }

  .table-grid-cell {
    border-right: 1px solid var(--line-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    align-content: center;
    min-width: 0;
    position: relative;
  }

  .table-grid-cell-prefix {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
  }

  .tg-cell-layout {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
  }

  .tg-cell-content {
    flex: 1 1 auto;
    min-width: 0;
  }

  .text-right .tg-cell-content {
    text-align: right;
  }

  .text-center .tg-cell-content {
    text-align: center;
  }

  /* Clamp only the text wrapper; the cell shell keeps sizing, borders, and alignment stable. */
  .tg-cell-line-clamp {
    white-space: normal;
    overflow: hidden;
    text-overflow: clip;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.2;
  }

  .tg-cell-hover-effect:hover {
    outline: 1px solid color-mix(in srgb, var(--fg) 60%, transparent);
    outline-offset: -1px;
  }
  .tg-cell-hover-effect:focus-within {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--purple-solid), inset 0 0 0 2px var(--purple-border);
    background-color: var(--purple-bg);
  }
  
  .table-grid-shell::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

</style>
