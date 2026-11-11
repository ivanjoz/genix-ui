<script lang="ts" generics="T">
  import { BROWSER } from "esm-env"
  import { onMount } from "svelte"
  import { Editor, Node } from "@tiptap/core"
  import FieldShell from "../form/FieldShell.svelte"
  import { useUI } from "../runtime/index.js"
  import EditorVariablePicker from "./EditorVariablePicker.svelte"
  import {
    createEditorVariableNode, editorVariableLabel, plainTextToVariableHTML, type EditorVariableOption,
  } from "./EditorVariable"
  import { editorIconVariable } from "./icons"

  // A one-line plain-text field whose variables are inserted only from its picker and shown as
  // "Group: Field" labels. saveOn[save] holds plain text with {{name}} where each variable sits.
  const { saveOn, save, label, css, variables, variablesHint }: {
    saveOn: T
    save: keyof T
    label?: string
    css?: string
    variables: EditorVariableOption[]
    /** Bilingual note shown under the variable list. */
    variablesHint?: string
  } = $props()

  const ui = useUI()

  // Only one paragraph of text and variables: no marks, no blocks.
  const SingleLineDocument = Node.create({ name: "doc", topNode: true, content: "paragraph" })
  const SingleLineParagraph = Node.create({
    name: "paragraph", group: "block", content: "inline*",
    parseHTML: () => [{ tag: "p" }], renderHTML: () => ["p", 0],
  })
  const InlineText = Node.create({ name: "text", group: "inline" })

  const readBoundValue = () => (saveOn && save && ((saveOn[save] as string) ?? "")) || ""

  let editorRoot = $state<HTMLDivElement | null>(null)
  // Raw: the tiptap Editor is a mutable class instance and must not be wrapped in a proxy.
  let editor = $state.raw<Editor | null>(null)
  // Last value exchanged with saveOn[save], to tell our own writes from external changes.
  let lastSyncedValue = readBoundValue()
  let isPickerOpen = $state(false)
  let pickerElement = $state<HTMLDivElement>()
  let pickerButton = $state<HTMLButtonElement>()

  onMount(() => {
    if (!BROWSER || !editorRoot) return
    const instance = new Editor({
      element: editorRoot,
      extensions: [
        SingleLineDocument, SingleLineParagraph, InlineText,
        createEditorVariableNode(name => editorVariableLabel(variables, name, ui.translate)),
      ],
      content: plainTextToVariableHTML(lastSyncedValue),
      editorProps: {
        attributes: { class: "outline-none whitespace-nowrap overflow-hidden", role: "textbox", "aria-label": ui.translate(label || "") },
        // One line: Enter does nothing.
        handleKeyDown: (_view, ev) => ev.key === "Enter",
      },
      onUpdate: ({ editor: updatedEditor }) => {
        const nextValue = updatedEditor.getText()
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

  // External changes to saveOn[save] (another record loaded) replace the text without echoing back.
  $effect(() => {
    const incomingValue = readBoundValue()
    if (!editor || incomingValue === lastSyncedValue) return
    lastSyncedValue = incomingValue
    editor.commands.setContent(plainTextToVariableHTML(incomingValue), { emitUpdate: false })
  })

  const insertVariable = (name: string) => {
    editor?.chain().focus().insertContent({ type: "variable", attrs: { name } }).run()
    isPickerOpen = false
  }

  const closePickerOnOutsidePointer = (ev: PointerEvent) => {
    const target = ev.target as globalThis.Node
    if (!isPickerOpen || pickerElement?.contains(target) || pickerButton?.contains(target)) return
    isPickerOpen = false
  }
</script>

<svelte:window onpointerdown={closePickerOnOutsidePointer} />

{#snippet variableButton()}
  <!-- The suffix slot ignores the pointer, so the button re-enables it for its own box. -->
  <button type="button" bind:this={pickerButton} disabled={!editor}
    class="pointer-events-auto flex items-center justify-center w-30 h-30 rounded-[4px] text-[20px] text-label cursor-pointer
           hover:bg-accent-bg {isPickerOpen ? 'bg-accent-bg' : ''}"
    aria-label="Insert variable" title="Insert variable"
    onclick={() => { isPickerOpen = !isPickerOpen }}
  >{@html editorIconVariable}</button>
{/snippet}

{#snippet variablePicker()}
  {#if isPickerOpen}
    <div bind:this={pickerElement}
      class="absolute z-50 right-0 top-[calc(100%+6px)] bg-surface border border-line rounded-[10px] shadow-lg"
      role="dialog" aria-label="Variables" tabindex="-1"
      onkeydown={(ev) => { if (ev.key === "Escape") isPickerOpen = false }}
    >
      <EditorVariablePicker {variables} hint={variablesHint} onPick={insertVariable} />
    </div>
  {/if}
{/snippet}

<FieldShell {label} {css} active={isPickerOpen} suffix={variableButton} overlay={variablePicker}>
  {#snippet children({ controlId, controlClass })}
    <!-- Inline padding: the shell's unlayered .inp rule would beat a Tailwind utility. 40px keeps
         the text clear of the variable button. -->
    <div id={controlId} class="{controlClass} flex items-center" style="padding-right: 40px" bind:this={editorRoot}></div>
  {/snippet}
</FieldShell>
