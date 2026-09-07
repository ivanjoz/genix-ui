<script lang="ts" generics="T,TLeftOption,TRightOption">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import SearchSelect from "../form/SearchSelect.svelte";
  import { Agent } from "../agent/registry";

  type SearchOptionID = string | number;
  type SearchDualCardSource = "left" | "right";

  export interface ISearchDualCardSelectedItem<TOption> {
    source: SearchDualCardSource;
    id: SearchOptionID;
    option: TOption;
  }

  interface SearchDualCardProps<T, TLeftOption, TRightOption> {
    saveOn?: T;
    saveLeft: keyof T;
    /** Unused while the right side is controlled through `rightChipIDs`. */
    saveRight?: keyof T;
    css?: string;
    cardCss?: string;
    sharedLabel?: string;
    /** Both selects are unlabelled: paint `leftLabel`/`rightLabel` in the label colour, not placeholder grey. */
    placeholderAsLabel?: boolean;
    onChange?: (payload: {
      leftSelectedIDs: SearchOptionID[];
      rightSelectedIDs: SearchOptionID[];
    }) => void;
    leftOptions: TLeftOption[];
    leftKeyId: keyof TLeftOption;
    leftKeyName: keyof TLeftOption;
    leftLabel?: string;
    leftOptionsCss?: string;
    leftInputCss?: string;
    /** Left dropdown laid out as N option cards per row, rendered by `render1`. */
    columns1?: number;
    render1?: Snippet<[TLeftOption, string[]]>;
    rightOptions: TRightOption[];
    rightKeyId: keyof TRightOption;
    rightKeyName: keyof TRightOption;
    rightLabel?: string;
    rightOptionsCss?: string;
    rightInputCss?: string;
    /** Right dropdown laid out as N option cards per row, rendered by `render2`. */
    columns2?: number;
    render2?: Snippet<[TRightOption, string[]]>;
    /**
     * Controlled right side. Set it when one chip does not map to one stored id — the caller owns
     * the selection model, so the card shows exactly these ids, delegates removal to
     * `onRightChipRemove`, and stops reading or writing `saveRight`.
     */
    rightChipIDs?: SearchOptionID[];
    onRightChipRemove?: (optionID: SearchOptionID) => void;
    /** Controlled right side: what picking an option out of the list means. Keyboard and the
        agent's `select` both come through here, so leaving it unset makes them dead ends. */
    onRightSelect?: (optionRecord: TRightOption) => void;
    selectedItem?: Snippet<[ISearchDualCardSelectedItem<TLeftOption | TRightOption>]>;
  }

  const {
    saveOn = $bindable(),
    saveLeft,
    saveRight,
    css = "",
    cardCss = "",
    sharedLabel,
    placeholderAsLabel = false,
    onChange,
    leftOptions = [],
    leftKeyId,
    leftKeyName,
    leftLabel,
    leftOptionsCss,
    leftInputCss,
    columns1 = 1,
    render1,
    rightOptions = [],
    rightKeyId,
    rightKeyName,
    rightLabel,
    rightOptionsCss,
    rightInputCss,
    columns2 = 1,
    render2,
    rightChipIDs,
    onRightChipRemove,
    onRightSelect,
    selectedItem
  }: SearchDualCardProps<T, TLeftOption, TRightOption> = $props();

  const rightIsControlled = $derived(!!rightChipIDs);

  let leftSelectedIDs = $state<SearchOptionID[]>([]);
  let rightSelectedIDs = $state<SearchOptionID[]>([]);

  // Cache option lookups per source list so selected IDs can be resolved without repeated scans.
  function buildLookup<TOption>(
    optionRecords: TOption[],
    optionKeyId: keyof TOption,
    optionKeyName: keyof TOption
  ) {
    if (ui.searchReferences.has(optionRecords)) { return; }

    const optionById = new Map<SearchOptionID, TOption>();
    const optionByName = new Map<string, TOption>();

    for (const optionRecord of optionRecords) {
      const optionId = optionRecord[optionKeyId] as SearchOptionID;
      const optionName = String(optionRecord[optionKeyName] || "").toLowerCase();
      optionById.set(optionId, optionRecord);
      optionByName.set(optionName, optionRecord);
    }

    ui.searchReferences.set(optionRecords, { idToRecord: optionById, valueToRecord: optionByName });
  }

  function getSavedIDs(fieldName?: keyof T): SearchOptionID[] {
    if (!fieldName) { return []; }
    const rawValue = saveOn?.[fieldName] as SearchOptionID[] | undefined;
    return Array.isArray(rawValue) ? [...rawValue] : [];
  }

  function areSameIDs(leftValues: SearchOptionID[], rightValues: SearchOptionID[]) {
    if (leftValues.length !== rightValues.length) { return false; }
    return leftValues.every((value, index) => value === rightValues[index]);
  }

  // Keep local state synchronized with the bound form object without creating render loops.
  function syncSelectedIDsFromProps() {
    if (!saveOn) { return; }

    const nextLeftSelectedIDs = getSavedIDs(saveLeft);
    const nextRightSelectedIDs = rightIsControlled ? rightSelectedIDs : getSavedIDs(saveRight);

    if (
      areSameIDs(leftSelectedIDs, nextLeftSelectedIDs) &&
      areSameIDs(rightSelectedIDs, nextRightSelectedIDs)
    ) {
      return;
    }

    console.debug("SearchDualCard::syncSelectedIDsFromProps", {
      saveLeft: String(saveLeft),
      saveRight: String(saveRight),
      nextLeftSelectedIDs,
      nextRightSelectedIDs
    });

    untrack(() => {
      leftSelectedIDs = nextLeftSelectedIDs;
      rightSelectedIDs = nextRightSelectedIDs;
    });
  }

  function commitSelectedIDs() {
    if (saveOn) {
      saveOn[saveLeft] = [...leftSelectedIDs] as NonNullable<T>[keyof T];
      if (saveRight && !rightIsControlled) {
        saveOn[saveRight] = [...rightSelectedIDs] as NonNullable<T>[keyof T];
      }
    }

    console.debug("SearchDualCard::commitSelectedIDs", {
      saveLeft: String(saveLeft),
      saveRight: String(saveRight),
      leftSelectedIDs: $state.snapshot(leftSelectedIDs),
      rightSelectedIDs: $state.snapshot(rightSelectedIDs)
    });

    onChange?.({
      leftSelectedIDs: [...leftSelectedIDs],
      rightSelectedIDs: [...rightSelectedIDs]
    });
  }

  function getOptionRecord<TOption>(
    optionRecords: TOption[],
    optionKeyId: keyof TOption,
    optionKeyName: keyof TOption,
    optionID: SearchOptionID
  ): TOption {
    const optionById = ui.searchReferences.get(optionRecords)?.idToRecord || new Map();
    return optionById.get(optionID) as TOption
      || { [optionKeyId]: optionID, [optionKeyName]: `ID-${optionID}` } as TOption;
  }

  function addLeftSelectedID(optionRecord?: TLeftOption) {
    if (!optionRecord) { return; }

    const optionID = optionRecord[leftKeyId] as SearchOptionID;
    if (leftSelectedIDs.includes(optionID)) { return; }

    console.debug("SearchDualCard::addLeftSelectedID", { optionID, optionRecord });
    leftSelectedIDs = [...leftSelectedIDs, optionID];
    commitSelectedIDs();
  }

  function addRightSelectedID(optionRecord?: TRightOption) {
    if (!optionRecord) { return; }

    if (rightIsControlled) {
      onRightSelect?.(optionRecord);
      return;
    }

    const optionID = optionRecord[rightKeyId] as SearchOptionID;
    if (rightSelectedIDs.includes(optionID)) { return; }

    console.debug("SearchDualCard::addRightSelectedID", { optionID, optionRecord });
    rightSelectedIDs = [...rightSelectedIDs, optionID];
    commitSelectedIDs();
  }

  function removeSelectedID(source: SearchDualCardSource, optionID: SearchOptionID) {
    console.debug("SearchDualCard::removeSelectedID", { source, optionID });

    if (source === "right" && rightIsControlled) {
      onRightChipRemove?.(optionID);
      return;
    }

    if (source === "left") {
      leftSelectedIDs = leftSelectedIDs.filter((currentID) => currentID !== optionID);
    } else {
      rightSelectedIDs = rightSelectedIDs.filter((currentID) => currentID !== optionID);
    }

    commitSelectedIDs();
  }

  // Resolve the visible label in one place so the default renderer stays simple and type-safe.
  function getSelectedItemName(selectedOption: ISearchDualCardSelectedItem<TLeftOption | TRightOption>) {
    if (selectedOption.source === "left") {
      return String((selectedOption.option as TLeftOption)[leftKeyName] || "");
    }
    return String((selectedOption.option as TRightOption)[rightKeyName] || "");
  }

  const selectedItems = $derived.by(() => {
    const mergedSelectedItems: ISearchDualCardSelectedItem<TLeftOption | TRightOption>[] = [];

    for (const optionID of leftSelectedIDs) {
      mergedSelectedItems.push({
        source: "left",
        id: optionID,
        option: getOptionRecord(leftOptions, leftKeyId, leftKeyName, optionID)
      });
    }

    for (const optionID of rightChipIDs || rightSelectedIDs) {
      mergedSelectedItems.push({
        source: "right",
        id: optionID,
        option: getOptionRecord(rightOptions, rightKeyId, rightKeyName, optionID)
      });
    }

    return mergedSelectedItems;
  });

  $effect(() => {
    buildLookup(leftOptions, leftKeyId, leftKeyName);
  });

  $effect(() => {
    buildLookup(rightOptions, rightKeyId, rightKeyName);
  });

  $effect(() => {
    syncSelectedIDsFromProps();
  });

  const componentID = ui.nextComponentId();

  // Resolve which side an id belongs to so the agent's select() doesn't need to specify.
  function findSourceForId(rawId: SearchOptionID): SearchDualCardSource | undefined {
    const target = String(rawId);
    if (leftOptions.some((opt) => String(opt[leftKeyId]) === target)) { return "left"; }
    if (rightOptions.some((opt) => String(opt[rightKeyId]) === target)) { return "right"; }
    return undefined;
  }

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "SearchDualCard",
      label: sharedLabel || "",
      select: (...ids) => {
        for (const rawId of ids) {
          const source = findSourceForId(rawId);
          if (source === "left") {
            const matched = leftOptions.find((opt) => String(opt[leftKeyId]) === String(rawId));
            if (matched) { addLeftSelectedID(matched); }
          } else if (source === "right") {
            const matched = rightOptions.find((opt) => String(opt[rightKeyId]) === String(rawId));
            if (matched) { addRightSelectedID(matched); }
          }
        }
      },
      remove: (id) => {
        const source = findSourceForId(id);
        if (!source) { return; }
        // The actual id type may be number; recover it from the matching list.
        const list = source === "left" ? leftSelectedIDs : (rightChipIDs || rightSelectedIDs);
        const matched = list.find((current) => String(current) === String(id));
        if (matched !== undefined) { removeSelectedID(source, matched); }
      },
    });
  });
</script>

<div data-id="SearchDualCard:{componentID}" class={css}>
  <div class="grid grid-cols-24 gap-10">
    <SearchSelect
      options={leftOptions}
      keyId={leftKeyId}
      keyName={leftKeyName}
      clearOnSelect={true}
      avoidIDs={leftSelectedIDs}
      placeholder={ui.translate(leftLabel)}
      {placeholderAsLabel}
      css={`col-span-24 md:col-span-12 s1 ${leftInputCss || ""}`}
      optionsCss={leftOptionsCss}
      columns={columns1}
      optionRenderer={render1}
      onChange={addLeftSelectedID}
    />
    <!-- `avoidIDs` stays empty while the right side is controlled: the caller's chips need not map
         1:1 to options, so hiding "already selected" ones would hide options still worth editing. -->
    <SearchSelect
      options={rightOptions}
      keyId={rightKeyId}
      keyName={rightKeyName}
      clearOnSelect={true}
      avoidIDs={rightSelectedIDs}
      placeholder={ui.translate(rightLabel)}
      {placeholderAsLabel}
      css={`col-span-24 md:col-span-12 s1 ${rightInputCss || ""}`}
      optionsCss={rightOptionsCss}
      columns={columns2}
      optionRenderer={render2}
      onChange={addRightSelectedID}
    />
  </div>

  <div class={`p-4 min-h-40 _container ${cardCss}`}>
    {#if sharedLabel}
      <div class="_shared-label">{ui.translate(sharedLabel)}</div>
    {/if}

    <div class="flex flex-wrap">
      {#each selectedItems as currentSelectedItem (`${currentSelectedItem.source}-${currentSelectedItem.id}`)}
        {@const removeSelected = () => removeSelectedID(currentSelectedItem.source, currentSelectedItem.id)}
        {#if selectedItem}
          <div data-id="Option:{currentSelectedItem.id}" data-selected="true"
            class={`m-2 px-8 py-6 min-w-56 lh-10 flex _chip ${currentSelectedItem.source === "right" ? "_chip-right" : "_chip-left"}`}>
            <span class="_chip-text">
              {@render selectedItem(currentSelectedItem)}
            </span>
            <button
              class="_chip-remove absolute w-28 h-28 rounded right-2 top-2"
              aria-label={ui.translate("delete|eliminar")}
              onclick={(event) => {
                event.stopPropagation();
                removeSelected();
              }}
            >
              <i class="icon-[fa--trash]"></i>
            </button>
          </div>
        {:else}
          <div data-id="Option:{currentSelectedItem.id}" data-selected="true"
            class={`m-2 px-8 py-6 min-w-56 lh-10 flex _chip ${currentSelectedItem.source === "right" ? "_chip-right" : "_chip-left"}`}>
            <span class="_chip-text">{getSelectedItemName(currentSelectedItem)}</span>
            <button
              class="_chip-remove absolute w-28 h-28 rounded right-2 top-2"
              aria-label={ui.translate("delete|eliminar")}
              onclick={(event) => {
                event.stopPropagation();
                removeSelected();
              }}
            >
              <i class="icon-[fa--trash]"></i>
            </button>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  ._container {
    background-color: var(--light-blue-1);
    border-radius: 5px;
    box-shadow: #5f7187a8 0 1px 3px -1px;
  }

  ._shared-label {
    color: #6d5dad;
    line-height: 18px;
    margin-bottom: 8px;
  }

  ._chip {
    align-items: center;
    background-color: #fff;
    border: 1px solid #dfe1ea;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    justify-content: center;
    min-height: 32px;
    position: relative;
    user-select: none;
  }

  ._chip-left {
    border-color: #d6d8f6;
  }

  ._chip-right {
    border-color: #d9e0f7;
  }

  ._chip:hover {
    border-color: rgb(236, 125, 125);
    color: rgb(209, 66, 66);
  }

  ._chip-text {
    display: block;
    width: 100%;
  }

  ._chip-remove {
    border-radius: 50%;
    font-size: 14px;
    opacity: 0;
  }

  ._chip:hover ._chip-remove {
    background-color: rgb(255, 221, 221);
    color: rgb(224, 61, 61);
    opacity: 1;
  }

  ._chip:hover ._chip-remove:hover {
    background-color: rgb(240, 102, 102);
    color: white;
  }
</style>
