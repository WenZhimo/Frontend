import { topologyForGrid } from "../../src/sim/topology.js";

let currentGrid = null;

export function compactMetrics(world, timing = {}) {
  const grid = world.grid;
  currentGrid = grid;
  const coast = measureCoastBoundaryShare(grid, world.seaLevel);
  const ageSplit = measureAgeBandStraightnessSplit(grid);
  const sediment = world.sedimentBudgetDiagnostics ?? {};
  const transform = world.transformDiagnostics ?? {};
  const relief = world.reliefDiagnostics ?? {};
  return {
    step: world.step,
    ageYears: world.ageYears,
    landRatio: world.stats.landRatio,
    seaRatio: world.stats.seaRatio,
    seaLevel: world.seaLevel,
    plateCheckerboardScore: average(grid.plateCheckerboard),
    coastBoundaryShare: coast.nearBoundaryShare,
    exactCoastBoundaryShare: coast.exactBoundaryShare,
    inlandWaterCandidateShare: share(grid.inlandWaterCandidate),
    closedBasinCount: maxInt(grid.closedBasinId),
    sedimentBudgetError: sediment.sedimentBudgetError ?? average(grid.sedimentBudgetError),
    sedimentStraightnessRisk: sediment.sedimentStraightnessRisk ?? 0,
    sedimentBoundaryCorrelation: sediment.sedimentBoundaryCorrelation ?? 0,
    sedimentGridAlignment: sediment.sedimentGridAlignment ?? 0,
    sedimentNaturalSinkShare: sediment.sedimentNaturalSinkShare ?? 0,
    sedimentOverfillShare: sediment.sedimentOverfillShare ?? 0,
    sedimentSeaFillRisk: sediment.sedimentSeaFillRisk ?? 0,
    sedimentPatchiness: sediment.sedimentPatchiness ?? 0,
    oldBoundaryReliefCorrelation: transform.oldBoundaryReliefCorrelation ?? average(grid.oldBoundaryCorrelation),
    activeVsInactiveBoundaryReliefRatio: transform.activeVsInactiveBoundaryReliefRatio ?? activeInactiveRatio(grid),
    ageBandStraightnessNearRidge: ageSplit.nearRidge,
    ageBandStraightnessInactive: ageSplit.inactive,
    reliefDeficit: relief.reliefDeficit ?? average(grid.reliefDeficit),
    flatWorldRisk: relief.flatWorldRisk ?? false,
    totalMs: timing.totalMs ?? 0,
    averageStepMs: timing.averageStepMs ?? world.lastStepMs ?? 0,
  };
}

export function summarizeScenario({ seedText, pipelineMode, resolution, checkpoints, totalMs, averageStepMs }) {
  return {
    seedText,
    pipelineMode,
    resolution,
    totalMs,
    averageStepMs,
    checkpoints,
  };
}

export function assessArtifactRisk(metrics) {
  const failures = [];
  if (metrics.plateCheckerboardScore > 0.025) failures.push(["plateCheckerboardScore", metrics.plateCheckerboardScore, 0.025]);
  if (metrics.coastBoundaryShare > 0.35) failures.push(["coastBoundaryShare", metrics.coastBoundaryShare, 0.35]);
  if (
    metrics.sedimentStraightnessRisk > 0.35 &&
    (metrics.sedimentBoundaryCorrelation > 0.18 || metrics.sedimentGridAlignment > 0.28 || metrics.sedimentNaturalSinkShare < 0.28)
  ) {
    failures.push(["sedimentStraightnessRisk", metrics.sedimentStraightnessRisk, 0.35]);
  }
  if (metrics.sedimentOverfillShare > 0.02) failures.push(["sedimentOverfillShare", metrics.sedimentOverfillShare, 0.02]);
  if (metrics.sedimentSeaFillRisk > 0.08) failures.push(["sedimentSeaFillRisk", metrics.sedimentSeaFillRisk, 0.08]);
  if (metrics.oldBoundaryReliefCorrelation > 0.08) failures.push(["oldBoundaryReliefCorrelation", metrics.oldBoundaryReliefCorrelation, 0.08]);
  if (metrics.activeVsInactiveBoundaryReliefRatio > 0 && metrics.activeVsInactiveBoundaryReliefRatio < 2) {
    failures.push(["activeVsInactiveBoundaryReliefRatio", metrics.activeVsInactiveBoundaryReliefRatio, 2]);
  }
  if (metrics.landRatio < 0.18 || metrics.landRatio > 0.82) failures.push(["landRatio", metrics.landRatio, "0.18..0.82"]);
  if (metrics.flatWorldRisk) failures.push(["flatWorldRisk", true, false]);
  return {
    failed: failures.length > 0,
    failureReason: failures.map(([name, value, threshold]) => `${name}=${formatValue(value)} threshold=${threshold}`).join("; "),
    failures: failures.map(([metric, value, threshold]) => ({ metric, value, threshold })),
  };
}

function activeInactiveRatio(grid) {
  const active = averageWhere(grid.activeTransform, (i) => grid.activeTransform[i] > 0.05);
  const inactive = averageWhere(grid.inactiveBoundaryRelief, (i) => grid.transformMemory[i] > 0.05 && grid.activeTransform[i] <= 0.01);
  return inactive > 0 ? active / inactive : active > 0 ? 999 : 0;
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
    if (grid.boundaryInfluence[id] > 0.1) nearBoundary += area;
    if (grid.boundaryDistance[id] === 0) exactBoundary += area;
  }
  return {
    coastCoverage: coast / Math.max(totalArea(grid), Number.EPSILON),
    nearBoundaryShare: coast ? nearBoundary / coast : 0,
    exactBoundaryShare: coast ? exactBoundary / coast : 0,
  };
}

function measureAgeBandStraightnessSplit(grid) {
  let nearTotal = 0;
  let nearStraight = 0;
  let inactiveTotal = 0;
  let inactiveStraight = 0;
  const topology = topologyForGrid(grid);
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.crustType[id] !== 0) continue;
    const band = Math.floor(grid.crustAge[id] * 12);
    let aligned = 0;
    forEachAnyNeighbor(topology, id, (nid) => {
      if (grid.crustType[nid] === 0 && Math.floor(grid.crustAge[nid] * 12) === band) aligned += 1;
    });
    if (aligned <= 0) continue;
    const area = metricArea(grid, id);
    const straight = aligned >= 2;
    if (grid.ridge[id] > 0.03 || grid.ridgeAxis[id] > axisDiagnosticThreshold(grid)) {
      nearTotal += area;
      if (straight) nearStraight += area;
    } else if (grid.boundaryInfluence[id] < 0.12) {
      inactiveTotal += area;
      if (straight) inactiveStraight += area;
    }
  }
  return {
    nearRidge: nearTotal ? nearStraight / nearTotal : 0,
    inactive: inactiveTotal ? inactiveStraight / inactiveTotal : 0,
  };
}

function average(field) {
  if (!field || !field.length) return 0;
  let total = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricAreaForField(field, i);
    total += field[i] * area;
    weight += area;
  }
  return total / Math.max(weight, Number.EPSILON);
}

function averageWhere(field, include) {
  if (!field) return 0;
  let total = 0;
  let weight = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    const area = metricAreaForField(field, i);
    total += field[i] * area;
    weight += area;
  }
  return weight ? total / weight : 0;
}

function share(field) {
  if (!field || !field.length) return 0;
  let covered = 0;
  let total = 0;
  for (let i = 0; i < field.length; i += 1) {
    const area = metricAreaForField(field, i);
    total += area;
    if (field[i]) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

function maxInt(field) {
  if (!field || !field.length) return 0;
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function formatValue(value) {
  return typeof value === "number" ? Number(value.toFixed(6)) : String(value);
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

function metricAreaForField(field, id) {
  const grid = field?.length === currentGrid?.size ? currentGrid : null;
  return metricArea(grid, id);
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

function axisDiagnosticThreshold(grid) {
  return grid?.topologyKind === "cubed-sphere" || grid?.topologyOptions?.graphBacked ? 0.016 : 0.05;
}
