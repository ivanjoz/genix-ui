<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  const ui = useUI();

  type LabelColor = 'blue' | 'green' | 'red' | 'orange' | 'yellow' | 'purple' | 'gray';

  let {
    text,
    color = 'gray',
    css = '',
  }: {
    text: string;
    color?: LabelColor;
    css?: string;
  } = $props();

  const colorCssByName: Record<LabelColor, string> = {
    blue: 'border-blue-border bg-blue-bg text-blue-fg',
    green: 'border-green-border bg-green-bg text-green-fg',
    red: 'border-red-border bg-red-bg text-red-fg',
    orange: 'border-orange-border bg-orange-bg text-orange-fg',
    yellow: 'border-yellow-border bg-yellow-bg text-yellow-fg',
    purple: 'border-purple-border bg-purple-bg text-purple-fg',
    gray: 'border-line bg-surface-soft text-fg-muted',
  };
</script>

<span class={ifcss(css, `inline-flex shrink-0 items-center rounded-[4px] border px-6 h-22 text-[14px] leading-none whitespace-nowrap ${colorCssByName[color]}`)}>
  {ui.translate(text)}
</span>
