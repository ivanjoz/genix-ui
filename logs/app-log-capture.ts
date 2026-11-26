import { consoleArgsText, logValueText } from './app-log-text.js'
import { flushAppLogs, pushAppLog } from './app-logs.js'

// The context-wide sources of the app log: uncaught errors, unhandled promise rejections and
// console.error / console.warn, where the code reports the errors it catches. The page also logs
// its environment, connectivity, tab visibility and the service worker taking over.

// captureErrorsAndConsole hooks one global scope (the page's window or the service worker's self).
// labelPrefix tells the service worker's entries from the page's.
const captureErrorsAndConsole = (globalScope: typeof globalThis, labelPrefix: string) => {
  globalScope.addEventListener('error', (errorEvent: Event) => {
    const { error, message, filename, lineno, colno } = errorEvent as ErrorEvent
    // A resource that failed to load (img, script) arrives here too, with no error object.
    const errorText = error ? logValueText(error) : `${message || errorEvent.type} (${filename}:${lineno}:${colno})`
    pushAppLog('error', `${labelPrefix}Uncaught error`, errorText)
  })
  globalScope.addEventListener('unhandledrejection', (rejectionEvent: Event) => {
    pushAppLog('error', `${labelPrefix}Unhandled promise rejection`, (rejectionEvent as PromiseRejectionEvent).reason)
  })

  const originalConsoleError = console.error.bind(console)
  const originalConsoleWarn = console.warn.bind(console)
  console.error = (...consoleArgs: unknown[]) => {
    pushAppLog('error', `${labelPrefix}console.error`, consoleArgsText(consoleArgs))
    originalConsoleError(...consoleArgs)
  }
  console.warn = (...consoleArgs: unknown[]) => {
    pushAppLog('warning', `${labelPrefix}console.warn`, consoleArgsText(consoleArgs))
    originalConsoleWarn(...consoleArgs)
  }
}

let isCapturingPage = false

// startAppLogCapture: once, at the page's start. appDescription names the build (app, version).
export const startAppLogCapture = (appDescription = ''): void => {
  if (isCapturingPage || typeof window === 'undefined') { return }
  isCapturingPage = true

  // The first entry describes the environment, the first thing to ask about a bug report.
  pushAppLog('app', 'App started', [
    appDescription,
    navigator.userAgent,
    `viewport ${window.innerWidth}x${window.innerHeight}`,
    `language ${navigator.language}`,
    navigator.onLine ? 'online' : 'offline',
  ].filter(Boolean).join(' · '))

  captureErrorsAndConsole(window, '')
  window.addEventListener('online', () => pushAppLog('app', 'Connection restored'))
  window.addEventListener('offline', () => pushAppLog('app', 'Connection lost'))
  document.addEventListener('visibilitychange', () => {
    pushAppLog('app', document.visibilityState === 'hidden' ? 'Tab hidden' : 'Tab visible')
    // A hidden tab may be discarded without notice: write what is buffered now.
    if (document.visibilityState === 'hidden') { void flushAppLogs() }
  })
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    pushAppLog('app', 'Service worker replaced', navigator.serviceWorker.controller?.scriptURL)
  })
}

// startServiceWorkerLogCapture: once, at the top level of the service worker script.
export const startServiceWorkerLogCapture = (): void => {
  captureErrorsAndConsole(self, 'Service worker ')
}
