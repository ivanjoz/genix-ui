<script lang="ts" generics="T, E">
  import { Agent } from '../agent/registry';
  import T from '../misc/T.svelte';
  import { useUI } from '../runtime/index.js';
  import FieldShell from './FieldShell.svelte';
  import MultiSelectLayer from './MultiSelectLayer.svelte';
  import { buildMultiSelectItems, findOptionsByIDs, toMultiSelectAgentOptions, type MultiSelectOptionID } from './multi-select';
  const ui = useUI()

  // A labelled field holding several options, saved as an array of ids. The selected ones show
  // as chips inside the field; clicking it opens the same searchable layer as the VTable's
  // CellMultiSelect, where a click selects or deselects one option and closes the layer.
  interface SelectMultipleProps<T, E> {
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    saveOn?: T;
    /** Field of saveOn holding the selected ids as an array. */
    save?: keyof T;
    onChange?: (selectedIDs: MultiSelectOptionID[]) => void;
    label?: string;
    labelStyle?: "normal" | "bold";
    /** Where the label sits: top (in the border, default), side (beside the field) or inline (inside it, before the chips). */
    labelPosition?: "top" | "side" | "inline";
    placeholder?: string;
    /** The chips wrap onto new lines and the field grows taller. Without it the field keeps one
     *  line and the chips that don't fit are cut off. */
    useWrap?: boolean;
    css?: string;
    disabled?: boolean;
  }

  const {
    options = [],
    keyId,
    keyName,
    saveOn,
    save,
    onChange,
    label,
    labelStyle,
    labelPosition,
    placeholder = "— select —|— seleccione —",
    useWrap = false,
    css = "",
    disabled = false,
  }: SelectMultipleProps<T, E> = $props();

  let isOpen = $state(false);
  let filterValue = $state('');
  let fieldElement: HTMLDivElement | null = $state(null);

  // Writable derived: follows saveOn, and is overwritten locally on every pick/removal so the
  // chips repaint even when saveOn is not a reactive proxy.
  let selectedIDs = $derived((((saveOn && save ? saveOn[save] : undefined) || []) as MultiSelectOptionID[]).slice());

  const optionsByID = $derived(new Map(options.map((option) => [option[keyId] as MultiSelectOptionID, option])));
  const selectedOptions = $derived(findOptionsByIDs(optionsByID, selectedIDs));

  const saveSelectedIDs = (nextSelectedIDs: MultiSelectOptionID[]) => {
    selectedIDs = nextSelectedIDs;
    if (saveOn && save) { saveOn[save] = nextSelectedIDs as NonNullable<T>[keyof T]; }
    onChange?.(nextSelectedIDs);
  };

  const openLayer = () => {
    filterValue = '';
    isOpen = true;
  };

  // A click adds an unselected option or removes a selected one, and closes the layer: one change per open.
  const toggleOption = (option: E) => {
    const optionID = option[keyId] as MultiSelectOptionID;
    saveSelectedIDs(selectedIDs.includes(optionID)
      ? selectedIDs.filter((selectedID) => selectedID !== optionID)
      : [...selectedIDs, optionID]);
    isOpen = false;
  };

  const componentID = ui.nextComponentId()

  // `select` adds options (the same as a pick), `remove` drops one by its option id.
  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "MultiSelect",
      label: label || placeholder,
      search: (text: string) => {
        openLayer();
        filterValue = String(text || '').trim().toLowerCase();
        return toMultiSelectAgentOptions(buildMultiSelectItems(options, selectedIDs, filterValue, keyId, keyName), keyId, keyName);
      },
      select: (...ids) => {
        const addedIDs = findOptionsByIDs(optionsByID, ids).map((option) => option[keyId] as MultiSelectOptionID);
        saveSelectedIDs([...new Set([...selectedIDs, ...addedIDs])]);
      },
      remove: (id) => {
        saveSelectedIDs(selectedIDs.filter((selectedID) => String(selectedID) !== String(id)));
      },
      getOptions: (maxOptions) => toMultiSelectAgentOptions(
        buildMultiSelectItems(options, selectedIDs, filterValue, keyId, keyName), keyId, keyName, maxOptions),
    });
  });
</script>

{#snippet arrow()}
  <i class="icon-[mdi--unfold-more-horizontal] _arrow" class:_open={isOpen}></i>
{/snippet}

<div bind:this={fieldElement} class={css} role="button" tabindex={disabled ? -1 : 0}
  aria-haspopup="listbox" aria-expanded={isOpen}
  onmousedown={(ev) => {
    if (disabled) { return; }
    // Open from mousedown so the filter input can take focus without an immediate blur cycle.
    ev.preventDefault();
    if (!isOpen) { openLayer(); }
  }}
  onkeydown={(ev) => {
    if (!disabled && (ev.key === 'Enter' || ev.key === ' ') && !isOpen) {
      ev.preventDefault();
      openLayer();
    }
  }}
>
  <FieldShell {label} {labelStyle} {labelPosition} css="w-full cursor-pointer" {disabled} active={isOpen} ringIntensity={30}
    autoHeight={useWrap}
    suffix={disabled ? undefined : arrow}
    data-id="MultiSelect:{componentID}"
    data-value={selectedOptions.map((option) => `[${option[keyId]}] ${option[keyName]}`).join(', ')}
    data-label={label || placeholder}
    data-type="other"
    data-options-count={options.length}
  >
    {#snippet children({ controlId, controlClass })}
      <!-- With useWrap the row is auto-height with 8px + 6px of padding: the -3px/-2px margins
           bring one line of 23px chips back to the 32px of a normal field row.
           The chips sit in an inner box because overflow clips at the padding edge, and the
           control's right padding is the arrow's room. -->
      <div id={controlId} class="{controlClass} flex items-center min-w-0 {useWrap ? '-mt-3 -mb-2' : ''}">
        <div class="flex items-center gap-4 w-full min-w-0 {useWrap ? 'flex-wrap' : 'overflow-hidden'}">
          {#each selectedOptions as option (option[keyId])}
            <span class="_chip shrink-0 h-23 pb-1 px-6 rounded-[5px] flex items-center">{option[keyName]}</span>
          {:else}
            <span class="_placeholder truncate"><T text={placeholder} /></span>
          {/each}
        </div>
      </div>
    {/snippet}
  </FieldShell>
</div>
<MultiSelectLayer referenceElement={fieldElement} open={isOpen} {options} {keyId} {keyName} {selectedIDs}
  bind:filterValue onToggle={toggleOption} onClose={() => { isOpen = false; }} />

<style>
  ._chip {
    background-color: var(--accent-bg-strong);
    color: var(--accent-fg);
  }
  ._placeholder {
    color: var(--input-placeholder-color, var(--fg-subtle));
  }
  ._arrow {
    font-size: 20px;
    color: var(--fg-soft);
    transition: color 0.15s ease;
  }
  ._arrow._open {
    color: var(--accent-solid);
  }
</style>
