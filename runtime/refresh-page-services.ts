import { getPageCachedRoutesByModule } from '../http/page-services-registry.js';
import { sendServiceMessage } from '../service-worker/client.js';

// The header refresh button reloads the page, but a reload alone changes nothing: the delta cache
// answers from IndexedDB while each route is still inside its useCache window. So before reloading
// we hand the service worker the routes this page read and it flags them (forceNetwork) — the flag
// lives in IndexedDB, survives the reload, and makes the very next read of each route hit the
// server. It is consumed once per route, so the pages the user did not ask to refresh keep their
// cache. The request stays a delta: the watermark is still sent and the server answers with the
// changes only.
export const markPageServicesForRefresh = async (pathname?: string): Promise<number> => {
  const routesByModule = getPageCachedRoutesByModule(pathname);
  if (routesByModule.size === 0) {
    console.warn('[PageServices] No cached service was registered for this page.');
    return 0;
  }

  const refreshResults = await Promise.all(
    [...routesByModule.entries()].map(([module, routes]) => {
      console.log('[PageServices] Forcing next fetch for:', { module, routes });
      return sendServiceMessage(24, { module, routes, exact: true });
    }),
  );

  return refreshResults.reduce(
    (markedRoutes, result) => markedRoutes + Number(result?.routesUpdated || 0),
    0,
  );
};
