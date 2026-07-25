export type ImageFileType = 'webp' | 'avif' | 'jpg'

export interface ImageConverterOptions {
	maxWorkers?: number
	timeoutMs?: number
	maxResolution?: number
	notifyFailure?: (message: string) => void
}

export interface ImageConverter {
	fileToImage: (
		source: Blob | File,
		resolution: number,
		fileType?: ImageFileType,
	) => Promise<string>
	bitmapToImage: (
		bitmap: ImageBitmap,
		resolution: number,
		fileType?: ImageFileType,
	) => Promise<string>
}

interface WorkerSlot {
	worker: Worker
	tasks: number
}

interface PendingWorkerRequest {
	resolve: (value: string) => void
	reject: (reason?: unknown) => void
	timeout: ReturnType<typeof setTimeout>
}

export const createImageConverter = (
	options: ImageConverterOptions = {},
): ImageConverter => {
	const pendingRequests = new Map<number, PendingWorkerRequest>()
	const workerPool = new Map<Worker, WorkerSlot>()
	const maxWorkers = options.maxWorkers ?? 4
	const timeoutMs = options.timeoutMs ?? 8000
	const maxResolution = options.maxResolution ?? 2000
	const notifyFailure = options.notifyFailure ?? console.error
	let nextRequestId = 0

	const configureWorker = (slot: WorkerSlot) => {
		slot.worker.onmessage = ({ data }) => {
			slot.tasks = Math.max(0, slot.tasks - 1)
			const request = pendingRequests.get(data.id)
			if (!request) { return }

			clearTimeout(request.timeout)
			pendingRequests.delete(data.id)
			if (data.error) {
				console.error('[genix-ui:image] Worker conversion failed', { id: data.id, error: data.error })
				request.reject(data.error)
				return
			}

			console.debug('[genix-ui:image] Worker conversion completed', {
				id: data.id,
				outputLength: data.dataUrl?.length ?? 0,
			})
			request.resolve(data.dataUrl ?? '')
		}

		slot.worker.onerror = (error) => {
			console.error('[genix-ui:image] Worker runtime error', error)
		}
	}

	const addWorker = (worker: Worker): WorkerSlot => {
		const slot = { worker, tasks: 0 }
		configureWorker(slot)
		workerPool.set(worker, slot)
		return slot
	}

	const createWorker = (): Worker | undefined => {
		if (typeof Worker === 'undefined') { return }
		// The package owns its worker implementation; supported Svelte/Vite hosts bundle this URL.
		return new Worker(
			new URL('../workers/image-worker.ts', import.meta.url),
			{ type: 'module', name: 'genix-ui-image' },
		)
	}

	const getBestWorker = (): WorkerSlot | undefined => {
		let bestSlot: WorkerSlot | undefined
		for (const slot of workerPool.values()) {
			if (slot.tasks === 0) {
				bestSlot = slot
				break
			}
			if (!bestSlot || slot.tasks < bestSlot.tasks) { bestSlot = slot }
		}

		if ((!bestSlot || bestSlot.tasks > 0) && workerPool.size < maxWorkers) {
			const worker = createWorker()
			if (worker) {
				console.debug('[genix-ui:image] Expanding worker pool', { size: workerPool.size + 1 })
				bestSlot = addWorker(worker)
			}
		}

		if (bestSlot) { bestSlot.tasks++ }
		return bestSlot
	}

	const convert = (
		payload: { blob: Blob | File } | { bitmap: ImageBitmap },
		resolution: number,
		fileType?: ImageFileType,
	): Promise<string> => {
		if (resolution > maxResolution) {
			notifyFailure(`${maxResolution / 1000}mpx is max resolution for image conversion.`)
			return Promise.resolve('')
		}

		const slot = getBestWorker()
		if (!slot) {
			console.error('[genix-ui:image] No image worker is configured')
			return Promise.reject(new Error('Image worker not available'))
		}

		const id = ++nextRequestId
		console.debug('[genix-ui:image] Starting worker conversion', {
			id,
			resolution,
			fileType: fileType ?? 'webp',
			poolSize: workerPool.size,
		})

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				slot.tasks = Math.max(0, slot.tasks - 1)
				pendingRequests.delete(id)
				console.error('[genix-ui:image] Worker conversion timed out', { id, resolution, timeoutMs })
				reject(new Error(`Error al procesar la imagen. (superó los ${timeoutMs / 1000} segundos.)`))
			}, timeoutMs)

			pendingRequests.set(id, { resolve, reject, timeout })
			const message = {
				id,
				...payload,
				resolution,
				useJpeg: fileType === 'jpg',
				useAvif: fileType === 'avif',
			}
			if ('bitmap' in payload) {
				slot.worker.postMessage(message, [payload.bitmap])
			} else {
				slot.worker.postMessage(message)
			}
		})
	}

	return {
		fileToImage: (source, resolution, fileType) =>
			convert({ blob: source }, resolution, fileType),
		bitmapToImage: (bitmap, resolution, fileType) =>
			convert({ bitmap }, resolution, fileType),
	}
}
