/** '../routes/berrypack/seasons/GUIDE.md' → '/berrypack/seasons', SvelteKit's route id. */
export const guideRouteId = (guidePath: string): string =>
  guidePath.replace(/^.*?\/routes(?=\/)/, '').replace(/\/GUIDE\.md$/, '')
