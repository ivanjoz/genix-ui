<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import type { Snippet } from 'svelte';
  import { Agent } from '../agent/registry';

  interface Props {
    id?: number;
    onClick?: (ev: MouseEvent) => void;
    label?: string;
    css?: string;
    children?: Snippet;
  }

  const { id, onClick, label, css = '', children }: Props = $props();

  const triggerClick = (ev?: MouseEvent) => {
    onClick?.(ev as MouseEvent);
  };

  const fallbackID = ui.nextComponentId();
  const componentID = $derived(id ?? fallbackID);

  $effect(() => {
    if (!onClick) { return; }
    return Agent.register({
      id: componentID,
      type: 'Card',
      label: label || '',
      click: () => { triggerClick(); },
    });
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  data-id="Card:{componentID}"
  aria-label={ui.translate(label)}
  class={css}
  onclick={onClick ? triggerClick : undefined}
  onkeydown={onClick ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') triggerClick(); } : undefined}
  role={onClick ? 'button' : undefined}
  tabindex={onClick ? 0 : undefined}
>
  {@render children?.()}
</div>
