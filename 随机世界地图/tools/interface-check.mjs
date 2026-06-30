import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import {
  getBiosphereInputs,
  getClimateInputs,
  getHydrologyInputs,
  getResourceInputs,
  getTerrainDerived,
} from "../src/sim/derived/terrain.js";

const params = {
  seedText: process.argv[2] ?? "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  pipelineMode: process.argv[4] ?? "geology-v2",
  resolution: process.argv[5] ?? "512x256",
};
const steps = Number(process.argv[3] ?? 0);

const world = createWorld(params);
for (let i = 0; i < steps; i += 1) stepWorld(world);

const outputs = {
  terrain: getTerrainDerived(world),
  climate: getClimateInputs(world),
  hydrology: getHydrologyInputs(world),
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
    "activeTransform",
    "transformMemory",
    "fractureZoneMemory",
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
  ],
  hydrology: [
    "hydroElevation",
    "externalSeaMask",
    "oceanConnectivity",
    "inlandWaterCandidate",
    "closedBasinId",
    "depressionMask",
    "slope",
    "erodibility",
    "permeability",
    "sedimentSink",
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
    "orogeny",
    "volcanicArc",
    "riftStage",
    "passiveMargin",
    "sedimentaryBasin",
    "metamorphicBelt",
    "igneousProvince",
    "hydrothermalPotential",
    "mineralProvince",
    "activeTransform",
    "transformMemory",
    "fractureZoneMemory",
  ],
};

const validation = validateOutputs(outputs, requiredFields, world.grid.size);
const terrain = outputs.terrain;
const hydrology = outputs.hydrology;
const climate = outputs.climate;
const biosphere = outputs.biosphere;
const ageBandSplit = measureAgeBandStraightnessSplit(world.grid);

const stats = {
  landRatio: share(terrain.landMask),
  seaRatio: share(terrain.seaMask),
  shallowSeaShare: share(terrain.shallowSeaMask),
  deepOceanShare: share(terrain.deepOceanMask),
  landmassCount: maxInt(terrain.landmassId),
  islandCount: maxInt(terrain.islandId),
  externalSeaShare: share(hydrology.externalSeaMask),
  inlandWaterCandidateShare: shareWhere(terrain.seaMask, (i) => !hydrology.externalSeaMask[i]),
  closedBasinCount: maxInt(hydrology.closedBasinId),
  inlandWaterCandidateShare: share(terrain.inlandWaterCandidate),
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
  closedBasinMisclassifiedAsMarginShare: conditionalShare(terrain.inlandWaterCandidate, (i) => terrain.inlandWaterCandidate[i], (i) => terrain.passiveMargin[i] > 0.05),
  activeBoundaryMisclassifiedAsPassiveMarginShare: conditionalShare(terrain.passiveMargin, (i) => terrain.passiveMargin[i] > 0.05, (i) => world.grid.boundaryInfluence[i] > 0.35 || world.grid.ridge[i] > 0.2 || world.grid.trench[i] > 0.2),
  activeTransformCoverage: coverage(terrain.activeTransform, 0.05),
  transformMemoryCoverage: coverage(terrain.transformMemory, 0.05),
  fractureZoneMemoryCoverage: coverage(terrain.fractureZoneMemory, 0.05),
  inactiveTransformReliefMean: averageWhere(world.grid.inactiveBoundaryRelief, (i) => terrain.transformMemory[i] > 0.05 && world.grid.boundaryInfluence[i] < 0.12),
  fractureZoneElevationContribution: averageWhere(world.grid.oldBoundaryCorrelation, (i) => terrain.fractureZoneMemory[i] > 0.05),
  oldBoundaryReliefCorrelation: average(world.grid.oldBoundaryCorrelation),
  activeVsInactiveBoundaryReliefRatio: ratio(
    averageWhere(terrain.activeTransform, (i) => terrain.activeTransform[i] > 0.05),
    averageWhere(world.grid.inactiveBoundaryRelief, (i) => terrain.transformMemory[i] > 0.05 && terrain.activeTransform[i] <= 0.01),
  ),
  ageBandStraightnessNearRidge: ageBandSplit.nearRidge,
  ageBandStraightnessInactive: ageBandSplit.inactive,
  ageBandStraightnessFractureZone: ageBandSplit.fractureZone,
  abyssalPlainFractureSuppression: averageWhere(world.grid.oldBoundaryCorrelation, (i) => terrain.fractureZoneMemory[i] > 0.05 && terrain.abyssalPlain[i] > 0.05),
  averageSlope: average(terrain.slope),
  averageRuggedness: average(terrain.ruggedness),
  orographicBarrierCoverage: coverage(climate.orographicBarrier, 0.02),
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
      if (!field) {
        errors.push(`${group}.${name} is missing`);
        continue;
      }
      if (field.length !== size) {
        errors.push(`${group}.${name} length ${field.length} !== grid.size ${size}`);
      }
      if (!ArrayBuffer.isView(field)) {
        errors.push(`${group}.${name} is not a typed array`);
        fieldTypes[group][name] = typeof field;
      } else {
        fieldTypes[group][name] = field.constructor.name;
      }
    }
  }
  return { errors, fieldTypes };
}

function share(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) count += 1;
  return count / mask.length;
}

function shareWhere(mask, predicate) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && predicate(i)) count += 1;
  }
  return count / mask.length;
}

function coverage(field, threshold) {
  let count = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (field[i] > threshold) count += 1;
  }
  return count / field.length;
}

function average(field) {
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) sum += field[i];
  return sum / field.length;
}

function averageWhere(field, include) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    sum += field[i];
    count += 1;
  }
  return count ? sum / count : 0;
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
    total += 1;
    if (predicate(i)) matched += 1;
  }
  return total ? matched / total : 0;
}

function histogram(field, buckets) {
  const result = Array.from({ length: buckets }, () => 0);
  for (let i = 0; i < field.length; i += 1) {
    const v = field[i];
    if (v >= 0 && v < buckets) result[v] += 1;
  }
  return result.map((count) => count / field.length);
}

function ratio(active, inactive) {
  return Math.abs(active) / Math.max(0.000001, Math.abs(inactive));
}

function measureAgeBandStraightnessSplit(grid) {
  let nearTotal = 0;
  let nearStraight = 0;
  let inactiveTotal = 0;
  let inactiveStraight = 0;
  let fractureTotal = 0;
  let fractureStraight = 0;
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      if (grid.crustType[id] !== 0) continue;
      const band = Math.floor(grid.crustAge[id] * 10);
      const aligned = Math.max(
        sameAgeBand(grid, x - 1, y, band) + sameAgeBand(grid, x + 1, y, band),
        sameAgeBand(grid, x, y - 1, band) + sameAgeBand(grid, x, y + 1, band),
        sameAgeBand(grid, x - 1, y - 1, band) + sameAgeBand(grid, x + 1, y + 1, band),
        sameAgeBand(grid, x + 1, y - 1, band) + sameAgeBand(grid, x - 1, y + 1, band),
      );
      if (aligned <= 0) continue;
      const straight = aligned >= 2 ? 1 : 0;
      if (grid.ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3) {
        nearTotal += 1;
        nearStraight += straight;
      } else if (grid.fractureZoneMemory[id] > 0.05) {
        fractureTotal += 1;
        fractureStraight += straight;
      } else if (grid.boundaryInfluence[id] < 0.12) {
        inactiveTotal += 1;
        inactiveStraight += straight;
      }
    }
  }
  return {
    nearRidge: nearTotal ? nearStraight / nearTotal : 0,
    inactive: inactiveTotal ? inactiveStraight / inactiveTotal : 0,
    fractureZone: fractureTotal ? fractureStraight / fractureTotal : 0,
  };
}

function sameAgeBand(grid, x, y, band) {
  if (y < 0 || y >= grid.height) return 0;
  const nx = ((x % grid.width) + grid.width) % grid.width;
  const id = y * grid.width + nx;
  return grid.crustType[id] === 0 && Math.floor(grid.crustAge[id] * 10) === band ? 1 : 0;
}
