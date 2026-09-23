import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SidecarService } from "../service";

describe("SidecarService", () => {
  it("loads and updates the selected LLM id in session metadata", async () => {
    const configRoot = await mkdtemp(path.join(os.tmpdir(), "papercompile-agent-"));
    const events: unknown[] = [];
    const adapter = {
      id: "omp", name: "Oh My Pi",
      openSession: async () => ({ sessionId: "omp:project", history: [] }),
      prompt: async () => undefined,
      steer: async () => undefined,
      abort: async () => undefined,
      reload: async () => undefined,
      dispose: async () => undefined,
    };
    try {
      const service = new SidecarService(adapter, event => events.push(event), async () => undefined);
      await service.handle({ type: "initialize", requestId: "1", configRoot });
      await service.handle({
        type: "open_session", requestId: "2", projectRoot: "C:/paper", agentId: "omp",
        profile: { id: "first", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
      });
      expect(events).toContainEqual({ type: "session_opened", sessionId: "omp:project", history: [], llmProfileId: "" });

      await service.handle({ type: "select_llm", requestId: "3", sessionId: "omp:project", llmProfileId: "second" });
      const projectId = "C:/paper";
      const crypto = await import("node:crypto");
      const id = crypto.createHash("sha256").update(path.resolve(projectId).toLowerCase()).digest("hex").slice(0, 24);
      const metadata = JSON.parse(await readFile(path.join(configRoot, "sessions", id, "omp", "papercompile.json"), "utf8"));
      expect(metadata).toEqual({ llmProfileId: "second" });

      const reopenedEvents: unknown[] = [];
      const reopened = new SidecarService(adapter, event => reopenedEvents.push(event), async () => undefined);
      await reopened.handle({ type: "initialize", requestId: "4", configRoot });
      await reopened.handle({
        type: "open_session", requestId: "5", projectRoot: "C:/paper", agentId: "omp",
        profile: { id: "first", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
      });
      expect(reopenedEvents).toContainEqual({ type: "session_opened", sessionId: "omp:project", history: [], llmProfileId: "second" });
    } finally {
      await rm(configRoot, { recursive: true, force: true });
    }
  });
  it("initializes, opens the OMP session, and routes run commands", async () => {
    const calls: string[] = [];
    const events: unknown[] = [];
    const adapter = {
      id: "omp",
      name: "Oh My Pi",
      openSession: async () => {
        calls.push("open");
        return { sessionId: "omp:project", history: [] };
      },
      prompt: async (_runId: string, text: string, profile: { model: string }) => { calls.push(`prompt:${profile.model}:${text}`); },
      steer: async (_runId: string, text: string) => { calls.push(`steer:${text}`); },
      abort: async () => { calls.push("abort"); },
      reload: async () => { calls.push("reload"); },
      dispose: async () => { calls.push("dispose"); },
    };
    const service = new SidecarService(adapter, event => events.push(event), async () => undefined);

    await service.handle({ type: "initialize", requestId: "1", configRoot: "C:/data" });
    await service.handle({
      type: "open_session",
      requestId: "2",
      projectRoot: "C:/paper",
      agentId: "omp",
    });
    await service.handle({ type: "prompt", requestId: "3", sessionId: "omp:project", runId: "r", text: "work", profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" } });
    await service.handle({ type: "steer", requestId: "4", sessionId: "omp:project", runId: "r", text: "adjust" });
    await service.handle({ type: "abort", requestId: "5", sessionId: "omp:project", runId: "r" });

    expect(calls).toEqual(["open", "prompt:m:work", "steer:adjust", "abort"]);
    expect(events[0]).toMatchObject({ type: "ready" });
    expect(events).toContainEqual({ type: "run_started", sessionId: "omp:project", runId: "r" });
  });

  it("does not block interaction responses or abort while prompt is active", async () => {
    let finishPrompt: (() => void) | undefined;
    const calls: string[] = [];
    const adapter = {
      id: "omp",
      name: "Oh My Pi",
      openSession: async () => ({ sessionId: "omp:project", history: [] }),
      prompt: async () => new Promise<void>(resolve => { finishPrompt = resolve; }),
      steer: async () => { calls.push("steer"); },
      abort: async () => { calls.push("abort"); finishPrompt?.(); },
      reload: async () => undefined,
      dispose: async () => undefined,
    };
    const responses: unknown[] = [];
    const service = new SidecarService(adapter, () => undefined, async () => undefined, (_id, value) => responses.push(value));
    await service.handle({ type: "initialize", requestId: "1", configRoot: "C:/data" });
    await service.handle({
      type: "open_session", requestId: "2", projectRoot: "C:/paper", agentId: "omp",
      profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    });

    await service.handle({ type: "prompt", requestId: "3", sessionId: "omp:project", runId: "r", text: "work", profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" } });
    await service.handle({ type: "interaction_response", requestId: "permission", value: true });
    await service.handle({ type: "steer", requestId: "4", sessionId: "omp:project", runId: "r", text: "adjust" });
    await service.handle({ type: "abort", requestId: "5", sessionId: "omp:project", runId: "r" });

    expect(responses).toEqual([true]);
    expect(calls).toEqual(["steer", "abort"]);
  });

  it("finishes the run after an asynchronous prompt error", async () => {
    const events: unknown[] = [];
    const adapter = {
      id: "omp", name: "Oh My Pi",
      openSession: async () => ({ sessionId: "omp:project", history: [] }),
      prompt: async () => { throw new Error("provider failed"); },
      steer: async () => undefined,
      abort: async () => undefined,
      reload: async () => undefined,
      dispose: async () => undefined,
    };
    const service = new SidecarService(adapter, event => events.push(event), async () => undefined);
    await service.handle({ type: "initialize", requestId: "1", configRoot: "C:/data" });
    await service.handle({
      type: "open_session", requestId: "2", projectRoot: "C:/paper", agentId: "omp",
      profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    });
    await service.handle({ type: "prompt", requestId: "3", sessionId: "omp:project", runId: "r", text: "work", profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" } });
    await Promise.resolve();

    expect(events).toContainEqual({ type: "run_finished", sessionId: "omp:project", runId: "r" });
  });

  it("does not report an aborted run when OMP abort fails", async () => {
    const events: unknown[] = [];
    const adapter = {
      id: "omp", name: "Oh My Pi",
      openSession: async () => ({ sessionId: "omp:project", history: [] }),
      prompt: async () => undefined,
      steer: async () => undefined,
      abort: async () => { throw new Error("abort failed"); },
      reload: async () => undefined,
      dispose: async () => undefined,
    };
    const service = new SidecarService(adapter, event => events.push(event), async () => undefined);
    await service.handle({ type: "initialize", requestId: "1", configRoot: "C:/data" });
    await service.handle({
      type: "open_session", requestId: "2", projectRoot: "C:/paper", agentId: "omp",
      profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    });

    await expect(service.handle({ type: "abort", requestId: "3", sessionId: "omp:project", runId: "r" }))
      .rejects.toThrow("abort failed");

    expect(events).not.toContainEqual({ type: "run_aborted", sessionId: "omp:project", runId: "r" });
  });

  it("emits run_aborted only after OMP has finished aborting", async () => {
    const events: unknown[] = [];
    let finishAbort: (() => void) | undefined;
    const adapter = {
      id: "omp", name: "Oh My Pi",
      openSession: async () => ({ sessionId: "omp:project", history: [] }),
      prompt: async () => undefined,
      steer: async () => undefined,
      abort: async () => new Promise<void>(resolve => { finishAbort = resolve; }),
      reload: async () => undefined,
      dispose: async () => undefined,
    };
    const service = new SidecarService(adapter, event => events.push(event), async () => undefined);
    await service.handle({ type: "initialize", requestId: "1", configRoot: "C:/data" });
    await service.handle({
      type: "open_session", requestId: "2", projectRoot: "C:/paper", agentId: "omp",
      profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    });

    const aborting = service.handle({ type: "abort", requestId: "3", sessionId: "omp:project", runId: "r" });
    await Promise.resolve();
    expect(events).not.toContainEqual({ type: "run_aborted", sessionId: "omp:project", runId: "r" });
    finishAbort?.();
    await aborting;
    expect(events).toContainEqual({ type: "run_aborted", sessionId: "omp:project", runId: "r" });
  });
});
