import { createInterface } from "node:readline";
import { AgentAdapter } from "./adapter";
import { InteractionBroker } from "./interactions";
import { createOmpRuntime } from "./ompRuntime";
import { decodeCommand, encodeEvent, type AgentEvent } from "./protocol";
import { SidecarService } from "./service";

const emit = (event: AgentEvent) => process.stdout.write(encodeEvent(event));
const interactions = new InteractionBroker(emit);
const adapter = new AgentAdapter(
  options => createOmpRuntime(options, request => interactions.request(request)),
  emit,
);
let closing = false;
const service = new SidecarService(
  adapter,
  emit,
  async () => { closing = true; },
  (requestId, value) => interactions.resolve(requestId, value),
  () => interactions.cancelAll(),
);

const input = createInterface({ input: process.stdin, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  try {
    await service.handle(decodeCommand(line));
    if (closing) break;
  } catch (error) {
    emit({
      type: "error",
      scope: "sidecar",
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
  }
}

interactions.cancelAll();
await adapter.dispose();
