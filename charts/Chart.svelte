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
    // One axis label every labelEvery labels: a long axis would overlap them.
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
    type = 'bar', series, labels, height = 240, stacked = false, labelEvery = 1, onlyIntegers = false,
    formatLabel = (label) => String(label), formatTooltipLabel, formatValue = (value) => String(value), showLegend = true,
  }: Props = $props()

  const Y_AXIS_WIDTH = 50
  const BAR_SHARE_OF_SLOT = 0.7
  const FADED_SERIES_OPACITY = 0.2

  let chartElement = $state<HTMLDivElement>()
  let chartWidth = $state(0)
  let isolatedSeriesName = $state('')
  let hoveredSeriesName = $state('')
  // A series that is no longer in the data (another period) shows them all again.
  const shownSeries = $derived(series.some((chartSeries) => chartSeries.name === isolatedSeriesName)
    ? series.filter((chartSeries) => chartSeries.name === isolatedSeriesName) : series)
  // Grouped bars share their label's slot.
  const barWidth = $derived.by(() => {
    const slotWidth = (chartWidth - Y_AXIS_WIDTH) / Math.max(1, labels.length)
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
    const axisX = { showGrid: false, labelInterpolationFnc: (label: Label, index: number) => index % labelEvery === 0 ? formatLabel(label as string | number) : null }
    const axisY = { offset: Y_AXIS_WIDTH, onlyInteger: onlyIntegers, labelInterpolationFnc: (value: Label) => formatValue(Number(value)) }
    const plugins = [seriesStylePlugin(shownSeries)]
    const chart = type === 'bar'
      ? barChart(chartElement, data, { height, stackBars: stacked, axisX, axisY, plugins })
      : lineChart(chartElement, data, { height, axisX, axisY, plugins, lineSmooth: false })
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

<div class="chart relative w-full" role="img" aria-label="Chart" bind:clientWidth={chartWidth} style={fadedSeriesStyle}
  style:--ct-bar-width={`${barWidth}px`} onpointermove={followPointer} onpointerleave={() => { hoveredLabelIndex = -1 }}>
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
  .chart :global(.ct-label) { font-size: 14px; }
  .chart :global(.ct-grid) { stroke: var(--color-line, #e5e7eb); stroke-dasharray: 3px; }
</style>
