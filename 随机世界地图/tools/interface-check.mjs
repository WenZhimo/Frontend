import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { measureTopologyDiagnostics, topologyForGrid } from "../src/sim/topology.js";
import {
  getBiosphereInputs,
  getClimateInputs,
  getHydrologyInputs,
  getResourceInputs,
  getTerrainDerived,
} from "../src/sim/derived/terrain.js";
import { parseBoolOption, parseOptions, parseTopologyOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const hydrologyDiagnosticsMode = parseBoolOption(options, "full-hydrology") ? "full" : "basic";
const topologyOptions = parseTopologyOptions(options);

const params = {
  seedText: positional[0] ?? "???-??7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  pipelineMode: positional[2] ?? "geology-v2",
  resolution: positional[3] ?? "512x256",
  ...topologyOptions,
};
const steps = Number(positional[1] ?? 0);

const world = createWorld(params);
for (let i = 0; i < steps; i += 1) stepWorld(world);

const outputs = {
  terrain: getTerrainDerived(world),
  climate: getClimateInputs(world),
  hydrology: getHydrologyInputs(world, { diagnostics: hydrologyDiagnosticsMode }),
  biosphere: getBiosphereInputs(world),
  resources: getResourceInputs(world),
};

const requiredFields = {
  terrain: [
    "relativeElevation",
    "landMask",
    "seaMask",
    "shallowSeaMask",
    "deepOceanMask",
    "slope",
    "aspect",
    "ruggedness",
    "coastDistance",
    "distanceToOcean",
    "landmassId",
    "islandId",
    "inlandWaterCandidate",
    "passiveMargin",
    "continentalShelf",
    "continentalSlope",
    "continentalRise",
    "abyssalPlain",
    "sedimentWedge",
    "erosionSource",
    "sedimentFlux",
    "sedimentSink",
    "sedimentCapacity",
    "sedimentCompaction",
    "sedimentLoadSubsidence",
    "isostaticBase",
    "crustBuoyancy",
    "densitySubsidence",
    "lithosphereCooling",
    "isostaticResidual",
    "sedimentBudgetError",
    "depositionRate",
    "erosionRate",
    "forelandBasin",
    "orogenicSedimentSupply",
    "activeTransform",
    "transformMemory",
    "fractureZoneMemory",
    "tectonicAxis",
    "axisCurvature",
    "axisContinuity",
    "axisBoundaryDependency",
    "mountainHeightBlockiness",
    "orographicBarrierContinuity",
    "planetaryRelief",
    "reliefDeficit",
    "seaLevelSensitivity",
    "largePlainMask",
    "flatLandMask",
    "baseSeaLevel",
    "geologicSeaLevelOffset",
    "coastalSensitivity",
    "ridgeVolumeSignal",
    "oldOceanCapacitySignal",
    "sedimentDisplacementSignal",
    "trenchCapacitySignal",
  ],
  climate: [
    "latitude",
    "relativeElevation",
    "landMask",
    "seaMask",
    "oceanDepth",
    "shallowSeaMask",
    "continentalShelf",
    "coastDistance",
    "distanceToOcean",
    "orographicBarrier",
    "mountainAxis",
    "mountainHeight",
    "hypsometricSpread",
    "landReliefSpread",
    "orographicReliefPotential",
    "seaLevel",
    "baseSeaLevel",
    "geologicSeaLevelOffset",
    "coastalSensitivity",
  ],
  hydrology: [
    "hydroElevation",
    "externalSeaMask",
    "oceanConnectivity",
    "inlandWaterCandidate",
    "closedBasinId",
    "flowDirection",
    "flowTarget",
    "flowAccumulation",
    "flowSlope",
    "drainageBasinId",
    "watershedId",
    "riverMask",
    "riverStrength",
    "riverOrder",
    "riverOutlet",
    "outletId",
    "endorheicBasin",
    "endorheicSink",
    "depressionMask",
    "lakeCandidate",
    "wetlandCandidate",
    "slope",
    "erodibility",
    "permeability",
    "sedimentSink",
    "sediment",
    "sedimentCapacity",
    "basin",
    "drainageGradientPotential",
    "flatLandMask",
    "largePlainMask",
    "seaLevel",
    "baseSeaLevel",
    "geologicSeaLevelOffset",
    "coastalSensitivity",
    "forelandBasin",
    "orogenicSedimentSupply",
    "continentalRise",
  ],
  biosphere: [
    "biomeBaseElevation",
    "soilParentMaterial",
    "soilDepthPotential",
    "slope",
    "ruggedness",
    "waterAvailability",
    "groundwaterPotential",
    "floodplainPotential",
    "coastalWetlandPotential",
    "volcanicSoilPotential",
    "disturbance",
    "landmassId",
    "islandId",
    "connectivityToLandmass",
  ],
  resources: [
    "crustType",
    "crustAge",
    "crustThickness",
    "crustBuoyancy",
    "isostaticResidual",
    "orogeny",
    "orogenicBelt",
    "activeOrogeny",
    "oldOrogeny",
    "forelandBasin",
    "volcanicArc",
    "riftStage",
    "passiveMargin",
    "sediment",
    "sedimentSink",
    "basin",
    "sedimentaryBasin",
    "metamorphicBelt",
    "igneousProvince",
    "hydrothermalPotential",
    "mineralProvince",
    "activeTransform",
    "transformMemory",
    "fractureZoneMemory",
    "tectonicAxis",
  ],
};
const scalarFields = new Set([
  "climate.hypsometricSpread",
  "climate.landReliefSpread",
  "climate.orographicReliefPotential",
  "climate.seaLevel",
  "climate.baseSeaLevel",
  "climate.geologicSeaLevelOffset",
  "terrain.baseSeaLevel",
  "terrain.geologicSeaLevelOffset",
  "hydrology.drainageGradientPotential",
  "hydrology.seaLevel",
  "hydrology.baseSeaLevel",
  "hydrology.geologicSeaLevelOffset",
]);

const validation = validateOutputs(outputs, requiredFields, world.grid.size);
const terrain = outputs.terrain;
const hydrology = outputs.hydrology;
const climate = outputs.climate;
const biosphere = outputs.biosphere;
const ageBandSplit = measureAgeBandStraightnessSplit(world.grid);
const sedimentBudget = terrain.sedimentBudgetDiagnostics ?? {};
const isostasy = terrain.isostasyDiagnostics ?? measureIsostasyDiagnostics(world);
const topology = measureTopologyDiagnostics(world);
const hydrologyDiagnostics = hydrology.hydrologyDiagnostics ?? {};

const stats = {
  landRatio: share(terrain.landMask),
  seaRatio: share(terrain.seaMask),
  shallowSeaShare: share(terrain.shallowSeaMask),
  deepOceanShare: share(terrain.deepOceanMask),
  landmassCount: maxInt(terrain.landmassId),
  islandCount: maxInt(terrain.islandId),
  externalSeaShare: share(hydrology.externalSeaMask),
  unconnectedSeaMaskShare: shareWhere(terrain.seaMask, (i) => !hydrology.externalSeaMask[i]),
  closedBasinCount: maxInt(hydrology.closedBasinId),
  inlandWaterCandidateShare: share(terrain.inlandWaterCandidate),
  hydrologyValid: Boolean(hydrologyDiagnostics.hydrologyValid),
  hydrologyDiagnosticsLevel: hydrologyDiagnostics.diagnosticsLevel ?? hydrologyDiagnosticsMode,
  flowAssignedShare: hydrologyDiagnostics.flowAssignedShare ?? 0,
  flowCycleCount: hydrologyDiagnostics.flowCycleCount ?? 0,
  orphanFlowShare: hydrologyDiagnostics.orphanFlowShare ?? 0,
  depressionShare: hydrologyDiagnostics.depressionShare ?? share(hydrology.depressionMask),
  endorheicBasinCount: hydrologyDiagnostics.endorheicBasinCount ?? 0,
  endorheicLandShare: hydrologyDiagnostics.endorheicLandShare ?? share(hydrology.endorheicBasin),
  lakeCandidateShare: hydrologyDiagnostics.lakeCandidateShare ?? share(hydrology.lakeCandidate),
  riverCellShare: hydrologyDiagnostics.riverCellShare ?? share(hydrology.riverMask),
  riverContinuityScore: hydrologyDiagnostics.riverContinuityScore ?? null,
  riverOutletCount: hydrologyDiagnostics.riverOutletCount ?? 0,
  coastalOutletShare: hydrologyDiagnostics.coastalOutletShare ?? null,
  externalSeaDrainageShare: hydrologyDiagnostics.externalSeaDrainageShare ?? 0,
  closedBasinDrainageShare: hydrologyDiagnostics.closedBasinDrainageShare ?? 0,
  largestWatershedShare: hydrologyDiagnostics.largestWatershedShare ?? null,
  flowAccumulationP95: hydrologyDiagnostics.flowAccumulationP95 ?? null,
  flowAccumulationMax: hydrologyDiagnostics.flowAccumulationMax ?? 0,
  riverResolutionDrift: hydrologyDiagnostics.riverResolutionDrift ?? 0,
  riftStageHistogram: histogram(outputs.resources.riftStage, 6),
  protoOceanConnectedShare: conditionalShare(outputs.resources.riftStage, (i) => outputs.resources.riftStage[i] === 4, (i) => hydrology.externalSeaMask[i]),
  unconnectedBelowSeaRiftShare: conditionalShare(outputs.resources.riftStage, (i) => outputs.resources.riftStage[i] > 0 && terrain.seaMask[i], (i) => !hydrology.externalSeaMask[i]),
  passiveMarginCoverage: coverage(terrain.passiveMargin, 0.05),
  passiveMarginBoundaryShare: conditionalShare(terrain.passiveMargin, (i) => terrain.passiveMargin[i] > 0.05, (i) => world.grid.boundaryInfluence[i] > 0.25),
  nearCoastShallowSeaShare: conditionalShare(terrain.seaMask, (i) => terrain.seaMask[i] && terrain.coastDistance[i] <= 8, (i) => terrain.shallowSeaMask[i]),
  shelfWidthMean: averageWhere(terrain.continentalShelf, (i) => terrain.continentalShelf[i] > 0.05),
  coastDepthGradient: averageWhere(terrain.slope, (i) => terrain.coastDistance[i] <= 3),
  continentalSlopeCoverage: coverage(terrain.continentalSlope, 0.05),
  continentalRiseCoverage: coverage(terrain.continentalRise, 0.05),
  abyssalPlainCoverage: coverage(terrain.abyssalPlain, 0.05),
  abyssalPlainFlatness: averageWhere(terrain.ruggedness, (i) => terrain.abyssalPlain[i] > 0.05),
  sedimentWedgeCoverage: coverage(terrain.sedimentWedge, 0.05),
  erosionSourceMean: sedimentBudget.erosionSourceMean ?? average(terrain.erosionSource),
  erosionSourceTotal: sedimentBudget.erosionSourceTotal ?? sum(terrain.erosionSource),
  depositionTotal: sedimentBudget.depositionTotal ?? sum(terrain.sedimentSink),
  sedimentFluxMean: sedimentBudget.sedimentFluxMean ?? average(terrain.sedimentFlux),
  sedimentSinkMean: sedimentBudget.sedimentSinkMean ?? average(terrain.sedimentSink),
  sedimentCapacityMean: sedimentBudget.sedimentCapacityMean ?? average(terrain.sedimentCapacity),
  sedimentCompactionMean: sedimentBudget.sedimentCompactionMean ?? average(terrain.sedimentCompaction),
  sedimentLoadSubsidenceMean: sedimentBudget.sedimentLoadSubsidenceMean ?? average(terrain.sedimentLoadSubsidence),
  sedimentBudgetError: sedimentBudget.sedimentBudgetError ?? average(terrain.sedimentBudgetError),
  sedimentResidualDissipation: sedimentBudget.sedimentResidualDissipation ?? 0,
  sedimentResidualFlux: sedimentBudget.sedimentResidualFlux ?? 0,
  sedimentMassBefore: sedimentBudget.sedimentMassBefore ?? 0,
  sedimentMassAfter: sedimentBudget.sedimentMassAfter ?? sum(world.grid.sediment),
  sedimentMassDelta: sedimentBudget.sedimentMassDelta ?? 0,
  mountainErosionShare: sedimentBudget.mountainErosionShare ?? 0,
  passiveMarginDepositionShare: sedimentBudget.passiveMarginDepositionShare ?? 0,
  basinDepositionShare: sedimentBudget.basinDepositionShare ?? 0,
  trenchForearcDepositionShare: sedimentBudget.trenchForearcDepositionShare ?? 0,
  inlandBasinDepositionShare: sedimentBudget.inlandBasinDepositionShare ?? 0,
  sedimentOverfillShare: sedimentBudget.sedimentOverfillShare ?? 0,
  sedimentPatchiness: sedimentBudget.sedimentPatchiness ?? 0,
  sedimentStraightnessRisk: sedimentBudget.sedimentStraightnessRisk ?? 0,
  sedimentSeaFillRisk: sedimentBudget.sedimentSeaFillRisk ?? 0,
  sedimentShelfConcentration: sedimentBudget.sedimentShelfConcentration ?? 0,
  sedimentAbyssalConcentration: sedimentBudget.sedimentAbyssalConcentration ?? 0,
  topologyKind: topology.topologyKind,
  wrapXEnabled: topology.wrapXEnabled,
  wrapYEnabled: topology.wrapYEnabled,
  neighborConsistencyValid: topology.neighborConsistencyValid,
  neighbor4SymmetryValid: topology.neighbor4SymmetryValid,
  neighbor8SymmetryValid: topology.neighbor8SymmetryValid,
  distanceWrapValid: topology.distanceWrapValid,
  floodFillTopologyValid: topology.floodFillTopologyValid,
  connectedComponentTopologyValid: topology.connectedComponentTopologyValid,
  connectedComponentCount: topology.connectedComponentCount,
  seamContinuityRisk: topology.seamContinuityRisk,
  faceSeamContinuityRisk: topology.faceSeamContinuityRisk ?? topology.seamContinuityRisk,
  polarBoundaryRisk: topology.polarBoundaryRisk,
  polarAccessRisk: topology.polarAccessRisk,
  topologyManualAccessRisk: topology.topologyManualAccessRisk,
  topologyMigrationCoverage: topology.topologyMigrationCoverage,
  topologyResolutionDrift: topology.topologyResolutionDrift,
  isostaticContinentalMean: isostasy.isostaticContinentalMean,
  isostaticOceanicMean: isostasy.isostaticOceanicMean,
  isostaticTransitionalMean: isostasy.isostaticTransitionalMean,
  continentalOceanReliefGap: isostasy.continentalOceanReliefGap,
  youngOldOceanDepthGap: isostasy.youngOldOceanDepthGap,
  isostaticResidualMean: isostasy.isostaticResidualMean,
  isostaticResidualP95: isostasy.isostaticResidualP95,
  isostasyElevationCorrelation: isostasy.isostasyElevationCorrelation,
  crustThicknessElevationCorrelation: isostasy.crustThicknessElevationCorrelation,
  crustAgeOceanDepthCorrelation: isostasy.crustAgeOceanDepthCorrelation,
  transitionalElevationBand: isostasy.transitionalElevationBand,
  seaLevelDriftAfterIsostasy: isostasy.seaLevelDriftAfterIsostasy,
  landRatioDriftAfterIsostasy: isostasy.landRatioDriftAfterIsostasy,
  closedBasinMisclassifiedAsMarginShare: conditionalShare(terrain.inlandWaterCandidate, (i) => terrain.inlandWaterCandidate[i], (i) => terrain.passiveMargin[i] > 0.05),
  activeBoundaryMisclassifiedAsPassiveMarginShare: conditionalShare(terrain.passiveMargin, (i) => terrain.passiveMargin[i] > 0.05, (i) => world.grid.boundaryInfluence[i] > 0.35 || world.grid.ridge[i] > 0.2 || world.grid.trench[i] > 0.2),
  activeTransformCoverage: coverage(terrain.activeTransform, transformDiagnosticThreshold(world.grid)),
  transformMemoryCoverage: coverage(terrain.transformMemory, transformDiagnosticThreshold(world.grid)),
  fractureZoneMemoryCoverage: coverage(terrain.fractureZoneMemory, transformDiagnosticThreshold(world.grid)),
  inactiveTransformReliefMean: averageWhere(world.grid.inactiveBoundaryRelief, (i) => terrain.transformMemory[i] > transformDiagnosticThreshold(world.grid) && world.grid.boundaryInfluence[i] < 0.12),
  fractureZoneElevationContribution: averageWhere(world.grid.oldBoundaryCorrelation, (i) => terrain.fractureZoneMemory[i] > transformDiagnosticThreshold(world.grid)),
  oldBoundaryReliefCorrelation: average(world.grid.oldBoundaryCorrelation),
  activeVsInactiveBoundaryReliefRatio: ratio(
    averageWhere(terrain.activeTransform, (i) => terrain.activeTransform[i] > transformDiagnosticThreshold(world.grid)),
    averageWhere(world.grid.inactiveBoundaryRelief, (i) => terrain.transformMemory[i] > transformDiagnosticThreshold(world.grid) && terrain.activeTransform[i] <= transformDiagnosticThreshold(world.grid) * 0.2),
  ),
  plateCheckerboardScore: average(world.grid.plateCheckerboard),
  activeBoundaryCoverage: coverage(world.grid.activeBoundary, 0.5),
  localBoundaryDensityMean: average(world.grid.boundaryDensity),
  noisyBoundaryPatchCoverage: coverage(world.grid.noisyBoundaryPatch, 0.5),
  plateIslandNoiseShare: plateIslandNoiseShare(world.grid),
  featureOnNoisyBoundaryShare: featureOnNoisyBoundaryShare(world.grid),
  ageBandStraightnessNearRidge: ageBandSplit.nearRidge,
  ageBandStraightnessInactive: ageBandSplit.inactive,
  ageBandStraightnessFractureZone: ageBandSplit.fractureZone,
  abyssalPlainFractureSuppression: averageWhere(world.grid.oldBoundaryCorrelation, (i) => terrain.fractureZoneMemory[i] > 0.05 && terrain.abyssalPlain[i] > 0.05),
  axisBoundaryDependency: averageWhere(world.grid.axisBoundaryDependency, (i) => world.grid.tectonicAxis[i] > axisDiagnosticThreshold(world.grid)),
  axisNoisyBoundaryShare: conditionalShare(world.grid.tectonicAxis, (i) => world.grid.tectonicAxis[i] > axisDiagnosticThreshold(world.grid), (i) => world.grid.noisyBoundaryPatch[i]),
  axisSegmentLengthMean: axisSegmentLengthMean(world.grid),
  axisCurvatureMean: averageWhere(world.grid.axisCurvature, (i) => world.grid.tectonicAxis[i] > axisDiagnosticThreshold(world.grid)),
  axisContinuityMean: averageWhere(world.grid.axisContinuity, (i) => world.grid.tectonicAxis[i] > axisDiagnosticThreshold(world.grid)),
  mountainHeightBlockiness: averageWhere(world.grid.mountainHeightBlockiness, (i) => world.grid.mountainHeight[i] > 0.02),
  orographicBarrierContinuity: averageWhere(world.grid.orographicBarrierContinuity, (i) => world.grid.orographicBarrier[i] > 0.02),
  ...geologicSeaLevelStats(world),
  ...reliefStats(world, outputs),
  activeFeatureOnNoisyBoundaryShare: featureOnNoisyBoundaryShare(world.grid),
  ridgeAxisBoundaryDependency: averageWhere(world.grid.axisBoundaryDependency, (i) => world.grid.ridgeAxis[i] > axisDiagnosticThreshold(world.grid)),
  trenchAxisBoundaryDependency: averageWhere(world.grid.axisBoundaryDependency, (i) => world.grid.trenchAxis[i] > axisDiagnosticThreshold(world.grid)),
  riftAxisBoundaryDependency: averageWhere(world.grid.axisBoundaryDependency, (i) => world.grid.riftAxis[i] > axisDiagnosticThreshold(world.grid)),
  averageSlope: average(terrain.slope),
  averageRuggedness: average(terrain.ruggedness),
  orographicBarrierCoverage: coverage(climate.orographicBarrier, 0.02),
  activeOrogenyCoverage: coverage(world.grid.activeOrogeny, 0.05),
  oldOrogenyCoverage: coverage(world.grid.oldOrogeny, 0.05),
  oldOrogenyWidth: widthProxy(world.grid.oldOrogeny, 0.05),
  orogenyAgeMean: averageWhere(world.grid.orogenyAge, (i) => world.grid.oldOrogeny[i] > 0.03 || world.grid.activeOrogeny[i] > 0.03),
  orogenyErosionMean: average(world.grid.orogenyErosion),
  orogenicSedimentBudget: ratio(average(world.grid.orogenicSedimentSupply), average(world.grid.sediment)),
  forelandBasinCoverage: coverage(world.grid.forelandBasin, 0.05),
  newVsOldMountainReliefRatio: ratio(averageWhere(world.grid.mountainHeight, (i) => world.grid.activeOrogeny[i] > 0.05), averageWhere(world.grid.mountainHeight, (i) => world.grid.oldOrogeny[i] > 0.05 && world.grid.activeOrogeny[i] <= 0.02)),
  mountainAxisCurvature: mountainAxisCurvature(world.grid),
  mountainBoundaryZeroShare: conditionalShare(world.grid.mountainBelt, (i) => world.grid.mountainBelt[i] > 0.05, (i) => world.grid.boundaryDistance[i] === 0),
  oldOrogenyBoundaryShare: conditionalShare(world.grid.oldOrogeny, (i) => world.grid.oldOrogeny[i] > 0.05, (i) => world.grid.boundaryDistance[i] <= 1),
  sedimentSinkCoverage: coverage(hydrology.sedimentSink, 0.18),
  soilDepthPotentialMean: average(biosphere.soilDepthPotential),
  coastalWetlandPotentialShare: coverage(biosphere.coastalWetlandPotential, 0.05),
};

console.log(JSON.stringify({
  seedText: params.seedText,
  steps,
  ageYears: world.ageYears,
  pipelineMode: params.pipelineMode,
  resolution: params.resolution,
  topologyMode: world.params.topologyMode,
  projectionMode: world.params.projectionMode,
  faceSize: world.params.faceSize,
  sphericalGridSize: world.sphericalGrid?.size ?? 0,
  gridSize: world.grid.size,
  seaLevel: world.seaLevel,
  valid: validation.errors.length === 0,
  validation,
  stats,
}, null, 2));

if (validation.errors.length > 0) {
  process.exitCode = 1;
}

function validateOutputs(outputs, fields, size) {
  const errors = [];
  const fieldTypes = {};
  for (const [group, names] of Object.entries(fields)) {
    const value = outputs[group];
    if (!value || typeof value !== "object") {
      errors.push(`${group} is missing`);
      continue;
    }
    fieldTypes[group] = {};
    for (const name of names) {
      const field = value[name];
      if (field === undefined || field === null) {
        errors.push(`${group}.${name} is missing`);
        continue;
      }
      if (field.length !== size) {
        if (!scalarFields.has(`${group}.${name}`)) errors.push(`${group}.${name} length ${field.length} !== grid.size ${size}`);
      }
      if (!ArrayBuffer.isView(field)) {
        if (scalarFields.has(`${group}.${name}`) && typeof field === "number" && Number.isFinite(field)) {
          fieldTypes[group][name] = "number";
        } else {
          errors.push(`${group}.${name} is not a typed array`);
          fieldTypes[group][name] = typeof field;
        }
      } else {
        fieldTypes[group][name] = field.constructor.name;
      }
    }
  }
  return { errors, fieldTypes };
}

function reliefStats(world, outputs) {
  const diagnostics = world.reliefDiagnostics ?? {};
  return {
    globalElevationStd: diagnostics.globalElevationStd ?? 0,
    landElevationStd: diagnostics.landElevationStd ?? 0,
    oceanElevationStd: diagnostics.oceanElevationStd ?? 0,
    hypsometricSpread: diagnostics.hypsometricSpread ?? 0,
    landReliefSpread: diagnostics.landReliefSpread ?? 0,
    oceanReliefSpread: diagnostics.oceanReliefSpread ?? 0,
    flatLandShare: diagnostics.flatLandShare ?? share(outputs.terrain.flatLandMask),
    largePlainShare: diagnostics.largePlainShare ?? share(outputs.terrain.largePlainMask),
    seaLevelSensitivity: diagnostics.seaLevelSensitivity ?? average(outputs.terrain.seaLevelSensitivity),
    coastInstabilityRisk: diagnostics.coastInstabilityRisk ?? 0,
    reliefDeficit: diagnostics.reliefDeficit ?? average(outputs.terrain.reliefDeficit),
    tectonicReliefSupplyMean: diagnostics.tectonicReliefSupplyMean ?? average(world.grid.tectonicReliefSupply),
    isostaticReliefSupplyMean: diagnostics.isostaticReliefSupplyMean ?? average(world.grid.isostaticReliefSupply),
    erosionFlatteningPressureMean: diagnostics.erosionFlatteningPressureMean ?? average(world.grid.erosionFlatteningPressure),
    sedimentSmoothingPressureMean: diagnostics.sedimentSmoothingPressureMean ?? average(world.grid.sedimentSmoothingPressure),
    drainageGradientPotential: diagnostics.drainageGradientPotential ?? outputs.hydrology.drainageGradientPotential ?? 0,
    orographicReliefPotential: diagnostics.orographicReliefPotential ?? outputs.climate.orographicReliefPotential ?? 0,
    flatWorldRisk: Boolean(diagnostics.flatWorldRisk),
  };
}

function geologicSeaLevelStats(world) {
  const diagnostics = world.geologicSeaLevelDiagnostics ?? {};
  return {
    baseSeaLevel: diagnostics.baseSeaLevel ?? world.baseSeaLevel ?? world.seaLevel ?? 0,
    finalSeaLevel: diagnostics.seaLevel ?? world.seaLevel ?? 0,
    geologicSeaLevelOffset: diagnostics.geologicSeaLevelOffset ?? world.geologicSeaLevelOffset ?? 0,
    targetGeologicSeaLevelOffset: diagnostics.targetGeologicSeaLevelOffset ?? 0,
    seaLevelChangeRate: diagnostics.seaLevelChangeRate ?? 0,
    youngOceanShare: diagnostics.youngOceanShare ?? share(world.grid.isYoungOcean),
    oldOceanShare: diagnostics.oldOceanShare ?? conditionalShare(world.grid.crustType, (i) => world.grid.crustType[i] === 0, (i) => world.grid.crustAge[i] > 0.62),
    ridgeVolumeSignalMean: diagnostics.ridgeVolumeSignalMean ?? average(world.grid.ridgeVolumeSignal),
    ridgeVolumeNormalized: diagnostics.ridgeVolumeNormalized ?? 0,
    youngOceanNormalized: diagnostics.youngOceanNormalized ?? 0,
    oldOceanCapacityNormalized: diagnostics.oldOceanCapacityNormalized ?? 0,
    sedimentDisplacementNormalized: diagnostics.sedimentDisplacementNormalized ?? 0,
    trenchCapacityNormalized: diagnostics.trenchCapacityNormalized ?? 0,
    capacityBalance: diagnostics.capacityBalance ?? 0,
    oceanBasinCapacitySignalMean: diagnostics.oceanBasinCapacitySignalMean ?? diagnostics.capacityBalance ?? 0,
    oldOceanCapacitySignalMean: diagnostics.oldOceanCapacitySignalMean ?? average(world.grid.oldOceanCapacitySignal),
    sedimentDisplacementSignalMean: diagnostics.sedimentDisplacementSignalMean ?? average(world.grid.sedimentDisplacementSignal),
    trenchCapacitySignalMean: diagnostics.trenchCapacitySignalMean ?? average(world.grid.trenchCapacitySignal),
    coastalFlipRisk: diagnostics.coastalFlipRisk ?? 0,
    coastalSensitivityMean: diagnostics.coastalSensitivityMean ?? average(world.grid.coastalSensitivity),
    seaLevelCouplingStrength: diagnostics.seaLevelCouplingStrength ?? 0,
    landShareBeforeGeologicOffset: diagnostics.landShareBeforeGeologicOffset ?? 0,
    landShareAfterGeologicOffset: diagnostics.landShareAfterGeologicOffset ?? shareWhere(world.grid.elev, (i) => world.grid.elev[i] >= world.seaLevel),
    geologicSeaLevelLandShareDelta: diagnostics.geologicSeaLevelLandShareDelta ?? 0,
  };
}

function measureIsostasyDiagnostics(world) {
  const { grid, seaLevel } = world;
  const diagnostics = world.isostasyDiagnostics ?? {};
  const continental = [];
  const oceanic = [];
  const transitional = [];
  const residuals = [];
  const isoVals = [];
  const elevVals = [];
  const thicknessVals = [];
  const relVals = [];
  const ageVals = [];
  const depthVals = [];
  const youngDepths = [];
  const oldDepths = [];
  let sedimentLoadSum = 0;

  for (let i = 0; i < grid.size; i += 1) {
    const rel = grid.elev[i] - seaLevel;
    const baseRel = grid.isostaticBase[i] - seaLevel;
    const residual = Math.abs(grid.isostaticResidual[i]);
    residuals.push(residual);
    isoVals.push(grid.isostaticBase[i]);
    elevVals.push(grid.elev[i]);
    thicknessVals.push(grid.crustThickness[i]);
    relVals.push(rel);
    sedimentLoadSum += grid.sedimentLoadSubsidence[i];
    if (grid.crustType[i] === 1) {
      continental.push(baseRel);
    } else if (grid.crustType[i] === 2) {
      transitional.push(baseRel);
    } else {
      const depth = Math.max(0, seaLevel - grid.elev[i]);
      oceanic.push(baseRel);
      ageVals.push(grid.crustAge[i]);
      depthVals.push(depth);
      if (grid.crustAge[i] < 0.18) youngDepths.push(depth);
      if (grid.crustAge[i] > 0.72) oldDepths.push(depth);
    }
  }

  residuals.sort((a, b) => a - b);
  const continentalMean = diagnostics.isostaticContinentalMean ?? meanArray(continental);
  const oceanicMean = diagnostics.isostaticOceanicMean ?? meanArray(oceanic);
  const transitionalMean = diagnostics.isostaticTransitionalMean ?? meanArray(transitional);
  return {
    isostaticContinentalMean: continentalMean,
    isostaticOceanicMean: oceanicMean,
    isostaticTransitionalMean: transitionalMean,
    continentalOceanReliefGap: diagnostics.continentalOceanReliefGap ?? continentalMean - oceanicMean,
    youngOldOceanDepthGap: diagnostics.youngOldOceanDepthGap ?? meanArray(oldDepths) - meanArray(youngDepths),
    sedimentLoadSubsidenceMean: diagnostics.sedimentLoadSubsidenceMean ?? sedimentLoadSum / Math.max(1, grid.size),
    isostaticResidualMean: diagnostics.isostaticResidualMean ?? meanArray(residuals),
    isostaticResidualP95: diagnostics.isostaticResidualP95 ?? percentileSorted(residuals, 0.95),
    isostasyElevationCorrelation: diagnostics.isostasyElevationCorrelation ?? correlation(isoVals, elevVals),
    crustThicknessElevationCorrelation: diagnostics.crustThicknessElevationCorrelation ?? correlation(thicknessVals, relVals),
    crustAgeOceanDepthCorrelation: diagnostics.crustAgeOceanDepthCorrelation ?? correlation(ageVals, depthVals),
    transitionalElevationBand: diagnostics.transitionalElevationBand ?? transitionalMean,
    seaLevelDriftAfterIsostasy: diagnostics.seaLevelDriftAfterIsostasy ?? 0,
    landRatioDriftAfterIsostasy: diagnostics.landRatioDriftAfterIsostasy ?? 0,
  };
}

function share(mask) {
  let covered = 0;
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) {
    const area = metricArea(i);
    total += area;
    if (mask[i]) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function shareWhere(mask, predicate) {
  let covered = 0;
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) {
    const area = metricArea(i);
    total += area;
    if (mask[i] && predicate(i)) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function coverage(field, threshold) {
  let covered = 0;
  let total = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricArea(i);
    total += area;
    if (field[i] > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function average(field) {
  let total = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricArea(i);
    total += field[i] * area;
    weight += area;
  }
  return total / Math.max(weight, Number.EPSILON);
}

function sum(field) {
  let total = 0;
  for (let i = 0; i < field.length; i += 1) total += field[i] * metricArea(i);
  return total;
}

function averageWhere(field, include) {
  let total = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    const area = metricArea(i);
    total += field[i] * area;
    weight += area;
  }
  return weight ? total / weight : 0;
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function conditionalShare(field, include, predicate) {
  let total = 0;
  let matched = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    const area = metricArea(i);
    total += area;
    if (predicate(i)) matched += area;
  }
  return total ? matched / total : 0;
}

function histogram(field, buckets) {
  const result = Array.from({ length: buckets }, () => 0);
  let total = 0;
  for (let i = 0; i < field.length; i += 1) {
    const v = field[i];
    if (v < 0 || v >= buckets) continue;
    const area = metricArea(i);
    result[v] += area;
    total += area;
  }
  return result.map((count) => count / Math.max(total, Number.EPSILON));
}

function metricArea(id) {
  const area = world.grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function ratio(active, inactive) {
  return Math.abs(active) / Math.max(0.000001, Math.abs(inactive));
}

function widthProxy(field, threshold) {
  let covered = 0;
  let edge = 0;
  const topology = topologyForGrid(world.grid);
  for (let id = 0; id < world.grid.size; id += 1) {
    if (field[id] <= threshold) continue;
    const area = metricArea(id);
    covered += area;
    let nearEmpty = false;
    forEachAnyNeighbor(topology, id, (nid) => {
      if (field[nid] <= threshold) nearEmpty = true;
    });
    if (nearEmpty) edge += area;
  }
  return edge ? covered / edge : 0;
}

function axisSegmentLengthMean(grid) {
  const counts = new Map();
  for (let i = 0; i < grid.axisSegmentId.length; i += 1) {
    const id = grid.axisSegmentId[i];
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (!counts.size) return 0;
  let total = 0;
  for (const count of counts.values()) total += count;
  return total / counts.size;
}

function axisDiagnosticThreshold(grid) {
  return grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.graphBacked ? 0.016 : 0.05;
}

function transformDiagnosticThreshold(grid) {
  return grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.graphBacked ? 0.006 : 0.05;
}

function mountainAxisCurvature(grid) {
  let total = 0;
  let bent = 0;
  const topology = topologyForGrid(grid);
  const threshold = axisDiagnosticThreshold(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.mountainAxis[id] <= threshold) continue;
    const area = metricArea(id);
    total += area;
    let connected = 0;
    let strongest = 0;
    forEachAnyNeighbor(topology, id, (nid) => {
      const v = grid.mountainAxis[nid] > threshold ? grid.mountainAxis[nid] : 0;
      connected += v;
      if (v > strongest) strongest = v;
    });
    if (connected > strongest + threshold) bent += area;
  }
  return total ? bent / total : 0;
}

function plateIslandNoiseShare(grid) {
  let count = 0;
  let total = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(i);
    total += area;
    if (isPlateIslandNoise(grid, i)) count += area;
  }
  return count / Math.max(total, Number.EPSILON);
}

function featureOnNoisyBoundaryShare(grid) {
  let featureCount = 0;
  let noisyFeature = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const feature = Math.max(grid.mountainBelt[i], grid.trench[i], grid.ridge[i], grid.rift[i], grid.basin[i], grid.islandArc[i]);
    if (feature <= 0.05) continue;
    const area = metricArea(i);
    featureCount += area;
    if (grid.noisyBoundaryPatch[i]) noisyFeature += area;
  }
  return featureCount ? noisyFeature / featureCount : 0;
}

function isPlateIslandNoise(grid, id) {
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  forEachAnyNeighbor(topologyForGrid(grid), id, (nid) => {
    if (grid.plate[nid] === current) same += 1;
    else different += 1;
  });
  return same <= 2 && different >= 5;
}

function measureAgeBandStraightnessSplit(grid) {
  let nearTotal = 0;
  let nearStraight = 0;
  let inactiveTotal = 0;
  let inactiveStraight = 0;
  let fractureTotal = 0;
  let fractureStraight = 0;
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.crustType[id] !== 0) continue;
    const band = Math.floor(grid.crustAge[id] * 10);
    let aligned = 0;
    forEachAnyNeighbor(topology, id, (nid) => {
      if (grid.crustType[nid] === 0 && Math.floor(grid.crustAge[nid] * 10) === band) aligned += 1;
    });
    if (aligned <= 0) continue;
    const area = metricArea(id);
    const straight = aligned >= 2 ? area : 0;
    if (grid.ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3) {
      nearTotal += area;
      nearStraight += straight;
    } else if (grid.fractureZoneMemory[id] > 0.05) {
      fractureTotal += area;
      fractureStraight += straight;
    } else if (grid.boundaryInfluence[id] < 0.12) {
      inactiveTotal += area;
      inactiveStraight += straight;
    }
  }
  return {
    nearRidge: nearTotal ? nearStraight / nearTotal : 0,
    inactive: inactiveTotal ? inactiveStraight / inactiveTotal : 0,
    fractureZone: fractureTotal ? fractureStraight / fractureTotal : 0,
  };
}

function forEachAnyNeighbor(topology, id, visit) {
  if (typeof topology.forEachNeighbor8 === "function") {
    topology.forEachNeighbor8(id, visit);
    return;
  }
  if (typeof topology.forEachNeighbor === "function") {
    topology.forEachNeighbor(id, visit);
  }
}
