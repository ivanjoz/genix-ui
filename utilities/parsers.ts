// Pack integer widths independently so the compact URL-safe payload preserves numeric range.
export const concatenateInts = (values: number[], sorted?: boolean): string => {
	const vals = sorted ? [...values].sort((a, b) => a - b) : values;

	const u8: number[] = [];
	const u16: number[] = [];
	const u32: number[] = [];

	for (const v of vals) {
		if (v >= 0 && v <= 255) {
			u8.push(v);
		} else if (v >= 0 && v <= 65535) {
			u16.push(v);
		} else if (v >= 0 && v <= 4294967295) {
			u32.push(v);
		}
	}

	const toBase64 = (arr: Uint8Array | Uint16Array | Uint32Array) =>
		bytesToBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));

	return [toBase64(new Uint8Array(u8)), toBase64(new Uint16Array(u16)), toBase64(new Uint32Array(u32))].join(".");
};

// appendUvarint writes value as an unsigned LEB128 varint (Go's binary.AppendUvarint): 7 bits per
// byte, low first, the high bit set on every byte but the last. Division, not shifts: JS shifts
// truncate to 32 bits.
export const appendUvarint = (bytes: number[], value: number): void => {
	let remaining = value
	while (remaining >= 0x80) {
		bytes.push((remaining % 0x80) | 0x80)
		remaining = Math.floor(remaining / 0x80)
	}
	bytes.push(remaining)
}

// BASE64_ALPHABET is genix-orm's utils.Base64Alphabet: URL-safe, in ASCII order, so encodings of
// the same length sort like their bytes.
export const BASE64_ALPHABET = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"

// bytesToBase64 is unpadded base64 in BASE64_ALPHABET (Go's utils.Base64), safe in a query parameter.
export const bytesToBase64 = (bytes: ArrayLike<number>): string => {
	let encoded = ""
	for (let index = 0; index < bytes.length; index += 3) {
		const group = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0)
		// 1, 2 or 3 bytes take 2, 3 or 4 characters.
		const characterCount = Math.min(bytes.length - index, 3) + 1
		for (let characterIndex = 0; characterIndex < characterCount; characterIndex++) {
			encoded += BASE64_ALPHABET[(group >>> (18 - 6 * characterIndex)) & 63]
		}
	}
	return encoded
}

export const checksum = (content: string): string => {
	let rollingSeed = 888888

	for (let index = 0; index < content.length; index++) {
		const contentOffset = index % 1000
		const contentCharacter = content[index]
		const charCode = contentCharacter.charCodeAt(0)
		const levelDelta = Math.abs(rollingSeed - charCode + contentOffset) % 10

		if (levelDelta > 6) {
			rollingSeed += ((charCode + contentOffset) * levelDelta) + levelDelta
		} else if (levelDelta > 3) {
			rollingSeed -= ((charCode - contentOffset) * levelDelta) - contentOffset
		} else {
			rollingSeed += Math.abs((charCode - contentOffset) * (levelDelta + 1)) - (levelDelta * (index % 10))
			if (rollingSeed >= 1000000) {
				rollingSeed = Math.abs(rollingSeed) % 100000
			}
		}
	}

	const seedSuffix = String(rollingSeed % 1000)
	for (let index = 0; index < seedSuffix.length; index++) {
		rollingSeed += Math.pow(parseInt(seedSuffix[0]), (6 - index))
	}

	let packedHash = rollingSeed.toString(32).split('').reverse().join('')
	if (packedHash.length > 4) {
		packedHash = packedHash.substring(0, 4)
	} else if (packedHash.length < 4) {
		for (let index = packedHash.length; index < 4; index++) {
			packedHash += String(4 - index)
		}
	}

	return packedHash
}

export const checksumBase64_6 = (content: string): string => {
	let hashAccumulator = 2166136261

	for (let index = 0; index < content.length; index++) {
		hashAccumulator ^= content.charCodeAt(index)
		hashAccumulator = Math.imul(hashAccumulator, 16777619) >>> 0
	}

	// The 32-bit hash in bytesToBase64: always 6 characters, the key of localStorage payloads.
	return bytesToBase64([
		(hashAccumulator >>> 24) & 255,
		(hashAccumulator >>> 16) & 255,
		(hashAccumulator >>> 8) & 255,
		hashAccumulator & 255
	])
}

// base64ToBytes reverses bytesToBase64 (Go's utils.Base64); an invalid payload decodes to no bytes.
export const base64ToBytes = (encoded: string): Uint8Array => {
	const characterCount = encoded.length
	// A lone last character carries only 6 bits: no byte ends there.
	if (characterCount % 4 === 1) {
		console.warn("[parsers] invalid base64 payload")
		return new Uint8Array()
	}
	const bytes = new Uint8Array(Math.floor(characterCount * 3 / 4))
	let byteIndex = 0
	for (let index = 0; index < characterCount; index += 4) {
		let group = 0
		const groupLength = Math.min(characterCount - index, 4)
		for (let characterIndex = 0; characterIndex < 4; characterIndex++) {
			const digit = characterIndex < groupLength ? BASE64_ALPHABET.indexOf(encoded[index + characterIndex]) : 0
			if (digit < 0) {
				console.warn("[parsers] invalid base64 payload")
				return new Uint8Array()
			}
			group = (group << 6) | digit
		}
		// 2, 3 or 4 characters hold 1, 2 or 3 bytes.
		for (let shift = 16; shift > 16 - 8 * (groupLength - 1); shift -= 8) {
			bytes[byteIndex++] = (group >>> shift) & 255
		}
	}
	return bytes
}
