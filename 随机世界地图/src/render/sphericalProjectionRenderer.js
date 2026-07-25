import { nearestCellByVector } from "../sim/sphere/cubedSphere.js";
import { equirectangularPixelToVec3, mollweidePixelToVec3 } from "../sim/sphere/projection.js";
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
  return renderSphericalDebugLayer(grid, "debug-face", options);
}

export function renderSphericalDebugLayer(grid, layer, options = {}) {
  return renderSphericalField(grid, debugLayerField(grid), {
    ...options,
    colorRamp: (_value, cell) => colorDebugLayer(grid, layer, cell),
  });
}

export function projectionSampleToVec3(x, y, width, height, projectionMode, options = {}) {
  if (projectionMode === "orthographic") {
    return orthographicPixelToVec3(x, y, width, height, options);
  }
  if (projectionMode === "mollweide") {
    return mollweidePixelToVec3(x, y, width, height);
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

function debugLayerField(grid) {
  if (!grid.__debugProjectionField || grid.__debugProjectionField.length !== grid.size) {
    Object.defineProperty(grid, "__debugProjectionField", {
      value: new Uint8Array(grid.size),
      configurable: true,
    });
  }
  return grid.__debugProjectionField;
}

function colorDebugLayer(grid, layer, cell) {
  if (layer === "debug-face") return FACE_COLORS[(grid.face?.[cell] ?? 0) % FACE_COLORS.length];
  if (layer === "debug-cell-id") return colorDebugCellId(grid, cell);
  if (layer === "debug-neighbor-count") return colorDebugNeighborCount(grid, cell);
  if (layer === "debug-area") return colorDebugArea(grid, cell);
  if (layer === "debug-face-seam-risk") return colorDebugFaceSeamRisk(grid, cell);
  if (layer === "debug-projection-sampling") return colorDebugProjectionSampling(grid, cell);
  throw new Error(`Unknown spherical debug layer: ${layer}`);
}

function colorDebugCellId(grid, cell) {
  const face = grid.face?.[cell] ?? 0;
  const u = grid.faceU?.[cell] ?? 0;
  const v = grid.faceV?.[cell] ?? 0;
  const hash = (cell * 1103515245 + face * 1013904223 + u * 374761393 + v * 668265263) >>> 0;
  return [
    45 + (hash & 0x7f),
    55 + ((hash >>> 8) & 0x7f),
    65 + ((hash >>> 16) & 0x7f),
  ];
}

function colorDebugNeighborCount(grid, cell) {
  const count = grid.neighborCount?.[cell] ?? 0;
  if (count <= 2) return [228, 76, 68];
  if (count === 3) return [235, 189, 76];
  if (count === 4) return [72, 178, 112];
  return [82, 174, 224];
}

function colorDebugArea(grid, cell) {
  const area = grid.area?.[cell];
  const metricArea = Number.isFinite(area) && area > 0 ? area : 1;
  const faceSize = Math.max(1, grid.faceSize ?? 1);
  const ideal = (4 * Math.PI) / Math.max(1, 6 * faceSize * faceSize);
  const ratio = metricArea / Math.max(ideal, Number.EPSILON);
  if (ratio < 1) return lerpColor([40, 84, 156], [50, 60, 65], ratio);
  return lerpColor([50, 60, 65], [230, 188, 82], Math.min(1, ratio - 1));
}

function colorDebugFaceSeamRisk(grid, cell) {
  let seam = false;
  const start = grid.neighborStart?.[cell] ?? 0;
  const count = grid.neighborCount?.[cell] ?? 0;
  for (let k = 0; k < count; k += 1) {
    const nid = grid.neighbors[start + k];
    if (grid.face?.[nid] !== grid.face?.[cell]) seam = true;
  }
  if (!seam) return [29, 34, 38];
  const edgeLength = meanNeighborEdgeLength(grid, cell);
  const t = Math.max(0, Math.min(1, edgeLength / Math.max(1e-6, Math.PI / Math.max(2, grid.faceSize ?? 2))));
  return lerpColor([238, 216, 75], [226, 62, 54], t);
}

function colorDebugProjectionSampling(grid, cell) {
  const u = grid.faceU?.[cell] ?? 0;
  const v = grid.faceV?.[cell] ?? 0;
  const faceSize = Math.max(1, grid.faceSize ?? 1);
  const edge = u === 0 || v === 0 || u === faceSize - 1 || v === faceSize - 1;
  const checker = ((Math.floor(u / 2) + Math.floor(v / 2) + (grid.face?.[cell] ?? 0)) % 2) === 0;
  if (edge) return checker ? [240, 238, 118] : [230, 92, 76];
  return checker ? [70, 122, 186] : [38, 64, 102];
}

function meanNeighborEdgeLength(grid, cell) {
  const start = grid.neighborStart?.[cell] ?? 0;
  const count = grid.neighborCount?.[cell] ?? 0;
  if (!count) return 0;
  let total = 0;
  for (let k = 0; k < count; k += 1) total += grid.edgeLength?.[start + k] ?? 0;
  return total / count;
}

function lerpColor(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}
