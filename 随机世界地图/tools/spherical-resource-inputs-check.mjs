import { getResourceInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { CrustType } from "../src/sim/geology/crust.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedFieldSummary, weightedMean, weightedShare } from "../src/sim/sphere/stats.js";
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
const terrain = getTerrainDerived(world);
const resources = getResourceInputs(world);
const topology = topologyForGrid(grid);

const expectedFields = [
  "crustType",
  "crustAge",
  "crustThickness",
  "crustBuoyancy",
  "isostaticResidual",
  "orogeny",
  "orogenicBelt",
  "tectonicAxis",
  "activeOrogeny",
  "oldOrogeny",
  "forelandBasin",
  "volcanicArc",
  "riftStage",
  "passiveMargin",
  "sediment",
  "sedimentSink",
  "basin",
  "sedimentaryBasin",
  "metamorphicBelt",
  "igneousProvince",
  "hydrothermalPotential",
  "mineralProvince",
  "activeTransform",
  "transformMemory",
  "fractureZoneMemory",
];

const fieldMetrics = Object.fromEntries(expectedFields.map((name) => [
  name,
  measureResourceField(resources[name]),
]));

const missingFields = expectedFields.filter((name) => !resources[name]);
const wrongSizedFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.length !== grid.size)
  .map(([name]) => name);
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const resourceFields = [
  ["volcanicArc", resources.volcanicArc, 0.016],
  ["passiveMargin", resources.passiveMargin, 0.016],
  ["sedimentaryBasin", resources.sedimentaryBasin, 0.05],
  ["metamorphicBelt", resources.metamorphicBelt, 0.016],
  ["igneousProvince", resources.igneousProvince, 0.016],
  ["hydrothermalPotential", resources.hydrothermalPotential, 0.016],
  ["orogenicBelt", resources.orogenicBelt, 0.016],
  ["tectonicAxis", resources.tectonicAxis, 0.016],
  ["activeTransform", resources.activeTransform, 0.006],
  ["transformMemory", resources.transformMemory, 0.006],
  ["fractureZoneMemory", resources.fractureZoneMemory, 0.02],
];

const activeResourceFields = resourceFields
  .map(([name, field, threshold]) => ({ name, ...measureActiveField(field, threshold) }))
  .filter((metric) => metric.coverage > 0.0005);

const maxResourceSeamRatio = Math.max(0, ...activeResourceFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxResourceSeamDelta = Math.max(0, ...activeResourceFields.map((metric) => metric.seamRatioDelta ?? 0));

const riftStageHistogram = weightedHistogram(grid, resources.riftStage, 6);
const crustTypeHistogram = weightedHistogram(grid, resources.crustType, 3);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  resourceFieldCount: expectedFields.length,
  missingFieldCount: missingFields.length,
  wrongSizedFieldCount: wrongSizedFields.length,
  nonFiniteFieldCount: nonFiniteFields.length,
  landRatio: weightedShare(grid, terrain.landMask),
  seaRatio: weightedShare(grid, terrain.seaMask),
  crustTypeHistogram,
  riftStageHistogram,
  resourceActiveFieldCount: activeResourceFields.length,
  volcanicArcCoverage: weightedCoverage(grid, resources.volcanicArc, 0.016),
  passiveMarginCoverage: weightedCoverage(grid, resources.passiveMargin, 0.016),
  sedimentaryBasinCoverage: weightedCoverage(grid, resources.sedimentaryBasin, 0.05),
  metamorphicBeltCoverage: weightedCoverage(grid, resources.metamorphicBelt, 0.016),
  igneousProvinceCoverage: weightedCoverage(grid, resources.igneousProvince, 0.016),
  hydrothermalPotentialCoverage: weightedCoverage(grid, resources.hydrothermalPotential, 0.016),
  orogenicBeltCoverage: weightedCoverage(grid, resources.orogenicBelt, 0.016),
  tectonicAxisCoverage: weightedCoverage(grid, resources.tectonicAxis, 0.016),
  activeTransformCoverage: weightedCoverage(grid, resources.activeTransform, 0.006),
  transformMemoryCoverage: weightedCoverage(grid, resources.transformMemory, 0.006),
  fractureZoneMemoryCoverage: weightedCoverage(grid, resources.fractureZoneMemory, 0.02),
  volcanicArcIslandArcCoupling: weightedMean(grid, resources.volcanicArc, {
    predicate: (id) => (grid.islandArc?.[id] ?? 0) > 0.016,
  }),
  passiveMarginTerrainCoupling: weightedMean(grid, resources.passiveMargin, {
    predicate: (id) => (terrain.passiveMargin?.[id] ?? 0) > 0.016,
  }),
  sedimentaryBasinSedimentCoupling: weightedMean(grid, resources.sedimentaryBasin, {
    predicate: (id) => (resources.sediment?.[id] ?? 0) > 0.18 || (resources.basin?.[id] ?? 0) > 0.08,
  }),
  metamorphicOrogenyCoupling: weightedMean(grid, resources.metamorphicBelt, {
    predicate: (id) => (grid.orogeny?.[id] ?? 0) > 0.016 || (grid.oldOrogeny?.[id] ?? 0) > 0.016,
  }),
  igneousRidgeArcRiftCoupling: weightedMean(grid, resources.igneousProvince, {
    predicate: (id) => (grid.ridge?.[id] ?? 0) > 0.016 || (grid.islandArc?.[id] ?? 0) > 0.016 || (grid.rift?.[id] ?? 0) > 0.016,
  }),
  hydrothermalBoundaryCoupling: weightedMean(grid, resources.hydrothermalPotential, {
    predicate: (id) => (grid.boundaryInfluence?.[id] ?? 0) > 0.08 || (grid.ridge?.[id] ?? 0) > 0.016 || (grid.islandArc?.[id] ?? 0) > 0.016,
  }),
  oceanicCrustAgeMean: weightedMean(grid, resources.crustAge, {
    predicate: (id) => resources.crustType[id] === CrustType.OCEANIC,
  }),
  continentalCrustThicknessMean: weightedMean(grid, resources.crustThickness, {
    predicate: (id) => resources.crustType[id] === CrustType.CONTINENTAL,
  }),
  oceanicCrustThicknessMean: weightedMean(grid, resources.crustThickness, {
    predicate: (id) => resources.crustType[id] === CrustType.OCEANIC,
  }),
  resourceSeamFieldCount: activeResourceFields.length,
  maxResourceSeamRatio,
  maxResourceSeamDelta,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  allFieldsPresent: metrics.missingFieldCount === 0,
  allFieldsMatchGridSize: metrics.wrongSizedFieldCount === 0,
  allFieldsFinite: metrics.nonFiniteFieldCount === 0,
  saneLandSeaRatio: metrics.landRatio > 0.03 && metrics.landRatio < 0.95 && metrics.seaRatio > 0.03,
  crustTypesDistributed: metrics.crustTypeHistogram[CrustType.OCEANIC] > 0.02 && metrics.crustTypeHistogram[CrustType.CONTINENTAL] > 0.02,
  resourceFieldsActive: metrics.resourceActiveFieldCount >= 8,
  passiveMarginPresent: metrics.passiveMarginCoverage > 0.002,
  sedimentaryBasinPresent: metrics.sedimentaryBasinCoverage > 0.002,
  igneousProvincePresent: metrics.igneousProvinceCoverage > 0.002,
  hydrothermalPotentialPresent: metrics.hydrothermalPotentialCoverage > 0.002,
  transformMemoryPresent: metrics.transformMemoryCoverage > 0.0005,
  volcanicArcCoupledToIslandArc: metrics.volcanicArcCoverage === 0 || metrics.volcanicArcIslandArcCoupling > 0.02,
  passiveMarginCoupledToTerrain: metrics.passiveMarginTerrainCoupling > 0.02,
  sedimentaryBasinCoupledToSediment: metrics.sedimentaryBasinSedimentCoupling > 0.04,
  metamorphicBeltDormantOrPresent: metrics.orogenicBeltCoverage < 0.0005 || metrics.metamorphicBeltCoverage > 0.0005,
  metamorphicBeltCoupledToOrogeny: metrics.orogenicBeltCoverage < 0.0005 || metrics.metamorphicOrogenyCoupling > 0.02,
  igneousProvinceCoupledToTectonics: metrics.igneousRidgeArcRiftCoupling > 0.02,
  hydrothermalCoupledToBoundaries: metrics.hydrothermalBoundaryCoupling > 0.01,
  continentalThickerThanOceanic: metrics.continentalCrustThicknessMean > metrics.oceanicCrustThicknessMean,
  resourceSeamsContinuous: metrics.maxResourceSeamRatio < 1.9,
  resourceSeamDeltaBounded: metrics.maxResourceSeamDelta < 0.8,
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
  missingFields,
  wrongSizedFields,
  nonFiniteFields,
  fieldMetrics,
  activeResourceFields,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureResourceField(field) {
  if (!field) {
    return {
      length: 0,
      finiteShare: 0,
      sampledArea: 0,
      weightedMean: null,
      nonZeroShare: 0,
    };
  }
  const summary = weightedFieldSummary(grid, field);
  return {
    length: field.length,
    finiteShare: finiteShare(field),
    sampledArea: summary.sampledArea,
    weightedMean: summary.weightedMean,
    nonZeroShare: summary.nonZeroShare,
    min: summary.min,
    max: summary.max,
  };
}

function measureActiveField(field, threshold) {
  return {
    coverage: weightedCoverage(grid, field, threshold),
    ...measureFaceSeamContinuity(field),
  };
}

function measureFaceSeamContinuity(field) {
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
    if (Number(field?.[id] ?? 0) > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function weightedHistogram(grid, field, buckets) {
  const counts = Array.from({ length: buckets }, () => 0);
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const bucket = field[id];
    if (bucket < 0 || bucket >= buckets) continue;
    const area = metricArea(grid, id);
    counts[bucket] += area;
    total += area;
  }
  return counts.map((value) => value / Math.max(total, Number.EPSILON));
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
