<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  // Reusable filter text input with leading icon and per-instance debounce.
  // Chrome comes from FieldShell's `pill` variant: the same white fill, hairline and
  // purple focus ring as a labelled field, only rounder and without a label.
  import { Agent } from '../agent/registry'
  import FieldShell from './FieldShell.svelte'

  let {
    css = '',
    placeholder = '',
    throttle: throttleMs = 150,
    icon = 'icon-[fa--filter]',
    label = '',
    value = $bindable(''),
  }: {
    css?: string
    placeholder?: string
    throttle?: number
    icon?: string
    /** Accessible name only — this control never draws a visible label. */
    label?: string
    value?: string
  } = $props()

  // Local timer so multiple instances don't collide on a shared throttle
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  // Mirrors what the user sees in the box; lets the agent write into it.
  let inputValue = $state(value)

  // Normalise the way the consumer expects: lowercase + trim.
  const commitValue = (raw: string) => {
    value = raw.toLowerCase().trim()
  }

  const handleKeyUp = (ev: KeyboardEvent) => {
    ev.stopPropagation()
    const raw = (ev.target as HTMLInputElement).value || ''
    inputValue = raw
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => commitValue(raw), throttleMs)
  }

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: 'FilterInput',
      label: label || placeholder || '',
      // Agent path bypasses the debounce — there's no keystroke stream to coalesce.
      setValue: (next: string | number) => {
        const raw = String(next ?? '')
        inputValue = raw
        if (debounceTimer) clearTimeout(debounceTimer)
        commitValue(raw)
      },
    })
  })
</script>

{#snippet filterIcon()}
  <i class={`${icon} block leading-none`}></i>
{/snippet}

<!-- `label` is deliberately NOT passed to the shell: it is an accessible name, not a
     visible one, and forwarding it would grow a notch label on every filter toolbar. -->
<FieldShell
  {css}
  variant="pill"
  prefix={filterIcon}
  data-id="FilterInput:{componentID}"
  data-value={inputValue}
  data-label={label || placeholder || ''}
  data-type="text"
>
  {#snippet children({ controlId, controlClass })}
    <input
      id={controlId}
      class="{controlClass} text-sm leading-none placeholder:text-sm"
      autocomplete="off"
      type="text"
      aria-label={ui.translate(label || placeholder || undefined)}
      placeholder={ui.translate(placeholder)}
      bind:value={inputValue}
      onkeyup={handleKeyUp}
    />
  {/snippet}
</FieldShell>
