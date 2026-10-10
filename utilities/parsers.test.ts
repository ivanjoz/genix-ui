import { describe, expect, it } from 'bun:test'
import { concatenateInts, concatenateUint48s } from './parsers.js'

describe('concatenateUint48s', () => {
	// The same vectors as the backend's TestParseConcatenatedUint48sKeepsClientOrder: both sides must agree.
	it('matches the backend', () => {
		expect(concatenateUint48s([7, 4398046511103, 1234567890123, 0])).toBe('BwAAAAAA______8DywT7cR8BAAAAAAAA')
		expect(concatenateUint48s([40000, 3])).toBe('QJwAAAAAAwAAAAAA')
	})

	it('preserves order across mixed magnitudes', () => {
		// This is the whole point: concatenateInts would split these into u8 and u16 buckets and
		// reorder them, silently misaligning cc-upd against cc-ids.
		const updatedValues = [7, 40000, 3]
		expect(concatenateInts(updatedValues)).not.toEqual(concatenateUint48s(updatedValues))
	})

	it('encodes an empty list as an empty string', () => {
		expect(concatenateUint48s([])).toBe('')
	})
})
