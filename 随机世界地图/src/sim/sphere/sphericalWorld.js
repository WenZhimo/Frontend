import { createCubedSphereGrid } from "./cubedSphere.js";
import { createValueNoise3D } from "../noise.js";
import { mixSeed } from "../prng.js";
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
import { createSphericalTopology } from "./topology.js";
import {
  finiteShare,
  maxFinite,
  weightedCategoryShares,
  weightedShare,
} from "./stats.js";

const DIAGNOSTIC_NOISE_SALT = 0x5f51d3ed;

export function createSphericalExperimentalWorld({
  seedUint32 = 0,
  seedText = "",
  faceSize = 64,
  plateCount = 14,
  intensity = 1,
  steps = 0,
} = {}) {
  const grid = createCubedSphereGrid(faceSize);
  const topology = createSphericalTopology(grid);
  const plates = createSphericalPlates({ seedUint32, plateCount, intensity });
  const initialPlates = cloneSphericalPlates(plates);

  for (let i = 0; i < steps; i += 1) driftSphericalPlates(plates, 1);

  const plateAssignment = assignNearestSphericalPlates(grid, plates);
  const boundaries = classifySphericalPlateBoundaries(grid, plates, plateAssignment);
  const boundarySummary = summarizeSphericalBoundaries(grid, boundaries);
  const diagnosticNoise = createSphericalDiagnosticNoiseFields(grid, seedUint32);
  const diagnosticTerrain = createSphericalDiagnosticTerrainFields(grid, diagnosticNoise, boundaries);
  const geometricSeaMask = createDiagnosticSeaMask(grid);
  const seaMask = diagnosticTerrain.seaCandidate;
  const connectivity = deriveSphericalOceanConnectivity(grid, seaMask);
  const distanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);

  return {
    kind: "spherical-experimental-world",
    seedText,
    seedUint32,
    grid,
    topology,
    plates,
    initialPlates,
    plateAssignment,
    boundaries,
    boundarySummary,
    geometricSeaMask,
    seaMask,
    connectivity,
    distanceToExternalSea,
    diagnosticNoise,
    diagnosticTerrain,
    stats: summarizeSphericalExperimentalWorld({
      grid,
      topology,
      plates,
      initialPlates,
      plateAssignment,
      boundaries,
      boundarySummary,
      geometricSeaMask,
      seaMask,
      connectivity,
      distanceToExternalSea,
      diagnosticNoise,
      diagnosticTerrain,
    }),
  };
}

export function summarizeSphericalExperimentalWorld(world) {
  const grid = world.grid;
  return {
    topologyKind: grid.topologyKind,
    topologyApiKind: world.topology?.topologyKind ?? null,
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
    geometricSeaShare: weightedShare(grid, world.geometricSeaMask),
    derivedSeaShare: weightedShare(grid, world.seaMask),
    geometricDerivedSeaOverlapShare: weightedOverlapShare(grid, world.geometricSeaMask, world.seaMask),
    externalSeaShare: weightedShare(grid, world.connectivity.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, world.connectivity.inlandWaterCandidate),
    closedBasinCount: world.connectivity.closedBasinCount,
    distanceToExternalSeaFiniteShare: finiteShare(world.distanceToExternalSea),
    distanceToExternalSeaMax: maxFinite(world.distanceToExternalSea),
    diagnosticBroadNoiseMean: weightedMean(grid, world.diagnosticNoise.broad),
    diagnosticMicroNoiseMean: weightedMean(grid, world.diagnosticNoise.micro),
    diagnosticNoiseRange: maxFinite(world.diagnosticNoise.combined) - minFinite(world.diagnosticNoise.combined),
    diagnosticElevationMean: weightedMean(grid, world.diagnosticTerrain.elevation),
    diagnosticElevationRange: maxFinite(world.diagnosticTerrain.elevation) - minFinite(world.diagnosticTerrain.elevation),
    diagnosticSeaCandidateShare: weightedShare(grid, world.diagnosticTerrain.seaCandidate),
  };
}

export function createSphericalDiagnosticNoiseFields(grid, seedUint32 = 0) {
  const noise = createValueNoise3D(mixSeed(seedUint32, DIAGNOSTIC_NOISE_SALT));
  const broad = new Float32Array(grid.size);
  const micro = new Float32Array(grid.size);
  const combined = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    broad[id] = noise(x * 2.1 + 31, y * 2.1 - 17, z * 2.1 + 5, 5, 2, 0.52);
    micro[id] = noise(x * 8.5 - 7, y * 8.5 + 3, z * 8.5 + 23, 3, 2.2, 0.45);
    combined[id] = broad[id] * 0.72 + micro[id] * 0.28;
  }
  return { broad, micro, combined };
}

export function createSphericalDiagnosticTerrainFields(grid, diagnosticNoise, boundaries) {
  const elevation = new Float32Array(grid.size);
  const seaCandidate = new Uint8Array(grid.size);
  const ridgeCandidate = new Float32Array(grid.size);
  const trenchCandidate = new Float32Array(grid.size);
  const targetSeaShare = 0.58;

  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    const latitudeLift = y * 0.05;
    const basinWave =
      Math.sin(x * 2.2 + z * 1.4) * 0.18 +
      Math.cos(z * 2.0 - y * 1.3) * 0.16 -
      Math.sin((x - y + z) * 1.15) * 0.12;
    const noiseRelief = diagnosticNoise.combined[id] * 0.18 + diagnosticNoise.broad[id] * 0.22;
    const divergent = boundaries.boundaryType[id] === 2 ? boundaries.stress[id] * 42 : 0;
    const convergent = boundaries.boundaryType[id] === 1 ? boundaries.stress[id] * 36 : 0;
    ridgeCandidate[id] = divergent;
    trenchCandidate[id] = convergent;
    elevation[id] = basinWave + noiseRelief + latitudeLift + divergent * 0.12 - convergent * 0.08;
  }

  const seaLevel = areaWeightedQuantile(grid, elevation, targetSeaShare);
  for (let id = 0; id < grid.size; id += 1) {
    if (elevation[id] <= seaLevel) seaCandidate[id] = 1;
  }

  return { elevation, seaCandidate, ridgeCandidate, trenchCandidate, seaLevel };
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

function weightedMean(grid, field) {
  let total = 0;
  let weight = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    total += field[id] * area;
    weight += area;
  }
  return total / Math.max(weight, Number.EPSILON);
}

function weightedOverlapShare(grid, a, b) {
  let overlap = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    total += area;
    if (a[id] && b[id]) overlap += area;
  }
  return overlap / Math.max(total, Number.EPSILON);
}

function areaWeightedQuantile(grid, field, targetShare) {
  const samples = [];
  let totalArea = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    samples.push({ value: field[id], area });
    totalArea += area;
  }
  samples.sort((a, b) => a.value - b.value);
  const targetArea = totalArea * Math.max(0, Math.min(1, targetShare));
  let cumulative = 0;
  for (const sample of samples) {
    cumulative += sample.area;
    if (cumulative >= targetArea) return sample.value;
  }
  return samples[samples.length - 1]?.value ?? 0;
}

function minFinite(field) {
  let min = Infinity;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i]) && field[i] < min) min = field[i];
  }
  return min;
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
  const { areaByCategory: areaByPlate, totalArea: total } = weightedCategoryShares(grid, plate, plateCount);
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
