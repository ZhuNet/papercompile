import { mapOmpEvent } from "./events";
import type { AgentEvent, LlmProfile } from "./protocol";

export type OpenSessionOptions = {
  projectRoot: string;
  agentDir: string;
  sessionDir: string;
  profile: LlmProfile;
};

export type AgentRuntime = {
  history: unknown[];
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  prompt(text: string, profile: LlmProfile): Promise<void>;
  steer(text: string): Promise<void>;
  abort(): Promise<void>;
  reload(): Promise<void>;
  dispose(): Promise<void>;
};

export type AgentRuntimeFactory = (
  options: OpenSessionOptions,
) => Promise<AgentRuntime>;

export class AgentAdapter {
  readonly id = "omp";
  readonly name = "Oh My Pi";
  private runtime?: AgentRuntime;
  private unsubscribe?: () => void;
  private sessionId = "";
  private runId = "";

  constructor(
    private readonly createRuntime: AgentRuntimeFactory,
    private readonly emit: (event: AgentEvent) => void,
  ) {}

  async openSession(options: OpenSessionOptions): Promise<{ sessionId: string; history: unknown[] }> {
    await this.dispose();
    this.runtime = await this.createRuntime(options);
    this.sessionId = `${this.id}:${options.projectRoot}`;
    this.unsubscribe = this.runtime.subscribe(event => {
      this.emit(mapOmpEvent(event, {
        agentId: this.id,
        sessionId: this.sessionId,
        runId: this.runId,
      }));
    });
    return { sessionId: this.sessionId, history: this.runtime.history };
  }

  startRun(runId: string): void {
    this.runId = runId;
  }

  async prompt(runId: string, text: string, profile: LlmProfile): Promise<void> {
    this.startRun(runId);
    await this.requireRuntime().prompt(text, profile);
  }

  async steer(runId: string, text: string): Promise<void> {
    this.startRun(runId);
    await this.requireRuntime().steer(text);
  }

  async abort(runId: string): Promise<void> {
    this.startRun(runId);
    await this.requireRuntime().abort();
  }

  async reload(): Promise<void> {
    await this.requireRuntime().reload();
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const runtime = this.runtime;
    this.runtime = undefined;
    if (runtime) await runtime.dispose();
  }

  private requireRuntime(): AgentRuntime {
    if (!this.runtime) throw new Error("agent session is not open");
    return this.runtime;
  }
}
