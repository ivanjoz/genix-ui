<script lang="ts">
  import Calendar from '../calendar/Calendar.svelte';
  import { weekCodeStartDay, type CalendarActivity, type CalendarColor } from '../calendar/calendar';
  import Input from '../form/Input.svelte';
  import OptionsStrip from '../navigation/OptionsStrip.svelte';
  import ShowroomBlock from './ShowroomBlock.svelte';

  // The codes the calendar takes: YYMM for the month, YYWW for the ISO week range.
  let config = $state({ Mode: 1, Month: 2406, WeekStart: 2422, WeekEnd: 2427 });

  const modeOptions: [number, string][] = [[1, 'Month|Mes'], [2, 'Week|Semana']];

  interface ShowroomActivity extends CalendarActivity { crew: string; boxes: number }

  // Activities spread over June 2024 (weeks 2422..2427) so both views have cards to show.
  const juneFirst = weekCodeStartDay(2422) + 5;
  const activityTemplates: [number, string, CalendarColor, string, string][] = [
    [0, 'Harvest', 'green', 'icon-[fa--leaf]', 'Block A · 12 pickers'],
    [2, 'Shipment', 'blue', 'icon-[fa--truck]', 'Container to Rotterdam'],
    [2, 'Audit', 'amber', 'icon-[fa--search]', 'GlobalG.A.P.'],
    [5, 'Irrigation failure', 'red', 'icon-[fa--exclamation-triangle]', 'Valve 3, sector north'],
    [9, 'Training', 'purple', 'icon-[fa--graduation-cap]', 'Food safety'],
    [12, 'Pruning', 'teal', 'icon-[fa--scissors]', 'Block C'],
    [16, 'Visit', 'pink', 'icon-[fa--users]', 'Client from Boston'],
    [16, 'Harvest', 'green', 'icon-[fa--leaf]', 'Block B · 8 pickers'],
    [21, 'Maintenance', 'gray', 'icon-[fa--wrench]', 'Cold room 2'],
    [26, 'Shipment', 'blue', 'icon-[fa--truck]', 'Air freight to Miami'],
  ];
  const activities: ShowroomActivity[] = [
    ...activityTemplates.map(([dayOffset, title, color, icon, text], idx) => ({
      date: juneFirst + dayOffset, title, color, icon, text, crew: `Crew ${idx + 1}`, boxes: 120 + idx * 35,
    })),
    // Multi-day: a bar across the days in month view, cut where the week ends.
    { date: juneFirst + 8, endDate: juneFirst + 19, title: 'Sprint 3', color: 'purple', icon: 'icon-[fa--flag]', text: '12 days', crew: 'Team', boxes: 0 },
  ];
</script>

<ShowroomBlock name="Calendar" note="mode month (YYMM) · mode week (YYWW range, weeks as columns) · activities on Unix days, endDate for multi-day">
  <div class="grid grid-cols-24 gap-10 mb-12 items-end">
    <OptionsStrip css="col-span-24 md:col-span-6" selected={config.Mode} options={modeOptions}
      onSelect={(option) => { config.Mode = option[0] as number; }} />
    {#if config.Mode === 1}
      <Input saveOn={config} save="Month" label="Month (YYMM)|Mes (AAMM)" type="number" css="col-span-12 md:col-span-4" />
    {:else}
      <Input saveOn={config} save="WeekStart" label="Start week (YYWW)|Semana inicio (AASS)" type="number" css="col-span-12 md:col-span-5" />
      <Input saveOn={config} save="WeekEnd" label="End week (YYWW)|Semana fin (AASS)" type="number" css="col-span-12 md:col-span-5" />
    {/if}
  </div>
  <Calendar mode={config.Mode === 1 ? 'month' : 'week'} month={config.Month}
    weekStart={config.WeekStart} weekEnd={config.WeekEnd} {activities} />
</ShowroomBlock>

<ShowroomBlock name="Calendar — activityRender" note="custom card content through a snippet; the colored card stays">
  <Calendar mode="week" weekStart={2423} weekEnd={2425} {activities}>
    {#snippet activityRender(activity)}
      <div class="flex items-center justify-between gap-6 text-sm leading-tight">
        <span class="font-semibold truncate">{activity.crew}</span>
        <span class="shrink-0">{activity.boxes} boxes</span>
      </div>
    {/snippet}
  </Calendar>
</ShowroomBlock>
