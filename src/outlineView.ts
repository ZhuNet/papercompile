export type OutlineNavigationItem = { id: string; title: string; display: string; level: string; file: string; start: number; end: number };

export function outlineNavigation(items: OutlineNavigationItem[]): OutlineNavigationItem[] {
  return items.map(({ id, title, display, level, file, start, end }) => ({ id, title, display, level, file, start, end }));
}
