import { getGeologicSeaLevelDiagnostics } from "../src/sim/geology/seaLevel.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedFieldSummary, weightedMean } from "../src/sim/sphere/stats.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
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
const topology = topologyForGrid(grid);
const diagnostics = getGeologicSeaLevelDiagnostics(world);
const fields = [
  ["coastalSensitivity", grid.coastalSensitivity, 0.01],
  ["ridgeVolumeSignal", grid.ridgeVolumeSignal, 0.01],
  ["oldOceanCapacitySignal", grid.oldOceanCapacitySignal, 0.01],
  ["sedimentDisplacementSignal", grid.sedimentDisplacementSignal, 0.01],
  ["trenchCapacitySignal", grid.trenchCapacitySignal, 0.01],
  ["isYoungOcean", grid.isYoungOcean, 0.5],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFields = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxSeaLevelSeamRatio = Math.max(0, ...activeFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxSeaLevelSeamDelta = Math.max(0, ...activeFields.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const signalBalance = (
  diagnostics.ridgeVolumeNormalized * 0.34 +
  diagnostics.youngOceanNormalized * 0.28 +
  diagnostics.sedimentDisplacementNormalized * 0.14 -
  diagnostics.oldOceanCapacityNormalized * 0.34 -
  diagnostics.trenchCapacityNormalized * 0.1
);
const expectedTargetDirection = Math.sign(signalBalance);
const actualTargetDirection = Math.sign(diagnostics.targetGeologicSeaLevelOffset);
const expectedStepBound = diagnostics.maxOffsetStep ?? 0.0016;

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  baseSeaLevel: diagnostics.baseSeaLevel,
  seaLevel: diagnostics.seaLevel,
  geologicSeaLevelOffset: diagnostics.geologicSeaLevelOffset,
  targetGeologicSeaLevelOffset: diagnostics.targetGeologicSeaLevelOffset,
  seaLevelChangeRate: diagnostics.seaLevelChangeRate,
  youngOceanShare: diagnostics.youngOceanShare,
  oldOceanShare: diagnostics.oldOceanShare,
  ridgeVolumeSignalMean: diagnostics.ridgeVolumeSignalMean,
  oldOceanCapacitySignalMean: diagnostics.oldOceanCapacitySignalMean,
  sedimentDisplacementSignalMean: diagnostics.sedimentDisplacementSignalMean,
  trenchCapacitySignalMean: diagnostics.trenchCapacitySignalMean,
  ridgeVolumeNormalized: diagnostics.ridgeVolumeNormalized,
  youngOceanNormalized: diagnostics.youngOceanNormalized,
  oldOceanCapacityNormalized: diagnostics.oldOceanCapacityNormalized,
  sedimentDisplacementNormalized: diagnostics.sedimentDisplacementNormalized,
  trenchCapacityNormalized: diagnostics.trenchCapacityNormalized,
  capacityBalance: diagnostics.capacityBalance,
  recomputedCapacityBalance: signalBalance,
  oceanBasinCapacitySignalMean: diagnostics.oceanBasinCapacitySignalMean,
  coastalFlipRisk: diagnostics.coastalFlipRisk,
  coastalSensitivityMean: diagnostics.coastalSensitivityMean,
  seaLevelCouplingStrength: diagnostics.seaLevelCouplingStrength,
  landShareBeforeGeologicOffset: diagnostics.landShareBeforeGeologicOffset,
  landShareAfterGeologicOffset: diagnostics.landShareAfterGeologicOffset,
  geologicSeaLevelLandShareDelta: diagnostics.geologicSeaLevelLandShareDelta,
  maxOffset: diagnostics.maxOffset,
  maxOffsetStep: diagnostics.maxOffsetStep,
  targetDirectionMatchesCapacity: expectedTargetDirection === 0 || actualTargetDirection === 0 || expectedTargetDirection === actualTargetDirection,
  offsetWithinMax: Math.abs(diagnostics.geologicSeaLevelOffset) <= (diagnostics.maxOffset ?? 0.032) + 1e-9,
  changeWithinStep: Math.abs(diagnostics.seaLevelChangeRate) <= expectedStepBound + 1e-9,
  youngOceanSignalCoverage: weightedCoverage(grid, grid.isYoungOcean, 0.5),
  ridgeSignalCoverage: weightedCoverage(grid, grid.ridgeVolumeSignal, 0.01),
  oldOceanCapacityCoverage: weightedCoverage(grid, grid.oldOceanCapacitySignal, 0.01),
  sedimentDisplacementCoverage: weightedCoverage(grid, grid.sedimentDisplacementSignal, 0.01),
  trenchCapacityCoverage: weightedCoverage(grid, grid.trenchCapacitySignal, 0.01),
  coastalSensitivityCoverage: weightedCoverage(grid, grid.coastalSensitivity, 0.01),
  coastalSensitivityNearSeaShare: conditionalShare(grid, (id) => grid.coastalSensitivity[id] > 0.01, (id) => Math.abs(grid.elev[id] - world.seaLevel) < 0.06),
  ridgeSignalOceanicShare: conditionalShare(grid, (id) => grid.ridgeVolumeSignal[id] > 0.01, (id) => grid.crustType[id] === 0),
  oldCapacityOceanicShare: conditionalShare(grid, (id) => grid.oldOceanCapacitySignal[id] > 0.01, (id) => grid.crustType[id] === 0),
  trenchSignalOceanicShare: conditionalShare(grid, (id) => grid.trenchCapacitySignal[id] > 0.01, (id) => grid.crustType[id] === 0),
  ridgeYoungOceanCoupling: weightedMean(grid, grid.ridgeVolumeSignal, { predicate: (id) => grid.isYoungOcean[id] > 0.5 }),
  oldCapacityOldOceanCoupling: weightedMean(grid, grid.oldOceanCapacitySignal, { predicate: (id) => grid.crustType[id] === 0 && grid.crustAge[id] > 0.62 }),
  seaLevelActiveFieldCount: activeFields.length,
  maxSeaLevelSeamRatio,
  maxSeaLevelSeamDelta,
  nonFiniteFields,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteSeaLevelFields: metrics.nonFiniteFields.length === 0,
  seaLevelFieldsActive: metrics.seaLevelActiveFieldCount >= 5,
  couplingEnabled: metrics.seaLevelCouplingStrength > 0,
  capacityBalanceConsistent: Math.abs(metrics.capacityBalance - metrics.recomputedCapacityBalance) < 1e-9,
  targetDirectionMatchesCapacity: metrics.targetDirectionMatchesCapacity,
  offsetBounded: metrics.offsetWithinMax,
  changeRateBounded: metrics.changeWithinStep,
  landShareDeltaBounded: Math.abs(metrics.geologicSeaLevelLandShareDelta) < 0.18,
  coastalSensitivityPresent: metrics.coastalSensitivityCoverage > 0.05,
  coastalSensitivityNearSeaLevel: metrics.coastalSensitivityNearSeaShare > 0.55,
  ridgeSignalOceanic: metrics.ridgeSignalCoverage < 0.001 || metrics.ridgeSignalOceanicShare > 0.9,
  oldCapacityOceanic: metrics.oldOceanCapacityCoverage < 0.001 || metrics.oldCapacityOceanicShare > 0.9,
  trenchSignalOceanic: metrics.trenchCapacityCoverage < 0.001 || metrics.trenchSignalOceanicShare > 0.9,
  youngOceanSignalPresent: metrics.youngOceanSignalCoverage > 0.005,
  oldOceanCapacityPresent: metrics.oldOceanCapacityCoverage > 0.005,
  seaLevelSeamsContinuous: metrics.maxSeaLevelSeamRatio < 1.9,
  seaLevelSeamDeltaBounded: metrics.maxSeaLevelSeamDelta < 0.8,
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
    topology.forEachNeighbor(id, (nid) => {
      if (nid < id) return;
      const a = field[id];
      const b = field[nid];
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      total += Math.abs(a - b);
      edges += 1;
    });
  }
  return total / Math.max(1, edges);
}

function measureFaceSeamContinuity(grid, field) {
  let interiorTotal = 0;
  let interiorCount = 0;
  let seamTotal = 0;
  let seamCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    topology.forEachNeighbor(id, (nid) => {
      if (nid < id) return;
      const a = field[id];
      const b = field[nid];
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      const diff = Math.abs(a - b);
      if (grid.face[id] === grid.face[nid]) {
        interiorTotal += diff;
        interiorCount += 1;
      } else {
        seamTotal += diff;
        seamCount += 1;
      }
    });
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
    const area = metricArea(grid, id);
    total += area;
    if (Number(field[id] ?? 0) > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function conditionalShare(grid, include, match) {
  let total = 0;
  let matched = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (!include(id)) continue;
    const area = metricArea(grid, id);
    total += area;
    if (match(id)) matched += area;
  }
  return total ? matched / total : 0;
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
