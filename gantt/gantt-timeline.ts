// Pure logic of the GanttTimeline component: items drawn as a line through dated points (instead
// of the Gantt's bars), packed in lanes per group so items that do not overlap share a lane.
// Days are Unix days, both ends included.

export interface GanttTimelinePoint {
  day: number;
  // 0..1 inside the day, to spread several points of the same day.
  offset: number;
  // Colour of the point's dot and of the line from it to the next point.
  color: string;
  // Icon classes drawn instead of the dot (e.g. a star for a closing point).
  icon?: string;
  // The line from this point to the next is dashed: a pause before the item resumes.
  dashed?: boolean;
}

export interface GanttTimelineItem {
  id: string | number;
  label: string;
  // Classes of the label above the line (e.g. to highlight a won item).
  labelCss?: string;
  startDay: number;
  // Last day drawn.
  endDay: number;
  points: GanttTimelinePoint[];
  // An item still running: the line goes on past its last point to the middle of endDay (or to
  // the window's edge) and ends in this icon. Without it, the line stops at the last point.
  endIcon?: string;
}

export interface GanttTimelineGroup<I extends GanttTimelineItem = GanttTimelineItem> {
  id: string | number;
  label: string;
  items: I[];
}

/**
 * Lanes of a group: each item goes in the first lane whose last item ended before it starts
 * (first fit, by start day), so a group takes as few rows as its overlapping items need.
 * Extents are clipped to the visible window, which is what decides whether two items collide.
 */
export const packTimelineLanes = <I extends GanttTimelineItem>(items: I[], fromDay: number, toDay: number): I[][] => {
  const sorted = [...items].sort((left, right) => left.startDay - right.startDay || left.endDay - right.endDay);
  const lanes: I[][] = [];
  const laneEnds: number[] = [];
  for (const item of sorted) {
    const start = Math.max(item.startDay, fromDay);
    const end = Math.min(item.endDay, toDay);
    const laneIndex = laneEnds.findIndex((laneEnd) => laneEnd < start);
    if (laneIndex < 0) {
      lanes.push([item]);
      laneEnds.push(end);
    } else {
      lanes[laneIndex].push(item);
      laneEnds[laneIndex] = end;
    }
  }
  return lanes;
};

/**
 * Colour of an item's line on a day: that of the last point reached. '' before the first point,
 * and past the last one unless the item is still running (endIcon).
 */
export const lineColorOnDay = (item: GanttTimelineItem, unixDay: number): string => {
  const current = item.points.findLast((point) => point.day <= unixDay);
  if (!current) { return ''; }
  if (current === item.points.at(-1) && !item.endIcon) { return ''; }
  return current.color;
};

// ---------------------------------------------------------------------------------------------
// Pixel snapping. At a zoom like 110% one CSS px is 1.1 screen px, so a 2px tick or a 3px line
// falls between screen pixels and the browser rounds each one differently: some ticks look 2px,
// some 3px, some faded. Sizes and positions are therefore computed in whole screen pixels.
// ---------------------------------------------------------------------------------------------

/** A CSS position moved to the nearest screen-pixel boundary. */
export const snapToScreenPixel = (cssPx: number, devicePixelRatio: number): number =>
  Math.round(cssPx * devicePixelRatio) / devicePixelRatio;

/** A CSS size turned into a whole number of screen pixels (at least one), back in CSS px. */
export const screenPixelSize = (cssPx: number, devicePixelRatio: number): number =>
  Math.max(1, Math.round(cssPx * devicePixelRatio)) / devicePixelRatio;
