import { describe, expect, it } from 'bun:test'
import { concatenateInts, concatenateUint16s } from './parsers.js'

// Mirrors the backend's parseConcatenatedUint16s so the two encoders are tested against each other.
const decodeUint16s = (encoded: string): number[] => {
	if (!encoded) return []
	const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
	const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
	return [...new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))]
}

describe('concatenateUint16s', () => {
	it('preserves order across mixed magnitudes', () => {
		// This is the whole point: concatenateInts would split these into u8 and u16 buckets and
		// reorder them, silently misaligning cc-ver against cc-ids.
		const versions = [7, 40000, 3, 65535, 0, 255, 256]
		expect(decodeUint16s(concatenateUint16s(versions))).toEqual(versions)

		const magnitudeBucketed = concatenateInts(versions)
		expect(magnitudeBucketed).not.toEqual(concatenateUint16s(versions))
	})

	it('encodes an empty list as an empty string', () => {
		expect(concatenateUint16s([])).toBe('')
	})

	it('wraps values past uint16 rather than corrupting the byte length', () => {
		expect(decodeUint16s(concatenateUint16s([65536, 65537]))).toEqual([0, 1])
	})
})
