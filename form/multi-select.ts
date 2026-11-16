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

// useBitmask stores the selection as one number: option id n is bit n-1 (id 1 = 1, id 2 = 2,
// id 3 = 4…). Ids stop at 31 so the mask stays a positive int32 — JS bit operators are signed
// 32-bit, and bit 31 would turn it negative.
export const MAX_BITMASK_ID = 31;

export function isBitmaskID(optionID: unknown): boolean {
  return Number.isInteger(optionID) && (optionID as number) >= 1 && (optionID as number) <= MAX_BITMASK_ID;
}

export function bitmaskToIDs(mask: number): number[] {
  const selectedIDs: number[] = [];
  for (let optionID = 1; optionID <= MAX_BITMASK_ID; optionID++) {
    if (mask & (1 << (optionID - 1))) { selectedIDs.push(optionID); }
  }
  return selectedIDs;
}

export function idsToBitmask(selectedIDs: MultiSelectOptionID[]): number {
  return selectedIDs.reduce<number>((mask, optionID) => mask | (1 << (Number(optionID) - 1)), 0);
}

// The first `maxOptions` rows of the list as the agent reads them; 0 = all of them.
export function toMultiSelectAgentOptions<E>(items: MultiSelectItem<E>[], keyId: keyof E, keyName: keyof E, maxOptions = 50): AgentOption[] {
  return items
    .slice(0, Math.max(0, maxOptions | 0) || items.length)
    .map(({ option }) => ({ ID: option[keyId] as MultiSelectOptionID, Value: String(option[keyName] ?? '') }));
}
