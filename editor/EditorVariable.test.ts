import { describe, expect, it } from 'vitest'
import { editorVariableLabel, plainTextToVariableHTML } from './EditorVariable'

describe('editor variables', () => {
  it('turns each {{name}} of plain text into a variable node and escapes the rest', () => {
    expect(plainTextToVariableHTML('Hi {{client.name}} & <b>{{ quote.total }}</b>')).toBe(
      '<p>Hi <span data-variable="client.name">{{client.name}}</span> &amp; &lt;b&gt;<span data-variable="quote.total">{{quote.total}}</span>&lt;/b&gt;</p>',
    )
    expect(plainTextToVariableHTML('')).toBe('<p></p>')
  })

  it('labels a variable as "Group: Field", or by its name when unknown', () => {
    const variables = [{ name: 'client.email', group: 'Client|Cliente', field: 'Email|Email' }]
    const spanish = (text: string) => text.split('|')[1] ?? text
    expect(editorVariableLabel(variables, 'client.email', spanish)).toBe('Cliente: Email')
    expect(editorVariableLabel(variables, 'owner.name', spanish)).toBe('owner.name')
  })
})
