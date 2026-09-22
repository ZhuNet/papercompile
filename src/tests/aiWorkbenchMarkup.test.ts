import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import transcriptSource from '../agentTranscript.ts?raw';
import styles from '../styles.css?inline';

describe('AI workbench markup', () => {
  it('provides agent and named LLM selectors', () => {
    expect(appSource).toContain('Agent <select disabled={aiRunning()}');
    expect(appSource).toContain('initialAgentPreferences.selectedLlmId');
    expect(appSource).toContain('disabled={aiRunning() || llmProfiles().length === 0}');
    expect(appSource).not.toContain('<option value="">选择 LLM 配置</option>');
    expect(appSource).toContain('<span>Provider</span>');
    expect(appSource).toContain('<span>Model</span>');
    expect(appSource).toContain('{profile.provider} · {profile.model}');
    expect(appSource).not.toContain('LLM 配置名称必须唯一');
    expect(appSource).toContain('同一 Provider 下的模型名称不能重复');
  });

  it('keeps LLM creation in the settings panel and removes advanced agent controls', () => {
    expect(appSource).toContain('aria-label="保存 LLM 配置"');
    expect(appSource).toContain('title="保存"');
    expect(appSource).toContain('>√</button>');
    expect(appSource).toContain('aria-label="删除 LLM 配置"');
    expect(appSource).toContain('>×</button>');
    expect(appSource).toContain('aria-label="新建 LLM 配置"');
    expect(appSource).toContain('>+</button>');
    expect(appSource).toContain('class="llm-delete"');
    expect(appSource).toContain('const [creatingLlmProfile, setCreatingLlmProfile] = createSignal(false);');
    expect(appSource).not.toContain('setSelectedLlmId("");\n    setAgentSessionId("");\n    setProfileName("");');
    expect(styles).toContain('.llm-settings-actions .llm-delete { background: #7f4545; }');
    expect(styles).toContain('.llm-settings-actions button { width: 25px;');
    expect(appSource).toContain('class="llm-settings-actions"');
    expect(styles).toContain('grid-template-columns: 48px minmax(0, 1fr) auto;');
    expect(styles).toContain('grid-template-rows: repeat(4, 25px);');
    expect(styles).toContain('align-content: center;');
    expect(styles).toContain('padding-right: 0;');
    expect(styles).not.toContain('top: 96px;');
    expect(styles).toContain('font-size: 16px;');
    expect(appSource).not.toContain('>新建 LLM</button>');
    expect(appSource).not.toContain('>配置目录</button>');
    expect(appSource).not.toContain('>重载</button>');
  });

  it('does not announce successful agent connection or session restoration', () => {
    expect(appSource).not.toContain('Oh My Pi 会话已恢复');
    expect(appSource).not.toContain('Oh My Pi 已连接');
  });

  it('uses transparent scrollbar tracks in the workbench', () => {
    expect(styles).toContain('.ai-interaction-scroll, .ai-composer > textarea { scrollbar-color: #47566b transparent; }');
    expect(styles).toContain('.ai-interaction-scroll::-webkit-scrollbar-track, .ai-composer > textarea::-webkit-scrollbar-track { background: transparent; }');
  });

  it('resizes the dock, persists its height, and smart-follows the bottom', () => {
    expect(appSource).toContain('class="ai-dock-resize-edge"');
    expect(appSource).toContain('localStorage.setItem(aiPanelHeightKey');
    expect(appSource).toContain('isNearScrollBottom(event.currentTarget)');
    expect(appSource).toContain('interactionScroll.scrollTop = interactionScroll.scrollHeight');
    expect(styles).toContain('height: var(--ai-panel-height, 190px);');
    expect(styles).toContain('cursor: ns-resize;');
    expect(appSource).toContain('followInteractionBottom = true;');
    expect(appSource).not.toContain('<Show when={aiOpen()}>');
    expect(styles).toContain('.ai-dock.collapsed .ai-body { height: 0;');
  });

  it('appends backend events directly to an isolated transcript DOM', () => {
    expect(appSource).toContain('agentTranscript.append(payload)');
    expect(appSource).toContain('agentTranscript.restore(');
    expect(appSource).not.toContain('createSignal<AgentWorkbenchState>');
    expect(appSource).not.toContain('agentState().timeline');
    expect(appSource).not.toContain('.messages.find(');
    expect(appSource).not.toContain('.tools.find(');
    expect(appSource).not.toContain('.interactions.find(');
  });

  it('keeps resize moves out of transcript and reactive state', () => {
    expect(appSource).toContain('aiDock?.style.setProperty("--ai-panel-height"');
    const resizeHandler = appSource.slice(
      appSource.indexOf('const resizeAiPanel'),
      appSource.indexOf('const applyProjectFiles'),
    );
    expect(resizeHandler).not.toContain('setAiPanelHeight(clampAiPanelHeight');
    expect(resizeHandler).not.toContain('interactionScroll.scrollTop');
  });

  it('stretches both interaction and composer areas to the resized dock height', () => {
    expect(styles).toContain('.ai-dock .ai-body {');
    expect(styles).toContain('height: 100%;');
    expect(styles).toContain('.ai-interaction, .ai-composer { height: 100%; min-height: 0; }');
  });

  it('does not clear the timeline or replace it with history when the model changes', () => {
    expect(appSource).toContain('if (!agentTranscript.hasContent()) agentTranscript.restore(');
    expect(appSource).toContain('createEffect(on(projectRoot, (root) => {');
    expect(appSource).not.toContain('setSelectedLlmId(llmProfileId);\n                       setAgentSessionId("");\n                       agentTranscript.clear();');
  });

  it('renders transcript nodes directly and updates them by backend id', () => {
    expect(transcriptSource).toContain("this.messages.get(id)");
    expect(transcriptSource).toContain("existing.appendData(");
    expect(transcriptSource).toContain("existing.appendData(String(event.text ?? ''));\n      return;");
    expect(transcriptSource).toContain("this.tools.get(String(event.toolCallId))");
    expect(transcriptSource).toContain("this.interactions.set(id, card)");
    expect(transcriptSource).toContain("content.className = 'agent-tool-content collapsed'");
    expect(transcriptSource).not.toContain('scrollHeight');
    expect(transcriptSource).not.toContain('createSignal');
    expect(transcriptSource).not.toContain('.find(');
    expect(styles).toContain('.agent-tool-card {');
    expect(styles).toContain('background: transparent;');
  });

  it('emphasizes user prompts and increases interaction typography', () => {
    expect(styles).toContain('.ai-turn.user .ai-turn-body');
    expect(styles).toContain('border: 2px solid');
    expect(styles).toContain('.ai-turn {');
    expect(styles).toContain('font-size: 11px;');
  });

  it('delegates prompt, steering, and abort to the sidecar', () => {
    expect(appSource).toContain('type: wasRunning ? "steer" : "prompt"');
    expect(appSource).toContain('type: "abort"');
    expect(appSource).toContain('invoke("send_agent_command", { command })');
    expect(appSource).toContain('const runId = activeRunId();');
    expect(appSource).not.toContain('const runId = activeRunId();\n    setAgentState(state => ({ ...state, running: false }));');
  });

  it('drops the completion banner in favour of the send button state', () => {
    expect(appSource).not.toContain('Edition Completed!');
    expect(appSource).not.toContain('ai-completion');
    expect(appSource).not.toContain('turn.completed');
  });

  it('does not maintain a frontend agent loop or execute agent file tools', () => {
    expect(appSource).not.toContain('ask_ai');
    expect(appSource).not.toContain('while (true)');
    expect(appSource).not.toContain('preflightAiActions');
    expect(appSource).not.toContain('applyAiPatches');
  });

  it('turns the send button into a stop square without changing its chrome', () => {
    expect(appSource).toContain('class="ai-send"');
    expect(appSource).toContain('aria-label={aiRunning() ? "停止" : "发送"}');
    expect(appSource).toContain('<svg class="ai-send-stop" viewBox="0 0 24 24" aria-hidden="true">');
    expect(appSource).toContain('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />');
    expect(styles).toContain('.composer-actions svg.ai-send-stop { fill: currentColor; stroke: none; }');
    expect(styles).not.toContain('.ai-send.running');
  });

  it('keeps transient operation feedback out of the AI workbench', () => {
    expect(appSource).not.toContain('ai-task-state');
    expect(appSource).not.toContain('setTask(');
    expect(appSource).not.toContain('class="ai-toast"');
  });

});
