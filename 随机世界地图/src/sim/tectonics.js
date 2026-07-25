import {
  clampGridParamY,
  forEachGridCell,
  forEachNeighbor4ById,
  forEachNeighbor8ById,
  forEachNeighborRadiusById,
  gridParamHeight,
  gridParamToU,
  gridParamToV,
  gridParamWidth,
  indexOf,
  physicalRadius,
  resolutionScale,
  sampleGridBilinear,
  wrapGridParamX,
  xyOf,
} from "./grid.js";
import { mixSeed, mulberry32 } from "./prng.js";
import { createSphericalPlates } from "./sphere/plates.js";
import { rebuildElevation } from "./terrain.js";

export const BoundaryType = {
  INTERIOR: 0,
  CONVERGENT: 1,
  DIVERGENT: 2,
  TRANSFORM: 3,
};

export function assignPlates(world) {
  const { grid, params, seedUint32 } = world;
  if (isGraphBackedGrid(grid)) {
    const plates = createSphericalPlates({
      seedUint32,
      plateCount: params.plateCount,
      intensity: params.intensity,
    });
    world.plates = plates;
    world.initialSphericalPlates = cloneSphericalPlates(plates);
    world.initialPlateCentersU = null;
    world.initialPlateCentersV = null;
    world.initialPlateCentersX = null;
    world.initialPlateCentersY = null;
    return;
  }

  const width = legacyTectonicsGridParamWidth(grid);
  const height = legacyTectonicsGridParamHeight(grid);
  const plateCount = params.plateCount;
  const random = mulberry32(mixSeed(seedUint32, 0x706c6174));
  const centersU = new Float32Array(plateCount);
  const centersV = new Float32Array(plateCount);
  const centersX = new Float32Array(plateCount);
  const centersY = new Float32Array(plateCount);
  const plateVx = new Float32Array(plateCount);
  const plateVy = new Float32Array(plateCount);

  for (let p = 0; p < plateCount; p += 1) {
    centersU[p] = random();
    centersV[p] = random();
    centersX[p] = centersU[p] * width;
    centersY[p] = centersV[p] * height;

    const angle = random() * Math.PI * 2;
    const speed = (0.35 + random() * 0.65) * params.intensity;
    plateVx[p] = Math.cos(angle) * speed;
    plateVy[p] = Math.sin(angle) * speed;
  }

  world.plates = { centersU, centersV, centersX, centersY, vx: plateVx, vy: plateVy };
  world.initialPlateCentersU = new Float32Array(centersU);
  world.initialPlateCentersV = new Float32Array(centersV);
  world.initialPlateCentersX = new Float32Array(centersX);
  world.initialPlateCentersY = new Float32Array(centersY);
  rasterizePlates(world);
}

function cloneSphericalPlates(plates) {
  return {
    kind: plates.kind,
    count: plates.count,
    centerX: new Float32Array(plates.centerX),
    centerY: new Float32Array(plates.centerY),
    centerZ: new Float32Array(plates.centerZ),
    angularVelocityX: new Float32Array(plates.angularVelocityX),
    angularVelocityY: new Float32Array(plates.angularVelocityY),
    angularVelocityZ: new Float32Array(plates.angularVelocityZ),
    speed: new Float32Array(plates.speed),
  };
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}

export function driftPlates(world) {
  const { grid, plates, params } = world;
  if (!plates) return;
  const driftScale = plateDriftScale(world);

  for (let p = 0; p < plates.centersX.length; p += 1) {
    plates.centersX[p] = legacyTectonicsWrapGridParamX(grid, plates.centersX[p] + plates.vx[p] * driftScale);
    plates.centersY[p] = clampGridParamY(grid, plates.centersY[p] + plates.vy[p] * driftScale);
    syncPlateCenterUv(grid, plates, p);
  }

  const interval = grid.size >= 131072 ? 3 : 2;
  if (world.step > 0 && world.step % interval !== 0) return;
  rasterizePlates(world);
}

function syncPlateCenterUv(grid, plates, p) {
  if (!plates.centersU || !plates.centersV) return;
  plates.centersU[p] = legacyTectonicsGridParamToU(grid, plates.centersX[p]);
  plates.centersV[p] = legacyTectonicsGridParamToV(grid, plates.centersY[p]);
}

function plateDriftScale(world) {
  return 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(world.grid);
}

function rasterizePlates(world) {
  const { grid, plates } = world;
  const { size, plate, pvx, pvy, weakness, crust } = grid;
  const maxCost = size * 8;
  const cost = new Float32Array(size);
  const q = new Int32Array(size * 8);
  let head = 0;
  let tail = 0;
  plate.fill(-1);
  cost.fill(Infinity);

  for (let p = 0; p < plates.centersX.length; p += 1) {
    const x = Math.floor(legacyTectonicsWrapGridParamX(grid, plates.centersX[p]));
    const y = Math.floor(clampGridParamY(grid, plates.centersY[p]));
    const id = legacyTectonicsIndexOf(grid, x, y);
    if (id < 0) continue;
    plate[id] = p;
    cost[id] = 0;
    q[tail] = id;
    tail += 1;
  }

  while (head < tail) {
    const base = q[head];
    const p = plate[base];
    head += 1;
    forEachNeighbor8(grid, base, (nid, weight) => {
      const crustContrast = Math.min(1.2, Math.abs(crust[nid] - crust[base]));
      const stepCost = weight * (1.15 - weakness[nid] * 0.62 + crustContrast * 0.22);
      const nextCost = cost[base] + stepCost;
      if (nextCost + 0.0001 < cost[nid] && nextCost < maxCost && tail < q.length) {
        cost[nid] = nextCost;
        plate[nid] = p;
        q[tail] = nid;
        tail += 1;
      }
    });
  }

  for (let i = 0; i < size; i += 1) {
    const bestPlate = plate[i] < 0 ? 0 : plate[i];
    plate[i] = bestPlate;
    pvx[i] = plates.vx[bestPlate];
    pvy[i] = plates.vy[bestPlate];
  }
  computeBoundaryInfluence(grid);
}

function computeBoundaryInfluence(grid) {
  const { size, plate, boundaryDistance, boundaryInfluence, weakness } = grid;
  const bandRadius = physicalRadius(grid, 4);
  boundaryDistance.fill(9999);
  boundaryInfluence.fill(0);
  const q = new Int32Array(size);
  let head = 0;
  let tail = 0;

  forEachGridCell(grid, (id) => {
    let edge = false;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (plate[nid] !== plate[id]) edge = true;
    });
    if (edge) {
      boundaryDistance[id] = 0;
      q[tail++] = id;
    }
  });

  while (head < tail) {
    const id = q[head++];
    const d = boundaryDistance[id] + 1;
    if (d > bandRadius) continue;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (d < boundaryDistance[nid]) {
        boundaryDistance[nid] = d;
        q[tail++] = nid;
      }
    });
  }

  for (let i = 0; i < size; i += 1) {
    const distanceBand = Math.max(0, 1 - boundaryDistance[i] / bandRadius);
    if (distanceBand <= 0) {
      boundaryInfluence[i] = 0;
    } else {
      const weakPath = 0.45 + weakness[i] * 0.85;
      const segmented = weakness[i] > 0.38 ? 1 : 0.55;
      boundaryInfluence[i] = Math.min(1, distanceBand * weakPath * segmented);
    }
  }
}

export function computeBoundaryStress(world) {
  const { grid } = world;
  const { plate, btype, stress, activeBoundary } = grid;
  btype.fill(BoundaryType.INTERIOR);
  stress.fill(0);
  activeBoundary.fill(0);

  forEachGridCell(grid, (id) => {
    const currentPlate = plate[id];
    let convergent = 0;
    let divergent = 0;
    let shear = 0;
    let touchesBoundary = false;

    forEachNeighbor4ById(grid, id, (nid, dx, dy) => {
      inspectNeighbor(grid, id, nid, dx, dy, currentPlate, (dot, tangential) => {
        touchesBoundary = true;
        if (dot > 0.02) convergent += dot;
        else if (dot < -0.02) divergent += -dot;
        shear += Math.abs(tangential);
      });
    });

    if (!touchesBoundary) return;
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
  });
}

function inspectNeighbor(grid, id, nid, dx, dy, currentPlate, visit) {
  if (grid.plate[nid] === currentPlate) return;

  const rvx = grid.pvx[id] - grid.pvx[nid];
  const rvy = grid.pvy[id] - grid.pvy[nid];
  const dot = rvx * dx + rvy * dy;
  const tangential = rvx * -dy + rvy * dx;
  visit(dot, tangential);
}

export function tectonicStep(world) {
  driftPlates(world);
  advectContinentalCrust(world);
  computeBoundaryStress(world);
  const { grid, params } = world;
  const { size, relief, boundaryRelief, crust, btype, stress, uplift, isContinental, boundaryInfluence, weakness } = grid;
  const dt = world.timeScaleFactor;
  const scale = resolutionScale(grid);
  const strength = params.intensity * Math.sqrt(dt) / Math.sqrt(scale);
  uplift.fill(0);
  boundaryRelief.fill(0);

  for (let i = 0; i < size; i += 1) {
      const s = Math.min(stress[i], 2.5);
      const band = boundaryInfluence[i];
    const rough = 0.38 + weakness[i] * 0.92;
    if (btype[i] === BoundaryType.CONVERGENT) {
      if (isContinental[i] && s > 0.7 && band > 0.75) {
        uplift[i] = s * 0.0049 * strength * band * rough;
        boundaryRelief[i] += s * 0.052 * band * rough;
        crust[i] += s * 0.00055 * strength * band * rough;
      } else {
        boundaryRelief[i] -= s * 0.026 * band * rough;
        crust[i] += s * 0.000025 * strength * band * rough;
      }
    } else if (btype[i] === BoundaryType.DIVERGENT) {
      if (isContinental[i]) {
        uplift[i] = -s * 0.00008 * strength * band * rough;
        boundaryRelief[i] -= s * 0.01 * band * rough;
        crust[i] -= s * 0.000045 * strength * band * rough;
      } else {
        boundaryRelief[i] += s * 0.032 * band * rough;
      }
    } else if (btype[i] === BoundaryType.TRANSFORM) {
      boundaryRelief[i] += (weakness[i] - 0.5) * s * 0.004 * band;
    }
  }

  spreadBoundaryEffects(grid, strength);
  smoothPersistentUplift(grid);
  for (let i = 0; i < size; i += 1) {
    relief[i] = Math.max(-0.45, Math.min(1.25, relief[i] + uplift[i]));
    crust[i] = Math.max(-1.4, Math.min(1.4, crust[i]));
  }

  smoothCrustNearBoundaries(grid);
  smoothBoundaryRelief(grid);
  rebuildElevation(world);
}

function advectContinentalCrust(world) {
  const { grid } = world;
  const {
    size,
    crust,
    crustReference,
    relief,
    pvx,
    pvy,
    isContinental,
    boundaryInfluence,
    btype,
    scratch,
    scratch2,
    scratch3,
  } = grid;
  const interval = 4;
  if (world.step > 0 && world.step % interval !== 0) return;
  const scale = plateDriftScale(world) * interval;
  if (scale <= 0) return;

  scratch.set(crust);
  scratch2.set(crustReference);
  scratch3.set(relief);

  forEachGridCell(grid, (id, x, y) => {
    const sx = x - pvx[id] * scale;
    const sy = y - pvy[id] * scale;
    const movedCrust = sampleBilinear(grid, scratch, sx, sy);
    const movedReference = sampleBilinear(grid, scratch2, sx, sy);
    const movedRelief = sampleBilinear(grid, scratch3, sx, sy);
    const active = Math.min(1, boundaryInfluence[id]);
    const continental = movedCrust > 0;
    const crustMix = continental ? 0.88 - active * 0.22 : 0.82;
    const reliefMix = continental ? 0.86 - active * 0.28 : 0.42;
    const stretchingBoundary = btype[id] === BoundaryType.DIVERGENT || btype[id] === BoundaryType.TRANSFORM;
    const boundaryConsumption = continental && stretchingBoundary ? active * active * 0.006 : 0;

    crust[id] = scratch[id] * (1 - crustMix) + movedCrust * crustMix - boundaryConsumption;
    crustReference[id] = scratch2[id] * (1 - crustMix) + movedReference * crustMix;
    relief[id] = scratch3[id] * (1 - reliefMix) + movedRelief * reliefMix;
    isContinental[id] = crust[id] > 0 ? 1 : 0;
  });
  rebuildElevation(world);
}

function sampleBilinear(grid, field, x, y) {
  return legacyTectonicsSampleBilinear(grid, field, x, y, 0);
}

function spreadBoundaryEffects(grid, strength) {
  const { uplift, boundaryRelief, crust, btype, stress, isContinental, boundaryInfluence, weakness } = grid;
  const effectRadius = physicalRadius(grid, 3);
  forEachGridCell(grid, (id) => {
    const type = btype[id];
    if (type === BoundaryType.INTERIOR) return;
    const s = Math.min(stress[id], 2.5);
    forEachNeighborRadius(grid, id, effectRadius, (nid, weight) => {
      const band = Math.max(0, boundaryInfluence[nid]);
      const rough = 0.65 + weakness[nid] * 0.55;
      if (type === BoundaryType.CONVERGENT) {
        if (isContinental[nid] && s > 0.9 && band > 0.55) {
          const d = s * 0.00042 * strength * weight * band * rough;
          uplift[nid] += d;
          boundaryRelief[nid] += s * 0.086 * weight * band * rough;
          crust[nid] = Math.min(1.4, crust[nid] + s * 0.00008 * strength * weight * band * rough);
        } else {
          boundaryRelief[nid] -= s * 0.024 * weight * band * rough;
        }
      } else if (type === BoundaryType.DIVERGENT && isContinental[nid]) {
        const d = s * 0.000025 * strength * weight * band * rough;
        uplift[nid] -= d;
        crust[nid] = Math.max(-1.4, crust[nid] - s * 0.000025 * strength * weight * band * rough);
      } else if (type === BoundaryType.DIVERGENT) {
        boundaryRelief[nid] += s * 0.03 * weight * band * rough;
      }
    });
  });
}

function smoothPersistentUplift(grid) {
  const { uplift, scratch, isContinental, boundaryInfluence, weakness } = grid;
  const upliftRadius = physicalRadius(grid, 3);
  scratch.set(uplift);
  forEachGridCell(grid, (id) => {
    if (!isContinental[id]) return;
    if (boundaryInfluence[id] < 0.05 && Math.abs(scratch[id]) < 0.000001) return;
    let total = scratch[id] * 2.8;
    let weightSum = 2.8;
    let signal = Math.abs(scratch[id]) * 2.8;
    forEachNeighborRadius(grid, id, upliftRadius, (nid, weight) => {
      if (!isContinental[nid]) return;
      const belt = Math.max(0.15, boundaryInfluence[nid]);
      const rough = 0.78 + weakness[nid] * 0.44;
      const w = weight * belt * rough;
      const warped = warpedNeighborId(grid, nid, weakness[nid]);
      total += scratch[warped] * w;
      weightSum += w;
      signal += Math.abs(scratch[warped]) * w;
    });
    if (signal < 0.000001) return;
    uplift[id] = total / weightSum;
  });
}

function forEachNeighbor8(grid, id, visit) {
  forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
    visit(nid, dx === 0 || dy === 0 ? 1 : 0.55);
  });
}

function forEachNeighborRadius(grid, id, radius, visit) {
  const scale = resolutionScale(grid);
  forEachNeighborRadiusById(grid, id, radius, (nid, dx, dy) => {
    const dist = Math.hypot(dx, dy);
    visit(nid, 1 / (1 + (dist / scale) * 1.35));
  });
}

function smoothCrustNearBoundaries(grid) {
  const { crust, boundaryInfluence, isContinental, scratch } = grid;
  scratch.set(crust);
  forEachGridCell(grid, (id) => {
    const influence = boundaryInfluence[id];
    if (influence < 0.35) return;
    let total = scratch[id] * 2;
    let count = 2;
    forEachNeighbor4ById(grid, id, (nid) => {
      total += scratch[nid];
      count += 1;
    });
    const blend = influence * (isContinental[id] ? 0.08 : 0.18);
    crust[id] = scratch[id] * (1 - blend) + (total / count) * blend;
  });
}

function smoothBoundaryRelief(grid) {
  const { boundaryRelief, scratch, boundaryInfluence, weakness } = grid;
  const reliefRadius = physicalRadius(grid, 3);
  scratch.set(boundaryRelief);
  forEachGridCell(grid, (id) => {
    if (boundaryInfluence[id] < 0.05 && Math.abs(scratch[id]) < 0.0001) return;
    let total = scratch[id] * 2.4;
    let weightSum = 2.4;
    let signal = Math.abs(scratch[id]) * 2.4;
    forEachNeighborRadius(grid, id, reliefRadius, (nid, weight) => {
      const band = Math.max(0.08, boundaryInfluence[nid]);
      const rough = 0.7 + weakness[nid] * 0.5;
      const w = weight * band * rough;
      const warped = warpedNeighborId(grid, nid, weakness[nid]);
      total += scratch[warped] * w;
      weightSum += w;
      signal += Math.abs(scratch[warped]) * w;
    });
    if (signal < 0.0001) return;
    boundaryRelief[id] = total / weightSum;
  });
}

function warpedNeighborId(grid, id, weak) {
  const { x, y } = legacyTectonicsXyOf(grid, id);
  const bend = Math.round((weak - 0.5) * 2 * resolutionScale(grid));
  const warped = legacyTectonicsIndexOf(grid, x + bend, y - bend);
  return warped >= 0 ? warped : id;
}

function legacyTectonicsGridParamWidth(grid) {
  return gridParamWidth(grid);
}

function legacyTectonicsGridParamHeight(grid) {
  return gridParamHeight(grid);
}

function legacyTectonicsWrapGridParamX(grid, x) {
  return wrapGridParamX(grid, x);
}

function legacyTectonicsGridParamToU(grid, x) {
  return gridParamToU(grid, x);
}

function legacyTectonicsGridParamToV(grid, y) {
  return gridParamToV(grid, y);
}

function legacyTectonicsIndexOf(grid, x, y) {
  return indexOf(grid, x, y);
}

function legacyTectonicsSampleBilinear(grid, field, x, y, fallback) {
  return sampleGridBilinear(grid, field, x, y, fallback);
}

function legacyTectonicsXyOf(grid, id) {
  return xyOf(grid, id);
}
