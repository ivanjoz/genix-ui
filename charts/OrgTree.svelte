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
    /** Renders one card in a box of exactly cardWidth × cardHeight; also given the item it hangs
     * from (undefined for a root), e.g. to skip a label the boss card already shows. */
    card: Snippet<[T, T | undefined]>
    css?: string
  } & Partial<IOrgTreeSizes> = $props()

  const layout = $derived(layoutOrgTree(roots, { cardWidth, cardHeight, gapX, gapY, gapStack, indent, maxStack }))
</script>

<div class={['relative', css]} style:width="{layout.width}px" style:height="{layout.height}px" aria-label="Org tree">
  <svg class="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height} aria-hidden="true">
    {#each layout.lines as line}
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="var(--fg-subtle, #94a3b8)" stroke-width="2"
        shape-rendering="crispEdges" />
    {/each}
  </svg>
  {#each layout.cards as placedCard}
    <div class="absolute" style:left="{placedCard.x}px" style:top="{placedCard.y}px"
      style:width="{cardWidth}px" style:height="{cardHeight}px">
      {@render card(placedCard.item, placedCard.parent)}
    </div>
  {/each}
</div>
