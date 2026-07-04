import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { createSphericalTopology } from "../src/sim/sphere/topology.js";
import {
  forEachNeighbor4ById,
  forEachNeighbor8ById,
  forEachNeighborRadiusById,
} from "../src/sim/grid.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const grid = createCubedSphereGrid(faceSize);
const topology = createSphericalTopology(grid);
const allMask = new Uint8Array(grid.size);
allMask.fill(1);
const seedMask = new Uint8Array(grid.size);
seedMask[0] = 1;
const sampleField = new Float32Array(grid.size);
for (let id = 0; id < grid.size; id += 1) sampleField[id] = id;

const cellVisitCount = countCells(topology);
const neighborParity = measureNeighborParity(grid, topology);
const ringStats = measureRingStats(topology);
const ringContract = measureRingContract(grid, topology);
const localWrapperContract = measureLocalWrapperContract(grid);
const flood = topology.floodFill([0], () => true);
const components = topology.connectedComponents(allMask);
const distance = topology.shortestDistanceSeeds(seedMask);
const sampleId = Math.floor(grid.size * 0.37);
const sampledValue = topology.sampleFieldAtLonLat(sampleField, grid.lon[sampleId], grid.lat[sampleId]);
const projected = topology.projectCell(sampleId, "equirectangular", { width: 256, height: 128 });

const result = {
  valid: true,
  topologyKind: topology.topologyKind,
  faceSize,
  cellCount: grid.size,
  cellVisitCount,
  ...neighborParity,
  ...ringStats,
  ...ringContract,
  ...localWrapperContract,
  floodFillCount: countMask(flood),
  componentCount: components.componentCount,
  componentArea: components.componentAreas[1] ?? 0,
  distanceFiniteShare: finiteShare(distance),
  sampledValue,
  sampleId,
  sampleMatchesNearestCell: sampledValue === grid.nearestCell(
    grid.positionX[sampleId],
    grid.positionY[sampleId],
    grid.positionZ[sampleId],
  ),
  projectedFinite: Number.isFinite(projected.x) && Number.isFinite(projected.y) && projected.visible === true,
};

if (cellVisitCount !== grid.size) result.valid = false;
if (!neighborParity.neighborParityValid) result.valid = false;
if (ringStats.ringRadius2Count <= ringStats.ringRadius1Count) result.valid = false;
if (!ringContract.ringDepthContractValid) result.valid = false;
if (!ringContract.gridRadiusWrapperUsesGraphDepth) result.valid = false;
if (!localWrapperContract.gridNeighbor4WrapperUsesGraphNeighbors) result.valid = false;
if (!localWrapperContract.gridNeighbor8WrapperUsesGraphNeighbors) result.valid = false;
if (result.floodFillCount !== grid.size) result.valid = false;
if (components.componentCount !== 1) result.valid = false;
if (result.distanceFiniteShare !== 1) result.valid = false;
if (!result.sampleMatchesNearestCell) result.valid = false;
if (!result.projectedFinite) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function countCells(topology) {
  let count = 0;
  topology.forEachCell(() => {
    count += 1;
  });
  return count;
}

function measureNeighborParity(grid, topology) {
  let mismatches = 0;
  let total = 0;
  topology.forEachCell((id) => {
    let localCount = 0;
    topology.forEachNeighbor(id, (nid, k, edgeLength) => {
      total += 1;
      localCount += 1;
      const expected = grid.neighbors[grid.neighborStart[id] + k];
      const expectedEdge = grid.edgeLength[grid.neighborStart[id] + k];
      if (nid !== expected || Math.abs(edgeLength - expectedEdge) > 1e-8) mismatches += 1;
    });
    if (localCount !== grid.neighborCount[id]) mismatches += 1;
  });
  return {
    neighborVisitCount: total,
    neighborParityMismatches: mismatches,
    neighborParityValid: mismatches === 0,
  };
}

function measureRingStats(topology) {
  let radius1 = 0;
  let radius2 = 0;
  topology.forEachNeighborRing(0, 1, () => {
    radius1 += 1;
  });
  topology.forEachNeighborRing(0, 2, () => {
    radius2 += 1;
  });
  return {
    ringRadius1Count: radius1,
    ringRadius2Count: radius2,
  };
}

function measureRingContract(grid, topology) {
  const sampleId = Math.floor(grid.size * 0.41);
  const radius = 3;
  let ringVisited = 0;
  let ringInvalidDepth = 0;
  let ringMissingNearestDepth = 0;
  let wrapperVisited = 0;
  let wrapperInvalidDepth = 0;
  let wrapperNonZeroDy = 0;
  let wrapperMismatch = 0;
  const ringDepth = new Int16Array(grid.size);
  ringDepth.fill(-1);

  topology.forEachNeighborRing(sampleId, radius, (id, depth) => {
    ringVisited += 1;
    ringDepth[id] = depth;
    if (!Number.isInteger(depth) || depth < 1 || depth > radius) ringInvalidDepth += 1;
    if (depth === 1 && !isDirectNeighbor(grid, sampleId, id)) ringMissingNearestDepth += 1;
  });

  forEachNeighborRadiusById(grid, sampleId, radius, (id, depth, dy) => {
    wrapperVisited += 1;
    if (!Number.isInteger(depth) || depth < 1 || depth > radius) wrapperInvalidDepth += 1;
    if (dy !== 0) wrapperNonZeroDy += 1;
    if (ringDepth[id] !== depth) wrapperMismatch += 1;
  });

  return {
    ringContractSampleId: sampleId,
    ringContractRadius: radius,
    ringDepthVisited: ringVisited,
    ringDepthInvalidCount: ringInvalidDepth,
    ringDepthMissingNearestCount: ringMissingNearestDepth,
    gridRadiusWrapperVisited: wrapperVisited,
    gridRadiusWrapperInvalidDepthCount: wrapperInvalidDepth,
    gridRadiusWrapperNonZeroDyCount: wrapperNonZeroDy,
    gridRadiusWrapperMismatchCount: wrapperMismatch,
    ringDepthContractValid: ringVisited > 0 && ringInvalidDepth === 0 && ringMissingNearestDepth === 0,
    gridRadiusWrapperUsesGraphDepth:
      wrapperVisited === ringVisited &&
      wrapperInvalidDepth === 0 &&
      wrapperNonZeroDy === 0 &&
      wrapperMismatch === 0,
  };
}

function measureLocalWrapperContract(grid) {
  const sampleIds = [
    0,
    Math.floor(grid.size * 0.17),
    Math.floor(grid.size * 0.41),
    Math.max(0, grid.size - 1),
  ];
  let neighbor4Visited = 0;
  let neighbor4Mismatch = 0;
  let neighbor4NonZeroDelta = 0;
  let neighbor8Visited = 0;
  let neighbor8Mismatch = 0;
  let neighbor8NonZeroDelta = 0;

  for (const sampleId of sampleIds) {
    const expected = directNeighborSet(grid, sampleId);
    const seen4 = new Set();
    const seen8 = new Set();
    forEachNeighbor4ById(grid, sampleId, (id, dx, dy) => {
      neighbor4Visited += 1;
      seen4.add(id);
      if (dx !== 0 || dy !== 0) neighbor4NonZeroDelta += 1;
      if (!expected.has(id)) neighbor4Mismatch += 1;
    });
    forEachNeighbor8ById(grid, sampleId, (id, dx, dy) => {
      neighbor8Visited += 1;
      seen8.add(id);
      if (dx !== 0 || dy !== 0) neighbor8NonZeroDelta += 1;
      if (!expected.has(id)) neighbor8Mismatch += 1;
    });
    if (seen4.size !== expected.size) neighbor4Mismatch += Math.abs(seen4.size - expected.size);
    if (seen8.size !== expected.size) neighbor8Mismatch += Math.abs(seen8.size - expected.size);
  }

  return {
    gridNeighborWrapperSampleCount: sampleIds.length,
    gridNeighbor4WrapperVisited: neighbor4Visited,
    gridNeighbor4WrapperMismatchCount: neighbor4Mismatch,
    gridNeighbor4WrapperNonZeroDeltaCount: neighbor4NonZeroDelta,
    gridNeighbor8WrapperVisited: neighbor8Visited,
    gridNeighbor8WrapperMismatchCount: neighbor8Mismatch,
    gridNeighbor8WrapperNonZeroDeltaCount: neighbor8NonZeroDelta,
    gridNeighbor4WrapperUsesGraphNeighbors:
      neighbor4Visited > 0 &&
      neighbor4Mismatch === 0 &&
      neighbor4NonZeroDelta === 0,
    gridNeighbor8WrapperUsesGraphNeighbors:
      neighbor8Visited > 0 &&
      neighbor8Mismatch === 0 &&
      neighbor8NonZeroDelta === 0,
  };
}

function directNeighborSet(grid, id) {
  const neighbors = new Set();
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    neighbors.add(grid.neighbors[start + k]);
  }
  return neighbors;
}

function isDirectNeighbor(grid, id, target) {
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    if (grid.neighbors[start + k] === target) return true;
  }
  return false;
}

function countMask(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) count += mask[i] ? 1 : 0;
  return count;
}

function finiteShare(field) {
  let finite = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i])) finite += 1;
  }
  return finite / Math.max(1, field.length);
}
