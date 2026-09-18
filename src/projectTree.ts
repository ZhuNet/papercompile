export type ProjectTreeNode = {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  children: ProjectTreeNode[];
};

export type OutlineTreeNode = {
  title: string;
  level: number;
  page: number;
  children: OutlineTreeNode[];
};

export function buildOutlineTree(items: { title: string; level: number; page: number }[]): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = [];
  const stack: OutlineTreeNode[] = [];
  for (const item of items) {
    const node = { ...item, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

export function parentFolder(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const separator = normalized.lastIndexOf('/');
  return separator < 0 ? '' : normalized.slice(0, separator);
}

export function isValidProjectItemName(name: string): boolean {
  if (!name || name !== name.trim() || name === '.' || name === '..') return false;
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) return false;
  const stem = name.split('.')[0].toUpperCase();
  return !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem);
}

export function buildProjectTree(files: string[], folders: string[] = []): ProjectTreeNode[] {
  const root: ProjectTreeNode = { name: '', path: '', kind: 'folder', children: [] };
  const ensureFolder = (path: string) => {
    let current = root;
    let currentPath = '';
    for (const name of path.split('/').filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      let child = current.children.find((item) => item.kind === 'folder' && item.name === name);
      if (!child) {
        child = { name, path: currentPath, kind: 'folder', children: [] };
        current.children.push(child);
      }
      current = child;
    }
    return current;
  };

  for (const folder of folders) ensureFolder(folder);
  for (const path of files) {
    const folder = ensureFolder(parentFolder(path));
    const name = path.slice(path.lastIndexOf('/') + 1);
    folder.children.push({ name, path, kind: 'file', children: [] });
  }
  const sort = (nodes: ProjectTreeNode[]) => {
    nodes.sort((left, right) => left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === 'folder' ? -1 : 1);
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}
