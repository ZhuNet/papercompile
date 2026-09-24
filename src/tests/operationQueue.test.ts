import { describe, expect, it } from 'vitest';
import { createOperationQueue } from '../operationQueue';

describe('operation queue', () => {
  it('runs operations in submission order without interleaving', async () => {
    const enqueue = createOperationQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;

    const first = enqueue(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      events.push('first:end');
    });
    const second = enqueue(() => events.push('second'));

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues with the next operation after a failure', async () => {
    const enqueue = createOperationQueue();
    const failed = enqueue(() => { throw new Error('failed'); });
    const next = enqueue(() => 'continued');

    await expect(failed).rejects.toThrow('failed');
    await expect(next).resolves.toBe('continued');
  });
});
