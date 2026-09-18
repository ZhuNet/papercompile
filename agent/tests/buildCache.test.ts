import { describe, expect, it } from 'vitest';
import { shouldBuildSidecar } from '../buildCache.mjs';

describe('sidecar build cache', () => {
  it('builds when an output is missing', () => {
    expect(shouldBuildSidecar({
      currentHash: 'same',
      cachedHash: 'same',
      outputExists: false,
      nativeExists: true,
    })).toBe(true);
  });

  it('skips when inputs and outputs are unchanged', () => {
    expect(shouldBuildSidecar({
      currentHash: 'same',
      cachedHash: 'same',
      outputExists: true,
      nativeExists: true,
    })).toBe(false);
  });

  it('builds when runtime inputs change', () => {
    expect(shouldBuildSidecar({
      currentHash: 'new',
      cachedHash: 'old',
      outputExists: true,
      nativeExists: true,
    })).toBe(true);
  });
});
