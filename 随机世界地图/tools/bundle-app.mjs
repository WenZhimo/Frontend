import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  "src/sim/prng.js",
  "src/sim/scale.js",
  "src/sim/topology.js",
  "src/sim/grid.js",
  "src/sim/sphere/vector.js",
  "src/sim/sphere/cubedSphere.js",
  "src/sim/sphere/projection.js",
  "src/sim/sphere/plates.js",
  "src/sim/sphere/topologyGraph.js",
  "src/sim/sphere/sphericalWorld.js",
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
  "src/sim/geology/isostasy.js",
  "src/sim/geology/elevation.js",
  "src/sim/geology/reliefBudget.js",
  "src/sim/geology/seaLevel.js",
  "src/sim/geology/sediment.js",
  "src/sim/geology/pipeline.js",
  "src/sim/derived/terrain.js",
  "src/sim/world.js",
  "src/sim/evolution.js",
  "src/gpu/capability.js",
  "src/gpu/kernels/isostasyKernel.js",
  "src/gpu/isostasyCompute.js",
  "src/gpu/kernels/elevationKernel.js",
  "src/gpu/elevationCompute.js",
  "src/render/cpuMapRenderer.js",
  "src/render/sphericalProjectionRenderer.js",
  "src/render/gpuMapRenderer.js",
  "src/render/renderBackend.js",
  "src/render/map2d.js",
  "src/ui/controls.js",
  "src/main.js",
];

let bundled = `"use strict";\n\n`;
for (const file of files) {
  const abs = join(root, file);
  let code = readFileSync(abs, "utf8");
  code = code
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export \{.*?\};\r?\n/gm, "")
    .replace(/^export async function /gm, "async function ")
    .replace(/^export class /gm, "class ")
    .replace(/^export const /gm, "const ")
    .replace(/^export let /gm, "let ")
    .replace(/^export var /gm, "var ")
    .replace(/^export function /gm, "function ");
  bundled += `// ---- ${file} ----\n${code}\n\n`;
}

const indented = bundled
  .split(/\r?\n/)
  .map((line) => (line.length > 0 ? `  ${line}` : ""))
  .join("\n");
const output = `(function () {\n${indented}})();\n`;
writeFileSync(join(root, "src/app.js"), output, "utf8");
