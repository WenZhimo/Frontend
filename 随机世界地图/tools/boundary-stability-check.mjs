import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";

const params = {
  seedText: process.argv[2] ?? "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  pipelineMode: process.argv[4] ?? "geology-v2",
  resolution: process.argv[5] ?? "512x256",
};
const steps = Number(process.argv[3] ?? 200);
const world = createWorld(params);
const peaks = {
  plateCheckerboardScore: { value: 0, step: 0 },
  activeBoundaryCoverage: { value: 0, step: 0 },
  noisyBoundaryPatchCoverage: { value: 0, step: 0 },
  plateIslandNoiseShare: { value: 0, step: 0 },
  featureOnNoisyBoundaryShare: { value: 0, step: 0 },
};

for (let step = 0; step <= steps; step += 1) {
  if (step > 0) stepWorld(world);
  const metrics = measureBoundaryDiagnostics(world.grid);
  for (const [name, value] of Object.entries(metrics)) {
    if (!peaks[name]) continue;
    if (value > peaks[name].value) peaks[name] = { value, step };
  }
}

console.log(JSON.stringify({
  seedText: params.seedText,
  steps,
  ageYears: world.ageYears,
  pipelineMode: params.pipelineMode,
  resolution: params.resolution,
  final: measureBoundaryDiagnostics(world.grid),
  peaks,
}, null, 2));

function measureBoundaryDiagnostics(grid) {
  let active = 0;
  let densitySum = 0;
  let noisy = 0;
  let checker = 0;
  let islandNoise = 0;
  let featureOnNoisy = 0;
  let featureCount = 0;
  for (let i = 0; i < grid.size; i += 1) {
    if (grid.activeBoundary[i]) active += 1;
    densitySum += grid.boundaryDensity[i] ?? 0;
    if (grid.noisyBoundaryPatch[i]) noisy += 1;
    checker += grid.plateCheckerboard[i] ?? 0;
    if (isPlateIslandNoise(grid, i)) islandNoise += 1;
    const feature = Math.max(grid.mountainBelt[i], grid.trench[i], grid.ridge[i], grid.rift[i], grid.basin[i], grid.islandArc[i]);
    if (feature > 0.05) {
      featureCount += 1;
      if (grid.noisyBoundaryPatch[i]) featureOnNoisy += 1;
    }
  }
  return {
    plateCheckerboardScore: checker / grid.size,
    activeBoundaryCoverage: active / grid.size,
    localBoundaryDensityMean: densitySum / grid.size,
    noisyBoundaryPatchCoverage: noisy / grid.size,
    plateIslandNoiseShare: islandNoise / grid.size,
    featureOnNoisyBoundaryShare: featureCount ? featureOnNoisy / featureCount : 0,
  };
}

function isPlateIslandNoise(grid, id) {
  const x = id % grid.width;
  const y = Math.floor(id / grid.width);
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  visitNeighbor8Ids(grid, x, y, (nid) => {
    if (grid.plate[nid] === current) same += 1;
    else different += 1;
  });
  return same <= 2 && different >= 5;
}

function visitNeighbor8Ids(grid, x, y, visit) {
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= grid.height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = ((x + dx) % grid.width + grid.width) % grid.width;
      visit(ny * grid.width + nx);
    }
  }
}
