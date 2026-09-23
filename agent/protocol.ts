export type LlmProfile = {
  id: string;
  provider: string;
  endpoint: string;
  model: string;
  apiKey: string;
};

export type AgentCommand =
  | { type: "initialize"; requestId: string; configRoot: string }
  | {
      type: "open_session";
      requestId: string;
      projectRoot: string;
      agentId: string;
      profile: LlmProfile;
    }
  | { type: "prompt"; requestId: string; sessionId: string; runId: string; text: string; profile: LlmProfile }
  | { type: "select_llm"; requestId: string; sessionId: string; llmProfileId: string }
  | { type: "steer"; requestId: string; sessionId: string; runId: string; text: string }
  | { type: "abort"; requestId: string; sessionId: string; runId: string }
  | { type: "interaction_response"; requestId: string; value: unknown }
  | { type: "reload_config"; requestId: string; agentId: string }
  | { type: "shutdown"; requestId: string };

export type AgentEvent =
  | { type: "ready"; agents: { id: string; name: string; version: string }[] }
  | { type: "session_opened"; sessionId: string; history: unknown[]; llmProfileId: string }
  | { type: "run_started"; sessionId: string; runId: string }
  | { type: "run_finished"; sessionId: string; runId: string; summary?: unknown }
  | { type: "run_aborted"; sessionId: string; runId: string }
  | {
      type: "message_delta";
      sessionId: string;
      runId: string;
      messageId: string;
      text: string;
    }
  | {
      type: "tool_started";
      sessionId: string;
      runId: string;
      toolCallId: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_updated";
      sessionId: string;
      runId: string;
      toolCallId: string;
      update: unknown;
    }
  | {
      type: "tool_finished";
      sessionId: string;
      runId: string;
      toolCallId: string;
      result: unknown;
      isError: boolean;
    }
  | {
      type: "interaction_requested";
      requestId: string;
      interaction: "confirm" | "select" | "input";
      title: string;
      message?: string;
      options?: unknown[];
    }
  | { type: "notice"; level: "info" | "warning" | "error"; message: string }
  | { type: "error"; scope: string; message: string; recoverable: boolean }
  | { type: "raw"; agentId: string; name: string; payload: unknown };

export function decodeCommand(line: string): AgentCommand {
  const value: unknown = JSON.parse(line);
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("invalid agent command");
  }
  const type = (value as { type?: unknown }).type;
  const knownTypes = new Set<AgentCommand["type"]>([
    "initialize",
    "open_session",
    "prompt",
    "select_llm",
    "steer",
    "abort",
    "interaction_response",
    "reload_config",
    "shutdown",
  ]);
  if (typeof type !== "string" || !knownTypes.has(type as AgentCommand["type"])) {
    throw new Error("unknown agent command");
  }
  return value as AgentCommand;
}

export function encodeEvent(event: AgentEvent): string {
  return `${JSON.stringify(event)}\n`;
}
