import { BoundaryType } from "../tectonics.js";
import { forEachNeighbor4, physicalRadius, wrapX } from "../grid.js";

export function updatePlateBoundaries(world) {
  updatePlateBoundariesV2(world);
  classifyBoundaryKindV2(world);
}

export function updatePlateBoundariesV2(world) {
  const { grid } = world;
  const { width, height, size, plate, boundaryDistance, boundaryInfluence, weakness, activeBoundary } = grid;
  const radius = physicalRadius(grid, 4);
  const q = new Int32Array(size);
  let head = 0;
  let tail = 0;
  boundaryDistance.fill(9999);
  boundaryInfluence.fill(0);
  activeBoundary.fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      let edge = false;
      forEachNeighbor4(grid, x, y, (nx, ny) => {
        if (plate[ny * width + nx] !== plate[id]) edge = true;
      });
      if (edge) {
        boundaryDistance[id] = 0;
        activeBoundary[id] = 1;
        q[tail++] = id;
      }
    }
  }

  while (head < tail) {
    const id = q[head++];
    const x = id % width;
    const y = Math.floor(id / width);
    const nextDistance = boundaryDistance[id] + 1;
    if (nextDistance > radius) continue;
    forEachNeighbor4(grid, x, y, (nx, ny) => {
      const nid = ny * width + nx;
      if (nextDistance < boundaryDistance[nid]) {
        boundaryDistance[nid] = nextDistance;
        q[tail++] = nid;
      }
    });
  }

  for (let i = 0; i < size; i += 1) {
    const distanceBand = Math.max(0, 1 - boundaryDistance[i] / radius);
    if (distanceBand <= 0) continue;
    const weakPath = 0.42 + weakness[i] * 0.9;
    const segmented = weakness[i] > 0.36 ? 1 : 0.5;
    boundaryInfluence[i] = Math.min(1, distanceBand * weakPath * segmented);
  }
}

export function classifyBoundaryKindV2(world) {
  const { grid } = world;
  const { width, height, size, plate, pvx, pvy, btype, boundaryKind, stress, activeBoundary } = grid;
  btype.fill(BoundaryType.INTERIOR);
  boundaryKind.fill(BoundaryType.INTERIOR);
  stress.fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const currentPlate = plate[id];
      let convergent = 0;
      let divergent = 0;
      let shear = 0;
      let touches = false;

      inspectBoundaryNeighbor(grid, x, y, wrapX(width, x + 1), y, 1, 0, currentPlate, id, (normal, tangent) => {
        touches = true;
        if (normal > 0.02) convergent += normal;
        else if (normal < -0.02) divergent += -normal;
        shear += Math.abs(tangent);
      });
      if (y < height - 1) {
        inspectBoundaryNeighbor(grid, x, y, x, y + 1, 0, 1, currentPlate, id, (normal, tangent) => {
          touches = true;
          if (normal > 0.02) convergent += normal;
          else if (normal < -0.02) divergent += -normal;
          shear += Math.abs(tangent);
        });
      }

      if (!touches) continue;
      activeBoundary[id] = 1;
      if (convergent > divergent && convergent > shear * 0.55) {
        btype[id] = BoundaryType.CONVERGENT;
        stress[id] = convergent;
      } else if (divergent > convergent && divergent > shear * 0.55) {
        btype[id] = BoundaryType.DIVERGENT;
        stress[id] = divergent;
      } else {
        btype[id] = BoundaryType.TRANSFORM;
        stress[id] = shear * 0.5;
      }
      boundaryKind[id] = btype[id];
    }
  }

  for (let i = 0; i < size; i += 1) {
    if (boundaryKind[i] === BoundaryType.INTERIOR && grid.boundaryInfluence[i] > 0.01) {
      boundaryKind[i] = nearestBoundaryKind(grid, i);
    }
  }
}

function inspectBoundaryNeighbor(grid, x, y, nx, ny, dx, dy, currentPlate, id, visit) {
  if (ny < 0 || ny >= grid.height) return;
  const nid = ny * grid.width + nx;
  if (grid.plate[nid] === currentPlate) return;
  const rvx = grid.pvx[id] - grid.pvx[nid];
  const rvy = grid.pvy[id] - grid.pvy[nid];
  visit(rvx * dx + rvy * dy, rvx * -dy + rvy * dx);
}

function nearestBoundaryKind(grid, id) {
  const x = id % grid.width;
  const y = Math.floor(id / grid.width);
  let best = BoundaryType.INTERIOR;
  forEachNeighbor4(grid, x, y, (nx, ny) => {
    const kind = grid.boundaryKind[ny * grid.width + nx];
    if (kind !== BoundaryType.INTERIOR) best = kind;
  });
  return best;
}
