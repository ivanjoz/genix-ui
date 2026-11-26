<script lang="ts" generics="TOption">
  // Strip of card-shaped options glued side by side, their borders collapsed into one.
  // The selected card and the hovered one grow 4px on every side, over their neighbours: only the
  // card's painted face grows (an absolute layer), its slot in the row keeps its size, so nothing
  // around it moves. Only one card is grown at a time: hovering another card shrinks the selected
  // one back while the pointer stays there. The strip's 4px padding leaves room for that growth inside its scroll box.
  import T from '../misc/T.svelte';
  import { Agent } from '../agent/registry';
  import { pushAppLog } from '../logs/app-logs.js';
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';

  const ui = useUI()

  let { options, selected, keyId, keyName, onSelect, css, cardCss, cardMaxWidth, isGrayBackground = false }: {
    options: TOption[]
    selected: any
    keyId: keyof TOption
    keyName: keyof TOption
    onSelect: (option: TOption) => void
    /** Classes for the strip. */
    css?: string
    /** Classes added to every card's slot: its size (h-48 px-12 by default). */
    cardCss?: string
    /** Max width of a card, in px. A longer label wraps to 2 lines, then ends in an ellipsis. */
    cardMaxWidth?: number
    /** The strip sits on a gray background: the cards turn white for contrast, and tint on hover. */
    isGrayBackground?: boolean
  } = $props()

  // An unselected card's face: its fill, and how hovering it lightens it.
  const unselectedFaceCss = $derived(isGrayBackground
    ? 'bg-surface-raised group-hover:bg-(--cards-strip-hover-bg) group-hover:border-(--cards-strip-hover-border)'
    : 'bg-(--cards-strip-card-bg) group-hover:bg-surface-raised')

  const selectOption = (option: TOption) => {
    pushAppLog('tab', 'Tab', ui.translate(String(option[keyName] ?? '')))
    onSelect(option)
  }

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "CardsStrip",
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

<div data-id="CardsStrip:{componentID}" role="group"
  class={ifcss(css, "cards-strip flex max-w-full overflow-x-auto overflow-y-hidden p-4")}>
  {#each options as option (option[keyId])}
    {@const isSelected = option[keyId] === selected}
    <!-- -ml-2 overlaps each card's left border onto the previous card's right one. -->
    <button type="button" data-id="Option:{option[keyId]}" data-selected={isSelected ? "true" : undefined}
      aria-pressed={isSelected}
      class={ifcss(cardCss, "h-48 px-12 group relative shrink-0 not-first:-ml-2 cursor-pointer select-none hover:z-20")}
      class:z-10={isSelected} style:max-width={cardMaxWidth ? `${cardMaxWidth}px` : undefined}
      onclick={() => selectOption(option)}>
      <!-- The card's face. inset-0 and -inset-4 never meet on one element: Tailwind would pick by name. -->
      <span class="absolute rounded-[6px] border-2 transition-[inset,background-color,border-color] duration-150
        group-hover:-inset-4 {isSelected ? 'selected-card-face -inset-4 border-accent-solid bg-accent-bg-strong'
        : `inset-0 border-line-strong ${unselectedFaceCss}`}"></span>
      <!-- line-clamp-2 makes it a box (translate does not move an inline one): it wraps only once the
       card reaches cardMaxWidth, up to 2 lines and an ellipsis. -->
      <span class="card-label relative line-clamp-2 text-center leading-[1.15] ff-bold text-[15px] transition-[translate] duration-150 {isSelected ? 'text-accent-fg' : 'text-label'}">
        <T text={String(option[keyName])} />
      </span>
    </button>
  {/each}
</div>

<style>
  /* Hovering an unselected card hands it the growth: the selected card shrinks back meanwhile.
     This selector outranks the -inset-4 utility by specificity, whatever the stylesheet order. */
  .cards-strip:has(> button:not([data-selected]):hover) .selected-card-face {
    inset: 0;
  }

  /* The grown selected card covers 4px of each neighbour's face: their labels step 2px away from
     it to stay centred on what is left visible. */
  .cards-strip > button[data-selected] + button .card-label {
    translate: 2px;
  }
  .cards-strip > button:has(+ button[data-selected]) .card-label {
    translate: -2px;
  }
  /* While the selected card is shrunk back by a hover, its neighbours' labels return to the centre.
     Its specificity beats the two rules above. */
  .cards-strip:has(> button:not([data-selected]):hover) .card-label {
    translate: 0;
  }
  /* The hovered card grows the same way: its neighbours' labels step away from it. One more element
     selector than the reset above, so these win over it. */
  .cards-strip > button:not([data-selected]):hover + button .card-label {
    translate: 2px;
  }
  .cards-strip > button:has(+ button:not([data-selected]):hover) .card-label {
    translate: -2px;
  }
</style>
