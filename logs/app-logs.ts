import Dexie, { type EntityTable } from 'dexie'
import { clipLogText, logValueText, MAX_LOG_LABEL_CHARS, MAX_LOG_VALUE_CHARS } from './app-log-text.js'

// The app log: one timeline of what happened in this browser, for support and debugging. The page
// (components, navigation, requests, toasts, errors) and the service worker (cache syncs) both push
// into it; entries are buffered and written to IndexedDB once per second, so logging never waits on
// a write. It never leaves the browser on its own: the header's Logs tab shows it, and the chat
// agent reads it through a page command when it diagnoses a problem.

// Kinds of entry, in the order a user's session usually produces them.
export type AppLogKind =
  | 'app'      // lifecycle: app start, session, online/offline, tab hidden/visible, service worker
  | 'nav'      // a page was opened
  | 'click'    // a button was pressed
  | 'input'    // a field changed its value
  | 'layer'    // a modal, side layer or popup opened or closed
  | 'tab'      // a tab or view switch
  | 'message'  // a toast, confirm dialog or loading overlay shown to the user
  | 'request'  // an API call made by the page (method, route, status, time, records, API error)
  | 'sync'     // a service worker cache sync (cache read, delta cursor, records received)
  | 'error'    // an uncaught error, an unhandled rejection or a console.error
  | 'warning'  // a console.warn
  | 'agent'    // the chat agent acted on the page (the component logs the effect itself too)

export interface IAppLog {
  id?: number
  time: number // unix milliseconds
  kind: AppLogKind
  route: string // the page's pathname when pushed; '' from the service worker
  label: string
  value: string
}

// 48h covers "it failed yesterday afternoon"; the row cap bounds a tab left open for days.
const LOG_RETENTION_MS = 48 * 60 * 60 * 1000
const MAX_STORED_LOGS = 20_000
const FLUSH_DELAY_MS = 1000
const PRUNE_INTERVAL_MS = 60 * 60 * 1000
// The buffer only grows past this when IndexedDB keeps failing: the oldest entries go first.
const MAX_BUFFERED_LOGS = 2000

class AppLogsDatabase extends Dexie {
  logs!: EntityTable<IAppLog, 'id'>

  constructor() {
    super('genix_app_logs')
    this.version(1).stores({ logs: '++id,time' })
  }
}

let appLogsDatabase: AppLogsDatabase | null = null
const getAppLogsDatabase = (): AppLogsDatabase => {
  appLogsDatabase ??= new AppLogsDatabase()
  return appLogsDatabase
}

const pendingLogs: IAppLog[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastPruneTime = 0

const currentRoute = (): string => (typeof window === 'undefined' ? '' : window.location.pathname)

// pushAppLog records one entry. Safe from any context (page or service worker) and never throws.
export const pushAppLog = (kind: AppLogKind, label: string, value?: unknown): void => {
  pendingLogs.push({
    time: Date.now(),
    kind,
    route: currentRoute(),
    label: clipLogText(label || '', MAX_LOG_LABEL_CHARS),
    value: clipLogText(logValueText(value), MAX_LOG_VALUE_CHARS),
  })
  if (pendingLogs.length > MAX_BUFFERED_LOGS) { pendingLogs.splice(0, pendingLogs.length - MAX_BUFFERED_LOGS) }
  flushTimer ??= setTimeout(() => { void flushAppLogs() }, FLUSH_DELAY_MS)
}

// flushAppLogs writes the buffered entries. A failed write puts them back for the next flush; it is
// not reported to the console, which the app log captures, so a broken IndexedDB can't feed itself.
export const flushAppLogs = async (): Promise<void> => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (pendingLogs.length === 0) { return }
  const logsToWrite = pendingLogs.splice(0, pendingLogs.length)
  try {
    await getAppLogsDatabase().logs.bulkAdd(logsToWrite)
    if (Date.now() - lastPruneTime > PRUNE_INTERVAL_MS) { await pruneAppLogs() }
  } catch {
    pendingLogs.unshift(...logsToWrite)
  }
}

const pruneAppLogs = async (): Promise<void> => {
  lastPruneTime = Date.now()
  const logsTable = getAppLogsDatabase().logs
  await logsTable.where('time').below(Date.now() - LOG_RETENTION_MS).delete()
  const storedCount = await logsTable.count()
  if (storedCount > MAX_STORED_LOGS) {
    const oldestKeptLog = await logsTable.orderBy('time').offset(storedCount - MAX_STORED_LOGS).first()
    if (oldestKeptLog) { await logsTable.where('time').below(oldestKeptLog.time).delete() }
  }
}

export interface ReadAppLogsOptions {
  limit: number
  // Only entries at or after this unix-ms time; 0 reads the whole retention window.
  sinceTime?: number
}

// readAppLogs returns the newest `limit` entries, oldest first, with this context's buffer included.
// Entries from the service worker show up once it flushes them (within a second).
export const readAppLogs = async (options: ReadAppLogsOptions): Promise<IAppLog[]> => {
  await flushAppLogs()
  const newestLogs = await getAppLogsDatabase().logs
    .where('time').aboveOrEqual(options.sinceTime || 0)
    .reverse().limit(options.limit).toArray()
  return newestLogs.reverse()
}

// clearAppLogs empties the log: a different user signing in on this browser must not see, nor
// hand their agent, what the previous one did.
export const clearAppLogs = async (): Promise<void> => {
  pendingLogs.length = 0
  await getAppLogsDatabase().logs.clear()
}
