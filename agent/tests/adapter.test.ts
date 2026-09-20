import { describe, expect, it } from "vitest";
import { AgentAdapter } from "../adapter";

function fakeRuntime() {
  const calls: string[] = [];
  let listener: ((event: Record<string, unknown>) => void) | undefined;
  return {
    calls,
    factory: async () => ({
      history: [{ role: "user", content: "before" }],
      subscribe(next: (event: Record<string, unknown>) => void) {
        listener = next;
        return () => { listener = undefined; };
      },
      async prompt(text: string) { calls.push(`prompt:${text}`); },
      async steer(text: string) { calls.push(`steer:${text}`); },
      async abort() { calls.push("abort"); },
      async reload() { calls.push("reload"); },
      async dispose() { calls.push("dispose"); },
    }),
    emit(event: Record<string, unknown>) { listener?.(event); },
  };
}

describe("AgentAdapter", () => {
  it("opens one persistent session and forwards OMP events", async () => {
    const runtime = fakeRuntime();
    const events: unknown[] = [];
    const adapter = new AgentAdapter(runtime.factory, event => events.push(event));

    const opened = await adapter.openSession({
      projectRoot: "C:/paper",
      agentDir: "C:/data/agent",
      sessionDir: "C:/data/sessions/project/omp",
      profile: { id: "llm", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    });
    adapter.startRun("run-1");
    runtime.emit({ type: "future_event", value: 1 });

    expect(opened.history).toEqual([{ role: "user", content: "before" }]);
    expect(events).toContainEqual({
      type: "raw",
      agentId: "omp",
      name: "future_event",
      payload: { type: "future_event", value: 1 },
    });
  });

  it("routes prompt, steering, abort, reload, and disposal", async () => {
    const runtime = fakeRuntime();
    const adapter = new AgentAdapter(runtime.factory, () => undefined);
    await adapter.openSession({
      projectRoot: "C:/paper",
      agentDir: "C:/data/agent",
      sessionDir: "C:/data/sessions/project/omp",
      profile: { id: "llm", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    });

    await adapter.prompt("run-1", "work");
    await adapter.steer("run-1", "change course");
    await adapter.abort("run-1");
    await adapter.reload();
    await adapter.dispose();

    expect(runtime.calls).toEqual([
      "prompt:work",
      "steer:change course",
      "abort",
      "reload",
      "dispose",
    ]);
  });
});
