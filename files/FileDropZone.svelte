<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();

interface IFileDropZoneProps {
  onChange?: (file?: File, isRemoved?: boolean) => void;
  selectedFile?: File;
  accept?: string;
  extensions?: string[];
  disabled?: boolean;
  /** Headline inside the empty zone. */
  label?: string;
  /** Second line, for whatever the zone accepts: "A .pfx or .p12 file". */
  hint?: string;
  /** Sizing and placement belong to the consumer; the zone fills what it is given. */
  css?: string;
}

let {
  onChange,
  selectedFile = $bindable<File | undefined>(undefined),
  accept = '',
  extensions = [],
  disabled = false,
  label = 'Drop the file here or click to select it|Suelte el archivo aquí o haga clic para seleccionarlo',
  hint = '',
  css = ''
}: IFileDropZoneProps = $props();

let hiddenFileInputElement: HTMLInputElement | undefined;
let isDraggingOver = $state(false);

const normalizedExtensions = $derived(
  extensions
    .map((extension) => extension.trim().toLowerCase().replace(/^\./, ''))
    .filter((extension) => extension.length > 0)
);

const effectiveAcceptAttribute = $derived.by(() => {
  if (accept.trim().length > 0) {
    return accept;
  }
  return normalizedExtensions.map((extension) => `.${extension}`).join(',');
});

const extractExtension = (fileName: string): string =>
  fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

const formatFileSize = (sizeInBytes: number): string =>
  sizeInBytes >= 1048576
    ? `${(sizeInBytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(sizeInBytes / 1024))} KB`;

// The only path that accepts a file, shared by the picker and the drop: an
// extension the consumer did not allow is refused with the reason, not silently
// dropped, because a rejected drop leaves no trace of what went wrong.
const acceptFile = (file: File | undefined): void => {
  if (!file) return;

  const isExtensionAllowed =
    normalizedExtensions.length === 0 ||
    normalizedExtensions.includes(extractExtension(file.name));

  if (!isExtensionAllowed) {
    ui.notify.failure(
      ui.translate('Extension not allowed. Allowed:|Extensión no permitida. Permitidas:') +
        ' ' + normalizedExtensions.join(', ')
    );
    return;
  }

  selectedFile = file;
  onChange?.(file, false);
};

const openNativeFilePicker = () => {
  if (disabled) return;
  hiddenFileInputElement?.click();
};

const handleFileSelection = (event: Event) => {
  const inputElement = event.target as HTMLInputElement;
  acceptFile(inputElement.files?.[0]);
  // Cleared so re-picking the same file still fires a change.
  inputElement.value = '';
};

const handleDragOver = (event: DragEvent) => {
  if (disabled) return;
  event.preventDefault();
  isDraggingOver = true;
};

// Moving the pointer onto a child fires dragleave on the zone too, so the
// highlight only drops when the pointer actually left the zone's subtree.
const handleDragLeave = (event: DragEvent) => {
  const enteredElement = event.relatedTarget as Node | null;
  if (enteredElement && (event.currentTarget as HTMLElement).contains(enteredElement)) {
    return;
  }
  isDraggingOver = false;
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDraggingOver = false;
  if (disabled) return;
  acceptFile(event.dataTransfer?.files?.[0]);
};

const clearSelectedFile = (event: MouseEvent) => {
  // The remove button sits inside the zone, which is itself the picker trigger.
  event.stopPropagation();
  selectedFile = undefined;

  if (hiddenFileInputElement) {
    hiddenFileInputElement.value = '';
  }
  onChange?.(undefined, true);
};
</script>

<!-- The drag events sit on the wrapper and the click on the button inside it: a
     button may not contain another button, and the remove action needs to be one. -->
<div
  class="relative w-full {css}"
  role="group"
  aria-label={ui.translate(label)}
  ondragenter={handleDragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <input
    bind:this={hiddenFileInputElement}
    type="file"
    class="hidden"
    accept={effectiveAcceptAttribute}
    {disabled}
    onchange={handleFileSelection}
  />

  <button
    type="button"
    class="flex h-full w-full min-h-100 flex-col items-center justify-center gap-6
      rounded-[10px] border-2 border-dashed p-14 text-center transition-colors duration-150
      disabled:cursor-not-allowed disabled:opacity-60
      {isDraggingOver
        ? 'border-[#4b7bec] bg-[#e3eeff]'
        : 'border-slate-300 bg-slate-50 hover:border-[#7aa2f7] hover:bg-[#edf4ff]'}"
    {disabled}
    onclick={openNativeFilePicker}
  >
    {#if selectedFile}
      <i class="icon-[fa--file-o] text-[22px] text-[#3c4650]"></i>
      <span class="max-w-full truncate text-[14px] text-[#2f3a44]">{selectedFile.name}</span>
      <span class="text-[13px] text-slate-500">{formatFileSize(selectedFile.size)}</span>
    {:else}
      <i class="icon-[fa--cloud-upload] text-[24px] text-[#4b7bec]"></i>
      <span class="text-[14px] text-[#2f3a44]">{ui.translate(label)}</span>
      {#if hint}
        <span class="text-[13px] text-slate-500">{ui.translate(hint)}</span>
      {/if}
    {/if}
  </button>

  {#if selectedFile && !disabled}
    <button
      type="button"
      class="absolute right-8 top-8 flex h-26 w-26 items-center justify-center rounded-[50%]
        border border-[#ffcfcf] bg-[#fff3f3] text-[#d72828] transition-colors duration-200
        hover:border-[#d63232] hover:bg-[#e54545] hover:text-white"
      aria-label={ui.translate('Remove file|Quitar archivo')}
      onclick={clearSelectedFile}
    >
      <i class="icon-[fa--close] text-[14px]"></i>
    </button>
  {/if}
</div>
