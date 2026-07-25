import { describe, expect, it } from 'bun:test'
import { normalizeStringN } from './string'

describe('normalizeStringN', () => {
	it('normalizes names for stable lookup keys', () => {
		expect(normalizeStringN('  Café del Niño - 2  ')).toBe('cafe_del_nino_2_')
	})

	it('preserves numbers and rejects unsupported values', () => {
		expect(normalizeStringN(42)).toBe('42')
		expect(normalizeStringN(null)).toBe('')
	})
})
