import {
  assignNearestSphericalPlates,
  driftSphericalPlates,
  sphericalPlateVelocityAt,
} from "../sphere/plates.js";
import { normalize3 } from "../sphere/vector.js";
import {
  clampGridParamY,
  forEachGridCell,
  forEachNeighbor8ById,
  gridParamToU,
  gridParamToV,
  indexOf,
  resolutionScale,
  sampleGridBilinear,
  wrapGridParamX,
} from "../grid.js";
import { topologyForGrid } from "../topology.js";
import { CrustType } from "./crust.js";

export function advectCrust(world) {
  advectPlatesV2(world);
  rasterizePlatesV2(world);
  advectCrustByPlateMotion(world);
  world.geologyV2LastAdvectionStep = world.step;
}

export function advectPlatesV2(world) {
  const { grid, plates, params } = world;
  if (!plates) return;
  if (plates.kind === "spherical-plates" && isGraphBackedGrid(grid)) {
    const drift = world.timeScaleFactor * Math.max(0, params.intensity);
    driftSphericalPlates(plates, drift);
    return;
  }
  const drift = 0.1 * world.timeScaleFactor * Math.max(0, params.intensity) * resolutionScale(grid);
  for (let p = 0; p < plates.centersX.length; p += 1) {
    plates.centersX[p] = wrapGridParamX(grid, plates.centersX[p] + plates.vx[p] * drift);
    plates.centersY[p] = clampGridParamY(grid, plates.centersY[p] + plates.vy[p] * drift);
    syncPlateCenterUv(grid, plates, p);
  }
}

export function rasterizePlatesV2(world) {
  const { grid, plates } = world;
  if (!plates) return;
  if (plates.kind === "spherical-plates" && isGraphBackedGrid(grid)) {
    rasterizeSphericalPlatesV2(world);
    return;
  }
  const { size, plate, pvx, pvy, weakness, crustThickness } = grid;
  const cost = new Float32Array(size);
  const q = new Int32Array(size * 8);
  let head = 0;
  let tail = 0;
  plate.fill(-1);
  cost.fill(Infinity);

  for (let p = 0; p < plates.centersX.length; p += 1) {
    const x = Math.floor(wrapGridParamX(grid, plates.centersX[p]));
    const y = Math.floor(clampGridParamY(grid, plates.centersY[p]));
    const id = indexOf(grid, x, y);
    if (id < 0) continue;
    plate[id] = p;
    cost[id] = 0;
    q[tail++] = id;
  }

  while (head < tail) {
    const id = q[head++];
    const p = plate[id];
    forEachNeighbor8Local(grid, id, (nid, weight) => {
      const thicknessContrast = Math.min(1.2, Math.abs(crustThickness[nid] - crustThickness[id]));
      const stepCost = weight * (1.12 - weakness[nid] * 0.58 + thicknessContrast * 0.18);
      const next = cost[id] + stepCost;
      if (next + 0.0001 < cost[nid] && tail < q.length) {
        cost[nid] = next;
        plate[nid] = p;
        q[tail++] = nid;
      }
    });
  }

  cleanupPlateCheckerboards(grid);

  for (let i = 0; i < size; i += 1) {
    const p = plate[i] < 0 ? 0 : plate[i];
    plate[i] = p;
    pvx[i] = plates.vx[p];
    pvy[i] = plates.vy[p];
  }
}

function rasterizeSphericalPlatesV2(world) {
  const { grid, plates } = world;
  const assignment = assignNearestSphericalPlates(grid, plates);
  grid.plate.set(assignment.plate);
  world.plateAssignment = assignment;
  for (let id = 0; id < grid.size; id += 1) {
    const p = grid.plate[id] < 0 ? 0 : grid.plate[id];
    grid.plate[id] = p;
    const v = sphericalPlateVelocityAt(
      plates,
      p,
      grid.positionX[id],
      grid.positionY[id],
      grid.positionZ[id],
    );
    grid.pvx[id] = v.x;
    grid.pvy[id] = v.y;
    if (grid.pvz) grid.pvz[id] = v.z;
  }
}

export function advectCrustByPlateMotion(world) {
  const { grid } = world;
  const interval = 4;
  if (world.step > 0 && world.step % interval !== 0) return;
  const topology = topologyForGrid(grid);
  if (isGraphBackedGrid(grid, topology)) {
    advectCrustBySphericalPlateMotion(world, interval);
    return;
  }

  const {
    size,
    pvx,
    pvy,
    crustType,
    crustThickness,
    crustAge,
    orogeny,
    oldOrogeny,
    orogenyAge,
    forelandBasin,
    sediment,
    scratch,
    scratch2,
    scratch3,
  } = grid;
  const drift = 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(grid) * interval;
  if (drift <= 0) return;

  scratch.set(crustThickness);
  scratch2.set(crustAge);
  scratch3.set(orogeny);
  const sedimentSource = new Float32Array(sediment);
  const oldOrogenySource = new Float32Array(oldOrogeny);
  const orogenyAgeSource = new Float32Array(orogenyAge);
  const forelandSource = new Float32Array(forelandBasin);

  forEachGridCell(grid, (id, x, y) => {
    const previousType = crustType[id];
    const sx = x - pvx[id] * drift;
    const sy = y - pvy[id] * drift;
    crustThickness[id] = sampleBilinear(grid, scratch, sx, sy);
    if (previousType !== CrustType.OCEANIC) crustAge[id] = sampleBilinear(grid, scratch2, sx, sy);
    orogeny[id] = sampleBilinear(grid, scratch3, sx, sy) * 0.992;
    oldOrogeny[id] = sampleBilinear(grid, oldOrogenySource, sx, sy) * 0.996;
    orogenyAge[id] = sampleBilinear(grid, orogenyAgeSource, sx, sy);
    forelandBasin[id] = sampleBilinear(grid, forelandSource, sx, sy) * 0.998;
    sediment[id] = sampleBilinear(grid, sedimentSource, sx, sy) * 0.998;
    crustType[id] = classifyCrustType(crustThickness[id], crustAge[id], crustType[id]);
  });

  // Keep legacy compatibility fields coherent without making them the source of truth.
  syncLegacyCrustCompatibilityFields(grid);
}

function advectCrustBySphericalPlateMotion(world, interval) {
  const { grid } = world;
  const {
    size,
    pvx,
    pvy,
    pvz,
    crustType,
    crustThickness,
    crustAge,
    orogeny,
    oldOrogeny,
    orogenyAge,
    forelandBasin,
    sediment,
    scratch,
    scratch2,
    scratch3,
  } = grid;
  const drift = world.timeScaleFactor * Math.max(0, world.params.intensity) * interval;
  if (drift <= 0) return;

  scratch.set(crustThickness);
  scratch2.set(crustAge);
  scratch3.set(orogeny);
  const sedimentSource = new Float32Array(sediment);
  const oldOrogenySource = new Float32Array(oldOrogeny);
  const orogenyAgeSource = new Float32Array(orogenyAge);
  const forelandSource = new Float32Array(forelandBasin);

  for (let id = 0; id < size; id += 1) {
    const previousType = crustType[id];
    const source = backtrackSphericalPosition(grid, id, pvx[id], pvy[id], pvz?.[id] ?? 0, drift);
    crustThickness[id] = sampleSphericalField(grid, scratch, source.x, source.y, source.z, scratch[id]);
    if (previousType !== CrustType.OCEANIC) {
      crustAge[id] = sampleSphericalField(grid, scratch2, source.x, source.y, source.z, scratch2[id]);
    }
    orogeny[id] = sampleSphericalField(grid, scratch3, source.x, source.y, source.z, scratch3[id]) * 0.992;
    oldOrogeny[id] = sampleSphericalField(grid, oldOrogenySource, source.x, source.y, source.z, oldOrogenySource[id]) * 0.996;
    orogenyAge[id] = sampleSphericalField(grid, orogenyAgeSource, source.x, source.y, source.z, orogenyAgeSource[id]);
    forelandBasin[id] = sampleSphericalField(grid, forelandSource, source.x, source.y, source.z, forelandSource[id]) * 0.998;
    sediment[id] = sampleSphericalField(grid, sedimentSource, source.x, source.y, source.z, sedimentSource[id]) * 0.998;
    crustType[id] = classifyCrustType(crustThickness[id], crustAge[id], crustType[id]);
  }

  syncLegacyCrustCompatibilityFields(grid);
}

function backtrackSphericalPosition(grid, id, vx, vy, vz, drift) {
  const x = grid.positionX?.[id] ?? 0;
  const y = grid.positionY?.[id] ?? 0;
  const z = grid.positionZ?.[id] ?? 1;
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) return normalize3(x, y, z);
  return normalize3(x - vx * drift, y - vy * drift, z - vz * drift);
}

function sampleSphericalField(grid, field, x, y, z, fallback = 0) {
  const nearest = nearestSphericalCell(grid, x, y, z);
  if (nearest < 0 || nearest >= grid.size) return fallback;
  let total = 0;
  let weight = 0;

  const add = (id) => {
    const value = field[id];
    if (!Number.isFinite(value)) return;
    const dot = Math.max(
      -1,
      Math.min(1, (grid.positionX?.[id] ?? 0) * x + (grid.positionY?.[id] ?? 0) * y + (grid.positionZ?.[id] ?? 0) * z),
    );
    const distance = Math.acos(dot);
    const w = 1 / (1e-7 + distance * distance);
    total += value * w;
    weight += w;
  };

  add(nearest);
  const start = grid.neighborStart?.[nearest] ?? 0;
  const count = grid.neighborCount?.[nearest] ?? 0;
  for (let k = 0; k < count; k += 1) add(grid.neighbors[start + k]);

  return weight > 0 ? total / weight : fallback;
}

function nearestSphericalCell(grid, x, y, z) {
  if (typeof grid.nearestCell === "function") return grid.nearestCell(x, y, z);
  if (typeof grid.sphericalGrid?.nearestCell === "function") return grid.sphericalGrid.nearestCell(x, y, z);
  let best = 0;
  let bestDot = -Infinity;
  for (let id = 0; id < grid.size; id += 1) {
    const d = (grid.positionX?.[id] ?? 0) * x + (grid.positionY?.[id] ?? 0) * y + (grid.positionZ?.[id] ?? 0) * z;
    if (d > bestDot) {
      bestDot = d;
      best = id;
    }
  }
  return best;
}

function syncLegacyCrustCompatibilityFields(grid) {
  const { size, crustType, crustThickness, crustAge } = grid;
  for (let i = 0; i < size; i += 1) {
    if (crustType[i] === CrustType.CONTINENTAL) {
      grid.crust[i] = (crustThickness[i] - 0.52) * 1.85;
      grid.isContinental[i] = 1;
    } else if (crustType[i] === CrustType.TRANSITIONAL) {
      grid.crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
      grid.isContinental[i] = 0;
    } else {
      grid.crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
      grid.isContinental[i] = 0;
    }
  }
}

function sampleBilinear(grid, field, x, y) {
  return sampleGridBilinear(grid, field, x, y, 0);
}

function classifyCrustType(thickness, age, previousType) {
  if (previousType === CrustType.CONTINENTAL) {
    if (thickness > 0.48) return CrustType.CONTINENTAL;
    if (thickness > 0.34) return CrustType.TRANSITIONAL;
    return age < 0.24 ? CrustType.TRANSITIONAL : CrustType.OCEANIC;
  }
  if (previousType === CrustType.TRANSITIONAL) {
    if (thickness > 0.56) return CrustType.CONTINENTAL;
    if (thickness < 0.29 && age > 0.32) return CrustType.OCEANIC;
    return CrustType.TRANSITIONAL;
  }
  if (thickness > 0.48 && age < 0.48) return CrustType.TRANSITIONAL;
  return CrustType.OCEANIC;
}

function forEachNeighbor8Local(grid, id, visit) {
  const topology = topologyForGrid(grid);
  if (isGraphBackedGrid(grid, topology)) {
    topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
      const weight = Number.isFinite(edgeLength) && edgeLength > 1e-6 ? edgeLength : 1;
      visit(nid, weight);
    });
    return;
  }
  forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
    visit(nid, dx === 0 || dy === 0 ? 1 : Math.SQRT2);
  });
}

function cleanupPlateCheckerboards(grid) {
  const { size, plate } = grid;
  const topology = topologyForGrid(grid);
  const graphBacked = isGraphBackedGrid(grid, topology);
  const next = new Int32Array(plate);
  let maxPlate = 0;
  for (let i = 0; i < size; i += 1) if (plate[i] > maxPlate) maxPlate = plate[i];
  const counts = new Int16Array(maxPlate + 1);
  const touched = [];
  forEachGridCell(grid, (id, x, y) => {
    const current = plate[id];
    touched.length = 0;
    let same = 0;
    let majorityPlate = current;
    let majorityCount = 0;
    forEachNeighbor8Local(grid, id, (nid) => {
      const other = plate[nid];
      if (other === current) same += 1;
      if (counts[other] === 0) touched.push(other);
      const count = counts[other] + 1;
      counts[other] = count;
      if (count > majorityCount) {
        majorityCount = count;
        majorityPlate = other;
      }
    });

    const checker = graphBacked ? false : isCheckerboardCell(grid, x, y);
    if ((majorityCount >= 5 && same <= 2) || (checker && majorityCount >= 4 && same <= 3)) {
      next[id] = majorityPlate;
    }
    for (const p of touched) counts[p] = 0;
  });
  plate.set(next);
}

function isCheckerboardCell(grid, x, y) {
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
      if (a === d && b === c && a !== b) return true;
    }
  }
  return false;
}

function syncPlateCenterUv(grid, plates, p) {
  if (!plates.centersU || !plates.centersV) return;
  plates.centersU[p] = gridParamToU(grid, plates.centersX[p]);
  plates.centersV[p] = gridParamToV(grid, plates.centersY[p]);
}

function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
  return Boolean(
    grid.topologyOptions?.graphBacked ||
      topology?.topologyKind === "cubed-sphere" ||
      grid.topologyKind === "cubed-sphere",
  );
}
