import { describe, expect, it } from "bun:test"

import {
  computeNumericSliderScale, SLIDER_STEP_COUNTS, sliderPxToValue, sliderValueToPx,
  snapSliderValue,
} from "./numeric-slider-scale"

describe("computeNumericSliderScale", () => {
  it("0‥100 at 300px: 10 ticks of 10, 30px each", () => {
    const scale = computeNumericSliderScale(0, 100, 300)
    expect(scale.tickStep).toBe(10)
    expect(scale.stepPx).toBe(30)
    expect(scale.width).toBe(300)
    expect(scale.exact).toBe(true)
    expect(scale.resolution).toBe(1)
    expect(scale.ticks).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
  })

  it("0‥1 uses decimal ticks without float noise", () => {
    const scale = computeNumericSliderScale(0, 1, 300)
    expect(scale.tickStep).toBe(0.1)
    expect(scale.resolution).toBe(0.01)
    expect(scale.decimals).toBe(2)
    expect(scale.ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
  })

  it("a range no nice step divides keeps min and max and a short last segment", () => {
    const scale = computeNumericSliderScale(0, 37, 300)
    expect(scale.exact).toBe(false)
    expect(scale.tickStep).toBe(5)
    expect(scale.ticks[0]).toBe(0)
    expect(scale.ticks.at(-1)).toBe(37)
  })

  it("ticks align to multiples of the step when min is not one", () => {
    const scale = computeNumericSliderScale(3, 97, 300)
    expect(scale.ticks).toEqual([3, 10, 20, 30, 40, 50, 60, 70, 80, 90, 97])
  })

  it("drops an aligned tick that would sit on top of an end", () => {
    const scale = computeNumericSliderScale(0, 36, 300)
    expect(scale.ticks).not.toContain(35)
    expect(scale.ticks.at(-1)).toBe(36)
  })

  it("every exact scale uses one of the allowed step counts and whole-pixel ticks", () => {
    const ranges: [number, number, number][] = [
      [0, 100, 300], [0, 1, 300], [0, 80, 160], [0, 80, 480], [-20, 40, 360],
      [0, 10000, 400], [0, 0.05, 240], [0, 7, 200],
    ]
    for (const [min, max, referenceWidth] of ranges) {
      const scale = computeNumericSliderScale(min, max, referenceWidth)
      const segments = scale.ticks.length - 1
      expect(SLIDER_STEP_COUNTS).toContain(segments)
      expect(Number.isInteger(scale.stepPx)).toBe(true)
      expect(scale.width).toBe(segments * scale.stepPx)
      expect(Math.abs(scale.width - referenceWidth) / referenceWidth).toBeLessThan(0.1)
    }
  })

  it("the resolution override wins over the derived one", () => {
    expect(computeNumericSliderScale(0, 100, 300, 5).resolution).toBe(5)
  })

  it("an empty range degrades to a single tick instead of throwing", () => {
    const scale = computeNumericSliderScale(5, 5, 300)
    expect(scale.ticks).toEqual([5])
    expect(sliderValueToPx(scale, 5)).toBe(0)
  })
})

describe("value ↔ px", () => {
  const scale = computeNumericSliderScale(0, 1, 300)

  it("snaps and clamps", () => {
    expect(snapSliderValue(scale, 0.123)).toBe(0.12)
    expect(snapSliderValue(scale, -4)).toBe(0)
    expect(snapSliderValue(scale, 4)).toBe(1)
    expect(snapSliderValue(scale, Number.NaN)).toBe(0)
  })

  it("round-trips through pixels", () => {
    expect(sliderValueToPx(scale, 0.5)).toBe(150)
    expect(sliderPxToValue(scale, 150)).toBe(0.5)
    expect(sliderPxToValue(scale, 999)).toBe(1)
  })
})
