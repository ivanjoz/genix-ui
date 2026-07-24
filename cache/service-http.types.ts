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
