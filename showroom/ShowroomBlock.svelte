<script lang="ts">
  import type { Snippet } from 'svelte';

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

<div class="border border-dashed border-gray-300 rounded-md p-12 mb-12 {css}">
  <div class="flex flex-wrap items-baseline gap-8 mb-10">
    <span class="text-sm font-semibold text-gray-700">{name}</span>
    {#if note}<span class="text-xs text-gray-500">{note}</span>{/if}
  </div>
  {@render children()}
</div>
