export function nodeNavigationId(node: { file: string; start: number; end: number }): string {
  return `node-${node.file.replace(/[^a-zA-Z0-9_-]/g, '-')}-${node.start}-${node.end}`;
}

export function outlineNavigationId(item: { file: string; start: number; end: number }): string {
  return nodeNavigationId(item);
}
