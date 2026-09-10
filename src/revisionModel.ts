export type FileRevision = { path: string; before: string; after: string };
type SourceFile = { path: string; content?: string | null };

export function diffFile(path: string, before: string, after: string): FileRevision | undefined {
  return before === after ? undefined : { path, before, after };
}

export function rejectFileChange(revision: FileRevision): string {
  return revision.before;
}

export function sourceChanges(
  current: SourceFile[],
  next: SourceFile[],
): FileRevision[] {
  const currentByPath = new Map(current.map((file) => [file.path, file.content]));
  return next.flatMap((file) => {
    const before = currentByPath.get(file.path);
    return typeof before === 'string'
      && typeof file.content === 'string'
      && before !== file.content
      ? [{ path: file.path, before, after: file.content }]
      : [];
  });
}

export function applySourceChanges<T extends SourceFile>(
  files: T[],
  history: FileRevision[],
  changes: FileRevision[],
): { files: T[]; history: FileRevision[] } {
  const contentByPath = new Map(changes.map((change) => [change.path, change.after]));
  return {
    files: files.map((file) =>
      contentByPath.has(file.path) ? { ...file, content: contentByPath.get(file.path) } : file,
    ),
    history: [...history, ...changes],
  };
}

export function sourceWorkingFiles<T extends SourceFile>(scanned: T[], working: SourceFile[]): T[] {
  const workingContent = new Map(working.map((file) => [file.path, file.content]));
  return scanned.map((file) =>
    workingContent.has(file.path) ? { ...file, content: workingContent.get(file.path) } : file,
  );
}

export function sourceBaseline<T extends SourceFile>(
  scanned: T[],
  saved: SourceFile[],
  changes: FileRevision[],
): T[] {
  const savedContent = new Map(saved.map((file) => [file.path, file.content]));
  const changedPaths = new Set(changes.map((change) => change.path));
  return scanned.map((file) =>
    changedPaths.has(file.path) && savedContent.has(file.path)
      ? { ...file, content: savedContent.get(file.path) }
      : file,
  );
}

export function synchronizeSourceFiles<T extends SourceFile>(
  scanned: T[],
  working: SourceFile[],
  saved: SourceFile[],
  history: FileRevision[],
): { files: T[]; saved: T[]; history: FileRevision[] } {
  const changes = sourceChanges(working, scanned);
  const state = applySourceChanges(sourceWorkingFiles(scanned, working), history, changes);
  return {
    files: state.files,
    saved: sourceBaseline(scanned, saved, changes),
    history: state.history,
  };
}

export function savableSourceFiles(
  working: SourceFile[],
  saved: (SourceFile & { content_hash?: string | null })[],
): { path: string; content: string; expectedHash: string }[] {
  const savedByPath = new Map(saved.map((file) => [file.path, file]));
  return working.flatMap((file) => {
    const baseline = savedByPath.get(file.path);
    return typeof file.content === 'string' && typeof baseline?.content_hash === 'string'
      ? [{ path: file.path, content: file.content, expectedHash: baseline.content_hash }]
      : [];
  });
}

export function compactDiff(before: string, after: string): { before: string; after: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { before: before.slice(start, beforeEnd), after: after.slice(start, afterEnd) };
}

export function createHistory(initial: string) {
  let value = initial;
  const undoStack: string[] = [];
  const state = () => ({
    value,
    dirty: true,
    undo: () => {
      const previous = undoStack.pop();
      if (previous !== undefined) {
        value = previous;
      }
      return state();
    },
  });
  return {
    apply(next: string) {
      if (next !== value) {
        undoStack.push(value);
        value = next;
      }
      return state();
    },
  };
}
