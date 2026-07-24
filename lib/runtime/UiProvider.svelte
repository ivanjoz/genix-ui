<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setUiRuntime } from './context.js';
  import type { UiRuntime } from './types.js';

  const props: {
    runtime: UiRuntime;
    children: Snippet;
  } = $props();

  // Context is established during component initialization for this exact render tree.
  setUiRuntime(props.runtime);
</script>

{@render props.children()}
