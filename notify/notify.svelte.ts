import { MAX_VISIBLE_TOASTS, messageFromUnknown, type ToastType } from './notify.js';

export interface NotifyToast {
  id: number;
  type: ToastType;
  message: string;
}

export interface ConfirmWarnOptions {
  title: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
}

interface PendingConfirm extends Required<ConfirmWarnOptions> {
  resolve: (confirmed: boolean) => void;
}

// Module-level so plain .ts services (no component context, no useUI) can notify too.
// NotifyHost, mounted once in the host layout, renders this state.
export const notifyState = $state({
  toasts: [] as NotifyToast[],
  loading: null as { message: string; detail: string } | null,
  confirm: null as PendingConfirm | null,
});

let lastToastID = 0;

const pushToast = (type: ToastType, message: string) => {
  notifyState.toasts.push({ id: ++lastToastID, type, message });
  if (notifyState.toasts.length > MAX_VISIBLE_TOASTS) { notifyState.toasts.shift(); }
};

// Messages may be bilingual "English|Spanish": the host translates them when rendering.
export const notifySuccess = (message: string) => pushToast('success', message);
export const notifyFailure = (message: unknown) => pushToast('failure', messageFromUnknown(message));
export const notifyWarning = (message: string) => pushToast('warning', message);
export const notifyInfo = (message: string) => pushToast('info', message);

export const dismissToast = (toastID: number) => {
  const toastIndex = notifyState.toasts.findIndex((toast) => toast.id === toastID);
  if (toastIndex >= 0) { notifyState.toasts.splice(toastIndex, 1); }
};

// Blocks the screen. Calling it again while shown only replaces the message (batch progress).
export const showLoading = (message = '') => {
  notifyState.loading = { message, detail: notifyState.loading?.detail ?? '' };
};

// Second, smaller line under the loading message (e.g. download progress).
export const setLoadingDetail = (detail: string) => {
  if (notifyState.loading) { notifyState.loading.detail = detail; }
};

// Not reference-counted: one call hides the overlay whatever opened it.
export const hideLoading = () => {
  notifyState.loading = null;
};

// Red confirmation for destructive actions. Resolves true on OK, false on Cancel / Escape.
export const confirmWarn = (options: ConfirmWarnOptions): Promise<boolean> => {
  // Only one dialog at a time: a newer request cancels the one still waiting.
  notifyState.confirm?.resolve(false);
  return new Promise((resolve) => {
    notifyState.confirm = { okLabel: 'Yes|Sí', cancelLabel: 'No', ...options, resolve };
  });
};

export const answerConfirm = (confirmed: boolean) => {
  const pendingConfirm = notifyState.confirm;
  notifyState.confirm = null;
  pendingConfirm?.resolve(confirmed);
};
