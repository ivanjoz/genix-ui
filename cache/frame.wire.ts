/**
 * DataFrame files as the browser reads them. Pure: no fetch, no Svelte, no IndexedDB.
 *
 * A DataFrame is a group-by report the backend keeps as small columnar files, one per Keys value
 * (genix-orm/dataframe/DATAFRAMES.md). A frame route answers only the files the browser must
 * replace, given the ones it holds (`h=`, formatHeldFrameFiles), in this body:
 *
 *   u8       wire version (1)
 *   uvarint  generation length, generation bytes (a rebuild changes it: drop every held file)
 *   u8       Rows columns, u8 summed columns (Sums, then the count)
 *   uvarint  w: the frame's snapshot (SUnixTime), "data as of"
 *   uvarint  file count
 *   file*    uvarint key count, uvarint × keys, uvarint snapshot, u8 slot,
 *            uvarint content length (0 = no rows), the file's bytes
 *
 * and each file (format v3):
 *
 *   u8 version (3), u8 slot, uvarint snapshot, uvarint row count n (nothing follows when 0),
 *   the Rows columns nested like folders, then each summed column: varint minimum, residuals.
 *
 * Residuals: uvarint divisor, then blocks of 128, each a head byte (bits 0–6 width, bit 7 patched),
 * [u8 patch count], the low `width` bits of each residual packed LSB first, then per patch
 * u8 position + uvarint high bits. The Go side is genix-orm/dataframe/codec.go and changed.go; both
 * are pinned by genix-orm/dataframe/testdata/frame_wire_vectors.json.
 *
 * Values are JS numbers: a value past 2^53 fails the decode instead of reading back rounded.
 */

const FORMAT_VERSION = 3
const WIRE_VERSION = 1
const BLOCK_SIZE = 128
const BLOCK_PATCHED_FLAG = 0x80
const BLOCK_WIDTH_MASK = 0x7f

/** A decoded frame file: rows[c][i] is Rows column c of row i, sums[s][i] summed column s of it. */
export interface FrameFile {
	snapshot: number
	slot: number
	rows: number[][]
	sums: number[][]
}

/** A file of a frame route's answer; content is empty for a file without rows. */
export interface FrameAnswerFile {
	keys: number[]
	snapshot: number
	slot: number
	content: Uint8Array
}

export interface FrameAnswer {
	generation: string
	rowColumnCount: number
	sumsCount: number
	snapshot: number
	files: FrameAnswerFile[]
}

/** A file the browser holds: what it sends in `h=` so the route answers only what changed. */
export interface HeldFrameFile {
	keys: number[]
	snapshot: number
	slot: number
}

interface ByteReader {
	bytes: Uint8Array
	position: number
}

const corrupt = (what: string): Error => new Error(`frame wire: ${what} is truncated or corrupt`)

const readByte = (reader: ByteReader): number => {
	if (reader.position >= reader.bytes.length) throw corrupt('a byte')
	return reader.bytes[reader.position++] as number
}

const readUvarint = (reader: ByteReader): number => {
	let value = 0
	let multiplier = 1
	for (let i = 0; i < 8; i++) {
		const byte = readByte(reader)
		value += (byte & 0x7f) * multiplier
		if (byte < 0x80) {
			if (!Number.isSafeInteger(value)) throw corrupt('a uvarint past 2^53')
			return value
		}
		multiplier *= 128
	}
	throw corrupt('a uvarint past 2^53')
}

// readVarint reads Go's zigzag varint.
const readVarint = (reader: ByteReader): number => {
	const zigzag = readUvarint(reader)
	return zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2
}

// readPackedBits reads `width` bits starting at bitPosition, least significant first.
const readPackedBits = (bytes: Uint8Array, bitPosition: number, width: number): number => {
	let value = 0
	let multiplier = 1
	let remaining = width
	let position = bitPosition
	while (remaining > 0) {
		const shift = position & 7
		const taken = Math.min(8 - shift, remaining)
		value += (((bytes[position >> 3] as number) >> shift) & ((1 << taken) - 1)) * multiplier
		multiplier *= 2 ** taken
		position += taken
		remaining -= taken
	}
	return value
}

const readResiduals = (reader: ByteReader, count: number): number[] => {
	const divisor = readUvarint(reader)
	const residuals = new Array<number>(count)
	for (let start = 0; start < count; start += BLOCK_SIZE) {
		const blockLength = Math.min(BLOCK_SIZE, count - start)
		const head = readByte(reader)
		const width = head & BLOCK_WIDTH_MASK
		if (width > 64) throw corrupt('a block width')
		const patchCount = head & BLOCK_PATCHED_FLAG ? readByte(reader) : 0
		const runBytes = Math.ceil((blockLength * width) / 8)
		if (reader.bytes.length - reader.position < runBytes) throw corrupt('a packed run')
		const run = reader.bytes.subarray(reader.position, reader.position + runBytes)
		for (let i = 0; i < blockLength; i++) {
			residuals[start + i] = width === 0 ? 0 : readPackedBits(run, i * width, width)
		}
		reader.position += runBytes
		for (let p = 0; p < patchCount; p++) {
			const position = readByte(reader)
			if (position >= blockLength) throw corrupt('a patch position')
			// The low `width` bits are in the run, so adding the high bits is Go's OR.
			residuals[start + position] = (residuals[start + position] as number) + readUvarint(reader) * 2 ** width
		}
	}
	if (divisor > 1) {
		for (let i = 0; i < count; i++) residuals[i] = (residuals[i] as number) * divisor
	}
	return residuals
}

const readSteps = (reader: ByteReader, count: number): number[] => {
	if (count === 0) return []
	const minStep = readUvarint(reader)
	const steps = readResiduals(reader, count)
	for (let i = 0; i < count; i++) steps[i] = (steps[i] as number) + minStep
	return steps
}

const readSumsColumn = (reader: ByteReader, count: number): number[] => {
	const minimum = readVarint(reader)
	const values = readResiduals(reader, count)
	for (let i = 0; i < count; i++) {
		const value = minimum + (values[i] as number)
		if (!Number.isSafeInteger(value)) throw corrupt('a value past 2^53')
		values[i] = value
	}
	return values
}

const readAscendingColumn = (reader: ByteReader, count: number): number[] => {
	const values = [readUvarint(reader)]
	for (const step of readSteps(reader, count - 1)) values.push((values[values.length - 1] as number) + step)
	return values
}

// readRowColumns reads the Rows tree level by level, then repeats each outer node's value over the
// rows under it (its span: the sum of its children's spans).
const readRowColumns = (reader: ByteReader, rowCount: number, rowColumnCount: number): number[][] => {
	let nodeCount = rowCount
	if (rowColumnCount > 1) {
		nodeCount = readUvarint(reader)
		if (nodeCount === 0 || nodeCount > rowCount) throw corrupt('the Rows tree')
	}
	const rowColumns: number[][] = [readAscendingColumn(reader, nodeCount)]
	const childCountsByLevel: number[][] = [[]]
	for (let level = 1; level < rowColumnCount; level++) {
		const childCounts = readSumsColumn(reader, nodeCount)
		const firstValues = readSumsColumn(reader, nodeCount)
		let childTotal = 0
		for (const childCount of childCounts) {
			if (childCount < 1 || childCount > rowCount - childTotal) throw corrupt('the Rows tree')
			childTotal += childCount
		}
		if (level === rowColumnCount - 1 && childTotal !== rowCount) throw corrupt('the Rows tree')
		const steps = readSteps(reader, childTotal - nodeCount)
		const levelValues: number[] = []
		let stepIndex = 0
		childCounts.forEach((childCount, node) => {
			levelValues.push(firstValues[node] as number)
			for (let i = 1; i < childCount; i++) {
				levelValues.push((levelValues[levelValues.length - 1] as number) + (steps[stepIndex++] as number))
			}
		})
		rowColumns.push(levelValues)
		childCountsByLevel.push(childCounts)
		nodeCount = childTotal
	}
	let childSpans: number[] | undefined
	for (let level = rowColumnCount - 2; level >= 0; level--) {
		const childCounts = childCountsByLevel[level + 1] as number[]
		const spans = new Array<number>(childCounts.length).fill(0)
		let child = 0
		childCounts.forEach((childCount, node) => {
			if (!childSpans) {
				spans[node] = childCount
				return
			}
			for (let i = child; i < child + childCount; i++) spans[node] = (spans[node] as number) + (childSpans[i] as number)
			child += childCount
		})
		const expanded: number[] = []
		;(rowColumns[level] as number[]).forEach((value, node) => {
			for (let i = 0; i < (spans[node] as number); i++) expanded.push(value)
		})
		rowColumns[level] = expanded
		childSpans = spans
	}
	return rowColumns
}

/** decodeFrameFile reads a frame file; rowColumnCount and sumsCount come with the route's answer. */
export const decodeFrameFile = (content: Uint8Array, rowColumnCount: number, sumsCount: number): FrameFile => {
	const reader: ByteReader = { bytes: content, position: 0 }
	if (readByte(reader) !== FORMAT_VERSION) throw corrupt('the file version')
	const slot = readByte(reader)
	const snapshot = readUvarint(reader)
	const rowCount = readUvarint(reader)
	// Every 128 rows take at least one block head per column: a larger count is corrupt.
	if (rowCount > content.length * BLOCK_SIZE + 1) throw corrupt('the row count')
	const file: FrameFile = {
		snapshot,
		slot,
		rows: Array.from({ length: rowColumnCount }, () => []),
		sums: Array.from({ length: sumsCount }, () => []),
	}
	if (rowCount === 0) return file
	file.rows = readRowColumns(reader, rowCount, rowColumnCount)
	for (let s = 0; s < sumsCount; s++) file.sums[s] = readSumsColumn(reader, rowCount)
	if (reader.position !== content.length) throw corrupt('the file end')
	return file
}

/** decodeFrameAnswer reads a frame route's body. */
export const decodeFrameAnswer = (body: Uint8Array): FrameAnswer => {
	const reader: ByteReader = { bytes: body, position: 0 }
	const readBytes = (): Uint8Array => {
		const length = readUvarint(reader)
		if (length > body.length - reader.position) throw corrupt('a length')
		reader.position += length
		return body.subarray(reader.position - length, reader.position)
	}
	if (readByte(reader) !== WIRE_VERSION) throw corrupt('the wire version')
	const generation = new TextDecoder().decode(readBytes())
	const rowColumnCount = readByte(reader)
	const sumsCount = readByte(reader)
	const snapshot = readUvarint(reader)
	const fileCount = readUvarint(reader)
	if (fileCount > body.length) throw corrupt('the file count')
	const files: FrameAnswerFile[] = []
	for (let f = 0; f < fileCount; f++) {
		const keyCount = readUvarint(reader)
		if (keyCount > 3) throw corrupt('a key count')
		const keys = Array.from({ length: keyCount }, () => readUvarint(reader))
		const fileSnapshot = readUvarint(reader)
		const slot = readByte(reader)
		files.push({ keys, snapshot: fileSnapshot, slot, content: readBytes().slice() })
	}
	if (reader.position !== body.length) throw corrupt('the body end')
	return { generation, rowColumnCount, sumsCount, snapshot, files }
}

/** formatHeldFrameFiles writes `h=`: `<keys '_'-joined>.<snapshot>.<slot>`, comma-separated. */
export const formatHeldFrameFiles = (held: HeldFrameFile[]): string => {
	return held.map((file) => `${file.keys.join('_')}.${file.snapshot}.${file.slot}`).join(',')
}
