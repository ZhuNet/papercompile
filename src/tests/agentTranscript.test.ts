import { afterEach, describe, expect, it } from 'vitest';
import { AgentTranscript } from '../agentTranscript';

class FakeNode {
  parent?: FakeElement;

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = undefined;
  }
}

class FakeText extends FakeNode {
  constructor(public data: string) {
    super();
  }

  appendData(value: string): void {
    this.data += value;
  }
}

class FakeElement extends FakeNode {
  children: FakeNode[] = [];
  className = '';
  textContent = '';
  dataset: Record<string, string> = {};
  classList = { toggle: () => undefined };

  get childElementCount(): number {
    return this.children.filter(child => child instanceof FakeElement).length;
  }

  get firstElementChild(): FakeElement | null {
    return this.children.find(child => child instanceof FakeElement) as FakeElement | undefined ?? null;
  }

  append(...nodes: FakeNode[]): void {
    nodes.forEach(node => {
      node.parent = this;
      this.children.push(node);
    });
  }

  addEventListener(): void {}

  replaceChildren(): void {
    this.children.forEach(child => { child.parent = undefined; });
    this.children = [];
  }
}

const originalDocument = globalThis.document;

afterEach(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

describe('agent transcript', () => {
  it('keeps only the latest 50 top-level rendered entries', () => {
    const document = {
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => new FakeText(text),
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const root = new FakeElement();
    const transcript = new AgentTranscript(() => undefined, () => undefined);
    transcript.mount(root as unknown as HTMLElement);

    for (let index = 1; index <= 51; index += 1) {
      transcript.appendUser(`message-${index}`, 'user', `message ${index}`);
    }

    expect(root.childElementCount).toBe(50);
    const firstTurn = root.firstElementChild!;
    const firstBody = firstTurn.children[1] as FakeElement;
    const firstParagraph = firstBody.children[0] as FakeElement;
    expect((firstParagraph.children[0] as FakeText).data).toBe('message 2');
  });

  it('restores only the latest 50 history nodes without scanning older history', () => {
    let createdElements = 0;
    const document = {
      createElement: () => {
        createdElements += 1;
        return new FakeElement();
      },
      createTextNode: (text: string) => new FakeText(text),
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const root = new FakeElement();
    const transcript = new AgentTranscript(() => undefined, () => undefined);
    transcript.mount(root as unknown as HTMLElement);

    const history = Array.from({ length: 101 }, (_, index) => ({
      role: 'user',
      content: `message ${index + 1}`,
    }));
    const oldHistory = history.slice(0, 51);
    const recentHistory = history.slice(51);
    const accessedIndexes: number[] = [];
    const guardedHistory = new Proxy([...oldHistory, ...recentHistory], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) accessedIndexes.push(Number(property));
        return Reflect.get(target, property, receiver);
      },
    });

    transcript.restore(guardedHistory);

    expect(root.childElementCount).toBe(50);
    expect(createdElements).toBe(50 * 4);
    expect(accessedIndexes).toEqual(Array.from({ length: 50 }, (_, index) => 100 - index));
    const firstTurn = root.firstElementChild!;
    const firstBody = firstTurn.children[1] as FakeElement;
    const firstParagraph = firstBody.children[0] as FakeElement;
    expect((firstParagraph.children[0] as FakeText).data).toBe('message 52');
  });

  it('counts tool and interaction cards as rendered FIFO entries', () => {
    const document = {
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => new FakeText(text),
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const root = new FakeElement();
    const transcript = new AgentTranscript(() => undefined, () => undefined);
    transcript.mount(root as unknown as HTMLElement);

    for (let index = 1; index <= 49; index += 1) {
      transcript.appendUser(`message-${index}`, 'user', `message ${index}`);
    }
    transcript.append({ type: 'tool_started', toolCallId: 'tool-1', name: 'search', input: {} });
    transcript.append({ type: 'interaction_requested', requestId: 'interaction-1', title: 'Confirm', interaction: 'confirm' });

    expect(root.childElementCount).toBe(50);
    expect((root.children[0] as FakeElement).className).toBe('ai-turn user');
    const firstTurn = root.children[0] as FakeElement;
    const firstBody = firstTurn.children[1] as FakeElement;
    const firstParagraph = firstBody.children[0] as FakeElement;
    expect((firstParagraph.children[0] as FakeText).data).toBe('message 2');
    expect((root.children[48] as FakeElement).className).toContain('agent-tool-card');
    expect((root.children[49] as FakeElement).className).toBe('agent-interaction-card');
  });
});
