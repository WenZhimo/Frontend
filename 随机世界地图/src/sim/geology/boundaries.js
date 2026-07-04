import { BoundaryType } from "../tectonics.js";
import { forEachGridCell, forEachNeighbor4ById, forEachNeighbor8ById, indexOf, physicalRadius, xyOf } from "../grid.js";
import { topologyForGrid } from "../topology.js";

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

  const topology = topologyForGrid(grid);
  if (isGraphBackedGrid(grid, topology)) {
    rebuildGraphBoundaryDistance(grid, topology, activeBoundary, radius);
  } else {
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
  const { size, plate, btype, boundaryKind, stress, activeBoundary, boundaryCoherence, noisyBoundaryPatch } = grid;
  const topology = topologyForGrid(grid);
  btype.fill(BoundaryType.INTERIOR);
  boundaryKind.fill(BoundaryType.INTERIOR);
  stress.fill(0);

  forEachGridCell(grid, (id) => {
    const currentPlate = plate[id];
    let convergent = 0;
    let divergent = 0;
    let shear = 0;
    let touches = false;

    visitBoundaryClassificationNeighbors(grid, topology, id, (nid, dx, dy, slot) => {
      inspectBoundaryNeighbor(grid, id, nid, dx, dy, currentPlate, slot, (normal, tangent) => {
        touches = true;
        if (normal > 0.02) convergent += normal;
        else if (normal < -0.02) divergent += -normal;
        shear += Math.abs(tangent);
      });
    });

    if (!touches) return;
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
  });

  for (let i = 0; i < size; i += 1) {
    if (boundaryKind[i] === BoundaryType.INTERIOR && grid.boundaryInfluence[i] > 0.01) {
      boundaryKind[i] = nearestBoundaryKind(grid, i);
    }
  }
}

function deriveBoundaryCoherence(grid) {
  const { plate, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
  const topology = topologyForGrid(grid);
  forEachGridCell(grid, (id) => {
    let boundaryCount = activeBoundary[id] ? 1 : 0;
    let cells = 1;
    let same = 0;
    let different = 0;
    visitBoundaryCoherenceNeighbors(grid, topology, id, (nid) => {
      cells += 1;
      if (activeBoundary[nid]) boundaryCount += 1;
      if (plate[nid] === plate[id]) same += 1;
      else different += 1;
    });

    const density = cells ? boundaryCount / cells : 0;
    const checker = isGraphBackedGrid(grid, topology)
      ? graphCheckerboardRiskAt(grid, topology, id)
      : legacyCheckerboardRiskAt(grid, id);
    const islandNoise = same <= 2 && different >= 5 ? 1 : 0;
    const coherence = Math.max(0, Math.min(1, 1 - Math.max(0, density - 0.42) * 1.35 - checker * 0.75 - islandNoise * 0.55));
    boundaryDensity[id] = density;
    plateCheckerboard[id] = checker;
    boundaryCoherence[id] = coherence;
    if (density > 0.66 || checker > 0.4 || islandNoise) noisyBoundaryPatch[id] = 1;
  });
}

function visitBoundaryCoherenceNeighbors(grid, topology, id, visit) {
  if (isGraphBackedGrid(grid, topology)) {
    topology.forEachNeighbor(id, (nid) => {
      visit(nid);
    });
    return;
  }
  forEachNeighbor8ById(grid, id, (nid) => {
    visit(nid);
  });
}

function legacyCheckerboardRiskAt(grid, id) {
  const { x, y } = xyOf(grid, id);
  let risk = 0;
  for (let dy = -1; dy <= 0; dy += 1) {
    const y0 = y + dy;
    const y1 = y0 + 1;
    for (let dx = -1; dx <= 0; dx += 1) {
      const x0 = x + dx;
      const x1 = x + dx + 1;
      const aId = indexOf(grid, x0, y0);
      const bId = indexOf(grid, x1, y0);
      const cId = indexOf(grid, x0, y1);
      const dId = indexOf(grid, x1, y1);
      if (aId < 0 || bId < 0 || cId < 0 || dId < 0) continue;
      const a = grid.plate[aId];
      const b = grid.plate[bId];
      const c = grid.plate[cId];
      const d = grid.plate[dId];
      if (a === d && b === c && a !== b) risk = 1;
    }
  }
  return risk;
}

function graphCheckerboardRiskAt(grid, topology, id) {
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  let otherA = -1;
  let otherB = -1;
  topology.forEachNeighbor(id, (nid) => {
    const plate = grid.plate[nid];
    if (plate === current) {
      same += 1;
      return;
    }
    different += 1;
    if (otherA < 0) otherA = plate;
    else if (plate !== otherA) otherB = plate;
  });
  if (different < 3 || same > 1 || otherB < 0) return 0;
  return Math.min(1, (different - same) / Math.max(1, different));
}

function visitBoundaryClassificationNeighbors(grid, topology, id, visit) {
  if (isGraphBackedGrid(grid, topology)) {
    topology.forEachNeighbor(id, (nid, slot) => {
      const direction = graphBoundaryDirection(grid, id, nid, slot);
      visit(nid, direction.dx, direction.dy, slot);
    });
    return;
  }
  forEachNeighbor4ById(grid, id, (nid, dx, dy) => {
    visit(nid, dx, dy, -1);
  });
}

function graphBoundaryDirection(grid, id, nid, slot) {
  const start = grid.neighborStart?.[id] ?? -1;
  const offset = start >= 0 ? start + slot : -1;
  let dx = offset >= 0 && grid.edgeTangentX ? grid.edgeTangentX[offset] : 0;
  let dy = offset >= 0 && grid.edgeTangentY ? grid.edgeTangentY[offset] : 0;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) {
    dx = (grid.positionX?.[nid] ?? 0) - (grid.positionX?.[id] ?? 0);
    dy = (grid.positionY?.[nid] ?? 0) - (grid.positionY?.[id] ?? 0);
  }
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { dx: 1, dy: 0 };
  return { dx: dx / length, dy: dy / length };
}

function inspectBoundaryNeighbor(grid, id, nid, dx, dy, currentPlate, _slot, visit) {
  if (grid.plate[nid] === currentPlate) return;
  const rvx = grid.pvx[id] - grid.pvx[nid];
  const rvy = grid.pvy[id] - grid.pvy[nid];
  visit(rvx * dx + rvy * dy, rvx * -dy + rvy * dx);
}

function nearestBoundaryKind(grid, id) {
  let best = BoundaryType.INTERIOR;
  const topology = topologyForGrid(grid);
  visitNearestBoundaryKindNeighbors(grid, topology, id, (nid) => {
    const kind = grid.boundaryKind[nid];
    if (kind !== BoundaryType.INTERIOR) best = kind;
  });
  return best;
}

function visitNearestBoundaryKindNeighbors(grid, topology, id, visit) {
  if (isGraphBackedGrid(grid, topology)) {
    topology.forEachNeighbor(id, (nid) => {
      visit(nid);
    });
    return;
  }
  forEachNeighbor4ById(grid, id, (nid) => {
    visit(nid);
  });
}

function rebuildGraphBoundaryDistance(grid, topology, sourceMask, radius) {
  const { size, boundaryDistance } = grid;
  const heap = new BoundaryDistanceHeap(Math.max(16, size));
  boundaryDistance.fill(9999);

  for (let id = 0; id < size; id += 1) {
    if (!sourceMask[id]) continue;
    boundaryDistance[id] = 0;
    heap.push(id, 0);
  }

  while (heap.length > 0) {
    const current = heap.pop();
    const id = current.id;
    if (current.distance > boundaryDistance[id] + 1e-7) continue;
    topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
      const next = boundaryDistance[id] + Math.max(1e-6, edgeLength);
      if (next > radius || next >= boundaryDistance[nid]) return;
      boundaryDistance[nid] = next;
      heap.push(nid, next);
    });
  }
}

function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
  return Boolean(
    grid.topologyOptions?.graphBacked ||
      topology?.topologyKind === "cubed-sphere" ||
      grid.topologyKind === "cubed-sphere",
  );
}

class BoundaryDistanceHeap {
  constructor(capacity) {
    this.ids = new Int32Array(capacity);
    this.distances = new Float64Array(capacity);
    this.length = 0;
  }

  push(id, distance) {
    this.ensureCapacity(this.length + 1);
    let index = this.length++;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.distances[parent] <= distance) break;
      this.ids[index] = this.ids[parent];
      this.distances[index] = this.distances[parent];
      index = parent;
    }
    this.ids[index] = id;
    this.distances[index] = distance;
  }

  pop() {
    const id = this.ids[0];
    const distance = this.distances[0];
    const lastId = this.ids[--this.length];
    const lastDistance = this.distances[this.length];
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.length) break;
      let child = left;
      if (right < this.length && this.distances[right] < this.distances[left]) child = right;
      if (this.distances[child] >= lastDistance) break;
      this.ids[index] = this.ids[child];
      this.distances[index] = this.distances[child];
      index = child;
    }
    if (this.length > 0) {
      this.ids[index] = lastId;
      this.distances[index] = lastDistance;
    }
    return { id, distance };
  }

  ensureCapacity(required) {
    if (required <= this.ids.length) return;
    const nextCapacity = Math.max(required, this.ids.length * 2);
    const ids = new Int32Array(nextCapacity);
    const distances = new Float64Array(nextCapacity);
    ids.set(this.ids);
    distances.set(this.distances);
    this.ids = ids;
    this.distances = distances;
  }
}
