export const normalizeStringN = (value: unknown): string => {
	if (typeof value === 'number') return String(value)
	if (typeof value !== 'string') return ''

	// Keep lookup keys aligned with backends that use the same compact name normalization.
	const normalizedCharsByAccent: Record<string, string> = {
		'á': 'a',
		'é': 'e',
		'í': 'i',
		'ó': 'o',
		'ú': 'u',
		'ñ': 'n',
	}
	const lowerCasedText = value.toLowerCase()
	let normalizedString = ''

	for (const currentChar of lowerCasedText) {
		const charCode = currentChar.charCodeAt(0)
		const isAsciiDigit = charCode > 47 && charCode < 58
		const isAsciiLowerCaseLetter = charCode > 96 && charCode < 123
		const isUnderscore = charCode === 95

		if (isAsciiDigit || isAsciiLowerCaseLetter || isUnderscore) {
			normalizedString += currentChar
			continue
		}

		const isWordSeparator = charCode === 32 || charCode === 160 || charCode === 45
		if (isWordSeparator) {
			const lastChar = normalizedString[normalizedString.length - 1]
			if (normalizedString.length > 0 && lastChar !== '_') {
				normalizedString += '_'
			}
			continue
		}

		const normalizedAccentChar = normalizedCharsByAccent[currentChar]
		if (normalizedAccentChar) {
			normalizedString += normalizedAccentChar
		}
	}

	return normalizedString
}
