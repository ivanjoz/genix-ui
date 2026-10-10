<script lang="ts" generics="T,E">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
    import { untrack } from 'svelte';
    import { Agent } from '../agent/registry';

  const {
		options, saveOn = $bindable(), save, keyId, keyName, css, type,
		useButtons = false, useButtonsSlim = false, onChange
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
    onChange?: (selected: (number|string)[]) => void
  } = $props();

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

<div data-id="CheckboxOptions:{componentID}" class="flex {css}" class:_buttonsSlim={useButtonsSlim}>
  {#each options as opt }
  {@const optId = opt[keyId] as (number|string)}
  {@const isSelected = optionsSelected.includes(optId)}
    {#if useButtons || useButtonsSlim}
      <button data-id="Option:{optId}"
        data-selected={isSelected ? "true" : undefined}
        class="_button ff-semibold {useButtonsSlim ? 'text-[14px]' : 'mr-10 text-[15px]'}"
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
    padding: 0 8px;
    box-shadow: rgba(0, 0, 0, 0.16) 0px 1px 3px;
    border: 1px solid transparent;
    line-height: 1;
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
