<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  const ui = useUI();

  // A status tag whose colors belong to the consumer: each module keeps its own palette of
  // states ("bg-green-bg-strong text-green-fg") and passes it through `css`. For the package's
  // named colors use `Label` instead.
  let {
    text,
    css = 'bg-surface-muted text-fg-soft',
    size = 'default',
    pill = false,
    icon = '',
  }: {
    // Translatable "English|Spanish". Optional: a lookup of an unknown state renders an empty badge.
    text?: string;
    css?: string;
    // small: px-6 py-1, for dense rows and cards.
    size?: 'default' | 'small';
    pill?: boolean;
    icon?: string;
  } = $props();
</script>

<span class={ifcss(css, `inline-flex shrink-0 items-center gap-4 whitespace-nowrap text-[14px] leading-tight
  ${size === 'small' ? 'px-6 py-1' : 'px-8 py-2'} ${pill ? 'rounded-full' : 'rounded'}`)}>
  {#if icon}<i class={icon}></i>{/if}
  {ui.translate(text || '')}
</span>
