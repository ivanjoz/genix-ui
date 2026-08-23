import { BROWSER } from 'esm-env'
import {
	type CacheConversions,
	type CacheMode,
	type IMinimalRecord,
	type serviceHttpProps,
} from '../cache/index.js'
import { normalizeStringN } from '../utilities/index.js'

export interface INewIDToID {
	ID: number
	TempID: number
}

export interface GetHandlerRecord {
	ID: number
	ss?: number
}

export interface GetHandlerPostRequest {
	data: unknown
	route: string
	refreshRoutes: string[]
}

export interface GetHandlerRuntime {
	makeRoute: (route: string) => string
	buildHeaders: (contentType?: string, route?: string) => Record<string, string>
	fetchCached: (request: serviceHttpProps) => Promise<unknown>
	post: (request: GetHandlerPostRequest) => Promise<unknown>
	getRecordsByID: <T extends IMinimalRecord>(
		route: string,
		ids: number[],
	) => Promise<Map<number, T>>
	isBrowser?: () => boolean
	canAccessRoute?: (route: string) => boolean
	verifyRouteMemoryState?: () => boolean
	normalizeName?: (name: unknown) => string
	notifyFailure?: (message: string) => void
}

export class GetHandler<T extends GetHandlerRecord = any> {
	route = ''
	routeByID = ''
	module = 'a'
	keyID: string | string[] = ''
	keysIDs: Record<string, string | string[]> = {}
	columnarIDField = ''
	combineColumnarValuesOnFields: string[] = []
	useCache: { min: number, ver: number } | undefined
	// Opt back into watermark-only change detection: a delta whose highest watermark equals the
	// cached one is discarded instead of applied. Only correct when the watermark moves on every
	// write; a route that rewrites a live aggregate row under a fixed watermark must leave this off.
	doNothingOnSameValue = false
	conversion: CacheConversions | undefined
	// A snapshot can seed the first cache sync instead of downloading the complete API list.
	fileRoute = ''
	fileSchema: Record<string, string[]> | undefined

	handler(_response: unknown): void {}
	isReady = $state(0)

	routePost = ''
	refreshRoutes: string[] = []
	tempToNewID = new Map<number, number>()
	nextTempID = -1
	recordsMap: Map<number, T> = $state(new Map())
	nameToRecordMap = new Map<string, T>()
	records: T[] = $state([])
	prependOnSave?: boolean
	inferRemoveFromStatus?: boolean
	// Preserve legacy behavior by default; disable it when callers need post failures to reject.
	returnEmptyOnPostFailure = true

	constructor(protected readonly runtime: GetHandlerRuntime) {}

	makeName(_record: Partial<T>): string { return '' }
	onTempRecordAdded(_record: T): void {}
	onTempRecordSynced(_record: T, _tempID: number, _newID: number): void {}
	afterSaveRecords(..._records: T[]): void {}

	makeProps(cacheMode?: CacheMode): serviceHttpProps {
		return {
			routeParsed: this.runtime.makeRoute(this.route),
			route: this.route,
			useCache: this.useCache,
			module: this.module,
			headers: this.runtime.buildHeaders('json', this.route),
			cacheMode,
			doNothingOnSameValue: this.doNothingOnSameValue,
			verifyRouteMemoryState: this.runtime.verifyRouteMemoryState?.() ?? false,
			keyID: this.keyID,
			keysIDs: this.keysIDs,
			columnarIDField: this.columnarIDField,
			combineColumnarValuesOnFields: this.combineColumnarValuesOnFields,
			conversion: this.conversion,
			fileRoute: this.fileRoute || undefined,
			fileSchema: this.fileSchema,
		} as serviceHttpProps
	}

	private canFetch(): boolean {
		if (!(this.runtime.isBrowser?.() ?? BROWSER)) return false
		if (!this.route) {
			this.runtime.notifyFailure?.('No route was specified for the cached service.')
			return false
		}
		if (this.runtime.canAccessRoute && !this.runtime.canAccessRoute(this.route)) {
			console.warn(`[GetHandler] Route access denied: ${this.route}`)
			return false
		}
		return true
	}

	private handleResponse(response: unknown): boolean {
		if (!response) return false
		if (typeof response === 'object') {
			delete (response as { __version__?: number }).__version__
		}
		this.handler(response)
		return true
	}

	async fetchOnline(): Promise<void> {
		if (!this.canFetch()) return
		console.debug(`[GetHandler] Refreshing route: ${this.route}`)
		this.handleResponse(await this.runtime.fetchCached(this.makeProps('refresh')))
		this.isReady++
	}

	async fetchCached(): Promise<void> {
		if (!this.canFetch()) return
		console.debug(`[GetHandler] Reading cached route: ${this.route}`)
		this.handleResponse(await this.runtime.fetchCached(this.makeProps()))
		this.isReady++
	}

	async syncIDs(ids: number[]): Promise<void> {
		if (!this.routeByID) {
			this.runtime.notifyFailure?.(`[GetHandler] Missing routeByID for: ${this.route}`)
			return
		}

		const missingIDs = [...new Set(
			ids.filter((recordID) => recordID > 0 && !this.recordsMap.has(recordID)),
		)]
		console.debug(
			`[GetHandler] syncIDs:start route=${this.route}`
			+ ` byID=${this.routeByID} requested=${ids.length} missing=${missingIDs.length}`,
		)
		if (missingIDs.length === 0) return

		try {
			const fetchedRecordsByID = await this.runtime.getRecordsByID<T & IMinimalRecord>(
				this.routeByID,
				missingIDs,
			)
			const fetchedRecords = [...fetchedRecordsByID.values()]
			if (fetchedRecords.length > 0) this.addSavedRecords(...fetchedRecords)
			console.debug(
				`[GetHandler] syncIDs:end route=${this.route}`
				+ ` byID=${this.routeByID} merged=${fetchedRecords.length}`,
			)
		} catch (syncIDsError) {
			console.error(
				`[GetHandler] syncIDs:error route=${this.route} byID=${this.routeByID}`,
				syncIDsError,
			)
			throw syncIDsError
		}
	}

	async fetch(): Promise<void> {
		if (!this.canFetch()) return

		console.debug(`[GetHandler] Loading offline route: ${this.route}`)
		this.handleResponse(await this.runtime.fetchCached(this.makeProps('offline')))
		this.isReady++

		// updateOnly returns no payload when the server has no changes.
		console.debug(`[GetHandler] Synchronizing route: ${this.route}`)
		if (this.handleResponse(await this.runtime.fetchCached(this.makeProps('updateOnly')))) {
			this.isReady++
		}
	}

	addSavedRecords(...records: T[]): void {
		console.debug(`[GetHandler] Merging route=${this.route} records=${records.length}`)
		const normalizeName = this.runtime.normalizeName ?? normalizeStringN
		const recordsToKeep: T[] = []

		for (const record of records) {
			// ss=0 is the shared tombstone convention for cached Svelte services.
			this.recordsMap.set(record.ID, record)
			const shouldRemoveByStatus = this.inferRemoveFromStatus && record.ss === 0
			const normalizedRecordName = normalizeName(this.makeName(record))

			if (shouldRemoveByStatus) {
				if (normalizedRecordName) this.nameToRecordMap.delete(normalizedRecordName)
				for (const [nameKey, indexedRecord] of this.nameToRecordMap.entries()) {
					if (indexedRecord.ID === record.ID) this.nameToRecordMap.delete(nameKey)
				}
				continue
			}

			if (normalizedRecordName) this.nameToRecordMap.set(normalizedRecordName, record)
			recordsToKeep.push(record)
		}

		const currentIDs = new Set(this.records.map((existingRecord) => existingRecord.ID))
		const incomingIDs = new Set(records.map((incomingRecord) => incomingRecord.ID))
		const incomingRecordByID = new Map(
			recordsToKeep.map((incomingRecord) => [incomingRecord.ID, incomingRecord]),
		)
		const updatedExistingRecords: T[] = []

		for (const existingRecord of this.records) {
			if (!incomingIDs.has(existingRecord.ID)) {
				updatedExistingRecords.push(existingRecord)
				continue
			}
			const updatedRecord = incomingRecordByID.get(existingRecord.ID)
			if (updatedRecord) updatedExistingRecords.push(updatedRecord)
		}

		const newRecords = recordsToKeep.filter(
			(incomingRecord) => !currentIDs.has(incomingRecord.ID),
		)
		this.records = this.prependOnSave
			? [...newRecords, ...updatedExistingRecords]
			: [...updatedExistingRecords, ...newRecords]
	}

	setTempID(record: T): number {
		if (!record.ID) record.ID = this.nextTempID--
		if (record.ID <= 0) this.tempToNewID.set(record.ID, 0)
		return record.ID
	}

	addTempRecord(record: T): T {
		const existingRecord = this.getByName(record)
		if (existingRecord) {
			record.ID = existingRecord.ID
			return existingRecord
		}
		if (record.ID > 0) return record

		// Negative IDs let the UI reference records before the backend assigns a permanent ID.
		this.setTempID(record)
		if (!record.ss) record.ss = 1
		this.recordsMap.set(record.ID, record)

		const normalizedName = (this.runtime.normalizeName ?? normalizeStringN)(this.makeName(record))
		if (normalizedName) this.nameToRecordMap.set(normalizedName, record)
		this.onTempRecordAdded(record)
		console.debug(`[GetHandler] Temporary record created: route=${this.route} id=${record.ID}`)
		return record
	}

	get(id: number): T | undefined {
		return this.recordsMap.get(id)
	}

	getByName(record: Partial<T>): T | undefined {
		const normalizedName = (this.runtime.normalizeName ?? normalizeStringN)(this.makeName(record))
		return normalizedName ? this.nameToRecordMap.get(normalizedName) : undefined
	}

	getTempRecords(): T[] {
		return [...this.recordsMap.values()].filter((record) => record.ID < 0)
	}

	clearTempRecords(tempIDs?: Set<number>): void {
		for (const [recordID] of this.recordsMap.entries()) {
			if (recordID < 0 && (!tempIDs || tempIDs.has(recordID))) {
				this.recordsMap.delete(recordID)
			}
		}
		for (const [normalizedName, record] of this.nameToRecordMap.entries()) {
			if (record.ID < 0 && (!tempIDs || tempIDs.has(record.ID))) {
				this.nameToRecordMap.delete(normalizedName)
			}
		}
	}

	async post(records: T[], requestWrapper?: Record<string, unknown>): Promise<INewIDToID[]> {
		if (requestWrapper) requestWrapper.records = records
		const routeToPost = this.routePost || this.route
		console.debug(`[GetHandler] Posting route=${routeToPost} records=${records.length}`)

		try {
			return await this.runtime.post({
				data: requestWrapper || records,
				route: routeToPost,
				refreshRoutes: [this.route, ...this.refreshRoutes],
			}) as INewIDToID[]
		} catch (postError) {
			console.error(`[GetHandler] Post failed: route=${routeToPost}`, postError)
			if (this.returnEmptyOnPostFailure) return []
			throw postError
		}
	}

	async postAndSync(
		records: T[],
		requestWrapper?: Record<string, unknown>,
	): Promise<Map<number, number>> {
		for (const record of records) this.setTempID(record)

		const idMappings = await this.post(records, requestWrapper)
		const tempToNewIDs = new Map<number, number>()

		for (const mapping of idMappings) {
			if (!mapping || mapping.ID <= 0 || mapping.TempID === 0) continue
			tempToNewIDs.set(mapping.TempID, mapping.ID)
			this.tempToNewID.set(mapping.TempID, mapping.ID)

			for (const record of records) {
				if (record.ID !== mapping.TempID) continue
				if (mapping.TempID < 0) this.recordsMap.delete(mapping.TempID)
				record.ID = mapping.ID
				this.onTempRecordSynced(record, mapping.TempID, mapping.ID)
			}
		}

		this.addSavedRecords(...records)
		this.afterSaveRecords(...records)
		return tempToNewIDs
	}

	async syncTempRecords(
		requestWrapper?: Record<string, unknown>,
	): Promise<Map<number, number>> {
		const pendingRecords = this.getTempRecords()
		if (pendingRecords.length === 0) return new Map()

		console.debug(
			`[GetHandler] Synchronizing temporary records:`
			+ ` route=${this.route} records=${pendingRecords.length}`,
		)
		const tempToNewIDs = await this.postAndSync(pendingRecords, requestWrapper)
		const syncedTempIDs = new Set(
			[...tempToNewIDs.keys()].filter((tempID) => tempID < 0),
		)
		this.clearTempRecords(syncedTempIDs)
		console.debug(
			`[GetHandler] Temporary records synchronized:`
			+ ` route=${this.route} records=${tempToNewIDs.size}`,
		)
		return tempToNewIDs
	}
}
