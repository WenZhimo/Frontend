import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? options.seed ?? "龙骨海-纪元7";
const faceSize = parseIntOption(options, "face-size", Number(positional[1] ?? 16));
const shortSteps = parseIntOption(options, "steps", Number(positional[2] ?? 2));
const longSteps = parseIntOption(options, "long-steps", 200);
const deepSteps = parseIntOption(options, "deep-steps", 739);
const checkTimeoutMs = parseIntOption(options, "timeout-ms", 60000);
const heavyTimeoutMs = parseIntOption(options, "heavy-timeout-ms", 180000);

const checks = [
  ["topology", "sphere-topology-check", ["tools/sphere-topology-check.mjs", String(faceSize)], checkTimeoutMs],
  ["topology", "spherical-connectivity-check", ["tools/spherical-connectivity-check.mjs", String(faceSize)], checkTimeoutMs],
  ["topology", "spherical-migration-readiness-check", ["tools/spherical-migration-readiness-check.mjs"], checkTimeoutMs],
  ["geology", "plate-pole-crossing-check", ["tools/plate-pole-crossing-check.mjs", seedText, "cubed-sphere", String(faceSize)], checkTimeoutMs],
  ["geology", "spherical-authoritative-core-check", ["tools/spherical-authoritative-core-check.mjs", seedText, String(faceSize), "20"], heavyTimeoutMs],
  ["geology", "long-run-check:cubed-sphere-production", [
    "tools/long-run-check.mjs",
    seedText,
    String(longSteps),
    "geology-v2",
    "256x128",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ], heavyTimeoutMs],
  ["geology", "long-run-check:cubed-sphere-production:deep", [
    "tools/long-run-check.mjs",
    seedText,
    String(deepSteps),
    "geology-v2",
    "256x128",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ], heavyTimeoutMs],
  ["statistics", "resolution-check:cubed-sphere-production", [
    "tools/resolution-check.mjs",
    seedText,
    String(longSteps),
    "geology-v2",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ], heavyTimeoutMs],
  ["render", "projection-check:equirectangular", ["tools/projection-check.mjs", String(faceSize), "equirectangular"], checkTimeoutMs],
  ["render", "projection-check:orthographic", ["tools/projection-check.mjs", String(faceSize), "orthographic"], checkTimeoutMs],
  ["render", "spherical-render-gate-check", ["tools/spherical-render-gate-check.mjs", seedText, String(Math.max(16, Math.floor(faceSize / 2))), String(shortSteps), "128x64"], checkTimeoutMs],
  ["compatibility", "interface-check:cylindrical", [
    "tools/interface-check.mjs",
    seedText,
    "20",
    "geology-v2",
    "256x128",
  ], checkTimeoutMs],
  ["compatibility", "interface-check:cubed-sphere-production", [
    "tools/interface-check.mjs",
    seedText,
    "20",
    "geology-v2",
    "256x128",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ], checkTimeoutMs],
  ["compatibility", "spherical-file-url-bundle-check", ["tools/spherical-file-url-bundle-check.mjs"], checkTimeoutMs],
  ["compatibility", "render-check:cylindrical-default", [
    "tools/render-check.mjs",
    seedText,
    "20",
    "_spherical_final_acceptance_render.ppm",
    "geology-v2",
    "256x128",
  ], checkTimeoutMs],
];

const startedAt = Date.now();
const results = checks.map(runCheck);
cleanupFinalArtifacts();

const categories = summarizeCategories(results);
const metrics = deriveAcceptanceMetrics(results);
const acceptance = evaluateAcceptance(metrics);
const failures = [
  ...results.filter((result) => !result.valid).map((result) => result.name),
  ...Object.entries(acceptance.checks).filter(([, ok]) => !ok).map(([name]) => name),
];

const result = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  shortSteps,
  longSteps,
  deepSteps,
  totalMs: Date.now() - startedAt,
  checkCount: results.length,
  passedCheckCount: results.filter((item) => item.valid).length,
  failedCheckCount: results.filter((item) => !item.valid).length,
  failures,
  categories,
  acceptance,
  metrics,
  results,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function runCheck([category, name, args, timeoutMs]) {
  const started = Date.now();
  const child = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: timeoutMs,
  });
  const stdout = String(child.stdout ?? "").trim();
  const stderr = String(child.stderr ?? "").trim();
  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  return {
    name,
    category,
    valid: child.status === 0 && !child.error,
    status: child.status,
    timedOut: child.error?.code === "ETIMEDOUT" || child.signal === "SIGTERM",
    timeoutMs,
    ms: Date.now() - started,
    metrics: compactMetrics(name, parsed),
    error: child.error ? String(child.error.message ?? child.error).slice(0, 1200) : undefined,
    stderr: stderr ? stderr.slice(0, 1200) : undefined,
  };
}

function summarizeCategories(results) {
  const summary = {};
  for (const result of results) {
    if (!summary[result.category]) {
      summary[result.category] = {
        checkCount: 0,
        passedCheckCount: 0,
        failedCheckCount: 0,
        timedOutCheckCount: 0,
        totalMs: 0,
      };
    }
    const bucket = summary[result.category];
    bucket.checkCount += 1;
    bucket.passedCheckCount += result.valid ? 1 : 0;
    bucket.failedCheckCount += result.valid ? 0 : 1;
    bucket.timedOutCheckCount += result.timedOut ? 1 : 0;
    bucket.totalMs += result.ms;
  }
  return summary;
}

function compactMetrics(name, parsed) {
  if (!parsed) return {};
  const picked = {
    valid: parsed.valid,
    topologyKind: parsed.topologyKind ?? parsed.stats?.topologyKind,
    faceSize: parsed.faceSize,
    steps: parsed.steps,
    landRatio: parsed.landRatio ?? parsed.stats?.landRatio,
    seaRatio: parsed.seaRatio ?? parsed.stats?.seaRatio,
    seaLevel: parsed.seaLevel,
  };
  if (name === "sphere-topology-check") {
    picked.neighborSymmetryValid = parsed.neighborSymmetryValid;
    picked.globalConnectivityValid = parsed.globalConnectivityValid;
    picked.areaTotalError = parsed.areaTotalError;
    picked.poleSingularityRisk = parsed.poleSingularityRisk;
  }
  if (name === "spherical-connectivity-check") {
    picked.externalSeaShare = parsed.externalSeaShare;
    picked.inlandWaterCandidateShare = parsed.inlandWaterCandidateShare;
    picked.closedBasinCount = parsed.closedBasinCount;
  }
  if (name === "spherical-migration-readiness-check") {
    picked.fullMigrationReady = parsed.fullMigrationReady;
    picked.helperMigrationReady = parsed.helperMigrationReady;
    picked.legacyRiskCount = parsed.legacyRiskCount;
    picked.possibleSphericalPathHelperCount = parsed.possibleSphericalPathHelperCount;
    picked.topologyMigrationCoverage = parsed.topologyMigrationCoverage;
  }
  if (name === "plate-pole-crossing-check") {
    picked.width = parsed.width;
    picked.height = parsed.height;
  }
  if (name === "spherical-authoritative-core-check") {
    picked.authoritativeCoreReady = parsed.authoritativeCoreReady;
    picked.blockerCount = parsed.blockerCount;
    picked.diagnosticSidecarNonAuthoritative = parsed.diagnosticSidecarNonAuthoritative;
    picked.authoritativeProductionGridGraphBacked = parsed.checks?.productionGridGraphBacked;
    picked.authoritativeProductionStepAdvanced = parsed.checks?.productionStepAdvanced;
    picked.authoritativeCylindricalReferenceStillAvailable = parsed.authorityChecks?.cylindricalReferenceStillAvailable;
  }
  if (name.startsWith("long-run-check:")) {
    picked.causalityPass = parsed.causalityPass;
    picked.topologyKind = parsed.topologyDiagnostics?.topologyKind ?? picked.topologyKind;
    picked.neighborConsistencyValid = parsed.topologyDiagnostics?.neighborConsistencyValid;
    picked.floodFillTopologyValid = parsed.topologyDiagnostics?.floodFillTopologyValid;
    picked.connectedComponentTopologyValid = parsed.topologyDiagnostics?.connectedComponentTopologyValid;
    picked.connectedComponentAreaError = parsed.topologyDiagnostics?.connectedComponentAreaError;
    picked.faceSeamContinuityRisk = parsed.topologyDiagnostics?.faceSeamContinuityRisk;
    picked.topologyManualAccessRisk = parsed.topologyDiagnostics?.topologyManualAccessRisk;
    picked.topologyMigrationCoverage = parsed.topologyDiagnostics?.topologyMigrationCoverage;
    picked.hydrologyValid = parsed.hydrologyDiagnostics?.hydrologyValid;
    picked.sedimentBudgetError = parsed.sedimentBudgetDiagnostics?.sedimentBudgetError;
    picked.sedimentStraightnessRisk = parsed.sedimentBudgetDiagnostics?.sedimentStraightnessRisk;
    picked.plateCheckerboardScore = parsed.boundaryDiagnostics?.plateCheckerboardScore;
    picked.oldBoundaryReliefCorrelation = parsed.transformDiagnostics?.oldBoundaryReliefCorrelation;
    picked.activeVsInactiveBoundaryReliefRatio = parsed.transformDiagnostics?.activeVsInactiveBoundaryReliefRatio;
  }
  if (name.startsWith("resolution-check:")) {
    const comparisons = parsed.comparisons ?? {};
    const values = Object.values(comparisons).filter(Boolean);
    picked.topologyMode = parsed.topologyMode;
    picked.projectionMode = parsed.projectionMode;
    picked.comparisonCount = values.length;
    picked.maxLandMismatch = maxMetric(values, "landMismatchVsBaseline");
    picked.maxPlateMismatch = maxMetric(values, "plateMismatchVsBaseline");
    picked.maxElevationRmse = maxMetric(values, "elevationRmseVsBaseline");
    const baseline = comparisons[parsed.baselineResolution] ?? values[0] ?? null;
    picked.topologyKind = baseline?.topologyDiagnostics?.topologyKind;
    picked.neighborConsistencyValid = baseline?.topologyDiagnostics?.neighborConsistencyValid;
    picked.faceSeamContinuityRisk = baseline?.topologyDiagnostics?.faceSeamContinuityRisk;
    picked.topologyManualAccessRisk = baseline?.topologyDiagnostics?.topologyManualAccessRisk;
    picked.hydrologyValid = baseline?.hydrologyDiagnostics?.hydrologyValid;
    picked.sedimentBudgetError = baseline?.sedimentBudgetDiagnostics?.sedimentBudgetError;
    picked.sedimentStraightnessRisk = baseline?.sedimentBudgetDiagnostics?.sedimentStraightnessRisk;
  }
  if (name.startsWith("projection-check:")) {
    picked.projection = parsed.projection;
    picked.blankSampleShare = parsed.blankSampleShare;
    picked.maxNearestAngularError = parsed.maxNearestAngularError;
    picked.dateLineContinuityRisk = parsed.dateLineContinuityRisk;
    picked.northPoleHalfMapReturnValid = parsed.northPoleHalfMapReturnValid;
    picked.southPoleHalfMapReturnValid = parsed.southPoleHalfMapReturnValid;
    picked.orthographicBlankShareDelta = parsed.orthographicBlankShareDelta;
  }
  if (name === "spherical-render-gate-check") {
    picked.renderUsesSphericalProjection = parsed.checks?.renderUsesSphericalProjection;
    picked.gpuUsesSphericalCpuReference = parsed.checks?.gpuUsesSphericalCpuReference;
    picked.gpuRectangularPathSkipped = parsed.checks?.gpuRectangularPathSkipped;
    picked.debugLayerRestricted = parsed.checks?.debugLayerRestricted;
    picked.cellIdDebugInformative = parsed.checks?.cellIdDebugInformative;
    picked.neighborCountDebugInformative = parsed.checks?.neighborCountDebugInformative;
    picked.areaDebugInformative = parsed.checks?.areaDebugInformative;
  }
  if (name.startsWith("interface-check:")) {
    picked.pipelineMode = parsed.pipelineMode;
    picked.topologyMode = parsed.topologyMode;
    picked.projectionMode = parsed.projectionMode;
    picked.gridSize = parsed.gridSize;
    picked.sphericalGridSize = parsed.sphericalGridSize;
    picked.validationErrorCount = parsed.validation?.errors?.length ?? 0;
    picked.hydrologyValid = parsed.stats?.hydrologyValid;
    picked.neighborConsistencyValid = parsed.stats?.neighborConsistencyValid;
    picked.floodFillTopologyValid = parsed.stats?.floodFillTopologyValid;
    picked.connectedComponentTopologyValid = parsed.stats?.connectedComponentTopologyValid;
    picked.topologyManualAccessRisk = parsed.stats?.topologyManualAccessRisk;
    picked.topologyMigrationCoverage = parsed.stats?.topologyMigrationCoverage;
  }
  if (name === "spherical-file-url-bundle-check") {
    picked.indexLoadsClassicAppScript = parsed.checks?.indexLoadsClassicAppScript;
    picked.indexDoesNotUseModuleScript = parsed.checks?.indexDoesNotUseModuleScript;
    picked.appBundleHasNoTopLevelEsm = parsed.checks?.appBundleHasNoTopLevelEsm;
    picked.appBundleIncludesCpuProductionPath = parsed.checks?.appBundleIncludesCpuProductionPath;
  }
  if (name === "render-check:cylindrical-default") {
    picked.renderBackend = parsed.renderBackend;
    picked.renderUsesSphericalProjection = parsed.renderUsesSphericalProjection;
    picked.causalityPass = parsed.causalityPass;
  }
  return picked;
}

function deriveAcceptanceMetrics(results) {
  const byName = new Map(results.map((result) => [result.name, result.metrics]));
  const topology = byName.get("sphere-topology-check") ?? {};
  const readiness = byName.get("spherical-migration-readiness-check") ?? {};
  const authoritative = byName.get("spherical-authoritative-core-check") ?? {};
  const longRun = byName.get("long-run-check:cubed-sphere-production") ?? {};
  const deepRun = byName.get("long-run-check:cubed-sphere-production:deep") ?? {};
  const resolution = byName.get("resolution-check:cubed-sphere-production") ?? {};
  const equirectangular = byName.get("projection-check:equirectangular") ?? {};
  const orthographic = byName.get("projection-check:orthographic") ?? {};
  const renderGate = byName.get("spherical-render-gate-check") ?? {};
  const cylindricalInterface = byName.get("interface-check:cylindrical") ?? {};
  const sphericalInterface = byName.get("interface-check:cubed-sphere-production") ?? {};
  const fileUrl = byName.get("spherical-file-url-bundle-check") ?? {};
  const renderDefault = byName.get("render-check:cylindrical-default") ?? {};

  return {
    topologyKind: topology.topologyKind,
    neighborSymmetryValid: topology.neighborSymmetryValid,
    globalConnectivityValid: topology.globalConnectivityValid,
    areaTotalError: topology.areaTotalError,
    poleSingularityRisk: topology.poleSingularityRisk,
    fullMigrationReady: readiness.fullMigrationReady,
    helperMigrationReady: readiness.helperMigrationReady,
    legacyRiskCount: readiness.legacyRiskCount,
    possibleSphericalPathHelperCount: readiness.possibleSphericalPathHelperCount,
    authoritativeCoreReady: authoritative.authoritativeCoreReady,
    authoritativeBlockerCount: authoritative.blockerCount,
    diagnosticSidecarNonAuthoritative: authoritative.diagnosticSidecarNonAuthoritative,
    cylindricalReferenceStillAvailable: authoritative.authoritativeCylindricalReferenceStillAvailable,
    longRun200TopologyKind: longRun.topologyKind,
    longRun200CausalityPass: longRun.causalityPass,
    longRun200FaceSeamContinuityRisk: longRun.faceSeamContinuityRisk,
    longRun200TopologyManualAccessRisk: longRun.topologyManualAccessRisk,
    longRun200SedimentBudgetError: longRun.sedimentBudgetError,
    longRun200SedimentStraightnessRisk: longRun.sedimentStraightnessRisk,
    longRun200OldBoundaryReliefCorrelation: longRun.oldBoundaryReliefCorrelation,
    longRun739TopologyKind: deepRun.topologyKind,
    longRun739CausalityPass: deepRun.causalityPass,
    longRun739FaceSeamContinuityRisk: deepRun.faceSeamContinuityRisk,
    longRun739TopologyManualAccessRisk: deepRun.topologyManualAccessRisk,
    longRun739SedimentBudgetError: deepRun.sedimentBudgetError,
    longRun739SedimentStraightnessRisk: deepRun.sedimentStraightnessRisk,
    longRun739OldBoundaryReliefCorrelation: deepRun.oldBoundaryReliefCorrelation,
    resolutionTopologyMode: resolution.topologyMode,
    resolutionComparisonCount: resolution.comparisonCount,
    resolutionMaxLandMismatch: resolution.maxLandMismatch,
    resolutionMaxPlateMismatch: resolution.maxPlateMismatch,
    resolutionMaxElevationRmse: resolution.maxElevationRmse,
    resolutionHydrologyValid: resolution.hydrologyValid,
    equirectangularDateLineContinuityRisk: equirectangular.dateLineContinuityRisk,
    equirectangularNorthPoleHalfMapReturnValid: equirectangular.northPoleHalfMapReturnValid,
    equirectangularSouthPoleHalfMapReturnValid: equirectangular.southPoleHalfMapReturnValid,
    orthographicBlankShareDelta: orthographic.orthographicBlankShareDelta,
    sphericalRenderUsesProjection: renderGate.renderUsesSphericalProjection,
    gpuUsesSphericalCpuReference: renderGate.gpuUsesSphericalCpuReference,
    gpuRectangularPathSkipped: renderGate.gpuRectangularPathSkipped,
    debugLayerRestricted: renderGate.debugLayerRestricted,
    debugLayersInformative:
      renderGate.cellIdDebugInformative &&
      renderGate.neighborCountDebugInformative &&
      renderGate.areaDebugInformative,
    cylindricalInterfaceValid: cylindricalInterface.valid === true && cylindricalInterface.validationErrorCount === 0,
    cubedSphereInterfaceValid: sphericalInterface.valid === true && sphericalInterface.validationErrorCount === 0,
    cubedSphereHydrologyValid: sphericalInterface.hydrologyValid,
    cubedSphereTopologyMigrationCoverage: sphericalInterface.topologyMigrationCoverage,
    indexLoadsClassicAppScript: fileUrl.indexLoadsClassicAppScript,
    indexDoesNotUseModuleScript: fileUrl.indexDoesNotUseModuleScript,
    appBundleHasNoTopLevelEsm: fileUrl.appBundleHasNoTopLevelEsm,
    appBundleIncludesCpuProductionPath: fileUrl.appBundleIncludesCpuProductionPath,
    defaultRenderBackend: renderDefault.renderBackend,
    defaultRenderUsesSphericalProjection: renderDefault.renderUsesSphericalProjection,
    defaultRenderCausalityPass: renderDefault.causalityPass,
  };
}

function evaluateAcceptance(metrics) {
  const checks = {
    topologyIsCubedSphere: metrics.topologyKind === "cubed-sphere",
    neighborSymmetryValid: metrics.neighborSymmetryValid === true,
    globalConnectivityValid: metrics.globalConnectivityValid === true,
    areaTotalErrorBounded: Math.abs(metrics.areaTotalError ?? Infinity) < 1e-4,
    poleSingularityRiskZero: metrics.poleSingularityRisk === 0,
    readinessClean:
      metrics.fullMigrationReady === true &&
      metrics.helperMigrationReady === true &&
      metrics.legacyRiskCount === 0 &&
      metrics.possibleSphericalPathHelperCount === 0,
    authoritativeCubedSphereCore:
      metrics.authoritativeCoreReady === true &&
      metrics.authoritativeBlockerCount === 0 &&
      metrics.diagnosticSidecarNonAuthoritative === true,
    cylindricalCompatibilityPresent: metrics.cylindricalReferenceStillAvailable === true,
    geologyLongRun200Valid:
      metrics.longRun200TopologyKind === "cubed-sphere" &&
      metrics.longRun200CausalityPass === true &&
      metrics.longRun200FaceSeamContinuityRisk < 0.02 &&
      metrics.longRun200TopologyManualAccessRisk === 0 &&
      Math.abs(metrics.longRun200SedimentBudgetError ?? Infinity) < 1e-3 &&
      metrics.longRun200SedimentStraightnessRisk <= 0.05 &&
      metrics.longRun200OldBoundaryReliefCorrelation < 0.05,
    geologyLongRun739Valid:
      metrics.longRun739TopologyKind === "cubed-sphere" &&
      metrics.longRun739CausalityPass === true &&
      metrics.longRun739FaceSeamContinuityRisk < 0.02 &&
      metrics.longRun739TopologyManualAccessRisk === 0 &&
      Math.abs(metrics.longRun739SedimentBudgetError ?? Infinity) < 1e-3 &&
      metrics.longRun739SedimentStraightnessRisk <= 0.05 &&
      metrics.longRun739OldBoundaryReliefCorrelation < 0.05,
    resolutionConverges:
      metrics.resolutionTopologyMode === "cubed-sphere" &&
      metrics.resolutionComparisonCount >= 2 &&
      metrics.resolutionMaxLandMismatch <= 0.08 &&
      metrics.resolutionMaxPlateMismatch <= 0.08 &&
      metrics.resolutionMaxElevationRmse <= 0.08 &&
      metrics.resolutionHydrologyValid === true,
    projectionContinuityValid:
      metrics.equirectangularDateLineContinuityRisk < Math.PI / faceSize * 2 &&
      metrics.equirectangularNorthPoleHalfMapReturnValid === true &&
      metrics.equirectangularSouthPoleHalfMapReturnValid === true &&
      metrics.orthographicBlankShareDelta < 0.08,
    renderGateValid:
      metrics.sphericalRenderUsesProjection === true &&
      metrics.gpuUsesSphericalCpuReference === true &&
      metrics.gpuRectangularPathSkipped === true &&
      metrics.debugLayerRestricted === true &&
      metrics.debugLayersInformative === true,
    interfacesValid:
      metrics.cylindricalInterfaceValid === true &&
      metrics.cubedSphereInterfaceValid === true &&
      metrics.cubedSphereHydrologyValid === true &&
      metrics.cubedSphereTopologyMigrationCoverage === 1,
    fileUrlClassicScriptValid:
      metrics.indexLoadsClassicAppScript === true &&
      metrics.indexDoesNotUseModuleScript === true &&
      metrics.appBundleHasNoTopLevelEsm === true &&
      metrics.appBundleIncludesCpuProductionPath === true,
    defaultCpuCanvasRenderValid:
      metrics.defaultRenderBackend === "cpu-rectangular-reference" &&
      metrics.defaultRenderUsesSphericalProjection === false &&
      metrics.defaultRenderCausalityPass === true,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    valid: failed.length === 0,
    failed,
    checks,
  };
}

function maxMetric(values, metric) {
  let max = 0;
  for (const value of values) {
    const current = value?.[metric];
    if (Number.isFinite(current)) max = Math.max(max, current);
  }
  return max;
}

function cleanupFinalArtifacts() {
  rmSync("_spherical_final_acceptance_render.ppm", { force: true });
}
