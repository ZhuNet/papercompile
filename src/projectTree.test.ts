import { describe, expect, it } from 'vitest';
import { buildOutlineTree, buildProjectTree, isValidProjectItemName, parentFolder } from './projectTree';

describe('buildProjectTree', () => {
  it('builds folders before files from flat project paths', () => {
    expect(buildProjectTree(['main.tex', 'sections/method.tex', 'sections/intro.tex', 'figures/model.png'])).toEqual([
      { name: 'figures', path: 'figures', kind: 'folder', children: [{ name: 'model.png', path: 'figures/model.png', kind: 'file', children: [] }] },
      { name: 'sections', path: 'sections', kind: 'folder', children: [
        { name: 'intro.tex', path: 'sections/intro.tex', kind: 'file', children: [] },
        { name: 'method.tex', path: 'sections/method.tex', kind: 'file', children: [] },
      ] },
      { name: 'main.tex', path: 'main.tex', kind: 'file', children: [] },
    ]);
  });

  it('returns the containing folder for files and nested folders', () => {
    expect(parentFolder('sections/method.tex')).toBe('sections');
    expect(parentFolder('sections')).toBe('');
    expect(parentFolder('main.tex')).toBe('');
  });

  it('accepts a single valid project item name and rejects empty or unsafe names', () => {
    expect(isValidProjectItemName('chapter.tex')).toBe(true);
    expect(isValidProjectItemName('')).toBe(false);
    expect(isValidProjectItemName('   ')).toBe(false);
    expect(isValidProjectItemName('sections/chapter.tex')).toBe(false);
    expect(isValidProjectItemName('..')).toBe(false);
    expect(isValidProjectItemName('draft?.tex')).toBe(false);
    expect(isValidProjectItemName('CON')).toBe(false);
    expect(isValidProjectItemName('aux.txt')).toBe(false);
    expect(isValidProjectItemName('chapter.')).toBe(false);
    expect(isValidProjectItemName('chapter ')).toBe(false);
    expect(isValidProjectItemName('bad\u0001name.tex')).toBe(false);
  });
});

describe('buildOutlineTree', () => {
  it('nests PDF bookmarks by their outline level', () => {
    expect(buildOutlineTree([
      { title: 'Chapter 1', level: 1, page: 1 },
      { title: 'Section 1.1', level: 2, page: 2 },
      { title: 'Section 1.2', level: 2, page: 4 },
      { title: 'Chapter 2', level: 1, page: 8 },
    ])).toEqual([
      { title: 'Chapter 1', level: 1, page: 1, children: [
        { title: 'Section 1.1', level: 2, page: 2, children: [] },
        { title: 'Section 1.2', level: 2, page: 4, children: [] },
      ] },
      { title: 'Chapter 2', level: 1, page: 8, children: [] },
    ]);
  });
});
