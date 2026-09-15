<script lang="ts">
  import type { ChatActivityState } from './chat.types';

  interface Props {
    tool: string;
    label?: string;
    state?: ChatActivityState;
    /** Motivo del fallo; se muestra bajo el chip cuando `state` es `error`. */
    detail?: string;
    css?: string;
  }

  let { tool, label = '', state = 'running', detail, css = '' }: Props = $props();

  const icons: Record<ChatActivityState, string> = {
    running: 'icon-[fa--circle-o-notch]',
    ok: 'icon-[fa--check]',
    error: 'icon-[fa--ban]',
  };
</script>

<div class={'chat-act chat-act-' + state + ' ' + css} data-value={tool}>
  <span class="chat-act-dot">
    <i class={icons[state] + (state === 'running' ? ' spin' : '')}></i>
  </span>
  <span class="chat-act-text">
    <span class="chat-act-tool">{tool}</span>
    {#if label}<span class="chat-act-label" title={label}>{label}</span>{/if}
  </span>
</div>
{#if detail && state === 'error'}
  <div class="chat-act-detail">{detail}</div>
{/if}

<style>
  .chat-act {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 1px 2px;
    font-size: 13px;
    color: #55535e;
  }

  /*
   * Dos ejes distintos: el círculo se centra contra la caja de texto completa,
   * y dentro de ella el nombre de la herramienta y la ruta —que van a tamaños
   * distintos— se alinean por su línea base.
   */
  .chat-act-text {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    line-height: 18px;
  }

  /* El estado va solo en el círculo del icono: el texto queda plano. */
  .chat-act-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #9b9aa4;
    color: #fff;
    font-size: 9px;
  }

  .chat-act-ok .chat-act-dot { background: #2f9e5f; }
  .chat-act-error .chat-act-dot { background: #c0453f; }
  .chat-act-error { color: #8c3a3a; }

  .chat-act-tool { font-family: semibold, inherit; flex: none; }

  .chat-act-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
  }

  .chat-act-detail {
    font-size: 12.5px;
    color: #8c3a3a;
    padding: 2px 4px 0 26px;
    line-height: 1.4;
  }

  .spin { animation: chat-spin 1.1s linear infinite; }

  @keyframes chat-spin {
    to { transform: rotate(360deg); }
  }
</style>
