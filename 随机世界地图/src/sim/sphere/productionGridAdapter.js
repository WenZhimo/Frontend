import { createCubedSphereGrid } from "./cubedSphere.js";
import {
  measureAreaStats,
  measureHemisphereAreaStats,
  finiteShare,
  maxFinite,
  weightedCategoryShares,
  weightedMean,
  weightedShare,
  weightedSum,
} from "./stats.js";
import { createSphericalTopology } from "./topology.js";
import {
  deriveSphericalOceanConnectivity,
  distanceFromGraphSources,
} from "./topologyGraph.js";

const FIELD_SPECS = [
  ["elev", Float32Array],
  ["baseElev", Float32Array],
  ["relief", Float32Array],
  ["crustType", Uint8Array],
  ["crustThickness", Float32Array],
  ["crustAge", Float32Array],
  ["crustDensity", Float32Array],
  ["weakness", Float32Array],
  ["plate", Int32Array],
  ["boundaryKind", Int8Array],
  ["boundaryInfluence", Float32Array],
  ["activeBoundary", Uint8Array],
  ["stress", Float32Array],
  ["riftStage", Uint8Array],
  ["externalSeaMask", Uint8Array],
  ["oceanConnectivity", Uint8Array],
  ["inlandWaterCandidate", Uint8Array],
  ["closedBasinId", Int32Array],
  ["sediment", Float32Array],
  ["sedimentSink", Float32Array],
  ["sedimentCapacity", Float32Array],
  ["basin", Float32Array],
  ["orogeny", Float32Array],
  ["activeOrogeny", Float32Array],
  ["oldOrogeny", Float32Array],
  ["tectonicAxis", Float32Array],
  ["mountainHeight", Float32Array],
];

export function createCubedSphereProductionGridAdapter({
  faceSize = 64,
  includeLegacyDimensions = false,
} = {}) {
  const sphericalGrid = createCubedSphereGrid(faceSize);
  const topology = createSphericalTopology(sphericalGrid);
  const grid = {
    kind: "cubed-sphere-production-grid-adapter",
    topologyKind: "cubed-sphere",
    size: sphericalGrid.size,
    cellCount: sphericalGrid.size,
    faceSize: sphericalGrid.faceSize,
    faceCount: sphericalGrid.faceCount,
    sphericalGrid,
    topology,
    topologyOptions: {
      kind: "cubed-sphere",
      graphBacked: true,
      wrapX: false,
      wrapY: false,
      rectangularIndexing: false,
    },
    positionX: sphericalGrid.positionX,
    positionY: sphericalGrid.positionY,
    positionZ: sphericalGrid.positionZ,
    lon: sphericalGrid.lon,
    lat: sphericalGrid.lat,
    area: sphericalGrid.area,
    face: sphericalGrid.face,
    faceU: sphericalGrid.faceU,
    faceV: sphericalGrid.faceV,
    neighborStart: sphericalGrid.neighborStart,
    neighborCount: sphericalGrid.neighborCount,
    neighbors: sphericalGrid.neighbors,
    edgeLength: sphericalGrid.edgeLength,
  };

  if (includeLegacyDimensions) {
    grid.width = sphericalGrid.faceSize;
    grid.height = sphericalGrid.faceCount * sphericalGrid.faceSize;
  }

  for (const [name, Type] of FIELD_SPECS) {
    grid[name] = new Type(sphericalGrid.size);
  }

  return grid;
}

export function summarizeProductionGridAdapter(grid) {
  const areaTotal = sumField(grid.area);
  const synthetic = createStatsProbeFields(grid);
  const categoryShares = weightedCategoryShares(grid, synthetic.category, 3);
  const connectivity = createConnectivityProbe(grid, synthetic.seaMask);
  return {
    kind: grid.kind,
    topologyKind: grid.topologyKind,
    topologyApiKind: grid.topology?.topologyKind ?? null,
    size: grid.size,
    cellCount: grid.cellCount,
    faceSize: grid.faceSize,
    faceCount: grid.faceCount,
    hasLegacyDimensions: Number.isFinite(grid.width) && Number.isFinite(grid.height),
    rectangularIndexing: Boolean(grid.topologyOptions?.rectangularIndexing),
    graphBacked: Boolean(grid.topologyOptions?.graphBacked),
    areaTotal,
    areaTotalError: Math.abs(areaTotal - 4 * Math.PI),
    areaStats: measureAreaStats(grid),
    hemisphereAreaStats: measureHemisphereAreaStats(grid),
    fieldCount: FIELD_SPECS.length,
    allFieldsMatchSize: FIELD_SPECS.every(([name]) => grid[name]?.length === grid.size),
    neighborSymmetryValid: measureNeighborSymmetry(grid),
    statsProbe: {
      weightedSum: weightedSum(grid, synthetic.scalar),
      weightedMean: weightedMean(grid, synthetic.scalar),
      northShare: weightedShare(grid, synthetic.northMask),
      categoryShares: Array.from(categoryShares.shares),
      categoryShareTotal: Array.from(categoryShares.shares).reduce((sum, value) => sum + value, 0),
      categoryTotalArea: categoryShares.totalArea,
    },
    connectivityProbe: connectivity,
  };
}

export function productionAdapterFieldNames() {
  return FIELD_SPECS.map(([name]) => name);
}

function measureNeighborSymmetry(grid) {
  let valid = true;
  for (let id = 0; id < grid.size && valid; id += 1) {
    const start = grid.neighborStart[id];
    for (let k = 0; k < grid.neighborCount[id]; k += 1) {
      const nid = grid.neighbors[start + k];
      if (!hasNeighbor(grid, nid, id)) {
        valid = false;
        break;
      }
    }
  }
  return valid;
}

function hasNeighbor(grid, id, target) {
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    if (grid.neighbors[start + k] === target) return true;
  }
  return false;
}

function sumField(field) {
  let total = 0;
  for (let i = 0; i < field.length; i += 1) total += field[i];
  return total;
}

function createStatsProbeFields(grid) {
  const scalar = new Float32Array(grid.size);
  const northMask = new Uint8Array(grid.size);
  const category = new Int32Array(grid.size);
  const seaMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    scalar[id] = grid.positionY[id] * 0.5 + grid.positionZ[id] * 0.25;
    northMask[id] = grid.positionY[id] >= 0 ? 1 : 0;
    category[id] = grid.face[id] % 3;
    if (
      y < 0.26 ||
      (z > 0.25 && x < 0.2) ||
      (x > 0.34 && x < 0.62 && y > 0.38 && z > -0.18 && z < 0.28) ||
      (x < -0.42 && y > 0.18 && y < 0.56 && z < -0.18)
    ) {
      seaMask[id] = 1;
    }
  }
  return { scalar, northMask, category, seaMask };
}

function createConnectivityProbe(grid, seaMask) {
  const connectivity = deriveSphericalOceanConnectivity(grid, seaMask);
  const distanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);
  return {
    seaShare: weightedShare(grid, seaMask),
    externalSeaShare: weightedShare(grid, connectivity.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, connectivity.inlandWaterCandidate),
    closedBasinCount: connectivity.closedBasinCount,
    componentCount: connectivity.componentCount,
    externalComponent: connectivity.externalComponent,
    externalArea: connectivity.externalArea,
    closedBasinIdMax: maxInt(connectivity.closedBasinId),
    distanceFiniteShare: finiteShare(distanceToExternalSea),
    distanceMaxFinite: maxFinite(distanceToExternalSea),
    largestComponentIsExternal: isLargestExternalComponent(connectivity),
  };
}

function isLargestExternalComponent(connectivity) {
  for (let component = 1; component <= connectivity.componentCount; component += 1) {
    if (component === connectivity.externalComponent) continue;
    if ((connectivity.componentAreas[component] ?? 0) > connectivity.externalArea + 1e-8) return false;
  }
  return true;
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}
