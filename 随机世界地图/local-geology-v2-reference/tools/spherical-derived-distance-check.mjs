import { getTerrainDerived } from "../src/sim/derived/terrain.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { finiteShare, maxFinite, weightedShare } from "../src/sim/sphere/stats.js";

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
const coastMask = deriveCoastMask(grid, terrain.landMask);
const expectedCoastDistance = grid.topology.shortestDistanceSeeds(coastMask);
const expectedOceanDistance = grid.topology.shortestDistanceSeeds(terrain.externalSeaMask);
const coastDelta = maxAbsDelta(terrain.coastDistance, expectedCoastDistance);
const oceanDelta = maxAbsDelta(terrain.distanceToOcean, expectedOceanDistance);
const coastUnitStepMismatch = maxUnitStepDistanceMismatch(grid, terrain.coastDistance);
const oceanUnitStepMismatch = maxUnitStepDistanceMismatch(grid, terrain.distanceToOcean);

const result = {
  valid: true,
  topologyKind: terrain.topologyDiagnostics?.topologyKind ?? grid.topologyKind,
  graphBacked: Boolean(terrain.topologyDiagnostics?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  cellCount: grid.size,
  seaShare: weightedShare(grid, terrain.seaMask),
  externalSeaShare: weightedShare(grid, terrain.externalSeaMask),
  coastSourceShare: weightedShare(grid, coastMask),
  coastDistanceFiniteShare: finiteShare(terrain.coastDistance),
  distanceToOceanFiniteShare: finiteShare(terrain.distanceToOcean),
  coastDistanceMax: maxFinite(terrain.coastDistance),
  distanceToOceanMax: maxFinite(terrain.distanceToOcean),
  coastGraphDistanceMaxDelta: coastDelta,
  oceanGraphDistanceMaxDelta: oceanDelta,
  coastUnitStepMismatch,
  oceanUnitStepMismatch,
};

if (result.topologyKind !== "cubed-sphere") result.valid = false;
if (!result.graphBacked) result.valid = false;
if (result.seaShare <= 0 || result.externalSeaShare <= 0) result.valid = false;
if (result.coastSourceShare <= 0) result.valid = false;
if (result.coastDistanceFiniteShare !== 1) result.valid = false;
if (result.distanceToOceanFiniteShare !== 1) result.valid = false;
if (result.coastGraphDistanceMaxDelta > 1e-6) result.valid = false;
if (result.oceanGraphDistanceMaxDelta > 1e-6) result.valid = false;
if (result.coastUnitStepMismatch <= 0.005) result.valid = false;
if (result.oceanUnitStepMismatch <= 0.005) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function deriveCoastMask(grid, landMask) {
  const coast = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    let nearOpposite = false;
    grid.topology.forEachNeighbor(id, (nid) => {
      if (landMask[nid] !== landMask[id]) nearOpposite = true;
    });
    if (nearOpposite) coast[id] = 1;
  }
  return coast;
}

function maxAbsDelta(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return Infinity;
    const delta = Math.abs(av - bv);
    if (delta > max) max = delta;
  }
  return max;
}

function maxUnitStepDistanceMismatch(grid, distance) {
  let max = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      const edge = grid.edgeLength[start + k] ?? 1;
      const mismatch = Math.abs(Math.abs(distance[id] - distance[nid]) - 1);
      if (edge < 0.995 || edge > 1.005) max = Math.max(max, mismatch);
    }
  }
  return max;
}
