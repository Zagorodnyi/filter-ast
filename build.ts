import { $ } from "bun";
import { rm } from "node:fs/promises";

const entrypoint = "src/index.ts";
const outDir = "dist";

const bundle = (format: "esm" | "cjs", extension: string) =>
  Bun.build({
    entrypoints: [entrypoint],
    outdir: outDir,
    target: "node",
    format,
    packages: "external",
    naming: `[name].${extension}`,
  });

await rm(outDir, { recursive: true, force: true });
await Promise.all([bundle("esm", "mjs"), bundle("cjs", "cjs"), $`tsc -p tsconfig.json`]);
