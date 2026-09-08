import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';

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

  it('renders completion in its own block', () => {
    expect(appSource).toContain('<div class="ai-completion">Edition Completed!</div>');
  });

  it('checks Done before requesting another AI response', () => {
    expect(appSource).toContain('if (done) break;');
    expect(appSource).not.toContain('shouldComplete(');
    expect(appSource).not.toContain('Continue from the tool observations.');
  });

});
