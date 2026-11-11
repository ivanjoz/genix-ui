import { Node } from "@tiptap/core"

/**
 * A value the consumer fills later (e.g. a client's email in an email template). group and field are
 * bilingual "English|Spanish" texts: the editor shows the variable as "Group: Field" and stores it as
 * {{name}}, so the stored text never depends on the language.
 */
export type EditorVariableOption = { name: string; group: string; field: string }

/** "Client: Email" for the label the user sees; the bare name when the variable is not in the list. */
export const editorVariableLabel = (
  variables: EditorVariableOption[], name: string, translate: (text: string) => string,
) => {
  const variable = variables.find(option => option.name === name)
  return variable ? `${translate(variable.group)}: ${translate(variable.field)}` : name
}

// The black label drawn in place of the variable. It is a node view, never saved.
const variableLabelClass = "inline-block mx-1 px-6 rounded-[4px] bg-black text-white text-[14px] leading-[22px] select-none"

/**
 * An inline, non-editable node that holds one variable. Saved as
 * <span data-variable="client.email">{{client.email}}</span> in HTML and as {{client.email}} in text,
 * so a server can find it by the {{name}} alone.
 */
export const createEditorVariableNode = (getLabel: (name: string) => string) => Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    name: { default: "", parseHTML: element => element.getAttribute("data-variable"), renderHTML: () => ({}) },
  }),
  parseHTML: () => [{ tag: "span[data-variable]" }],
  renderHTML: ({ node }) => ["span", { "data-variable": node.attrs.name }, `{{${node.attrs.name}}}`],
  renderText: ({ node }) => `{{${node.attrs.name}}}`,
  addNodeView: () => ({ node }) => {
    const labelElement = document.createElement("span")
    labelElement.className = variableLabelClass
    labelElement.textContent = getLabel(node.attrs.name)
    return { dom: labelElement }
  },
})

const escapeHTML = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

/** Plain text holding {{names}} → the one-paragraph HTML a variable editor loads, each {{name}} as a variable node. */
export const plainTextToVariableHTML = (text: string) =>
  `<p>${escapeHTML(text).replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, '<span data-variable="$1">{{$1}}</span>')}</p>`
