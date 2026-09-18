import { describe, expect, it } from 'vitest';
import { outlineNavigation } from '../outlineView';

describe('outline navigation', () => {
  it('keeps the outline as read-only navigation data', () => {
    expect(outlineNavigation([
      { id: 'main:10-30', title: 'Introduction', display: '1 Introduction', level: 'Section', file: 'main.tex', start: 10, end: 30 },
    ])).toEqual([{ id: 'main:10-30', title: 'Introduction', display: '1 Introduction', level: 'Section', file: 'main.tex', start: 10, end: 30 }]);
  });
});
