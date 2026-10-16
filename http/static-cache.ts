import Dexie from 'dexie';

// IndexedDB cache of a GET answer (httpProps.useCacheStatic): the useCacheLocal behavior for answers
// too big for localStorage. Read straight from the page, never through the service worker, so a
// fresh answer reaches the caller without any request. Its own database: the delta cache's schema
// and cleanup do not touch it.

const STATIC_CACHE_DB_NAME = 'genix_static_cache';

interface IStaticCacheEntry {
  route: string;
  ver: number;
  // Unix milliseconds of the answer.
  savedAt: number;
  data: any;
}

class StaticCacheDatabase extends Dexie {
  responses!: Dexie.Table<IStaticCacheEntry, string>;

  constructor() {
    super(STATIC_CACHE_DB_NAME);
    this.version(1).stores({ responses: '&route' });
  }
}

let staticCacheDatabase: StaticCacheDatabase | undefined;
const getStaticCacheDatabase = () => staticCacheDatabase ??= new StaticCacheDatabase();

// The stored answer of a route at the given version, however old. Undefined when there is none, it
// was stored by another version, or IndexedDB is unavailable.
export const readStaticCache = async (route: string, ver: number): Promise<IStaticCacheEntry | undefined> => {
  if (typeof indexedDB === 'undefined') { return undefined; }
  const entry = await getStaticCacheDatabase().responses.get(route).catch(() => undefined);
  return entry?.ver === ver ? entry : undefined;
};

export const writeStaticCache = async (route: string, ver: number, data: any): Promise<void> => {
  if (typeof indexedDB === 'undefined') { return; }
  await getStaticCacheDatabase().responses.put({ route, ver, savedAt: Date.now(), data });
};
