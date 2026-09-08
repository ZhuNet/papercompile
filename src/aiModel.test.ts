import { describe, expect, it } from 'vitest';
import { applyAiPatches, isSafeAiAction } from './aiModel';

describe('AI working-copy patches', () => {
  it('applies a uniquely matched old_text without relying on model-provided offsets', () => {
    expect(applyAiPatches('Before target after.', [
      { path: 'main.tex', old_text: 'target', new_text: 'replacement' },
    ])).toBe('Before replacement after.');
  });

  it('applies multiple uniquely matched patches', () => {
    const result = applyAiPatches('Old first. Old second.', [
      { path: 'main.tex', old_text: 'Old first', new_text: 'New first' },
      { path: 'main.tex', old_text: 'Old second', new_text: 'Fresh second' },
    ]);
    expect(result).toBe('New first. Fresh second.');
  });

  it('rejects a patch when old_text is missing or ambiguous', () => {
    expect(() => applyAiPatches('Changed.', [{ path: 'main.tex', old_text: 'Old', new_text: 'New' }])).toThrow('stale');
    expect(() => applyAiPatches('Old and Old.', [{ path: 'main.tex', old_text: 'Old', new_text: 'New' }])).toThrow('ambiguous');
  });
});

describe('AI directory action safety', () => {
  it('allows only relative paths within the current project', () => {
    expect(isSafeAiAction({ type: 'rename', from: 'draft.tex', to: 'archive/draft.tex' })).toBe(true);
    expect(isSafeAiAction({ type: 'create_file', path: '../outside.tex', content: '' })).toBe(false);
    expect(isSafeAiAction({ type: 'trash', path: 'C:/secret.txt' })).toBe(false);
  });

  it('limits patches to tex files', () => {
    expect(isSafeAiAction({ type: 'patch', path: 'main.tex', old_text: 'old', new_text: 'new' })).toBe(true);
    expect(isSafeAiAction({ type: 'patch', path: 'refs.bib', old_text: 'a', new_text: 'b' })).toBe(false);
  });
});
