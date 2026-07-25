import { renderSphericalField, projectionSampleToVec3 } from "../src/render/sphericalProjectionRenderer.js";
import { nearestCellByVector } from "../src/sim/sphere/cubedSphere.js";
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
  equirectangular: sampleProjection("equirectangular", width, height),
  mollweide: sampleProjection("mollweide", width, height),
  orthographicFront: sampleProjection("orthographic", width, height, { cameraLon: 0, cameraLat: 0 }),
  orthographicBack: sampleProjection("orthographic", width, height, { cameraLon: Math.PI, cameraLat: 0 }),
  orthographicNorth: sampleProjection("orthographic", width, height, { cameraLon: 0, cameraLat: Math.PI / 2 }),
  orthographicSouth: sampleProjection("orthographic", width, height, { cameraLon: 0, cameraLat: -Math.PI / 2 }),
};

const renderStats = {
  equirectangular: renderProjection("equirectangular", width, height),
  mollweide: renderProjection("mollweide", width, height),
  orthographicFront: renderProjection("orthographic", width, height, { cameraLon: 0, cameraLat: 0 }),
};

const eqCells = projections.equirectangular.visibleCells;
const mollCells = projections.mollweide.visibleCells;
const orthographicUnion = unionMasks(
  projections.orthographicFront.visibleCells,
  projections.orthographicBack.visibleCells,
  projections.orthographicNorth.visibleCells,
  projections.orthographicSouth.visibleCells,
);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  width,
  height,
  cellCount: grid.size,
  equirectangularVisibleShare: maskShare(eqCells),
  mollweideVisibleShare: maskShare(mollCells),
  orthographicFrontVisibleShare: maskShare(projections.orthographicFront.visibleCells),
  orthographicBackVisibleShare: maskShare(projections.orthographicBack.visibleCells),
  orthographicNorthVisibleShare: maskShare(projections.orthographicNorth.visibleCells),
  orthographicSouthVisibleShare: maskShare(projections.orthographicSouth.visibleCells),
  orthographicUnionVisibleShare: maskShare(orthographicUnion),
  mollweideCoverageOfEquirectangular: coverageOf(eqCells, mollCells),
  orthographicUnionCoverageOfEquirectangular: coverageOf(eqCells, orthographicUnion),
  equirectangularCoverageOfOrthographicUnion: coverageOf(orthographicUnion, eqCells),
  equirectangularFaceCoverage: categoryCoverage(grid.face, 6, eqCells),
  mollweideFaceCoverage: categoryCoverage(grid.face, 6, mollCells),
  orthographicUnionFaceCoverage: categoryCoverage(grid.face, 6, orthographicUnion),
  equirectangularElevationMean: fieldMean(eqCells, grid.elev),
  mollweideElevationMean: fieldMean(mollCells, grid.elev),
  orthographicUnionElevationMean: fieldMean(orthographicUnion, grid.elev),
  equirectangularMollweideSharedElevationDelta: sharedMeanDelta(eqCells, mollCells, grid.elev),
  equirectangularOrthographicSharedElevationDelta: sharedMeanDelta(eqCells, orthographicUnion, grid.elev),
  orthographicFrontBackOverlapShare: overlapShare(projections.orthographicFront.visibleCells, projections.orthographicBack.visibleCells),
  orthographicNorthSouthOverlapShare: overlapShare(projections.orthographicNorth.visibleCells, projections.orthographicSouth.visibleCells),
  equirectangularBlankShare: renderStats.equirectangular.blankShare,
  mollweideBlankShare: renderStats.mollweide.blankShare,
  orthographicBlankShare: renderStats.orthographicFront.blankShare,
  equirectangularReuseMax: renderStats.equirectangular.nearestCellMaxReuse,
  mollweideReuseMax: renderStats.mollweide.nearestCellMaxReuse,
  orthographicReuseMax: renderStats.orthographicFront.nearestCellMaxReuse,
  equatorReturnAngularError: angularErrorForProjection("equirectangular", 0.5, 0.5),
  northPoleReturnAngularError: angularErrorForProjection("equirectangular", 0.5, 0.0),
  southPoleReturnAngularError: angularErrorForProjection("equirectangular", 0.5, 1.0),
};
const expectedOrthographicBlankShare = 1 - (Math.PI * Math.min(width, height) * Math.min(width, height) * 0.92 * 0.92 / 4) / (width * height);
const angularErrorLimit = Math.max(0.045, 1.55 / faceSize);

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  equirectangularDenseEnough: metrics.equirectangularVisibleShare > 0.82,
  mollweideDenseEnough: metrics.mollweideVisibleShare > 0.58,
  orthographicViewsDenseEnough:
    metrics.orthographicFrontVisibleShare > 0.3 &&
    metrics.orthographicBackVisibleShare > 0.3 &&
    metrics.orthographicNorthVisibleShare > 0.3 &&
    metrics.orthographicSouthVisibleShare > 0.3,
  orthographicUnionCoversSphere: metrics.orthographicUnionCoverageOfEquirectangular > 0.78,
  mollweideCoversMostEquirectangularCells: metrics.mollweideCoverageOfEquirectangular > 0.62,
  allFacesVisibleInEquirectangular: metrics.equirectangularFaceCoverage.every((share) => share > 0.08),
  allFacesVisibleInMollweide: metrics.mollweideFaceCoverage.every((share) => share > 0.05),
  allFacesVisibleInOrthographicUnion: metrics.orthographicUnionFaceCoverage.every((share) => share > 0.06),
  sharedFieldConsistent:
    metrics.equirectangularMollweideSharedElevationDelta < 0.03 &&
    metrics.equirectangularOrthographicSharedElevationDelta < 0.03,
  orthographicOppositeViewsMostlySeparate:
    metrics.orthographicFrontBackOverlapShare < 0.08 &&
    metrics.orthographicNorthSouthOverlapShare < 0.08,
  blankSharesMatchProjectionShapes:
    metrics.equirectangularBlankShare === 0 &&
    metrics.mollweideBlankShare > 0.12 &&
    metrics.mollweideBlankShare < 0.35 &&
    Math.abs(metrics.orthographicBlankShare - expectedOrthographicBlankShare) < 0.04,
  renderSamplingReusesCells:
    metrics.equirectangularReuseMax > 0 &&
    metrics.mollweideReuseMax > 0 &&
    metrics.orthographicReuseMax > 0,
  projectionInverseErrorsBounded:
    metrics.equatorReturnAngularError < angularErrorLimit &&
    metrics.northPoleReturnAngularError < angularErrorLimit &&
    metrics.southPoleReturnAngularError < angularErrorLimit,
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
  expectedOrthographicBlankShare,
  angularErrorLimit,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function sampleProjection(projectionMode, sampleWidth, sampleHeight, options = {}) {
  const visibleCells = new Uint8Array(grid.size);
  let visiblePixels = 0;
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const sample = projectionSampleToVec3(x, y, sampleWidth, sampleHeight, projectionMode, options);
      if (!sample.visible) continue;
      const cell = nearestCellByVector(grid, sample.x, sample.y, sample.z);
      visibleCells[cell] = 1;
      visiblePixels += 1;
    }
  }
  return { visibleCells, visiblePixels };
}

function renderProjection(projectionMode, renderWidth, renderHeight, options = {}) {
  const rendered = renderSphericalField(grid, grid.elev, {
    width: renderWidth,
    height: renderHeight,
    projectionMode,
    ...options,
  });
  return {
    ...rendered.stats,
    blankShare: rendered.stats.blankPixels / Math.max(1, renderWidth * renderHeight),
  };
}

function unionMasks(...masks) {
  const output = new Uint8Array(grid.size);
  for (const mask of masks) {
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i]) output[i] = 1;
    }
  }
  return output;
}

function maskShare(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) count += 1;
  return count / Math.max(1, mask.length);
}

function coverageOf(base, candidate) {
  let baseCount = 0;
  let covered = 0;
  for (let i = 0; i < base.length; i += 1) {
    if (!base[i]) continue;
    baseCount += 1;
    if (candidate[i]) covered += 1;
  }
  return covered / Math.max(1, baseCount);
}

function overlapShare(a, b) {
  let overlap = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] || b[i]) union += 1;
    if (a[i] && b[i]) overlap += 1;
  }
  return overlap / Math.max(1, union);
}

function categoryCoverage(categories, count, mask) {
  const present = Array.from({ length: count }, () => 0);
  let total = 0;
  for (let i = 0; i < categories.length; i += 1) {
    if (!mask[i]) continue;
    const category = categories[i];
    if (category >= 0 && category < count) {
      present[category] += 1;
      total += 1;
    }
  }
  return present.map((value) => value / Math.max(1, total));
}

function fieldMean(mask, field) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    total += field[i];
    count += 1;
  }
  return total / Math.max(1, count);
}

function sharedMeanDelta(a, b, field) {
  let shared = 0;
  let delta = 0;
  const meanA = fieldMean(a, field);
  const meanB = fieldMean(b, field);
  for (let i = 0; i < a.length; i += 1) {
    if (!a[i] || !b[i]) continue;
    delta += Math.abs((field[i] - meanA) - (field[i] - meanB));
    shared += 1;
  }
  return shared ? delta / shared : Infinity;
}

function angularErrorForProjection(projectionMode, u, v) {
  const x = Math.max(0, Math.min(width - 1, Math.round(u * (width - 1))));
  const y = Math.max(0, Math.min(height - 1, Math.round(v * (height - 1))));
  const sample = projectionSampleToVec3(x, y, width, height, projectionMode);
  if (!sample.visible) return Infinity;
  const cell = nearestCellByVector(grid, sample.x, sample.y, sample.z);
  const dot =
    sample.x * grid.positionX[cell] +
    sample.y * grid.positionY[cell] +
    sample.z * grid.positionZ[cell];
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}
