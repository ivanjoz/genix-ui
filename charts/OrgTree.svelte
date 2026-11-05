<script lang="ts" generics="T">
  import type { Snippet } from 'svelte'
  import { layoutOrgTree, type IOrgTreeNode, type IOrgTreeSizes } from './org-tree-layout'

  // A compact org tree: the geometry comes from layoutOrgTree (fixed card size), the cards from the
  // caller's snippet. Leaves stack in columns, teams spread in rows (see org-tree-layout.ts).
  let {
    roots,
    card,
    cardWidth = 220,
    cardHeight = 80,
    gapX = 24,
    gapY = 32,
    gapStack = 10,
    indent = 24,
    maxStack = 4,
    css = '',
  }: {
    roots: IOrgTreeNode<T>[]
    /** Renders one card; it is given a box of exactly cardWidth × cardHeight. */
    card: Snippet<[T]>
    css?: string
  } & Partial<IOrgTreeSizes> = $props()

  const layout = $derived(layoutOrgTree(roots, { cardWidth, cardHeight, gapX, gapY, gapStack, indent, maxStack }))
</script>

<div class={['relative', css]} style:width="{layout.width}px" style:height="{layout.height}px" aria-label="Org tree">
  <svg class="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height} aria-hidden="true">
    {#each layout.lines as line}
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="var(--line-strong, #d1d5db)" stroke-width="1"
        shape-rendering="crispEdges" />
    {/each}
  </svg>
  {#each layout.cards as placedCard}
    <div class="absolute overflow-hidden" style:left="{placedCard.x}px" style:top="{placedCard.y}px"
      style:width="{cardWidth}px" style:height="{cardHeight}px">
      {@render card(placedCard.item)}
    </div>
  {/each}
</div>
