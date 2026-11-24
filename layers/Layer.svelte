<script lang="ts">
  import type { Snippet } from 'svelte'
  import { tick, untrack } from 'svelte'
import OptionsStrip from '../navigation/OptionsStrip.svelte';
import ButtonList from '../buttons/ButtonList.svelte';
import Button from '../buttons/Button.svelte';
import { Agent } from '../agent/registry';
import { useUI } from '../runtime/index.js';
import { ifcss } from '../utilities/css.js';

  const ui = useUI()

  // svelte-ignore non_reactive_update
  let divLayer: HTMLDivElement
  // Track previous showSideLayer value to detect changes
  let previousShowSideLayer = $state(ui.state.sideLayerId)
  // Track if we're in an opening transition
  let isInTransition = $state(false)

  let {
    children,
    css,
    title,
    titleIcon,
    titleSide,
    subtitle,
    optionsSide,
    titleCss,
    contentCss,
    id,
    type,
    options,
    selected = $bindable(),
    onSave,
    onDelete,
    buttonDeleteOnTitle = false,
    onClose,
    saveButtonName,
    saveButtonIcon,
    contentOverflow,
    width,
    leftPanel,
    leftPanelWidth,
    useLeftPanelBackdrop,
    floatOverContent,
    actionsButton,
    actions,
  }: {
    children: any
    css?: string
    title?: string
    /** Icon class rendered ahead of the title, sizing and colour included. */
    titleIcon?: string
    titleSide?: Snippet
    /** A second line under the title, inside the header, so the header buttons center on both lines. */
    subtitle?: Snippet
    /** Content on the tabs' row, after the tabs: status tags, counters. Drawn only with options. */
    optionsSide?: Snippet
    titleCss?: string
    options?: [number, string, string[]?][]
    contentCss?: string
    selected?: number
    // onSelect?: (e: any) => (void | undefined),
    onSave?: () => void
    onDelete?: () => void
    /** Renders the delete button as a small round button beside the title instead of in the actions. */
    buttonDeleteOnTitle?: boolean
    onClose?: () => void
    saveButtonName?: string
    saveButtonIcon?: string
    contentOverflow?: boolean
    /** The side layer's width in pixels (800 by default). */
    width?: number
    /** A panel left of a side layer, the layer keeping its width while there is room for both.
     *  On a phone it goes inside the layer, below the content. */
    leftPanel?: Snippet
    /** The left panel's width in pixels (360 by default); it narrows first when the screen is short. */
    leftPanelWidth?: number
    /** While the left panel shows, dims and blurs the page behind both panels (4px) instead of
     *  shrinking it beside them; a click on it closes the layer. */
    useLeftPanelBackdrop?: boolean
    /** The side layer floats over the page instead of narrowing it beside the layer. */
    floatOverContent?: boolean
    type: 'side' | 'bottom' | 'content'
    id?: number
    actionsButton?: { name: string; icon: string; css?: string }
    actions?: { id: number; name: string; label?: string; icon: string; handler: () => void }[]
  } = $props()

  // Track visibility to prevent flash before transition starts
  // svelte-ignore state_referenced_locally
  let isVisible = $state(ui.state.deviceType !== 3 || type !== 'side')

  const resolvedSideLayerWidth = $derived.by(() => {
    // Use the layer-local prop as the source of truth and fall back to the CSS default width.
    if (type !== 'side') { return 0 }
    return width || 800
  })

  // The left panel narrows down to this width; past it the layer itself gives up width.
  const LEFT_PANEL_MIN_WIDTH = 280
  // Beside the layer on desktop and tablet. A phone's layer is the whole screen, so there it goes inside.
  const hasLeftPanel = $derived(type === 'side' && !!leftPanel && ui.state.deviceType !== 3)
  // Modal-like: the page behind both panels is dimmed and blurred instead of shrunk beside them.
  const hasBackdrop = $derived(hasLeftPanel && !!useLeftPanelBackdrop)
  const resolvedLeftPanelWidth = $derived(Math.max(leftPanelWidth || 360, LEFT_PANEL_MIN_WIDTH))
  // Both panels together never pass --page-width (zoom or a short screen): the left panel narrows
  // first, down to its minimum, then the layer. Plain CSS, so it follows a resize without listeners.
  const leftPanelCssWidth = $derived(
    `clamp(${LEFT_PANEL_MIN_WIDTH}px, var(--page-width) - ${resolvedSideLayerWidth}px, ${resolvedLeftPanelWidth}px)`)

  const layerCssWidth = $derived.by(() => {
    if (!resolvedSideLayerWidth) { return '' }
    return hasLeftPanel
      ? `min(${resolvedSideLayerWidth}px, var(--page-width) - ${leftPanelCssWidth})`
      : resolvedSideLayerWidth + 'px'
  })

  const contentWidth = $derived.by(() => {
    if (!(ui.state.sideLayerId > 0 && ui.state.sideLayerWidth > 0 && ui.state.deviceType !== 3)) { return undefined }
    // With a left panel, both panels take their full widths or, when short of room, all of --page-width.
    const occupiedWidth = ui.state.leftPanelWidth
      ? `min(${ui.state.sideLayerWidth + ui.state.leftPanelWidth}px, var(--page-width))`
      : `${ui.state.sideLayerWidth}px`
    return `calc(var(--page-width) - ${occupiedWidth} - 8px)`
  })

  $effect(() => {
    // Publish the active side-layer width so sibling content layers can reduce their width.
    // Under a backdrop, or floating over the content, it publishes 0: the page keeps its width behind the layer.
    if (type !== 'side' || ui.state.sideLayerId !== id) { return }

    const nextSideLayerWidth = hasBackdrop || floatOverContent ? 0 : resolvedSideLayerWidth
    untrack(() => {
      if (ui.state.sideLayerWidth !== nextSideLayerWidth) {
        ui.state.sideLayerWidth = nextSideLayerWidth
      }
    })

    return () => {
      untrack(() => {
        if (ui.state.sideLayerWidth === nextSideLayerWidth) {
          ui.state.sideLayerWidth = 0
        }
      })
    }
  })

  $effect(() => {
    // Publish the left panel's width as well, so the content layer leaves room for both panels.
    if (!hasLeftPanel || hasBackdrop || ui.state.sideLayerId !== id) { return }
    const nextLeftPanelWidth = resolvedLeftPanelWidth
    untrack(() => { ui.state.leftPanelWidth = nextLeftPanelWidth })
    return () => {
      untrack(() => { ui.state.leftPanelWidth = 0 })
    }
  })

  // Helper function to close layer with view transition on mobile
  const closeLayer = () => {
    ui.openSideLayer(0)
  }

  // The layer closed by the user: its own Close button or the browser's back button.
  const closeByUser = () => {
    if (ui.state.sideLayerId !== id) { return }
    closeLayer()
    if (onClose) {
      if (ui.state.deviceType === 3) {
        setTimeout(() => { onClose() }, 300)
      } else {
        onClose()
      }
    }
  }

  // While a side layer is open it is a step of the host's history: the browser's back button closes
  // it instead of leaving the route. Closed any other way, the cleanup tells the host.
  let hasBackStep = $state(false)
  $effect(() => {
    if (type !== 'side' || ui.state.sideLayerId !== id || !ui.openBackStep) { return }
    const closeBackStep = untrack(() => ui.openBackStep!(closeByUser))
    hasBackStep = true
    return () => {
      hasBackStep = false
      closeBackStep()
    }
  })

  // The Close button and the backdrop. With a back step they go back through the history like the
  // browser's button, so no entry is left behind to swallow a later back press.
  const closeFromScreen = () => {
    if (hasBackStep && ui.goBackStep) { ui.goBackStep() } else { closeByUser() }
  }

  // React to showSideLayer changes and handle transitions on mobile
  // ONLY handle opening transitions - closing is instant
  $effect(() => {
    // Desktop or non-side layers: visibility is instant
    if (type !== 'side' || ui.state.deviceType !== 3) {
      isVisible = ui.state.sideLayerId === id
      previousShowSideLayer = ui.state.sideLayerId
      return
    }

    // Detect if showSideLayer changed
    if (previousShowSideLayer !== ui.state.sideLayerId) {
      const isOpening = ui.state.sideLayerId === id

      // Only handle opening transitions
      if (isOpening && typeof document.startViewTransition === 'function') {
        // Clear any previous layer's transition name to prevent conflicts
        if (previousShowSideLayer !== 0) {
          const oldLayer = document.querySelector(
            `[data-layer-id="${previousShowSideLayer}"]`,
          )
          if (oldLayer) {
            ;(oldLayer as HTMLElement).style.setProperty(
              'view-transition-name',
              '',
            )
          }
        }

        // Start the view transition for opening
        const transition = document.startViewTransition(async () => {
          // Mark that we're in transition and make it visible ONLY now
          isInTransition = true
          isVisible = true
          // Wait for Svelte to update the DOM
          await tick()
        })

        // Clean up after animation completes
        transition.finished.finally(() => {
          isInTransition = false
        })
      } else if (isOpening) {
        // Fallback or non-mobile: just show it
        isVisible = true
      } else if (previousShowSideLayer === id) {
        // Closing: hide it
        isVisible = false
      }

      previousShowSideLayer = ui.state.sideLayerId
    }
  })

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "Layer",
      label: title || "",
      open: () => {
        if (typeof id === "number" && ui.state.sideLayerId !== id) {
          ui.openSideLayer(id)
        }
      },
      close: () => { closeLayer() },
      ...((options || []).length > 0 ? {
        select: (...ids) => {
          if (ids.length === 0) { return }
          const targetId = String(ids[0])
          const matched = (options || []).find((opt) => String(opt[0]) === targetId)
          if (matched) { selected = matched[0] }
        },
      } : {}),
    })
  })
</script>

{#if ui.state.sideLayerId === id && (type === 'side' || type === 'bottom')}
  {#if hasBackdrop}
    <!-- Below the header, right of the menu bar, under both panels (same z-index, earlier in the DOM). -->
    <button type="button" aria-label={ui.translate("Close|Cerrar")} onclick={closeFromScreen}
      class="fixed top-[var(--header-height)] left-[var(--menu-min-width)] right-0 bottom-0 z-[var(--layer-zindex)] bg-black/35 backdrop-blur-[4px] cursor-default"
    ></button>
  {/if}
  {#if hasLeftPanel}
    <!-- The left panel, flush left of the layer, whose shadow falls over its edge. -->
    <div class="_1 visible flex flex-col px-10 py-10" data-layer-left-panel-id={id}
      style="width: {leftPanelCssWidth}; right: {layerCssWidth};">
      {@render leftPanel?.()}
    </div>
  {/if}
  <div data-id="Layer:{componentID}"
    class={ifcss(css, "flex flex-col w-800 px-12 py-10")}
    bind:this={divLayer}
    data-layer-id={id}
    class:_8={contentOverflow}
    class:_1={type === 'side'}
    class:_2={type === 'bottom'}
    class:beside-left-panel={hasLeftPanel}
    class:in-transition={isInTransition}
    class:visible={isVisible || ui.state.deviceType !== 3 || type !== 'side'}
    style={layerCssWidth ? `width: ${layerCssWidth};` : ''}
  >
    <div class="flex items-center justify-between">
      <div class="flex flex-col overflow-hidden mr-8">
        <div class="flex items-center gap-8 overflow-hidden">
          {#if titleIcon}
            <i class="{titleIcon} shrink-0"></i>
          {/if}
          <div class="overflow-hidden text-nowrap {titleCss}">{ui.translate(title)}</div>
          {#if onDelete && buttonDeleteOnTitle}
            <!-- The base .round is 38px; important sizes shrink it to sit within the title line. -->
            <Button color="red" useCircle shadow="none" icon="icon-[mdi--delete] text-[14px]" label={ui.translate("Delete|Eliminar")}
              css="shrink-0 w-28! h-28! min-w-28! -mt-8" role="delete" onClick={onDelete} />
          {/if}
          {#if titleSide}
            <div class="shrink-0">
              {@render titleSide()}
            </div>
          {/if}
        </div>
        {#if subtitle}
          {@render subtitle()}
        {/if}
      </div>
      <div class="shrink-0 flex items-center mb-2">
        {#if actionsButton && (actions || []).length > 0}
          <div class="mr-10">
            <ButtonList
              name={actionsButton.name}
              icon={actionsButton.icon}
              css={actionsButton.css}
              items={actions || []}
            />
          </div>
        {/if}
        {#if onDelete && !buttonDeleteOnTitle}
          <Button color="red" icon="icon-[mdi--delete]" label={ui.translate("Delete|Eliminar")} css="mr-10 leading-none"
            onClick={onDelete} />
        {/if}
        {#if onSave}
          <Button color="blue" icon={saveButtonIcon || 'icon-[fa--floppy-o]'}
            name={ui.translate(saveButtonName || 'Guardar')} css="mr-10 leading-none"
            label={ui.translate("Save|Guardar")} onClick={onSave} />
        {/if}
        <Button color="yellow" icon="icon-[mdi--close-thick] text-[22px]" label={ui.translate("Close|Cerrar")} onClick={closeFromScreen} />
      </div>
    </div>
    {#if (options || []).length > 0}
      <div class="flex items-center flex-wrap gap-x-16 gap-y-6 mt-4 mb-6">
        <OptionsStrip
          options={options as [number, string][]}
          selected={selected as number}
          useMobileGrid={true}
          onSelect={(e) => {
            selected = e[0]
          }}
        />
        {#if optionsSide}
          {@render optionsSide()}
        {/if}
      </div>
    {/if}
    <div class="_4 grow-1 {contentCss}">{@render children()}</div>
    {#if leftPanel && type === 'side' && ui.state.deviceType === 3}
      <div class="h-[42vh] shrink-0 mt-8">{@render leftPanel()}</div>
    {/if}
  </div>
{/if}

{#if type == 'content'}
  <!-- While a side layer is open it shrinks and clips its children, which keep their full width
       (see .w-page-clipped below), so the content is cut before the layer without reflowing. -->
  <div data-id="Layer:{componentID}" class="w-page" class:w-page-clipped={!!contentWidth} style:width={contentWidth}>
    {@render children()}
  </div>
{/if}

<style>
  ._1 {
    position: fixed;
    top: var(--header-height);
    width: 800px;
    height: calc(100vh - var(--header-height));
    right: 0;
    --surface: var(--panel-surface);
    background-color: var(--surface);
    box-shadow:
      -7px 0px 15px 0px #00000024,
      -3px 1px 5px 0px #00000017,
      0 0 0 1px var(--layer-edge);
    z-index: var(--layer-zindex);
    max-width: 100vw;
    overflow: hidden;
    /* Prevent flash: hidden by default until transition starts or visible class applied */
    opacity: 0;
    visibility: hidden;
  }
  ._2 {
    position: fixed;
    bottom: 0;
    height: auto;
    width: 800px;
    right: 0;
    --surface: var(--panel-surface);
    background-color: var(--surface);
    box-shadow:
      -7px 0px 15px 0px #00000024,
      -3px 1px 5px 0px #00000017,
      0 0 0 1px var(--layer-edge);
    z-index: var(--layer-zindex);
    max-width: 100vw;
    overflow: hidden;
    /* Prevent flash */
    opacity: 0;
    visibility: hidden;
  }
  /* With a left panel the layer's shadow falls over that panel, not the page: a short one, just
     enough to separate the two. */
  ._1.beside-left-panel {
    box-shadow:
      -2px 0px 5px 0px #0000001a,
      0 0 0 1px var(--layer-edge);
  }
  ._1.visible,
  ._2.visible {
    opacity: 1;
    visibility: visible;
  }
  ._1.in-transition,
  ._2.in-transition {
    opacity: 1;
    visibility: visible;
  }
  ._4 {
	  overflow-y: auto;
	  overflow-x: hidden;
	  width: calc(100% + 18px);
	  margin-right: -14px;
	  padding-right: 4px;
	  margin-left: -4px;
	  padding-left: 4px;
	  scrollbar-gutter: stable;
  }
  ._1._8 ._4,
  ._1._8,
  ._2._8 ._4,
  ._2._8 {
    overflow-y: visible;
    overflow-x: visible;
  }

  @media (max-width: 749px) {
    ._4 {
      width: calc(100% + 12px);
      margin-left: -6px;
      margin-right: -6px;
      padding: 0 6px;
    }
    ._1 {
      box-shadow:
        -7px 0px 15px 8px #00000030,
        -3px 1px 5px 2px #0000001c,
        0 0 0 1px var(--layer-edge);
    }
    /* Set view-transition-name only when in transition */
    ._1.in-transition {
      view-transition-name: mobile-side-layer;
    }
    ._11 {
      display: none;
    }
  }

  /* View Transitions for Mobile Layer - Opening Only */
  @keyframes slide-in {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* Prevent default cross-fade */
  ::view-transition-image-pair(mobile-side-layer) {
    isolation: isolate;
  }

  /* Override default group animation */
  ::view-transition-group(mobile-side-layer) {
    animation-duration: 0.35s;
    animation-timing-function: ease-in-out;
  }

  /* When opening: NEW snapshot slides in from the right (off-screen) */
  ::view-transition-new(mobile-side-layer) {
    animation: slide-in 0.35s ease-in-out forwards;
    z-index: 2;
    opacity: 1;
  }

  /* Hide old snapshot completely when opening (no fade effect) */
  ::view-transition-old(mobile-side-layer) {
    opacity: 0 !important;
    animation: none !important;
    display: none !important;
  }

  @media only screen and (min-width: 680px) {
    .w-page {
      overflow: auto;
      padding: 4px;
      margin: -4px;
    }
  }

  /* A side layer is open and has shrunk .w-page: its children keep the full page width and are
     cut where .w-page ends. Clip, never scroll: a scrollbar here makes the page taller, which
     brings up the window's vertical scrollbar, and as --page-width counts it (100vw) both
     scrollbars stay after the layer closes. The min-width applies only here for the same reason. */
  .w-page.w-page-clipped {
    overflow: clip;
  }

  .w-page.w-page-clipped > :global(div) {
    min-width: var(--page-width);
  }
</style>
