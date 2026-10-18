import { describe, expect, it } from 'bun:test'
import { decodeFrameAnswer, decodeFrameFile, formatHeldFrameFiles } from './frame.wire'

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16))

// Hexes from genix-orm/dataframe/testdata/frame_wire_vectors.json (TestFrameWireVectors).
const ONE_ROWS_COLUMN_HEX = '0307a8b7f4bc0104e90701020640f0024f0a069022020005030a01'
const NESTED_HEX = '03ff80bcf4bc018201030a01010006020103000100070100140100d00f0a06c06024cc2355d8e6852402020155ab56ad5ab56ad5aa55ab56ad5a1500e80702e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4010205010388c61ad158231a6b44638d68ac118d35a2b14634d688c61ad158231a6b44638d68ac118d35a2b14634d688c61ad15823020e00018401103254760821436587103254760821436587103254760821436587103254760821436587103204760821436587103254760821436587103254760821436587104da0be8195018201020180f985d404'
const NO_ROWS_HEX = '0303c8bdf4bc0100'
const ONE_FILE_WIRE_HEX = '01075034462d3673560102c4b6f4bc010101a914a8b7f4bc01071b' + ONE_ROWS_COLUMN_HEX
const NESTED_AND_EMPTY_WIRE_HEX = '01075034462d3673570303c4b6f4bc010202a9140480bcf4bc01ffe901' + NESTED_HEX + '02aa1404c8bdf4bc010000'
const NOTHING_CHANGED_WIRE_HEX = '01075034462d3673570303c4b6f4bc0100'

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

	it('reads a file without rows', () => {
		expect(decodeFrameFile(fromHex(NO_ROWS_HEX), 2, 1)).toEqual({ snapshot: 396173000, slot: 3, rows: [[], []], sums: [[]] })
	})

	it('refuses every truncated prefix', () => {
		for (const hex of [ONE_ROWS_COLUMN_HEX, NESTED_HEX]) {
			const content = fromHex(hex)
			for (let length = 0; length < content.length; length++) {
				expect(() => decodeFrameFile(content.subarray(0, length), hex === NESTED_HEX ? 3 : 1, hex === NESTED_HEX ? 3 : 2)).toThrow()
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
		expect(decodeFrameFile(answer.files[0]!.content, 3, 3).rows).toEqual(nestedRows().rows)
	})

	it('reads one file and an answer with nothing changed', () => {
		const answer = decodeFrameAnswer(fromHex(ONE_FILE_WIRE_HEX))
		expect(answer.generation).toBe('P4F-6sV')
		expect(answer.files.map((file) => file.keys)).toEqual([[2601]])
		expect(decodeFrameFile(answer.files[0]!.content, answer.rowColumnCount, answer.sumsCount).sums[0]).toEqual([120, 60, 300, -40])
		expect(decodeFrameAnswer(fromHex(NOTHING_CHANGED_WIRE_HEX)).files).toEqual([])
	})

	it('refuses every truncated prefix', () => {
		const body = fromHex(ONE_FILE_WIRE_HEX)
		for (let length = 0; length < body.length; length++) {
			expect(() => decodeFrameAnswer(body.subarray(0, length))).toThrow()
		}
	})
})

describe('formatHeldFrameFiles', () => {
	it('writes what the Go side parses', () => {
		expect(formatHeldFrameFiles([
			{ keys: [2601, 4], snapshot: 396172800, slot: 255 },
			{ keys: [2602, 4], snapshot: 396173000, slot: 0 },
		])).toBe('2601_4.396172800.255,2602_4.396173000.0')
	})
})
