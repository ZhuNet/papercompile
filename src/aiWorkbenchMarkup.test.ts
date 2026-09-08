import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import styles from './styles.css?inline';

describe('AI workbench markup', () => {
  it('keeps the Model label and input in separate settings-grid columns', () => {
    expect(appSource).toContain('<span>Model</span>');
  });

  it('renders tool activities in a dedicated full-width activity block', () => {
    expect(appSource).toContain('<div class={`ai-activity ${part.status}`}>');
    expect(appSource).not.toContain('<div class="ai-turn activity">');
  });

  it('keeps an action name beside a failed tool status', () => {
    expect(appSource).toContain('part.status === "pending" || part.status === "failed" ? actionName(part.action) : ""');
  });

  it('drops the completion banner in favour of the send button state', () => {
    expect(appSource).not.toContain('Edition Completed!');
    expect(appSource).not.toContain('ai-completion');
    expect(appSource).not.toContain('turn.completed');
  });

  it('checks Done before requesting another AI response', () => {
    expect(appSource).toContain('if (done) break;');
    expect(appSource).not.toContain('shouldComplete(');
    expect(appSource).not.toContain('Continue from the tool observations.');
  });

  it('stops only on Done or an explicit send-button toggle', () => {
    expect(appSource).not.toContain('if (!done && !toolResult) break;');
    expect(appSource).toContain('if (!active()) break;');
    expect(appSource).toContain('const toggleAiRun = () => {');
  });

  it('turns the send button into a stop square without changing its chrome', () => {
    expect(appSource).toContain('class="ai-send"');
    expect(appSource).toContain('aria-label={aiRunning() ? "停止" : "发送"}');
    expect(appSource).toContain('<svg class="ai-send-stop" viewBox="0 0 24 24" aria-hidden="true">');
    expect(appSource).toContain('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />');
    expect(styles).toContain('.composer-actions svg.ai-send-stop { fill: currentColor; stroke: none; }');
    expect(styles).not.toContain('.ai-send.running');
  });

  it('replaces the task state bar with a transient centred toast', () => {
    expect(appSource).not.toContain('ai-task-state');
    expect(appSource).not.toContain('setTask(');
    expect(appSource).toContain('<div class="ai-toast">{aiToast()}</div>');
  });

});
