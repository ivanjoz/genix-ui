<script lang="ts" generics="T">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
    import { untrack } from "svelte";
    import FieldShell from "./FieldShell.svelte";
    import type { ElementAST } from '../misc/Renderer.svelte';
    import { Agent } from "../agent/registry";

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
        css?: string;
        inputCss?: string;
        required?: boolean;
        validator?: (v: string | number) => boolean;
        type?: string;
        placeholder?: string;
        disabled?: boolean;
        onChange?: () => void;
        postValue?: string | ElementAST[];
        baseDecimals?: number;
        transform?: (v: string | number) => string | number;
        useTextArea?: boolean;
        rows?: number;
        dependencyValue?: number | string;
    }

    const {
        id,
        saveOn = $bindable(),
        save,
        label,
        css,
        inputCss,
        required,
        validator,
        type,
        placeholder,
        disabled,
        onChange,
        postValue,
        baseDecimals,
        transform,
        useTextArea,
        rows,
        dependencyValue,
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

    const componentID = ui.nextComponentId();

    const showInvalid = $derived(isInputValid === 1 && hasBeenBlurred);
    const showValid = $derived(isInputValid === 2);
    // Passing the snippet only when there is something in it keeps `has-suffix` — and the
    // 34px of padding it reserves — off fields that need neither an icon nor a unit.
    const hasSuffix = $derived(!!postValue || showInvalid || showValid);

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
    {#if showInvalid}
        <i class="v-icon icon-[fa--exclamation-triangle] text-red-500"></i>
    {:else if showValid}
        <i class="v-icon icon-[fa--check] c-green"></i>
    {/if}
{/snippet}

<FieldShell
    {label} {css} {disabled}
    invalid={showInvalid}
    autoHeight={useTextArea}
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
                class="{controlClass} {inputCss || ''}"
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
                class="{controlClass} {inputCss || ''}"
                bind:value={inputValue}
                type={type || "text"}
                placeholder={ui.translate(placeholder || "")}
                {disabled}
                onkeyup={(ev) => { onKeyUp(ev); }}
                onfocus={(ev) => {
                    focusValue = (ev.target as HTMLInputElement | HTMLTextAreaElement).value;
                }}
                onblur={onBlurControl}
            />
        {/if}
    {/snippet}
</FieldShell>
