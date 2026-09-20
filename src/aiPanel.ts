export const aiPanelHeightKey = 'papercompile.ai.panel-height';

export function clampAiPanelHeight(height: number, viewportHeight: number): number {
  return Math.min(Math.max(height, 140), viewportHeight * 0.7);
}

export function isNearScrollBottom(
  viewport: Pick<HTMLElement, 'scrollTop' | 'clientHeight' | 'scrollHeight'>,
): boolean {
  return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 24;
}
