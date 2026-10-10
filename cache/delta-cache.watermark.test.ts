import { describe, expect, it } from 'bun:test'
import { deltaFingerprint, formatWatermark, lowestWatermark, makeEmptyWatermark, mergeIntoWatermark } from './delta-cache.watermark'

describe('deltaFingerprint', () => {
	// The same vector as genix-orm/dynamo's TestDeltaFingerprintSharedVector: both sides must agree.
	it('matches the backend', () => {
		expect(deltaFingerprint([])).toBe(0)
		expect(deltaFingerprint([0])).toBe(0)
		expect(deltaFingerprint([1])).toBe(1364076727)
		expect(deltaFingerprint([1234567890123])).toBe(2401458028)
		expect(deltaFingerprint([4398046511103])).toBe(3230535694)
		expect(deltaFingerprint([1, 1234567890123, 4398046511103])).toBe(2701103153)
		expect(deltaFingerprint([4398046511103, 1, 1234567890123])).toBe(2701103153)
	})
})

describe('mergeIntoWatermark', () => {
	it('moves upd up and keeps only the overlap window', () => {
		const first = mergeIntoWatermark(makeEmptyWatermark(), [['1', 1000], ['2', 9000], ['3', 10000]])
		expect(first.hasChanged).toBe(true)
		expect(first.watermark).toEqual({ upd: 10000, window: { '2': 9000, '3': 10000 } })

		const later = mergeIntoWatermark(first.watermark, [['4', 13500]])
		expect(later.watermark).toEqual({ upd: 13500, window: { '3': 10000, '4': 13500 } })
	})

	it('reports no change for a resent window', () => {
		const held = mergeIntoWatermark(makeEmptyWatermark(), [['1', 9000], ['2', 10000]]).watermark
		expect(mergeIntoWatermark(held, [['1', 9000], ['2', 10000]]).hasChanged).toBe(false)
	})

	it('takes a late write inside the window, and keeps one entry per record', () => {
		const held = mergeIntoWatermark(makeEmptyWatermark(), [['1', 9000], ['2', 10000]]).watermark
		const lateWrite = mergeIntoWatermark(held, [['3', 8000], ['1', 9500], ['2', 9800]])
		expect(lateWrite.hasChanged).toBe(true)
		expect(lateWrite.watermark).toEqual({ upd: 10000, window: { '1': 9500, '2': 10000, '3': 8000 } })
	})

	it('formats upd and the fingerprint of the window', () => {
		const held = mergeIntoWatermark(makeEmptyWatermark(), [['a', 1234567890123]]).watermark
		expect(formatWatermark(held)).toBe('1234567890123.2401458028')
		expect(formatWatermark(makeEmptyWatermark())).toBe('0.0')
	})
})

describe('lowestWatermark', () => {
	it('ignores keys that never received a record', () => {
		const products = { upd: 5000, window: {} }
		const categories = { upd: 3000, window: {} }
		expect(lowestWatermark([products, makeEmptyWatermark(), categories])).toBe(categories)
		expect(lowestWatermark([]).upd).toBe(0)
	})
})
