<script lang="ts" generics="E">
  import { tick } from 'svelte';
  import { highlString, wordInclude } from '../utilities/ui.js';
  import { Agent, type AgentOption } from '../agent/registry';
  import { useUI } from '../runtime/index.js';
  import ButtonLayer from '../buttons/ButtonLayer.svelte';
  import FilterInput from './FilterInput.svelte';
  const ui = useUI()

  // A select drawn as a plain button: the selected name (15px, up to 2 lines) and a chevron.
  // Clicking opens a layer whose first row is a filter box over the option list. Unlike
  // SearchSelect it has no visible label and no typing in the trigger itself.
  interface ButtonSelectProps<E> {
    options: E[];
    keyId: keyof E;
    keyName: keyof E;
    selected?: number | string;
    onChange?: (e: E) => void;
    /** Accessible / agent name only — never drawn. */
    label?: string;
    placeholder?: string;
    css?: string;
    /** Width of the layer; the trigger width is the caller's `css`. */
    layerCss?: string;
    max?: number;
    getSearchText?: (e: E) => string;
    /** Fill + text colour of the button. Without it the button is white. */
    color?: "blue";
  }

  const {
    options = [],
    keyId,
    keyName,
    selected,
    onChange,
    label = "",
    placeholder = "— select —|— seleccione —",
    css = "",
    layerCss = "w-360",
    max = 200,
    getSearchText,
    color,
  }: ButtonSelectProps<E> = $props();

  let isOpen = $state(false);
  let filterText = $state("");
  let arrowSelected = $state(-1);
  let layerContentRef = $state<HTMLElement>();

  const selectedOption = $derived(
    options.find((option) => String(option[keyId]) === String(selected ?? ""))
  );
  const searchWords = $derived(filterText.split(" ").filter((word) => word.length > 1));
  const filteredOptions = $derived.by(() => {
    const matched: E[] = [];
    for (const option of options) {
      const searchText = getSearchText ? getSearchText(option) : String(option[keyName] ?? "");
      if (searchWords.length === 0 || wordInclude(searchText.toLowerCase(), searchWords)) {
        matched.push(option);
      }
      // Cap the rendered rows; the filter box is how the user reaches the rest.
      if (max > 0 && matched.length >= max) { break; }
    }
    return matched;
  });

  // Every opening starts from the full list with the filter box focused, so typing filters at once.
  async function onOpen() {
    filterText = "";
    arrowSelected = -1;
    await tick();
    layerContentRef?.querySelector("input")?.focus();
  }

  function selectOption(option: E) {
    isOpen = false;
    if (String(option[keyId]) !== String(selected ?? "")) { onChange?.(option); }
  }

  // FilterInput stops keyup but lets keydown bubble here, so the arrows drive the list from the box.
  function onLayerKeyDown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      isOpen = false;
    } else if (ev.key === "ArrowDown" && filteredOptions.length > 0) {
      ev.preventDefault();
      arrowSelected = arrowSelected >= filteredOptions.length - 1 ? 0 : arrowSelected + 1;
    } else if (ev.key === "ArrowUp" && filteredOptions.length > 0) {
      ev.preventDefault();
      arrowSelected = arrowSelected <= 0 ? filteredOptions.length - 1 : arrowSelected - 1;
    } else if (ev.key === "Enter" && arrowSelected >= 0) {
      ev.preventDefault();
      selectOption(filteredOptions[arrowSelected]);
    }
  }

  // Keep the keyboard-highlighted row in view while arrowing through a long list.
  $effect(() => {
    if (arrowSelected < 0) { return; }
    layerContentRef?.querySelector(`[data-option-index="${arrowSelected}"]`)?.scrollIntoView({ block: "nearest" });
  });

  const componentID = ui.nextComponentId()

  // Registered as a "Select" so the agent drives it exactly like a SearchSelect.
  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "Select",
      label: label || placeholder,
      search: (text: string) => {
        filterText = text.toLowerCase().trim();
        isOpen = true;
        return filteredOptions.slice(0, 50).map((option): AgentOption => ({ ID: option[keyId] as number | string, Value: String(option[keyName] ?? "") }));
      },
      select: (...ids) => {
        const matched = options.find((option) => String(option[keyId]) === String(ids[0]));
        if (matched) { selectOption(matched); }
      },
      getOptions: (maxOptions = 50) => {
        return options.slice(0, maxOptions).map((option): AgentOption => ({ ID: option[keyId] as number | string, Value: String(option[keyName] ?? "") }));
      },
    });
  });
</script>

{#snippet trigger(open: boolean)}
  <div class="_trigger flex items-center gap-8 pl-14 pr-12 cursor-pointer"
    class:_open={open}
    class:_blue={color === "blue"}
    data-id="Select:{componentID}"
    data-value={selectedOption ? `[${selectedOption[keyId]}] ${selectedOption[keyName]}` : ""}
    data-label={label || placeholder}
    data-type="other"
    data-options-count={options.length}
  >
    <!-- leading 1.2: two 15px lines (36px) still fit the fixed 42px height. -->
    <div class="min-w-0 grow text-[15px] leading-[1.2] line-clamp-2 break-words"
      class:_placeholder={!selectedOption}>
      {ui.translate(selectedOption ? String(selectedOption[keyName]) : placeholder)}
    </div>
    <i class="icon-[fa--angle-down] _chevron shrink-0 text-[14px]" class:_chevron_up={open}></i>
  </div>
{/snippet}

<ButtonLayer bind:isOpen {onOpen} button={trigger} wrapperClass={css} buttonClass="w-full"
  layerClass={layerCss} contentCss="p-6" label={label || placeholder}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={layerContentRef} onkeydown={onLayerKeyDown}>
    <FilterInput bind:value={filterText} throttle={80} size="small" icon="icon-[fa--search]"
      css="w-full mb-6" label="Filter options|Filtrar opciones" />
    <div class="max-h-300 overflow-y-auto" role="listbox">
      {#each filteredOptions as option, optionIndex}
        {@const optionName = String(option[keyName] ?? "")}
        {@const isCurrent = String(option[keyId]) === String(selected ?? "")}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="_option flex items-center min-h-36 px-8 py-4 rounded-[4px] cursor-pointer text-[15px]"
          class:_arrow={arrowSelected === optionIndex}
          class:_current={isCurrent}
          role="option" tabindex="-1"
          aria-selected={isCurrent}
          data-option-index={optionIndex}
          title={optionName}
          onclick={() => selectOption(option)}
        >
          <div class="min-w-0 grow truncate">
            {#each highlString(optionName, searchWords) as word}
              <span class={word.highl ? "_highl" : ""} class:mr-4={word.isEnd}>{word.text}</span>
            {/each}
          </div>
          {#if isCurrent}<i class="icon-[fa--check] shrink-0 ml-6 text-[12px] text-label"></i>{/if}
        </div>
      {:else}
        <div class="px-8 py-8 text-[14px] text-fg-muted">{ui.translate("No matches|Sin coincidencias")}</div>
      {/each}
    </div>
  </div>
</ButtonLayer>

<style>
  /* A pill as tall as a field (--input-height), so it lines up with the inputs beside it. */
  ._trigger {
    height: var(--input-height);
    border-radius: calc(var(--input-height) / 2);
    outline: 1px solid var(--line);
    box-shadow: rgb(50 50 93 / 18%) 0 1px 3px -1px;
    color: var(--input-text-color, var(--fg));
    background-color: var(--surface);
    transition: box-shadow 0.15s ease, background-color 0.15s ease;
  }
  ._trigger:hover {
    background-color: var(--surface-soft);
  }
  ._trigger._open {
    box-shadow: 0 0 0 3px var(--input-ring-color, color-mix(in srgb, var(--accent-solid) 40%, transparent));
  }
  ._trigger._blue {
    color: var(--accent-fg);
    background-color: var(--accent-bg-strong);
  }
  ._trigger._blue:hover {
    background-color: color-mix(in srgb, var(--accent-solid) 10%, var(--accent-bg-strong));
  }
  ._placeholder {
    color: var(--input-placeholder-color, var(--fg-subtle));
  }
  ._chevron {
    color: var(--input-suffix-color, var(--label));
    transition: transform 0.18s ease;
  }
  ._blue ._chevron {
    color: inherit;
  }
  ._chevron_up {
    transform: rotate(180deg);
  }
  ._option:hover {
    background-color: var(--surface-muted);
  }
  ._option._current {
    font-weight: 600;
  }
  ._option._arrow {
    background-color: var(--blue-bg-strong);
  }
  ._highl {
    color: var(--red-fg);
    text-decoration: underline;
  }
</style>
