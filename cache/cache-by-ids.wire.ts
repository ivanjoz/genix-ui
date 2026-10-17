/**
 * The by-IDs request (`cc`) and the year ticks it carries. Pure: no fetch, no Svelte.
 *
 * The backend keeps, per partition and slot (`uint8(ID)`), the year tick of the slot's last write: a
 * 2-second counter from the year cycle's start, January 1 at 07:00 UTC: one Updated (SUnixTime) unit. A
 * by-IDs record's `upd` is its slot's tick as an Updated value (the end of the tick's window);
 * `toYearTick` turns it back. The Go side is genix-orm/dynamo/cache_by_ids.go (DecodeCachedIDsRequest,
 * yearTickToUpdated), and both are pinned by genix-orm/db/cache/testdata/year_tick_vectors.json.
 */
import { appendUvarint, bytesToBase64 } from '../utilities/index.js'

// yearCycleOf is the year cycle holding a moment: the calendar year, until its 07:00 UTC January 1.
export const yearCycleOf = (unixMillis: number): number => {
	const year = new Date(unixMillis).getUTCFullYear()
	return unixMillis < Date.UTC(year, 0, 1, 7) ? year - 1 : year
}

// cycleStartUpdated is a cycle's start in Updated units: SUnixTime, (unix seconds − 1e9) / 2.
export const cycleStartUpdated = (cycleYear: number): number =>
	(Date.UTC(cycleYear, 0, 1, 7) / 1000 - 1e9) / 2

// toYearTick is the tick a held record's `upd` stands for. 0 (nothing known) and a value from an
// earlier cycle both give 0, which makes the server read the record again: on January 1 every
// record is read once more, the yearly reset.
export const toYearTick = (upd: number, cycleStart: number): number => {
	if (!upd || upd < cycleStart) return 0
	return upd - cycleStart + 1
}

export interface CachedIDsPartitionRequest {
	partition: number // 0 for a table without Partition
	idTicks: [id: number, heldTick: number][] // heldTick 0: the record isn't held
}

/**
 * encodeCachedIDsRequest builds the `cc` parameter, bytesToBase64 of:
 *
 *   [cycle year − 2000: u8]
 *   [partition count: uvarint]
 *   per partition, ascending:
 *     [partition delta: uvarint]                  the first one is absolute
 *     [slot count: uvarint]
 *     [slot: u8][year tick: u24 LE] × slot count   ascending by slot, ticks ≥ 1
 *     [ID count: uvarint]
 *     [ID delta: uvarint] × ID count              ascending IDs, the first one absolute
 *
 * Partitions must be distinct.
 */
export const encodeCachedIDsRequest = (cycleYear: number, partitions: CachedIDsPartitionRequest[]): string => {
	const bytes: number[] = [cycleYear - 2000]
	const sortedPartitions = [...partitions].sort((a, b) => a.partition - b.partition)
	appendUvarint(bytes, sortedPartitions.length)

	let previousPartition = 0
	for (const { partition, idTicks } of sortedPartitions) {
		appendUvarint(bytes, partition - previousPartition)
		previousPartition = partition

		// One tick per slot: the lowest held among its requested IDs. A held tick is never above the
		// slot's, so "lowest == slot" proves every record of the slot current; a lower one makes the
		// server read them all, after which they agree. A record not held (0) leaves the slot unlisted.
		const lowestTickBySlot = new Map<number, number>()
		for (const [id, heldTick] of idTicks) {
			const slot = id % 256
			lowestTickBySlot.set(slot, Math.min(lowestTickBySlot.get(slot) ?? heldTick, heldTick))
		}
		const listedSlots = [...lowestTickBySlot].filter(([, tick]) => tick > 0).sort((a, b) => a[0] - b[0])
		appendUvarint(bytes, listedSlots.length)
		for (const [slot, tick] of listedSlots) {
			bytes.push(slot, tick & 0xff, (tick >> 8) & 0xff, (tick >> 16) & 0xff)
		}

		const sortedIDs = [...new Set(idTicks.map(([id]) => id))].sort((a, b) => a - b)
		appendUvarint(bytes, sortedIDs.length)
		let previousID = 0
		for (const id of sortedIDs) {
			appendUvarint(bytes, id - previousID)
			previousID = id
		}
	}
	return bytesToBase64(bytes)
}
