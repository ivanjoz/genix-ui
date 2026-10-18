<script lang="ts" module>
  // One slice of a PieChart: its name ("English|Spanish" or plain), value and color.
  export interface IPieSlice {
    name: string
    value: number
    color: string
  }
</script>

<script lang="ts">
  // A donut chart in plain SVG with its legend beside it: each entry names a slice with its value and
  // share of the total, so identity never relies on color alone. The total sits in the hole.
  import { useUI } from '../runtime/index.js';

  const ui = useUI()

  interface Props {
    slices: IPieSlice[]
    size?: number
    // The caption under the total in the hole ("Volunteers|Voluntarios").
    totalLabel?: string
    formatValue?: (value: number) => string
  }

  const { slices, size = 168, totalLabel = '', formatValue = (value) => String(value) }: Props = $props()

  // r = 100 / 2π: the circle's circumference is 100, so a slice's dash length is its percent.
  const RADIUS = 15.9155
  const STROKE_WIDTH = 6
  // The surface gap between neighbor slices, in percent of the circumference.
  const SLICE_GAP = 0.8

  const total = $derived(slices.reduce((sum, slice) => sum + slice.value, 0))
  const shareOf = (value: number) => total === 0 ? 0 : (value * 100) / total
  // Each slice starts where the previous one ends, from 12 o'clock clockwise.
  const arcs = $derived.by(() => {
    let startPercent = 0
    return slices.filter((slice) => slice.value > 0).map((slice) => {
      const percent = shareOf(slice.value)
      const arc = { slice, percent, startPercent }
      startPercent += percent
      return arc
    })
  })
  const gap = $derived(arcs.length > 1 ? SLICE_GAP : 0)
</script>

<div class="flex flex-wrap items-center gap-16">
  <div class="relative shrink-0" style:width={`${size}px`} style:height={`${size}px`}>
    <svg viewBox="0 0 42 42" class="h-full w-full" role="img" aria-label={ui.translate(totalLabel)}>
      <circle cx="21" cy="21" r={RADIUS} fill="none" stroke="var(--color-line-soft)" stroke-width={STROKE_WIDTH} />
      {#each arcs as arc (arc.slice.name)}
        <circle class="transition-opacity hover:opacity-70" cx="21" cy="21" r={RADIUS} fill="none" stroke={arc.slice.color}
          stroke-width={STROKE_WIDTH} stroke-dasharray={`${Math.max(0, arc.percent - gap)} ${100 - arc.percent + gap}`}
          stroke-dashoffset={25 - arc.startPercent}>
          <title>{ui.translate(arc.slice.name)}:{formatValue(arc.slice.value)} · {Math.round(arc.percent * 10) / 10} %</title>
        </circle>
      {/each}
    </svg>
    <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span class="ff-bold text-[22px] text-fg">{formatValue(total)}</span>
      {#if totalLabel}<span class="text-[14px] text-fg-muted">{ui.translate(totalLabel)}</span>{/if}
    </div>
  </div>

  <div class="flex min-w-[160px] flex-1 flex-col gap-6">
    {#each slices as slice (slice.name)}
      <div class="flex items-center gap-8 text-[14px]">
        <span class="inline-block h-10 w-10 shrink-0 rounded-[3px]" style:background={slice.color}></span>
        <span class="flex-1 text-fg-muted">{ui.translate(slice.name)}</span>
        <span class="text-fg">{formatValue(slice.value)}</span>
        <span class="ff-bold w-56 text-right text-fg">{Math.round(shareOf(slice.value) * 10) / 10} %</span>
      </div>
    {/each}
  </div>
</div>
