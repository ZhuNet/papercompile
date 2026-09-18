import type { AgentEvent } from "./protocol";

type OmpEvent = {
  type?: string;
  assistantMessageEvent?: { type?: string; delta?: string };
  message?: { timestamp?: number };
  [key: string]: unknown;
};

export function mapOmpEvent(
  event: OmpEvent,
  context: { agentId: string; sessionId: string; runId: string },
): AgentEvent {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent?.type === "text_delta"
  ) {
    return {
      type: "message_delta",
      sessionId: context.sessionId,
      runId: context.runId,
      messageId: event.message?.timestamp === undefined ? `${context.runId}:assistant` : String(event.message.timestamp),
      text: event.assistantMessageEvent.delta ?? "",
    };
  }
  if (event.type === "tool_execution_start") {
    return {
      type: "tool_started",
      sessionId: context.sessionId,
      runId: context.runId,
      toolCallId: String(event.toolCallId ?? "unknown"),
      name: String(event.toolName ?? "unknown"),
      input: event.args,
    };
  }
  if (event.type === "tool_execution_update") {
    return {
      type: "tool_updated",
      sessionId: context.sessionId,
      runId: context.runId,
      toolCallId: String(event.toolCallId ?? "unknown"),
      update: event.partialResult,
    };
  }
  if (event.type === "tool_execution_end") {
    return {
      type: "tool_finished",
      sessionId: context.sessionId,
      runId: context.runId,
      toolCallId: String(event.toolCallId ?? "unknown"),
      result: event.result,
      isError: event.isError === true,
    };
  }
  if (event.type === "agent_end" && event.isTerminal !== false) {
    return {
      type: "run_finished",
      sessionId: context.sessionId,
      runId: context.runId,
      summary: event.telemetry,
    };
  }
  if (event.type === "notice") {
    const level = event.level === "warning" || event.level === "error"
      ? event.level
      : "info";
    return { type: "notice", level, message: String(event.message ?? "") };
  }
  return {
    type: "raw",
    agentId: context.agentId,
    name: event.type ?? "unknown",
    payload: event,
  };
}
