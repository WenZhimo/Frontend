import { forEachNeighbor4, resolutionScale, wrapX } from "../grid.js";
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
  const drift = 0.1 * world.timeScaleFactor * Math.max(0, params.intensity) * resolutionScale(grid);
  for (let p = 0; p < plates.centersX.length; p += 1) {
    plates.centersX[p] = wrapX(grid.width, plates.centersX[p] + plates.vx[p] * drift);
    plates.centersY[p] = Math.max(0, Math.min(grid.height - 1, plates.centersY[p] + plates.vy[p] * drift));
    syncPlateCenterUv(grid, plates, p);
  }
}

export function rasterizePlatesV2(world) {
  const { grid, plates } = world;
  if (!plates) return;
  const { width, height, size, plate, pvx, pvy, weakness, crustThickness } = grid;
  const cost = new Float32Array(size);
  const q = new Int32Array(size * 8);
  let head = 0;
  let tail = 0;
  plate.fill(-1);
  cost.fill(Infinity);

  for (let p = 0; p < plates.centersX.length; p += 1) {
    const x = Math.floor(wrapX(width, plates.centersX[p]));
    const y = Math.max(0, Math.min(height - 1, Math.floor(plates.centersY[p])));
    const id = y * width + x;
    plate[id] = p;
    cost[id] = 0;
    q[tail++] = id;
  }

  while (head < tail) {
    const id = q[head++];
    const p = plate[id];
    const x = id % width;
    const y = Math.floor(id / width);
    forEachNeighbor8Local(grid, x, y, (nx, ny, weight) => {
      const nid = ny * width + nx;
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

export function advectCrustByPlateMotion(world) {
  const { grid } = world;
  const interval = 4;
  if (world.step > 0 && world.step % interval !== 0) return;

  const { width, height, size, pvx, pvy, crustType, crustThickness, crustAge, orogeny, sediment, scratch, scratch2, scratch3 } = grid;
  const drift = 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(grid) * interval;
  if (drift <= 0) return;

  scratch.set(crustThickness);
  scratch2.set(crustAge);
  scratch3.set(orogeny);
  const sedimentSource = new Float32Array(sediment);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const previousType = crustType[id];
      const sx = x - pvx[id] * drift;
      const sy = y - pvy[id] * drift;
      crustThickness[id] = sampleBilinear(grid, scratch, sx, sy);
      if (previousType !== CrustType.OCEANIC) crustAge[id] = sampleBilinear(grid, scratch2, sx, sy);
      orogeny[id] = sampleBilinear(grid, scratch3, sx, sy) * 0.992;
      sediment[id] = sampleBilinear(grid, sedimentSource, sx, sy) * 0.998;
      crustType[id] = classifyCrustType(crustThickness[id], crustAge[id], crustType[id]);
    }
  }

  // Keep legacy compatibility fields coherent without making them the source of truth.
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
  const sx = wrapX(grid.width, x);
  const sy = Math.max(0, Math.min(grid.height - 1.001, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = wrapX(grid.width, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const a = field[y0 * grid.width + x0] * (1 - tx) + field[y0 * grid.width + x1] * tx;
  const b = field[y1 * grid.width + x0] * (1 - tx) + field[y1 * grid.width + x1] * tx;
  return a * (1 - ty) + b * ty;
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

function forEachNeighbor8Local(grid, x, y, visit) {
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= grid.height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      visit(wrapX(grid.width, x + dx), ny, dx === 0 || dy === 0 ? 1 : Math.SQRT2);
    }
  }
}

function cleanupPlateCheckerboards(grid) {
  const { width, height, size, plate } = grid;
  const next = new Int32Array(plate);
  let maxPlate = 0;
  for (let i = 0; i < size; i += 1) if (plate[i] > maxPlate) maxPlate = plate[i];
  const counts = new Int16Array(maxPlate + 1);
  const touched = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const current = plate[id];
      touched.length = 0;
      let same = 0;
      let majorityPlate = current;
      let majorityCount = 0;
      forEachNeighbor8Local(grid, x, y, (nx, ny) => {
        const other = plate[ny * width + nx];
        if (other === current) same += 1;
        if (counts[other] === 0) touched.push(other);
        const count = counts[other] + 1;
        counts[other] = count;
        if (count > majorityCount) {
          majorityCount = count;
          majorityPlate = other;
        }
      });

      const checker = isCheckerboardCell(grid, x, y);
      if ((majorityCount >= 5 && same <= 2) || (checker && majorityCount >= 4 && same <= 3)) {
        next[id] = majorityPlate;
      }
      for (const p of touched) counts[p] = 0;
    }
  }
  plate.set(next);
}

function isCheckerboardCell(grid, x, y) {
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
      if (a === d && b === c && a !== b) return true;
    }
  }
  return false;
}

function syncPlateCenterUv(grid, plates, p) {
  if (!plates.centersU || !plates.centersV) return;
  plates.centersU[p] = wrapX(grid.width, plates.centersX[p]) / grid.width;
  plates.centersV[p] = Math.max(0, Math.min(1, plates.centersY[p] / grid.height));
}
