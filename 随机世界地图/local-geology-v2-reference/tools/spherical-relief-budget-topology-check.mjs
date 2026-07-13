import { physicalRadius } from "../src/sim/grid.js";
import { updateReliefBudgetDiagnostics } from "../src/sim/geology/reliefBudget.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedFieldSummary, weightedShare } from "../src/sim/sphere/stats.js";
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
const relief = updateReliefBudgetDiagnostics(world);
const radius = Math.max(1, physicalRadius(grid, 4));

const expectedLocalRelief = measureExpectedGraphLocalRelief(grid, radius);
const expectedSeaSensitivity = measureExpectedSeaSensitivity(grid, world.seaLevel);
const plainMasks = measurePlainMaskTopology(grid);
const seaSensitivityDelta = maxAbsDelta(grid.seaLevelSensitivity, expectedSeaSensitivity);
const localReliefSeams = measureFaceSeamContinuity(grid, expectedLocalRelief);

const fields = [
  ["tectonicReliefSupply", grid.tectonicReliefSupply, 0.001],
  ["isostaticReliefSupply", grid.isostaticReliefSupply, 0.001],
  ["erosionFlatteningPressure", grid.erosionFlatteningPressure, 0.001],
  ["sedimentSmoothingPressure", grid.sedimentSmoothingPressure, 0.001],
  ["planetaryRelief", grid.planetaryRelief, 0.001],
  ["reliefDeficit", grid.reliefDeficit, 0.001],
  ["seaLevelSensitivity", grid.seaLevelSensitivity, 0.001],
  ["flatLandMask", grid.flatLandMask, 0.5],
  ["largePlainMask", grid.largePlainMask, 0.5],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFieldMetrics = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxReliefBudgetSeamRatio = Math.max(0, ...activeFieldMetrics.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxReliefBudgetSeamDelta = Math.max(0, ...activeFieldMetrics.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const metrics = {
  topologyKind: grid.topologyKind ?? topology?.topologyKind ?? null,
  graphBacked: Boolean(grid.topologyOptions?.graphBacked || topology?.topologyKind === "cubed-sphere"),
  faceSize,
  steps,
  cellCount: grid.size,
  reliefBudgetRadius: radius,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  globalElevationStd: relief.globalElevationStd,
  hypsometricSpread: relief.hypsometricSpread,
  landReliefSpread: relief.landReliefSpread,
  oceanReliefSpread: relief.oceanReliefSpread,
  flatLandShare: relief.flatLandShare,
  largePlainShare: relief.largePlainShare,
  seaLevelSensitivity: relief.seaLevelSensitivity,
  coastInstabilityRisk: relief.coastInstabilityRisk,
  reliefDeficit: relief.reliefDeficit,
  normalizedReliefDeficit: relief.normalizedReliefDeficit,
  tectonicReliefSupplyMean: relief.tectonicReliefSupplyMean,
  isostaticReliefSupplyMean: relief.isostaticReliefSupplyMean,
  erosionFlatteningPressureMean: relief.erosionFlatteningPressureMean,
  sedimentSmoothingPressureMean: relief.sedimentSmoothingPressureMean,
  drainageGradientPotential: relief.drainageGradientPotential,
  orographicReliefPotential: relief.orographicReliefPotential,
  flatWorldRisk: relief.flatWorldRisk,
  reliefBudgetActiveFieldCount: activeFieldMetrics.length,
  maxReliefBudgetSeamRatio,
  maxReliefBudgetSeamDelta,
  nonFiniteFields,
  localReliefFiniteShare: finiteShare(expectedLocalRelief),
  localReliefCoverage: weightedCoverage(grid, expectedLocalRelief, 0.001),
  localReliefSeamDiffToInteriorRatio: localReliefSeams.seamDiffToInteriorRatio,
  localReliefSeamRatioDelta: localReliefSeams.seamRatioDelta,
  seaLevelSensitivityGraphMaxDelta: seaSensitivityDelta,
  flatLandSeamConcentrationRatio: plainMasks.flatLandSeamConcentrationRatio,
  largePlainSeamConcentrationRatio: plainMasks.largePlainSeamConcentrationRatio,
  flatLandSeamShare: plainMasks.flatLandSeamShare,
  flatLandInteriorShare: plainMasks.flatLandInteriorShare,
  largePlainSeamShare: plainMasks.largePlainSeamShare,
  largePlainInteriorShare: plainMasks.largePlainInteriorShare,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteReliefBudgetFields: metrics.nonFiniteFields.length === 0,
  reliefBudgetFieldsActive: metrics.reliefBudgetActiveFieldCount >= 7,
  saneLandSeaRatio: metrics.landRatio > 0.03 && metrics.landRatio < 0.95 && metrics.seaRatio > 0.03,
  reliefNotFlat: metrics.globalElevationStd > 0.025 && metrics.hypsometricSpread > 0.12,
  flatWorldNotFlagged: metrics.flatWorldRisk === false,
  reliefBudgetFinite: Number.isFinite(metrics.reliefDeficit) && Number.isFinite(metrics.normalizedReliefDeficit),
  drainagePotentialFinite: Number.isFinite(metrics.drainageGradientPotential),
  localReliefFinite: metrics.localReliefFiniteShare === 1,
  localReliefActive: metrics.localReliefCoverage > 0.2,
  seaLevelSensitivityMatchesFormula: metrics.seaLevelSensitivityGraphMaxDelta < 1e-6,
  reliefBudgetSeamsContinuous: metrics.maxReliefBudgetSeamRatio < 2.15,
  reliefBudgetSeamDeltaBounded: metrics.maxReliefBudgetSeamDelta < 1.15,
  localReliefSeamsContinuous:
    metrics.localReliefSeamDiffToInteriorRatio === null ||
    metrics.localReliefSeamDiffToInteriorRatio < 1.9,
  flatLandNotSeamLocked: metrics.flatLandShare < 0.005 || metrics.flatLandSeamConcentrationRatio < 2.25,
  largePlainNotSeamLocked: metrics.largePlainShare < 0.005 || metrics.largePlainSeamConcentrationRatio < 2.5,
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

function measureExpectedGraphLocalRelief(grid, radius) {
  const field = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    let min = grid.elev[id];
    let max = grid.elev[id];
    topology.forEachNeighborRing(id, radius, (nid) => {
      const h = grid.elev[nid];
      if (h < min) min = h;
      if (h > max) max = h;
    });
    field[id] = max - min;
  }
  return field;
}

function measureExpectedSeaSensitivity(grid, seaLevel) {
  const field = new Float32Array(grid.size);
  const seaLevelBand = 0.018;
  for (let id = 0; id < grid.size; id += 1) {
    const relative = Math.abs(grid.elev[id] - seaLevel);
    field[id] = relative < seaLevelBand ? 1 - relative / seaLevelBand : 0;
  }
  return field;
}

function measurePlainMaskTopology(grid) {
  const seamMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    topology.forEachNeighbor(id, (nid) => {
      if (grid.face?.[id] !== grid.face?.[nid]) seamMask[id] = 1;
    });
  }
  const interiorMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) interiorMask[id] = seamMask[id] ? 0 : 1;
  const flatLandSeamShare = weightedShare(grid, grid.flatLandMask, { predicate: (id) => seamMask[id] === 1 });
  const flatLandInteriorShare = weightedShare(grid, grid.flatLandMask, { predicate: (id) => interiorMask[id] === 1 });
  const largePlainSeamShare = weightedShare(grid, grid.largePlainMask, { predicate: (id) => seamMask[id] === 1 });
  const largePlainInteriorShare = weightedShare(grid, grid.largePlainMask, { predicate: (id) => interiorMask[id] === 1 });
  return {
    flatLandSeamShare,
    flatLandInteriorShare,
    largePlainSeamShare,
    largePlainInteriorShare,
    flatLandSeamConcentrationRatio: flatLandSeamShare / Math.max(flatLandInteriorShare, 0.000001),
    largePlainSeamConcentrationRatio: largePlainSeamShare / Math.max(largePlainInteriorShare, 0.000001),
  };
}

function measureField(grid, field, threshold) {
  const summary = weightedFieldSummary(grid, field);
  const continuity = measureFaceSeamContinuity(grid, field);
  return {
    finiteShare: finiteShare(field),
    coverage: weightedCoverage(grid, field, threshold),
    weightedMean: summary.weightedMean,
    range: (summary.max ?? 0) - (summary.min ?? 0),
    ...continuity,
  };
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
      if (grid.face?.[id] === grid.face?.[nid]) {
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
  const seamDiffToInteriorRatio = interiorCount && seamCount
    ? seamMean / Math.max(interiorMean, Number.EPSILON)
    : null;
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

function maxAbsDelta(a, b) {
  let max = 0;
  for (let id = 0; id < a.length; id += 1) {
    const av = a[id];
    const bv = b[id];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return Infinity;
    const delta = Math.abs(av - bv);
    if (delta > max) max = delta;
  }
  return max;
}
