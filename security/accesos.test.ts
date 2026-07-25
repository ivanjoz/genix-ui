import { describe, expect, it } from 'bun:test'
import {
	decodeStoredAccesosComputed,
	getAccesoNivelSearchRange,
	hasPackedAccesoInRange,
	makeAccesoNivelUint16,
	normalizeAccesoNivel,
	wrapAccesosComputed,
} from './accesos'

// Mirrors the backend encoder: sorted little-endian uint16 values, then base64.
const packAccesosToBase64 = (packedValues: number[]): string => {
	const sortedValues = [...packedValues].sort((left, right) => left - right)
	const valueBytes = new Uint8Array(sortedValues.length * 2)
	sortedValues.forEach((packedValue, valueIndex) => {
		valueBytes[valueIndex * 2] = packedValue & 0xff
		valueBytes[valueIndex * 2 + 1] = (packedValue >> 8) & 0xff
	})
	return btoa(String.fromCharCode(...valueBytes))
}

const buildStoredAccesos = (grants: [accesoID: number, nivel: number][]): string => {
	return wrapAccesosComputed(packAccesosToBase64(
		grants.map(([accesoID, nivel]) => makeAccesoNivelUint16(accesoID, nivel)),
	))
}

const hasAcceso = (storedAccesos: string, accesoID: number, nivel: number): boolean => {
	const [rangeStart, rangeEnd] = getAccesoNivelSearchRange(accesoID, nivel)
	return hasPackedAccesoInRange(decodeStoredAccesosComputed(storedAccesos), rangeStart, rangeEnd)
}

describe('normalizeAccesoNivel', () => {
	it('clamps out-of-range levels to the lowest one', () => {
		expect(normalizeAccesoNivel(3)).toBe(3)
		expect(normalizeAccesoNivel(undefined)).toBe(1)
		expect(normalizeAccesoNivel(0)).toBe(1)
		expect(normalizeAccesoNivel(5)).toBe(1)
	})
})

describe('makeAccesoNivelUint16', () => {
	it('packs the access id and level exactly like the backend', () => {
		expect(makeAccesoNivelUint16(1, 1)).toBe(4)
		expect(makeAccesoNivelUint16(1, 4)).toBe(7)
		expect(makeAccesoNivelUint16(120, 2)).toBe(481)
	})
})

describe('stored accesos payload', () => {
	it('round-trips a wrapped payload', () => {
		const storedAccesos = buildStoredAccesos([[10, 2], [37, 1]])
		expect(Array.from(decodeStoredAccesosComputed(storedAccesos)))
			.toEqual([makeAccesoNivelUint16(10, 2), makeAccesoNivelUint16(37, 1)])
	})

	it('rejects tampered or truncated payloads instead of granting accesses', () => {
		const storedAccesos = buildStoredAccesos([[10, 4]])
		const tamperedAccesos = 'zz' + storedAccesos.substring(2)

		expect(decodeStoredAccesosComputed(tamperedAccesos).length).toBe(0)
		expect(decodeStoredAccesosComputed('abc').length).toBe(0)
		expect(decodeStoredAccesosComputed('').length).toBe(0)
	})
})

describe('access level resolution', () => {
	it('lets a higher granted level satisfy a lower request', () => {
		const storedAccesos = buildStoredAccesos([[10, 3]])

		expect(hasAcceso(storedAccesos, 10, 1)).toBe(true)
		expect(hasAcceso(storedAccesos, 10, 3)).toBe(true)
		expect(hasAcceso(storedAccesos, 10, 4)).toBe(false)
	})

	it('does not leak grants across access ids', () => {
		const storedAccesos = buildStoredAccesos([[10, 4], [12, 1]])

		expect(hasAcceso(storedAccesos, 11, 1)).toBe(false)
		expect(hasAcceso(storedAccesos, 12, 2)).toBe(false)
		expect(hasAcceso(storedAccesos, 12, 1)).toBe(true)
	})
})
