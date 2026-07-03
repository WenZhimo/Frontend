import { nearestCellByVector } from "../sim/sphere/cubedSphere.js";
import { equirectangularPixelToVec3 } from "../sim/sphere/projection.js";
import { lonLatToVec3, normalize3 } from "../sim/sphere/vector.js";

export function renderSphericalField(grid, field, options = {}) {
  const width = Math.max(1, Math.trunc(options.width ?? 512));
  const height = Math.max(1, Math.trunc(options.height ?? 256));
  const projectionMode = options.projectionMode ?? "equirectangular";
  const colorRamp = options.colorRamp ?? colorRampElevation;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const stats = {
    projectionMode,
    width,
    height,
    sampledPixels: 0,
    blankPixels: 0,
    nearestCellMaxReuse: 0,
  };
  const reuse = new Uint16Array(grid.size);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const sample = projectionSampleToVec3(x, y, width, height, projectionMode, options);
      if (!sample.visible) {
        pixels[offset] = options.background?.[0] ?? 0;
        pixels[offset + 1] = options.background?.[1] ?? 0;
        pixels[offset + 2] = options.background?.[2] ?? 0;
        pixels[offset + 3] = 255;
        stats.blankPixels += 1;
        continue;
      }

      const cell = nearestCellByVector(grid, sample.x, sample.y, sample.z);
      reuse[cell] += 1;
      if (reuse[cell] > stats.nearestCellMaxReuse) stats.nearestCellMaxReuse = reuse[cell];
      const color = colorRamp(field[cell], cell, grid);
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
      stats.sampledPixels += 1;
    }
  }

  return { pixels, stats };
}

export function renderSphericalDebugFace(grid, options = {}) {
  const field = grid.face;
  return renderSphericalField(grid, field, {
    ...options,
    colorRamp: (face) => FACE_COLORS[face % FACE_COLORS.length],
  });
}

export function projectionSampleToVec3(x, y, width, height, projectionMode, options = {}) {
  if (projectionMode === "orthographic") {
    return orthographicPixelToVec3(x, y, width, height, options);
  }
  return {
    ...equirectangularPixelToVec3(x, y, width, height),
    visible: true,
  };
}

export function orthographicPixelToVec3(x, y, width, height, options = {}) {
  const size = Math.min(width, height);
  const zoom = Number.isFinite(options.zoom) ? Math.max(0.1, options.zoom) : 0.92;
  const nx = ((x + 0.5) - width / 2) / (size / 2 * zoom);
  const ny = (height / 2 - (y + 0.5)) / (size / 2 * zoom);
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) return { x: 0, y: 0, z: 0, visible: false };

  const cameraLon = options.cameraLon ?? 0;
  const cameraLat = options.cameraLat ?? 0;
  const forward = lonLatToVec3(cameraLon, cameraLat);
  const east = normalize3(-Math.sin(cameraLon), 0, Math.cos(cameraLon));
  const north = normalize3(
    -Math.cos(cameraLon) * Math.sin(cameraLat),
    Math.cos(cameraLat),
    -Math.sin(cameraLon) * Math.sin(cameraLat),
  );
  const radial = Math.sqrt(Math.max(0, 1 - r2));
  const point = normalize3(
    forward.x * radial + east.x * nx + north.x * ny,
    forward.y * radial + east.y * nx + north.y * ny,
    forward.z * radial + east.z * nx + north.z * ny,
  );
  return { ...point, visible: true };
}

export function colorRampElevation(value) {
  const h = Math.max(-1, Math.min(1, value));
  if (h < -0.25) return lerpColor([7, 35, 65], [16, 72, 116], (h + 1) / 0.75);
  if (h < 0) return lerpColor([16, 72, 116], [81, 151, 163], (h + 0.25) / 0.25);
  if (h < 0.35) return lerpColor([86, 132, 72], [151, 162, 92], h / 0.35);
  return lerpColor([126, 91, 62], [236, 240, 229], (h - 0.35) / 0.65);
}

const FACE_COLORS = [
  [220, 75, 75],
  [78, 145, 220],
  [90, 180, 105],
  [235, 180, 70],
  [160, 100, 210],
  [70, 190, 195],
];

function lerpColor(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}
