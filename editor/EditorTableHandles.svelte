<script lang="ts">
  import type { Editor } from "@tiptap/core";
  import { CellSelection, cellAround } from "@tiptap/pm/tables";
  import T from '../misc/T.svelte';
  import {
    editorIconColumnHandle,
    editorIconColumnLeft,
    editorIconColumnRight,
    editorIconDeleteColumn,
    editorIconDeleteRow,
    editorIconDeleteTable,
    editorIconRowAbove,
    editorIconRowBelow,
    editorIconRowHandle,
  } from "./icons";

  type TableLine = 'row' | 'column'

  const { editor, editorFrame, transactionTick }: {
    editor: Editor
    // Positioned (relative) element wrapping the document: handles and menus are placed against it.
    editorFrame: HTMLElement
    // Re-measures the handles after every edit (rows grow while typing, cells get deleted).
    transactionTick: number
  } = $props()

  let hoveredCell = $state.raw<HTMLTableCellElement | null>(null)
  let openMenu = $state<TableLine | null>(null)
  let menuElement = $state<HTMLDivElement>()

  // Hovering a cell shows its row and column handles; hovering the handles themselves keeps them.
  $effect(() => {
    const trackHoveredCell = (ev: MouseEvent) => {
      if (openMenu) return
      const target = ev.target as HTMLElement
      if (target.closest('[data-table-handle]')) return
      const cell = target.closest('td, th') as HTMLTableCellElement | null
      hoveredCell = cell && editorFrame.contains(cell) ? cell : null
    }
    const clearHoveredCell = () => { if (!openMenu) hoveredCell = null }
    editorFrame.addEventListener('mousemove', trackHoveredCell)
    editorFrame.addEventListener('mouseleave', clearHoveredCell)
    return () => {
      editorFrame.removeEventListener('mousemove', trackHoveredCell)
      editorFrame.removeEventListener('mouseleave', clearHoveredCell)
    }
  })

  const handlePositions = $derived.by(() => {
    transactionTick
    if (!hoveredCell?.isConnected) return null
    const table = hoveredCell.closest('table')!
    const frameRect = editorFrame.getBoundingClientRect()
    const cellRect = hoveredCell.getBoundingClientRect()
    const rowRect = hoveredCell.parentElement!.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    return {
      tableLeft: tableRect.left - frameRect.left,
      tableTop: tableRect.top - frameRect.top,
      rowTop: rowRect.top - frameRect.top,
      rowHeight: rowRect.height,
      columnLeft: cellRect.left - frameRect.left,
      columnWidth: cellRect.width,
    }
  })

  // Selects the whole row/column of the hovered cell, so the menu commands apply to it and it is highlighted.
  const selectTableLine = (line: TableLine) => {
    if (!hoveredCell) return
    const { state, view } = editor
    const resolvedCell = cellAround(state.doc.resolve(view.posAtDOM(hoveredCell, 0)))
    if (!resolvedCell) return
    const lineSelection = line === 'row' ? CellSelection.rowSelection(resolvedCell) : CellSelection.colSelection(resolvedCell)
    view.dispatch(state.tr.setSelection(lineSelection))
    view.focus()
    openMenu = line
  }

  const runMenuCommand = (command: () => boolean) => {
    command()
    openMenu = null
    hoveredCell = null
  }

  const closeMenuOnOutsidePointer = (ev: PointerEvent) => {
    if (openMenu && !menuElement?.contains(ev.target as Node)) openMenu = null
  }

  const menuItems = $derived(openMenu === 'row' ? [
    { label: 'Insert row above|Insertar fila arriba', icon: editorIconRowAbove, run: () => editor.chain().focus().addRowBefore().run() },
    { label: 'Insert row below|Insertar fila abajo', icon: editorIconRowBelow, run: () => editor.chain().focus().addRowAfter().run() },
    { label: 'Delete row|Eliminar fila', icon: editorIconDeleteRow, run: () => editor.chain().focus().deleteRow().run() },
    { label: 'Delete table|Eliminar tabla', icon: editorIconDeleteTable, run: () => editor.chain().focus().deleteTable().run() },
  ] : [
    { label: 'Insert column left|Insertar columna a la izquierda', icon: editorIconColumnLeft, run: () => editor.chain().focus().addColumnBefore().run() },
    { label: 'Insert column right|Insertar columna a la derecha', icon: editorIconColumnRight, run: () => editor.chain().focus().addColumnAfter().run() },
    { label: 'Delete column|Eliminar columna', icon: editorIconDeleteColumn, run: () => editor.chain().focus().deleteColumn().run() },
    { label: 'Delete table|Eliminar tabla', icon: editorIconDeleteTable, run: () => editor.chain().focus().deleteTable().run() },
  ])

  const handleCss = "absolute z-40 flex items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-sm cursor-pointer hover:bg-accent-bg hover:border-accent-solid hover:text-accent-fg"
</script>

<svelte:window onpointerdown={closeMenuOnOutsidePointer} />

{#if handlePositions}
  <!-- Row handle: a vertical pill on the table's left border, centered on the hovered row. -->
  <button type="button" data-table-handle
    class="{handleCss} w-14 h-24 {openMenu === 'row' ? 'bg-accent-bg border-accent-solid text-accent-fg' : ''}"
    style="left: {handlePositions.tableLeft - 7}px; top: {handlePositions.rowTop + handlePositions.rowHeight / 2 - 12}px;"
    aria-label="Row options"
    onclick={() => selectTableLine('row')}
  >
    {@html editorIconRowHandle}
  </button>
  <!-- Column handle: a horizontal pill on the table's top border, centered on the hovered column. -->
  <button type="button" data-table-handle
    class="{handleCss} w-24 h-14 {openMenu === 'column' ? 'bg-accent-bg border-accent-solid text-accent-fg' : ''}"
    style="left: {handlePositions.columnLeft + handlePositions.columnWidth / 2 - 12}px; top: {handlePositions.tableTop - 7}px;"
    aria-label="Column options"
    onclick={() => selectTableLine('column')}
  >
    {@html editorIconColumnHandle}
  </button>

  {#if openMenu}
    <div bind:this={menuElement} data-table-handle
      class="absolute z-50 min-w-200 py-4 bg-surface border border-line rounded-[8px] shadow-lg"
      style={openMenu === 'row'
        ? `left: ${handlePositions.tableLeft + 12}px; top: ${handlePositions.rowTop}px;`
        : `left: ${handlePositions.columnLeft}px; top: ${handlePositions.tableTop + 12}px;`}
      role="menu"
      tabindex="-1"
      onkeydown={(ev) => { if (ev.key === 'Escape') openMenu = null }}
    >
      {#each menuItems as item}
        <button type="button" role="menuitem"
          class="flex items-center gap-8 w-full px-12 py-6 text-left text-fg cursor-pointer hover:bg-surface-muted"
          onclick={() => runMenuCommand(item.run)}
        >
          <span class="flex text-[18px] text-fg-muted shrink-0">{@html item.icon}</span>
          <T text={item.label} />
        </button>
      {/each}
    </div>
  {/if}
{/if}
