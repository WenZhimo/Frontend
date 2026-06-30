import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";

const params = {
  seedText: process.argv[2] ?? "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: process.argv[5] ?? "512x256",
  pipelineMode: process.argv[4] ?? "legacy",
};
const steps = Number(process.argv[3] ?? 200);

const world = createWorld(params);
let totalMs = 0;
for (let i = 0; i < steps; i += 1) {
  stepWorld(world);
  totalMs += world.lastStepMs;
}

let min = Infinity;
let max = -Infinity;
let extremeHigh = 0;
let extremeLow = 0;
for (const h of world.grid.elev) {
  if (h < min) min = h;
  if (h > max) max = h;
  if (h - world.seaLevel > 0.56) extremeHigh += 1;
  if (h - world.seaLevel < -0.45) extremeLow += 1;
}

console.log(JSON.stringify({
  seedText: params.seedText,
  steps,
  ageYears: world.ageYears,
  pipelineMode: params.pipelineMode,
  resolution: params.resolution,
  averageStepMs: totalMs / steps,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  seaLevel: world.seaLevel,
  averagePlateDriftCells: world.stats.avgPlateDrift,
  minElevation: min,
  maxElevation: max,
  extremeHighRatio: extremeHigh / world.grid.size,
  extremeLowRatio: extremeLow / world.grid.size,
  causalityPass: world.stats.causalityPass,
  avgConvergent: world.stats.avgConvergent,
  avgMountainConvergent: world.stats.avgMountainConvergent,
  avgInterior: world.stats.avgInterior,
  avgContinentalInterior: world.stats.avgContinentalInterior,
    featureStats: measureFeatureStats(world.grid),
    crustStats: measureCrustStats(world.grid),
    oceanAgeDiagnostics: measureOceanAgeDiagnostics(world),
    riftDiagnostics: measureRiftDiagnostics(world),
    marginDiagnostics: measureMarginDiagnostics(world),
    transformDiagnostics: measureTransformDiagnostics(world),
    boundaryDiagnostics: measureBoundaryDiagnostics(world.grid),
    geologyRisks: measureGeologyRisks(world),
}, null, 2));

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
    let max = 0;
    let covered = 0;
    let boundaryCovered = 0;
    for (let i = 0; i < grid.size; i += 1) {
      const v = field[i];
      sum += v;
      if (v > max) max = v;
      if (v > 0.05) {
        covered += 1;
        if (grid.boundaryDistance[i] === 0) boundaryCovered += 1;
      }
    }
    result[name] = {
      average: sum / grid.size,
      max,
      coverage: covered / grid.size,
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
  let oceanDepthSum = 0;
  let oceanDepthCount = 0;
  let oldOcean = 0;
  let orogenySum = 0;
  let orogenyMax = 0;
  let inactiveOrogeny = 0;
  let sedimentSum = 0;
  let basinSum = 0;
  const fieldStats = {
    crustThickness: measureFieldStats(grid.crustThickness, grid.size),
    crustAge: measureFieldStats(grid.crustAge, grid.size),
    orogeny: measureFieldStats(grid.orogeny, grid.size),
    sediment: measureFieldStats(grid.sediment, grid.size),
    basin: measureFieldStats(grid.basin, grid.size),
  };
  for (let i = 0; i < grid.size; i += 1) {
    if (grid.crustType[i] === 0) {
      oceanic += 1;
      oceanAgeSum += grid.crustAge[i];
      if (grid.crustAge[i] > 0.65) oldOcean += 1;
      oceanDepthSum += grid.elev[i];
      oceanDepthCount += 1;
    } else if (grid.crustType[i] === 1) {
      continental += 1;
    } else if (grid.crustType[i] === 2) {
      transitional += 1;
    }
    orogenySum += grid.orogeny[i];
    if (grid.orogeny[i] > orogenyMax) orogenyMax = grid.orogeny[i];
    if (grid.orogeny[i] > 0.05 && grid.boundaryInfluence[i] < 0.2) inactiveOrogeny += 1;
    sedimentSum += grid.sediment[i];
    basinSum += grid.basin[i];
  }
  return {
    oceanicRatio: oceanic / grid.size,
    continentalRatio: continental / grid.size,
    transitionalRatio: transitional / grid.size,
    averageOceanAge: oceanic ? oceanAgeSum / oceanic : 0,
    oldOceanRatio: oceanic ? oldOcean / oceanic : 0,
    averageOceanElevation: oceanDepthCount ? oceanDepthSum / oceanDepthCount : 0,
    averageOrogeny: orogenySum / grid.size,
    maxOrogeny: orogenyMax,
    inactiveOrogenyCoverage: inactiveOrogeny / grid.size,
    averageSediment: sedimentSum / grid.size,
    averageBasin: basinSum / grid.size,
    fields: fieldStats,
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
    const stage = grid.riftStage[i] ?? 0;
    if (stage >= 0 && stage < histogram.length) histogram[stage] += 1;
    if (stage > 0 && grid.crustType[i] === 1) continentalRift += 1;
    if (stage > 0 && grid.crustType[i] === 2) transitionalRift += 1;
    if (stage >= 3) transitionalStage += 1;
    if (stage > 0 && grid.crustType[i] === 0) oceanicRift += 1;
    if (stage === 4) {
      proto += 1;
      if (grid.externalSeaMask[i]) protoConnected += 1;
    }
    if (stage > 0 && grid.elev[i] < world.seaLevel) {
      belowSeaRift += 1;
      if (!grid.externalSeaMask[i]) unconnectedBelowSeaRift += 1;
    }
  }

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      if (!grid.riftStage[id]) continue;
      let coast = false;
      visitNeighbor4Ids(grid, x, y, (nid) => {
        if ((grid.elev[nid] < world.seaLevel) !== (grid.elev[id] < world.seaLevel)) coast = true;
      });
      if (!coast) continue;
      riftCoast += 1;
      if (grid.boundaryDistance[id] <= 2) riftNearBoundaryCoast += 1;
    }
  }

  return {
    riftStageHistogram: histogram.map((count) => count / grid.size),
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

function isPlateIslandNoise(grid, id) {
  const x = id % grid.width;
  const y = Math.floor(id / grid.width);
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  visitNeighbor8Ids(grid, x, y, (nid) => {
    if (grid.plate[nid] === current) same += 1;
    else different += 1;
  });
  return same <= 2 && different >= 5;
}

function visitNeighbor8Ids(grid, x, y, visit) {
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= grid.height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = ((x + dx) % grid.width + grid.width) % grid.width;
      visit(ny * grid.width + nx);
    }
  }
}

function coverage(field, threshold) {
  let count = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > threshold) count += 1;
  return count / field.length;
}

function average(field) {
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) sum += field[i];
  return sum / field.length;
}

function measureCoastDistance(grid, seaLevel) {
  const distance = new Float32Array(grid.size);
  distance.fill(Number.POSITIVE_INFINITY);
  const queue = new Int32Array(grid.size);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      const land = grid.elev[id] >= seaLevel;
      let coast = false;
      visitNeighbor4Ids(grid, x, y, (nid) => {
        if ((grid.elev[nid] >= seaLevel) !== land) coast = true;
      });
      if (!coast) continue;
      distance[id] = 0;
      queue[tail++] = id;
    }
  }
  while (head < tail) {
    const id = queue[head++];
    const x = id % grid.width;
    const y = Math.floor(id / grid.width);
    const next = distance[id] + 1;
    visitNeighbor4Ids(grid, x, y, (nid) => {
      if (next >= distance[nid]) return;
      distance[nid] = next;
      queue[tail++] = nid;
    });
  }
  return distance;
}

function localRuggedness(grid, id, seaLevel) {
  const x = id % grid.width;
  const y = Math.floor(id / grid.width);
  const center = grid.elev[id] - seaLevel;
  let sum = 0;
  let count = 0;
  visitNeighbor4Ids(grid, x, y, (nid) => {
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
  };
}

function measureCoastBoundaryShare(grid, seaLevel) {
  let coast = 0;
  let nearBoundary = 0;
  let exactBoundary = 0;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      const land = grid.elev[id] >= seaLevel;
      let isCoast = false;
      visitNeighbor4Ids(grid, x, y, (nid) => {
        if ((grid.elev[nid] >= seaLevel) !== land) isCoast = true;
      });
      if (!isCoast) continue;
      coast += 1;
      if (grid.boundaryDistance[id] <= 2) nearBoundary += 1;
      if (grid.boundaryDistance[id] === 0) exactBoundary += 1;
    }
  }
  return {
    coastCoverage: coast / grid.size,
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
      const x = id % grid.width;
      const y = Math.floor(id / grid.width);
      visitNeighbor4Ids(grid, x, y, (nid) => {
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
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      const v = Math.max(grid.mountainBelt[id], grid.ridge[id], grid.trench[id]);
      if (v <= 0.08) continue;
      strong += 1;
      const horizontal = featureAt(grid, x - 1, y) + featureAt(grid, x + 1, y);
      const vertical = featureAt(grid, x, y - 1) + featureAt(grid, x, y + 1);
      const diagA = featureAt(grid, x - 1, y - 1) + featureAt(grid, x + 1, y + 1);
      const diagB = featureAt(grid, x + 1, y - 1) + featureAt(grid, x - 1, y + 1);
      if (Math.max(horizontal, vertical, diagA, diagB) > 0.28) straightish += 1;
    }
  }
  return {
    strongFeatureCoverage: strong / grid.size,
    straightishShare: strong ? straightish / strong : 0,
  };
}

function measureAgeBandStraightness(grid) {
  let band = 0;
  let straight = 0;
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      if (grid.crustType[id] !== 0) continue;
      const center = Math.floor(grid.crustAge[id] * 10);
      const horizontal = sameAgeBand(grid, x - 1, y, center) + sameAgeBand(grid, x + 1, y, center);
      const vertical = sameAgeBand(grid, x, y - 1, center) + sameAgeBand(grid, x, y + 1, center);
      const diagA = sameAgeBand(grid, x - 1, y - 1, center) + sameAgeBand(grid, x + 1, y + 1, center);
      const diagB = sameAgeBand(grid, x + 1, y - 1, center) + sameAgeBand(grid, x - 1, y + 1, center);
      const aligned = Math.max(horizontal, vertical, diagA, diagB);
      if (aligned <= 0) continue;
      band += 1;
      if (aligned >= 2) straight += 1;
    }
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
  const id = y * grid.width + wrapX(grid.width, x);
  return grid.crustType[id] === 0 && Math.floor(grid.crustAge[id] * 10) === band ? 1 : 0;
}

function featureAt(grid, x, y) {
  if (y < 0 || y >= grid.height) return 0;
  const id = y * grid.width + wrapX(grid.width, x);
  return Math.max(grid.mountainBelt[id], grid.ridge[id], grid.trench[id]);
}

function visitNeighbor4Ids(grid, x, y, visit) {
  visit(y * grid.width + wrapX(grid.width, x - 1));
  visit(y * grid.width + wrapX(grid.width, x + 1));
  if (y > 0) visit((y - 1) * grid.width + x);
  if (y < grid.height - 1) visit((y + 1) * grid.width + x);
}

function wrapX(width, x) {
  return ((x % width) + width) % width;
}

function share(field) {
  let count = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i]) count += 1;
  return count / field.length;
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}
