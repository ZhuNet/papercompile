import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./protocol";
import type { InteractionRequest } from "./ompRuntime";

export class InteractionBroker {
  private pending = new Map<string, (value: unknown) => void>();

  constructor(private readonly emit: (event: AgentEvent) => void) {}

  request(interaction: InteractionRequest): Promise<unknown> {
    const requestId = randomUUID();
    this.emit({ type: "interaction_requested", requestId, ...interaction });
    return new Promise(resolve => this.pending.set(requestId, resolve));
  }

  resolve(requestId: string, value: unknown): void {
    const resolve = this.pending.get(requestId);
    if (!resolve) return;
    this.pending.delete(requestId);
    resolve(value);
  }

  cancelAll(): void {
    for (const resolve of this.pending.values()) resolve(undefined);
    this.pending.clear();
  }
}
