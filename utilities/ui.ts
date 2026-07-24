let throttleTimer: ReturnType<typeof setTimeout> | undefined;

export const throttle = (callback: () => void, delay: number) => {
  if (throttleTimer) { clearTimeout(throttleTimer); }
  throttleTimer = setTimeout(() => {
    callback();
    throttleTimer = undefined;
  }, delay);
};

export interface HighlightPart {
  text: string;
  highl?: boolean;
  isEnd?: boolean;
}

export const highlString = (phrase: string, words: string[]): HighlightPart[] => {
  if (typeof phrase !== 'string') { return [{ text: '!' }]; }
  const highlightedParts: HighlightPart[] = [{ text: phrase }];
  if (!words?.length) { return highlightedParts; }

  for (const word of words) {
    if (word.length < 2) { continue; }
    for (let partIndex = 0; partIndex < highlightedParts.length; partIndex++) {
      const currentText = highlightedParts[partIndex].text;
      const matchIndex = currentText.toLowerCase().indexOf(word);
      if (matchIndex < 0) { continue; }

      const splitParts: HighlightPart[] = [
        { text: currentText.slice(0, matchIndex) },
        { text: currentText.slice(matchIndex, matchIndex + word.length), highl: true },
        { text: currentText.slice(matchIndex + word.length) },
      ].filter((part) => part.text);
      highlightedParts.splice(partIndex, 1, ...splitParts);
      if (highlightedParts.length > 40) { return highlightedParts; }
    }
  }
  return highlightedParts;
};

export const parseSVG = (svgContent: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;

export const cn = (...classNames: (string | boolean | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export const wordInclude = (text: string, search: string | string[]) => {
  const words = typeof search === 'string'
    ? search.split(' ').filter(Boolean)
    : search;
  if (!words?.length || search === 'undefined') { return true; }
  return words.slice(0, 6).every((word) => text.includes(word));
};

export const splitTwoStrings = (text: string, maxLength?: number): [string, string] => {
  if (!text) { return ['', '']; }
  if (maxLength && text.length <= maxLength) { return [text, '']; }

  let closestDifference = Infinity;
  let splitIndex = -1;
  for (let currentIndex = 0; currentIndex < text.length; currentIndex++) {
    if (text[currentIndex] !== ' ') { continue; }
    const difference = Math.abs(currentIndex - (text.length - currentIndex - 1));
    if (difference < closestDifference) {
      closestDifference = difference;
      splitIndex = currentIndex;
    }
  }

  return splitIndex < 0
    ? [text, '']
    : [text.slice(0, splitIndex), text.slice(splitIndex + 1)];
};
