import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";
import { finiteShare, weightedFieldSummary } from "../src/sim/sphere/stats.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 20)));

const world = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize,
});

runToCheckpoints(world, [steps], () => null);

const grid = world.grid;
const fields = [
  ["mountainBelt", grid.mountainBelt, 0.016],
  ["ridge", grid.ridge, 0.016],
  ["trench", grid.trench, 0.016],
  ["rift", grid.rift, 0.016],
  ["islandArc", grid.islandArc, 0.016],
  ["basin", grid.basin, 0.016],
  ["tectonicAxis", grid.tectonicAxis, 0.016],
  ["mountainAxisSeed", grid.mountainAxisSeed, 0.016],
  ["mountainAxis", grid.mountainAxis, 0.016],
  ["mountainHeight", grid.mountainHeight, 0.002],
  ["orographicBarrier", grid.orographicBarrier, 0.002],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));

const activeFeatureMetrics = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.002);
const maxActiveSeamRatio = Math.max(0, ...activeFeatureMetrics.map((metric) => metric.seamDiffToInteriorRatio));
const maxActiveSeamDelta = Math.max(0, ...activeFeatureMetrics.map((metric) => metric.seamRatioDelta));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const result = {
  valid: true,
  seedText,
  topologyKind: grid.topologyKind,
  graphBacked: Boolean(grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  activeFieldCount: activeFeatureMetrics.length,
  maxActiveSeamRatio,
  maxActiveSeamDelta,
  nonFiniteFields,
  fieldMetrics,
};

if (result.topologyKind !== "cubed-sphere") result.valid = false;
if (!result.graphBacked) result.valid = false;
if (result.activeFieldCount < 4) result.valid = false;
if (result.nonFiniteFields.length > 0) result.valid = false;
if (!(result.maxActiveSeamRatio < 1.65)) result.valid = false;
if (!(result.maxActiveSeamDelta < 0.55)) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureField(grid, field, threshold) {
  const summary = weightedFieldSummary(grid, field);
  const continuity = measureFaceSeamContinuity(grid, field);
  const roughness = measureGraphRoughness(grid, field);
  return {
    finiteShare: finiteShare(field),
    coverage: weightedCoverage(grid, field, threshold),
    weightedMean: summary.weightedMean,
    range: summary.max - summary.min,
    roughness,
    ...continuity,
  };
}

function weightedCoverage(grid, field, threshold) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    total += area;
    if (Number(field[id] ?? 0) > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function measureGraphRoughness(grid, field) {
  let total = 0;
  let edges = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id) continue;
      total += Math.abs(field[id] - field[nid]);
      edges += 1;
    }
  }
  return total / Math.max(1, edges);
}

function measureFaceSeamContinuity(grid, field) {
  let interiorTotal = 0;
  let interiorCount = 0;
  let seamTotal = 0;
  let seamCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id) continue;
      const diff = Math.abs(field[id] - field[nid]);
      if (grid.face[id] === grid.face[nid]) {
        interiorTotal += diff;
        interiorCount += 1;
      } else {
        seamTotal += diff;
        seamCount += 1;
      }
    }
  }
  const interiorMean = interiorTotal / Math.max(1, interiorCount);
  const seamMean = seamTotal / Math.max(1, seamCount);
  const seamDiffToInteriorRatio = seamMean / Math.max(interiorMean, Number.EPSILON);
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio,
    seamRatioDelta: seamDiffToInteriorRatio - 1,
  };
}
