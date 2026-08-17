<script lang="ts" module>
  interface IChartCanvasLineFrame {
    name: string
    stroke: string
    strokeWidth: number
    segments: number[][]
    pointSize: number
    points: Array<{ x: number, y: number }>
  }

  interface IChartCanvasLineRange {
    minValue: number
    maxValue: number
  }

  interface IChartCanvasCacheEntry {
    renderKey: string
    barFrames: import('./chart-bar-layout').ChartBarFrame[]
    lineFrames: IChartCanvasLineFrame[]
  }

  interface IChartCanvasMetrics {
    pointsCount: number
    columnWidth: number
    maxChartValue: number
    plotWidth: number
  }

  interface IChartCanvasYAxisGuide {
    label: string
    top: number
    transform: string
    labelOffsetPx: number
    hideLabel: boolean
  }

  interface IChartCanvasHoverSeries {
    name: string
    color: string
    valueLabel: string
    // Null for bar series and for a series whose line is drawn on a scale this readout does not
    // resolve: the value still prints, it just gets no dot on the crosshair.
    dotY: number | null
  }

  interface IChartCanvasXAxisLabel {
    key: string
    label: string
    left: number
    align: "left" | "center" | "right"
    transform: string
  }

  export interface ChartCanvasSeries {
    type: "bar" | "line"
    values: Array<number | null>
    name: string
    color?: string
    lineWidth?: number
    pointSize?: number
    renderPointOnlyOnChange?: boolean
    useOwnAxis?: boolean
    yAxisMin?: number
    yAxisMax?: number
  }

  export interface ChartCanvasProps {
    id?: number | string
    data: ChartCanvasSeries[]
    dateLabels?: Array<string | number>
    dateLabelFormatter?: (dateLabel: string | number, labelIndex: number) => string
    dateLabelEvery?: number
    useHtmlRendered?: boolean
    className?: string
    style?: string
    height?: number
    fixedPointWidthPx?: number
    showBottomBaseline?: boolean
    barMode?: import('./chart-bar-layout').ChartBarMode
    // Pins the top of the shared axis, for series whose scale is known in advance rather than
    // observed — a CPU percentage is 0..100 even on an idle machine, and auto-scaling it to the
    // highest sample makes 3% fill the plot and read as alarming. Only raises the axis, never
    // lowers it, so a series that exceeds the expected ceiling is still drawn in full.
    sharedAxisMaxValue?: number
    // Snaps the shared-axis ceiling and labels to this base interval. Crowded charts may skip
    // ticks, but every visible value remains an exact multiple of the requested step.
    yAxisStepSize?: number
    // Opt-in, because the readout puts a pointer-capturing overlay over the plot and a chart that
    // sits inside a clickable card does not necessarily want one.
    showTooltip?: boolean
    // dateLabelFormatter names the span a label heads, not a single point, so a caller can have it
    // collapse the tail of the window into one edge label. The tooltip names one exact point and
    // would inherit that collapse, so it takes its own formatter and falls back only when absent.
    tooltipLabelFormatter?: (dateLabel: string | number, labelIndex: number) => string
    tooltipValueFormatter?: (value: number, series: ChartCanvasSeries) => string
  }

  const sharedChartCache = new Map<string, IChartCanvasCacheEntry>()
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte"
  import { buildSteppedYAxisTickValues, getSteppedYAxisMaximum, getXAxisLabelPosition, normalizeYAxisStepSize } from './chart-axis-layout'
  import { buildChartBarFrames, getChartBarMaximum } from './chart-bar-layout'
  import { formatHoverValue, getHoverCrosshairX, resolveHoverPointIndex } from './chart-hover'

  const {
    id = "",
    data = [],
    dateLabels = [],
    dateLabelFormatter = (dateLabel) => String(dateLabel ?? ""),
    dateLabelEvery = 1,
    useHtmlRendered = false,
    className = "h100 w100",
    style = "",
    height = 64,
    fixedPointWidthPx = undefined,
    showBottomBaseline = false,
    barMode = 'stacked',
    sharedAxisMaxValue = undefined,
    yAxisStepSize = undefined,
    showTooltip = false,
    tooltipLabelFormatter = undefined,
    tooltipValueFormatter = undefined,
  }: ChartCanvasProps = $props()

  let containerElement = $state<HTMLDivElement | undefined>(undefined)
  let plotFrameElement = $state<HTMLDivElement | undefined>(undefined)
  let plotCanvasElement = $state<HTMLDivElement | undefined>(undefined)
  let measuredWidth = $state(0)
  let resizeObserver: ResizeObserver | undefined
  let chartLeafer: any
  let pendingRenderFrame = 0
  let lastRenderAt = 0
  let queuedRenderTimeout: ReturnType<typeof setTimeout> | undefined
  let lastRenderKey = ""
  let sharedLeaferPromise: Promise<any> | undefined

  // Throttle expensive canvas redraws while allowing the host layout to resize freely.
  const renderThrottleMs = 250
  const yAxisLabelWidthPx = 28
  // Enough gap that the tooltip clears the cursor without detaching from it.
  const hoverTooltipOffsetPx = 14
  const yAxisGuideSpacingPx = 16
  const yAxisPaddingTopPx = 2
  const linePaddingBottomPx = 1
  const xAxisLabelHeightPx = 18

  const snapStrokePoint = (value: number, strokeWidth: number) => {
    const roundedValue = Math.round(value)
    return Math.round(strokeWidth) % 2 === 1 ? roundedValue + 0.5 : roundedValue
  }

  const loadLeafer = () => {
    if (!sharedLeaferPromise) {
      sharedLeaferPromise = import("leafer-ui")
    }
    return sharedLeaferPromise
  }

  const updateMetrics = () => {
    if (!plotFrameElement) { return }
    measuredWidth = Math.max(0, Math.floor(plotFrameElement.clientWidth))
  }

  const getChartMetrics = (): IChartCanvasMetrics => {
    const pointsCount = data.reduce((maxCount, chartSeries) => {
      return Math.max(maxCount, chartSeries.values.length)
    }, 0)
    const barSeries = data.filter((chartSeries) => chartSeries.type === 'bar')
    const barMaximum = getChartBarMaximum(barSeries, pointsCount, barMode)
    // A series on its own axis is by definition not on this one, so it must not set its scale.
    // Including it let a memory line in MB rescale the CPU axis it shares a chart with, and the
    // y-axis labels — which are always built from this value — then described neither series.
    const lineSeries = data.filter((chartSeries) => chartSeries.type === 'line' && !chartSeries.useOwnAxis)
    const observedMaximum = Array.from({ length: pointsCount }, (_, pointIndex) => {
      const lineMaximum = lineSeries.reduce((maxValue, chartSeries) => {
        return Math.max(maxValue, chartSeries.values[pointIndex] || 0, 0)
      }, 0)
      return Math.max(barMaximum, lineMaximum)
    }).reduce((maxValue, stackValue) => Math.max(maxValue, stackValue), sharedAxisMaxValue || 0)
    const maxChartValue = getSteppedYAxisMaximum(observedMaximum, yAxisStepSize)

    return {
      pointsCount,
      columnWidth: pointsCount > 0 ? fixedPointWidthPx || (measuredWidth / pointsCount) : 0,
      maxChartValue,
      plotWidth: pointsCount > 0 ? pointsCount * (fixedPointWidthPx || (measuredWidth / pointsCount)) : measuredWidth,
    }
  }

  const formatYAxisLabel = (value: number) => {
    if (value >= 1000) {
      const compactValue = Number((value / 1000).toFixed(1))
      return `${compactValue}k`
    }
    return String(Math.round(value))
  }

  const buildYAxisGuides = (metrics: IChartCanvasMetrics): IChartCanvasYAxisGuide[] => {
    const guideCount = Math.max(1, Math.floor(height / yAxisGuideSpacingPx))
    const normalizedStepSize = normalizeYAxisStepSize(yAxisStepSize)
    if (normalizedStepSize && metrics.maxChartValue > 0) {
      const tickValues = buildSteppedYAxisTickValues(metrics.maxChartValue, normalizedStepSize, guideCount)
      return tickValues.map((tickValue, tickIndex) => ({
        label: formatYAxisLabel(tickValue),
        top: yAxisPaddingTopPx + ((1 - (tickValue / metrics.maxChartValue)) * (height - yAxisPaddingTopPx)),
        transform: tickIndex === 0 ? 'translateY(0)' : 'translateY(-50%)',
        labelOffsetPx: tickIndex === 0 ? -2 : 2,
        hideLabel: false,
      }))
    }
    let hasRenderedZeroLabel = false

    // Keep the HTML grid deterministic with the same vertical scale the canvas uses.
    return Array.from({ length: guideCount }, (_, guideIndex) => {
      const top = yAxisPaddingTopPx + (guideIndex * yAxisGuideSpacingPx)
      const ratioFromBottom = Math.max(0, 1 - (top / height))
      const rawValue = metrics.maxChartValue * ratioFromBottom
      const roundedValue = Math.round(rawValue)
      const hideLabel = roundedValue === 0 && hasRenderedZeroLabel

      if (roundedValue === 0 && !hasRenderedZeroLabel) {
        hasRenderedZeroLabel = true
      }

      return {
        label: formatYAxisLabel(rawValue),
        top,
        transform: guideIndex === 0 ? 'translateY(0)' : 'translateY(-50%)',
        labelOffsetPx: guideIndex === 0 ? -2 : 2,
        hideLabel,
      }
    })
  }

  const buildBarFrames = (metrics: IChartCanvasMetrics) => {
    const barSeries = data.filter((chartSeries) => chartSeries.type === 'bar')
    return buildChartBarFrames({
      series: barSeries,
      pointsCount: metrics.pointsCount,
      columnWidth: metrics.columnWidth,
      maxValue: metrics.maxChartValue,
      height,
      mode: barMode,
    })
  }

  const getLineRange = (chartSeries: ChartCanvasSeries, metrics: IChartCanvasMetrics): IChartCanvasLineRange => {
    // Default line series to the shared chart axis so bars and lines stay comparable.
    if (!chartSeries.useOwnAxis) {
      return {
        minValue: 0,
        maxValue: metrics.maxChartValue > 0 ? metrics.maxChartValue : 1,
      }
    }

    const numericValues = chartSeries.values.filter((pointValue): pointValue is number => {
      return pointValue !== null && pointValue !== undefined
    })

    const fallbackMaxValue = metrics.maxChartValue > 0 ? metrics.maxChartValue : 1
    const rawMinValue = chartSeries.yAxisMin ?? (numericValues.length ? Math.min(...numericValues) : 0)
    const rawMaxValue = chartSeries.yAxisMax ?? (numericValues.length ? Math.max(...numericValues) : fallbackMaxValue)

    if (rawMaxValue > rawMinValue) {
      return {
        minValue: rawMinValue,
        maxValue: rawMaxValue,
      }
    }

    // Keep constant-value lines visible by expanding a tiny local range around the value.
    const centerValue = rawMaxValue || rawMinValue || 0
    const paddingValue = Math.max(Math.abs(centerValue) * 0.1, 1)
    return {
      minValue: centerValue - paddingValue,
      maxValue: centerValue + paddingValue,
    }
  }

  const getLinePointY = (pointValue: number, lineRange: IChartCanvasLineRange) => {
    const valueSpan = lineRange.maxValue - lineRange.minValue
    if (valueSpan <= 0) { return height / 2 }

    const normalizedPointValue = Math.min(lineRange.maxValue, Math.max(lineRange.minValue, pointValue))
    const usableHeight = Math.max(1, height - linePaddingBottomPx)
    return usableHeight - (((normalizedPointValue - lineRange.minValue) / valueSpan) * usableHeight)
  }

  const buildLineFrames = (metrics: IChartCanvasMetrics): IChartCanvasLineFrame[] => {
    const lineSeries = data.filter((chartSeries) => chartSeries.type === 'line')

    return lineSeries.map((chartSeries) => {
      const segments: Array<number[]> = []
      let currentSegment: number[] = []
      const lineRange = getLineRange(chartSeries, metrics)
      const strokeWidth = chartSeries.lineWidth || 2

      for (let pointIndex = 0; pointIndex < chartSeries.values.length; pointIndex += 1) {
        const pointValue = chartSeries.values[pointIndex]
        if (pointValue === null || pointValue === undefined) {
          if (currentSegment.length >= 4) { segments.push(currentSegment) }
          currentSegment = []
          continue
        }

        const x = snapStrokePoint((pointIndex * metrics.columnWidth) + (metrics.columnWidth / 2), strokeWidth)
        const y = snapStrokePoint(getLinePointY(pointValue, lineRange), strokeWidth)
        currentSegment.push(x, y)
      }

      if (currentSegment.length >= 4) { segments.push(currentSegment) }

      const lineFrame: IChartCanvasLineFrame = {
        name: chartSeries.name,
        stroke: chartSeries.color || '#0f172a',
        strokeWidth,
        segments,
        pointSize: chartSeries.pointSize || 0,
        points: chartSeries.values.flatMap((pointValue, pointIndex) => {
          if (pointValue === null || pointValue === undefined) { return [] }
          const previousPointValue = pointIndex > 0 ? chartSeries.values[pointIndex - 1] : null
          if (chartSeries.renderPointOnlyOnChange && previousPointValue === pointValue) {
            return []
          }
          const x = snapStrokePoint((pointIndex * metrics.columnWidth) + (metrics.columnWidth / 2), strokeWidth)
          const y = snapStrokePoint(getLinePointY(pointValue, lineRange), strokeWidth)
          return [{ x, y }]
        }),
      }
      return lineFrame
    })
  }

  const yAxisGuides = $derived.by(() => {
    return buildYAxisGuides(getChartMetrics())
  })

  const chartMetrics = $derived.by(() => {
    // Share one metrics object across HTML guides and the canvas width calculation.
    return getChartMetrics()
  })

  const xAxisLabels = $derived.by((): IChartCanvasXAxisLabel[] => {
    if (!dateLabels.length || chartMetrics.pointsCount <= 0) { return [] }

    const labelStep = Math.max(1, Math.floor(dateLabelEvery || 1))
    const visibleLabels: IChartCanvasXAxisLabel[] = []

    for (let labelIndex = 0; labelIndex < Math.min(dateLabels.length, chartMetrics.pointsCount); labelIndex += labelStep) {
      const labelPosition = getXAxisLabelPosition(labelIndex, chartMetrics.pointsCount, chartMetrics.columnWidth)
      visibleLabels.push({
        key: `${labelIndex}-${String(dateLabels[labelIndex] ?? "")}`,
        label: dateLabelFormatter(dateLabels[labelIndex], labelIndex),
        ...labelPosition,
      })
    }

    return visibleLabels
  })

  const barFrames = $derived.by(() => {
    return buildBarFrames(chartMetrics)
  })

  const lineFrames = $derived.by(() => {
    return buildLineFrames(chartMetrics)
  })

  let hoverPointIndex = $state<number | null>(null)
  let hoverPointerX = $state(0)
  let hoverPointerY = $state(0)

  // The plot is anchored to the right edge of its frame, so with a fixed point width narrower than
  // the frame the two do not share an origin. The overlay is anchored the same way, which keeps
  // pointer coordinates in the plot's own space; this is only needed to place the tooltip, which
  // lives outside the frame so the frame's overflow: hidden cannot clip it.
  const plotOffsetLeft = $derived(Math.max(0, measuredWidth - chartMetrics.plotWidth))

  const hoverSeries = $derived.by((): IChartCanvasHoverSeries[] => {
    if (!showTooltip || hoverPointIndex === null) { return [] }

    return data.flatMap((chartSeries) => {
      const pointValue = chartSeries.values[hoverPointIndex as number]
      // A gap in the data is a gap in the readout: printing "0" where the sample is missing would
      // claim the service reported an idle value rather than nothing at all.
      if (pointValue === null || pointValue === undefined) { return [] }

      const hoverSeriesItem: IChartCanvasHoverSeries = {
        name: chartSeries.name,
        color: chartSeries.color || '#0f172a',
        valueLabel: tooltipValueFormatter
          ? tooltipValueFormatter(pointValue, chartSeries)
          : formatHoverValue(pointValue),
        dotY: chartSeries.type === 'line'
          ? getLinePointY(pointValue, getLineRange(chartSeries, chartMetrics))
          : null,
      }
      return [hoverSeriesItem]
    })
  })

  const hoverCrosshairX = $derived(hoverPointIndex === null
    ? 0
    : getHoverCrosshairX(hoverPointIndex, chartMetrics.columnWidth))

  const hoverTooltipLabel = $derived.by(() => {
    if (hoverPointIndex === null) { return "" }
    const dateLabel = dateLabels[hoverPointIndex]
    if (dateLabel === undefined) { return "" }
    return (tooltipLabelFormatter || dateLabelFormatter)(dateLabel, hoverPointIndex)
  })

  // Past the middle of the plot the tooltip flips to the other side of the cursor, so it never
  // runs off the card it is drawn on and never covers the part of the line still to the right.
  const hoverTooltipFlipped = $derived(hoverPointerX > chartMetrics.plotWidth / 2)

  const hoverTooltipLeft = $derived(yAxisLabelWidthPx + plotOffsetLeft + hoverPointerX
    + (hoverTooltipFlipped ? -hoverTooltipOffsetPx : hoverTooltipOffsetPx))

  const hoverTooltipTop = $derived(Math.min(height, Math.max(0, hoverPointerY)))

  const hoverTooltipTransform = $derived(hoverTooltipFlipped
    ? 'translate(-100%, -50%)'
    : 'translate(0, -50%)')

  const handleHoverPointerMove = (pointerEvent: PointerEvent) => {
    const overlayElement = pointerEvent.currentTarget as HTMLElement
    const overlayBounds = overlayElement.getBoundingClientRect()
    const localX = pointerEvent.clientX - overlayBounds.left

    hoverPointIndex = resolveHoverPointIndex(localX, chartMetrics.columnWidth, chartMetrics.pointsCount)
    hoverPointerX = localX
    hoverPointerY = pointerEvent.clientY - overlayBounds.top
  }

  const handleHoverPointerLeave = () => {
    hoverPointIndex = null
  }

  const getRenderKey = () => {
    return JSON.stringify({
      measuredWidth,
      height,
      id,
      fixedPointWidthPx: fixedPointWidthPx || 0,
      dateLabels,
      dateLabelEvery,
      useHtmlRendered,
      barMode,
      sharedAxisMaxValue: sharedAxisMaxValue || 0,
      yAxisStepSize: yAxisStepSize || 0,
      series: data.map((chartSeries) => ({
        type: chartSeries.type,
        name: chartSeries.name,
        color: chartSeries.color || "",
        lineWidth: chartSeries.lineWidth || 0,
        pointSize: chartSeries.pointSize || 0,
        renderPointOnlyOnChange: chartSeries.renderPointOnlyOnChange || false,
        useOwnAxis: chartSeries.useOwnAxis || false,
        yAxisMin: chartSeries.yAxisMin ?? null,
        yAxisMax: chartSeries.yAxisMax ?? null,
        values: chartSeries.values,
      })),
    })
  }

  const renderChart = async () => {
    await tick()
    if (!containerElement || !plotCanvasElement || measuredWidth <= 0) { return }

    const nextRenderKey = getRenderKey()
    if (nextRenderKey === lastRenderKey) { return }

    const { Leafer, Rect, Line, Ellipse } = await loadLeafer()
    const metrics = chartMetrics
    const cacheID = String(id || '')
    const cachedChart = cacheID ? sharedChartCache.get(cacheID) : undefined
    const useCachedFrames = cachedChart?.renderKey === nextRenderKey
    const nextBarFrames = useCachedFrames ? cachedChart.barFrames : buildBarFrames(metrics)
    const nextLineFrames = useCachedFrames ? cachedChart.lineFrames : buildLineFrames(metrics)

    if (cacheID && !useCachedFrames) {
      sharedChartCache.set(cacheID, {
        renderKey: nextRenderKey,
        barFrames: nextBarFrames,
        lineFrames: nextLineFrames,
      })
    }

    chartLeafer?.destroy()
    chartLeafer = new Leafer({
      view: plotCanvasElement,
      width: metrics.plotWidth,
      height,
      fill: 'transparent',
    })

    // Rebuild from the flat frame list so updates stay deterministic and minimal.
    if (!useHtmlRendered) {
      for (const barFrame of nextBarFrames) {
        if (!barFrame.height) { continue }
        chartLeafer.add(new Rect(barFrame))
      }
    }

    for (const lineFrame of nextLineFrames) {
      for (const segment of lineFrame.segments) {
        if (segment.length < 4) { continue }
        chartLeafer.add(new Line({
          points: segment,
          stroke: lineFrame.stroke,
          strokeWidth: lineFrame.strokeWidth,
        }))
      }

      for (const point of lineFrame.points) {
        if (!lineFrame.pointSize) { continue }
        chartLeafer.add(new Ellipse({
          x: point.x - lineFrame.pointSize,
          y: point.y - lineFrame.pointSize,
          width: lineFrame.pointSize * 2,
          height: lineFrame.pointSize * 2,
          fill: lineFrame.stroke,
        }))
      }
    }

    lastRenderKey = nextRenderKey
  }

  const scheduleRender = () => {
    if (pendingRenderFrame) { return }

    pendingRenderFrame = requestAnimationFrame(() => {
      pendingRenderFrame = 0

      const now = Date.now()
      const waitTime = renderThrottleMs - (now - lastRenderAt)
      if (waitTime > 0) {
        if (queuedRenderTimeout) { clearTimeout(queuedRenderTimeout) }
        queuedRenderTimeout = setTimeout(() => {
          lastRenderAt = Date.now()
          void renderChart()
        }, waitTime)
        return
      }

      lastRenderAt = now
      void renderChart()
    })
  }

  onMount(async () => {
    updateMetrics()

    if (containerElement) {
      resizeObserver = new ResizeObserver(() => {
        updateMetrics()
        scheduleRender()
      })
      resizeObserver.observe(containerElement)
    }

    scheduleRender()
  })

  $effect(() => {
    data
    dateLabels
    dateLabelEvery
    useHtmlRendered
    barMode
    yAxisStepSize
    className
    style
    height
    scheduleRender()
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    if (pendingRenderFrame) { cancelAnimationFrame(pendingRenderFrame) }
    if (queuedRenderTimeout) { clearTimeout(queuedRenderTimeout) }
    chartLeafer?.destroy()
    chartLeafer = undefined
  })
</script>

<div bind:this={containerElement} class={className} style={`${style};height:${height + (xAxisLabels.length ? xAxisLabelHeightPx : 0)}px`}>
  <div class="relative flex h-full w-full min-w-0 flex-col">
    <div class="relative flex min-h-0 flex-1 w-full min-w-0">
    <div class="relative shrink-0 text-right text-[12px] leading-none text-slate-500" style={`width:${yAxisLabelWidthPx}px`}>
      {#each yAxisGuides as yAxisGuide (yAxisGuide.top)}
        {#if !yAxisGuide.hideLabel}
          <div class="pointer-events-none absolute right-0 pr-4 [&>div]:block" style={`top:${yAxisGuide.top + yAxisGuide.labelOffsetPx}px;transform:${yAxisGuide.transform}`}>
            <div>{yAxisGuide.label}</div>
          </div>
        {/if}
      {/each}
    </div>

    <div class="relative h-full min-w-0 flex-1 overflow-hidden" bind:this={plotFrameElement}>
      <div class="absolute inset-0 [&>div]:pointer-events-none [&>div]:absolute [&>div]:left-0 [&>div]:right-0 [&>div]:border-t [&>div]:border-dashed [&>div]:border-slate-300/80">
        {#each yAxisGuides as yAxisGuide (yAxisGuide.top)}
          <div style={`top:${yAxisGuide.top}px`}></div>
        {/each}
      </div>

      {#if showBottomBaseline}
        <!-- The explicit zero baseline is opt-in because existing charts intentionally have a floating plot. -->
        <div class="pointer-events-none absolute inset-x-0 bottom-0 z-[1] border-t border-solid border-slate-400/90"></div>
      {/if}

      {#if useHtmlRendered}
        <!-- Render bars in the DOM so narrow stacked columns can use the browser's pixel snapping. -->
        <div class="absolute inset-y-0 [&>div]:pointer-events-none [&>div]:absolute" style={`width:${chartMetrics.plotWidth}px;right:0`}>
          {#each barFrames as barFrame, frameIndex (`${frameIndex}-${barFrame.x}-${barFrame.y}-${barFrame.height}`)}
            {#if barFrame.height}
              <div
                style={`left:${barFrame.x}px;top:${barFrame.y}px;width:${barFrame.width}px;height:${barFrame.height}px;background:${barFrame.fill}`}
              ></div>
            {/if}
          {/each}
        </div>
      {/if}

      <div
        bind:this={plotCanvasElement}
        class="absolute inset-y-0"
        style={`width:${chartMetrics.plotWidth}px;right:0`}
      ></div>

      {#if showTooltip}
        {#if hoverPointIndex !== null && hoverSeries.length}
          <div class="pointer-events-none absolute inset-y-0 z-[2]" style={`width:${chartMetrics.plotWidth}px;right:0`}>
            <div class="absolute inset-y-0 border-l border-dashed border-slate-500/70" style={`left:${hoverCrosshairX}px`}></div>
            {#each hoverSeries as hoverSeriesItem, hoverSeriesIndex (hoverSeriesIndex)}
              {#if hoverSeriesItem.dotY !== null}
                <div
                  class="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                  style={`left:${hoverCrosshairX}px;top:${hoverSeriesItem.dotY}px;background:${hoverSeriesItem.color}`}
                ></div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- The capture layer is last and empty on purpose: nothing it would report sits above it,
             and the crosshair it drives must not intercept the pointer that positions it. -->
        <div
          class="absolute inset-y-0 z-[3]"
          style={`width:${chartMetrics.plotWidth}px;right:0`}
          onpointermove={handleHoverPointerMove}
          onpointerleave={handleHoverPointerLeave}
        ></div>
      {/if}
    </div>
    </div>

    {#if showTooltip && hoverPointIndex !== null && hoverSeries.length}
      <!-- Outside the plot frame, whose overflow: hidden would cut the tooltip off at the edges. -->
      <div
        class="pointer-events-none absolute z-[4] whitespace-nowrap rounded-[6px] border border-slate-300 bg-white/95 px-8 py-6 text-[11px] leading-[15px] text-slate-600 shadow-md"
        style={`left:${hoverTooltipLeft}px;top:${hoverTooltipTop}px;transform:${hoverTooltipTransform}`}
      >
        {#if hoverTooltipLabel}
          <div class="mb-4 font-bold text-slate-900">{hoverTooltipLabel}</div>
        {/if}
        {#each hoverSeries as hoverSeriesItem, hoverSeriesIndex (hoverSeriesIndex)}
          <div class="flex items-center gap-6">
            <span class="inline-block h-8 w-8 shrink-0 rounded-full" style={`background:${hoverSeriesItem.color}`}></span>
            <span>{hoverSeriesItem.name}</span>
            <span class="ff-mono ml-auto pl-10 font-bold text-slate-900">{hoverSeriesItem.valueLabel}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if xAxisLabels.length}
      <div class="relative mt-2 flex w-full min-w-0">
        <div class="shrink-0" style={`width:${yAxisLabelWidthPx}px`}></div>
        <div class="relative min-w-0 flex-1 overflow-hidden" style={`height:${xAxisLabelHeightPx}px`}>
          <div class="absolute inset-y-0 [&>div]:pointer-events-none [&>div]:absolute [&>div]:text-[11px] [&>div]:uppercase [&>div]:leading-none [&>div]:text-slate-500 [&>div]:whitespace-nowrap" style={`width:${chartMetrics.plotWidth}px;right:0`}>
            {#each xAxisLabels as xAxisLabel (xAxisLabel.key)}
              <div
                class={`${xAxisLabel.align === 'left' ? '[&>div]:text-left' : xAxisLabel.align === 'right' ? '[&>div]:text-right' : '[&>div]:text-center'}`}
                style={`left:${xAxisLabel.left}px;transform:${xAxisLabel.transform}`}
              >
                <div>{xAxisLabel.label}</div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
