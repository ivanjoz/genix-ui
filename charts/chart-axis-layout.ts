export const normalizeYAxisStepSize = (stepSize?: number): number => (
  Number.isFinite(stepSize) && Number(stepSize) > 0 ? Number(stepSize) : 0
);

// A stepped axis needs headroom at the next exact interval so bars never exceed the top tick.
export const getSteppedYAxisMaximum = (maximum: number, stepSize?: number): number => {
  const safeMaximum = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
  const normalizedStepSize = normalizeYAxisStepSize(stepSize);
  if (!normalizedStepSize || safeMaximum === 0) return safeMaximum;
  return Math.ceil(safeMaximum / normalizedStepSize) * normalizedStepSize;
};

export const buildSteppedYAxisTickValues = (
  maximum: number,
  stepSize: number,
  maximumIntervals: number,
): number[] => {
  const normalizedStepSize = normalizeYAxisStepSize(stepSize);
  if (!normalizedStepSize || maximum <= 0) return [0];

  // Skip only whole multiples of the requested step when the chart is too short for every tick.
  const baseIntervals = Math.ceil(maximum / normalizedStepSize);
  const intervalMultiplier = Math.max(1, Math.ceil(baseIntervals / Math.max(1, maximumIntervals)));
  const visibleStepSize = normalizedStepSize * intervalMultiplier;
  const values: number[] = [];
  for (let value = maximum; value >= 0; value -= visibleStepSize) values.push(value);
  return values;
};

export interface ChartXAxisLabelPosition {
  left: number;
  align: 'left' | 'center' | 'right';
  transform: string;
}

// Date labels name one exact point, so intermediate labels share the hover crosshair's center.
export const getXAxisLabelPosition = (
  pointIndex: number,
  pointsCount: number,
  columnWidth: number,
): ChartXAxisLabelPosition => {
  if (pointIndex <= 0) return { left: 0, align: 'left', transform: 'none' };
  if (pointIndex >= pointsCount - 1) {
    return { left: pointsCount * columnWidth, align: 'right', transform: 'translateX(-100%)' };
  }
  return {
    left: (pointIndex * columnWidth) + (columnWidth / 2),
    align: 'center',
    transform: 'translateX(-50%)',
  };
};
