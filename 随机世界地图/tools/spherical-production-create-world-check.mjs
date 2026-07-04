import { stepWorld } from "../src/sim/evolution.js";
import { createWorld } from "../src/sim/world.js";
import { getClimateInputs, getHydrologyInputs, getResourceInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 32)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 1)));

const cylindrical = createWorld({
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
});

const adapter = createWorld({
  seedText,
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  productionTopologyMode: "cubed-sphere-adapter",
  faceSize,
});

for (let i = 0; i < steps; i += 1) stepWorld(adapter);

const terrain = getTerrainDerived(adapter);
const climate = getClimateInputs(adapter);
const hydrology = getHydrologyInputs(adapter);
const resources = getResourceInputs(adapter);

const checks = {
  defaultCubedSphereStillCylindricalProduction: cylindrical.grid.topologyKind !== "cubed-sphere"
    && cylindrical.grid.topologyOptions?.kind === "cylindrical",
  defaultCubedSphereKeepsDiagnosticSidecar: cylindrical.sphericalWorld?.kind === "spherical-experimental-world",
  adapterProductionGridIsCubedSphere: adapter.grid.topologyKind === "cubed-sphere",
  adapterProductionGridGraphBacked: adapter.grid.topologyOptions?.graphBacked === true,
  adapterHasNoLegacyDimensions: !Object.hasOwn(adapter.grid, "width") && !Object.hasOwn(adapter.grid, "height"),
  adapterMatchesFaceSize: adapter.grid.faceSize === faceSize,
  adapterStepAdvanced: adapter.step === steps,
  adapterStatsFinite: Number.isFinite(adapter.stats.landRatio) && Number.isFinite(adapter.stats.seaRatio),
  terrainSized: terrain.relativeElevation.length === adapter.grid.size,
  climateSized: climate.latitude.length === adapter.grid.size,
  hydrologySized: hydrology.hydroElevation.length === adapter.grid.size,
  resourcesSized: resources.crustType.length === adapter.grid.size,
  hydrologyValid: hydrology.hydrologyDiagnostics.hydrologyValid === true,
};

const result = {
  valid: Object.values(checks).every(Boolean),
  seedText,
  faceSize,
  steps,
  defaultProduction: {
    topologyMode: cylindrical.params.topologyMode,
    productionTopologyMode: cylindrical.params.productionTopologyMode,
    gridKind: cylindrical.grid.kind ?? "cylindrical",
    topologyKind: cylindrical.grid.topologyKind ?? cylindrical.grid.topologyOptions?.kind ?? null,
    gridSize: cylindrical.grid.size,
    hasDiagnosticSphericalWorld: Boolean(cylindrical.sphericalWorld),
  },
  adapterProduction: {
    topologyMode: adapter.params.topologyMode,
    productionTopologyMode: adapter.params.productionTopologyMode,
    gridKind: adapter.grid.kind,
    topologyKind: adapter.grid.topologyKind,
    graphBacked: adapter.grid.topologyOptions?.graphBacked === true,
    gridSize: adapter.grid.size,
    faceSize: adapter.grid.faceSize,
    step: adapter.step,
    landRatio: adapter.stats.landRatio,
    seaRatio: adapter.stats.seaRatio,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
