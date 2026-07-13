import { projectionSampleToVec3 } from "../src/render/sphericalProjectionRenderer.js";
import { nearestCellByVector } from "../src/sim/sphere/cubedSphere.js";
import { angularDistance3 } from "../src/sim/sphere/vector.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 20)));
const width = Math.max(32, Math.trunc(Number(process.argv[5] ?? 192)));
const height = Math.max(16, Math.trunc(Number(process.argv[6] ?? 96)));

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
const projections = {
  equirectangular: analyzeProjection("equirectangular", {}),
  mollweide: analyzeProjection("mollweide", {}),
  orthographicFront: analyzeProjection("orthographic", { cameraLon: 0, cameraLat: 0 }),
  orthographicBack: analyzeProjection("orthographic", { cameraLon: Math.PI, cameraLat: 0 }),
  orthographicNorth: analyzeProjection("orthographic", { cameraLon: 0, cameraLat: Math.PI / 2 }),
  orthographicSouth: analyzeProjection("orthographic", { cameraLon: 0, cameraLat: -Math.PI / 2 }),
};

const orthographicUnion = unionReuse(
  projections.orthographicFront.reuse,
  projections.orthographicBack.reuse,
  projections.orthographicNorth.reuse,
  projections.orthographicSouth.reuse,
);
const orthographicUnionStats = summarizeReuse(orthographicUnion);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topologyOptions?.graphBacked || grid.topology?.graphBacked),
  faceSize,
  steps,
  width,
  height,
  cellCount: grid.size,
  equirectangularCoverage: projections.equirectangular.coverage,
  equirectangularZeroSampleShare: projections.equirectangular.zeroSampleShare,
  equirectangularReuseP95: projections.equirectangular.reuseP95,
  equirectangularReuseMax: projections.equirectangular.reuseMax,
  equirectangularReuseImbalance: projections.equirectangular.reuseImbalance,
  equirectangularMeanAngularError: projections.equirectangular.meanAngularError,
  equirectangularMaxAngularError: projections.equirectangular.maxAngularError,
  equirectangularDateLineNeighborShare: projections.equirectangular.dateLineNeighborShare,
  equirectangularDateLineMeanAngularJump: projections.equirectangular.dateLineMeanAngularJump,
  equirectangularPoleRowReuseImbalance: projections.equirectangular.poleRowReuseImbalance,
  mollweideCoverage: projections.mollweide.coverage,
  mollweideZeroSampleShare: projections.mollweide.zeroSampleShare,
  mollweideReuseP95: projections.mollweide.reuseP95,
  mollweideReuseMax: projections.mollweide.reuseMax,
  mollweideReuseImbalance: projections.mollweide.reuseImbalance,
  mollweideMeanAngularError: projections.mollweide.meanAngularError,
  mollweideMaxAngularError: projections.mollweide.maxAngularError,
  orthographicFrontCoverage: projections.orthographicFront.coverage,
  orthographicBackCoverage: projections.orthographicBack.coverage,
  orthographicNorthCoverage: projections.orthographicNorth.coverage,
  orthographicSouthCoverage: projections.orthographicSouth.coverage,
  orthographicUnionCoverage: orthographicUnionStats.coverage,
  orthographicUnionZeroSampleShare: orthographicUnionStats.zeroSampleShare,
  orthographicFrontReuseImbalance: projections.orthographicFront.reuseImbalance,
  orthographicMeanAngularError: projections.orthographicFront.meanAngularError,
  orthographicMaxAngularError: projections.orthographicFront.maxAngularError,
};

const angularErrorLimit = Math.max(0.06, 1.7 / faceSize);
const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  equirectangularSamplesMostCells: metrics.equirectangularCoverage > 0.82,
  equirectangularNotOverSparse: metrics.equirectangularZeroSampleShare < 0.18,
  equirectangularReuseBalanced:
    metrics.equirectangularReuseImbalance < 24 &&
    metrics.equirectangularReuseMax < Math.max(32, metrics.equirectangularReuseP95 * 9),
  equirectangularNearestErrorBounded:
    metrics.equirectangularMeanAngularError < angularErrorLimit * 0.5 &&
    metrics.equirectangularMaxAngularError < angularErrorLimit,
  equirectangularDateLineContinuous:
    metrics.equirectangularDateLineNeighborShare > 0.72 &&
    metrics.equirectangularDateLineMeanAngularJump < angularErrorLimit * 1.2,
  equirectangularPoleReuseBounded: metrics.equirectangularPoleRowReuseImbalance < 48,
  mollweideSamplesEnoughCells: metrics.mollweideCoverage > 0.58,
  mollweideReuseBalanced: metrics.mollweideReuseImbalance < 10.5,
  mollweideNearestErrorBounded:
    metrics.mollweideMeanAngularError < angularErrorLimit * 0.55 &&
    metrics.mollweideMaxAngularError < angularErrorLimit,
  orthographicViewsSampleEnough:
    metrics.orthographicFrontCoverage > 0.3 &&
    metrics.orthographicBackCoverage > 0.3 &&
    metrics.orthographicNorthCoverage > 0.3 &&
    metrics.orthographicSouthCoverage > 0.3,
  orthographicUnionSamplesSphere:
    metrics.orthographicUnionCoverage > 0.78 &&
    metrics.orthographicUnionZeroSampleShare < 0.22,
  orthographicReuseBalanced: metrics.orthographicFrontReuseImbalance < 12,
  orthographicNearestErrorBounded:
    metrics.orthographicMeanAngularError < angularErrorLimit * 0.55 &&
    metrics.orthographicMaxAngularError < angularErrorLimit,
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
  angularErrorLimit,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function analyzeProjection(projectionMode, options) {
  const reuse = new Uint32Array(grid.size);
  let visiblePixels = 0;
  let maxAngularError = 0;
  let meanAngularError = 0;
  const firstColumnCells = [];
  const lastColumnCells = [];
  const firstColumnSamples = [];
  const lastColumnSamples = [];
  const topRowReuse = new Uint32Array(grid.size);
  const bottomRowReuse = new Uint32Array(grid.size);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sample = projectionSampleToVec3(x, y, width, height, projectionMode, options);
      if (!sample.visible) continue;
      const cell = nearestCellByVector(grid, sample.x, sample.y, sample.z);
      reuse[cell] += 1;
      if (y === 0) topRowReuse[cell] += 1;
      if (y === height - 1) bottomRowReuse[cell] += 1;
      if (x === 0) {
        firstColumnCells.push(cell);
        firstColumnSamples.push(sample);
      }
      if (x === width - 1) {
        lastColumnCells.push(cell);
        lastColumnSamples.push(sample);
      }
      const error = angularDistance3(
        sample.x,
        sample.y,
        sample.z,
        grid.positionX[cell],
        grid.positionY[cell],
        grid.positionZ[cell],
      );
      meanAngularError += error;
      maxAngularError = Math.max(maxAngularError, error);
      visiblePixels += 1;
    }
  }

  const stats = summarizeReuse(reuse);
  const dateLine = projectionMode === "equirectangular"
    ? measureDateLine(firstColumnCells, lastColumnCells, firstColumnSamples, lastColumnSamples)
    : { dateLineNeighborShare: 1, dateLineMeanAngularJump: 0 };
  return {
    ...stats,
    reuse,
    visiblePixels,
    meanAngularError: meanAngularError / Math.max(1, visiblePixels),
    maxAngularError,
    poleRowReuseImbalance: Math.max(rowReuseImbalance(topRowReuse), rowReuseImbalance(bottomRowReuse)),
    ...dateLine,
  };
}

function summarizeReuse(reuse) {
  const samples = [];
  let covered = 0;
  let totalSamples = 0;
  let max = 0;
  for (let id = 0; id < reuse.length; id += 1) {
    const count = reuse[id];
    totalSamples += count;
    if (count > 0) {
      covered += 1;
      samples.push(count);
      max = Math.max(max, count);
    }
  }
  samples.sort((a, b) => a - b);
  const mean = totalSamples / Math.max(1, covered);
  const p95 = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] : 0;
  return {
    coverage: covered / Math.max(1, reuse.length),
    zeroSampleShare: 1 - covered / Math.max(1, reuse.length),
    reuseMean: mean,
    reuseP95: p95,
    reuseMax: max,
    reuseImbalance: max / Math.max(1, mean),
  };
}

function unionReuse(...reuseFields) {
  const output = new Uint32Array(grid.size);
  for (const field of reuseFields) {
    for (let id = 0; id < field.length; id += 1) output[id] += field[id];
  }
  return output;
}

function measureDateLine(firstCells, lastCells, firstSamples, lastSamples) {
  const count = Math.min(firstCells.length, lastCells.length, firstSamples.length, lastSamples.length);
  let neighborPairs = 0;
  let angularTotal = 0;
  for (let i = 0; i < count; i += 1) {
    if (areNeighborsOrSame(firstCells[i], lastCells[i])) neighborPairs += 1;
    angularTotal += angularDistance3(
      firstSamples[i].x,
      firstSamples[i].y,
      firstSamples[i].z,
      lastSamples[i].x,
      lastSamples[i].y,
      lastSamples[i].z,
    );
  }
  return {
    dateLineNeighborShare: neighborPairs / Math.max(1, count),
    dateLineMeanAngularJump: angularTotal / Math.max(1, count),
  };
}

function areNeighborsOrSame(a, b) {
  if (a === b) return true;
  const start = grid.neighborStart[a];
  const count = grid.neighborCount[a];
  for (let k = 0; k < count; k += 1) {
    if (grid.neighbors[start + k] === b) return true;
  }
  return false;
}

function rowReuseImbalance(reuse) {
  const stats = summarizeReuse(reuse);
  return stats.reuseImbalance;
}
