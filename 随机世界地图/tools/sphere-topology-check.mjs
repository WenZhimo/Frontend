import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const grid = createCubedSphereGrid(faceSize);

const unitSphereErrorMax = measureUnitSphereError(grid);
const areaStats = measureAreaStats(grid);
const neighborStats = measureNeighborStats(grid);
const connectivity = measureConnectivity(grid);
const edgeStats = measureEdgeStats(grid);

const valid =
  unitSphereErrorMax < 1e-5 &&
  Math.abs(areaStats.areaTotal - 4 * Math.PI) < 1e-4 &&
  neighborStats.neighborSymmetryValid &&
  connectivity.globalConnectivityValid &&
  edgeStats.edgeLengthMin > 0 &&
  edgeStats.edgeLengthMax < Math.PI / 2;

const result = {
  topologyKind: grid.topologyKind,
  faceSize: grid.faceSize,
  cellCount: grid.size,
  valid,
  unitSphereErrorMax,
  ...areaStats,
  ...neighborStats,
  ...connectivity,
  ...edgeStats,
  poleSingularityRisk: 0,
};

console.log(JSON.stringify(result, null, 2));
if (!valid) process.exit(1);

function measureUnitSphereError(grid) {
  let maxError = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const length = Math.hypot(grid.positionX[id], grid.positionY[id], grid.positionZ[id]);
    maxError = Math.max(maxError, Math.abs(length - 1));
  }
  return maxError;
}

function measureAreaStats(grid) {
  let areaTotal = 0;
  let areaMin = Infinity;
  let areaMax = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const value = grid.area[id];
    areaTotal += value;
    areaMin = Math.min(areaMin, value);
    areaMax = Math.max(areaMax, value);
  }
  return {
    areaTotal,
    areaTotalError: areaTotal - 4 * Math.PI,
    areaMin,
    areaMax,
    areaMinMaxRatio: areaMax / Math.max(areaMin, Number.EPSILON),
  };
}

function measureNeighborStats(grid) {
  let neighborCountMin = Infinity;
  let neighborCountMax = 0;
  let missingReciprocalEdges = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const count = grid.neighborCount[id];
    neighborCountMin = Math.min(neighborCountMin, count);
    neighborCountMax = Math.max(neighborCountMax, count);
    const start = grid.neighborStart[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (!hasNeighbor(grid, nid, id)) missingReciprocalEdges += 1;
    }
  }
  return {
    neighborCountMin,
    neighborCountMax,
    missingReciprocalEdges,
    neighborSymmetryValid: missingReciprocalEdges === 0 && neighborCountMin >= 3,
  };
}

function hasNeighbor(grid, id, target) {
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    if (grid.neighbors[start + k] === target) return true;
  }
  return false;
}

function measureConnectivity(grid) {
  const visited = new Uint8Array(grid.size);
  const queue = new Int32Array(grid.size);
  let head = 0;
  let tail = 0;
  visited[0] = 1;
  queue[tail++] = 0;
  while (head < tail) {
    const id = queue[head++];
    const start = grid.neighborStart[id];
    for (let k = 0; k < grid.neighborCount[id]; k += 1) {
      const nid = grid.neighbors[start + k];
      if (visited[nid]) continue;
      visited[nid] = 1;
      queue[tail++] = nid;
    }
  }
  return {
    connectedCellCount: tail,
    globalConnectivityValid: tail === grid.size,
    connectedComponentCount: tail === grid.size ? 1 : null,
  };
}

function measureEdgeStats(grid) {
  let edgeLengthMin = Infinity;
  let edgeLengthMax = 0;
  let edgeLengthTotal = 0;
  let edgeCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    for (let k = 0; k < grid.neighborCount[id]; k += 1) {
      const value = grid.edgeLength[start + k];
      edgeLengthMin = Math.min(edgeLengthMin, value);
      edgeLengthMax = Math.max(edgeLengthMax, value);
      edgeLengthTotal += value;
      edgeCount += 1;
    }
  }
  return {
    edgeCount,
    edgeLengthMin,
    edgeLengthMax,
    edgeLengthMean: edgeLengthTotal / Math.max(1, edgeCount),
  };
}
