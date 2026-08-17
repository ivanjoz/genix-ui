import { describe, expect, test } from 'bun:test';
import {
  buildSteppedYAxisTickValues,
  getSteppedYAxisMaximum,
  getXAxisLabelPosition,
} from './chart-axis-layout';
import { getHoverCrosshairX } from './chart-hover';

describe('chart y-axis step layout', () => {
  test('rounds the shared scale ceiling to the requested step', () => {
    expect(getSteppedYAxisMaximum(611, 100)).toBe(700);
    expect(getSteppedYAxisMaximum(941, 100)).toBe(1000);
    expect(getSteppedYAxisMaximum(611)).toBe(611);
  });

  test('auto-skips crowded ticks using only whole step multiples', () => {
    const ticks = buildSteppedYAxisTickValues(1000, 100, 5);
    expect(ticks).toEqual([1000, 800, 600, 400, 200, 0]);
    expect(ticks.every((value) => value % 100 === 0)).toBe(true);
  });

  test('centers intermediate date labels on the same point as the hover crosshair', () => {
    const labelPosition = getXAxisLabelPosition(6, 30, 10);
    expect(labelPosition.left).toBe(getHoverCrosshairX(6, 10));
    expect(labelPosition.transform).toBe('translateX(-50%)');

    // The last displayed interval label is still intermediate unless it names point 29 itself.
    expect(getXAxisLabelPosition(24, 30, 10).left).toBe(getHoverCrosshairX(24, 10));
    expect(getXAxisLabelPosition(29, 30, 10)).toEqual({
      left: 300,
      align: 'right',
      transform: 'translateX(-100%)',
    });
  });
});
