// Date math of the Gantt component, over Unix days like calendar.ts: integers read through
// Date.UTC, so no time zone shifts a bar. Every range is inclusive of both days.
import {
  dayOfMonth, monthIndexOf, mondayBasedWeekday, unixDayFromUTC, weekCodeOfDay, type CalendarColor,
} from '../calendar/calendar.js';

export type GanttZoom = 'week' | 'month';
export type GanttColor = CalendarColor;

export interface GanttBar {
  // Unix days, both included.
  start: number;
  end: number;
  color?: GanttColor;
  label?: string;
  // 0..1, drawn as a darker fill from the left.
  progress?: number;
}

export interface GanttRow<B extends GanttBar = GanttBar> {
  id: string | number;
  label: string;
  // The row it nests under; rows with children can be collapsed.
  parentId?: string | number;
  bars: B[];
}

export interface GanttMarker {
  day: number;
  label?: string;
  color?: GanttColor;
}

// Pixels per day: the week zoom shows each day, the month zoom each ISO week.
export const GANTT_DAY_WIDTH: Record<GanttZoom, number> = { week: 28, month: 6 };

export interface GanttRange {
  startDay: number;
  endDay: number;
}

const lastDayOfMonth = (unixDay: number): number => {
  const date = new Date(unixDay * 86400000);
  return unixDayFromUTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
};

const firstDayOfMonth = (unixDay: number): number => unixDay - dayOfMonth(unixDay) + 1;

// ganttRange covers every bar and marker, with a few days of margin, snapped to whole weeks
// (week zoom) or whole months (month zoom). null when there is nothing to draw.
export const ganttRange = (rows: GanttRow[], markers: GanttMarker[], zoom: GanttZoom): GanttRange | null => {
  const days = [
    ...rows.flatMap((row) => row.bars.flatMap((bar) => [bar.start, bar.end])),
    ...markers.map((marker) => marker.day),
  ].filter((day) => Number.isFinite(day) && day > 0);
  if (days.length === 0) { return null; }
  const marginDays = 3;
  const firstDay = Math.min(...days) - marginDays;
  const lastDay = Math.max(...days) + marginDays;
  if (zoom === 'week') {
    return { startDay: firstDay - mondayBasedWeekday(firstDay), endDay: lastDay + 6 - mondayBasedWeekday(lastDay) };
  }
  return { startDay: firstDayOfMonth(firstDay), endDay: lastDayOfMonth(lastDay) };
};

export const rangeDays = (range: GanttRange): number => range.endDay - range.startDay + 1;

// barBox places a bar in pixels from the range's start, clipped to the range. A bar whose end is
// before its start shows as one day.
export const barBox = (bar: GanttBar, range: GanttRange, dayWidth: number): { left: number; width: number } => {
  const startDay = Math.max(bar.start, range.startDay);
  const endDay = Math.min(Math.max(bar.end, bar.start), range.endDay);
  return { left: (startDay - range.startDay) * dayWidth, width: Math.max(endDay - startDay + 1, 1) * dayWidth };
};

export interface GanttHeaderCell {
  startDay: number;
  days: number;
}

export interface GanttMonthCell extends GanttHeaderCell {
  monthIndex: number;
  year: number;
}

// monthCells is the header's top row: one cell per month, cut at the range's ends.
export const monthCells = (range: GanttRange): GanttMonthCell[] => {
  const cells: GanttMonthCell[] = [];
  for (let cellStart = range.startDay; cellStart <= range.endDay;) {
    const cellEnd = Math.min(lastDayOfMonth(cellStart), range.endDay);
    cells.push({
      startDay: cellStart, days: cellEnd - cellStart + 1,
      monthIndex: monthIndexOf(cellStart), year: new Date(cellStart * 86400000).getUTCFullYear(),
    });
    cellStart = cellEnd + 1;
  }
  return cells;
};

export interface GanttTickCell extends GanttHeaderCell {
  // The day of the month (week zoom) or the ISO week number (month zoom).
  number: number;
  isWeekStart: boolean;
}

// tickCells is the header's bottom row: every day (week zoom) or every ISO week, cut at the
// range's ends (month zoom).
export const tickCells = (range: GanttRange, zoom: GanttZoom): GanttTickCell[] => {
  const cells: GanttTickCell[] = [];
  if (zoom === 'week') {
    for (let day = range.startDay; day <= range.endDay; day++) {
      cells.push({ startDay: day, days: 1, number: dayOfMonth(day), isWeekStart: mondayBasedWeekday(day) === 0 });
    }
    return cells;
  }
  for (let cellStart = range.startDay; cellStart <= range.endDay;) {
    const cellEnd = Math.min(cellStart + 6 - mondayBasedWeekday(cellStart), range.endDay);
    cells.push({ startDay: cellStart, days: cellEnd - cellStart + 1, number: weekCodeOfDay(cellStart) % 100, isWeekStart: true });
    cellStart = cellEnd + 1;
  }
  return cells;
};

export interface GanttVisibleRow<R extends GanttRow> {
  row: R;
  depth: number;
  hasChildren: boolean;
}

// visibleRows flattens the tree in the given order: each row, then its children. A row whose
// parent is missing is a root; the children of a collapsed row are left out.
export const visibleRows = <R extends GanttRow>(rows: R[], collapsedIDs: Set<string | number>): GanttVisibleRow<R>[] => {
  const rowIDs = new Set(rows.map((row) => row.id));
  const childrenByParentID = new Map<string | number, R[]>();
  for (const row of rows) {
    if (row.parentId === undefined || !rowIDs.has(row.parentId)) { continue; }
    childrenByParentID.set(row.parentId, [...(childrenByParentID.get(row.parentId) || []), row]);
  }
  const flattened: GanttVisibleRow<R>[] = [];
  const addRow = (row: R, depth: number) => {
    const children = childrenByParentID.get(row.id) || [];
    flattened.push({ row, depth, hasChildren: children.length > 0 });
    if (collapsedIDs.has(row.id)) { return; }
    for (const child of children) { addRow(child, depth + 1); }
  };
  for (const row of rows) {
    if (row.parentId === undefined || !rowIDs.has(row.parentId)) { addRow(row, 0); }
  }
  return flattened;
};
