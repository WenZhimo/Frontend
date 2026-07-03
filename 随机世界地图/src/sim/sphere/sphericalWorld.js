import { createCubedSphereGrid } from "./cubedSphere.js";
import {
  assignNearestSphericalPlates,
  classifySphericalPlateBoundaries,
  createSphericalPlates,
  driftSphericalPlates,
  measureSphericalPlateDrift,
  summarizeSphericalBoundaries,
} from "./plates.js";
import {
  deriveSphericalOceanConnectivity,
  distanceFromGraphSources,
} from "./topologyGraph.js";

export function createSphericalExperimentalWorld({
  seedUint32 = 0,
  seedText = "",
  faceSize = 64,
  plateCount = 14,
  intensity = 1,
  steps = 0,
} = {}) {
  const grid = createCubedSphereGrid(faceSize);
  const plates = createSphericalPlates({ seedUint32, plateCount, intensity });
  const initialPlates = cloneSphericalPlates(plates);

  for (let i = 0; i < steps; i += 1) driftSphericalPlates(plates, 1);

  const plateAssignment = assignNearestSphericalPlates(grid, plates);
  const boundaries = classifySphericalPlateBoundaries(grid, plates, plateAssignment);
  const boundarySummary = summarizeSphericalBoundaries(grid, boundaries);
  const seaMask = createDiagnosticSeaMask(grid);
  const connectivity = deriveSphericalOceanConnectivity(grid, seaMask);
  const distanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);

  return {
    kind: "spherical-experimental-world",
    seedText,
    seedUint32,
    grid,
    plates,
    initialPlates,
    plateAssignment,
    boundaries,
    boundarySummary,
    seaMask,
    connectivity,
    distanceToExternalSea,
    stats: summarizeSphericalExperimentalWorld({
      grid,
      plates,
      initialPlates,
      plateAssignment,
      boundaries,
      boundarySummary,
      seaMask,
      connectivity,
      distanceToExternalSea,
    }),
  };
}

export function summarizeSphericalExperimentalWorld(world) {
  const grid = world.grid;
  return {
    topologyKind: grid.topologyKind,
    faceSize: grid.faceSize,
    cellCount: grid.size,
    plateCount: world.plates.count,
    meanPlateDriftRadians: measureSphericalPlateDrift(world.initialPlates, world.plates),
    plateCoverage: measurePlateCoverage(grid, world.plateAssignment.plate, world.plates.count),
    activeBoundaryShare: world.boundarySummary.activeBoundaryShare,
    convergentShareOfActive: world.boundarySummary.convergentShareOfActive,
    divergentShareOfActive: world.boundarySummary.divergentShareOfActive,
    transformShareOfActive: world.boundarySummary.transformShareOfActive,
    faceSeamBoundaryShareOfActive: world.boundarySummary.faceSeamBoundaryShareOfActive,
    externalSeaShare: weightedShare(grid, world.connectivity.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, world.connectivity.inlandWaterCandidate),
    closedBasinCount: world.connectivity.closedBasinCount,
    distanceToExternalSeaFiniteShare: finiteShare(world.distanceToExternalSea),
    distanceToExternalSeaMax: maxFinite(world.distanceToExternalSea),
  };
}

function createDiagnosticSeaMask(grid) {
  const seaMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    const externalOcean = y < 0.24 || (z > 0.28 && x < 0.18);
    const closedBasin = x > 0.34 && x < 0.62 && y > 0.38 && z > -0.18 && z < 0.28;
    if (externalOcean || closedBasin) seaMask[id] = 1;
  }
  return seaMask;
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

function measurePlateCoverage(grid, plate, plateCount) {
  const areaByPlate = new Float64Array(plateCount);
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area[id] ?? 1;
    total += area;
    areaByPlate[plate[id]] += area;
  }
  let min = Infinity;
  let max = 0;
  let emptyCount = 0;
  for (let p = 0; p < plateCount; p += 1) {
    const share = areaByPlate[p] / Math.max(total, Number.EPSILON);
    min = Math.min(min, share);
    max = Math.max(max, share);
    if (areaByPlate[p] <= 0) emptyCount += 1;
  }
  return {
    min,
    max,
    mean: 1 / Math.max(1, plateCount),
    emptyCount,
  };
}

function weightedShare(grid, mask) {
  let total = 0;
  let covered = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area[id] ?? 1;
    total += area;
    if (mask[id]) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function finiteShare(field) {
  let finite = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i])) finite += 1;
  }
  return finite / Math.max(1, field.length);
}

function maxFinite(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i]) && field[i] > max) max = field[i];
  }
  return max;
}
