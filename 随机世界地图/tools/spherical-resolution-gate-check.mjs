import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { projectionSampleToVec3 } from "../src/render/sphericalProjectionRenderer.js";
import { nearestCellByVector } from "../src/sim/sphere/cubedSphere.js";
import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? options.seed ?? "龙骨海-纪元7";
const steps = parseIntOption(options, "steps", Number(positional[1] ?? 2));
const faceSizes = parseCsv(options["face-sizes"] ?? options.faceSizes ?? positional[2], ["16", "24"])
  .map((value) => Math.max(2, Math.trunc(Number(value))))
  .filter((value, index, values) => Number.isFinite(value) && values.indexOf(value) === index)
  .sort((a, b) => a - b);
const outputResolution = positional[3] ?? options["output-resolution"] ?? options.outputResolution ?? "128x64";
const projectionMode = options.projection ?? options["projection-mode"] ?? options.projectionMode ?? "equirectangular";

if (faceSizes.length < 2) {
  console.log(JSON.stringify({
    valid: false,
    seedText,
    steps,
    faceSizes,
    failures: ["needAtLeastTwoFaceSizes"],
  }, null, 2));
  process.exit(1);
}

const [sampleWidth, sampleHeight] = outputResolution.split("x").map(Number);
const worlds = faceSizes.map((faceSize) => {
  const world = createWorld({
    seedText,
    waterLevel: 50,
    intensity: 1,
    plateCount: 14,
    timeScale: 1_000_000,
    resolution: `${faceSize * 4}x${faceSize * 2}`,
    pipelineMode: "geology-v2",
    topologyMode: "cubed-sphere",
    productionTopologyMode: "cubed-sphere-adapter",
    projectionMode,
    faceSize,
  });
  for (let step = 0; step < steps; step += 1) stepWorld(world);
  return world;
});

const baselineWorld = worlds[worlds.length - 1];
const baseline = sampleProjectedWorld(baselineWorld, sampleWidth, sampleHeight, projectionMode);
const comparisons = {};
let maxLandMismatch = 0;
let maxPlateMismatch = 0;
let maxElevationRmse = 0;
let sameGridFailure = false;
let topologyFailure = false;

for (const world of worlds) {
  const grid = world.grid;
  const faceSize = grid.faceSize;
  const sample = sampleProjectedWorld(world, sampleWidth, sampleHeight, projectionMode);
  const landMismatch = measureMismatch(sample.land, baseline.land);
  const plateMismatch = measureMismatch(sample.plate, baseline.plate);
  const elevationRmse = measureRmse(sample.elevation, baseline.elevation);
  const expectedSize = 6 * faceSize * faceSize;
  if (grid.size !== expectedSize) sameGridFailure = true;
  if (grid.topologyKind !== "cubed-sphere" || !grid.topologyOptions?.graphBacked) topologyFailure = true;
  if (world !== baselineWorld) {
    maxLandMismatch = Math.max(maxLandMismatch, landMismatch);
    maxPlateMismatch = Math.max(maxPlateMismatch, plateMismatch);
    maxElevationRmse = Math.max(maxElevationRmse, elevationRmse);
  }
  comparisons[faceSize] = {
    gridSize: grid.size,
    expectedGridSize: expectedSize,
    topologyKind: grid.topologyKind,
    graphBacked: Boolean(grid.topologyOptions?.graphBacked),
    landRatio: world.stats.landRatio,
    seaRatio: world.stats.seaRatio,
    seaLevel: world.seaLevel,
    coastlineRatio: measureCoastline(sample.land, sampleWidth, sampleHeight),
    landMismatchVsBaseline: landMismatch,
    plateMismatchVsBaseline: plateMismatch,
    elevationRmseVsBaseline: elevationRmse,
  };
}

const failures = [];
if (topologyFailure) failures.push("topologyNotCubedSphereGraphBacked");
if (sameGridFailure) failures.push("faceSizeDidNotControlGridSize");
if (!(maxLandMismatch < 0.42)) failures.push("landMismatchTooHigh");
if (!(maxPlateMismatch < 0.98)) failures.push("plateMismatchTooHigh");
if (!(maxElevationRmse < 0.28)) failures.push("elevationRmseTooHigh");

const result = {
  valid: failures.length === 0,
  seedText,
  steps,
  faceSizes,
  outputResolution,
  projectionMode,
  baselineFaceSize: baselineWorld.grid.faceSize,
  failures,
  maxLandMismatch,
  maxPlateMismatch,
  maxElevationRmse,
  comparisons,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function sampleProjectedWorld(world, width, height, projectionMode) {
  const size = width * height;
  const land = new Uint8Array(size);
  const plate = new Int32Array(size);
  const elevation = new Float32Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const sample = projectionSampleToVec3(x, y, width, height, projectionMode);
      if (!sample.visible) {
        land[id] = 0;
        plate[id] = -1;
        elevation[id] = 0;
        continue;
      }
      const cell = nearestCellByVector(world.grid, sample.x, sample.y, sample.z);
      const h = world.grid.elev[cell];
      land[id] = h >= world.seaLevel ? 1 : 0;
      plate[id] = world.grid.plate[cell] ?? 0;
      elevation[id] = h - world.seaLevel;
    }
  }
  return { land, plate, elevation };
}

function measureMismatch(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff / Math.max(1, a.length);
}

function measureRmse(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, a.length));
}

function measureCoastline(land, width, height) {
  let edges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const right = y * width + wrapX(width, x + 1);
      if (land[id] !== land[right]) edges += 1;
      if (y + 1 < height && land[id] !== land[id + width]) edges += 1;
    }
  }
  return edges / Math.max(1, land.length);
}

function wrapX(width, x) {
  return ((x % width) + width) % width;
}
