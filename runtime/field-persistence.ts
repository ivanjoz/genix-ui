export interface FieldPersistenceOptions {
	getCompanyID: () => number
	getEnvironment: () => string
	storageNamespace?: string
	groupSize?: number
}

export interface FieldPersistence {
	persistFieldValue: (
		componentId: number,
		value: number | string | null | undefined,
	) => void
	readFieldValue: (componentId: number) => string | null
}

const parseEntries = (raw: string): Map<string, string> => {
	const entries = new Map<string, string>()
	for (const pair of raw.split(',')) {
		const separatorIndex = pair.indexOf(':')
		if (separatorIndex > 0) {
			entries.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1))
		}
	}
	return entries
}

export const createFieldPersistence = (
	options: FieldPersistenceOptions,
): FieldPersistence => {
	const groupSize = options.groupSize ?? 20

	const getStorageKey = (componentId: number): string | undefined => {
		if (typeof window === 'undefined' || componentId <= 0) { return }
		const companyID = options.getCompanyID()
		const environment = options.getEnvironment()
		if (!companyID || !environment) { return }

		const groupKey = Math.ceil(componentId / groupSize) * groupSize
		const namespace = options.storageNamespace ? `${options.storageNamespace}_` : ''
		return `${namespace}${environment}_${companyID}_${groupKey}`
	}

	const persistFieldValue: FieldPersistence['persistFieldValue'] = (componentId, value) => {
		const storageKey = getStorageKey(componentId)
		if (!storageKey) { return }

		const componentKey = String(componentId)
		const entries = parseEntries(localStorage.getItem(storageKey) ?? '')
		if (value === null || value === undefined || value === '') {
			entries.delete(componentKey)
		} else {
			entries.set(componentKey, String(value))
		}

		if (entries.size === 0) {
			localStorage.removeItem(storageKey)
			return
		}
		localStorage.setItem(
			storageKey,
			Array.from(entries, ([key, entryValue]) => `${key}:${entryValue}`).join(','),
		)
	}

	const readFieldValue: FieldPersistence['readFieldValue'] = (componentId) => {
		const storageKey = getStorageKey(componentId)
		if (!storageKey) { return null }
		return parseEntries(localStorage.getItem(storageKey) ?? '').get(String(componentId)) ?? null
	}

	return { persistFieldValue, readFieldValue }
}
