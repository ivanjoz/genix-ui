<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
  import s1 from '../components.module.css';
  import { Agent } from '../agent/registry';

  interface ImageProps {
    src: string;
    folder?: string;
    size?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    types?: string[];
    alt?: string;
    css?: string;
    imageCss?: string;
    onRemove?: () => void;
    /** Bilingual label of the remove button (aria-label and agent label). Name the image in it. */
    removeLabel?: string;
    /** Puts the remove button in a shaded bar along the image's bottom: revealed on hover on desktop,
     *  always visible on touch screens (they have no hover). */
    useRemoveBar?: boolean;
  }

  let {
    src,
    folder = '',
    size,
    types = [],
    alt = '',
    css = '',
    imageCss = '',
    onRemove,
    removeLabel = 'Delete image|Eliminar imagen',
    useRemoveBar = false,
  }: ImageProps = $props();

  // The remove button is a command like any Button: the agent finds and clicks it by its label.
  const removeButtonID = ui.nextComponentId();
  const triggerRemove = () => { onRemove?.(); };
  $effect(() => {
    if (!onRemove) { return; }
    return Agent.register({
      id: removeButtonID,
      type: 'Button',
      label: removeLabel,
      click: triggerRemove,
    });
  });

  // A caller placing the image as a background passes `absolute`/`fixed` in css: the default `relative`
  // must then be left out, since Tailwind orders `relative` after them and it would win, collapsing the image.
  const positionCss = $derived(/(^|\s)(absolute|fixed)(\s|$)/.test(css) ? '' : 'relative');

  // Optimistic images render from memory until their converted bytes reach the CDN.
  const liveBase64 = $derived(ui.images.getBase64(src));
  const isInFlight = $derived(ui.images.isInFlight(src));

  const makeImageSrc = (format?: string): string => {
    if (liveBase64) return liveBase64;
    if (!src) return '';

    const isAbsolute = src.startsWith('https://') || src.startsWith('http://');
    let imageURL = isAbsolute
      ? src
      : ui.makeCdnRoute(folder, size ? `${src}-x${size}` : src);
    if (format) imageURL += `.${format}`;
    return imageURL;
  };
</script>

<div
  class="group {positionCss} overflow-hidden rounded-[10px] border border-line-strong bg-surface cursor-default {css}"
>
  {#if src}
    <picture class="contents">
      {#if !liveBase64 && types.includes('avif')}
        <source type="image/avif" srcset={makeImageSrc('avif')} />
      {/if}
      {#if !liveBase64 && types.includes('webp')}
        <source type="image/webp" srcset={makeImageSrc('webp')} />
      {/if}
      <img
        class="absolute inset-0 block w-full h-full object-cover {imageCss}"
        src={makeImageSrc(liveBase64 ? undefined : types[0])}
        {alt}
        loading="lazy"
      />
    </picture>
  {/if}

  {#if isInFlight}
    <div
      class="absolute top-9 right-9 z-4 w-20 h-20 pointer-events-none"
      title={ui.translate('Processing image...|Procesando imagen...')}
    >
      <span class={s1.card_image_corner_loader_ring}></span>
    </div>
  {/if}

  {#if onRemove && useRemoveBar}
    <div class={s1.image_remove_bar}>
      <button
        class={s1.image_remove_bar_button}
        type="button"
        data-id="Button:{removeButtonID}"
        aria-label={ui.translate(removeLabel)}
        onclick={(event) => {
          event.stopPropagation();
          triggerRemove();
        }}
      >
        <i class="icon-[mdi--delete]"></i>
      </button>
    </div>
  {:else if onRemove}
    <button
      class={s1.image_remove_button}
      type="button"
      data-id="Button:{removeButtonID}"
      aria-label={ui.translate(removeLabel)}
      onclick={(event) => {
        event.stopPropagation();
        triggerRemove();
      }}
    >
      <i class="icon-[fa--close]"></i>
    </button>
  {/if}
</div>
