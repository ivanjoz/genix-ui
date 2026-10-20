<script lang="ts" generics="T">
  import { BROWSER } from 'esm-env';
  import { onMount, untrack } from "svelte";
  import { Editor, type ChainedCommands } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import TextAlign from "@tiptap/extension-text-align";
  import { TextStyleKit } from "@tiptap/extension-text-style";
  import { TableKit } from "@tiptap/extension-table";
  import { Markdown } from "@tiptap/markdown";
  import EditorTablePicker from "./EditorTablePicker.svelte";
  import EditorTableHandles from "./EditorTableHandles.svelte";
  // Aliased: the generic record parameter of this component is already named T.
  import TranslatedText from "../misc/T.svelte";
  import { editorBackgroundColors, editorTextColors, editorTextSizes } from "./HTMLEditor"
  import {
    editorIconAlignCenter,
    editorIconAlignJustify,
    editorIconAlignLeft,
    editorIconAlignRight,
    editorIconBackgroundColor,
    editorIconBold,
    editorIconBulletList,
    editorIconClearFormat,
    editorIconHorizontalRule,
    editorIconItalic,
    editorIconNumberedList,
    editorIconRedo,
    editorIconTable,
    editorIconTextColor,
    editorIconTextSize,
    editorIconUnderline,
    editorIconUndo,
  } from "./icons"

  const { saveOn, save, css, placeholder = "Start writing rich content…|Empieza a escribir contenido enriquecido…", format = "html" }: {
    saveOn: T
    save: keyof T
    css?: string
    /** Bilingual "English|Spanish" text shown while the editor is empty. */
    placeholder?: string
    /**
     * What saveOn[save] holds: "html" (default) or "markdown". Markdown has no colors, text sizes,
     * alignment or underline, so those buttons are hidden and the text size button picks headings.
     */
    format?: "html" | "markdown"
  } = $props()

  // Read once: switching the format would need a different set of extensions.
  const isMarkdown = untrack(() => format === "markdown")

  const readBoundValue = () =>
    (saveOn && save && ((saveOn[save] as string) ?? "")) || ""

  let editorRoot = $state<HTMLDivElement | null>(null)
  let editorFrame = $state<HTMLDivElement>()
  let toolbarElement = $state<HTMLDivElement>()
  // Raw: the tiptap Editor is a mutable class instance and must not be wrapped in a proxy.
  let editor = $state.raw<Editor | null>(null)
  // Bumped on every transaction so the toolbar's active states re-derive from the editor.
  let transactionTick = $state(0)
  // Last value exchanged with saveOn[save], to tell our own writes from external changes.
  let lastSyncedValue = readBoundValue()

  // Popovers opened from a toolbar button: centered under it, with an arrow pointing at it
  type ToolbarPopover = "textSize" | "heading" | "table" | "textColor" | "backgroundColor" | "align"
  let openPopover = $state<ToolbarPopover | null>(null)
  let popoverAnchor = $state.raw<HTMLElement | null>(null)
  let popoverElement = $state<HTMLDivElement>()
  // Toolbar coordinates: the anchor button's horizontal center and the popover's top-left corner
  let popoverAnchorCenter = $state(0)
  let popoverTop = $state(0)
  let popoverLeft = $state(0)

  const textAlignOptions = [
    { value: "left", label: "Align left", icon: editorIconAlignLeft },
    { value: "center", label: "Align center", icon: editorIconAlignCenter },
    { value: "right", label: "Align right", icon: editorIconAlignRight },
    { value: "justify", label: "Justify", icon: editorIconAlignJustify },
  ]

  const headingOptions = [
    { level: 0, label: "Normal text", name: "P" },
    { level: 1, label: "Heading 1", name: "H1" },
    { level: 2, label: "Heading 2", name: "H2" },
    { level: 3, label: "Heading 3", name: "H3" },
  ] as const

  // An empty document serializes as "<p></p>": store it as "" so an untouched field stays empty.
  const getEditorValue = (instance: Editor) =>
    instance.isEmpty ? "" : isMarkdown ? instance.getMarkdown() : instance.getHTML()

  const isActive = (nameOrAttributes: string | Record<string, unknown>, attributes?: Record<string, unknown>) => {
    transactionTick
    if (!editor) return false
    return typeof nameOrAttributes === "string"
      ? editor.isActive(nameOrAttributes, attributes)
      : editor.isActive(nameOrAttributes)
  }

  const isEditorEmpty = $derived.by(() => { transactionTick; return editor?.isEmpty ?? true })
  // The color swatches show the color under the cursor, falling back to the theme defaults.
  const textColorValue = $derived.by(() => {
    transactionTick
    return editor?.getAttributes("textStyle").color || "var(--fg)"
  })
  const backgroundColorValue = $derived.by(() => {
    transactionTick
    return editor?.getAttributes("textStyle").backgroundColor || "var(--surface)"
  })
  const currentFontSize = $derived.by(() => {
    transactionTick
    return editor?.getAttributes("textStyle").fontSize || ""
  })
  const currentHeadingLevel = $derived.by(() => {
    transactionTick
    return headingOptions.find(option => option.level && editor?.isActive("heading", { level: option.level }))?.level ?? 0
  })

  // Every toolbar action starts a chain that gives the focus (and the selection) back to the editor.
  const runCommand = (command: (chain: ChainedCommands) => ChainedCommands) => {
    if (!editor) return
    command(editor.chain().focus()).run()
  }

  const togglePopover = (popover: ToolbarPopover, ev: MouseEvent) => {
    openPopover = openPopover === popover ? null : popover
    if (!openPopover) return
    popoverAnchor = ev.currentTarget as HTMLElement
    popoverAnchorCenter = popoverAnchor.offsetLeft + popoverAnchor.offsetWidth / 2
    popoverTop = popoverAnchor.offsetTop + popoverAnchor.offsetHeight + 8
  }

  // Once the popover is rendered and its width known: centered under the button, kept inside the toolbar.
  $effect(() => {
    if (!openPopover || !popoverElement || !toolbarElement) return
    const popoverWidth = popoverElement.offsetWidth
    const centeredLeft = popoverAnchorCenter - popoverWidth / 2
    popoverLeft = Math.max(0, Math.min(centeredLeft, toolbarElement.clientWidth - popoverWidth))
  })

  const closePopoverOnOutsidePointer = (ev: PointerEvent) => {
    const target = ev.target as Node
    if (!openPopover || popoverElement?.contains(target) || popoverAnchor?.contains(target)) return
    openPopover = null
  }

  const insertTable = (rows: number, cols: number) => {
    // A Markdown table always starts with its header row.
    runCommand(chain => chain.insertTable({ rows, cols, withHeaderRow: isMarkdown }))
    openPopover = null
  }

  const applyTextAlign = (alignment: string) => {
    runCommand(chain => chain.setTextAlign(alignment))
    openPopover = null
  }

  const applyFontSize = (fontSize: string) => {
    runCommand(chain => chain.setFontSize(fontSize))
    openPopover = null
  }

  const applyHeading = (level: typeof headingOptions[number]["level"]) => {
    runCommand(chain => level ? chain.setHeading({ level }) : chain.setParagraph())
    openPopover = null
  }

  const applyColor = (color: string) => {
    if (openPopover === "backgroundColor") runCommand(chain => chain.setBackgroundColor(color))
    else runCommand(chain => chain.setColor(color))
    openPopover = null
  }

  onMount(() => {
    if (!BROWSER || !editorRoot) return

    const instance = new Editor({
      element: editorRoot,
      extensions: isMarkdown
        ? [
          // Only what Markdown can write back: no underline, text styles or alignment.
          StarterKit.configure({ link: { openOnClick: false }, underline: false }),
          TableKit.configure({ table: { resizable: false } }),
          Markdown,
        ]
        : [
          StarterKit.configure({ link: { openOnClick: false } }),
          TextStyleKit,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          // Dragging a column border resizes it; the widths are stored as colwidth on the cells.
          TableKit.configure({ table: { resizable: true } }),
        ],
      content: lastSyncedValue,
      contentType: format,
      editorProps: {
        attributes: {
          class: "min-h-[14rem] p-16 text-base leading-relaxed text-fg outline-none",
          role: "textbox",
          "aria-label": "Rich text editor",
          "aria-multiline": "true",
        }
      },
      onTransaction: () => { transactionTick++ },
      onUpdate: ({ editor: updatedEditor }) => {
        const nextValue = getEditorValue(updatedEditor)
        if (nextValue === lastSyncedValue) return
        lastSyncedValue = nextValue
        if (saveOn && save) saveOn[save] = nextValue as NonNullable<T>[keyof T]
      },
    })
    editor = instance

    return () => {
      instance.destroy()
      editor = null
    }
  })

  // External changes to saveOn[save] (another record loaded) replace the document without echoing back.
  $effect(() => {
    const incomingValue = readBoundValue()
    if (!editor || incomingValue === lastSyncedValue) return
    lastSyncedValue = incomingValue
    editor.commands.setContent(incomingValue, { emitUpdate: false, contentType: format })
  })

  // Paragraphs without an explicit alignment read as left aligned.
  const currentTextAlign = $derived(
    textAlignOptions.find(option => option.value !== "left" && isActive({ textAlign: option.value })) ?? textAlignOptions[0]
  )

  // Button Configuration. swatchColor draws the color bar under the text/background color icons.
  type ToolbarItem = {
    label: string
    icon: string
    action: (ev: MouseEvent) => void
    active?: boolean
    swatchColor?: string
  }
  const markdownToolbarLabels = new Set([
    'Bold', 'Italic', 'Heading', 'Insert table', 'Bulleted list', 'Numbered list', 'Insert horizontal rule',
    'Clear format', 'Undo', 'Redo',
  ])
  const allToolbarItems = $derived<ToolbarItem[]>([
    { label: 'Bold', icon: editorIconBold, action: () => runCommand(chain => chain.toggleBold()), active: isActive("bold") },
    { label: 'Italic', icon: editorIconItalic, action: () => runCommand(chain => chain.toggleItalic()), active: isActive("italic") },
    isMarkdown
      ? { label: 'Heading', icon: editorIconTextSize, action: (ev) => togglePopover("heading", ev), active: openPopover === "heading" || currentHeadingLevel > 0 }
      : { label: 'Text Size', icon: editorIconTextSize, action: (ev) => togglePopover("textSize", ev), active: openPopover === "textSize" },
    { label: 'Insert table', icon: editorIconTable, action: (ev) => togglePopover("table", ev), active: openPopover === "table" },
    {
      label: 'Text color', icon: editorIconTextColor, swatchColor: textColorValue,
      action: (ev) => togglePopover("textColor", ev), active: openPopover === "textColor",
    },
    {
      label: 'Background color', icon: editorIconBackgroundColor, swatchColor: backgroundColorValue,
      action: (ev) => togglePopover("backgroundColor", ev), active: openPopover === "backgroundColor",
    },
    // Shows the current alignment; the four options open in a popover.
    { label: 'Text alignment', icon: currentTextAlign.icon, action: (ev) => togglePopover("align", ev), active: openPopover === "align" },
    { label: 'Underline', icon: editorIconUnderline, action: () => runCommand(chain => chain.toggleUnderline()), active: isActive("underline") },
    { label: 'Bulleted list', icon: editorIconBulletList, action: () => runCommand(chain => chain.toggleBulletList()), active: isActive("bulletList") },
    { label: 'Numbered list', icon: editorIconNumberedList, action: () => runCommand(chain => chain.toggleOrderedList()), active: isActive("orderedList") },
    { label: 'Insert horizontal rule', icon: editorIconHorizontalRule, action: () => runCommand(chain => chain.setHorizontalRule()) },
    {
      label: 'Clear format', icon: editorIconClearFormat,
      action: () => runCommand(chain => isMarkdown ? chain.unsetAllMarks().clearNodes() : chain.unsetAllMarks().clearNodes().unsetTextAlign()),
    },
    { label: 'Undo', icon: editorIconUndo, action: () => runCommand(chain => chain.undo()) },
    { label: 'Redo', icon: editorIconRedo, action: () => runCommand(chain => chain.redo()) },
  ])
  const toolbarItems = $derived(isMarkdown ? allToolbarItems.filter(item => markdownToolbarLabels.has(item.label)) : allToolbarItems)
</script>

<svelte:window onpointerdown={closePopoverOnOutsidePointer} />

<div class={`flex flex-col ${css ?? ""}`}>
  {#if BROWSER}
    <div bind:this={toolbarElement}
      class="flex flex-wrap gap-2 items-center p-6 border border-line rounded-t-[6px] bg-surface-soft relative"
      role="toolbar"
      aria-label="Editor toolbar"
      tabindex="-1"
    >
      {#each toolbarItems as item}
        <button type="button"  disabled={!editor}
          class="_4 {item.active ? 'bg-blue-bg-strong border-blue-solid text-blue-fg' : ''} {item.swatchColor ? 'pb-10' : ''}"
          aria-label={item.label}
          title={item.label}
          onclick={item.action}
        >
          <span class="flex text-[20px]">{@html item.icon}</span>
          {#if item.swatchColor}
            <div class="absolute bottom-3 left-6 right-6 h-6 border border-fg/40 rounded-[2px]" style="background-color: {item.swatchColor};"></div>
          {/if}
        </button>
      {/each}

      {#if openPopover}
        <div bind:this={popoverElement}
          class="absolute z-50 bg-surface border border-line rounded-[10px] shadow-lg"
          style="left: {popoverLeft}px; top: {popoverTop}px;"
          role="dialog"
          aria-label={popoverAnchor?.getAttribute("aria-label")}
          tabindex="-1"
          onkeydown={(e) => { if (e.key === 'Escape') openPopover = null }}
        >
          <!-- Arrow: a square turned 45deg showing only its top-left borders, centered on the anchor button -->
          <div class="absolute -top-7 w-12 h-12 rotate-45 bg-surface border-l border-t border-line"
            style="left: {popoverAnchorCenter - popoverLeft - 6}px;"></div>
          {#if openPopover === "textSize"}
            <div class="flex gap-4 p-6">
              {#each editorTextSizes as textSize}
                <button type="button"
                  class="_4 {currentFontSize === `${textSize.id}px` ? 'bg-blue-bg-strong border-blue-solid text-blue-fg' : ''}"
                  onclick={() => applyFontSize(`${textSize.id}px`)}
                >
                  {textSize.name}
                </button>
              {/each}
            </div>
          {:else if openPopover === "heading"}
            <div class="flex gap-4 p-6">
              {#each headingOptions as option}
                <button type="button"
                  class="_4 {currentHeadingLevel === option.level ? 'bg-blue-bg-strong border-blue-solid text-blue-fg' : ''}"
                  aria-label={option.label}
                  title={option.label}
                  onclick={() => applyHeading(option.level)}
                >
                  {option.name}
                </button>
              {/each}
            </div>
          {:else if openPopover === "table"}
            <EditorTablePicker onInsert={insertTable} />
          {:else if openPopover === "textColor" || openPopover === "backgroundColor"}
            <div class="grid grid-cols-8 gap-6 p-10">
              {#each openPopover === "backgroundColor" ? editorBackgroundColors : editorTextColors as color}
                <button type="button"
                  class="h-22 w-22 rounded-[4px] border border-fg/30 cursor-pointer hover:outline-2 hover:outline-offset-1 hover:outline-blue-solid"
                  style="background-color: {color};"
                  aria-label={color}
                  onclick={() => applyColor(color)}
                ></button>
              {/each}
            </div>
          {:else}
            <div class="flex gap-4 p-6">
              {#each textAlignOptions as option}
                <button type="button"
                  class="_4 {currentTextAlign.value === option.value ? 'bg-blue-bg-strong border-blue-solid text-blue-fg' : ''}"
                  aria-label={option.label}
                  title={option.label}
                  onclick={() => applyTextAlign(option.value)}
                >
                  <span class="flex text-[20px]">{@html option.icon}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div bind:this={editorFrame} class="tiptap-editor border border-line rounded-b-[6px] bg-surface min-h-[14rem] shadow-inner relative">
      {#if isEditorEmpty}
        <div class="absolute top-16 left-16 text-fg-subtle pointer-events-none">
          <TranslatedText text={placeholder} />
        </div>
      {/if}
      <div bind:this={editorRoot}></div>
      {#if editor && editorFrame}
        <EditorTableHandles {editor} {editorFrame} {transactionTick} />
      {/if}
    </div>
  {:else}
    <div class="border-2 border-dashed border-line-strong rounded-xl p-16 text-center text-fg-muted bg-surface-soft">
      El editor de texto enriquecido se cargará cuando estés en el navegador.
    </div>
  {/if}
</div>

<style>
  ._4 {
    width: 42px;
    height: 38px;
    border: 1px solid var(--line-strong);
    background-color: var(--surface);
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    color: var(--fg);
    transition-property: color, background-color, border-color;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  ._4:hover:not(:disabled) {
    border-color: var(--blue-solid);
    color: var(--blue-fg);
  }

  ._4:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Styles for the ProseMirror document tiptap renders inside the editor root */
  .tiptap-editor :global(.tiptap p) {
    margin: 0 0 6px;
  }

  /* Tailwind's preflight leaves headings at body size */
  .tiptap-editor :global(.tiptap h1),
  .tiptap-editor :global(.tiptap h2),
  .tiptap-editor :global(.tiptap h3) {
    font-weight: 600;
    line-height: 1.3;
    margin: 12px 0 6px;
  }

  .tiptap-editor :global(.tiptap h1) {
    font-size: 1.5em;
  }

  .tiptap-editor :global(.tiptap h2) {
    font-size: 1.25em;
  }

  .tiptap-editor :global(.tiptap h3) {
    font-size: 1.1em;
  }

  .tiptap-editor :global(.tiptap th) {
    background-color: var(--surface-soft);
    font-weight: 600;
    text-align: left;
  }

  .tiptap-editor :global(.tiptap ul) {
    list-style: disc;
    padding-left: 1.5rem;
  }

  .tiptap-editor :global(.tiptap ol) {
    list-style: decimal;
    padding-left: 1.5rem;
  }

  /* Resizable tables are wrapped by tiptap's TableView: columns wider than the editor scroll sideways. */
  .tiptap-editor :global(.tiptap .tableWrapper) {
    margin: 6px 0;
    overflow-x: auto;
    /* overflow-x alone turns overflow-y to auto too, and the resize bar's overhang would show a vertical scrollbar */
    overflow-y: hidden;
  }

  .tiptap-editor :global(.tiptap table) {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  /* Bar shown on the column border under the pointer while it can be dragged */
  .tiptap-editor :global(.tiptap .column-resize-handle) {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -2px;
    width: 4px;
    background-color: var(--accent-solid);
    pointer-events: none;
  }

  .tiptap-editor :global(.tiptap.resize-cursor) {
    cursor: col-resize;
  }

  .tiptap-editor :global(.tiptap table td),
  .tiptap-editor :global(.tiptap table th) {
    border: 1px solid var(--line-strong);
    padding: 0.5rem;
    vertical-align: top;
    box-sizing: border-box;
    position: relative;
  }

  /* Cells covered by a multi-cell (CellSelection) selection */
  .tiptap-editor :global(.tiptap .selectedCell) {
    background-color: var(--accent-bg);
  }

  .tiptap-editor :global(.tiptap img) {
    max-width: 100%;
    height: auto;
    margin: 0.75rem 0;
  }

  .tiptap-editor :global(.tiptap hr) {
    border: none;
    border-top: 1px solid var(--line-strong);
    margin: 1rem 0;
  }
</style>
