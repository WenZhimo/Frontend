import { forEachGridCell, forEachNeighbor4ById, physicalRadius } from "../grid.js";
import { topologyForGrid } from "../topology.js";
import { BoundaryType } from "../tectonics.js";

export const CrustType = {
  OCEANIC: 0,
  CONTINENTAL: 1,
  TRANSITIONAL: 2,
};

export function updateCrustProperties(world) {
  updateCrustPropertiesV2(world);
}

export function updateCrustPropertiesV2(world) {
  const { grid } = world;
  const {
    size,
    crust,
    crustType,
    crustThickness,
    crustAge,
    crustDensity,
    weakness,
    orogeny,
    sediment,
    boundaryKind,
    boundaryInfluence,
    stress,
    isContinental,
  } = grid;
  const dt = world.timeScaleFactor;
  const step = Math.sqrt(dt);

  for (let i = 0; i < size; i += 1) {
    let type = crustType[i];
    const active = Math.min(1, boundaryInfluence[i]);
    const s = Math.min(2.5, stress[i]);
    const kind = boundaryKind[i];
    const boundaryPower = active * s;

    if (type === CrustType.OCEANIC) {
      crustAge[i] = Math.min(1, crustAge[i] + 0.005 * dt);
      crustThickness[i] = Math.max(0.12, Math.min(0.42, crustThickness[i] + 0.00035 * dt));
    } else if (type === CrustType.TRANSITIONAL) {
      crustAge[i] = Math.min(0.55, crustAge[i] + 0.00055 * dt);
      crustThickness[i] = Math.max(0.32, Math.min(0.72, crustThickness[i]));
    } else {
      crustAge[i] = Math.min(1, crustAge[i] + 0.00025 * dt);
      crustThickness[i] = Math.max(0.42, Math.min(1.25, crustThickness[i]));
    }

    if (kind === BoundaryType.DIVERGENT) {
      if (type === CrustType.CONTINENTAL) {
        crustThickness[i] = Math.max(0.36, crustThickness[i] - active * s * 0.00028 * step);
        weakness[i] = Math.min(1, weakness[i] + active * s * 0.0025 * dt);
        sediment[i] *= 0.998;
        if (crustThickness[i] < 0.47 && weakness[i] > 0.58 && boundaryPower > 0.55) {
          type = CrustType.TRANSITIONAL;
          crustType[i] = type;
          crustAge[i] = Math.min(crustAge[i], 0.22);
          sediment[i] = Math.min(1, sediment[i] + boundaryPower * 0.0012 * dt);
        }
      } else if (type === CrustType.TRANSITIONAL) {
        crustThickness[i] = Math.max(0.27, crustThickness[i] - active * s * 0.00024 * step);
        weakness[i] = Math.min(1, weakness[i] + active * s * 0.0032 * dt);
        sediment[i] = Math.min(1, sediment[i] + boundaryPower * 0.001 * dt);
        crustAge[i] = Math.min(0.35, crustAge[i] + boundaryPower * 0.0008 * dt);
        if (grid.riftStage[i] === 5 && crustThickness[i] < 0.285 && weakness[i] > 0.72 && boundaryPower > 0.74) {
          type = CrustType.OCEANIC;
          crustType[i] = type;
          crustAge[i] = 0;
          crustThickness[i] = Math.max(0.18, Math.min(0.26, crustThickness[i]));
          sediment[i] *= 0.45;
        }
      } else {
        crustType[i] = CrustType.OCEANIC;
        crustAge[i] = Math.min(crustAge[i], 0.03);
        crustThickness[i] = Math.max(0.16, Math.min(crustThickness[i], 0.28));
        sediment[i] *= 0.985;
      }
    } else if (kind === BoundaryType.CONVERGENT) {
      if (type === CrustType.CONTINENTAL) {
        crustThickness[i] = Math.min(1.35, crustThickness[i] + active * s * 0.00055 * step);
        orogeny[i] = Math.min(1, orogeny[i] + active * s * 0.0012 * dt);
      } else if (type === CrustType.TRANSITIONAL) {
        crustThickness[i] = Math.min(0.82, crustThickness[i] + active * s * 0.00018 * step);
        sediment[i] = Math.min(1, sediment[i] + boundaryPower * 0.0014 * dt);
      } else {
        const ageFactor = 0.45 + crustAge[i] * 1.25;
        crustThickness[i] = Math.max(0.08, crustThickness[i] - active * s * (0.00015 + crustAge[i] * 0.00034) * step);
        sediment[i] = Math.min(1, sediment[i] + boundaryPower * ageFactor * 0.00075 * dt);
      }
    } else if (kind === BoundaryType.TRANSFORM) {
      weakness[i] = Math.min(1, weakness[i] + active * s * 0.003 * dt);
      sediment[i] = Math.min(1, sediment[i] + active * s * 0.0007 * dt);
      orogeny[i] *= Math.max(0, 1 - active * 0.0015 * dt);
    } else {
      weakness[i] += (0.5 - weakness[i]) * Math.min(0.02, 0.0015 * dt);
    }

    if (type === CrustType.CONTINENTAL && crustThickness[i] < 0.43 && weakness[i] > 0.68) {
      type = CrustType.TRANSITIONAL;
      crustType[i] = type;
    }

    if (type === CrustType.CONTINENTAL) {
      crustDensity[i] = 0.4 + Math.max(0, crustThickness[i] - 0.55) * 0.08;
      crust[i] = (crustThickness[i] - 0.52) * 1.85;
      isContinental[i] = 1;
    } else if (type === CrustType.TRANSITIONAL) {
      crustDensity[i] = 0.56 + Math.max(0, 0.55 - crustThickness[i]) * 0.14 + crustAge[i] * 0.04;
      crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
      isContinental[i] = 0;
    } else {
      crustDensity[i] = 0.68 + crustAge[i] * 0.12;
      crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
      isContinental[i] = 0;
    }
  }
  rebuildOceanicAgeFromRidges(world);
  rebuildCrustCompatibilityFields(grid);
}

function rebuildOceanicAgeFromRidges(world) {
  const { grid } = world;
  const {
    size,
    crustType,
    crustAge,
    crustThickness,
    crustDensity,
    ridge,
    boundaryKind,
    boundaryInfluence,
    stress,
    ridgeDistance,
    scratch,
    scratch2,
  } = grid;
  const agePerStep = 1 / 200;
  const dtAge = agePerStep * world.timeScaleFactor;
  const rebuildDistance = !world.geologyV2RidgeDistanceInitialized || world.step % 4 === 0;
  const ridgeMask = scratch;
  ridgeMask.fill(0);
  if (rebuildDistance) ridgeDistance.fill(Number.POSITIVE_INFINITY);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < size; i += 1) {
    const isOceanic = crustType[i] === CrustType.OCEANIC;
    const activeRidge = isOceanic && (
      ridge[i] > 0.045 ||
      (boundaryKind[i] === BoundaryType.DIVERGENT && boundaryInfluence[i] > 0.18 && stress[i] > 0.08)
    );
    if (!activeRidge) continue;
    ridgeMask[i] = 1;
    ridgeDistance[i] = 0;
    queue[tail++] = i;
    crustAge[i] = Math.min(crustAge[i], 0.012);
    crustThickness[i] = Math.max(0.16, Math.min(crustThickness[i], 0.28));
  }

  if (rebuildDistance) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      rebuildGraphRidgeDistance(grid, topology, ridgeMask);
    } else {
      while (head < tail) {
        const id = queue[head++];
        const nextDistance = ridgeDistance[id] + 1;
        forEachNeighbor4ById(grid, id, (nid) => {
          if (crustType[nid] !== CrustType.OCEANIC) return;
          if (nextDistance >= ridgeDistance[nid]) return;
          ridgeDistance[nid] = nextDistance;
          queue[tail++] = nid;
        });
      }
    }
    world.geologyV2RidgeDistanceInitialized = true;
  }

  const maxDistance = Math.max(8, physicalRadius(grid, 72));
  for (let i = 0; i < size; i += 1) {
    if (crustType[i] !== CrustType.OCEANIC) {
      ridgeDistance[i] = -1;
      continue;
    }
    const reachable = ridgeDistance[i] >= 0 && Number.isFinite(ridgeDistance[i]);
    const distanceAge = reachable ? Math.min(1, ridgeDistance[i] / maxDistance) : 1;
    const timeAge = Math.min(1, crustAge[i] + dtAge);
    const ridgeReset = ridgeMask[i] ? 0 : Math.min(timeAge, distanceAge + dtAge * 0.35);
    crustAge[i] = Math.min(1, Math.max(0, ridgeReset));
    crustThickness[i] = Math.max(0.14, Math.min(0.42, 0.18 + crustAge[i] * 0.16 + Math.max(0, crustThickness[i] - 0.18) * 0.28));
  }

  const topology = topologyForGrid(grid);
  scratch2.set(crustAge);
  forEachGridCell(grid, (id) => {
    if (crustType[id] !== CrustType.OCEANIC || ridgeDistance[id] <= 1) return;
    let total = scratch2[id] * 2.5;
    let weight = 2.5;
    visitRidgeAgeSmoothingNeighbors(grid, topology, id, (nid) => {
      if (crustType[nid] !== CrustType.OCEANIC || Math.abs(ridgeDistance[nid] - ridgeDistance[id]) > 3) return;
      total += scratch2[nid];
      weight += 1;
    });
    crustAge[id] = Math.min(1, total / weight);
  });
}

function visitRidgeAgeSmoothingNeighbors(grid, topology, id, visit) {
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

function rebuildGraphRidgeDistance(grid, topology, ridgeMask) {
  const { size, crustType, ridgeDistance } = grid;
  const heap = new CrustDistanceHeap(Math.max(16, size));
  ridgeDistance.fill(Number.POSITIVE_INFINITY);

  for (let id = 0; id < size; id += 1) {
    if (!ridgeMask[id] || crustType[id] !== CrustType.OCEANIC) continue;
    ridgeDistance[id] = 0;
    heap.push(id, 0);
  }

  while (heap.length > 0) {
    const current = heap.pop();
    const id = current.id;
    if (current.distance > ridgeDistance[id] + 1e-7) continue;
    topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
      if (crustType[nid] !== CrustType.OCEANIC) return;
      const next = ridgeDistance[id] + Math.max(1e-6, edgeLength);
      if (next >= ridgeDistance[nid]) return;
      ridgeDistance[nid] = next;
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

class CrustDistanceHeap {
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

function rebuildCrustCompatibilityFields(grid) {
  const { size, crustType, crustAge, crustThickness, crustDensity, crust, isContinental } = grid;
  for (let i = 0; i < size; i += 1) {
    if (crustType[i] === CrustType.CONTINENTAL) {
      crustDensity[i] = 0.4 + Math.max(0, crustThickness[i] - 0.55) * 0.08;
      crust[i] = (crustThickness[i] - 0.52) * 1.85;
      isContinental[i] = 1;
    } else if (crustType[i] === CrustType.TRANSITIONAL) {
      crustDensity[i] = 0.56 + Math.max(0, 0.55 - crustThickness[i]) * 0.14 + crustAge[i] * 0.04;
      crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
      isContinental[i] = 0;
    } else {
      crustDensity[i] = 0.68 + crustAge[i] * 0.12;
      crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
      isContinental[i] = 0;
    }
  }
}
