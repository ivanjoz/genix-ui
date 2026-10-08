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
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  };
</script>

<span class={ifcss(css, `inline-flex shrink-0 items-center rounded-[4px] border px-6 h-22 text-[14px] leading-none whitespace-nowrap ${colorCssByName[color]}`)}>
  {ui.translate(text)}
</span>
