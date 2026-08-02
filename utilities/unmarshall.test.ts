import { describe, expect, it } from 'bun:test'
import { unmarshall } from './unmarshall.js'

// Payload shape produced by backend/serialize for a record type whose first field
// in the optimized order is a slice — see serialize/skipblock_test.go.
describe('unmarshall', () => {
	it('reads position 1 of a header-0 record as the skip block', () => {
		const keys = [[1, 0, 'tags', 1, 'id', 2, 'name', 3, 'detail']]
		const content = [
			2,
			[1, [1], [2], 313, 'first', 'only the first has this'],
			// Empty skip block: without it `[2]` (an empty slice) would be read as
			// "skip field 2" and every later field would shift by one.
			[0, [], [2], 316, 'second'],
			[0, [3], [2, 2, 6], 317, 'third'],
		]

		expect(unmarshall([keys, content])).toEqual([
			{ tags: [], id: 313, name: 'first', detail: 'only the first has this' },
			{ tags: [], id: 316, name: 'second' },
			{ tags: [2, 6], id: 317, name: 'third' },
		])
	})

	it('reads position 1 as a value when it is not an array', () => {
		const keys = [[1, 0, 'id', 1, 'name']]
		const content = [2, [1, [1], 313, 'first'], [0, 316, 'second']]

		expect(unmarshall([keys, content])).toEqual([
			{ id: 313, name: 'first' },
			{ id: 316, name: 'second' },
		])
	})
})
