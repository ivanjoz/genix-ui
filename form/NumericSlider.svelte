<script lang="ts" module>
  export interface INumericSliderProps<T> {
    min: number
    max: number
    /** Target width of the track in px. The real width is `ticks × tickPx`, the product
     *  closest to this with whole-pixel ticks. */
    referenceWidth: number
    saveOn?: T
    save?: keyof T
    /** Initial value when there is no saveOn/save. Clamped and snapped. */
    value?: number
    /** Smallest change the slider can make. Derived from the tick step when omitted. */
    step?: number
    label?: string
    /** A label with more characters than this wraps onto two (or more) centred lines,
     *  about this many characters wide, instead of widening the slider. */
    labelMaxLength?: number
    prefix?: string
    suffix?: string
    /** Values printed under the track at their position. Defaults to `[min, max]`. */
    scaleLabels?: number[]
    disabled?: boolean
    css?: string
    onChange?: (value: number) => void
  }
</script>

<script lang="ts" generics="T">
  // Single-value slider with a tick scale, ported from smartberry. The scale — how many
  // ticks, what each is worth and how far apart they sit — is chosen by
  // computeNumericSliderScale from min, max and referenceWidth; read the header of
  // numeric-slider-scale.ts before changing the geometry.
  //
  // Not a native <input type="range">: its thumb stops a radius short of each end, so the
  // ticks never line up with where the thumb actually sits. This is a div with
  // role="slider", driven by pointer capture and the standard slider keys.
  //
  // Like Input, it writes into `saveOn[save]` while it moves and calls `onChange` once, when
  // the drag (or the key press) ends — so a caller that reloads data on change does not do
  // it thirty times per drag.
  import T from '../misc/T.svelte'
  import { Agent } from '../agent/registry'
  import { useUI } from '../runtime/index.js'
  import {
    computeNumericSliderScale, sliderPxToValue, sliderValueToPx, snapSliderValue,
  } from './numeric-slider-scale'
  const ui = useUI()

  let {
    min, max, referenceWidth, saveOn = $bindable(), save, value: initialValue, step,
    label = '', labelMaxLength, prefix = '', suffix = '', scaleLabels, disabled = false, css = '', onChange,
  }: INumericSliderProps<T> = $props()

  const scale = $derived(computeNumericSliderScale(min, max, referenceWidth, step))

  let sliderValue = $state(0)
  let railElement = $state<HTMLDivElement>()
  let dragActive = false
  let dragStartValue = 0

  // Follows saveOn[save] (in-place changes included, like DateInput) and the scale.
  $effect(() => {
    const savedValue = saveOn && save ? saveOn[save] : undefined
    const sourceValue = typeof savedValue === 'number' ? savedValue : (initialValue ?? scale.min)
    sliderValue = snapSliderValue(scale, sourceValue)
  })

  const updateValue = (nextValue: number): number => {
    const snapped = snapSliderValue(scale, nextValue)
    if (saveOn && save) { saveOn[save] = snapped as NonNullable<T>[keyof T] }
    sliderValue = snapped
    return snapped
  }

  const commitValue = (previousValue: number, committedValue: number) => {
    if (previousValue === committedValue) { return }
    onChange?.(committedValue)
  }

  const valueFromPointer = (clientX: number): number => {
    if (!railElement) { return sliderValue }
    return sliderPxToValue(scale, clientX - railElement.getBoundingClientRect().left)
  }

  const handlePointerDown = (ev: PointerEvent) => {
    if (disabled || ev.button !== 0) { return }
    const rail = ev.currentTarget as HTMLDivElement
    rail.setPointerCapture(ev.pointerId)
    rail.focus()
    dragActive = true
    dragStartValue = sliderValue
    updateValue(valueFromPointer(ev.clientX))
  }

  const handlePointerMove = (ev: PointerEvent) => {
    if (!dragActive) { return }
    updateValue(valueFromPointer(ev.clientX))
  }

  const handlePointerUp = (ev: PointerEvent) => {
    if (!dragActive) { return }
    dragActive = false
    commitValue(dragStartValue, updateValue(valueFromPointer(ev.clientX)))
  }

  const handleKeyDown = (ev: KeyboardEvent) => {
    if (disabled) { return }
    const keyTargets: Record<string, number> = {
      ArrowLeft: sliderValue - scale.resolution,
      ArrowDown: sliderValue - scale.resolution,
      ArrowRight: sliderValue + scale.resolution,
      ArrowUp: sliderValue + scale.resolution,
      PageDown: sliderValue - scale.tickStep,
      PageUp: sliderValue + scale.tickStep,
      Home: scale.min,
      End: scale.max,
    }
    if (!(ev.key in keyTargets)) { return }
    ev.preventDefault()
    commitValue(sliderValue, updateValue(keyTargets[ev.key]))
  }

  const formatValue = (numberValue: number, decimals: number) => {
    return `${prefix}${numberValue.toFixed(decimals)}${suffix}`
  }

  // Below this distance (px) the value label would overlap a scale label, which is then
  // hidden instead of printed underneath it.
  const SCALE_LABEL_CLEARANCE_PX = 26

  const valuePx = $derived(sliderValueToPx(scale, sliderValue))
  const visibleScaleLabels = $derived(
    (scaleLabels ?? [scale.min, scale.max])
      .map((labelValue) => ({ labelValue, labelPx: sliderValueToPx(scale, labelValue) }))
      .filter(({ labelPx }) => Math.abs(labelPx - valuePx) > SCALE_LABEL_CLEARANCE_PX),
  )
  const wrapLabel = $derived(!!labelMaxLength && label.length > labelMaxLength)

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: 'NumericSlider',
      label: label || '',
      setValue: (value: string | number) => {
        const previousValue = sliderValue
        commitValue(previousValue, updateValue(Number(value)))
      },
    })
  })
</script>

<div class="_root {disabled ? '_disabled' : ''} {css}"
  style="--track-w: {scale.width}px; --value-x: {valuePx}px"
  data-id="NumericSlider:{componentID}"
  data-value={sliderValue}
  data-label={label}
  data-type="other"
>
  {#if label}
    <div class="_label {wrapLabel ? '_label-wrap' : ''}" style={wrapLabel ? `--label-max-ch: ${labelMaxLength}ch` : ''}>
      <T text={label} />
    </div>
  {/if}

  <div bind:this={railElement} class="_rail"
    role="slider" tabindex={disabled ? -1 : 0}
    aria-label={label ? ui.translate(label) : undefined}
    aria-valuemin={scale.min} aria-valuemax={scale.max} aria-valuenow={sliderValue}
    aria-valuetext={formatValue(sliderValue, scale.valueDecimals)}
    aria-disabled={disabled || undefined}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onkeydown={handleKeyDown}
  >
    <div class="_track"><div class="_fill"></div></div>
    {#each scale.ticks as tickValue (tickValue)}
      <!-- A 1px line starting at x covers [x, x+1]: the one on `max` is pulled back a
           pixel so it stays inside the track instead of hanging off its end. -->
      <span class="_tick" style="--x: {Math.min(sliderValueToPx(scale, tickValue), scale.width - 1)}px"></span>
    {/each}
    <div class="_thumb"></div>
  </div>

  <div class="_scale-labels">
    {#each visibleScaleLabels as { labelValue, labelPx } (labelValue)}
      <span class="_end-label" style="left: {labelPx}px">{labelValue}</span>
    {/each}
    <span class="_value-label">{formatValue(sliderValue, scale.valueDecimals)}</span>
  </div>
</div>

<style>
  /* Geometry comes from two custom properties set inline: --track-w (the whole-pixel width
     chosen by numeric-slider-scale.ts) and --value-x (the thumb's offset from the left
     end). Each tick carries its own --x.

     The root is padded by the thumb radius on both sides so the thumb can sit centred on
     `min` and `max` without being clipped, and so x = 0 inside ._rail is exactly `min`. */
  ._root {
    --slider-thumb-d: 22px;
    --slider-track-h: 8px;
    --slider-tick-h: 4px;
    --slider-fill: var(--slider-fill-color, #5f5fe3);
    --slider-rest: var(--slider-rest-color, #cfd0dc);
    display: inline-flex;
    flex-direction: column;
    padding: 0 calc(var(--slider-thumb-d) / 2);
    user-select: none;
  }

  /* Centred over the track: the negative margin on BOTH sides undoes the root's padding, so
     the label spans the full root width and its centre is the track's centre. */
  ._label {
    color: var(--input-label-color, #6d5dad);
    font-size: 15px;
    font-family: bold;
    line-height: 1.2;
    text-align: center;
    margin: 0 calc(var(--slider-thumb-d) / -2) 4px;
  }

  /* labelMaxLength: a long label wraps, centred, instead of widening the slider. */
  ._label-wrap {
    max-width: var(--label-max-ch);
    align-self: center;
    margin-left: 0;
    margin-right: 0;
  }

  ._rail {
    position: relative;
    width: var(--track-w);
    height: calc(var(--slider-thumb-d) + 2px);
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  ._track {
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: var(--slider-track-h);
    transform: translateY(-50%);
    border-radius: calc(var(--slider-track-h) / 2);
    background: var(--slider-rest);
    overflow: hidden;
  }

  ._fill {
    width: var(--value-x);
    height: 100%;
    background: var(--slider-fill);
  }

  /* Drawn under the track and sticking out --slider-tick-h below it. */
  ._tick {
    position: absolute;
    left: var(--x);
    top: calc(50% + var(--slider-track-h) / 2);
    width: 1px;
    height: var(--slider-tick-h);
    background: #b3b6c7;
  }

  ._thumb {
    position: absolute;
    top: 50%;
    left: var(--value-x);
    width: var(--slider-thumb-d);
    height: var(--slider-thumb-d);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #fff;
    border: 1px solid #c9cad6;
    box-shadow: 0 1px 4px rgb(40 40 70 / 25%);
    transition: box-shadow 0.12s;
  }

  ._rail:focus-visible ._thumb,
  ._rail:active ._thumb {
    box-shadow: 0 1px 4px rgb(40 40 70 / 25%), 0 0 0 4px rgb(95 95 227 / 25%);
  }

  ._scale-labels {
    position: relative;
    width: var(--track-w);
    height: 18px;
    margin-top: 2px;
    line-height: 18px;
  }

  ._end-label,
  ._value-label {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  ._end-label {
    font-size: 12px;
    color: #9a9cad;
  }

  ._value-label {
    left: var(--value-x);
    font-size: 14px;
    font-weight: 700;
    color: #3b3d4f;
  }

  ._disabled {
    opacity: 0.55;
  }

  ._disabled ._rail {
    cursor: not-allowed;
  }
</style>
