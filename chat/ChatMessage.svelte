<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChatAttachments from './ChatAttachments.svelte';
  import type { ChatAttachmentRef, ChatRole } from './chat.types';

  interface Props {
    role: ChatRole;
    text: string;
    /** Archivos que se mandaron con el mensaje, encima del texto. */
    attachments?: ChatAttachmentRef[];
    /** Mientras llega texto se muestra plano: re-parsear en cada delta es
        cuadrático y además parpadea con la sintaxis a medio cerrar. */
    streaming?: boolean;
    /**
     * Render enriquecido del mensaje completo (Markdown, resaltado, lo que el
     * host quiera). Sin él se muestra texto plano: el paquete no trae parsers
     * ni dependencias externas para esto.
     */
    content?: Snippet<[string]>;
    css?: string;
  }

  let {
    role,
    text,
    attachments = [],
    streaming = false,
    content,
    css = '',
  }: Props = $props();
  const rich = $derived(Boolean(content) && !streaming && role === 'assistant');
</script>

<div class={'chat-msg chat-msg-' + role + ' ' + css} data-role={role}>
  {#if attachments.length}
    <div class="chat-msg-files" class:chat-msg-files-alone={!text}>
      <ChatAttachments files={attachments} />
    </div>
  {/if}
  {#if rich}
    {@render content?.(text)}
  {:else if text}
    <div class="chat-plain">{text}</div>
  {/if}
  {#if streaming}<span class="chat-caret"></span>{/if}
</div>

<style>
  .chat-msg {
    border-radius: 10px;
    padding: 9px 13px;
    font-size: 15px;
    max-width: 100%;
  }

  .chat-msg-user {
    background: var(--secondary, #eeefff);
    border: 1px solid var(--gray-purple-2, #c3c5df);
    align-self: flex-end;
    max-width: 80%;
  }

  .chat-msg-assistant {
    background: var(--white, #ffffff);
    border: 1px solid #e2e5ef;
  }

  .chat-msg-files {
    margin-bottom: 7px;
  }

  /* Un mensaje que es solo el archivo: sin texto debajo no hay nada que separar. */
  .chat-msg-files-alone {
    margin-bottom: 0;
  }

  .chat-plain {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }

  .chat-caret {
    display: inline-block;
    width: 7px;
    height: 14px;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: var(--primary, #4042a3);
    animation: chat-blink 1s steps(2, start) infinite;
  }

  @keyframes chat-blink {
    to { visibility: hidden; }
  }
</style>
