import { init } from 'excelize-wasm';

export type ExcelizeModule = Awaited<ReturnType<typeof init>>;

export interface ExcelRuntimeOptions {
  wasmUrl: string;
  applicationName?: string;
  translate?: <Value>(value: Value) => Value;
}

export interface ExcelRuntime {
  applicationName: string;
  translate: <Value>(value: Value) => Value;
  getExcelize: () => Promise<ExcelizeModule>;
}

export const createExcelRuntime = (options: ExcelRuntimeOptions): ExcelRuntime => {
  let excelizeModulePromise: Promise<ExcelizeModule> | undefined;

  return {
    applicationName: options.applicationName ?? '',
    translate: options.translate ?? ((value) => value),
    getExcelize: () => {
      if (!excelizeModulePromise) {
        console.log('[excel-builder] Initializing excelize-wasm runtime:', options.wasmUrl);
        excelizeModulePromise = init(options.wasmUrl);
      }
      return excelizeModulePromise;
    },
  };
};
