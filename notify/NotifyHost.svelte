<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import Toasts from './Toasts.svelte';
</script>

<!-- Mount once in the host's root layout, inside the UI runtime context (provideUi). -->
<LoadingOverlay />
<ConfirmDialog />
<Toasts />
