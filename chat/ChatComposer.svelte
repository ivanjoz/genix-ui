<script lang="ts">
  import { Agent } from '../agent/registry';
  import Button from '../buttons/Button.svelte';
  import { useUI } from '../runtime/index.js';

  const ui = useUI();

  interface Props {
    value?: string;
    /** `"EN|ES"` */
    placeholder?: string;
    disabled?: boolean;
    /** Hay un turno en curso: el botón pasa a «detener». */
    running?: boolean;
    /** Alto de partida, en líneas. No baja de aquí al borrar el texto. */
    minRows?: number;
    maxRows?: number;
    onSend?: (text: string) => void;
    onStop?: () => void;
    css?: string;
  }

  let {
    value = $bindable(''),
    placeholder = 'Write a message|Escribe un mensaje',
    disabled = false,
    running = false,
    minRows = 1,
    maxRows = 10,
    onSend,
    onStop,
    css = '',
  }: Props = $props();

  let textarea = $state<HTMLTextAreaElement>();

  const send = () => {
    const text = value.trim();
    if (!text || disabled || running) return;
    value = '';
    resize();
    onSend?.(text);
  };

  // Alto automático entre `minRows` y `maxRows`; pasado el máximo, scroll interno.
  const LINE_HEIGHT = 21;
  const PADDING = 18;

  const resize = () => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const floor = minRows * LINE_HEIGHT + PADDING;
    const ceiling = maxRows * LINE_HEIGHT + PADDING;
    textarea.style.height =
      Math.max(floor, Math.min(textarea.scrollHeight, ceiling)) + 'px';
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const componentID = ui.nextComponentId();

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: 'ChatComposer',
      label: ui.translate(placeholder),
      setValue: (next) => {
        value = String(next);
      },
      click: () => send(),
    });
  });
</script>

<div class={'chat-composer ' + css} data-id="ChatComposer:{componentID}" data-value={value}>
  <textarea
    bind:this={textarea}
    bind:value
    rows={minRows}
    {disabled}
    placeholder={ui.translate(placeholder)}
    oninput={resize}
    onkeydown={onKeydown}
  ></textarea>

  {#if running}
    <Button icon="icon-[fa--stop]" color="red" label="Stop|Detener" onClick={() => onStop?.()} />
  {:else}
    <Button
      icon="icon-[fa--paper-plane]"
      color="blue"
      label="Send|Enviar"
      disabled={disabled || !value.trim()}
      onClick={send}
    />
  {/if}
</div>

<style>
  .chat-composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid #dfe2ec;
    background: var(--white, #ffffff);
  }

  textarea {
    flex: 1;
    resize: none;
    border: 1px solid var(--input-border-color, #d0d4e7);
    border-radius: 8px;
    padding: 9px 11px;
    font-family: inherit;
    font-size: 15px;
    line-height: 21px;
    max-height: 240px;
    outline: none;
  }

  textarea:focus {
    border-color: var(--primary, #4042a3);
  }
</style>
