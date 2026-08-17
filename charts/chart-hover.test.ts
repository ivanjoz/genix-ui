import { describe, expect, it } from 'bun:test';
import { formatHoverValue, getHoverCrosshairX, resolveHoverPointIndex } from './chart-hover';

describe('resolveHoverPointIndex', () => {
  it('maps a pointer to the column it sits in', () => {
    expect(resolveHoverPointIndex(0, 10, 5)).toBe(0);
    expect(resolveHoverPointIndex(9.9, 10, 5)).toBe(0);
    expect(resolveHoverPointIndex(10, 10, 5)).toBe(1);
    expect(resolveHoverPointIndex(34, 10, 5)).toBe(3);
  });

  it('clamps a pointer past either edge to the nearest column', () => {
    expect(resolveHoverPointIndex(-4, 10, 5)).toBe(0);
    // The overlay's own width rounds up against the plot's, so a pointer on the last pixel can
    // resolve one column past the end. It is still asking about the last column.
    expect(resolveHoverPointIndex(50, 10, 5)).toBe(4);
    expect(resolveHoverPointIndex(999, 10, 5)).toBe(4);
  });

  it('returns null when there is nothing to point at', () => {
    expect(resolveHoverPointIndex(20, 10, 0)).toBeNull();
    expect(resolveHoverPointIndex(20, 0, 5)).toBeNull();
  });

  it('resolves sub-pixel columns, which is the 360-point four-hour window', () => {
    const columnWidth = 700 / 360;
    expect(resolveHoverPointIndex(0, columnWidth, 360)).toBe(0);
    expect(resolveHoverPointIndex(350, columnWidth, 360)).toBe(180);
    expect(resolveHoverPointIndex(699.9, columnWidth, 360)).toBe(359);
  });
});

describe('getHoverCrosshairX', () => {
  it('lands on the column center, where the line vertex is drawn', () => {
    expect(getHoverCrosshairX(0, 10)).toBe(5);
    expect(getHoverCrosshairX(3, 10)).toBe(35);
  });
});

describe('formatHoverValue', () => {
  it('keeps integers clean and trims trailing precision', () => {
    expect(formatHoverValue(38)).toBe('38');
    expect(formatHoverValue(3.6)).toBe('3.6');
    expect(formatHoverValue(3.60001)).toBe('3.6');
    expect(formatHoverValue(0.123456)).toBe('0.12');
  });

  it('does not print a non-finite value as a number', () => {
    expect(formatHoverValue(Number.NaN)).toBe('--');
    expect(formatHoverValue(Number.POSITIVE_INFINITY)).toBe('--');
  });
});
