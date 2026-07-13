import { hashSeed } from "../src/sim/prng.js";
import { createSphericalExperimentalWorld } from "../src/sim/sphere/sphericalWorld.js";
import { weightedShare } from "../src/sim/sphere/stats.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? options.seed ?? "龙骨海-纪元7";
const faceSize = parseIntOption(options, "face-size", Number(positional[1] ?? 64));
const steps = parseIntOption(options, "steps", Number(positional[2] ?? 200));
const plateCount = parseIntOption(options, "plates", 14);

const world = createSphericalExperimentalWorld({
  seedText,
  seedUint32: hashSeed(seedText),
  faceSize,
  plateCount,
  intensity: 1,
  steps,
});

const grid = world.grid;
const terrain = world.diagnosticTerrain;
const elevationStats = measureElevationStats(grid, terrain.elevation);
const seaStats = measureSeaStats(world);
const seamStats = measureSeamContinuity(grid, terrain.elevation);
const featureStats = measureFeatureStats(grid, terrain);

const valid =
  world.kind === "spherical-experimental-world" &&
  world.topology?.topologyKind === "cubed-sphere" &&
  elevationStats.finiteShare === 1 &&
  elevationStats.elevationRange > 0.35 &&
  seaStats.derivedSeaShare > 0.45 &&
  seaStats.derivedSeaShare < 0.7 &&
  seaStats.externalSeaShare > seaStats.inlandWaterCandidateShare &&
  seaStats.externalSeaShare / Math.max(seaStats.derivedSeaShare, Number.EPSILON) > 0.94 &&
  seaStats.closedBasinCount >= 1 &&
  seaStats.closedBasinCount < Math.max(8, grid.faceSize) &&
  Math.abs(seaStats.derivedSeaShare - seaStats.diagnosticSeaCandidateShare) < 1e-8 &&
  seamStats.seamDiffToInteriorRatio < 1.35 &&
  seamStats.seamRiskEdgeShare < 0.05 &&
  featureStats.ridgeCandidateCoverage > 0 &&
  featureStats.trenchCandidateCoverage > 0;

console.log(
  JSON.stringify(
    {
      valid,
      seedText,
      steps,
      topologyKind: grid.topologyKind,
      faceSize,
      cellCount: grid.size,
      ...elevationStats,
      ...seaStats,
      ...seamStats,
      ...featureStats,
    },
    null,
    2,
  ),
);

process.exit(valid ? 0 : 1);

function measureElevationStats(grid, elevation) {
  let finite = 0;
  let min = Infinity;
  let max = -Infinity;
  let areaWeightedMean = 0;
  let areaTotal = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const value = elevation[id];
    if (!Number.isFinite(value)) continue;
    const area = grid.area?.[id] ?? 1;
    finite += 1;
    min = Math.min(min, value);
    max = Math.max(max, value);
    areaWeightedMean += value * area;
    areaTotal += area;
  }
  return {
    finiteShare: finite / Math.max(1, grid.size),
    elevationMin: min,
    elevationMax: max,
    elevationRange: max - min,
    elevationMean: areaWeightedMean / Math.max(areaTotal, Number.EPSILON),
    diagnosticSeaLevel: world.diagnosticTerrain.seaLevel,
  };
}

function measureSeaStats(world) {
  const grid = world.grid;
  return {
    geometricSeaShare: weightedShare(grid, world.geometricSeaMask),
    derivedSeaShare: weightedShare(grid, world.seaMask),
    diagnosticSeaCandidateShare: weightedShare(grid, world.diagnosticTerrain.seaCandidate),
    externalSeaShare: weightedShare(grid, world.connectivity.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, world.connectivity.inlandWaterCandidate),
    externalSeaOfDerivedSeaShare: weightedShare(grid, world.connectivity.externalSeaMask) / Math.max(weightedShare(grid, world.seaMask), Number.EPSILON),
    closedBasinCount: world.connectivity.closedBasinCount,
    distanceToExternalSeaMax: world.stats.distanceToExternalSeaMax,
  };
}

function measureSeamContinuity(grid, field) {
  const interiorDiffs = [];
  const seamDiffs = [];
  let interiorTotal = 0;
  let seamTotal = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id) continue;
      const diff = Math.abs(field[id] - field[nid]);
      if (grid.face[id] === grid.face[nid]) {
        interiorDiffs.push(diff);
        interiorTotal += diff;
      } else {
        seamDiffs.push(diff);
        seamTotal += diff;
      }
    }
  }
  const interiorMean = interiorTotal / Math.max(1, interiorDiffs.length);
  const seamMean = seamTotal / Math.max(1, seamDiffs.length);
  let riskEdges = 0;
  for (const diff of seamDiffs) {
    if (diff > interiorMean * 2.25) riskEdges += 1;
  }
  return {
    interiorEdgeCount: interiorDiffs.length,
    seamEdgeCount: seamDiffs.length,
    interiorElevationDiffMean: interiorMean,
    seamElevationDiffMean: seamMean,
    seamDiffToInteriorRatio: seamMean / Math.max(interiorMean, Number.EPSILON),
    seamRiskEdgeShare: riskEdges / Math.max(1, seamDiffs.length),
  };
}

function measureFeatureStats(grid, terrain) {
  return {
    ridgeCandidateCoverage: positiveShare(grid, terrain.ridgeCandidate),
    trenchCandidateCoverage: positiveShare(grid, terrain.trenchCandidate),
    ridgeCandidateMax: maxFinite(terrain.ridgeCandidate),
    trenchCandidateMax: maxFinite(terrain.trenchCandidate),
  };
}

function positiveShare(grid, field) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    total += area;
    if (field[id] > 0) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function maxFinite(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i]) && field[i] > max) max = field[i];
  }
  return max;
}
