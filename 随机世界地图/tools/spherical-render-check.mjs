import { writeFileSync } from "node:fs";
import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { hashSeed } from "../src/sim/prng.js";
import {
  renderSphericalDebugFace,
  renderSphericalField,
} from "../src/render/sphericalProjectionRenderer.js";
import { SphericalBoundaryType } from "../src/sim/sphere/plates.js";
import { createSphericalExperimentalWorld } from "../src/sim/sphere/sphericalWorld.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 64)));
const output = process.argv[3] ?? "_spherical-render-check.ppm";
const projectionMode = process.argv[4] ?? "equirectangular";
const width = Math.max(16, Math.trunc(Number(process.argv[5] ?? 256)));
const height = Math.max(16, Math.trunc(Number(process.argv[6] ?? 128)));
const mode = process.argv[7] ?? "synthetic-elevation";
const seedText = process.argv[8] ?? "龙骨海-纪元7";
const steps = Math.max(0, Math.trunc(Number(process.argv[9] ?? 200)));

const worldModes = new Set([
  "plate-id",
  "boundary-type",
  "active-boundary",
  "stress",
  "sea-mask",
  "external-sea-mask",
  "inland-water-candidate",
  "distance-to-external-sea",
]);
const world = worldModes.has(mode)
  ? createSphericalExperimentalWorld({
      seedText,
      seedUint32: hashSeed(seedText),
      faceSize,
      plateCount: 14,
      intensity: 1,
      steps,
    })
  : null;
const grid = world?.grid ?? createCubedSphereGrid(faceSize);
const rendered = createRenderedLayer({ grid, world, mode, width, height, projectionMode });

writePpm(output, rendered.pixels, width, height);

const result = {
  valid: true,
  output,
  topologyKind: grid.topologyKind,
  faceSize,
  projectionMode,
  width,
  height,
  mode,
  seedText: world ? seedText : undefined,
  steps: world ? steps : undefined,
  ...rendered.stats,
  blankShare: rendered.stats.blankPixels / Math.max(1, width * height),
};

if (rendered.stats.sampledPixels <= 0) result.valid = false;
if (projectionMode === "equirectangular" && rendered.stats.blankPixels !== 0) result.valid = false;
if (projectionMode === "orthographic" && !(result.blankShare > 0.1 && result.blankShare < 0.35)) result.valid = false;
if (projectionMode === "mollweide" && !(result.blankShare > 0.12 && result.blankShare < 0.35)) result.valid = false;
if (rendered.stats.nearestCellMaxReuse <= 0) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createSyntheticField(grid) {
  const field = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    const waves = Math.sin(x * 7.0 + z * 2.5) * 0.28 + Math.cos(y * 8.0 - z * 3.0) * 0.18;
    field[id] = y * 0.35 + waves;
  }
  return field;
}

function createRenderedLayer({ grid, world, mode, width, height, projectionMode }) {
  if (mode === "debug-face") return renderSphericalDebugFace(grid, { width, height, projectionMode });
  if (mode === "synthetic-elevation") {
    return renderSphericalField(grid, createSyntheticField(grid), { width, height, projectionMode });
  }
  if (!world) throw new Error(`Unknown spherical render mode: ${mode}`);
  if (mode === "plate-id") {
    return renderSphericalField(grid, world.plateAssignment.plate, {
      width,
      height,
      projectionMode,
      colorRamp: (value) => paletteColor(value),
    });
  }
  if (mode === "boundary-type") {
    return renderSphericalField(grid, world.boundaries.boundaryType, {
      width,
      height,
      projectionMode,
      colorRamp: colorBoundaryType,
    });
  }
  if (mode === "active-boundary") {
    return renderSphericalField(grid, world.boundaries.activeBoundary, {
      width,
      height,
      projectionMode,
      colorRamp: (value) => (value ? [244, 214, 74] : [24, 28, 32]),
    });
  }
  if (mode === "stress") {
    return renderSphericalField(grid, world.boundaries.stress, {
      width,
      height,
      projectionMode,
      colorRamp: (value) => colorField(value, 0, 0.0065, [20, 26, 32], [238, 85, 58]),
    });
  }
  if (mode === "sea-mask") {
    return renderSphericalField(grid, world.seaMask, {
      width,
      height,
      projectionMode,
      colorRamp: (value) => (value ? [32, 92, 160] : [92, 128, 76]),
    });
  }
  if (mode === "external-sea-mask") {
    return renderSphericalField(grid, world.connectivity.externalSeaMask, {
      width,
      height,
      projectionMode,
      colorRamp: (value) => (value ? [34, 124, 218] : [26, 32, 34]),
    });
  }
  if (mode === "inland-water-candidate") {
    return renderSphericalField(grid, world.connectivity.inlandWaterCandidate, {
      width,
      height,
      projectionMode,
      colorRamp: (value) => (value ? [88, 224, 224] : [28, 32, 34]),
    });
  }
  return renderSphericalField(grid, world.distanceToExternalSea, {
    width,
    height,
    projectionMode,
    colorRamp: (value) => colorField(value, 0, 0.9, [32, 42, 58], [226, 220, 126]),
  });
}

function colorBoundaryType(value) {
  if (value === SphericalBoundaryType.CONVERGENT) return [225, 72, 62];
  if (value === SphericalBoundaryType.DIVERGENT) return [72, 204, 226];
  if (value === SphericalBoundaryType.TRANSFORM) return [236, 206, 75];
  return [26, 30, 34];
}

function colorField(value, min, max, low, high) {
  const t = Math.max(0, Math.min(1, (Number(value) - min) / Math.max(max - min, Number.EPSILON)));
  return [
    Math.round(low[0] + (high[0] - low[0]) * t),
    Math.round(low[1] + (high[1] - low[1]) * t),
    Math.round(low[2] + (high[2] - low[2]) * t),
  ];
}

function paletteColor(value) {
  const palette = [
    [210, 78, 78],
    [78, 144, 215],
    [94, 177, 100],
    [222, 176, 68],
    [151, 96, 205],
    [66, 184, 184],
    [218, 116, 57],
    [196, 90, 150],
  ];
  return palette[Math.abs(Math.trunc(value)) % palette.length];
}

function writePpm(path, pixels, width, height) {
  const bytes = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    bytes[i * 3] = pixels[i * 4];
    bytes[i * 3 + 1] = pixels[i * 4 + 1];
    bytes[i * 3 + 2] = pixels[i * 4 + 2];
  }
  writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), bytes]));
}
