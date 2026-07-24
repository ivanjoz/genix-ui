export interface CacheGetRequest {
	route: string
}

export interface CacheNavigateOptions {
	noScroll?: boolean
	replaceState?: boolean
	keepFocus?: boolean
}

export interface CacheRuntime {
	getCompanyID: () => number
	getEnvironment: () => string
	get: (request: CacheGetRequest) => Promise<any>
	navigate: (target: string, options?: CacheNavigateOptions) => void | Promise<void>
}

// Cache state is process-wide, so the host injects its active tenant and IO capabilities once.
let cacheRuntime: CacheRuntime = {
	getCompanyID: () => 0,
	getEnvironment: () => 'main',
	get: () => Promise.reject(new Error('Cache GET adapter is not configured.')),
	navigate: (target, options) => {
		if (typeof location === 'undefined') { return }
		options?.replaceState ? location.replace(target) : location.assign(target)
	},
}

export const configureCacheRuntime = (runtime: CacheRuntime): CacheRuntime => {
	cacheRuntime = runtime
	return cacheRuntime
}

export const getCacheRuntime = (): CacheRuntime => cacheRuntime
