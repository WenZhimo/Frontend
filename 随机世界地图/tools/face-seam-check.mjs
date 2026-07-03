import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const grid = createCubedSphereGrid(faceSize);

let seamEdgeCount = 0;
let seamMissingReciprocal = 0;
let seamDistanceTotal = 0;
let seamDistanceMax = 0;
let interiorDistanceTotal = 0;
let interiorEdgeCount = 0;
let localContinuityRiskTotal = 0;
let localContinuityRiskMax = 0;
let seamTangentCount = 0;
let seamTangentLengthErrorMax = 0;
let seamTangentRadialDotMax = 0;
let seamTangentForwardDotMin = Infinity;

for (let id = 0; id < grid.size; id += 1) {
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    const nid = grid.neighbors[start + k];
    const length = grid.edgeLength[start + k];
    if (grid.face[id] === grid.face[nid]) {
      interiorDistanceTotal += length;
      interiorEdgeCount += 1;
      continue;
    }
    seamEdgeCount += 1;
    seamDistanceTotal += length;
    seamDistanceMax = Math.max(seamDistanceMax, length);
    if (!hasNeighbor(grid, nid, id)) seamMissingReciprocal += 1;
    const localReference = localInteriorDistanceMean(grid, id, nid);
    const localRisk = Math.abs(1 - length / Math.max(localReference, Number.EPSILON));
    localContinuityRiskTotal += localRisk;
    localContinuityRiskMax = Math.max(localContinuityRiskMax, localRisk);

    const offset = start + k;
    const tx = grid.edgeTangentX[offset];
    const ty = grid.edgeTangentY[offset];
    const tz = grid.edgeTangentZ[offset];
    const ax = grid.positionX[id];
    const ay = grid.positionY[id];
    const az = grid.positionZ[id];
    const bx = grid.positionX[nid];
    const by = grid.positionY[nid];
    const bz = grid.positionZ[nid];
    const tangentLength = Math.hypot(tx, ty, tz);
    const radialDot = Math.abs(tx * ax + ty * ay + tz * az);
    const forwardDot = tx * (bx - ax) + ty * (by - ay) + tz * (bz - az);
    seamTangentLengthErrorMax = Math.max(seamTangentLengthErrorMax, Math.abs(tangentLength - 1));
    seamTangentRadialDotMax = Math.max(seamTangentRadialDotMax, radialDot);
    seamTangentForwardDotMin = Math.min(seamTangentForwardDotMin, forwardDot);
    seamTangentCount += 1;
  }
}

const seamDistanceMean = seamDistanceTotal / Math.max(1, seamEdgeCount);
const interiorDistanceMean = interiorDistanceTotal / Math.max(1, interiorEdgeCount);
const faceEdgeDistanceContinuity = seamDistanceMean / Math.max(interiorDistanceMean, Number.EPSILON);
const globalDistanceContinuityRisk = Math.abs(1 - faceEdgeDistanceContinuity);
const faceBoundaryContinuityRisk = localContinuityRiskTotal / Math.max(1, seamEdgeCount);
const faceEdgeTangentContinuityValid =
  seamTangentCount === seamEdgeCount &&
  seamTangentLengthErrorMax < 1e-5 &&
  seamTangentRadialDotMax < 1e-5 &&
  seamTangentForwardDotMin > 0;
const valid =
  seamEdgeCount > 0 &&
  seamMissingReciprocal === 0 &&
  faceBoundaryContinuityRisk < 0.25 &&
  localContinuityRiskMax < 0.3 &&
  seamDistanceMax < interiorDistanceMean * 1.25 &&
  faceEdgeTangentContinuityValid;

console.log(
  JSON.stringify(
    {
      topologyKind: grid.topologyKind,
      faceSize,
      valid,
      seamEdgeCount,
      seamMissingReciprocal,
      faceEdgeNeighborSymmetryValid: seamMissingReciprocal === 0,
      seamDistanceMean,
      interiorDistanceMean,
      seamDistanceMax,
      faceEdgeDistanceContinuity,
      globalDistanceContinuityRisk,
      faceBoundaryContinuityRisk,
      localContinuityRiskMax,
      seamTangentCount,
      seamTangentLengthErrorMax,
      seamTangentRadialDotMax,
      seamTangentForwardDotMin,
      faceEdgeTangentContinuityValid,
    },
    null,
    2,
  ),
);
if (!valid) process.exit(1);

function hasNeighbor(grid, id, target) {
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    if (grid.neighbors[start + k] === target) return true;
  }
  return false;
}

function localInteriorDistanceMean(grid, a, b) {
  let total = 0;
  let count = 0;
  total += sameFaceNeighborDistanceTotal(grid, a);
  count += sameFaceNeighborCount(grid, a);
  total += sameFaceNeighborDistanceTotal(grid, b);
  count += sameFaceNeighborCount(grid, b);
  return total / Math.max(1, count);
}

function sameFaceNeighborDistanceTotal(grid, id) {
  let total = 0;
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    const nid = grid.neighbors[start + k];
    if (grid.face[id] !== grid.face[nid]) continue;
    total += grid.edgeLength[start + k];
  }
  return total;
}

function sameFaceNeighborCount(grid, id) {
  let count = 0;
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    const nid = grid.neighbors[start + k];
    if (grid.face[id] === grid.face[nid]) count += 1;
  }
  return count;
}
