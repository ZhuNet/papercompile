import { describe, expect, it } from 'vitest';
import { findSourceMatches, nextSourceMatchIndex } from '../sourceSearch';

describe('source search', () => {
  it('finds all current-file matches without case sensitivity', () => {
    expect(findSourceMatches('Alpha beta alpha', 'ALPHA')).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
    ]);
    expect(findSourceMatches('text', '')).toEqual([]);
  });

  it('cycles through next and previous matches', () => {
    expect(nextSourceMatchIndex(0, 3, 1)).toBe(1);
    expect(nextSourceMatchIndex(2, 3, 1)).toBe(0);
    expect(nextSourceMatchIndex(0, 3, -1)).toBe(2);
    expect(nextSourceMatchIndex(0, 0, 1)).toBe(-1);
  });
});
