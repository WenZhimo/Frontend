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
const fields = [
  ["activeOrogeny", grid.activeOrogeny, 0.016],
  ["oldOrogeny", grid.oldOrogeny, 0.016],
  ["orogeny", grid.orogeny, 0.016],
  ["orogenyAge", grid.orogenyAge, 0.05],
  ["orogenyErosion", grid.orogenyErosion, 0.0002],
  ["mountainBelt", grid.mountainBelt, 0.016],
  ["mountainAxis", grid.mountainAxis, 0.016],
  ["mountainHeight", grid.mountainHeight, 0.002],
  ["orographicBarrier", grid.orographicBarrier, 0.002],
  ["forelandBasin", grid.forelandBasin, 0.016],
  ["orogenicSedimentSupply", grid.orogenicSedimentSupply, 0.0002],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFields = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxOrogenySeamRatio = Math.max(0, ...activeFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxOrogenySeamDelta = Math.max(0, ...activeFields.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  activeOrogenyCoverage: weightedCoverage(grid, grid.activeOrogeny, 0.016),
  oldOrogenyCoverage: weightedCoverage(grid, grid.oldOrogeny, 0.016),
  orogenyCoverage: weightedCoverage(grid, grid.orogeny, 0.016),
  mountainBeltCoverage: weightedCoverage(grid, grid.mountainBelt, 0.016),
  mountainAxisCoverage: weightedCoverage(grid, grid.mountainAxis, 0.016),
  mountainHeightCoverage: weightedCoverage(grid, grid.mountainHeight, 0.002),
  forelandBasinCoverage: weightedCoverage(grid, grid.forelandBasin, 0.016),
  orogenicSedimentSupplyCoverage: weightedCoverage(grid, grid.orogenicSedimentSupply, 0.0002),
  mountainSystemCoverage: weightedCoverage(grid, maxField(grid.activeOrogeny, grid.oldOrogeny, grid.orogeny, grid.mountainBelt, grid.mountainAxis), 0.016),
  activeLifecycleCoverage: weightedCoverage(grid, maxField(grid.activeOrogeny, grid.orogeny), 0.00005),
  oldLifecycleCoverage: weightedCoverage(grid, grid.oldOrogeny, 0.00005),
  oldReliefComparisonCoverage: weightedCoverage(grid, grid.oldOrogeny, 0.016),
  activeOrogenyBoundaryShare: conditionalShare(grid, (id) => grid.activeOrogeny[id] > 0.016, (id) => grid.boundaryInfluence[id] > 0.08 || grid.boundaryDistance[id] <= 2),
  activeLifecycleBoundaryShare: conditionalShare(grid, (id) => Math.max(grid.activeOrogeny[id], grid.orogeny[id]) > 0.00005, (id) => grid.boundaryInfluence[id] > 0.08 || grid.boundaryDistance[id] <= 2),
  mountainBoundaryZeroShare: conditionalShare(grid, (id) => grid.mountainBelt[id] > 0.016, (id) => grid.boundaryDistance[id] === 0),
  oldOrogenyBoundaryShare: conditionalShare(grid, (id) => grid.oldOrogeny[id] > 0.016, (id) => grid.boundaryDistance[id] <= 1),
  oldOrogenyContinentalShare: conditionalShare(grid, (id) => grid.oldOrogeny[id] > 0.016, (id) => grid.crustType[id] !== 0),
  oldOrogenyWidth: widthProxy(grid, grid.oldOrogeny, 0.016),
  activeOrogenyWidth: widthProxy(grid, grid.activeOrogeny, 0.016),
  mountainAxisCurvature: measureAxisCurvature(grid, grid.mountainAxis, 0.016),
  oldOrogenyDiscontinuity: discontinuityShare(grid, grid.oldOrogeny, 0.016),
  newVsOldMountainReliefRatio: newVsOldMountainReliefRatio(grid),
  orogenyAgeMean: weightedMean(grid, grid.orogenyAge, {
    predicate: (id) => grid.oldOrogeny[id] > 0.016 || grid.activeOrogeny[id] > 0.016,
  }),
  orogenyErosionMean: weightedMean(grid, grid.orogenyErosion, {
    predicate: (id) => grid.oldOrogeny[id] > 0.016 || grid.activeOrogeny[id] > 0.016 || grid.mountainBelt[id] > 0.016,
  }),
  orogenicSedimentBudget: weightedMean(grid, grid.orogenicSedimentSupply) / Math.max(0.000001, weightedMean(grid, grid.sediment)),
  maxOrogenySeamRatio,
  maxOrogenySeamDelta,
  activeOrogenyFieldCount: activeFields.length,
  nonFiniteFields,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteOrogenyFields: metrics.nonFiniteFields.length === 0,
  orogenyFieldsActive: metrics.activeOrogenyFieldCount >= 4,
  mountainSystemPresent: metrics.mountainSystemCoverage > 0.02,
  activeLifecycleTracePresent: metrics.activeLifecycleCoverage > 0.0005,
  mountainInterfacePresent: metrics.mountainAxisCoverage > 0.005 && metrics.mountainHeightCoverage > 0.001,
  activeLifecycleNearBoundaries: metrics.activeLifecycleBoundaryShare > 0.35,
  mountainsNotOnlyExactBoundary: metrics.mountainBoundaryZeroShare < 0.85,
  oldOrogenyNotOnlyBoundary: metrics.oldOrogenyCoverage < 0.001 || metrics.oldOrogenyBoundaryShare < 0.85,
  oldOrogenyMostlyContinental: metrics.oldOrogenyCoverage < 0.001 || metrics.oldOrogenyContinentalShare > 0.55,
  oldOrogenyBroaderThanActive: metrics.oldOrogenyCoverage < 0.001 || metrics.oldOrogenyWidth >= metrics.activeOrogenyWidth * 0.65,
  newReliefDominatesOldRelief: metrics.oldReliefComparisonCoverage < 0.0005 || metrics.newVsOldMountainReliefRatio > 1.05,
  mountainAxisCurvedOrSegmented: metrics.mountainAxisCurvature > 0.08 || metrics.oldOrogenyDiscontinuity > 0.18,
  orogenySeamsContinuous: metrics.maxOrogenySeamRatio < 1.85,
  orogenySeamDeltaBounded: metrics.maxOrogenySeamDelta < 0.75,
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

function widthProxy(grid, field, threshold) {
  let total = 0;
  let edge = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (field[id] <= threshold) continue;
    const area = metricArea(grid, id);
    total += area;
    let hasOutside = false;
    topology.forEachNeighbor(id, (nid) => {
      if (field[nid] <= threshold) hasOutside = true;
    });
    if (hasOutside) edge += area;
  }
  return total / Math.max(edge, Number.EPSILON);
}

function discontinuityShare(grid, field, threshold) {
  let active = 0;
  let discontinuous = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (field[id] <= threshold) continue;
    const area = metricArea(grid, id);
    active += area;
    let activeNeighborCount = 0;
    topology.forEachNeighbor(id, (nid) => {
      if (field[nid] > threshold) activeNeighborCount += 1;
    });
    if (activeNeighborCount <= 1) discontinuous += area;
  }
  return active ? discontinuous / active : 0;
}

function measureAxisCurvature(grid, field, threshold) {
  let total = 0;
  let curved = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (field[id] <= threshold) continue;
    let activeNeighbors = 0;
    let strongNeighbors = 0;
    topology.forEachNeighbor(id, (nid) => {
      if (field[nid] > threshold) activeNeighbors += 1;
      if (field[nid] > field[id] * 0.82) strongNeighbors += 1;
    });
    if (activeNeighbors <= 1) continue;
    const area = metricArea(grid, id);
    total += area;
    const branching = activeNeighbors >= 3 ? 0.45 : 0;
    const intensityVariation = Math.max(0, 1 - strongNeighbors / Math.max(1, activeNeighbors));
    curved += (branching + intensityVariation * 0.55) * area;
  }
  return total ? curved / total : 0;
}

function newVsOldMountainReliefRatio(grid) {
  const active = weightedMean(grid, grid.mountainHeight, {
    predicate: (id) => grid.activeOrogeny[id] > 0.016,
  });
  const old = weightedMean(grid, grid.mountainHeight, {
    predicate: (id) => grid.oldOrogeny[id] > 0.016 && grid.activeOrogeny[id] <= 0.006,
  });
  return active / Math.max(0.000001, old);
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
