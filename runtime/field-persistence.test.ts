import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createFieldPersistence } from './field-persistence.js'

class MemoryStorage {
	private values = new Map<string, string>()

	getItem(key: string): string | null {
		return this.values.get(key) ?? null
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value)
	}

	removeItem(key: string): void {
		this.values.delete(key)
	}
}

const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage

beforeEach(() => {
	// The persistence factory intentionally no-ops during SSR, so expose a minimal browser storage.
	Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: new MemoryStorage(),
	})
})

afterEach(() => {
	Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: originalLocalStorage,
	})
})

describe('createFieldPersistence', () => {
	test('groups component values and isolates them by tenant', () => {
		let companyID = 7
		const fields = createFieldPersistence({
			getCompanyID: () => companyID,
			getEnvironment: () => 'dev',
		})

		fields.persistFieldValue(1, 'alpha')
		fields.persistFieldValue(20, 9)
		expect(localStorage.getItem('dev_7_20')).toBe('1:alpha,20:9')
		expect(fields.readFieldValue(20)).toBe('9')

		companyID = 8
		expect(fields.readFieldValue(20)).toBeNull()
	})

	test('removes empty values and their empty storage group', () => {
		const fields = createFieldPersistence({
			getCompanyID: () => 7,
			getEnvironment: () => 'dev',
		})

		fields.persistFieldValue(21, 'value')
		fields.persistFieldValue(21, null)
		expect(localStorage.getItem('dev_7_40')).toBeNull()
	})
})
