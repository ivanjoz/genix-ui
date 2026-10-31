import { expect, test } from 'bun:test';
import { AVATAR_NEUTRAL_CSS, avatarColorCss, avatarInitials } from './avatar';

test('avatarInitials', () => {
  expect(avatarInitials('Ivan Javier Angulo')).toBe('IA');
  expect(avatarInitials('admin')).toBe('AD');
  expect(avatarInitials('')).toBe('?');
});

test('avatarColorCss is stable per seed and neutral without one', () => {
  expect(avatarColorCss(3)).toBe(avatarColorCss(11));
  expect(avatarColorCss(0)).toBe(AVATAR_NEUTRAL_CSS);
});
