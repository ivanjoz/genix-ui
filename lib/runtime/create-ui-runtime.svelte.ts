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
  let componentIdCounter = 0;
  const state = $state<UiState>({
    deviceType: 1,
    mobileMenuOpen: false,
    useTopMinimalMenu: false,
    headerSettingsOpen: false,
    pageTitle: '',
    pageOptions: [],
    pageOptionSelected: 1,
    sideLayerId: 0,
    sideLayerSize: 0,
    popoverId: 0,
    mobileSearchLayer: null,
    mobileDateLayer: null,
    openModalIds: [],
  });

  const runtime: UiRuntime = {
    state,
    translate: options.translate ?? ((value, language) =>
      translateBilingualValue(value, language ?? defaultLanguage)),
    nextComponentId: options.nextComponentId ?? (() => ++componentIdCounter),
    makeCdnRoute: options.makeCdnRoute ?? ((...segments) =>
      segments.filter(Boolean).join('/')),
    notify: {
      failure: options.notify?.failure ?? ((message) => console.error(message)),
      success: options.notify?.success ?? (() => {}),
      warning: options.notify?.warning,
      info: options.notify?.info,
    },
    images: {
      entries: options.images?.entries ?? new Map(),
      getBase64: options.images?.getBase64 ?? (() => ''),
      isInFlight: options.images?.isInFlight ?? (() => false),
    },
    uploads: {
      get: options.uploads?.get ?? (() => Promise.reject(new Error('UI GET adapter is not configured.'))),
      post: options.uploads?.post ?? (() => Promise.reject(new Error('UI upload adapter is not configured.'))),
      convertImage: options.uploads?.convertImage ??
        (() => Promise.reject(new Error('UI image conversion adapter is not configured.'))),
      addProcess: options.uploads?.addProcess ?? (() => 0),
      updateProcess: options.uploads?.updateProcess ?? (() => {}),
    },
    searchReferences: new WeakMap(),
    persistFieldValue: options.persistFieldValue ?? (() => {}),
    readFieldValue: options.readFieldValue ?? (() => null),
    resolveRecord: options.resolveRecord ?? (() => ({ record: null })),
    openSideLayer: (id) => {
      state.sideLayerId = id;
    },
    openModal: (id) => {
      if (!state.openModalIds.includes(id)) { state.openModalIds.push(id); }
    },
    closeModal: (id) => {
      const modalIndex = state.openModalIds.indexOf(id);
      if (modalIndex >= 0) { state.openModalIds.splice(modalIndex, 1); }
    },
    closeAllModals: () => {
      state.openModalIds.length = 0;
    },
  };

  return runtime;
};
