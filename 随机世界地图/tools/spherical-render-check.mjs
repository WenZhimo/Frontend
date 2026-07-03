import { writeFileSync } from "node:fs";
import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import {
  renderSphericalDebugFace,
  renderSphericalField,
} from "../src/render/sphericalProjectionRenderer.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 64)));
const output = process.argv[3] ?? "_spherical-render-check.ppm";
const projectionMode = process.argv[4] ?? "equirectangular";
const width = Math.max(16, Math.trunc(Number(process.argv[5] ?? 256)));
const height = Math.max(16, Math.trunc(Number(process.argv[6] ?? 128)));
const mode = process.argv[7] ?? "synthetic-elevation";

const grid = createCubedSphereGrid(faceSize);
const field = createSyntheticField(grid);
const rendered = mode === "debug-face"
  ? renderSphericalDebugFace(grid, { width, height, projectionMode })
  : renderSphericalField(grid, field, { width, height, projectionMode });

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
  ...rendered.stats,
  blankShare: rendered.stats.blankPixels / Math.max(1, width * height),
};

if (rendered.stats.sampledPixels <= 0) result.valid = false;
if (projectionMode === "equirectangular" && rendered.stats.blankPixels !== 0) result.valid = false;
if (projectionMode === "orthographic" && !(result.blankShare > 0.1 && result.blankShare < 0.35)) result.valid = false;
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

function writePpm(path, pixels, width, height) {
  const bytes = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    bytes[i * 3] = pixels[i * 4];
    bytes[i * 3 + 1] = pixels[i * 4 + 1];
    bytes[i * 3 + 2] = pixels[i * 4 + 2];
  }
  writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), bytes]));
}
