<script lang="ts" generics="R extends GanttRow">
  import { untrack, type Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  import { getFechaUnix } from '../utilities/date.js';
  import { dayOfMonth, monthIndexOf } from '../calendar/calendar.js';
  import {
    GANTT_DAY_WIDTH, barBox, ganttRange, monthCells, rangeDays, tickCells, visibleRows,
    type GanttColor, type GanttMarker, type GanttRow, type GanttZoom,
  } from './gantt.js';

  const ui = useUI();

  // Rows (a tree through parentId) on the left, their bars over a day timeline on the right. The
  // label column stays while the timeline scrolls sideways. `zoom` week draws every day, month
  // every ISO week. `rowRender` replaces a row's label; `onBarClick` makes bars clickable. Row,
  // bar and marker labels are shown as given: the host translates its own data.
  interface Props {
    rows: R[];
    zoom?: GanttZoom;
    markers?: GanttMarker[];
    labelWidth?: number;
    rowRender?: Snippet<[R, number]>;
    onBarClick?: (row: R, bar: R['bars'][number]) => void;
    emptyText?: string;
    css?: string;
  }

  const {
    rows, zoom = 'week', markers = [], labelWidth = 260, rowRender, onBarClick, emptyText = 'Nothing to show.|Nada que mostrar.', css = '',
  }: Props = $props();

  const MONTH_NAMES = [
    'January|Enero', 'February|Febrero', 'March|Marzo', 'April|Abril', 'May|Mayo', 'June|Junio',
    'July|Julio', 'August|Agosto', 'September|Septiembre', 'October|Octubre', 'November|Noviembre', 'December|Diciembre',
  ];
  const ROW_HEIGHT = 32;

  // Full literals so Tailwind finds them when it scans this file.
  const BAR_CSS: Record<GanttColor, { bar: string, progress: string, line: string }> = {
    blue: { bar: 'bg-blue-bg-strong border-blue-border text-blue-fg', progress: 'bg-blue-border', line: 'border-blue-solid' },
    green: { bar: 'bg-green-bg-strong border-green-border text-green-fg', progress: 'bg-green-border', line: 'border-green-solid' },
    red: { bar: 'bg-red-bg-strong border-red-border text-red-fg', progress: 'bg-red-border', line: 'border-red-solid' },
    amber: { bar: 'bg-amber-bg-strong border-amber-border text-amber-fg', progress: 'bg-amber-border', line: 'border-amber-solid' },
    purple: { bar: 'bg-purple-bg-strong border-purple-border text-purple-fg', progress: 'bg-purple-border', line: 'border-purple-solid' },
    teal: { bar: 'bg-teal-bg-strong border-teal-border text-teal-fg', progress: 'bg-teal-border', line: 'border-teal-solid' },
    pink: { bar: 'bg-pink-bg-strong border-pink-border text-pink-fg', progress: 'bg-pink-border', line: 'border-pink-solid' },
    gray: { bar: 'bg-surface-muted border-line-strong text-fg', progress: 'bg-line-strong', line: 'border-fg-muted' },
  };

  const today = getFechaUnix();
  let collapsedIDs = $state(new Set<string | number>());

  const dayWidth = $derived(GANTT_DAY_WIDTH[zoom]);
  // Today is always in the range, so the line places the work in time.
  const range = $derived(ganttRange(rows, [...markers, { day: today }], zoom));
  const timelineWidth = $derived(range ? rangeDays(range) * dayWidth : 0);
  const months = $derived(range ? monthCells(range) : []);
  const ticks = $derived(range ? tickCells(range, zoom) : []);
  const shownRows = $derived(visibleRows(rows, collapsedIDs));
  const hasBars = $derived(rows.some((row) => row.bars.length > 0));

  const dayX = (day: number) => range ? (day - range.startDay) * dayWidth : 0;

  // Today opens in the middle of the timeline, and again when the zoom or the range change (not
  // when the rows only change their bars inside the same range).
  let scrollContainer = $state<HTMLDivElement>();
  const rangeKey = $derived(range ? `${range.startDay}:${range.endDay}:${dayWidth}` : '');
  $effect(() => {
    if (!scrollContainer || !rangeKey) { return; }
    const container = scrollContainer;
    untrack(() => { container.scrollLeft = Math.max(0, dayX(today) - (container.clientWidth - labelWidth) / 2); });
  });
  const dayMonthLabel = (unixDay: number) =>
    `${String(dayOfMonth(unixDay)).padStart(2, '0')}/${String(monthIndexOf(unixDay) + 1).padStart(2, '0')}`;

  const toggleRow = (rowID: string | number) => {
    const nextCollapsed = new Set(collapsedIDs);
    if (nextCollapsed.has(rowID)) { nextCollapsed.delete(rowID); } else { nextCollapsed.add(rowID); }
    collapsedIDs = nextCollapsed;
  };
</script>

{#if !range || !hasBars}
  <div class="text-fg-muted text-center py-24">{ui.translate(emptyText)}</div>
{:else}
  <div bind:this={scrollContainer} class={ifcss(css, 'overflow-x-auto border border-line rounded-[6px] bg-surface')}>
    <div class="relative" style:width="{labelWidth + timelineWidth}px">
      <!-- Header: months on top, days (week zoom) or ISO weeks (month zoom) below. -->
      <div class="flex border-b border-line bg-surface-soft">
        <div class="sticky left-0 z-20 shrink-0 bg-surface-soft border-r border-line" style:width="{labelWidth}px"></div>
        <div class="relative shrink-0 h-52" style:width="{timelineWidth}px">
          {#each months as month (month.startDay)}
            <div class="absolute top-0 h-26 px-6 border-l border-line text-sm font-semibold text-fg-soft truncate leading-[26px]"
              style:left="{dayX(month.startDay)}px" style:width="{month.days * dayWidth}px">
              {ui.translate(MONTH_NAMES[month.monthIndex])} {month.year}
            </div>
          {/each}
          {#each ticks as tick (tick.startDay)}
            <div class="absolute top-26 h-26 text-center text-sm leading-[26px] truncate
              {tick.isWeekStart ? 'border-l border-line' : ''} {tick.startDay === today ? 'text-red-solid font-semibold' : 'text-fg-muted'}"
              style:left="{dayX(tick.startDay)}px" style:width="{tick.days * dayWidth}px">
              {zoom === 'month' && tick.days >= 4 ? `${ui.translate('W|S')}${tick.number}` : zoom === 'week' ? tick.number : ''}
            </div>
          {/each}
        </div>
      </div>

      <div class="relative">
        <!-- Week (or month) lines, markers and today, under the bars. -->
        <div class="absolute top-0 bottom-0 pointer-events-none" style:left="{labelWidth}px" style:width="{timelineWidth}px">
          {#each zoom === 'week' ? ticks.filter((tick) => tick.isWeekStart) : months as gridCell (gridCell.startDay)}
            <div class="absolute top-0 bottom-0 border-l border-line-soft" style:left="{dayX(gridCell.startDay)}px"></div>
          {/each}
          {#each markers as marker (marker.day)}
            <div class="absolute top-0 bottom-0 border-l-2 border-dashed {BAR_CSS[marker.color || 'gray'].line}"
              style:left="{dayX(marker.day)}px" title={marker.label}></div>
          {/each}
          <div class="absolute top-0 bottom-0 border-l-2 border-red-solid" style:left="{dayX(today) + dayWidth / 2}px"
            title={ui.translate('Today|Hoy')}></div>
        </div>

        {#each shownRows as shownRow (shownRow.row.id)}
          <div class="group flex border-b border-line-soft hover:bg-surface-soft" style:height="{ROW_HEIGHT}px">
            <div class="sticky left-0 z-10 shrink-0 flex items-center gap-4 pr-8 bg-surface group-hover:bg-surface-soft border-r border-line text-sm min-w-0"
              style:width="{labelWidth}px" style:padding-left="{6 + shownRow.depth * 16}px">
              {#if shownRow.hasChildren}
                <button type="button" class="w-18 h-18 shrink-0 flex items-center justify-center text-fg-muted hover:text-fg"
                  aria-label={ui.translate(collapsedIDs.has(shownRow.row.id) ? 'Expand|Expandir' : 'Collapse|Contraer')}
                  onclick={() => toggleRow(shownRow.row.id)}>
                  <i class={collapsedIDs.has(shownRow.row.id) ? 'icon-[fa--chevron-right]' : 'icon-[fa--chevron-down]'}></i>
                </button>
              {:else}
                <span class="w-18 shrink-0"></span>
              {/if}
              {#if rowRender}
                {@render rowRender(shownRow.row, shownRow.depth)}
              {:else}
                <span class="truncate {shownRow.hasChildren ? 'font-semibold' : ''}">{shownRow.row.label}</span>
              {/if}
            </div>
            <div class="relative shrink-0" style:width="{timelineWidth}px">
              {#each shownRow.row.bars as bar, barIndex (barIndex)}
                {@const box = barBox(bar, range, dayWidth)}
                {@const barCss = BAR_CSS[bar.color || 'blue']}
                {@const barTitle = `${bar.label ? `${bar.label} · ` : ''}${dayMonthLabel(bar.start)} – ${dayMonthLabel(bar.end)}`}
                <svelte:element this={onBarClick ? 'button' : 'div'} type={onBarClick ? 'button' : undefined}
                  role={onBarClick ? undefined : 'img'} aria-label={barTitle} title={barTitle}
                  class="absolute top-5 h-22 overflow-hidden rounded-[4px] border text-left text-sm leading-[20px] {barCss.bar}
                    {onBarClick ? 'cursor-pointer hover:brightness-95' : ''}"
                  style="left: {box.left}px; width: {box.width}px"
                  onclick={onBarClick ? () => onBarClick(shownRow.row, bar) : undefined}>
                  {#if bar.progress}
                    <span class="absolute top-0 bottom-0 left-0 {barCss.progress}" style:width="{Math.min(bar.progress, 1) * 100}%"></span>
                  {/if}
                  {#if bar.label && box.width >= 48}
                    <span class="relative block px-6 truncate">{bar.label}</span>
                  {/if}
                </svelte:element>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
