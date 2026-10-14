<script lang="ts" generics="R extends GanttRow">
  import { untrack, type Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  import { getFechaUnix } from '../utilities/date.js';
  import { dayOfMonth, monthIndexOf } from '../calendar/calendar.js';
  import {
    GANTT_DAY_WIDTH, barBox, ganttRange, monthCells, rangeDays, tickCells, visibleRows,
    type GanttColor, type GanttHeaderBand, type GanttMarker, type GanttRow, type GanttZoom,
  } from './gantt.js';

  const ui = useUI();

  // Rows (a tree through parentId) on the left, their bars over a day timeline on the right. The
  // label column stays while the timeline scrolls sideways. `zoom` week draws every day, month
  // every ISO week. `headerBands` replace the months on the header's top row. `rowRender` replaces
  // a row's label; `onBarClick` makes bars clickable. Row, bar, band and marker labels are shown as
  // given: the host translates its own data.
  interface Props {
    rows: R[];
    zoom?: GanttZoom;
    markers?: GanttMarker[];
    headerBands?: GanttHeaderBand[];
    // Pixels per day, instead of the zoom's (GANTT_DAY_WIDTH).
    dayWidth?: number;
    // Bar labels wrap up to 3 lines instead of one; a row grows to its tallest bar. The bars drop
    // their frame for a colored left stripe.
    wrapBarLabels?: boolean;
    labelWidth?: number;
    rowRender?: Snippet<[R, number]>;
    onBarClick?: (row: R, bar: R['bars'][number]) => void;
    emptyText?: string;
    css?: string;
  }

  const {
    rows, zoom = 'week', markers = [], headerBands, dayWidth: customDayWidth, wrapBarLabels = false, labelWidth = 260, rowRender, onBarClick, emptyText = 'Nothing to show.|Nada que mostrar.', css = '',
  }: Props = $props();

  const MONTH_NAMES = [
    'January|Enero', 'February|Febrero', 'March|Marzo', 'April|Abril', 'May|Mayo', 'June|Junio',
    'July|Julio', 'August|Agosto', 'September|Septiembre', 'October|Octubre', 'November|Noviembre', 'December|Diciembre',
  ];
  const ROW_HEIGHT = 32;

  // Full literals so Tailwind finds them when it scans this file.
  // `border` frames a one-line bar; `line` is a marker's color and a wrapped bar's left stripe.
  const BAR_CSS: Record<GanttColor, { bar: string, border: string, progress: string, line: string }> = {
    blue: { bar: 'bg-blue-bg-strong text-blue-fg', border: 'border-blue-border', progress: 'bg-blue-border', line: 'border-blue-solid' },
    green: { bar: 'bg-green-bg-strong text-green-fg', border: 'border-green-border', progress: 'bg-green-border', line: 'border-green-solid' },
    red: { bar: 'bg-red-bg-strong text-red-fg', border: 'border-red-border', progress: 'bg-red-border', line: 'border-red-solid' },
    amber: { bar: 'bg-amber-bg-strong text-amber-fg', border: 'border-amber-border', progress: 'bg-amber-border', line: 'border-amber-solid' },
    purple: { bar: 'bg-purple-bg-strong text-purple-fg', border: 'border-purple-border', progress: 'bg-purple-border', line: 'border-purple-solid' },
    teal: { bar: 'bg-teal-bg-strong text-teal-fg', border: 'border-teal-border', progress: 'bg-teal-border', line: 'border-teal-solid' },
    pink: { bar: 'bg-pink-bg-strong text-pink-fg', border: 'border-pink-border', progress: 'bg-pink-border', line: 'border-pink-solid' },
    gray: { bar: 'bg-surface-muted text-fg', border: 'border-line-strong', progress: 'bg-line-strong', line: 'border-fg-muted' },
  };

  const today = getFechaUnix();
  let collapsedIDs = $state(new Set<string | number>());

  const dayWidth = $derived(customDayWidth || GANTT_DAY_WIDTH[zoom]);
  // Today is always in the range, so the line places the work in time; so are the header bands.
  const bandDays = $derived((headerBands || []).flatMap((band) => [{ day: band.start }, { day: band.end }]));
  const range = $derived(ganttRange(rows, [...markers, ...bandDays, { day: today }], zoom));
  const timelineWidth = $derived(range ? rangeDays(range) * dayWidth : 0);
  const months = $derived(range ? monthCells(range) : []);
  const ticks = $derived(range ? tickCells(range, zoom) : []);
  const shownRows = $derived(visibleRows(rows, collapsedIDs));
  const hasBars = $derived(rows.some((row) => row.bars.length > 0));
  // Flat rows (no parentId) need no room for the expand arrow.
  const isTree = $derived(rows.some((row) => row.parentId !== undefined));

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
      <!-- Header: months (or the header bands) on top, days (week zoom) or ISO weeks (month zoom)
        below. Sticky, so it stays in view when the caller caps the height and the rows scroll. -->
      <div class="sticky top-0 z-30 flex border-b border-line bg-surface-soft">
        <div class="sticky left-0 z-20 shrink-0 bg-surface-soft border-r border-line" style:width="{labelWidth}px"></div>
        <div class="relative shrink-0 h-52" style:width="{timelineWidth}px">
          {#each headerBands || [] as band (band.start)}
            {@const box = barBox(band, range, dayWidth)}
            <div class="absolute top-0 h-26 px-6 border-x border-line bg-surface-muted text-sm font-semibold text-fg-soft truncate leading-[26px]"
              style:left="{box.left}px" style:width="{box.width}px" title={band.label}>
              {band.label}
            </div>
          {/each}
          {#each headerBands ? [] : months as month (month.startDay)}
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
          <div class="group flex hover:bg-surface-soft {shownRow.row.css || 'border-b border-line-soft'}" style:min-height="{ROW_HEIGHT}px">
            <div class="sticky left-0 z-10 shrink-0 flex items-center gap-4 pr-8 bg-surface group-hover:bg-surface-soft border-r border-line text-sm min-w-0"
              style:width="{labelWidth}px" style:padding-left="{6 + shownRow.depth * 16}px">
              {#if shownRow.hasChildren}
                <button type="button" class="w-18 h-18 shrink-0 flex items-center justify-center text-fg-muted hover:text-fg"
                  aria-label={ui.translate(collapsedIDs.has(shownRow.row.id) ? 'Expand|Expandir' : 'Collapse|Contraer')}
                  onclick={() => toggleRow(shownRow.row.id)}>
                  <i class={collapsedIDs.has(shownRow.row.id) ? 'icon-[fa--chevron-right]' : 'icon-[fa--chevron-down]'}></i>
                </button>
              {:else if isTree}
                <span class="w-18 shrink-0"></span>
              {/if}
              {#if rowRender}
                {@render rowRender(shownRow.row, shownRow.depth)}
              {:else}
                <span class="truncate {shownRow.hasChildren ? 'font-semibold' : ''}">{shownRow.row.label}</span>
              {/if}
            </div>
            <!-- One grid column per day, every bar on the same grid row: the row grows to its tallest
              bar (wrapped labels). A bar spans the columns it touches; its left margin and width
              place a fractional start or end inside them. -->
            <div class="grid shrink-0 py-5" style:width="{timelineWidth}px" style:grid-template-columns="repeat({range ? rangeDays(range) : 1}, {dayWidth}px)">
              {#each shownRow.row.bars as bar, barIndex (barIndex)}
                {@const box = barBox(bar, range, dayWidth)}
                {@const startColumn = Math.floor(box.left / dayWidth)}
                {@const barCss = BAR_CSS[bar.color || 'blue']}
                {@const barTitle = `${bar.label ? `${bar.label} · ` : ''}${dayMonthLabel(Math.ceil(bar.start))} – ${dayMonthLabel(Math.floor(bar.end))}`}
                <svelte:element this={onBarClick ? 'button' : 'div'} type={onBarClick ? 'button' : undefined}
                  role={onBarClick ? undefined : 'img'} aria-label={barTitle} title={barTitle}
                  class="relative self-start min-h-22 overflow-hidden text-left text-sm leading-[20px] {barCss.bar}
                    {wrapBarLabels ? `border-l-4 py-2 ${barCss.line}` : `rounded-[4px] border ${barCss.border}`}
                    {onBarClick ? 'cursor-pointer hover:brightness-95' : ''}"
                  style="grid-row: 1; grid-column: {startColumn + 1} / span {Math.ceil((box.left + box.width) / dayWidth) - startColumn};
                    margin-left: {box.left - startColumn * dayWidth}px; width: {box.width}px"
                  onclick={onBarClick ? () => onBarClick(shownRow.row, bar) : undefined}>
                  {#if bar.progress}
                    <span class="absolute top-0 bottom-0 left-0 {barCss.progress}" style:width="{Math.min(bar.progress, 1) * 100}%"></span>
                  {/if}
                  {#if bar.label && box.width >= 48}
                    <span class="relative px-6 {wrapBarLabels ? 'line-clamp-3 break-words leading-[1.3]' : 'block truncate'}">{bar.label}</span>
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
