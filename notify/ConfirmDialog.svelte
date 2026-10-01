<script lang="ts">
  import { fade } from 'svelte/transition';
  import { useUI } from '../runtime/index.js';
  import { answerConfirm, notifyState } from './notify.svelte.js';

  const ui = useUI();

  // Escape cancels. Enter activates the focused button, which starts on Cancel so a stray
  // keypress never confirms a destructive action.
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (!notifyState.confirm || event.key !== 'Escape') { return; }
    event.preventDefault();
    answerConfirm(false);
  };
</script>

<svelte:window onkeydown={cancelOnEscape} />

<!-- Above Modals: a confirm is usually opened from a Modal's delete button. -->
{#if notifyState.confirm}
  {@const pendingConfirm = notifyState.confirm}
  <div class="fixed inset-0 flex items-center justify-center bg-black/40 p-16"
    style="z-index: var(--confirm-zindex, 410)" transition:fade={{ duration: 120 }}>
    <div class="w-full max-w-[380px] rounded-lg bg-white px-20 py-20 text-center shadow-2xl"
      role="alertdialog" aria-modal="true" aria-labelledby="notify-confirm-title">
      <div id="notify-confirm-title" class="text-[18px] ff-bold text-red-600">{ui.translate(pendingConfirm.title)}</div>
      <div class="mt-8 text-[15px] leading-[1.4] text-gray-800 break-words">{ui.translate(pendingConfirm.message)}</div>
      <div class="mt-20 flex gap-10">
        <button type="button" class="h-40 flex-1 rounded-md bg-red-500 text-white ff-semibold cursor-pointer transition-colors hover:bg-red-600"
          onclick={() => answerConfirm(true)}>
          {ui.translate(pendingConfirm.okLabel)}
        </button>
        <button type="button" class="h-40 flex-1 rounded-md bg-gray-100 text-gray-800 ff-semibold cursor-pointer transition-colors hover:bg-gray-200"
          onclick={() => answerConfirm(false)} {@attach (cancelButton) => cancelButton.focus()}>
          {ui.translate(pendingConfirm.cancelLabel)}
        </button>
      </div>
    </div>
  </div>
{/if}
