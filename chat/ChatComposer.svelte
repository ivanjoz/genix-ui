<script lang="ts">
  import { Agent } from '../agent/registry';
  import Button from '../buttons/Button.svelte';
  import { useUI } from '../runtime/index.js';
  import ChatAttachments from './ChatAttachments.svelte';
  import type { ChatAttachmentView } from './chat.types';

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
    /**
     * Habilita adjuntos: clip, arrastrar y soltar sobre el composer, y pegar
     * desde el portapapeles. Apagado por defecto — un host que no sepa qué
     * hacer con los archivos no debe dejar que se suelten.
     */
    allowFiles?: boolean;
    /** Filtro, en el formato del atributo `accept` de `<input type="file">`. */
    accept?: string;
    maxFiles?: number;
    maxFileBytes?: number;
    /** Un archivo rechazado aquí mismo (formato o tamaño). `"EN|ES"` no: ya es texto final. */
    onFileError?: (message: string) => void;
    onSend?: (text: string, files: File[]) => void;
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
    allowFiles = false,
    accept = '',
    maxFiles = 10,
    maxFileBytes = 0,
    onFileError,
    onSend,
    onStop,
    css = '',
  }: Props = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();

  /**
   * Los archivos en espera. El `ref` es lo que se pinta; para las imágenes lleva
   * un object URL para verlas antes de mandarlas, y por eso hay que revocarlo al
   * quitarlas — si no, el blob se queda en memoria toda la sesión.
   */
  let pending = $state<{ file: File; ref: ChatAttachmentView }[]>([]);

  // Contador y no booleano: al pasar el puntero sobre el textarea salta un
  // `dragleave` del contenedor que apagaría el resaltado a mitad del arrastre.
  let dragDepth = $state(0);
  const dragging = $derived(allowFiles && dragDepth > 0);

  const IMAGE = /^image\//;

  const kindOf = (file: File): ChatAttachmentView['kind'] => {
    if (IMAGE.test(file.type)) return 'image';
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'file';
  };

  /** ¿Encaja con `accept`? Acepta las tres formas: `.pdf`, `image/*` y `text/csv`. */
  const matchesAccept = (file: File) => {
    if (!accept.trim()) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return accept
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .some((rule) => {
        if (rule.startsWith('.')) return name.endsWith(rule);
        if (rule.endsWith('/*')) return Boolean(type) && type.startsWith(rule.slice(0, -1));
        return type === rule;
      });
  };

  const addFiles = (incoming: File[]) => {
    if (!allowFiles) return;
    for (const file of incoming) {
      if (pending.length >= maxFiles) {
        onFileError?.(`No se pueden adjuntar más de ${maxFiles} archivos en un mensaje.`);
        return;
      }
      if (!matchesAccept(file)) {
        onFileError?.(`«${file.name}» no es un formato admitido.`);
        continue;
      }
      if (maxFileBytes > 0 && file.size > maxFileBytes) {
        onFileError?.(
          `«${file.name}» supera el máximo de ${Math.round(maxFileBytes / 1024 / 1024)} MB.`,
        );
        continue;
      }
      const kind = kindOf(file);
      pending = [
        ...pending,
        {
          file,
          ref: {
            name: file.name,
            bytes: file.size,
            kind,
            url: kind === 'image' ? URL.createObjectURL(file) : undefined,
          },
        },
      ];
    }
  };

  const removeFile = (index: number) => {
    const entry = pending[index];
    if (entry?.ref.url) URL.revokeObjectURL(entry.ref.url);
    pending = pending.filter((_, position) => position !== index);
  };

  const clearFiles = () => {
    for (const entry of pending) if (entry.ref.url) URL.revokeObjectURL(entry.ref.url);
    pending = [];
  };

  // --------------------------------------------------------------- adjuntar

  const onPick = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    addFiles([...(input.files ?? [])]);
    // Se limpia para que volver a elegir el mismo archivo dispare `change`.
    input.value = '';
  };

  /** Solo los arrastres que traen archivos: un texto suelto no enciende nada. */
  const hasFiles = (event: DragEvent) =>
    Boolean(event.dataTransfer?.types?.includes('Files'));

  const onDragEnter = (event: DragEvent) => {
    if (!allowFiles || disabled || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
  };

  const onDragOver = (event: DragEvent) => {
    if (!allowFiles || disabled || !hasFiles(event)) return;
    // Sin esto el navegador abre el archivo en la pestaña y se pierde el chat.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = () => {
    if (dragDepth > 0) dragDepth -= 1;
  };

  const onDrop = (event: DragEvent) => {
    if (!allowFiles || disabled) return;
    event.preventDefault();
    dragDepth = 0;
    addFiles([...(event.dataTransfer?.files ?? [])]);
    textarea?.focus();
  };

  /** Pegar una captura: viene como archivo en el portapapeles, sin nombre propio. */
  const onPaste = (event: ClipboardEvent) => {
    if (!allowFiles || disabled) return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  };

  // --------------------------------------------------------------- enviar

  const send = () => {
    const text = value.trim();
    const files = pending.map((entry) => entry.file);
    if ((!text && !files.length) || disabled || running) return;
    value = '';
    clearFiles();
    resize();
    onSend?.(text, files);
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

  // Los blobs de las miniaturas no sobreviven al componente.
  $effect(() => () => clearFiles());
</script>

<!-- El arrastre se escucha en el contenedor entero, no solo en el textarea:
     soltar junto al botón de enviar tiene que valer igual. -->
<div
  class={'chat-composer ' + css}
  class:chat-composer-drop={dragging}
  data-id="ChatComposer:{componentID}"
  data-value={value}
  role="group"
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  {#if pending.length}
    <div class="chat-composer-files">
      <ChatAttachments files={pending.map((entry) => entry.ref)} onRemove={removeFile} />
    </div>
  {/if}

  <div class="chat-composer-row">
    <textarea
      bind:this={textarea}
      bind:value
      rows={minRows}
      {disabled}
      placeholder={ui.translate(placeholder)}
      oninput={resize}
      onkeydown={onKeydown}
      onpaste={onPaste}
    ></textarea>

    <!-- Los dos botones en la misma columna, a la derecha del texto: el clip
         arriba y el de enviar abajo, que es donde se busca. -->
    <div class="chat-composer-actions">
      {#if allowFiles}
        <input
          class="chat-composer-picker"
          type="file"
          multiple
          {accept}
          bind:this={picker}
          onchange={onPick}
        />
        <Button
          icon="icon-[fa--paperclip]"
          label="Attach a file|Adjuntar un archivo"
          css="chat-composer-clip"
          {disabled}
          onClick={() => picker?.click()}
        />
      {/if}

      {#if running}
        <Button icon="icon-[fa--stop]" color="red" label="Stop|Detener" onClick={() => onStop?.()} />
      {:else}
        <Button
          icon="icon-[fa--paper-plane]"
          color="blue"
          label="Send|Enviar"
          disabled={disabled || (!value.trim() && !pending.length)}
          onClick={send}
        />
      {/if}
    </div>
  </div>

  {#if dragging}
    <div class="chat-composer-hint">
      {ui.translate('Drop the file to attach it|Suelta el archivo para adjuntarlo')}
    </div>
  {/if}
</div>

<style>
  .chat-composer {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--line);
    background: var(--surface);
  }

  .chat-composer-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  /* Columna de alto natural, anclada abajo: el botón de enviar queda a ras del
     borde inferior del campo —donde estaba siempre— y el clip encima de él. */
  .chat-composer-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* El clip no lleva color: es una acción secundaria y no debe competir con el
     botón de enviar. Va por `:global` porque la clase la pinta `Button`. */
  .chat-composer-row :global(.chat-composer-clip) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--fg-muted);
    font-size: 16px;
    cursor: pointer;
  }

  .chat-composer-row :global(.chat-composer-clip:hover:not(:disabled)) {
    border-color: var(--line-strong);
    background: var(--secondary);
    color: var(--primary);
  }

  textarea {
    flex: 1;
    resize: none;
    border: 1px solid var(--input-border-color, var(--line-strong));
    border-radius: 8px;
    padding: 9px 11px;
    font-family: inherit;
    font-size: 15px;
    line-height: 21px;
    max-height: 240px;
    outline: none;
  }

  textarea:focus {
    border-color: var(--primary);
  }

  .chat-composer-picker {
    display: none;
  }

  /* Mientras se arrastra, el composer entero es la zona de soltar. El
     `pointer-events: none` del cartel es lo que impide que tapar el textarea
     dispare un `dragleave` y apague el resaltado justo al soltar. */
  .chat-composer-drop::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 2px dashed var(--primary);
    border-radius: 10px;
    background: var(--secondary);
    opacity: 0.55;
    pointer-events: none;
  }

  .chat-composer-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary);
    font-size: 14px;
    font-weight: 600;
    pointer-events: none;
  }
</style>
