import { describe, expect, test } from 'bun:test';
import { buildChartBarFrames, getChartBarMaximum } from './chart-bar-layout';

const series = [
  { values: [10, 0], color: '#10b981' },
  { values: [5, 8], color: '#a855f7' },
];

describe('chart bar layout', () => {
  test('keeps stacked behavior as a summed scale', () => {
    expect(getChartBarMaximum(series, 2, 'stacked')).toBe(15);
    const frames = buildChartBarFrames({
      series, pointsCount: 2, columnWidth: 20, maxValue: 15, height: 90, mode: 'stacked',
    });
    expect(frames.slice(0, 2).map((frame) => frame.x)).toEqual([0, 0]);
  });

  test('groups visible independent series and expands a lone bar', () => {
    expect(getChartBarMaximum(series, 2, 'grouped')).toBe(10);
    const frames = buildChartBarFrames({
      series, pointsCount: 2, columnWidth: 20, maxValue: 10, height: 90, mode: 'grouped',
    });
    expect(frames[0].x).toBe(0);
    expect(frames[1].x).toBeGreaterThanOrEqual(frames[0].x + frames[0].width);
    // The second day's lone purple bar uses the full day instead of reserving space for zero CPU.
    expect(frames[2].x).toBe(20);
    expect(frames[2].width).toBeGreaterThan(frames[0].width);
    expect(frames.every((frame) => frame.x + frame.width <= 40)).toBe(true);
  });
});
