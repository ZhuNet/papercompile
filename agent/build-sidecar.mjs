import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldBuildSidecar } from "./buildCache.mjs";

const sidecarDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(sidecarDir);
if (!existsSync(path.join(sidecarDir, "node_modules", "@oh-my-pi", "pi-coding-agent"))) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable; run this build through npm");
  execFileSync(process.execPath, [npmCli, "ci", "--ignore-scripts"], { cwd: sidecarDir, stdio: "inherit" });
}
const triple = execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
const extension = process.platform === "win32" ? ".exe" : "";
const output = path.join(root, "src-tauri", "binaries", `papercompile-agent-${triple}${extension}`);
const temporaryOutput = `${output}.${process.pid}.tmp${extension}`;
const platformTag = `${process.platform}-${process.arch}`;
const nativeName = `pi_natives.${platformTag}-baseline.node`;
const nativeOutput = path.join(root, "src-tauri", "binaries", nativeName);
const cacheFile = path.join(root, "src-tauri", "binaries", `.papercompile-agent-${triple}.sha256`);
const runtimeInputs = [
  "adapter.ts",
  "build.ts",
  "build-sidecar.mjs",
  "buildCache.mjs",
  "events.ts",
  "interactions.ts",
  "legacyPiPlugin.ts",
  "main.ts",
  "ompRuntime.ts",
  "package.json",
  "package-lock.json",
  "protocol.ts",
  "service.ts",
];
const hash = createHash("sha256");
hash.update(`target:${triple}\n`);
for (const file of runtimeInputs) {
  hash.update(`${file}\0`);
  hash.update(readFileSync(path.join(sidecarDir, file)));
}
const currentHash = hash.digest("hex");
const cachedHash = existsSync(cacheFile) ? readFileSync(cacheFile, "utf8").trim() : "";
if (!shouldBuildSidecar({
  currentHash,
  cachedHash,
  outputExists: existsSync(output),
  nativeExists: existsSync(nativeOutput),
})) {
  console.log("Agent sidecar unchanged; skipping build.");
  process.exit(0);
}
console.log("Agent sidecar inputs changed; building.");
const bunPlatform = process.platform === "win32" ? "windows" : process.platform;
const bunExecutable = path.join(
  sidecarDir,
  "node_modules",
  "@oven",
  `bun-${bunPlatform}-${process.arch}`,
  "bin",
  process.platform === "win32" ? "bun.exe" : "bun",
);
execFileSync(bunExecutable, ["build.ts", temporaryOutput], {
  cwd: sidecarDir,
  stdio: "inherit",
});
for (let attempt = 0; ; attempt += 1) {
  try {
    rmSync(output, { force: true });
    renameSync(temporaryOutput, output);
    break;
  } catch (error) {
    if (attempt >= 20) throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
writeFileSync(cacheFile, `${currentHash}\n`);
