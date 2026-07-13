import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { createSphericalPlates, driftSphericalPlates } from "../src/sim/sphere/plates.js";
import { lonLatToEquirectangularPixel } from "../src/sim/sphere/projection.js";
import { angularDistance3, lonLatToVec3, rotateAroundAxis, TAU, vec3ToLonLat } from "../src/sim/sphere/vector.js";
import { hashSeed } from "../src/sim/prng.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? options.seed ?? "龙骨海-纪元7";
const topologyMode = positional[1] ?? options.topology ?? "cubed-sphere";
const faceSize = parseIntOption(options, "face-size", Number(positional[2] ?? 64));
const width = parseIntOption(options, "width", faceSize * 4);
const height = parseIntOption(options, "height", faceSize * 2);

const failures = [];
if (topologyMode !== "cubed-sphere") failures.push("unsupportedTopologyMode");

const grid = createCubedSphereGrid(faceSize);
const northCrossing = measurePoleGreatCircleReturn({
  startLon: 0,
  poleLat: Math.PI / 2,
  width,
  height,
});
const southCrossing = measurePoleGreatCircleReturn({
  startLon: Math.PI / 2,
  poleLat: -Math.PI / 2,
  width,
  height,
});
const gridCrossing = measureGridNearestContinuity(grid, width, height);
const plateDrift = measurePlateDriftIntegrity(seedText);

const checks = {
  northHalfMapReturn: Math.abs(northCrossing.returnDx - width / 2) <= 1,
  southHalfMapReturn: Math.abs(southCrossing.returnDx - width / 2) <= 1,
  northPoleRowsConverge: northCrossing.maxPoleRowDelta <= 1,
  southPoleRowsConverge: southCrossing.maxPoleRowDelta <= 1,
  gridNearestNorthContinuous: gridCrossing.northMaxAngularStep < Math.PI / Math.max(4, faceSize * 0.45),
  gridNearestSouthContinuous: gridCrossing.southMaxAngularStep < Math.PI / Math.max(4, faceSize * 0.45),
  plateCentersRemainUnit: plateDrift.maxUnitError < 1e-6,
  plateDriftNonZero: plateDrift.meanDrift > 0,
  plateDriftNotExplosive: plateDrift.maxDrift < Math.PI / 4,
};

for (const [name, ok] of Object.entries(checks)) {
  if (!ok) failures.push(name);
}

const result = {
  valid: failures.length === 0,
  seedText,
  topologyMode,
  faceSize,
  width,
  height,
  failures,
  checks,
  northCrossing,
  southCrossing,
  gridCrossing,
  plateDrift,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measurePoleGreatCircleReturn({ startLon, poleLat, width, height }) {
  const pole = lonLatToVec3(startLon, poleLat);
  const axis = lonLatToVec3(startLon + Math.PI / 2, 0);
  const beforePole = rotateAroundAxis(pole, axis, 0.015);
  const afterPole = rotateAroundAxis(pole, axis, -0.015);
  const before = vec3ToLonLat(beforePole.x, beforePole.y, beforePole.z);
  const after = vec3ToLonLat(afterPole.x, afterPole.y, afterPole.z);
  const beforePixel = lonLatToEquirectangularPixel(before.lon, before.lat, width, height);
  const afterPixel = lonLatToEquirectangularPixel(after.lon, after.lat, width, height);
  const poleA = lonLatToEquirectangularPixel(startLon, poleLat, width, height);
  const poleB = lonLatToEquirectangularPixel(startLon + Math.PI, poleLat, width, height);
  return {
    beforeLon: before.lon,
    afterLon: after.lon,
    beforeX: beforePixel.x,
    afterX: afterPixel.x,
    returnDx: circularDelta(beforePixel.x, afterPixel.x, width),
    poleAntipodalDx: circularDelta(poleA.x, poleB.x, width),
    maxPoleRowDelta: Math.max(Math.abs(beforePixel.y - poleA.y), Math.abs(afterPixel.y - poleB.y)),
  };
}

function measureGridNearestContinuity(grid, width, height) {
  const north = measureProjectedPoleRing(grid, width, height, Math.PI / 2 - 0.015);
  const south = measureProjectedPoleRing(grid, width, height, -Math.PI / 2 + 0.015);
  return {
    northUniqueCells: north.uniqueCells,
    southUniqueCells: south.uniqueCells,
    northMaxAngularStep: north.maxAngularStep,
    southMaxAngularStep: south.maxAngularStep,
  };
}

function measureProjectedPoleRing(grid, width, height, lat) {
  const ids = [];
  let maxAngularStep = 0;
  const steps = Math.max(16, Math.floor(width / 2));
  for (let s = 0; s <= steps; s += 1) {
    const lon = (s / steps) * TAU;
    const p = lonLatToVec3(lon, lat);
    const id = grid.nearestCell(p.x, p.y, p.z);
    ids.push(id);
    if (ids.length <= 1) continue;
    const prev = ids[ids.length - 2];
    maxAngularStep = Math.max(
      maxAngularStep,
      angularDistance3(
        grid.positionX[prev],
        grid.positionY[prev],
        grid.positionZ[prev],
        grid.positionX[id],
        grid.positionY[id],
        grid.positionZ[id],
      ),
    );
  }
  return {
    uniqueCells: new Set(ids).size,
    maxAngularStep,
  };
}

function measurePlateDriftIntegrity(seedText) {
  const plates = createSphericalPlates({
    seedUint32: hashSeed(seedText),
    plateCount: 14,
    intensity: 1,
  });
  const startX = Float32Array.from(plates.centerX);
  const startY = Float32Array.from(plates.centerY);
  const startZ = Float32Array.from(plates.centerZ);
  driftSphericalPlates(plates, 200);
  let meanDrift = 0;
  let maxDrift = 0;
  let maxUnitError = 0;
  for (let p = 0; p < plates.count; p += 1) {
    const drift = angularDistance3(startX[p], startY[p], startZ[p], plates.centerX[p], plates.centerY[p], plates.centerZ[p]);
    meanDrift += drift;
    maxDrift = Math.max(maxDrift, drift);
    maxUnitError = Math.max(maxUnitError, Math.abs(Math.hypot(plates.centerX[p], plates.centerY[p], plates.centerZ[p]) - 1));
  }
  return {
    meanDrift: meanDrift / Math.max(1, plates.count),
    maxDrift,
    maxUnitError,
  };
}

function circularDelta(a, b, width) {
  const raw = Math.abs(a - b);
  return Math.min(raw, width - raw);
}
