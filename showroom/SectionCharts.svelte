<script lang="ts">
  import CellHorizontalBars from '../charts/CellHorizontalBars.svelte';
  import CellSimpleChart from '../charts/CellSimpleChart.svelte';
  import ChartCanvas from '../charts/ChartCanvas.svelte';
  import SquareBarSized from '../misc/SquareBarSized.svelte';
  import type { ChartCanvasSeries } from '../charts/ChartCanvas.svelte';
  import ShowroomBlock from './ShowroomBlock.svelte';

  // Deterministic pseudo-random series: a plain sine mix keeps the demo stable across
  // renders, so the canvas cache is not invalidated on every mount.
  const buildValues = (count: number, amplitude: number, phase: number): number[] =>
    Array.from({ length: count }, (_, idx) =>
      Math.round(amplitude * (1.2 + Math.sin(idx / 3 + phase) * 0.6)));

  const POINTS = 24;

  const chartSeries: ChartCanvasSeries[] = [
    { type: 'bar', name: 'Sales|Ventas', values: buildValues(POINTS, 800, 0), color: '#4874f5' },
    { type: 'bar', name: 'Returns|Devoluciones', values: buildValues(POINTS, 220, 1.4), color: '#a5b4fc' },
    { type: 'line', name: 'Margin %|Margen %', values: buildValues(POINTS, 40, 2.2), color: '#e67676',
      lineWidth: 2, pointSize: 3, useOwnAxis: true },
  ];

  // Unix days starting from an arbitrary fixed day so labels never depend on "today".
  const dateLabels = Array.from({ length: POINTS }, (_, idx) => 20000 + idx);

  const sparkValues = buildValues(18, 60, 0.5);
  const barScaleValues = buildValues(12, 90, 1.1);

  // [total, pending] pairs — the component draws pending as an overlay on the total bar.
  const horizontalBarValues: [number, number][] = [
    [420, 120], [310, 40], [180, 175], [95, 10], [640, 300],
  ];

  const kpiTiles = [
    { label: 'Warehouse A|Almacén A', value: '82%', size: 0.82, color: '#4874f5' },
    { label: 'Warehouse B|Almacén B', value: '45%', size: 0.45, color: '#22c55e' },
    { label: 'Warehouse C|Almacén C', value: '18%', size: 0.18, color: '#f59e0b' },
    { label: 'Warehouse D|Almacén D', value: '96%', size: 0.96, color: '#e67676' },
  ];
</script>

<ShowroomBlock name="ChartCanvas" note="2 stacked bar series + 1 line series on its own axis · canvas rendered">
  <ChartCanvas data={chartSeries} dateLabels={dateLabels} dateLabelEvery={3} height={180}
    dateLabelFormatter={(dateLabel) => `D${dateLabel}`} />
  <div class="text-xs text-gray-500 mt-8">
    Bars and the line are painted onto a canvas with fixed hex colors — the canvas itself is
    transparent, so the surface toggle shows through.
  </div>
</ShowroomBlock>

<ShowroomBlock name="CellSimpleChart" note="table-cell sparkline: single color · per-bar colors · colorScale">
  <div class="flex flex-wrap items-end gap-24">
    <div>
      <div class="text-xs text-gray-500 mb-4">barColor</div>
      <CellSimpleChart values={sparkValues} barWidth={8} barGap={3} />
    </div>
    <div>
      <div class="text-xs text-gray-500 mb-4">barColors (per bar)</div>
      <CellSimpleChart values={barScaleValues} barWidth={10} barGap={4}
        barColors={barScaleValues.map((value) => (value > 100 ? '#e67676' : '#4874f5'))} />
    </div>
    <div>
      <div class="text-xs text-gray-500 mb-4">colorScale + labels</div>
      <CellSimpleChart values={barScaleValues} barWidth={10} barGap={4} labelGroup={3}
        labels={barScaleValues.map((_, idx) => `W${idx + 1}`)}
        colorScale={['#dbeafe', '#93c5fd', '#4874f5', '#1e3a8a']} />
    </div>
  </div>
</ShowroomBlock>

<ShowroomBlock name="CellHorizontalBars" note="[total, pending] pairs · linear and log-scaled">
  <div class="flex flex-wrap gap-40">
    <div class="w-260">
      <div class="text-xs text-gray-500 mb-4">linear</div>
      <CellHorizontalBars values={horizontalBarValues} maxValue={640} />
    </div>
    <div class="w-260">
      <div class="text-xs text-gray-500 mb-4">logScaleFactor = 2</div>
      <CellHorizontalBars values={horizontalBarValues} maxValue={640} logScaleFactor={2} />
    </div>
  </div>
</ShowroomBlock>

<ShowroomBlock name="SquareBarSized" note="size is a 0..1 fill ratio · needs a fixed-height parent">
  <div class="flex flex-wrap items-end gap-16">
    {#each kpiTiles as tile}
      <div class="h-150 w-90">
        <SquareBarSized label={tile.label} value={tile.value} size={tile.size}
          backgroundColor={tile.color} sublabel="capacity|capacidad" />
      </div>
    {/each}
    <!-- useStripedLines fills the unused capacity above the bar with diagonal stripes,
         which are drawn on #ffffff — the one place where the gray surface shows a seam. -->
    <div class="h-150 w-90">
      <SquareBarSized label="Striped|Rayado" value="60%" size={0.6}
        backgroundColor="#4874f5" useStripedLines="#dbeafe" />
    </div>
  </div>
</ShowroomBlock>
