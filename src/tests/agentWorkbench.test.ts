import { describe, expect, it } from 'vitest';
import {
  hasDuplicateLlmModel,
  loadAgentPreferences,
  saveAgentPreferences,
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
