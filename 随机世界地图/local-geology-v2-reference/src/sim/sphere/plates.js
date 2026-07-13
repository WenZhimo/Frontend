import { angularDistance3, cross3, dot3, normalize3, rotateAroundAxis, TAU } from "./vector.js";
import { mixSeed, mulberry32 } from "../prng.js";

const PLATE_SALT = 0x73706c74;
const SPEED_SALT = 0x73707665;

export function createSphericalPlates({ seedUint32, plateCount = 14, intensity = 1 } = {}) {
  const count = Math.max(1, Math.trunc(plateCount));
  const centerX = new Float32Array(count);
  const centerY = new Float32Array(count);
  const centerZ = new Float32Array(count);
  const angularVelocityX = new Float32Array(count);
  const angularVelocityY = new Float32Array(count);
  const angularVelocityZ = new Float32Array(count);
  const speed = new Float32Array(count);

  const centerRandom = mulberry32(mixSeed(seedUint32 ?? 0, PLATE_SALT));
  const speedRandom = mulberry32(mixSeed(seedUint32 ?? 0, SPEED_SALT));

  for (let p = 0; p < count; p += 1) {
    const center = fibonacciSpherePoint(p, count, centerRandom);
    const axisSeed = randomUnitVector(speedRandom);
    const tangentAxis = tangentOrFallback(axisSeed, center);
    const spin = (0.0008 + speedRandom() * 0.0018) * Math.max(0, intensity);

    centerX[p] = center.x;
    centerY[p] = center.y;
    centerZ[p] = center.z;
    angularVelocityX[p] = tangentAxis.x * spin;
    angularVelocityY[p] = tangentAxis.y * spin;
    angularVelocityZ[p] = tangentAxis.z * spin;
    speed[p] = spin;
  }

  return {
    kind: "spherical-plates",
    count,
    centerX,
    centerY,
    centerZ,
    angularVelocityX,
    angularVelocityY,
    angularVelocityZ,
    speed,
  };
}

export function driftSphericalPlates(plates, deltaTime = 1) {
  for (let p = 0; p < plates.count; p += 1) {
    const wx = plates.angularVelocityX[p];
    const wy = plates.angularVelocityY[p];
    const wz = plates.angularVelocityZ[p];
    const angularSpeed = Math.hypot(wx, wy, wz);
    if (angularSpeed <= 0) continue;
    const center = {
      x: plates.centerX[p],
      y: plates.centerY[p],
      z: plates.centerZ[p],
    };
    const axis = normalize3(wx, wy, wz);
    const next = rotateAroundAxis(center, axis, angularSpeed * deltaTime);
    plates.centerX[p] = next.x;
    plates.centerY[p] = next.y;
    plates.centerZ[p] = next.z;
  }
}

export function assignNearestSphericalPlates(grid, plates) {
  const plate = new Int32Array(grid.size);
  const distance = new Float32Array(grid.size);

  for (let id = 0; id < grid.size; id += 1) {
    let bestPlate = 0;
    let bestDot = -Infinity;
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    for (let p = 0; p < plates.count; p += 1) {
      const d = dot3(x, y, z, plates.centerX[p], plates.centerY[p], plates.centerZ[p]);
      if (d > bestDot) {
        bestDot = d;
        bestPlate = p;
      }
    }
    plate[id] = bestPlate;
    distance[id] = Math.acos(Math.max(-1, Math.min(1, bestDot)));
  }

  return { plate, distance };
}

export function sphericalPlateVelocityAt(plates, plateId, x, y, z) {
  return cross3(
    plates.angularVelocityX[plateId],
    plates.angularVelocityY[plateId],
    plates.angularVelocityZ[plateId],
    x,
    y,
    z,
  );
}

export const SphericalBoundaryType = {
  INTERIOR: 0,
  CONVERGENT: 1,
  DIVERGENT: 2,
  TRANSFORM: 3,
};

export function classifySphericalPlateBoundaries(grid, plates, assignment, options = {}) {
  const plate = assignment.plate ?? assignment;
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.000025;
  const boundaryType = new Uint8Array(grid.size);
  const stress = new Float32Array(grid.size);
  const activeBoundary = new Uint8Array(grid.size);
  const normalMotion = new Float32Array(grid.size);
  const shearMotion = new Float32Array(grid.size);

  for (let id = 0; id < grid.size; id += 1) {
    const currentPlate = plate[id];
    let convergent = 0;
    let divergent = 0;
    let shear = 0;
    let touchesBoundary = false;
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];

    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (plate[nid] === currentPlate) continue;
      touchesBoundary = true;
      const split = splitSphericalBoundaryMotion(grid, plates, id, nid, currentPlate, plate[nid]);
      if (split.normal > threshold) divergent += split.normal;
      else if (split.normal < -threshold) convergent += -split.normal;
      shear += Math.abs(split.shear);
    }

    if (!touchesBoundary) continue;
    activeBoundary[id] = 1;
    normalMotion[id] = divergent - convergent;
    shearMotion[id] = shear;
    if (convergent > divergent && convergent > shear * 0.55) {
      boundaryType[id] = SphericalBoundaryType.CONVERGENT;
      stress[id] = convergent;
    } else if (divergent > convergent && divergent > shear * 0.55) {
      boundaryType[id] = SphericalBoundaryType.DIVERGENT;
      stress[id] = divergent;
    } else {
      boundaryType[id] = SphericalBoundaryType.TRANSFORM;
      stress[id] = shear * 0.5;
    }
  }

  return {
    boundaryType,
    stress,
    activeBoundary,
    normalMotion,
    shearMotion,
  };
}

export function summarizeSphericalBoundaries(grid, classified) {
  const counts = {
    interior: 0,
    convergent: 0,
    divergent: 0,
    transform: 0,
    faceSeamBoundary: 0,
    activeBoundary: 0,
  };
  const areas = {
    total: 0,
    interior: 0,
    convergent: 0,
    divergent: 0,
    transform: 0,
    faceSeamBoundary: 0,
    activeBoundary: 0,
  };
  let stressTotal = 0;
  let stressMax = 0;
  let seamBoundaryStress = 0;

  for (let id = 0; id < grid.size; id += 1) {
    const type = classified.boundaryType[id];
    const area = grid.area?.[id] ?? 1;
    areas.total += area;
    if (type === SphericalBoundaryType.CONVERGENT) {
      counts.convergent += 1;
      areas.convergent += area;
    } else if (type === SphericalBoundaryType.DIVERGENT) {
      counts.divergent += 1;
      areas.divergent += area;
    } else if (type === SphericalBoundaryType.TRANSFORM) {
      counts.transform += 1;
      areas.transform += area;
    } else {
      counts.interior += 1;
      areas.interior += area;
    }

    if (!classified.activeBoundary[id]) continue;
    counts.activeBoundary += 1;
    areas.activeBoundary += area;
    const stress = classified.stress[id];
    stressTotal += stress * area;
    stressMax = Math.max(stressMax, stress);
    if (touchesFaceSeam(grid, id)) {
      counts.faceSeamBoundary += 1;
      areas.faceSeamBoundary += area;
      seamBoundaryStress += stress * area;
    }
  }

  const active = Math.max(1, counts.activeBoundary);
  const activeArea = Math.max(areas.activeBoundary, Number.EPSILON);
  return {
    ...counts,
    activeBoundaryArea: areas.activeBoundary,
    activeBoundaryCellShare: counts.activeBoundary / Math.max(1, grid.size),
    activeBoundaryShare: areas.activeBoundary / Math.max(areas.total, Number.EPSILON),
    convergentShareOfActive: areas.convergent / activeArea,
    divergentShareOfActive: areas.divergent / activeArea,
    transformShareOfActive: areas.transform / activeArea,
    faceSeamBoundaryShareOfActive: areas.faceSeamBoundary / activeArea,
    convergentCellShareOfActive: counts.convergent / active,
    divergentCellShareOfActive: counts.divergent / active,
    transformCellShareOfActive: counts.transform / active,
    stressMean: stressTotal / activeArea,
    stressMax,
    faceSeamStressMean: seamBoundaryStress / Math.max(areas.faceSeamBoundary, Number.EPSILON),
  };
}

export function measureSphericalPlateDrift(initialPlates, currentPlates) {
  let total = 0;
  for (let p = 0; p < currentPlates.count; p += 1) {
    total += angularDistance3(
      initialPlates.centerX[p],
      initialPlates.centerY[p],
      initialPlates.centerZ[p],
      currentPlates.centerX[p],
      currentPlates.centerY[p],
      currentPlates.centerZ[p],
    );
  }
  return total / Math.max(1, currentPlates.count);
}

function splitSphericalBoundaryMotion(grid, plates, id, nid, plateA, plateB) {
  const ax = grid.positionX[id];
  const ay = grid.positionY[id];
  const az = grid.positionZ[id];
  const bx = grid.positionX[nid];
  const by = grid.positionY[nid];
  const bz = grid.positionZ[nid];
  const va = sphericalPlateVelocityAt(plates, plateA, ax, ay, az);
  const vb = sphericalPlateVelocityAt(plates, plateB, bx, by, bz);
  const rvx = vb.x - va.x;
  const rvy = vb.y - va.y;
  const rvz = vb.z - va.z;
  const mid = normalize3(ax + bx, ay + by, az + bz);
  const rawNormal = normalize3(bx - ax, by - ay, bz - az);
  const normalDotRadial = dot3(rawNormal.x, rawNormal.y, rawNormal.z, mid.x, mid.y, mid.z);
  const normal = normalize3(
    rawNormal.x - mid.x * normalDotRadial,
    rawNormal.y - mid.y * normalDotRadial,
    rawNormal.z - mid.z * normalDotRadial,
  );
  const tangent = cross3(mid.x, mid.y, mid.z, normal.x, normal.y, normal.z);
  return {
    normal: rvx * normal.x + rvy * normal.y + rvz * normal.z,
    shear: rvx * tangent.x + rvy * tangent.y + rvz * tangent.z,
  };
}

function touchesFaceSeam(grid, id) {
  const face = grid.face[id];
  const start = grid.neighborStart[id];
  const count = grid.neighborCount[id];
  for (let k = 0; k < count; k += 1) {
    if (grid.face[grid.neighbors[start + k]] !== face) return true;
  }
  return false;
}

function fibonacciSpherePoint(index, count, random) {
  const jitter = random();
  const k = index + jitter;
  const y = 1 - (2 * k + 1) / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = (k * goldenAngle + random() * TAU) % TAU;
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
  };
}

function randomUnitVector(random) {
  const z = random() * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  const theta = random() * TAU;
  return {
    x: Math.cos(theta) * radius,
    y: z,
    z: Math.sin(theta) * radius,
  };
}

function tangentOrFallback(axisSeed, center) {
  const projectedDot = dot3(axisSeed.x, axisSeed.y, axisSeed.z, center.x, center.y, center.z);
  let tangent = normalize3(
    axisSeed.x - center.x * projectedDot,
    axisSeed.y - center.y * projectedDot,
    axisSeed.z - center.z * projectedDot,
  );
  if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.0001) {
    tangent = normalize3(-center.z, 0, center.x);
  }
  return tangent;
}
