import { describe, expect, it } from 'vitest';
import { buildNavigationTree, selectTreeIndex } from './documentTree';

describe('document tree navigation', () => {
  const body = [
    { id: 'a', title: 'Intro', display: '1 Intro', level: 'Section' },
    { id: 'b', title: 'Method', display: '1.1 Method', level: 'Subsection' },
  ];

  it('uses the same tree indexes for outline and rendered body', () => {
    const tree = buildNavigationTree(body);
    expect(tree).toEqual([
      { index: 0, id: 'a', title: 'Intro', display: '1 Intro', level: 'Section' },
      { index: 1, id: 'b', title: 'Method', display: '1.1 Method', level: 'Subsection' },
    ]);
  });

  it('ignores invalid selection instead of navigating to document top', () => {
    expect(selectTreeIndex(1, 2)).toBe(1);
    expect(selectTreeIndex(99, 2)).toBeUndefined();
  });
});
