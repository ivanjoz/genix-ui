import { base64ToUInt16, checksum } from '../utilities/parsers.js';

// Access levels are 1..4; anything out of range degrades to the lowest level.
export const normalizeAccesoNivel = (nivel?: number): number => {
  if (!nivel || nivel < 1 || nivel > 4) { return 1 }
  return nivel
}

export const makeAccesoNivelUint16 = (accesoID: number, nivel: number): number => {
  // Mirror the backend bit-packing so access checks behave exactly the same on both sides.
  return ((accesoID << 2) | (normalizeAccesoNivel(nivel) - 1)) >>> 0
}

export const getAccesoNivelSearchRange = (accesoID: number, nivel: number): [number, number] => {
  // Require granted levels to be >= the requested level within the same access bucket.
  const normalizedNivel = normalizeAccesoNivel(nivel)
  return [makeAccesoNivelUint16(accesoID, normalizedNivel), makeAccesoNivelUint16(accesoID, 4)]
}

// The packed array is sorted by the backend, so range membership is a binary search.
export const hasPackedAccesoInRange = (
  accesosComputed: Uint16Array,
  rangeStart: number,
  rangeEnd: number,
): boolean => {
  let leftIndex = 0
  let rightIndex = accesosComputed.length - 1

  while (leftIndex <= rightIndex) {
    const middleIndex = (leftIndex + rightIndex) >> 1
    const middleValue = accesosComputed[middleIndex]

    if (middleValue < rangeStart) { leftIndex = middleIndex + 1 }
    else if (middleValue > rangeEnd) { rightIndex = middleIndex - 1 }
    else { return true }
  }

  return false
}

// Stored payload = 2 checksum chars + base64 + 2 checksum chars, so a tampered or
// truncated localStorage value is rejected instead of granting random accesses.
export const wrapAccesosComputed = (packedAccesosBase64: string): string => {
  if (!packedAccesosBase64) { return "" }
  const packedAccessHash = checksum(packedAccesosBase64)
  return `${packedAccessHash.substring(0, 2)}${packedAccesosBase64}${packedAccessHash.substring(2, 4)}`
}

export const decodeStoredAccesosComputed = (storedAccesosComputed: string): Uint16Array => {
  if (!storedAccesosComputed) { return new Uint16Array() }
  if (storedAccesosComputed.length < 5) {
    console.warn("[security] invalid accesos payload")
    return new Uint16Array()
  }

  const packedAccesosBase64 = storedAccesosComputed.substring(2, storedAccesosComputed.length - 2)
  const storedHash = storedAccesosComputed.substring(0, 2)
    + storedAccesosComputed.substring(storedAccesosComputed.length - 2)

  if (checksum(packedAccesosBase64) !== storedHash) {
    console.warn("[security] invalid accesos payload")
    return new Uint16Array()
  }
  return base64ToUInt16(packedAccesosBase64)
}
