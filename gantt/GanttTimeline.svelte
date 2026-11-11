<script lang="ts" generics="G extends GanttTimelineGroup">
  import type { Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  import { mondayBasedWeekday } from '../calendar/calendar.js';
  import {
    lineColorOnDay, packTimelineLanes, screenPixelSize, snapToScreenPixel,
    type GanttTimelineGroup, type GanttTimelinePoint,
  } from './gantt-timeline.js';

  const ui = useUI();
  // The host's item type, e.g. a card with extra fields its snippets read.
  type I = G['items'][number];

  // A day-by-day timeline of a fixed window [fromDay, toDay]: a sticky group column, one column per
  // day (weekends shaded), and each group's items packed in lanes. An item is its label plus a line
  // through its points: a dot per point in its colour (or the point's icon), dashed stretches where
  // a point says so, and the end icon of an item still running. Labels are shown as given: the host
  // translates its own data. `groupRender` replaces a group's label, `tooltipRender` is shown while
  // the pointer is over an item.
  interface Props {
    groups: G[];
    fromDay: number;
    toDay: number;
    // Header of the group column.
    groupsTitle?: string;
    groupRender?: Snippet<[G]>;
    tooltipRender?: Snippet<[I]>;
    dayWidth?: number;
    laneHeight?: number;
    labelWidth?: number;
    emptyText?: string;
    // Classes of the scroll box, e.g. a max height.
    css?: string;
  }
  const {
    groups, fromDay, toDay, groupsTitle = '', groupRender, tooltipRender, dayWidth = 32, laneHeight = 60, labelWidth = 190,
    emptyText = 'Nothing to show.|Nada que mostrar.', css = '',
  }: Props = $props();

  const MONTH_NAMES = ['Jan|Ene', 'Feb|Feb', 'Mar|Mar', 'Apr|Abr', 'May|May', 'Jun|Jun', 'Jul|Jul', 'Aug|Ago', 'Sep|Set', 'Oct|Oct', 'Nov|Nov', 'Dec|Dic'];

  // The line row: 18px tall, the line centred on y = 9. Sizes are in CSS px before snapping.
  const LINE_ROW_PX = 18;
  const LINE_CENTER_PX = 9;
  const TITLE_PX = 22;

  // Positions and sizes are snapped to screen pixels (see snapToScreenPixel), so at 110% or 125%
  // zoom every tick and line has the same thickness. The ratio follows the zoom live.
  let devicePixelRatio = $state(typeof window === 'undefined' ? 1 : window.devicePixelRatio);
  $effect(() => {
    const zoomQuery = window.matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    const onZoomChange = () => { devicePixelRatio = window.devicePixelRatio; };
    zoomQuery.addEventListener('change', onZoomChange);
    return () => zoomQuery.removeEventListener('change', onZoomChange);
  });
  const at = (cssPx: number) => snapToScreenPixel(cssPx, devicePixelRatio);
  const sizeOf = (cssPx: number) => screenPixelSize(cssPx, devicePixelRatio);
  /** A horizontal span [x1, x2) with both edges on screen pixels. */
  const spanStyle = (x1: number, x2: number) => `left: ${at(x1)}px; width: ${at(x2) - at(x1)}px`;
  /** Top of something of a given height centred on the line. */
  const centeredTop = (height: number) => at(LINE_CENTER_PX - height / 2);
  const lineThickness = $derived(sizeOf(3));
  const tickWidth = $derived(sizeOf(2));
  const tickHeight = $derived(sizeOf(9));
  const dotSize = $derived(sizeOf(14));

  const days = $derived(Array.from({ length: Math.max(0, toDay - fromDay + 1) }, (_, index) => fromDay + index));
  const dateOf = (unixDay: number) => new Date(unixDay * 86400000);
  const isWeekend = (unixDay: number) => mondayBasedWeekday(unixDay) >= 5;
  const groupLanes = $derived(groups.map((group) => ({ group, lanes: packTimelineLanes(group.items, fromDay, toDay) })));

  /** The item's box inside the window, in px. Items that began before the window start at its edge. */
  const boxOf = (item: I) => {
    const start = Math.max(item.startDay, fromDay);
    const end = Math.min(item.endDay, toDay);
    return { start, left: (start - fromDay) * dayWidth + 2, right: (end - fromDay + 1) * dayWidth - 2, width: (end - start + 1) * dayWidth - 4 };
  };
  /** x of a point inside its item (negative when it happened before the window: clipped). */
  const xOf = (point: GanttTimelinePoint, boxStart: number) => (point.day - boxStart + point.offset) * dayWidth - 2;
  /** One tick per visible day of the item, at the middle of the day, coloured by that day's point. */
  const ticksOf = (item: I, boxStart: number) => {
    const lastDay = Math.min(item.endDay, toDay);
    const ticks: { x: number, color: string }[] = [];
    for (let unixDay = boxStart; unixDay <= lastDay; unixDay++) {
      const color = lineColorOnDay(item, unixDay);
      if (color) { ticks.push({ x: (unixDay - boxStart + 0.5) * dayWidth - 2, color }); }
    }
    return ticks;
  };

  // Hover tooltip: one for the whole timeline, following the pointer like the charts' tooltip. It
  // sits above the pointer and never leaves the visible part of the scroll box: past the right edge
  // it flips to the pointer's left, and without room above it drops below the pointer.
  const TOOLTIP_GAP_PX = 12;
  let timelineFrame: HTMLDivElement;
  let frameWidth = $state(0);
  let frameHeight = $state(0);
  let tooltipWidth = $state(0);
  let tooltipHeight = $state(0);
  let pointerX = $state(0);
  let pointerY = $state(0);
  let hoveredItem = $state<I | null>(null);
  const itemByID = $derived(new Map(groups.flatMap((group) => group.items).map((item) => [String(item.id), item])));
  const followPointer = (event: PointerEvent) => {
    if (!tooltipRender) { return; }
    const itemID = (event.target as Element).closest('[data-item-id]')?.getAttribute('data-item-id');
    hoveredItem = itemID ? itemByID.get(itemID) ?? null : null;
    const frameBox = timelineFrame.getBoundingClientRect();
    pointerX = event.clientX - frameBox.left;
    pointerY = event.clientY - frameBox.top;
  };
  const tooltipLeft = $derived.by(() => {
    const rightOfPointer = pointerX + TOOLTIP_GAP_PX;
    const left = rightOfPointer + tooltipWidth > frameWidth ? pointerX - TOOLTIP_GAP_PX - tooltipWidth : rightOfPointer;
    return Math.max(0, left);
  });
  const tooltipTop = $derived.by(() => {
    const abovePointer = pointerY - TOOLTIP_GAP_PX - tooltipHeight;
    const top = abovePointer >= 0 ? abovePointer : pointerY + TOOLTIP_GAP_PX;
    return Math.max(0, Math.min(top, frameHeight - tooltipHeight));
  });
</script>

{#snippet lineIcon(iconCss: string, x: number)}
  <!-- On a backdrop, so the line does not show through the icon's gaps. -->
  <span class="absolute bg-surface flex" style="left: {at(x - 9)}px; top: {centeredTop(18)}px; padding: 1px">
    <i class={iconCss} style="width: 16px; height: 16px"></i>
  </span>
{/snippet}

<div class="relative" bind:this={timelineFrame} bind:clientWidth={frameWidth} bind:clientHeight={frameHeight}>
<!-- Scrolling moves the items under a still pointer, so the tooltip hides until the next move. -->
<div class={ifcss(css, 'overflow-auto border border-line rounded-[6px] bg-surface')}
  onpointermove={followPointer} onpointerleave={() => { hoveredItem = null; }} onscroll={() => { hoveredItem = null; }}>
  <div class="relative" style="width: {labelWidth + days.length * dayWidth}px">
    <!-- Day header -->
    <div class="flex sticky top-0 z-20 bg-surface border-b border-line">
      <div class="sticky left-0 z-30 bg-surface shrink-0 px-8 py-4 font-semibold" style="width: {labelWidth}px">{ui.translate(groupsTitle)}</div>
      {#each days as unixDay, index}
        {@const date = dateOf(unixDay)}
        <div class="shrink-0 text-center py-2 leading-tight {isWeekend(unixDay) ? 'bg-surface-soft text-fg-muted' : ''}" style="width: {dayWidth}px">
          <div class="text-fg-muted" style="min-height: 18px">{date.getUTCDate() === 1 || index === 0 ? ui.translate(MONTH_NAMES[date.getUTCMonth()]) : ''}</div>
          <div>{date.getUTCDate()}</div>
        </div>
      {/each}
    </div>

    {#each groupLanes as { group, lanes } (group.id)}
      <div class="flex border-b border-line" aria-label={group.label}>
        <div class="sticky left-0 z-10 bg-surface shrink-0 px-8 py-6 border-r border-line" style="width: {labelWidth}px">
          {#if groupRender}{@render groupRender(group)}{:else}<div class="font-semibold">{group.label}</div>{/if}
        </div>
        <!-- Day grid behind the items; weekends shaded. -->
        <div class="relative shrink-0" style="width: {days.length * dayWidth}px; height: {lanes.length * laneHeight}px">
          {#each days as unixDay, index}
            <div class="absolute top-0 bottom-0 border-l border-line-soft {isWeekend(unixDay) ? 'bg-surface-soft' : ''}" style={spanStyle(index * dayWidth, (index + 1) * dayWidth)}></div>
          {/each}
          {#each lanes as lane, laneIndex}
            {#each lane as item (item.id)}
              {@const box = boxOf(item)}
              {@const leadInEnd = item.startDay < fromDay ? 0.5 * dayWidth - 2 : -Infinity}
              <!-- A running item ends at the middle of its last day when that day is on screen; past
                   the window it runs to the edge. -->
              {@const runningEndX = item.endDay <= toDay ? (item.endDay - box.start + 0.5) * dayWidth - 2 : box.width - 8}
              <div class="absolute overflow-hidden"
                style="{spanStyle(box.left, box.right)}; top: {at(laneIndex * laneHeight + 4)}px; height: {laneHeight - 8}px"
                data-item-id={item.id} aria-label={item.label}>
                <!-- Fixed height: a line-height in CSS px would start the line row between screen pixels. -->
                <div class="truncate px-2 text-[15px] {item.labelCss ?? ''}" style="height: {TITLE_PX}px; line-height: {TITLE_PX}px">{item.label}</div>
                <div class="relative" style="height: {LINE_ROW_PX}px">
                  <!-- An item that began before the window: the stretch up to the first day's tick is
                       dotted, so it reads as "comes from earlier". -->
                  {#if item.startDay < fromDay && lineColorOnDay(item, fromDay)}
                    <div class="absolute" style="{spanStyle(0, leadInEnd)}; top: {centeredTop(lineThickness)}px; border-top: {lineThickness}px dotted {lineColorOnDay(item, fromDay)}"></div>
                  {/if}
                  {#each item.points as point, pointIndex}
                    {@const next = item.points[pointIndex + 1]}
                    {@const x1 = Math.max(xOf(point, box.start), leadInEnd)}
                    {@const x2 = next ? xOf(next, box.start) : item.endIcon ? runningEndX : x1}
                    {#if x2 > x1}
                      <div class="absolute" style="{spanStyle(x1, x2)}; top: {centeredTop(lineThickness)}px; border-top: {lineThickness}px {point.dashed ? 'dashed' : 'solid'} {point.color}"></div>
                    {/if}
                  {/each}
                  {#each ticksOf(item, box.start) as tick}
                    <div class="absolute" style="left: {at(tick.x - tickWidth / 2)}px; top: {centeredTop(tickHeight)}px; width: {tickWidth}px; height: {tickHeight}px; background: {tick.color}"></div>
                  {/each}
                  {#each item.points as point}
                    {@const x = xOf(point, box.start)}
                    {#if point.icon}
                      {@render lineIcon(point.icon, x)}
                    {:else}
                      <div class="absolute rounded-full border-2 border-surface" style="left: {at(x - dotSize / 2)}px; top: {centeredTop(dotSize)}px; width: {dotSize}px; height: {dotSize}px; background: {point.color}"></div>
                    {/if}
                  {/each}
                  {#if item.endIcon}
                    {@render lineIcon(item.endIcon, runningEndX)}
                  {/if}
                </div>
              </div>
            {/each}
          {/each}
        </div>
      </div>
    {:else}
      <div class="text-fg-muted p-16">{ui.translate(emptyText)}</div>
    {/each}
  </div>
</div>
{#if hoveredItem && tooltipRender}
  <div class="pointer-events-none absolute z-40 rounded border border-line bg-surface px-10 py-6 text-[14px] shadow-md whitespace-nowrap"
    bind:clientWidth={tooltipWidth} bind:clientHeight={tooltipHeight} style:left={`${tooltipLeft}px`} style:top={`${tooltipTop}px`}>
    {@render tooltipRender(hoveredItem)}
  </div>
{/if}
</div>
