import { BoundaryType } from "../sim/tectonics.js";
import { renderSphericalDebugLayer, renderSphericalField } from "./sphericalProjectionRenderer.js";

const SPHERICAL_DEBUG_PROJECTION_MODES = new Set([
  "debug-face",
  "debug-cell-id",
  "debug-neighbor-count",
  "debug-area",
  "debug-face-seam-risk",
  "debug-projection-sampling",
]);

export function createCpuMapRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let imageData = null;

  function render(world) {
    const { grid } = world;
    if (isGraphBackedGrid(grid)) {
      renderSphericalWorld(world);
      return;
    }
    renderRectangularWorld(world);
  }

  function renderRectangularWorld(world) {
    const { grid } = world;
    const { width, height, elev, btype, activeBoundary } = grid;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      imageData = null;
    }
    if (!imageData) imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < grid.size; i += 1) {
      const color = colorForElevation(elev[i] - world.seaLevel);
      const offset = i * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }

    if (world.params.showBoundaries !== false) {
      for (let i = 0; i < grid.size; i += 1) {
        if (btype[i] === BoundaryType.INTERIOR || !activeBoundary[i]) continue;
        const overlayStrength = boundaryOverlayStrength(grid, i);
        if (overlayStrength <= 0) continue;
        const offset = i * 4;
        if (btype[i] === BoundaryType.CONVERGENT) {
          blendPixel(data, offset, [231, 86, 66], 0.55 * overlayStrength);
        } else if (btype[i] === BoundaryType.DIVERGENT) {
          blendPixel(data, offset, [77, 195, 215], 0.5 * overlayStrength);
        } else {
          blendPixel(data, offset, [236, 196, 83], 0.46 * overlayStrength);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function renderSphericalWorld(world) {
    const { grid } = world;
    const width = Number.isFinite(world.params?.renderWidth) ? world.params.renderWidth : 512;
    const height = Number.isFinite(world.params?.renderHeight) ? world.params.renderHeight : 256;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      imageData = null;
    }
    if (!imageData) imageData = ctx.createImageData(width, height);
    const projectionMode = world.params?.projectionMode ?? "equirectangular";
    const rendered = SPHERICAL_DEBUG_PROJECTION_MODES.has(projectionMode)
      ? renderSphericalDebugLayer(grid, projectionMode, {
          width,
          height,
          projectionMode: "equirectangular",
        })
      : renderSphericalField(grid, grid.elev, {
          width,
          height,
          projectionMode,
          colorRamp: (value, cell) => {
            const color = colorForElevation(value - world.seaLevel);
            if (world.params.showBoundaries === false || !hasActiveBoundary(grid, cell)) return color;
            const overlayStrength = boundaryOverlayStrength(grid, cell);
            if (overlayStrength <= 0) return color;
            if (grid.btype[cell] === BoundaryType.CONVERGENT) {
              return blendedColor(color, [231, 86, 66], 0.55 * overlayStrength);
            }
            if (grid.btype[cell] === BoundaryType.DIVERGENT) {
              return blendedColor(color, [77, 195, 215], 0.5 * overlayStrength);
            }
            return blendedColor(color, [236, 196, 83], 0.46 * overlayStrength);
          },
        });
    imageData.data.set(rendered.pixels);
    ctx.putImageData(imageData, 0, 0);
  }

  return {
    kind: "cpu-canvas",
    fallbackReason: null,
    render,
  };
}

export function boundaryOverlayStrength(grid, id) {
  const checker = grid.plateCheckerboard?.[id] ?? 0;
  if (checker > 0.35) return 0;
  const noisy = grid.noisyBoundaryPatch?.[id] ?? 0;
  const density = grid.boundaryDensity?.[id] ?? 0;
  const coherence = grid.boundaryCoherence?.[id] ?? 1;
  if (noisy && density > 0.36) return 0;
  if (density > 0.58 && coherence < 0.78) return 0;
  return Math.max(0.35, Math.min(1, 0.45 + coherence * 0.55));
}

export function blendPixel(data, offset, color, alpha) {
  data[offset] = Math.round(data[offset] * (1 - alpha) + color[0] * alpha);
  data[offset + 1] = Math.round(data[offset + 1] * (1 - alpha) + color[1] * alpha);
  data[offset + 2] = Math.round(data[offset + 2] * (1 - alpha) + color[2] * alpha);
}

function blendedColor(base, overlay, alpha) {
  const k = Math.max(0, Math.min(1, alpha));
  return [
    Math.round(base[0] * (1 - k) + overlay[0] * k),
    Math.round(base[1] * (1 - k) + overlay[1] * k),
    Math.round(base[2] * (1 - k) + overlay[2] * k),
  ];
}

function hasActiveBoundary(grid, id) {
  return grid.btype?.[id] !== BoundaryType.INTERIOR && Boolean(grid.activeBoundary?.[id]);
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}

export function colorForElevation(h) {
  if (h < -0.22) return [7, 35, 65];
  if (h < -0.08) return lerpColor([11, 53, 94], [31, 105, 143], (h + 0.22) / 0.14);
  if (h < 0) return lerpColor([39, 116, 145], [86, 157, 164], (h + 0.08) / 0.08);
  if (h < 0.12) return lerpColor([86, 132, 72], [143, 163, 88], h / 0.12);
  if (h < 0.32) return lerpColor([136, 123, 77], [126, 91, 62], (h - 0.12) / 0.2);
  if (h < 0.56) return lerpColor([116, 94, 79], [188, 182, 163], (h - 0.32) / 0.24);
  return [236, 240, 229];
}

function lerpColor(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}
