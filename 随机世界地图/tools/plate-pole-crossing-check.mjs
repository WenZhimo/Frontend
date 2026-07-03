import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { lonLatToEquirectangularPixel } from "../src/sim/sphere/projection.js";
import { lonLatToVec3, rotateAroundAxis, TAU } from "../src/sim/sphere/vector.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "龙骨海-纪元7";
const topology = positional[1] ?? "cubed-sphere";
const faceSize = parseIntOption(options, "face-size", Number(positional[2] ?? 64));
const width = parseIntOption(options, "width", faceSize * 4);
const height = parseIntOption(options, "height", faceSize * 2);

if (topology !== "cubed-sphere") {
  console.error(`Unsupported topology for pole crossing check: ${topology}`);
  process.exit(1);
}

const grid = createCubedSphereGrid(faceSize);
const north = tracePoleCrossing(grid, width, height, Math.PI / 2, 0);
const south = tracePoleCrossing(grid, width, height, -Math.PI / 2, Math.PI / 2);
const valid = north.halfMapReturnValid && south.halfMapReturnValid && north.maxCellStep < Math.PI / faceSize * 3 && south.maxCellStep < Math.PI / faceSize * 3;

console.log(
  JSON.stringify(
    {
      seedText,
      topology,
      faceSize,
      width,
      height,
      valid,
      north,
      south,
    },
    null,
    2,
  ),
);
if (!valid) process.exit(1);

function tracePoleCrossing(grid, width, height, poleLat, startLon) {
  const poleSign = Math.sign(poleLat);
  const axis = lonLatToVec3(startLon + Math.PI / 2, 0);
  const start = lonLatToVec3(startLon, poleSign * (Math.PI / 2 - 0.45));
  const samples = [];
  let maxCellStep = 0;
  let previousCell = null;
  for (let i = 0; i <= 32; i += 1) {
    const t = -0.55 + (1.1 * i) / 32;
    const p = rotateAroundAxis(start, axis, t);
    const lon = Math.atan2(p.z, p.x) < 0 ? Math.atan2(p.z, p.x) + TAU : Math.atan2(p.z, p.x);
    const lat = Math.asin(Math.max(-1, Math.min(1, p.y)));
    const pixel = lonLatToEquirectangularPixel(lon, lat, width, height);
    const cell = grid.nearestCell(p.x, p.y, p.z);
    if (previousCell !== null) maxCellStep = Math.max(maxCellStep, grid.distance(previousCell, cell));
    previousCell = cell;
    samples.push({ lon, lat, x: pixel.x, y: pixel.y, cell });
  }
  const before = samples[0];
  const after = samples[samples.length - 1];
  const dx = circularDelta(before.x, after.x, width);
  return {
    sampleCount: samples.length,
    firstX: before.x,
    lastX: after.x,
    halfMapReturnDx: dx,
    halfMapReturnValid: Math.abs(dx - width / 2) <= Math.max(1, width * 0.02),
    maxCellStep,
    poleLatitude: poleLat,
  };
}

function circularDelta(a, b, width) {
  const raw = Math.abs(a - b);
  return Math.min(raw, width - raw);
}
