<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  export interface IICardArrowStepsOption {
    id: number;
    name: string;
    icon?: string;
  }

import { cn } from '../utilities/ui.js';
import { Agent } from '../agent/registry';

  let {
    options,
    onSelect = () => {},
    selected,
    optionRender,
    columnsTemplate,
    pointedStart = false,
    pointedEnd = false,
  }: {
    options: IICardArrowStepsOption[];
    onSelect?: (e: IICardArrowStepsOption) => void;
    selected?: number;
    optionRender?: (e: IICardArrowStepsOption) => any;
    columnsTemplate?: string;
    /** The first step keeps its tail notch instead of a flat, rounded start. */
    pointedStart?: boolean;
    /** The last step keeps its tip instead of a flat, rounded end. */
    pointedEnd?: boolean;
  } = $props();

  function handleSelect(option: IICardArrowStepsOption) {
    onSelect(option);
  }

  // Use a derived state or a getter for reactive values
  const gridTemplateColumns = $derived(
    columnsTemplate || options.map(() => "1fr").join(" "),
  );

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "ArrowSteps",
      label: "",
      select: (...ids) => {
        if (ids.length === 0) { return }
        const targetId = String(ids[0])
        const matched = options.find((opt) => String(opt.id) === targetId)
        if (matched) { handleSelect(matched) }
      },
    })
  })
</script>

<div data-id="ArrowSteps:{componentID}" class="grid mr-8" style:grid-template-columns={gridTemplateColumns}
  class:arrow_steps_flat_start={!pointedStart} class:arrow_steps_flat_end={!pointedEnd}
>
  {#each options as option (option.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div data-id="Option:{option.id}"
      data-selected={option.id === selected ? "true" : undefined}
      onclick={() => handleSelect(option)}
      class={cn(
        "flex relative items-center",
        "card_arrow_ctn",
        option.id === selected && "card_arrow_ctn_selected",
      )}
    >
      <!-- The whole chevron (tail notch + body + tip) is ONE clipped box, so there are no
           seams between pieces at fractional zoom levels. -->
      <div class="card_arrow_shape"></div>
      <div class="h-full flex items-center justify-center card_arrow_name">
        {#if optionRender}
          {@render optionRender(option)}
        {:else}
          <div class="ff-semibold">{ui.translate(option.name)}</div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  /* --arrow-depth: horizontal length of the tip and the tail notch (same slope on both,
     so neighbouring edges are parallel). --arrow-gap: width of the light chevron between steps.
     By default the first step has no tail notch and the last step has no tip: both ends are flat and
     rounded. pointedStart / pointedEnd drop the flat_start / flat_end class so that end keeps its chevron. */
  .card_arrow_ctn {
    --arrow-depth: 0.8rem;
    --arrow-gap: 3px;
    height: 2.8rem;
    /* Overflow into the next track so this tip sits inside the next step's notch,
       leaving exactly --arrow-gap between them. */
    width: calc(100% + var(--arrow-depth) - var(--arrow-gap));
    cursor: pointer;
    color: inherit;
  }
  .card_arrow_ctn:last-child {
    width: 100%;
  }
  .card_arrow_shape {
    position: absolute;
    inset: 0;
    background-color: var(--surface-strong);
  }
  /* --clip-depth lets the inner hover layer use a shallower tip than the outer shape. */
  .card_arrow_shape, .card_arrow_shape::before {
    clip-path: polygon(
      0 0,
      calc(100% - var(--clip-depth, var(--arrow-depth))) 0,
      100% 50%,
      calc(100% - var(--clip-depth, var(--arrow-depth))) 100%,
      0 100%,
      var(--clip-depth, var(--arrow-depth)) 50%
    );
  }
  /* The first step has a flat tail. */
  .arrow_steps_flat_start .card_arrow_ctn:first-child .card_arrow_shape,
  .arrow_steps_flat_start .card_arrow_ctn:first-child .card_arrow_shape::before {
    clip-path: polygon(
      0 0,
      calc(100% - var(--clip-depth, var(--arrow-depth))) 0,
      100% 50%,
      calc(100% - var(--clip-depth, var(--arrow-depth))) 100%,
      0 100%
    );
  }
  /* The last step has a flat head: the row ends in a straight edge, mirroring the first step. */
  .arrow_steps_flat_end .card_arrow_ctn:last-child .card_arrow_shape,
  .arrow_steps_flat_end .card_arrow_ctn:last-child .card_arrow_shape::before {
    clip-path: polygon(
      0 0,
      100% 0,
      100% 100%,
      0 100%,
      var(--clip-depth, var(--arrow-depth)) 50%
    );
  }
  /* Rounded outer ends of the row. The background follows border-radius and the clip-path cuts the
     chevron on top, so only the flat ends show the rounding. The inner hover layer uses the radius
     minus the 2px outline so the outline keeps its width around the corners. */
  .arrow_steps_flat_start .card_arrow_ctn:first-child .card_arrow_shape { border-radius: 8px 0 0 8px; }
  .arrow_steps_flat_start .card_arrow_ctn:first-child .card_arrow_shape::before { border-radius: 6px 0 0 6px; }
  .arrow_steps_flat_end .card_arrow_ctn:last-child .card_arrow_shape { border-radius: 0 8px 8px 0; }
  .arrow_steps_flat_end .card_arrow_ctn:last-child .card_arrow_shape::before { border-radius: 0 6px 6px 0; }
  /* Hover outline: clip-path cannot draw borders, so on hover the shape fills with the outline
     color and this inner copy, inset by the outline width, paints the body on top. Its tip depth
     shrinks with its height (2.8rem - 4px ≈ 91%) so the diagonal edges stay parallel; the 2.3px
     side inset is what a 2px perpendicular gap measures horizontally on those diagonals. */
  .card_arrow_shape::before {
    content: "";
    position: absolute;
    inset: 2px 2.3px;
    --clip-depth: calc(var(--arrow-depth) * 0.91);
    background-color: var(--green-bg-strong);
    visibility: hidden;
  }
  .card_arrow_name {
    position: relative;
    min-width: 5rem;
    text-align: center;
    padding: 0 var(--arrow-depth);
    flex-grow: 1;
    max-width: 100%;
    overflow: hidden;
  }
  /* The selected step is already solid green: only the other steps get the hover outline. */
  .card_arrow_ctn:not(.card_arrow_ctn_selected):hover .card_arrow_shape {
    /* Softened outline (~64%, #16a34aa3 on the default theme) so it does not out-contrast the body. */
    background-color: color-mix(in srgb, var(--green-solid) 64%, transparent);
  }
  .card_arrow_ctn:not(.card_arrow_ctn_selected):hover .card_arrow_shape::before {
    visibility: visible;
  }
  .card_arrow_ctn:hover .card_arrow_name {
    color: var(--green-fg);
  }
  .card_arrow_ctn.card_arrow_ctn_selected .card_arrow_shape {
    background-color: var(--green-solid);
  }
  .card_arrow_ctn.card_arrow_ctn_selected .card_arrow_name {
    color: var(--on-solid);
  }

  /* Use a literal breakpoint so Lightning CSS can minify this scoped block safely. */
  @media only screen and (max-width: 740px) {
    .card_arrow_name {
      padding: 0 calc(var(--arrow-depth) * 0.6);
      font-size: var(--fs2);
      word-break: break-all;
      min-width: unset;
    }
  }
</style>
