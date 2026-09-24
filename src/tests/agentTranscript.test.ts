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
  it('keeps only the latest 200 top-level history nodes', () => {
    const document = {
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => new FakeText(text),
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const root = new FakeElement();
    const transcript = new AgentTranscript(() => undefined, () => undefined);
    transcript.mount(root as unknown as HTMLElement);

    for (let index = 1; index <= 201; index += 1) {
      transcript.appendUser(`message-${index}`, 'user', `message ${index}`);
    }

    expect(root.childElementCount).toBe(200);
    const firstTurn = root.firstElementChild!;
    const firstBody = firstTurn.children[1] as FakeElement;
    const firstParagraph = firstBody.children[0] as FakeElement;
    expect((firstParagraph.children[0] as FakeText).data).toBe('message 2');
  });

  it('restores only the latest 200 history nodes', () => {
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

    transcript.restore(Array.from({ length: 201 }, (_, index) => ({
      role: 'user',
      content: `message ${index + 1}`,
    })));

    expect(root.childElementCount).toBe(200);
    expect(createdElements).toBe(200 * 4);
    const firstTurn = root.firstElementChild!;
    const firstBody = firstTurn.children[1] as FakeElement;
    const firstParagraph = firstBody.children[0] as FakeElement;
    expect((firstParagraph.children[0] as FakeText).data).toBe('message 2');
  });
});
