export type LlmProfile = {
  id: string;
  provider: string;
  endpoint: string;
  model: string;
  apiKey: string;
};

export type AgentPreferences = {
  profiles: LlmProfile[];
  projects: Record<string, { agentId: string; llmProfileId: string }>;
  selectedLlmId: string;
};

export type AgentEvent = Record<string, unknown> & { type: string };

const preferencesKey = 'papercompile.agent.preferences';
const emptyPreferences = (): AgentPreferences => ({ profiles: [], projects: {}, selectedLlmId: '' });

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadAgentPreferences(storage: StorageLike = localStorage): AgentPreferences {
  try {
    const value = JSON.parse(storage.getItem(preferencesKey) ?? 'null') as Partial<AgentPreferences> | null;
    if (!value || !Array.isArray(value.profiles) || !value.projects) return emptyPreferences();
    const profiles = value.profiles.flatMap(profile => {
      const legacy = profile as LlmProfile & { name?: string };
      const provider = legacy.provider ?? legacy.name;
      return provider ? [{ ...profile, provider }] : [];
    });
    const selectedLlmId = profiles.some(profile => profile.id === value.selectedLlmId)
      ? value.selectedLlmId!
      : profiles[0]?.id ?? '';
    return { profiles, projects: value.projects, selectedLlmId };
  } catch {
    return emptyPreferences();
  }
}

export function hasDuplicateLlmModel(
  profiles: LlmProfile[],
  candidate: Pick<LlmProfile, 'id' | 'provider' | 'model'>,
): boolean {
  return profiles.some(profile =>
    profile.id !== candidate.id
    && profile.provider === candidate.provider
    && profile.model === candidate.model,
  );
}

export function saveAgentPreferences(
  preferences: AgentPreferences,
  storage: StorageLike = localStorage,
): void {
  storage.setItem(preferencesKey, JSON.stringify(preferences));
}
