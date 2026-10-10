<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import type { ChatAttachmentView } from './chat.types';

  const ui = useUI();

  interface Props {
    files: ChatAttachmentView[];
    /**
     * Con esto los chips llevan aspa. Sirve para la bandeja del composer, donde
     * todavía se puede quitar un archivo; en el hilo ya no se pasa.
     */
    onRemove?: (index: number) => void;
    css?: string;
  }

  let { files, onRemove, css = '' }: Props = $props();

  const ICONS = {
    image: 'icon-[fa--picture-o]',
    pdf: 'icon-[fa--file-pdf-o]',
    file: 'icon-[fa--file-text-o]',
  };

  const icon = (file: ChatAttachmentView) => ICONS[file.kind ?? 'file'] ?? ICONS.file;

  const size = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
</script>

{#if files.length}
  <div class={'chat-files ' + css}>
    {#each files as file, index (file.url ?? file.name + index)}
      <div class="chat-file" class:chat-file-thumb={file.kind === 'image' && file.url}>
        {#if file.kind === 'image' && file.url}
          <a href={file.url} target="_blank" rel="noreferrer" title={file.name}>
            <img src={file.url} alt={file.name} />
          </a>
        {:else if file.url}
          <a class="chat-file-body" href={file.url} target="_blank" rel="noreferrer">
            <i class={icon(file)}></i>
            <span class="chat-file-name">{file.name}</span>
            {#if size(file.bytes)}<span class="chat-file-size">{size(file.bytes)}</span>{/if}
          </a>
        {:else}
          <span class="chat-file-body">
            <i class={icon(file)}></i>
            <span class="chat-file-name">{file.name}</span>
            {#if size(file.bytes)}<span class="chat-file-size">{size(file.bytes)}</span>{/if}
          </span>
        {/if}

        {#if onRemove}
          <button
            type="button"
            class="chat-file-remove"
            aria-label={ui.translate('Remove|Quitar')}
            onclick={() => onRemove?.(index)}
          >
            <i class="icon-[fa--times]"></i>
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .chat-files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chat-file {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
    padding: 3px 6px;
    font-size: 13px;
  }

  /* La miniatura no lleva marco propio: el marco es el borde de la imagen. */
  .chat-file-thumb {
    padding: 0;
    overflow: hidden;
    position: relative;
  }

  .chat-file-thumb img {
    display: block;
    max-width: 180px;
    max-height: 130px;
    object-fit: cover;
  }

  .chat-file-body {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  a.chat-file-body:hover .chat-file-name {
    text-decoration: underline;
  }

  .chat-file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .chat-file-size {
    color: var(--fg-muted);
    font-size: 12px;
    flex: none;
  }

  .chat-file-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 11px;
  }

  .chat-file-remove:hover {
    background: var(--secondary);
    color: var(--red-fg);
  }

  /* Sobre la miniatura el aspa flota en la esquina, que si no la taparía. */
  .chat-file-thumb .chat-file-remove {
    position: absolute;
    top: 3px;
    right: 3px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
  }
</style>
