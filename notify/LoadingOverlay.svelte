<script lang="ts">
  import { fade } from 'svelte/transition';
  import { useUI } from '../runtime/index.js';
  import { notifyState } from './notify.svelte.js';

  const ui = useUI();
</script>

<!-- Full-screen blocking overlay, above Modals (--modal-zindex) and below confirm / toasts. -->
{#if notifyState.loading}
  <div class="fixed inset-0 flex flex-col items-center justify-center gap-14 bg-overlay px-24 backdrop-blur-[2px]"
    style="z-index: var(--loading-zindex, 400)" role="status" aria-live="polite"
    transition:fade={{ duration: 120 }}>
    <span class="h-48 w-48 rounded-full border-4 border-on-solid/25 border-t-on-solid animate-spin"></span>
    {#if notifyState.loading.message}
      <div class="max-w-[480px] text-center text-[16px] ff-semibold text-on-solid">
        {ui.translate(notifyState.loading.message)}
      </div>
    {/if}
    {#if notifyState.loading.detail}
      <div class="text-center text-[14px] text-on-solid/80">{ui.translate(notifyState.loading.detail)}</div>
    {/if}
  </div>
{/if}
