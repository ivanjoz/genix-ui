<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import { Agent } from '../agent/registry';
  import T from '../misc/T.svelte';

  type ButtonColor = 'blue' | 'green' | 'red' | 'orange' | 'yellow' | 'purple';

  interface Props {
    icon?: string;
    /** Icon rendered after the label (chevrons, external-link marks, counters). */
    iconRight?: string;
    onClick?: (ev: MouseEvent) => void;
    name?: string;
    label?: string;
    color?: ButtonColor;
    useCircle?: boolean;
    hideNameOnMobile?: boolean;
    css?: string;
    disabled?: boolean;
    // Semantic role for the agent (e.g. "save" | "delete" | "close" | custom).
    role?: string;
  }

  let {
    icon,
    iconRight,
    onClick,
    name,
    label,
    color,
    useCircle = false,
    hideNameOnMobile = false,
    css = '',
    disabled = false,
    role,
  }: Props = $props();

  // Single source for the click action so the Agent and the DOM trigger the same handler.
  const triggerClick = (ev?: MouseEvent) => {
    if (ev) ev.stopPropagation();
    onClick?.(ev as MouseEvent);
  };

  const componentID = ui.nextComponentId();

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: 'Button',
      label: label || name || '',
      click: () => { triggerClick(); },
    });
  });
</script>

<button
  data-id="Button:{componentID}"
  aria-label={ui.translate(label)}
  data-value={role}
  class={`${color ? `bx-${color}` : ''}${useCircle ? ' round' : ''} ${css}`.trim()}
  {disabled}
  onclick={triggerClick}
>
  {#if icon}<i class="{icon}{name ? ' icon-lead' : ''}"></i>{/if}
  {#if name}<span class={hideNameOnMobile ? 'hidden md:block' : ''}><T text={name} /></span>{/if}
  {#if iconRight}<i class="{iconRight}{name ? ' icon-trail' : ''}"></i>{/if}
</button>

<style>
  /* Separate the icons from the label. The margin is conditional on a label existing,
     so icon-only and round buttons keep their exact centered geometry. */
  .icon-lead { margin-right: 5px; }
  .icon-trail { margin-left: 5px; }
</style>
