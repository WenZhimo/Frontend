import { BoundaryType } from "../tectonics.js";
import { forEachGridCell, forEachNeighbor4ById, forEachNeighbor8ById, physicalRadius, wrapX, xyOf } from "../grid.js";

export function updatePlateBoundaries(world) {
  updatePlateBoundariesV2(world);
  classifyBoundaryKindV2(world);
}

export function updatePlateBoundariesV2(world) {
  const { grid } = world;
  const { size, plate, boundaryDistance, boundaryInfluence, weakness, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
  const radius = physicalRadius(grid, 4);
  const q = new Int32Array(size);
  let head = 0;
  let tail = 0;
  boundaryDistance.fill(9999);
  boundaryInfluence.fill(0);
  activeBoundary.fill(0);
  boundaryDensity.fill(0);
  boundaryCoherence.fill(1);
  noisyBoundaryPatch.fill(0);
  plateCheckerboard.fill(0);

  forEachGridCell(grid, (id) => {
    let edge = false;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (plate[nid] !== plate[id]) edge = true;
    });
    if (edge) {
      boundaryDistance[id] = 0;
      activeBoundary[id] = 1;
      q[tail++] = id;
    }
  });

  deriveBoundaryCoherence(grid);

  while (head < tail) {
    const id = q[head++];
    const nextDistance = boundaryDistance[id] + 1;
    if (nextDistance > radius) continue;
    forEachNeighbor4ById(grid, id, (nid) => {
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
    const coherenceGate = 0.25 + boundaryCoherence[i] * 0.75;
    const noisyGate = noisyBoundaryPatch[i] ? 0.32 : 1;
    boundaryInfluence[i] = Math.min(1, distanceBand * weakPath * segmented * coherenceGate * noisyGate);
  }
}

export function classifyBoundaryKindV2(world) {
  const { grid } = world;
  const { width, height, size, plate, pvx, pvy, btype, boundaryKind, stress, activeBoundary, boundaryCoherence, noisyBoundaryPatch } = grid;
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
      const coherenceGate = noisyBoundaryPatch[id] ? 0.22 : 0.45 + boundaryCoherence[id] * 0.55;
      if (convergent > divergent && convergent > shear * 0.55) {
        btype[id] = BoundaryType.CONVERGENT;
        stress[id] = convergent * coherenceGate;
      } else if (divergent > convergent && divergent > shear * 0.55) {
        btype[id] = BoundaryType.DIVERGENT;
        stress[id] = divergent * coherenceGate;
      } else {
        btype[id] = BoundaryType.TRANSFORM;
        stress[id] = shear * 0.5 * coherenceGate;
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

function deriveBoundaryCoherence(grid) {
  const { plate, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
  forEachGridCell(grid, (id) => {
    let boundaryCount = activeBoundary[id] ? 1 : 0;
    let cells = 1;
    let same = 0;
    let different = 0;
    forEachNeighbor8ById(grid, id, (nid) => {
      cells += 1;
      if (activeBoundary[nid]) boundaryCount += 1;
      if (plate[nid] === plate[id]) same += 1;
      else different += 1;
    });

    const { x, y } = xyOf(grid, id);
    const density = cells ? boundaryCount / cells : 0;
    const checker = checkerboardRiskAt(grid, x, y);
    const islandNoise = same <= 2 && different >= 5 ? 1 : 0;
    const coherence = Math.max(0, Math.min(1, 1 - Math.max(0, density - 0.42) * 1.35 - checker * 0.75 - islandNoise * 0.55));
    boundaryDensity[id] = density;
    plateCheckerboard[id] = checker;
    boundaryCoherence[id] = coherence;
    if (density > 0.66 || checker > 0.4 || islandNoise) noisyBoundaryPatch[id] = 1;
  });
}

function checkerboardRiskAt(grid, x, y) {
  let risk = 0;
  for (let dy = -1; dy <= 0; dy += 1) {
    const y0 = y + dy;
    const y1 = y0 + 1;
    if (y0 < 0 || y1 >= grid.height) continue;
    for (let dx = -1; dx <= 0; dx += 1) {
      const x0 = wrapX(grid.width, x + dx);
      const x1 = wrapX(grid.width, x + dx + 1);
      const a = grid.plate[y0 * grid.width + x0];
      const b = grid.plate[y0 * grid.width + x1];
      const c = grid.plate[y1 * grid.width + x0];
      const d = grid.plate[y1 * grid.width + x1];
      if (a === d && b === c && a !== b) risk = 1;
    }
  }
  return risk;
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
  let best = BoundaryType.INTERIOR;
  forEachNeighbor4ById(grid, id, (nid) => {
    const kind = grid.boundaryKind[nid];
    if (kind !== BoundaryType.INTERIOR) best = kind;
  });
  return best;
}
