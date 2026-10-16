<script lang="ts" generics="T, E">
  import type { Snippet } from 'svelte';
  import { Agent, type AgentOption } from '../agent/registry';
  import ButtonLayer from '../buttons/ButtonLayer.svelte';
  import T from '../misc/T.svelte';
  import { useUI } from '../runtime/index.js';
  import FieldShell from './FieldShell.svelte';
  const ui = useUI()

  // A select for a short, fixed list: the trigger looks like any labelled field but takes no
  // typing; clicking it opens a layer with one button per option, in 1 or 2 columns. For long
  // lists that need a search box, use SearchSelect.
  interface SelectBoxProps<T, E> {
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    saveOn?: T;
    save?: keyof T;
    /** Controlled mode: the selected id. The component never writes it back; update it in onChange. */
    selected?: number | string | null;
    /** Called with undefined when the value is cleared. */
    onChange?: (option: E | undefined) => void;
    label?: string;
    labelStyle?: "normal" | "bold";
    /** Where the label sits: top (in the border, default), side (beside the field) or inline (inside it, before the value). */
    labelPosition?: "top" | "side" | "inline";
    placeholder?: string;
    /** Shows a × beside the arrow while a value is selected: it clears it (stores null) back to the placeholder. */
    clearable?: boolean;
    columns?: 1 | 2;
    /** Draws an option's button content instead of its name. */
    optionRenderer?: Snippet<[E, boolean]>;
    css?: string;
    /** Width of the layer; the trigger width is the caller's `css`. */
    layerCss?: string;
    icon?: string;
    disabled?: boolean;
  }

  const {
    options = [],
    keyId,
    keyName,
    saveOn,
    save,
    selected,
    onChange,
    label,
    labelStyle,
    labelPosition,
    placeholder = "— select —|— seleccione —",
    clearable = false,
    columns = 1,
    optionRenderer,
    css = "",
    layerCss = "",
    icon = "icon-[mdi--unfold-more-horizontal]",
    disabled = false,
  }: SelectBoxProps<T, E> = $props();

  let isOpen = $state(false);

  const selectedID = $derived(selected !== undefined ? selected : (saveOn && save ? saveOn[save] : undefined));
  const selectedOption = $derived(options.find((option) => String(option[keyId]) === String(selectedID ?? "")));
  const optionName = (option: E) => ui.translate(String(option[keyName] ?? ""));

  function selectOption(option: E | undefined) {
    isOpen = false;
    const newID = option ? option[keyId] : null;
    if (String(newID ?? "") === String(selectedID ?? "")) { return; }
    if (saveOn && save) { saveOn[save] = newID as unknown as NonNullable<T>[keyof T]; }
    onChange?.(option);
  }

  const componentID = ui.nextComponentId()

  // Registered as a "Select" so the agent drives it like a SearchSelect. A clearable one is cleared with id "".
  const agentOptions = (maxOptions = 50) => options.slice(0, maxOptions)
    .map((option): AgentOption => ({ ID: option[keyId] as number | string, Value: optionName(option) }));
  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "Select",
      label: label || placeholder,
      search: () => { isOpen = true; return agentOptions(); },
      select: (...ids) => {
        if (ids.length === 0) { return; }
        if (clearable && String(ids[0]) === "") { selectOption(undefined); return; }
        const matched = options.find((option) => String(option[keyId]) === String(ids[0]));
        if (matched) { selectOption(matched); }
      },
      getOptions: (maxOptions) => agentOptions(maxOptions),
    });
  });
</script>

{#snippet arrow()}
  {@const showsClear = clearable && !!selectedOption}
  {#if showsClear}
    <!-- Takes the arrow's place while the field is hovered. Stops the click so clearing doesn't also toggle the layer. -->
    <button type="button" class="_clear hidden group-hover:flex items-center" aria-label={ui.translate("Clear|Limpiar")} title={ui.translate("Clear|Limpiar")}
      onclick={(ev) => { ev.stopPropagation(); selectOption(undefined); }}>
      <i class="icon-[mdi--close-circle]"></i>
    </button>
  {/if}
  <i class="{icon} _arrow" class:group-hover:hidden={showsClear} class:_open={isOpen}></i>
{/snippet}

{#snippet trigger(open: boolean)}
  <FieldShell {label} {labelStyle} {labelPosition} css="group w-full cursor-pointer" {disabled} active={open} ringIntensity={30}
    suffix={disabled ? undefined : arrow}
    data-id="Select:{componentID}"
    data-value={selectedOption ? `[${selectedOption[keyId]}] ${selectedOption[keyName]}` : ""}
    data-label={label || placeholder}
    data-type="other"
    data-options-count={options.length}
  >
    {#snippet children({ controlId, controlClass })}
      <div id={controlId} class="{controlClass} flex items-center min-w-0">
        <div class="w-full truncate" class:_placeholder={!selectedOption}>
          {#if selectedOption}
            {optionName(selectedOption)}
          {:else}
            <T text={placeholder} />
          {/if}
        </div>
      </div>
    {/snippet}
  </FieldShell>
{/snippet}

{#snippet optionButton(option: E, isCurrent: boolean)}
  <button type="button" class="_option" class:_current={isCurrent} role="option" aria-selected={isCurrent}
    onclick={() => selectOption(option)}>
    {#if optionRenderer}
      {@render optionRenderer(option, isCurrent)}
    {:else}
      <span class="truncate">{optionName(option)}</span>
    {/if}
  </button>
{/snippet}

{#if disabled}
  <div class={css}>{@render trigger(false)}</div>
{:else}
  <ButtonLayer bind:isOpen button={trigger} wrapperClass={css} layerClass="{columns === 2 ? 'min-w-360' : 'min-w-240'} {layerCss}"
    contentCss="p-6 max-h-[60vh] overflow-y-auto" label={label || placeholder}>
    <div class="grid gap-4 {columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}" role="listbox" aria-label={ui.translate(label || placeholder)}>
      {#each options as option (option[keyId])}
        {@render optionButton(option, String(option[keyId]) === String(selectedID ?? ""))}
      {/each}
    </div>
  </ButtonLayer>
{/if}

<style>
  ._placeholder {
    color: var(--input-placeholder-color, var(--fg-subtle));
  }
  /* FieldShell's suffix ignores the pointer (clicks fall to the control); the × must take them. */
  ._clear {
    pointer-events: auto;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-right: -6px;
    border-radius: 50%;
    color: var(--fg-muted);
    cursor: pointer;
  }
  ._clear i {
    width: 24px;
    height: 24px;
  }
  ._clear:hover {
    color: var(--red-solid);
    background-color: var(--red-bg);
  }
  ._arrow {
    font-size: 20px;
    color: var(--fg-soft);
    transition: color 0.15s ease;
  }
  ._arrow._open {
    color: var(--accent-solid);
  }
  ._option {
    display: flex;
    align-items: center;
    min-height: 38px;
    padding: 4px 10px;
    border-radius: 6px;
    outline: 1px solid var(--line);
    /* Transparent until selected, so the selected option's inner line doesn't resize it. */
    border: 1px solid transparent;
    background-color: var(--surface);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  ._option:hover {
    background-color: var(--surface-muted);
  }
  /* Selected: a blue outline over a pale inner line. Dark mode swaps the hexes for the blue
     tokens, which are mixed over the dark surface. */
  ._option._current {
    outline: 1px solid #5a7be9;
    border-color: #ccd4ff;
    background-color: var(--blue-bg);
    color: #2653eb;
  }
  :global(body.dark) ._option._current {
    outline-color: var(--blue-solid);
    border-color: var(--blue-border);
    color: var(--blue-fg);
  }
</style>
