<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  const ui = useUI();

  type InlineButtonMode = 'default' | 'checked';
  type InlineButtonColor = 'blue' | 'green';

  let {
    label,
    mode = 'default',
    color = 'green',
    css = '',
  }: {
    label: string;
    mode?: InlineButtonMode;
    color?: InlineButtonColor;
    css?: string;
  } = $props();

  const baseCss = 'inline-flex h-22 min-w-28 items-center justify-center rounded-[3px] border text-10 ff-bold';
  const colorCssByName: Record<InlineButtonColor, Record<InlineButtonMode, string>> = {
    blue: {
      default: 'border-red-border bg-red-bg-strong text-red-fg',
      // Keep the extra padding only in checked mode so the corner icon never overlaps the label.
      checked: 'relative border-blue-border bg-blue-bg-strong text-blue-fg pb-2 pr-5',
    },
    green: {
      default: 'border-red-border bg-red-bg-strong text-red-fg',
      checked: 'relative border-green-border bg-green-bg-strong text-green-fg pb-2 pr-5',
    },
  };
</script>

<span class={ifcss(css, `${baseCss} ${colorCssByName[color][mode]}`)}>
  {ui.translate(label)}
  {#if mode === 'checked'}
    <i class="icon-[fa--check] absolute -bottom-6 -right-6 text-12 leading-none"></i>
  {/if}
</span>
