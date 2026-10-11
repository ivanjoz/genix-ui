<script lang="ts" generics="T, E">
  import { Agent, type AgentOption } from '../agent/registry';
  import ButtonLayer from '../buttons/ButtonLayer.svelte';
  import { useUI } from '../runtime/index.js';
  const ui = useUI()

  // Picks one color of a fixed set. The trigger is the current color as a rounded swatch; clicking
  // it opens a layer with every color as a swatch. Colors are given as background classes
  // (keyColorCss), so a caller's palette keeps its theme tokens and dark mode.
  interface ColorSelectProps<T, E> {
    options: E[];
    keyId: keyof E;
    /** Class that paints the swatch's background, e.g. "bg-blue-solid". */
    keyColorCss: keyof E;
    /** Name of each color: tooltip, aria-label and agent value. */
    keyName?: keyof E;
    saveOn?: T;
    save?: keyof T;
    onChange?: (option: E) => void;
    /** Accessible / agent name only — never drawn. */
    label?: string;
    css?: string;
  }

  const {
    options = [],
    keyId,
    keyColorCss,
    keyName,
    saveOn,
    save,
    onChange,
    label = "Color",
    css = "",
  }: ColorSelectProps<T, E> = $props();

  let isOpen = $state(false);

  const selectedID = $derived(saveOn && save ? saveOn[save] : undefined);
  const selectedOption = $derived(options.find((option) => String(option[keyId]) === String(selectedID ?? "")));
  const colorName = (option: E | undefined) => option && keyName ? ui.translate(String(option[keyName] ?? "")) : "";

  function selectColor(option: E) {
    isOpen = false;
    if (String(option[keyId]) === String(selectedID ?? "")) { return; }
    if (saveOn && save) { saveOn[save] = option[keyId] as unknown as NonNullable<T>[keyof T]; }
    onChange?.(option);
  }

  const componentID = ui.nextComponentId()

  // Registered as a "Select" so the agent drives it like any other select.
  const agentOptions = () => options.map((option): AgentOption => ({ ID: option[keyId] as number | string, Value: colorName(option) || String(option[keyId]) }));
  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "Select",
      label: label,
      search: () => { isOpen = true; return agentOptions(); },
      select: (...ids) => {
        const matched = options.find((option) => String(option[keyId]) === String(ids[0]));
        if (matched) { selectColor(matched); }
      },
      getOptions: () => agentOptions(),
    });
  });
</script>

{#snippet trigger(open: boolean)}
  <div class="_trigger flex items-center justify-center cursor-pointer" class:_open={open}
    data-id="Select:{componentID}"
    data-value={selectedOption ? `[${selectedOption[keyId]}] ${colorName(selectedOption)}` : ""}
    data-label={label}
    data-type="other"
    data-options-count={options.length}
    title={colorName(selectedOption)}
  >
    <span class="_swatch {selectedOption ? selectedOption[keyColorCss] : '_empty'}"></span>
  </div>
{/snippet}

<ButtonLayer bind:isOpen button={trigger} wrapperClass="shrink-0 {css}" layerClass="w-200" contentCss="p-8" label={label}>
  <div class="grid grid-cols-4 gap-8" role="listbox" aria-label={ui.translate(label)}>
    {#each options as option (option[keyId])}
      {@const isCurrent = String(option[keyId]) === String(selectedID ?? "")}
      <button type="button" class="_option flex items-center justify-center" class:_current={isCurrent}
        role="option" aria-selected={isCurrent} aria-label={colorName(option) || String(option[keyId])} title={colorName(option)}
        onclick={() => selectColor(option)}>
        <span class="_swatch {option[keyColorCss]}"></span>
      </button>
    {/each}
  </div>
</ButtonLayer>

<style>
  /* As tall as a field (--input-height), so it lines up with the inputs beside it. */
  ._trigger {
    height: var(--input-height, 38px);
    padding: 0 8px;
    border-radius: 10px;
    outline: 1px solid var(--line);
    background-color: var(--surface);
    transition: box-shadow 0.15s ease, background-color 0.15s ease;
  }
  ._trigger:hover {
    background-color: var(--surface-soft);
  }
  ._trigger._open {
    box-shadow: 0 0 0 3px var(--input-ring-color, color-mix(in srgb, var(--accent-solid) 40%, transparent));
  }
  ._swatch {
    display: block;
    width: 36px;
    height: 22px;
    border-radius: 11px;
  }
  ._swatch._empty {
    outline: 1px dashed var(--line-strong);
  }
  ._option {
    padding: 4px;
    border-radius: 15px;
    outline: 2px solid transparent;
    cursor: pointer;
  }
  ._option:hover {
    background-color: var(--surface-muted);
  }
  ._option._current {
    outline-color: var(--accent-solid);
  }
</style>
