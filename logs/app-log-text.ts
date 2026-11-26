// Pure helpers that turn whatever a component, a request or a console call hands the app log into
// short, readable text. No IndexedDB, no DOM: unit-tested in app-log-text.test.ts.

export const MAX_LOG_LABEL_CHARS = 200
export const MAX_LOG_VALUE_CHARS = 2000

// clipLogText keeps a log line bounded: one pasted document or a huge payload must not bloat the log.
export const clipLogText = (text: string, maximumChars: number): string => {
  return text.length <= maximumChars ? text : text.slice(0, maximumChars - 1) + '…'
}

// logValueText renders a logged value: an Error as its message and first stack lines, an object as
// JSON (circular ones fall back to String), empty values as "".
export const logValueText = (value: unknown): string => {
  if (value === undefined || value === null) { return '' }
  if (typeof value === 'string') { return value }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') { return String(value) }
  if (value instanceof Error) {
    // The first stack frames are enough to find the failing call; the rest is framework noise.
    const stackLines = (value.stack || '').split('\n').slice(1, 5).map((stackLine) => stackLine.trim())
    return [`${value.name}: ${value.message}`, ...stackLines].join('\n')
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

// consoleArgsText joins the arguments of a console.error / console.warn call the way the console
// prints them: strings as they are, everything else through logValueText.
export const consoleArgsText = (consoleArgs: unknown[]): string => {
  return consoleArgs.map(logValueText).filter(Boolean).join(' ')
}

// optionLogValue is how select-like fields log their choice: "[id] text", or "" when cleared.
export const optionLogValue = (optionID: unknown, optionText?: unknown): string => {
  if (optionID === undefined || optionID === null || optionID === '') { return '' }
  return `[${logValueText(optionID)}] ${logValueText(optionText)}`.trim()
}

// countResponseRecords counts the records of an API answer: the length of an array, or the sum of
// the arrays of an object keyed by record type ({ products: [...], prices: [...] }).
export const countResponseRecords = (response: unknown): number => {
  if (Array.isArray(response)) { return response.length }
  if (!response || typeof response !== 'object') { return 0 }
  let recordsCount = 0
  for (const responseValue of Object.values(response as Record<string, unknown>)) {
    if (Array.isArray(responseValue)) { recordsCount += responseValue.length }
  }
  return recordsCount
}
