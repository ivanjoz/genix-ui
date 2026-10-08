/* Tailwind orders utilities that set the same property by their name, not by their position in the
   class attribute: in `class="w-80 w-100"` it is `w-80` that wins. `ifcss` drops the component's
   default classes that the caller's `css` overrides, so the caller always wins.
   Only width, height (both with min/max), margin and padding are handled; every other default class
   is kept. */

// A shorthand also overrides its sides: Tailwind emits `my-*` before `mt-*`, so a default `mt-8`
// would beat a custom `my-4`. The reverse needs nothing, the side already comes after.
const overriddenGroupsByGroup: Record<string, string[]> = {
	m: ['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me'],
	mx: ['mx', 'mr', 'ml', 'ms', 'me'],
	my: ['my', 'mt', 'mb'],
	p: ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe'],
	px: ['px', 'pr', 'pl', 'ps', 'pe'],
	py: ['py', 'pt', 'pb'],
}

const sizingUtilityRegex = /^-?(min-w|max-w|w|min-h|max-h|h|m[xytrblse]?|p[xytrblse]?)-/

/** Reads `md:hover:-mt-4!` as the key `md:hover:mt`: its variants plus its utility group.
 * Returns '' for a class outside width, height, margin and padding. */
const parseSizingClassKey = (cssClass: string): string => {
	// The variants end at the last ':' outside brackets, so `w-[calc(1px)]` or `[&:hover]:p-4`
	// don't split inside their arbitrary values.
	let variantsEnd = 0
	let bracketDepth = 0
	for (let charIndex = 0; charIndex < cssClass.length; charIndex++) {
		const currentChar = cssClass[charIndex]
		if (currentChar === '[') bracketDepth++
		else if (currentChar === ']') bracketDepth--
		else if (currentChar === ':' && bracketDepth === 0) variantsEnd = charIndex + 1
	}
	const utility = cssClass.slice(variantsEnd).replace(/^!|!$/g, '')
	const utilityMatch = sizingUtilityRegex.exec(utility)
	return utilityMatch ? cssClass.slice(0, variantsEnd) + utilityMatch[1] : ''
}

/** Joins a component's default classes with the caller's `css`, dropping the default width,
 * height (both with min/max), margin and padding classes the caller overrides under the same variants:
 * `ifcss("w-100 md:w-200", "w-80 p-8")` → `"p-8 w-100 md:w-200"`. */
export const ifcss = (customCss: string | undefined, defaultCss: string): string => {
	if (!customCss) return defaultCss

	const overriddenKeys = new Set<string>()
	for (const customClass of customCss.split(/\s+/)) {
		const customKey = parseSizingClassKey(customClass)
		if (!customKey) continue
		const group = customKey.slice(customKey.lastIndexOf(':') + 1)
		const variants = customKey.slice(0, customKey.length - group.length)
		for (const overriddenGroup of overriddenGroupsByGroup[group] || [group]) {
			overriddenKeys.add(variants + overriddenGroup)
		}
	}

	const keptDefaultClasses = defaultCss.split(/\s+/).filter((defaultClass) => {
		return defaultClass && !overriddenKeys.has(parseSizingClassKey(defaultClass))
	})
	return `${keptDefaultClasses.join(' ')} ${customCss}`.trim()
}
