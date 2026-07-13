import { getBiosphereInputs } from "../src/sim/derived/terrain.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { finiteShare, weightedFieldSummary } from "../src/sim/sphere/stats.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 32)));
const grid = createCubedSphereProductionGridAdapter({ faceSize });
const world = {
  grid,
  params: {
    pipelineMode: "geology-v2",
    intensity: 1,
    waterLevel: 50,
  },
  seaLevel: grid.diagnosticTerrain?.seaLevel ?? 0,
  baseSeaLevel: grid.diagnosticTerrain?.seaLevel ?? 0,
  step: 0,
  ageYears: 0,
  timeScaleFactor: 1,
  stats: {},
};

const biosphere = getBiosphereInputs(world);
const sourceSummary = weightedFieldSummary(grid, grid.elev);
const smoothSummary = weightedFieldSummary(grid, biosphere.biomeBaseElevation);
const sourceRoughness = measureGraphRoughness(grid, grid.elev);
const smoothRoughness = measureGraphRoughness(grid, biosphere.biomeBaseElevation);
const sourceSeams = measureFaceSeamContinuity(grid, grid.elev);
const smoothSeams = measureFaceSeamContinuity(grid, biosphere.biomeBaseElevation);

const result = {
  valid: true,
  topologyKind: grid.topologyKind,
  graphBacked: Boolean(grid.topologyOptions?.graphBacked),
  faceSize,
  cellCount: grid.size,
  finiteShare: finiteShare(biosphere.biomeBaseElevation),
  sourceRoughness,
  smoothRoughness,
  roughnessRatio: smoothRoughness / Math.max(sourceRoughness, Number.EPSILON),
  sourceSeamDiffToInteriorRatio: sourceSeams.seamDiffToInteriorRatio,
  smoothSeamDiffToInteriorRatio: smoothSeams.seamDiffToInteriorRatio,
  seamRatioDelta: smoothSeams.seamDiffToInteriorRatio - sourceSeams.seamDiffToInteriorRatio,
  sourceMean: sourceSummary.weightedMean,
  smoothMean: smoothSummary.weightedMean,
  meanDrift: Math.abs(smoothSummary.weightedMean - sourceSummary.weightedMean),
  sourceRange: sourceSummary.max - sourceSummary.min,
  smoothRange: smoothSummary.max - smoothSummary.min,
};

if (result.topologyKind !== "cubed-sphere") result.valid = false;
if (!result.graphBacked) result.valid = false;
if (result.finiteShare !== 1) result.valid = false;
if (!(result.sourceRoughness > 0)) result.valid = false;
if (!(result.roughnessRatio > 0.05 && result.roughnessRatio < 0.95)) result.valid = false;
if (!(result.smoothRange > 0 && result.smoothRange < result.sourceRange)) result.valid = false;
if (!(result.smoothSeamDiffToInteriorRatio < 1.4)) result.valid = false;
if (!(result.seamRatioDelta < 0.25)) result.valid = false;
if (!(result.meanDrift < 0.03)) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

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
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio: seamMean / Math.max(interiorMean, Number.EPSILON),
  };
}
