import { describe, expect, it } from 'bun:test'
import { appendUvarint, bytesToBase64Url } from './parsers.js'

describe('appendUvarint', () => {
	// The same bytes as Go's binary.AppendUvarint.
	it('writes 7 bits per byte, low first', () => {
		const bytes: number[] = []
		for (const value of [0, 127, 128, 300, 2 ** 40]) appendUvarint(bytes, value)
		expect(bytes).toEqual([0, 0x7f, 0x80, 0x01, 0xac, 0x02, 0x80, 0x80, 0x80, 0x80, 0x80, 0x20])
	})
})

describe('bytesToBase64Url', () => {
	it('is unpadded and URL-safe', () => {
		expect(bytesToBase64Url([0xfb, 0xff])).toBe('-_8')
		expect(bytesToBase64Url([])).toBe('')
	})
})
