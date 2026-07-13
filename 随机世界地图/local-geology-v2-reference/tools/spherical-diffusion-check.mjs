import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { finiteShare, weightedFieldSummary } from "../src/sim/sphere/stats.js";
import { smoothGraphField } from "../src/sim/sphere/topologyGraph.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 64)));
const grid = createCubedSphereGrid(faceSize);
const source = createSyntheticField(grid);
const smoothed = smoothGraphField(grid, source, { iterations: 20, strength: 0.65 });
const sourceSeams = measureSeamContinuity(grid, source);
const smoothSeams = measureSeamContinuity(grid, smoothed);
const sourceRoughness = measureGraphRoughness(grid, source);
const smoothRoughness = measureGraphRoughness(grid, smoothed);
const sourceSummary = weightedFieldSummary(grid, source);
const smoothSummary = weightedFieldSummary(grid, smoothed);
const seamRatioLimit = faceSize <= 16 ? 1.55 : 1.35;

const result = {
  valid: true,
  topologyKind: grid.topologyKind,
  faceSize,
  cellCount: grid.size,
  finiteShare: finiteShare(smoothed),
  sourceRoughness,
  smoothRoughness,
  roughnessRatio: smoothRoughness / Math.max(sourceRoughness, Number.EPSILON),
  sourceSeamDiffToInteriorRatio: sourceSeams.seamDiffToInteriorRatio,
  smoothSeamDiffToInteriorRatio: smoothSeams.seamDiffToInteriorRatio,
  seamRatioLimit,
  sourceMean: sourceSummary.weightedMean,
  smoothMean: smoothSummary.weightedMean,
  meanDrift: Math.abs(smoothSummary.weightedMean - sourceSummary.weightedMean),
  sourceRange: sourceSummary.max - sourceSummary.min,
  smoothRange: smoothSummary.max - smoothSummary.min,
};

if (result.finiteShare !== 1) result.valid = false;
if (!(result.sourceRoughness > 0)) result.valid = false;
if (!(result.roughnessRatio > 0.05 && result.roughnessRatio < 0.85)) result.valid = false;
if (!(result.smoothRange > 0 && result.smoothRange < result.sourceRange)) result.valid = false;
if (!(result.smoothSeamDiffToInteriorRatio < seamRatioLimit)) result.valid = false;
if (!(result.meanDrift < 0.03)) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createSyntheticField(grid) {
  const field = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    const faceBias = (grid.face[id] - 2.5) * 0.04;
    field[id] =
      Math.sin(x * 8.5 + y * 2.1) * 0.34 +
      Math.cos(z * 7.2 - x * 1.7) * 0.26 +
      Math.sin((x + y - z) * 13.0) * 0.12 +
      faceBias;
  }
  return field;
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

function measureSeamContinuity(grid, field) {
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
