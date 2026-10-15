<script lang="ts" generics="T">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
    import { untrack } from "svelte";
    import FieldShell from "./FieldShell.svelte";
    import type { ElementAST } from '../misc/Renderer.svelte';
    import { Agent } from "../agent/registry";
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
        /** Overrides the label's font size (px) set by labelStyle. */
        labelFontSize?: number;
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
        // Draws the ✔ / ⚠ validity glyph small and inline after the label text instead of in
        // the field's right slot, leaving the whole box to the value.
        validityIconInLabel?: boolean;
        // type="number" only: a − button on the left and a + button on the right step the
        // value by 1, and the value is centred between them. The + takes the right slot, so
        // the validity glyph moves to the label and `postValue` is not drawn.
        useIncrementButtons?: boolean;
        // With useIncrementButtons: pressing − and dragging right, or + and dragging left, lays a
        // slider over the field that starts at the current value — a track across its middle
        // from the pressed button's edge, 12px per unit, and a ruler on its top line with the
        // value in a bubble. From − every unit dragged adds 1, from + it subtracts 1, kept
        // within min..max. Releasing inside the field sets that value; releasing outside it
        // keeps the previous one. A press that does not drag is still a −1 / +1.
        useNumericSwipe?: { min: number; max: number };
        // The field becomes a drop target for files. While files are dragged anywhere on the
        // page it shows a faint file icon over the box, so the user learns they can drop
        // there; over the field the icon bounces. The dropped files go to onFileDrop — the
        // field never uploads or stores them itself.
        useFileDragUpload?: boolean;
        onFileDrop?: (files: File[]) => void;
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
        labelFontSize,
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
        validityIconInLabel,
        useIncrementButtons,
        useNumericSwipe,
        useFileDragUpload,
        onFileDrop,
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

    // Follows saveOn[save] itself, not only a swapped saveOn: a value written from outside (a
    // SelectedTags ✕) shows in the field. The field's own keystrokes store what it shows, so they
    // compare equal and never reset the text being typed.
    $effect(() => {
        if (!saveOn || !save) {
            return;
        }
        const storedValue = saveOn[save];
        untrack(() => {
            const shownValue = baseDecimalsValue && typeof inputValue === "number"
                ? Math.round(inputValue * baseDecimalsValue) : inputValue;
            if (storedValue !== shownValue) {
                doSave();
            }
        });
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
    const showIncrementButtons = $derived(!!useIncrementButtons && type === "number");
    const showValidityInLabel = $derived(!!validityIconInLabel || showIncrementButtons);
    // Passing the snippet only when there is something in it keeps `has-suffix` — and the
    // 34px of padding it reserves — off fields that need neither an icon nor a unit.
    const hasSuffix = $derived(!showIncrementButtons
        && (!!postValue || isPassword || (!showValidityInLabel && (showInvalid || showValid))));

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

    // A value set from outside the keyboard (the agent, the ± buttons) reuses the blur path,
    // so parse / transform / validate / persist all run.
    const commitValue = (value: string | number) => {
        const fakeEvent = { stopPropagation: () => {}, target: { value: String(value) } } as unknown as KeyboardEvent;
        onKeyUp(fakeEvent, true);
        if (onChange) { onChange(); }
        if (typeof id === "number" && id > 0) {
            ui.persistFieldValue(id, (saveOn?.[save] ?? null) as number | string | null);
        }
    };

    // ── numeric swipe ──────────────────────────────────────────────────────────────
    const SWIPE_PX_PER_UNIT = 12;
    // One ruler mark on the top line every this many units.
    const SWIPE_TICK_UNITS = 5;
    // A press on a button that moves toward the field less than this is still a tap (a ±1).
    const SWIPE_START_PX = 6;
    // Space between the pressed button's inner edge and the start of the track.
    const SWIPE_TRACK_GAP_PX = 6;

    const numericSwipeRange = $derived(showIncrementButtons ? useNumericSwipe : undefined);
    // `step` is the pressed button: +1 is the − dragged right (adds), −1 is the + dragged left
    // (subtracts). Either way the drag goes toward the field and away from the button.
    let swipePress: { pointerX: number; pressedButton: HTMLElement; step: 1 | -1 } | null = null;
    // Set while the slider is out. `pressX` is where the finger first pressed, in viewport
    // coordinates: the units are counted from there, so the first pixels of the drag already
    // count. The other positions are px relative to the field's root, and `trackLeft` is always
    // the track's left end.
    let swipeRuler = $state<{
        step: 1 | -1; startValue: number; pressX: number;
        trackLeft: number; trackWidth: number; lineTop: number; trackMiddleTop: number;
        boxLeft: number; boxRight: number; boxTop: number; boxBottom: number; value: number;
    } | null>(null);
    // The click that follows a swipe's pointerup must not also step the value.
    let suppressNextIncrementClick = false;

    // Units dragged away from the pressed button; dragging back past the press point never goes
    // beyond the starting value.
    const swipeValueAt = (clientX: number, ruler: { step: 1 | -1; startValue: number; pressX: number },
        range: { min: number; max: number }) => {
        const unitsDragged = Math.max(0, Math.round((clientX - ruler.pressX) * ruler.step / SWIPE_PX_PER_UNIT));
        return Math.min(range.max, Math.max(range.min, ruler.startValue + unitsDragged * ruler.step));
    };

    const onSwipePointerDown = (ev: PointerEvent, step: 1 | -1) => {
        suppressNextIncrementClick = false;
        if (!numericSwipeRange || disabled || ev.button !== 0) return;
        const pressedButton = ev.currentTarget as HTMLElement;
        pressedButton.setPointerCapture(ev.pointerId);
        swipePress = { pointerX: ev.clientX, pressedButton, step };
    };

    const onSwipePointerMove = (ev: PointerEvent) => {
        if (!swipePress || !numericSwipeRange) return;
        if (!swipeRuler) {
            if ((ev.clientX - swipePress.pointerX) * swipePress.step < SWIPE_START_PX) return;
            // The track runs from SWIPE_TRACK_GAP_PX past the pressed button's inner edge to the
            // box's opposite edge, inset as much as the button is from its own side (it covers
            // the hidden other button).
            const fieldElement = swipePress.pressedButton.closest(`[data-id="Input:${componentID}"]`) as HTMLElement;
            const fieldRect = fieldElement.getBoundingClientRect();
            const boxRect = (fieldElement.firstElementChild as HTMLElement).getBoundingClientRect();
            const buttonRect = swipePress.pressedButton.getBoundingClientRect();
            const isFromMinus = swipePress.step === 1;
            const trackStartX = isFromMinus ? buttonRect.right + SWIPE_TRACK_GAP_PX : buttonRect.left - SWIPE_TRACK_GAP_PX;
            const trackEndX = isFromMinus ? boxRect.right - (buttonRect.left - boxRect.left) : boxRect.left + (boxRect.right - buttonRect.right);
            const trackLeftX = Math.min(trackStartX, trackEndX);
            // Rounded: a fractional rect (browser zoom, a field at a fractional y) would put
            // the track, ticks and bubble edges on half pixels and blur them.
            const startValue = Math.min(numericSwipeRange.max, Math.max(numericSwipeRange.min, Number(inputValue) || 0));
            swipeRuler = {
                step: swipePress.step,
                startValue,
                pressX: swipePress.pointerX,
                trackLeft: Math.round(trackLeftX - fieldRect.left),
                trackWidth: Math.round(Math.abs(trackEndX - trackStartX)),
                lineTop: Math.round(boxRect.top - fieldRect.top),
                trackMiddleTop: Math.round(buttonRect.top + buttonRect.height / 2 - fieldRect.top),
                boxLeft: boxRect.left, boxRight: boxRect.right, boxTop: boxRect.top, boxBottom: boxRect.bottom,
                value: startValue,
            };
        }
        swipeRuler.value = swipeValueAt(ev.clientX, swipeRuler, numericSwipeRange);
    };

    // pointercancel (the browser took the gesture for a scroll) ends the swipe like a release
    // outside the field: the value stays as it was.
    const onSwipePointerEnd = (ev: PointerEvent) => {
        const endedRuler = swipeRuler;
        swipePress = null;
        swipeRuler = null;
        if (!endedRuler) return;
        suppressNextIncrementClick = true;
        const isReleasedInsideField = ev.type === "pointerup"
            && ev.clientX >= endedRuler.boxLeft && ev.clientX <= endedRuler.boxRight
            && ev.clientY >= endedRuler.boxTop && ev.clientY <= endedRuler.boxBottom;
        if (isReleasedInsideField) commitValue(endedRuler.value);
    };

    const onIncrementClick = (step: number) => {
        if (suppressNextIncrementClick) {
            suppressNextIncrementClick = false;
            return;
        }
        commitValue((Number(inputValue) || 0) + step);
    };

    // ── file drag upload ───────────────────────────────────────────────────────────
    // Depths, not booleans: dragenter / dragleave also fire for every child element the
    // pointer crosses, so a boolean would flicker off over the textarea inside the box.
    let pageFileDragDepth = $state(0);
    let fieldFileDragDepth = $state(0);
    const acceptsFileDrop = $derived(!!useFileDragUpload && !disabled);

    // Only drags that carry files: a dragged text selection or table row is not a drop here.
    const isFileDrag = (ev: DragEvent) => !!ev.dataTransfer?.types.includes("Files");

    $effect(() => {
        if (!acceptsFileDrop) return;
        const onPageDragEnter = (ev: DragEvent) => { if (isFileDrag(ev)) pageFileDragDepth++; };
        const onPageDragLeave = (ev: DragEvent) => {
            if (isFileDrag(ev)) pageFileDragDepth = Math.max(0, pageFileDragDepth - 1);
        };
        // A drop anywhere, or a drag cancelled with Esc, ends the hint on every field.
        const endFileDrag = () => { pageFileDragDepth = 0; fieldFileDragDepth = 0; };
        window.addEventListener("dragenter", onPageDragEnter);
        window.addEventListener("dragleave", onPageDragLeave);
        window.addEventListener("drop", endFileDrag);
        window.addEventListener("dragend", endFileDrag);
        return () => {
            window.removeEventListener("dragenter", onPageDragEnter);
            window.removeEventListener("dragleave", onPageDragLeave);
            window.removeEventListener("drop", endFileDrag);
            window.removeEventListener("dragend", endFileDrag);
        };
    });

    const onFieldDragEnter = (ev: DragEvent) => {
        if (!acceptsFileDrop || !isFileDrag(ev)) return;
        ev.preventDefault();
        fieldFileDragDepth++;
    };
    // preventDefault on dragover is what makes the field a valid drop target at all.
    const onFieldDragOver = (ev: DragEvent) => {
        if (!acceptsFileDrop || !isFileDrag(ev)) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    };
    const onFieldDragLeave = (ev: DragEvent) => {
        if (!acceptsFileDrop || !isFileDrag(ev)) return;
        fieldFileDragDepth = Math.max(0, fieldFileDragDepth - 1);
    };
    // Without preventDefault the browser would open the file in the tab, or paste its path
    // into the textarea.
    const onFieldDrop = (ev: DragEvent) => {
        if (!acceptsFileDrop || !isFileDrag(ev)) return;
        ev.preventDefault();
        const droppedFiles = [...(ev.dataTransfer?.files ?? [])];
        if (droppedFiles.length) onFileDrop?.(droppedFiles);
    };

    $effect(() => {
        return Agent.register({
            id: componentID,
            type: "Input",
            label: label || placeholder || "",
            setValue: commitValue,
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
            class="{isPasswordRevealed ? 'icon-[mdi--eye-off]' : 'icon-[mdi--eye]'} pointer-events-auto cursor-pointer text-label text-[20px]"
            aria-label={ui.translate("Reveal password|Revelar contraseña")}
            onclick={() => { isPasswordRevealed = !isPasswordRevealed; }}
        ></button>
    {:else if !showValidityInLabel}
        {@render validityIcon("v-icon")}
    {/if}
{/snippet}

{#snippet validityIcon(iconCss: string)}
    {#if showInvalid}
        <i class="icon-[fa--exclamation-triangle] text-red-solid {iconCss}"></i>
    {:else if showValid}
        <i class="icon-[fa--check] c-green {iconCss}"></i>
    {/if}
{/snippet}

<!-- Smaller than the label text and nudged onto its baseline, so it reads as a mark on the
     label rather than a second word. -->
{#snippet validityInLabel()}
    {@render validityIcon("ml-5 text-[12px] align-[-1px]")}
{/snippet}

<!-- The buttons sit in the flex row, inset 4px from the box's sides and bottom. A labelled
     field with buttons is 4px taller (.has-increment-buttons): its row starts 8px under the
     box's top edge (10px on mobile, where the box starts 2px higher), and the buttons keep
     7px from that edge, so the label above has room. -->
{#snippet incrementButton(step: number, iconClass: string, ariaLabel: string)}
    <button
        type="button"
        class="shrink-0 self-stretch flex items-center justify-center w-34 mx-4 mb-4
               {label ? '-mt-1 max-[749px]:-mt-3' : 'mt-4'}
               rounded-[5px] bg-accent-bg text-label text-[18px] cursor-pointer
               hover:bg-accent-bg-strong disabled:cursor-not-allowed disabled:opacity-50
               {numericSwipeRange ? 'touch-pan-y' : ''} {swipeRuler && swipeRuler.step !== -step ? 'invisible' : ''}"
        {disabled}
        aria-label={ui.translate(ariaLabel)}
        onclick={() => { onIncrementClick(step); }}
        onpointerdown={numericSwipeRange ? (ev) => { onSwipePointerDown(ev, step < 0 ? 1 : -1); } : undefined}
        onpointermove={numericSwipeRange ? onSwipePointerMove : undefined}
        onpointerup={numericSwipeRange ? onSwipePointerEnd : undefined}
        onpointercancel={numericSwipeRange ? onSwipePointerEnd : undefined}
    ><i class={iconClass}></i></button>
{/snippet}

<!-- The swipe slider, over the field while a ± button is dragged (the label and its notch are
     hidden meanwhile, see .is-swiping; the value and the other button are hidden under the
     track). The track crosses the box's middle from the pressed button's edge; the top line
     becomes its ruler, a mark every SWIPE_TICK_UNITS counted from that button, with the value
     in a bubble on the line and a stem down through the track. The thumb starts at the pressed
     button's end (the starting value) and the fill grows from there. -->
{#snippet numericSwipeRuler()}
    {#if swipeRuler}
        {@const isFromMinus = swipeRuler.step === 1}
        {@const thumbOffset = Math.min(swipeRuler.trackWidth, Math.abs(swipeRuler.value - swipeRuler.startValue) * SWIPE_PX_PER_UNIT)}
        {@const thumbX = isFromMinus ? thumbOffset : swipeRuler.trackWidth - thumbOffset}
        <div class="absolute z-10 top-0 h-full pointer-events-none"
            style="left: {swipeRuler.trackLeft}px; width: {swipeRuler.trackWidth}px">
            <div class="absolute h-10 w-[calc(100%+2px)] {isFromMinus ? 'left-0' : '-left-2'}"
                style="top: {swipeRuler.lineTop - 5}px;
                       background: repeating-linear-gradient({isFromMinus ? 'to right' : 'to left'}, var(--accent-solid) 0 2px, transparent 2px {SWIPE_TICK_UNITS * SWIPE_PX_PER_UNIT}px)"></div>
            <div class="absolute left-0 right-0 h-8 rounded-full overflow-hidden bg-line-strong"
                style="top: {swipeRuler.trackMiddleTop - 4}px">
                <div class="absolute top-0 h-full bg-accent-solid"
                    style="left: {isFromMinus ? 0 : thumbX}px; width: {thumbOffset}px"></div>
            </div>
            <!-- The stem crosses the 8px track down to its bottom edge (trackMiddleTop + 4). -->
            <div class="absolute w-2 bg-accent-solid"
                style="left: {thumbX - 1}px; top: {swipeRuler.lineTop}px; height: {swipeRuler.trackMiddleTop + 4 - swipeRuler.lineTop}px"></div>
            <!-- A fixed 32px circle (room for 3 digits) placed by its top-left corner, a whole
                 16px off the thumb, instead of translate(-50%) on a content-sized box, which
                 lands on half pixels. leading-none drops the font's line box, which otherwise
                 pushes the digits off the circle's centre. -->
            <span class="absolute w-32 h-32 flex items-center justify-center
                         rounded-full border-2 border-accent-solid bg-accent-bg-strong leading-none font-bold tabular-nums text-accent-fg
                         {String(swipeRuler.value).length <= 2 ? 'text-[16px]' : 'text-[14px]'}"
                style="left: {thumbX - 16}px; top: {swipeRuler.lineTop - 16}px">{swipeRuler.value}</span>
        </div>
    {/if}
{/snippet}

<!-- Covers the box the user sees (7px under the root's top when the label notches it). It is
     pointer-events:none, so the drag events still land on the field and the typed text stays
     readable under the translucent fill. Faint while files are dragged anywhere on the page,
     solid with a bouncing icon over the field. -->
{#snippet fileDropOverlay()}
    {#if pageFileDragDepth > 0 || fieldFileDragDepth > 0}
        {@const isOverField = fieldFileDragDepth > 0}
        <div class="absolute inset-x-0 bottom-0 {label ? 'top-7' : 'top-0'} z-10 pointer-events-none
                    flex flex-col items-center justify-center gap-4 rounded-[7px] border-2 border-dashed
                    transition-colors duration-150
                    {isOverField ? 'border-accent-solid bg-accent-bg-strong/85 text-accent-fg' : 'border-accent-border bg-accent-bg/60 text-accent-fg/60'}">
            <i class="icon-[fa--file-o] text-[28px] {isOverField ? 'animate-bounce' : ''}"></i>
            {#if isOverField}
                <span class="text-[14px] font-semibold">{ui.translate("Drop the files here|Suelta los archivos aquí")}</span>
            {/if}
        </div>
    {/if}
{/snippet}

<!-- The shell takes a single overlay snippet; each one renders only when its feature is on. -->
{#snippet fieldOverlays()}
    {#if hasLeftSelector}{@render leftSelectorOptions()}{/if}
    {#if numericSwipeRange}{@render numericSwipeRuler()}{/if}
    {#if acceptsFileDrop}{@render fileDropOverlay()}{/if}
{/snippet}

{#snippet leftSelector()}
    <button
        type="button"
        class="flex items-center gap-4 h-full pl-8 pr-5 text-sm whitespace-nowrap
               rounded-l-[7px] text-fg-soft hover:bg-surface-soft disabled:cursor-not-allowed"
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
                <!-- Inline, not an <img>: the arrow fills with var(--surface) and follows dark mode. -->
                <span class="block w-24 h-24 mt-2">{@html angleSvg}</span>
            </div>
            <!-- A hairline ring in the shadow rather than a `border`: angle.svg draws its own
                 outline (--layer-pointer-edge), and a solid border would paint a line straight across the
                 triangle's base and detach it from the panel. Same stack ButtonLayer uses. -->
            <ul
                class="max-h-[260px] overflow-y-auto rounded-md bg-layer py-3 outline-2 outline-(color:--layer-outline)
                       shadow-[var(--layer-shadow),0_0_0_1px_var(--layer-edge)]"
                role="listbox"
            >
                {#each leftOptions ?? [] as option (option.id)}
                    <li>
                        <button
                            type="button"
                            class="w-full px-8 py-4 text-left text-sm hover:bg-surface-muted
                                   {option.id === selectedLeftID ? 'bg-accent-bg font-semibold' : ''}"
                            role="option"
                            aria-selected={option.id === selectedLeftID}
                            onclick={() => { pickLeftOption(option.id); }}
                        >
                            {ui.translate(option.name)}{#if option.label}
                                <span class="ml-6 text-label">({ui.translate(option.label)})</span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
{/snippet}

<FieldShell
    {label} {labelStyle} {labelFontSize} {disabled}
    css="{css || ''}{hasLeftSelector ? ' has-interactive-prefix' : ''}{showIncrementButtons && label ? ' has-increment-buttons' : ''}{swipeRuler ? ' is-swiping' : ''}"
    invalid={showInvalid}
    autoHeight={useTextArea}
    prefix={hasLeftSelector ? leftSelector : undefined}
    overlay={hasLeftSelector || numericSwipeRange || acceptsFileDrop ? fieldOverlays : undefined}
    ondragenter={acceptsFileDrop ? onFieldDragEnter : undefined}
    ondragover={acceptsFileDrop ? onFieldDragOver : undefined}
    ondragleave={acceptsFileDrop ? onFieldDragLeave : undefined}
    ondrop={acceptsFileDrop ? onFieldDrop : undefined}
    suffix={hasSuffix ? validityAndUnit : undefined}
    labelSuffix={showValidityInLabel ? validityInLabel : undefined}
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
            {#if showIncrementButtons}
                {@render incrementButton(-1, "icon-[mdi--minus]", "Decrease|Disminuir")}
            {/if}
            <input
                id={controlId}
                class="{controlClass} placeholder:text-[15px] {showIncrementButtons ? 'text-center' : ''} {swipeRuler ? 'invisible' : ''} {inputCss || ''}"
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
            {#if showIncrementButtons}
                {@render incrementButton(1, "icon-[mdi--plus]", "Increase|Aumentar")}
            {/if}
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
        background: var(--input-border-color, var(--line-strong));
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
