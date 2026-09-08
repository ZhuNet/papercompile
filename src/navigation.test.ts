import { describe, expect, it } from 'vitest';
import { nodeNavigationId, outlineNavigationId } from './navigation';

describe('document navigation', () => {
  it('uses file and source range so duplicate titles do not collide', () => {
    expect(nodeNavigationId({ file: 'chapters/a.tex', start: 10, end: 30 })).toBe('node-chapters-a-tex-10-30');
  });

  it('uses the same identity for outline items and rendered nodes', () => {
    const item = { file: 'chapters/a.tex', start: 10, end: 30 };
    expect(outlineNavigationId(item)).toBe(nodeNavigationId(item));
  });

  it('creates a DOM-safe identity without relying on CSS selector escaping', () => {
    expect(nodeNavigationId({ file: 'chapters/intro.tex', start: 10, end: 30 })).toBe('node-chapters-intro-tex-10-30');
  });
});
