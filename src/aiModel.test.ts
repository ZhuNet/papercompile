import { describe, expect, it } from 'vitest';
import {
  applyAiPatches,
  isSafeAiAction,
  preflightAiActions,
  validateAiReadTarget,
  validateAiPatchTarget,
  type AiToolOperation,
} from './aiModel';

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

  it('allows safe tex paths on patches', () => {
    expect(isSafeAiAction({ type: 'patch', path: 'main.tex', old_text: 'old', new_text: 'new' })).toBe(true);
    expect(isSafeAiAction({ type: 'patch', path: '../main.tex', old_text: 'old', new_text: 'new' })).toBe(false);
    expect(isSafeAiAction({ type: 'patch', path: 'refs.bib', old_text: 'old', new_text: 'new' })).toBe(false);
  });
});

describe('AI patch read history', () => {
  const read = (path: string, response: number): AiToolOperation => ({ type: 'read_file', path, response });
  const patch = (path: string, response: number): AiToolOperation => ({ type: 'patch', path, response });

  it('allows a patch after reading the same file in an earlier response', () => {
    expect(() => validateAiPatchTarget('main.tex', 2, [read('main.tex', 1)])).not.toThrow();
  });

  it('keeps read_file unrestricted and resolves each patch path independently', () => {
    const operations = [read('main.tex', 1), read('chapter.tex', 1)];
    expect(() => validateAiPatchTarget('main.tex', 2, operations)).not.toThrow();
    expect(() => validateAiPatchTarget('chapter.tex', 2, operations)).not.toThrow();
  });

  it('rejects a patch without an earlier read of that file', () => {
    expect(() => validateAiPatchTarget('main.tex', 2, [])).toThrow(
      'patch rejected for "main.tex": execute read_file for this path before patch',
    );
  });

  it('rejects a patch when the matching read is in the same response', () => {
    expect(() => validateAiPatchTarget('main.tex', 2, [read('main.tex', 2)])).toThrow(
      'patch rejected for "main.tex": read_file and patch must be separate AI responses',
    );
  });

  it('requires a new read after a patch of the same file', () => {
    const operations = [read('main.tex', 1), patch('main.tex', 2)];
    expect(() => validateAiPatchTarget('main.tex', 3, operations)).toThrow(
      'patch rejected for "main.tex": execute read_file again after the lastest patch',
    );
    expect(() => validateAiPatchTarget('main.tex', 3, [...operations, read('main.tex', 3)])).toThrow(
      'patch rejected for "main.tex": read_file and patch must be separate AI responses',
    );
    expect(() => validateAiPatchTarget('main.tex', 4, [...operations, read('main.tex', 3)])).not.toThrow();
  });
});

describe('AI read history', () => {
  const read = (path: string, response: number): AiToolOperation => ({ type: 'read_file', path, response });
  const patch = (path: string, response: number): AiToolOperation => ({ type: 'patch', path, response });

  it('allows the first read of a file', () => {
    expect(() => validateAiReadTarget('main.tex', [])).not.toThrow();
  });

  it('rejects an unchanged repeated read of the same file', () => {
    expect(() => validateAiReadTarget('main.tex', [read('main.tex', 1)])).toThrow(
      'read_file rejected for "main.tex": you do not need to execute read_file again since the lastest read_file had been executed and source codes were not revised',
    );
  });

  it('allows reading again after patching the same file', () => {
    expect(() => validateAiReadTarget('main.tex', [read('main.tex', 1), patch('main.tex', 2)])).not.toThrow();
  });

  it('keeps read validation independent for different files', () => {
    expect(() => validateAiReadTarget('chapter.tex', [read('main.tex', 1)])).not.toThrow();
    expect(() => validateAiReadTarget('main.tex', [read('chapter.tex', 1)])).not.toThrow();
  });

  it('allows reading again after a patch even within the same response', () => {
    expect(() => validateAiReadTarget('main.tex', [read('main.tex', 1), patch('main.tex', 1)])).not.toThrow();
  });

  it('removes rejected reads from execution while returning their errors', () => {
    const result = preflightAiActions(
      [
        { type: 'read_file', path: 'main.tex' },
        { type: 'read_file', path: 'main.tex' },
      ],
      [],
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].error).toBe(
      'read_file rejected for "main.tex": you do not need to execute read_file again since the lastest read_file had been executed and source codes were not revised',
    );
  });

  it('allows a read after a patch earlier in the same response', () => {
    const result = preflightAiActions(
      [
        { type: 'patch', path: 'main.tex', old_text: 'old', new_text: 'new' },
        { type: 'read_file', path: 'main.tex' },
      ],
      [read('main.tex', 1)],
    );

    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('removes a patch rejected by history from execution while returning its error', () => {
    const result = preflightAiActions(
      [{ type: 'patch', path: 'main.tex', old_text: 'old', new_text: 'new' }],
      [],
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].error).toBe(
      'patch rejected for "main.tex": execute read_file for this path before patch',
    );
  });
});
