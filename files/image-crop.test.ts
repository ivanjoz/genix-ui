import { describe, expect, test } from 'bun:test'
import { clampCrop, cropDrawRect } from './image-crop'

const squareFrame = { width: 1000, height: 1000 }

describe('cropDrawRect', () => {
  test('zoom 1 fits a wide picture whole and centered', () => {
    expect(cropDrawRect(2000, 1000, squareFrame, { zoom: 1, panX: 0, panY: 0 })).toEqual({ x: 0, y: 250, width: 1000, height: 500 })
  })
  test('zoom and pan enlarge the picture and move its center by a fraction of the frame', () => {
    expect(cropDrawRect(2000, 1000, squareFrame, { zoom: 2, panX: 0.1, panY: -0.05 })).toEqual({ x: -400, y: -50, width: 2000, height: 1000 })
  })
  test('the same crop frames a smaller frame proportionally', () => {
    expect(cropDrawRect(2000, 1000, { width: 200, height: 200 }, { zoom: 2, panX: 0.1, panY: -0.05 })).toEqual({ x: -80, y: -10, width: 400, height: 200 })
  })
})

describe('clampCrop', () => {
  test('a picture smaller than the frame moves only inside it', () => {
    // 1000x500 drawn: no room horizontally, 250 (a quarter of the frame) above and below.
    expect(clampCrop(2000, 1000, squareFrame, { zoom: 1, panX: 0.3, panY: -0.9 })).toEqual({ zoom: 1, panX: 0, panY: -0.25 })
  })
  test('a zoomed picture moves only while it covers the frame', () => {
    // zoom 3 → 3000x1500 drawn: one frame of room horizontally, a quarter vertically.
    expect(clampCrop(2000, 1000, squareFrame, { zoom: 3, panX: -5, panY: 0.4 })).toEqual({ zoom: 3, panX: -1, panY: 0.25 })
  })
  test('the zoom stays between 1 and 5', () => {
    expect(clampCrop(1000, 1000, squareFrame, { zoom: 0.2, panX: 0, panY: 0 }).zoom).toBe(1)
    expect(clampCrop(1000, 1000, squareFrame, { zoom: 9, panX: 0, panY: 0 }).zoom).toBe(5)
  })
})
