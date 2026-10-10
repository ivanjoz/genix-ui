import { describe, expect, test } from 'bun:test';
import { unixDayFromUTC } from '../calendar/calendar';
import { barBox, ganttRange, monthCells, rangeDays, tickCells, visibleRows, type GanttRow } from './gantt';

// Wednesday 2026-10-07 … Tuesday 2026-10-20.
const october7 = unixDayFromUTC(2026, 9, 7);
const october20 = unixDayFromUTC(2026, 9, 20);
const rows: GanttRow[] = [{ id: 1, label: 'Sprint 1', bars: [{ start: october7, end: october20 }] }];

describe('ganttRange', () => {
  test('the week zoom covers whole Monday-to-Sunday weeks, with margin', () => {
    const range = ganttRange(rows, [], 'week');
    // 3 days before Oct 7 is Oct 4 (Sunday) → Monday Sep 28; 3 days after Oct 20 is Oct 23 → Sunday Oct 25.
    expect(range).toEqual({ startDay: unixDayFromUTC(2026, 8, 28), endDay: unixDayFromUTC(2026, 9, 25) });
    expect(rangeDays(range!) % 7).toBe(0);
  });
  test('the month zoom covers whole months', () => {
    expect(ganttRange(rows, [], 'month')).toEqual({ startDay: unixDayFromUTC(2026, 9, 1), endDay: unixDayFromUTC(2026, 9, 31) });
  });
  test('markers widen the range; nothing to draw is null', () => {
    const range = ganttRange(rows, [{ day: unixDayFromUTC(2026, 11, 15) }], 'month');
    expect(range?.endDay).toBe(unixDayFromUTC(2026, 11, 31));
    expect(ganttRange([{ id: 1, label: 'Empty', bars: [] }], [], 'week')).toBeNull();
  });
});

describe('barBox', () => {
  const range = { startDay: october7 - 2, endDay: october20 + 2 };
  test('a bar starts at its day and covers both ends', () => {
    expect(barBox({ start: october7, end: october7 + 1 }, range, 10)).toEqual({ left: 20, width: 20 });
  });
  test('a bar is clipped to the range, and a reversed bar is one day', () => {
    expect(barBox({ start: october7 - 10, end: october7 }, range, 10)).toEqual({ left: 0, width: 30 });
    expect(barBox({ start: october7, end: october7 - 5 }, range, 10)).toEqual({ left: 20, width: 10 });
  });
});

describe('header cells', () => {
  test('months are cut at the range ends', () => {
    const cells = monthCells({ startDay: unixDayFromUTC(2026, 8, 28), endDay: unixDayFromUTC(2026, 9, 25) });
    expect(cells.map((cell) => [cell.monthIndex, cell.days])).toEqual([[8, 3], [9, 25]]);
  });
  test('the week zoom ticks every day, marking Mondays', () => {
    const ticks = tickCells({ startDay: unixDayFromUTC(2026, 8, 28), endDay: unixDayFromUTC(2026, 9, 4) }, 'week');
    expect(ticks.map((tick) => tick.number)).toEqual([28, 29, 30, 1, 2, 3, 4]);
    expect(ticks.filter((tick) => tick.isWeekStart)).toHaveLength(1);
  });
  test('the month zoom ticks every ISO week, the first and last ones cut', () => {
    const ticks = tickCells({ startDay: unixDayFromUTC(2026, 9, 1), endDay: unixDayFromUTC(2026, 9, 31) }, 'month');
    // Oct 1 2026 is a Thursday in ISO week 40.
    expect(ticks.map((tick) => [tick.number, tick.days])).toEqual([[40, 4], [41, 7], [42, 7], [43, 7], [44, 6]]);
  });
});

describe('visibleRows', () => {
  const tree: GanttRow[] = [
    { id: 'epic', label: 'Epic', bars: [] },
    { id: 'orphan', label: 'Orphan', parentId: 'missing', bars: [] },
    { id: 'story', label: 'Story', parentId: 'epic', bars: [] },
    { id: 'task', label: 'Task', parentId: 'story', bars: [] },
  ];
  test('each row is followed by its children; a missing parent makes a root', () => {
    expect(visibleRows(tree, new Set()).map((shown) => [shown.row.id, shown.depth, shown.hasChildren])).toEqual([
      ['epic', 0, true], ['story', 1, true], ['task', 2, false], ['orphan', 0, false],
    ]);
  });
  test('a collapsed row hides its subtree', () => {
    expect(visibleRows(tree, new Set(['epic'])).map((shown) => shown.row.id)).toEqual(['epic', 'orphan']);
  });
});
