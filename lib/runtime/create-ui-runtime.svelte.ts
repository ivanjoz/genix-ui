import type {
  CreateUiRuntimeOptions,
  UiLanguage,
  UiRuntime,
  UiState,
} from './types.js';

const translateBilingualValue = <Value>(value: Value, language: UiLanguage): Value => {
  if (typeof value !== 'string' || !value.includes('|')) { return value; }
  const variants = value.split('|');
  const selectedIndex = language === 2 ? 0 : 1;
  return ((variants[selectedIndex] ?? variants[0]).trim() as Value);
};

export const createUiRuntime = (options: CreateUiRuntimeOptions = {}): UiRuntime => {
  const defaultLanguage = options.defaultLanguage ?? 1;
  const state = $state<UiState>({
    deviceType: 1,
    mobileMenuOpen: false,
    useTopMinimalMenu: false,
    headerSettingsOpen: false,
    pageTitle: '',
    pageOptions: [],
    pageOptionSelected: 1,
  });

  return {
    state,
    translate: options.translate ?? ((value, language) =>
      translateBilingualValue(value, language ?? defaultLanguage)),
  };
};
