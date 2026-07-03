import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import {
  equirectangularPixelToVec3,
  lonLatToEquirectangularPixel,
  mollweidePixelToVec3,
} from "../src/sim/sphere/projection.js";
import { angularDistance3, lonLatToVec3, TAU } from "../src/sim/sphere/vector.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const projection = positional[1] ?? options.projection ?? "equirectangular";
const width = parseIntOption(options, "width", faceSize * 4);
const height = parseIntOption(options, "height", faceSize * 2);

const supportedProjections = new Set(["equirectangular", "mollweide"]);
if (!supportedProjections.has(projection)) {
  console.error(`Unsupported projection check: ${projection}`);
  process.exit(1);
}

const grid = createCubedSphereGrid(faceSize);
const sampling = measureProjectionSampling(grid, width, height, projection);
const seam = measureDateLineSeam(grid, width, height);
const pole = measurePoleCrossing(width, height);
const samplingValid = sampling.sampleCount > 0 && sampling.maxNearestAngularError < Math.PI / faceSize * 1.5;
const equirectangularValid = seam.dateLineContinuityRisk < Math.PI / faceSize * 2 && pole.northPoleHalfMapReturnValid && pole.southPoleHalfMapReturnValid;
const mollweideValid = sampling.blankSampleShare > 0.12 && sampling.blankSampleShare < 0.35;
const valid = samplingValid && (projection === "equirectangular" ? equirectangularValid : mollweideValid);

console.log(
  JSON.stringify(
    {
      projection,
      faceSize,
      width,
      height,
      valid,
      ...sampling,
      ...seam,
      ...pole,
    },
    null,
    2,
  ),
);
if (!valid) process.exit(1);

function measureProjectionSampling(grid, width, height, projection) {
  let maxNearestAngularError = 0;
  let meanNearestAngularError = 0;
  let sampleCount = 0;
  let blankSampleCount = 0;
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 32));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const p = projection === "mollweide"
        ? mollweidePixelToVec3(x, y, width, height)
        : { ...equirectangularPixelToVec3(x, y, width, height), visible: true };
      if (!p.visible) {
        blankSampleCount += 1;
        continue;
      }
      const id = grid.nearestCell(p.x, p.y, p.z);
      const error = angularDistance3(p.x, p.y, p.z, grid.positionX[id], grid.positionY[id], grid.positionZ[id]);
      maxNearestAngularError = Math.max(maxNearestAngularError, error);
      meanNearestAngularError += error;
      sampleCount += 1;
    }
  }
  return {
    sampleCount,
    blankSampleCount,
    blankSampleShare: blankSampleCount / Math.max(1, sampleCount + blankSampleCount),
    maxNearestAngularError,
    meanNearestAngularError: meanNearestAngularError / Math.max(1, sampleCount),
  };
}

function measureDateLineSeam(grid, width, height) {
  let total = 0;
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    const left = equirectangularPixelToVec3(0, y, width, height);
    const right = equirectangularPixelToVec3(width - 1, y, width, height);
    const leftId = grid.nearestCell(left.x, left.y, left.z);
    const rightId = grid.nearestCell(right.x, right.y, right.z);
    const d = grid.distance(leftId, rightId);
    total += d;
    max = Math.max(max, d);
  }
  return {
    dateLineContinuityRisk: total / Math.max(1, height),
    dateLineContinuityMax: max,
  };
}

function measurePoleCrossing(width, height) {
  const northA = lonLatToEquirectangularPixel(0, Math.PI / 2, width, height);
  const northB = lonLatToEquirectangularPixel(Math.PI, Math.PI / 2, width, height);
  const southA = lonLatToEquirectangularPixel(TAU * 0.25, -Math.PI / 2, width, height);
  const southB = lonLatToEquirectangularPixel(TAU * 0.75, -Math.PI / 2, width, height);
  const northDx = circularDelta(northA.x, northB.x, width);
  const southDx = circularDelta(southA.x, southB.x, width);
  const northPole = lonLatToVec3(0, Math.PI / 2);
  const southPole = lonLatToVec3(0, -Math.PI / 2);
  return {
    northPoleHalfMapReturnDx: northDx,
    southPoleHalfMapReturnDx: southDx,
    northPoleHalfMapReturnValid: Math.abs(northDx - width / 2) <= 1,
    southPoleHalfMapReturnValid: Math.abs(southDx - width / 2) <= 1,
    northPoleUnitValid: Math.abs(Math.hypot(northPole.x, northPole.y, northPole.z) - 1) < 1e-12,
    southPoleUnitValid: Math.abs(Math.hypot(southPole.x, southPole.y, southPole.z) - 1) < 1e-12,
  };
}

function circularDelta(a, b, width) {
  const raw = Math.abs(a - b);
  return Math.min(raw, width - raw);
}
