// Scale of a NumericSlider: how many ticks, what value each one is worth, and how many
// pixels apart they sit.
//
// The track is not simply `referenceWidth` wide. Its width is `segments × stepPx`, with
// `stepPx` a whole number of pixels, so every tick lands on an integer x and draws as a
// crisp 1px line instead of a blurred 2px one. `referenceWidth` is the target that
// product has to come close to.
//
// Choosing the scale:
//   1. For each allowed count n (6, 8 … 16) the raw step `range / n` is rounded UP to a
//      "nice" value (1, 2, 2.5 or 5 × 10^k). Rounding up means the real number of
//      segments `range / step` is ≤ n; it is discarded when it drops under 6.
//   2. Each distinct step is scored. From most to least weight:
//        - exact: the step divides the range and `min` is a multiple of it, so there is a
//          tick on both ends and every segment is the same width
//        - how far `segments × stepPx` lands from `referenceWidth`
//        - 2.5 reads worse on a scale than 1, 2 or 5
//        - how far `stepPx` is from TARGET_STEP_PX — breaks the tie between two exact
//          scales of the same width (0‥80 → 8 × 38px or 16 × 19px)
//   3. The lowest score wins. n = 16 always yields ≥ 8 segments (a nice ceiling is less
//      than 2× the raw step), so there is always at least one candidate.
//
// Small ranges need no special case: 0‥1 gives a 0.1 step. Float noise (0.1 × 3 =
// 0.30000000000000004) is removed by rounding every derived value to `decimals`, which
// is the "multiply by 100 and divide back" trick done once, in one place.

export const SLIDER_STEP_COUNTS = [6, 8, 10, 12, 14, 16]
const MIN_SEGMENTS = 6
const NICE_MANTISSAS = [1, 2, 2.5, 5, 10]
const MIN_STEP_PX = 8
const TARGET_STEP_PX = 20
const EPSILON = 1e-9

export interface INumericSliderScale {
  min: number
  max: number
  /** Value between two consecutive ticks. */
  tickStep: number
  /** Pixels between two consecutive ticks. Always an integer. */
  stepPx: number
  /** Track width in pixels: `(max - min)` converted with `stepPx / tickStep`. */
  width: number
  /** Tick values, `min` and `max` included, ascending. */
  ticks: number[]
  /** Smallest change the slider can make to the value. */
  resolution: number
  /** Decimals needed to print `tickStep`, `resolution` and every value exactly. */
  decimals: number
  /** Decimals needed to print the VALUE, which only moves by `resolution` between `min`
   *  and `max`: 1‥4 with resolution 1 has 0.5 ticks but prints "3", not "3.0". */
  valueDecimals: number
  /** False when the step does not divide the range: the last segment is shorter. */
  exact: boolean
}

const roundTo = (value: number, decimals: number): number => {
  return Number(value.toFixed(decimals))
}

const countDecimals = (value: number): number => {
  const text = String(value)
  const exponentIndex = text.indexOf("e-")
  if (exponentIndex !== -1) {
    const mantissaText = text.slice(0, exponentIndex)
    const mantissaDecimals = mantissaText.includes(".") ? mantissaText.split(".")[1].length : 0
    return Number(text.slice(exponentIndex + 2)) + mantissaDecimals
  }
  return text.includes(".") ? text.split(".")[1].length : 0
}

/** Smallest nice number (1, 2, 2.5, 5 × 10^k) that is ≥ `raw`. */
const niceCeil = (raw: number): number => {
  const exponent = Math.floor(Math.log10(raw))
  const magnitude = Math.pow(10, exponent)
  for (const mantissa of NICE_MANTISSAS) {
    const candidate = Number((mantissa * magnitude).toPrecision(12))
    if (candidate >= raw * (1 - EPSILON)) { return candidate }
  }
  return Number((10 * magnitude).toPrecision(12))
}

const isMultipleOf = (value: number, step: number): boolean => {
  const ratio = value / step
  return Math.abs(ratio - Math.round(ratio)) < 1e-6
}

/** 5 to 50 sub-positions per tick: 10 → 1, 5 → 1, 2.5 → 0.1, 0.1 → 0.01. */
const defaultResolution = (tickStep: number): number => {
  return Number(Math.pow(10, Math.floor(Math.log10(tickStep / 5) + EPSILON)).toPrecision(12))
}

// On an inexact scale an aligned tick can land a hair away from `min` or `max` (0‥36 with
// step 5 puts one at 35, 1 unit before the end); closer than this fraction of a step it is dropped, so
// the end never reads as a doubled line.
const MIN_END_GAP_STEPS = 0.34

const buildTicks = (min: number, max: number, tickStep: number, decimals: number): number[] => {
  const ticks = [min]
  const minGap = tickStep * MIN_END_GAP_STEPS
  const firstIndex = Math.ceil(min / tickStep - EPSILON)
  const lastIndex = Math.floor(max / tickStep + EPSILON)
  for (let index = firstIndex; index <= lastIndex; index++) {
    const tickValue = roundTo(index * tickStep, decimals)
    if (tickValue - min > minGap && max - tickValue > minGap) { ticks.push(tickValue) }
  }
  ticks.push(max)
  return ticks
}

interface IScaleCandidate {
  tickStep: number
  segments: number
  stepPx: number
  exact: boolean
  score: number
}

const scoreCandidate = (
  tickStep: number, segments: number, min: number, referenceWidth: number,
): IScaleCandidate => {
  const exact = isMultipleOf(segments, 1) && isMultipleOf(min, tickStep)
  const stepPx = Math.max(MIN_STEP_PX, Math.round(referenceWidth / segments))
  const width = Math.round(segments * stepPx)
  const mantissa = tickStep / Math.pow(10, Math.floor(Math.log10(tickStep) + EPSILON))
  const score = (exact ? 0 : 0.5)
    + Math.abs(width - referenceWidth) / referenceWidth
    + (Math.abs(mantissa - 2.5) < EPSILON ? 0.1 : 0)
    + Math.abs(stepPx - TARGET_STEP_PX) * 0.002
  return { tickStep, segments, stepPx, exact, score }
}

export const computeNumericSliderScale = (
  min: number, max: number, referenceWidth: number, resolutionOverride?: number,
): INumericSliderScale => {
  const range = max - min
  if (!(range > 0) || !(referenceWidth > 0)) {
    const width = Math.max(referenceWidth || 0, MIN_STEP_PX)
    return {
      min, max: min, tickStep: 1, stepPx: width, width, ticks: [min], exact: true,
      resolution: resolutionOverride || 1, decimals: countDecimals(resolutionOverride || 1),
      valueDecimals: Math.max(countDecimals(resolutionOverride || 1), countDecimals(min)),
    }
  }

  const candidatesByStep = new Map<number, IScaleCandidate>()
  for (const count of SLIDER_STEP_COUNTS) {
    const tickStep = niceCeil(range / count)
    if (candidatesByStep.has(tickStep)) { continue }
    const segments = range / tickStep
    if (segments < MIN_SEGMENTS - EPSILON) { continue }
    candidatesByStep.set(tickStep, scoreCandidate(tickStep, segments, min, referenceWidth))
  }

  let best: IScaleCandidate | undefined
  for (const candidate of candidatesByStep.values()) {
    if (!best || candidate.score < best.score) { best = candidate }
  }
  // Unreachable (see step 3 in the header), kept so a future change to the constants
  // degrades to one segment per 16th instead of throwing.
  if (!best) { best = scoreCandidate(range / 16, 16, min, referenceWidth) }

  const resolution = resolutionOverride || defaultResolution(best.tickStep)
  const decimals = Math.max(
    countDecimals(best.tickStep), countDecimals(resolution),
    countDecimals(min), countDecimals(max),
  )

  return {
    min, max,
    tickStep: best.tickStep,
    stepPx: best.stepPx,
    width: Math.round(best.segments * best.stepPx),
    ticks: buildTicks(min, max, best.tickStep, decimals),
    resolution,
    decimals,
    valueDecimals: Math.max(countDecimals(resolution), countDecimals(min), countDecimals(max)),
    exact: best.exact,
  }
}

/** Pixel offset of `value` from the left end of the track. */
export const sliderValueToPx = (scale: INumericSliderScale, value: number): number => {
  if (scale.max <= scale.min) { return 0 }
  const pixelsPerUnit = scale.stepPx / scale.tickStep
  return Math.round((value - scale.min) * pixelsPerUnit)
}

/** Clamps to [min, max] and rounds to the scale's resolution. */
export const snapSliderValue = (scale: INumericSliderScale, value: number): number => {
  if (!Number.isFinite(value)) { return scale.min }
  const snapped = roundTo(Math.round(value / scale.resolution) * scale.resolution, scale.decimals)
  return Math.min(scale.max, Math.max(scale.min, snapped))
}

/** Value under a pixel offset from the left end of the track, snapped. */
export const sliderPxToValue = (scale: INumericSliderScale, offsetPx: number): number => {
  if (scale.width <= 0) { return scale.min }
  const pixelsPerUnit = scale.stepPx / scale.tickStep
  return snapSliderValue(scale, scale.min + offsetPx / pixelsPerUnit)
}
