export function compactMetrics(world, timing = {}) {
  const grid = world.grid;
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
  if (metrics.sedimentStraightnessRisk > 0.35) failures.push(["sedimentStraightnessRisk", metrics.sedimentStraightnessRisk, 0.35]);
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
      if (grid.boundaryInfluence[id] > 0.1) nearBoundary += 1;
      if (grid.boundaryDistance[id] === 0) exactBoundary += 1;
    }
  }
  return {
    coastCoverage: coast / grid.size,
    nearBoundaryShare: coast ? nearBoundary / coast : 0,
    exactBoundaryShare: coast ? exactBoundary / coast : 0,
  };
}

function measureAgeBandStraightnessSplit(grid) {
  let nearTotal = 0;
  let nearStraight = 0;
  let inactiveTotal = 0;
  let inactiveStraight = 0;
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      if (grid.crustType[id] !== 0) continue;
      const band = Math.floor(grid.crustAge[id] * 12);
      const horizontal = sameAgeBand(grid, x - 1, y, band) + sameAgeBand(grid, x + 1, y, band);
      const vertical = sameAgeBand(grid, x, y - 1, band) + sameAgeBand(grid, x, y + 1, band);
      const straight = Math.max(horizontal, vertical) >= 2;
      if (grid.ridge[id] > 0.03 || grid.ridgeAxis[id] > 0.05) {
        nearTotal += 1;
        if (straight) nearStraight += 1;
      } else if (grid.boundaryInfluence[id] < 0.12) {
        inactiveTotal += 1;
        if (straight) inactiveStraight += 1;
      }
    }
  }
  return {
    nearRidge: nearTotal ? nearStraight / nearTotal : 0,
    inactive: inactiveTotal ? inactiveStraight / inactiveTotal : 0,
  };
}

function sameAgeBand(grid, x, y, band) {
  if (y < 0 || y >= grid.height) return 0;
  const id = y * grid.width + wrapX(grid.width, x);
  return grid.crustType[id] === 0 && Math.floor(grid.crustAge[id] * 12) === band ? 1 : 0;
}

function visitNeighbor4Ids(grid, x, y, visit) {
  visit(y * grid.width + wrapX(grid.width, x - 1));
  visit(y * grid.width + wrapX(grid.width, x + 1));
  if (y > 0) visit((y - 1) * grid.width + x);
  if (y < grid.height - 1) visit((y + 1) * grid.width + x);
}

function average(field) {
  if (!field || !field.length) return 0;
  let total = 0;
  for (let i = 0; i < field.length; i += 1) total += field[i];
  return total / field.length;
}

function averageWhere(field, include) {
  if (!field) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (!include(i)) continue;
    total += field[i];
    count += 1;
  }
  return count ? total / count : 0;
}

function share(field) {
  if (!field || !field.length) return 0;
  let count = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i]) count += 1;
  return count / field.length;
}

function maxInt(field) {
  if (!field || !field.length) return 0;
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}

function wrapX(width, x) {
  return (x + width) % width;
}

function formatValue(value) {
  return typeof value === "number" ? Number(value.toFixed(6)) : String(value);
}

