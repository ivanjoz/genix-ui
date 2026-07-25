import { describe, expect, test } from 'bun:test'
import { createInMemoryImageStore } from './in-memory-images.svelte.js'

describe('createInMemoryImageStore', () => {
	test('resolves folder and resolution variants to one optimistic image', () => {
		const store = createInMemoryImageStore()
		store.entries.set('12_34', {
			name: '12_34',
			id: 34,
			folder: 'img-products',
			base64: 'data:image/avif;base64,preview',
			status: 'uploading',
			progress: 50,
		})

		expect(store.getBase64('img-products/12_34-x4')).toBe('data:image/avif;base64,preview')
		expect(store.isInFlight('12_34-x2')).toBe(true)

		store.entries.get('12_34')!.status = 'error'
		expect(store.isInFlight('img-products/12_34')).toBe(false)
	})
})
