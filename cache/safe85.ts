/**
 * Safe85 (https://github.com/kstenerud/safe-encoding, safe85-specification.md), the one base85 of
 * genix-ui and berryapps. The Go twin is genix-orm/dynamo/safe85.go; the delta Metadata records carry
 * their log bytes in it. Every 4 bytes, read big-endian, become 5 characters; a final group of 1 to 3
 * bytes becomes 2 to 4 characters. The alphabet leaves out `"` `#` `%` `&` `'` `/` `<` `?` `\`.
 */
const SAFE85_ALPHABET = "!$()*+,-.0123456789:;=>@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~"

const chunkValueByCharCode = (() => {
	const valueByCharCode = new Int8Array(128).fill(-1)
	for (let chunkValue = 0; chunkValue < SAFE85_ALPHABET.length; chunkValue++) {
		valueByCharCode[SAFE85_ALPHABET.charCodeAt(chunkValue)] = chunkValue
	}
	return valueByCharCode
})()

export const encodeSafe85 = (data: Uint8Array): string => {
	let encoded = ''
	for (let groupStart = 0; groupStart < data.length; groupStart += 4) {
		const group = data.subarray(groupStart, Math.min(groupStart + 4, data.length))
		let accumulator = 0
		for (const groupByte of group) accumulator = accumulator * 256 + groupByte
		const chunks: string[] = []
		for (let chunkIndex = 0; chunkIndex <= group.length; chunkIndex++) {
			chunks.unshift(SAFE85_ALPHABET[accumulator % 85] as string)
			accumulator = Math.floor(accumulator / 85)
		}
		encoded += chunks.join('')
	}
	return encoded
}

// decodeSafe85 skips tab, line feed, carriage return and space, as the spec requires. A character
// outside the alphabet, a lone final character or a group that overflows its bytes throws.
export const decodeSafe85 = (encoded: string): Uint8Array => {
	const decoded: number[] = []
	const chunkValues: number[] = []
	const appendGroup = () => {
		let accumulator = 0
		for (const chunkValue of chunkValues) accumulator = accumulator * 85 + chunkValue
		const byteCount = chunkValues.length - 1
		if (accumulator >= 256 ** byteCount) {
			throw new Error(`safe85: a group of ${chunkValues.length} characters holds more than ${byteCount} bytes`)
		}
		for (let byteIndex = byteCount - 1; byteIndex >= 0; byteIndex--) {
			decoded.push(Math.floor(accumulator / 256 ** byteIndex) % 256)
		}
		chunkValues.length = 0
	}
	for (let charIndex = 0; charIndex < encoded.length; charIndex++) {
		const charCode = encoded.charCodeAt(charIndex)
		if (charCode === 9 || charCode === 10 || charCode === 13 || charCode === 32) continue
		const chunkValue = charCode < 128 ? (chunkValueByCharCode[charCode] as number) : -1
		if (chunkValue < 0) {
			throw new Error(`safe85: ${JSON.stringify(encoded[charIndex])} at position ${charIndex} is not in the alphabet`)
		}
		chunkValues.push(chunkValue)
		if (chunkValues.length === 5) appendGroup()
	}
	if (chunkValues.length === 1) throw new Error('safe85: the text ends with a lone character: it was cut')
	if (chunkValues.length > 0) appendGroup()
	return Uint8Array.from(decoded)
}
