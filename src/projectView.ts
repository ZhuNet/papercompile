export type ProjectFile = { path: string; content: string; content_hash: string };
export type ProjectResponse = { root: string; entry: string; files: ProjectFile[] };
export type ProjectView = { entryPath: string; entryContent: string; files: string[] };

export function projectViewFromResponse(project: ProjectResponse): ProjectView {
  const entry = project.files.find((file) => file.path === project.entry);
  return {
    entryPath: project.entry,
    entryContent: entry?.content ?? '',
    files: project.files.map((file) => file.path),
  };
}

export function contentForPath(files: ProjectFile[], path: string): string {
  return files.find((file) => file.path === path)?.content ?? '';
}

export function projectLocation(path: string): { name: string; path: string } {
  const normalized = path.replace(/[\\/]+$/, '');
  return { name: normalized.split(/[\\/]/).pop() || normalized, path };
}

export function projectNotice(path: string, success: boolean): { title: string; detail: string; path: string; tone: 'success' | 'error' } {
  return { title: success ? '项目已打开' : '项目切换失败', detail: success ? projectLocation(path).name : '请检查项目文件夹和入口文件', path, tone: success ? 'success' : 'error' };
}
