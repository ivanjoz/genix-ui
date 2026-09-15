<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useUI } from '../runtime/index.js';
  import ChatMessage from './ChatMessage.svelte';
  import ToolActivity from './ToolActivity.svelte';
  import type { ChatItem } from './chat.types';

  const ui = useUI();

  interface Props {
    items: ChatItem[];
    /** Texto (`"EN|ES"`) cuando el hilo está vacío. */
    emptyMessage?: string;
    /** Render enriquecido de los mensajes completos del asistente. */
    messageContent?: Snippet<[string]>;
    css?: string;
  }

  let { items, emptyMessage = '', messageContent, css = '' }: Props = $props();

  let container = $state<HTMLDivElement>();
  // Solo auto-scrollea si el usuario está pegado abajo: si subió a releer algo,
  // un mensaje nuevo no debe arrastrarlo.
  let stick = $state(true);

  const onScroll = () => {
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    stick = distance < 60;
  };

  // Seguir el crecimiento del último mensaje, no solo la llegada de items
  // nuevos: si no, el texto en streaming se sale por abajo.
  const tail = $derived.by(() => {
    const last = items[items.length - 1];
    if (!last) return '';
    return last.kind === 'message' ? String(last.text.length) : last.state;
  });

  $effect(() => {
    void items.length;
    void tail;
    if (stick && container) container.scrollTop = container.scrollHeight;
  });
</script>

<div class={'chat-thread ' + css} bind:this={container} onscroll={onScroll}>
  {#if items.length === 0 && emptyMessage}
    <div class="chat-empty">{ui.translate(emptyMessage)}</div>
  {/if}
  {#each items as item (item.id)}
    {#if item.kind === 'message'}
      <ChatMessage
        role={item.role}
        text={item.text}
        streaming={item.streaming}
        content={messageContent}
      />
    {:else}
      <ToolActivity tool={item.tool} label={item.label} state={item.state} detail={item.detail} />
    {/if}
  {/each}
</div>

<style>
  .chat-thread {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    overflow-y: auto;
    padding: 12px;
    scroll-behavior: smooth;
  }

  .chat-empty {
    margin: auto;
    color: #7b7a85;
    font-size: 14px;
    text-align: center;
    max-width: 460px;
    line-height: 1.5;
  }
</style>
