export type UiLanguage = 1 | 2;

export interface UiPageOption {
  id: number;
  name: string;
}

export interface UiSearchLayer {
  options: any[];
  keyName: string;
  keyID: string | number;
  onSelect: (record: any) => void;
  onClear?: () => void;
  onRemove?: (record: any) => void;
}

export interface UiDateLayer {
  selectedUnixDay: number;
  focusedUnixDay?: number;
  selectedMonthKey: number;
  label?: string;
  placeholder?: string;
  onSelect: (unixDay: number) => void;
  onClose?: () => void;
}

export type UiInMemoryImageStatus = 'converting' | 'pending' | 'uploading' | 'error';

export interface UiInMemoryImage {
  name: string;
  id: number;
  folder: string;
  base64: string;
  description?: string;
  status: UiInMemoryImageStatus;
  progress: number;
  error?: string;
  upload?: (override?: Record<string, any>) => Promise<void>;
}

export interface UiUploadProgress {
  loaded: number;
  total?: number;
}

export interface UiHttpRequest {
  data?: any;
  route: string;
  refreshRoutes?: string[];
  onUploadProgress?: (progress: UiUploadProgress) => void;
}

export interface UiNotificationAdapter {
  failure: (message: string) => void;
  success: (message: string) => void;
  warning?: (message: string) => void;
  info?: (message: string) => void;
}

export interface UiImageAdapter {
  entries: Map<string, UiInMemoryImage>;
  getBase64: (src: string) => string;
  isInFlight: (src: string) => boolean;
}

export interface UiUploadAdapter {
  get: (request: UiHttpRequest) => Promise<any>;
  post: (request: UiHttpRequest) => Promise<any>;
  convertImage: (
    source: Blob | File,
    resolution: number,
    fileType?: 'webp' | 'avif' | 'jpg',
  ) => Promise<string>;
  addProcess: (name: string, text: string, status?: 1 | 2) => number;
  updateProcess: (id: number, name?: string, text?: string, status?: 0 | 1 | 2) => void;
}

export interface UiSearchReference {
  idToRecord: Map<string | number, any>;
  valueToRecord: Map<string, any>;
}

export interface UiRecordReference<RecordType> {
  record: RecordType | null;
}

export interface UiState {
  deviceType: number;
  mobileMenuOpen: boolean;
  useTopMinimalMenu: boolean;
  headerSettingsOpen: boolean;
  pageTitle: string;
  pageOptions: UiPageOption[];
  pageOptionSelected: number;
  sideLayerId: number;
  sideLayerSize: number;
  popoverId: number | string;
  mobileSearchLayer: UiSearchLayer | null;
  mobileDateLayer: UiDateLayer | null;
  openModalIds: number[];
}

export interface UiRuntime {
  state: UiState;
  translate: <Value>(value: Value, language?: UiLanguage) => Value;
  nextComponentId: () => number;
  makeCdnRoute: (...segments: string[]) => string;
  notify: UiNotificationAdapter;
  images: UiImageAdapter;
  uploads: UiUploadAdapter;
  searchReferences: WeakMap<object, UiSearchReference>;
  persistFieldValue: (
    componentId: number,
    value: number | string | null | undefined,
  ) => void;
  readFieldValue: (componentId: number) => string | null;
  resolveRecord: <RecordType>(
    apiRoute: string,
    recordId: number,
  ) => UiRecordReference<RecordType>;
  openSideLayer: (id: number) => void;
  openModal: (id: number) => void;
  closeModal: (id: number) => void;
  closeAllModals: () => void;
}

export interface CreateUiRuntimeOptions {
  defaultLanguage?: UiLanguage;
  translate?: UiRuntime['translate'];
  nextComponentId?: UiRuntime['nextComponentId'];
  makeCdnRoute?: UiRuntime['makeCdnRoute'];
  notify?: Partial<UiNotificationAdapter>;
  images?: Partial<UiImageAdapter>;
  uploads?: Partial<UiUploadAdapter>;
  persistFieldValue?: UiRuntime['persistFieldValue'];
  readFieldValue?: UiRuntime['readFieldValue'];
  resolveRecord?: UiRuntime['resolveRecord'];
}
