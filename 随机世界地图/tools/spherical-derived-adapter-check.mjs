import { getClimateInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { finiteShare, weightedShare } from "../src/sim/sphere/stats.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 32)));
const grid = createCubedSphereProductionGridAdapter({ faceSize });
const world = {
  grid,
  params: {
    pipelineMode: "geology-v2",
    intensity: 1,
    waterLevel: 50,
  },
  seaLevel: grid.diagnosticTerrain?.seaLevel ?? 0,
  baseSeaLevel: grid.diagnosticTerrain?.seaLevel ?? 0,
  step: 0,
  ageYears: 0,
  timeScaleFactor: 1,
  stats: {},
};

const terrain = getTerrainDerived(world);
const climate = getClimateInputs(world);
const result = {
  valid: true,
  faceSize,
  gridSize: grid.size,
  topologyKind: terrain.topologyDiagnostics?.topologyKind ?? null,
  graphBacked: Boolean(terrain.topologyDiagnostics?.graphBacked),
  terrain: {
    landShare: weightedShare(grid, terrain.landMask),
    seaShare: weightedShare(grid, terrain.seaMask),
    externalSeaShare: weightedShare(grid, terrain.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, terrain.inlandWaterCandidate),
    slopeFiniteShare: finiteShare(terrain.slope),
    ruggednessFiniteShare: finiteShare(terrain.ruggedness),
    coastDistanceFiniteShare: finiteShare(terrain.coastDistance),
    distanceToOceanFiniteShare: finiteShare(terrain.distanceToOcean),
    landmassCount: maxInt(terrain.landmassId),
    islandCount: maxInt(terrain.islandId),
  },
  climate: {
    latitudeFiniteShare: finiteShare(climate.latitude),
    latitudeMin: minFinite(climate.latitude),
    latitudeMax: maxFiniteSigned(climate.latitude),
    oceanDepthFiniteShare: finiteShare(climate.oceanDepth),
    orographicBarrierFiniteShare: finiteShare(climate.orographicBarrier),
  },
};

if (result.topologyKind !== "cubed-sphere") result.valid = false;
if (!result.graphBacked) result.valid = false;
if (result.terrain.landShare <= 0 || result.terrain.seaShare <= 0) result.valid = false;
if (Math.abs(result.terrain.landShare + result.terrain.seaShare - 1) > 1e-6) result.valid = false;
if (result.terrain.externalSeaShare <= result.terrain.inlandWaterCandidateShare) result.valid = false;
if (result.terrain.slopeFiniteShare !== 1) result.valid = false;
if (result.terrain.ruggednessFiniteShare !== 1) result.valid = false;
if (result.terrain.coastDistanceFiniteShare !== 1) result.valid = false;
if (result.terrain.distanceToOceanFiniteShare !== 1) result.valid = false;
if (result.terrain.landmassCount < 1) result.valid = false;
if (result.climate.latitudeFiniteShare !== 1) result.valid = false;
if (result.climate.latitudeMin < -90.1 || result.climate.latitudeMax > 90.1) result.valid = false;
if (result.climate.oceanDepthFiniteShare !== 1) result.valid = false;
if (result.climate.orographicBarrierFiniteShare !== 1) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function minFinite(field) {
  let min = Infinity;
  for (let i = 0; i < field.length; i += 1) if (Number.isFinite(field[i]) && field[i] < min) min = field[i];
  return min;
}

function maxFiniteSigned(field) {
  let max = -Infinity;
  for (let i = 0; i < field.length; i += 1) if (Number.isFinite(field[i]) && field[i] > max) max = field[i];
  return max;
}
