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

const legacyRequestedSpherical = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "legacy",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize,
});

const before = summarizeWorldSet(cylindrical, spherical, adapter, legacyRequestedSpherical);
runToCheckpoints(cylindrical, [steps], () => null);
runToCheckpoints(spherical, [steps], () => null);
runToCheckpoints(adapter, [steps], () => null);
runToCheckpoints(legacyRequestedSpherical, [Math.min(2, steps)], () => null);
const after = summarizeWorldSet(cylindrical, spherical, adapter, legacyRequestedSpherical);
const gate = evaluateAuthoritativeGate(before, after);

const result = {
  valid: true,
  seedText,
  faceSize,
  steps,
  currentStage: gate.currentStage,
  authoritativeCoreReady: gate.authoritativeCoreReady,
  expectedDiagnosticMode: gate.expectedDiagnosticMode,
  diagnosticSidecarNonAuthoritative: gate.diagnosticSidecarNonAuthoritative,
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
    productionGridIsCubedSphere: before.spherical.productionGridIsCubedSphere === true,
    productionGridGraphBacked: before.spherical.hasProductionGraphTopology === true,
    productionGridMatchesSphericalSize: before.spherical.productionGridMatchesSphericalSize === true,
    adapterProductionGridIsCubedSphere: before.adapter.productionGridIsCubedSphere === true,
    adapterProductionGridGraphBacked: before.adapter.hasProductionGraphTopology === true,
    adapterProductionGridMatchesSphericalSize: before.adapter.productionGridMatchesSphericalSize === true,
    productionStepAdvanced: after.spherical.step === steps,
    adapterStepAdvanced: after.adapter.step === steps,
    diagnosticSphericalWorldAdvanced: after.spherical.sphericalMeanPlateDriftRadians > before.spherical.sphericalMeanPlateDriftRadians,
    adapterStatsStillPresent: Number.isFinite(after.adapter.landRatio) && Number.isFinite(after.adapter.seaRatio),
    productionStatsStillPresent: Number.isFinite(after.spherical.landRatio) && Number.isFinite(after.spherical.seaRatio),
    authoritativeModeCorrectlyIdentified: gate.authoritativeCoreReady === true,
    diagnosticSidecarNonAuthoritative: gate.diagnosticSidecarNonAuthoritative === true,
    experimentalAdapterCorrectlyIdentified: gate.expectedExperimentalAdapterMode === true,
    legacySphericalRequestNormalizedToGeologyV2: before.legacyRequestedSpherical.pipelineMode === "geology-v2",
    legacySphericalRequestCanStep: after.legacyRequestedSpherical.step === Math.min(2, steps),
    noAuthoritativeBlockers: gate.blockers.length === 0,
  },
  authorityChecks: gate.authorityChecks,
};

for (const value of Object.values(result.checks)) {
  if (!value) result.valid = false;
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function summarizeWorldSet(cylindricalWorld, sphericalWorld, adapterWorld, legacyRequestedSphericalWorld) {
  return {
    cylindrical: summarizeWorld(cylindricalWorld),
    spherical: summarizeWorld(sphericalWorld),
    adapter: summarizeWorld(adapterWorld),
    legacyRequestedSpherical: summarizeWorld(legacyRequestedSphericalWorld),
  };
}

function summarizeWorld(world) {
  const productionGridKind = world.grid.topology?.kind ?? world.grid.kind ?? "cylindrical";
  const productionTopologyKind = world.grid.topologyKind ?? world.grid.topologyOptions?.kind ?? productionGridKind;
  const productionGridIsCubedSphere = productionTopologyKind === "cubed-sphere" || productionGridKind.includes("cubed-sphere");
  return {
    step: world.step,
    pipelineMode: world.params.pipelineMode,
    topologyMode: world.params.topologyMode,
    projectionMode: world.params.projectionMode,
    productionTopologyMode: world.params.productionTopologyMode ?? null,
    productionGridKind,
    productionTopologyKind,
    productionGridIsCubedSphere,
    productionGridSize: world.grid.size,
    productionGridMatchesSphericalSize: world.grid.size === (world.sphericalGrid?.size ?? -1),
    hasProductionGraphTopology: Boolean(world.grid.topology?.graphBacked || world.grid.topologyOptions?.graphBacked),
    hasSphericalGrid: Boolean(world.sphericalGrid),
    hasSphericalWorld: Boolean(world.sphericalWorld),
    diagnosticSidecarAttached: Boolean(world.sphericalWorld),
    diagnosticSidecarRole: world.sphericalWorld?.role ?? null,
    diagnosticSidecarAuthoritative: world.sphericalWorld?.authoritative ?? null,
    diagnosticSidecarWritesProductionState: world.sphericalWorld?.writesProductionState ?? null,
    productionGridIsAuthoritative: productionGridIsCubedSphere,
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
    diagnosticWorldExplicitlySidecar: sphericalBefore.diagnosticSidecarRole === "diagnostic-sidecar",
    diagnosticWorldNonAuthoritative: sphericalBefore.diagnosticSidecarAuthoritative === false,
    diagnosticWorldReadOnlyForProduction: sphericalBefore.diagnosticSidecarWritesProductionState === false,
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
    authorityChecks.adapterProductionModeExplicit &&
    authorityChecks.adapterUsesCubedSphereGrid &&
    authorityChecks.adapterGridMatchesSphericalSize &&
    authorityChecks.adapterHasGraphTopology &&
    authorityChecks.adapterStatsAdvance;
  const diagnosticSidecarNonAuthoritative =
    authoritativeCoreReady &&
    authorityChecks.diagnosticWorldAttached &&
    authorityChecks.diagnosticWorldExplicitlySidecar &&
    authorityChecks.diagnosticWorldNonAuthoritative &&
    authorityChecks.diagnosticWorldReadOnlyForProduction &&
    sphericalBefore.productionGridKind !== sphericalBefore.sphericalWorldKind &&
    sphericalBefore.productionGridSize === sphericalBefore.sphericalGridSize;

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
    diagnosticSidecarNonAuthoritative,
    diagnosticStage: expectedDiagnosticMode ? "diagnostic-cubed-sphere-sidecar" : "unknown",
    adapterStage: expectedExperimentalAdapterMode ? "experimental-cubed-sphere-production-adapter" : "unavailable",
    currentStage: authoritativeCoreReady
      ? "authoritative-cubed-sphere-production-core"
      : expectedExperimentalAdapterMode
        ? "experimental-cubed-sphere-production-adapter"
        : "diagnostic-cubed-sphere-sidecar",
    status: authoritativeCoreReady
      ? "cubed-sphere production grid is authoritative; sphericalWorld remains a diagnostic sidecar only"
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
