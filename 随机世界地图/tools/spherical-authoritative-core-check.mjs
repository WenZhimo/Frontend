import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Number(process.argv[3] ?? 64);
const steps = Number(process.argv[4] ?? 20);

const cylindrical = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cylindrical",
});

const spherical = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize,
});

const before = summarizeWorldPair(cylindrical, spherical);
runToCheckpoints(cylindrical, [steps], () => null);
runToCheckpoints(spherical, [steps], () => null);
const after = summarizeWorldPair(cylindrical, spherical);

const result = {
  valid: true,
  seedText,
  faceSize,
  steps,
  status: "cubed-sphere remains diagnostic; production geology-v2 still advances the cylindrical grid",
  before,
  after,
  checks: {
    cylindricalHasNoSphericalWorld: before.cylindrical.hasSphericalWorld === false,
    cubedSphereHasDiagnosticWorld: before.spherical.hasSphericalWorld === true,
    productionGridStillCylindrical: before.spherical.productionGridKind === "cylindrical",
    productionStepAdvanced: after.spherical.step === steps,
    diagnosticSphericalWorldNotAdvanced: after.spherical.sphericalMeanPlateDriftRadians === before.spherical.sphericalMeanPlateDriftRadians,
    productionStatsStillPresent: Number.isFinite(after.spherical.landRatio) && Number.isFinite(after.spherical.seaRatio),
  },
};

for (const value of Object.values(result.checks)) {
  if (!value) result.valid = false;
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function summarizeWorldPair(cylindricalWorld, sphericalWorld) {
  return {
    cylindrical: summarizeWorld(cylindricalWorld),
    spherical: summarizeWorld(sphericalWorld),
  };
}

function summarizeWorld(world) {
  return {
    step: world.step,
    topologyMode: world.params.topologyMode,
    projectionMode: world.params.projectionMode,
    productionGridKind: world.grid.topology?.kind ?? world.grid.kind ?? "cylindrical",
    productionGridSize: world.grid.size,
    hasSphericalGrid: Boolean(world.sphericalGrid),
    hasSphericalWorld: Boolean(world.sphericalWorld),
    sphericalGridKind: world.sphericalGrid?.topologyKind ?? null,
    sphericalGridSize: world.sphericalGrid?.size ?? 0,
    sphericalWorldKind: world.sphericalWorld?.kind ?? null,
    sphericalMeanPlateDriftRadians: world.sphericalWorld?.stats?.meanPlateDriftRadians ?? null,
    sphericalActiveBoundaryShare: world.sphericalWorld?.stats?.activeBoundaryShare ?? null,
    landRatio: world.stats?.landRatio ?? null,
    seaRatio: world.stats?.seaRatio ?? null,
  };
}
