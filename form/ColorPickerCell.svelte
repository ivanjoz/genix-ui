<script lang="ts" generics="T">
  import { untrack } from 'svelte';
  import ColorPicker from 'svelte-awesome-color-picker';
  import { getVTableAgentContext } from '../vTable/agentContext';

  // In-cell homologue of ColorPicker: no FieldShell chrome, the swatch fills the table cell.
  let {
    saveOn = $bindable(),
    save,
    css = '',
    onChange,
    cellID,
  }: {
    saveOn: T
    save: keyof T
    css?: string
    // Fires once when the popup closes with a different color, not on every drag step.
    onChange?: (newValue: string) => void
    // Same coordinate scheme as CellInput; only needed for the table's agent handle.
    cellID?: number
  } = $props();

  const readColor = () => ((saveOn?.[save] as string) || '#FFFFFF')

  let currentColor = $state(readColor())
  let isOpen = $state(false)
  let colorWhenOpened = ''
  let cellElement = $state<HTMLDivElement>()
  let popupTop = $state(0)
  let popupLeft = $state(0)

  // Follow external changes (row reorder, form reset) unless the user is mid-pick.
  $effect(() => {
    const storedColor = readColor()
    if (!isOpen && storedColor !== currentColor) { currentColor = storedColor }
  })

  const writeColor = (hexColor: string) => {
    currentColor = hexColor
    if (saveOn) { saveOn[save] = hexColor as NonNullable<T>[keyof T] }
  }

  // Popup height incl. the library's wrapper padding/margin; used to flip it above the cell.
  const POPUP_HEIGHT = 300

  // The table body scrolls with overflow hidden, so an absolute popup gets clipped:
  // anchor it to the viewport from the cell's rect instead.
  $effect(() => {
    if (!isOpen || !cellElement) { return }
    // Untracked: dragging changes currentColor and must not re-run (and close) this effect.
    colorWhenOpened = untrack(() => currentColor)
    const cellRect = cellElement.getBoundingClientRect()
    const fitsBelow = cellRect.bottom + POPUP_HEIGHT < window.innerHeight
    popupTop = fitsBelow ? cellRect.bottom : cellRect.top - POPUP_HEIGHT
    popupLeft = cellRect.left

    // A fixed popup would detach from its cell when anything scrolls; close it instead.
    const closeOnScroll = (ev: Event) => {
      if (!(ev.target instanceof Node) || !cellElement?.contains(ev.target)) { isOpen = false }
    }
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true)
      if (onChange && currentColor !== colorWhenOpened) { onChange(currentColor) }
    }
  })

  const tableAgentCtx = getVTableAgentContext()

  $effect(() => {
    if (!tableAgentCtx || cellID === undefined) { return }
    return tableAgentCtx.registerCell(cellID, {
      setValue: (value) => {
        const hexColor = String(value || '')
        if (!hexColor || hexColor === currentColor) { return }
        writeColor(hexColor)
        if (onChange) { onChange(hexColor) }
      },
    })
  })

  const agentDataID = $derived(
    tableAgentCtx && cellID !== undefined ? `${tableAgentCtx.tableID}:${cellID}` : undefined,
  )
</script>

<div bind:this={cellElement}
  class="_1 {css} absolute inset-0 flex items-center justify-center"
  style:--popup-top="{popupTop}px"
  style:--popup-left="{popupLeft}px"
  data-id={agentDataID}
  data-cell-type={agentDataID ? 'ColorPickerCell' : undefined}
  data-value={currentColor}
  data-label={String(save || '')}
  data-type="color"
>
  <ColorPicker isAlpha={false} textInputModes={[]}
    position="fixed"
    bind:isOpen
    hex={currentColor}
    onInput={color => { if (isOpen && color.hex) { writeColor(color.hex) } }}
  />
</div>

<style>
  ._1 {
    --slider-width: 24px;
    border: 1px solid transparent;
  }
  ._1:hover {
    border-color: color-mix(in srgb, var(--fg) 60%, transparent);
  }
  /* The library sizes the label box to a 25px circle and overflows a wider swatch from it,
     which shifts it off-centre: size the box to the swatch so flex centring holds. */
  ._1 :global(.color-picker label) {
    font-size: 0;
    line-height: 0;
    margin: 0;
    gap: 0;
    height: 24px;
  }
  ._1 :global(.color-picker label .container) {
    width: 54px;
    height: 24px;
  }
  ._1 :global(.color-picker .color),
  ._1 :global(.color-picker .alpha) {
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 5px;
  }
  ._1 :global(.color-picker .color) {
    border: 2px solid var(--fg);
  }
  ._1 :global(.color-picker .wrapper[role='dialog']) {
    position: fixed;
    top: var(--popup-top);
    left: var(--popup-left);
    z-index: 50;
  }
</style>
