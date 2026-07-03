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
  blockerCount: gate.blockers.length,
  blockers: gate.blockers,
  nextMigrationTargets: gate.nextMigrationTargets,
  before,
  after,
  checks: {
    cylindricalHasNoSphericalWorld: before.cylindrical.hasSphericalWorld === false,
    cubedSphereHasDiagnosticWorld: before.spherical.hasSphericalWorld === true,
    productionGridStillCylindrical: before.spherical.productionGridKind === "cylindrical",
    productionStepAdvanced: after.spherical.step === steps,
    diagnosticSphericalWorldAdvanced: after.spherical.sphericalMeanPlateDriftRadians > before.spherical.sphericalMeanPlateDriftRadians,
    productionStatsStillPresent: Number.isFinite(after.spherical.landRatio) && Number.isFinite(after.spherical.seaRatio),
    diagnosticModeCorrectlyIdentified: gate.expectedDiagnosticMode === true,
    authoritativeCoreNotPrematurelyClaimed: gate.authoritativeCoreReady === false,
  },
  authorityChecks: gate.authorityChecks,
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
  const productionGridKind = world.grid.topology?.kind ?? world.grid.kind ?? "cylindrical";
  const productionTopologyKind = world.grid.topologyKind ?? world.grid.topologyOptions?.kind ?? productionGridKind;
  return {
    step: world.step,
    topologyMode: world.params.topologyMode,
    projectionMode: world.params.projectionMode,
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
  const authorityChecks = {
    requestedCubedSphereTopology: sphericalBefore.topologyMode === "cubed-sphere",
    productionUsesCubedSphereGrid: sphericalBefore.productionGridIsCubedSphere === true,
    productionGridMatchesSphericalSize: sphericalBefore.productionGridMatchesSphericalSize === true,
    productionHasGraphTopology: sphericalBefore.hasProductionGraphTopology === true,
    diagnosticWorldAttached: sphericalBefore.hasSphericalWorld === true,
    diagnosticWorldAdvanced: sphericalAfter.sphericalMeanPlateDriftRadians > sphericalBefore.sphericalMeanPlateDriftRadians,
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
    currentStage: authoritativeCoreReady ? "authoritative-cubed-sphere-production-core" : "diagnostic-cubed-sphere-sidecar",
    status: authoritativeCoreReady
      ? "cubed-sphere production grid is authoritative"
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
