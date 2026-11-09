<script lang="ts" module>
  export interface IKanbanColumn {
    id: number
    name: string
    color?: string
  }
</script>

<script lang="ts" generics="Card">
  import type { Snippet } from 'svelte'
  import { useUI } from '../runtime/index.js'
  const ui = useUI()

  // A board: columns side by side, cards dragged between them. Generic: columns and cards come in
  // as props, the card is drawn by a snippet and a move is reported, never applied. The caller
  // decides what a move means and updates `cards` (or refuses it).
  const { columns, cards, getCardID, getColumnID, card, columnFooter, onmove, canDrag, css = '' }: {
    columns: IKanbanColumn[]
    cards: Card[]
    getCardID: (card: Card) => number
    getColumnID: (card: Card) => number
    card: Snippet<[Card]>
    /** Drawn under a column's header, e.g. its total. */
    columnFooter?: Snippet<[IKanbanColumn, Card[]]>
    onmove: (cardID: number, toColumnID: number) => void
    /** Cards it rejects are not draggable and get no "move to" menu. */
    canDrag?: (card: Card) => boolean
    css?: string
  } = $props()

  const DRAG_START_DISTANCE_PX = 6
  const MIN_COLUMN_SLOTS = 3

  let draggedCardID = $state(0)
  let hoveredColumnID = $state(0)
  let dragOffset = $state({ x: 0, y: 0 })
  // Where the dragged card started on screen: while dragging it is drawn `fixed` from there, since
  // each column scrolls its cards and would clip one moved outside it.
  let dragStartRect = $state({ left: 0, top: 0, width: 0 })
  let pendingDrag: { cardID: number, startX: number, startY: number, rect: DOMRect } | null = null

  const isDraggable = (cardRecord: Card) => canDrag ? canDrag(cardRecord) : true
  const cardsOfColumn = (columnID: number) => cards.filter((cardRecord) => getColumnID(cardRecord) === columnID)
  // Touch scrolls the board sideways, so touch gets a "move to" menu instead of dragging.
  const useDragging = $derived(ui.state.deviceType !== 3)

  const columnIDUnderPointer = (event: PointerEvent) => {
    const columnElement = document.elementsFromPoint(event.clientX, event.clientY)
      .find((element) => (element as HTMLElement).dataset?.kanbanColumn)
    return columnElement ? Number((columnElement as HTMLElement).dataset.kanbanColumn) : 0
  }

  const onPointerDown = (event: PointerEvent, cardRecord: Card) => {
    if (!useDragging || !isDraggable(cardRecord) || event.button !== 0) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    pendingDrag = { cardID: getCardID(cardRecord), startX: event.clientX, startY: event.clientY, rect }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pendingDrag) return
    const movedX = event.clientX - pendingDrag.startX, movedY = event.clientY - pendingDrag.startY
    if (!draggedCardID && Math.hypot(movedX, movedY) < DRAG_START_DISTANCE_PX) return
    if (!draggedCardID) {
      dragStartRect = { left: pendingDrag.rect.left, top: pendingDrag.rect.top, width: pendingDrag.rect.width }
    }
    draggedCardID = pendingDrag.cardID
    dragOffset = { x: movedX, y: movedY }
    hoveredColumnID = columnIDUnderPointer(event)
  }

  const onPointerUp = () => {
    const finishedCardID = draggedCardID, targetColumnID = hoveredColumnID
    const movedCard = cards.find((cardRecord) => getCardID(cardRecord) === finishedCardID)
    pendingDrag = null
    draggedCardID = 0
    hoveredColumnID = 0
    if (movedCard && targetColumnID && targetColumnID !== getColumnID(movedCard)) onmove(finishedCardID, targetColumnID)
  }
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp} />

<!-- The columns share the full width. Fewer than MIN_COLUMN_SLOTS columns still divide it as if the
  missing ones were there, so two columns take two thirds. Past that, each column keeps a minimum width and the board scrolls.
  Given a bounded height (e.g. css="grow min-h-0" in a flex column), a column grows up to it and then scrolls its own cards. -->
<div class="grid grid-rows-[minmax(0,1fr)] gap-10 overflow-x-auto items-start {css}" aria-label="Kanban board"
  style:grid-template-columns="repeat({Math.max(columns.length, MIN_COLUMN_SLOTS)}, minmax(220px, 1fr))">
  {#each columns as column (column.id)}
    {@const columnCards = cardsOfColumn(column.id)}
    <div data-kanban-column={column.id}
      class="min-w-0 max-h-full rounded-lg bg-surface-muted flex flex-col gap-6 p-6 border-2 border-transparent
        {hoveredColumnID === column.id ? 'border-accent-solid!' : ''}">
      <div class="px-4 py-2 flex items-center gap-6">
        <span class="w-10 h-10 rounded-full" style:background={column.color || 'var(--gray-solid)'}></span>
        <span class="ff-bold grow text-fg-soft">{column.name}</span>
        <span class="text-fg-muted">{columnCards.length}</span>
      </div>
      {@render columnFooter?.(column, columnCards)}
      <!-- pr-4 separates the cards from the scrollbar; -mr-4 pushes the scrollbar into the column's padding, so the cards keep their width. -->
      <div class="_cards min-h-0 overflow-y-auto flex flex-col gap-6 pr-4 -mr-4">
      {#each columnCards as cardRecord (getCardID(cardRecord))}
        {@const cardID = getCardID(cardRecord)}
        {@const isDragged = draggedCardID === cardID}
        <div role="listitem"
          class="shrink-0 bg-surface border border-line text-fg rounded-md shadow-sm select-none {isDraggable(cardRecord) && useDragging ? 'cursor-grab' : ''}
            {isDragged ? 'opacity-70 fixed z-50 shadow-lg pointer-events-none' : ''}"
          style:left={isDragged ? `${dragStartRect.left + dragOffset.x}px` : undefined}
          style:top={isDragged ? `${dragStartRect.top + dragOffset.y}px` : undefined}
          style:width={isDragged ? `${dragStartRect.width}px` : undefined}
          onpointerdown={(event) => onPointerDown(event, cardRecord)}>
          {@render card(cardRecord)}
          {#if !useDragging && isDraggable(cardRecord)}
            <select class="w-full border-t border-line px-8 py-6 bg-transparent" aria-label="Move card to column"
              value={column.id} onchange={(event) => onmove(cardID, Number(event.currentTarget.value))}>
              {#each columns as targetColumn}
                <option value={targetColumn.id}>{targetColumn.name}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  /* A column's scrollbar shows only while the column is hovered. It stays transparent, not removed,
     so its gutter keeps the cards from changing width on hover.
     Chrome does not repaint ::-webkit-scrollbar rules keyed on :hover once the pointer leaves, but
     it does repaint when the element's `color` changes: the thumb paints `currentColor`, and only
     the list's color toggles. The cards set their own text color, so they are unaffected. */
  ._cards {
    color: transparent;
  }
  ._cards:hover {
    color: var(--accent-border);
  }
  ._cards::-webkit-scrollbar-track {
    background-color: transparent;
  }
  ._cards::-webkit-scrollbar-thumb {
    background-color: currentColor;
    background-image: none;
  }
  /* Firefox has no ::-webkit-scrollbar. Kept out of Chrome: scrollbar-color there discards the
     ::-webkit-scrollbar styles. */
  @supports not selector(::-webkit-scrollbar) {
    ._cards { scrollbar-color: currentColor transparent; }
  }
</style>
