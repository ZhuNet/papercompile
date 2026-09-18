import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

describe('AI workbench markup', () => {
  it('provides agent and named LLM selectors', () => {
    expect(appSource).toContain('Agent <select disabled={aiRunning()}');
    expect(appSource).toContain('选择 LLM 配置');
    expect(appSource).toContain('<span>Name</span>');
    expect(appSource).toContain('<span>Model</span>');
  });

  it('renders full agent tool events as collapsed cards', () => {
    expect(appSource).toContain('class={`agent-tool-card ${tool()!.status}`}');
    expect(appSource).toContain('tool()!.expanded ? "收起" : "展开"');
    expect(appSource).toContain('JSON.stringify({ input: tool()!.input, update: tool()!.update, result: tool()!.result }, null, 2)');
    expect(appSource).toContain('class="agent-interaction-card"');
    expect(appSource).toContain('class="agent-tool-card raw"');
  });

  it('delegates prompt, steering, and abort to the sidecar', () => {
    expect(appSource).toContain('type: wasRunning ? "steer" : "prompt"');
    expect(appSource).toContain('type: "abort"');
    expect(appSource).toContain('invoke("send_agent_command", { command })');
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
