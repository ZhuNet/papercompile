import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';

describe('file operation serialization', () => {
  it('queues each watcher event without merging it', () => {
    expect(appSource).not.toContain('let syncing = false');
    expect(appSource).not.toContain('let changePending = false');
    expect(appSource).toContain('void enqueueFileOperation(async () =>');
  });

  it('queues frontend edits, undo, and save through the same FIFO', () => {
    expect(appSource).toContain('const enqueueFileOperation = createOperationQueue();');
    expect(appSource).toContain('const editTex = (path: string, value: string) => void enqueueFileOperation(() =>');
    expect(appSource).toContain('const undo = () => void enqueueFileOperation(() =>');
    expect(appSource).toContain('const saveProject = (): Promise<boolean> => enqueueFileOperation(async () =>');
  });
});
