import { describe, expect, it } from 'vitest';
import { applySourceChanges, compactDiff, createHistory, diffFile, rejectFileChange, savableSourceFiles, sourceBaseline, sourceChanges, sourceWorkingFiles, synchronizeSourceFiles } from './revisionModel';

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

describe('source change maintenance', () => {
  it('turns changed disk content into the same source change used by editor input', () => {
    const current = [{ path: 'main.tex', content: 'before' }];
    const scanned = [{ path: 'main.tex', content: 'after' }];

    expect(sourceChanges(current, scanned)).toEqual([
      { path: 'main.tex', before: 'before', after: 'after' },
    ]);
  });

  it('applies source changes to memory and appends them to undo history', () => {
    const state = applySourceChanges(
      [{ path: 'main.tex', content: 'before' }],
      [],
      [{ path: 'main.tex', before: 'before', after: 'after' }],
    );

    expect(state.files).toEqual([{ path: 'main.tex', content: 'after' }]);
    expect(state.history).toEqual([{ path: 'main.tex', before: 'before', after: 'after' }]);
  });

  it('does not maintain unchanged or non-text files as source changes', () => {
    const current = [
      { path: 'main.tex', content: 'same' },
      { path: 'figure.png', content: null },
    ];

    expect(sourceChanges(current, current)).toEqual([]);
  });

  it('advances an existing memory edit to the latest scanned disk content', () => {
    const memory = [{ path: 'main.tex', content: 'memory edit' }];
    const scanned = [{ path: 'main.tex', content: 'saved content' }];

    const state = synchronizeSourceFiles(scanned, memory, memory, []);

    expect(state.files).toEqual(scanned);
    expect(state.history).toEqual([
      { path: 'main.tex', before: 'memory edit', after: 'saved content' },
    ]);
  });

  it('refreshes disk metadata without replacing the maintained memory source', () => {
    const memory = [{ path: 'main.tex', content: 'memory edit', content_hash: 'old-hash' }];
    const scanned = [{ path: 'main.tex', content: 'disk content', content_hash: 'new-hash' }];

    expect(sourceWorkingFiles(scanned, memory)).toEqual([
      { path: 'main.tex', content: 'memory edit', content_hash: 'new-hash' },
    ]);
  });

  it('keeps saved content as the dirty baseline while accepting scanned file metadata', () => {
    const saved = [{ path: 'main.tex', content: 'before', content_hash: 'old-hash', size: 6 }];
    const scanned = [{ path: 'main.tex', content: 'after', content_hash: 'new-hash', size: 5 }];
    const changes = [{ path: 'main.tex', before: 'before', after: 'after' }];

    expect(sourceBaseline(scanned, saved, changes)).toEqual([
      { path: 'main.tex', content: 'before', content_hash: 'new-hash', size: 5 },
    ]);
  });
});

describe('source saving', () => {
  it('includes saved and unsaved memory sources whenever save is triggered', () => {
    const saved = [
      { path: 'main.tex', content: 'unchanged', content_hash: 'main-hash' },
      { path: 'chapter.tex', content: 'before', content_hash: 'chapter-hash' },
    ];
    const working = [
      { path: 'main.tex', content: 'unchanged', content_hash: 'main-hash' },
      { path: 'chapter.tex', content: 'after', content_hash: 'chapter-hash' },
      { path: 'figure.png', content: null, content_hash: null },
    ];

    expect(savableSourceFiles(working, saved)).toEqual([
      { path: 'main.tex', content: 'unchanged', expectedHash: 'main-hash' },
      { path: 'chapter.tex', content: 'after', expectedHash: 'chapter-hash' },
    ]);
  });
});
