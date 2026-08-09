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

  let lastSaveOn: T | undefined

  $effect(() => {
    if(!saveOn || !save){ return }
    if(lastSaveOn === saveOn){ return }
    lastSaveOn = saveOn

    untrack(() => {
      if(type === 'multiple'){
        optionsSelected = (saveOn[save] || []) as (number|string)[]
      } else {
        optionsSelected = [(saveOn[save] || []) as (number|string)]
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
      <div data-id="Option:{optId}"
        data-selected={isSelected ? "true" : undefined}
        class="flex items-center mr-10">
        <button class="flex mr-4 pt-1 items-center p-0 lh-10 justify-center rounded-[4px] shrink-0 w-28 h-26 _1"
          class:_2={isSelected}
          aria-label={opt[keyName] as string}
          onclick={ev => {
            ev.stopPropagation()
            onSelect(opt)
          }}
        >
          {#if isSelected}
            <i class="icon-[fa--check]"></i>
          {/if}
        </button>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>{opt[keyName] as string}</label>
      </div>
    {/if}
  {/each}

</div>

<style>
  ._1 {
    background-color: var(--white);
    border: 1px solid rgb(143, 143, 143);
    color: white;
  }
  ._1._2 {
    background-color: #09cb70;
    border-color: #19965b;
  }
  ._1:hover {
    border: 2px solid #0987eb;
  }
  ._1._2:hover {
    border: 2px solid #61778b;
    background-color: #98aec5;
  }

  ._button {
    background-color: var(--white);
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
	  outline: 1px solid #bc91ffcf;
	  box-shadow: rgb(151 112 242 / 70%) 0px 2px 1px;
	  background-color: #f7f2ff;
	  color: #6f42b8;
	  border: 1px solid #ece1ff;
  }

  /* Slim mode is a compact blue segmented control for dense toolbars and headers. */
  ._buttonsSlim {
    gap: 2px;
    padding: 2px;
    border: 1px solid #dbe3ee;
    border-radius: 9px;
    background-color: #f1f5f9;
  }
  ._buttonSlim {
    min-height: 24px;
    padding: 0 8px;
    border-radius: 7px;
    border-color: transparent;
    background-color: transparent;
    box-shadow: none;
    color: #64748b;
    opacity: 1;
  }
  ._buttonSlim:hover {
    border-color: #bfdbfe;
    background-color: #eaf2ff;
    color: #2563eb;
  }
  ._buttonSlimSelected,
  ._buttonSlimSelected:hover {
    border-color: #93c5fd;
    outline: none;
    background-color: #dbeafe;
    box-shadow: rgb(59 130 246 / 24%) 0 1px 2px;
    color: #1d4ed8;
  }
  ._buttonSlim:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 1px;
  }
</style>
