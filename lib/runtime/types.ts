export type UiLanguage = 1 | 2;

export interface UiPageOption {
  id: number;
  name: string;
}

export interface UiState {
  deviceType: number;
  mobileMenuOpen: boolean;
  useTopMinimalMenu: boolean;
  headerSettingsOpen: boolean;
  pageTitle: string;
  pageOptions: UiPageOption[];
  pageOptionSelected: number;
}

export interface UiRuntime {
  state: UiState;
  translate: <Value>(value: Value, language?: UiLanguage) => Value;
}

export interface CreateUiRuntimeOptions {
  defaultLanguage?: UiLanguage;
  translate?: UiRuntime['translate'];
}
