import path from "node:path";
import { __renderLegacyPiVirtualModule } from "./node_modules/@oh-my-pi/pi-coding-agent/scripts/legacy-pi-virtual-module";

type Entry = { key: string; binding: string; importSpecifier: string };

const packages = [
  ["@oh-my-pi/pi-agent-core", "PiAgentCore", null],
  ["@oh-my-pi/pi-ai", "PiAi", "legacy-pi-ai-shim.ts"],
  ["@oh-my-pi/pi-coding-agent", "PiCodingAgent", "legacy-pi-coding-agent-shim.ts"],
  ["@oh-my-pi/pi-natives", "PiNatives", null],
  ["@oh-my-pi/pi-tui", "PiTui", "legacy-pi-tui-shim.ts"],
  ["@oh-my-pi/pi-utils", "PiUtils", null],
] as const;

const codingAgentRoot = path.join(import.meta.dir, "node_modules", "@oh-my-pi", "pi-coding-agent");

function binding(identifier: string, subpath = ""): string {
  const suffix = subpath.split("/").filter(Boolean).map(segment =>
    segment.split(/[-_]/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join("")
  ).join("");
  return `bundled${identifier}${suffix}`;
}

function importTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "import" in value && typeof value.import === "string") return value.import;
}

export async function createInstalledLegacyPiPlugin(): Promise<Bun.BunPlugin> {
  const entries: Entry[] = [];
  for (const [packageName, identifier, shim] of packages) {
    const packageRoot = path.join(import.meta.dir, "node_modules", ...packageName.split("/"));
    const manifest = await Bun.file(path.join(packageRoot, "package.json")).json() as {
      exports?: Record<string, unknown>;
    };
    entries.push({
      key: packageName,
      binding: binding(identifier),
      importSpecifier: shim
        ? path.join(codingAgentRoot, "src", "extensibility", shim)
        : packageName,
    });
    for (const [exportKey, value] of Object.entries(manifest.exports ?? {})) {
      if (!exportKey.startsWith("./") || exportKey === "." || exportKey.includes("*")) continue;
      const subpath = exportKey.slice(2);
      if (!importTarget(value)) continue;
      entries.push({ key: `${packageName}/${subpath}`, binding: binding(identifier, subpath), importSpecifier: `${packageName}/${subpath}` });
    }
  }
  entries.push({
    key: "typebox",
    binding: "bundledTypeBoxShim",
    importSpecifier: path.join(codingAgentRoot, "src", "extensibility", "legacy-typebox.ts"),
  });
  const source = __renderLegacyPiVirtualModule(entries);
  return {
    name: "papercompile:omp-legacy-pi-modules",
    setup(build) {
      build.onResolve({ filter: /^omp-legacy-pi-modules$/ }, () => ({
        path: "omp-legacy-pi-modules",
        namespace: "papercompile-omp-legacy",
      }));
      build.onLoad({ filter: /.*/, namespace: "papercompile-omp-legacy" }, () => ({ contents: source, loader: "ts" }));
    },
  };
}
