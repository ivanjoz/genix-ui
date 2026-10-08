<script lang="ts" generics="T extends CalendarActivity">
  import type { Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  import { getFechaUnix } from '../utilities/date.js';
  import {
    buildMonthWeeks, buildWeekColumns, dayOfMonth, groupByDate, monthIndexOf,
    type CalendarActivity, type CalendarColor,
  } from './calendar.js';

  const ui = useUI();

  // Two layouts over the same activities:
  //   month — weekdays as columns, the month's weeks as rows (`month` = YYMM, 2406 = June 2024).
  //   week  — ISO weeks as columns (`weekStart`..`weekEnd` = YYWW, 2406 = week 6 of 2024),
  //           Monday to Sunday as rows.
  // `activityRender` replaces the card's content; the colored card itself stays.
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
    blue: 'bg-blue-50 border-blue-500 text-blue-900',
    green: 'bg-green-50 border-green-500 text-green-900',
    red: 'bg-red-50 border-red-500 text-red-900',
    amber: 'bg-amber-50 border-amber-500 text-amber-900',
    purple: 'bg-purple-50 border-purple-500 text-purple-900',
    teal: 'bg-teal-50 border-teal-500 text-teal-900',
    pink: 'bg-pink-50 border-pink-500 text-pink-900',
    gray: 'bg-gray-100 border-gray-400 text-gray-800',
  };

  const today = getFechaUnix();
  const activitiesByDate = $derived(groupByDate(activities));
  const monthWeeks = $derived(mode === 'month' && month ? buildMonthWeeks(month) : []);
  const weekColumns = $derived(mode === 'week' && weekStart && weekEnd ? buildWeekColumns(weekStart, weekEnd) : []);

  const dayMonthLabel = (unixDay: number) =>
    `${String(dayOfMonth(unixDay)).padStart(2, '0')}/${String(monthIndexOf(unixDay) + 1).padStart(2, '0')}`;
</script>

{#snippet dayActivities(unixDay: number)}
  <div class="flex flex-col gap-3">
    {#each activitiesByDate.get(unixDay) || [] as activity}
      <div class="rounded-[4px] border-l-3 px-6 py-3 {COLOR_CSS[activity.color || 'blue']}">
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
      </div>
    {/each}
  </div>
{/snippet}

{#snippet dayNumber(unixDay: number, isMuted: boolean)}
  <div class="flex justify-end mb-4">
    <span class="text-sm leading-none px-4 py-3 rounded-[4px]
      {unixDay === today ? 'bg-blue-600 text-white' : isMuted ? 'text-gray-400' : 'text-gray-600'}">
      {dayOfMonth(unixDay)}
    </span>
  </div>
{/snippet}

{#if mode === 'month'}
  <div class={ifcss(css, 'grid grid-cols-7 border-l border-t border-gray-200 bg-white')}>
    {#each WEEKDAY_SHORT_NAMES as weekdayName}
      <div class="border-r border-b border-gray-200 bg-gray-50 px-6 py-6 text-center text-sm font-semibold text-gray-700">
        {ui.translate(weekdayName)}
      </div>
    {/each}
    {#each monthWeeks as week}
      {#each week as day}
        <div class="min-w-0 min-h-100 border-r border-b border-gray-200 p-4 {day.isInMonth ? '' : 'bg-gray-50'}">
          {@render dayNumber(day.unixDay, !day.isInMonth)}
          {@render dayActivities(day.unixDay)}
        </div>
      {/each}
    {/each}
  </div>
{:else}
  <!-- Weeks are columns, so a long range scrolls sideways instead of squeezing the cards. -->
  <div class={ifcss(css, 'overflow-x-auto')}>
    <div class="grid border-l border-t border-gray-200 bg-white"
      style="grid-template-columns: 112px repeat({weekColumns.length}, minmax(150px, 1fr))">
      <div class="border-r border-b border-gray-200 bg-gray-50"></div>
      {#each weekColumns as column}
        <div class="border-r border-b border-gray-200 bg-gray-50 px-6 py-6 text-center leading-tight">
          <div class="text-sm font-semibold text-gray-700">
            {ui.translate('Week|Semana')} {column.weekCode % 100} · {2000 + Math.floor(column.weekCode / 100)}
          </div>
          <div class="text-sm text-gray-500">
            {dayMonthLabel(column.days[0])} – {dayMonthLabel(column.days[6])}
          </div>
        </div>
      {/each}
      {#each WEEKDAY_NAMES as weekdayName, weekdayIndex}
        <div class="border-r border-b border-gray-200 bg-gray-50 px-8 py-6 text-sm font-semibold text-gray-700">
          {ui.translate(weekdayName)}
        </div>
        {#each weekColumns as column}
          <div class="min-w-0 min-h-80 border-r border-b border-gray-200 p-4">
            {@render dayNumber(column.days[weekdayIndex], false)}
            {@render dayActivities(column.days[weekdayIndex])}
          </div>
        {/each}
      {/each}
    </div>
  </div>
{/if}
