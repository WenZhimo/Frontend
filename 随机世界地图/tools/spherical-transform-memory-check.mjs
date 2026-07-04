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
const threshold = transformDiagnosticThreshold(grid);
const fields = [
  ["activeTransform", grid.activeTransform, threshold],
  ["transformMemory", grid.transformMemory, threshold],
  ["fractureZoneMemory", grid.fractureZoneMemory, 0.02],
  ["inactiveBoundaryRelief", grid.inactiveBoundaryRelief, 0.002],
  ["oldBoundaryCorrelation", grid.oldBoundaryCorrelation, 0.01],
  ["ageBandStraightnessRisk", grid.ageBandStraightnessRisk, 0.02],
];

const fieldMetrics = Object.fromEntries(fields.map(([name, field, fieldThreshold]) => [
  name,
  measureField(grid, field, fieldThreshold),
]));
const activeFields = Object.values(fieldMetrics).filter((metric) => metric.coverage > 0.001);
const maxTransformSeamRatio = Math.max(0, ...activeFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxTransformSeamDelta = Math.max(0, ...activeFields.map((metric) => metric.seamRatioDelta ?? 0));
const nonFiniteFields = Object.entries(fieldMetrics)
  .filter(([, metric]) => metric.finiteShare !== 1)
  .map(([name]) => name);
const ageSplit = measureAgeBandStraightnessSplit(grid);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  activeTransformCoverage: weightedCoverage(grid, grid.activeTransform, threshold),
  transformMemoryCoverage: weightedCoverage(grid, grid.transformMemory, threshold),
  fractureZoneMemoryCoverage: weightedCoverage(grid, grid.fractureZoneMemory, 0.02),
  inactiveBoundaryReliefCoverage: weightedCoverage(grid, grid.inactiveBoundaryRelief, 0.002),
  oldBoundaryCorrelationCoverage: weightedCoverage(grid, grid.oldBoundaryCorrelation, 0.01),
  ageBandStraightnessRiskCoverage: weightedCoverage(grid, grid.ageBandStraightnessRisk, 0.02),
  inactiveTransformReliefMean: weightedMean(grid, grid.inactiveBoundaryRelief, {
    predicate: (id) => grid.crustType[id] === 0 && grid.boundaryInfluence[id] < 0.12 && grid.transformMemory[id] > threshold,
  }),
  fractureZoneElevationContribution: weightedMean(grid, grid.oldBoundaryCorrelation, {
    predicate: (id) => grid.fractureZoneMemory[id] > 0.02,
  }),
  oldBoundaryReliefCorrelation: weightedMean(grid, grid.oldBoundaryCorrelation),
  activeVsInactiveBoundaryReliefRatio: activeVsInactiveBoundaryReliefRatio(grid, threshold),
  oceanicStraightReliefDecay: weightedMean(grid, grid.inactiveBoundaryRelief, {
    predicate: (id) => grid.crustType[id] === 0 && grid.boundaryInfluence[id] < 0.12 && grid.activeTransform[id] <= threshold * 0.2,
  }),
  ageBandStraightnessNearRidge: ageSplit.nearRidge,
  ageBandStraightnessInactive: ageSplit.inactive,
  ageBandStraightnessFractureZone: ageSplit.fractureZone,
  ageBandStraightnessRiskMean: weightedMean(grid, grid.ageBandStraightnessRisk, {
    predicate: (id) => grid.ageBandStraightnessRisk[id] > 0.02,
  }),
  abyssalPlainFractureSuppression: weightedMean(grid, grid.oldBoundaryCorrelation, {
    predicate: (id) => grid.fractureZoneMemory[id] > 0.02 && grid.abyssalPlain[id] > 0.05,
  }),
  inactiveOceanicReliefShare: weightedShareWhere(grid, (id) => (
    grid.crustType[id] === 0 &&
    grid.boundaryInfluence[id] < 0.12 &&
    grid.activeTransform[id] <= threshold * 0.2 &&
    grid.inactiveBoundaryRelief[id] > 0.01
  )),
  suspiciousFractureReliefShare: weightedShareWhere(grid, (id) => (
    grid.crustType[id] === 0 &&
    grid.boundaryInfluence[id] < 0.12 &&
    grid.fractureZoneMemory[id] > 0.05 &&
    grid.inactiveBoundaryRelief[id] > 0.012 &&
    grid.oldBoundaryCorrelation[id] > 0.08
  )),
  activeTransformMean: weightedMean(grid, grid.activeTransform, {
    predicate: (id) => grid.activeTransform[id] > threshold,
  }),
  inactiveBoundaryReliefMean: weightedMean(grid, grid.inactiveBoundaryRelief, {
    predicate: (id) => grid.transformMemory[id] > threshold && grid.activeTransform[id] <= threshold * 0.2,
  }),
  maxTransformSeamRatio,
  maxTransformSeamDelta,
  activeTransformFieldCount: activeFields.length,
  nonFiniteFields,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteTransformFields: metrics.nonFiniteFields.length === 0,
  activeTransformPresent: metrics.activeTransformCoverage > 0.0005,
  transformMemoryPresent: metrics.transformMemoryCoverage > 0.0005,
  activeDominatesInactiveRelief: metrics.activeVsInactiveBoundaryReliefRatio > 1.25,
  inactiveOceanicReliefSuppressed: metrics.inactiveTransformReliefMean < 0.035,
  fractureZoneReliefSuppressed: metrics.fractureZoneElevationContribution < 0.18,
  oldBoundaryCorrelationBounded: metrics.oldBoundaryReliefCorrelation < 0.08,
  oceanicStraightReliefDecayBounded: metrics.oceanicStraightReliefDecay < 0.035,
  suspiciousFractureReliefBounded: metrics.suspiciousFractureReliefShare < 0.025,
  inactiveAgeBandRiskBounded: metrics.ageBandStraightnessRiskCoverage < 0.45,
  transformSeamsContinuous: metrics.maxTransformSeamRatio < 1.9,
  transformSeamDeltaBounded: metrics.maxTransformSeamDelta < 0.75,
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

function measureField(grid, field, thresholdValue) {
  const summary = weightedFieldSummary(grid, field);
  const continuity = measureFaceSeamContinuity(grid, field);
  const roughness = measureGraphRoughness(grid, field);
  return {
    finiteShare: finiteShare(field),
    coverage: weightedCoverage(grid, field, thresholdValue),
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

function measureAgeBandStraightnessSplit(grid) {
  let nearTotal = 0;
  let nearStraight = 0;
  let inactiveTotal = 0;
  let inactiveStraight = 0;
  let fractureTotal = 0;
  let fractureStraight = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.crustType[id] !== 0) continue;
    const band = Math.floor(grid.crustAge[id] * 10);
    let aligned = 0;
    topology.forEachNeighbor(id, (nid) => {
      if (grid.crustType[nid] === 0 && Math.floor(grid.crustAge[nid] * 10) === band) aligned += 1;
    });
    if (aligned <= 0) continue;
    const area = metricArea(grid, id);
    const straight = aligned >= 2 ? area : 0;
    if (grid.ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3) {
      nearTotal += area;
      nearStraight += straight;
    } else if (grid.fractureZoneMemory[id] > 0.02) {
      fractureTotal += area;
      fractureStraight += straight;
    } else if (grid.boundaryInfluence[id] < 0.12) {
      inactiveTotal += area;
      inactiveStraight += straight;
    }
  }
  return {
    nearRidge: nearTotal ? nearStraight / nearTotal : 0,
    inactive: inactiveTotal ? inactiveStraight / inactiveTotal : 0,
    fractureZone: fractureTotal ? fractureStraight / fractureTotal : 0,
  };
}

function activeVsInactiveBoundaryReliefRatio(grid, thresholdValue) {
  const active = weightedMean(grid, grid.activeTransform, {
    predicate: (id) => grid.activeTransform[id] > thresholdValue,
  });
  const inactive = weightedMean(grid, grid.inactiveBoundaryRelief, {
    predicate: (id) => grid.transformMemory[id] > thresholdValue && grid.activeTransform[id] <= thresholdValue * 0.2,
  });
  return Math.abs(active) / Math.max(0.000001, Math.abs(inactive));
}

function weightedCoverage(grid, field, thresholdValue) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    total += area;
    if (Number(field[id] ?? 0) > thresholdValue) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function weightedShareWhere(grid, predicate) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    total += area;
    if (predicate(id)) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function transformDiagnosticThreshold(grid) {
  return grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.graphBacked ? 0.006 : 0.05;
}
