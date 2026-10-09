<script lang="ts" generics="T">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
    import { untrack } from "svelte";
    import FieldShell from "./FieldShell.svelte";
    import type { ElementAST } from '../misc/Renderer.svelte';
    import { Agent } from "../agent/registry";
    import { parseSVG } from '../utilities/ui.js';
    import angleSvg from '../assets/angle.svg?raw';

    // All chrome (label, box, notch, focus ring) lives in FieldShell. This file owns only
    // the value pipeline: parse → validate → transform → save → persist.
    //
    // Colours are therefore not set here either: every one is a custom property
    // (--input-border-color, --input-shadow-color, --input-ring-color, …) listed at the top
    // of field-shell.module.css. Retheme a whole app from `body` next to --input-height, a
    // section from any ancestor, or one field by passing a `css` class that declares the
    // tokens — `css` lands on the shell root, which is where they are read.
    export interface IInput<T> {
        id?: number;
        saveOn: T;
        save: keyof T;
        label?: string;
        labelStyle?: "normal" | "bold";
        css?: string;
        inputCss?: string;
        required?: boolean;
        validator?: (v: string | number) => boolean;
        type?: string;
        placeholder?: string;
        disabled?: boolean;
        // Marks this field as the one a Modal should focus on open, overriding its
        // first-control default. Needed whenever an earlier field would grab focus and open
        // something over the form — see Modal.focusDialogContent. It is a marker attribute, not
        // the HTML autofocus behaviour: the browser's own version fires on mount, which is the
        // wrong moment and trips the a11y rule.
        focusOnOpen?: boolean;
        onChange?: () => void;
        postValue?: string | ElementAST[];
        baseDecimals?: number;
        transform?: (v: string | number) => string | number;
        useTextArea?: boolean;
        rows?: number;
        dependencyValue?: number | string;
        // A compact selector in the field's left slot, for the case where a value needs a
        // qualifier to be readable: a document number is meaningless until you know it is a
        // DNI rather than a RUC. Its id is saved to `saveLeft` on the same `saveOn` object.
        leftOptions?: ILeftOption[];
        saveLeft?: keyof T;
        // Picks a left option from the value being typed, while the user has not chosen one
        // themselves. The rule is the caller's — this component has no idea that eleven
        // digits means RUC — and it stops being consulted the moment the user picks, so an
        // explicit choice is never overwritten by the next keystroke.
        deriveLeftOption?: (value: string | number) => number | undefined;
    }

    export interface ILeftOption {
        id: number;
        name: string;
        // Abbreviation for the collapsed selector, where the name would push the value out of
        // the field — "Carné de extranjería" over a document number. The open list shows
        // `name (label)`, so the list is where the abbreviation is learned.
        label?: string;
    }

    const {
        id,
        saveOn = $bindable(),
        save,
        label,
        labelStyle,
        css,
        inputCss,
        required,
        validator,
        type,
        placeholder,
        disabled,
        focusOnOpen,
        onChange,
        postValue,
        baseDecimals,
        transform,
        useTextArea,
        rows,
        dependencyValue,
        leftOptions,
        saveLeft,
        deriveLeftOption,
    }: IInput<T> = $props();

    const baseDecimalsValue = $derived(baseDecimals ? 10 ** baseDecimals : 0);

    // 0 = nothing to say (not required, or disabled) · 1 = invalid · 2 = valid
    const checkIfInputIsValid = (): number => {
        if (!required || disabled) return 0;
        if (!saveOn || !save) return 1;
        const value = saveOn[save] as string | number;

        let pass = !required;
        if (validator) {
            pass = validator(value);
        } else {
            if (value || value === 0) pass = true;
        }
        return pass ? 2 : 1;
    };

    let inputValue = $state("" as string | number);
    let isInputValid = $state(checkIfInputIsValid());

    const hasLeftSelector = $derived(!!leftOptions?.length);
    let isLeftOpen = $state(false);
    // Once true, deriveLeftOption is never consulted again: the user has said what this
    // document is, and no amount of retyping the number may contradict them.
    let hasPickedLeftOption = $state(false);
    let selectedLeftID = $state(0);

    const selectedLeftOption = $derived(
        leftOptions?.find((option) => option.id === selectedLeftID),
    );

    const saveLeftOption = (optionID: number) => {
        selectedLeftID = optionID;
        if (saveOn && saveLeft) {
            saveOn[saveLeft] = optionID as NonNullable<T>[keyof T];
        }
    };

    // Runs on every keystroke until the user picks, so the type shown always matches the
    // one that will be saved. Without it the field would show a stale default while the
    // server quietly derived something else from the number.
    //
    // Falling back to the first option is what makes the field open on a real default — DNI
    // at a till — rather than on an empty chip the user has to discover is a control.
    const deriveLeftOptionFromValue = (value: string | number) => {
        if (!hasLeftSelector || hasPickedLeftOption) return;
        const derivedID = deriveLeftOption?.(value) || leftOptions?.[0]?.id || 0;
        if (derivedID && derivedID !== selectedLeftID) {
            saveLeftOption(derivedID);
        }
    };

    const pickLeftOption = (optionID: number) => {
        hasPickedLeftOption = true;
        isLeftOpen = false;
        saveLeftOption(optionID);
        if (onChange) { onChange(); }
    };
    // The red state only appears once the user has left the field, so a pristine form does
    // not greet the user with a wall of errors. The green check is NOT gated this way: a
    // check is reassurance, an error is an accusation.
    let hasBeenBlurred = $state(false);
    let isChange = 0;
    let focusValue = null as string | number | null;

    const onKeyUp = (ev: KeyboardEvent | FocusEvent, isBlur?: boolean) => {
        ev.stopPropagation();
        const target = ev.target as HTMLInputElement | HTMLTextAreaElement;
        let value: string | number = target.value;

        if (type === "number") {
            if (!isBlur && !value && (ev as KeyboardEvent).key === "-") return;
            if (isNaN(value as unknown as number)) {
                value = undefined as any;
            } else {
                value = parseFloat(value as string);
            }
        }

        if (isBlur && validator && !validator(value)) {
            inputValue = focusValue as string | number;
            if (saveOn && save) {
                if (baseDecimalsValue && typeof inputValue === "number") {
                    inputValue = Math.round(inputValue * baseDecimalsValue);
                }
                saveOn[save] = inputValue as NonNullable<T>[keyof T];
            }
            return;
        }

        if (transform && isBlur) {
            value = transform(value);
        }

        untrack(() => {
            if (saveOn && save) {
                let valueSaved = value;
                if (baseDecimalsValue && typeof valueSaved === "number") {
                    valueSaved = Math.round(valueSaved * baseDecimalsValue);
                }
                saveOn[save] = valueSaved as NonNullable<T>[keyof T];
                isInputValid = checkIfInputIsValid();
            }
        });

        if (!isBlur) {
            isChange = 1;
        }
        inputValue = value;
        deriveLeftOptionFromValue(value);
    };

    let lastSaveOn: T | undefined;

    const doSave = () => {
        untrack(() => {
            const v = saveOn[save];
            inputValue = typeof v === "number" ? v : (v as string) || "";
            if (baseDecimalsValue && typeof inputValue === "number") {
                inputValue = inputValue / baseDecimalsValue;
            }
            isInputValid = checkIfInputIsValid();

            if (!hasLeftSelector) return;
            // A record that already carries a type was declared, not guessed — adopting it
            // as a picked choice is what stops the derive rule from overwriting an edited
            // row's carné de extranjería the moment its number is retyped.
            const storedLeftID = saveLeft ? Number(saveOn[saveLeft]) || 0 : 0;
            if (storedLeftID) {
                selectedLeftID = storedLeftID;
                hasPickedLeftOption = true;
            } else {
                hasPickedLeftOption = false;
                deriveLeftOptionFromValue(inputValue);
            }
        });
    };

    $effect(() => {
        if (!saveOn || !save) {
            return;
        }
        if (lastSaveOn === saveOn) {
            return;
        }
        lastSaveOn = saveOn;

        if (saveOn[save] !== inputValue) {
            doSave();
        }
    });

    $effect(() => {
        if (dependencyValue) {
            doSave();
        }
    });

    // Seeds the selector on mount. doSave only runs when `saveOn` is swapped, and a pristine
    // form never swaps it, so without this the field would render with nothing chosen.
    $effect(() => {
        if (!hasLeftSelector || selectedLeftID) return;
        untrack(() => {
            const storedLeftID = saveOn && saveLeft ? Number(saveOn[saveLeft]) || 0 : 0;
            if (storedLeftID) {
                selectedLeftID = storedLeftID;
                hasPickedLeftOption = true;
            } else {
                deriveLeftOptionFromValue(inputValue);
            }
        });
    });

    const componentID = ui.nextComponentId();
    const leftSelectorComponentID = ui.nextComponentId();

    const isPassword = $derived(type === "password");
    let isPasswordRevealed = $state(false);

    const showInvalid = $derived(isInputValid === 1 && hasBeenBlurred);
    const showValid = $derived(isInputValid === 2);
    // Passing the snippet only when there is something in it keeps `has-suffix` — and the
    // 34px of padding it reserves — off fields that need neither an icon nor a unit.
    const hasSuffix = $derived(!!postValue || showInvalid || showValid || isPassword);

    // Shared blur handling for both the input and the textarea.
    const onBlurControl = (ev: FocusEvent) => {
        const hadChange = isChange === 1;
        onKeyUp(ev, true);
        hasBeenBlurred = true;
        if (onChange && isChange) {
            onChange();
            isChange = 0;
        }
        if (hadChange && typeof id === "number" && id > 0) {
            ui.persistFieldValue(id, (saveOn?.[save] ?? null) as number | string | null);
        }
        focusValue = null;
    };

    $effect(() => {
        return Agent.register({
            id: componentID,
            type: "Input",
            label: label || placeholder || "",
            setValue: (value: string | number) => {
                // Reuse the blur path so parse / transform / validate / persist all run.
                const fakeEvent = { stopPropagation: () => {}, target: { value: String(value) } } as unknown as KeyboardEvent;
                onKeyUp(fakeEvent, true);
                if (onChange) { onChange(); }
                if (typeof id === "number" && id > 0) {
                    ui.persistFieldValue(id, (saveOn?.[save] ?? null) as number | string | null);
                }
            },
        });
    });

    // The left selector is its own agent handle rather than another verb on the Input: an
    // agent setting a document number and an agent setting the document type are two
    // actions, and a single handle could not express the second without guessing.
    $effect(() => {
        if (!hasLeftSelector) return;
        return Agent.register({
            id: leftSelectorComponentID,
            type: "Select",
            label: `${label || placeholder || ""} — ${ui.translate("document type|tipo de documento")}`,
            getOptions: () => (leftOptions ?? []).map((option) => ({
                ID: option.id, Value: ui.translate(option.name),
            })),
            getValue: () => selectedLeftOption
                ? { ID: selectedLeftOption.id, Value: ui.translate(selectedLeftOption.name) }
                : undefined,
            select: (...ids) => { pickLeftOption(Number(ids[0])); },
        });
    });

    // data-value mirrors the current value so the agent can read it from the DOM snapshot.
    const agentDataValue = $derived(
        inputValue === undefined || inputValue === null || inputValue === "" ? "" : String(inputValue),
    );
    const agentDataLabel = $derived(label || placeholder || "");
    const agentDataType = $derived(
        type === "number" ? "number"
            : (!type || type === "text" || type === "search") ? "text"
            : "other",
    );
</script>

<!-- Unit text and validity glyph share the suffix slot, so neither can resize the notch
     the way the old chrome did by putting the icon inside the label. -->
{#snippet validityAndUnit()}
    {#if postValue}<span class="text-sm">{postValue}</span>{/if}
    {#if isPassword}
        <!-- The reveal toggle takes the whole suffix on a password field: the slot reserves
             34px, room for one glyph, and the invalid state still reads off the red border.
             The suffix itself is pointer-events:none (it must not eat clicks meant for the
             value), so the button re-enables them for its own box. -->
        <button
            type="button"
            class="{isPasswordRevealed ? 'icon-[mdi--eye-off]' : 'icon-[mdi--eye]'} pointer-events-auto cursor-pointer text-[#6b6b8e] text-[20px]"
            aria-label={ui.translate("Reveal password|Revelar contraseña")}
            onclick={() => { isPasswordRevealed = !isPasswordRevealed; }}
        ></button>
    {:else if showInvalid}
        <i class="v-icon icon-[fa--exclamation-triangle] text-red-500"></i>
    {:else if showValid}
        <i class="v-icon icon-[fa--check] c-green"></i>
    {/if}
{/snippet}

{#snippet leftSelector()}
    <button
        type="button"
        class="flex items-center gap-4 h-full pl-8 pr-5 text-sm whitespace-nowrap
               rounded-l-[7px] text-[#4b4b7a] hover:bg-[#f4f4fb] disabled:cursor-not-allowed"
        {disabled}
        aria-haspopup="listbox"
        aria-expanded={isLeftOpen}
        onclick={() => { isLeftOpen = !isLeftOpen; }}
        onblur={() => { isLeftOpen = false; }}
    >
        <span>{ui.translate(selectedLeftOption?.label || selectedLeftOption?.name || "")}</span>
        <!-- Negative margins pull the caret in on both sides: its glyph carries padding
             inside its own 16px box, so the gap it leaves reads wider than the numbers say. -->
        <span class="caret-slot -ml-2 -mr-4">
            <i
                class="icon-[mdi--chevron-down] text-[16px] select-arrow"
                class:arrow-up={isLeftOpen}
            ></i>
        </span>
    </button>
{/snippet}

<!-- Rendered in the shell's overlay slot, whose root is the positioned ancestor. mousedown
     is prevented so the button's own blur does not close the list before the click lands.

     The pointer is the same angle.svg ButtonLayer uses, in the same clipped 24x18 window:
     one shape for every popover in the app, rather than a second CSS triangle that would
     drift from it. It is pinned 16px from the left, which sits under the button for any
     label the catalog can put on it — the narrowest, "DNI", is wider than that. -->
{#snippet leftSelectorOptions()}
    {#if isLeftOpen}
        <div
            class="absolute top-full left-0 z-320 mt-8 min-w-[160px]"
            onmousedown={(ev) => { ev.preventDefault(); }}
            role="presentation"
        >
            <div class="absolute -top-18 left-12 h-18 w-24 flex justify-center overflow-hidden z-1">
                <img class="w-24 h-24 mt-2" alt="" src={parseSVG(angleSvg)} />
            </div>
            <!-- A hairline ring in the shadow rather than a `border`: angle.svg draws its own
                 34%-opacity outline, and a solid border would paint a line straight across the
                 triangle's base and detach it from the panel. Same stack ButtonLayer uses. -->
            <ul
                class="max-h-[260px] overflow-y-auto rounded-md bg-white py-3
                       shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.05)]"
                role="listbox"
            >
                {#each leftOptions ?? [] as option (option.id)}
                    <li>
                        <button
                            type="button"
                            class="w-full px-8 py-4 text-left text-sm hover:bg-[#ececf6]
                                   {option.id === selectedLeftID ? 'bg-[#f3f3fb] font-semibold' : ''}"
                            role="option"
                            aria-selected={option.id === selectedLeftID}
                            onclick={() => { pickLeftOption(option.id); }}
                        >
                            {ui.translate(option.name)}{#if option.label}
                                <span class="ml-6 text-[#6b6b8e]">({ui.translate(option.label)})</span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
{/snippet}

<FieldShell
    {label} {labelStyle} {disabled}
    css="{css || ''}{hasLeftSelector ? ' has-interactive-prefix' : ''}"
    invalid={showInvalid}
    autoHeight={useTextArea}
    prefix={hasLeftSelector ? leftSelector : undefined}
    overlay={hasLeftSelector ? leftSelectorOptions : undefined}
    suffix={hasSuffix ? validityAndUnit : undefined}
    data-id="Input:{componentID}"
    data-value={agentDataValue}
    data-label={agentDataLabel}
    data-type={agentDataType}
>
    {#snippet children({ controlId, controlClass })}
        {#if useTextArea}
            <textarea
                id={controlId}
                class="{controlClass} placeholder:text-[15px] {inputCss || ''}"
                bind:value={inputValue}
                placeholder={ui.translate(placeholder || "")}
                {disabled}
                {rows}
                onkeyup={(ev) => { onKeyUp(ev); }}
                onblur={onBlurControl}
            ></textarea>
        {:else}
            <input
                id={controlId}
                class="{controlClass} placeholder:text-[15px] {inputCss || ''}"
                bind:value={inputValue}
                type={isPassword && isPasswordRevealed ? "text" : (type || "text")}
                placeholder={ui.translate(placeholder || "")}
                {disabled}
                data-autofocus={focusOnOpen ? "" : undefined}
                onkeyup={(ev) => { onKeyUp(ev); }}
                onfocus={(ev) => {
                    focusValue = (ev.target as HTMLInputElement | HTMLTextAreaElement).value;
                }}
                onblur={onBlurControl}
            />
        {/if}
    {/snippet}
</FieldShell>

<style>
    /* The divider is two ticks in the caret's own column — one down from the top edge, one
       up from the bottom — with the caret itself filling the gap between them. Anchored to
       this wrapper rather than to the segment's right edge, which is the whole point: the
       ticks have to stay on the caret, and the segment's width moves with the selected
       label ("DNI" and "Carné de extranjería" are not the same size). */
    .caret-slot {
        position: relative;
        display: flex;
        align-items: center;
        align-self: stretch;
    }

    .caret-slot::before,
    .caret-slot::after {
        content: '';
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        width: 1px;
        height: 10px;
        background: var(--input-border-color, #d0d4e7);
    }

    .caret-slot::before {
        top: 0;
    }

    .caret-slot::after {
        bottom: 0;
    }

    /* SearchSelect's flip, and only its flip: the arrow tips over on the X axis instead of
       spinning in the plane, so both selects open with the same motion. Size and colour stay
       with the caller — this segment's caret is smaller than the one in a field's suffix.

       `display: flex` with `line-height: 1` is what keeps the glyph whole: as an inline box
       it carries the surrounding line-height and gets clipped by the segment. */
    .select-arrow {
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.18s ease;
        transform-origin: center;
        transform-style: preserve-3d;
        transform: perspective(120px) rotateX(0deg);
    }

    .select-arrow.arrow-up {
        transform: perspective(120px) rotateX(180deg);
    }
</style>
