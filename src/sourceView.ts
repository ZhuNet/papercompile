export type SourceScrollPosition = { top: number; left: number };

export class SourceScrollPositions {
  private readonly positions = new Map<string, SourceScrollPosition>();

  get(path: string): SourceScrollPosition {
    return this.positions.get(path) ?? { top: 0, left: 0 };
  }

  set(path: string, position: SourceScrollPosition): void {
    if (!path) return;
    this.positions.set(path, { top: position.top, left: 0 });
  }

  clear(): void {
    this.positions.clear();
  }
}
