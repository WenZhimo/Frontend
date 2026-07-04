import { getClimateInputs, getHydrologyInputs, getResourceInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { stepWorld } from "../src/sim/evolution.js";
import { updatePlateBoundaries } from "../src/sim/geology/boundaries.js";
import { rasterizePlatesV2 } from "../src/sim/geology/plates.js";
import { hashSeed } from "../src/sim/prng.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { initializeBaseTerrain, initializeSeaLevel, updateSeaLevel } from "../src/sim/terrain.js";
import { assignPlates } from "../src/sim/tectonics.js";
import { analyzeWorld } from "../src/sim/world.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 32)));
const steps = Math.max(1, Math.trunc(Number(process.argv[4] ?? 5)));
const sampleEvery = Math.max(1, Math.trunc(Number(process.argv[5] ?? Math.ceil(steps / 5))));

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
const samples = [];

runStage("initializeBaseTerrain", () => initializeBaseTerrain(world));
runStage("assignPlates", () => assignPlates(world));
runStage("initializeSeaLevel", () => initializeSeaLevel(world));
runStage("rasterizePlatesV2", () => rasterizePlatesV2(world));
runStage("updatePlateBoundaries", () => updatePlateBoundaries(world));
runStage("updateSeaLevel", () => updateSeaLevel(world));
runStage("analyzeWorld", () => {
  world.stats = analyzeWorld(world);
});
sampleDerived("initial");

let totalStepMs = 0;
for (let step = 1; step <= steps; step += 1) {
  runStage(`stepWorld:${step}`, () => stepWorld(world));
  totalStepMs += world.lastStepMs ?? 0;
  if (step === steps || step % sampleEvery === 0) sampleDerived(`step:${step}`);
}

const last = samples.at(-1);
const featureHealth = measureFeatureHealth(grid);
const checks = {
  gridIsCubedSphere: grid.topologyKind === "cubed-sphere",
  graphBacked: grid.topologyOptions?.graphBacked === true,
  adapterKeepsLegacyDimensionsHidden: !Object.hasOwn(grid, "width") && !Object.hasOwn(grid, "height"),
  topologyParamDimensionsAvailable: grid.topology?.width === faceSize && grid.topology?.height === grid.faceCount * faceSize,
  stepAdvanced: world.step === steps,
  ageAdvanced: world.ageYears > 0,
  seaLevelFinite: Number.isFinite(world.seaLevel),
  landRatioFinite: Number.isFinite(world.stats.landRatio),
  plateDriftFinite: Number.isFinite(world.stats.avgPlateDrift),
  plateDriftNotExploding: world.stats.avgPlateDrift >= 0 && world.stats.avgPlateDrift < 10,
  noStageFailures: stages.every((stage) => stage.ok),
  samplesValid: samples.every((sample) => sample.valid),
  terrainSized: last?.terrainSized === true,
  climateSized: last?.climateSized === true,
  hydrologySized: last?.hydrologySized === true,
  resourcesSized: last?.resourcesSized === true,
  hydrologyValid: last?.hydrologyValid === true,
};

const result = {
  valid: Object.values(checks).every(Boolean),
  seedText,
  faceSize,
  steps,
  gridSize: grid.size,
  topologyKind: grid.topologyKind,
  stages,
  samples,
  checks,
  featureHealth,
  stats: world.stats,
  seaLevel: world.seaLevel,
  avgStepMs: totalStepMs / steps,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function sampleDerived(label) {
  let terrain = null;
  let climate = null;
  let hydrology = null;
  let resources = null;
  runStage(`getTerrainDerived:${label}`, () => {
    terrain = getTerrainDerived(world);
  });
  runStage(`getClimateInputs:${label}`, () => {
    climate = getClimateInputs(world);
  });
  runStage(`getHydrologyInputs:${label}`, () => {
    hydrology = getHydrologyInputs(world);
  });
  runStage(`getResourceInputs:${label}`, () => {
    resources = getResourceInputs(world);
  });
  const sample = {
    label,
    step: world.step,
    ageYears: world.ageYears,
    landRatio: world.stats.landRatio,
    seaLevel: world.seaLevel,
    terrainSized: terrain?.relativeElevation?.length === grid.size,
    climateSized: climate?.latitude?.length === grid.size,
    hydrologySized: hydrology?.hydroElevation?.length === grid.size,
    resourcesSized: resources?.crustType?.length === grid.size,
    hydrologyValid: hydrology?.hydrologyDiagnostics?.hydrologyValid === true,
  };
  sample.valid = sample.terrainSized
    && sample.climateSized
    && sample.hydrologySized
    && sample.resourcesSized
    && sample.hydrologyValid
    && Number.isFinite(sample.landRatio)
    && Number.isFinite(sample.seaLevel);
  samples.push(sample);
}

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
      steps,
      gridSize: grid.size,
      topologyKind: grid.topologyKind,
      stages,
      failed: stages.at(-1),
      samples,
    }, null, 2));
    process.exit(1);
  }
}

function measureFeatureHealth(grid) {
  const stats = {
    mountainBelt: measureFeatureField(grid, grid.mountainBelt),
    trench: measureFeatureField(grid, grid.trench),
    ridge: measureFeatureField(grid, grid.ridge),
    rift: measureFeatureField(grid, grid.rift),
    islandArc: measureFeatureField(grid, grid.islandArc),
    basin: measureFeatureField(grid, grid.basin),
    featureIntensity: measureFeatureField(grid, grid.featureIntensity),
  };
  const activeTectonicCoverage02 =
    stats.mountainBelt.coverage02 +
    stats.trench.coverage02 +
    stats.ridge.coverage02 +
    stats.rift.coverage02 +
    stats.islandArc.coverage02;
  const activeTectonicMax = Math.max(
    stats.mountainBelt.max,
    stats.trench.max,
    stats.ridge.max,
    stats.rift.max,
    stats.islandArc.max,
  );
  return {
    ...stats,
    activeTectonicCoverage02,
    activeTectonicMax,
    activeFeatureMissing: activeTectonicCoverage02 <= 0 && activeTectonicMax <= 0.001,
    note: "diagnostic only: low values flag spherical production feature seeding gaps without failing this smoke check",
  };
}

function measureFeatureField(grid, field) {
  let sum = 0;
  let weight = 0;
  let max = 0;
  let coverage02 = 0;
  let coverage05 = 0;
  let boundaryCovered02 = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    const value = field?.[i] ?? 0;
    sum += value * area;
    weight += area;
    if (value > max) max = value;
    if (value > 0.02) {
      coverage02 += area;
      if (grid.boundaryDistance?.[i] === 0) boundaryCovered02 += area;
    }
    if (value > 0.05) coverage05 += area;
  }
  return {
    mean: sum / Math.max(weight, Number.EPSILON),
    max,
    coverage02: coverage02 / Math.max(weight, Number.EPSILON),
    coverage05: coverage05 / Math.max(weight, Number.EPSILON),
    boundaryZeroShare02: coverage02 ? boundaryCovered02 / coverage02 : 0,
  };
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
