import { BROWSER } from 'esm-env';
import { throttle } from '../utilities/ui.js';
import { decrypt } from '../utilities/crypto.js';
import { decodeStoredAccesosComputed, getAccesoNivelSearchRange, hasPackedAccesoInRange, normalizeAccesoNivel, wrapAccesosComputed } from './accesos.js';
import type { CreateSecurityOptions, SecurityLoginResult, SecurityLoginState, SecurityMessages, SecurityRouteAccessEntry, SecurityRuntime } from './types.js';

const DEFAULT_TOKEN_REFRESH_THRESHOLD_SECONDS = 40 * 60
const DEFAULT_TOKEN_CHECK_INTERVAL_SECONDS = 4 * 60
const DEFAULT_REFRESH_LOCK_SECONDS = 30
const AUTO_START_DELAY_MS = 1000
const EXPIRY_WARNING_THROTTLE_MS = 20

const nowUnix = () => Math.floor(Date.now() / 1000)

// Hosts override these with their own copy; English keeps the package usable as-is.
const DEFAULT_MESSAGES: SecurityMessages = {
  sessionExpired: 'The session expired, please sign in again.',
  sessionExpiresIn: (minutes) => `The session expires in ${minutes} minutes`,
}

// SSR-safe storage: on the server every read is empty and every write is a no-op.
const localStorageOrShim = BROWSER && typeof window !== 'undefined'
  ? window.localStorage
  : {
      getItem: (_key: string) => null as string | null,
      setItem: (_key: string, _value: string) => {},
      removeItem: (_key: string) => {},
    }

/**
 * Creates the session/access-control runtime: token lifecycle, cross-tab refresh lock,
 * and bit-packed access checks. Host policy (route catalog, public routes, copy,
 * post-logout navigation) is injected, so the mechanism is app-agnostic.
 */
export const createSecurity = <UserInfoType>(
  options: CreateSecurityOptions,
): SecurityRuntime<UserInfoType> => {
  const {
    storageNamespace,
    onLogout,
    notify,
    isPublicRoute,
    getCompanyID,
    tokenRefreshThresholdSeconds = DEFAULT_TOKEN_REFRESH_THRESHOLD_SECONDS,
    tokenCheckIntervalSeconds = DEFAULT_TOKEN_CHECK_INTERVAL_SECONDS,
    refreshLockSeconds = DEFAULT_REFRESH_LOCK_SECONDS,
    autoStartRefreshCheck,
  } = options

  const messages = { ...DEFAULT_MESSAGES, ...options.messages }
  // Mutable so the authenticated part of the host app can register it after creation.
  let resolveRouteAccessEntries = options.resolveRouteAccessEntries

  const key = {
    token: storageNamespace + 'UserToken',
    tokenExpTime: storageNamespace + 'TokenExpTime',
    tokenCreated: storageNamespace + 'TokenCreated',
    userInfo: storageNamespace + 'UserInfo',
    accesos: storageNamespace + 'Accesos',
    companyID: storageNamespace + 'CompanyID',
    refreshLock: storageNamespace + 'TokenRefreshLock',
  }

  const readStored = (storageKey: string) => localStorageOrShim.getItem(storageKey) || ''
  const readStoredInt = (storageKey: string) => parseInt(readStored(storageKey) || '0')

  // Decoded accesos are cached against the raw stored string, so another tab's login
  // is picked up without re-decoding on every single check.
  let cachedStoredAccesos = ''
  let accesosComputed: Uint16Array = new Uint16Array()
  let accesoResultCache = new Map<number, boolean>()
  let userInfo: UserInfoType | null = null
  let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null
  let refreshSession: () => Promise<unknown> = async () => {
    console.warn('[security] session refresher not registered')
  }

  const loadAccesosFromStorage = () => {
    const storedAccesos = readStored(key.accesos)
    if (storedAccesos === cachedStoredAccesos) { return }

    cachedStoredAccesos = storedAccesos
    accesosComputed = decodeStoredAccesosComputed(storedAccesos)
    accesoResultCache.clear()
  }

  const loadUserInfoFromStorage = () => {
    const storedUserInfo = readStored(key.userInfo)
    userInfo = storedUserInfo ? (JSON.parse(storedUserInfo) as UserInfoType) : null
  }

  const getToken = (silent?: boolean): string => {
    const userToken = readStored(key.token)
    const expTime = readStoredInt(key.tokenExpTime)
    const currentUnix = nowUnix()

    if (!userToken) {
      if (!silent) { console.error('[security] no session data found. Is the user logged in?', storageNamespace) }
      return ''
    }
    if (!expTime || currentUnix > expTime) {
      if (!silent) {
        notify?.failure?.(messages.sessionExpired)
        clearSession()
      }
      return ''
    }
    // Warn once (throttled) as the session approaches its expiration.
    const secondsToExpire = expTime - currentUnix
    if (secondsToExpire < 60 * 5) {
      throttle(() => { notify?.warning?.(messages.sessionExpiresIn(5)) }, EXPIRY_WARNING_THROTTLE_MS)
    } else if (secondsToExpire < 60 * 15) {
      throttle(() => { notify?.warning?.(messages.sessionExpiresIn(15)) }, EXPIRY_WARNING_THROTTLE_MS)
    }
    return userToken
  }

  const checkIsLogin = (): SecurityLoginState => {
    if (!BROWSER) { return 0 }
    return getToken(true) ? 2 : 3
  }

  const isLogged = (): boolean => {
    const companyID = getCompanyID ? getCompanyID() : readStoredInt(key.companyID)
    return companyID > 0 && getToken(true).length > 0
  }

  const isTokenValid = (): boolean => {
    const companyID = readStoredInt(key.companyID)
    loadAccesosFromStorage()
    return companyID > 0 && getToken(true).length > 0 && accesosComputed.length > 0
  }

  const checkAcceso = (accesoID: number, nivel?: number): boolean => {
    loadAccesosFromStorage()
    if (!accesosComputed.length || accesoID <= 0) { return false }

    const requestedNivel = normalizeAccesoNivel(nivel)
    const cacheKey = accesoID * 10 + requestedNivel
    if (!accesoResultCache.has(cacheKey)) {
      const [rangeStart, rangeEnd] = getAccesoNivelSearchRange(accesoID, requestedNivel)
      accesoResultCache.set(cacheKey, hasPackedAccesoInRange(accesosComputed, rangeStart, rangeEnd))
    }
    return accesoResultCache.get(cacheKey) || false
  }

  const canAccessRoute = (routeValue?: string | null): boolean => {
    const route = String(routeValue || '').trim() || '/'
    if (isPublicRoute?.(route)) { return true }

    // A route absent from the catalog is not access-controlled.
    const matchedAccessEntries = resolveRouteAccessEntries?.(route) || []
    if (matchedAccessEntries.length === 0) { return true }

    return matchedAccessEntries.some((accessEntry) => checkAcceso(accessEntry.id, 1))
  }

  const setUserInfo = (nextUserInfo: UserInfoType) => {
    userInfo = nextUserInfo
    localStorageOrShim.setItem(key.userInfo, JSON.stringify(nextUserInfo))
  }

  const parseLogin = async (login: SecurityLoginResult, cipherKey: string) => {
    const decryptedUserInfo = await decrypt(login.UserInfo, cipherKey)

    localStorageOrShim.setItem(key.tokenCreated, String(nowUnix()))
    localStorageOrShim.setItem(key.userInfo, decryptedUserInfo)
    localStorageOrShim.setItem(key.token, login.UserToken)
    localStorageOrShim.setItem(key.tokenExpTime, String(login.TokenExpTime))
    localStorageOrShim.setItem(key.companyID, String(login.CompanyID))
    localStorageOrShim.setItem(key.accesos, wrapAccesosComputed(login.AccesosComputed || ''))

    loadUserInfoFromStorage()
    loadAccesosFromStorage()
    startRefreshCheck()
  }

  const clearSession = () => {
    if (!BROWSER) { return }
    stopRefreshCheck()

    cachedStoredAccesos = ''
    accesosComputed = new Uint16Array()
    accesoResultCache.clear()
    userInfo = null

    for (const storageKey of Object.values(key)) {
      localStorageOrShim.removeItem(storageKey)
    }
    onLogout?.()
  }

  // TOKEN REFRESH MANAGEMENT
  // A short localStorage lock keeps parallel tabs from refreshing the same token.
  const acquireRefreshLock = (): boolean => {
    if (!BROWSER) { return false }

    const lockUnix = readStoredInt(key.refreshLock)
    const currentUnix = nowUnix()
    if (lockUnix && (currentUnix - lockUnix < refreshLockSeconds)) {
      console.log('[security] token refresh already in progress in another tab')
      return false
    }

    localStorageOrShim.setItem(key.refreshLock, String(currentUnix))
    return true
  }

  const shouldRefreshToken = (): boolean => {
    const tokenCreated = readStoredInt(key.tokenCreated)
    return tokenCreated > 0 && (nowUnix() - tokenCreated) >= tokenRefreshThresholdSeconds
  }

  const checkAndRefreshToken = async () => {
    if (!BROWSER) { return }

    if (!getToken(true)) {
      stopRefreshCheck()
      return
    }
    if (!shouldRefreshToken() || !acquireRefreshLock()) { return }
    console.log('[security] token refresh initiated')

    try {
      await refreshSession()
      console.log('[security] token refreshed successfully')
    } catch (refreshError) {
      console.error('[security] error refreshing token:', refreshError)
    } finally {
      localStorageOrShim.removeItem(key.refreshLock)
    }
  }

  const startRefreshCheck = () => {
    if (!BROWSER) { return }
    if (tokenRefreshInterval !== null) { clearInterval(tokenRefreshInterval) }

    tokenRefreshInterval = setInterval(checkAndRefreshToken, tokenCheckIntervalSeconds * 1000)
    console.log(`[security] token refresh check started every ${tokenCheckIntervalSeconds}s`)
  }

  const stopRefreshCheck = () => {
    if (tokenRefreshInterval === null) { return }
    clearInterval(tokenRefreshInterval)
    tokenRefreshInterval = null
    console.log('[security] token refresh check stopped')
  }

  const initRefreshCheck = () => {
    if (!BROWSER) { return }
    if (getToken(true) && readStored(key.tokenCreated)) { startRefreshCheck() }
  }

  loadAccesosFromStorage()
  loadUserInfoFromStorage()

  if (BROWSER && autoStartRefreshCheck) {
    // Give the host app a moment to finish booting before touching timers.
    setTimeout(initRefreshCheck, AUTO_START_DELAY_MS)
  }

  return {
    getToken,
    checkIsLogin,
    isLogged,
    isTokenValid,
    getUserInfo: () => userInfo,
    setUserInfo,
    parseLogin,
    checkAcceso,
    canAccessRoute,
    clearSession,
    setSessionRefresher: (nextRefreshSession) => { refreshSession = nextRefreshSession },
    setRouteAccessResolver: (nextResolveRouteAccessEntries: (route: string) => SecurityRouteAccessEntry[]) => {
      resolveRouteAccessEntries = nextResolveRouteAccessEntries
      accesoResultCache.clear()
    },
    startRefreshCheck,
    stopRefreshCheck,
    initRefreshCheck,
  }
}
