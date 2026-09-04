import { BROWSER } from 'esm-env';
import { throttle } from '../utilities/ui.js';
import { decrypt } from '../utilities/crypto.js';
import { decodeStoredAccesosComputed, hasAcceso, hasSubAcceso, normalizeAccesoNivel, validateAccesosBlobs, wrapAccesosComputed } from './accesos.js';
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
    // V2 because the payload changed shape, not just content: it used to be little-endian
    // uint16s and is now the raw big-endian byte blob. A stale value still decodes — into
    // accesses nobody granted — so the key is bumped to discard it instead of misreading it.
    accesos: storageNamespace + 'AccesosV2',
    accesosSub: storageNamespace + 'AccesosSub',
    companyID: storageNamespace + 'CompanyID',
    refreshLock: storageNamespace + 'TokenRefreshLock',
  }

  const readStored = (storageKey: string) => localStorageOrShim.getItem(storageKey) || ''
  const readStoredInt = (storageKey: string) => parseInt(readStored(storageKey) || '0')

  // Decoded accesos are cached against the raw stored string, so another tab's login
  // is picked up without re-decoding on every single check.
  let cachedStoredAccesos = ''
  let accesosComputed: Uint8Array = new Uint8Array()
  let accesosSubComputed: Uint8Array = new Uint8Array()
  let accesoResultCache = new Map<number, boolean>()
  let userInfo: UserInfoType | null = null
  let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null
  let refreshSession: () => Promise<unknown> = async () => {
    console.warn('[security] session refresher not registered')
  }

  const loadAccesosFromStorage = () => {
    // Both payloads under one cache marker: they are written together in one login and an access
    // lives in exactly one of them, so reloading either alone could answer from a half-old pair.
    const storedAccesos = readStored(key.accesos) + '.' + readStored(key.accesosSub)
    if (storedAccesos === cachedStoredAccesos) { return }

    cachedStoredAccesos = storedAccesos
    accesosComputed = decodeStoredAccesosComputed(readStored(key.accesos))
    accesosSubComputed = decodeStoredAccesosComputed(readStored(key.accesosSub))
    accesoResultCache.clear()

    // Ordering and framing are load-bearing for both readers, so a payload that fails validation
    // is discarded whole rather than searched. It fails closed: every check then answers false and
    // the session is treated as having no accesses.
    const validationError = validateAccesosBlobs(accesosComputed, accesosSubComputed)
    if (validationError) {
      console.warn('[security] discarding the accesos payload:', validationError)
      accesosComputed = new Uint8Array()
      accesosSubComputed = new Uint8Array()
    }
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
    // Either payload counts: a user whose only accesses carry sub-accesses holds them all in the
    // second one, and testing just the first would log them straight back out.
    const holdsAnyAcceso = accesosComputed.length > 0 || accesosSubComputed.length > 0
    return companyID > 0 && getToken(true).length > 0 && holdsAnyAcceso
  }

  // One cache for both checks, keyed on all three inputs. Keying on the access id alone — which a
  // single-payload reader could get away with — would let the first answer about an access stand in
  // for every later question about it, at another level or about a different sub-access.
  const makeAccesoCacheKey = (accesoID: number, nivel: number, subAccesoID: number): number => {
    return accesoID * 1000 + subAccesoID * 10 + nivel
  }

  const checkAcceso = (accesoID: number, nivel?: number): boolean => {
    loadAccesosFromStorage()
    if (accesoID <= 0) { return false }

    const requestedNivel = normalizeAccesoNivel(nivel)
    const cacheKey = makeAccesoCacheKey(accesoID, requestedNivel, 0)
    if (!accesoResultCache.has(cacheKey)) {
      accesoResultCache.set(cacheKey, hasAcceso(accesosComputed, accesosSubComputed, accesoID, requestedNivel))
    }
    return accesoResultCache.get(cacheKey) || false
  }

  // checkSubAcceso answers about a flag inside an access, not about reaching a route: it says
  // nothing about the level, so it is deliberately independent of checkAcceso and a caller that
  // needs both asks both. "Todos" (id 1) satisfies every check on its access.
  const checkSubAcceso = (accesoID: number, subAccesoID: number): boolean => {
    loadAccesosFromStorage()
    if (accesoID <= 0 || subAccesoID <= 0) { return false }

    const cacheKey = makeAccesoCacheKey(accesoID, 0, subAccesoID)
    if (!accesoResultCache.has(cacheKey)) {
      accesoResultCache.set(cacheKey, hasSubAcceso(accesosSubComputed, accesoID, subAccesoID))
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
    // UserInfoPlain only ever comes from a local backend answering a client that sent no cipher
    // key because it has no crypto.subtle to decrypt with (see makeCipherKey in services/login.ts).
    const decryptedUserInfo = login.UserInfoPlain || await decrypt(login.UserInfo || '', cipherKey)

    localStorageOrShim.setItem(key.tokenCreated, String(nowUnix()))
    localStorageOrShim.setItem(key.userInfo, decryptedUserInfo)
    localStorageOrShim.setItem(key.token, login.UserToken)
    localStorageOrShim.setItem(key.tokenExpTime, String(login.TokenExpTime))
    localStorageOrShim.setItem(key.companyID, String(login.CompanyID))
    localStorageOrShim.setItem(key.accesos, wrapAccesosComputed(login.AccesosComputed || ''))
    localStorageOrShim.setItem(key.accesosSub, wrapAccesosComputed(login.AccesosSubComputed || ''))

    loadUserInfoFromStorage()
    loadAccesosFromStorage()
    startRefreshCheck()
  }

  const clearSession = () => {
    if (!BROWSER) { return }
    stopRefreshCheck()

    cachedStoredAccesos = ''
    accesosComputed = new Uint8Array()
    accesosSubComputed = new Uint8Array()
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
    checkSubAcceso,
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
