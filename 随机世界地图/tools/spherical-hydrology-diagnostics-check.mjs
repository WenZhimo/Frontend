import { deriveHydrology } from "../src/sim/hydrology.js";
import { createGrid } from "../src/sim/grid.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { weightedShare } from "../src/sim/sphere/stats.js";

const faceSize = Math.max(4, Math.trunc(Number(process.argv[2] ?? 16)));

const cylindrical = runCylindricalProbe();
const spherical = runSphericalProbe(faceSize);

const checks = {
  cylindricalUsesCellLakeShare: nearlyEqual(cylindrical.diagnostics.lakeCandidateShare, cylindrical.cellLakeShare, 1e-12),
  sphericalUsesAreaLakeShare: nearlyEqual(spherical.diagnostics.lakeCandidateShare, spherical.areaLakeShare, 1e-12),
  sphericalClosedDrainageUsesArea: nearlyEqual(spherical.diagnostics.closedBasinDrainageShare, spherical.areaClosedDrainageShare, 1e-12),
  sphericalClosedDrainageDiffersFromCellShare: Math.abs(spherical.areaClosedDrainageShare - spherical.cellClosedDrainageShare) > 0.001,
  sphericalFlowAssignedUsesArea: nearlyEqual(spherical.diagnostics.flowAssignedShare, spherical.areaAssignedShare, 1e-12),
  sphericalRiverShareUsesArea: nearlyEqual(spherical.diagnostics.riverCellShare, spherical.areaRiverShare, 1e-12),
  cylindricalFlowAccumulationUsesCellUnit: cylindrical.flowAccumulationExpectedDeltaMax < 1e-9,
  sphericalFlowAccumulationUsesAreaUnit: spherical.flowAccumulationExpectedDeltaMax < 1e-9,
  sphericalFlowAccumulationDiffersFromCellUnit: spherical.flowAccumulationCellUnitDeltaMax > 0.1,
  sphericalDrainageSharesFinite:
    Number.isFinite(spherical.diagnostics.externalSeaDrainageShare) &&
    Number.isFinite(spherical.diagnostics.closedBasinDrainageShare),
};

const result = {
  valid: Object.values(checks).every(Boolean),
  faceSize,
  cylindrical,
  spherical,
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function runCylindricalProbe() {
  const grid = createGrid(6, 4);
  const terrain = createProbeTerrain(grid, (id) => id < 12);
  const hydrology = deriveHydrology({ grid, seaLevel: 0 }, terrain, { diagnostics: "basic" });
  return summarizeProbe(grid, terrain, hydrology);
}

function runSphericalProbe(faceSize) {
  const grid = createCubedSphereProductionGridAdapter({ faceSize, seedUint32: 12345 });
  const terrain = createSphericalProbeTerrain(grid);
  const hydrology = deriveHydrology({ grid, seaLevel: 0 }, terrain, { diagnostics: "basic" });
  return summarizeProbe(grid, terrain, hydrology);
}

function createSphericalProbeTerrain(grid) {
  const externalLand = selectAreaBand(grid, (id) => grid.positionY[id] > -0.2 && grid.positionY[id] < 0.05 && grid.positionX[id] > 0.55, 18);
  const closedLand = selectAreaBand(grid, (id) => grid.positionY[id] > 0.52 && grid.positionZ[id] > -0.2, 18);
  const terrain = createProbeTerrain(grid, (id) => externalLand.has(id) || closedLand.has(id));
  for (const id of closedLand) {
    terrain.inlandWaterCandidate[id] = 1;
    terrain.closedBasinId[id] = 1;
  }
  return terrain;
}

function selectAreaBand(grid, predicate, targetCount) {
  const candidates = [];
  for (let id = 0; id < grid.size; id += 1) {
    if (!predicate(id)) continue;
    candidates.push({
      id,
      area: grid.area?.[id] ?? 1,
    });
  }
  candidates.sort((a, b) => a.area - b.area);
  const selected = new Set();
  const step = Math.max(1, Math.floor(candidates.length / Math.max(1, targetCount)));
  for (let i = 0; i < candidates.length && selected.size < targetCount; i += step) {
    selected.add(candidates[i].id);
  }
  return selected;
}

function createProbeTerrain(grid, landPredicate) {
  const size = grid.size;
  const relativeElevation = new Float32Array(size);
  const landMask = new Uint8Array(size);
  const seaMask = new Uint8Array(size);
  const externalSeaMask = new Uint8Array(size);
  const inlandWaterCandidate = new Uint8Array(size);
  const closedBasinId = new Int32Array(size);
  const coastDistance = new Float32Array(size);
  const coastalSensitivity = new Float32Array(size);
  const continentalRise = new Float32Array(size);
  const slope = new Float32Array(size);

  for (let id = 0; id < size; id += 1) {
    const land = landPredicate(id);
    landMask[id] = land ? 1 : 0;
    seaMask[id] = land ? 0 : 1;
    externalSeaMask[id] = land ? 0 : 1;
    relativeElevation[id] = land ? 0.25 + id * 0.000001 : -0.25;
    grid.elev[id] = relativeElevation[id];
    grid.crustType[id] = land ? 1 : 0;
    grid.sediment[id] = 0.1;
    grid.basin[id] = 0;
    grid.forelandBasin[id] = 0;
    grid.orogenicSedimentSupply[id] = 0;
    grid.sedimentSink[id] = 0;
    grid.sedimentCapacity[id] = 0.2;
    coastDistance[id] = land ? 1 : 0;
    coastalSensitivity[id] = land ? 0.2 : 0;
    continentalRise[id] = land ? 0 : 0.1;
    slope[id] = land ? 0.02 : 0;
  }

  return {
    relativeElevation,
    landMask,
    seaMask,
    externalSeaMask,
    inlandWaterCandidate,
    closedBasinId,
    coastDistance,
    coastalSensitivity,
    continentalRise,
    slope,
    reliefDiagnostics: {
      drainageGradientPotential: 0,
    },
    geologicSeaLevelDiagnostics: {
      baseSeaLevel: 0,
      geologicSeaLevelOffset: 0,
    },
  };
}

function summarizeProbe(grid, terrain, hydrology) {
  const diagnostics = hydrology.hydrologyDiagnostics;
  return {
    topologyKind: grid.topologyKind ?? "cylindrical",
    graphBacked: Boolean(grid.topologyOptions?.graphBacked || grid.topologyKind === "cubed-sphere"),
    cellLakeShare: cellShare(hydrology.lakeCandidate),
    areaLakeShare: areaShare(grid, hydrology.lakeCandidate),
    areaAssignedShare: areaConditionalShare(grid, terrain.landMask, (id) => hydrology.flowTarget[id] >= 0),
    areaRiverShare: areaConditionalShare(grid, terrain.landMask, (id) => hydrology.riverMask[id]),
    cellClosedDrainageShare: cellConditionalShare(terrain.landMask, (id) => hydrology.endorheicBasin[id]),
    areaClosedDrainageShare: areaConditionalShare(grid, terrain.landMask, (id) => hydrology.endorheicBasin[id]),
    flowAccumulationMean: meanWhere(grid, terrain.landMask, (id) => hydrology.flowAccumulation[id]),
    flowAccumulationExpectedDeltaMax: maxExpectedAccumulationDelta(grid, terrain, hydrology, (id) => grid.area?.[id] ?? 1),
    flowAccumulationCellUnitDeltaMax: maxExpectedAccumulationDelta(grid, terrain, hydrology, () => 1),
    diagnostics: {
      hydrologyValid: diagnostics.hydrologyValid,
      flowAssignedShare: diagnostics.flowAssignedShare,
      lakeCandidateShare: diagnostics.lakeCandidateShare,
      riverCellShare: diagnostics.riverCellShare,
      externalSeaDrainageShare: diagnostics.externalSeaDrainageShare,
      closedBasinDrainageShare: diagnostics.closedBasinDrainageShare,
    },
  };
}

function cellShare(mask) {
  let count = 0;
  for (let id = 0; id < mask.length; id += 1) if (mask[id]) count += 1;
  return count / Math.max(1, mask.length);
}

function areaShare(grid, mask) {
  if (!grid.area) return cellShare(mask);
  return weightedShare(grid, mask);
}

function areaConditionalShare(grid, includeMask, predicate) {
  let matched = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (!includeMask[id]) continue;
    const area = grid.area?.[id] ?? 1;
    total += area;
    if (predicate(id)) matched += area;
  }
  return total ? matched / total : 0;
}

function cellConditionalShare(includeMask, predicate) {
  let matched = 0;
  let total = 0;
  for (let id = 0; id < includeMask.length; id += 1) {
    if (!includeMask[id]) continue;
    total += 1;
    if (predicate(id)) matched += 1;
  }
  return total ? matched / total : 0;
}

function meanWhere(grid, includeMask, valueForId) {
  let total = 0;
  let count = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (!includeMask[id]) continue;
    total += valueForId(id);
    count += 1;
  }
  return count ? total / count : 0;
}

function maxExpectedAccumulationDelta(grid, terrain, hydrology, sourceUnitForId) {
  const expected = new Float32Array(grid.size);
  const landCells = [];
  for (let id = 0; id < grid.size; id += 1) {
    if (!terrain.landMask[id]) continue;
    expected[id] = sourceUnitForId(id);
    landCells.push(id);
  }
  landCells.sort((a, b) => hydrology.hydroElevation[b] - hydrology.hydroElevation[a]);
  for (const id of landCells) {
    const target = hydrology.flowTarget[id];
    if (target < 0) continue;
    expected[target] += expected[id];
  }
  let max = 0;
  for (const id of landCells) {
    max = Math.max(max, Math.abs(hydrology.flowAccumulation[id] - expected[id]));
  }
  return max;
}

function nearlyEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}
