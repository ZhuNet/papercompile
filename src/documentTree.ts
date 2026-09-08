export type TreeNode = { index: number; id: string; title: string; display: string; level: string };

export function buildNavigationTree(nodes: Omit<TreeNode, 'index'>[]): TreeNode[] {
  return nodes.map((node, index) => ({ index, ...node }));
}

export function selectTreeIndex(index: number, length: number): number | undefined {
  return index >= 0 && index < length ? index : undefined;
}
