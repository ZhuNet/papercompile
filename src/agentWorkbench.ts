export type LlmProfile = {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
};

export type AgentPreferences = {
  profiles: LlmProfile[];
  projects: Record<string, { agentId: string; llmProfileId: string }>;
};

export type AgentEvent = Record<string, unknown> & { type: string };
export type AgentTool = {
  id: string;
  name: string;
  input: unknown;
  update?: unknown;
  result?: unknown;
  status: 'running' | 'completed' | 'failed';
  expanded: boolean;
};
export type AgentMessage = { id: string; role: 'user' | 'assistant' | 'steering' | 'notice'; text: string };
export type AgentInteraction = {
  id: string;
  interaction: 'confirm' | 'select' | 'input';
  title: string;
  message?: string;
  options?: unknown[];
};
export type AgentRawEvent = { id: string; name: string; payload: unknown; expanded: boolean };
export type AgentTimelineItem = { kind: 'message' | 'tool' | 'interaction' | 'raw'; id: string };
export type AgentWorkbenchState = {
  messages: AgentMessage[];
  tools: AgentTool[];
  interactions: AgentInteraction[];
  rawEvents: AgentRawEvent[];
  timeline: AgentTimelineItem[];
  running: boolean;
};

const preferencesKey = 'papercompile.agent.preferences';
const emptyPreferences = (): AgentPreferences => ({ profiles: [], projects: {} });

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadAgentPreferences(storage: StorageLike = localStorage): AgentPreferences {
  try {
    const value = JSON.parse(storage.getItem(preferencesKey) ?? 'null') as AgentPreferences | null;
    return value && Array.isArray(value.profiles) && value.projects ? value : emptyPreferences();
  } catch {
    return emptyPreferences();
  }
}

export function saveAgentPreferences(
  preferences: AgentPreferences,
  storage: StorageLike = localStorage,
): void {
  storage.setItem(preferencesKey, JSON.stringify(preferences));
}

export function applyAgentEvent(state: AgentWorkbenchState, event: AgentEvent): AgentWorkbenchState {
  if (event.type === 'run_started') return { ...state, running: true };
  if (event.type === 'run_finished' || event.type === 'run_aborted') return { ...state, running: false };
  if (event.type === 'message_delta') {
    const id = String(event.messageId ?? 'assistant');
    const index = state.messages.findIndex(message => message.id === id);
    if (index < 0) {
      return {
        ...state,
        messages: [...state.messages, { id, role: 'assistant', text: String(event.text ?? '') }],
        timeline: [...state.timeline, { kind: 'message', id }],
      };
    }
    const messages = [...state.messages];
    messages[index] = { ...messages[index], text: messages[index].text + String(event.text ?? '') };
    return { ...state, messages };
  }
  if (event.type === 'notice') {
    const id = crypto.randomUUID();
    return {
      ...state,
      messages: [...state.messages, { id, role: 'notice', text: String(event.message ?? '') }],
      timeline: [...state.timeline, { kind: 'message', id }],
    };
  }
  if (event.type === 'tool_started') {
    return {
      ...state,
      tools: [...state.tools, {
        id: String(event.toolCallId),
        name: String(event.name),
        input: event.input,
        status: 'running',
        expanded: false,
      }],
      timeline: [...state.timeline, { kind: 'tool', id: String(event.toolCallId) }],
    };
  }
  if (event.type === 'tool_updated') {
    return { ...state, tools: state.tools.map(tool => tool.id === event.toolCallId ? { ...tool, update: event.update } : tool) };
  }
  if (event.type === 'tool_finished') {
    return {
      ...state,
      tools: state.tools.map(tool => tool.id === event.toolCallId ? {
        ...tool,
        result: event.result,
        status: event.isError ? 'failed' : 'completed',
      } : tool),
    };
  }
  if (event.type === 'interaction_requested') {
    const interaction = {
      id: String(event.requestId),
      interaction: event.interaction as AgentInteraction['interaction'],
      title: String(event.title ?? ''),
      message: event.message === undefined ? undefined : String(event.message),
      options: Array.isArray(event.options) ? event.options : undefined,
    };
    return {
      ...state,
      interactions: [...state.interactions, interaction],
      timeline: [...state.timeline, { kind: 'interaction', id: interaction.id }],
    };
  }
  if (event.type === 'raw') {
    const id = `raw-${state.rawEvents.length}`;
    return {
      ...state,
      rawEvents: [...state.rawEvents, { id, name: String(event.name ?? 'unknown'), payload: event.payload, expanded: false }],
      timeline: [...state.timeline, { kind: 'raw', id }],
    };
  }
  return state;
}
