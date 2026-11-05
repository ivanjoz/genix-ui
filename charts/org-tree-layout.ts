// Compact org-tree layout: pure geometry, no Svelte. Every card has the same fixed size, so the
// whole tree is placed in one pass and drawn with absolute positions.
//
// Space rules, applied at every node:
//   - Children without children of their own (leaves) are stacked in vertical columns with a rail
//     on their left, at most `maxStack` cards per column.
//   - A node whose children are all leaves and fit in one column hangs that column right under its
//     own card (an indented list), instead of opening a horizontal row.
//   - Otherwise the leaf columns come first, then the children with their own team, side by side
//     under a horizontal bar; the parent card is centered over the bar.

export interface IOrgTreeNode<T> {
  item: T
  children: IOrgTreeNode<T>[]
}

export interface IOrgTreeSizes {
  cardWidth: number
  cardHeight: number
  /** Horizontal gap between sibling groups (columns or subtrees). */
  gapX: number
  /** Vertical gap between a parent card and its children's row. */
  gapY: number
  /** Vertical gap between two stacked cards of a column. */
  gapStack: number
  /** Left offset of a stacked card from its column's rail origin. The rail sits at half of it. */
  indent: number
  /** Most cards stacked in one column; more leaves wrap into another column. */
  maxStack: number
}

export interface IOrgTreeCard<T> {
  item: T
  /** The item this card hangs from; undefined for a root. */
  parent?: T
  x: number
  y: number
}

/** A horizontal or vertical connector segment. */
export interface IOrgTreeLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface IOrgTreeLayout<T> {
  width: number
  height: number
  cards: IOrgTreeCard<T>[]
  lines: IOrgTreeLine[]
}

/** A laid-out subtree in local coordinates. `anchorX` is where its incoming connector lands on
 * its top edge (y = 0). */
interface ISubtreeLayout<T> extends IOrgTreeLayout<T> {
  anchorX: number
}

const shiftLayout = <T>(layout: ISubtreeLayout<T>, offsetX: number, offsetY: number): ISubtreeLayout<T> => ({
  width: layout.width,
  height: layout.height,
  anchorX: layout.anchorX + offsetX,
  cards: layout.cards.map((card) => ({ ...card, x: card.x + offsetX, y: card.y + offsetY })),
  lines: layout.lines.map((line) => ({
    x1: line.x1 + offsetX, y1: line.y1 + offsetY, x2: line.x2 + offsetX, y2: line.y2 + offsetY,
  })),
})

/** Splits leaves into the fewest columns of at most maxStack, balanced: 5 with a max of 4 → 3 + 2. */
const chunkLeaves = <T>(leaves: IOrgTreeNode<T>[], maxStack: number): IOrgTreeNode<T>[][] => {
  const columnSize = Math.ceil(leaves.length / Math.ceil(leaves.length / maxStack))
  const columns: IOrgTreeNode<T>[][] = []
  for (let index = 0; index < leaves.length; index += columnSize) {
    columns.push(leaves.slice(index, index + columnSize))
  }
  return columns
}

/** A column of stacked leaf cards whose rail starts at `railTop` (local y) and reaches each card. */
const layoutLeafColumn = <T>(leaves: IOrgTreeNode<T>[], parent: T, sizes: IOrgTreeSizes, railTop: number): ISubtreeLayout<T> => {
  const railX = sizes.indent / 2
  const cards: IOrgTreeCard<T>[] = []
  const lines: IOrgTreeLine[] = []
  leaves.forEach((leaf, index) => {
    const cardY = railTop + sizes.gapStack + index * (sizes.cardHeight + sizes.gapStack)
    cards.push({ item: leaf.item, parent, x: sizes.indent, y: cardY })
    const cardMiddleY = cardY + sizes.cardHeight / 2
    lines.push({ x1: railX, y1: cardMiddleY, x2: sizes.indent, y2: cardMiddleY })
  })
  const lastCard = cards[cards.length - 1]
  lines.push({ x1: railX, y1: railTop, x2: railX, y2: lastCard.y + sizes.cardHeight / 2 })
  return { width: sizes.indent + sizes.cardWidth, height: lastCard.y + sizes.cardHeight, anchorX: railX, cards, lines }
}

const layoutSubtree = <T>(node: IOrgTreeNode<T>, parent: T | undefined, sizes: IOrgTreeSizes): ISubtreeLayout<T> => {
  const { cardWidth, cardHeight } = sizes
  if (node.children.length === 0) {
    return { width: cardWidth, height: cardHeight, anchorX: cardWidth / 2, cards: [{ item: node.item, parent, x: 0, y: 0 }], lines: [] }
  }

  const leaves = node.children.filter((child) => child.children.length === 0)
  const branches = node.children.filter((child) => child.children.length > 0)

  // Only leaves, one column: the column hangs from the parent card's left side (indented list).
  if (branches.length === 0 && leaves.length <= sizes.maxStack) {
    const column = layoutLeafColumn(leaves, node.item, sizes, cardHeight)
    return {
      width: Math.max(cardWidth, column.width),
      height: column.height,
      anchorX: cardWidth / 2,
      cards: [{ item: node.item, parent, x: 0, y: 0 }, ...column.cards],
      lines: column.lines,
    }
  }

  // A row of groups under a horizontal bar: leaf columns first, then the subtrees. A column's rail
  // starts at the bar itself; a subtree gets a stub from the bar down to its card.
  const barY = cardHeight + sizes.gapY / 2
  const rowTop = cardHeight + sizes.gapY
  const groups = [
    ...chunkLeaves(leaves, sizes.maxStack).map((column) => ({ layout: layoutLeafColumn(column, node.item, sizes, 0), top: barY, hasStub: false })),
    ...branches.map((branch) => ({ layout: layoutSubtree(branch, node.item, sizes), top: rowTop, hasStub: true })),
  ]
  let groupX = 0
  const placedGroups = groups.map((group) => {
    const placed = { ...group, layout: shiftLayout(group.layout, groupX, group.top) }
    groupX += group.layout.width + sizes.gapX
    return placed
  })
  const rowWidth = groupX - sizes.gapX

  const firstAnchorX = placedGroups[0].layout.anchorX
  const lastAnchorX = placedGroups[placedGroups.length - 1].layout.anchorX
  // The parent card is centered over the bar; if that pushes it past the left edge, the row shifts right.
  const centeredCardX = (firstAnchorX + lastAnchorX) / 2 - cardWidth / 2
  const rowShiftX = Math.max(0, -centeredCardX)
  const cardX = centeredCardX + rowShiftX
  const parentMiddleX = cardX + cardWidth / 2

  const cards: IOrgTreeCard<T>[] = [{ item: node.item, parent, x: cardX, y: 0 }]
  const lines: IOrgTreeLine[] = [
    { x1: parentMiddleX, y1: cardHeight, x2: parentMiddleX, y2: barY },
    { x1: firstAnchorX + rowShiftX, y1: barY, x2: lastAnchorX + rowShiftX, y2: barY },
  ]
  let height = cardHeight
  for (const group of placedGroups) {
    const layout = shiftLayout(group.layout, rowShiftX, 0)
    if (group.hasStub) lines.push({ x1: layout.anchorX, y1: barY, x2: layout.anchorX, y2: rowTop })
    cards.push(...layout.cards)
    lines.push(...layout.lines)
    height = Math.max(height, group.top + group.layout.height)
  }
  return { width: Math.max(cardX + cardWidth, rowShiftX + rowWidth), height, anchorX: parentMiddleX, cards, lines }
}

/** Lays out a forest: each root's tree side by side, separated by `gapX`. */
export const layoutOrgTree = <T>(roots: IOrgTreeNode<T>[], sizes: IOrgTreeSizes): IOrgTreeLayout<T> => {
  const layout: IOrgTreeLayout<T> = { width: 0, height: 0, cards: [], lines: [] }
  let rootX = 0
  for (const root of roots) {
    const subtree = shiftLayout(layoutSubtree(root, undefined, sizes), rootX, 0)
    layout.cards.push(...subtree.cards)
    layout.lines.push(...subtree.lines)
    layout.width = rootX + subtree.width
    layout.height = Math.max(layout.height, subtree.height)
    rootX = layout.width + sizes.gapX
  }
  return layout
}
