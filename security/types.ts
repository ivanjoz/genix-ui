// Minimal shape of the backend login response the security runtime consumes.
// `UserInfo` is the AES-GCM ciphered JSON of the host's own user type.
export interface SecurityLoginResult {
  UserToken: string
  // Exactly one of the two arrives: UserInfo AES-GCM-ciphered with the cipher key the client sent,
  // or UserInfoPlain when it sent none. See parseLogin.
  UserInfo?: string
  UserInfoPlain?: string
  AccesosComputed?: string
  // The accesses that carry at least one granted sub-access. Separate payload because which one an
  // access is in is itself the "has sub-accesses" flag; see security/accesos.ts.
  AccesosSubComputed?: string
  TokenExpTime: number
  CompanyID: number
}

// One access entry of the host's route→access catalog. Only the id is needed here.
export interface SecurityRouteAccessEntry { id: number }

// Session messages live in the host so the package stays language-agnostic.
export interface SecurityMessages {
  sessionExpired: string
  sessionExpiresIn: (minutes: number) => string
}

export interface SecurityNotifier {
  failure?: (message: string) => void
  warning?: (message: string) => void
}

export interface CreateSecurityOptions {
  // Prefix for every persisted key, so several apps can share one origin.
  storageNamespace: string
  // Called after the session is cleared: the host decides where to send the user.
  onLogout?: () => void
  messages?: Partial<SecurityMessages>
  notify?: SecurityNotifier
  // Resolves which access ids unlock a frontend route. No catalog → route is open.
  // Apps whose catalog must stay out of a public bundle register it after creation
  // with setRouteAccessResolver instead of importing it here.
  resolveRouteAccessEntries?: (route: string) => SecurityRouteAccessEntry[]
  isPublicRoute?: (route: string) => boolean
  getCompanyID?: () => number
  tokenRefreshThresholdSeconds?: number
  tokenCheckIntervalSeconds?: number
  refreshLockSeconds?: number
  // Starts the refresh checker shortly after creation when a session already exists.
  autoStartRefreshCheck?: boolean
}

// 0 = server side (unknown), 2 = logged in, 3 = client without a valid token.
export type SecurityLoginState = 0 | 2 | 3

export interface SecurityRuntime<UserInfoType> {
  getToken: (silent?: boolean) => string
  checkIsLogin: () => SecurityLoginState
  isLogged: () => boolean
  isTokenValid: () => boolean
  getUserInfo: () => UserInfoType | null
  setUserInfo: (userInfo: UserInfoType) => void
  parseLogin: (login: SecurityLoginResult, cipherKey: string) => Promise<void>
  checkAcceso: (accesoID: number, nivel?: number) => boolean
  // A flag inside an access the session already holds. Says nothing about the level: a caller that
  // needs both asks both.
  checkSubAcceso: (accesoID: number, subAccesoID: number) => boolean
  canAccessRoute: (route?: string | null) => boolean
  clearSession: () => void
  // Registered by the host login service, avoiding a circular import.
  setSessionRefresher: (refreshSession: () => Promise<unknown>) => void
  // Registered by the authenticated part of the host app, so a public bundle sharing
  // this runtime never statically imports the access catalog.
  setRouteAccessResolver: (
    resolveRouteAccessEntries: (route: string) => SecurityRouteAccessEntry[],
  ) => void
  startRefreshCheck: () => void
  stopRefreshCheck: () => void
  initRefreshCheck: () => void
}
