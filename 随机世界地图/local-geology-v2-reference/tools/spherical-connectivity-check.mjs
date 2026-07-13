import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { finiteShare, maxFinite, weightedShare } from "../src/sim/sphere/stats.js";
import {
  connectedComponentsGraph,
  deriveSphericalOceanConnectivity,
  distanceFromGraphSources,
  floodFillGraph,
} from "../src/sim/sphere/topologyGraph.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 64)));
const grid = createCubedSphereGrid(faceSize);
const seaMask = createSyntheticSeaMask(grid);
const allMask = new Uint8Array(grid.size);
allMask.fill(1);

const flood = floodFillGraph(grid, [0], () => true);
const allComponents = connectedComponentsGraph(grid, allMask);
const seaComponents = connectedComponentsGraph(grid, seaMask);
const connectivity = deriveSphericalOceanConnectivity(grid, seaMask);
const externalDistance = distanceFromGraphSources(grid, connectivity.externalSeaMask);

const result = {
  valid: true,
  topologyKind: grid.topologyKind,
  faceSize,
  cellCount: grid.size,
  floodFillCount: countMask(flood),
  allComponentCount: allComponents.componentCount,
  seaComponentCount: seaComponents.componentCount,
  externalComponent: connectivity.externalComponent,
  externalComponentArea: connectivity.externalArea,
  externalSeaShare: weightedShare(grid, connectivity.externalSeaMask),
  inlandWaterCandidateShare: weightedShare(grid, connectivity.inlandWaterCandidate),
  closedBasinCount: connectivity.closedBasinCount,
  closedBasinIdMax: maxInt(connectivity.closedBasinId),
  distanceFiniteShare: finiteShare(externalDistance),
  distanceMaxFinite: maxFinite(externalDistance),
  faceSeamFloodContinuity: measureFaceSeamContinuity(grid, flood),
  externalSeaLargestComponentValid: checkLargestExternalComponent(grid, connectivity),
};

if (result.floodFillCount !== grid.size) result.valid = false;
if (result.allComponentCount !== 1) result.valid = false;
if (result.seaComponentCount < 2) result.valid = false;
if (result.externalSeaShare <= result.inlandWaterCandidateShare) result.valid = false;
if (result.closedBasinCount < 1) result.valid = false;
if (result.closedBasinCount !== result.closedBasinIdMax) result.valid = false;
if (result.distanceFiniteShare !== 1) result.valid = false;
if (result.faceSeamFloodContinuity < 1) result.valid = false;
if (!result.externalSeaLargestComponentValid) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createSyntheticSeaMask(grid) {
  const seaMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    const ocean = y < 0.26 || (z > 0.25 && x < 0.2);
    const closedBasinA = x > 0.34 && x < 0.62 && y > 0.38 && z > -0.18 && z < 0.28;
    const closedBasinB = x < -0.42 && y > 0.18 && y < 0.56 && z < -0.18;
    if (ocean || closedBasinA || closedBasinB) seaMask[id] = 1;
  }
  return seaMask;
}

function countMask(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) count += mask[i] ? 1 : 0;
  return count;
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function measureFaceSeamContinuity(grid, flood) {
  let seamEdges = 0;
  let continuous = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (grid.face[nid] === grid.face[id]) continue;
      seamEdges += 1;
      if (flood[id] && flood[nid]) continuous += 1;
    }
  }
  return continuous / Math.max(1, seamEdges);
}

function checkLargestExternalComponent(grid, connectivity) {
  const externalArea = connectivity.externalArea;
  for (let component = 1; component <= connectivity.componentCount; component += 1) {
    if (component === connectivity.externalComponent) continue;
    const area = connectivity.componentAreas[component] ?? 0;
    if (area > externalArea + 1e-8) return false;
  }
  return true;
}
