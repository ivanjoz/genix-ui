// localStorage cache of a GET answer (httpProps.useCacheLocal). Unlike useCache (IndexedDB through the
// service worker, asynchronous), it can be read synchronously, so a value needed on the first render
// (a catalog the page shell depends on) is there before any request answers.

const LOCAL_CACHE_KEY_PREFIX = 'genix_local_cache:';

interface ILocalCacheEntry {
  ver: number;
  // Unix milliseconds of the answer.
  savedAt: number;
  data: any;
}

// The stored answer of a route at the given version, however old: a page may render with it while a
// fresh one loads. Undefined when there is none, or it was stored by another version.
export const readLocalCache = (route: string, ver: number): ILocalCacheEntry | undefined => {
  if (typeof localStorage === 'undefined') { return undefined; }
  const rawEntry = localStorage.getItem(LOCAL_CACHE_KEY_PREFIX + route);
  if (!rawEntry) { return undefined; }
  try {
    const entry = JSON.parse(rawEntry) as ILocalCacheEntry;
    return entry.ver === ver ? entry : undefined;
  } catch {
    return undefined;
  }
};

export const writeLocalCache = (route: string, ver: number, data: any): void => {
  if (typeof localStorage === 'undefined') { return; }
  const entry: ILocalCacheEntry = { ver, savedAt: Date.now(), data };
  localStorage.setItem(LOCAL_CACHE_KEY_PREFIX + route, JSON.stringify(entry));
};
