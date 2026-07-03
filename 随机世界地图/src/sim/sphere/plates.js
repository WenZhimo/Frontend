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
