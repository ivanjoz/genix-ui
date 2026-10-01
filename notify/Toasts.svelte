<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import { TOAST_DURATION_MS, type ToastType } from './notify.js';
  import { dismissToast, notifyState } from './notify.svelte.js';

  const ui = useUI();

  // Notiflix's palette: a solid color per type with white text and icon. Success is darker
  // than Notiflix's #32c682 (2.2:1 against white) for ~3.5:1 contrast. Literal class strings so
  // Tailwind's scanner sees every color. Warning keeps Notiflix's yellow (1.7:1 against white)
  // and gets its contrast from a dark shadow instead: text-shadow for the message, and a
  // drop-shadow filter for the icon, which is a CSS mask and ignores text-shadow.
  const TOAST_STYLES: Record<ToastType, { background: string; icon: string; textShadow: string; iconShadow: string }> = {
    success: { background: 'bg-[#1f9d63]', icon: 'icon-[fa--check-circle]', textShadow: '', iconShadow: '' },
    failure: { background: 'bg-[#ff5549]', icon: 'icon-[fa--times-circle]', textShadow: '', iconShadow: '' },
    warning: {
      background: 'bg-[#eebf31]', icon: 'icon-[fa--exclamation-circle]',
      textShadow: '[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
      iconShadow: 'drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.4)]',
    },
    info: { background: 'bg-[#26c0d3]', icon: 'icon-[fa--info-circle]', textShadow: '', iconShadow: '' },
  };
</script>

<!-- Bottom-right stack, newest at the bottom; full width on mobile. Above the loading overlay
     so an error raised while loading is still visible. -->
<div class="fixed bottom-12 left-12 right-12 md:left-auto md:w-320 flex flex-col gap-8 pointer-events-none"
  style="z-index: var(--toast-zindex, 420)" aria-live="polite">
  {#each notifyState.toasts as toast (toast.id)}
    <button type="button"
      class="notify-toast pointer-events-auto relative flex min-h-56 items-center gap-12 overflow-hidden rounded-md py-10 pl-12 pr-14 text-left text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] cursor-pointer transition-[filter] hover:brightness-95 {TOAST_STYLES[toast.type].background}"
      onclick={() => dismissToast(toast.id)}>
      <i class="shrink-0 text-[30px] {TOAST_STYLES[toast.type].icon} {TOAST_STYLES[toast.type].iconShadow}"></i>
      <span class="min-w-0 text-[14px] leading-[1.35] break-words {TOAST_STYLES[toast.type].textShadow}">{ui.translate(toast.message)}</span>
      <!-- The countdown is a CSS animation: hovering pauses it, and its end dismisses the toast. -->
      <span class="notify-toast-timer absolute bottom-0 left-0 h-3 w-full bg-white/35"
        style="animation-duration: {TOAST_DURATION_MS[toast.type]}ms"
        onanimationend={() => dismissToast(toast.id)}></span>
    </button>
  {/each}
</div>

<style>
  .notify-toast {
    animation: notify-toast-in 220ms ease-out;
  }
  .notify-toast-timer {
    transform-origin: left;
    animation-name: notify-toast-timer;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  .notify-toast:hover .notify-toast-timer {
    animation-play-state: paused;
  }
  @keyframes notify-toast-in {
    from { opacity: 0; transform: translateX(24px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes notify-toast-timer {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }
</style>
