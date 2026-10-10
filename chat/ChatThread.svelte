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

  // Virtualizado: solo existen en el DOM los items cerca de la vista. Los demás
  // se reemplazan por dos espaciadores con la altura que ocuparían, así un hilo
  // largo no acumula nodos (Markdown, tablas, código) ni hace pesado el scroll.
  // Altura supuesta de un item que todavía no se midió.
  const ESTIMATED_ITEM_HEIGHT = 120;
  // Píxeles renderizados por encima y por debajo de la vista.
  const OVERSCAN_PX = 900;

  let container = $state<HTMLDivElement>();
  let viewportHeight = $state(0);
  let scrollTop = $state(0);
  // Solo auto-scrollea si el usuario está pegado abajo: si subió a releer algo,
  // un mensaje nuevo no debe arrastrarlo.
  let stick = $state(true);

  // Alturas medidas por id: sobreviven a que el item salga del DOM.
  const heightsByID = new Map<string, number>();
  let measuredVersion = $state(0);

  // itemOffsets[i] = dónde empieza el item i; itemOffsets[n] = alto total.
  const itemOffsets = $derived.by(() => {
    void measuredVersion;
    const offsets = new Array<number>(items.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < items.length; i++) {
      offsets[i + 1] = offsets[i] + (heightsByID.get(items[i].id) ?? ESTIMATED_ITEM_HEIGHT);
    }
    return offsets;
  });

  const renderRange = $derived.by(() => {
    const totalHeight = itemOffsets[items.length];
    // Pegado abajo, la ventana se calcula desde el final: al abrir un hilo largo
    // se pintan directamente los últimos mensajes, no los primeros.
    const viewTop = stick ? Math.max(0, totalHeight - viewportHeight) : scrollTop;
    const fromPx = viewTop - OVERSCAN_PX;
    const toPx = viewTop + viewportHeight + OVERSCAN_PX;
    let start = 0;
    while (start < items.length && itemOffsets[start + 1] < fromPx) start++;
    let end = start;
    while (end < items.length && itemOffsets[end] <= toPx) end++;
    return { start, end };
  });

  const renderedItems = $derived(items.slice(renderRange.start, renderRange.end));
  const topSpacerHeight = $derived(itemOffsets[renderRange.start]);
  const bottomSpacerHeight = $derived(itemOffsets[items.length] - itemOffsets[renderRange.end]);

  const onScroll = () => {
    if (!container) return;
    scrollTop = container.scrollTop;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    stick = distance < 60;
  };

  const elementToItemID = new WeakMap<Element, string>();

  const recordItemHeight = (element: HTMLElement) => {
    const itemID = elementToItemID.get(element);
    if (itemID === undefined || !container) return;
    const measured = element.getBoundingClientRect().height;
    if (measured <= 0) return;
    const previous = heightsByID.get(itemID) ?? ESTIMATED_ITEM_HEIGHT;
    const delta = measured - previous;
    if (heightsByID.has(itemID) && Math.abs(delta) < 0.5) return;
    heightsByID.set(itemID, measured);
    measuredVersion++;
    // Anclaje: un item que estaba entero por encima de la vista cambió de alto
    // (típico al montarse con su altura real en vez de la supuesta). Se corre el
    // scroll lo mismo para que lo que el usuario está leyendo no salte.
    if (!stick && element.getBoundingClientRect().bottom - delta <= container.getBoundingClientRect().top) {
      container.scrollTop += delta;
      scrollTop = container.scrollTop;
    }
  };

  const itemResizeObserver = typeof ResizeObserver === 'undefined' ? undefined
    : new ResizeObserver((entries) => {
      for (const entry of entries) recordItemHeight(entry.target as HTMLElement);
    });

  const measureItem = (element: HTMLElement, itemID: string) => {
    elementToItemID.set(element, itemID);
    itemResizeObserver?.observe(element);
    // Medido ya, antes del paint: el ResizeObserver de un item montado durante
    // otra entrega llega un frame tarde, y ese frame se ve corrido.
    recordItemHeight(element);
    return {
      update(nextItemID: string) { elementToItemID.set(element, nextItemID); },
      destroy() { itemResizeObserver?.unobserve(element); },
    };
  };

  $effect(() => () => itemResizeObserver?.disconnect());

  // Seguir el crecimiento del último mensaje, no solo la llegada de items
  // nuevos: si no, el texto en streaming se sale por abajo. measuredVersion
  // cubre los items que al medirse resultan más altos que lo supuesto.
  const tail = $derived.by(() => {
    const last = items[items.length - 1];
    if (!last) return '';
    return last.kind === 'message' ? String(last.text.length) : last.state;
  });

  $effect(() => {
    void items.length;
    void tail;
    void measuredVersion;
    if (stick && container) container.scrollTop = container.scrollHeight;
  });
</script>

<div class={'chat-thread ' + css} bind:this={container} bind:clientHeight={viewportHeight} onscroll={onScroll}>
  {#if items.length === 0 && emptyMessage}
    <div class="chat-empty">{ui.translate(emptyMessage)}</div>
  {/if}
  <div class="chat-spacer" style:height="{topSpacerHeight}px"></div>
  {#each renderedItems as item (item.id)}
    <div class="chat-thread-item" use:measureItem={item.id}>
      {#if item.kind === 'message'}
        <ChatMessage
          role={item.role}
          text={item.text}
          attachments={item.attachments}
          streaming={item.streaming}
          content={messageContent}
        />
      {:else}
        <ToolActivity tool={item.tool} label={item.label} state={item.state} detail={item.detail} />
      {/if}
    </div>
  {/each}
  <div class="chat-spacer" style:height="{bottomSpacerHeight}px"></div>
</div>

<style>
  .chat-thread {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 12px 12px 4px;
    /* El anclaje lo hace recordItemHeight: el del navegador lo duplicaría. */
    overflow-anchor: none;
  }

  .chat-spacer {
    flex: none;
  }

  /* El espacio entre items va dentro del wrapper para que entre en su medida. */
  .chat-thread-item {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-bottom: 8px;
  }

  .chat-empty {
    margin: auto;
    color: var(--fg-muted);
    font-size: 14px;
    text-align: center;
    max-width: 460px;
    line-height: 1.5;
  }
</style>
