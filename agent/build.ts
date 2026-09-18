import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { createInstalledLegacyPiPlugin } from "./legacyPiPlugin";

const outfile = path.resolve(
  process.argv[2] ?? path.join(import.meta.dir, "dist", process.platform === "win32" ? "papercompile-agent.exe" : "papercompile-agent"),
);
const result = await Bun.build({
  entrypoints: [path.join(import.meta.dir, "main.ts")],
  root: import.meta.dir,
  plugins: [await createInstalledLegacyPiPlugin()],
  external: ["fastembed", "onnxruntime-node"],
  define: {
    "process.env.PI_COMPILED": JSON.stringify("true"),
    "process.env.PI_DOCS_EMBED": JSON.stringify(""),
  },
  compile: {
    outfile,
    autoloadBunfig: false,
    autoloadDotenv: false,
    autoloadTsconfig: false,
    autoloadPackageJson: false,
  },
  throw: false,
});

if (!result.success) {
  throw new Error(result.logs.map(log => log.message).join("\n"));
}

const platformTag = `${process.platform}-${process.arch}`;
const nativePackage = path.join(
  import.meta.dir,
  "node_modules",
  "@oh-my-pi",
  `pi-natives-${platformTag}`,
);
const nativeGlob = new Bun.Glob(`pi_natives.${platformTag}*.node`);
const nativeFiles = Array.from(nativeGlob.scanSync({ cwd: nativePackage, onlyFiles: true }));
if (nativeFiles.length === 0) {
  throw new Error(`missing OMP native addon for ${platformTag}`);
}
await mkdir(path.dirname(outfile), { recursive: true });
for (const file of nativeFiles) {
  await copyFile(path.join(nativePackage, file), path.join(path.dirname(outfile), file));
}
