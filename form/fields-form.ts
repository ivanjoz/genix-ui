/** Field types FieldsForm renders. Callers map their own catalog onto these numbers. */
export const FIELD_TYPE = {
  text: 1, longText: 2, integer: 3, decimal: 4, money: 5, date: 6, select: 7, multiSelect: 8, checkbox: 9, search: 10,
} as const

export interface IFormField {
  /** Key of the field inside `values`. */
  key: string
  label: string
  type: number
  /** select, multiSelect and search: the choices, as { id, name }. */
  options?: { id: number, name: string }[]
  required?: boolean
}
