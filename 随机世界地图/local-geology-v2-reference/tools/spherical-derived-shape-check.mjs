import { getTerrainDerived } from "../src/sim/derived/terrain.js";
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

const terrain = getTerrainDerived(world);
const expectedShape = measureExpectedGraphShape(grid, terrain.relativeElevation);
const slopeDelta = maxAbsDelta(terrain.slope, expectedShape.slope);
const ruggednessDelta = maxAbsDelta(terrain.ruggedness, expectedShape.ruggedness);
const aspectDelta = maxAbsDelta(terrain.aspect, expectedShape.aspect);
const slopeSeams = measureFaceSeamContinuity(grid, terrain.slope);
const ruggednessSeams = measureFaceSeamContinuity(grid, terrain.ruggedness);
const aspectSummary = weightedFieldSummary(grid, terrain.aspect);

const result = {
  valid: true,
  topologyKind: terrain.topologyDiagnostics?.topologyKind ?? grid.topologyKind,
  graphBacked: Boolean(terrain.topologyDiagnostics?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  cellCount: grid.size,
  relativeElevationFiniteShare: finiteShare(terrain.relativeElevation),
  slopeFiniteShare: finiteShare(terrain.slope),
  ruggednessFiniteShare: finiteShare(terrain.ruggedness),
  aspectFiniteShare: finiteShare(terrain.aspect),
  slopeGraphMaxDelta: slopeDelta,
  ruggednessGraphMaxDelta: ruggednessDelta,
  aspectGraphMaxDelta: aspectDelta,
  slopeCoverage: weightedCoverage(grid, terrain.slope, 0.000001),
  ruggednessCoverage: weightedCoverage(grid, terrain.ruggedness, 0.000001),
  slopeSeamDiffToInteriorRatio: slopeSeams.seamDiffToInteriorRatio,
  ruggednessSeamDiffToInteriorRatio: ruggednessSeams.seamDiffToInteriorRatio,
  slopeSeamRiskEdgeShare: slopeSeams.seamRiskEdgeShare,
  ruggednessSeamRiskEdgeShare: ruggednessSeams.seamRiskEdgeShare,
  aspectRange: aspectSummary.max - aspectSummary.min,
};

if (result.topologyKind !== "cubed-sphere") result.valid = false;
if (!result.graphBacked) result.valid = false;
if (result.relativeElevationFiniteShare !== 1) result.valid = false;
if (result.slopeFiniteShare !== 1) result.valid = false;
if (result.ruggednessFiniteShare !== 1) result.valid = false;
if (result.aspectFiniteShare !== 1) result.valid = false;
if (result.slopeGraphMaxDelta > 1e-8) result.valid = false;
if (result.ruggednessGraphMaxDelta > 1e-8) result.valid = false;
if (result.aspectGraphMaxDelta > 1e-8) result.valid = false;
if (result.slopeCoverage <= 0.1) result.valid = false;
if (result.ruggednessCoverage <= 0.1) result.valid = false;
if (result.slopeSeamDiffToInteriorRatio > 1.45) result.valid = false;
if (result.ruggednessSeamDiffToInteriorRatio > 1.45) result.valid = false;
if (result.slopeSeamRiskEdgeShare > 0.08) result.valid = false;
if (result.ruggednessSeamRiskEdgeShare > 0.08) result.valid = false;
if (result.aspectRange > 1e-8) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureExpectedGraphShape(grid, field) {
  const slope = new Float32Array(grid.size);
  const aspect = new Float32Array(grid.size);
  const ruggedness = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const center = field[id];
    let maxDiff = 0;
    let totalDiff = 0;
    let count = 0;
    const start = grid.neighborStart[id];
    const neighborCount = grid.neighborCount[id];
    for (let k = 0; k < neighborCount; k += 1) {
      const edgeIndex = start + k;
      const nid = grid.neighbors[edgeIndex];
      const diff = field[nid] - center;
      const scaled = Math.abs(diff) / Math.max(1, grid.edgeLength?.[edgeIndex] ?? 1);
      if (scaled > maxDiff) maxDiff = scaled;
      totalDiff += Math.abs(diff);
      count += 1;
    }
    slope[id] = maxDiff;
    ruggedness[id] = count ? totalDiff / count : 0;
    aspect[id] = 0;
  }
  return { slope, ruggedness, aspect };
}

function measureFaceSeamContinuity(grid, field) {
  let interiorTotal = 0;
  let interiorCount = 0;
  let seamTotal = 0;
  let seamCount = 0;
  let seamRiskCount = 0;
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
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id || grid.face[id] === grid.face[nid]) continue;
      if (Math.abs(field[id] - field[nid]) > interiorMean * 2.25) seamRiskCount += 1;
    }
  }
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio: seamMean / Math.max(interiorMean, Number.EPSILON),
    seamRiskEdgeShare: seamRiskCount / Math.max(1, seamCount),
  };
}

function maxAbsDelta(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return Infinity;
    const delta = Math.abs(a[i] - b[i]);
    if (delta > max) max = delta;
  }
  return max;
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
