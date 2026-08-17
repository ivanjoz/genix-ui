export type ChartBarMode = 'stacked' | 'grouped';

export interface ChartBarLayoutSeries {
  values: Array<number | null>;
  color?: string;
}

export interface ChartBarFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

interface ChartBarLayoutArgs {
  series: ChartBarLayoutSeries[];
  pointsCount: number;
  columnWidth: number;
  maxValue: number;
  height: number;
  mode: ChartBarMode;
}

const snapStart = (value: number) => Math.round(value);
const snapSize = (value: number) => value > 0 ? Math.max(1, Math.round(value)) : 0;

// Grouped mode compares independent pools; stacked mode preserves the established chart behavior.
export const getChartBarMaximum = (
  series: ChartBarLayoutSeries[],
  pointsCount: number,
  mode: ChartBarMode,
): number => Array.from({ length: pointsCount }, (_, pointIndex) => {
  const values = series.map((chartSeries) => Math.max(0, chartSeries.values[pointIndex] || 0));
  return mode === 'grouped'
    ? values.reduce((maximum, value) => Math.max(maximum, value), 0)
    : values.reduce((total, value) => total + value, 0);
}).reduce((maximum, value) => Math.max(maximum, value), 0);

export const buildChartBarFrames = ({
  series,
  pointsCount,
  columnWidth,
  maxValue,
  height,
  mode,
}: ChartBarLayoutArgs): ChartBarFrame[] => Array.from({ length: pointsCount }, (_, pointIndex) => {
  const columnWidthPx = Math.max(1, columnWidth - 1);
  let stackedHeightPx = 0;
  const visibleSeries = series
    .map((chartSeries, seriesIndex) => ({ chartSeries, seriesIndex }))
    .filter(({ chartSeries }) => Math.max(0, chartSeries.values[pointIndex] || 0) > 0);

  return visibleSeries.map(({ chartSeries, seriesIndex }, visibleSeriesIndex) => {
    const pointValue = Math.max(0, chartSeries.values[pointIndex] || 0);
    const frameHeight = maxValue > 0 ? (pointValue / maxValue) * height : 0;
    const frameHeightPx = snapSize(frameHeight);
    // A zero-value series has no visible bar, so it should not make the remaining bar half-width.
    const groupedSlotWidth = columnWidthPx / Math.max(1, visibleSeries.length);
    const frameX = mode === 'grouped'
      ? snapStart((pointIndex * columnWidth) + (visibleSeriesIndex * groupedSlotWidth))
      : snapStart(pointIndex * columnWidth);
    const frameWidth = mode === 'grouped'
      ? snapSize(Math.max(1, groupedSlotWidth - (visibleSeries.length > 1 ? 1 : 0)))
      : snapSize(columnWidthPx);
    const frameY = mode === 'stacked' && series.length > 1
      ? snapStart(height - stackedHeightPx - frameHeight)
      : snapStart(height - frameHeight);

    if (mode === 'stacked' && series.length > 1) stackedHeightPx += frameHeightPx;
    return {
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeightPx,
      fill: chartSeries.color || (seriesIndex % 2 === 0 ? '#ef4444' : '#3b82f6'),
    };
  });
}).flat();
