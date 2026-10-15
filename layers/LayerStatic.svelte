<script lang="ts">
  import MobileLayerVertical from '../layers/MobileLayerVertical.svelte'
  import { Agent } from '../agent/registry'
  import { useUI } from '../runtime/index.js'
  const ui = useUI()

  interface Props {
    css?: string
    show?: boolean
    mobileLayerTitle?: string
    useMobileLayerVertical?: number
    // Docks the column to the left edge of the page at this width in px: fixed, flush with the side
    // menu, the header and the window's bottom, whatever the page's padding. An in-flow slot of the
    // same width keeps its place, so the content beside it sizes itself. Desktop only: on mobile it
    // renders nothing and the page provides its own picker.
    dockLeft?: number
    children?: import('svelte').Snippet
  }

  let {
    css,
    show = false,
    mobileLayerTitle = '',
    useMobileLayerVertical,
    dockLeft,
    children,
  }: Props = $props()

  // Desktop keeps the static layer visible. Mobile turns it into an explicit off-canvas panel.
  const isOpen = $derived(ui.state.deviceType !== 3 || show)
  const useVerticalMobileLayer = $derived(
    ui.state.deviceType === 3 && typeof useMobileLayerVertical === 'number',
  )

  // Mobile keeps the drawer collapsed until the user expands it from the title bar.
  let mobileLayerIsOpen = $state(false)

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "LayerStatic",
      label: mobileLayerTitle || "",
      open: () => { mobileLayerIsOpen = true },
      close: () => { mobileLayerIsOpen = false },
    })
  })
</script>

{#if dockLeft}
  <div class="layer-static-dock-slot" style:width="{dockLeft}px">
    <div data-id="LayerStatic:{componentID}" class="layer-static-docked {css || ''}" style:width="{dockLeft}px">
      {@render children?.()}
    </div>
  </div>
{:else if useVerticalMobileLayer}
  <MobileLayerVertical
    title={mobileLayerTitle}
    show={mobileLayerIsOpen}
    closedHeightPx={useMobileLayerVertical}
    onToggle={(nextState) => {
      mobileLayerIsOpen = nextState
    }}
  >
    {@render children?.()}
  </MobileLayerVertical>
{:else}
  <div data-id="LayerStatic:{componentID}"
    data-value={isOpen ? "open" : "closed"}
    class="layer-static {css || ''}"
    class:layer-static-open={isOpen}
    aria-hidden={!isOpen}
  >
    {@render children?.()}
  </div>
{/if}

<style>
  .layer-static-dock-slot {
    flex-shrink: 0;
  }

  .layer-static-docked {
    position: fixed;
    left: var(--menu-min-width);
    top: var(--header-height);
    bottom: 0;
  }

  @media (max-width: 749px) {
    .layer-static-dock-slot {
      display: none;
    }

    .layer-static {
      position: fixed;
      width: 100vw;
      max-width: 100vw;
      transform: translateX(100%);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition:
        transform 0.3s ease,
        opacity 0.3s ease,
        visibility 0.3s ease;
      z-index: var(--layer-zindex);
    }

    .layer-static.layer-static-open {
      transform: translateX(0);
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
  }
</style>
