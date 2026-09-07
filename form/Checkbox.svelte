<script lang="ts" generics="T,E">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
    import { untrack } from 'svelte';
    import { Agent } from "../agent/registry";
    import T from "../misc/T.svelte";

  const {
		 saveOn = $bindable(), save, css, label, useNumber, checked, onToggle, underlineOnHover, size
	}: {
    saveOn?: T
		save?: keyof T
    css?: string
    label?: string
    /* "tiny" is a 20px box for a checkbox packed into a dense row, where the default 28px one
       is taller than the text line it sits in. */
    size?: "normal" | "tiny"
    useNumber?: boolean /* save 0 | 1 instead of true | false */
    /* Underline the label on hover. Clicking the text always toggles — this is what advertises it,
       for a checkbox sitting in running text where the box alone does not read as the target. */
    underlineOnHover?: boolean
    /* Controlled mode: the caller owns the value and this only reports the intent. For a value
       that is not a property of an object — a Map entry, a derived set — saveOn cannot express it. */
    checked?: boolean
    onToggle?: (isChecked: boolean) => void
  } = $props();

  let isSelectedLocal = $state(false)

  const isControlled = $derived(checked !== undefined)
  const isSelected = $derived(isControlled ? !!checked : isSelectedLocal)

  const onSelect = () => {
    const nextIsSelected = !isSelected
    if(isControlled){
      onToggle?.(nextIsSelected)
      return
    }

    isSelectedLocal = nextIsSelected
    if(saveOn && save){
    	if(useNumber){
        saveOn[save] = (nextIsSelected ? 1 : 0) as NonNullable<T>[keyof T]
     	} else {
        saveOn[save] = nextIsSelected as NonNullable<T>[keyof T]
      }
    }
    onToggle?.(nextIsSelected)
  }

  let lastSaveOn: T | undefined

  $effect(() => {
    if(!saveOn || !save){ return }
    if(lastSaveOn === saveOn){ return }
    lastSaveOn = saveOn

    untrack(() => {
      isSelectedLocal = !!saveOn[save]
    })
  })

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "Checkbox",
      label: label || "",
      click: () => { onSelect() },
    })
  })
</script>

<!-- One control, not a box with a caption beside it: the label is the larger target and clicking
     text that describes a checkbox is expected to tick it. -->
<button data-id="Checkbox:{componentID}"
  data-value={isSelected ? "1" : "0"}
  data-selected={isSelected ? "true" : undefined}
  type="button"
  role="checkbox"
  aria-checked={isSelected}
  aria-label={ui.translate(label as string)}
  class="_row flex items-center text-left {css}"
  onclick={ev => {
    ev.stopPropagation()
    onSelect()
  }}
>
  <!-- The check glyph is sized in `em`, so the box's own font-size is what scales it with the box. -->
  <span class="flex mr-4 pt-1 items-center p-0 lh-10 justify-center rounded-[4px] shrink-0 _1
    {size === 'tiny' ? 'w-20 h-20 mb-1 text-[11px]' : 'w-28 h-26'}"
    class:_2={isSelected}
  >
    {#if isSelected}
      <i class="icon-[fa--check]"></i>
    {/if}
  </span>
  <span class:_3={underlineOnHover}><T text={label as string} /></span>
</button>

<style>
  ._row {
    background-color: transparent;
    border: none;
    padding: 0;
  }

  ._1 {
    background-color: var(--white);
    border: 1px solid rgb(143, 143, 143);
    color: white;
  }
  ._1._2 {
    background-color: #09cb70;
    border-color: #19965b;
  }
  ._row:hover ._1 {
    border: 2px solid #0987eb;
  }
  ._row:hover ._1._2 {
    border: 2px solid #61778b;
    background-color: #98aec5;
  }
  ._row:hover ._3 {
    text-decoration: underline;
  }
  ._row:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }
</style>
