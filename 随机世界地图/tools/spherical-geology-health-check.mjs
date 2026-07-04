import { getHydrologyInputs, getResourceInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { weightedMean, weightedShare } from "../src/sim/sphere/stats.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 64)));
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

const terrain = getTerrainDerived(world);
const hydrology = getHydrologyInputs(world);
const resources = getResourceInputs(world);
const grid = world.grid;

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  gridSize: grid.size,
  landRatio: weightedShare(grid, terrain.landMask),
  seaRatio: weightedShare(grid, terrain.seaMask),
  externalSeaShare: weightedShare(grid, hydrology.externalSeaMask),
  inlandWaterCandidateShare: weightedShare(grid, terrain.inlandWaterCandidate),
  closedBasinCount: maxInt(hydrology.closedBasinId),
  activeBoundaryCoverage: weightedShare(grid, grid.activeBoundary),
  activeTectonicCoverage: weightedCoverage(grid, maxField(grid.mountainBelt, grid.trench, grid.ridge, grid.rift, grid.islandArc), 0.016),
  ridgeCoverage: weightedCoverage(grid, grid.ridge, 0.016),
  trenchCoverage: weightedCoverage(grid, grid.trench, 0.016),
  islandArcCoverage: weightedCoverage(grid, grid.islandArc, 0.016),
  basinCoverage: weightedCoverage(grid, grid.basin, 0.016),
  featureOnBoundaryShare: featureOnBoundaryShare(grid),
  axisBoundaryDependency: weightedMeanWhere(grid, grid.axisBoundaryDependency, (i) => grid.tectonicAxis[i] > axisDiagnosticThreshold(grid)),
  axisCurvatureMean: weightedMeanWhere(grid, grid.axisCurvature, (i) => grid.tectonicAxis[i] > axisDiagnosticThreshold(grid)),
  activeTransformCoverage: weightedCoverage(grid, grid.activeTransform, transformDiagnosticThreshold(grid)),
  transformMemoryCoverage: weightedCoverage(grid, grid.transformMemory, transformDiagnosticThreshold(grid)),
  fractureZoneMemoryCoverage: weightedCoverage(grid, grid.fractureZoneMemory, transformDiagnosticThreshold(grid)),
  activeVsInactiveBoundaryReliefRatio: activeVsInactiveBoundaryReliefRatio(grid),
  oldBoundaryReliefCorrelation: weightedMean(grid, grid.oldBoundaryCorrelation),
  sedimentStraightnessRisk: terrain.sedimentBudgetDiagnostics?.sedimentStraightnessRisk ?? 0,
  sedimentBudgetError: terrain.sedimentBudgetDiagnostics?.sedimentBudgetError ?? weightedMean(grid, terrain.sedimentBudgetError),
  sedimentSinkCoverage: weightedCoverage(grid, terrain.sedimentSink, 0.18),
  riftStageHistogram: weightedHistogram(grid, resources.riftStage, 6),
  naturalRiftStageActiveShare: 0,
  naturalRiftStagePresenceRequired: false,
  hydrologyValid: hydrology.hydrologyDiagnostics?.hydrologyValid === true,
  neighborGraphValid: graphSymmetryValid(grid),
  landSeaComplementError: Math.abs(weightedShare(grid, terrain.landMask) + weightedShare(grid, terrain.seaMask) - 1),
};
metrics.naturalRiftStageActiveShare = 1 - (metrics.riftStageHistogram[0] ?? 1);

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  hydrologyValid: metrics.hydrologyValid,
  neighborGraphValid: metrics.neighborGraphValid,
  landSeaComplement: metrics.landSeaComplementError < 1e-6,
  saneLandRatio: metrics.landRatio > 0.03 && metrics.landRatio < 0.95,
  externalSeaPresent: metrics.externalSeaShare > 0.05,
  activeBoundaryPresent: metrics.activeBoundaryCoverage > 0.01,
  activeFeaturesPresent: metrics.activeTectonicCoverage > 0.005,
  featureBoundaryCouplingPresent: metrics.featureOnBoundaryShare > 0.05,
  axisHasBoundaryDependency: metrics.axisBoundaryDependency > 0.08,
  transformDiagnosticsPresent: metrics.activeTransformCoverage > 0.001 && metrics.transformMemoryCoverage > 0.001,
  inactiveReliefSuppressed: metrics.oldBoundaryReliefCorrelation < 0.08,
  sedimentBudgetFinite: Number.isFinite(metrics.sedimentBudgetError) && Math.abs(metrics.sedimentBudgetError) < 0.02,
  sedimentStraightnessBounded: metrics.sedimentStraightnessRisk < 0.45,
  naturalRiftAbsenceAllowed: metrics.naturalRiftStagePresenceRequired === false || metrics.naturalRiftStageActiveShare > 0.001,
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

function weightedMeanWhere(grid, field, predicate) {
  return weightedMean(grid, field, { predicate });
}

function weightedHistogram(grid, field, buckets) {
  const counts = Array.from({ length: buckets }, () => 0);
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const bucket = field[id];
    if (bucket < 0 || bucket >= buckets) continue;
    const area = grid.area?.[id] ?? 1;
    counts[bucket] += area;
    total += area;
  }
  return counts.map((value) => value / Math.max(total, Number.EPSILON));
}

function maxField(...fields) {
  const length = Math.max(0, ...fields.map((field) => field?.length ?? 0));
  const output = new Float32Array(length);
  for (let id = 0; id < length; id += 1) {
    let max = 0;
    for (const field of fields) max = Math.max(max, field?.[id] ?? 0);
    output[id] = max;
  }
  return output;
}

function featureOnBoundaryShare(grid) {
  let featureArea = 0;
  let boundaryFeatureArea = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const feature = Math.max(grid.mountainBelt[id], grid.trench[id], grid.ridge[id], grid.rift[id], grid.basin[id], grid.islandArc[id]);
    if (feature <= 0.016) continue;
    const area = grid.area?.[id] ?? 1;
    featureArea += area;
    if (grid.boundaryDistance[id] <= 2 || grid.boundaryInfluence[id] > 0.08) boundaryFeatureArea += area;
  }
  return featureArea ? boundaryFeatureArea / featureArea : 0;
}

function activeVsInactiveBoundaryReliefRatio(grid) {
  const threshold = transformDiagnosticThreshold(grid);
  const active = weightedMeanWhere(grid, grid.activeTransform, (i) => grid.activeTransform[i] > threshold);
  const inactive = weightedMeanWhere(grid, grid.inactiveBoundaryRelief, (i) => grid.transformMemory[i] > threshold && grid.activeTransform[i] <= threshold * 0.2);
  return Math.abs(active) / Math.max(0.000001, Math.abs(inactive));
}

function graphSymmetryValid(grid) {
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    let ok = true;
    topology.forEachNeighbor(id, (nid) => {
      if (!hasNeighbor(topology, nid, id)) ok = false;
    });
    if (!ok) return false;
  }
  return true;
}

function hasNeighbor(topology, id, expected) {
  let found = false;
  topology.forEachNeighbor(id, (nid) => {
    if (nid === expected) found = true;
  });
  return found;
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function axisDiagnosticThreshold(grid) {
  return grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.graphBacked ? 0.016 : 0.05;
}

function transformDiagnosticThreshold(grid) {
  return grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.graphBacked ? 0.006 : 0.05;
}
