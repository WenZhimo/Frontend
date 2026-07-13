import { getTerrainDerived } from "../src/sim/derived/terrain.js";
import { finiteShare, weightedFieldSummary, weightedMean, weightedShare } from "../src/sim/sphere/stats.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "artifact-seed-3";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 55)));

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
const terrain = getTerrainDerived(world);
const diagnostics = terrain.sedimentBudgetDiagnostics ?? world.sedimentBudgetDiagnostics ?? {};
const fields = [
  ["sediment", grid.sediment, 0.01],
  ["sedimentSink", grid.sedimentSink, 0.000001],
  ["sedimentCapacity", grid.sedimentCapacity, 0.01],
  ["sedimentWedge", grid.sedimentWedge, 0.016],
  ["basin", grid.basin, 0.016],
  ["sedimentBudgetError", grid.sedimentBudgetError, 0.000001],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFields = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.002);
const maxSedimentSeamRatio = Math.max(0, ...activeFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxSedimentSeamDelta = Math.max(0, ...activeFields.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);
const suspiciousSedimentArtifact = diagnostics.sedimentStraightnessRisk > 0.35 && (
  diagnostics.sedimentBoundaryCorrelation > 0.18 ||
  diagnostics.sedimentGridAlignment > 0.28 ||
  diagnostics.sedimentNaturalSinkShare < 0.28
);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  sedimentBudgetError: diagnostics.sedimentBudgetError ?? weightedMean(grid, grid.sedimentBudgetError),
  sedimentStraightnessRisk: diagnostics.sedimentStraightnessRisk ?? 0,
  sedimentBoundaryCorrelation: diagnostics.sedimentBoundaryCorrelation ?? 0,
  sedimentGridAlignment: diagnostics.sedimentGridAlignment ?? 0,
  sedimentNaturalSinkShare: diagnostics.sedimentNaturalSinkShare ?? 0,
  sedimentOverfillShare: diagnostics.sedimentOverfillShare ?? 0,
  sedimentSeaFillRisk: diagnostics.sedimentSeaFillRisk ?? 0,
  sedimentPatchiness: diagnostics.sedimentPatchiness ?? 0,
  sedimentShelfConcentration: diagnostics.sedimentShelfConcentration ?? 0,
  sedimentAbyssalConcentration: diagnostics.sedimentAbyssalConcentration ?? 0,
  sedimentSinkCoverage: weightedCoverage(grid, grid.sedimentSink, 0.000001),
  sedimentCapacityCoverage: weightedCoverage(grid, grid.sedimentCapacity, 0.01),
  naturalSinkSedimentShare: weightedShare(grid, maskFor(grid, (id) => (
    grid.sediment[id] > 0.01 &&
    naturalSinkScore(grid, id) > 0.18
  )), { predicate: (id) => grid.sediment[id] > 0.01 }),
  suspiciousBoundarySedimentShare: weightedShare(grid, maskFor(grid, (id) => (
    grid.sediment[id] > 0.01 &&
    naturalSinkScore(grid, id) < 0.16 &&
    structuralMemoryScore(grid, id) > 0.42 &&
    localSedimentEdgeScore(grid, id) > 0.45
  )), { predicate: (id) => grid.sediment[id] > 0.01 }),
  maxSedimentSeamRatio,
  maxSedimentSeamDelta,
  activeSedimentFieldCount: activeFields.length,
  nonFiniteFields,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteSedimentFields: metrics.nonFiniteFields.length === 0,
  sedimentBudgetFinite: Number.isFinite(metrics.sedimentBudgetError) && Math.abs(metrics.sedimentBudgetError) < 0.02,
  sedimentFieldsActive: metrics.activeSedimentFieldCount >= 4,
  sedimentSinkPresent: metrics.sedimentSinkCoverage > 0.0005,
  sedimentCapacityPresent: metrics.sedimentCapacityCoverage > 0.05,
  sedimentStraightnessBounded: metrics.sedimentStraightnessRisk < 0.45,
  sedimentArtifactRiskBounded: !suspiciousSedimentArtifact,
  sedimentOverfillBounded: metrics.sedimentOverfillShare < 0.025,
  sedimentSeaFillBounded: metrics.sedimentSeaFillRisk < 0.1,
  sedimentNaturalSinksPresent: metrics.naturalSinkSedimentShare > 0.35,
  boundarySedimentSuppressed: metrics.suspiciousBoundarySedimentShare < 0.2,
  sedimentSeamsContinuous: metrics.maxSedimentSeamRatio < 1.75,
  sedimentSeamDeltaBounded: metrics.maxSedimentSeamDelta < 0.65,
};

const failures = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

const result = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  steps,
  failures,
  checks,
  metrics,
  fieldMetrics,
};

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
    range: (summary.max ?? 0) - (summary.min ?? 0),
    roughness,
    ...continuity,
  };
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
      const a = field[id];
      const b = field[nid];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      total += Math.abs(a - b);
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
      const a = field[id];
      const b = field[nid];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const diff = Math.abs(a - b);
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
  const seamDiffToInteriorRatio = interiorCount && seamCount ? seamMean / Math.max(interiorMean, Number.EPSILON) : null;
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio,
    seamRatioDelta: seamDiffToInteriorRatio === null ? null : seamDiffToInteriorRatio - 1,
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

function naturalSinkScore(grid, id) {
  return clamp01(
    (grid.passiveMargin?.[id] ?? 0) +
    (grid.continentalShelf?.[id] ?? 0) +
    (grid.continentalRise?.[id] ?? 0) +
    (grid.sedimentWedge?.[id] ?? 0) +
    (grid.forelandBasin?.[id] ?? 0) +
    (grid.inlandWaterCandidate?.[id] ?? 0) +
    (grid.abyssalPlain?.[id] ?? 0) * 0.5 +
    localNeighborMean(grid, grid.basin, id) * 0.28
  );
}

function structuralMemoryScore(grid, id) {
  return clamp01(
    Math.max(0, (grid.boundaryInfluence?.[id] ?? 0) - 0.1) * 2 +
    (grid.inactiveBoundaryRelief?.[id] ?? 0) * 5 +
    (grid.fractureZoneMemory?.[id] ?? 0) * 2 +
    (grid.transformMemory?.[id] ?? 0) * 1.2
  );
}

function localSedimentEdgeScore(grid, id) {
  const field = grid.sediment;
  const center = field[id];
  let similar = 0;
  let contrast = 0;
  let count = 0;
  const start = grid.neighborStart[id];
  const neighborCount = grid.neighborCount[id];
  for (let k = 0; k < neighborCount; k += 1) {
    const nid = grid.neighbors[start + k];
    const delta = Math.abs(center - field[nid]);
    if (delta < 0.004) similar += 1;
    contrast += smoothstep(0.006, 0.02, delta);
    count += 1;
  }
  if (!count) return 0;
  return clamp01((similar / count) * 0.35 + (contrast / count) * 0.65);
}

function localNeighborMean(grid, field, id) {
  if (!field) return 0;
  let total = field[id] * 1.5;
  let weight = 1.5;
  const start = grid.neighborStart[id];
  const count = grid.neighborCount[id];
  for (let k = 0; k < count; k += 1) {
    const nid = grid.neighbors[start + k];
    total += field[nid];
    weight += 1;
  }
  return total / Math.max(weight, Number.EPSILON);
}

function maskFor(grid, predicate) {
  const mask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) if (predicate(id)) mask[id] = 1;
  return mask;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
