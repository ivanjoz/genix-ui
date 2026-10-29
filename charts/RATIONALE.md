## Chart: labelEvery from the chart's width when not given
**Context** — Asked to label every bar when there is room. `AgentAnswer` forced one label per `ceil(labels / 8)`, so 10 bars showed 5 labels even with room for all.
**Decision** — `labelEvery` is optional; without it, `Chart` thins the labels only when a slot is narrower than a label needs: 22px for a tilted one (its 14px line over sin 40°), the widest flat label plus 8px otherwise. Whether the axis tilts is now decided over all labels, not only the drawn ones. `AgentAnswer` no longer passes `labelEvery`.
**Rationale** — The tilt has to be known before the spacing (the spacing depends on it), so it can't depend on which labels end up drawn. The chart redraws when the width crosses a threshold, not on every resize.

## Chart: y axis sized from its rounded top tick, no left padding
**Context** — Asked to reclaim the empty strip left of the y axis. The axis was sized from the widest raw value ("5,092.50", 8 chars) plus one char of headroom, while the drawn ticks were "6,000"; chartist also adds 10px of left padding.
**Decision** — The axis width comes from the max (and min, when negative) rounded up to its leading digit (5,092.50 -> 6,000) and formatted with `formatValue`. `chartPadding.left` is 0.
**Rationale** — Chartist's top tick is at most that rounded value, so it is a close stand-in without a measure-and-redraw pass. A tick that chartist rounds further (a step that lands past it) could still be one character wider than estimated.

## Chart: tilted x labels past 4 characters
**Context** — Asked: when any drawn x label is longer than 4 characters, tilt the labels (cut past 10 characters to 9 + "..."). The angle and where the extra height comes from were left open; chartist has no label rotation.
**Decision** — Every x label tilts -40° (CSS on chartist's HTML labels), ending under its bar's center or its line point. The x axis grows to the widest tilted label and the chart's total height grows by the same amount, so the plot keeps its height.
**Rationale** — 40° keeps labels readable while needing less height than 45°+. A tilted chart is taller than its `height` prop says.

## Chart: y-axis width from the data, bar labels on one line
**Context** — The y axis was a fixed 50px, so "4,000.00" was clipped; bar labels (product names) wrapped inside a one-slot box and spilled onto their neighbors. Chartist only knows its ticks while drawing, after the axis width is already set.
**Decision** — The axis width is estimated from the widest `formatValue` of the drawn values (stack totals when stacked) plus one character of headroom, at ~8px per character. Bar x labels are one line with an ellipsis, centered on their bar and `labelEvery` slots wide (CSS over chartist's inline width). Labels and grid read the theme tokens (`--fg-muted`, `--line-strong`; the `--color-*` names don't exist at runtime under `@theme inline`).
**Rationale** — An estimate avoids a measure-then-redraw pass; it can be a few px off for unusual formatters. Long names get truncated on the axis, but the tooltip and the answer's table show them in full.
