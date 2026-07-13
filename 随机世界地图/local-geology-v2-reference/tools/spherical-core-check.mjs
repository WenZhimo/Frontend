import { hashSeed } from "../src/sim/prng.js";
import { createSphericalExperimentalWorld } from "../src/sim/sphere/sphericalWorld.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 64)));
const plateCount = Math.max(1, Math.trunc(Number(process.argv[4] ?? 14)));
const steps = Math.max(0, Math.trunc(Number(process.argv[5] ?? 200)));

const world = createSphericalExperimentalWorld({
  seedText,
  seedUint32: hashSeed(seedText),
  faceSize,
  plateCount,
  intensity: 1,
  steps,
});

const stats = world.stats;
const result = {
  valid: true,
  seedText,
  steps,
  kind: world.kind,
  ...stats,
};

if (world.kind !== "spherical-experimental-world") result.valid = false;
if (world.topology?.topologyKind !== "cubed-sphere") result.valid = false;
if (world.topology?.size !== world.grid.size) result.valid = false;
if (stats.topologyKind !== "cubed-sphere") result.valid = false;
if (stats.topologyApiKind !== "cubed-sphere") result.valid = false;
if (stats.faceSize !== faceSize) result.valid = false;
if (stats.cellCount !== 6 * faceSize * faceSize) result.valid = false;
if (stats.plateCount !== plateCount) result.valid = false;
if (!(stats.meanPlateDriftRadians > 0)) result.valid = false;
if (stats.plateCoverage.emptyCount !== 0) result.valid = false;
if (!(stats.activeBoundaryShare > 0.01 && stats.activeBoundaryShare < 0.45)) result.valid = false;
if (!(stats.convergentShareOfActive > 0)) result.valid = false;
if (!(stats.divergentShareOfActive > 0)) result.valid = false;
if (!(stats.transformShareOfActive > 0)) result.valid = false;
if (!(stats.externalSeaShare > stats.inlandWaterCandidateShare)) result.valid = false;
if (stats.closedBasinCount < 1) result.valid = false;
if (stats.distanceToExternalSeaFiniteShare !== 1) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
