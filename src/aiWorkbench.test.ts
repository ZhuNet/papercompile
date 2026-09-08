import { describe, expect, it } from 'vitest';
import { actionLabel, actionName, buildToolResult, loadAiPreferences, setToolPartStatus, visibleAiTurns } from './aiWorkbench';

describe('visibleAiTurns', () => {
  it('keeps only user and assistant display turns', () => {
    expect(visibleAiTurns([
      { role: 'user', content: 'Update the title' },
      { role: 'assistant', content: 'read main.tex', parts: [] },
      { role: 'assistant', content: 'Title updated', parts: [{ kind: 'text', text: 'Title updated' }] },
    ])).toEqual([
      { role: 'user', content: 'Update the title' },
      { role: 'assistant', content: 'Title updated', parts: [{ kind: 'text', text: 'Title updated' }] },
    ]);
  });
});

describe('loadAiPreferences', () => {
  it('falls back safely when no saved preferences exist', () => {
    expect(loadAiPreferences({ endpoint: 'default-endpoint', model: 'default-model', key: 'default-key' })).toEqual({ endpoint: 'default-endpoint', model: 'default-model', key: 'default-key' });
  });
});

describe('actionLabel', () => {
  it('turns successful file actions into concise activity text', () => {
    expect(actionLabel({ type: 'patch', path: 'main.tex' })).toBe('已修改 main.tex');
    expect(actionLabel({ type: 'create_folder', path: 'chapters' })).toBe('已创建文件夹 chapters');
    expect(actionLabel({ type: 'rename', from: 'draft.tex', to: 'main.tex' })).toBe('已重命名 draft.tex 为 main.tex');
  });

  it('uses an unfinished action name while a tool is pending', () => {
    expect(actionName({ type: 'read_file', path: 'main.tex' })).toBe('读取 main.tex');
    expect(actionName({ type: 'patch', path: 'main.tex' })).toBe('修改 main.tex');
  });

  it('uses the same action name when a tool fails', () => {
    expect(actionName({ type: 'trash', path: 'old.tex' })).toBe('移入回收站 old.tex');
  });
});

describe('tool result message', () => {
  it('uses tool errors and execution observations as the next user message', () => {
    expect(buildToolResult(['校验失败：invalid tool JSON'], ['main.tex: source'])).toBe(
      '校验失败：invalid tool JSON\nmain.tex: source',
    );
  });
});

describe('tool activity state', () => {
  it('replaces a pending tool part with its completed state', () => {
    const parts = [{ kind: 'tool' as const, action: { type: 'read_file' as const, path: 'main.tex' }, status: 'pending' as const }];
    expect(setToolPartStatus(parts, 0, 'completed')).toEqual([
      { kind: 'tool', action: { type: 'read_file', path: 'main.tex' }, status: 'completed' },
    ]);
    expect(parts[0].status).toBe('pending');
  });
});
