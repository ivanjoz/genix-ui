import type { CacheConversions } from './delta-cache.conversion.js'

export type CacheMode = 'offline' | 'updateOnly' | 'refresh' | 'fetchOnly'

export interface ServiceHttpProps {
	__enviroment__: string
	__companyID__?: number
	__accion__: number
	__client__: number
	__req__?: number
	__version__?: number
	route: string
	module?: string
	routeParsed?: string
	headers?: Record<string, string> | Headers
	keyID?: string | string[]
	keysIDs?: Record<string, string | string[]>
	columnarIDField?: string
	combineColumnarValuesOnFields?: string[]
	conversion?: CacheConversions
	fileRoute?: string
	fileSchema?: Record<string, string[]>
	fileContent?: string
	fileMissing?: boolean
	fields?: string[]
	keyFilterIfEmpty?: string
	keyForUpdated?: string
	cacheMode?: CacheMode
	// Restores the watermark-only change detection: a delta whose highest `upd`/`upv` per response
	// key matches the cache is treated as "nothing happened" and never applied. Off by default,
	// because a row rewritten in place under a fixed watermark (today's usage aggregate) carries the
	// same watermark all day, and comparing only that froze the route until the next day.
	doNothingOnSameValue?: boolean
	contentLength?: number
	partition?: {
		key: string
		value: string | number
		param?: string
	}
	status?: {
		code: number
		message: string
		metadata?: {
			preSerializeMs: number
			finalMs: number
		}
	}
	updatedStatus?: Record<string, string>
	cacheSyncTime?: number
	verifyRouteMemoryState?: boolean
	useCache?: {
		min: number
		ver: number
	}
	useCacheStatic?: {
		min: number
		ver: number
	}
}

// Preserve the established public type name while exposing an expressive canonical name.
export type serviceHttpProps = ServiceHttpProps
