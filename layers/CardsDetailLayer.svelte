<script lang="ts" generics="T">
  import type { Snippet } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { Agent } from '../agent/registry'
  import { useUI } from '../runtime/index.js'

  // A scrolling list of cards. Clicking a card opens its detail in a side layer that slides in from
  // the right INSIDE this container (not over the page), over a dimmed and blurred backdrop that
  // closes it on click. Give the container its height and background
  // through `css`.
  interface Props {
    items: T[]
    getKey: (item: T) => number | string
    card: Snippet<[item: T, isSelected: boolean]>
    detail: Snippet<[item: T]>
    // Header of the side layer, next to the close button: a title and any summary lines under it.
    detailHeader?: Snippet<[item: T]>
    // Width of the side layer on desktop; below 750px it always covers the whole container.
    detailWidth?: string
    css?: string
    // Added to the container only while a detail is open, e.g. a frame around the open panel.
    openCss?: string
    empty?: Snippet
  }

  let { items, getKey, card, detail, detailHeader, detailWidth = '65%', css = '', openCss = '', empty }: Props = $props()

  const ui = useUI()
  const componentID = ui.nextComponentId()

  let selectedKey = $state<number | string | null>(null)
  // A selected key whose item left the list (reloaded or filtered out) closes the layer.
  const selectedItem = $derived(selectedKey === null ? undefined : items.find((item) => getKey(item) === selectedKey))

  // Clicking the open card again closes its detail.
  const toggleCard = (key: number | string) => {
    selectedKey = selectedKey === key ? null : key
  }

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: 'CardsDetailLayer',
      label: '',
      select: (...ids) => {
        const matchedItem = items.find((item) => String(getKey(item)) === String(ids[0]))
        if (matchedItem) { selectedKey = getKey(matchedItem) }
      },
      close: () => { selectedKey = null },
    })
  })
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape' && selectedItem) { selectedKey = null } }} />

<!-- overflow-clip, not overflow-hidden: a hidden box is still a scroll container, so the browser can
     scroll it a few pixels (wheel chaining, focus) and drag the pinned panel off its top edge. -->
<div data-id="CardsDetailLayer:{componentID}" data-value={selectedItem ? String(selectedKey) : ''}
  class="relative overflow-clip {css} {selectedItem ? openCss : ''}">
  <!-- The padding leaves room for the cards' shadows, which the scroll box would otherwise clip. -->
  <div class="cards-detail-scroll h-full overflow-y-auto flex flex-col gap-12 p-10">
    {#each items as item (getKey(item))}
      {@const itemKey = getKey(item)}
      <button type="button" data-id="Option:{itemKey}" data-selected={itemKey === selectedKey ? 'true' : undefined}
        class="block w-full text-left cursor-pointer" onclick={() => toggleCard(itemKey)}>
        {@render card(item, itemKey === selectedKey)}
      </button>
    {:else}
      {@render empty?.()}
    {/each}
  </div>

  <!-- A borderless panel flush with the container's right edge: it slides in from that edge when a
       card opens and back out when it closes. Switching cards only swaps the keyed body, so the panel
       stays put and the new detail starts scrolled to the top. -->
  {#if selectedItem}
    <!-- Dimmed, blurred backdrop over the cards the panel leaves visible; clicking it closes the detail. -->
    <button type="button" aria-label="Cerrar detalle" data-value="close"
      class="absolute inset-0 bg-gray-900/[12.5%] backdrop-blur-[3px] cursor-default"
      onclick={() => { selectedKey = null }}
      transition:fade={{ duration: 200 }}></button>
    <div class="cards-detail-layer absolute top-0 right-0 bottom-0 flex flex-col bg-white"
      style:--detail-width={detailWidth}
      transition:fly={{ x: '100%', opacity: 1, duration: 260, easing: cubicOut }}>
      <div class="flex items-start gap-8 pl-20 pr-10 pt-12 pb-4">
        <div class="grow min-w-0 pt-4">{@render detailHeader?.(selectedItem)}</div>
        <button type="button" aria-label="Cerrar" data-value="close"
          class="w-32 h-32 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
          onclick={() => { selectedKey = null }}>
          <i class="icon-[mdi--close] text-[20px]"></i>
        </button>
      </div>
      {#key selectedKey}
        <div class="cards-detail-scroll grow min-h-0 overflow-y-auto px-20 pt-8 pb-20">
          {@render detail(selectedItem)}
        </div>
      {/key}
    </div>
  {/if}
</div>

<style>
  .cards-detail-layer {
    width: var(--detail-width);
    /* No border or radius of its own: the container's clip and rounding shape its right corners, and
       a frame belongs on the container as an outline (drawn outside the clip, so never cut). */
    box-shadow: -10px 0 28px -14px rgb(0 0 0 / 0.3);
  }
  .cards-detail-scroll {
    scrollbar-width: thin;
  }
  @media (max-width: 749px) {
    .cards-detail-layer {
      width: 100%;
    }
  }
</style>
