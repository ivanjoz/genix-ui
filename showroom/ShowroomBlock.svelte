<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ifcss } from '../utilities/css.js';

  // Titled wrapper for one component demo. Intentionally transparent — a white card
  // would hide the page surface and defeat the white/gray toggle. The dashed border
  // is the only chrome, so every demo sits directly on the surface under test.
  let { name, note, css = '', children }: {
    name: string;
    note?: string;
    css?: string;
    children: Snippet;
  } = $props();
</script>

<div class={ifcss(css, "border border-dashed border-line-strong rounded-md p-12 mb-12")}>
  <div class="flex flex-wrap items-baseline gap-8 mb-10">
    <span class="text-sm font-semibold text-fg-soft">{name}</span>
    {#if note}<span class="text-xs text-fg-muted">{note}</span>{/if}
  </div>
  {@render children()}
</div>
