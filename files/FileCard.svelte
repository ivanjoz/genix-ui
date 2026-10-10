<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import { ifcss } from '../utilities/css.js';
  const ui = useUI();

  interface Props {
    /** File name: its extension picks the logo. */
    name: string;
    /** Second line under the name, e.g. the formatted size. */
    detail?: string;
    /** When set, the name opens the file in a new tab. */
    href?: string;
    /** When set, hovering the card shows an X in its top right corner that calls it. */
    onRemove?: () => void;
    css?: string;
  }

  let { name, detail = '', href = '', onRemove, css = '' }: Props = $props();

  // Literal class names: the iconify plugin only generates the icons it finds written in the source.
  const fileLogos: { extensions: string[]; icon: string }[] = [
    { extensions: ['xls', 'xlsx', 'xlsm', 'csv', 'ods'], icon: 'icon-[mdi--file-excel] text-green-solid' },
    { extensions: ['pdf'], icon: 'icon-[mdi--file-pdf-box] text-red-solid' },
    { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'heic'], icon: 'icon-[mdi--file-image] text-purple-solid' },
    { extensions: ['ppt', 'pptx', 'odp'], icon: 'icon-[mdi--file-powerpoint] text-orange-solid' },
    { extensions: ['doc', 'docx', 'odt'], icon: 'icon-[mdi--file-word] text-blue-solid' },
    { extensions: ['txt', 'md', 'log', 'json', 'xml'], icon: 'icon-[mdi--file-document] text-fg-muted' },
  ];

  const fileLogo = $derived.by(() => {
    const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    return fileLogos.find((logo) => logo.extensions.includes(extension))?.icon || 'icon-[mdi--file] text-fg-subtle';
  });
</script>

<div class={ifcss(css, 'group relative flex min-w-0 items-center gap-8 rounded-[8px] border border-line bg-surface px-8 py-6')}>
  <i class="{fileLogo} shrink-0 text-[32px]"></i>
  <div class="flex min-w-0 grow flex-col">
    {#if href}
      <a {href} target="_blank" rel="noopener" title={name} class="truncate text-accent-fg hover:underline">{name}</a>
    {:else}
      <span title={name} class="truncate">{name}</span>
    {/if}
    {#if detail}
      <span class="text-[14px] text-fg-muted">{detail}</span>
    {/if}
  </div>

  <!-- Hidden until hover; always shown on touch screens, which have no hover. -->
  {#if onRemove}
    <button
      type="button"
      class="absolute -right-8 -top-8 flex h-24 w-24 items-center justify-center rounded-[50%]
        border border-red-border bg-red-bg text-red-solid opacity-0 transition-[opacity,background-color,color] duration-150
        group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100
        hover:border-red-solid hover:bg-red-solid hover:text-on-solid"
      aria-label={`${ui.translate('Remove|Quitar')} ${name}`}
      onclick={onRemove}
    >
      <i class="icon-[fa--close] text-[14px]"></i>
    </button>
  {/if}
</div>
