import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "popup"), { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(root, "src/popup/index.ts")],
    outfile: resolve(dist, "popup.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
  }),
  build({
    entryPoints: [resolve(root, "src/content/index.ts")],
    outfile: resolve(dist, "content.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
  }),
  build({
    entryPoints: [resolve(root, "src/main-world/index.ts")],
    outfile: resolve(dist, "main-world.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
  }),
  cp(resolve(root, "manifest.json"), resolve(dist, "manifest.json")),
  cp(resolve(root, "src/popup/index.html"), resolve(dist, "popup/index.html")),
  cp(resolve(root, "src/popup/styles.css"), resolve(dist, "popup/styles.css")),
  cp(resolve(root, "INSTALL.md"), resolve(dist, "INSTALL.md")),
  cp(resolve(root, "PRIVACY.md"), resolve(dist, "PRIVACY.md")),
  cp(resolve(root, "操作手册.md"), resolve(dist, "MANUAL.md")),
]);
