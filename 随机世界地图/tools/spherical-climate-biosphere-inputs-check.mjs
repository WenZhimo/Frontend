import { getBiosphereInputs, getClimateInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { physicalRadius } from "../src/sim/grid.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedFieldSummary, weightedMean, weightedShare } from "../src/sim/sphere/stats.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 55)));

const world = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize,
});

runToCheckpoints(world, [steps], () => null);

const grid = world.grid;
const terrain = getTerrainDerived(world);
const climate = getClimateInputs(world);
const biosphere = getBiosphereInputs(world);
const topology = topologyForGrid(grid);

const climateFields = [
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
  "coastalSensitivity",
];

const biosphereFields = [
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
];

const climateFieldMetrics = Object.fromEntries(climateFields.map((name) => [
  name,
  measureField(climate[name]),
]));
const biosphereFieldMetrics = Object.fromEntries(biosphereFields.map((name) => [
  name,
  measureField(biosphere[name]),
]));

const missingClimateFields = climateFields.filter((name) => !climate[name]);
const missingBiosphereFields = biosphereFields.filter((name) => !biosphere[name]);
const wrongSizedClimateFields = fieldNamesWhere(climateFieldMetrics, (metric) => metric.length !== grid.size);
const wrongSizedBiosphereFields = fieldNamesWhere(biosphereFieldMetrics, (metric) => metric.length !== grid.size);
const nonFiniteClimateFields = fieldNamesWhere(climateFieldMetrics, (metric) => metric.finiteShare !== 1);
const nonFiniteBiosphereFields = fieldNamesWhere(biosphereFieldMetrics, (metric) => metric.finiteShare !== 1);

const activeFields = [
  ["orographicBarrier", climate.orographicBarrier, 0.002],
  ["mountainAxis", climate.mountainAxis, 0.016],
  ["mountainHeight", climate.mountainHeight, 0.002],
  ["soilDepthPotential", biosphere.soilDepthPotential, 0.05],
  ["groundwaterPotential", biosphere.groundwaterPotential, 0.01],
  ["floodplainPotential", biosphere.floodplainPotential, 0.001],
  ["coastalWetlandPotential", biosphere.coastalWetlandPotential, 0.001],
  ["volcanicSoilPotential", biosphere.volcanicSoilPotential, 0.016],
  ["disturbance", biosphere.disturbance, 0.016],
  ["connectivityToLandmass", biosphere.connectivityToLandmass, 0.01],
].map(([name, field, threshold]) => ({ name, ...measureActiveField(field, threshold) }));

const activeNonSparseFields = activeFields.filter((metric) => metric.coverage > 0.0005);
const maxInterfaceSeamRatio = Math.max(0, ...activeNonSparseFields.map((metric) => metric.seamDiffToInteriorRatio ?? 0));
const maxInterfaceSeamDelta = Math.max(0, ...activeNonSparseFields.map((metric) => metric.seamRatioDelta ?? 0));

const metrics = {
  climateBiosphereProbePurpose: "spherical climate/biosphere interface diagnostics; fields are geology/terrain-derived pre-climate inputs, not complete climate, river routing, or biome simulation",
  climateCompletenessRequired: false,
  biosphereCompletenessRequired: false,
  waterAvailabilityCompletenessRequired: false,
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  climateFieldCount: climateFields.length,
  biosphereFieldCount: biosphereFields.length,
  missingClimateFieldCount: missingClimateFields.length,
  missingBiosphereFieldCount: missingBiosphereFields.length,
  wrongSizedClimateFieldCount: wrongSizedClimateFields.length,
  wrongSizedBiosphereFieldCount: wrongSizedBiosphereFields.length,
  nonFiniteClimateFieldCount: nonFiniteClimateFields.length,
  nonFiniteBiosphereFieldCount: nonFiniteBiosphereFields.length,
  landRatio: weightedShare(grid, terrain.landMask),
  seaRatio: weightedShare(grid, terrain.seaMask),
  latitudeMin: climateFieldMetrics.latitude.min,
  latitudeMax: climateFieldMetrics.latitude.max,
  latitudeMean: climateFieldMetrics.latitude.weightedMean,
  latitudePositionCorrelation: correlationWeighted(
    grid,
    climate.latitude,
    grid.positionY ?? climate.latitude,
  ),
  oceanDepthSeaMean: weightedMean(grid, climate.oceanDepth, { predicate: (id) => terrain.seaMask[id] === 1 }),
  oceanDepthLandMean: weightedMean(grid, climate.oceanDepth, { predicate: (id) => terrain.landMask[id] === 1 }),
  climateLandSeaComplementError: complementError(grid, climate.landMask, climate.seaMask),
  climateTerrainLandMismatchShare: mismatchShare(grid, climate.landMask, terrain.landMask),
  climateTerrainSeaMismatchShare: mismatchShare(grid, climate.seaMask, terrain.seaMask),
  shallowSeaExternalShare: weightedShare(grid, terrain.externalSeaMask, {
    predicate: (id) => climate.shallowSeaMask[id] === 1,
  }),
  orographicBarrierCoverage: weightedCoverage(grid, climate.orographicBarrier, 0.002),
  mountainAxisCoverage: weightedCoverage(grid, climate.mountainAxis, 0.016),
  mountainHeightCoverage: weightedCoverage(grid, climate.mountainHeight, 0.002),
  orographicMountainCoupling: weightedMean(grid, climate.orographicBarrier, {
    predicate: (id) => climate.mountainAxis[id] > 0.016 || terrain.ruggedness[id] > 0.006,
  }),
  mountainHeightLandShare: weightedShare(grid, terrain.landMask, {
    predicate: (id) => climate.mountainHeight[id] > 0.002,
  }),
  waterAvailabilityCoverage: weightedCoverage(grid, biosphere.waterAvailability, 0.001),
  soilDepthCoverage: weightedCoverage(grid, biosphere.soilDepthPotential, 0.05),
  groundwaterCoverage: weightedCoverage(grid, biosphere.groundwaterPotential, 0.01),
  floodplainCoverage: weightedCoverage(grid, biosphere.floodplainPotential, 0.001),
  coastalWetlandCoverage: weightedCoverage(grid, biosphere.coastalWetlandPotential, 0.001),
  terrainMoistureProxyCoverage: weightedCoverage(
    grid,
    maxField(biosphere.groundwaterPotential, biosphere.floodplainPotential, biosphere.coastalWetlandPotential),
    0.001,
  ),
  volcanicSoilCoverage: weightedCoverage(grid, biosphere.volcanicSoilPotential, 0.016),
  disturbanceCoverage: weightedCoverage(grid, biosphere.disturbance, 0.016),
  landConnectivityCoverage: weightedCoverage(grid, biosphere.connectivityToLandmass, 0.01),
  soilDepthLandMean: weightedMean(grid, biosphere.soilDepthPotential, { predicate: (id) => terrain.landMask[id] === 1 }),
  soilDepthSeaMean: weightedMean(grid, biosphere.soilDepthPotential, { predicate: (id) => terrain.seaMask[id] === 1 }),
  groundwaterShallowSeaMean: weightedMean(grid, biosphere.groundwaterPotential, { predicate: (id) => terrain.shallowSeaMask[id] === 1 }),
  groundwaterDeepOceanMean: weightedMean(grid, biosphere.groundwaterPotential, { predicate: (id) => terrain.deepOceanMask[id] === 1 }),
  coastalWetlandNearCoastShare: weightedShare(grid, nearCoastMask(grid, terrain), {
    predicate: (id) => biosphere.coastalWetlandPotential[id] > 0.001,
  }),
  volcanicSoilTectonicCoupling: weightedMean(grid, biosphere.volcanicSoilPotential, {
    predicate: (id) => (grid.ridge?.[id] ?? 0) > 0.016 || (grid.islandArc?.[id] ?? 0) > 0.016 || (grid.rift?.[id] ?? 0) > 0.016,
  }),
  disturbanceBoundaryCoupling: weightedMean(grid, biosphere.disturbance, {
    predicate: (id) => (grid.boundaryInfluence?.[id] ?? 0) > 0.08,
  }),
  connectivityLandMean: weightedMean(grid, biosphere.connectivityToLandmass, { predicate: (id) => terrain.landMask[id] === 1 }),
  connectivitySeaMean: weightedMean(grid, biosphere.connectivityToLandmass, { predicate: (id) => terrain.seaMask[id] === 1 }),
  interfaceActiveFieldCount: activeNonSparseFields.length,
  maxInterfaceSeamRatio,
  maxInterfaceSeamDelta,
};
metrics.waterAvailabilityDormantAllowed =
  metrics.waterAvailabilityCoverage === 0 &&
  metrics.terrainMoistureProxyCoverage > 0.05 &&
  !metrics.waterAvailabilityCompletenessRequired;
metrics.preClimateHydrologyProxyActive =
  metrics.groundwaterCoverage > 0.01 ||
  metrics.floodplainCoverage > 0.01 ||
  metrics.coastalWetlandCoverage > 0.01;

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  allClimateFieldsPresent: metrics.missingClimateFieldCount === 0,
  allBiosphereFieldsPresent: metrics.missingBiosphereFieldCount === 0,
  allClimateFieldsMatchGridSize: metrics.wrongSizedClimateFieldCount === 0,
  allBiosphereFieldsMatchGridSize: metrics.wrongSizedBiosphereFieldCount === 0,
  allClimateFieldsFinite: metrics.nonFiniteClimateFieldCount === 0,
  allBiosphereFieldsFinite: metrics.nonFiniteBiosphereFieldCount === 0,
  saneLandSeaRatio: metrics.landRatio > 0.03 && metrics.landRatio < 0.95 && metrics.seaRatio > 0.03,
  latitudeUsesSphericalPosition: metrics.latitudeMin < -50 && metrics.latitudeMax > 50 && metrics.latitudePositionCorrelation > 0.98,
  climateMasksMatchTerrain: metrics.climateLandSeaComplementError < 1e-6 && metrics.climateTerrainLandMismatchShare === 0 && metrics.climateTerrainSeaMismatchShare === 0,
  oceanDepthOnlySea: metrics.oceanDepthSeaMean > 0.02 && metrics.oceanDepthLandMean === 0,
  interfaceFieldsActive: metrics.interfaceActiveFieldCount >= 7,
  orographicBarrierPresent: metrics.orographicBarrierCoverage > 0.002,
  orographicCoupledToRelief: metrics.orographicMountainCoupling > 0.0003,
  mountainsMostlyLand: metrics.mountainHeightCoverage === 0 || metrics.mountainHeightLandShare > 0.75,
  climateBiosphereScopeDocumented: !metrics.climateCompletenessRequired && !metrics.biosphereCompletenessRequired,
  waterAvailabilityDormancyExplained: metrics.waterAvailabilityCoverage > 0.001 || metrics.waterAvailabilityDormantAllowed,
  terrainMoistureProxyActive: metrics.preClimateHydrologyProxyActive,
  soilDepthPresent: metrics.soilDepthCoverage > 0.05,
  groundwaterPresent: metrics.groundwaterCoverage > 0.05,
  groundwaterFavorsShallowWaterOrSediment: metrics.groundwaterShallowSeaMean >= metrics.groundwaterDeepOceanMean,
  coastalWetlandsNearCoast: metrics.coastalWetlandCoverage === 0 || metrics.coastalWetlandNearCoastShare > 0.7,
  volcanicSoilCoupledToTectonics: metrics.volcanicSoilCoverage === 0 || metrics.volcanicSoilTectonicCoupling > 0.01,
  disturbanceCoupledToBoundaries: metrics.disturbanceBoundaryCoupling > 0.01,
  landConnectivityMostlyLand: metrics.connectivityLandMean > metrics.connectivitySeaMean,
  interfaceSeamsContinuous: metrics.maxInterfaceSeamRatio < 1.9,
  interfaceSeamDeltaBounded: metrics.maxInterfaceSeamDelta < 0.8,
};

const failures = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

const result = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  steps,
  failures,
  checks,
  metrics,
  missingClimateFields,
  missingBiosphereFields,
  wrongSizedClimateFields,
  wrongSizedBiosphereFields,
  nonFiniteClimateFields,
  nonFiniteBiosphereFields,
  climateFieldMetrics,
  biosphereFieldMetrics,
  activeFields,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureField(field) {
  if (!field) {
    return {
      length: 0,
      finiteShare: 0,
      sampledArea: 0,
      weightedMean: null,
      nonZeroShare: 0,
      min: null,
      max: null,
    };
  }
  const summary = weightedFieldSummary(grid, field);
  return {
    length: field.length,
    finiteShare: finiteShare(field),
    sampledArea: summary.sampledArea,
    weightedMean: summary.weightedMean,
    nonZeroShare: summary.nonZeroShare,
    min: summary.min,
    max: summary.max,
  };
}

function measureActiveField(field, threshold) {
  return {
    coverage: weightedCoverage(grid, field, threshold),
    ...measureFaceSeamContinuity(field),
  };
}

function measureFaceSeamContinuity(field) {
  let interiorTotal = 0;
  let interiorCount = 0;
  let seamTotal = 0;
  let seamCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    topology.forEachNeighbor(id, (nid) => {
      if (nid < id) return;
      const a = field[id];
      const b = field[nid];
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      const diff = Math.abs(a - b);
      if (grid.face[id] === grid.face[nid]) {
        interiorTotal += diff;
        interiorCount += 1;
      } else {
        seamTotal += diff;
        seamCount += 1;
      }
    });
  }
  const interiorMean = interiorTotal / Math.max(1, interiorCount);
  const seamMean = seamTotal / Math.max(1, seamCount);
  const seamDiffToInteriorRatio = interiorCount && seamCount ? seamMean / Math.max(interiorMean, Number.EPSILON) : null;
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio,
    seamRatioDelta: seamDiffToInteriorRatio === null ? null : seamDiffToInteriorRatio - 1,
  };
}

function fieldNamesWhere(metricsByName, predicate) {
  return Object.entries(metricsByName)
    .filter(([, metric]) => predicate(metric))
    .map(([name]) => name);
}

function weightedCoverage(grid, field, threshold) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    total += area;
    if (Number(field?.[id] ?? 0) > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function maxField(...fields) {
  const length = Math.max(0, ...fields.map((field) => field?.length ?? 0));
  const output = new Float32Array(length);
  for (let id = 0; id < length; id += 1) {
    let max = 0;
    for (const field of fields) max = Math.max(max, field?.[id] ?? 0);
    output[id] = max;
  }
  return output;
}

function mismatchShare(grid, a, b) {
  let mismatched = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    total += area;
    if ((a[id] ? 1 : 0) !== (b[id] ? 1 : 0)) mismatched += area;
  }
  return mismatched / Math.max(total, Number.EPSILON);
}

function complementError(grid, a, b) {
  let maxError = 0;
  for (let id = 0; id < grid.size; id += 1) {
    maxError = Math.max(maxError, Math.abs((a[id] ? 1 : 0) + (b[id] ? 1 : 0) - 1));
  }
  return maxError;
}

function correlationWeighted(grid, a, b) {
  const meanA = weightedMean(grid, a);
  const meanB = weightedMean(grid, b);
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    const da = Number(a[id] ?? 0) - meanA;
    const db = Number(b[id] ?? 0) - meanB;
    covariance += da * db * area;
    varianceA += da * da * area;
    varianceB += db * db * area;
  }
  return covariance / Math.max(Number.EPSILON, Math.sqrt(varianceA * varianceB));
}

function nearCoastMask(grid, terrain) {
  const mask = new Uint8Array(grid.size);
  const threshold = physicalRadius(grid, 2);
  for (let id = 0; id < grid.size; id += 1) {
    if (terrain.landMask[id] && terrain.coastDistance[id] <= threshold && terrain.relativeElevation[id] < 0.08) {
      mask[id] = 1;
    }
  }
  return mask;
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
