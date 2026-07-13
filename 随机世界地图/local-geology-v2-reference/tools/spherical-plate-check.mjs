import { hashSeed } from "../src/sim/prng.js";
import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import {
  assignNearestSphericalPlates,
  createSphericalPlates,
  driftSphericalPlates,
  measureSphericalPlateDrift,
  sphericalPlateVelocityAt,
} from "../src/sim/sphere/plates.js";
import { angularDistance3 } from "../src/sim/sphere/vector.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 64)));
const plateCount = Math.max(1, Math.trunc(Number(process.argv[4] ?? 14)));
const steps = Math.max(0, Math.trunc(Number(process.argv[5] ?? 200)));

const seedUint32 = hashSeed(seedText);
const grid = createCubedSphereGrid(faceSize);
const plates = createSphericalPlates({ seedUint32, plateCount, intensity: 1 });
const initial = cloneSphericalPlates(plates);
const initialAssignment = assignNearestSphericalPlates(grid, plates);

for (let i = 0; i < steps; i += 1) driftSphericalPlates(plates, 1);

const finalAssignment = assignNearestSphericalPlates(grid, plates);
const centerUnitErrorMax = measureCenterUnitError(plates);
const meanDriftRadians = measureSphericalPlateDrift(initial, plates);
const assignmentChangedShare = measureAssignmentChangedShare(grid, initialAssignment.plate, finalAssignment.plate);
const velocityStats = measureVelocityStats(grid, plates, finalAssignment.plate);
const coverageStats = measurePlateCoverage(grid, finalAssignment.plate, plates.count);
const centerSpacing = measureCenterSpacing(plates);

const result = {
  valid: true,
  seedText,
  topologyKind: grid.topologyKind,
  faceSize,
  plateCount,
  steps,
  centerUnitErrorMax,
  meanDriftRadians,
  meanDriftDegrees: meanDriftRadians * 180 / Math.PI,
  assignmentChangedShare,
  velocityMean: velocityStats.mean,
  velocityMax: velocityStats.max,
  plateCoverageMin: coverageStats.min,
  plateCoverageMax: coverageStats.max,
  plateCoverageMean: coverageStats.mean,
  emptyPlateCount: coverageStats.emptyCount,
  centerSpacingMinRadians: centerSpacing.min,
  centerSpacingMeanRadians: centerSpacing.mean,
  centerSpacingMinDegrees: centerSpacing.min * 180 / Math.PI,
  centerSpacingMeanDegrees: centerSpacing.mean * 180 / Math.PI,
};

if (centerUnitErrorMax > 0.00001) result.valid = false;
if (!(meanDriftRadians > 0)) result.valid = false;
if (!(velocityStats.mean > 0)) result.valid = false;
if (coverageStats.emptyCount > 0) result.valid = false;
if (!(centerSpacing.min > 0.05)) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function cloneSphericalPlates(plates) {
  return {
    kind: plates.kind,
    count: plates.count,
    centerX: new Float32Array(plates.centerX),
    centerY: new Float32Array(plates.centerY),
    centerZ: new Float32Array(plates.centerZ),
    angularVelocityX: new Float32Array(plates.angularVelocityX),
    angularVelocityY: new Float32Array(plates.angularVelocityY),
    angularVelocityZ: new Float32Array(plates.angularVelocityZ),
    speed: new Float32Array(plates.speed),
  };
}

function measureCenterUnitError(plates) {
  let max = 0;
  for (let p = 0; p < plates.count; p += 1) {
    const length = Math.hypot(plates.centerX[p], plates.centerY[p], plates.centerZ[p]);
    max = Math.max(max, Math.abs(length - 1));
  }
  return max;
}

function measureAssignmentChangedShare(grid, before, after) {
  let changed = 0;
  let total = 0;
  for (let i = 0; i < before.length; i += 1) {
    const area = grid.area?.[i] ?? 1;
    total += area;
    if (before[i] !== after[i]) changed += area;
  }
  return changed / Math.max(Number.EPSILON, total);
}

function measureVelocityStats(grid, plates, plate) {
  let total = 0;
  let areaTotal = 0;
  let max = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    const v = sphericalPlateVelocityAt(
      plates,
      plate[id],
      grid.positionX[id],
      grid.positionY[id],
      grid.positionZ[id],
    );
    const speed = Math.hypot(v.x, v.y, v.z);
    total += speed * area;
    areaTotal += area;
    if (speed > max) max = speed;
  }
  return { mean: total / Math.max(Number.EPSILON, areaTotal), max };
}

function measurePlateCoverage(grid, plate, plateCount) {
  const areas = new Float64Array(plateCount);
  let areaTotal = 0;
  for (let i = 0; i < plate.length; i += 1) {
    const area = grid.area?.[i] ?? 1;
    areas[plate[i]] += area;
    areaTotal += area;
  }
  let min = Infinity;
  let max = 0;
  let total = 0;
  let emptyCount = 0;
  for (let p = 0; p < plateCount; p += 1) {
    const share = areas[p] / Math.max(Number.EPSILON, areaTotal);
    min = Math.min(min, share);
    max = Math.max(max, share);
    total += share;
    if (areas[p] <= 0) emptyCount += 1;
  }
  return { min, max, mean: total / Math.max(1, plateCount), emptyCount };
}

function measureCenterSpacing(plates) {
  let min = Infinity;
  let total = 0;
  let count = 0;
  for (let a = 0; a < plates.count; a += 1) {
    for (let b = a + 1; b < plates.count; b += 1) {
      const distance = angularDistance3(
        plates.centerX[a],
        plates.centerY[a],
        plates.centerZ[a],
        plates.centerX[b],
        plates.centerY[b],
        plates.centerZ[b],
      );
      min = Math.min(min, distance);
      total += distance;
      count += 1;
    }
  }
  return { min, mean: total / Math.max(1, count) };
}
