import { describe, expect, test } from 'bun:test'
import { parseInline, parseMarkdown, type MdBlock, type MdInline } from './markdown-parser.ts'

/** Flattens an inline tree to plain text, to assert without spelling out the whole tree. */
const flatten = (nodes: MdInline[]): string =>
  nodes.map((node) => node.type === 'text' || node.type === 'code' ? node.text : flatten(node.children)).join('')

const asParagraph = (block: MdBlock) => {
  if (block.type !== 'paragraph') { throw new Error(`expected paragraph, got ${block.type}`) }
  return block
}

const asList = (block: MdBlock) => {
  if (block.type !== 'list') { throw new Error(`expected list, got ${block.type}`) }
  return block
}

const asTable = (block: MdBlock) => {
  if (block.type !== 'table') { throw new Error(`expected table, got ${block.type}`) }
  return block
}

describe('parseInline', () => {
  test('returns a single text node when there are no markers', () => {
    expect(parseInline('hello world')).toEqual([{ type: 'text', text: 'hello world' }])
  })

  test('reads bold, italic and strikethrough', () => {
    expect(parseInline('**a** *b* ~~c~~')).toEqual([
      { type: 'bold', children: [{ type: 'text', text: 'a' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: 'c' }] },
    ])
  })

  test('does not read `**` as two italics', () => {
    const nodes = parseInline('**bold**')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('bold')
  })

  test('nests emphasis', () => {
    expect(parseInline('**a *b* c**')).toEqual([{
      type: 'bold',
      children: [
        { type: 'text', text: 'a ' },
        { type: 'italic', children: [{ type: 'text', text: 'b' }] },
        { type: 'text', text: ' c' },
      ],
    }])
  })

  test('does not read the underscore of snake_case as italic', () => {
    expect(parseInline('kg_field and kg_packing')).toEqual([{ type: 'text', text: 'kg_field and kg_packing' }])
  })

  test('inline code wins over the other markers', () => {
    expect(parseInline('use `a * b` here')).toEqual([
      { type: 'text', text: 'use ' },
      { type: 'code', text: 'a * b' },
      { type: 'text', text: ' here' },
    ])
  })

  test('parses links and their label', () => {
    expect(parseInline('see [**the plan**](https://x.dev/p)')).toEqual([
      { type: 'text', text: 'see ' },
      {
        type: 'link',
        href: 'https://x.dev/p',
        children: [{ type: 'bold', children: [{ type: 'text', text: 'the plan' }] }],
      },
    ])
  })

  test('neutralizes dangerous URL schemes', () => {
    expect(parseInline('[click](javascript:alert(1))')[0]).toMatchObject({ type: 'link', href: '#' })
  })

  test('keeps relative paths, anchors and mailto', () => {
    expect(parseInline('[a](./x.md)')[0]).toMatchObject({ href: './x.md' })
    expect(parseInline('[b](#section)')[0]).toMatchObject({ href: '#section' })
    expect(parseInline('[c](mailto:a@b.cl)')[0]).toMatchObject({ href: 'mailto:a@b.cl' })
  })

  test('honors escapes', () => {
    expect(parseInline('2 \\* 3 \\* 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }])
  })

  test('leaves an unclosed marker as text', () => {
    expect(parseInline('a loose * marker')).toEqual([{ type: 'text', text: 'a loose * marker' }])
  })
})

describe('parseMarkdown: blocks', () => {
  test('returns nothing for empty or null input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown(null as unknown as string)).toEqual([])
  })

  test('parses the 6 heading levels', () => {
    const blocks = parseMarkdown('# a\n\n## b\n\n###### f')
    expect(blocks.map((block) => block.type === 'heading' && block.level)).toEqual([1, 2, 6])
  })

  test('a `#` without a space is not a heading', () => {
    expect(parseMarkdown('#hashtag')[0].type).toBe('paragraph')
  })

  test('joins contiguous lines into one paragraph', () => {
    const blocks = parseMarkdown('line one\nline two\n\nother')
    expect(blocks).toHaveLength(2)
    expect(flatten(asParagraph(blocks[0]).children)).toBe('line one line two')
    expect(flatten(asParagraph(blocks[1]).children)).toBe('other')
  })

  test('cuts the paragraph when another block starts', () => {
    expect(parseMarkdown('text\n## title').map((block) => block.type)).toEqual(['paragraph', 'heading'])
  })

  test('parses the horizontal rule', () => {
    expect(parseMarkdown('a\n\n---\n\nb').map((block) => block.type)).toEqual(['paragraph', 'hr', 'paragraph'])
  })

  test('parses code blocks without interpreting their content', () => {
    expect(parseMarkdown('```sql\nSELECT * FROM t\n-- **not** bold\n```')[0]).toEqual({
      type: 'code', lang: 'sql', text: 'SELECT * FROM t\n-- **not** bold',
    })
  })

  test('closes an unclosed code block at the end of the text', () => {
    expect(parseMarkdown('```\nabc')[0]).toEqual({ type: 'code', lang: '', text: 'abc' })
  })

  test('parses quotes and their content as blocks', () => {
    const blocks = parseMarkdown('> **Note:** deletes nothing.')
    if (blocks[0].type !== 'quote') { throw new Error('expected quote') }
    expect(flatten(asParagraph(blocks[0].blocks[0]).children)).toBe('Note: deletes nothing.')
  })

  test('prints embedded HTML as literal text', () => {
    expect(flatten(asParagraph(parseMarkdown('<b>x</b>')[0]).children)).toBe('<b>x</b>')
  })
})

describe('parseMarkdown: lists', () => {
  test('parses a bullet list', () => {
    const list = asList(parseMarkdown('- one\n- two')[0])
    expect(list.ordered).toBe(false)
    expect(list.items.map((item) => flatten(item.content))).toEqual(['one', 'two'])
  })

  test('parses a numbered list and keeps its start', () => {
    expect(parseMarkdown('3. three\n4. four')[0]).toMatchObject({ type: 'list', ordered: true, start: 3 })
  })

  test('splits a numbered list from a bullet list', () => {
    expect(parseMarkdown('- a\n1. b').map((block) => block.type === 'list' && block.ordered)).toEqual([false, true])
  })

  test('nests sub-lists by indentation', () => {
    const list = asList(parseMarkdown('- parent\n  - child a\n  - child b\n- other')[0])
    expect(list.items).toHaveLength(2)
    const nested = list.items[0].children!
    expect(nested).toHaveLength(1)
    expect(asList(nested[0]).items.map((item) => flatten(item.content))).toEqual(['child a', 'child b'])
    expect(list.items[1].children).toBeUndefined()
  })

  test('glues a continuation line to the item text instead of opening a paragraph', () => {
    const list = asList(parseMarkdown('- first part\n  and the continuation')[0])
    expect(flatten(list.items[0].content)).toBe('first part and the continuation')
    expect(list.items[0].children).toBeUndefined()
  })

  test('glues the continuation even when it is not indented', () => {
    const list = asList(parseMarkdown('1. one\ngoes on\n2. two')[0])
    expect(list.items.map((item) => flatten(item.content))).toEqual(['one goes on', 'two'])
    expect(list.items[0].children).toBeUndefined()
  })

  test('opens a child paragraph only after a blank line', () => {
    const list = asList(parseMarkdown('- one\n\n  separate paragraph\n- two')[0])
    expect(flatten(list.items[0].content)).toBe('one')
    expect(flatten(asParagraph(list.items[0].children![0]).children)).toBe('separate paragraph')
  })

  test('does not swallow the sub-list as text continuation', () => {
    const list = asList(parseMarkdown('- parent\n  - child')[0])
    expect(flatten(list.items[0].content)).toBe('parent')
    expect(list.items[0].children![0].type).toBe('list')
  })

  test('an explicit block cuts the item paragraph', () => {
    const list = asList(parseMarkdown('- one\n  ```\n  code\n  ```')[0])
    expect(flatten(list.items[0].content)).toBe('one')
    expect(list.items[0].children![0]).toMatchObject({ type: 'code', text: 'code' })
  })

  test('does not read `---` as a list item', () => {
    expect(parseMarkdown('---')[0].type).toBe('hr')
  })

  test('ends the list at the next block', () => {
    expect(parseMarkdown('- a\n- b\n\n## Title').map((block) => block.type)).toEqual(['list', 'heading'])
  })
})

describe('parseMarkdown: tables', () => {
  const table = [
    '| Rule | Field |',
    '|---|:---:|',
    '| Field Kg >= Packing Kg | `kg_packing` |',
    '| IQF Kg <= Packing Kg | `kg_iqf` |',
  ].join('\n')

  test('parses header, alignment and rows', () => {
    const block = asTable(parseMarkdown(table)[0])
    expect(block.header.map(flatten)).toEqual(['Rule', 'Field'])
    expect(block.align).toEqual(['left', 'center'])
    expect(block.rows).toHaveLength(2)
    expect(block.rows[0].map(flatten)).toEqual(['Field Kg >= Packing Kg', 'kg_packing'])
  })

  test('reads right alignments', () => {
    expect(asTable(parseMarkdown('| a | b |\n| ---: | :--- |\n| 1 | 2 |')[0]).align).toEqual(['right', 'left'])
  })

  test('pads short rows to the header width', () => {
    expect(asTable(parseMarkdown('| a | b | c |\n|---|---|---|\n| 1 |')[0]).rows[0]).toHaveLength(3)
  })

  test('honors an escaped pipe inside a cell', () => {
    expect(flatten(asTable(parseMarkdown('| a |\n|---|\n| x \\| y |')[0]).rows[0][0])).toBe('x | y')
  })

  test('a paragraph holding only a pipe is not a table', () => {
    expect(parseMarkdown('a | b\nplain text')[0].type).toBe('paragraph')
  })
})

describe('parseMarkdown: whole document', () => {
  const document = [
    '# Quick load',
    '',
    'Joins **one single load** of the three processes.',
    '',
    '## Window',
    '',
    '- `base` … `base + 6`',
    '  - out of range: ignored',
    '',
    '| Block | Base |',
    '|---|---|',
    '| Sizes | Field Kg |',
    '',
    '> Deletes no combination.',
  ].join('\n')

  test('keeps the order and kind of every block', () => {
    expect(parseMarkdown(document).map((block) => block.type))
      .toEqual(['heading', 'paragraph', 'heading', 'list', 'table', 'quote'])
  })

  test('normalizes CRLF line breaks', () => {
    expect(parseMarkdown(document.replace(/\n/g, '\r\n')).map((block) => block.type))
      .toEqual(parseMarkdown(document).map((block) => block.type))
  })

  test('drops the YAML front matter', () => {
    const blocks = parseMarkdown('---\ntitle: x\n---\n# Real')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 })
  })
})
