<script lang="ts">
  // A read-only progress timeline: step names above circles strung on a line, a marker under the
  // current step. The line is filled up to the current step, and the stretch toward the next step
  // carries moving dashes ("on its way"). Display only, so it registers no agent handle.
  interface Props {
    steps: { id: number, name: string }[]
    currentID: number
    color?: string
    // Hides the triangle under the current step (and the room it takes below the circles).
    hideMarker?: boolean
  }

  let { steps, currentID, color = '#4c55d5', hideMarker = false }: Props = $props()

  const currentIndex = $derived(Math.max(0, steps.findIndex((step) => step.id === currentID)))
  // Each step owns an equal column; the line runs from the first circle's center to the last one's.
  const lineInset = $derived(`calc(100% / ${steps.length * 2})`)
  const segmentPercent = $derived(steps.length > 1 ? 100 / (steps.length - 1) : 0)
  const isLastStep = $derived(currentIndex >= steps.length - 1)
</script>

<div class="steps-timeline relative grid" style:--timeline-color={color}
  style:grid-template-columns="repeat({steps.length}, minmax(0, 1fr))">
  <div class="steps-timeline-track absolute h-3 rounded-full bg-gray-200" style:left={lineInset} style:right={lineInset}>
    <div class="steps-timeline-fill absolute top-0 bottom-0 left-0 rounded-full" style:width="{currentIndex * segmentPercent}%"></div>
    {#if !isLastStep}
      <div class="steps-timeline-flow absolute top-0 bottom-0"
        style:left="{currentIndex * segmentPercent}%" style:width="{segmentPercent}%"></div>
    {/if}
  </div>

  {#each steps as step, stepIndex (step.id)}
    {@const isDone = stepIndex < currentIndex}
    {@const isCurrent = stepIndex === currentIndex}
    <div class="relative flex flex-col items-center px-4">
      <!-- Two lines of room for the name, bottom-aligned, so every circle sits on the line. -->
      <div class={["h-40 flex items-end justify-center text-center text-[14px] leading-[1.2] pb-8",
        isCurrent ? "ff-bold steps-timeline-text" : isDone ? "ff-semibold text-gray-700" : "text-gray-400"].join(" ")}>
        {step.name}
      </div>
      <div class={["steps-timeline-dot w-20 h-20 rounded-full flex items-center justify-center",
        isCurrent ? "steps-timeline-current" : isDone ? "steps-timeline-done" : "bg-white border-2 border-gray-300"].join(" ")}>
        {#if isDone}<i class="icon-[mdi--check] text-white text-[14px]"></i>{/if}
        {#if isCurrent}<span class="steps-timeline-core w-8 h-8 rounded-full bg-white"></span>{/if}
      </div>
      {#if !hideMarker}
        <div class="h-14 flex items-end">
          {#if isCurrent}<span class="steps-timeline-marker"></span>{/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* The track's vertical center matches the circles': 40px name area + 10px (half a 20px circle). */
  .steps-timeline-track {
    top: 50px;
    transform: translateY(-50%);
  }
  .steps-timeline-fill {
    background-color: var(--timeline-color);
    transition: width 0.4s ease;
  }
  /* Dashes that march toward the next step. */
  .steps-timeline-flow {
    background-image: repeating-linear-gradient(90deg, var(--timeline-color) 0 8px, transparent 8px 14px);
    background-size: 14px 100%;
    opacity: 0.55;
    animation: steps-timeline-march 0.7s linear infinite;
  }
  .steps-timeline-dot {
    position: relative;
    transition: background-color 0.3s ease;
  }
  .steps-timeline-done {
    background-color: var(--timeline-color);
  }
  /* The current circle sends out two staggered rings, like a radar ping, and its white core breathes. */
  .steps-timeline-current {
    background-color: var(--timeline-color);
    /* Own stacking context: the rings' z-index -1 keeps them under the white core, not under the page. */
    isolation: isolate;
  }
  .steps-timeline-current::before, .steps-timeline-current::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    background-color: var(--timeline-color);
    animation: steps-timeline-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
    pointer-events: none;
    z-index: -1;
  }
  .steps-timeline-current::after {
    animation-delay: 0.9s;
  }
  .steps-timeline-core {
    animation: steps-timeline-breathe 1.8s ease-in-out infinite;
  }
  .steps-timeline-text {
    color: var(--timeline-color);
  }
  .steps-timeline-marker {
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 8px solid var(--timeline-color);
  }
  @keyframes steps-timeline-march {
    from { background-position: 0 0; }
    to { background-position: 14px 0; }
  }
  @keyframes steps-timeline-ping {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  @keyframes steps-timeline-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(0.55); }
  }
  @media (prefers-reduced-motion: reduce) {
    .steps-timeline-flow, .steps-timeline-core,
    .steps-timeline-current::before, .steps-timeline-current::after { animation: none; }
    .steps-timeline-current::before, .steps-timeline-current::after { display: none; }
  }
</style>
