import { describe, expect, test } from 'bun:test'
import { guideRouteId } from './route-guide.ts'

describe('guideRouteId', () => {
  test('maps a glob path to the SvelteKit route id', () => {
    expect(guideRouteId('../routes/berrypack/seasons/GUIDE.md')).toBe('/berrypack/seasons')
    expect(guideRouteId('/routes/[module]/users/GUIDE.md')).toBe('/[module]/users')
  })
})
