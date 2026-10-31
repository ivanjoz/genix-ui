// Helpers of Avatar and AvatarToggleGroup: the two letters and the color of a person's circle.

const AVATAR_COLOR_CSS = [
  'bg-blue-bg-strong text-blue-fg', 'bg-green-bg-strong text-green-fg', 'bg-purple-bg-strong text-purple-fg', 'bg-orange-bg-strong text-orange-fg',
  'bg-teal-bg-strong text-teal-fg', 'bg-pink-bg-strong text-pink-fg', 'bg-red-bg-strong text-red-fg', 'bg-amber-bg-strong text-amber-fg',
];

// Without a seed (no person: "Unassigned") the circle is neutral gray.
export const AVATAR_NEUTRAL_CSS = 'bg-surface-strong text-fg-soft';

/** The same seed (a user ID) always gets the same color, on every page. */
export const avatarColorCss = (colorSeed: number): string =>
  colorSeed ? AVATAR_COLOR_CSS[Math.abs(colorSeed) % AVATAR_COLOR_CSS.length] : AVATAR_NEUTRAL_CSS;

/** First letter of the first and last words: "Ivan Javier Angulo" → "IA", a single word its first two: "admin" → "AD". */
export const avatarInitials = (name: string): string => {
  const nameWords = (name || '').trim().split(/\s+/).filter(Boolean);
  if (nameWords.length === 0) { return '?'; }
  return (nameWords[0][0] + (nameWords.length > 1 ? nameWords[nameWords.length - 1][0] : nameWords[0][1] || '')).toUpperCase();
};
