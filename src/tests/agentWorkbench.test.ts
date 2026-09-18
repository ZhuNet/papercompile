import { describe, expect, it } from 'vitest';
import {
  applyAgentEvent,
  loadAgentPreferences,
  saveAgentPreferences,
  type AgentWorkbenchState,
} from '../agentWorkbench';

describe('agent workbench preferences', () => {
  it('persists named LLM profiles and project-specific selections', () => {
    const storage = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const preferences = {
      profiles: [{ id: 'local', name: '本地模型', endpoint: 'http://localhost/v1', model: 'qwen', apiKey: '' }],
      projects: { 'C:/paper': { agentId: 'omp', llmProfileId: 'local' } },
    };

    saveAgentPreferences(preferences, localStorage);
    expect(loadAgentPreferences(localStorage)).toEqual(preferences);
  });
});

describe('agent event reduction', () => {
  it('keeps tool calls collapsed while preserving full input and result', () => {
    const initial: AgentWorkbenchState = { messages: [], tools: [], interactions: [], rawEvents: [], timeline: [], running: false };
    const started = applyAgentEvent(initial, {
      type: 'tool_started', sessionId: 's', runId: 'r', toolCallId: 't', name: 'read', input: { path: 'main.tex' },
    });
    const finished = applyAgentEvent(started, {
      type: 'tool_finished', sessionId: 's', runId: 'r', toolCallId: 't', result: { text: 'source' }, isError: false,
    });

    expect(finished.tools).toEqual([{
      id: 't', name: 'read', input: { path: 'main.tex' }, result: { text: 'source' }, status: 'completed', expanded: false,
    }]);
    expect(finished.timeline).toEqual([{ kind: 'tool', id: 't' }]);
  });

  it('keeps messages, interactions, and unknown events in arrival order', () => {
    const initial: AgentWorkbenchState = { messages: [], tools: [], interactions: [], rawEvents: [], timeline: [], running: false };
    const message = applyAgentEvent(initial, {
      type: 'message_delta', sessionId: 's', runId: 'r', messageId: 'm', text: 'hello',
    });
    const interaction = applyAgentEvent(message, {
      type: 'interaction_requested', requestId: 'i', interaction: 'confirm', title: 'Allow?', message: 'Run command',
    });
    const raw = applyAgentEvent(interaction, {
      type: 'raw', agentId: 'omp', name: 'future_event', payload: { value: 1 },
    });

    expect(raw.timeline).toEqual([
      { kind: 'message', id: 'm' },
      { kind: 'interaction', id: 'i' },
      { kind: 'raw', id: 'raw-0' },
    ]);
  });
});
