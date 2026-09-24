import type { AgentEvent } from './agentWorkbench';

type InteractionResponder = (requestId: string, value: unknown) => void;
type MessageRole = 'user' | 'assistant' | 'steering';

type ToolNodes = {
  section: HTMLElement;
  status: HTMLElement;
  content: HTMLElement;
  expanded: boolean;
  manuallyToggled: boolean;
};

type RestoreEntry =
  | { kind: 'message'; id: string; role: MessageRole; text: string }
  | { kind: 'tool'; id: string; name: string; input: unknown; isError?: boolean; result?: unknown };

const maxTranscriptEntries = 50;

export class AgentTranscript {
  private root?: HTMLElement;
  private messages = new Map<string, Text>();
  private tools = new Map<string, ToolNodes>();
  private interactions = new Map<string, HTMLElement>();
  private cleanupByNode = new Map<HTMLElement, () => void>();

  constructor(
    private respond: InteractionResponder,
    private afterUpdate: () => void,
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
  }

  hasContent(): boolean {
    return Boolean(this.root?.childElementCount);
  }

  clear(): void {
    this.root?.replaceChildren();
    this.messages.clear();
    this.tools.clear();
    this.interactions.clear();
    this.cleanupByNode.clear();
  }

  appendUser(id: string, role: MessageRole, text: string): void {
    if (!this.root) return;
    const turn = document.createElement('div');
    turn.className = `ai-turn ${role}`;
    const label = document.createElement('span');
    label.textContent = role === 'user' ? '你' : role === 'steering' ? '引导' : 'AI';
    const body = document.createElement('div');
    body.className = 'ai-turn-body';
    const paragraph = document.createElement('p');
    const textNode = document.createTextNode(text);
    paragraph.append(textNode);
    body.append(paragraph);
    turn.append(label, body);
    this.root.append(turn);
    this.messages.set(id, textNode);
    this.trackNode(turn, () => {
      if (this.messages.get(id) === textNode) this.messages.delete(id);
    });
    this.trimToLimit();
    this.afterUpdate();
  }

  append(event: AgentEvent): void {
    if (event.type === 'message_delta') {
      const id = String(event.messageId ?? 'assistant');
      const existing = this.messages.get(id);
      if (!existing) {
        this.appendUser(id, 'assistant', String(event.text ?? ''));
        return;
      }
      existing.appendData(String(event.text ?? ''));
      this.afterUpdate();
      return;
    }
    if (event.type === 'tool_started') {
      this.appendTool(
        String(event.toolCallId),
        String(event.name),
        event.input,
      );
      return;
    }
    if (event.type === 'tool_updated') {
      this.updateTool(String(event.toolCallId), '进度', event.update);
      return;
    }
    if (event.type === 'tool_finished') {
      const tool = this.tools.get(String(event.toolCallId));
      if (!tool) return;
      tool.section.className = `agent-tool-card ${event.isError ? 'failed' : 'completed'}`;
      tool.status.textContent = event.isError ? '!' : '✓';
      this.updateTool(String(event.toolCallId), '结果', event.result);
      return;
    }
    if (event.type === 'interaction_requested') {
      this.appendInteraction(event);
    }
  }

  restore(history: unknown[]): void {
    this.clear();
    const entries: RestoreEntry[] = [];
    const toolResults = new Map<string, { isError: boolean; result: unknown }>();
    for (let index = history.length - 1; index >= 0 && entries.length < maxTranscriptEntries; index -= 1) {
      const value = history[index];
      if (!value || typeof value !== 'object') continue;
      const message = value as Record<string, unknown>;
      const role = String(message.role ?? '');
      if (role === 'user' || role === 'assistant') {
        const content = Array.isArray(message.content) ? message.content : [message.content];
        const text = content.flatMap(part =>
          typeof part === 'string'
            ? [part]
            : part && typeof part === 'object' && 'text' in part
              ? [String(part.text)]
              : [],
        ).join('');
        const messageEntries: RestoreEntry[] = [];
        if (text) messageEntries.push({ kind: 'message', id: `history-${index}`, role, text });
        if (role === 'assistant') {
          content.forEach(part => {
            if (!part || typeof part !== 'object') return;
            const block = part as Record<string, unknown>;
            if (block.type !== 'toolCall' || !block.id || !block.name) return;
            const id = String(block.id);
            const entry: Extract<RestoreEntry, { kind: 'tool' }> = {
              kind: 'tool',
              id,
              name: String(block.name),
              input: block.arguments,
            };
            const result = toolResults.get(id);
            if (result) {
              entry.isError = result.isError;
              entry.result = result.result;
            }
            messageEntries.push(entry);
          });
        }
        for (let entryIndex = messageEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
          if (entries.length >= maxTranscriptEntries) break;
          entries.unshift(messageEntries[entryIndex]);
        }
        continue;
      }
      if (role !== 'toolResult') continue;
      const id = String(message.toolCallId ?? '');
      if (id) {
        toolResults.set(id, {
          isError: message.isError === true,
          result: message.details ?? message.content,
        });
      }
    }
    entries.forEach(entry => {
      if (entry.kind === 'message') {
        this.appendUser(entry.id, entry.role, entry.text);
        return;
      }
      this.appendTool(entry.id, entry.name, entry.input);
      const tool = this.tools.get(entry.id);
      if (tool && entry.isError !== undefined) {
        tool.section.className = `agent-tool-card ${entry.isError ? 'failed' : 'completed'}`;
        tool.status.textContent = entry.isError ? '!' : '✓';
      }
      if (entry.result !== undefined) this.updateTool(entry.id, '结果', entry.result);
    });
  }

  removeInteraction(id: string): void {
    const card = this.interactions.get(id);
    if (card) {
      this.cleanupByNode.delete(card);
      card.remove();
    }
    this.interactions.delete(id);
  }

  private appendTool(id: string, name: string, input: unknown): void {
    if (!this.root) return;
    const section = document.createElement('section');
    section.className = 'agent-tool-card running';
    const heading = document.createElement('button');
    heading.className = 'agent-tool-heading';
    const status = document.createElement('span');
    status.textContent = '◌';
    const title = document.createElement('strong');
    title.textContent = name;
    const toggle = document.createElement('span');
    toggle.textContent = '+';
    const content = document.createElement('div');
    content.className = 'agent-tool-content collapsed';
    const nodes: ToolNodes = { section, status, content, expanded: false, manuallyToggled: false };
    heading.addEventListener('click', () => {
      nodes.manuallyToggled = true;
      nodes.expanded = !nodes.expanded;
      content.classList.toggle('collapsed', !nodes.expanded);
      toggle.textContent = nodes.expanded ? '−' : '+';
    });
    heading.append(status, title, toggle);
    section.append(heading, content);
    this.root.append(section);
    this.tools.set(id, nodes);
    this.trackNode(section, () => {
      if (this.tools.get(id) === nodes) this.tools.delete(id);
    });
    this.appendToolValue(content, '输入', input);
    this.trimToLimit();
    this.afterUpdate();
  }

  private updateTool(id: string, label: string, value: unknown): void {
    const tool = this.tools.get(id);
    if (!tool) return;
    const oldValue = tool.content.querySelector(`[data-tool-label="${label}"]`);
    oldValue?.remove();
    this.appendToolValue(tool.content, label, value);
    this.afterUpdate();
  }

  private appendToolValue(parent: HTMLElement, label: string, value: unknown): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'tool-value';
    wrapper.dataset.toolLabel = label;
    const heading = document.createElement('strong');
    heading.textContent = label;
    const pre = document.createElement('pre');
    pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    wrapper.append(heading, pre);
    parent.append(wrapper);
  }

  private appendInteraction(event: AgentEvent): void {
    if (event.type !== 'interaction_requested' || !this.root) return;
    const id = String(event.requestId);
    const card = document.createElement('div');
    card.className = 'agent-interaction-card';
    const title = document.createElement('strong');
    title.textContent = String(event.title ?? '');
    card.append(title);
    if (event.message) {
      const message = document.createElement('p');
      message.textContent = String(event.message);
      card.append(message);
    }
    if (event.interaction === 'input') {
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.placeholder = String(event.message ?? '输入响应');
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = '提交';
      form.addEventListener('submit', submitEvent => {
        submitEvent.preventDefault();
        this.respond(id, input.value);
      });
      form.append(input, submit);
      card.append(form);
    } else {
      const actions = document.createElement('div');
      actions.className = 'agent-interaction-actions';
      const eventOptions = Array.isArray(event.options) ? event.options : [];
      const options = event.interaction === 'confirm' ? [
        { label: '允许', value: true },
        { label: '拒绝', value: false },
      ] : eventOptions.map(option => ({
        label: typeof option === 'object' && option && 'label' in option ? String(option.label) : String(option),
        value: typeof option === 'object' && option && 'label' in option ? option.label : option,
      }));
      options.forEach(option => {
        const button = document.createElement('button');
        button.textContent = option.label;
        button.addEventListener('click', () => this.respond(id, option.value));
        actions.append(button);
      });
      card.append(actions);
    }
    this.root.append(card);
    this.interactions.set(id, card);
    this.trackNode(card, () => {
      if (this.interactions.get(id) === card) this.interactions.delete(id);
    });
    this.trimToLimit();
    this.afterUpdate();
  }

  private trackNode(node: HTMLElement, cleanup: () => void): void {
    this.cleanupByNode.set(node, cleanup);
  }

  private trimToLimit(): void {
    if (!this.root) return;
    while (this.root.childElementCount > maxTranscriptEntries) {
      const oldest = this.root.firstElementChild as HTMLElement | null;
      if (!oldest) return;
      this.cleanupByNode.get(oldest)?.();
      this.cleanupByNode.delete(oldest);
      oldest.remove();
    }
  }
}
