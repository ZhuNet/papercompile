import { describe, expect, it } from "vitest";
import {
  decodeCommand,
  encodeEvent,
  type AgentCommand,
  type AgentEvent,
} from "../protocol";

describe("agent sidecar protocol", () => {
  it("decodes commands without interpreting agent-specific payloads", () => {
    const command: AgentCommand = {
      type: "prompt",
      requestId: "req-1",
      sessionId: "session-1",
      runId: "run-1",
      text: "/review this project",
      profile: { id: "p", provider: "Local", endpoint: "http://localhost/v1", model: "m", apiKey: "" },
    };

    expect(decodeCommand(JSON.stringify(command))).toEqual(command);
  });

  it("encodes one event as one JSON line", () => {
    const event: AgentEvent = {
      type: "message_delta",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "message-1",
      text: "hello\nworld",
    };

    expect(encodeEvent(event)).toBe(`${JSON.stringify(event)}\n`);
    expect(encodeEvent(event)).not.toContain("\nworld");
  });

  it("accepts session-scoped LLM selection commands", () => {
    const command: AgentCommand = {
      type: "select_llm",
      requestId: "select-1",
      sessionId: "session-1",
      llmProfileId: "profile-2",
    };
    expect(decodeCommand(JSON.stringify(command))).toEqual(command);
  });

  it("rejects commands without a recognized type", () => {
    expect(() => decodeCommand('{"type":"unknown"}')).toThrow(
      "unknown agent command",
    );
  });
});
