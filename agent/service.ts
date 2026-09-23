import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentCommand, AgentEvent, LlmProfile } from "./protocol";
import type { OpenSessionOptions } from "./adapter";

type Adapter = {
  id: string;
  name: string;
  openSession(options: OpenSessionOptions): Promise<{ sessionId: string; history: unknown[] }>;
  prompt(runId: string, text: string, profile: LlmProfile): Promise<void>;
  steer(runId: string, text: string): Promise<void>;
  abort(runId: string): Promise<void>;
  reload(): Promise<void>;
  dispose(): Promise<void>;
};

export class SidecarService {
  private configRoot = "";
  private sessionId = "";
  private sessionMetadataPath = "";

  constructor(
    private readonly adapter: Adapter,
    private readonly emit: (event: AgentEvent) => void,
    private readonly shutdown: () => Promise<void>,
    private readonly respondToInteraction: (requestId: string, value: unknown) => void = () => undefined,
    private readonly cancelInteractions: () => void = () => undefined,
  ) {}

  async handle(command: AgentCommand): Promise<void> {
    switch (command.type) {
      case "initialize":
        this.configRoot = command.configRoot;
        this.emit({
          type: "ready",
          agents: [{ id: this.adapter.id, name: this.adapter.name, version: "18.2.5" }],
        });
        return;
      case "open_session": {
        this.requireInitialized();
        if (command.agentId !== this.adapter.id) {
          throw new Error(`unknown agent ${command.agentId}`);
        }
        const resolvedProject = path.resolve(command.projectRoot);
        const projectIdentity = process.platform === "win32" ? resolvedProject.toLowerCase() : resolvedProject;
        const projectId = createHash("sha256")
          .update(projectIdentity)
          .digest("hex")
          .slice(0, 24);
        const opened = await this.adapter.openSession({
          projectRoot: command.projectRoot,
          agentDir: path.join(this.configRoot, "agents", "omp"),
          sessionDir: path.join(this.configRoot, "sessions", projectId, "omp"),
          profile: command.profile,
        });
        this.sessionMetadataPath = path.join(this.configRoot, "sessions", projectId, "omp", "papercompile.json");
        let llmProfileId = "";
        try {
          const metadata = JSON.parse(await readFile(this.sessionMetadataPath, "utf8")) as { llmProfileId?: unknown };
          if (typeof metadata.llmProfileId === "string") llmProfileId = metadata.llmProfileId;
        } catch {
          // A new session has no PaperCompile metadata yet.
        }
        this.sessionId = opened.sessionId;
        this.emit({ type: "session_opened", ...opened, llmProfileId });
        return;
      }
      case "select_llm":
        this.requireSession(command.sessionId);
        await mkdir(path.dirname(this.sessionMetadataPath), { recursive: true });
        await writeFile(this.sessionMetadataPath, JSON.stringify({ llmProfileId: command.llmProfileId }), "utf8");
        return;
      case "prompt":
        this.requireSession(command.sessionId);
        this.emit({ type: "run_started", sessionId: this.sessionId, runId: command.runId });
        void this.adapter.prompt(command.runId, command.text, command.profile).catch(error => {
          this.emit({
            type: "error",
            scope: "run",
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
          });
          this.emit({ type: "run_finished", sessionId: this.sessionId, runId: command.runId });
        });
        return;
      case "steer":
        this.requireSession(command.sessionId);
        await this.adapter.steer(command.runId, command.text);
        return;
      case "abort":
        this.requireSession(command.sessionId);
        this.cancelInteractions();
        await this.adapter.abort(command.runId);
        this.emit({ type: "run_aborted", sessionId: this.sessionId, runId: command.runId });
        return;
      case "reload_config":
        if (command.agentId !== this.adapter.id) throw new Error(`unknown agent ${command.agentId}`);
        await this.adapter.reload();
        return;
      case "interaction_response":
        this.respondToInteraction(command.requestId, command.value);
        return;
      case "shutdown":
        await this.adapter.dispose();
        await this.shutdown();
        return;
    }
  }

  private requireInitialized(): void {
    if (!this.configRoot) throw new Error("sidecar is not initialized");
  }

  private requireSession(sessionId: string): void {
    if (!this.sessionId || sessionId !== this.sessionId) {
      throw new Error("agent session is not open");
    }
  }
}
