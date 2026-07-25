import { SvelteMap } from 'svelte/reactivity'
import type { UiImageAdapter, UiInMemoryImage } from '../runtime/types.js'

export interface InMemoryImageStore extends UiImageAdapter {
	entries: SvelteMap<string, UiInMemoryImage>
	get: (src: string) => UiInMemoryImage | undefined
}

const toBaseImageKey = (src: string): string =>
	(src || '').split('/').pop()?.replace(/-x\d$/, '') ?? ''

export const createInMemoryImageStore = (): InMemoryImageStore => {
	// SvelteMap keeps image previews reactive while the host shares one upload queue.
	const entries = new SvelteMap<string, UiInMemoryImage>()
	const get = (src: string) => entries.get(toBaseImageKey(src))

	return {
		entries,
		get,
		getBase64: (src) => get(src)?.base64 ?? '',
		isInFlight: (src) => {
			const image = get(src)
			return !!image && image.status !== 'error'
		},
	}
}
