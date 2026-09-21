import { describe, expect, it } from 'vitest';
import { SourceScrollPositions } from '../sourceView';

describe('SourceScrollPositions', () => {
  it('stores an independent scroll position for each source file', () => {
    const positions = new SourceScrollPositions();

    positions.set('main.tex', { top: 420, left: 12 });
    positions.set('notes.md', { top: 90, left: 3 });

    expect(positions.get('main.tex')).toEqual({ top: 420, left: 0 });
    expect(positions.get('notes.md')).toEqual({ top: 90, left: 0 });
  });

  it('ignores horizontal positions when source lines wrap', () => {
    const positions = new SourceScrollPositions();
    positions.set('main.tex', { top: 120, left: 80 });

    expect(positions.get('main.tex')).toEqual({ top: 120, left: 0 });
  });

  it('clears positions when another project is opened', () => {
    const positions = new SourceScrollPositions();
    positions.set('main.tex', { top: 420, left: 12 });

    positions.clear();

    expect(positions.get('main.tex')).toEqual({ top: 0, left: 0 });
  });
});
