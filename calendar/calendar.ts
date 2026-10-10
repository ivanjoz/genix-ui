// Date math of the Calendar component, over plain integers so it never depends on the
// browser's time zone. A "Unix day" is the project's date format: days since 1970-01-01,
// already shifted to local time when it was produced (dateToFechaUnix), so day N is the
// calendar date that Date.UTC reads at N * 86400000.
//
// Months and weeks come as 4-digit codes: YYMM (2406 = June 2024) and YYWW (2406 = ISO
// week 6 of 2024). ISO weeks start on Monday and belong to the year of their Thursday.

const MS_PER_DAY = 86400000;

// The fixed palette an activity card can take; Calendar.svelte maps each name to its classes.
export type CalendarColor = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'teal' | 'pink' | 'gray';

export interface CalendarActivity {
  // Unix day.
  date: number;
  // Last Unix day of a multi-day activity (included). Month view draws it as a bar across the
  // days, cut at each week's end; week view repeats it on every day.
  endDate?: number;
  title: string;
  color?: CalendarColor;
  // Iconify class, e.g. 'icon-[fa--truck]'.
  icon?: string;
  text?: string;
}

export const unixDayFromUTC = (year: number, monthIndex: number, dayOfMonth: number): number =>
  Math.round(Date.UTC(year, monthIndex, dayOfMonth) / MS_PER_DAY);

// 0 = Monday … 6 = Sunday. 1970-01-01 (day 0) was a Thursday.
export const mondayBasedWeekday = (unixDay: number): number => (((unixDay + 3) % 7) + 7) % 7;

export const dayOfMonth = (unixDay: number): number => new Date(unixDay * MS_PER_DAY).getUTCDate();

export const monthIndexOf = (unixDay: number): number => new Date(unixDay * MS_PER_DAY).getUTCMonth();

// Monday of ISO week 1: the week holding January 4th.
const isoWeekOneMonday = (year: number): number => {
  const january4 = unixDayFromUTC(year, 0, 4);
  return january4 - mondayBasedWeekday(january4);
};

export const weekCodeStartDay = (weekCode: number): number => {
  const year = 2000 + Math.floor(weekCode / 100);
  const weekNumber = weekCode % 100;
  return isoWeekOneMonday(year) + (weekNumber - 1) * 7;
};

export const weekCodeOfDay = (unixDay: number): number => {
  const thursday = unixDay - mondayBasedWeekday(unixDay) + 3;
  const isoYear = new Date(thursday * MS_PER_DAY).getUTCFullYear();
  const weekNumber = Math.floor((thursday - isoWeekOneMonday(isoYear)) / 7) + 1;
  return (isoYear - 2000) * 100 + weekNumber;
};

export interface CalendarMonthDay {
  unixDay: number;
  isInMonth: boolean;
}

// Month view: whole Monday-to-Sunday weeks covering the month, one array of 7 days per row.
// Days of the neighbour months fill the first and last rows so the grid stays rectangular.
export const buildMonthWeeks = (monthCode: number): CalendarMonthDay[][] => {
  const year = 2000 + Math.floor(monthCode / 100);
  const monthIndex = (monthCode % 100) - 1;
  const firstDay = unixDayFromUTC(year, monthIndex, 1);
  const lastDay = unixDayFromUTC(year, monthIndex + 1, 0);
  const gridStart = firstDay - mondayBasedWeekday(firstDay);

  const weeks: CalendarMonthDay[][] = [];
  for (let weekStart = gridStart; weekStart <= lastDay; weekStart += 7) {
    weeks.push(Array.from({ length: 7 }, (_, weekdayIndex) => {
      const unixDay = weekStart + weekdayIndex;
      return { unixDay, isInMonth: unixDay >= firstDay && unixDay <= lastDay };
    }));
  }
  return weeks;
};

export interface CalendarWeekColumn {
  weekCode: number;
  // Monday … Sunday of the week.
  days: number[];
}

// Week view: one column per ISO week from weekStart to weekEnd, both included. A reversed
// range is swapped, and the walk goes day by day so it crosses year boundaries (2452 → 2501).
export const buildWeekColumns = (weekStartCode: number, weekEndCode: number): CalendarWeekColumn[] => {
  let firstMonday = weekCodeStartDay(weekStartCode);
  let lastMonday = weekCodeStartDay(weekEndCode);
  if (lastMonday < firstMonday) { [firstMonday, lastMonday] = [lastMonday, firstMonday]; }

  const columns: CalendarWeekColumn[] = [];
  for (let monday = firstMonday; monday <= lastMonday; monday += 7) {
    columns.push({
      weekCode: weekCodeOfDay(monday),
      days: Array.from({ length: 7 }, (_, weekdayIndex) => monday + weekdayIndex),
    });
  }
  return columns;
};

// An endDate before date is ignored: the activity is one day.
export const activityLastDay = (activity: { date: number; endDate?: number }): number => Math.max(activity.endDate ?? activity.date, activity.date);

// groupByDate lists each activity under every day it covers.
export const groupByDate = <T extends { date: number; endDate?: number }>(activities: T[]): Map<number, T[]> => {
  const activitiesByDate = new Map<number, T[]>();
  for (const activity of activities) {
    for (let unixDay = activity.date; unixDay <= activityLastDay(activity); unixDay++) {
      const dayActivities = activitiesByDate.get(unixDay);
      if (dayActivities) { dayActivities.push(activity); } else { activitiesByDate.set(unixDay, [activity]); }
    }
  }
  return activitiesByDate;
};

export interface CalendarWeekBar<T> {
  activity: T;
  // 0 = Monday … 6 = Sunday.
  column: number;
  span: number;
  // The stacked row it takes inside the week, so bars never overlap.
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

// layoutWeekBars places the activities touching the week starting at weekStartDay (a Monday) as
// bars cut to the week, each in the first lane free over its days. Earlier and longer bars
// take the top lanes; single-day activities keep their input order.
export const layoutWeekBars = <T extends CalendarActivity>(weekStartDay: number, activities: T[]): CalendarWeekBar<T>[] => {
  const weekEndDay = weekStartDay + 6;
  const bars = activities
    .filter((activity) => activity.date <= weekEndDay && activityLastDay(activity) >= weekStartDay)
    .map((activity) => {
      const firstDay = Math.max(activity.date, weekStartDay);
      const lastDay = Math.min(activityLastDay(activity), weekEndDay);
      return {
        activity, column: firstDay - weekStartDay, span: lastDay - firstDay + 1, lane: 0,
        continuesBefore: activity.date < weekStartDay, continuesAfter: activityLastDay(activity) > weekEndDay,
      };
    })
    .sort((left, right) => left.column - right.column || right.span - left.span);
  // The last column each lane holds so far.
  const laneLastColumns: number[] = [];
  for (const bar of bars) {
    const freeLane = laneLastColumns.findIndex((laneLastColumn) => laneLastColumn < bar.column);
    bar.lane = freeLane >= 0 ? freeLane : laneLastColumns.length;
    laneLastColumns[bar.lane] = bar.column + bar.span - 1;
  }
  return bars;
};
