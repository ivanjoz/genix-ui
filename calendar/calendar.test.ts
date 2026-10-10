import { describe, expect, test } from 'bun:test';
import {
  buildMonthWeeks, buildWeekColumns, dayOfMonth, groupByDate, layoutWeekBars, mondayBasedWeekday,
  unixDayFromUTC, weekCodeOfDay, weekCodeStartDay,
} from './calendar';

describe('calendar date math', () => {
  test('weekday is Monday-based', () => {
    expect(mondayBasedWeekday(0)).toBe(3); // 1970-01-01, Thursday
    expect(mondayBasedWeekday(unixDayFromUTC(2024, 0, 1))).toBe(0); // Monday
    expect(mondayBasedWeekday(unixDayFromUTC(2024, 5, 1))).toBe(5); // Saturday
  });

  test('ISO week codes', () => {
    expect(weekCodeStartDay(2406)).toBe(unixDayFromUTC(2024, 1, 5));
    expect(weekCodeStartDay(2501)).toBe(unixDayFromUTC(2024, 11, 30));
    expect(weekCodeOfDay(unixDayFromUTC(2024, 11, 31))).toBe(2501);
    expect(weekCodeOfDay(unixDayFromUTC(2021, 0, 1))).toBe(2053);
    expect(weekCodeOfDay(unixDayFromUTC(2024, 1, 11))).toBe(2406); // Sunday of week 6
  });

  test('month grid covers whole Monday-to-Sunday weeks', () => {
    const weeks = buildMonthWeeks(2406);
    expect(weeks.length).toBe(5); // June 2024: Saturday 1st to Sunday 30th
    expect(weeks[0][0].unixDay).toBe(unixDayFromUTC(2024, 4, 27));
    expect(weeks[0][0].isInMonth).toBe(false);
    expect(weeks[0][5]).toEqual({ unixDay: unixDayFromUTC(2024, 5, 1), isInMonth: true });
    expect(dayOfMonth(weeks[4][6].unixDay)).toBe(30);

    const march2026 = buildMonthWeeks(2603); // starts on Sunday
    expect(march2026.length).toBe(6);
    expect(dayOfMonth(march2026[5][6].unixDay)).toBe(5); // Sunday April 5th
    expect(march2026[5][6].isInMonth).toBe(false);
    expect(buildMonthWeeks(2102).length).toBe(4); // February 2021: Monday 1st to Sunday 28th
  });

  test('week columns cross the year and accept a reversed range', () => {
    const columns = buildWeekColumns(2502, 2451);
    expect(columns.map((column) => column.weekCode)).toEqual([2451, 2452, 2501, 2502]);
    expect(columns[2].days[0]).toBe(unixDayFromUTC(2024, 11, 30));
    expect(columns[2].days[6]).toBe(unixDayFromUTC(2025, 0, 5));
  });

  test('groups activities by date', () => {
    const grouped = groupByDate([{ date: 5, id: 1 }, { date: 6, id: 2 }, { date: 5, id: 3 }]);
    expect(grouped.get(5)?.map((activity) => activity.id)).toEqual([1, 3]);
    expect(grouped.get(7)).toBeUndefined();
  });

  test('a multi-day activity is listed under every day it covers', () => {
    const grouped = groupByDate([{ date: 5, endDate: 7, id: 1 }, { date: 9, endDate: 2, id: 2 }]);
    expect([5, 6, 7, 8, 9].map((unixDay) => grouped.get(unixDay)?.length || 0)).toEqual([1, 1, 1, 0, 1]);
  });
});

describe('layoutWeekBars', () => {
  // Monday 2026-10-05.
  const monday = unixDayFromUTC(2026, 9, 5);
  const title = 'Activity';

  test('a bar is cut to the week and says it continues', () => {
    const [bar] = layoutWeekBars(monday, [{ date: monday - 3, endDate: monday + 2, title }]);
    expect(bar).toMatchObject({ column: 0, span: 3, lane: 0, continuesBefore: true, continuesAfter: false });
    const [longBar] = layoutWeekBars(monday, [{ date: monday + 5, endDate: monday + 20, title }]);
    expect(longBar).toMatchObject({ column: 5, span: 2, continuesAfter: true });
  });

  test('overlapping bars stack in lanes; a free lane is reused', () => {
    const bars = layoutWeekBars(monday, [
      { date: monday + 1, title: 'day' },
      { date: monday, endDate: monday + 3, title: 'sprint' },
      { date: monday + 4, title: 'after' },
      { date: monday - 10, endDate: monday - 1, title: 'last week' },
    ]);
    expect(bars.map((bar) => [bar.activity.title, bar.column, bar.lane])).toEqual([['sprint', 0, 0], ['day', 1, 1], ['after', 4, 0]]);
  });
});
