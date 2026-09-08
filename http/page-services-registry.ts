// The delta cache decides on its own whether a read reaches the server, so nothing in the app
// otherwise knows which API routes a page depends on: a page served entirely from IndexedDB issues
// no request at all. Every cached read therefore registers itself here, under the frontend path
// that was open at the time, so the header refresh button can mark exactly those routes for a
// forced network fetch on the next reload.

export interface PageCachedService {
  route: string
  module: string
}

const cachedServicesByPathname = new Map<string, Map<string, PageCachedService>>()
let readCurrentPathname: () => string = () => ''

export const configurePageServicesRegistry = (getPathname: () => string) => {
  readCurrentPathname = getPathname
}

export const registerPageCachedService = (route: string, module: string) => {
  const pathname = readCurrentPathname()
  if (!pathname || !route) { return }

  let servicesOfPath = cachedServicesByPathname.get(pathname)
  if (!servicesOfPath) {
    servicesOfPath = new Map()
    cachedServicesByPathname.set(pathname, servicesOfPath)
  }
  servicesOfPath.set(`${module}::${route}`, { route, module })
}

export const getPageCachedServices = (pathname?: string): PageCachedService[] => {
  const pathnameToRead = pathname || readCurrentPathname()
  return [...(cachedServicesByPathname.get(pathnameToRead)?.values() || [])]
}

// Routes are marked per module, so callers that talk to the service worker group them first.
export const getPageCachedRoutesByModule = (pathname?: string): Map<string, string[]> => {
  const routesByModule = new Map<string, string[]>()
  for (const service of getPageCachedServices(pathname)) {
    const routesOfModule = routesByModule.get(service.module) || []
    routesOfModule.push(service.route)
    routesByModule.set(service.module, routesOfModule)
  }
  return routesByModule
}
