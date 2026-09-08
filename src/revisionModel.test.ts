import { describe, expect, it } from 'vitest';
import { compactDiff, createHistory, diffFile, rejectFileChange } from './revisionModel';

describe('revision model', () => {
  it('creates a saved revision from the disk baseline and working copy', () => {
    expect(diffFile('main.tex', 'old text', 'new text')).toEqual({
      path: 'main.tex',
      before: 'old text',
      after: 'new text',
    });
  });

  it('returns the baseline when a saved revision is rejected', () => {
    expect(rejectFileChange({ path: 'main.tex', before: 'old', after: 'new' })).toBe('old');
  });

  it('shows only the changed text instead of the whole document', () => {
    expect(compactDiff('Long unchanged prefix. Old sentence. Long unchanged suffix.', 'Long unchanged prefix. New sentence. Long unchanged suffix.')).toEqual({
      before: 'Old',
      after: 'New',
    });
  });

  it('treats reject as a working-copy edit that can be saved and undone', () => {
    const history = createHistory('new');
    const rejected = history.apply('old');
    expect(rejected.value).toBe('old');
    expect(rejected.dirty).toBe(true);
    expect(rejected.undo().value).toBe('new');
  });
});
