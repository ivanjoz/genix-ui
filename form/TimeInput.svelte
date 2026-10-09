<script lang="ts" module>
  export interface ITimeInputProps<T> {
    saveOn?: T
    save?: keyof T
    label?: string
    labelStyle?: "normal" | "bold"
    css?: string
    placeholder?: string
    disabled?: boolean
    /** Step of the minutes slider. */
    minuteStep?: number
    /** Minutes printed under the slider (NumericSlider's scaleLabels). */
    minuteLabels?: number[]
    onChange?: () => void
  }
</script>

<script lang="ts" generics="T">
  // A time of day stored as minutes after midnight (8:30 → 510); clearing deletes the key,
  // like DateInput. The field opens a panel with the 24 hours as buttons (6 × 4) and a
  // NumericSlider for the minutes: two clicks set a time, no typing.
  import FieldShell from "./FieldShell.svelte"
  import NumericSlider from "./NumericSlider.svelte"
  import Popover from "../misc/Popover.svelte"
  import { Agent } from "../agent/registry"
  import { useUI } from "../runtime/index.js"
  import { formatMinutesOfDay, parseTimeText } from "./time-input.helpers"
  const ui = useUI()

  let {
    saveOn = $bindable(),
    save,
    label = "",
    labelStyle,
    css = "",
    placeholder = "HH:MM",
    disabled = false,
    minuteStep = 5,
    minuteLabels = [0, 15, 30, 55],
    onChange,
  }: ITimeInputProps<T> = $props()

  const HOURS_OF_DAY = Array.from({ length: 24 }, (_, hour) => hour)

  let showPanel = $state(false)
  let controlElement = $state<HTMLDivElement>()
  let panelElement = $state<HTMLDivElement>()

  const savedMinutes = $derived.by(() => {
    const savedValue = saveOn && save ? saveOn[save] : undefined
    return typeof savedValue === "number" ? savedValue : undefined
  })
  const selectedHour = $derived(savedMinutes === undefined ? -1 : Math.floor(savedMinutes / 60))

  // The slider writes here while it moves; the record only gets the minute on release, or
  // with the next hour click when no hour has been picked yet.
  let minutePicker = $state({ Minute: 0 })
  $effect(() => {
    minutePicker.Minute = savedMinutes === undefined ? 0 : savedMinutes % 60
  })

  const setMinutesOfDay = (minutesOfDay: number | undefined) => {
    if (!saveOn || !save) { return }
    if (minutesOfDay === undefined) {
      delete saveOn[save]
    } else {
      saveOn[save] = minutesOfDay as NonNullable<T>[keyof T]
    }
    onChange?.()
  }

  const handleMinuteChange = (minute: number) => {
    if (selectedHour < 0) { return }
    setMinutesOfDay(selectedHour * 60 + minute)
  }

  // Clicks outside the field and the panel, or Escape, close it. The panel is portaled to
  // body, so it is not inside the field and has to be checked on its own.
  $effect(() => {
    if (!showPanel) { return }
    const closeOnOutsidePointer = (ev: PointerEvent) => {
      const target = ev.target as Node
      if (controlElement?.contains(target) || panelElement?.contains(target)) { return }
      showPanel = false
    }
    const closeOnEscape = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { showPanel = false }
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  })

  const togglePanel = () => {
    if (disabled) { return }
    showPanel = !showPanel
  }

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "TimeInput",
      label: label || placeholder || "",
      // "HH:MM" or minutes after midnight; "" clears.
      setValue: (value: string | number) => {
        if (value === "") { setMinutesOfDay(undefined); return }
        const minutesOfDay = typeof value === "number" ? value : parseTimeText(value)
        if (minutesOfDay !== undefined && minutesOfDay >= 0 && minutesOfDay < 1440) { setMinutesOfDay(minutesOfDay) }
      },
    })
  })
</script>

{#snippet clockOrClear()}
  {#if savedMinutes !== undefined && !disabled}
    <!-- The suffix is pointer-events:none, so the clear button re-enables them for itself. -->
    <button type="button"
      class="icon-[fa--times] pointer-events-auto cursor-pointer text-[#6b6b8e] text-[16px]"
      aria-label={ui.translate("Clear|Limpiar")}
      onclick={(ev) => { ev.stopPropagation(); setMinutesOfDay(undefined) }}
    ></button>
  {:else}
    <i class="icon-[fa--clock-o] text-[16px]"></i>
  {/if}
{/snippet}

<FieldShell
  {label} {labelStyle} {disabled} {css}
  suffix={clockOrClear}
  data-id="TimeInput:{componentID}"
  data-value={savedMinutes === undefined ? "" : formatMinutesOfDay(savedMinutes)}
  data-label={label || placeholder}
  data-type="other"
>
  {#snippet children({ controlId, controlClass })}
    <div id={controlId} bind:this={controlElement}
      class="{controlClass} flex items-center ff-mono cursor-pointer {disabled ? 'opacity-60' : ''}"
      role="button" tabindex={disabled ? -1 : 0} aria-disabled={disabled} aria-expanded={showPanel}
      onclick={togglePanel}
      onkeydown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); togglePanel() }
      }}
    >
      {#if savedMinutes === undefined}
        <span class="text-[#6d5dad]">{ui.translate(placeholder)}</span>
      {:else}
        {formatMinutesOfDay(savedMinutes)}
      {/if}
    </div>
  {/snippet}
</FieldShell>

<Popover referenceElement={controlElement ?? null} open={showPanel} placement="bottom-start" offset={4}>
  <div bind:this={panelElement}
    class="bg-white border border-[#c1c5dc] rounded-[8px] p-12 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
  >
    <div class="grid grid-cols-6 gap-4">
      {#each HOURS_OF_DAY as hour (hour)}
        <button type="button"
          class="_hour h-34 w-40 rounded-[4px] ff-mono text-[14px] {hour === selectedHour ? '_selected' : ''}"
          onclick={() => setMinutesOfDay(hour * 60 + minutePicker.Minute)}
        >{String(hour).padStart(2, "0")}</button>
      {/each}
    </div>
    <div class="flex justify-center mt-10">
      <NumericSlider min={0} max={60 - minuteStep} step={minuteStep} referenceWidth={220} scaleLabels={minuteLabels}
        label="Minutes|Minutos" saveOn={minutePicker} save="Minute" onChange={handleMinuteChange}
      />
    </div>
  </div>
</Popover>

<style>
  ._hour {
    background-color: #f4f4fb;
    color: #3b3d4f;
    transition: background-color 0.15s;
  }

  ._hour:hover {
    background-color: #e8e7f5;
  }

  ._hour._selected {
    background-color: #6d5dad;
    color: white;
    font-weight: 600;
  }
</style>
