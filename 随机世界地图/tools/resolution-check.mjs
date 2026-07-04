import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { getHydrologyInputs } from "../src/sim/derived/terrain.js";
import { measureIsostasyDiagnostics } from "../src/sim/geology/isostasy.js";
import { projectionSampleToVec3 } from "../src/render/sphericalProjectionRenderer.js";
import { nearestCellByVector } from "../src/sim/sphere/cubedSphere.js";
import { measureTopologyDiagnostics, topologyForGrid } from "../src/sim/topology.js";
import { parseBoolOption, parseOptions, parseTopologyOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const hydrologyDiagnosticsMode = parseBoolOption(options, "full-hydrology") ? "full" : "basic";
const topologyOptions = parseTopologyOptions(options);

const seedText = positional[0] ?? "???-??7";
const steps = Number(positional[1] ?? 200);
const pipelineMode = positional[2] ?? "geology-v2";
const resolutions = (positional[3] ?? "256x128,512x256,1024x512").split(",");
const sampleResolution = positional[4] ?? "512x256";

const worlds = new Map();
for (const resolution of resolutions) {
  const world = createWorld({
    seedText,
    waterLevel: 50,
    intensity: 1,
    plateCount: 14,
    timeScale: 1_000_000,
    resolution,
    pipelineMode,
    ...topologyOptions,
  });
  for (let i = 0; i < steps; i += 1) stepWorld(world);
  worlds.set(resolution, world);
}

const [sampleWidth, sampleHeight] = sampleResolution.split("x").map(Number);
const baselineResolution = resolutions.includes("512x256") ? "512x256" : resolutions[0];
const baseline = sampleWorld(worlds.get(baselineResolution), sampleWidth, sampleHeight);
const comparisons = {};
let currentGrid = null;

for (const resolution of resolutions) {
  const world = worlds.get(resolution);
  currentGrid = world.grid;
  const sample = sampleWorld(world, sampleWidth, sampleHeight);
  comparisons[resolution] = {
    landRatio: world.stats.landRatio,
    seaRatio: world.stats.seaRatio,
    seaLevel: world.seaLevel,
    averagePlateDriftReferenceCells: world.stats.avgPlateDrift,
    coastlineRatio: measureCoastline(sample.land, sampleWidth, sampleHeight),
    landMismatchVsBaseline: measureMismatch(sample.land, baseline.land),
    plateMismatchVsBaseline: measureMismatch(sample.plate, baseline.plate),
    elevationRmseVsBaseline: measureRmse(sample.elevation, baseline.elevation),
    featureStats: measureFeatureStats(world.grid),
    crustStats: measureCrustStats(world.grid),
    oceanAgeDiagnostics: measureOceanAgeDiagnostics(world),
    riftDiagnostics: measureRiftDiagnostics(world),
    marginDiagnostics: measureMarginDiagnostics(world),
    sedimentBudgetDiagnostics: measureSedimentBudgetDiagnostics(world),
    transformDiagnostics: measureTransformDiagnostics(world),
    orogenyDiagnostics: measureOrogenyDiagnostics(world),
    axisDiagnostics: measureAxisDiagnostics(world),
    geologicSeaLevelDiagnostics: measureGeologicSeaLevelDiagnostics(world),
    hydrologyDiagnostics: measureHydrologyDiagnostics(world),
    topologyDiagnostics: measureTopologyDiagnostics(world),
    isostasyDiagnostics: measureIsostasyDiagnostics(world),
    reliefDiagnostics: measureReliefDiagnostics(world),
    boundaryDiagnostics: measureBoundaryDiagnostics(world.grid),
    geologyRisks: measureGeologyRisks(world),
  };
}

console.log(JSON.stringify({
  seedText,
  steps,
  pipelineMode,
  topologyMode: topologyOptions.topologyMode,
  projectionMode: topologyOptions.projectionMode,
  faceSize: topologyOptions.faceSize ?? null,
  sampleResolution,
  baselineResolution,
  comparisons,
}, null, 2));

function sampleWorld(world, width, height) {
  if (isGraphBackedGrid(world.grid)) return sampleProjectedWorld(world, width, height);
  return sampleRectangularWorld(world, width, height);
}

function sampleProjectedWorld(world, width, height) {
  const size = width * height;
  const land = new Uint8Array(size);
  const plate = new Int32Array(size);
  const elevation = new Float32Array(size);
  const projectionMode = world.params?.projectionMode ?? topologyOptions.projectionMode ?? "equirectangular";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const sample = projectionSampleToVec3(x, y, width, height, projectionMode);
      if (!sample.visible) {
        land[id] = 0;
        plate[id] = -1;
        elevation[id] = 0;
        continue;
      }
      const cell = nearestCellByVector(world.grid, sample.x, sample.y, sample.z);
      const h = world.grid.elev[cell];
      land[id] = h >= world.seaLevel ? 1 : 0;
      plate[id] = world.grid.plate[cell] ?? 0;
      elevation[id] = h - world.seaLevel;
    }
  }
  return { land, plate, elevation };
}

function sampleRectangularWorld(world, width, height) {
  const size = width * height;
  const land = new Uint8Array(size);
  const plate = new Int32Array(size);
  const elevation = new Float32Array(size);
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const sy = Math.max(0, Math.min(world.grid.height - 1, v * world.grid.height - 0.5));
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const sx = u * world.grid.width - 0.5;
      const id = y * width + x;
      const h = sampleBilinear(world.grid, world.grid.elev, sx, sy);
      land[id] = h >= world.seaLevel ? 1 : 0;
      plate[id] = sampleNearest(world.grid, world.grid.plate, sx, sy);
      elevation[id] = h - world.seaLevel;
    }
  }
  return { land, plate, elevation };
}

function isGraphBackedGrid(grid) {
  return Boolean(grid.topologyOptions?.graphBacked || grid.topologyKind === "cubed-sphere");
}

function sampleBilinear(grid, field, x, y) {
  const sx = wrapX(grid.width, x);
  const sy = Math.max(0, Math.min(grid.height - 1.001, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = wrapX(grid.width, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const a = field[y0 * grid.width + x0] * (1 - tx) + field[y0 * grid.width + x1] * tx;
  const b = field[y1 * grid.width + x0] * (1 - tx) + field[y1 * grid.width + x1] * tx;
  return a * (1 - ty) + b * ty;
}

function sampleNearest(grid, field, x, y) {
  const sx = Math.round(wrapX(grid.width, x));
  const sy = Math.max(0, Math.min(grid.height - 1, Math.round(y)));
  return field[sy * grid.width + wrapX(grid.width, sx)];
}

function wrapX(width, x) {
  return ((x % width) + width) % width;
}

function measureMismatch(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff / a.length;
}

function measureRmse(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

function measureCoastline(land, width, height) {
  let edges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const right = y * width + wrapX(width, x + 1);
      if (land[id] !== land[right]) edges += 1;
      if (y + 1 < height && land[id] !== land[id + width]) edges += 1;
    }
  }
  return edges / land.length;
}

function measureFeatureStats(grid) {
  const fields = {
    mountainBelt: grid.mountainBelt,
    trench: grid.trench,
    ridge: grid.ridge,
    rift: grid.rift,
    islandArc: grid.islandArc,
    basin: grid.basin,
  };
  const result = {};
  for (const [name, field] of Object.entries(fields)) {
    let sum = 0;
    let weight = 0;
    let max = 0;
    let covered = 0;
    let boundaryCovered = 0;
    for (let i = 0; i < grid.size; i += 1) {
      const area = metricArea(grid, i);
      const v = field[i];
      sum += v * area;
      weight += area;
      if (v > max) max = v;
      if (v > 0.05) {
        covered += area;
        if (grid.boundaryDistance[i] === 0) boundaryCovered += area;
      }
    }
    result[name] = {
      average: sum / Math.max(weight, Number.EPSILON),
      max,
      coverage: covered / Math.max(weight, Number.EPSILON),
      boundaryZeroShare: covered ? boundaryCovered / covered : 0,
    };
  }
  return result;
}

function measureCrustStats(grid) {
  let oceanic = 0;
  let continental = 0;
  let transitional = 0;
  let oceanAgeSum = 0;
  let oldOcean = 0;
  let sedimentSum = 0;
  let basinSum = 0;
  let inactiveOrogeny = 0;
  let totalAreaValue = 0;
  const fields = {
    crustThickness: measureFieldStats(grid.crustThickness, grid.size),
    crustAge: measureFieldStats(grid.crustAge, grid.size),
    orogeny: measureFieldStats(grid.orogeny, grid.size),
    sediment: measureFieldStats(grid.sediment, grid.size),
    erosionSource: measureFieldStats(grid.erosionSource, grid.size),
    sedimentFlux: measureFieldStats(grid.sedimentFlux, grid.size),
    sedimentSink: measureFieldStats(grid.sedimentSink, grid.size),
    sedimentCapacity: measureFieldStats(grid.sedimentCapacity, grid.size),
    sedimentCompaction: measureFieldStats(grid.sedimentCompaction, grid.size),
    sedimentLoadSubsidence: measureFieldStats(grid.sedimentLoadSubsidence, grid.size),
    isostaticBase: measureFieldStats(grid.isostaticBase, grid.size),
    crustBuoyancy: measureFieldStats(grid.crustBuoyancy, grid.size),
    densitySubsidence: measureFieldStats(grid.densitySubsidence, grid.size),
    lithosphereCooling: measureFieldStats(grid.lithosphereCooling, grid.size),
    isostaticResidual: measureFieldStats(grid.isostaticResidual, grid.size),
    basin: measureFieldStats(grid.basin, grid.size),
  };
  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    totalAreaValue += area;
    if (grid.crustType[i] === 0) {
      oceanic += area;
      oceanAgeSum += grid.crustAge[i] * area;
      if (grid.crustAge[i] > 0.65) oldOcean += area;
    } else if (grid.crustType[i] === 1) {
      continental += area;
    } else if (grid.crustType[i] === 2) {
      transitional += area;
    }
    sedimentSum += grid.sediment[i] * area;
    basinSum += grid.basin[i] * area;
    if (grid.orogeny[i] > 0.05 && grid.boundaryInfluence[i] < 0.2) inactiveOrogeny += area;
  }
  return {
    oceanicRatio: oceanic / Math.max(totalAreaValue, Number.EPSILON),
    continentalRatio: continental / Math.max(totalAreaValue, Number.EPSILON),
    transitionalRatio: transitional / Math.max(totalAreaValue, Number.EPSILON),
    averageOceanAge: oceanic ? oceanAgeSum / oceanic : 0,
    oldOceanRatio: oceanic ? oldOcean / oceanic : 0,
    averageSediment: sedimentSum / Math.max(totalAreaValue, Number.EPSILON),
    averageBasin: basinSum / Math.max(totalAreaValue, Number.EPSILON),
    inactiveOrogenyCoverage: inactiveOrogeny / Math.max(totalAreaValue, Number.EPSILON),
    fields,
  };
}

function measureOceanAgeDiagnostics(world) {
  const { grid, seaLevel } = world;
  let count = 0;
  let ageSum = 0;
  let depthSum = 0;
  let ageSq = 0;
  let depthSq = 0;
  let ageDepth = 0;
  let youngCount = 0;
  let oldCount = 0;
  let youngDepthSum = 0;
  let oldDepthSum = 0;
  let ridgeOcean = 0;
  let ridgeReset = 0;
  let termCount = 0;
  let ageSubsidenceSum = 0;
  let thicknessBuoyancySum = 0;
  let sedimentFillSum = 0;
  let ridgeUpliftSum = 0;
  let trenchDepressionSum = 0;

  for (let i = 0; i < grid.size; i += 1) {
    if (grid.crustType[i] !== 0) continue;
    const age = grid.crustAge[i];
    const depth = Math.max(0, seaLevel - grid.elev[i]);
    count += 1;
    ageSum += age;
    depthSum += depth;
    ageSq += age * age;
    depthSq += depth * depth;
    ageDepth += age * depth;
    if (age < 0.18) {
      youngCount += 1;
      youngDepthSum += depth;
    }
    if (age > 0.72) {
      oldCount += 1;
      oldDepthSum += depth;
    }
    if (grid.ridge[i] > 0.08 || grid.ridgeDistance[i] === 0) {
      ridgeOcean += 1;
      if (age < 0.08) ridgeReset += 1;
    }
    termCount += 1;
    ageSubsidenceSum += grid.ageSubsidence[i];
    thicknessBuoyancySum += grid.thicknessBuoyancy[i];
    sedimentFillSum += grid.sedimentFill[i];
    ridgeUpliftSum += grid.ridgeUplift[i];
    trenchDepressionSum += grid.trenchDepression[i];
  }

  const covariance = count ? ageDepth / count - (ageSum / count) * (depthSum / count) : 0;
  const ageVar = count ? ageSq / count - (ageSum / count) ** 2 : 0;
  const depthVar = count ? depthSq / count - (depthSum / count) ** 2 : 0;
  return {
    depthAgeCorrelation: ageVar > 0 && depthVar > 0 ? covariance / Math.sqrt(ageVar * depthVar) : 0,
    ridgeAgeResetShare: ridgeOcean ? ridgeReset / ridgeOcean : 0,
    youngOceanDepthMean: youngCount ? youngDepthSum / youngCount : 0,
    oldOceanDepthMean: oldCount ? oldDepthSum / oldCount : 0,
    ageBandStraightness: measureAgeBandStraightness(grid),
    oceanDepthTerms: {
      ageSubsidenceMean: termCount ? ageSubsidenceSum / termCount : 0,
      thicknessBuoyancyMean: termCount ? thicknessBuoyancySum / termCount : 0,
      sedimentFillMean: termCount ? sedimentFillSum / termCount : 0,
      ridgeUpliftMean: termCount ? ridgeUpliftSum / termCount : 0,
      trenchDepressionMean: termCount ? trenchDepressionSum / termCount : 0,
    },
  };
}

function measureRiftDiagnostics(world) {
  const { grid } = world;
  const histogram = Array.from({ length: 6 }, () => 0);
  let histogramTotal = 0;
  let continentalRift = 0;
  let transitionalRift = 0;
  let transitionalStage = 0;
  let oceanicRift = 0;
  let proto = 0;
  let protoConnected = 0;
  let belowSeaRift = 0;
  let unconnectedBelowSeaRift = 0;
  let riftCoast = 0;
  let riftNearBoundaryCoast = 0;

  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    const stage = grid.riftStage[i] ?? 0;
    histogramTotal += area;
    if (stage >= 0 && stage < histogram.length) histogram[stage] += area;
    if (stage > 0 && grid.crustType[i] === 1) continentalRift += area;
    if (stage > 0 && grid.crustType[i] === 2) transitionalRift += area;
    if (stage >= 3) transitionalStage += area;
    if (stage > 0 && grid.crustType[i] === 0) oceanicRift += area;
    if (stage === 4) {
      proto += area;
      if (grid.externalSeaMask[i]) protoConnected += area;
    }
    if (stage > 0 && grid.elev[i] < world.seaLevel) {
      belowSeaRift += area;
      if (!grid.externalSeaMask[i]) unconnectedBelowSeaRift += area;
    }
  }

  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (!grid.riftStage[id]) continue;
    let coast = false;
    forEachNeighbor4(topology, id, (nid) => {
      if ((grid.elev[nid] < world.seaLevel) !== (grid.elev[id] < world.seaLevel)) coast = true;
    });
    if (!coast) continue;
    const area = metricArea(grid, id);
    riftCoast += area;
    if (grid.boundaryDistance[id] <= 2) riftNearBoundaryCoast += area;
  }

  return {
    riftStageHistogram: histogram.map((count) => count / Math.max(histogramTotal, Number.EPSILON)),
    continentalRiftToTransitionalRate: continentalRift ? transitionalRift / (continentalRift + transitionalRift) : 0,
    transitionalToOceanicRate: transitionalStage ? oceanicRift / (transitionalStage + oceanicRift) : 0,
    protoOceanConnectedShare: proto ? protoConnected / proto : 0,
    unconnectedBelowSeaRiftShare: belowSeaRift ? unconnectedBelowSeaRift / belowSeaRift : 0,
    closedBasinCount: maxInt(grid.closedBasinId),
    inlandWaterCandidateShare: share(grid.inlandWaterCandidate),
    riftCoastBoundaryShare: riftCoast ? riftNearBoundaryCoast / riftCoast : 0,
  };
}

function measureMarginDiagnostics(world) {
  const { grid, seaLevel } = world;
  const coastDistance = measureCoastDistance(grid, seaLevel);
  let passive = 0;
  let passiveBoundary = 0;
  let passiveActive = 0;
  let nearCoastSea = 0;
  let nearCoastShallow = 0;
  let shelfSum = 0;
  let shelfCount = 0;
  let coastGradientSum = 0;
  let coastGradientCount = 0;
  let slope = 0;
  let rise = 0;
  let abyssal = 0;
  let abyssalRuggedness = 0;
  let wedge = 0;
  let closedBasin = 0;
  let closedBasinMargin = 0;

  for (let i = 0; i < grid.size; i += 1) {
    const pm = grid.passiveMargin[i] ?? 0;
    if (pm > 0.05) {
      passive += 1;
      if (grid.boundaryInfluence[i] > 0.25) passiveBoundary += 1;
      if (grid.boundaryInfluence[i] > 0.35 || grid.ridge[i] > 0.2 || grid.trench[i] > 0.2) passiveActive += 1;
    }
    if (grid.elev[i] < seaLevel && coastDistance[i] <= 8) {
      nearCoastSea += 1;
      if (seaLevel - grid.elev[i] < 0.08) nearCoastShallow += 1;
    }
    if ((grid.continentalShelf[i] ?? 0) > 0.05) {
      shelfSum += grid.continentalShelf[i];
      shelfCount += 1;
    }
    if (coastDistance[i] <= 3) {
      coastGradientSum += localRuggedness(grid, i, seaLevel);
      coastGradientCount += 1;
    }
    if ((grid.continentalSlope[i] ?? 0) > 0.05) slope += 1;
    if ((grid.continentalRise[i] ?? 0) > 0.05) rise += 1;
    if ((grid.sedimentWedge[i] ?? 0) > 0.05) wedge += 1;
    if ((grid.abyssalPlain[i] ?? 0) > 0.05) {
      abyssal += 1;
      abyssalRuggedness += localRuggedness(grid, i, seaLevel);
    }
    if (grid.inlandWaterCandidate[i]) {
      closedBasin += 1;
      if (pm > 0.05) closedBasinMargin += 1;
    }
  }

  return {
    passiveMarginCoverage: passive / grid.size,
    passiveMarginBoundaryShare: passive ? passiveBoundary / passive : 0,
    nearCoastShallowSeaShare: nearCoastSea ? nearCoastShallow / nearCoastSea : 0,
    shelfWidthMean: shelfCount ? shelfSum / shelfCount : 0,
    coastDepthGradient: coastGradientCount ? coastGradientSum / coastGradientCount : 0,
    continentalSlopeCoverage: slope / grid.size,
    continentalRiseCoverage: rise / grid.size,
    abyssalPlainCoverage: abyssal / grid.size,
    abyssalPlainFlatness: abyssal ? abyssalRuggedness / abyssal : 0,
    sedimentWedgeCoverage: wedge / grid.size,
    closedBasinMisclassifiedAsMarginShare: closedBasin ? closedBasinMargin / closedBasin : 0,
    activeBoundaryMisclassifiedAsPassiveMarginShare: passive ? passiveActive / passive : 0,
  };
}

function measureTransformDiagnostics(world) {
  const { grid } = world;
  const ageSplit = measureAgeBandStraightnessSplit(grid);
  let activeSignalSum = 0;
  let activeSignalCount = 0;
  let inactiveSignalSum = 0;
  let inactiveSignalCount = 0;
  let fractureContribution = 0;
  let fractureCount = 0;
  let straightRisk = 0;
  let straightRiskCount = 0;
  let abyssalSuppression = 0;
  let abyssalCount = 0;
  let inactiveOceanicMemory = 0;
  let inactiveOceanicCount = 0;

  for (let i = 0; i < grid.size; i += 1) {
    if (grid.activeTransform[i] > 0.05) {
      activeSignalSum += grid.activeTransform[i];
      activeSignalCount += 1;
    }
    if (grid.transformMemory[i] > 0.05 && grid.activeTransform[i] <= 0.01) {
      inactiveSignalSum += grid.inactiveBoundaryRelief[i];
      inactiveSignalCount += 1;
    }
    if (grid.fractureZoneMemory[i] > 0.05) {
      fractureContribution += Math.abs(grid.oldBoundaryCorrelation[i]);
      fractureCount += 1;
    }
    if (grid.ageBandStraightnessRisk[i] > 0.05) {
      straightRisk += grid.ageBandStraightnessRisk[i];
      straightRiskCount += 1;
    }
    if (grid.fractureZoneMemory[i] > 0.05 && grid.abyssalPlain[i] > 0.05) {
      abyssalSuppression += grid.oldBoundaryCorrelation[i];
      abyssalCount += 1;
    }
    if (grid.crustType[i] === 0 && grid.boundaryInfluence[i] < 0.12 && grid.transformMemory[i] > 0.05) {
      inactiveOceanicMemory += grid.inactiveBoundaryRelief[i];
      inactiveOceanicCount += 1;
    }
  }

  const activeRelief = activeSignalCount ? activeSignalSum / activeSignalCount : 0;
  const inactiveRelief = inactiveSignalCount ? inactiveSignalSum / inactiveSignalCount : 0;
  return {
    activeTransformCoverage: coverage(grid.activeTransform, 0.05),
    transformMemoryCoverage: coverage(grid.transformMemory, 0.05),
    fractureZoneMemoryCoverage: coverage(grid.fractureZoneMemory, 0.05),
    inactiveTransformReliefMean: inactiveOceanicCount ? inactiveOceanicMemory / inactiveOceanicCount : 0,
    fractureZoneElevationContribution: fractureCount ? fractureContribution / fractureCount : 0,
    oceanicStraightReliefDecay: inactiveOceanicCount ? inactiveOceanicMemory / inactiveOceanicCount : 0,
    oldBoundaryReliefCorrelation: average(grid.oldBoundaryCorrelation),
    activeVsInactiveBoundaryReliefRatio: activeRelief / Math.max(0.000001, inactiveRelief),
    ageBandStraightnessNearRidge: ageSplit.nearRidge,
    ageBandStraightnessInactive: ageSplit.inactive,
    ageBandStraightnessFractureZone: ageSplit.fractureZone,
    abyssalPlainFractureSuppression: abyssalCount ? abyssalSuppression / abyssalCount : 0,
    ageBandStraightnessRiskMean: straightRiskCount ? straightRisk / straightRiskCount : 0,
  };
}

function measureBoundaryDiagnostics(grid) {
  let active = 0;
  let densitySum = 0;
  let noisy = 0;
  let checker = 0;
  let islandNoise = 0;
  let featureOnNoisy = 0;
  let featureCount = 0;
  for (let i = 0; i < grid.size; i += 1) {
    if (grid.activeBoundary[i]) active += 1;
    densitySum += grid.boundaryDensity[i] ?? 0;
    if (grid.noisyBoundaryPatch[i]) noisy += 1;
    checker += grid.plateCheckerboard[i] ?? 0;
    if (isPlateIslandNoise(grid, i)) islandNoise += 1;
    const feature = Math.max(grid.mountainBelt[i], grid.trench[i], grid.ridge[i], grid.rift[i], grid.basin[i], grid.islandArc[i]);
    if (feature > 0.05) {
      featureCount += 1;
      if (grid.noisyBoundaryPatch[i]) featureOnNoisy += 1;
    }
  }
  return {
    plateCheckerboardScore: checker / grid.size,
    activeBoundaryCoverage: active / grid.size,
    localBoundaryDensityMean: densitySum / grid.size,
    noisyBoundaryPatchCoverage: noisy / grid.size,
    plateIslandNoiseShare: islandNoise / grid.size,
    featureOnNoisyBoundaryShare: featureCount ? featureOnNoisy / featureCount : 0,
  };
}

function measureOrogenyDiagnostics(world) {
  const { grid } = world;
  return {
    activeOrogenyCoverage: coverage(grid.activeOrogeny, 0.05),
    oldOrogenyCoverage: coverage(grid.oldOrogeny, 0.05),
    oldOrogenyWidth: widthProxy(grid, grid.oldOrogeny, 0.05),
    orogenyAgeMean: averageWhere(grid.orogenyAge, (i) => grid.oldOrogeny[i] > 0.03 || grid.activeOrogeny[i] > 0.03),
    orogenyErosionMean: average(grid.orogenyErosion),
    orogenicSedimentBudget: average(grid.orogenicSedimentSupply) / Math.max(0.000001, average(grid.sediment)),
    forelandBasinCoverage: coverage(grid.forelandBasin, 0.05),
    newVsOldMountainReliefRatio: averageWhere(grid.mountainHeight, (i) => grid.activeOrogeny[i] > 0.05) / Math.max(0.000001, averageWhere(grid.mountainHeight, (i) => grid.oldOrogeny[i] > 0.05 && grid.activeOrogeny[i] <= 0.02)),
    mountainAxisCurvature: measureMountainAxisCurvature(grid),
    orographicBarrierCoverage: coverage(grid.orographicBarrier, 0.02),
    mountainBoundaryZeroShare: conditionalShare(grid.mountainBelt, (i) => grid.mountainBelt[i] > 0.05, (i) => grid.boundaryDistance[i] === 0),
    oldOrogenyBoundaryShare: conditionalShare(grid.oldOrogeny, (i) => grid.oldOrogeny[i] > 0.05, (i) => grid.boundaryDistance[i] <= 1),
  };
}

function measureAxisDiagnostics(world) {
  const { grid } = world;
  return {
    axisBoundaryDependency: averageWhere(grid.axisBoundaryDependency, (i) => grid.tectonicAxis[i] > axisDiagnosticThreshold(grid)),
    axisNoisyBoundaryShare: conditionalShare(grid.tectonicAxis, (i) => grid.tectonicAxis[i] > axisDiagnosticThreshold(grid), (i) => grid.noisyBoundaryPatch[i]),
    axisSegmentLengthMean: axisSegmentLengthMean(grid),
    axisCurvatureMean: averageWhere(grid.axisCurvature, (i) => grid.tectonicAxis[i] > axisDiagnosticThreshold(grid)),
    axisContinuityMean: averageWhere(grid.axisContinuity, (i) => grid.tectonicAxis[i] > axisDiagnosticThreshold(grid)),
    mountainHeightBlockiness: averageWhere(grid.mountainHeightBlockiness, (i) => grid.mountainHeight[i] > 0.02),
    orographicBarrierContinuity: averageWhere(grid.orographicBarrierContinuity, (i) => grid.orographicBarrier[i] > 0.02),
    activeFeatureOnNoisyBoundaryShare: measureBoundaryDiagnostics(grid).featureOnNoisyBoundaryShare,
    ridgeAxisBoundaryDependency: averageWhere(grid.axisBoundaryDependency, (i) => grid.ridgeAxis[i] > axisDiagnosticThreshold(grid)),
    trenchAxisBoundaryDependency: averageWhere(grid.axisBoundaryDependency, (i) => grid.trenchAxis[i] > axisDiagnosticThreshold(grid)),
    riftAxisBoundaryDependency: averageWhere(grid.axisBoundaryDependency, (i) => grid.riftAxis[i] > axisDiagnosticThreshold(grid)),
  };
}

function measureReliefDiagnostics(world) {
  const { grid } = world;
  const diagnostics = world.reliefDiagnostics ?? {};
  return {
    globalElevationStd: diagnostics.globalElevationStd ?? 0,
    landElevationStd: diagnostics.landElevationStd ?? 0,
    oceanElevationStd: diagnostics.oceanElevationStd ?? 0,
    hypsometricSpread: diagnostics.hypsometricSpread ?? 0,
    landReliefSpread: diagnostics.landReliefSpread ?? 0,
    oceanReliefSpread: diagnostics.oceanReliefSpread ?? 0,
    flatLandShare: diagnostics.flatLandShare ?? share(grid.flatLandMask),
    largePlainShare: diagnostics.largePlainShare ?? share(grid.largePlainMask),
    seaLevelSensitivity: diagnostics.seaLevelSensitivity ?? average(grid.seaLevelSensitivity),
    coastInstabilityRisk: diagnostics.coastInstabilityRisk ?? 0,
    reliefDeficit: diagnostics.reliefDeficit ?? average(grid.reliefDeficit),
    normalizedReliefDeficit: diagnostics.normalizedReliefDeficit ?? 0,
    flatWorldRisk: Boolean(diagnostics.flatWorldRisk),
    tectonicReliefSupplyMean: diagnostics.tectonicReliefSupplyMean ?? average(grid.tectonicReliefSupply),
    isostaticReliefSupplyMean: diagnostics.isostaticReliefSupplyMean ?? average(grid.isostaticReliefSupply),
    erosionFlatteningPressureMean: diagnostics.erosionFlatteningPressureMean ?? average(grid.erosionFlatteningPressure),
    sedimentSmoothingPressureMean: diagnostics.sedimentSmoothingPressureMean ?? average(grid.sedimentSmoothingPressure),
    drainageGradientPotential: diagnostics.drainageGradientPotential ?? 0,
    orographicReliefPotential: diagnostics.orographicReliefPotential ?? 0,
    planetaryReliefMean: average(grid.planetaryRelief),
  };
}

function measureGeologicSeaLevelDiagnostics(world) {
  const { grid } = world;
  const diagnostics = world.geologicSeaLevelDiagnostics ?? {};
  return {
    baseSeaLevel: diagnostics.baseSeaLevel ?? world.baseSeaLevel ?? world.seaLevel ?? 0,
    seaLevel: diagnostics.seaLevel ?? world.seaLevel ?? 0,
    geologicSeaLevelOffset: diagnostics.geologicSeaLevelOffset ?? world.geologicSeaLevelOffset ?? 0,
    targetGeologicSeaLevelOffset: diagnostics.targetGeologicSeaLevelOffset ?? 0,
    seaLevelChangeRate: diagnostics.seaLevelChangeRate ?? 0,
    youngOceanShare: diagnostics.youngOceanShare ?? share(grid.isYoungOcean),
    oldOceanShare: diagnostics.oldOceanShare ?? conditionalShare(grid.crustType, (i) => grid.crustType[i] === 0, (i) => grid.crustAge[i] > 0.62),
    ridgeVolumeSignalMean: diagnostics.ridgeVolumeSignalMean ?? average(grid.ridgeVolumeSignal),
    oldOceanCapacitySignalMean: diagnostics.oldOceanCapacitySignalMean ?? average(grid.oldOceanCapacitySignal),
    sedimentDisplacementSignalMean: diagnostics.sedimentDisplacementSignalMean ?? average(grid.sedimentDisplacementSignal),
    trenchCapacitySignalMean: diagnostics.trenchCapacitySignalMean ?? average(grid.trenchCapacitySignal),
    ridgeVolumeNormalized: diagnostics.ridgeVolumeNormalized ?? 0,
    youngOceanNormalized: diagnostics.youngOceanNormalized ?? 0,
    oldOceanCapacityNormalized: diagnostics.oldOceanCapacityNormalized ?? 0,
    sedimentDisplacementNormalized: diagnostics.sedimentDisplacementNormalized ?? 0,
    trenchCapacityNormalized: diagnostics.trenchCapacityNormalized ?? 0,
    capacityBalance: diagnostics.capacityBalance ?? 0,
    oceanBasinCapacitySignalMean: diagnostics.oceanBasinCapacitySignalMean ?? diagnostics.capacityBalance ?? 0,
    coastalFlipRisk: diagnostics.coastalFlipRisk ?? 0,
    coastalSensitivityMean: diagnostics.coastalSensitivityMean ?? average(grid.coastalSensitivity),
    seaLevelCouplingStrength: diagnostics.seaLevelCouplingStrength ?? 0,
    landShareBeforeGeologicOffset: diagnostics.landShareBeforeGeologicOffset ?? 0,
    landShareAfterGeologicOffset: diagnostics.landShareAfterGeologicOffset ?? 0,
    geologicSeaLevelLandShareDelta: diagnostics.geologicSeaLevelLandShareDelta ?? 0,
  };
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

function coverage(field, threshold) {
  let covered = 0;
  let total = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricArea(currentGrid, i);
    total += area;
    if (field[i] > threshold) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function average(field) {
  let total = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricArea(currentGrid, i);
    total += field[i] * area;
    weight += area;
  }
  return total / Math.max(weight, Number.EPSILON);
}

function averageWhere(field, include) {
  let total = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    const area = metricArea(currentGrid, i);
    total += field[i] * area;
    weight += area;
  }
  return weight ? total / weight : 0;
}

function conditionalShare(field, include, predicate) {
  let total = 0;
  let matched = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    const area = metricArea(currentGrid, i);
    total += area;
    if (predicate(i)) matched += area;
  }
  return total ? matched / total : 0;
}

function widthProxy(grid, field, threshold) {
  let covered = 0;
  let edge = 0;
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (field[id] <= threshold) continue;
    covered += metricArea(grid, id);
    let nearEmpty = false;
    forEachAnyNeighbor(topology, id, (nid) => {
      if (field[nid] <= threshold) nearEmpty = true;
    });
    if (nearEmpty) edge += metricArea(grid, id);
  }
  return edge ? covered / edge : 0;
}

function measureMountainAxisCurvature(grid) {
  let total = 0;
  let bent = 0;
  const topology = topologyForGrid(grid);
  const threshold = axisDiagnosticThreshold(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.mountainAxis[id] <= threshold) continue;
    const area = metricArea(grid, id);
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

function measureCoastDistance(grid, seaLevel) {
  const topology = topologyForGrid(grid);
  const distance = new Float32Array(grid.size);
  distance.fill(Number.POSITIVE_INFINITY);
  const queue = new Int32Array(grid.size);
  let head = 0;
  let tail = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const land = grid.elev[id] >= seaLevel;
    let coast = false;
    forEachNeighbor4(topology, id, (nid) => {
      if ((grid.elev[nid] >= seaLevel) !== land) coast = true;
    });
    if (!coast) continue;
    distance[id] = 0;
    queue[tail++] = id;
  }
  while (head < tail) {
    const id = queue[head++];
    const next = distance[id] + 1;
    forEachNeighbor4(topology, id, (nid) => {
      if (next >= distance[nid]) return;
      distance[nid] = next;
      queue[tail++] = nid;
    });
  }
  return distance;
}

function localRuggedness(grid, id, seaLevel) {
  const topology = topologyForGrid(grid);
  const center = grid.elev[id] - seaLevel;
  let sum = 0;
  let count = 0;
  forEachNeighbor4(topology, id, (nid) => {
    sum += Math.abs(center - (grid.elev[nid] - seaLevel));
    count += 1;
  });
  return count ? sum / count : 0;
}

function measureFieldStats(field, size) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let coverage = 0;
  for (let i = 0; i < size; i += 1) {
    const v = field[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v > 0.05) coverage += 1;
  }
  return { average: sum / size, min, max, coverage: coverage / size };
}

function measureGeologyRisks(world) {
  const { grid, seaLevel } = world;
  return {
    coastBoundaryShare: measureCoastBoundaryShare(grid, seaLevel),
    oldBoundarySeafloorSignal: measureOldBoundarySeafloorSignal(grid, seaLevel),
    inlandBasinRisk: measureInlandBasinRisk(grid, seaLevel),
    longStraightFeatureSignal: measureLongStraightFeatureSignal(grid),
    sedimentStraightnessRisk: world.sedimentBudgetDiagnostics?.sedimentStraightnessRisk ?? 0,
    sedimentSeaFillRisk: world.sedimentBudgetDiagnostics?.sedimentSeaFillRisk ?? 0,
    sedimentOverfillShare: world.sedimentBudgetDiagnostics?.sedimentOverfillShare ?? 0,
  };
}

function measureHydrologyDiagnostics(world) {
  return getHydrologyInputs(world, { diagnostics: hydrologyDiagnosticsMode }).hydrologyDiagnostics ?? {};
}

function measureSedimentBudgetDiagnostics(world) {
  const d = world.sedimentBudgetDiagnostics ?? {};
  return {
    erosionSourceMean: d.erosionSourceMean ?? average(world.grid.erosionSource),
    erosionSourceTotal: d.erosionSourceTotal ?? sumField(world.grid.erosionSource),
    depositionTotal: d.depositionTotal ?? sumField(world.grid.sedimentSink),
    sedimentFluxMean: d.sedimentFluxMean ?? average(world.grid.sedimentFlux),
    sedimentSinkMean: d.sedimentSinkMean ?? average(world.grid.sedimentSink),
    sedimentCapacityMean: d.sedimentCapacityMean ?? average(world.grid.sedimentCapacity),
    sedimentCompactionMean: d.sedimentCompactionMean ?? average(world.grid.sedimentCompaction),
    sedimentLoadSubsidenceMean: d.sedimentLoadSubsidenceMean ?? average(world.grid.sedimentLoadSubsidence),
    sedimentBudgetError: d.sedimentBudgetError ?? average(world.grid.sedimentBudgetError),
    sedimentResidualDissipation: d.sedimentResidualDissipation ?? 0,
    sedimentResidualFlux: d.sedimentResidualFlux ?? 0,
    sedimentMassBefore: d.sedimentMassBefore ?? 0,
    sedimentMassAfter: d.sedimentMassAfter ?? sumField(world.grid.sediment),
    sedimentMassDelta: d.sedimentMassDelta ?? 0,
    mountainErosionShare: d.mountainErosionShare ?? 0,
    passiveMarginDepositionShare: d.passiveMarginDepositionShare ?? 0,
    basinDepositionShare: d.basinDepositionShare ?? 0,
    trenchForearcDepositionShare: d.trenchForearcDepositionShare ?? 0,
    inlandBasinDepositionShare: d.inlandBasinDepositionShare ?? 0,
    sedimentOverfillShare: d.sedimentOverfillShare ?? 0,
    sedimentPatchiness: d.sedimentPatchiness ?? 0,
    sedimentStraightnessRisk: d.sedimentStraightnessRisk ?? 0,
    sedimentSeaFillRisk: d.sedimentSeaFillRisk ?? 0,
    sedimentShelfConcentration: d.sedimentShelfConcentration ?? 0,
    sedimentAbyssalConcentration: d.sedimentAbyssalConcentration ?? 0,
  };
}

function sumField(field) {
  let total = 0;
  for (let i = 0; i < field.length; i += 1) total += field[i] * metricArea(currentGrid, i);
  return total;
}

function measureCoastBoundaryShare(grid, seaLevel) {
  let coast = 0;
  let nearBoundary = 0;
  let exactBoundary = 0;
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    const land = grid.elev[id] >= seaLevel;
    let isCoast = false;
    forEachNeighbor4(topology, id, (nid) => {
      if ((grid.elev[nid] >= seaLevel) !== land) isCoast = true;
    });
    if (!isCoast) continue;
    const area = metricArea(grid, id);
    coast += area;
    if (grid.boundaryDistance[id] <= 2) nearBoundary += area;
    if (grid.boundaryDistance[id] === 0) exactBoundary += area;
  }
  return {
    coastCoverage: coast / Math.max(totalArea(grid), Number.EPSILON),
    nearBoundaryShare: coast ? nearBoundary / coast : 0,
    exactBoundaryShare: coast ? exactBoundary / coast : 0,
  };
}

function measureOldBoundarySeafloorSignal(grid, seaLevel) {
  let sea = 0;
  let inactiveBoundarySea = 0;
  let shallowInactiveBoundary = 0;
  let oldFeatureSum = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const relative = grid.elev[i] - seaLevel;
    if (relative >= 0) continue;
    sea += 1;
    oldFeatureSum += Math.max(grid.orogeny[i], grid.sediment[i], grid.basin[i]);
    const inactiveBoundary = grid.boundaryInfluence[i] < 0.08 && grid.boundaryDistance[i] <= 2;
    if (!inactiveBoundary) continue;
    inactiveBoundarySea += 1;
    if (relative > -0.08) shallowInactiveBoundary += 1;
  }
  return {
    inactiveBoundarySeaShare: sea ? inactiveBoundarySea / sea : 0,
    shallowInactiveBoundaryShare: inactiveBoundarySea ? shallowInactiveBoundary / inactiveBoundarySea : 0,
    averageOldFeatureOnSeafloor: sea ? oldFeatureSum / sea : 0,
  };
}

function measureInlandBasinRisk(grid, seaLevel) {
  const topology = topologyForGrid(grid);
  const visited = new Uint8Array(grid.size);
  const queue = new Int32Array(grid.size);
  let belowSea = 0;
  let componentCount = 0;
  let smallComponentCount = 0;
  let inlandCandidates = 0;
  let basinCandidates = 0;
  let sedimentedCandidates = 0;
  const smallLimit = Math.max(24, Math.floor(grid.size * 0.0025));

  for (let start = 0; start < grid.size; start += 1) {
    if (visited[start] || grid.elev[start] >= seaLevel) continue;
    componentCount += 1;
    let head = 0;
    let tail = 0;
    let count = 0;
    let basinCount = 0;
    let sedimentCount = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const id = queue[head++];
      count += 1;
      if (grid.basin[id] > 0.12) basinCount += 1;
      if (grid.sediment[id] > 0.08) sedimentCount += 1;
      forEachNeighbor4(topology, id, (nid) => {
        if (visited[nid] || grid.elev[nid] >= seaLevel) return;
        visited[nid] = 1;
        queue[tail++] = nid;
      });
    }
    belowSea += count;
    if (count <= smallLimit) {
      smallComponentCount += 1;
      inlandCandidates += count;
      basinCandidates += basinCount;
      sedimentedCandidates += sedimentCount;
    }
  }
  return {
    belowSeaRatio: belowSea / grid.size,
    waterComponentCount: componentCount,
    smallWaterComponentCount: smallComponentCount,
    inlandBelowSeaCandidateRatio: inlandCandidates / grid.size,
    basinCandidateShare: inlandCandidates ? basinCandidates / inlandCandidates : 0,
    sedimentedCandidateShare: inlandCandidates ? sedimentedCandidates / inlandCandidates : 0,
  };
}

function measureLongStraightFeatureSignal(grid) {
  let strong = 0;
  let straightish = 0;
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    const v = Math.max(grid.mountainBelt[id], grid.ridge[id], grid.trench[id]);
    if (v <= 0.08) continue;
    const area = metricArea(grid, id);
    strong += area;
    let neighborFeature = 0;
    forEachAnyNeighbor(topology, id, (nid) => {
      neighborFeature += Math.max(grid.mountainBelt[nid], grid.ridge[nid], grid.trench[nid]);
    });
    if (neighborFeature > 0.28) straightish += area;
  }
  return {
    strongFeatureCoverage: strong / Math.max(totalArea(grid), Number.EPSILON),
    straightishShare: strong ? straightish / strong : 0,
  };
}

function measureAgeBandStraightness(grid) {
  let band = 0;
  let straight = 0;
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.crustType[id] !== 0) continue;
    const center = Math.floor(grid.crustAge[id] * 10);
    let aligned = 0;
    forEachAnyNeighbor(topology, id, (nid) => {
      if (grid.crustType[nid] === 0 && Math.floor(grid.crustAge[nid] * 10) === center) aligned += 1;
    });
    if (aligned <= 0) continue;
    const area = metricArea(grid, id);
    band += area;
    if (aligned >= 2) straight += area;
  }
  return band ? straight / band : 0;
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
    const area = metricArea(grid, id);
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

function share(field) {
  let covered = 0;
  let total = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricArea(currentGrid, i);
    total += area;
    if (field[i]) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function forEachNeighbor4(topology, id, visit) {
  if (typeof topology.forEachNeighbor4 === "function") {
    topology.forEachNeighbor4(id, visit);
    return;
  }
  if (typeof topology.forEachNeighbor === "function") topology.forEachNeighbor(id, visit);
}

function forEachAnyNeighbor(topology, id, visit) {
  if (typeof topology.forEachNeighbor8 === "function") {
    topology.forEachNeighbor8(id, visit);
    return;
  }
  if (typeof topology.forEachNeighbor === "function") topology.forEachNeighbor(id, visit);
}

function metricArea(grid, id) {
  const area = grid?.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function totalArea(grid) {
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) total += metricArea(grid, id);
  return total;
}
