import path from "node:path";
import { copyFile, access, mkdir } from "node:fs/promises";
import type { AgentRuntime, OpenSessionOptions } from "./adapter";
import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";

const TASK_SUBAGENT_EVENT_CHANNEL = "task:subagent:event";
const TASK_SUBAGENT_LIFECYCLE_CHANNEL = "task:subagent:lifecycle";
const TASK_SUBAGENT_PROGRESS_CHANNEL = "task:subagent:progress";

export type InteractionRequest = {
  interaction: "confirm" | "select" | "input";
  title: string;
  message?: string;
  options?: unknown[];
};

export async function createOmpRuntime(
  options: OpenSessionOptions,
  requestInteraction: (request: InteractionRequest) => Promise<unknown>,
): Promise<AgentRuntime> {
  const nativeName = `pi_natives.${process.platform}-${process.arch}-baseline.node`;
  const executableDir = path.dirname(process.execPath);
  const isolatedHome = path.join(options.agentDir, "runtime-home");
  const nativeTargetDir = path.join(isolatedHome, ".omp", "natives", "18.2.5");
  const nativeTarget = path.join(nativeTargetDir, nativeName);
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = isolatedHome;
  process.env.USERPROFILE = isolatedHome;
  process.env.PI_CODING_AGENT_DIR = options.agentDir;
  try {
    await access(nativeTarget);
  } catch {
    await mkdir(nativeTargetDir, { recursive: true });
    const resourceCandidates = [
      path.join(executableDir, "resources", "binaries", nativeName),
      path.join(executableDir, "binaries", nativeName),
      path.join(executableDir, nativeName),
    ];
    for (const source of resourceCandidates) {
      try {
        await copyFile(source, nativeTarget);
        break;
      } catch {
        // Try the next Tauri resource layout.
      }
    }
    await access(nativeTarget);
  }
  const {
    createAgentSession,
    discoverAuthStorage,
    ModelRegistry,
    SessionManager,
    Settings,
  } = await import("@oh-my-pi/pi-coding-agent");
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousUserProfile;
  const authStorage = await discoverAuthStorage(options.agentDir);
  const settings = await Settings.loadIsolated({ cwd: options.projectRoot, agentDir: options.agentDir });
  const modelRegistry = new ModelRegistry(
    authStorage,
    path.join(options.agentDir, "models.yml"),
  );
  modelRegistry.registerProvider("papercompile", {
    baseUrl: options.profile.endpoint,
    api: "openai-completions",
    apiKey: options.profile.apiKey || "papercompile-local",
    authHeader: Boolean(options.profile.apiKey),
    models: [{
      id: options.profile.model,
      name: options.profile.name,
      reasoning: false,
      input: ["text", "image"],
      supportsTools: true,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    }],
  });
  const model = modelRegistry.find("papercompile", options.profile.model);
  if (!model) throw new Error(`unable to register model ${options.profile.model}`);

  const sessionManager = await SessionManager.continueRecent(
    options.projectRoot,
    options.sessionDir,
  );
  const result = await createAgentSession({
    cwd: options.projectRoot,
    agentDir: options.agentDir,
    authStorage,
    modelRegistry,
    model,
    settings,
    sessionManager,
    enableMCP: true,
    enableLsp: true,
    hasUI: true,
    interactivePrompts: true,
  });

  const uiContext = {
    select: (title: string, choices: unknown[]) =>
      requestInteraction({ interaction: "select", title, options: choices }),
    confirm: (title: string, message: string) =>
      requestInteraction({ interaction: "confirm", title, message }),
    input: (title: string, placeholder?: string) =>
      requestInteraction({ interaction: "input", title, message: placeholder }),
    notify: () => undefined,
    onTerminalInput: () => () => undefined,
    setStatus: () => undefined,
    setWorkingMessage: () => undefined,
    setWidget: () => undefined,
    setFooter: () => undefined,
    setHeader: () => undefined,
    setTitle: () => undefined,
    custom: async () => undefined,
    setEditorText: () => undefined,
    pasteToEditor: () => undefined,
    getEditorText: () => "",
    editor: { getText: () => "", setText: () => undefined, insertText: () => undefined },
    theme: {},
  } as unknown as ExtensionUIContext;
  result.setToolUIContext(uiContext, true);

  return {
    history: result.session.messages,
    subscribe(listener) {
      const unsubscribers = [
        result.session.subscribe(event => listener(event as unknown as Record<string, unknown>)),
      ];
      if (result.subagentEventBus) {
        unsubscribers.push(
          result.subagentEventBus.on(TASK_SUBAGENT_LIFECYCLE_CHANNEL, payload => listener({ type: "subagent_lifecycle", payload })),
          result.subagentEventBus.on(TASK_SUBAGENT_PROGRESS_CHANNEL, payload => listener({ type: "subagent_progress", payload })),
          result.subagentEventBus.on(TASK_SUBAGENT_EVENT_CHANNEL, payload => listener({ type: "subagent_event", payload })),
        );
      }
      return () => unsubscribers.forEach(unsubscribe => unsubscribe());
    },
    async prompt(text) {
      await result.session.prompt(text, { streamingBehavior: "steer" });
    },
    async steer(text) {
      await result.session.steer(text, undefined, { attribution: "user" });
    },
    async abort() {
      await result.session.abort({ reason: "Stopped by PaperCompile", goalReason: "interrupted" });
    },
    async reload() {
      await result.session.refreshSkills();
      if (result.mcpManager) {
        await result.mcpManager.disconnectAll();
        await result.mcpManager.discoverAndConnect({ enableProjectConfig: false });
        await result.session.refreshMCPTools(result.mcpManager.getTools());
      }
    },
    async dispose() {
      await result.session.dispose();
    },
  };
}
