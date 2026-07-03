import { createGrid } from "./grid.js";
import { hashSeed } from "./prng.js";
import { createCubedSphereGrid } from "./sphere/cubedSphere.js";
import { initializeBaseTerrain, initializeSeaLevel, updateSeaLevel } from "./terrain.js";
import { assignPlates, computeBoundaryStress } from "./tectonics.js";
import { updatePlateBoundaries } from "./geology/boundaries.js";
import { rasterizePlatesV2 } from "./geology/plates.js";

export const PipelineMode = {
  LEGACY: "legacy",
  GEOLOGY_V2: "geology-v2",
};

export const TopologyMode = {
  CYLINDRICAL: "cylindrical",
  CUBED_SPHERE: "cubed-sphere",
};

export const ProjectionMode = {
  EQUIRECTANGULAR: "equirectangular",
  ORTHOGRAPHIC: "orthographic",
  DEBUG_FACE: "debug-face",
};

export function createWorld(params) {
  const normalizedParams = normalizeParams(params);
  const [width, height] = normalizedParams.resolution.split("x").map(Number);
  const seedUint32 = hashSeed(normalizedParams.seedText);
  const grid = createGrid(width, height);
  const world = {
    grid,
    sphericalGrid: createExperimentalSphericalGrid(normalizedParams),
    params: normalizedParams,
    seedUint32,
    step: 0,
    ageYears: 0,
    timeScaleFactor: timeScaleFactor(normalizedParams.timeScale),
    seaLevel: 0,
    waterVolume: 0,
    plates: null,
    continentNoise: null,
    textureNoise: null,
    initialPlateCentersX: null,
    initialPlateCentersY: null,
    stats: {},
  };
  initializeBaseTerrain(world);
  assignPlates(world);
  initializeSeaLevel(world);
  if (world.params.pipelineMode === PipelineMode.GEOLOGY_V2) {
    rasterizePlatesV2(world);
    updatePlateBoundaries(world);
  } else {
    computeBoundaryStress(world);
  }
  updateSeaLevel(world);
  world.stats = analyzeWorld(world);
  return world;
}

export function updateWorldParams(world, params) {
  world.params = normalizeParams({ ...world.params, ...params });
  world.timeScaleFactor = timeScaleFactor(world.params.timeScale);
}

function normalizeParams(params) {
  const topologyMode = params.topologyMode === TopologyMode.CUBED_SPHERE
    ? TopologyMode.CUBED_SPHERE
    : TopologyMode.CYLINDRICAL;
  const projectionMode = Object.values(ProjectionMode).includes(params.projectionMode)
    ? params.projectionMode
    : ProjectionMode.EQUIRECTANGULAR;
  return {
    ...params,
    pipelineMode: params.pipelineMode === PipelineMode.GEOLOGY_V2 ? PipelineMode.GEOLOGY_V2 : PipelineMode.LEGACY,
    topologyMode,
    projectionMode,
    faceSize: normalizeFaceSize(params.faceSize, params.resolution),
  };
}

function createExperimentalSphericalGrid(params) {
  if (params.topologyMode !== TopologyMode.CUBED_SPHERE) return null;
  return createCubedSphereGrid(params.faceSize);
}

function normalizeFaceSize(faceSize, resolution) {
  const explicit = Number(faceSize);
  if (Number.isFinite(explicit) && explicit >= 2) return Math.trunc(explicit);
  const [width, height] = String(resolution ?? "512x256").split("x").map(Number);
  const base = Math.max(2, Math.min(width || 512, height || 256));
  return Math.max(2, Math.round(base / 2));
}

export function analyzeWorld(world) {
  const { grid } = world;
  const { size, elev, btype, isContinental } = grid;
  let land = 0;
  let convergentSum = 0;
  let convergentCount = 0;
  let mountainConvergentSum = 0;
  let mountainConvergentCount = 0;
  let divergentSum = 0;
  let divergentCount = 0;
  let interiorSum = 0;
  let interiorCount = 0;
  let continentalInteriorSum = 0;
  let continentalInteriorCount = 0;
  let maxElev = -Infinity;

  for (let i = 0; i < size; i += 1) {
    const h = elev[i];
    if (h >= world.seaLevel) land += 1;
    if (h > maxElev) maxElev = h;
    if (btype[i] === 1) {
      convergentSum += h;
      convergentCount += 1;
      if (isContinental[i]) {
        mountainConvergentSum += h;
        mountainConvergentCount += 1;
      }
    } else if (btype[i] === 2) {
      divergentSum += h;
      divergentCount += 1;
    } else if (btype[i] === 0) {
      interiorSum += h;
      interiorCount += 1;
      if (isContinental[i]) {
        continentalInteriorSum += h;
        continentalInteriorCount += 1;
      }
    }
  }

  const avgConvergent = convergentCount ? convergentSum / convergentCount : 0;
  const avgMountainConvergent = mountainConvergentCount ? mountainConvergentSum / mountainConvergentCount : avgConvergent;
  const avgDivergent = divergentCount ? divergentSum / divergentCount : 0;
  const avgInterior = interiorCount ? interiorSum / interiorCount : 0;
  const avgContinentalInterior = continentalInteriorCount ? continentalInteriorSum / continentalInteriorCount : avgInterior;
  const avgPlateDrift = measurePlateDrift(world);
  const mountainDelta = avgMountainConvergent - avgContinentalInterior;
  const broadDelta = avgMountainConvergent - avgInterior;
  return {
    landRatio: land / size,
    seaRatio: 1 - land / size,
    avgConvergent,
    avgMountainConvergent,
    avgDivergent,
    avgInterior,
    avgContinentalInterior,
    maxElev,
    convergentCount,
    mountainConvergentCount,
    divergentCount,
    seaLevel: world.seaLevel,
    avgPlateDrift,
    causalityPass: mountainConvergentCount > 0 && (mountainDelta > 0.015 || broadDelta > 0.05),
  };
}

function measurePlateDrift(world) {
  if (!world.plates || !world.initialPlateCentersU || !world.initialPlateCentersV) return 0;
  let total = 0;
  for (let p = 0; p < world.plates.centersX.length; p += 1) {
    const duRaw = Math.abs(world.plates.centersU[p] - world.initialPlateCentersU[p]);
    const du = Math.min(duRaw, 1 - duRaw);
    const dv = world.plates.centersV[p] - world.initialPlateCentersV[p];
    total += Math.hypot(du * 512, dv * 256);
  }
  return total / world.plates.centersX.length;
}

function timeScaleFactor(years) {
  const value = Number(years);
  if (value <= 1) return 0.04;
  if (value <= 100) return 0.12;
  if (value <= 1000) return 0.35;
  if (value <= 10000) return 0.75;
  return 1.4;
}
