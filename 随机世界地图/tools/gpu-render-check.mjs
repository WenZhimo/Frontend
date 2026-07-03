import { writeFileSync } from "node:fs";
import { parseOptions } from "./lib/cli.mjs";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { colorForElevation } from "../src/render/cpuMapRenderer.js";

const { positional } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "龙骨海-纪元7";
const steps = Number(positional[1] ?? 20);
const outputPrefix = positional[2] ?? "_gpu_render_phase1";
const pipelineMode = positional[3] ?? "geology-v2";
const resolution = positional[4] ?? "256x128";

const world = createWorld({
  seedText,
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution,
  pipelineMode,
  showBoundaries: false,
});
for (let i = 0; i < steps; i += 1) stepWorld(world);

const cpuOutput = `${outputPrefix}_cpu.ppm`;
const bytes = renderElevationToRgbBytes(world);
writeFileSync(cpuOutput, Buffer.concat([Buffer.from(`P6\n${world.grid.width} ${world.grid.height}\n255\n`), bytes]));

const gpuCapabilities = detectGpuCapabilities(globalThis);
const result = {
  seedText,
  steps,
  ageYears: world.ageYears,
  pipelineMode,
  resolution,
  cpuOutput,
  cpuRenderBackend: "cpu-canvas-compatible",
  experimentalGpuRender: {
    attempted: false,
    skipped: true,
    backend: gpuCapabilities.recommendedMode,
    reason: "Headless Node GPU rendering is not required in Phase 1; browser WebGL2 backend is available only through explicit app opt-in.",
  },
  gpuCapabilities,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  seaLevel: world.seaLevel,
  note: "Phase 1 render check writes the CPU reference image and reports GPU fallback/skipped safely when headless GPU is unavailable.",
};

console.log(JSON.stringify(result, null, 2));

function renderElevationToRgbBytes(world) {
  const { grid } = world;
  const bytes = Buffer.alloc(grid.width * grid.height * 3);
  for (let i = 0; i < grid.size; i += 1) {
    const color = colorForElevation(grid.elev[i] - world.seaLevel);
    const offset = i * 3;
    bytes[offset] = color[0];
    bytes[offset + 1] = color[1];
    bytes[offset + 2] = color[2];
  }
  return bytes;
}
