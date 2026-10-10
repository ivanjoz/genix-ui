<script lang="ts" generics="T extends CalendarActivity">
  import type { Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  import { getFechaUnix } from '../utilities/date.js';
  import {
    buildMonthWeeks, buildWeekColumns, dayOfMonth, groupByDate, layoutWeekBars, monthIndexOf,
    type CalendarActivity, type CalendarColor,
  } from './calendar.js';

  const ui = useUI();

  // Two layouts over the same activities:
  //   month — weekdays as columns, the month's weeks as rows (`month` = YYMM, 2406 = June 2024).
  //   week  — ISO weeks as columns (`weekStart`..`weekEnd` = YYWW, 2406 = week 6 of 2024),
  //           Monday to Sunday as rows.
  // `activityRender` replaces the card's content; the colored card itself stays. An activity with
  // an `endDate` is a bar across its days in month view, and repeats on each day in week view.
  interface Props {
    mode: 'month' | 'week';
    month?: number;
    weekStart?: number;
    weekEnd?: number;
    activities?: T[];
    activityRender?: Snippet<[T]>;
    css?: string;
  }

  const { mode, month = 0, weekStart = 0, weekEnd = 0, activities = [], activityRender, css = '' }: Props = $props();

  const WEEKDAY_NAMES = [
    'Monday|Lunes', 'Tuesday|Martes', 'Wednesday|Miércoles', 'Thursday|Jueves',
    'Friday|Viernes', 'Saturday|Sábado', 'Sunday|Domingo',
  ];
  const WEEKDAY_SHORT_NAMES = ['Mon|Lun', 'Tue|Mar', 'Wed|Mié', 'Thu|Jue', 'Fri|Vie', 'Sat|Sáb', 'Sun|Dom'];

  // Full literals so Tailwind finds them when it scans this file.
  const COLOR_CSS: Record<CalendarColor, string> = {
    blue: 'bg-blue-bg border-blue-solid text-blue-fg',
    green: 'bg-green-bg border-green-solid text-green-fg',
    red: 'bg-red-bg border-red-solid text-red-fg',
    amber: 'bg-amber-bg border-amber-solid text-amber-fg',
    purple: 'bg-purple-bg border-purple-solid text-purple-fg',
    teal: 'bg-teal-bg border-teal-solid text-teal-fg',
    pink: 'bg-pink-bg border-pink-solid text-pink-fg',
    gray: 'bg-surface-muted border-line-strong text-fg',
  };

  const today = getFechaUnix();
  const activitiesByDate = $derived(groupByDate(activities));
  const monthWeeks = $derived(mode === 'month' && month ? buildMonthWeeks(month) : []);
  const weekColumns = $derived(mode === 'week' && weekStart && weekEnd ? buildWeekColumns(weekStart, weekEnd) : []);

  const dayMonthLabel = (unixDay: number) =>
    `${String(dayOfMonth(unixDay)).padStart(2, '0')}/${String(monthIndexOf(unixDay) + 1).padStart(2, '0')}`;
</script>

{#snippet activityContent(activity: T)}
  {#if activityRender}
    {@render activityRender(activity)}
  {:else}
    <div class="flex items-center gap-4 text-sm font-semibold leading-tight">
      {#if activity.icon}<i class="{activity.icon} shrink-0"></i>{/if}
      <span class="truncate">{activity.title}</span>
    </div>
    {#if activity.text}
      <div class="text-sm leading-tight opacity-75 line-clamp-2">{activity.text}</div>
    {/if}
  {/if}
{/snippet}

{#snippet dayActivities(unixDay: number)}
  <div class="flex flex-col gap-3">
    {#each activitiesByDate.get(unixDay) || [] as activity}
      <div class="rounded-[4px] border-l-3 px-6 py-3 {COLOR_CSS[activity.color || 'blue']}">
        {@render activityContent(activity)}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet dayNumber(unixDay: number, isMuted: boolean)}
  <div class="flex justify-end mb-4">
    <span class="text-sm leading-none px-4 py-3 rounded-[4px]
      {unixDay === today ? 'bg-blue-solid text-on-solid' : isMuted ? 'text-fg-subtle' : 'text-fg-muted'}">
      {dayOfMonth(unixDay)}
    </span>
  </div>
{/snippet}

{#if mode === 'month'}
  <div class={ifcss(css, 'border-l border-t border-line bg-surface')}>
    <div class="grid grid-cols-7">
      {#each WEEKDAY_SHORT_NAMES as weekdayName}
        <div class="border-r border-b border-line bg-surface-soft px-6 py-6 text-center text-sm font-semibold text-fg-soft">
          {ui.translate(weekdayName)}
        </div>
      {/each}
    </div>
    <!-- One grid per week: the day cells span every row behind, the day numbers take the first
         row and each lane of bars the next ones, so a multi-day activity spans its columns. -->
    {#each monthWeeks as week}
      {@const weekBars = layoutWeekBars(week[0].unixDay, activities)}
      {@const lanesCount = Math.max(0, ...weekBars.map((bar) => bar.lane + 1))}
      <div class="grid grid-cols-7" style="grid-template-rows: auto repeat({lanesCount}, auto) 1fr">
        {#each week as day, weekdayIndex}
          <div class="min-w-0 min-h-100 border-r border-b border-line {day.isInMonth ? '' : 'bg-surface-soft'}"
            style="grid-column: {weekdayIndex + 1}; grid-row: 1 / -1"></div>
        {/each}
        {#each week as day, weekdayIndex}
          <div class="px-4 pt-4" style="grid-column: {weekdayIndex + 1}; grid-row: 1">
            {@render dayNumber(day.unixDay, !day.isInMonth)}
          </div>
        {/each}
        {#each weekBars as bar}
          <div class="min-w-0 mb-3 px-6 py-3 rounded-[4px] {COLOR_CSS[bar.activity.color || 'blue']}
            {bar.continuesBefore ? 'rounded-l-none ml-0' : 'border-l-3 ml-4'} {bar.continuesAfter ? 'rounded-r-none mr-0' : 'mr-4'}"
            style="grid-column: {bar.column + 1} / span {bar.span}; grid-row: {bar.lane + 2}">
            {@render activityContent(bar.activity)}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <!-- Weeks are columns, so a long range scrolls sideways instead of squeezing the cards. -->
  <div class={ifcss(css, 'overflow-x-auto')}>
    <div class="grid border-l border-t border-line bg-surface"
      style="grid-template-columns: 112px repeat({weekColumns.length}, minmax(150px, 1fr))">
      <div class="border-r border-b border-line bg-surface-soft"></div>
      {#each weekColumns as column}
        <div class="border-r border-b border-line bg-surface-soft px-6 py-6 text-center leading-tight">
          <div class="text-sm font-semibold text-fg-soft">
            {ui.translate('Week|Semana')} {column.weekCode % 100} · {2000 + Math.floor(column.weekCode / 100)}
          </div>
          <div class="text-sm text-fg-muted">
            {dayMonthLabel(column.days[0])} – {dayMonthLabel(column.days[6])}
          </div>
        </div>
      {/each}
      {#each WEEKDAY_NAMES as weekdayName, weekdayIndex}
        <div class="border-r border-b border-line bg-surface-soft px-8 py-6 text-sm font-semibold text-fg-soft">
          {ui.translate(weekdayName)}
        </div>
        {#each weekColumns as column}
          <div class="min-w-0 min-h-80 border-r border-b border-line p-4">
            {@render dayNumber(column.days[weekdayIndex], false)}
            {@render dayActivities(column.days[weekdayIndex])}
          </div>
        {/each}
      {/each}
    </div>
  </div>
{/if}
