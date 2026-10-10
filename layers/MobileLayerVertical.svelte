<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import { Agent } from '../agent/registry'

  interface Props {
    title?: string
    show?: boolean
    closedHeightPx?: number
    onToggle?: (nextState: boolean) => void
    children?: import('svelte').Snippet
  }

  let {
    title = '',
    show = false,
    closedHeightPx = 64,
    onToggle,
    children,
  }: Props = $props()

  // Keep the interaction explicit so the parent owns the open/close state.
  const toggleLayer = () => {
    onToggle?.(!show)
  }

  // Native-like drag on the header: the panel follows the finger and snaps open/closed on release.
  // The header has touch-action:none, so the browser never turns this gesture into scroll or pull-to-refresh.
  let panelElement: HTMLDivElement
  let dragOffsetPx = $state<number | null>(null) // null = not dragging
  let dragStartY = 0
  let dragStartTime = 0
  let panelTravelPx = 0
  let suppressNextClick = false

  const onHeaderPointerDown = (event: PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragStartY = event.clientY
    dragStartTime = event.timeStamp
    panelTravelPx = panelElement.offsetHeight - closedHeightPx
    suppressNextClick = false
    dragOffsetPx = 0
  }

  const onHeaderPointerMove = (event: PointerEvent) => {
    if (dragOffsetPx !== null) { dragOffsetPx = event.clientY - dragStartY }
  }

  // Snap by flick velocity first, then by distance; a tiny movement is a tap, left to onclick.
  const onHeaderPointerUp = (event: PointerEvent) => {
    if (dragOffsetPx === null) { return }
    const movedPx = event.clientY - dragStartY
    const velocityPxPerMs = movedPx / Math.max(1, event.timeStamp - dragStartTime)
    dragOffsetPx = null
    if (Math.abs(movedPx) < 6) { return }
    suppressNextClick = true
    const shouldOpen = Math.abs(velocityPxPerMs) > 0.5
      ? velocityPxPerMs < 0
      : show ? movedPx < panelTravelPx / 3 : -movedPx > panelTravelPx / 3
    if (shouldOpen !== show) { onToggle?.(shouldOpen) }
  }

  const onHeaderClick = () => {
    if (suppressNextClick) { suppressNextClick = false; return }
    toggleLayer()
  }

  // While dragging, the transform tracks the finger, clamped between open (0) and closed (travel).
  const dragStyle = $derived.by(() => {
    if (dragOffsetPx === null) { return '' }
    const baseOffsetPx = show ? 0 : panelTravelPx
    const translateYPx = Math.min(panelTravelPx, Math.max(0, baseOffsetPx + dragOffsetPx))
    return `transform:translateY(${translateYPx}px);transition:none;`
  })

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "MobileLayerVertical",
      label: title || "",
      open: () => { if (!show) { onToggle?.(true) } },
      close: () => { if (show) { onToggle?.(false) } },
    })
  })
</script>

<div data-id="MobileLayerVertical:{componentID}"
  data-value={show ? "open" : "closed"}
  class="mobile-layer-shell" aria-hidden={!show}>
  <button
    class="mobile-layer-backdrop"
    class:is-visible={show}
    aria-label={ui.translate("Close panel|Cerrar panel")}
    onclick={toggleLayer}
  ></button>

  <div
    bind:this={panelElement}
    class="mobile-layer-panel"
    class:is-open={show}
    style={`--mobile-layer-closed-height:${closedHeightPx}px;${dragStyle}`}
  >
    <button
      class="mobile-layer-header"
      aria-expanded={show}
      aria-label={show ? ui.translate('Hide panel|Ocultar panel') : ui.translate('Show panel|Mostrar panel')}
      onclick={onHeaderClick}
      onpointerdown={onHeaderPointerDown}
      onpointermove={onHeaderPointerMove}
      onpointerup={onHeaderPointerUp}
      onpointercancel={() => { dragOffsetPx = null }}
    >
      <div class="mobile-layer-handle"></div>
      <div class="mobile-layer-title-row">
        <span class="mobile-layer-title">{ui.translate(title)}</span>
        <i class={`icon-${show ? 'down-open' : 'up-open'} mobile-layer-icon`}></i>
      </div>
    </button>

    <div class="mobile-layer-body">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  .mobile-layer-shell {
    position: fixed;
    inset: 0;
    z-index: var(--layer-zindex);
    pointer-events: none;
  }

  .mobile-layer-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: var(--overlay);
    opacity: 0;
    transition: opacity 220ms ease;
    pointer-events: none;
  }

  .mobile-layer-backdrop.is-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .mobile-layer-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: calc(100vh - var(--header-height) - 8px);
    background: var(--surface);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -10px 26px rgb(15 23 42 / 0.22), 0 0 0 1px var(--layer-edge);
    overflow: hidden;
    pointer-events: auto;
    transform: translateY(calc(100% - var(--mobile-layer-closed-height)));
    transition: transform 320ms cubic-bezier(.23,.21,.64,.97);
    will-change: transform;
  }

  .mobile-layer-panel.is-open {
    transform: translateY(0);
  }

  .mobile-layer-header {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 16px 12px;
    border: none;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, var(--surface-soft) 0%, var(--surface) 100%);
    text-align: left;
    touch-action: none;
    user-select: none;
  }

  .mobile-layer-handle {
    width: 44px;
    height: 5px;
    margin: 0 auto;
    border-radius: 999px;
    background: var(--fg-subtle);
  }

  .mobile-layer-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .mobile-layer-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--fg-soft);
  }

  .mobile-layer-icon {
    font-size: 16px;
    color: var(--fg-muted);
  }

  .mobile-layer-body {
    height: calc(100% - 58px);
    overflow: auto;
    /* Scroll stops at the cart's edges instead of chaining to the page (and triggering pull-to-refresh). */
    overscroll-behavior: contain;
    background: var(--surface);
  }

  @media (min-width: 750px) {
    .mobile-layer-shell {
      display: none;
    }
  }
</style>
