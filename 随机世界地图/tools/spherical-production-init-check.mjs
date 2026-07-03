import { getClimateInputs, getHydrologyInputs, getResourceInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { updatePlateBoundaries } from "../src/sim/geology/boundaries.js";
import { rasterizePlatesV2 } from "../src/sim/geology/plates.js";
import { hashSeed } from "../src/sim/prng.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { initializeBaseTerrain, initializeSeaLevel, updateSeaLevel } from "../src/sim/terrain.js";
import { assignPlates } from "../src/sim/tectonics.js";
import { analyzeWorld } from "../src/sim/world.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 32)));
const seedUint32 = hashSeed(seedText);
const grid = createCubedSphereProductionGridAdapter({ faceSize });
const world = {
  grid,
  sphericalGrid: null,
  sphericalWorld: null,
  params: {
    seedText,
    waterLevel: 50,
    intensity: 1,
    plateCount: 14,
    timeScale: 1_000_000,
    resolution: "256x128",
    pipelineMode: "geology-v2",
    topologyMode: "cubed-sphere",
    projectionMode: "equirectangular",
    faceSize,
  },
  seedUint32,
  step: 0,
  ageYears: 0,
  timeScaleFactor: 1,
  seaLevel: 0,
  waterVolume: 0,
  plates: null,
  continentNoise: null,
  textureNoise: null,
  stats: {},
};

const stages = [];

runStage("initializeBaseTerrain", () => initializeBaseTerrain(world));
runStage("assignPlates", () => assignPlates(world));
runStage("initializeSeaLevel", () => initializeSeaLevel(world));
runStage("rasterizePlatesV2", () => rasterizePlatesV2(world));
runStage("updatePlateBoundaries", () => updatePlateBoundaries(world));
runStage("updateSeaLevel", () => updateSeaLevel(world));
runStage("analyzeWorld", () => {
  world.stats = analyzeWorld(world);
});

let terrain = null;
let climate = null;
let hydrology = null;
let resources = null;
runStage("getTerrainDerived", () => {
  terrain = getTerrainDerived(world);
});
runStage("getClimateInputs", () => {
  climate = getClimateInputs(world);
});
runStage("getHydrologyInputs", () => {
  hydrology = getHydrologyInputs(world);
});
runStage("getResourceInputs", () => {
  resources = getResourceInputs(world);
});

const checks = {
  gridIsCubedSphere: grid.topologyKind === "cubed-sphere",
  graphBacked: grid.topologyOptions?.graphBacked === true,
  landRatioFinite: Number.isFinite(world.stats.landRatio),
  seaLevelFinite: Number.isFinite(world.seaLevel),
  terrainSized: terrain?.relativeElevation?.length === grid.size,
  climateSized: climate?.latitude?.length === grid.size,
  hydrologySized: hydrology?.hydroElevation?.length === grid.size,
  resourcesSized: resources?.crustType?.length === grid.size,
  hydrologyValid: hydrology?.hydrologyDiagnostics?.hydrologyValid === true,
};

const result = {
  valid: Object.values(checks).every(Boolean),
  seedText,
  faceSize,
  gridSize: grid.size,
  topologyKind: grid.topologyKind,
  stages,
  checks,
  stats: world.stats,
  seaLevel: world.seaLevel,
  hydrologyDiagnostics: hydrology?.hydrologyDiagnostics ?? null,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function runStage(name, fn) {
  try {
    fn();
    stages.push({ name, ok: true });
  } catch (error) {
    stages.push({ name, ok: false, error: error?.stack ?? String(error) });
    console.log(JSON.stringify({
      valid: false,
      seedText,
      faceSize,
      gridSize: grid.size,
      topologyKind: grid.topologyKind,
      stages,
      failed: stages.at(-1),
    }, null, 2));
    process.exit(1);
  }
}
