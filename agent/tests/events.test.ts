import { describe, expect, it } from "vitest";
import { mapOmpEvent } from "../events";

describe("OMP event mapping", () => {
  it("maps assistant text deltas to the PaperCompile event shape", () => {
    expect(
      mapOmpEvent(
        {
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "hello",
          },
          message: { timestamp: 123 },
        },
        { agentId: "omp", sessionId: "session-1", runId: "run-1" },
      ),
    ).toEqual({
      type: "message_delta",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "123",
      text: "hello",
    });
  });

  it("keeps unknown OMP events as raw events", () => {
    const payload = { type: "future_event", value: 42 };
    expect(
      mapOmpEvent(payload, { agentId: "omp", sessionId: "s", runId: "r" }),
    ).toEqual({
      type: "raw",
      agentId: "omp",
      name: "future_event",
      payload,
    });
  });
});
