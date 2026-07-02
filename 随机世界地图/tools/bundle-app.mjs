import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  "src/sim/prng.js",
  "src/sim/scale.js",
  "src/sim/grid.js",
  "src/sim/noise.js",
  "src/sim/terrain.js",
  "src/sim/tectonics.js",
  "src/sim/legacyPipeline.js",
  "src/sim/geology/plates.js",
  "src/sim/geology/crust.js",
  "src/sim/geology/boundaries.js",
  "src/sim/geology/axes.js",
  "src/sim/geology/features.js",
  "src/sim/geology/orogeny.js",
  "src/sim/geology/rift.js",
  "src/sim/geology/margins.js",
  "src/sim/geology/transforms.js",
  "src/sim/geology/elevation.js",
  "src/sim/geology/reliefBudget.js",
  "src/sim/geology/seaLevel.js",
  "src/sim/geology/sediment.js",
  "src/sim/geology/pipeline.js",
  "src/sim/derived/terrain.js",
  "src/sim/world.js",
  "src/sim/evolution.js",
  "src/render/map2d.js",
  "src/ui/controls.js",
  "src/main.js",
];

let bundled = `"use strict";\n\n`;
for (const file of files) {
  const abs = join(root, file);
  let code = readFileSync(abs, "utf8");
  code = code
    .replace(/^import .*?;\r?\n/gm, "")
    .replace(/^export \{.*?\};\r?\n/gm, "")
    .replace(/^export const /gm, "const ")
    .replace(/^export function /gm, "function ");
  bundled += `// ---- ${file} ----\n${code}\n\n`;
}

const indented = bundled
  .split(/\r?\n/)
  .map((line) => (line.length > 0 ? `  ${line}` : ""))
  .join("\n");
const output = `(function () {\n${indented}})();\n`;
writeFileSync(join(root, "src/app.js"), output, "utf8");
