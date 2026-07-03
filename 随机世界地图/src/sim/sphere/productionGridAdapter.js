import { createCubedSphereGrid } from "./cubedSphere.js";
import { createSphericalTopology } from "./topology.js";

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
    fieldCount: FIELD_SPECS.length,
    allFieldsMatchSize: FIELD_SPECS.every(([name]) => grid[name]?.length === grid.size),
    neighborSymmetryValid: measureNeighborSymmetry(grid),
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
