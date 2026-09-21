import { describe, expect, it } from 'vitest';
import { clampAiPanelHeight, isNearScrollBottom } from '../aiPanel';

describe('AI panel sizing', () => {
  it('clamps the expanded height between 190px and 70% of the viewport', () => {
    expect(clampAiPanelHeight(90, 1000)).toBe(190);
    expect(clampAiPanelHeight(420, 1000)).toBe(420);
    expect(clampAiPanelHeight(900, 1000)).toBe(700);
  });
});

describe('AI timeline bottom following', () => {
  it('follows only while the viewport is within 24px of the bottom', () => {
    expect(isNearScrollBottom({ scrollTop: 676, clientHeight: 300, scrollHeight: 1000 })).toBe(true);
    expect(isNearScrollBottom({ scrollTop: 675, clientHeight: 300, scrollHeight: 1000 })).toBe(false);
  });

});
