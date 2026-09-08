export type AiPatch = { path: string; old_text: string; new_text: string };
export type AiAction = AiPatch & { type: 'patch' }
  | { type: 'read_file'; path: string }
  | { type: 'create_file'; path: string; content: string }
  | { type: 'create_folder'; path: string }
  | { type: 'rename' | 'move'; from: string; to: string }
  | { type: 'trash'; path: string };

function safePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return Boolean(normalized) && !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
}

export function isSafeAiAction(action: AiAction): boolean {
  if ('from' in action) return safePath(action.from) && safePath(action.to);
  if (!safePath(action.path)) return false;
  return action.type !== 'patch' || action.path.toLowerCase().endsWith('.tex');
}

export function applyAiPatches(content: string, patches: AiPatch[]): string {
  let result = content;
  for (const patch of patches) {
    const first = result.indexOf(patch.old_text);
    if (first === -1) throw new Error('stale AI patch');
    if (result.indexOf(patch.old_text, first + patch.old_text.length) !== -1)
      throw new Error('ambiguous AI patch');
    result = result.slice(0, first) + patch.new_text + result.slice(first + patch.old_text.length);
  }
  return result;
}
