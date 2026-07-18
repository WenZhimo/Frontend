import { CrustType } from "./crust.js";

export function updateIsostasy(world) {
  const { grid } = world;
  const {
    size,
    crustType,
    crustThickness,
    crustAge,
    crustDensity,
    sediment,
    sedimentFill,
    sedimentLoadSubsidence,
    ageSubsidence,
    thicknessBuoyancy,
    oceanDepthTerms,
    ridgeUplift,
    trenchDepression,
    isostaticBase,
    crustBuoyancy,
    densitySubsidence,
    lithosphereCooling,
    isostaticResidual,
    isostaticReliefSupply,
    elev,
  } = grid;

  for (let i = 0; i < size; i += 1) {
    const type = crustType[i];
    const continental = type === CrustType.CONTINENTAL;
    const transitional = type === CrustType.TRANSITIONAL;
    const oceanic = type === CrustType.OCEANIC;
    const ageNorm = clamp01(crustAge[i]);
    const sedimentSurfaceFill = saturatingFill(sediment[i], oceanic ? 0.062 : transitional ? 0.08 : 0.03, oceanic ? 1.7 : transitional ? 1.9 : 1.45);
    sedimentFill[i] = sedimentSurfaceFill;
    ridgeUplift[i] = oceanic ? grid.ridge[i] * 0.06 : transitional ? grid.ridge[i] * 0.018 : 0;
    trenchDepression[i] = oceanic
      ? -grid.trench[i] * (0.075 + ageNorm * 0.035)
      : transitional
        ? -grid.trench[i] * 0.026
        : 0;

    let baseElevation;
    let thicknessNorm;
    let densityNorm;
    let buoyancyScale;
    let densityScale;
    let coolingScale;
    if (continental) {
      baseElevation = 0.072;
      thicknessNorm = smoothstep(0, 1, (crustThickness[i] - 0.42) / 0.58);
      densityNorm = clamp01((crustDensity[i] - 0.38) / 0.22);
      buoyancyScale = 0.105;
      densityScale = 0.018;
      coolingScale = 0.002;
    } else if (transitional) {
      baseElevation = 0.018;
      thicknessNorm = smoothstep(0, 1, (crustThickness[i] - 0.28) / 0.46);
      densityNorm = clamp01((crustDensity[i] - 0.5) / 0.32);
      buoyancyScale = 0.062;
      densityScale = 0.038;
      coolingScale = 0.028;
    } else {
      baseElevation = -0.032;
      thicknessNorm = smoothstep(0, 1, (crustThickness[i] - 0.12) / 0.3);
      densityNorm = clamp01((crustDensity[i] - 0.62) / 0.24);
      buoyancyScale = 0.034;
      densityScale = 0.05;
      coolingScale = 0.106;
    }

    crustBuoyancy[i] = thicknessNorm * buoyancyScale;
    densitySubsidence[i] = densityNorm * densityScale;
    lithosphereCooling[i] = (oceanic ? 1 : transitional ? 0.42 : 0.03) * Math.sqrt(ageNorm) * coolingScale;

    const load = sedimentLoadSubsidence[i] * (continental ? 0.18 : transitional ? 0.34 : 0.3);
    const sedimentLoad = load * (1 - clamp01(sediment[i]) * 0.28);
    isostaticBase[i] =
      baseElevation +
      crustBuoyancy[i] -
      densitySubsidence[i] -
      lithosphereCooling[i] -
      sedimentLoad +
      sedimentSurfaceFill;

    ageSubsidence[i] = -lithosphereCooling[i];
    thicknessBuoyancy[i] = crustBuoyancy[i];
    oceanDepthTerms[i] = ageSubsidence[i] + thicknessBuoyancy[i] + sedimentSurfaceFill + ridgeUplift[i] + trenchDepression[i] - densitySubsidence[i] - sedimentLoad;
    isostaticResidual[i] = elev[i] - isostaticBase[i];
    isostaticReliefSupply[i] = Math.abs(crustBuoyancy[i]) + Math.abs(densitySubsidence[i]) + Math.abs(lithosphereCooling[i]) + Math.abs(sedimentLoad);
  }

  world.isostasyDiagnostics = measureIsostasyDiagnostics(world);
  return world.isostasyDiagnostics;
}

export function measureIsostasyDiagnostics(world) {
  const { grid, seaLevel } = world;
  const {
    size,
    crustType,
    crustAge,
    crustThickness,
    isostaticBase,
    isostaticResidual,
    sedimentLoadSubsidence,
    elev,
  } = grid;

  const sums = {
    continental: 0,
    oceanic: 0,
    transitional: 0,
    continentalCount: 0,
    oceanicCount: 0,
    transitionalCount: 0,
    youngDepth: 0,
    youngCount: 0,
    oldDepth: 0,
    oldCount: 0,
    residualAbs: 0,
    sedimentLoad: 0,
  };
  const residuals = [];
  const isoVals = [];
  const elevVals = [];
  const thickVals = [];
  const relVals = [];
  const ageVals = [];
  const depthVals = [];

  for (let i = 0; i < size; i += 1) {
    const rel = elev[i] - seaLevel;
    const baseRel = isostaticBase[i] - seaLevel;
    const residual = Math.abs(isostaticResidual[i]);
    residuals.push(residual);
    isoVals.push(isostaticBase[i]);
    elevVals.push(elev[i]);
    thickVals.push(crustThickness[i]);
    relVals.push(rel);
    sums.residualAbs += residual;
    sums.sedimentLoad += sedimentLoadSubsidence[i];

    if (crustType[i] === CrustType.CONTINENTAL) {
      sums.continental += baseRel;
      sums.continentalCount += 1;
    } else if (crustType[i] === CrustType.TRANSITIONAL) {
      sums.transitional += baseRel;
      sums.transitionalCount += 1;
    } else {
      const depth = Math.max(0, seaLevel - elev[i]);
      sums.oceanic += baseRel;
      sums.oceanicCount += 1;
      ageVals.push(crustAge[i]);
      depthVals.push(depth);
      if (crustAge[i] < 0.18) {
        sums.youngDepth += depth;
        sums.youngCount += 1;
      }
      if (crustAge[i] > 0.72) {
        sums.oldDepth += depth;
        sums.oldCount += 1;
      }
    }
  }

  residuals.sort((a, b) => a - b);
  const continentalMean = mean(sums.continental, sums.continentalCount);
  const oceanicMean = mean(sums.oceanic, sums.oceanicCount);
  const transitionalMean = mean(sums.transitional, sums.transitionalCount);
  return {
    isostaticContinentalMean: continentalMean,
    isostaticOceanicMean: oceanicMean,
    isostaticTransitionalMean: transitionalMean,
    continentalOceanReliefGap: continentalMean - oceanicMean,
    youngOldOceanDepthGap: mean(sums.oldDepth, sums.oldCount) - mean(sums.youngDepth, sums.youngCount),
    sedimentLoadSubsidenceMean: sums.sedimentLoad / Math.max(1, size),
    isostaticResidualMean: sums.residualAbs / Math.max(1, size),
    isostaticResidualP95: residuals.length ? residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * 0.95))] : 0,
    isostasyElevationCorrelation: correlation(isoVals, elevVals),
    crustThicknessElevationCorrelation: correlation(thickVals, relVals),
    crustAgeOceanDepthCorrelation: correlation(ageVals, depthVals),
    transitionalElevationBand: transitionalMean,
    seaLevelDriftAfterIsostasy: Math.abs((world.geologicSeaLevelOffset ?? 0) - (world.geologicSeaLevelPreviousOffset ?? world.geologicSeaLevelOffset ?? 0)),
    landRatioDriftAfterIsostasy: Math.abs((world.stats?.landRatio ?? 0) - (world.isostasyPreviousLandRatio ?? world.stats?.landRatio ?? 0)),
  };
}

export function getIsostasyDiagnostics(world) {
  return world.isostasyDiagnostics ?? measureIsostasyDiagnostics(world);
}

export function refreshIsostaticResidual(world) {
  const { grid } = world;
  for (let i = 0; i < grid.size; i += 1) {
    grid.isostaticResidual[i] = grid.elev[i] - grid.isostaticBase[i];
  }
  world.isostasyDiagnostics = measureIsostasyDiagnostics(world);
  return world.isostasyDiagnostics;
}

function saturatingFill(sediment, fillMax, fillScale) {
  return fillMax * (1 - Math.exp(-Math.max(0, sediment) * fillScale));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mean(sum, count) {
  return count ? sum / count : 0;
}

function correlation(a, b) {
  const count = Math.min(a.length, b.length);
  if (count < 3) return 0;
  let aSum = 0;
  let bSum = 0;
  for (let i = 0; i < count; i += 1) {
    aSum += a[i];
    bSum += b[i];
  }
  const aMean = aSum / count;
  const bMean = bSum / count;
  let cov = 0;
  let aVar = 0;
  let bVar = 0;
  for (let i = 0; i < count; i += 1) {
    const da = a[i] - aMean;
    const db = b[i] - bMean;
    cov += da * db;
    aVar += da * da;
    bVar += db * db;
  }
  return aVar > 0 && bVar > 0 ? cov / Math.sqrt(aVar * bVar) : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
