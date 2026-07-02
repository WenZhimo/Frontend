import { forEachNeighbor4, wrapX } from "../grid.js";
import { CrustType } from "./crust.js";

const TRANSPORT_PASSES = 4;

export function updateSedimentBudget(world) {
  if (world.sedimentBudgetStep === world.step) return world.sedimentBudgetDiagnostics;

  const { grid, seaLevel } = world;
  const {
    size,
    width,
    height,
    elev,
    crustType,
    sediment,
    basin,
    activeOrogeny,
    oldOrogeny,
    orogeny,
    mountainBelt,
    mountainAxis,
    orographicBarrier,
    orogenyErosion,
    orogenicSedimentSupply,
    forelandBasin,
    passiveMargin,
    continentalShelf,
    continentalRise,
    sedimentWedge,
    abyssalPlain,
    riftAxis,
    trench,
    trenchAxis,
    ridge,
    ridgeAxis,
    islandArc,
    inlandWaterCandidate,
    externalSeaMask,
    boundaryInfluence,
    axisCurvature,
    weakness,
    erosionSource,
    sedimentFlux,
    sedimentSink,
    sedimentCapacity,
    sedimentCompaction,
    sedimentLoadSubsidence,
    depositionRate,
    erosionRate,
    sedimentBudgetError,
    scratch,
    scratch2,
    scratch3,
  } = grid;
  const dt = world.timeScaleFactor;
  const massBefore = sumField(sediment);

  erosionSource.fill(0);
  sedimentFlux.fill(0);
  sedimentSink.fill(0);
  sedimentCapacity.fill(0);
  sedimentCompaction.fill(0);
  sedimentLoadSubsidence.fill(0);
  depositionRate.fill(0);
  erosionRate.fill(0);
  sedimentBudgetError.fill(0);
  scratch.fill(0);
  scratch2.fill(0);
  scratch3.fill(0);

  let produced = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const rel = elev[id] - seaLevel;
      const land = rel >= -0.006;
      const slope = localSlope(grid, elev, x, y);
      const relief = localRelief(grid, elev, x, y);
      const activeConstructive = Math.max(ridge[id], ridgeAxis[id], trench[id] * 0.55, trenchAxis[id] * 0.45);
      const mountainSource = land
        ? activeOrogeny[id] * 0.00042 +
          mountainBelt[id] * 0.00034 +
          oldOrogeny[id] * 0.00016 +
          orogeny[id] * 0.00018 +
          mountainAxis[id] * 0.00014 +
          orographicBarrier[id] * 0.00009 +
          orogenicSedimentSupply[id] * 0.00032
        : 0;
      const slopeSource = land
        ? smoothstep(0.012, 0.055, slope) * smoothstep(0.018, 0.12, relief) * 0.00023
        : 0;
      const riftShoulderSource = land
        ? riftAxis[id] * smoothstep(0.006, 0.08, rel) * 0.000055
        : 0;
      const boundaryDamp = 1 - Math.min(0.75, activeConstructive * 0.72 + Math.max(0, boundaryInfluence[id] - 0.45) * 0.25);
      const source = clamp01((mountainSource + slopeSource + riftShoulderSource) * dt * boundaryDamp);
      erosionSource[id] = source;
      erosionRate[id] = source / Math.max(0.000001, dt);
      scratch[id] = source;
      sedimentFlux[id] = source;
      produced += source;
    }
  }

  for (let i = 0; i < size; i += 1) {
    const rel = elev[i] - seaLevel;
    const nearOrBelowSea = clamp01((seaLevel + 0.08 - elev[i]) / 0.16);
    const shelfCapacity =
      continentalShelf[i] * 0.34 +
      continentalRise[i] * 0.24 +
      sedimentWedge[i] * 0.22 +
      passiveMargin[i] * 0.16;
    const basinCapacity =
      basin[i] * 0.32 +
      forelandBasin[i] * 0.27 +
      riftAxis[i] * 0.08 +
      inlandWaterCandidate[i] * 0.2;
    const trenchForearcCapacity =
      trench[i] * 0.055 +
      trenchAxis[i] * 0.045 +
      islandArc[i] * 0.04;
    const deepOceanCapacity =
      abyssalPlain[i] * 0.075 * (crustType[i] === CrustType.OCEANIC ? clamp01(grid.crustAge[i]) : 0);
    const activeConstructivePenalty =
      ridgeAxis[i] * 0.34 +
      ridge[i] * 0.24 +
      activeOrogeny[i] * 0.18 +
      (rel > 0.12 ? smoothstep(0.12, 0.32, rel) * 0.08 : 0);
    sedimentCapacity[i] = clamp01(
      shelfCapacity +
      basinCapacity +
      trenchForearcCapacity +
      deepOceanCapacity +
      nearOrBelowSea * 0.08 -
      activeConstructivePenalty,
    );
  }

  let deposited = 0;
  let dissipated = 0;
  for (let pass = 0; pass < TRANSPORT_PASSES; pass += 1) {
    scratch2.fill(0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        let remaining = scratch[id];
        if (remaining <= 0) continue;
        const maxSediment = maxSedimentForCell(grid, id, elev[id] - seaLevel);
        const saturation = clamp01(sediment[id] / Math.max(0.001, maxSediment));
        const sinkEfficiency = 0.32 + pass * 0.12;
        const localCapacity = sedimentCapacity[id] * (1 - saturation * 0.82) * sinkEfficiency * 0.018 * dt;
        const localDeposit = Math.min(remaining, Math.max(0, localCapacity));
        if (localDeposit > 0) {
          sedimentSink[id] += localDeposit;
          remaining -= localDeposit;
          deposited += localDeposit;
        }
        if (remaining <= 0) continue;

        const centerElev = elev[id];
        const deterministicJitter = 0.82 + (((id * 1103515245 + pass * 1013904223) >>> 0) % 997) / 997 * 0.18;
        let weightSum = 0;
        let fallback = -1;
        let fallbackScore = -Infinity;
        const candidates = [];
        visitNeighbor8(grid, x, y, (nid, diagonal) => {
          const downslope = Math.max(0, centerElev - elev[nid]);
          const attraction =
            basin[nid] * 0.55 +
            forelandBasin[nid] * 0.5 +
            passiveMargin[nid] * 0.38 +
            continentalShelf[nid] * 0.52 +
            continentalRise[nid] * 0.34 +
            inlandWaterCandidate[nid] * 0.48 +
            sedimentCapacity[nid] * 0.62 +
            abyssalPlain[nid] * 0.12;
          const constructivePenalty = ridge[nid] * 0.48 + ridgeAxis[nid] * 0.58 + activeOrogeny[nid] * 0.24;
          const bend = 0.88 + Math.min(0.3, (axisCurvature?.[nid] ?? 0) * 0.16 + (weakness?.[nid] ?? 0) * 0.08);
          const score = downslope * 12 + attraction - constructivePenalty;
          const weight = Math.max(0, score) * (diagonal ? 0.68 : 1) * bend * deterministicJitter;
          if (weight > 0) {
            candidates.push([nid, weight]);
            weightSum += weight;
          }
          if (score > fallbackScore) {
            fallback = nid;
            fallbackScore = score;
          }
        });

        if (weightSum > 0) {
          const travel = remaining * (0.72 - pass * 0.08);
          const localLoss = remaining - travel;
          dissipated += localLoss;
          for (const [nid, weight] of candidates) scratch2[nid] += travel * (weight / weightSum);
        } else if (fallback >= 0 && sedimentCapacity[fallback] > sedimentCapacity[id] * 0.95) {
          const travel = remaining * 0.42;
          scratch2[fallback] += travel;
          dissipated += remaining - travel;
        } else {
          const extraDeposit = Math.min(remaining, Math.max(0, sedimentCapacity[id] * 0.006 * dt));
          sedimentSink[id] += extraDeposit;
          deposited += extraDeposit;
          dissipated += remaining - extraDeposit;
        }
      }
    }
    scratch.set(scratch2);
    for (let i = 0; i < size; i += 1) sedimentFlux[i] += scratch[i];
  }

  let compactionTotal = 0;
  for (let i = 0; i < size; i += 1) {
    const maxSediment = maxSedimentForCell(grid, i, elev[i] - seaLevel);
    const saturation = clamp01(sediment[i] / Math.max(0.001, maxSediment));
    const gain = sedimentSink[i] * (0.72 + sedimentCapacity[i] * 0.42) * (1 - saturation * 0.72);
    sediment[i] = Math.min(maxSediment, sediment[i] + Math.max(0, gain));

    const compaction = Math.min(sediment[i] * 0.12, sediment[i] * sediment[i] * 0.0024 * dt);
    sedimentCompaction[i] = compaction;
    sediment[i] = Math.max(0, sediment[i] - compaction * 0.62);
    compactionTotal += compaction;

    const typeFactor = crustType[i] === CrustType.TRANSITIONAL ? 1.2 : crustType[i] === CrustType.OCEANIC ? 0.9 : 0.6;
    sedimentLoadSubsidence[i] = sediment[i] * 0.028 * typeFactor;
    depositionRate[i] = sedimentSink[i] / Math.max(0.000001, dt);
    basin[i] = Math.max(0, Math.min(1, basin[i] + sedimentSink[i] * 0.08 - sediment[i] * sedimentCapacity[i] * 0.0009 * dt));
  }

  const massAfter = sumField(sediment);
  const massDelta = massAfter - massBefore;
  const budgetErrorValue = produced
    ? Math.abs(produced - deposited - compactionTotal - dissipated) / Math.max(0.000001, produced)
    : 0;
  sedimentBudgetError.fill(Math.min(1, budgetErrorValue));

  const diagnostics = measureSedimentBudget(world, {
    produced,
    deposited,
    dissipated,
    compactionTotal,
    massBefore,
    massAfter,
    massDelta,
    budgetErrorValue,
  });
  world.sedimentBudgetStep = world.step;
  world.sedimentBudgetDiagnostics = diagnostics;
  return diagnostics;
}

export function getSedimentBudgetDiagnostics(world) {
  return world.sedimentBudgetDiagnostics ?? measureSedimentBudget(world, {
    produced: sumField(world.grid.erosionSource),
    deposited: sumField(world.grid.sedimentSink),
    dissipated: 0,
    compactionTotal: sumField(world.grid.sedimentCompaction),
    massBefore: sumField(world.grid.sediment),
    massAfter: sumField(world.grid.sediment),
    massDelta: 0,
    budgetErrorValue: averageField(world.grid.sedimentBudgetError),
  });
}

function measureSedimentBudget(world, totals) {
  const { grid } = world;
  const {
    size,
    erosionSource,
    sedimentFlux,
    sedimentSink,
    sedimentCapacity,
    sedimentCompaction,
    sedimentLoadSubsidence,
    sediment,
    passiveMargin,
    continentalShelf,
    continentalRise,
    sedimentWedge,
    basin,
    forelandBasin,
    trench,
    trenchAxis,
    inlandWaterCandidate,
    abyssalPlain,
    activeOrogeny,
    oldOrogeny,
    mountainBelt,
  } = grid;

  let mountainErosion = 0;
  let passiveMarginDeposition = 0;
  let basinDeposition = 0;
  let trenchForearcDeposition = 0;
  let inlandBasinDeposition = 0;
  let shelfDeposition = 0;
  let abyssalDeposition = 0;
  let overfilled = 0;
  let shallowSeaHighSediment = 0;
  let shallowSea = 0;

  for (let i = 0; i < size; i += 1) {
    const sink = sedimentSink[i];
    const mountainMask = Math.max(activeOrogeny[i], oldOrogeny[i], mountainBelt[i]);
    mountainErosion += erosionSource[i] * clamp01(mountainMask * 3.2);
    passiveMarginDeposition += sink * clamp01(passiveMargin[i] + continentalShelf[i] + continentalRise[i] + sedimentWedge[i]);
    basinDeposition += sink * clamp01(basin[i] + forelandBasin[i]);
    trenchForearcDeposition += sink * clamp01(trench[i] + trenchAxis[i]);
    inlandBasinDeposition += sink * (inlandWaterCandidate[i] ? 1 : 0);
    shelfDeposition += sink * clamp01(continentalShelf[i] + continentalRise[i] + sedimentWedge[i]);
    abyssalDeposition += sink * clamp01(abyssalPlain[i]);
    if (sediment[i] > maxSedimentForCell(grid, i, grid.elev[i] - world.seaLevel) * 0.92) overfilled += 1;
    if (grid.elev[i] < world.seaLevel && world.seaLevel - grid.elev[i] < 0.05) {
      shallowSea += 1;
      if (sediment[i] > 0.38) shallowSeaHighSediment += 1;
    }
  }

  return {
    erosionSourceMean: averageField(erosionSource),
    erosionSourceTotal: totals.produced,
    depositionTotal: totals.deposited,
    sedimentFluxMean: averageField(sedimentFlux),
    sedimentSinkMean: averageField(sedimentSink),
    sedimentCapacityMean: averageField(sedimentCapacity),
    sedimentCompactionMean: averageField(sedimentCompaction),
    sedimentLoadSubsidenceMean: averageField(sedimentLoadSubsidence),
    sedimentBudgetError: totals.budgetErrorValue,
    sedimentMassBefore: totals.massBefore,
    sedimentMassAfter: totals.massAfter,
    sedimentMassDelta: totals.massDelta,
    mountainErosionShare: totals.produced ? mountainErosion / totals.produced : 0,
    passiveMarginDepositionShare: totals.deposited ? passiveMarginDeposition / totals.deposited : 0,
    basinDepositionShare: totals.deposited ? basinDeposition / totals.deposited : 0,
    trenchForearcDepositionShare: totals.deposited ? trenchForearcDeposition / totals.deposited : 0,
    inlandBasinDepositionShare: totals.deposited ? inlandBasinDeposition / totals.deposited : 0,
    sedimentOverfillShare: overfilled / size,
    sedimentPatchiness: measurePatchiness(grid, sediment),
    sedimentStraightnessRisk: measureStraightnessRisk(grid, sediment),
    sedimentSeaFillRisk: shallowSea ? shallowSeaHighSediment / shallowSea : 0,
    sedimentShelfConcentration: totals.deposited ? shelfDeposition / totals.deposited : 0,
    sedimentAbyssalConcentration: totals.deposited ? abyssalDeposition / totals.deposited : 0,
    sedimentResidualDissipation: totals.dissipated,
  };
}

function maxSedimentForCell(grid, id, relativeElevation) {
  if (grid.ridge[id] > 0.12 || grid.ridgeAxis[id] > 0.08) return 0.18;
  const shelf = Math.max(grid.continentalShelf[id], grid.sedimentWedge[id]);
  if (shelf > 0.08) return 0.65 + shelf * 0.08;
  if (grid.continentalRise[id] > 0.08) return 0.75;
  if (grid.passiveMargin[id] > 0.08) return 0.8;
  if (grid.forelandBasin[id] > 0.08) return 0.7;
  if (grid.riftStage[id] > 0 || grid.riftAxis[id] > 0.08) return 0.55;
  if (grid.abyssalPlain[id] > 0.08) return 0.45;
  if (grid.crustType[id] === CrustType.OCEANIC) return relativeElevation < 0 ? 0.35 : 0.28;
  return relativeElevation < 0 ? 0.42 : 0.3;
}

function localSlope(grid, field, x, y) {
  const left = field[y * grid.width + wrapX(grid.width, x - 1)];
  const right = field[y * grid.width + wrapX(grid.width, x + 1)];
  const up = field[Math.max(0, y - 1) * grid.width + x];
  const down = field[Math.min(grid.height - 1, y + 1) * grid.width + x];
  return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
}

function localRelief(grid, field, x, y) {
  const center = field[y * grid.width + x];
  let maxDelta = 0;
  forEachNeighbor4(grid, x, y, (nx, ny) => {
    maxDelta = Math.max(maxDelta, Math.abs(center - field[ny * grid.width + nx]));
  });
  return maxDelta;
}

function visitNeighbor8(grid, x, y, visit) {
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= grid.height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(grid.width, x + dx);
      visit(ny * grid.width + nx, dx !== 0 && dy !== 0);
    }
  }
}

function measurePatchiness(grid, field) {
  let total = 0;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      total += localRelief(grid, field, x, y);
    }
  }
  return total / grid.size;
}

function measureStraightnessRisk(grid, field) {
  let total = 0;
  let straight = 0;
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const id = y * grid.width + x;
      if (field[id] < 0.05) continue;
      total += 1;
      const horizontal = sameBand(grid, field, x - 1, y, field[id]) + sameBand(grid, field, x + 1, y, field[id]);
      const vertical = sameBand(grid, field, x, y - 1, field[id]) + sameBand(grid, field, x, y + 1, field[id]);
      const diagA = sameBand(grid, field, x - 1, y - 1, field[id]) + sameBand(grid, field, x + 1, y + 1, field[id]);
      const diagB = sameBand(grid, field, x + 1, y - 1, field[id]) + sameBand(grid, field, x - 1, y + 1, field[id]);
      if (Math.max(horizontal, vertical, diagA, diagB) >= 2 && grid.boundaryInfluence[id] < 0.16) straight += 1;
    }
  }
  return total ? straight / total : 0;
}

function sameBand(grid, field, x, y, value) {
  if (y < 0 || y >= grid.height) return 0;
  const id = y * grid.width + wrapX(grid.width, x);
  return Math.abs(field[id] - value) < 0.018 ? 1 : 0;
}

function sumField(field) {
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) sum += field[i];
  return sum;
}

function averageField(field) {
  return field.length ? sumField(field) / field.length : 0;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
