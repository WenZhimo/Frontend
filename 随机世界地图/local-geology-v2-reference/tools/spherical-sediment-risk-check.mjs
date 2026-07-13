import { getTerrainDerived } from "../src/sim/derived/terrain.js";
import { weightedShare } from "../src/sim/sphere/stats.js";
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
const sedimentMask = maskFor(grid, (id) => grid.sediment[id] > 0.01);
const sedimentAreaShare = weightedShare(grid, sedimentMask);
const classification = classifySedimentRisk(diagnostics);
const explanatoryShares = measureExplanatoryShares(grid, sedimentMask);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  sedimentAreaShare,
  sedimentStraightnessRisk: diagnostics.sedimentStraightnessRisk ?? 0,
  sedimentBoundaryCorrelation: diagnostics.sedimentBoundaryCorrelation ?? 0,
  sedimentGridAlignment: diagnostics.sedimentGridAlignment ?? 0,
  sedimentNaturalSinkShare: diagnostics.sedimentNaturalSinkShare ?? 0,
  sedimentOverfillShare: diagnostics.sedimentOverfillShare ?? 0,
  sedimentSeaFillRisk: diagnostics.sedimentSeaFillRisk ?? 0,
  sedimentPatchiness: diagnostics.sedimentPatchiness ?? 0,
  sedimentRiskClass: classification.riskClass,
  sedimentRiskAction: classification.action,
  modelArtifactRisk:
    classification.riskClass === "model-artifact" || classification.riskClass === "ambiguous-risk",
  likelyMetricFalsePositive: classification.riskClass === "metric-sensitive",
  naturalSinkExplainedShare: explanatoryShares.naturalSinkExplainedShare,
  structuralOnlySedimentShare: explanatoryShares.structuralOnlySedimentShare,
  gridAlignedStructuralSedimentShare: explanatoryShares.gridAlignedStructuralSedimentShare,
  passiveMarginSedimentShare: explanatoryShares.passiveMarginSedimentShare,
  basinSedimentShare: explanatoryShares.basinSedimentShare,
  inlandCandidateSedimentShare: explanatoryShares.inlandCandidateSedimentShare,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  sedimentTargetActive: metrics.sedimentAreaShare > 0.03,
  diagnosticFieldsPresent:
    Number.isFinite(metrics.sedimentStraightnessRisk) &&
    Number.isFinite(metrics.sedimentBoundaryCorrelation) &&
    Number.isFinite(metrics.sedimentGridAlignment) &&
    Number.isFinite(metrics.sedimentNaturalSinkShare),
  explainabilityPresent: metrics.naturalSinkExplainedShare > 0.3 || metrics.sedimentAreaShare < 0.08,
  modelArtifactRiskBounded: !metrics.modelArtifactRisk,
  structuralOnlySedimentBounded:
    metrics.sedimentStraightnessRisk <= 0.2 ||
    metrics.structuralOnlySedimentShare < 0.24,
  gridAlignedStructuralBounded:
    metrics.sedimentStraightnessRisk <= 0.2 ||
    metrics.gridAlignedStructuralSedimentShare < 0.18,
  overfillBounded: metrics.sedimentOverfillShare < 0.025,
  seaFillBounded: metrics.sedimentSeaFillRisk < 0.1,
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
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function classifySedimentRisk(diagnostics) {
  const straightness = diagnostics.sedimentStraightnessRisk ?? 0;
  const boundary = diagnostics.sedimentBoundaryCorrelation ?? 0;
  const gridAlignment = diagnostics.sedimentGridAlignment ?? 0;
  const naturalSink = diagnostics.sedimentNaturalSinkShare ?? 0;
  const structural = boundary > 0.18 || gridAlignment > 0.28;
  const poorlyExplained = naturalSink < 0.28;

  if (straightness <= 0.35) {
    return { riskClass: "bounded", action: "none" };
  }
  if (structural && poorlyExplained) {
    return { riskClass: "model-artifact", action: "inspect-sediment-boundary-coupling" };
  }
  if (structural) {
    return { riskClass: "ambiguous-risk", action: "compare-boundary-and-natural-sink-layers" };
  }
  if (!poorlyExplained) {
    return { riskClass: "metric-sensitive", action: "calibrate-straightness-threshold" };
  }
  return { riskClass: "ambiguous-risk", action: "inspect-sediment-capacity-and-basin-layers" };
}

function measureExplanatoryShares(grid, sedimentMask) {
  return {
    naturalSinkExplainedShare: weightedShare(grid, maskFor(grid, (id) => (
      sedimentMask[id] &&
      naturalSinkScore(grid, id) > 0.18
    )), { predicate: (id) => sedimentMask[id] }),
    structuralOnlySedimentShare: weightedShare(grid, maskFor(grid, (id) => (
      sedimentMask[id] &&
      naturalSinkScore(grid, id) < 0.16 &&
      structuralMemoryScore(grid, id) > 0.42
    )), { predicate: (id) => sedimentMask[id] }),
    gridAlignedStructuralSedimentShare: weightedShare(grid, maskFor(grid, (id) => (
      sedimentMask[id] &&
      naturalSinkScore(grid, id) < 0.18 &&
      structuralMemoryScore(grid, id) > 0.32 &&
      localSedimentEdgeScore(grid, id) > 0.45
    )), { predicate: (id) => sedimentMask[id] }),
    passiveMarginSedimentShare: weightedShare(grid, maskFor(grid, (id) => (
      sedimentMask[id] &&
      ((grid.passiveMargin?.[id] ?? 0) > 0.08 ||
        (grid.continentalShelf?.[id] ?? 0) > 0.08 ||
        (grid.continentalRise?.[id] ?? 0) > 0.08)
    )), { predicate: (id) => sedimentMask[id] }),
    basinSedimentShare: weightedShare(grid, maskFor(grid, (id) => (
      sedimentMask[id] &&
      ((grid.basin?.[id] ?? 0) > 0.08 ||
        (grid.forelandBasin?.[id] ?? 0) > 0.08)
    )), { predicate: (id) => sedimentMask[id] }),
    inlandCandidateSedimentShare: weightedShare(grid, maskFor(grid, (id) => (
      sedimentMask[id] &&
      (grid.inlandWaterCandidate?.[id] ?? 0) > 0
    )), { predicate: (id) => sedimentMask[id] }),
  };
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
  const center = grid.sediment[id];
  let similar = 0;
  let contrast = 0;
  let count = 0;
  const start = grid.neighborStart[id];
  const neighborCount = grid.neighborCount[id];
  for (let k = 0; k < neighborCount; k += 1) {
    const nid = grid.neighbors[start + k];
    const delta = Math.abs(center - grid.sediment[nid]);
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
