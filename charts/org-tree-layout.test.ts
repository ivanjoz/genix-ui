import { describe, expect, it } from 'bun:test';
import { layoutOrgTree, type IOrgTreeNode, type IOrgTreeSizes } from './org-tree-layout';

const sizes: IOrgTreeSizes = { cardWidth: 100, cardHeight: 40, gapX: 10, gapY: 20, gapStack: 8, indent: 20, maxStack: 3 };
const node = (item: string, ...children: IOrgTreeNode<string>[]): IOrgTreeNode<string> => ({ item, children });
const cardOf = (layout: ReturnType<typeof layoutOrgTree<string>>, item: string) => layout.cards.find((card) => card.item === item)!;

describe('layoutOrgTree', () => {
  it('hangs a short list of leaves under the parent card as an indented column', () => {
    const layout = layoutOrgTree([node('boss', node('a'), node('b'))], sizes);
    expect(cardOf(layout, 'boss')).toEqual({ item: 'boss', x: 0, y: 0 });
    // Indented by 20, stacked with an 8 gap below the 40-high boss card.
    expect(cardOf(layout, 'a')).toEqual({ item: 'a', x: 20, y: 48 });
    expect(cardOf(layout, 'b')).toEqual({ item: 'b', x: 20, y: 96 });
    expect([layout.width, layout.height]).toEqual([120, 136]);
    // The rail runs from the boss card's bottom to the middle of the last card.
    expect(layout.lines).toContainEqual({ x1: 10, y1: 40, x2: 10, y2: 116 });
  });

  it('wraps more leaves than maxStack into columns under a bar', () => {
    const layout = layoutOrgTree([node('boss', node('a'), node('b'), node('c'), node('d'))], sizes);
    // Two columns of 120 with a 10 gap; their rails (x 10 and 140) hang from the bar at y 50.
    expect(cardOf(layout, 'a')).toEqual({ item: 'a', x: 20, y: 58 });
    // Balanced 2 + 2: c heads the second column.
    expect(cardOf(layout, 'c')).toEqual({ item: 'c', x: 150, y: 58 });
    expect(layout.lines).toContainEqual({ x1: 10, y1: 50, x2: 140, y2: 50 });
    // The boss is centered over the bar: middle at 75.
    expect(cardOf(layout, 'boss').x).toBe(25);
    expect(layout.width).toBe(250);
  });

  it('balances the wrapped columns', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e'].map((item) => node(item));
    const layout = layoutOrgTree([node('boss', ...leaves)], { ...sizes, maxStack: 4 });
    // 5 leaves with a max of 4 wrap as 3 + 2, not 4 + 1.
    expect(layout.cards.filter((card) => card.x === 20).map((card) => card.item)).toEqual(['a', 'b', 'c']);
    expect(layout.cards.filter((card) => card.x === 150).map((card) => card.item)).toEqual(['d', 'e']);
  });

  it('puts the leaf column first and the subtrees beside it', () => {
    const layout = layoutOrgTree([node('boss', node('team', node('x')), node('solo'))], sizes);
    expect(cardOf(layout, 'solo').x).toBe(20);
    // The column is 120 wide, the subtree starts after the 10 gap and its card sits on the row top.
    expect(cardOf(layout, 'team')).toEqual({ item: 'team', x: 130, y: 60 });
    expect(cardOf(layout, 'x')).toEqual({ item: 'x', x: 150, y: 108 });
    // A stub joins the bar to the subtree card's middle.
    expect(layout.lines).toContainEqual({ x1: 180, y1: 50, x2: 180, y2: 60 });
  });

  it('shifts the row right when centering the parent would push it past the left edge', () => {
    const layout = layoutOrgTree([node('boss', node('team', node('x'), node('y')))], sizes);
    // A single subtree: the bar collapses to its anchor, so the parent sits right above the team card.
    expect(cardOf(layout, 'boss').x).toBe(cardOf(layout, 'team').x);
    expect(Math.min(...layout.cards.map((card) => card.x))).toBe(0);
  });

  it('places the roots of a forest side by side', () => {
    const layout = layoutOrgTree([node('a'), node('b')], sizes);
    expect(cardOf(layout, 'b').x).toBe(110);
    expect(layout.width).toBe(210);
  });
});
