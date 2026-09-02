<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  const ui = useUI();

  interface InfoProps {
    text?: string;
    color?: 'yellow' | 'green';
    css?: string;
    children?: Snippet;
  }

  let { text, color = 'yellow', css = '', children }: InfoProps = $props();

  const infoPalettes = {
    yellow: { background: '#fdf6e3', line: '#e5a000', text: '#6f5d23' },
    green: { background: '#e9f7ee', line: '#119c50', text: '#1d5c37' },
  };

  const palette = $derived(infoPalettes[color] || infoPalettes.yellow);
</script>

<div class={'info-box text-[14px] ' + css}
  style:background-color={palette.background}
  style:border-left-color={palette.line}
  style:color={palette.text}
>
  {#if text}{ui.translate(text)}{/if}{@render children?.()}
</div>

<style>
  .info-box {
    border-left: 3px solid;
    border-radius: 0 3px 3px 0;
    padding: 5px 9px;
    line-height: 1.35;
  }
</style>
