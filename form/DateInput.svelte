<script lang="ts" module>
  export interface IDateInputProps<T> {
    saveOn?: T
    save?: keyof T
    label?: string
    css?: string
    inputCss?: string
    placeholder?: string
    required?: boolean
    disabled?: boolean
    onChange?: () => void
    type?: "unix" | "sunix"
    // Render the calendar through Popover (Portal-to-body) so it can escape clipped/overflow ancestors like table cells.
    usePopover?: boolean
    // Strip chrome (background/border/outline/shadow); fills parent with w-full h-full. For table-cell embedding.
    useInlineStyle?: boolean
  }
</script>

<script lang="ts" generics="T">
  import { untrack } from "svelte";
  import T from '../misc/T.svelte';
  import Popover from "../misc/Popover.svelte";
  import {
    buildCalendarWeeks,
    createDateInputContext,
    dateFromUnixDay,
    formatUnixDay,
    getMonthKey,
    parseMonthKey,
    parseTypedDate,
    weekDaysNames,
  } from "./date-input.helpers";
  import FieldShell from "./FieldShell.svelte";
  import { Agent } from "../agent/registry";
  import { useUI } from '../runtime/index.js';
  const ui = useUI()

  let {
    saveOn = $bindable(),
    save,
    label = "",
    css = "",
    inputCss = "",
    placeholder = "DD-MM-YYYY",
    required = false,
    disabled = false,
    onChange,
    type = "unix",
    usePopover = false,
    useInlineStyle = false,
  }: IDateInputProps<T> = $props()

  const {
    todayDate,
    timezoneOffsetSeconds,
    todayUnixDay: dateTodayUnix,
    currentMonthKey,
  } = createDateInputContext()

  let monthSelected = $state(currentMonthKey)
  let dateSelected = $state(0)
  let dateFocus = $state(0)
  let showCalendar = $state(false)
  let inputValue = $state("")
  let avoidCloseOnBlur = false
  let inputElement = $state<HTMLInputElement>()
  const isMobile = $derived(ui.state.deviceType === 3)

  const semanasDias = $derived.by(() => buildCalendarWeeks(monthSelected, timezoneOffsetSeconds))
  const monthName = $derived(parseMonthKey(monthSelected))

  const changeMonth = (count: number) => {
    const mn = monthName
    const date = new Date(mn.year, mn.month - 1, 1, 0, 0, 0)
    date.setMonth(date.getMonth() + count)
    const month = date.getFullYear() * 100 + (date.getMonth() + 1)
    monthSelected = month
    inputElement?.focus()
  }

  const setAutocompletedValue = (value: string) => {
    const parsedDate = parseTypedDate(value, todayDate, timezoneOffsetSeconds)
    if (parsedDate.autoCompletedDate && parsedDate.autoCompletedUnixDay) {
      monthSelected = getMonthKey(parsedDate.autoCompletedDate)
      dateFocus = parsedDate.autoCompletedUnixDay
    } else {
      dateFocus = 0
    }
  }

  const changeFechaSelected = (dateUnix: number) => {
    untrack(() => {
      if (save && saveOn) {
        if (!dateUnix) {
          delete saveOn[save]
          return
        }
        saveOn[save] = dateUnix as NonNullable<T>[keyof T]
      }
    })
    dateSelected = dateUnix || 0
    inputValue = formatUnixDay(dateUnix, timezoneOffsetSeconds)

    if (inputElement) {
      inputElement.value = inputValue
    }

    if (dateUnix) {
      monthSelected = getMonthKey(dateFromUnixDay(dateUnix, timezoneOffsetSeconds))
    } else {
      monthSelected = currentMonthKey
    }
  }

  const regexKeys = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '/'])
  const regexKeysPress = new Set([...regexKeys, 'Backspace', 'Control', 'c', 'v', 'x', 'Tab'])

  let timeoutId: number | undefined
  const throttle = (fn: () => void, delay: number) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(fn, delay) as unknown as number
  }

  const handleKeyDown = (ev: KeyboardEvent) => {
    if (!regexKeysPress.has(ev.key)) {
      ev.preventDefault()
    }
  }

  const handleKeyUp = (ev: KeyboardEvent) => {
    ev.stopPropagation()
    let value = (ev.target as HTMLInputElement).value
    let valueCleaned = ""
    for (let key of value) {
      if (regexKeys.has(key)) valueCleaned += key
    }
    if (value !== valueCleaned) {
      (ev.target as HTMLInputElement).value = valueCleaned
    }
    inputValue = valueCleaned
    throttle(() => { setAutocompletedValue(valueCleaned) }, 150)
  }

  const handleFocus = (ev: FocusEvent) => {
    ev.stopPropagation()
    showCalendar = true
  }

  const handleBlur = (ev: FocusEvent) => {
    ev.stopPropagation()
    if (avoidCloseOnBlur) {
      avoidCloseOnBlur = false
      return
    }
    showCalendar = false
    if (dateFocus !== 0) {
      const value = ((ev.target as HTMLInputElement).value || "").trim()
      const parsedDate = parseTypedDate(value, todayDate, timezoneOffsetSeconds)
      if (value.length === 10 && parsedDate.isCompleted && parsedDate.autoCompletedUnixDay) {
        changeFechaSelected(parsedDate.autoCompletedUnixDay)
        if (onChange) onChange()
      } else {
        (ev.target as HTMLInputElement).value = ""
        changeFechaSelected(0)
      }
      dateFocus = 0
    }
  }

  const openMobileLayer = () => {
    if (disabled) { return }

    const selectedMonthKey = dateSelected
      ? getMonthKey(dateFromUnixDay(dateSelected, timezoneOffsetSeconds))
      : monthSelected || currentMonthKey

    // Delegate the mobile picker to the shared top layer so it can escape clipped form containers.
    ui.state.mobileDateLayer = {
      selectedUnixDay: dateSelected || 0,
      focusedUnixDay: dateFocus || dateSelected || 0,
      selectedMonthKey,
      label: label || undefined,
      placeholder,
      onSelect: (unixDay) => {
        changeFechaSelected(unixDay)
        if (onChange) onChange()
      },
      onClose: () => {
        dateFocus = 0
      }
    }
  }

  // Effect to sync with external changes
  $effect(() => {
    if (saveOn && save) {
      const dateUnix = saveOn[save] as number
      if (dateUnix) {
        const value = formatUnixDay(dateUnix, timezoneOffsetSeconds)
        setAutocompletedValue(value)
        inputValue = value
        if (inputElement) inputElement.value = value
      } else {
        inputValue = ""
        if (inputElement) inputElement.value = ""
        monthSelected = currentMonthKey
      }
      dateSelected = dateUnix || 0
    }
  })

  $effect(() => {
    if (isMobile) {
      showCalendar = false
    }
  })

  // useInlineStyle drops the chrome so the parent (a table cell) keeps owning the visuals.
  const shellVariant = $derived(useInlineStyle ? "bare" : "field")

  // YYYY-MM-DD mirror of the selected day, exposed as data-value for the agent.
  const agentDataValue = $derived.by(() => {
    if (!dateSelected) { return "" }
    const d = dateFromUnixDay(dateSelected, timezoneOffsetSeconds)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })
  const agentDataLabel = $derived(label || placeholder || "")

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "DateInput",
      label: label || placeholder || "",
      setValue: (value: string | number) => {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          changeFechaSelected(value)
          if (onChange) onChange()
          return
        }
        let text = String(value || "")
        // Accept ISO YYYY-MM-DD symmetrically with data-value; parseTypedDate expects DD-MM-YYYY.
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (iso) text = `${iso[3]}-${iso[2]}-${iso[1]}`
        const parsed = parseTypedDate(text, todayDate, timezoneOffsetSeconds)
        if (parsed.isCompleted && parsed.autoCompletedUnixDay) {
          changeFechaSelected(parsed.autoCompletedUnixDay)
          if (onChange) onChange()
        } else if (text === "") {
          changeFechaSelected(0)
          if (onChange) onChange()
        }
      },
    })
  })

  // Shared close-on-mouseleave: keep open while the input still owns focus (user is typing); otherwise dismiss.
  const handleCalendarMouseLeave = (ev: MouseEvent) => {
    ev.stopPropagation()
    if (inputElement !== document.activeElement) {
      avoidCloseOnBlur = false
      showCalendar = false
      dateFocus = 0
    }
  }
</script>

{#snippet calendarInner()}
  <div class="flex justify-between items-center mb-[2px]">
    <button class="h2 bn-d1 flex items-center justify-center p-0 bg-transparent border-0"
      type="button"
      onmousedown={(ev) => { ev.stopPropagation(); avoidCloseOnBlur = true }}
      onclick={(ev) => { ev.stopPropagation(); changeMonth(-12) }}>«</button>
    <button class="h2 bn-d1 flex items-center justify-center p-0 bg-transparent border-0"
      type="button"
      onmousedown={(ev) => { ev.stopPropagation(); avoidCloseOnBlur = true }}
      onclick={(ev) => { ev.stopPropagation(); changeMonth(-1) }}>‹</button>
    <div class="bn-d2 flex items-center justify-center font-semibold">
      <div class="mr-[4px]">{monthName.name}</div>
      <div>{monthName.year}</div>
    </div>
    <button class="h2 bn-d1 flex items-center justify-center p-0 bg-transparent border-0"
      type="button"
      onmousedown={(ev) => { ev.stopPropagation(); avoidCloseOnBlur = true }}
      onclick={(ev) => { ev.stopPropagation(); changeMonth(1) }}>›</button>
    <button class="h2 bn-d1 flex items-center justify-center p-0 bg-transparent border-0"
      type="button"
      onmousedown={(ev) => { ev.stopPropagation(); avoidCloseOnBlur = true }}
      onclick={(ev) => { ev.stopPropagation(); changeMonth(12) }}>»</button>
  </div>
  <div class="flex">
    <div class="dp-week base text-[13px] ff-bold c-purple"></div>
    {#each weekDaysNames as dayName}
      <div class="dp-col text-center flex items-center justify-center text-[13px] ff-bold">{dayName.name}</div>
    {/each}
  </div>
  {#each semanasDias as week}
    <div class="flex">
      <div class="dp-week text-[13px] ff-bold text-center flex items-center justify-center c-purple">{week.week}</div>
      {#each week.weekDays as day}
        {@const isOutMonth = day.monthKey !== monthSelected}
        {@const isSelected = day.unixDay === dateSelected}
        {@const isFocused = day.unixDay === dateFocus}
        {@const isToday = dateTodayUnix === day.unixDay}
        <button
          class="relative dp-day text-[14px] text-center flex items-center justify-center p-0 bg-transparent border-0 {isOutMonth ? 'is-out' : ''} {isSelected ? 'selected' : ''} {isFocused ? 'focused' : ''}"
          type="button"
          onclick={(ev) => {
            ev.stopPropagation()
            changeFechaSelected(day.unixDay)
            showCalendar = false
            dateFocus = 0
            avoidCloseOnBlur = false
            if (onChange) onChange()
          }}
          onmousedown={(ev) => { avoidCloseOnBlur = true; ev.stopPropagation() }}
        >
          {day.day}
          {#if isToday}
            <div class="ln-today"></div>
          {/if}
        </button>
      {/each}
    </div>
  {/each}
{/snippet}

{#snippet calendarBlock()}
  {#if showCalendar && !isMobile}
    {#if usePopover}
      <!-- Portal-rendered: positioning handled by Popover; .in-popover strips the inline-mode absolute positioning. -->
      <Popover referenceElement={inputElement ?? null} open={showCalendar} placement="bottom-start" offset={4}>
        <div class="date-picker-c in-popover" role="presentation" onmouseleave={handleCalendarMouseLeave}>
          {@render calendarInner()}
        </div>
      </Popover>
    {:else}
      <div class="date-picker-c" role="presentation" onmouseleave={handleCalendarMouseLeave}>
        {@render calendarInner()}
      </div>
    {/if}
  {/if}
{/snippet}

<!-- One shell call for every mode. The labelled and bare variants used to be two
     near-identical 45-line branches; the only real difference was the chrome, which
     FieldShell now owns. -->
<FieldShell
  {label} {disabled} {css}
  variant={shellVariant}
  overlay={calendarBlock}
  data-id="DateInput:{componentID}"
  data-value={agentDataValue}
  data-label={agentDataLabel}
  data-type="other"
>
  {#snippet children({ controlId, controlClass })}
    {#if !isMobile}
      <input
        id={controlId}
        bind:this={inputElement}
        type="text"
        class={`${controlClass} ff-mono${inputCss ? " " + inputCss : ""}`}
        value={inputValue}
        placeholder={ui.translate(placeholder)}
        disabled={disabled}
        onfocus={handleFocus}
        onblur={handleBlur}
        onkeydown={handleKeyDown}
        onkeyup={handleKeyUp}
      />
    {:else}
      <!-- Mobile opens a Layer picker instead of typing, so the control is a button. -->
      <div
        id={controlId}
        class={`${controlClass} flex items-center ff-mono ${inputCss || ""} ${disabled ? "opacity-60" : ""}`}
        role="button"
        tabindex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onclick={(ev) => {
          ev.stopPropagation()
          openMobileLayer()
        }}
        onkeydown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            openMobileLayer()
          }
        }}
      >
        <div class={`w-full ${inputValue ? "" : "_mobile-placeholder"}`}>
          {inputValue || ui.translate(placeholder)}
        </div>
      </div>
    {/if}
  {/snippet}
</FieldShell>

<style>
  /* The calendar anchors against FieldShell's root, which is already positioned; and the
     bare variant's chrome-stripping now lives in field-shell.module.css. */
  ._mobile-placeholder {
    color: #6d5dad;
  }

  .date-picker-c {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid #c1c5dc;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 280px;
  }

  /* In popover mode the Popover wrapper handles absolute positioning; reset our inline-mode offsets. */
  .date-picker-c.in-popover {
    position: static;
    top: auto;
    left: auto;
    margin-top: 0;
  }

  .dp-week {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .dp-col {
    width: 32px;
    height: 28px;
    flex-shrink: 0;
  }

  .dp-day {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .dp-day:hover {
    background-color: #f0f0f5;
  }

  .dp-day.is-out {
    color: #b0b0c0;
  }

  .dp-day.selected {
    background-color: #6d5dad;
    color: white;
    font-weight: 600;
  }

  .dp-day.focused {
    background-color: #e8e7f5;
    outline: 2px solid #9794d6;
  }

  .ln-today {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background-color: #6d5dad;
    border-radius: 50%;
  }

  .dp-day.selected .ln-today {
    background-color: white;
  }

  .bn-d1, .bn-d2 {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    user-select: none;
  }

  .bn-d1:hover, .bn-d2:hover {
    background-color: #f0f0f5;
  }

  .bn-d2 {
    color: #6d5dad;
  }
</style>
