import { describe, expect, it } from 'bun:test'
import { ifcss } from './css'

describe('ifcss', () => {
	it('drops the default width the caller overrides', () => {
		expect(ifcss('w-100', 'w-80 max-w-100 p-8 flex')).toBe('max-w-100 p-8 flex w-100')
	})

	it('keeps min and max width apart from width', () => {
		expect(ifcss('max-w-[50vw]', 'w-80 min-w-40 max-w-100')).toBe('w-80 min-w-40 max-w-[50vw]')
	})

	it('drops the default height and keeps min and max height apart from it', () => {
		expect(ifcss('h-40', 'h-20 min-h-10 max-h-100 hidden')).toBe('min-h-10 max-h-100 hidden h-40')
		expect(ifcss('min-h-[50vh] max-h-200', 'h-20 min-h-460 max-h-100')).toBe('h-20 min-h-[50vh] max-h-200')
	})

	it('only overrides defaults under the same variants', () => {
		expect(ifcss('md:w-200', 'w-80 md:w-100')).toBe('w-80 md:w-200')
	})

	it('lets a shorthand override its sides, not the reverse', () => {
		expect(ifcss('p-4', 'px-8 pt-2 pointer-events-none')).toBe('pointer-events-none p-4')
		expect(ifcss('my-4', 'mt-8 ml-2')).toBe('ml-2 my-4')
		expect(ifcss('pt-4', 'p-8')).toBe('p-8 pt-4')
	})

	it('reads negative, important and arbitrary values', () => {
		expect(ifcss('-mt-4!', 'mt-8')).toBe('-mt-4!')
		expect(ifcss('[&:hover]:w-[calc(100%-2px)]', 'w-10 [&:hover]:w-20')).toBe('w-10 [&:hover]:w-[calc(100%-2px)]')
	})

	it('keeps every other class and returns the defaults when there is no custom css', () => {
		expect(ifcss('text-sm flex', 'text-xs w-80')).toBe('text-xs w-80 text-sm flex')
		expect(ifcss(undefined, 'w-80 p-8')).toBe('w-80 p-8')
	})
})
