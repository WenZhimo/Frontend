import { writeFileSync } from "node:fs";
import { parseOptions, parseTopologyOptions } from "./lib/cli.mjs";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { colorForElevation } from "../src/render/cpuMapRenderer.js";
import { renderSphericalField } from "../src/render/sphericalProjectionRenderer.js";

const { positional, options } = parseOptions(process.argv.slice(2));
const topologyOptions = parseTopologyOptions(options);
const seedText = positional[0] ?? "\u9f99\u9aa8\u6d77-\u7eaa\u51437";
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
  ...topologyOptions,
});
for (let i = 0; i < steps; i += 1) stepWorld(world);

const cpuOutput = `${outputPrefix}_cpu.ppm`;
const cpuRender = renderElevationReference(world, topologyOptions);
writeFileSync(cpuOutput, Buffer.concat([Buffer.from(`P6\n${cpuRender.width} ${cpuRender.height}\n255\n`), cpuRender.bytes]));

const gpuCapabilities = detectGpuCapabilities(globalThis);
const result = {
  seedText,
  steps,
  ageYears: world.ageYears,
  pipelineMode,
  resolution,
  ...topologyOptions,
  cpuOutput,
  outputWidth: cpuRender.width,
  outputHeight: cpuRender.height,
  cpuRenderBackend: isGraphBackedGrid(world.grid) ? "cpu-spherical-projection-reference" : "cpu-canvas-compatible",
  experimentalGpuRender: {
    attempted: false,
    skipped: true,
    backend: gpuCapabilities.recommendedMode,
    reason: isGraphBackedGrid(world.grid)
      ? "Graph-backed spherical grids use CPU projection rendering as the reference; experimental rectangular WebGL2 rendering is skipped."
      : "Headless Node GPU rendering is not required in Phase 1; browser WebGL2 backend is available only through explicit app opt-in.",
  },
  gpuCapabilities,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  seaLevel: world.seaLevel,
  note: "Phase 1 render check writes the CPU reference image and reports GPU fallback/skipped safely when headless GPU is unavailable.",
};

console.log(JSON.stringify(result, null, 2));

function renderElevationReference(world, topologyOptions) {
  if (isGraphBackedGrid(world.grid)) {
    const outputResolution = options["output-resolution"] ?? options.outputResolution ?? resolution;
    const { width, height } = parseResolution(outputResolution, 512, 256);
    const rendered = renderSphericalField(world.grid, world.grid.elev, {
      width,
      height,
      projectionMode: world.params?.projectionMode ?? topologyOptions.projectionMode ?? "equirectangular",
      colorRamp: (value) => colorForElevation(value - world.seaLevel),
    });
    return {
      width,
      height,
      bytes: rgbaToRgb(rendered.pixels),
    };
  }
  return {
    width: world.grid.width,
    height: world.grid.height,
    bytes: renderRectangularElevationToRgbBytes(world),
  };
}

function renderRectangularElevationToRgbBytes(world) {
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

function rgbaToRgb(pixels) {
  const bytes = Buffer.alloc((pixels.length / 4) * 3);
  for (let rgba = 0, rgb = 0; rgba < pixels.length; rgba += 4, rgb += 3) {
    bytes[rgb] = pixels[rgba];
    bytes[rgb + 1] = pixels[rgba + 1];
    bytes[rgb + 2] = pixels[rgba + 2];
  }
  return bytes;
}

function parseResolution(value, fallbackWidth, fallbackHeight) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value ?? ""));
  if (!match) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  return {
    width: Math.max(1, Number(match[1])),
    height: Math.max(1, Number(match[2])),
  };
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}
