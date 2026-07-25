import {
  configureCacheRuntime,
  getRecordWithCache,
  getRecordsByID,
} from '../cache/index.js';
import { configureExcelRuntime } from '../excel/runtime.js';
import { createImageConverter } from '../files/image-converter.js';
import { createInMemoryImageStore } from '../files/in-memory-images.svelte.js';
import {
  createHttpClient,
  type GetHandlerRuntime,
} from '../http/index.js';
import { BROWSER } from 'esm-env';
import {
  configureServiceWorkerRuntime,
  fetchCacheParsed,
  sendServiceMessage,
} from '../service-worker/index.js';
import { createSecurity, type SecurityRuntime } from '../security/index.js';
import { createFieldPersistence } from './field-persistence.js';
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

export const createUiRuntime = <UserInfoType = unknown>(
  options: CreateUiRuntimeOptions,
): UiRuntime & { security: SecurityRuntime<UserInfoType> } => {
  const verifyRouteMemoryState = options.verifyRouteMemoryState ?? (() => false);
  const notifyFailure = options.notify?.failure ?? ((message: string) => console.error(message));
  const defaultLanguage = options.defaultLanguage ?? 1;
  const getPathname = options.getPathname
    ?? (() => (BROWSER ? window.location.pathname : ''));
  let componentIdCounter = 0;

  // The session runtime is created here so the whole application is configured in one
  // call: HTTP authorization and cached-service route guards read from this instance.
  const security = createSecurity<UserInfoType>({
    ...options.security,
    storageNamespace: options.security?.storageNamespace
      ?? options.storageNamespace
      ?? options.applicationName
      ?? 'app',
    notify: options.notify,
    getCompanyID: options.getCompanyID,
  });

  const images = createInMemoryImageStore();
  const imageConverter = createImageConverter({ notifyFailure });
  const fieldPersistence = createFieldPersistence({
    getCompanyID: options.getCompanyID,
    getEnvironment: options.getEnvironment,
    storageNamespace: options.storageNamespace,
  });

  // Package subsystems share the same routing, tenant, and presentation policy.
  configureExcelRuntime({
    applicationName: options.applicationName,
    translate: options.translate,
  });
  configureServiceWorkerRuntime({
    getWorkerUrl: options.getWorkerUrl,
    getEnvironment: options.getEnvironment,
    getCompanyID: options.getCompanyID,
    makeRoute: options.makeRoute,
    verifyRouteMemoryState,
    reportFetch: options.reportFetch ?? (() => {}),
    reportProgress: options.reportProgress ?? (() => {}),
    notifyFailure,
  });

  const http = createHttpClient({
    makeRoute: options.makeRoute,
    getToken: options.getToken ?? (() => security.getToken()),
    notify: options.notify,
    onUnauthorized: options.onUnauthorized ?? (() => security.clearSession()),
    startRequest: options.startRequest,
    finishRequest: options.finishRequest,
    fetchCached: fetchCacheParsed,
    refreshRoutes: (routes) => sendServiceMessage(24, { routes }),
    verifyRouteMemoryState,
  });

  configureCacheRuntime({
    getCompanyID: options.getCompanyID,
    getEnvironment: options.getEnvironment,
    get: http.GET,
    navigate: options.navigate,
  });

  const getHandlerRuntime: GetHandlerRuntime = {
    makeRoute: options.makeRoute,
    buildHeaders: http.buildHeaders,
    fetchCached: fetchCacheParsed,
    post: http.POST,
    getRecordsByID,
    // Cached services must not fetch for a page the user cannot open, so the guard
    // checks the current path rather than the service route.
    canAccessRoute: options.canAccessRoute ?? (() => security.canAccessRoute(getPathname())),
    verifyRouteMemoryState,
    notifyFailure,
  };

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

  const runtime: UiRuntime & { security: SecurityRuntime<UserInfoType> } = {
    state,
    http,
    getHandlerRuntime,
    security,
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
    images,
    imageConverter,
    fieldPersistence,
    uploads: {
      get: http.GET,
      post: http.POST_XMLHR,
      convertImage: imageConverter.fileToImage,
      addProcess: options.addProcess ?? (() => 0),
      updateProcess: options.updateProcess ?? (() => {}),
    },
    searchReferences: new WeakMap(),
    persistFieldValue: fieldPersistence.persistFieldValue,
    readFieldValue: fieldPersistence.readFieldValue,
    resolveRecord: ((apiRoute: string, recordId: number) =>
      getRecordWithCache(apiRoute, recordId)) as UiRuntime['resolveRecord'],
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
