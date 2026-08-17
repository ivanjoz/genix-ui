// Pointer-to-point mapping for the chart hover readout. It lives outside the component because it
// is the only part of the readout that can be wrong in a way a screenshot does not reveal: an
// off-by-one here reports a neighbouring sample's value under the crosshair.

// The plot is a strip of `pointsCount` columns of `columnWidth` each, so the column under the
// pointer is a floor division. Returns null when there is nothing to point at, and clamps instead
// of returning null at the edges: a pointer a fraction of a pixel past the last column is still
// asking about the last column, not about nothing.
export const resolveHoverPointIndex = (
  localX: number,
  columnWidth: number,
  pointsCount: number,
): number | null => {
  if (pointsCount <= 0 || columnWidth <= 0) { return null; }
  const rawIndex = Math.floor(localX / columnWidth);
  return Math.min(pointsCount - 1, Math.max(0, rawIndex));
};

// The center of a column, which is where the line vertices are placed, so the crosshair lands on
// the vertex rather than beside it.
export const getHoverCrosshairX = (pointIndex: number, columnWidth: number): number => {
  return (pointIndex * columnWidth) + (columnWidth / 2);
};

// Fallback formatting for callers that do not pass a tooltipValueFormatter. Two decimals is enough
// for a percentage and not so many that an integer count grows a meaningless ".00" tail.
export const formatHoverValue = (value: number): string => {
  if (!Number.isFinite(value)) { return '--'; }
  return String(Number(value.toFixed(2)));
};
