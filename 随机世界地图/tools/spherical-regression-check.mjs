import { spawnSync } from "node:child_process";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? options.seed ?? "龙骨海-纪元7";
const faceSize = parseIntOption(options, "face-size", Number(positional[1] ?? 64));
const steps = parseIntOption(options, "steps", Number(positional[2] ?? 200));
const smallFaceSize = Math.max(16, Math.floor(faceSize / 2));
const failures = [];

const checks = [
  ["sphere-topology-check", ["tools/sphere-topology-check.mjs", String(faceSize)]],
  ["face-seam-check", ["tools/face-seam-check.mjs", String(faceSize)]],
  ["area-weight-check", ["tools/area-weight-check.mjs", String(faceSize)]],
  ["scale-topology-check", ["tools/scale-topology-check.mjs"]],
  ["projection-check:equirectangular", ["tools/projection-check.mjs", String(faceSize), "equirectangular"]],
  ["projection-check:mollweide", ["tools/projection-check.mjs", String(faceSize), "mollweide"]],
  ["plate-pole-crossing-check", ["tools/plate-pole-crossing-check.mjs", seedText, "cubed-sphere", String(faceSize)]],
  ["spherical-topology-api-check", ["tools/spherical-topology-api-check.mjs", String(faceSize)]],
  ["spherical-production-adapter-check", ["tools/spherical-production-adapter-check.mjs", String(faceSize)]],
  ["spherical-production-init-check", ["tools/spherical-production-init-check.mjs", seedText, String(smallFaceSize)]],
  ["spherical-production-step-check", ["tools/spherical-production-step-check.mjs", seedText, String(smallFaceSize), "5"]],
  ["spherical-production-create-world-check", ["tools/spherical-production-create-world-check.mjs", seedText, String(smallFaceSize), "1"]],
  ["spherical-world-check", ["tools/spherical-world-check.mjs", seedText, "256x128", String(smallFaceSize)]],
  ["ui-topology-controls-check", ["tools/ui-topology-controls-check.mjs"]],
  ["interface-check:cubed-sphere-production", [
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
  ]],
  ["long-run-check:cubed-sphere-production", [
    "tools/long-run-check.mjs",
    seedText,
    "200",
    "geology-v2",
    "256x128",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ]],
  ["long-run-check:cubed-sphere-production:739", [
    "tools/long-run-check.mjs",
    seedText,
    "739",
    "geology-v2",
    "256x128",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ]],
  ["resolution-check:cubed-sphere-production", [
    "tools/resolution-check.mjs",
    seedText,
    "200",
    "geology-v2",
    "--topology",
    "cubed-sphere",
    "--projection",
    "equirectangular",
    "--face-size",
    String(faceSize),
  ]],
  ["spherical-sidecar-gate-check", ["tools/spherical-sidecar-gate-check.mjs", seedText, String(faceSize)]],
  ["spherical-world-stats-check", ["tools/spherical-world-stats-check.mjs", String(faceSize)]],
  ["spherical-topology-seam-check", ["tools/spherical-topology-seam-check.mjs", String(faceSize)]],
  ["spherical-resolution-gate-check", ["tools/spherical-resolution-gate-check.mjs", seedText, "2", `${smallFaceSize},${faceSize}`, "128x64"]],
  ["spherical-hydrology-diagnostics-check", ["tools/spherical-hydrology-diagnostics-check.mjs", String(smallFaceSize)]],
  ["spherical-hydrology-flow-topology-check", ["tools/spherical-hydrology-flow-topology-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-derived-adapter-check", ["tools/spherical-derived-adapter-check.mjs", String(smallFaceSize)]],
  ["spherical-derived-distance-check", ["tools/spherical-derived-distance-check.mjs", String(smallFaceSize)]],
  ["spherical-derived-shape-check", ["tools/spherical-derived-shape-check.mjs", String(smallFaceSize)]],
  ["spherical-derived-smoothing-check", ["tools/spherical-derived-smoothing-check.mjs", String(smallFaceSize)]],
  ["spherical-migration-readiness-check", ["tools/spherical-migration-readiness-check.mjs"]],
  ["spherical-connectivity-check", ["tools/spherical-connectivity-check.mjs", String(faceSize)]],
  ["spherical-diffusion-check", ["tools/spherical-diffusion-check.mjs", String(faceSize)]],
  ["spherical-boundary-check", ["tools/spherical-boundary-check.mjs", seedText, String(faceSize), "14", String(steps)]],
  ["spherical-boundary-distance-check", ["tools/spherical-boundary-distance-check.mjs", seedText, String(smallFaceSize), "20"]],
  ["spherical-plate-check", ["tools/spherical-plate-check.mjs", seedText, String(faceSize), "14", String(steps)]],
  ["spherical-core-check", ["tools/spherical-core-check.mjs", seedText, String(faceSize), "14", String(steps)]],
  ["spherical-authoritative-core-check", ["tools/spherical-authoritative-core-check.mjs", seedText, String(faceSize), "20"]],
  ["spherical-geology-health-check", ["tools/spherical-geology-health-check.mjs", seedText, String(smallFaceSize), "20"]],
  ["spherical-geology-diffusion-check", ["tools/spherical-geology-diffusion-check.mjs", seedText, String(smallFaceSize), "20"]],
  ["spherical-crust-age-check", ["tools/spherical-crust-age-check.mjs", seedText, String(smallFaceSize), "20"]],
  ["spherical-sediment-transport-check", ["tools/spherical-sediment-transport-check.mjs", "artifact-seed-3", String(smallFaceSize), "55"]],
  ["spherical-sediment-risk-check", ["tools/spherical-sediment-risk-check.mjs", "artifact-seed-3", String(smallFaceSize), "55"]],
  ["spherical-rift-connectivity-check", ["tools/spherical-rift-connectivity-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-passive-margin-check", ["tools/spherical-passive-margin-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-transform-memory-check", ["tools/spherical-transform-memory-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-orogeny-lifecycle-check", ["tools/spherical-orogeny-lifecycle-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-axis-continuity-check", ["tools/spherical-axis-continuity-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-isostasy-relief-check", ["tools/spherical-isostasy-relief-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-relief-budget-topology-check", ["tools/spherical-relief-budget-topology-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-sea-level-coupling-check", ["tools/spherical-sea-level-coupling-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-sea-level-area-check", ["tools/spherical-sea-level-area-check.mjs", String(faceSize)]],
  ["spherical-resource-inputs-check", ["tools/spherical-resource-inputs-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-climate-biosphere-inputs-check", ["tools/spherical-climate-biosphere-inputs-check.mjs", seedText, String(smallFaceSize), "55"]],
  ["spherical-noise-check", ["tools/spherical-noise-check.mjs", String(faceSize), seedText]],
  ["spherical-diagnostic-terrain-check", ["tools/spherical-diagnostic-terrain-check.mjs", seedText, String(faceSize), String(steps)]],
  ["spherical-diagnostic-terrain-check:small", ["tools/spherical-diagnostic-terrain-check.mjs", "artifact-seed-3", String(smallFaceSize), "55"]],
  ["spherical-render-check:debug-face", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_debug_face.ppm", "equirectangular", "256", "128", "debug-face"]],
  ["spherical-render-check:mollweide", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_mollweide.ppm", "mollweide", "256", "128", "diagnostic-elevation", seedText, "20"]],
  ["spherical-render-check:orthographic", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_orthographic.ppm", "orthographic", "256", "128", "diagnostic-elevation", seedText, "20"]],
  ["spherical-render-check:normal-motion", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_normal_motion.ppm", "equirectangular", "256", "128", "normal-motion", seedText, "20"]],
  ["spherical-render-check:adapter-diagnostic-elevation", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_adapter_elev.ppm", "equirectangular", "256", "128", "adapter-diagnostic-elevation"]],
  ["spherical-render-check:adapter-closed-basin", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_adapter_closed_basin.ppm", "mollweide", "256", "128", "adapter-closed-basin-id"]],
  ["spherical-projection-consistency-check", ["tools/spherical-projection-consistency-check.mjs", seedText, String(smallFaceSize), "20", "192", "96"]],
  ["spherical-projection-sampling-check", ["tools/spherical-projection-sampling-check.mjs", seedText, String(smallFaceSize), "20", "192", "96"]],
  ["spherical-render-backend-check", ["tools/spherical-render-backend-check.mjs"]],
  ["spherical-render-gate-check", ["tools/spherical-render-gate-check.mjs", seedText, String(smallFaceSize), "2", "128x64"]],
  ["spherical-toolchain-smoke-check", ["tools/spherical-toolchain-smoke-check.mjs"]],
  ["spherical-file-url-bundle-check", ["tools/spherical-file-url-bundle-check.mjs"]],
  ["spherical-regression-coverage-check", ["tools/spherical-regression-coverage-check.mjs"]],
  ["spherical-artifact-scan-check", ["tools/spherical-artifact-scan-check.mjs"]],
];

const startedAt = Date.now();
const results = [];

for (const [name, args] of checks) {
  const result = runNodeCheck(name, args);
  results.push(result);
  if (!result.valid) failures.push(name);
}

const summary = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  steps,
  checkCount: results.length,
  failures,
  totalMs: Date.now() - startedAt,
  results,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.valid ? 0 : 1);

function runNodeCheck(name, args) {
  const startedAt = Date.now();
  const child = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
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
    valid: child.status === 0,
    status: child.status,
    ms: Date.now() - startedAt,
    metrics: compactMetrics(name, parsed),
    stderr: stderr ? stderr.slice(0, 1200) : undefined,
  };
}

function addLongRunCubedSphereMetrics(picked, parsed, prefix) {
  picked[`${prefix}PipelineMode`] = parsed.pipelineMode;
  picked[`${prefix}TopologyMode`] = parsed.topologyMode;
  picked[`${prefix}ProjectionMode`] = parsed.projectionMode;
  picked[`${prefix}FaceSize`] = parsed.faceSize;
  picked[`${prefix}SphericalGridSize`] = parsed.sphericalGridSize;
  picked[`${prefix}Steps`] = parsed.steps;
  picked[`${prefix}AverageStepMs`] = parsed.averageStepMs;
  picked[`${prefix}LandRatio`] = parsed.landRatio;
  picked[`${prefix}SeaRatio`] = parsed.seaRatio;
  picked[`${prefix}SeaLevel`] = parsed.seaLevel;
  picked[`${prefix}AveragePlateDriftCells`] = parsed.averagePlateDriftCells;
  picked[`${prefix}MinElevation`] = parsed.minElevation;
  picked[`${prefix}MaxElevation`] = parsed.maxElevation;
  picked[`${prefix}ExtremeHighRatio`] = parsed.extremeHighRatio;
  picked[`${prefix}ExtremeLowRatio`] = parsed.extremeLowRatio;
  picked[`${prefix}CausalityPass`] = parsed.causalityPass;
  picked[`${prefix}TopologyKind`] = parsed.topologyDiagnostics?.topologyKind;
  picked[`${prefix}NeighborConsistencyValid`] = parsed.topologyDiagnostics?.neighborConsistencyValid;
  picked[`${prefix}FloodFillTopologyValid`] = parsed.topologyDiagnostics?.floodFillTopologyValid;
  picked[`${prefix}ConnectedComponentTopologyValid`] =
    parsed.topologyDiagnostics?.connectedComponentTopologyValid;
  picked[`${prefix}FaceSeamContinuityRisk`] = parsed.topologyDiagnostics?.faceSeamContinuityRisk;
  picked[`${prefix}TopologyManualAccessRisk`] = parsed.topologyDiagnostics?.topologyManualAccessRisk;
  picked[`${prefix}TopologyMigrationCoverage`] = parsed.topologyDiagnostics?.topologyMigrationCoverage;
  picked[`${prefix}HydrologyValid`] = parsed.hydrologyDiagnostics?.hydrologyValid;
  picked[`${prefix}ExternalSeaDrainageShare`] = parsed.hydrologyDiagnostics?.externalSeaDrainageShare;
  picked[`${prefix}ClosedBasinDrainageShare`] = parsed.hydrologyDiagnostics?.closedBasinDrainageShare;
  picked[`${prefix}SedimentBudgetError`] = parsed.sedimentBudgetDiagnostics?.sedimentBudgetError;
  picked[`${prefix}SedimentStraightnessRisk`] =
    parsed.sedimentBudgetDiagnostics?.sedimentStraightnessRisk;
  picked[`${prefix}PlateCheckerboardScore`] = parsed.boundaryDiagnostics?.plateCheckerboardScore;
  picked[`${prefix}DepthAgeCorrelation`] = parsed.oceanAgeDiagnostics?.depthAgeCorrelation;
  picked[`${prefix}RidgeAgeResetShare`] = parsed.oceanAgeDiagnostics?.ridgeAgeResetShare;
  picked[`${prefix}AgeBandStraightness`] = parsed.oceanAgeDiagnostics?.ageBandStraightness;
  picked[`${prefix}OldBoundaryReliefCorrelation`] =
    parsed.transformDiagnostics?.oldBoundaryReliefCorrelation;
  picked[`${prefix}AgeBandStraightnessInactive`] =
    parsed.transformDiagnostics?.ageBandStraightnessInactive;
  picked[`${prefix}ActiveVsInactiveBoundaryReliefRatio`] =
    parsed.transformDiagnostics?.activeVsInactiveBoundaryReliefRatio;
}

function compactMetrics(name, parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const picked = {};
  for (const key of [
    "valid",
    "topologyKind",
    "faceSize",
    "cellCount",
    "blankShare",
    "adapterKind",
    "gridKind",
    "graphBacked",
    "ringDepthContractValid",
    "gridRadiusWrapperUsesGraphDepth",
    "gridNeighborWrapperSampleCount",
    "gridNeighbor4WrapperVisited",
    "gridNeighbor4WrapperMismatchCount",
    "gridNeighbor4WrapperNonZeroDeltaCount",
    "gridNeighbor8WrapperVisited",
    "gridNeighbor8WrapperMismatchCount",
    "gridNeighbor8WrapperNonZeroDeltaCount",
    "gridNeighbor4WrapperUsesGraphNeighbors",
    "gridNeighbor8WrapperUsesGraphNeighbors",
    "boundaryDistanceFiniteShare",
    "activeSourceShare",
    "activeBoundaryShare",
    "boundaryInfluenceShare",
    "comparedShare",
    "graphBoundaryDistanceMaxDelta",
    "graphBoundaryDistanceMeanDelta",
    "boundaryDistanceSeamDiffToInteriorRatio",
    "boundaryDistanceSeamRatioDelta",
    "steps",
    "testedSeeds",
    "passedSeeds",
    "failedSeeds",
    "avgStepMs",
    "activeFeaturesPresent",
    "activeFeatureCoveragePresent",
    "activeTectonicCoverage02",
    "activeTectonicMax",
    "activeFeatureMissing",
    "activeBoundaryShare",
    "externalSeaShare",
    "inlandWaterCandidateShare",
    "closedBasinCount",
    "derivedSeaShare",
    "diagnosticSeaCandidateShare",
    "coastDistanceFiniteShare",
    "distanceToOceanFiniteShare",
    "coastGraphDistanceMaxDelta",
    "oceanGraphDistanceMaxDelta",
    "coastUnitStepMismatch",
    "oceanUnitStepMismatch",
    "seamDiffToInteriorRatio",
    "seamRiskEdgeShare",
    "poleLongitudeVarianceMax",
    "maxNearestAngularError",
    "northPoleHalfMapReturnDx",
    "southPoleHalfMapReturnDx",
    "northMaxAngularStep",
    "southMaxAngularStep",
    "areaTotalError",
    "cylindricalReferenceScale",
    "sphereReferenceScale",
    "sphereSmallScale",
    "roughnessRatio",
    "slopeGraphMaxDelta",
    "ruggednessGraphMaxDelta",
    "aspectGraphMaxDelta",
    "slopeCoverage",
    "ruggednessCoverage",
    "slopeSeamDiffToInteriorRatio",
    "ruggednessSeamDiffToInteriorRatio",
    "slopeSeamRiskEdgeShare",
    "ruggednessSeamRiskEdgeShare",
    "aspectRange",
    "finiteShare",
    "seamRatioDelta",
    "meanDrift",
    "smoothSeamDiffToInteriorRatio",
    "activeFieldCount",
    "maxActiveSeamRatio",
    "maxActiveSeamDelta",
    "ridgeDistanceFiniteOceanicShare",
    "ridgeDistanceGraphMaxDelta",
    "ridgeDistanceGraphMeanDelta",
    "ridgeAgeMean",
    "nearRidgeAgeMean",
    "oldOceanAgeMean",
    "youngOceanNearRidgeShare",
    "ageSeamDiffToInteriorRatio",
    "ridgeDistanceSeamDiffToInteriorRatio",
    "productionAdapterReady",
    "fullMigrationReady",
    "helperMigrationReady",
    "validSidecarAdvanced",
    "authoritativeSpoofBlocked",
    "writerSpoofBlocked",
    "roleSpoofBlocked",
    "productionAdvancedForAllCases",
    "productionStatsFiniteForAllCases",
    "authoritativeCoreReady",
    "expectedDiagnosticMode",
    "currentStage",
    "blockerCount",
    "diagnosticSidecarNonAuthoritative",
    "adapterStage",
    "status",
    "hydrologyValid",
    "flowTargetGraphEdgeShare",
    "nonGraphFlowTargetShare",
    "downhillFlowShare",
    "crossFaceFlowTargetShare",
    "crossFaceFlowTargetAvailableShare",
    "seamAssignedShare",
    "seamNonGraphTargetShare",
    "seamFlowAssignedInteriorRatio",
    "flowAccumulationAreaDeltaMax",
    "flowAccumulationCellUnitDeltaMax",
    "flowAccumulationUsesAreaUnit",
    "flowAccumulationDiffersFromCellUnit",
    "riverContinuityScore",
    "orphanFlowShare",
    "flowCycleCount",
    "neighborGraphValid",
    "landSeaComplementError",
    "featureOnBoundaryShare",
    "axisBoundaryDependency",
    "axisCurvatureMean",
    "axisActiveFieldCount",
    "tectonicAxisCoverage",
    "mountainAxisSeedCoverage",
    "ridgeAxisCoverage",
    "trenchAxisCoverage",
    "riftAxisCoverage",
    "axisContinuityCoverage",
    "axisBoundaryDependencyCoverage",
    "axisContinuityMean",
    "axisBoundaryDependencyMean",
    "maxAxisSeamRatio",
    "maxAxisSeamDelta",
    "axisSegmentCount",
    "activeSegmentedAxisShare",
    "largestAxisSegmentShare",
    "crossFaceAxisEdgeShare",
    "axisSeamConcentrationRatio",
    "ridgeCoverage",
    "trenchCoverage",
    "islandArcCoverage",
    "basinCoverage",
    "riftStageHistogram",
    "sphericalForbiddenCount",
    "legacyRiskCount",
    "legacyRiskFiles",
    "legacyDirectRectangularRiskCount",
    "legacyDirectRectangularRiskFiles",
    "legacyHelperRawCount",
    "legacyHelperRawFiles",
    "legacyHelperRiskCount",
    "legacyHelperRiskFiles",
    "migrationHelperRiskCount",
    "migrationHelperRiskFiles",
    "legacyFallbackHelperCount",
    "legacyFallbackHelperFiles",
    "graphRoutedFallbackCount",
    "graphRoutedFallbackFiles",
    "explicitLegacyWrapperCount",
    "explicitLegacyWrapperFiles",
    "graphBranchFallbackCount",
    "graphBranchFallbackFiles",
    "guardedHelperCount",
    "guardedHelperFiles",
    "possibleSphericalPathHelperCount",
    "possibleSphericalPathHelperFiles",
    "landRatio",
    "seaRatio",
    "activeTectonicCoverage",
    "activeBoundaryCoverage",
    "activeTransformCoverage",
    "transformMemoryCoverage",
    "fractureZoneMemoryCoverage",
    "inactiveBoundaryReliefCoverage",
    "oldBoundaryCorrelationCoverage",
    "ageBandStraightnessRiskCoverage",
    "inactiveTransformReliefMean",
    "fractureZoneElevationContribution",
    "oceanicStraightReliefDecay",
    "activeVsInactiveBoundaryReliefRatio",
    "ageBandStraightnessNearRidge",
    "ageBandStraightnessInactive",
    "ageBandStraightnessFractureZone",
    "ageBandStraightnessRiskMean",
    "abyssalPlainFractureSuppression",
    "inactiveOceanicReliefShare",
    "suspiciousFractureReliefShare",
    "orogenyProbePurpose",
    "orogenyCoreStrongPresenceRequired",
    "orogenyCoreCoverage",
    "orogenyCoreTraceCoverage",
    "mountainLifecycleProxyCoverage",
    "mountainLifecycleFieldCount",
    "orogenyCoreDormantAllowed",
    "orogenyLifecycleUsesMountainProxy",
    "mountainLifecycleFieldsActive",
    "orogenyCoreDormancyExplained",
    "strongOrogenyCoreOptional",
    "activeOrogenyCoverage",
    "oldOrogenyCoverage",
    "orogenyCoverage",
    "mountainBeltCoverage",
    "mountainAxisCoverage",
    "mountainHeightCoverage",
    "mountainSystemCoverage",
    "activeLifecycleCoverage",
    "oldLifecycleCoverage",
    "oldReliefComparisonCoverage",
    "activeLifecycleBoundaryShare",
    "mountainBoundaryZeroShare",
    "oldOrogenyBoundaryShare",
    "oldOrogenyContinentalShare",
    "oldOrogenyWidth",
    "activeOrogenyWidth",
    "mountainAxisCurvature",
    "oldOrogenyDiscontinuity",
    "newVsOldMountainReliefRatio",
    "orogenyAgeMean",
    "orogenyErosionMean",
    "orogenicSedimentBudget",
    "maxOrogenySeamRatio",
    "maxOrogenySeamDelta",
    "isostaticContinentalMean",
    "isostaticOceanicMean",
    "isostaticTransitionalMean",
    "continentalOceanReliefGap",
    "youngOldOceanDepthGap",
    "sedimentLoadSubsidenceMean",
    "isostaticResidualMean",
    "isostaticResidualP95",
    "isostasyElevationCorrelation",
    "crustThicknessElevationCorrelation",
    "crustAgeOceanDepthCorrelation",
    "transitionalElevationBand",
    "globalElevationStd",
    "landElevationStd",
    "oceanElevationStd",
    "hypsometricSpread",
    "landReliefSpread",
    "oceanReliefSpread",
    "flatLandShare",
    "largePlainShare",
    "seaLevelSensitivity",
    "coastInstabilityRisk",
    "reliefDeficit",
    "normalizedReliefDeficit",
    "tectonicReliefSupplyMean",
    "isostaticReliefSupplyMean",
    "erosionFlatteningPressureMean",
    "sedimentSmoothingPressureMean",
    "drainageGradientPotential",
    "orographicReliefPotential",
    "flatWorldRisk",
    "youngOceanMeanDepth",
    "oldOceanMeanDepth",
    "continentalMeanElevation",
    "oceanicMeanElevation",
    "transitionalMeanElevation",
    "isostasyActiveFieldCount",
    "maxIsostasySeamRatio",
    "maxIsostasySeamDelta",
    "reliefBudgetRadius",
    "reliefBudgetActiveFieldCount",
    "maxReliefBudgetSeamRatio",
    "maxReliefBudgetSeamDelta",
    "localReliefFiniteShare",
    "localReliefCoverage",
    "localReliefSeamDiffToInteriorRatio",
    "localReliefSeamRatioDelta",
    "seaLevelSensitivityGraphMaxDelta",
    "flatLandSeamConcentrationRatio",
    "largePlainSeamConcentrationRatio",
    "baseSeaLevel",
    "seaLevel",
    "geologicSeaLevelOffset",
    "targetGeologicSeaLevelOffset",
    "seaLevelChangeRate",
    "youngOceanShare",
    "oldOceanShare",
    "ridgeVolumeSignalMean",
    "oldOceanCapacitySignalMean",
    "sedimentDisplacementSignalMean",
    "trenchCapacitySignalMean",
    "ridgeVolumeNormalized",
    "youngOceanNormalized",
    "oldOceanCapacityNormalized",
    "sedimentDisplacementNormalized",
    "trenchCapacityNormalized",
    "capacityBalance",
    "recomputedCapacityBalance",
    "oceanBasinCapacitySignalMean",
    "coastalFlipRisk",
    "coastalSensitivityMean",
    "seaLevelCouplingStrength",
    "landShareBeforeGeologicOffset",
    "landShareAfterGeologicOffset",
    "geologicSeaLevelLandShareDelta",
    "maxOffset",
    "maxOffsetStep",
    "youngOceanSignalCoverage",
    "ridgeSignalCoverage",
    "oldOceanCapacityCoverage",
    "sedimentDisplacementCoverage",
    "trenchCapacityCoverage",
    "coastalSensitivityCoverage",
    "coastalSensitivityNearSeaShare",
    "ridgeSignalOceanicShare",
    "oldCapacityOceanicShare",
    "trenchSignalOceanicShare",
    "ridgeYoungOceanCoupling",
    "oldCapacityOldOceanCoupling",
    "seaLevelActiveFieldCount",
    "maxSeaLevelSeamRatio",
    "maxSeaLevelSeamDelta",
    "resourceFieldCount",
    "missingFieldCount",
    "wrongSizedFieldCount",
    "nonFiniteFieldCount",
    "resourceProbePurpose",
    "metamorphicStrongPresenceRequired",
    "resourceActiveFieldCount",
    "volcanicArcCoverage",
    "sedimentaryBasinCoverage",
    "orogenicResourceCoreCoverage",
    "orogenicResourceTraceCoverage",
    "metamorphicResourceDormantAllowed",
    "resourceInterfaceUsesTraceOrogeny",
    "metamorphicDormancyExplained",
    "strongMetamorphicResourceOptional",
    "metamorphicBeltCoverage",
    "igneousProvinceCoverage",
    "hydrothermalPotentialCoverage",
    "orogenicBeltCoverage",
    "tectonicAxisCoverage",
    "volcanicArcIslandArcCoupling",
    "passiveMarginTerrainCoupling",
    "sedimentaryBasinSedimentCoupling",
    "metamorphicOrogenyCoupling",
    "igneousRidgeArcRiftCoupling",
    "hydrothermalBoundaryCoupling",
    "oceanicCrustAgeMean",
    "continentalCrustThicknessMean",
    "oceanicCrustThicknessMean",
    "resourceSeamFieldCount",
    "maxResourceSeamRatio",
    "maxResourceSeamDelta",
    "climateFieldCount",
    "biosphereFieldCount",
    "climateBiosphereProbePurpose",
    "climateCompletenessRequired",
    "biosphereCompletenessRequired",
    "waterAvailabilityCompletenessRequired",
    "missingClimateFieldCount",
    "missingBiosphereFieldCount",
    "wrongSizedClimateFieldCount",
    "wrongSizedBiosphereFieldCount",
    "nonFiniteClimateFieldCount",
    "nonFiniteBiosphereFieldCount",
    "latitudeMin",
    "latitudeMax",
    "latitudeMean",
    "latitudePositionCorrelation",
    "oceanDepthSeaMean",
    "oceanDepthLandMean",
    "climateLandSeaComplementError",
    "climateTerrainLandMismatchShare",
    "climateTerrainSeaMismatchShare",
    "shallowSeaExternalShare",
    "orographicBarrierCoverage",
    "orographicMountainCoupling",
    "mountainHeightLandShare",
    "waterAvailabilityCoverage",
    "terrainMoistureProxyCoverage",
    "waterAvailabilityDormantAllowed",
    "preClimateHydrologyProxyActive",
    "climateBiosphereScopeDocumented",
    "waterAvailabilityDormancyExplained",
    "terrainMoistureProxyActive",
    "soilDepthCoverage",
    "groundwaterCoverage",
    "floodplainCoverage",
    "coastalWetlandCoverage",
    "volcanicSoilCoverage",
    "disturbanceCoverage",
    "landConnectivityCoverage",
    "soilDepthLandMean",
    "soilDepthSeaMean",
    "groundwaterShallowSeaMean",
    "groundwaterDeepOceanMean",
    "coastalWetlandNearCoastShare",
    "volcanicSoilTectonicCoupling",
    "disturbanceBoundaryCoupling",
    "connectivityLandMean",
    "connectivitySeaMean",
    "interfaceActiveFieldCount",
    "maxInterfaceSeamRatio",
    "maxInterfaceSeamDelta",
    "coastBoundaryShare",
    "exactCoastBoundaryShare",
    "coastHardBoundaryShare",
    "coastInactiveBoundaryShare",
    "oldBoundaryReliefCorrelation",
    "sedimentBudgetError",
    "sedimentStraightnessRisk",
    "sedimentRiskClass",
    "sedimentRiskAction",
    "modelArtifactRisk",
    "likelyMetricFalsePositive",
    "naturalRiftStageActiveShare",
    "naturalRiftStagePresenceRequired",
    "naturalRiftAbsenceAllowed",
    "sedimentBoundaryCorrelation",
    "sedimentGridAlignment",
    "sedimentNaturalSinkShare",
    "naturalSinkExplainedShare",
    "structuralOnlySedimentShare",
    "gridAlignedStructuralSedimentShare",
    "passiveMarginSedimentShare",
    "basinSedimentShare",
    "inlandCandidateSedimentShare",
    "sedimentOverfillShare",
    "sedimentSeaFillRisk",
    "sedimentSinkCoverage",
    "sedimentCapacityCoverage",
    "naturalSinkSedimentShare",
    "suspiciousBoundarySedimentShare",
    "maxSedimentSeamRatio",
    "maxSedimentSeamDelta",
    "activeSedimentFieldCount",
    "activeRiftShare",
    "protoOceanShare",
    "connectedYoungOceanShare",
    "protoOceanConnectedShare",
    "connectedYoungOceanExternalSeaShare",
    "unconnectedBelowSeaRiftShare",
    "belowSeaRiftInlandCandidateShare",
    "inlandRiftExternalSeaLeakShare",
    "riftStageSeamDiffToInteriorRatio",
    "seaConnectivityMismatchShare",
    "inlandCandidateMismatchShare",
    "closedBasinLabelMismatchShare",
    "passiveMarginCoverage",
    "passiveMarginBoundaryShare",
    "activeBoundaryMisclassifiedAsPassiveMarginShare",
    "closedBasinMisclassifiedAsMarginShare",
    "continentalShelfCoverage",
    "continentalSlopeCoverage",
    "continentalRiseCoverage",
    "abyssalPlainCoverage",
    "sedimentWedgeCoverage",
    "shelfExternalSeaShare",
    "slopeExternalSeaShare",
    "riseExternalSeaShare",
    "abyssalExternalSeaShare",
    "maxMarginSeamRatio",
    "maxMarginSeamDelta",
    "activeMarginFieldCount",
    "renderBackend",
    "equirectangularVisibleShare",
    "mollweideVisibleShare",
    "orthographicFrontVisibleShare",
    "orthographicUnionVisibleShare",
    "mollweideCoverageOfEquirectangular",
    "orthographicUnionCoverageOfEquirectangular",
    "equirectangularCoverageOfOrthographicUnion",
    "equirectangularMollweideSharedElevationDelta",
    "equirectangularOrthographicSharedElevationDelta",
    "orthographicFrontBackOverlapShare",
    "orthographicNorthSouthOverlapShare",
    "equirectangularBlankShare",
    "mollweideBlankShare",
    "orthographicBlankShare",
    "equirectangularCoverage",
    "equirectangularZeroSampleShare",
    "equirectangularReuseP95",
    "equirectangularReuseMax",
    "equirectangularReuseImbalance",
    "equirectangularMeanAngularError",
    "equirectangularMaxAngularError",
    "equirectangularDateLineNeighborShare",
    "equirectangularDateLineMeanAngularJump",
    "equirectangularPoleRowReuseImbalance",
    "mollweideCoverage",
    "mollweideZeroSampleShare",
    "mollweideReuseP95",
    "mollweideReuseMax",
    "mollweideReuseImbalance",
    "mollweideMeanAngularError",
    "mollweideMaxAngularError",
    "orthographicFrontCoverage",
    "orthographicBackCoverage",
    "orthographicNorthCoverage",
    "orthographicSouthCoverage",
    "orthographicUnionCoverage",
    "orthographicUnionZeroSampleShare",
    "orthographicFrontReuseImbalance",
    "orthographicMeanAngularError",
    "orthographicMaxAngularError",
    "angularErrorLimit",
    "equatorReturnAngularError",
    "northPoleReturnAngularError",
    "southPoleReturnAngularError",
    "cpuRenderBackend",
    "defaultBackendKind",
    "defaultRectangularRenderBackend",
    "defaultWebglDrawCalls",
    "backendKind",
    "sphericalRenderBackend",
    "rectangularRenderBackend",
    "webglDrawCalls",
    "uiTopologyControlsValid",
    "uiSelectedTopologyMode",
    "uiSelectedProjectionMode",
    "uiSelectedFaceSize",
    "uiSelectedGridKind",
    "uiSelectedGraphBacked",
    "uiDefaultTopologyMode",
    "uiDefaultGridKind",
    "uiDefaultGraphBacked",
    "artifactScanValid",
    "perfProfileValid",
    "appBundleBytes",
    "appBundleLineCount",
    "sphericalToolCount",
    "requiredRegressionToolCount",
    "regressionReferenceCount",
    "baselineFaceSize",
    "maxLandMismatch",
    "maxPlateMismatch",
    "maxElevationRmse",
  ]) {
    if (parsed[key] !== undefined) picked[key] = parsed[key];
    else if (parsed.metrics?.[key] !== undefined) picked[key] = parsed.metrics[key];
    else if (parsed.checks?.[key] !== undefined) picked[key] = parsed.checks[key];
  }
  if (parsed.spherical?.diagnostics) {
    picked.sphericalHydrology = parsed.spherical.diagnostics;
    picked.sphericalHydrologyCompletenessRequired = parsed.spherical.hydrologyCompletenessRequired;
    picked.sphericalHydrologyProbePurpose = parsed.spherical.hydrologyProbePurpose;
    picked.sphericalProbeHydrologyCompletenessNotRequired = parsed.checks?.sphericalProbeHydrologyCompletenessNotRequired;
    picked.sphericalProbeDocumentsIncompleteHydrology = parsed.checks?.sphericalProbeDocumentsIncompleteHydrology;
    picked.sphericalProbeDocumentsHydrologyScope = parsed.checks?.sphericalProbeDocumentsHydrologyScope;
    picked.sphericalDrainageCompletenessOptional = parsed.checks?.sphericalDrainageCompletenessOptional;
    picked.sphericalFlowRoutingMayBeActive = parsed.checks?.sphericalFlowRoutingMayBeActive;
    picked.sphericalClosedDrainageCellDifferenceOptional = parsed.checks?.sphericalClosedDrainageCellDifferenceOptional;
    picked.sphericalAnyDrainageResolved = parsed.checks?.sphericalAnyDrainageResolved;
    picked.sphericalDrainageShareBounded = parsed.checks?.sphericalDrainageShareBounded;
    picked.sphericalAreaClosedDrainageShare = parsed.spherical.areaClosedDrainageShare;
    picked.sphericalCellClosedDrainageShare = parsed.spherical.cellClosedDrainageShare;
    picked.sphericalFlowAccumulationMean = parsed.spherical.flowAccumulationMean;
    picked.sphericalFlowAccumulationExpectedDeltaMax = parsed.spherical.flowAccumulationExpectedDeltaMax;
    picked.sphericalFlowAccumulationCellUnitDeltaMax = parsed.spherical.flowAccumulationCellUnitDeltaMax;
  }
  if (parsed.terrain) {
    picked.terrainLandShare = parsed.terrain.landShare;
    picked.terrainSeaShare = parsed.terrain.seaShare;
    picked.terrainExternalSeaShare = parsed.terrain.externalSeaShare;
    picked.terrainInlandWaterCandidateShare = parsed.terrain.inlandWaterCandidateShare;
    picked.terrainSlopeFiniteShare = parsed.terrain.slopeFiniteShare;
    picked.terrainRuggednessFiniteShare = parsed.terrain.ruggednessFiniteShare;
    picked.terrainCoastDistanceFiniteShare = parsed.terrain.coastDistanceFiniteShare;
    picked.terrainDistanceToOceanFiniteShare = parsed.terrain.distanceToOceanFiniteShare;
    picked.terrainMarginCoastDistanceFiniteShare = parsed.terrain.marginCoastDistanceFiniteShare;
    picked.terrainMarginExternalSeaDistanceFiniteShare = parsed.terrain.marginExternalSeaDistanceFiniteShare;
    picked.terrainMarginExternalSeaGraphDistanceMaxDelta = parsed.terrain.marginExternalSeaGraphDistanceMaxDelta;
    picked.terrainLandmassCount = parsed.terrain.landmassCount;
    picked.terrainIslandCount = parsed.terrain.islandCount;
  }
  if (parsed.climate) {
    picked.climateLatitudeFiniteShare = parsed.climate.latitudeFiniteShare;
    picked.climateLatitudeMin = parsed.climate.latitudeMin;
    picked.climateLatitudeMax = parsed.climate.latitudeMax;
    picked.climateOceanDepthFiniteShare = parsed.climate.oceanDepthFiniteShare;
    picked.climateOrographicBarrierFiniteShare = parsed.climate.orographicBarrierFiniteShare;
  }
  if (parsed.defaultProduction) {
    picked.defaultProductionTopologyMode = parsed.defaultProduction.topologyMode;
    picked.defaultProductionProductionTopologyMode = parsed.defaultProduction.productionTopologyMode;
    picked.defaultProductionGridKind = parsed.defaultProduction.gridKind;
    picked.defaultProductionTopologyKind = parsed.defaultProduction.topologyKind;
    picked.defaultProductionGraphBacked = parsed.defaultProduction.graphBacked;
    picked.defaultProductionGridSize = parsed.defaultProduction.gridSize;
    picked.defaultProductionFaceSize = parsed.defaultProduction.faceSize;
    picked.defaultProductionHasDiagnosticSphericalWorld = parsed.defaultProduction.hasDiagnosticSphericalWorld;
    picked.defaultProductionDiagnosticSidecarRole = parsed.defaultProduction.diagnosticSidecarRole;
    picked.defaultProductionDiagnosticSidecarAuthoritative = parsed.defaultProduction.diagnosticSidecarAuthoritative;
    picked.defaultProductionDiagnosticSidecarWritesProductionState = parsed.defaultProduction.diagnosticSidecarWritesProductionState;
    picked.defaultProductionDiagnosticSidecarNonAuthoritative = parsed.defaultProduction.diagnosticSidecarNonAuthoritative;
  }
  if (parsed.adapterProduction) {
    picked.adapterProductionTopologyMode = parsed.adapterProduction.topologyMode;
    picked.adapterProductionProductionTopologyMode = parsed.adapterProduction.productionTopologyMode;
    picked.adapterProductionGridKind = parsed.adapterProduction.gridKind;
    picked.adapterProductionTopologyKind = parsed.adapterProduction.topologyKind;
    picked.adapterProductionGraphBacked = parsed.adapterProduction.graphBacked;
    picked.adapterProductionGridSize = parsed.adapterProduction.gridSize;
    picked.adapterProductionFaceSize = parsed.adapterProduction.faceSize;
    picked.adapterProductionStep = parsed.adapterProduction.step;
    picked.adapterProductionLandRatio = parsed.adapterProduction.landRatio;
    picked.adapterProductionSeaRatio = parsed.adapterProduction.seaRatio;
  }
  if (name === "spherical-world-check") {
    picked.worldCheckResolution = parsed.resolution;
    picked.worldCheckRequestedFaceSize = parsed.requestedFaceSize;
    picked.worldCheckCylindricalTopologyMode = parsed.cylindrical?.topologyMode;
    picked.worldCheckCylindricalHasSphericalGrid = parsed.cylindrical?.hasSphericalGrid;
    picked.worldCheckCylindricalHasSphericalWorld = parsed.cylindrical?.hasSphericalWorld;
    picked.worldCheckSphericalTopologyMode = parsed.spherical?.topologyMode;
    picked.worldCheckSphericalSimulationGridKind = parsed.spherical?.simulationGridKind;
    picked.worldCheckSphericalSimulationTopologyKind = parsed.spherical?.simulationTopologyKind;
    picked.worldCheckSphericalSimulationGraphBacked = parsed.spherical?.simulationGraphBacked;
    picked.worldCheckSphericalSimulationSize = parsed.spherical?.simulationSize;
    picked.worldCheckSphericalGridSize = parsed.spherical?.sphericalGridSize;
    picked.worldCheckSphericalWorldRole = parsed.spherical?.sphericalWorldRole;
    picked.worldCheckSphericalWorldAuthoritative = parsed.spherical?.sphericalWorldAuthoritative;
    picked.worldCheckSphericalWorldWritesProductionState =
      parsed.spherical?.sphericalWorldWritesProductionState;
  }
  if (parsed.checks) {
    picked.defaultCubedSphereProductionGridIsCubedSphere = parsed.checks.defaultCubedSphereProductionGridIsCubedSphere;
    picked.defaultCubedSphereProductionGridGraphBacked = parsed.checks.defaultCubedSphereProductionGridGraphBacked;
    picked.defaultCubedSphereMatchesFaceSize = parsed.checks.defaultCubedSphereMatchesFaceSize;
    picked.defaultCubedSphereHasNoLegacyDimensions = parsed.checks.defaultCubedSphereHasNoLegacyDimensions;
    picked.defaultCubedSphereKeepsDiagnosticSidecar = parsed.checks.defaultCubedSphereKeepsDiagnosticSidecar;
    picked.defaultCubedSphereDiagnosticSidecarExplicit = parsed.checks.defaultCubedSphereDiagnosticSidecarExplicit;
    picked.defaultCubedSphereSidecarNonAuthoritative = parsed.checks.defaultCubedSphereSidecarNonAuthoritative;
    picked.adapterProductionGridIsCubedSphere = parsed.checks.adapterProductionGridIsCubedSphere;
    picked.adapterProductionGridGraphBacked = parsed.checks.adapterProductionGridGraphBacked;
    picked.adapterHasNoLegacyDimensions = parsed.checks.adapterHasNoLegacyDimensions;
    picked.adapterMatchesFaceSize = parsed.checks.adapterMatchesFaceSize;
    picked.adapterStepAdvanced = parsed.checks.adapterStepAdvanced;
    picked.adapterStatsFinite = parsed.checks.adapterStatsFinite;
    picked.createWorldTerrainSized = parsed.checks.terrainSized;
    picked.createWorldClimateSized = parsed.checks.climateSized;
    picked.createWorldHydrologySized = parsed.checks.hydrologySized;
    picked.createWorldResourcesSized = parsed.checks.resourcesSized;
    picked.createWorldHydrologyValid = parsed.checks.hydrologyValid;
  }
  if (name === "spherical-production-adapter-check") {
    picked.productionAdapterKind = parsed.kind;
    picked.productionAdapterTopologyApiKind = parsed.topologyApiKind;
    picked.productionAdapterSize = parsed.size;
    picked.productionAdapterFaceCount = parsed.faceCount;
    picked.productionAdapterHasLegacyDimensions = parsed.hasLegacyDimensions;
    picked.productionAdapterRectangularIndexing = parsed.rectangularIndexing;
    picked.productionAdapterAllFieldsMatchSize = parsed.allFieldsMatchSize;
    picked.productionAdapterFieldCount = parsed.fieldCount;
    picked.productionAdapterNeighborSymmetryValid = parsed.neighborSymmetryValid;
    picked.productionAdapterFirstCellNeighborCount = parsed.firstCellNeighbors?.length ?? 0;
    picked.productionAdapterAreaMin = parsed.areaStats?.areaMin;
    picked.productionAdapterAreaMax = parsed.areaStats?.areaMax;
    picked.productionAdapterNorthAreaShare = parsed.hemisphereAreaStats?.northAreaShare;
    picked.productionAdapterSouthAreaShare = parsed.hemisphereAreaStats?.southAreaShare;
    picked.productionAdapterStatsWeightedMean = parsed.statsProbe?.weightedMean;
    picked.productionAdapterStatsNorthShare = parsed.statsProbe?.northShare;
    picked.productionAdapterStatsCategoryShareTotal = parsed.statsProbe?.categoryShareTotal;
    picked.productionAdapterLegacyDimensionAttemptHasWidth = parsed.legacyDimensionAttempt?.hasWidth;
    picked.productionAdapterLegacyDimensionAttemptHasHeight = parsed.legacyDimensionAttempt?.hasHeight;
    picked.productionAdapterLegacyDimensionAttemptRectangularIndexing =
      parsed.legacyDimensionAttempt?.rectangularIndexing;
    picked.productionAdapterExternalSeaShare = parsed.connectivityProbe?.externalSeaShare;
    picked.productionAdapterInlandWaterCandidateShare = parsed.connectivityProbe?.inlandWaterCandidateShare;
    picked.productionAdapterClosedBasinCount = parsed.connectivityProbe?.closedBasinCount;
    picked.productionAdapterDistanceFiniteShare = parsed.connectivityProbe?.distanceFiniteShare;
    picked.productionAdapterLargestComponentIsExternal = parsed.connectivityProbe?.largestComponentIsExternal;
    picked.productionAdapterDiagnosticSeaCandidateShare = parsed.diagnosticTerrainProbe?.seaCandidateShare;
    picked.productionAdapterDiagnosticExternalSeaShare = parsed.diagnosticTerrainProbe?.externalSeaShare;
    picked.productionAdapterDiagnosticInlandWaterCandidateShare =
      parsed.diagnosticTerrainProbe?.inlandWaterCandidateShare;
    picked.productionAdapterDiagnosticDistanceFiniteShare = parsed.diagnosticTerrainProbe?.distanceFiniteShare;
    picked.productionAdapterDiagnosticElevationMean = parsed.diagnosticTerrainProbe?.elevationMean;
    picked.productionAdapterTopologyNeighborConsistencyValid =
      parsed.topologyDiagnostics?.neighborConsistencyValid;
    picked.productionAdapterTopologyFloodFillValid = parsed.topologyDiagnostics?.floodFillTopologyValid;
    picked.productionAdapterTopologyConnectedComponentValid =
      parsed.topologyDiagnostics?.connectedComponentTopologyValid;
    picked.productionAdapterTopologyFaceSeamContinuityRisk = parsed.topologyDiagnostics?.faceSeamContinuityRisk;
    picked.productionAdapterTopologyManualAccessRisk = parsed.topologyDiagnostics?.topologyManualAccessRisk;
    picked.productionAdapterTopologyMigrationCoverage = parsed.topologyDiagnostics?.topologyMigrationCoverage;
  }
  if (name === "ui-topology-controls-check") {
    picked.uiTopologyControlsValid = parsed.valid;
    picked.uiSelectedTopologyMode = parsed.selectedWorld?.topologyMode;
    picked.uiSelectedProjectionMode = parsed.selectedWorld?.projectionMode;
    picked.uiSelectedFaceSize = parsed.selectedWorld?.faceSize;
    picked.uiSelectedGridKind = parsed.selectedWorld?.gridKind;
    picked.uiSelectedGraphBacked = parsed.selectedWorld?.graphBacked;
    picked.uiSelectedGridSize = parsed.selectedWorld?.gridSize;
    picked.uiDefaultTopologyMode = parsed.defaultWorld?.topologyMode;
    picked.uiDefaultGridKind = parsed.defaultWorld?.gridKind;
    picked.uiDefaultGraphBacked = parsed.defaultWorld?.graphBacked;
    picked.uiControlTopologyPresent = parsed.controlsPresent?.topologyMode;
    picked.uiControlProjectionPresent = parsed.controlsPresent?.projectionMode;
    picked.uiControlFaceSizePresent = parsed.controlsPresent?.faceSize;
  }
  if (name === "spherical-authoritative-core-check") {
    picked.authoritativeProductionGridKind = parsed.before?.spherical?.productionGridKind;
    picked.authoritativeProductionTopologyKind = parsed.before?.spherical?.productionTopologyKind;
    picked.authoritativeProductionTopologyMode = parsed.before?.spherical?.topologyMode;
    picked.authoritativeProductionGridSize = parsed.before?.spherical?.productionGridSize;
    picked.authoritativeSphericalGridSize = parsed.before?.spherical?.sphericalGridSize;
    picked.authoritativeProductionGridMatchesSphericalSize =
      parsed.before?.spherical?.productionGridMatchesSphericalSize;
    picked.authoritativeProductionHasGraphTopology = parsed.before?.spherical?.hasProductionGraphTopology;
    picked.authoritativeProductionGridIsCubedSphere = parsed.checks?.productionGridIsCubedSphere;
    picked.authoritativeProductionGridGraphBacked = parsed.checks?.productionGridGraphBacked;
    picked.authoritativeProductionStepAdvanced = parsed.checks?.productionStepAdvanced;
    picked.authoritativeProductionStatsStillPresent = parsed.checks?.productionStatsStillPresent;
    picked.authoritativeModeCorrectlyIdentified = parsed.checks?.authoritativeModeCorrectlyIdentified;
    picked.authoritativeNoBlockers = parsed.checks?.noAuthoritativeBlockers;
    picked.authoritativeDiagnosticWorldAttached = parsed.authorityChecks?.diagnosticWorldAttached;
    picked.authoritativeDiagnosticWorldExplicitlySidecar =
      parsed.authorityChecks?.diagnosticWorldExplicitlySidecar;
    picked.authoritativeDiagnosticWorldNonAuthoritative =
      parsed.authorityChecks?.diagnosticWorldNonAuthoritative;
    picked.authoritativeDiagnosticWorldReadOnlyForProduction =
      parsed.authorityChecks?.diagnosticWorldReadOnlyForProduction;
    picked.authoritativeDiagnosticWorldAdvanced = parsed.authorityChecks?.diagnosticWorldAdvanced;
    picked.authoritativeAdapterUsesCubedSphereGrid = parsed.authorityChecks?.adapterUsesCubedSphereGrid;
    picked.authoritativeAdapterGridMatchesSphericalSize =
      parsed.authorityChecks?.adapterGridMatchesSphericalSize;
    picked.authoritativeAdapterHasGraphTopology = parsed.authorityChecks?.adapterHasGraphTopology;
    picked.authoritativeAdapterStatsAdvance = parsed.authorityChecks?.adapterStatsAdvance;
    picked.authoritativeCylindricalReferenceStillAvailable =
      parsed.authorityChecks?.cylindricalReferenceStillAvailable;
    picked.authoritativeLegacySphericalRequestNormalizedToGeologyV2 =
      parsed.checks?.legacySphericalRequestNormalizedToGeologyV2;
    picked.authoritativeLegacySphericalRequestCanStep = parsed.checks?.legacySphericalRequestCanStep;
  }
  if (name === "interface-check:cubed-sphere-production") {
    picked.interfaceCubedSpherePipelineMode = parsed.pipelineMode;
    picked.interfaceCubedSphereTopologyMode = parsed.topologyMode;
    picked.interfaceCubedSphereProjectionMode = parsed.projectionMode;
    picked.interfaceCubedSphereFaceSize = parsed.faceSize;
    picked.interfaceCubedSphereGridSize = parsed.gridSize;
    picked.interfaceCubedSphereSphericalGridSize = parsed.sphericalGridSize;
    picked.interfaceCubedSphereValidationErrorCount = parsed.validation?.errors?.length ?? 0;
    picked.interfaceCubedSphereHydrologyValid = parsed.stats?.hydrologyValid;
    picked.interfaceCubedSphereTopologyKind = parsed.stats?.topologyKind;
    picked.interfaceCubedSphereNeighborConsistencyValid = parsed.stats?.neighborConsistencyValid;
    picked.interfaceCubedSphereFloodFillTopologyValid = parsed.stats?.floodFillTopologyValid;
    picked.interfaceCubedSphereConnectedComponentTopologyValid =
      parsed.stats?.connectedComponentTopologyValid;
    picked.interfaceCubedSphereTopologyManualAccessRisk = parsed.stats?.topologyManualAccessRisk;
    picked.interfaceCubedSphereTopologyMigrationCoverage = parsed.stats?.topologyMigrationCoverage;
    picked.interfaceCubedSphereLandRatio = parsed.stats?.landRatio;
    picked.interfaceCubedSphereSeaRatio = parsed.stats?.seaRatio;
    picked.interfaceCubedSphereExternalSeaShare = parsed.stats?.externalSeaShare;
    picked.interfaceCubedSphereInlandWaterCandidateShare = parsed.stats?.inlandWaterCandidateShare;
    picked.interfaceCubedSphereClosedBasinCount = parsed.stats?.closedBasinCount;
    picked.interfaceCubedSphereSedimentBudgetError = parsed.stats?.sedimentBudgetError;
    picked.interfaceCubedSpherePlateCheckerboardScore = parsed.stats?.plateCheckerboardScore;
  }
  if (name === "long-run-check:cubed-sphere-production") {
    addLongRunCubedSphereMetrics(picked, parsed, "longRunCubedSphere");
  }
  if (name === "long-run-check:cubed-sphere-production:739") {
    addLongRunCubedSphereMetrics(picked, parsed, "longRunCubedSphere739");
  }
  if (name === "resolution-check:cubed-sphere-production") {
    const comparisons = parsed.comparisons ?? {};
    const comparisonKeys = Object.keys(comparisons);
    const comparisonValues = comparisonKeys.map((key) => comparisons[key]).filter(Boolean);
    const maxComparisonMetric = (metric) => {
      let max = 0;
      for (const comparison of comparisonValues) {
        const value = comparison?.[metric];
        if (Number.isFinite(value)) max = Math.max(max, value);
      }
      return max;
    };
    const baseline = comparisons[parsed.baselineResolution] ?? comparisonValues[0] ?? null;
    picked.resolutionCubedSpherePipelineMode = parsed.pipelineMode;
    picked.resolutionCubedSphereTopologyMode = parsed.topologyMode;
    picked.resolutionCubedSphereProjectionMode = parsed.projectionMode;
    picked.resolutionCubedSphereFaceSize = parsed.faceSize;
    picked.resolutionCubedSphereSteps = parsed.steps;
    picked.resolutionCubedSphereSampleResolution = parsed.sampleResolution;
    picked.resolutionCubedSphereBaselineResolution = parsed.baselineResolution;
    picked.resolutionCubedSphereComparisonCount = comparisonKeys.length;
    picked.resolutionCubedSphereMaxLandMismatch = maxComparisonMetric("landMismatchVsBaseline");
    picked.resolutionCubedSphereMaxPlateMismatch = maxComparisonMetric("plateMismatchVsBaseline");
    picked.resolutionCubedSphereMaxElevationRmse = maxComparisonMetric("elevationRmseVsBaseline");
    picked.resolutionCubedSphereLandRatio = baseline?.landRatio;
    picked.resolutionCubedSphereSeaRatio = baseline?.seaRatio;
    picked.resolutionCubedSphereSeaLevel = baseline?.seaLevel;
    picked.resolutionCubedSphereTopologyKind = baseline?.topologyDiagnostics?.topologyKind;
    picked.resolutionCubedSphereNeighborConsistencyValid =
      baseline?.topologyDiagnostics?.neighborConsistencyValid;
    picked.resolutionCubedSphereFloodFillTopologyValid =
      baseline?.topologyDiagnostics?.floodFillTopologyValid;
    picked.resolutionCubedSphereConnectedComponentTopologyValid =
      baseline?.topologyDiagnostics?.connectedComponentTopologyValid;
    picked.resolutionCubedSphereTopologyManualAccessRisk =
      baseline?.topologyDiagnostics?.topologyManualAccessRisk;
    picked.resolutionCubedSphereTopologyMigrationCoverage =
      baseline?.topologyDiagnostics?.topologyMigrationCoverage;
    picked.resolutionCubedSphereHydrologyValid = baseline?.hydrologyDiagnostics?.hydrologyValid;
    picked.resolutionCubedSphereSedimentBudgetError =
      baseline?.sedimentBudgetDiagnostics?.sedimentBudgetError;
    picked.resolutionCubedSphereSedimentStraightnessRisk =
      baseline?.sedimentBudgetDiagnostics?.sedimentStraightnessRisk;
    picked.resolutionCubedSpherePlateCheckerboardScore =
      baseline?.boundaryDiagnostics?.plateCheckerboardScore;
    picked.resolutionCubedSphereDepthAgeCorrelation =
      baseline?.oceanAgeDiagnostics?.depthAgeCorrelation;
    picked.resolutionCubedSphereRidgeAgeResetShare =
      baseline?.oceanAgeDiagnostics?.ridgeAgeResetShare;
    picked.resolutionCubedSphereActiveVsInactiveBoundaryReliefRatio =
      baseline?.transformDiagnostics?.activeVsInactiveBoundaryReliefRatio;
  }
  if (name === "spherical-production-init-check") {
    picked.productionInitStageCount = parsed.stages?.length ?? 0;
    picked.productionInitFailedStageName = parsed.stages?.find((stage) => !stage.ok)?.name ?? null;
    picked.productionInitGridIsCubedSphere = parsed.checks?.gridIsCubedSphere;
    picked.productionInitGraphBacked = parsed.checks?.graphBacked;
    picked.productionInitStepAdvanced = parsed.checks?.stepAdvanced;
    picked.productionInitLandRatioFinite = parsed.checks?.landRatioFinite;
    picked.productionInitSeaLevelFinite = parsed.checks?.seaLevelFinite;
    picked.productionInitTerrainSized = parsed.checks?.terrainSized;
    picked.productionInitClimateSized = parsed.checks?.climateSized;
    picked.productionInitHydrologySized = parsed.checks?.hydrologySized;
    picked.productionInitResourcesSized = parsed.checks?.resourcesSized;
    picked.productionInitHydrologyValid = parsed.checks?.hydrologyValid;
    picked.productionInitLandRatio = parsed.stats?.landRatio;
    picked.productionInitSeaRatio = parsed.stats?.seaRatio;
  }
  if (name === "spherical-production-step-check") {
    picked.productionStepStageCount = parsed.stages?.length ?? 0;
    picked.productionStepFailedStageName = parsed.stages?.find((stage) => !stage.ok)?.name ?? null;
    picked.productionStepSampleCount = parsed.samples?.length ?? 0;
    picked.productionStepLastSampleValid = parsed.samples?.at(-1)?.valid;
    picked.productionStepGridIsCubedSphere = parsed.checks?.gridIsCubedSphere;
    picked.productionStepGraphBacked = parsed.checks?.graphBacked;
    picked.productionStepAdapterKeepsLegacyDimensionsHidden = parsed.checks?.adapterKeepsLegacyDimensionsHidden;
    picked.productionStepTopologyParamDimensionsAvailable = parsed.checks?.topologyParamDimensionsAvailable;
    picked.productionStepAdvanced = parsed.checks?.stepAdvanced;
    picked.productionStepAgeAdvanced = parsed.checks?.ageAdvanced;
    picked.productionStepSeaLevelFinite = parsed.checks?.seaLevelFinite;
    picked.productionStepLandRatioFinite = parsed.checks?.landRatioFinite;
    picked.productionStepPlateDriftFinite = parsed.checks?.plateDriftFinite;
    picked.productionStepPlateDriftNotExploding = parsed.checks?.plateDriftNotExploding;
    picked.productionStepNoStageFailures = parsed.checks?.noStageFailures;
    picked.productionStepSamplesValid = parsed.checks?.samplesValid;
    picked.productionStepTerrainSized = parsed.checks?.terrainSized;
    picked.productionStepClimateSized = parsed.checks?.climateSized;
    picked.productionStepHydrologySized = parsed.checks?.hydrologySized;
    picked.productionStepResourcesSized = parsed.checks?.resourcesSized;
    picked.productionStepHydrologyValid = parsed.checks?.hydrologyValid;
    picked.productionStepActiveFeaturesPresent = parsed.checks?.activeFeaturesPresent;
    picked.productionStepActiveFeatureCoveragePresent = parsed.checks?.activeFeatureCoveragePresent;
    picked.productionStepActiveTectonicCoverage02 = parsed.featureHealth?.activeTectonicCoverage02;
    picked.productionStepActiveTectonicMax = parsed.featureHealth?.activeTectonicMax;
    picked.productionStepLandRatio = parsed.stats?.landRatio;
    picked.productionStepSeaRatio = parsed.stats?.seaRatio;
    picked.productionStepAvgPlateDrift = parsed.stats?.avgPlateDrift;
  }
  return picked;
}
