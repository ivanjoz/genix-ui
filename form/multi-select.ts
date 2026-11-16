import type { AgentOption } from '../agent/registry';

// Shared by SelectMultiple (form field) and CellMultiSelect (VTable cell): both open the same
// MultiSelectLayer and expose the same agent options.

export type MultiSelectOptionID = string | number;

export interface MultiSelectItem<E> {
  option: E;
  isSelected: boolean;
}

// Selected options go first so they can be removed without scrolling; both groups honor the filter.
export function buildMultiSelectItems<E>(
  options: E[], selectedIDs: MultiSelectOptionID[], filterValue: string, keyId: keyof E, keyName: keyof E,
): MultiSelectItem<E>[] {
  const matchesFilter = (option: E) => !filterValue || String(option[keyName] || '').toLowerCase().includes(filterValue);
  const optionsByID = new Map(options.map((option) => [option[keyId] as MultiSelectOptionID, option]));
  const selectedSet = new Set(selectedIDs);
  const selectedOptions = selectedIDs.map((selectedID) => optionsByID.get(selectedID)).filter((option): option is E => option != null);
  return [
    ...selectedOptions.filter(matchesFilter).map((option) => ({ option, isSelected: true })),
    ...options.filter((option) => !selectedSet.has(option[keyId] as MultiSelectOptionID) && matchesFilter(option))
      .map((option) => ({ option, isSelected: false })),
  ];
}

// The agent sends ids as text or numbers while an option id may be either: try both.
export function findOptionsByIDs<E>(optionsByID: Map<MultiSelectOptionID, E>, rawIDs: MultiSelectOptionID[]): E[] {
  return rawIDs
    .map((rawID) => optionsByID.get(rawID) || optionsByID.get(Number(rawID)) || optionsByID.get(String(rawID)))
    .filter((option): option is E => option != null);
}

// The first `maxOptions` rows of the list as the agent reads them; 0 = all of them.
export function toMultiSelectAgentOptions<E>(items: MultiSelectItem<E>[], keyId: keyof E, keyName: keyof E, maxOptions = 50): AgentOption[] {
  return items
    .slice(0, Math.max(0, maxOptions | 0) || items.length)
    .map(({ option }) => ({ ID: option[keyId] as MultiSelectOptionID, Value: String(option[keyName] ?? '') }));
}
