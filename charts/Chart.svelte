<script lang="ts" module>
  // One series of a Chart: its values, one per label (null = no value).
  export interface IChartSeries {
    name: string
    color: string
    values: Array<number | null>
  }
</script>

<script lang="ts">
  // A thin layer over chartist (https://chartist.dev) that draws bars or lines with the caller's
  // colors, a legend and a hover tooltip. Chartist's own legend and tooltip plugins are 1.x plugins
  // that need its global build, so both are drawn here in Svelte.
  // The legend: hovering an entry fades every other series; clicking it shows only that series (the
  // value axis rescales to it), and clicking it again shows every series.
  import { barChart, lineChart, type ChartPlugin, type Label } from 'chartist';
  import 'chartist/styles.css';
  import Card from '../cards/Card.svelte';
  import { useUI } from '../runtime/index.js';

  const ui = useUI()

  interface Props {
    type?: 'bar' | 'line'
    series: IChartSeries[]
    labels: Array<string | number>
    height?: number
    // Bars of a label on top of each other instead of side by side.
    stacked?: boolean
    // One axis label every labelEvery labels: a long axis would overlap them. When absent, every
    // label that fits the chart's width is drawn.
    labelEvery?: number
    onlyIntegers?: boolean
    formatLabel?: (label: string | number) => string
    // The tooltip's title; formatLabel when absent.
    formatTooltipLabel?: (label: string | number) => string
    // The value axis and the tooltip.
    formatValue?: (value: number) => string
    showLegend?: boolean
  }

  const {
    type = 'bar', series, labels, height = 240, stacked = false, labelEvery, onlyIntegers = false,
    formatLabel = (label) => String(label), formatTooltipLabel, formatValue = (value) => String(value), showLegend = true,
  }: Props = $props()

  // A 14px axis digit is ~8px wide; chartist gives the y labels the axis width minus 10px.
  const AXIS_CHAR_WIDTH = 8
  const BAR_SHARE_OF_SLOT = 0.7
  const FADED_SERIES_OPACITY = 0.2

  let chartElement = $state<HTMLDivElement>()
  let chartWidth = $state(0)
  let isolatedSeriesName = $state('')
  let hoveredSeriesName = $state('')
  // A series that is no longer in the data (another period) shows them all again.
  const shownSeries = $derived(series.some((chartSeries) => chartSeries.name === isolatedSeriesName)
    ? series.filter((chartSeries) => chartSeries.name === isolatedSeriesName) : series)
  // The y axis is as wide as its widest label, so "40,000" is not clipped and "40" wastes no room.
  // Ticks are not known before chartist draws, so the extreme values rounded up to their leading
  // digit (5,092.50 -> 6,000) stand in for the outermost ticks, which are the widest.
  const roundUpToLeadingDigit = (value: number) => {
    if (value <= 0) { return 0 }
    const magnitude = 10 ** Math.floor(Math.log10(value))
    return Math.ceil(value / magnitude) * magnitude
  }
  const yAxisWidth = $derived.by(() => {
    const drawnValues = stacked
      ? labels.map((_, labelIndex) => shownSeries.reduce((total, chartSeries) => total + (chartSeries.values[labelIndex] || 0), 0))
      : shownSeries.flatMap((chartSeries) => chartSeries.values.map((value) => value || 0))
    const outermostTicks = [roundUpToLeadingDigit(Math.max(0, ...drawnValues)), -roundUpToLeadingDigit(-Math.min(0, ...drawnValues))]
    const widestLabelChars = Math.max(...outermostTicks.map((tick) => formatValue(tick).length))
    return Math.max(30, widestLabelChars * AXIS_CHAR_WIDTH + 10)
  })
  // An x label longer than OBLIQUE_ABOVE_CHARS tilts every x label, so long names don't
  // overlap. The x axis grows to hold the widest tilted label, and the chart grows with it, so the
  // plot keeps its height. A tilted label past OBLIQUE_MAX_CHARS keeps its first
  // OBLIQUE_MAX_CHARS - 1 characters and ends in "...".
  const OBLIQUE_ABOVE_CHARS = 4
  const OBLIQUE_MAX_CHARS = 10
  const OBLIQUE_SINE = Math.sin((40 * Math.PI) / 180)
  // A 14px label letter is ~7px wide on average (narrower than a digit).
  const OBLIQUE_CHAR_WIDTH = 7
  // Tilted labels stack side by side: one needs its 14px line height over sin(40°) of the axis.
  const OBLIQUE_LABEL_SPACING = Math.ceil(14 / OBLIQUE_SINE)
  const DEFAULT_X_AXIS_OFFSET = 30
  const CHART_PADDING_RIGHT = 15
  const formattedXLabels = $derived(labels.map((label) => formatLabel(label)))
  const isObliqueXAxis = $derived(formattedXLabels.some((label) => label.length > OBLIQUE_ABOVE_CHARS))
  // Without a labelEvery prop, the labels thin out only when a label slot is narrower than one
  // label needs: a tilted one, or the widest flat one plus a gap.
  const xLabelEvery = $derived.by(() => {
    if (labelEvery) { return labelEvery }
    const slotWidth = (chartWidth - yAxisWidth - CHART_PADDING_RIGHT) / Math.max(1, labels.length)
    if (slotWidth <= 0) { return 1 }
    const labelWidthNeeded = isObliqueXAxis
      ? OBLIQUE_LABEL_SPACING
      : Math.max(0, ...formattedXLabels.map((label) => label.length)) * OBLIQUE_CHAR_WIDTH + 8
    return Math.max(1, Math.ceil(labelWidthNeeded / slotWidth))
  })
  const drawnXLabels = $derived(formattedXLabels.filter((_, labelIndex) => labelIndex % xLabelEvery === 0))
  const xAxisOffset = $derived.by(() => {
    if (!isObliqueXAxis) { return DEFAULT_X_AXIS_OFFSET }
    const widestLabelChars = Math.max(...drawnXLabels.map((label) => shortenObliqueLabel(label).length))
    // The tilted text's height, plus its line height.
    return Math.ceil(widestLabelChars * OBLIQUE_CHAR_WIDTH * OBLIQUE_SINE + 14)
  })
  function shortenObliqueLabel(label: string) {
    return label.length > OBLIQUE_MAX_CHARS ? `${label.slice(0, OBLIQUE_MAX_CHARS - 1)}...` : label
  }
  // Grouped bars share their label's slot.
  const barWidth = $derived.by(() => {
    const slotWidth = (chartWidth - yAxisWidth) / Math.max(1, labels.length)
    return Math.max(2, Math.min(48, (slotWidth * BAR_SHARE_OF_SLOT) / (stacked || type === 'line' ? 1 : Math.max(1, shownSeries.length))))
  })
  // Each drawn series reads its opacity from --chart-series-opacity-<index>: the legend's hovered
  // series leaves its own unset and fades the rest, without redrawing the chart.
  const fadedSeriesStyle = $derived.by(() => {
    const hoveredIndex = shownSeries.findIndex((chartSeries) => chartSeries.name === hoveredSeriesName)
    if (hoveredIndex < 0) { return '' }
    return shownSeries.map((_, seriesIndex) => seriesIndex === hoveredIndex ? '' : `--chart-series-opacity-${seriesIndex}: ${FADED_SERIES_OPACITY};`).join('')
  })

  // Paints each bar, line and point with its series color and opacity variable, and tags it with
  // its label index, which the tooltip reads from the hovered element.
  const seriesStylePlugin = (chartSeries: IChartSeries[]): ChartPlugin => ({
    name: 'series-style',
    install(chart) {
      chart.on('compose', (current) => {
        if (current.role !== 'bar' && current.role !== 'point' && current.role !== 'line') { return }
        const seriesIndex = current.ctx.seriesIndex ?? 0
        return current.attr({
          style: `stroke: ${chartSeries[seriesIndex]?.color}; opacity: var(--chart-series-opacity-${seriesIndex}, 1)`,
          'data-label-index': current.ctx.valueIndex,
        })
      })
    },
  })

  $effect(() => {
    if (!chartElement) { return }
    const data = { labels: [...labels], series: shownSeries.map((chartSeries) => [...chartSeries.values]) }
    const axisX = {
      showGrid: false, offset: xAxisOffset,
      labelInterpolationFnc: (label: Label, index: number) => {
        if (index % xLabelEvery !== 0) { return null }
        const formattedLabel = formatLabel(label as string | number)
        return isObliqueXAxis ? shortenObliqueLabel(formattedLabel) : formattedLabel
      },
    }
    const axisY = { offset: yAxisWidth, onlyInteger: onlyIntegers, labelInterpolationFnc: (value: Label) => formatValue(Number(value)) }
    const plugins = [seriesStylePlugin(shownSeries)]
    const chartHeight = height + xAxisOffset - DEFAULT_X_AXIS_OFFSET
    // No left padding: the y axis is already sized to its labels (chartist's default adds 10px).
    const chartPadding = { top: 15, right: CHART_PADDING_RIGHT, bottom: 5, left: 0 }
    const chart = type === 'bar'
      ? barChart(chartElement, data, { height: chartHeight, chartPadding, stackBars: stacked, axisX, axisY, plugins })
      : lineChart(chartElement, data, { height: chartHeight, chartPadding, axisX, axisY, plugins, lineSmooth: false })
    return () => { chart.destroy() }
  })

  let hoveredLabelIndex = $state(-1)
  let tooltipLeft = $state(0)
  let tooltipTop = $state(0)
  const followPointer = (event: PointerEvent) => {
    const labelIndex = (event.target as Element).closest('[data-label-index]')?.getAttribute('data-label-index')
    hoveredLabelIndex = labelIndex == null ? -1 : Number(labelIndex)
    const chartBox = (event.currentTarget as HTMLElement).getBoundingClientRect()
    tooltipLeft = event.clientX - chartBox.left
    tooltipTop = event.clientY - chartBox.top
  }
  const tooltipRows = $derived(hoveredLabelIndex < 0 ? [] : shownSeries
    .map((chartSeries) => ({ name: chartSeries.name, color: chartSeries.color, value: chartSeries.values[hoveredLabelIndex] }))
    .filter((row) => row.value))
</script>

{#if showLegend && series.length > 1}
  <div class="flex flex-wrap gap-x-6 gap-y-2 text-[14px]" role="list"
    onpointerover={(event) => { hoveredSeriesName = (event.target as Element).closest('[data-series-name]')?.getAttribute('data-series-name') || '' }}
    onpointerleave={() => { hoveredSeriesName = '' }}>
    {#each series as chartSeries (chartSeries.name)}
      {@const isIsolated = chartSeries.name === isolatedSeriesName}
      {@const seriesName = ui.translate(chartSeries.name)}
      <div role="listitem" data-series-name={chartSeries.name}>
        <Card label={`Shows only ${seriesName}; click again to show all.|Muestra solo ${seriesName}; otro clic muestra todas.`}
          onClick={() => { isolatedSeriesName = isIsolated ? '' : chartSeries.name }}
          css="flex items-center gap-6 rounded px-6 py-2 cursor-pointer hover:bg-surface-muted {isIsolated ? 'bg-blue-bg text-blue-fg ff-semibold' : 'text-fg-muted'} {isolatedSeriesName && !isIsolated ? 'opacity-50' : ''}">
          <span class="inline-block h-10 w-10 shrink-0 rounded-[3px]" style:background={chartSeries.color}></span>
          {seriesName}
        </Card>
      </div>
    {/each}
  </div>
{/if}

<div class="chart relative w-full" class:chart-oblique-x={isObliqueXAxis} role="img" aria-label="Chart" bind:clientWidth={chartWidth} style={fadedSeriesStyle}
  style:--ct-bar-width={`${barWidth}px`} style:--chart-label-every={xLabelEvery} onpointermove={followPointer} onpointerleave={() => { hoveredLabelIndex = -1 }}>
  <div bind:this={chartElement}></div>
  {#if tooltipRows.length > 0}
    <div class="pointer-events-none absolute z-10 rounded border border-line bg-surface px-10 py-6 text-[14px] shadow-md whitespace-nowrap"
      style:left={`${tooltipLeft + 12}px`} style:top={`${tooltipTop + 12}px`}
      style:transform={tooltipLeft > chartWidth / 2 ? 'translateX(calc(-100% - 24px))' : ''}>
      <div class="ff-bold mb-2">{(formatTooltipLabel || formatLabel)(labels[hoveredLabelIndex])}</div>
      {#each tooltipRows as row (row.name)}
        <div class="flex items-center gap-6">
          <span class="inline-block h-10 w-10 shrink-0 rounded-[3px]" style:background={row.color}></span>
          <span class="flex-1">{ui.translate(row.name)}</span><span class="ff-bold ml-12">{formatValue(row.value!)}</span>
        </div>
      {/each}
      {#if stacked && tooltipRows.length > 1}
        <div class="flex justify-between border-t border-line mt-4 pt-2 ff-bold">
          <span>{ui.translate('Total|Total')}</span><span>{formatValue(tooltipRows.reduce((total, row) => total + (row.value || 0), 0))}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The hovered bar or point stands out; a legend hover fades the other series smoothly. */
  .chart :global(:is(.ct-bar, .ct-point, .ct-line)) { transition: opacity 0.15s; }
  .chart :global(.ct-bar:hover), .chart :global(.ct-point:hover) { opacity: 0.75 !important; }
  /* Theme tokens instead of chartist's fixed grays, so the axes follow light and dark mode. The raw
     tokens, not --color-*: `@theme inline` never emits those as CSS variables. */
  .chart { --ct-label-color: var(--fg-muted); }
  .chart :global(.ct-label) { font-size: 14px; }
  .chart :global(.ct-grid) { stroke: var(--line-strong); stroke-dasharray: 3px; }
  /* A bar label is one line, ellipsed, centered on its bar and as wide as the labelEvery slots it
     stands for: chartist sizes it to one slot and wraps it, so long names spill onto their neighbors. */
  .chart :global(.ct-chart-bar .ct-label.ct-horizontal) {
    display: block;
    width: calc(var(--chart-label-every, 1) * 100%) !important;
    margin-left: calc((1 - var(--chart-label-every, 1)) * 50%);
    padding: 0 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Tilted x labels: each ends under its bar's center (a line's point sits on the slot's left edge)
     and runs down-left from there. The label is one text line tall (chartist stretches it to the
     whole axis height, which would put the pivot far below the bars) and pivots on its right end.
     A flex-end box overflows to its left, so the text hangs off that anchor; the label boxes and
     the svg let it spill past their bounds. */
  .chart-oblique-x :global(svg),
  .chart-oblique-x :global(.ct-labels foreignObject) { overflow: visible; }
  .chart-oblique-x :global(.ct-label.ct-horizontal) {
    display: flex !important;
    justify-content: flex-end !important;
    width: 0 !important;
    height: auto !important;
    /* Chartist already places the label box 5px below the axis; pull the text back up to it. */
    margin: -3px 0 0 0 !important;
    padding: 0 !important;
    white-space: nowrap;
    overflow: visible !important;
    transform: rotate(-40deg);
    transform-origin: 100% 50%;
  }
  .chart-oblique-x :global(.ct-chart-bar .ct-label.ct-horizontal) { width: 50% !important; }
</style>
