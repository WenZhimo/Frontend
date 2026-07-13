import { measureIsostasyDiagnostics } from "../src/sim/geology/isostasy.js";
import { updateReliefBudgetDiagnostics } from "../src/sim/geology/reliefBudget.js";
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
const isostasy = measureIsostasyDiagnostics(world);
const relief = updateReliefBudgetDiagnostics(world);
const fields = [
  ["isostaticBase", grid.isostaticBase, 0.001],
  ["crustBuoyancy", grid.crustBuoyancy, 0.001],
  ["densitySubsidence", grid.densitySubsidence, 0.001],
  ["lithosphereCooling", grid.lithosphereCooling, 0.001],
  ["isostaticResidual", grid.isostaticResidual, 0.01],
  ["isostaticReliefSupply", grid.isostaticReliefSupply, 0.001],
  ["planetaryRelief", grid.planetaryRelief, 0.001],
  ["reliefDeficit", grid.reliefDeficit, 0.001],
  ["erosionFlatteningPressure", grid.erosionFlatteningPressure, 0.001],
  ["sedimentSmoothingPressure", grid.sedimentSmoothingPressure, 0.001],
  ["seaLevelSensitivity", grid.seaLevelSensitivity, 0.001],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFields = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxIsostasySeamRatio = Math.max(0, ...activeFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxIsostasySeamDelta = Math.max(0, ...activeFields.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  isostaticContinentalMean: isostasy.isostaticContinentalMean,
  isostaticOceanicMean: isostasy.isostaticOceanicMean,
  isostaticTransitionalMean: isostasy.isostaticTransitionalMean,
  continentalOceanReliefGap: isostasy.continentalOceanReliefGap,
  youngOldOceanDepthGap: isostasy.youngOldOceanDepthGap,
  sedimentLoadSubsidenceMean: isostasy.sedimentLoadSubsidenceMean,
  isostaticResidualMean: isostasy.isostaticResidualMean,
  isostaticResidualP95: isostasy.isostaticResidualP95,
  isostasyElevationCorrelation: isostasy.isostasyElevationCorrelation,
  crustThicknessElevationCorrelation: isostasy.crustThicknessElevationCorrelation,
  crustAgeOceanDepthCorrelation: isostasy.crustAgeOceanDepthCorrelation,
  transitionalElevationBand: isostasy.transitionalElevationBand,
  globalElevationStd: relief.globalElevationStd,
  landElevationStd: relief.landElevationStd,
  oceanElevationStd: relief.oceanElevationStd,
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
  youngOceanMeanDepth: oceanDepthMean(grid, world.seaLevel, (id) => grid.crustType[id] === 0 && grid.crustAge[id] < 0.18),
  oldOceanMeanDepth: oceanDepthMean(grid, world.seaLevel, (id) => grid.crustType[id] === 0 && grid.crustAge[id] > 0.72),
  continentalMeanElevation: weightedMean(grid, grid.elev, { predicate: (id) => grid.crustType[id] === 1 }),
  oceanicMeanElevation: weightedMean(grid, grid.elev, { predicate: (id) => grid.crustType[id] === 0 }),
  transitionalMeanElevation: weightedMean(grid, grid.elev, { predicate: (id) => grid.crustType[id] === 2 }),
  isostasyActiveFieldCount: activeFields.length,
  maxIsostasySeamRatio,
  maxIsostasySeamDelta,
  nonFiniteFields,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteIsostasyFields: metrics.nonFiniteFields.length === 0,
  isostasyFieldsActive: metrics.isostasyActiveFieldCount >= 8,
  saneLandSeaRatio: metrics.landRatio > 0.03 && metrics.landRatio < 0.95 && metrics.seaRatio > 0.03,
  continentalFloatsAboveOceanic: metrics.continentalOceanReliefGap > 0.035,
  transitionalBetweenCrustTypes: metrics.isostaticTransitionalMean > metrics.isostaticOceanicMean - 0.03 && metrics.isostaticTransitionalMean < metrics.isostaticContinentalMean + 0.03,
  oldOceanDeeperWhenSampled: !hasOldAndYoungOceanSamples(grid) || metrics.youngOldOceanDepthGap > -0.015,
  residualsBounded: metrics.isostaticResidualMean < 0.16 && metrics.isostaticResidualP95 < 0.42,
  isostasyCoupledToElevation: metrics.isostasyElevationCorrelation > 0.05,
  reliefNotFlat: metrics.globalElevationStd > 0.025 && metrics.hypsometricSpread > 0.12,
  landReliefPresent: metrics.landReliefSpread > 0.02,
  flatWorldNotFlagged: metrics.flatWorldRisk === false,
  reliefBudgetFinite: Number.isFinite(metrics.reliefDeficit) && Number.isFinite(metrics.normalizedReliefDeficit),
  drainagePotentialFinite: Number.isFinite(metrics.drainageGradientPotential),
  isostasySeamsContinuous: metrics.maxIsostasySeamRatio < 1.9,
  isostasySeamDeltaBounded: metrics.maxIsostasySeamDelta < 0.8,
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

function oceanDepthMean(grid, seaLevel, predicate) {
  let total = 0;
  let weight = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (!predicate(id)) continue;
    const area = metricArea(grid, id);
    total += Math.max(0, seaLevel - grid.elev[id]) * area;
    weight += area;
  }
  return weight ? total / weight : 0;
}

function hasOldAndYoungOceanSamples(grid) {
  let young = 0;
  let old = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.crustType[id] !== 0) continue;
    if (grid.crustAge[id] < 0.18) young += metricArea(grid, id);
    if (grid.crustAge[id] > 0.72) old += metricArea(grid, id);
  }
  const total = totalArea(grid);
  return young / Math.max(total, Number.EPSILON) > 0.002 && old / Math.max(total, Number.EPSILON) > 0.002;
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function totalArea(grid) {
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) total += metricArea(grid, id);
  return total;
}
