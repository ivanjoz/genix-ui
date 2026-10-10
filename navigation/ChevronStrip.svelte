<script lang="ts" generics="TOption">
  // Horizontal strip of arrow-shaped options, each one's point fitting into the next one's notch.
  // Every option takes `optionWidth` of the strip (28% by default), so the 4th option is cut near its
  // middle: the half-visible box tells the user the strip scrolls sideways to reveal the rest.
  // The options take the strip's height minus its 4px scrollbar gutter: size it through `css` (h-48
  // by default, 44px options).
  import T from '../misc/T.svelte';
  import { Agent } from '../agent/registry';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';

  const ui = useUI()

  let { options, selected, keyId, keyName, onSelect, optionWidth = '28%', autocenter = false, css }: {
    options: TOption[]
    selected: any
    keyId: keyof TOption
    keyName: keyof TOption
    onSelect: (option: TOption) => void
    /** Width each option advances along the strip (its overlap with the next one excluded). */
    optionWidth?: string
    /** Scrolls the selected option to the 2nd place: one option visible behind it, the next ones ahead. */
    autocenter?: boolean
    css?: string
  } = $props()

  const componentID = ui.nextComponentId()
  let stripElement: HTMLDivElement

  const selectOption = (option: TOption) => {
    onSelect(option)
    const optionElement = stripElement.children[options.indexOf(option)] as HTMLElement
    if (!autocenter) {
      // A selected option cut at the strip's edge is scrolled fully into view.
      optionElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      return
    }
    // The previous option is brought to the strip's left edge, past its 10px notch so the strip doesn't
    // start with a cut (the first option scrolls to 0).
    const previousElement = optionElement.previousElementSibling
    const scrollLeft = previousElement
      ? stripElement.scrollLeft + previousElement.getBoundingClientRect().left - stripElement.getBoundingClientRect().left + 10
      : 0
    stripElement.scrollTo({ left: scrollLeft, behavior: 'smooth' })
  }

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "ChevronStrip",
      label: "",
      select: (...ids) => {
        if (ids.length === 0) { return }
        const targetId = String(ids[0])
        const matched = options.find((option) => String(option[keyId]) === targetId)
        if (matched) { selectOption(matched) }
      },
    })
  })
</script>

<div data-id="ChevronStrip:{componentID}" bind:this={stripElement}
  class={ifcss(css, "flex w-full h-48 overflow-x-auto overflow-y-hidden pb-4 chevron-strip")}>
  {#each options as option (option[keyId])}
    {@const isSelected = option[keyId] === selected}
    <!-- Each option overlaps the previous one by the point's depth minus the 3px white seam, so the
     slot it advances is exactly optionWidth. -->
    <button type="button" data-id="Option:{option[keyId]}" data-selected={isSelected ? "true" : undefined}
      aria-current={isSelected ? "step" : undefined}
      class="chevron-option shrink-0 flex items-center justify-center px-14 text-center leading-[1.1] ff-bold text-[14px]"
      class:chevron-option-selected={isSelected}
      style:flex-basis="calc({optionWidth} + 7px)"
      onclick={() => selectOption(option)}>
      <span class="line-clamp-2"><T text={String(option[keyName])} /></span>
    </button>
  {/each}
</div>

<style>
  .chevron-strip {
    scrollbar-width: thin;
  }
  /* An arrow: a 10px point on the right, and a matching notch on the left that receives the
     previous option's point. The first option has no notch, the last one no point. */
  .chevron-option {
    --chevron-bg: var(--surface-strong);
    background-color: var(--chevron-bg);
    color: var(--label);
    user-select: none;
    cursor: pointer;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%);
  }
  .chevron-option:not(:first-child) {
    margin-left: -7px;
  }
  .chevron-option:first-child {
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%);
  }
  .chevron-option:last-child:not(:first-child) {
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%);
  }
  .chevron-option:hover {
    --chevron-bg: var(--accent-bg-strong);
    color: var(--accent-fg);
  }
  .chevron-option.chevron-option-selected {
    --chevron-bg: var(--accent-solid);
    color: var(--on-solid);
  }
</style>
