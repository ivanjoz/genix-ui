import { describe, expect, it } from "bun:test"

import { bitmaskToIDs, idsToBitmask, isBitmaskID, MAX_BITMASK_ID } from "./multi-select"

describe("SelectMultiple bitmask", () => {
  it("maps option id n to bit n-1", () => {
    expect(idsToBitmask([1])).toBe(1)
    expect(idsToBitmask([2])).toBe(2)
    expect(idsToBitmask([3])).toBe(4)
    expect(idsToBitmask([1, 3])).toBe(5)
    expect(idsToBitmask([])).toBe(0)
  })

  it("keeps the mask a positive int32 up to the last id", () => {
    const allIDs = Array.from({ length: MAX_BITMASK_ID }, (_, index) => index + 1)
    expect(idsToBitmask([MAX_BITMASK_ID])).toBe(2 ** 30)
    expect(idsToBitmask(allIDs)).toBe(2 ** 31 - 1)
  })

  it("decodes a mask back into ascending ids", () => {
    expect(bitmaskToIDs(0)).toEqual([])
    expect(bitmaskToIDs(5)).toEqual([1, 3])
    expect(bitmaskToIDs(idsToBitmask([31, 2, 7]))).toEqual([2, 7, 31])
  })

  it("accepts only integer ids from 1 to 31", () => {
    expect(isBitmaskID(1)).toBe(true)
    expect(isBitmaskID(31)).toBe(true)
    expect(isBitmaskID(0)).toBe(false)
    expect(isBitmaskID(32)).toBe(false)
    expect(isBitmaskID(1.5)).toBe(false)
    expect(isBitmaskID("3")).toBe(false)
  })
})
