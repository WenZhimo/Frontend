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

const adapter = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  productionTopologyMode: "cubed-sphere-adapter",
  faceSize,
});

const before = summarizeWorldSet(cylindrical, spherical, adapter);
runToCheckpoints(cylindrical, [steps], () => null);
runToCheckpoints(spherical, [steps], () => null);
runToCheckpoints(adapter, [steps], () => null);
const after = summarizeWorldSet(cylindrical, spherical, adapter);
const gate = evaluateAuthoritativeGate(before, after);

const result = {
  valid: true,
  seedText,
  faceSize,
  steps,
  currentStage: gate.currentStage,
  authoritativeCoreReady: gate.authoritativeCoreReady,
  expectedDiagnosticMode: gate.expectedDiagnosticMode,
  status: gate.status,
  diagnosticStage: gate.diagnosticStage,
  adapterStage: gate.adapterStage,
  blockerCount: gate.blockers.length,
  blockers: gate.blockers,
  nextMigrationTargets: gate.nextMigrationTargets,
  before,
  after,
  checks: {
    cylindricalHasNoSphericalWorld: before.cylindrical.hasSphericalWorld === false,
    cubedSphereHasDiagnosticWorld: before.spherical.hasSphericalWorld === true,
    productionGridStillCylindrical: before.spherical.productionGridKind === "cylindrical",
    adapterProductionGridIsCubedSphere: before.adapter.productionGridIsCubedSphere === true,
    adapterProductionGridGraphBacked: before.adapter.hasProductionGraphTopology === true,
    adapterProductionGridMatchesSphericalSize: before.adapter.productionGridMatchesSphericalSize === true,
    productionStepAdvanced: after.spherical.step === steps,
    adapterStepAdvanced: after.adapter.step === steps,
    diagnosticSphericalWorldAdvanced: after.spherical.sphericalMeanPlateDriftRadians > before.spherical.sphericalMeanPlateDriftRadians,
    adapterStatsStillPresent: Number.isFinite(after.adapter.landRatio) && Number.isFinite(after.adapter.seaRatio),
    productionStatsStillPresent: Number.isFinite(after.spherical.landRatio) && Number.isFinite(after.spherical.seaRatio),
    diagnosticModeCorrectlyIdentified: gate.expectedDiagnosticMode === true,
    experimentalAdapterCorrectlyIdentified: gate.expectedExperimentalAdapterMode === true,
    authoritativeCoreNotPrematurelyClaimed: gate.authoritativeCoreReady === false,
  },
  authorityChecks: gate.authorityChecks,
};

for (const value of Object.values(result.checks)) {
  if (!value) result.valid = false;
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function summarizeWorldSet(cylindricalWorld, sphericalWorld, adapterWorld) {
  return {
    cylindrical: summarizeWorld(cylindricalWorld),
    spherical: summarizeWorld(sphericalWorld),
    adapter: summarizeWorld(adapterWorld),
  };
}

function summarizeWorld(world) {
  const productionGridKind = world.grid.topology?.kind ?? world.grid.kind ?? "cylindrical";
  const productionTopologyKind = world.grid.topologyKind ?? world.grid.topologyOptions?.kind ?? productionGridKind;
  return {
    step: world.step,
    topologyMode: world.params.topologyMode,
    projectionMode: world.params.projectionMode,
    productionTopologyMode: world.params.productionTopologyMode ?? null,
    productionGridKind,
    productionTopologyKind,
    productionGridIsCubedSphere: productionTopologyKind === "cubed-sphere" || productionGridKind.includes("cubed-sphere"),
    productionGridSize: world.grid.size,
    productionGridMatchesSphericalSize: world.grid.size === (world.sphericalGrid?.size ?? -1),
    hasProductionGraphTopology: Boolean(world.grid.topology?.graphBacked || world.grid.topologyOptions?.graphBacked),
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

function evaluateAuthoritativeGate(before, after) {
  const sphericalBefore = before.spherical;
  const sphericalAfter = after.spherical;
  const adapterBefore = before.adapter;
  const adapterAfter = after.adapter;
  const authorityChecks = {
    requestedCubedSphereTopology: sphericalBefore.topologyMode === "cubed-sphere",
    productionUsesCubedSphereGrid: sphericalBefore.productionGridIsCubedSphere === true,
    productionGridMatchesSphericalSize: sphericalBefore.productionGridMatchesSphericalSize === true,
    productionHasGraphTopology: sphericalBefore.hasProductionGraphTopology === true,
    diagnosticWorldAttached: sphericalBefore.hasSphericalWorld === true,
    diagnosticWorldAdvanced: sphericalAfter.sphericalMeanPlateDriftRadians > sphericalBefore.sphericalMeanPlateDriftRadians,
    adapterUsesCubedSphereGrid: adapterBefore.productionGridIsCubedSphere === true,
    adapterGridMatchesSphericalSize: adapterBefore.productionGridMatchesSphericalSize === true,
    adapterHasGraphTopology: adapterBefore.hasProductionGraphTopology === true,
    adapterProductionModeExplicit: adapterBefore.productionTopologyMode === "cubed-sphere-adapter",
    adapterStatsAdvance: adapterAfter.step === steps && Number.isFinite(adapterAfter.landRatio) && Number.isFinite(adapterAfter.seaRatio),
    cylindricalReferenceStillAvailable: before.cylindrical.hasSphericalWorld === false,
    productionStatsAdvance: sphericalAfter.step === after.cylindrical.step && sphericalAfter.step === steps,
  };
  const authoritativeCoreReady =
    authorityChecks.requestedCubedSphereTopology &&
    authorityChecks.productionUsesCubedSphereGrid &&
    authorityChecks.productionGridMatchesSphericalSize &&
    authorityChecks.productionHasGraphTopology;

  const expectedDiagnosticMode =
    authorityChecks.requestedCubedSphereTopology &&
    !authoritativeCoreReady &&
    sphericalBefore.productionGridKind === "cylindrical" &&
    authorityChecks.diagnosticWorldAttached &&
    authorityChecks.diagnosticWorldAdvanced;

  const expectedExperimentalAdapterMode =
    expectedDiagnosticMode &&
    authorityChecks.adapterProductionModeExplicit &&
    authorityChecks.adapterUsesCubedSphereGrid &&
    authorityChecks.adapterGridMatchesSphericalSize &&
    authorityChecks.adapterHasGraphTopology &&
    authorityChecks.adapterStatsAdvance;

  const blockers = [];
  if (!authorityChecks.productionUsesCubedSphereGrid) {
    blockers.push("production grid is still cylindrical when topologyMode=cubed-sphere");
  }
  if (!authorityChecks.productionGridMatchesSphericalSize) {
    blockers.push("production field arrays still use cylindrical resolution size");
  }
  if (!authorityChecks.productionHasGraphTopology) {
    blockers.push("production grid does not expose graph-backed topology access");
  }

  return {
    authorityChecks,
    authoritativeCoreReady,
    expectedDiagnosticMode,
    expectedExperimentalAdapterMode,
    diagnosticStage: expectedDiagnosticMode ? "diagnostic-cubed-sphere-sidecar" : "unknown",
    adapterStage: expectedExperimentalAdapterMode ? "experimental-cubed-sphere-production-adapter" : "unavailable",
    currentStage: authoritativeCoreReady
      ? "authoritative-cubed-sphere-production-core"
      : expectedExperimentalAdapterMode
        ? "experimental-cubed-sphere-production-adapter"
        : "diagnostic-cubed-sphere-sidecar",
    status: authoritativeCoreReady
      ? "cubed-sphere production grid is authoritative"
      : expectedExperimentalAdapterMode
        ? "cubed-sphere production adapter is available only through explicit opt-in; default topology remains diagnostic"
        : "cubed-sphere remains diagnostic; production geology-v2 still advances the cylindrical grid",
    blockers,
    nextMigrationTargets: authoritativeCoreReady
      ? []
      : [
          "wire production grid creation through cubed-sphere adapter only after target modules are graph-safe",
          "migrate read-only diagnostics to area-weighted topology graph fields",
          "migrate ocean connectivity and distance fields to production graph APIs",
        ],
  };
}
