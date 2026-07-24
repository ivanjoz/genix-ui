export interface ServiceWorkerRuntime {
	getWorkerUrl: () => string
	getEnvironment: () => string
	getCompanyID: () => number
	makeRoute: (route: string) => string
	verifyRouteMemoryState: () => boolean
	reportFetch: (requestID: number, event: { url: string } | 0) => void
	reportProgress: (bytesLength: number) => void
	notifyFailure: (message: string) => void
}

// The RPC client is browser-global; the host injects application routing and UI reporting once.
let serviceWorkerRuntime: ServiceWorkerRuntime = {
	getWorkerUrl: () => '/sw.js',
	getEnvironment: () => 'main',
	getCompanyID: () => 0,
	makeRoute: (route) => route,
	verifyRouteMemoryState: () => false,
	reportFetch: () => {},
	reportProgress: () => {},
	notifyFailure: (message) => console.error(message),
}

export const configureServiceWorkerRuntime = (
	runtime: ServiceWorkerRuntime,
): ServiceWorkerRuntime => {
	serviceWorkerRuntime = runtime
	return serviceWorkerRuntime
}

export const getServiceWorkerRuntime = (): ServiceWorkerRuntime => serviceWorkerRuntime
