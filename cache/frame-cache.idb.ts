import Dexie from 'dexie'
import { getCacheRuntime } from './runtime.js'

const FRAME_CACHE_DB_VERSION = 1
const LOG_PREFIX = '[frame-cache:idb]'
const frameCacheDatabasesByName = new Map<string, FrameCacheDatabase>()

/** A raw DataFrame file as the browser keeps it: the bytes the route sent, decoded on each read. */
export interface IFrameFileRow {
	route: string
	frame: string
	// keys '_'-joined: the file's identity inside route + frame.
	fileKey: string
	keys: number[]
	// The frame build the file belongs to; a rebuild drops every file of the older one.
	generation: string
	snapshot: number
	slot: number
	content: Uint8Array
}

// Its own database: the delta cache's tables share one schema version across classes, and frame
// files have nothing to do with them.
class FrameCacheDatabase extends Dexie {
	frameFiles!: Dexie.Table<IFrameFileRow, [string, string, string]>

	constructor(databaseName: string) {
		super(databaseName)
		this.version(FRAME_CACHE_DB_VERSION).stores({
			frameFiles: '[route+frame+fileKey],[route+frame]',
		})
	}
}

const makeFrameCacheDatabaseName = (): string => {
	const runtime = getCacheRuntime()
	return `${runtime.getCompanyID() || 0}_frames_${runtime.getEnvironment() || 'main'}`
}

const getFrameCacheDatabase = (): FrameCacheDatabase => {
	const databaseName = makeFrameCacheDatabaseName()
	let database = frameCacheDatabasesByName.get(databaseName)
	if (!database) {
		database = new FrameCacheDatabase(databaseName)
		frameCacheDatabasesByName.set(databaseName, database)
	}
	return database
}

export const makeFrameFileKey = (keys: number[]): string => keys.join('_')

/** readFrameFileRows returns every file held of a route's frame (a frame holds tens of files). */
export const readFrameFileRows = async (route: string, frame: string): Promise<IFrameFileRow[]> => {
	try {
		return await getFrameCacheDatabase().frameFiles.where('[route+frame]').equals([route, frame]).toArray()
	} catch (error) {
		console.warn(`${LOG_PREFIX} Failed to read files.`, { route, frame }, error)
		return []
	}
}

/**
 * storeFrameFileRows writes the files a route answered. With dropsOthers (a new generation), every
 * other file of the frame goes first, in the same transaction.
 */
export const storeFrameFileRows = async (route: string, frame: string, rows: IFrameFileRow[], dropsOthers: boolean): Promise<void> => {
	const database = getFrameCacheDatabase()
	try {
		await database.transaction('rw', database.frameFiles, async () => {
			if (dropsOthers) {
				await database.frameFiles.where('[route+frame]').equals([route, frame]).delete()
			}
			await database.frameFiles.bulkPut(rows)
		})
		console.debug(`${LOG_PREFIX} Files stored.`, { route, frame, files: rows.length, dropsOthers })
	} catch (error) {
		console.warn(`${LOG_PREFIX} Failed to store files.`, { route, frame }, error)
	}
}

/** clearFrameCache deletes the frame files of the current tenant and environment. */
export const clearFrameCache = async (): Promise<void> => {
	const databaseName = makeFrameCacheDatabaseName()
	frameCacheDatabasesByName.get(databaseName)?.close()
	frameCacheDatabasesByName.delete(databaseName)
	await Dexie.delete(databaseName)
	console.debug(`${LOG_PREFIX} Cache cleared.`, { databaseName })
}
