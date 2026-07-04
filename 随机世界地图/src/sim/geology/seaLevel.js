import { forEachNeighbor4ById, indexOf, sampleGridWrapped, xyOf } from "../grid.js";
import { topologyForGrid } from "../topology.js";
import { CrustType } from "./crust.js";

const BASELINES = {
  ridge: 0.08,
  ridgeScale: 0.12,
  young: 0.18,
  youngScale: 0.2,
  old: 0.16,
  oldScale: 0.18,
  sediment: 0.1,
  sedimentScale: 0.16,
  trench: 0.04,
  trenchScale: 0.08,
};

const WEIGHTS = {
  ridge: 0.34,
  young: 0.28,
  sediment: 0.14,
  old: 0.34,
  trench: 0.1,
};

export function updateGeologicSeaLevel(world) {
  world.baseSeaLevel = world.seaLevel;
  const previousOffset = world.geologicSeaLevelOffset ?? 0;
  const sameStep = world.geologicSeaLevelStep === world.step;
  const diagnostics = computeGeologicSeaLevelSignals(world, world.baseSeaLevel);

  let offset = previousOffset;
  let change = world.geologicSeaLevelDiagnostics?.seaLevelChangeRate ?? 0;
  if (!sameStep) {
    let maxStep = diagnostics.maxOffsetStep;
    if (diagnostics.coastalFlipRisk > 0.18) maxStep *= 0.5;
    offset = moveToward(previousOffset, diagnostics.targetGeologicSeaLevelOffset, maxStep);
    offset = clamp(offset, -diagnostics.maxOffset, diagnostics.maxOffset);
    change = offset - previousOffset;
    world.geologicSeaLevelPreviousOffset = previousOffset;
    world.geologicSeaLevelOffset = offset;
    world.geologicSeaLevelTargetOffset = diagnostics.targetGeologicSeaLevelOffset;
    world.geologicSeaLevelStep = world.step;
  }

  world.seaLevel = world.baseSeaLevel + offset;
  writeGeologicSeaLevelFields(world, world.seaLevel);
  const landAfter = shareLand(world.grid, world.seaLevel);
  world.geologicSeaLevelDiagnostics = {
    ...diagnostics,
    baseSeaLevel: world.baseSeaLevel,
    seaLevel: world.seaLevel,
    geologicSeaLevelOffset: offset,
    targetGeologicSeaLevelOffset: diagnostics.targetGeologicSeaLevelOffset,
    seaLevelChangeRate: change,
    coastalSensitivityMean: average(world.grid.coastalSensitivity, world.grid),
    landShareAfterGeologicOffset: landAfter,
    geologicSeaLevelLandShareDelta: landAfter - diagnostics.landShareBeforeGeologicOffset,
  };
  return world.geologicSeaLevelDiagnostics;
}

export function getGeologicSeaLevelDiagnostics(world) {
  return world.geologicSeaLevelDiagnostics ?? {
    baseSeaLevel: world.baseSeaLevel ?? world.seaLevel ?? 0,
    seaLevel: world.seaLevel ?? 0,
    geologicSeaLevelOffset: world.geologicSeaLevelOffset ?? 0,
    targetGeologicSeaLevelOffset: world.geologicSeaLevelTargetOffset ?? 0,
    seaLevelChangeRate: 0,
    youngOceanShare: 0,
    oldOceanShare: 0,
    ridgeVolumeSignalMean: 0,
    oldOceanCapacitySignalMean: 0,
    sedimentDisplacementSignalMean: 0,
    trenchCapacitySignalMean: 0,
    ridgeVolumeNormalized: 0,
    youngOceanNormalized: 0,
    oldOceanCapacityNormalized: 0,
    sedimentDisplacementNormalized: 0,
    trenchCapacityNormalized: 0,
    capacityBalance: 0,
    oceanBasinCapacitySignalMean: 0,
    coastalFlipRisk: 0,
    coastalSensitivityMean: 0,
    seaLevelCouplingStrength: 0,
    landShareBeforeGeologicOffset: 0,
    landShareAfterGeologicOffset: 0,
    geologicSeaLevelLandShareDelta: 0,
  };
}

function computeGeologicSeaLevelSignals(world, baseSeaLevel) {
  const { grid } = world;
  let oceanicCount = 0;
  let youngOceanCount = 0;
  let oldOceanCount = 0;
  let ridgeSum = 0;
  let oldCapacitySum = 0;
  let sedimentSum = 0;
  let trenchSum = 0;
  let totalAreaValue = 0;

  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    totalAreaValue += area;
    const oceanic = grid.crustType[i] === CrustType.OCEANIC;
    const age = grid.crustAge[i];
    const youngOcean = oceanic && age < 0.18;
    const oldOcean = oceanic && age > 0.62;
    const depth = Math.max(0, baseSeaLevel - grid.elev[i]);
    const ridgeSignal = oceanic ? clamp01(
      grid.ridgeUplift[i] * 0.45 +
      grid.ridge[i] * 0.3 +
      grid.ridgeAxis[i] * 0.25 +
      Math.max(0, 1 - age / 0.18) * 0.35
    ) : 0;
    const oldCapacity = oldOcean ? clamp01(
      depth * 2.1 +
      Math.max(0, -grid.ageSubsidence[i]) * 2.4 +
      Math.max(0, -grid.oceanDepthTerms[i]) * 1.1
    ) : 0;
    const sedimentDisplacement = clamp01(
      grid.sedimentFill[i] * 0.45 +
      grid.sedimentWedge[i] * 0.35 +
      grid.continentalRise[i] * 0.15 +
      grid.continentalShelf[i] * 0.1 +
      grid.sediment[i] * 0.15
    );
    const trenchCapacity = oceanic ? clamp01(
      Math.max(0, -grid.trenchDepression[i]) * 4.5 +
      grid.trench[i] * 0.35 +
      grid.trenchAxis[i] * 0.1
    ) : 0;

    grid.isYoungOcean[i] = youngOcean ? 1 : 0;
    grid.ridgeVolumeSignal[i] = ridgeSignal;
    grid.oldOceanCapacitySignal[i] = oldCapacity;
    grid.sedimentDisplacementSignal[i] = sedimentDisplacement;
    grid.trenchCapacitySignal[i] = trenchCapacity;

    if (oceanic) {
      oceanicCount += area;
      if (youngOcean) youngOceanCount += area;
      if (oldOcean) oldOceanCount += area;
      ridgeSum += ridgeSignal * area;
      oldCapacitySum += oldCapacity * area;
      trenchSum += trenchCapacity * area;
    }
    if (grid.elev[i] < baseSeaLevel || grid.continentalShelf[i] > 0.01 || grid.sedimentWedge[i] > 0.01) {
      sedimentSum += sedimentDisplacement * area;
    }
  }

  const invOceanic = oceanicCount ? 1 / oceanicCount : 0;
  const youngOceanShare = youngOceanCount * invOceanic;
  const oldOceanShare = oldOceanCount * invOceanic;
  const ridgeMean = ridgeSum * invOceanic;
  const oldCapacityMean = oldCapacitySum * invOceanic;
  const trenchMean = trenchSum * invOceanic;
  const sedimentMean = sedimentSum / Math.max(totalAreaValue, Number.EPSILON);
  const ridgeN = normalizeCentered(ridgeMean, BASELINES.ridge, BASELINES.ridgeScale);
  const youngN = normalizeCentered(youngOceanShare, BASELINES.young, BASELINES.youngScale);
  const oldN = normalizeCentered(oldCapacityMean, BASELINES.old, BASELINES.oldScale);
  const sedimentN = normalizeCentered(sedimentMean, BASELINES.sediment, BASELINES.sedimentScale);
  const trenchN = normalizeCentered(trenchMean, BASELINES.trench, BASELINES.trenchScale);
  const capacityBalance =
    ridgeN * WEIGHTS.ridge +
    youngN * WEIGHTS.young +
    sedimentN * WEIGHTS.sediment -
    oldN * WEIGHTS.old -
    trenchN * WEIGHTS.trench;
  const maxOffset = 0.032;
  const seaLevelCouplingStrength = world.params.pipelineMode === "geology-v2" ? 0.38 : 0;
  const targetOffset = clamp(capacityBalance * maxOffset * seaLevelCouplingStrength, -maxOffset, maxOffset);
  const dt = world.timeScaleFactor ?? 1;
  const maxOffsetStep = 0.0016 * clamp(dt, 0.25, 4);
  const previousOffset = world.geologicSeaLevelOffset ?? 0;
  const estimatedChange = clamp(targetOffset - previousOffset, -maxOffsetStep, maxOffsetStep);

  writeCoastalSensitivity(world, baseSeaLevel + previousOffset);

  return {
    targetGeologicSeaLevelOffset: targetOffset,
    youngOceanShare,
    oldOceanShare,
    ridgeVolumeSignalMean: ridgeMean,
    oldOceanCapacitySignalMean: oldCapacityMean,
    sedimentDisplacementSignalMean: sedimentMean,
    trenchCapacitySignalMean: trenchMean,
    ridgeVolumeNormalized: ridgeN,
    youngOceanNormalized: youngN,
    oldOceanCapacityNormalized: oldN,
    sedimentDisplacementNormalized: sedimentN,
    trenchCapacityNormalized: trenchN,
    capacityBalance,
    oceanBasinCapacitySignalMean: capacityBalance,
    coastalFlipRisk: coastalFlipRisk(grid, baseSeaLevel + previousOffset, estimatedChange),
    seaLevelCouplingStrength,
    landShareBeforeGeologicOffset: shareLand(grid, baseSeaLevel),
    maxOffset,
    maxOffsetStep,
    baselines: BASELINES,
  };
}

function writeGeologicSeaLevelFields(world, seaLevel) {
  writeCoastalSensitivity(world, seaLevel);
}

function writeCoastalSensitivity(world, seaLevel) {
  const { grid } = world;
  for (let i = 0; i < grid.size; i += 1) {
    const relative = grid.elev[i] - seaLevel;
    const nearSeaLevel = 1 - clamp01(Math.abs(relative) / 0.02);
    const lowSlope = 1 - clamp01(localSlope(grid, i) / 0.018);
    const lowRelief = 1 - clamp01(localRelief4(grid, i) / 0.055);
    const shelfFactor = clamp01(
      grid.continentalShelf[i] * 0.45 +
      grid.passiveMargin[i] * 0.25 +
      grid.sedimentWedge[i] * 0.15 +
      grid.basin[i] * 0.1
    );
    grid.coastalSensitivity[i] = clamp01(
      nearSeaLevel * 0.45 +
      lowSlope * 0.2 +
      lowRelief * 0.15 +
      shelfFactor * 0.2
    );
  }
}

function coastalFlipRisk(grid, seaLevel, change) {
  const baseBand = 0.018;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    const potential = clamp01((Math.abs(change) * 8 + baseBand - Math.abs(grid.elev[i] - seaLevel)) / baseBand);
    sum += grid.coastalSensitivity[i] * potential * area;
    weight += area;
  }
  return sum / Math.max(weight, Number.EPSILON);
}

function localSlope(grid, id) {
  const topology = topologyForGrid(grid);
  if (isGraphBackedGrid(grid, topology)) return localGraphSlope(grid, topology, id);
  return legacyLocalSlope(grid, id);
}

function legacyLocalSlope(grid, id) {
  const { x, y } = xyOf(grid, id);
  const left = sampleGridWrapped(grid, grid.elev, x - 1, y);
  const right = sampleGridWrapped(grid, grid.elev, x + 1, y);
  const upId = indexOf(grid, x, y - 1);
  const downId = indexOf(grid, x, y + 1);
  const up = upId >= 0 ? grid.elev[upId] : grid.elev[id];
  const down = downId >= 0 ? grid.elev[downId] : grid.elev[id];
  return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
}

function localRelief4(grid, id) {
  const topology = topologyForGrid(grid);
  let min = grid.elev[id];
  let max = grid.elev[id];
  visitLocalReliefNeighbors(grid, topology, id, (nid) => {
    const value = grid.elev[nid];
    if (value < min) min = value;
    if (value > max) max = value;
  });
  return max - min;
}

function localGraphSlope(grid, topology, id) {
  const center = grid.elev[id];
  let count = 0;
  let totalSq = 0;
  topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
    const length = Number.isFinite(edgeLength) && edgeLength > 1e-6 ? edgeLength : 1;
    const gradient = (grid.elev[nid] - center) / length;
    totalSq += gradient * gradient;
    count += 1;
  });
  return count ? Math.sqrt(totalSq / count) : 0;
}

function visitLocalReliefNeighbors(grid, topology, id, visit) {
  if (isGraphBackedGrid(grid, topology)) {
    topology.forEachNeighbor(id, (nid) => {
      visit(nid);
    });
    return;
  }
  forEachNeighbor4ById(grid, id, (nid) => {
    visit(nid);
  });
}

function shareLand(grid, seaLevel) {
  let land = 0;
  let total = 0;
  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    total += area;
    if (grid.elev[i] >= seaLevel) land += area;
  }
  return land / Math.max(total, Number.EPSILON);
}

function average(field, grid = null) {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricArea(grid, i);
    sum += field[i] * area;
    weight += area;
  }
  return sum / Math.max(weight, Number.EPSILON);
}

function metricArea(grid, id) {
  const area = grid?.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function normalizeCentered(value, baseline, scale) {
  return clamp((value - baseline) / Math.max(1e-6, scale), -1, 1);
}

function moveToward(current, target, maxStep) {
  return current + clamp(target - current, -maxStep, maxStep);
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
  return Boolean(
    grid.topologyOptions?.graphBacked ||
      topology?.topologyKind === "cubed-sphere" ||
      grid.topologyKind === "cubed-sphere",
  );
}
