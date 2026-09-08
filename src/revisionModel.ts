export type FileRevision = { path: string; before: string; after: string };

export function diffFile(path: string, before: string, after: string): FileRevision | undefined {
  return before === after ? undefined : { path, before, after };
}

export function rejectFileChange(revision: FileRevision): string {
  return revision.before;
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
