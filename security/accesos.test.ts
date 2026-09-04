import { describe, expect, it } from 'bun:test'
import {
	decodeStoredAccesosComputed,
	findAccesoNivel,
	findAccesoSubGrant,
	hasAcceso,
	hasSubAcceso,
	makeAccesoNivelPacked,
	MAX_SUB_ACCESO_ID,
	normalizeAccesoNivel,
	SUB_ACCESO_TODOS_ID,
	unpackAccesoNivel,
	validateAccesosBlobs,
	wrapAccesosComputed,
} from './accesos'

// This is the third hand-written parser of the grant format; the other two are
// backend/core/accesos-blob.go and fareward/src/limiter/access.rs. The bytes below are written by
// hand rather than produced by a local encoder, for the same reason the Go test is: endianness and
// bit positions cannot fail loudly — read the wrong way round these bytes still decode, into a
// different access or a different sub-access.
const bytesToBase64 = (blobBytes: number[]): string => {
	return btoa(String.fromCharCode(...blobBytes))
}

const storeBlob = (blobBytes: number[]): string => wrapAccesosComputed(bytesToBase64(blobBytes))

const decodeBlob = (blobBytes: number[]): Uint8Array => decodeStoredAccesosComputed(storeBlob(blobBytes))

describe('normalizeAccesoNivel', () => {
	it('clamps out-of-range levels to the lowest one', () => {
		expect(normalizeAccesoNivel(3)).toBe(3)
		expect(normalizeAccesoNivel(undefined)).toBe(1)
		expect(normalizeAccesoNivel(0)).toBe(1)
		expect(normalizeAccesoNivel(5)).toBe(1)
	})
})

describe('the grant word', () => {
	it('packs the access id and level exactly like the backend', () => {
		expect(makeAccesoNivelPacked(1, 1)).toBe(4)
		expect(makeAccesoNivelPacked(1, 4)).toBe(7)
		expect(makeAccesoNivelPacked(34, 4)).toBe(139)
		expect(makeAccesoNivelPacked(120, 2)).toBe(481)
	})

	it('round-trips through the unpacker', () => {
		expect(unpackAccesoNivel(makeAccesoNivelPacked(34, 4))).toEqual([34, 4])
		expect(unpackAccesoNivel(makeAccesoNivelPacked(16383, 1))).toEqual([16383, 1])
	})

	// The Go twin is TestTheGrantWordIsBigEndian: acceso 34 nivel 4 = 0x008B.
	it('is read big-endian out of the blob', () => {
		expect(findAccesoNivel(decodeBlob([0x00, 0x8b]), 34)).toBe(4)
		// Read little-endian the same bytes would answer about acceso 8896 instead, and quietly.
		expect(findAccesoNivel(decodeBlob([0x00, 0x8b]), 8896)).toBe(0)
	})
})

describe('stored accesos payload', () => {
	it('rejects tampered or truncated payloads instead of granting accesses', () => {
		const storedAccesos = storeBlob([0x00, 0x8b])

		expect(decodeStoredAccesosComputed('zz' + storedAccesos.substring(2)).length).toBe(0)
		expect(decodeStoredAccesosComputed('abc').length).toBe(0)
		expect(decodeStoredAccesosComputed('').length).toBe(0)
	})
})

describe('access level resolution', () => {
	// accesos_computed for accesos 3 nivel 1 (0x000C) and 16 nivel 4 (0x0043).
	const accesosComputed = decodeBlob([0x00, 0x0c, 0x00, 0x43])
	const noSubAccesos = new Uint8Array()

	it('lets a higher granted level satisfy a lower request', () => {
		expect(hasAcceso(accesosComputed, noSubAccesos, 16, 1)).toBe(true)
		expect(hasAcceso(accesosComputed, noSubAccesos, 16, 4)).toBe(true)
		expect(hasAcceso(accesosComputed, noSubAccesos, 3, 1)).toBe(true)
		expect(hasAcceso(accesosComputed, noSubAccesos, 3, 2)).toBe(false)
	})

	it('does not leak grants across access ids', () => {
		expect(hasAcceso(accesosComputed, noSubAccesos, 4, 1)).toBe(false)
		expect(hasAcceso(accesosComputed, noSubAccesos, 15, 1)).toBe(false)
		expect(hasAcceso(accesosComputed, noSubAccesos, 0, 1)).toBe(false)
	})
})

// The risk this exists for: an access lives in exactly ONE payload, so a check that misses
// accesos_computed must also scan accesos_sub_computed. Missing that second lookup fails closed — a
// user is denied something they hold — which is silent in exactly the way a permission bug should
// not be. The Rust twin is `an_access_is_found_in_either_blob`.
describe('an access held only in the sub payload', () => {
	// acceso 10 nivel 2 = 0x0029, then one sub byte with subs 1 and 3 set.
	const accesosSubComputed = decodeBlob([0x00, 0x29, 0x05])
	const emptyAccesos = new Uint8Array()

	it('is still granted', () => {
		expect(hasAcceso(emptyAccesos, accesosSubComputed, 10, 1)).toBe(true)
		expect(hasAcceso(emptyAccesos, accesosSubComputed, 10, 2)).toBe(true)
		expect(hasAcceso(emptyAccesos, accesosSubComputed, 10, 3)).toBe(false)
	})

	it('carries its sub-access mask', () => {
		expect(findAccesoSubGrant(accesosSubComputed, 10)).toEqual([2, 0b101])
		expect(findAccesoSubGrant(accesosSubComputed, 9)).toEqual([0, 0])
		expect(findAccesoSubGrant(accesosSubComputed, 11)).toEqual([0, 0])
	})

	// Subs 2 and 3 without Todos, because the shared fixture above holds bit 0 and Todos satisfies
	// every check on its access — a mask containing it can never show a sub-access being refused.
	it('resolves each declared sub-access independently', () => {
		const subsTwoAndThree = decodeBlob([0x00, 0x29, 0x06])

		expect(hasSubAcceso(subsTwoAndThree, 10, 2)).toBe(true)
		expect(hasSubAcceso(subsTwoAndThree, 10, 3)).toBe(true)
		expect(hasSubAcceso(subsTwoAndThree, 10, 1)).toBe(false)
		expect(hasSubAcceso(subsTwoAndThree, 10, 4)).toBe(false)
		// An access that is not in this payload holds no sub-access, whatever else it holds.
		expect(hasSubAcceso(subsTwoAndThree, 16, 2)).toBe(false)
	})
})

describe('sub-access bit positions', () => {
	it('spills into a second byte only from sub 8 onwards', () => {
		expect(findAccesoSubGrant(decodeBlob([0x00, 0x29, 0x7f]), 10)).toEqual([2, 0b1111111])
		expect(findAccesoSubGrant(decodeBlob([0x00, 0x29, 0x80, 0x01]), 10)).toEqual([2, 0b10000000])
	})

	// The near-miss worth pinning, and the one that produced a wrong hand-written fixture while this
	// format was being written: sub 13 is bit 12, which lands at bit 5 of the second byte (0x20),
	// not bit 6 (0x40). Nothing about 0x40 looks wrong, and it would grant sub 14 instead.
	it('puts sub 13 at bit 5 of the second byte', () => {
		const bothEnds = decodeBlob([0x00, 0x29, 0x81, 0x20])

		expect(findAccesoSubGrant(bothEnds, 10)).toEqual([2, 0b1000000000001])
		expect(hasSubAcceso(bothEnds, 10, MAX_SUB_ACCESO_ID)).toBe(true)

		const wrongByHalfABit = decodeBlob([0x00, 0x29, 0x80, 0x40])
		expect(hasSubAcceso(wrongByHalfABit, 10, MAX_SUB_ACCESO_ID)).toBe(false)
	})
})

// "Todos" is the one piece of catalog meaning the daemon deliberately does not know: it returns the
// raw mask, and bit 0 is expanded here and in Go.
describe('the Todos expansion', () => {
	const todosOnly = decodeBlob([0x00, 0x29, 0x01])

	it('satisfies every sub-access of its own access', () => {
		for (let subAccesoID = 1; subAccesoID <= MAX_SUB_ACCESO_ID; subAccesoID++) {
			expect(hasSubAcceso(todosOnly, 10, subAccesoID)).toBe(true)
		}
	})

	it('does not reach another access, or an id outside the range', () => {
		expect(hasSubAcceso(todosOnly, 11, SUB_ACCESO_TODOS_ID)).toBe(false)
		expect(hasSubAcceso(todosOnly, 10, 0)).toBe(true) // Todos answers before the range check
		expect(hasSubAcceso(decodeBlob([0x00, 0x29, 0x02]), 10, MAX_SUB_ACCESO_ID + 1)).toBe(false)
	})
})

// Ordering and framing are load-bearing: the fixed-stride payload is binary searched and the
// variable one is walked by position. The []uint16 payload this replaced was defensively re-sorted
// on load; that cannot survive here, so a bad payload is rejected loudly instead.
describe('validateAccesosBlobs', () => {
	const decodedPairs: [name: string, accesos: number[], sub: number[]][] = [
		['odd length accesos', [0x00, 0x0c, 0x00], []],
		['accesos out of order', [0x00, 0x43, 0x00, 0x0c], []],
		['accesos duplicated', [0x00, 0x0c, 0x00, 0x0c], []],
		['sub truncated mid grant', [], [0x00, 0x29]],
		['sub dangling more bit', [], [0x00, 0x29, 0x81]],
		['sub out of order', [], [0x00, 0x43, 0x01, 0x00, 0x29, 0x01]],
		['sub entry with empty mask', [], [0x00, 0x29, 0x00]],
		['sub mask past the ceiling', [], [0x00, 0x29, 0xc0, 0x7f]],
	]

	for (const [name, accesosBytes, subBytes] of decodedPairs) {
		it(`rejects ${name}`, () => {
			expect(validateAccesosBlobs(new Uint8Array(accesosBytes), new Uint8Array(subBytes)))
				.not.toBe('')
		})
	}

	it('accepts the pair the encoder writes', () => {
		expect(validateAccesosBlobs(
			new Uint8Array([0x00, 0x0c, 0x00, 0x43]),
			new Uint8Array([0x00, 0x29, 0x05, 0x00, 0x89, 0x81, 0x20]),
		)).toBe('')
		expect(validateAccesosBlobs(new Uint8Array(), new Uint8Array())).toBe('')
	})
})
