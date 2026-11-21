import { describe, expect, it } from 'bun:test'
import { decodeFrameAnswer, decodeFrameFile, formatHeldFrameFiles } from './frame.wire'

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16))

// Hexes from genix-orm/dataframe/testdata/frame_wire_vectors.json (genix-orm db's TestFrameWireVectors).
// Files with a slot (S3 frames):
const ONE_ROWS_COLUMN_HEX = '4507a8b7f4bc0104e90701020640f0024f0a069022020005030a01'
const NESTED_HEX = '45ff80bcf4bc018201030a010006020103000007001400d00f0a06c06024cc2355d8e6852402020155ab56ad5ab56ad5aa55ab56ad5a1500e80702e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4010205010388c61ad158231a6b44638d68ac118d35a2b14634d688c61ad158231a6b44638d68ac118d35a2b14634d688c61ad15823020e00018401103254760821436587103254760821436587103254760821436587103254760821436587103204760821436587103254760821436587103254760821436587104da0be8195018201020180f985d404'
// Files without a slot (table frames):
const NO_ROWS_HEX = '05c8bdf4bc0100'
const ZERO_SUMS_MASK_HEX = '85b0c5f4bc01040465010102300200020501080d880e0a09a04600b0090201021200020280'
// The answers are self-describing colbin messages: every one opens with the schema of ChangedFiles.
const ANSWER_SCHEMA_HEX = 'd466020005000a47656e65726174696f6e0b010e526f77436f6c756d6e436f756e7405020953756d73436f756e74050308536e617073686f7404040546696c65731601000400044b657973100108536e617073686f74040204536c6f74050307436f6e74656e740c'
const ONE_FILE_WIRE_HEX = ANSWER_SCHEMA_HEX + '0a5034462d367356102137441b9d174e280d02290a17a81b9d1724073c1b' + ONE_ROWS_COLUMN_HEX
const NESTED_AND_EMPTY_WIRE_HEX = ANSWER_SCHEMA_HEX + '0a5034462d367357122237441b9d174cf01202f40d04290a040017001e9d1724ff3ce5' + NESTED_HEX + '0b0d042a0a040017c81e9d17'
const NOTHING_CHANGED_WIRE_HEX = ANSWER_SCHEMA_HEX + '0a5034462d367357122237441b9d17'
const TABLE_FRAME_WIRE_HEX = ANSWER_SCHEMA_HEX + '0b336661393163306511240637b0229d174c4002320d041450010017b0229d173c25' + ZERO_SUMS_MASK_HEX + '0b0d041550010017b0229d17'

// The nested vector's values, by the same formula as makeFrameWireVectors.
const nestedRows = (): { rows: number[][]; sums: number[][] } => {
	const rows: number[][] = [[], [], []]
	const sums: number[][] = [[], [], []]
	for (let row = 0; row < 130; row++) {
		rows[0]!.push(10 + Math.floor(row / 50))
		rows[1]!.push((Math.floor(row / 10) % 5) * 7)
		rows[2]!.push(1000 + row * 3 + (row % 2))
		sums[0]!.push((row % 4) * 1000)
		sums[1]!.push((row % 7) - 3)
		sums[2]!.push(row === 77 || row === 129 ? 5_000_000_000 : row % 9)
	}
	return { rows, sums }
}

describe('decodeFrameFile', () => {
	it('reads one Rows column with a negative sum and a divisor', () => {
		expect(decodeFrameFile(fromHex(ONE_ROWS_COLUMN_HEX), 1, 2)).toEqual({
			snapshot: 396172200,
			slot: 7,
			rows: [[1001, 1002, 1005, 1100]],
			sums: [[120, 60, 300, -40], [10, 5, 20, 0]],
		})
	})

	it('reads three nested Rows columns across a block, patches past 32 bits', () => {
		expect(decodeFrameFile(fromHex(NESTED_HEX), 3, 3)).toEqual({ snapshot: 396172800, slot: 255, ...nestedRows() })
	})

	it('reads a file without rows nor slot', () => {
		expect(decodeFrameFile(fromHex(NO_ROWS_HEX), 2, 1)).toEqual({ snapshot: 396173000, slot: 0, rows: [[], []], sums: [[]] })
	})

	it('reads the zero sums mask: empty sums cost nothing, constant ones a byte', () => {
		expect(decodeFrameFile(fromHex(ZERO_SUMS_MASK_HEX), 2, 6)).toEqual({
			snapshot: 396174000,
			slot: 0,
			rows: [[101, 102, 103, 107], [1, 1, 1, 6]],
			sums: [[2500, 1250, 900, 4000], [0, 0, 0, 0], [3, 1, 2, 1], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0]],
		})
	})

	it('refuses a slot flag with slot 0', () => {
		const content = fromHex(ONE_ROWS_COLUMN_HEX)
		content[1] = 0
		expect(() => decodeFrameFile(content, 1, 2)).toThrow()
	})

	it('refuses every truncated prefix', () => {
		const shapes: [string, number, number][] = [[ONE_ROWS_COLUMN_HEX, 1, 2], [NESTED_HEX, 3, 3], [ZERO_SUMS_MASK_HEX, 2, 6]]
		for (const [hex, rowColumnCount, sumsCount] of shapes) {
			const content = fromHex(hex)
			for (let length = 0; length < content.length; length++) {
				expect(() => decodeFrameFile(content.subarray(0, length), rowColumnCount, sumsCount)).toThrow()
			}
		}
	})
})

describe('decodeFrameAnswer', () => {
	it('reads the files, the empty one with no content', () => {
		const answer = decodeFrameAnswer(fromHex(NESTED_AND_EMPTY_WIRE_HEX))
		expect({ ...answer, files: answer.files.map(({ content, ...file }) => ({ ...file, length: content.length })) }).toEqual({
			generation: 'P4F-6sW',
			rowColumnCount: 3,
			sumsCount: 3,
			snapshot: 396172100,
			files: [
				{ keys: [2601, 4], snapshot: 396172800, slot: 255, length: NESTED_HEX.length / 2 },
				{ keys: [2602, 4], snapshot: 396173000, slot: 0, length: 0 },
			],
		})
		expect(answer.files[0]!.content).toBeInstanceOf(Uint8Array)
		expect(decodeFrameFile(answer.files[0]!.content, 3, 3).rows).toEqual(nestedRows().rows)
	})

	it('reads one file and an answer with nothing changed', () => {
		const answer = decodeFrameAnswer(fromHex(ONE_FILE_WIRE_HEX))
		expect(answer.generation).toBe('P4F-6sV')
		expect(answer.files.map((file) => file.keys)).toEqual([[2601]])
		expect(decodeFrameFile(answer.files[0]!.content, answer.rowColumnCount, answer.sumsCount).sums[0]).toEqual([120, 60, 300, -40])
		expect(decodeFrameAnswer(fromHex(NOTHING_CHANGED_WIRE_HEX)).files).toEqual([])
	})

	it('reads a table frame answer: files without slots', () => {
		const answer = decodeFrameAnswer(fromHex(TABLE_FRAME_WIRE_HEX))
		expect(answer.generation).toBe('3fa91c0e')
		expect(answer.files.map(({ keys, slot, content }) => ({ keys, slot, length: content.length }))).toEqual([
			{ keys: [20500, 1], slot: 0, length: ZERO_SUMS_MASK_HEX.length / 2 },
			{ keys: [20501, 1], slot: 0, length: 0 },
		])
		expect(decodeFrameFile(answer.files[0]!.content, answer.rowColumnCount, answer.sumsCount).sums[3]).toEqual([0, 0, 0, 4])
	})

	it('refuses every truncated prefix but the one cut right before the files', () => {
		const body = fromHex(ONE_FILE_WIRE_HEX)
		const decodedLengths: number[] = []
		for (let length = 0; length < body.length; length++) {
			try {
				expect(decodeFrameAnswer(body.subarray(0, length)).files).toEqual([])
				decodedLengths.push(length)
			} catch {
				// refused
			}
		}
		// colbin has no end marker: a body cut between Snapshot and Files is a valid "nothing changed".
		expect(decodedLengths.length).toBe(1)
	})
})

describe('formatHeldFrameFiles', () => {
	it('writes what the Go side parses: no slot for a copy without one', () => {
		expect(formatHeldFrameFiles([
			{ keys: [2601, 4], snapshot: 396172800, slot: 255 },
			{ keys: [2602, 4], snapshot: 396173000, slot: 0 },
		])).toBe('2601_4.396172800.255,2602_4.396173000')
	})
})
