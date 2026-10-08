/**
 * Markdown → tree of blocks and inlines, with no external dependency.
 *
 * Not full CommonMark: the subset route documentation uses. Headings, paragraphs, (nested) lists,
 * tables, code, quotes, rules, and inline emphasis / code / links.
 *
 * A pure function: no DOM, no Svelte, testable alone. MarkdownView.svelte renders the tree.
 * Embedded HTML is never interpreted: it comes out as literal text.
 */

export type MdInline =
  | { type: 'text', text: string }
  | { type: 'code', text: string }
  | { type: 'bold', children: MdInline[] }
  | { type: 'italic', children: MdInline[] }
  | { type: 'strike', children: MdInline[] }
  | { type: 'link', href: string, children: MdInline[] }

export type MdAlign = 'left' | 'center' | 'right'

export interface MdListItem {
  content: MdInline[]
  /** The item's nested blocks (sub-lists, extra paragraphs). */
  children?: MdBlock[]
}

export type MdBlock =
  | { type: 'heading', level: number, children: MdInline[] }
  | { type: 'paragraph', children: MdInline[] }
  | { type: 'list', ordered: boolean, start: number, items: MdListItem[] }
  | { type: 'code', lang: string, text: string }
  | { type: 'quote', blocks: MdBlock[] }
  | { type: 'hr' }
  | { type: 'table', header: MdInline[][], align: MdAlign[], rows: MdInline[][][] }

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/** Emphasis markers in trial order: the 2-character ones first, so `**x**` is not `*` + `*x*`. */
const EMPHASIS: [string, 'bold' | 'italic' | 'strike'][] = [
  ['**', 'bold'],
  ['__', 'bold'],
  ['~~', 'strike'],
  ['*', 'italic'],
  ['_', 'italic'],
]

const isWordChar = (character: string | undefined): boolean =>
  !!character && /[0-9A-Za-zÀ-ÿ]/.test(character)

/** Allowed URL schemes; anything else is neutralized (blocks `javascript:`). */
const SAFE_SCHEME = /^(?:https?:|mailto:|tel:|[#/.])/i

const safeHref = (href: string): string => {
  const clean = href.trim()
  if (!clean) { return '#' }
  // A URL without a scheme or path prefix ("docs/x.md") is relative: fine.
  if (!clean.includes(':')) { return clean }
  return SAFE_SCHEME.test(clean) ? clean : '#'
}

/** Index where `marker` opens from `start` on, skipping escapes (`\*`); -1 when absent. */
const findClose = (source: string, start: number, marker: string): number => {
  let index = start
  while (index <= source.length - marker.length) {
    if (source[index] === '\\') { index += 2; continue }
    if (source.startsWith(marker, index)) { return index }
    index++
  }
  return -1
}

interface InlineMatch { node: MdInline, next: number }

/** `[label](url)`. The image form `![alt](url)` is read as a link too. */
const matchLink = (source: string, index: number): InlineMatch | null => {
  const open = source[index] === '!' ? index + 1 : index
  if (source[open] !== '[') { return null }
  const close = findClose(source, open + 1, ']')
  if (close < 0 || source[close + 1] !== '(') { return null }
  const end = findClose(source, close + 2, ')')
  if (end < 0) { return null }
  const href = safeHref(source.slice(close + 2, end))
  return {
    node: { type: 'link', href, children: parseInline(source.slice(open + 1, close)) },
    next: end + 1,
  }
}

const matchEmphasis = (source: string, index: number): InlineMatch | null => {
  for (const [marker, type] of EMPHASIS) {
    if (!source.startsWith(marker, index)) { continue }
    // `snake_case` is not emphasis: `_` only opens at a word boundary.
    if (marker[0] === '_' && isWordChar(source[index - 1])) { continue }
    const from = index + marker.length
    // A space right after the marker is a multiplication or a bullet, not emphasis.
    if (source[from] === ' ') { continue }
    const end = findClose(source, from, marker)
    if (end < 0 || end === from) { continue }
    return {
      node: { type, children: parseInline(source.slice(from, end)) },
      next: end + marker.length,
    }
  }
  return null
}

/** Parses the inline content of a line (emphasis, code, links). */
export const parseInline = (source: string): MdInline[] => {
  const nodes: MdInline[] = []
  let textBuffer = ''
  const flushText = () => {
    if (textBuffer) { nodes.push({ type: 'text', text: textBuffer }); textBuffer = '' }
  }

  let index = 0
  while (index < source.length) {
    const character = source[index]

    if (character === '\\' && index + 1 < source.length) {
      textBuffer += source[index + 1]; index += 2; continue
    }

    if (character === '`') {
      const end = source.indexOf('`', index + 1)
      if (end > index) {
        flushText()
        nodes.push({ type: 'code', text: source.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }

    if (character === '[' || character === '!') {
      const link = matchLink(source, index)
      if (link) { flushText(); nodes.push(link.node); index = link.next; continue }
    }

    if (character === '*' || character === '_' || character === '~') {
      const emphasis = matchEmphasis(source, index)
      if (emphasis) { flushText(); nodes.push(emphasis.node); index = emphasis.next; continue }
    }

    textBuffer += character
    index++
  }
  flushText()
  return nodes
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/
const FENCE_PATTERN = /^(?:```|~~~)\s*([\w+#-]*)\s*$/
const FENCE_END_PATTERN = /^(?:```|~~~)\s*$/
const RULE_PATTERN = /^(?:-{3,}|\*{3,}|_{3,})$/
const BULLET_ITEM_PATTERN = /^[-*+]\s+(.*)$/
const NUMBERED_ITEM_PATTERN = /^(\d{1,9})[.)]\s+(.*)$/
const QUOTE_PATTERN = /^>\s?(.*)$/
const TABLE_SEPARATOR_CELL_PATTERN = /^:?-+:?$/

/** Indentation width of a line; a tab counts as 4. */
const indentWidth = (line: string): number => {
  let width = 0
  for (const character of line) {
    if (character === ' ') { width += 1 }
    else if (character === '\t') { width += 4 }
    else { break }
  }
  return width
}

interface ListItemMatch { indent: number, ordered: boolean, start: number, text: string }

const matchListItem = (line: string): ListItemMatch | null => {
  const indent = indentWidth(line)
  const rest = line.slice(line.length - line.trimStart().length)
  // `---` is a rule, not an empty bullet.
  if (RULE_PATTERN.test(rest.trim())) { return null }

  const bullet = BULLET_ITEM_PATTERN.exec(rest)
  if (bullet) { return { indent, ordered: false, start: 1, text: bullet[1] } }

  const numbered = NUMBERED_ITEM_PATTERN.exec(rest)
  if (numbered) { return { indent, ordered: true, start: parseInt(numbered[1], 10), text: numbered[2] } }

  return null
}

/** Removes the indentation shared by a block of child lines. */
const dedent = (lines: string[]): string[] => {
  let minIndent = Infinity
  for (const line of lines) {
    if (!line.trim()) { continue }
    minIndent = Math.min(minIndent, indentWidth(line))
  }
  if (!isFinite(minIndent) || minIndent === 0) { return lines }
  return lines.map((line) => (line.trim() ? line.slice(minIndent) : line))
}

const nextNonBlank = (lines: string[], from: number): number => {
  for (let index = from; index < lines.length; index++) {
    if (lines[index].trim()) { return index }
  }
  return -1
}

/** Splits a table row into cells, honoring `\|`. */
const splitTableRow = (line: string): string[] => {
  let body = line.trim()
  if (body.startsWith('|')) { body = body.slice(1) }
  if (body.endsWith('|') && !body.endsWith('\\|')) { body = body.slice(0, -1) }

  const cells: string[] = []
  let cellBuffer = ''
  for (let index = 0; index < body.length; index++) {
    const character = body[index]
    if (character === '\\' && body[index + 1] === '|') { cellBuffer += '|'; index++; continue }
    if (character === '|') { cells.push(cellBuffer.trim()); cellBuffer = ''; continue }
    cellBuffer += character
  }
  cells.push(cellBuffer.trim())
  return cells
}

const isTableSeparator = (line: string): boolean => {
  if (!line.includes('-')) { return false }
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => TABLE_SEPARATOR_CELL_PATTERN.test(cell))
}

const alignOf = (cell: string): MdAlign => {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) { return 'center' }
  if (right) { return 'right' }
  return 'left'
}

interface BlockMatch { block: MdBlock, next: number }

const parseTable = (lines: string[], start: number): BlockMatch => {
  const header = splitTableRow(lines[start]).map(parseInline)
  const align = splitTableRow(lines[start + 1]).map(alignOf)
  const rows: MdInline[][][] = []

  let index = start + 2
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    const cells = splitTableRow(lines[index]).map(parseInline)
    // Normalized to the header's width so the grid holds.
    while (cells.length < header.length) { cells.push([]) }
    rows.push(cells.slice(0, header.length))
    index++
  }
  return { block: { type: 'table', header, align, rows }, next: index }
}

/** Blocks that cut a list item's paragraph even without a blank line before them. */
const opensExplicitBlock = (line: string): boolean => {
  const trimmed = line.trim()
  return FENCE_PATTERN.test(trimmed) || HEADING_PATTERN.test(trimmed) || QUOTE_PATTERN.test(trimmed)
}

const parseList = (lines: string[], start: number): BlockMatch => {
  const first = matchListItem(lines[start])!
  const baseIndent = first.indent
  const ordered = first.ordered
  const items: MdListItem[] = []

  /**
   * `isLeadParagraph` = still inside the item's first paragraph. While true, an indented line is
   * glued to the item's text (lazy continuation) instead of becoming a child block:
   * `1. text\n   more` is ONE paragraph. A blank line or a sub-list turns it off, and from then on
   * what follows are child blocks.
   */
  let currentItem: { text: string, childLines: string[], isLeadParagraph: boolean } | null = null
  const flushItem = () => {
    if (!currentItem) { return }
    const children = currentItem.childLines.some((line) => line.trim())
      ? parseBlocks(dedent(currentItem.childLines))
      : undefined
    items.push({ content: parseInline(currentItem.text), children })
    currentItem = null
  }

  let index = start
  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      const nextIndex = nextNonBlank(lines, index)
      if (nextIndex < 0) { break }
      const nextItem = matchListItem(lines[nextIndex])
      const belongsToList = (nextItem && nextItem.indent >= baseIndent)
        || indentWidth(lines[nextIndex]) > baseIndent
      if (!belongsToList) { break }
      if (currentItem) { currentItem.isLeadParagraph = false; currentItem.childLines.push('') }
      index++
      continue
    }

    const item = matchListItem(line)
    if (item && item.indent <= baseIndent) {
      // A change of kind (bullet ↔ numbered) closes the list.
      if (item.indent < baseIndent || item.ordered !== ordered) { break }
      flushItem()
      currentItem = { text: item.text, childLines: [], isLeadParagraph: true }
      index++
      continue
    }

    // Lazy continuation: text right after the item, indented or not, joins it. An explicit block
    // (code, heading, quote) does cut the item's paragraph.
    if (currentItem && !item && currentItem.isLeadParagraph && !opensExplicitBlock(line)) {
      currentItem.text += ' ' + line.trim()
      index++
      continue
    }
    if (currentItem && indentWidth(line) > baseIndent) {
      currentItem.isLeadParagraph = false
      currentItem.childLines.push(line)
      index++
      continue
    }
    break
  }
  flushItem()

  return { block: { type: 'list', ordered, start: first.start, items }, next: index }
}

const parseQuote = (lines: string[], start: number): BlockMatch => {
  const innerLines: string[] = []
  let index = start
  while (index < lines.length) {
    const quote = QUOTE_PATTERN.exec(lines[index])
    if (quote) { innerLines.push(quote[1]); index++; continue }
    // Lazy continuation: a text line glued to the quote.
    if (lines[index].trim() && innerLines.length > 0) { innerLines.push(lines[index]); index++; continue }
    break
  }
  return { block: { type: 'quote', blocks: parseBlocks(innerLines) }, next: index }
}

const parseFence = (lines: string[], start: number): BlockMatch => {
  const lang = FENCE_PATTERN.exec(lines[start].trim())?.[1] || ''
  const bodyLines: string[] = []
  let index = start + 1
  while (index < lines.length && !FENCE_END_PATTERN.test(lines[index].trim())) {
    bodyLines.push(lines[index])
    index++
  }
  // `index` points at the closing fence (or past the end when it never closed).
  return { block: { type: 'code', lang, text: bodyLines.join('\n') }, next: index + 1 }
}

/** Whether the line opens a block that cuts the current paragraph. */
const startsBlock = (lines: string[], index: number): boolean => {
  const line = lines[index]
  const trimmed = line.trim()
  if (!trimmed) { return true }
  if (HEADING_PATTERN.test(trimmed)) { return true }
  if (FENCE_PATTERN.test(trimmed)) { return true }
  if (RULE_PATTERN.test(trimmed)) { return true }
  if (QUOTE_PATTERN.test(trimmed)) { return true }
  if (matchListItem(line)) { return true }
  if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) { return true }
  return false
}

const parseParagraph = (lines: string[], start: number): BlockMatch => {
  const parts: string[] = [lines[start].trim()]
  let index = start + 1
  while (index < lines.length && !startsBlock(lines, index)) {
    parts.push(lines[index].trim())
    index++
  }
  return { block: { type: 'paragraph', children: parseInline(parts.join(' ')) }, next: index }
}

const parseBlocks = (lines: string[]): MdBlock[] => {
  const blocks: MdBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) { index++; continue }

    let match: BlockMatch | null = null
    if (FENCE_PATTERN.test(trimmed)) { match = parseFence(lines, index) }
    else if (RULE_PATTERN.test(trimmed)) { match = { block: { type: 'hr' }, next: index + 1 } }
    else if (HEADING_PATTERN.test(trimmed)) {
      const heading = HEADING_PATTERN.exec(trimmed)!
      // The optional closing `### Title ###` is accepted and dropped.
      const children = parseInline(heading[2].replace(/\s+#+$/, '').trim())
      match = { block: { type: 'heading', level: heading[1].length, children }, next: index + 1 }
    }
    else if (QUOTE_PATTERN.test(trimmed)) { match = parseQuote(lines, index) }
    else if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      match = parseTable(lines, index)
    }
    else if (matchListItem(line)) { match = parseList(lines, index) }
    else { match = parseParagraph(lines, index) }

    blocks.push(match.block)
    index = match.next
  }

  return blocks
}

/** Markdown text → renderable blocks. `[]` for empty input. A YAML front matter is dropped. */
export const parseMarkdown = (source: string): MdBlock[] => {
  if (!source) { return [] }
  let text = source.replace(/\r\n?/g, '\n')
  if (text.startsWith('---\n')) {
    const frontMatterEnd = text.indexOf('\n---', 4)
    if (frontMatterEnd > 0) { text = text.slice(text.indexOf('\n', frontMatterEnd + 1) + 1) }
  }
  return parseBlocks(text.split('\n'))
}
