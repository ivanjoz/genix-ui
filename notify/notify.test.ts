import { describe, expect, test } from 'bun:test'
import { messageFromUnknown } from './notify.js'

describe('messageFromUnknown', () => {
	test('keeps strings as they are', () => {
		expect(messageFromUnknown('Saved|Guardado')).toBe('Saved|Guardado')
	})

	test('reads the message of an Error', () => {
		expect(messageFromUnknown(new Error('Network down'))).toBe('Network down')
	})

	test('prefers a backend { error } payload over { message }', () => {
		expect(messageFromUnknown({ error: 'Invalid user', message: 'ignored' })).toBe('Invalid user')
		expect(messageFromUnknown({ message: 'Timeout' })).toBe('Timeout')
	})

	test('serializes other objects instead of printing [object Object]', () => {
		expect(messageFromUnknown({ code: 500 })).toBe('{"code":500}')
	})

	test('falls back to a generic message when there is nothing to show', () => {
		expect(messageFromUnknown('')).toBe('Unknown error|Error desconocido')
		expect(messageFromUnknown(null)).toBe('Unknown error|Error desconocido')
		expect(messageFromUnknown(undefined)).toBe('Unknown error|Error desconocido')
		expect(messageFromUnknown({ error: '' })).toBe('{"error":""}')
	})

	test('stringifies primitives', () => {
		expect(messageFromUnknown(404)).toBe('404')
	})
})
