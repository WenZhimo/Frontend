import { getTerrainDerived } from "../src/sim/derived/terrain.js";
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
const topology = topologyForGrid(grid);
const fields = [
  ["passiveMargin", terrain.passiveMargin, 0.05],
  ["continentalShelf", terrain.continentalShelf, 0.05],
  ["continentalSlope", terrain.continentalSlope, 0.05],
  ["continentalRise", terrain.continentalRise, 0.05],
  ["sedimentWedge", terrain.sedimentWedge, 0.05],
  ["abyssalPlain", terrain.abyssalPlain, 0.05],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFields = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxMarginSeamRatio = Math.max(0, ...activeFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxMarginSeamDelta = Math.max(0, ...activeFields.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  seaRatio: weightedShare(grid, terrain.seaMask),
  externalSeaShare: weightedShare(grid, terrain.externalSeaMask),
  inlandWaterCandidateShare: weightedShare(grid, terrain.inlandWaterCandidate),
  passiveMarginCoverage: weightedCoverage(grid, terrain.passiveMargin, 0.05),
  continentalShelfCoverage: weightedCoverage(grid, terrain.continentalShelf, 0.05),
  continentalSlopeCoverage: weightedCoverage(grid, terrain.continentalSlope, 0.05),
  continentalRiseCoverage: weightedCoverage(grid, terrain.continentalRise, 0.05),
  sedimentWedgeCoverage: weightedCoverage(grid, terrain.sedimentWedge, 0.05),
  abyssalPlainCoverage: weightedCoverage(grid, terrain.abyssalPlain, 0.05),
  passiveMarginBoundaryShare: conditionalShare(grid, terrain.passiveMargin, (id) => terrain.passiveMargin[id] > 0.05, (id) => grid.boundaryInfluence[id] > 0.25),
  activeBoundaryMisclassifiedAsPassiveMarginShare: conditionalShare(grid, terrain.passiveMargin, (id) => terrain.passiveMargin[id] > 0.05, (id) => (
    grid.boundaryInfluence[id] > 0.35 ||
    grid.ridge[id] > 0.2 ||
    grid.trench[id] > 0.2
  )),
  closedBasinMisclassifiedAsMarginShare: conditionalShare(grid, terrain.inlandWaterCandidate, (id) => terrain.inlandWaterCandidate[id], (id) => terrain.passiveMargin[id] > 0.05),
  shelfExternalSeaShare: conditionalShare(grid, terrain.continentalShelf, (id) => terrain.continentalShelf[id] > 0.05, (id) => terrain.externalSeaMask[id]),
  slopeExternalSeaShare: conditionalShare(grid, terrain.continentalSlope, (id) => terrain.continentalSlope[id] > 0.05, (id) => terrain.externalSeaMask[id]),
  riseExternalSeaShare: conditionalShare(grid, terrain.continentalRise, (id) => terrain.continentalRise[id] > 0.05, (id) => terrain.externalSeaMask[id]),
  abyssalExternalSeaShare: conditionalShare(grid, terrain.abyssalPlain, (id) => terrain.abyssalPlain[id] > 0.05, (id) => terrain.externalSeaMask[id]),
  shelfNearCoastShare: conditionalShare(grid, terrain.continentalShelf, (id) => terrain.continentalShelf[id] > 0.05, (id) => terrain.coastDistance[id] <= Math.max(3, physicalRadius(grid, 9))),
  slopeBandShare: conditionalShare(grid, terrain.continentalSlope, (id) => terrain.continentalSlope[id] > 0.05, (id) => terrain.coastDistance[id] > Math.max(2, physicalRadius(grid, 4))),
  abyssalPlainFlatness: weightedMean(grid, terrain.ruggedness, { predicate: (id) => terrain.abyssalPlain[id] > 0.05 }),
  maxMarginSeamRatio,
  maxMarginSeamDelta,
  activeMarginFieldCount: activeFields.length,
  nonFiniteFields,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteMarginFields: metrics.nonFiniteFields.length === 0,
  externalSeaPresent: metrics.externalSeaShare > 0.05,
  passiveMarginPresent: metrics.passiveMarginCoverage > 0.0005,
  marginFieldsActive: metrics.activeMarginFieldCount >= 2,
  passiveMarginsNotDominant: metrics.passiveMarginCoverage < 0.35,
  passiveBoundaryShareBounded: metrics.passiveMarginBoundaryShare < 0.75,
  activeBoundaryExcluded: metrics.activeBoundaryMisclassifiedAsPassiveMarginShare < 0.12,
  closedBasinsExcluded: metrics.closedBasinMisclassifiedAsMarginShare < 0.05,
  shelfInExternalSeaWhenPresent: metrics.continentalShelfCoverage < 0.001 || metrics.shelfExternalSeaShare > 0.9,
  slopeInExternalSeaWhenPresent: metrics.continentalSlopeCoverage < 0.001 || metrics.slopeExternalSeaShare > 0.9,
  riseInExternalSeaWhenPresent: metrics.continentalRiseCoverage < 0.001 || metrics.riseExternalSeaShare > 0.9,
  abyssalInExternalSeaWhenPresent: metrics.abyssalPlainCoverage < 0.001 || metrics.abyssalExternalSeaShare > 0.9,
  shelfNearCoastWhenPresent: metrics.continentalShelfCoverage < 0.001 || metrics.shelfNearCoastShare > 0.55,
  slopeOffshoreWhenPresent: metrics.continentalSlopeCoverage < 0.001 || metrics.slopeBandShare > 0.45,
  abyssalPlainFlatEnough: metrics.abyssalPlainCoverage < 0.001 || metrics.abyssalPlainFlatness < 0.08,
  marginSeamsContinuous: metrics.maxMarginSeamRatio < 1.75,
  marginSeamDeltaBounded: metrics.maxMarginSeamDelta < 0.65,
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

function conditionalShare(grid, field, include, match) {
  let total = 0;
  let matched = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (!include(id, field)) continue;
    const area = metricArea(grid, id);
    total += area;
    if (match(id, field)) matched += area;
  }
  return total ? matched / total : 0;
}

function physicalRadius(grid, cylindricalCells) {
  const scale = grid.resolutionScale ?? Math.sqrt(grid.size / Math.max(1, 512 * 256));
  return Math.max(1, cylindricalCells * scale);
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
