import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedFieldSummary } from "../src/sim/sphere/stats.js";
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
  ["tectonicAxis", grid.tectonicAxis, 0.016],
  ["mountainAxisSeed", grid.mountainAxisSeed, 0.016],
  ["mountainAxis", grid.mountainAxis, 0.016],
  ["ridgeAxis", grid.ridgeAxis, 0.016],
  ["trenchAxis", grid.trenchAxis, 0.016],
  ["riftAxis", grid.riftAxis, 0.016],
  ["axisCurvature", grid.axisCurvature, 0.01],
  ["axisContinuity", grid.axisContinuity, 0.01],
  ["axisBoundaryDependency", grid.axisBoundaryDependency, 0.01],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, threshold]) => [
  name,
  measureField(grid, field, threshold),
]));
const activeFieldMetrics = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxAxisSeamRatio = Math.max(0, ...activeFieldMetrics.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxAxisSeamDelta = Math.max(0, ...activeFieldMetrics.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);
const segmentMetrics = measureAxisSegments(grid);
const seamLock = measureAxisSeamLock(grid, grid.tectonicAxis, 0.016);

const metrics = {
  topologyKind: grid.topologyKind ?? topology?.topologyKind ?? null,
  graphBacked: Boolean(grid.topologyOptions?.graphBacked || topology?.topologyKind === "cubed-sphere"),
  faceSize,
  steps,
  cellCount: grid.size,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  axisActiveFieldCount: activeFieldMetrics.length,
  nonFiniteFields,
  tectonicAxisCoverage: fieldMetrics.tectonicAxis.coverage,
  mountainAxisSeedCoverage: fieldMetrics.mountainAxisSeed.coverage,
  mountainAxisCoverage: fieldMetrics.mountainAxis.coverage,
  ridgeAxisCoverage: fieldMetrics.ridgeAxis.coverage,
  trenchAxisCoverage: fieldMetrics.trenchAxis.coverage,
  riftAxisCoverage: fieldMetrics.riftAxis.coverage,
  axisCurvatureCoverage: fieldMetrics.axisCurvature.coverage,
  axisContinuityCoverage: fieldMetrics.axisContinuity.coverage,
  axisBoundaryDependencyCoverage: fieldMetrics.axisBoundaryDependency.coverage,
  axisCurvatureMean: fieldMetrics.axisCurvature.weightedMean,
  axisContinuityMean: fieldMetrics.axisContinuity.weightedMean,
  axisBoundaryDependencyMean: fieldMetrics.axisBoundaryDependency.weightedMean,
  maxAxisSeamRatio,
  maxAxisSeamDelta,
  axisSegmentCount: segmentMetrics.axisSegmentCount,
  activeSegmentedAxisShare: segmentMetrics.activeSegmentedAxisShare,
  largestAxisSegmentShare: segmentMetrics.largestAxisSegmentShare,
  crossFaceAxisEdgeShare: segmentMetrics.crossFaceAxisEdgeShare,
  seamAxisShare: seamLock.seamAxisShare,
  interiorAxisShare: seamLock.interiorAxisShare,
  axisSeamConcentrationRatio: seamLock.axisSeamConcentrationRatio,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteAxisFields: metrics.nonFiniteFields.length === 0,
  axisFieldsActive: metrics.axisActiveFieldCount >= 5,
  tectonicAxisPresent: metrics.tectonicAxisCoverage > 0.02,
  axisSubtypePresent:
    metrics.mountainAxisCoverage > 0.003 ||
    metrics.ridgeAxisCoverage > 0.003 ||
    metrics.trenchAxisCoverage > 0.003 ||
    metrics.riftAxisCoverage > 0.003,
  axisDiagnosticsPresent:
    metrics.axisCurvatureCoverage > 0.003 &&
    metrics.axisContinuityCoverage > 0.003 &&
    metrics.axisBoundaryDependencyCoverage > 0.003,
  axisSeamsContinuous: metrics.maxAxisSeamRatio < 1.9,
  axisSeamDeltaBounded: metrics.maxAxisSeamDelta < 0.9,
  axisNotSeamLocked: metrics.axisSeamConcentrationRatio < 2.5,
  axisSegmentsTracked: metrics.axisSegmentCount > 0,
  axisNotSingleGlobalLine: metrics.largestAxisSegmentShare < 0.9,
  crossFaceAxisEdgesAllowed: metrics.crossFaceAxisEdgeShare >= 0,
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

function measureAxisSegments(grid) {
  let activeArea = 0;
  let segmentedArea = 0;
  let largestArea = 0;
  let crossFaceEdges = 0;
  let axisEdges = 0;
  const segmentAreas = new Map();
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.tectonicAxis[id] <= 0.016) continue;
    const area = metricArea(grid, id);
    activeArea += area;
    const segmentId = grid.axisSegmentId?.[id] ?? 0;
    if (segmentId > 0) {
      segmentedArea += area;
      const next = (segmentAreas.get(segmentId) ?? 0) + area;
      segmentAreas.set(segmentId, next);
      largestArea = Math.max(largestArea, next);
    }
    topology.forEachNeighbor(id, (nid) => {
      if (nid < id || grid.tectonicAxis[nid] <= 0.016) return;
      axisEdges += 1;
      if (grid.face?.[id] !== grid.face?.[nid]) crossFaceEdges += 1;
    });
  }
  return {
    axisSegmentCount: segmentAreas.size,
    activeSegmentedAxisShare: segmentedArea / Math.max(activeArea, Number.EPSILON),
    largestAxisSegmentShare: largestArea / Math.max(activeArea, Number.EPSILON),
    crossFaceAxisEdgeShare: crossFaceEdges / Math.max(1, axisEdges),
  };
}

function measureAxisSeamLock(grid, field, threshold) {
  const seamMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    topology.forEachNeighbor(id, (nid) => {
      if (grid.face?.[id] !== grid.face?.[nid]) seamMask[id] = 1;
    });
  }
  const seamAxisShare = weightedCoverage(grid, field, threshold, (id) => seamMask[id] === 1);
  const interiorAxisShare = weightedCoverage(grid, field, threshold, (id) => seamMask[id] !== 1);
  return {
    seamAxisShare,
    interiorAxisShare,
    axisSeamConcentrationRatio: seamAxisShare / Math.max(interiorAxisShare, 0.000001),
  };
}

function weightedCoverage(grid, field, threshold, predicate = null) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate && !predicate(id)) continue;
    const area = metricArea(grid, id);
    total += area;
    if (Number(field[id] ?? 0) > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
