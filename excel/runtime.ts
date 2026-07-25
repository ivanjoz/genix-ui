import { init } from 'excelize-wasm';

export type ExcelizeModule = Awaited<ReturnType<typeof init>>;

export interface ExcelRuntimeOptions {
  wasmUrl?: string;
  applicationName?: string;
  translate?: <Value>(value: Value) => Value;
}

export interface ExcelRuntime {
  applicationName: string;
  translate: <Value>(value: Value) => Value;
  getExcelize: () => Promise<ExcelizeModule>;
}

const packageWasmUrl = new URL('./excelize.wasm.bin', import.meta.url).href;

export const createExcelRuntime = (options: ExcelRuntimeOptions = {}): ExcelRuntime => {
  let excelizeModulePromise: Promise<ExcelizeModule> | undefined;
  const wasmUrl = options.wasmUrl ?? packageWasmUrl;

  return {
    applicationName: options.applicationName ?? '',
    translate: options.translate ?? ((value) => value),
    getExcelize: () => {
      if (!excelizeModulePromise) {
        console.log('[excel-builder] Initializing package-owned excelize runtime:', wasmUrl);
        excelizeModulePromise = init(wasmUrl);
      }
      return excelizeModulePromise;
    },
  };
};

let defaultExcelRuntime = createExcelRuntime();

// The host configures presentation policy once; package APIs own loading and caching WASM.
export const configureExcelRuntime = (
  options: Omit<ExcelRuntimeOptions, 'wasmUrl'> = {},
): ExcelRuntime => {
  defaultExcelRuntime = createExcelRuntime(options);
  return defaultExcelRuntime;
};

export const getExcelRuntime = (): ExcelRuntime => defaultExcelRuntime;
