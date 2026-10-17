import { describe, expect, it } from 'bun:test'
import { appendUvarint, base64ToBytes, bytesToBase64, concatenateInts } from './parsers.js'

describe('appendUvarint', () => {
	// The same bytes as Go's binary.AppendUvarint.
	it('writes 7 bits per byte, low first', () => {
		const bytes: number[] = []
		for (const value of [0, 127, 128, 300, 2 ** 40]) appendUvarint(bytes, value)
		expect(bytes).toEqual([0, 0x7f, 0x80, 0x01, 0xac, 0x02, 0x80, 0x80, 0x80, 0x80, 0x80, 0x20])
	})
})

describe('bytesToBase64', () => {
	it('is unpadded and URL-safe', () => {
		expect(bytesToBase64([0xfb, 0xff])).toBe('yzw')
		expect(bytesToBase64([])).toBe('')
	})

	// The same strings as Go's utils.Base64 (utils/base64_test.go and the cc fixtures).
	it('writes the genix-orm alphabet', () => {
		expect(bytesToBase64([24, 1, 0, 0, 1, 7])).toBe('5-3---36')
	})
})

describe('base64ToBytes', () => {
	it('reverses bytesToBase64 for every tail length', () => {
		for (const bytes of [[], [0], [0xfb, 0xff], [1, 2, 3], [255, 254, 253, 252], [9, 8, 7, 6, 5]]) {
			expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual(bytes)
		}
	})

	it('decodes an invalid payload to no bytes', () => {
		expect(base64ToBytes('ab+c').length).toBe(0)
		expect(base64ToBytes('abcde').length).toBe(0)
	})
})

describe('concatenateInts', () => {
	it('joins the u8, u16 and u32 buckets', () => {
		expect(concatenateInts([7, 300, 70000])).toBe(`${bytesToBase64([7])}.${bytesToBase64([44, 1])}.${bytesToBase64([112, 17, 1, 0])}`)
	})
})
