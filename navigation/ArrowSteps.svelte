<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  export interface IICardArrowStepsOption {
    id: number;
    name: string;
    icon?: string;
  }

import arrow2Svg from '../assets/flecha_fin.svg?raw';
import arrow1Svg from '../assets/flecha_inicio.svg?raw';
import { cn } from '../utilities/ui.js';
import { Agent } from '../agent/registry';

  let {
    options,
    onSelect = () => {},
    selected,
    optionRender,
    columnsTemplate,
  }: {
    options: IICardArrowStepsOption[];
    onSelect?: (e: IICardArrowStepsOption) => void;
    selected?: number;
    optionRender?: (e: IICardArrowStepsOption) => any;
    columnsTemplate?: string;
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

<div data-id="ArrowSteps:{componentID}" class="grid mr-8" style:grid-template-columns={gridTemplateColumns}>
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
      <!-- Inline SVGs filled with currentColor: the tips take the name block's token. -->
      <span class="h-full card_arrow_svg">{@html arrow1Svg}</span>
      <div class="h-full flex items-center justify-center card_arrow_name">
        {#if optionRender}
          {@render optionRender(option)}
        {:else}
          <div class="ff-semibold">{ui.translate(option.name)}</div>
        {/if}
      </div>
      <span class="h-full card_arrow_svg">{@html arrow2Svg}</span>
      <div class="card_arrow_line"></div>
    </div>
  {/each}
</div>

<style>
  .card_arrow_ctn {
    height: 2.8rem;
    margin-right: -4px;
    width: calc(100% + 4px);
    cursor: pointer;
  }
  .card_arrow_name {
    background-color: var(--surface-strong);
    min-width: 5rem;
    text-align: center;
    overflow: visible;
    z-index: 5;
    padding: 0 6px;
    flex-grow: 1;
    max-width: 100%;
    overflow: hidden;
  }
  .card_arrow_ctn > span:last-of-type {
    margin-right: -4px;
  }
  .card_arrow_line {
    height: 4px;
    width: calc(100% - 9px);
    position: absolute;
    bottom: -4px;
    left: 0;
    background-color: var(--green-solid);
    visibility: hidden;
  }
  .card_arrow_svg {
    color: var(--surface-strong);
  }
  .card_arrow_svg :global(svg) {
    display: block;
    height: 100%;
    width: auto;
  }

  .card_arrow_ctn:hover .card_arrow_line {
   visibility: visible;
  }
  .card_arrow_ctn:hover .card_arrow_svg {
    color: var(--green-bg-strong);
  }
  .card_arrow_ctn:hover .card_arrow_name {
    background-color: var(--green-bg-strong);
    color: var(--green-fg);
  }
  .card_arrow_ctn_selected .card_arrow_line {
    background-color: var(--green-solid);
  }
  .card_arrow_ctn.card_arrow_ctn_selected .card_arrow_svg {
    color: var(--green-solid);
  }
  .card_arrow_ctn.card_arrow_ctn_selected .card_arrow_name {
    background-color: var(--green-solid);
    color: var(--on-solid);
  }

  /* Use a literal breakpoint so Lightning CSS can minify this scoped block safely. */
  @media only screen and (max-width: 740px) {
    .card_arrow_name {
      padding: 0;
      font-size: var(--fs2);
      word-break: break-all;
      min-width: unset;
    }
  }
</style>
