<script lang="ts" generics="T,E">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
    import { untrack } from 'svelte';
    import { Agent } from '../agent/registry';

  const {
		options, saveOn = $bindable(), save, keyId, keyName, css, type,
		useButtons = false, useButtonsSlim = false, autospace = false, onChange
	}: {
    saveOn?: T
		save?: keyof T
    options?: E[]
    keyId: keyof E
    keyName: keyof E
    css?: string
    type?: "single" | "multiple"
    useButtons?: boolean
    useButtonsSlim?: boolean
    /** Lays the options out in equal columns sized by their names (autospaceColumns). */
    autospace?: boolean
    onChange?: (selected: (number|string)[]) => void
  } = $props();

  // autospaceColumns: the columns for the names' 75th-percentile length (the longest of the third
  // quarter, so a few long names don't decide for all): up to 4 characters 5 columns, up to 16 4,
  // up to 24 3, else 2. Fewer options than columns: 0, they just wrap.
  const autospaceColumns = (optionNames: string[]): number => {
    const sortedLengths = optionNames.map((optionName) => optionName.length).sort((left, right) => left - right)
    const percentile75Length = sortedLengths[Math.ceil(sortedLengths.length * 0.75) - 1] || 0
    const columns = percentile75Length <= 4 ? 5 : percentile75Length <= 16 ? 4 : percentile75Length <= 24 ? 3 : 2
    return optionNames.length < columns ? 0 : columns
  }
  const gridColumns = $derived(autospace && !useButtonsSlim ? autospaceColumns((options || []).map((option) => String(option[keyName] ?? ''))) : 0)

  let optionsSelected: (number|string)[] = $state([])

  const onSelect = (e: E) => {
    const id = e[keyId] as number|string
    if(type == 'multiple'){
      if(optionsSelected.includes(id)){
        optionsSelected = optionsSelected.filter(x => x !== id)
      } else {
        optionsSelected.push(id)
      }
    } else {
      if(optionsSelected.includes(id)){
        optionsSelected = []
      } else {
        optionsSelected = [id]
      }
    }

    if(saveOn && save){
      if(type === 'multiple'){
        saveOn[save] = optionsSelected as NonNullable<T>[keyof T]
      } else {
        saveOn[save] = (optionsSelected[0] || undefined) as NonNullable<T>[keyof T]
      }
    }

    onChange?.(optionsSelected)
  }

  // Follows saveOn[save] itself, not only a swapped saveOn: a value written from outside (a
  // SelectedTags ✕) deselects the option.
  $effect(() => {
    if(!saveOn || !save){ return }
    const storedValue = saveOn[save]
    untrack(() => {
      if(type === 'multiple'){
        optionsSelected = (storedValue || []) as (number|string)[]
      } else {
        optionsSelected = storedValue ? [storedValue as (number|string)] : []
      }
    })
  })

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "CheckboxOptions",
      label: "",
      select: (...ids) => {
        const targetSet = new Set(ids.map(String))
        for (const opt of options || []) {
          const optId = opt[keyId] as number | string
          if (!targetSet.has(String(optId))) { continue }
          if (!optionsSelected.includes(optId)) { onSelect(opt) }
          else if (type !== 'multiple') { /* already selected single, skip */ }
        }
      },
      remove: (id) => {
        const target = String(id)
        const matched = (options || []).find((opt) => String(opt[keyId]) === target)
        if (matched && optionsSelected.includes(matched[keyId] as number | string)) {
          onSelect(matched)
        }
      },
    })
  })
</script>

<!-- Options wrap onto new lines on a narrow screen; the slim segmented control stays on one line.
     With autospace, an equal-column grid: each option fills its cell. -->
<div data-id="CheckboxOptions:{componentID}"
  class="{gridColumns ? 'grid gap-8' : 'flex'} {useButtonsSlim || gridColumns ? '' : 'flex-wrap gap-y-8'} {css}"
  class:_autospace={gridColumns > 0}
  style:grid-template-columns={gridColumns ? `repeat(${gridColumns}, minmax(0, 1fr))` : undefined}
  class:_buttonsSlim={useButtonsSlim}>
  {#each options as opt }
  {@const optId = opt[keyId] as (number|string)}
  {@const isSelected = optionsSelected.includes(optId)}
    {#if useButtons || useButtonsSlim}
      <button data-id="Option:{optId}"
        data-selected={isSelected ? "true" : undefined}
        class="_button ff-semibold {useButtonsSlim ? 'text-[14px]' : 'mr-10 text-[15px] shrink-0 max-w-full'}"
        class:_buttonSelected={isSelected && !useButtonsSlim}
        class:_buttonSlim={useButtonsSlim}
        class:_buttonSlimSelected={isSelected && useButtonsSlim}
        aria-label={opt[keyName] as string}
        onclick={ev => {
          ev.stopPropagation()
          onSelect(opt)
        }}
      >
        {opt[keyName] as string}
      </button>
    {:else}
      <!-- Box and label are one control: clicking text that describes a checkbox ticks it. -->
      <button data-id="Option:{optId}"
        data-selected={isSelected ? "true" : undefined}
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={opt[keyName] as string}
        class="_row flex items-center text-left mr-10"
        onclick={ev => {
          ev.stopPropagation()
          onSelect(opt)
        }}
      >
        <span class="flex mr-4 pt-1 items-center p-0 leading-none justify-center rounded-[4px] shrink-0 w-28 h-26 _1"
          class:_2={isSelected}
        >
          {#if isSelected}
            <i class="icon-[fa--check]"></i>
          {/if}
        </span>
        <span>{opt[keyName] as string}</span>
      </button>
    {/if}
  {/each}

</div>

<style>
  ._1 {
    background-color: var(--surface);
    border: 1px solid var(--fg-subtle);
    color: var(--on-solid);
  }
  ._1._2 {
    background-color: var(--green-solid);
    border-color: var(--green-solid);
  }
  ._row {
    background-color: transparent;
    border: none;
    padding: 0;
  }
  ._row:hover ._1 {
    border: 2px solid var(--blue-solid);
  }
  ._row:hover ._1._2 {
    border: 2px solid var(--fg-muted);
    background-color: var(--fg-subtle);
  }
  ._row:focus-visible {
    outline: 2px solid var(--blue-solid);
    outline-offset: 2px;
  }

  ._button {
    background-color: var(--surface-raised);
    opacity: 0.8;
    border-radius: 8px;
    min-height: 30px;
    /* An option longer than the whole row breaks into lines inside its button: keep air above and below. */
    padding: 4px 8px;
    /* A key-like bottom line, a short soft shadow and a barely visible outline: depth without a smudge on a phone. */
    box-shadow: 0 1.5px 0 rgba(0, 0, 0, 0.11), 0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.035);
    border: 1px solid transparent;
    line-height: 1;
  }

  /* Hover on an option not picked yet: full opacity and a faint purple outline, the selected
     state's color, so the pointer shows what a click will mark. Only with a real pointer: on a
     phone a tap would leave the hover stuck on the option. */
  @media (hover: hover) {
    ._button:not(._buttonSelected):not(._buttonSlim):hover {
      opacity: 1;
      outline: 1px solid color-mix(in srgb, var(--purple-border) 60%, transparent);
      border-color: color-mix(in srgb, var(--purple-bg-strong) 60%, transparent);
    }
  }

  /* The grid's gap spaces the options: no trailing margin, and each fills its column. */
  ._autospace > :global(button) {
    margin-right: 0;
    width: 100%;
  }

  ._buttonSelected {
		opacity: 1;
	  outline: 1px solid color-mix(in srgb, var(--purple-border) 81%, transparent);
	  box-shadow: color-mix(in srgb, var(--purple-solid) 70%, transparent) 0px 2px 1px;
	  background-color: var(--purple-bg);
	  color: var(--purple-fg);
	  border: 1px solid var(--purple-bg-strong);
  }

  /* Slim mode is a compact blue segmented control for dense toolbars and headers. */
  ._buttonsSlim {
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background-color: var(--surface-muted);
  }
  ._buttonSlim {
    min-height: 24px;
    padding: 0 8px;
    border-radius: 7px;
    border-color: transparent;
    background-color: transparent;
    box-shadow: none;
    color: var(--fg-muted);
    opacity: 1;
  }
  ._buttonSlim:hover {
    border-color: var(--blue-border);
    background-color: var(--blue-bg);
    color: var(--blue-solid);
  }
  ._buttonSlimSelected,
  ._buttonSlimSelected:hover {
    border-color: var(--blue-border);
    outline: none;
    background-color: var(--blue-bg-strong);
    box-shadow: color-mix(in srgb, var(--blue-solid) 24%, transparent) 0 1px 2px;
    color: var(--blue-fg);
  }
  ._buttonSlim:focus-visible {
    outline: 2px solid var(--blue-solid);
    outline-offset: 1px;
  }
</style>
