import { describe, expect, it } from 'vitest';
import {
  applyAgentEvent,
  hasDuplicateLlmModel,
  loadAgentPreferences,
  restoreAgentHistory,
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
      profiles: [{ id: 'local', provider: '本地服务', endpoint: 'http://localhost/v1', model: 'qwen', apiKey: '' }],
      projects: { 'C:/paper': { agentId: 'omp', llmProfileId: 'local' } },
      selectedLlmId: 'local',
    };

    saveAgentPreferences(preferences, localStorage);
    expect(loadAgentPreferences(localStorage)).toEqual(preferences);
  });

  it('loads older preferences without a saved selection', () => {
    const storage = new Map<string, string>([[
      'papercompile.agent.preferences',
      JSON.stringify({
        profiles: [{ id: 'local', name: '本地服务', endpoint: 'http://localhost/v1', model: 'qwen', apiKey: '' }],
        projects: {},
      }),
    ]]);
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    expect(loadAgentPreferences(localStorage)).toMatchObject({
      selectedLlmId: 'local',
      profiles: [{ id: 'local', provider: '本地服务', model: 'qwen' }],
    });
  });

  it('only rejects duplicate model names within the same provider', () => {
    const profiles = [
      { id: 'one', provider: 'OpenAI', endpoint: 'https://one.example/v1', model: 'gpt-5', apiKey: '' },
      { id: 'two', provider: 'Other', endpoint: 'https://two.example/v1', model: 'gpt-5', apiKey: '' },
    ];

    expect(hasDuplicateLlmModel(profiles, { id: 'new', provider: 'OpenAI', model: 'gpt-5' })).toBe(true);
    expect(hasDuplicateLlmModel(profiles, { id: 'new', provider: 'Other', model: 'gpt-6' })).toBe(false);
    expect(hasDuplicateLlmModel(profiles, { id: 'one', provider: 'OpenAI', model: 'gpt-5' })).toBe(false);
  });
});

describe('agent event reduction', () => {
  it('restores tool calls and results in transcript order', () => {
    const state = restoreAgentHistory([
      { role: 'user', content: 'inspect' },
      { role: 'assistant', content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'main.tex' } }] },
      { role: 'toolResult', toolCallId: 't1', toolName: 'read', content: [{ type: 'text', text: 'source' }], details: { bytes: 42 }, isError: false },
      { role: 'assistant', content: [{ type: 'text', text: 'finished' }] },
    ]);

    expect(state.timeline).toEqual([
      { kind: 'message', id: 'history-0' },
      { kind: 'tool', id: 't1' },
      { kind: 'message', id: 'history-3' },
    ]);
    expect(state.tools[0]).toMatchObject({
      id: 't1', name: 'read', input: { path: 'main.tex' }, result: { bytes: 42 }, status: 'completed',
    });
  });

  it('returns to the send state on abort without deleting OMP output', () => {
    const initial: AgentWorkbenchState = {
      messages: [{ id: 'm', role: 'assistant', text: 'partial' }],
      tools: [],
      interactions: [{ id: 'i', interaction: 'confirm', title: 'Allow?' }],
      rawEvents: [],
      timeline: [{ kind: 'message', id: 'm' }, { kind: 'interaction', id: 'i' }],
      running: true,
    };

    expect(applyAgentEvent(initial, { type: 'run_aborted' })).toEqual({ ...initial, running: false });
  });

  it('preserves full tool input and result for presentation', () => {
    const initial: AgentWorkbenchState = { messages: [], tools: [], interactions: [], rawEvents: [], timeline: [], running: false };
    const started = applyAgentEvent(initial, {
      type: 'tool_started', sessionId: 's', runId: 'r', toolCallId: 't', name: 'read', input: { path: 'main.tex' },
    });
    const finished = applyAgentEvent(started, {
      type: 'tool_finished', sessionId: 's', runId: 'r', toolCallId: 't', result: { text: 'source' }, isError: false,
    });

    expect(finished.tools).toEqual([{
      id: 't', name: 'read', input: { path: 'main.tex' }, result: { text: 'source' }, status: 'completed',
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
    ]);
    expect(raw.rawEvents).toEqual([]);
  });

  it('keeps notices and lifecycle events out of the visible timeline', () => {
    const initial: AgentWorkbenchState = { messages: [], tools: [], interactions: [], rawEvents: [], timeline: [], running: false };
    const started = applyAgentEvent(initial, { type: 'run_started' });
    const noticed = applyAgentEvent(started, { type: 'notice', message: 'agent_start' });
    const raw = applyAgentEvent(noticed, { type: 'raw', name: 'agent_end', payload: {} });
    const finished = applyAgentEvent(raw, { type: 'run_finished' });

    expect(finished.timeline).toEqual([]);
    expect(finished.messages).toEqual([]);
    expect(finished.rawEvents).toEqual([]);
    expect(finished.running).toBe(false);
  });
});
