import { describe, expect, test } from 'bun:test'
import { clipLogText, consoleArgsText, countResponseRecords, logValueText, optionLogValue } from './app-log-text.js'

describe('logValueText', () => {
	test('renders primitives and leaves empty values empty', () => {
		expect(logValueText('Lima')).toBe('Lima')
		expect(logValueText(12)).toBe('12')
		expect(logValueText(false)).toBe('false')
		expect(logValueText(null)).toBe('')
		expect(logValueText(undefined)).toBe('')
	})

	test('renders an Error as its name, message and first stack frames', () => {
		const error = new TypeError('x is undefined')
		error.stack = 'TypeError: x is undefined\n    at save (a.ts:1)\n    at b (b.ts:2)\n    at c\n    at d\n    at e'
		expect(logValueText(error)).toBe('TypeError: x is undefined\nat save (a.ts:1)\nat b (b.ts:2)\nat c\nat d')
	})

	test('serializes objects and survives circular ones', () => {
		expect(logValueText({ code: 500 })).toBe('{"code":500}')
		const circular: Record<string, unknown> = {}
		circular.self = circular
		expect(logValueText(circular)).toBe('[object Object]')
	})
})

describe('consoleArgsText', () => {
	test('joins the arguments as the console prints them', () => {
		expect(consoleArgsText(['[http] GET failed:', 'example-clients', { error: 'timeout' }])).toBe('[http] GET failed: example-clients {"error":"timeout"}')
	})
})

describe('optionLogValue', () => {
	test('logs a choice as "[id] text" and a cleared one as empty', () => {
		expect(optionLogValue(3, 'Lima')).toBe('[3] Lima')
		expect(optionLogValue(0, 'None')).toBe('[0] None')
		expect(optionLogValue('', 'x')).toBe('')
		expect(optionLogValue(undefined)).toBe('')
	})
})

describe('countResponseRecords', () => {
	test('counts an array or the arrays of a keyed answer', () => {
		expect(countResponseRecords([1, 2, 3])).toBe(3)
		expect(countResponseRecords({ products: [1, 2], prices: [3], message: 'ok' })).toBe(3)
		expect(countResponseRecords({ ok: true })).toBe(0)
		expect(countResponseRecords(null)).toBe(0)
	})
})

describe('clipLogText', () => {
	test('cuts long text with an ellipsis within the limit', () => {
		expect(clipLogText('abcdef', 4)).toBe('abc…')
		expect(clipLogText('abc', 4)).toBe('abc')
	})
})
