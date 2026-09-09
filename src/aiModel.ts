export type AiPatch = { path: string; old_text: string; new_text: string };
export type AiAction = AiPatch & { type: 'patch' }
  | { type: 'read_file'; path: string }
  | { type: 'create_file'; path: string; content: string }
  | { type: 'create_folder'; path: string }
  | { type: 'rename' | 'move'; from: string; to: string }
  | { type: 'trash'; path: string };

export type AiToolOperation = {
  type: 'read_file' | 'patch';
  path: string;
  response: number;
};

export type AiActionPreflight = {
  accepted: AiAction[];
  rejected: { index: number; action: AiAction; error: string }[];
};

function safePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return Boolean(normalized) && !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
}

export function isSafeAiAction(action: AiAction): boolean {
  if ('from' in action) return safePath(action.from) && safePath(action.to);
  if (!safePath(action.path)) return false;
  return action.type !== 'patch' || (action.path.toLowerCase().endsWith('.tex') && Boolean(action.old_text));
}

export function validateAiPatchTarget(
  path: string,
  response: number,
  operations: AiToolOperation[],
): void {
  if (!path.toLowerCase().endsWith('.tex'))
    throw new Error(`patch rejected for "${path}": the target must be a LaTeX source`);
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (operation.path !== path) continue;
    if (operation.type === 'patch')
      throw new Error(`patch rejected for "${path}": execute read_file again after the lastest patch`);
    if (operation.response === response)
      throw new Error(`patch rejected for "${path}": read_file and patch must be separate AI responses`);
    return;
  }
  throw new Error(`patch rejected for "${path}": execute read_file for this path before patch`);
}

export function validateAiReadTarget(
  path: string,
  operations: AiToolOperation[],
): void {
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (operation.path !== path) continue;
    if (operation.type === 'read_file')
      throw new Error(`read_file rejected for "${path}": you do not need to execute read_file again since the lastest read_file had been executed and source codes were not revised`);
    return;
  }
}

export function preflightAiActions(
  actions: AiAction[],
  operations: AiToolOperation[],
): AiActionPreflight {
  const knownOperations = [...operations];
  const accepted: AiAction[] = [];
  const rejected: AiActionPreflight['rejected'] = [];
  actions.forEach((action, index) => {
    try {
      if (action.type === 'read_file') validateAiReadTarget(action.path, knownOperations);
      if (action.type === 'patch') validateAiPatchTarget(action.path, Number.MAX_SAFE_INTEGER, knownOperations);
      accepted.push(action);
      if (action.type === 'read_file' || action.type === 'patch')
        knownOperations.push({ type: action.type, path: action.path, response: Number.MAX_SAFE_INTEGER });
    } catch (error) {
      rejected.push({ index, action, error: error instanceof Error ? error.message : String(error) });
    }
  });
  return { accepted, rejected };
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
