import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { parseOptions, parseTopologyOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const params = {
  seedText: positional[0] ?? "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  pipelineMode: positional[2] ?? "geology-v2",
  resolution: positional[3] ?? "512x256",
  ...parseTopologyOptions(options),
};
const steps = Number(positional[1] ?? 200);
const world = createWorld(params);
const peaks = {
  plateCheckerboardScore: { value: 0, step: 0 },
  activeBoundaryCoverage: { value: 0, step: 0 },
  noisyBoundaryPatchCoverage: { value: 0, step: 0 },
  plateIslandNoiseShare: { value: 0, step: 0 },
  featureOnNoisyBoundaryShare: { value: 0, step: 0 },
};

for (let step = 0; step <= steps; step += 1) {
  if (step > 0) stepWorld(world);
  const metrics = measureBoundaryDiagnostics(world.grid);
  for (const [name, value] of Object.entries(metrics)) {
    if (!peaks[name]) continue;
    if (value > peaks[name].value) peaks[name] = { value, step };
  }
}

console.log(JSON.stringify({
  seedText: params.seedText,
  steps,
  ageYears: world.ageYears,
  pipelineMode: params.pipelineMode,
  resolution: params.resolution,
  final: measureBoundaryDiagnostics(world.grid),
  peaks,
}, null, 2));

function measureBoundaryDiagnostics(grid) {
  let active = 0;
  let densitySum = 0;
  let noisy = 0;
  let checker = 0;
  let islandNoise = 0;
  let featureOnNoisy = 0;
  let featureCount = 0;
  let totalAreaValue = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    totalAreaValue += area;
    if (grid.activeBoundary[i]) active += area;
    densitySum += (grid.boundaryDensity[i] ?? 0) * area;
    if (grid.noisyBoundaryPatch[i]) noisy += area;
    checker += (grid.plateCheckerboard[i] ?? 0) * area;
    if (isPlateIslandNoise(grid, i)) islandNoise += area;
    const feature = Math.max(grid.mountainBelt[i], grid.trench[i], grid.ridge[i], grid.rift[i], grid.basin[i], grid.islandArc[i]);
    if (feature > 0.05) {
      featureCount += area;
      if (grid.noisyBoundaryPatch[i]) featureOnNoisy += area;
    }
  }
  return {
    plateCheckerboardScore: checker / Math.max(totalAreaValue, Number.EPSILON),
    activeBoundaryCoverage: active / Math.max(totalAreaValue, Number.EPSILON),
    localBoundaryDensityMean: densitySum / Math.max(totalAreaValue, Number.EPSILON),
    noisyBoundaryPatchCoverage: noisy / Math.max(totalAreaValue, Number.EPSILON),
    plateIslandNoiseShare: islandNoise / Math.max(totalAreaValue, Number.EPSILON),
    featureOnNoisyBoundaryShare: featureCount ? featureOnNoisy / featureCount : 0,
  };
}

function isPlateIslandNoise(grid, id) {
  const topology = topologyForGrid(grid);
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  forEachAnyNeighbor(topology, id, (nid) => {
    if (grid.plate[nid] === current) same += 1;
    else different += 1;
  });
  return same <= 2 && different >= 5;
}

function forEachAnyNeighbor(topology, id, visit) {
  if (typeof topology.forEachNeighbor8 === "function") {
    topology.forEachNeighbor8(id, visit);
    return;
  }
  if (typeof topology.forEachNeighbor === "function") topology.forEachNeighbor(id, visit);
}

function metricArea(grid, id) {
  const area = grid?.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
