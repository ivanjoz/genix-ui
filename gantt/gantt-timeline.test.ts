import { describe, expect, test } from 'bun:test';
import { lineColorOnDay, packTimelineLanes, screenPixelSize, snapToScreenPixel, type GanttTimelineItem } from './gantt-timeline';

const item = (id: number, startDay: number, endDay: number, endIcon?: string): GanttTimelineItem => ({
  id, label: `#${id}`, startDay, endDay, endIcon,
  points: [{ day: startDay, offset: 0.5, color: 'blue' }, { day: endDay, offset: 0.5, color: 'gray', icon: 'star' }],
});

describe('packTimelineLanes', () => {
  test('items that do not overlap share a lane', () => {
    // 103..107 overlaps 100..105: second lane. 106..110 fits after the first.
    const lanes = packTimelineLanes([item(1, 100, 105), item(2, 103, 107), item(9, 106, 110)], 0, 1000);
    expect(lanes.map((lane) => lane.map((laneItem) => laneItem.id))).toEqual([[1, 9], [2]]);
  });
  test('overlaps are decided on the extents clipped to the window', () => {
    expect(packTimelineLanes([item(1, 100, 105), item(2, 103, 107)], 0, 102)).toHaveLength(1);
  });
});

describe('lineColorOnDay', () => {
  test('the line takes the last point reached and stops at an ending point', () => {
    expect(lineColorOnDay(item(1, 100, 105), 99)).toBe('');
    expect(lineColorOnDay(item(1, 100, 105), 103)).toBe('blue');
    expect(lineColorOnDay(item(1, 100, 105), 105)).toBe('');
  });
  test('a running item keeps its line past the last point', () => {
    expect(lineColorOnDay(item(1, 100, 105, 'open'), 106)).toBe('gray');
  });
});

describe('pixel snapping', () => {
  test('keeps every tick the same whole number of screen pixels at 110%', () => {
    const ratio = 1.1;
    expect(screenPixelSize(2, ratio) * ratio).toBeCloseTo(2);
    // Positions land on screen-pixel boundaries: multiplied back they are whole numbers.
    for (const x of [15.5, 47.3, 79.9]) { expect(Number.isInteger(Math.round(snapToScreenPixel(x, ratio) * ratio * 1e6) / 1e6)).toBe(true); }
    expect(screenPixelSize(0.2, ratio)).toBeCloseTo(1 / ratio);
    expect(snapToScreenPixel(16, 1)).toBe(16);
  });
});
