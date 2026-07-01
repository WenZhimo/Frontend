import { physicalRadius, wrapX } from "../grid.js";

export function updateReliefBudgetDiagnostics(world) {
  const { grid, seaLevel, params } = world;
  const stats = measureElevationDistribution(grid, seaLevel);
  const radius = Math.max(1, physicalRadius(grid, 4));
  const lowSlope = 0.0048;
  const lowRelief = 0.038;
  const seaLevelBand = 0.018;

  let flatLand = 0;
  let largePlain = 0;
  let sensitive = 0;
  let tectonicSum = 0;
  let isostaticSum = 0;
  let erosionSum = 0;
  let smoothingSum = 0;
  let slopeLandSum = 0;
  let landCount = 0;
  let orographicPotential = 0;
  let seaSensitivityWeightSum = 0;

  const target = targetReliefForWorld(params, stats);
  const deficit =
    Math.max(0, target.hypsometricSpread - stats.hypsometricSpread) +
    Math.max(0, target.landReliefSpread - stats.landReliefSpread) +
    Math.max(0, target.globalElevationStd - stats.globalElevationStd);
  const normalizedDeficit = Math.min(1, deficit / 0.18);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const i = y * grid.width + x;
      const relative = grid.elev[i] - seaLevel;
      const land = relative >= 0;
      const local = localRelief(grid, x, y, radius);
      const slope = localSlope(grid, x, y, seaLevel);
      const seaSensitive = Math.abs(relative) < seaLevelBand ? 1 : 0;
      const plain = land && slope < lowSlope && local < lowRelief ? 1 : 0;
      const broadPlain = plain && local < lowRelief * 0.72 && grid.sediment[i] + grid.basin[i] > 0.05 ? 1 : 0;

      const tectonic =
        grid.activeOrogeny[i] * 1 +
        grid.oldOrogeny[i] * 0.35 +
        grid.ridge[i] * 0.45 +
        grid.rift[i] * 0.25 +
        grid.trench[i] * 0.25 +
        grid.islandArc[i] * 0.35;
      const isostatic =
        Math.abs(grid.thicknessBuoyancy[i]) +
        Math.abs(grid.ageSubsidence[i]) +
        Math.abs(grid.oceanDepthTerms[i]);
      const smoothing =
        grid.abyssalPlain[i] * 0.35 +
        grid.sedimentWedge[i] * 0.2 +
        grid.forelandBasin[i] * 0.15;
      const erosion =
        grid.sediment[i] * 0.35 +
        grid.basin[i] * 0.25 +
        smoothing;
      const relief = Math.max(0, tectonic + isostatic - erosion);

      grid.tectonicReliefSupply[i] = tectonic;
      grid.isostaticReliefSupply[i] = isostatic;
      grid.sedimentSmoothingPressure[i] = smoothing;
      grid.erosionFlatteningPressure[i] = erosion;
      grid.planetaryRelief[i] = relief;
      grid.reliefDeficit[i] = normalizedDeficit * (0.45 + plain * 0.35 + seaSensitive * 0.2);
      grid.seaLevelSensitivity[i] = seaSensitive ? 1 - Math.abs(relative) / seaLevelBand : 0;
      grid.flatLandMask[i] = plain;
      grid.largePlainMask[i] = broadPlain;

      flatLand += plain;
      largePlain += broadPlain;
      sensitive += seaSensitive;
      tectonicSum += tectonic;
      isostaticSum += isostatic;
      erosionSum += erosion;
      smoothingSum += smoothing;
      seaSensitivityWeightSum += grid.seaLevelSensitivity[i];
      if (land) {
        slopeLandSum += slope;
        landCount += 1;
      }
      if (grid.orographicBarrier[i] > orographicPotential) orographicPotential = grid.orographicBarrier[i];
    }
  }

  const flatLandShare = flatLand / grid.size;
  const largePlainShare = largePlain / grid.size;
  const seaLevelSensitivityShare = sensitive / grid.size;
  const inverseSpread = 1 - Math.min(1, stats.hypsometricSpread / 0.34);
  const coastInstabilityRisk = seaLevelSensitivityShare * (0.45 + inverseSpread * 0.55);
  world.reliefDiagnostics = {
    ...stats,
    flatLandShare,
    largePlainShare,
    seaLevelSensitivity: seaLevelSensitivityShare,
    seaLevelSensitivityMean: seaSensitivityWeightSum / grid.size,
    coastInstabilityRisk,
    reliefDeficit: deficit,
    normalizedReliefDeficit: normalizedDeficit,
    targetHypsometricSpread: target.hypsometricSpread,
    targetLandReliefSpread: target.landReliefSpread,
    targetGlobalElevationStd: target.globalElevationStd,
    tectonicReliefSupplyMean: tectonicSum / grid.size,
    isostaticReliefSupplyMean: isostaticSum / grid.size,
    erosionFlatteningPressureMean: erosionSum / grid.size,
    sedimentSmoothingPressureMean: smoothingSum / grid.size,
    drainageGradientPotential: landCount ? slopeLandSum / landCount * stats.landReliefSpread : 0,
    orographicReliefPotential: orographicPotential,
    flatWorldRisk: stats.globalElevationStd < target.globalElevationStd * 0.72 &&
      stats.hypsometricSpread < target.hypsometricSpread * 0.72 &&
      largePlainShare > 0.38,
  };
  return world.reliefDiagnostics;
}

export function getReliefDiagnostics(world) {
  return world.reliefDiagnostics ?? emptyReliefDiagnostics();
}

function emptyReliefDiagnostics() {
  return {
    globalElevationStd: 0,
    landElevationStd: 0,
    oceanElevationStd: 0,
    hypsometricSpread: 0,
    landReliefSpread: 0,
    oceanReliefSpread: 0,
    flatLandShare: 0,
    largePlainShare: 0,
    seaLevelSensitivity: 0,
    seaLevelSensitivityMean: 0,
    coastInstabilityRisk: 0,
    reliefDeficit: 0,
    normalizedReliefDeficit: 0,
    targetHypsometricSpread: 0,
    targetLandReliefSpread: 0,
    targetGlobalElevationStd: 0,
    tectonicReliefSupplyMean: 0,
    isostaticReliefSupplyMean: 0,
    erosionFlatteningPressureMean: 0,
    sedimentSmoothingPressureMean: 0,
    drainageGradientPotential: 0,
    orographicReliefPotential: 0,
    flatWorldRisk: false,
  };
}

function measureElevationDistribution(grid, seaLevel) {
  const all = [];
  const land = [];
  const ocean = [];
  for (let i = 0; i < grid.size; i += 1) {
    const h = grid.elev[i];
    all.push(h);
    if (h >= seaLevel) land.push(h);
    else ocean.push(h);
  }
  return {
    globalElevationStd: std(all),
    landElevationStd: std(land),
    oceanElevationStd: std(ocean),
    hypsometricSpread: percentileSorted(all, 0.95) - percentileSorted(all, 0.05),
    landReliefSpread: land.length ? percentileSorted(land, 0.9) - percentileSorted(land, 0.1) : 0,
    oceanReliefSpread: ocean.length ? percentileSorted(ocean, 0.9) - percentileSorted(ocean, 0.1) : 0,
  };
}

function targetReliefForWorld(params, stats) {
  const intensity = Math.max(0, Math.min(2, params?.intensity ?? 1));
  const waterFraction = Math.max(0.05, Math.min(0.95, (params?.waterLevel ?? 50) / 100));
  const intensityFactor = 0.75 + intensity * 0.25;
  const waterWorldAdjustment = 1 - Math.max(0, waterFraction - 0.55) * 0.18;
  return {
    hypsometricSpread: 0.24 * intensityFactor * waterWorldAdjustment,
    landReliefSpread: 0.135 * intensityFactor,
    globalElevationStd: 0.048 * intensityFactor,
  };
}

function localRelief(grid, x, y, radius) {
  let min = Infinity;
  let max = -Infinity;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= grid.height) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.hypot(dx, dy) > radius + 0.01) continue;
      const h = grid.elev[ny * grid.width + wrapX(grid.width, x + dx)];
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return max - min;
}

function localSlope(grid, x, y, seaLevel) {
  const left = grid.elev[y * grid.width + wrapX(grid.width, x - 1)] - seaLevel;
  const right = grid.elev[y * grid.width + wrapX(grid.width, x + 1)] - seaLevel;
  const up = grid.elev[Math.max(0, y - 1) * grid.width + x] - seaLevel;
  const down = grid.elev[Math.min(grid.height - 1, y + 1) * grid.width + x] - seaLevel;
  return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
}

function std(values) {
  if (!values.length) return 0;
  let sum = 0;
  let sumSq = 0;
  for (const v of values) {
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / values.length;
  return Math.sqrt(Math.max(0, sumSq / values.length - mean * mean));
}

function percentileSorted(values, p) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * p)));
  return values[index];
}
