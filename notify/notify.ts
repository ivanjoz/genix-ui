export type ToastType = 'success' | 'failure' | 'warning' | 'info';

// Failures stay longer: they usually explain what the user must fix.
export const TOAST_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  failure: 5000,
  warning: 4000,
  info: 3000,
};

// A burst of failed requests must not bury the screen; older toasts leave first.
export const MAX_VISIBLE_TOASTS = 5;

const UNKNOWN_ERROR_MESSAGE = 'Unknown error|Error desconocido';

// Callers pass whatever a rejected promise carried: a string, an Error, or a backend
// `{ error }` / `{ message }` payload. Turn it into readable text instead of "[object Object]".
export const messageFromUnknown = (value: unknown): string => {
  if (typeof value === 'string') { return value || UNKNOWN_ERROR_MESSAGE; }
  if (value instanceof Error) { return value.message || UNKNOWN_ERROR_MESSAGE; }
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    for (const key of ['error', 'message']) {
      if (typeof payload[key] === 'string' && payload[key]) { return payload[key] as string; }
    }
    return JSON.stringify(value);
  }
  return value === null || value === undefined ? UNKNOWN_ERROR_MESSAGE : String(value);
};
