import { describe, expect, test } from 'bun:test';
import {
  buildMonthWeeks, buildWeekColumns, dayOfMonth, groupByDate, mondayBasedWeekday,
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
});
