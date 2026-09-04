import { base64ToBytes, checksum } from '../utilities/parsers.js';

// The reader half of the grant blobs. Its twins are backend/core/accesos-blob.go — the only encoder
// — and fareward/src/limiter/access.rs. Three hand-written parsers of one small format is the
// accepted cost of keeping the bytes identical in all three processes; see docs/SUB_ACCESSES_PLAN.md.
//
// Grants live in TWO payloads, and which one an access is in *is* a bit of information:
//
//   accesosComputed      accesses with no granted sub-access. Grant words only, fixed 2-byte
//                        stride, binary searchable.
//   accesosSubComputed   accesses with at least one. Every grant word is followed by its sub
//                        bytes, and no flag says so because the payload says so.
//
//   grant : u16 BIG-endian   bits 15..2  accesoID (1..16383)
//                            bits  1..0  nivel - 1 (nivel 1..4)
//   sub   : u8               bit      7  MORE, another sub byte follows
//                            bits  6..0  flags: byte 0 = sub 1..7, byte 1 = sub 8..14
//
// An access is in exactly one payload, so a lookup that misses the first MUST try the second.
// Forgetting that fails closed — a user is denied something they hold — which is why it is stated
// here and covered by a test rather than left to the call sites.

// Sub-access id 1 is "Todos" and satisfies every check on its access. The daemon never applies this
// rule — it returns the raw mask — so it is expanded here and in Go, and nowhere else.
export const SUB_ACCESO_TODOS_ID = 1

// The blob spends 7 flag bits per byte and caps at two bytes, so ids run 1..13 (1 is Todos).
export const MAX_SUB_ACCESO_ID = 13

const SUB_ACCESO_FLAG_BITS = 7
const SUB_ACCESO_FLAG_MASK = 0x7f
const SUB_ACCESO_MORE_BIT = 0x80

// Access levels are 1..4; anything out of range degrades to the lowest level.
export const normalizeAccesoNivel = (nivel?: number): number => {
  if (!nivel || nivel < 1 || nivel > 4) { return 1 }
  return nivel
}

export const makeAccesoNivelPacked = (accesoID: number, nivel: number): number => {
  // Mirror the backend bit-packing so access checks behave exactly the same on both sides.
  return ((accesoID << 2) | (normalizeAccesoNivel(nivel) - 1)) >>> 0
}

export const unpackAccesoNivel = (packedAccesoNivel: number): [accesoID: number, nivel: number] => {
  return [packedAccesoNivel >>> 2, (packedAccesoNivel & 0b11) + 1]
}

// findAccesoNivel returns the granted level of one access, or 0 when it is not held.
//
// Binary search over the fixed 2-byte stride. The bytes are big-endian precisely so that ordering
// by raw u16 is ordering by accesoID, which is what makes this search valid.
export const findAccesoNivel = (accesosComputed: Uint8Array, accesoID: number): number => {
  let leftIndex = 0
  let rightIndex = (accesosComputed.length >> 1) - 1

  while (leftIndex <= rightIndex) {
    const middleIndex = (leftIndex + rightIndex) >> 1
    const byteOffset = middleIndex * 2
    const [middleAccesoID, middleNivel] = unpackAccesoNivel(
      (accesosComputed[byteOffset] << 8) | accesosComputed[byteOffset + 1],
    )

    if (middleAccesoID < accesoID) { leftIndex = middleIndex + 1 }
    else if (middleAccesoID > accesoID) { rightIndex = middleIndex - 1 }
    else { return middleNivel }
  }

  return 0
}

// findAccesoSubGrant walks the variable-width payload, which cannot be binary searched: it returns
// the granted level and the sub-access mask, or [0, 0] when the access is not held there.
//
// Linear with an early exit once the ids pass the target. That costs nothing at this size — a user's
// grants are ~110 bytes in total — and the variable half is the small one by construction, since an
// access only lands here when a profile actually granted it a sub-access.
export const findAccesoSubGrant = (
  accesosSubComputed: Uint8Array,
  accesoID: number,
): [nivel: number, subMask: number] => {
  let byteOffset = 0

  while (byteOffset + 3 <= accesosSubComputed.length) {
    const [entryAccesoID, entryNivel] = unpackAccesoNivel(
      (accesosSubComputed[byteOffset] << 8) | accesosSubComputed[byteOffset + 1],
    )
    byteOffset += 2

    let subMask = 0
    let subByteIndex = 0
    while (byteOffset < accesosSubComputed.length) {
      const subAccesoByte = accesosSubComputed[byteOffset]
      byteOffset += 1
      subMask |= (subAccesoByte & SUB_ACCESO_FLAG_MASK) << (subByteIndex * SUB_ACCESO_FLAG_BITS)
      subByteIndex += 1
      if ((subAccesoByte & SUB_ACCESO_MORE_BIT) === 0) { break }
    }

    if (entryAccesoID === accesoID) { return [entryNivel, subMask] }
    // Sorted ascending, so once the ids pass the target the access is not in this payload.
    if (entryAccesoID > accesoID) { return [0, 0] }
  }

  return [0, 0]
}

// hasAcceso is the two-payload lookup: an access in accesosSubComputed is just as granted as one in
// accesosComputed, and a check that stopped at the first payload would deny it.
export const hasAcceso = (
  accesosComputed: Uint8Array,
  accesosSubComputed: Uint8Array,
  accesoID: number,
  nivel?: number,
): boolean => {
  if (accesoID <= 0) { return false }
  const requestedNivel = normalizeAccesoNivel(nivel)

  const grantedNivel = findAccesoNivel(accesosComputed, accesoID)
  if (grantedNivel > 0) { return grantedNivel >= requestedNivel }

  return findAccesoSubGrant(accesosSubComputed, accesoID)[0] >= requestedNivel
}

// hasSubAcceso applies the "Todos" rule: a sub-access is held when bit 0 (id 1) is set or its own
// bit is. Only accesosSubComputed can carry sub-accesses — an access in the other payload has none
// by definition — so this never consults the first one.
export const hasSubAcceso = (
  accesosSubComputed: Uint8Array,
  accesoID: number,
  subAccesoID: number,
): boolean => {
  if (accesoID <= 0) { return false }
  const subMask = findAccesoSubGrant(accesosSubComputed, accesoID)[1]

  if (subMask & (1 << (SUB_ACCESO_TODOS_ID - 1))) { return true }
  if (subAccesoID < 1 || subAccesoID > MAX_SUB_ACCESO_ID) { return false }
  return (subMask & (1 << (subAccesoID - 1))) !== 0
}

// Stored payload = 2 checksum chars + base64 + 2 checksum chars, so a tampered or
// truncated localStorage value is rejected instead of granting random accesses.
export const wrapAccesosComputed = (packedAccesosBase64: string): string => {
  if (!packedAccesosBase64) { return "" }
  const packedAccessHash = checksum(packedAccesosBase64)
  return `${packedAccessHash.substring(0, 2)}${packedAccesosBase64}${packedAccessHash.substring(2, 4)}`
}

export const decodeStoredAccesosComputed = (storedAccesosComputed: string): Uint8Array => {
  if (!storedAccesosComputed) { return new Uint8Array() }
  if (storedAccesosComputed.length < 5) {
    console.warn("[security] invalid accesos payload")
    return new Uint8Array()
  }

  const packedAccesosBase64 = storedAccesosComputed.substring(2, storedAccesosComputed.length - 2)
  const storedHash = storedAccesosComputed.substring(0, 2)
    + storedAccesosComputed.substring(storedAccesosComputed.length - 2)

  if (checksum(packedAccesosBase64) !== storedHash) {
    console.warn("[security] invalid accesos payload")
    return new Uint8Array()
  }
  return base64ToBytes(packedAccesosBase64)
}

// validateAccesosBlobs rejects a payload whose ordering or framing is wrong, instead of answering
// the wrong question about what a user may do.
//
// The []uint16 column this replaced was defensively re-sorted on load, which turned an out-of-order
// blob into a wrong answer for one user rather than a broken binary search. That defence cannot
// survive on the variable-width payload, where position is load-bearing — so both are validated as
// they are walked and a bad one is discarded whole. Same intent, better failure mode.
export const validateAccesosBlobs = (
  accesosComputed: Uint8Array,
  accesosSubComputed: Uint8Array,
): string => {
  if (accesosComputed.length % 2 !== 0) {
    return `accesosComputed has ${accesosComputed.length} bytes, which are not whole 2-byte grants`
  }

  let previousAccesoID = 0
  for (let byteOffset = 0; byteOffset < accesosComputed.length; byteOffset += 2) {
    const [accesoID] = unpackAccesoNivel((accesosComputed[byteOffset] << 8) | accesosComputed[byteOffset + 1])
    if (accesoID <= previousAccesoID) {
      return `accesosComputed is not sorted: acceso ${accesoID} follows ${previousAccesoID}`
    }
    previousAccesoID = accesoID
  }

  previousAccesoID = 0
  let byteOffset = 0
  while (byteOffset < accesosSubComputed.length) {
    if (byteOffset + 3 > accesosSubComputed.length) {
      return `accesosSubComputed ends mid-grant at byte ${byteOffset}`
    }
    const [accesoID] = unpackAccesoNivel(
      (accesosSubComputed[byteOffset] << 8) | accesosSubComputed[byteOffset + 1],
    )
    if (accesoID <= previousAccesoID) {
      return `accesosSubComputed is not sorted: acceso ${accesoID} follows ${previousAccesoID}`
    }
    previousAccesoID = accesoID
    byteOffset += 2

    let subMask = 0
    let subByteIndex = 0
    let runTerminated = false
    while (byteOffset < accesosSubComputed.length) {
      const subAccesoByte = accesosSubComputed[byteOffset]
      byteOffset += 1
      if (subByteIndex * SUB_ACCESO_FLAG_BITS >= 16) {
        return `accesosSubComputed, acceso ${accesoID}: the sub-access run exceeds a 16-bit mask`
      }
      subMask |= (subAccesoByte & SUB_ACCESO_FLAG_MASK) << (subByteIndex * SUB_ACCESO_FLAG_BITS)
      subByteIndex += 1
      if ((subAccesoByte & SUB_ACCESO_MORE_BIT) === 0) { runTerminated = true; break }
    }
    if (!runTerminated) {
      return `accesosSubComputed, acceso ${accesoID}: the sub-access run ends with MORE still set`
    }
    if (subMask >= (1 << MAX_SUB_ACCESO_ID)) {
      return `accesosSubComputed, acceso ${accesoID}: the sub-access run exceeds sub ${MAX_SUB_ACCESO_ID}`
    }
    // An access with no sub-accesses belongs in the other payload. One here means these bytes were
    // written by something that does not agree with the encoder.
    if (subMask === 0) {
      return `accesosSubComputed holds acceso ${accesoID} with no sub-access at all`
    }
  }

  return ""
}
