<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '../buttons/Button.svelte';

  // A boxed group whose header row collapses its body: chevron, `header` (title, counters) and
  // `actions` pushed to the right. `collapsed` is bindable so the consumer can remember it.
  let {
    collapsed = $bindable(false),
    onToggle,
    header,
    actions,
    children,
    css = '',
    headerCss = '',
  }: {
    collapsed?: boolean;
    onToggle?: (isCollapsed: boolean) => void;
    header: Snippet;
    actions?: Snippet;
    children: Snippet;
    css?: string;
    headerCss?: string;
  } = $props();

  const toggleCollapsed = () => {
    collapsed = !collapsed;
    onToggle?.(collapsed);
  };
</script>

<section class="rounded-lg bg-surface border border-line overflow-hidden {css}">
  <div class="flex items-center gap-8 px-10 py-6 bg-surface-soft {collapsed ? '' : 'border-b border-line'} {headerCss}">
    <!-- Fixed width: both chevrons occupy the same slot so the titles of stacked sections stay aligned. -->
    <Button icon={collapsed ? 'icon-[mdi--chevron-right] w-26 h-26' : 'icon-[mdi--chevron-down] w-26 h-26'}
      css="flex items-center justify-center w-30 h-30 shrink-0 rounded-full hover:bg-red-bg hover:text-red-fg"
      label={collapsed ? 'Expand the group|Expandir el grupo' : 'Collapse the group|Contraer el grupo'} onClick={toggleCollapsed} />
    {@render header()}
    {#if actions}
      <div class="flex items-center gap-8 ml-auto">{@render actions()}</div>
    {/if}
  </div>
  {#if !collapsed}
    {@render children()}
  {/if}
</section>
