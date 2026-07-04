import { writeFileSync } from "node:fs";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { parseOptions, parseTopologyOptions } from "./lib/cli.mjs";
import { colorForElevation } from "../src/render/cpuMapRenderer.js";
import { renderSphericalField } from "../src/render/sphericalProjectionRenderer.js";

const { positional, options } = parseOptions(process.argv.slice(2));
const topologyOptions = parseTopologyOptions(options);

const params = {
  seedText: positional[0] ?? "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: positional[4] ?? "512x256",
  pipelineMode: positional[3] ?? "legacy",
  ...topologyOptions,
  showBoundaries: false,
};
const steps = Number(positional[1] ?? 739);
const output = positional[2] ?? "_render-check.ppm";

const world = createWorld(params);
for (let i = 0; i < steps; i += 1) stepWorld(world);

const render = renderElevationReference(world, params);
writeFileSync(output, Buffer.concat([Buffer.from(`P6\n${render.width} ${render.height}\n255\n`), render.bytes]));
console.log(JSON.stringify({
  output,
  outputWidth: render.width,
  outputHeight: render.height,
  renderBackend: render.backend,
  steps,
  ageYears: world.ageYears,
  pipelineMode: params.pipelineMode,
  resolution: params.resolution,
  topologyMode: world.params.topologyMode,
  projectionMode: world.params.projectionMode,
  faceSize: world.params.faceSize,
  sphericalGridSize: world.sphericalGrid?.size ?? 0,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  seaLevel: world.seaLevel,
  causalityPass: world.stats.causalityPass,
  avgMountainConvergent: world.stats.avgMountainConvergent,
  avgContinentalInterior: world.stats.avgContinentalInterior,
  featureStats: measureFeatureStats(world.grid),
  featureHealth: measureFeatureHealth(world.grid),
}, null, 2));

function renderElevationReference(world, params) {
  if (isGraphBackedGrid(world.grid)) {
    const outputResolution = options["output-resolution"] ?? options.outputResolution ?? params.resolution;
    const { width, height } = parseResolution(outputResolution, 512, 256);
    const rendered = renderSphericalField(world.grid, world.grid.elev, {
      width,
      height,
      projectionMode: world.params?.projectionMode ?? params.projectionMode ?? "equirectangular",
      colorRamp: (value) => colorForElevation(value - world.seaLevel),
    });
    return {
      width,
      height,
      bytes: rgbaToRgb(rendered.pixels),
      backend: "cpu-spherical-projection-reference",
    };
  }
  return {
    width: world.grid.width,
    height: world.grid.height,
    bytes: renderRectangularElevationToRgbBytes(world),
    backend: "cpu-rectangular-reference",
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

function measureFeatureStats(grid) {
  const fields = {
    mountainBelt: grid.mountainBelt,
    trench: grid.trench,
    ridge: grid.ridge,
    rift: grid.rift,
    islandArc: grid.islandArc,
    basin: grid.basin,
  };
  const result = {};
  for (const [name, field] of Object.entries(fields)) {
    let sum = 0;
    let max = 0;
    let covered = 0;
    let boundaryCovered = 0;
    for (let i = 0; i < grid.size; i += 1) {
      const v = field[i];
      sum += v;
      if (v > max) max = v;
      if (v > 0.05) {
        covered += 1;
        if (grid.boundaryDistance[i] === 0) boundaryCovered += 1;
      }
    }
    result[name] = {
      average: sum / grid.size,
      max,
      coverage: covered / grid.size,
      boundaryZeroShare: covered ? boundaryCovered / covered : 0,
    };
  }
  return result;
}

function measureFeatureHealth(grid) {
  const stats = {
    mountainBelt: measureFeatureField(grid, grid.mountainBelt),
    trench: measureFeatureField(grid, grid.trench),
    ridge: measureFeatureField(grid, grid.ridge),
    rift: measureFeatureField(grid, grid.rift),
    islandArc: measureFeatureField(grid, grid.islandArc),
    basin: measureFeatureField(grid, grid.basin),
    featureIntensity: measureFeatureField(grid, grid.featureIntensity),
  };
  const activeTectonicCoverage02 =
    stats.mountainBelt.coverage02 +
    stats.trench.coverage02 +
    stats.ridge.coverage02 +
    stats.rift.coverage02 +
    stats.islandArc.coverage02;
  const activeTectonicMax = Math.max(
    stats.mountainBelt.max,
    stats.trench.max,
    stats.ridge.max,
    stats.rift.max,
    stats.islandArc.max,
  );
  return {
    ...stats,
    activeTectonicCoverage02,
    activeTectonicMax,
    activeFeatureMissing: activeTectonicCoverage02 <= 0 && activeTectonicMax <= 0.001,
    note: "diagnostic only: render output may be valid even when spherical production active features are not yet seeded",
  };
}

function measureFeatureField(grid, field) {
  let sum = 0;
  let max = 0;
  let coverage02 = 0;
  let coverage05 = 0;
  let boundaryCovered02 = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const value = field?.[i] ?? 0;
    sum += value;
    if (value > max) max = value;
    if (value > 0.02) {
      coverage02 += 1;
      if (grid.boundaryDistance?.[i] === 0) boundaryCovered02 += 1;
    }
    if (value > 0.05) coverage05 += 1;
  }
  return {
    mean: sum / Math.max(1, grid.size),
    max,
    coverage02: coverage02 / Math.max(1, grid.size),
    coverage05: coverage05 / Math.max(1, grid.size),
    boundaryZeroShare02: coverage02 ? boundaryCovered02 / coverage02 : 0,
  };
}
