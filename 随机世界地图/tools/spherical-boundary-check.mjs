import { hashSeed } from "../src/sim/prng.js";
import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import {
  assignNearestSphericalPlates,
  classifySphericalPlateBoundaries,
  createSphericalPlates,
  driftSphericalPlates,
  summarizeSphericalBoundaries,
} from "../src/sim/sphere/plates.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 64)));
const plateCount = Math.max(1, Math.trunc(Number(process.argv[4] ?? 14)));
const steps = Math.max(0, Math.trunc(Number(process.argv[5] ?? 200)));

const seedUint32 = hashSeed(seedText);
const grid = createCubedSphereGrid(faceSize);
const plates = createSphericalPlates({ seedUint32, plateCount, intensity: 1 });
for (let i = 0; i < steps; i += 1) driftSphericalPlates(plates, 1);

const assignment = assignNearestSphericalPlates(grid, plates);
const classified = classifySphericalPlateBoundaries(grid, plates, assignment);
const summary = summarizeSphericalBoundaries(grid, classified);
const typeContinuity = measureBoundaryTypeContinuity(grid, classified.boundaryType);

const result = {
  valid: true,
  seedText,
  topologyKind: grid.topologyKind,
  faceSize,
  plateCount,
  steps,
  ...summary,
  sameTypeNeighborShare: typeContinuity.sameTypeNeighborShare,
  faceSeamSameTypeNeighborShare: typeContinuity.faceSeamSameTypeNeighborShare,
  faceSeamBoundaryContinuityRisk: 1 - typeContinuity.faceSeamSameTypeNeighborShare,
};

if (!(summary.activeBoundaryShare > 0.01 && summary.activeBoundaryShare < 0.45)) result.valid = false;
if (!(summary.convergent > 0)) result.valid = false;
if (!(summary.divergent > 0)) result.valid = false;
if (!(summary.transform > 0)) result.valid = false;
if (!(summary.stressMean > 0)) result.valid = false;
if (result.faceSeamBoundaryContinuityRisk > 0.85) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureBoundaryTypeContinuity(grid, boundaryType) {
  let same = 0;
  let total = 0;
  let seamSame = 0;
  let seamTotal = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (boundaryType[id] === 0) continue;
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (boundaryType[nid] === 0) continue;
      total += 1;
      if (boundaryType[nid] === boundaryType[id]) same += 1;
      if (grid.face[nid] !== grid.face[id]) {
        seamTotal += 1;
        if (boundaryType[nid] === boundaryType[id]) seamSame += 1;
      }
    }
  }
  return {
    sameTypeNeighborShare: same / Math.max(1, total),
    faceSeamSameTypeNeighborShare: seamSame / Math.max(1, seamTotal),
  };
}
