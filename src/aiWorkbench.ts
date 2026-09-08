import type { AiAction } from './aiModel';

export type AiPart =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; action: AiAction; status: 'pending' | 'completed' | 'failed' };
export type WorkbenchTurn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; parts: AiPart[] };

export function actionLabel(action: { type: string; path?: string; from?: string; to?: string }): string {
  if (action.type === 'read_file') return `已读取 ${action.path}`;
  if (action.type === 'patch') return `已修改 ${action.path}`;
  if (action.type === 'create_file') return `已创建 ${action.path}`;
  if (action.type === 'create_folder') return `已创建文件夹 ${action.path}`;
  if (action.type === 'rename') return `已重命名 ${action.from} 为 ${action.to}`;
  if (action.type === 'move') return `已移动 ${action.from} 到 ${action.to}`;
  if (action.type === 'trash') return `已移入回收站 ${action.path}`;
  return '操作已完成';
}

export function actionName(action: { type: string; path?: string; from?: string; to?: string }): string {
  if (action.type === 'read_file') return `读取 ${action.path}`;
  if (action.type === 'patch') return `修改 ${action.path}`;
  if (action.type === 'create_file') return `创建 ${action.path}`;
  if (action.type === 'create_folder') return `创建文件夹 ${action.path}`;
  if (action.type === 'rename') return `重命名 ${action.from} 为 ${action.to}`;
  if (action.type === 'move') return `移动 ${action.from} 到 ${action.to}`;
  if (action.type === 'trash') return `移入回收站 ${action.path}`;
  return '文件操作';
}

export function buildToolResult(errors: string[], observations: string[]): string {
  return [...errors, ...observations].join('\n');
}

export function setToolPartStatus(
  parts: AiPart[],
  toolIndex: number,
  status: Extract<AiPart, { kind: 'tool' }>['status'],
): AiPart[] {
  let currentToolIndex = 0;
  return parts.map((part) => {
    if (part.kind !== 'tool') return part;
    const isTarget = currentToolIndex++ === toolIndex;
    return isTarget ? { ...part, status } : part;
  });
}

export type AiPreferences = { endpoint: string; model: string; key: string };

const aiPreferencesKey = 'papercompile.ai.preferences';

export function loadAiPreferences(fallback: AiPreferences): AiPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(aiPreferencesKey) ?? 'null') as Partial<AiPreferences> | null;
    return value?.endpoint && value?.model ? { endpoint: value.endpoint, model: value.model, key: value.key ?? fallback.key } : fallback;
  } catch {
    return fallback;
  }
}

export function saveAiPreferences(preferences: AiPreferences): void {
  try {
    localStorage.setItem(aiPreferencesKey, JSON.stringify(preferences));
  } catch {
    // Browser storage may be unavailable; the in-memory configuration still works.
  }
}

export function visibleAiTurns(turns: WorkbenchTurn[]): WorkbenchTurn[] {
  return turns.filter((turn) => turn.role === 'user' || turn.parts.length > 0);
}
