import { highlightText, type TextLanguage } from './textSyntax';

export type SourceMatch = { start: number; end: number };

export function findSourceMatches(source: string, query: string): SourceMatch[] {
  if (!query) return [];
  const matches: SourceMatch[] = [];
  const haystack = source.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let start = 0;
  while (start <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, start);
    if (index < 0) break;
    matches.push({ start: index, end: index + query.length });
    start = index + Math.max(query.length, 1);
  }
  return matches;
}

export function nextSourceMatchIndex(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  return (current + direction + count) % count;
}

export function highlightSourceMatches(
  source: string,
  language: TextLanguage,
  matches: SourceMatch[],
  activeIndex: number,
): string {
  if (matches.length === 0) return highlightText(source, language);
  let cursor = 0;
  return matches.map((match, index) => {
    const before = highlightText(source.slice(cursor, match.start), language);
    const value = highlightText(source.slice(match.start, match.end), language);
    cursor = match.end;
    return `${before}<mark class="source-search-match${index === activeIndex ? ' current' : ''}">${value}</mark>`;
  }).join('') + highlightText(source.slice(cursor), language);
}
