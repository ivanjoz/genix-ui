import { guideRouteId } from './route-guide.ts'

/** The host's lazy `import.meta.glob` of its routes' GUIDE.md, with `{ query: '?raw', import: 'default' }`. */
export type GuideFiles = Record<string, () => Promise<string>>

/** The user guide of the open route; markdown stays empty while loading or when the route has none. */
export const routeGuide = $state({ routeId: '', markdown: '' })

/**
 * Follows navigation: the host calls it with SvelteKit's route id (page.route.id) on every route
 * change. Pages register nothing: the route id finds the GUIDE.md beside +page.svelte, and the lazy
 * glob keeps each file in its own chunk, downloaded only when its route opens.
 */
export const showRouteGuide = async (guideFiles: GuideFiles, routeId: string) => {
  routeGuide.routeId = routeId
  routeGuide.markdown = ''
  const guidePath = Object.keys(guideFiles).find((path) => guideRouteId(path) === routeId)
  if (!guidePath) { return }
  const markdown = await guideFiles[guidePath]()
  // The user may have navigated on while the chunk downloaded.
  if (routeGuide.routeId === routeId) { routeGuide.markdown = markdown }
}
