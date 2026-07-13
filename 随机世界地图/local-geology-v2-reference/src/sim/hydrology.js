import { forEachNeighbor4ById, forEachNeighbor8ById, forEachNeighborRadiusById } from "./grid.js";
import { topologyForGrid } from "./topology.js";

const NO_FLOW = -1;
const ENDORHEIC_BASE_ID = 1_000_000;

export function deriveHydrology(world, terrain, options = {}) {
  const diagnostics = normalizeDiagnostics(options.diagnostics);
  const profile = options.profile ? createProfile() : null;
  const { grid } = world;
  const topology = topologyForGrid(grid);
  const { size, elev, crustType, sediment, basin, forelandBasin, orogenicSedimentSupply, sedimentSink: budgetSedimentSink, sedimentCapacity } = grid;
  const hydroElevation = timed(profile, "hydroElevation", () => smoothHydroElevation(topology, elev));
  const flowDirection = new Int8Array(size);
  const flowTarget = new Int32Array(size);
  const flowAccumulation = new Float32Array(size);
  const flowSlope = new Float32Array(size);
  const drainageBasinId = new Int32Array(size);
  const watershedId = new Int32Array(size);
  const riverMask = new Uint8Array(size);
  const riverStrength = new Float32Array(size);
  const riverOrder = new Uint8Array(size);
  const riverOutlet = new Uint8Array(size);
  const outletId = new Int32Array(size);
  const endorheicBasin = new Uint8Array(size);
  const endorheicSink = new Uint8Array(size);
  const depressionMask = new Uint8Array(size);
  const lakeCandidate = new Uint8Array(size);
  const wetlandCandidate = new Float32Array(size);
  const oceanConnectivity = new Uint8Array(size);
  const erodibility = new Float32Array(size);
  const permeability = new Float32Array(size);
  const sedimentSink = new Float32Array(size);

  flowDirection.fill(NO_FLOW);
  flowTarget.fill(NO_FLOW);
  outletId.fill(NO_FLOW);

  const prepared = timed(profile, "prepareMasks", () => {
    const landCells = [];
    let landCount = 0;
    let landArea = 0;
    let coastalLandCount = 0;
    let coastalLandArea = 0;
    for (let i = 0; i < size; i += 1) {
    if (terrain.externalSeaMask[i]) oceanConnectivity[i] = 2;
    else if (terrain.seaMask[i]) oceanConnectivity[i] = 1;

    const sed = sediment?.[i] ?? 0;
    const basinValue = basin?.[i] ?? 0;
    const slopePenalty = 1 - Math.min(1, terrain.slope[i] * 4.5);
    const type = crustType?.[i] ?? (terrain.landMask[i] ? 1 : 0);
    erodibility[i] = clamp01(0.22 + sed * 0.42 + terrain.slope[i] * 2.2 + (type === 2 ? 0.12 : 0));
    permeability[i] = clamp01(0.18 + sed * 0.48 + (type === 0 ? 0.08 : 0) - basinValue * 0.16);
    sedimentSink[i] = Math.max(
      budgetSedimentSink?.[i] ?? 0,
      clamp01(
        basinValue * 0.34 +
          (sedimentCapacity?.[i] ?? 0) * 0.5 +
          (forelandBasin?.[i] ?? 0) * 0.28 +
          sed * 0.18 +
          (orogenicSedimentSupply?.[i] ?? 0) * 0.12 +
          slopePenalty * (terrain.landMask[i] ? 0.1 : 0.18),
      ),
    );

    if (!terrain.landMask[i]) continue;
    landCells.push(i);
    landCount += 1;
    landArea += metricWeight(grid, i);
    flowAccumulation[i] = metricWeight(grid, i);
    if (touchesMask(topology, i, terrain.externalSeaMask, 8)) {
      coastalLandCount += 1;
      coastalLandArea += metricWeight(grid, i);
    }
  }
    return { landCells, landCount, landArea, coastalLandCount, coastalLandArea };
  });
  const { landCells, landCount, landArea, coastalLandCount, coastalLandArea } = prepared;
  const flowUnit = hydrologyFlowUnit(grid, landArea, landCount);

  timed(profile, "assignFlowTargets", () => assignFlowTargets(topology, world.seaLevel, terrain, hydroElevation, flowTarget, flowDirection, flowSlope, depressionMask, landCells));
  landCells.sort((a, b) => hydroElevation[b] - hydroElevation[a]);
  timed(profile, "accumulateFlow", () => accumulateFlow(terrain, flowTarget, flowAccumulation, landCells));

  const drainage = timed(profile, "assignDrainage", () => assignDrainage(grid, topology, terrain, flowTarget, flowAccumulation, drainageBasinId, watershedId, outletId, riverOutlet, endorheicBasin, endorheicSink, depressionMask, lakeCandidate, landCells, flowUnit, landArea));
  const riverThreshold = Math.max(12 * flowUnit, landArea * 0.002);
  timed(profile, "buildRivers", () => buildRivers(terrain, flowTarget, flowAccumulation, flowSlope, riverThreshold, riverMask, riverStrength, lakeCandidate, endorheicSink, landCells));
  if (diagnostics !== "none") {
    timed(profile, "assignRiverOrder", () => assignRiverOrder(terrain, flowTarget, flowAccumulation, riverMask, riverOrder, landCells));
    timed(profile, "buildWetlands", () => buildWetlands(topology, terrain, flowAccumulation, flowSlope, riverStrength, endorheicBasin, lakeCandidate, wetlandCandidate, landCells));
  }

  const hydrologyDiagnostics = timed(profile, diagnostics === "full" ? "diagnosticsFull" : "diagnosticsBasic", () => measureHydrologyDiagnostics({
    diagnostics,
    grid,
    size,
    landCount,
    landArea,
    coastalLandCount,
    coastalLandArea,
    flowTarget,
    flowAccumulation,
    drainageBasinId,
    outletId,
    riverMask,
    riverOutlet,
    depressionMask,
    endorheicBasin,
    lakeCandidate,
    terrain,
    drainage,
  }));
  if (profile) profile.total = sumProfile(profile.timingsMs);

  return {
    hydroElevation,
    externalSeaMask: terrain.externalSeaMask,
    oceanConnectivity,
    inlandWaterCandidate: terrain.inlandWaterCandidate,
    closedBasinId: terrain.closedBasinId,
    flowDirection,
    flowTarget,
    flowAccumulation,
    flowSlope,
    drainageBasinId,
    watershedId,
    riverMask,
    riverStrength,
    riverOrder,
    riverOutlet,
    outletId,
    endorheicBasin,
    endorheicSink,
    depressionMask,
    lakeCandidate,
    wetlandCandidate,
    slope: terrain.slope,
    erodibility,
    permeability,
    sedimentSink,
    sediment: new Float32Array(grid.sediment),
    sedimentCapacity: new Float32Array(grid.sedimentCapacity),
    basin: new Float32Array(grid.basin),
    drainageGradientPotential: terrain.reliefDiagnostics.drainageGradientPotential,
    flatLandMask: terrain.flatLandMask,
    largePlainMask: terrain.largePlainMask,
    seaLevel: world.seaLevel,
    baseSeaLevel: terrain.geologicSeaLevelDiagnostics.baseSeaLevel,
    geologicSeaLevelOffset: terrain.geologicSeaLevelDiagnostics.geologicSeaLevelOffset,
    coastalSensitivity: terrain.coastalSensitivity,
    forelandBasin: new Float32Array(grid.forelandBasin),
    orogenicSedimentSupply: new Float32Array(grid.orogenicSedimentSupply),
    continentalRise: terrain.continentalRise,
    hydrologyDiagnostics,
    hydrologyProfile: profile,
  };
}

function assignFlowTargets(topology, seaLevel, terrain, hydroElevation, flowTarget, flowDirection, flowSlope, depressionMask, landCells) {
  const epsilon = 1e-7;
  for (const id of landCells) {
    let bestTarget = NO_FLOW;
    let bestDrop = 0;
    let bestDirection = NO_FLOW;
    let bestDistance = 1;
    forEachHydrologyNeighbor8(topology, id, (nid, dx, dy) => {
      let targetElevation;
      if (terrain.externalSeaMask[nid]) {
        targetElevation = seaLevel;
      } else if (terrain.inlandWaterCandidate[nid]) {
        targetElevation = Math.min(seaLevel, hydroElevation[nid]);
      } else if (terrain.landMask[nid]) {
        targetElevation = hydroElevation[nid];
      } else {
        return;
      }
      const distance = Math.max(1, topology.distance(id, nid));
      const drop = (hydroElevation[id] - targetElevation) / distance;
      if (drop <= bestDrop + epsilon) return;
      bestDrop = drop;
      bestTarget = nid;
      bestDirection = directionCode(dx, dy);
      bestDistance = distance;
    });
    if (bestTarget >= 0) {
      flowTarget[id] = bestTarget;
      flowDirection[id] = bestDirection;
      flowSlope[id] = bestDrop;
    } else {
      depressionMask[id] = 1;
    }
  }
}

function accumulateFlow(terrain, flowTarget, flowAccumulation, landCells) {
  for (const id of landCells) {
    const target = flowTarget[id];
    if (target < 0) continue;
    flowAccumulation[target] += flowAccumulation[id];
  }
  for (let i = 0; i < flowAccumulation.length; i += 1) {
    if (!Number.isFinite(flowAccumulation[i])) flowAccumulation[i] = 0;
    if (!terrain.landMask[i] && !terrain.inlandWaterCandidate[i] && !terrain.externalSeaMask[i]) flowAccumulation[i] = 0;
  }
}

function assignDrainage(grid, topology, terrain, flowTarget, flowAccumulation, drainageBasinId, watershedId, outletId, riverOutlet, endorheicBasin, endorheicSink, depressionMask, lakeCandidate, landCells, flowUnit, landArea) {
  const outletIds = new Map();
  const sinkIds = new Map();
  const basinSizes = new Map();
  const basinAreas = new Map();
  let nextOutletId = 1;
  let nextSinkId = ENDORHEIC_BASE_ID;
  let flowCycleCount = 0;
  let orphanCount = 0;
  let orphanArea = 0;
  let exorheicLand = 0;
  let exorheicArea = 0;
  let endorheicLand = 0;
  let endorheicArea = 0;
  let closedBasinDrainage = 0;
  let closedBasinDrainageArea = 0;

  for (const start of landCells) {
    const path = [];
    const seen = new Set();
    let id = start;
    let finalType = "orphan";
    let finalId = 0;
    let finalOutletId = NO_FLOW;
    let finalSink = NO_FLOW;
    let previousLand = start;

    while (id >= 0) {
      if (terrain.externalSeaMask[id]) {
        finalType = "external";
        finalSink = id;
        const outletCell = previousLand;
        if (!outletIds.has(outletCell)) outletIds.set(outletCell, nextOutletId++);
        finalOutletId = outletIds.get(outletCell);
        riverOutlet[outletCell] = 1;
        finalId = finalOutletId;
        break;
      }
      if (terrain.inlandWaterCandidate[id] || terrain.closedBasinId[id] > 0) {
        finalType = "closed";
        finalSink = id;
        const key = terrain.closedBasinId[id] > 0 ? -terrain.closedBasinId[id] : id;
        if (!sinkIds.has(key)) sinkIds.set(key, nextSinkId++);
        finalId = sinkIds.get(key);
        finalOutletId = -finalId;
        break;
      }
      if (!terrain.landMask[id]) {
        finalType = "orphan";
        finalSink = id;
        break;
      }
      if (seen.has(id)) {
        flowCycleCount += 1;
        finalType = "closed";
        finalSink = lowestPathCell(path, terrain, id);
        if (!sinkIds.has(finalSink)) sinkIds.set(finalSink, nextSinkId++);
        finalId = sinkIds.get(finalSink);
        finalOutletId = -finalId;
        break;
      }
      if (drainageBasinId[id]) {
        finalId = drainageBasinId[id];
        finalOutletId = outletId[id];
        finalType = finalOutletId > 0 ? "external" : "closed";
        finalSink = finalOutletId > 0 ? NO_FLOW : endorheicSinkIndex(endorheicSink, id);
        break;
      }
      seen.add(id);
      path.push(id);
      const next = flowTarget[id];
      if (next < 0) {
        finalType = "closed";
        finalSink = id;
        if (!sinkIds.has(finalSink)) sinkIds.set(finalSink, nextSinkId++);
        finalId = sinkIds.get(finalSink);
        finalOutletId = -finalId;
        break;
      }
      previousLand = terrain.landMask[id] ? id : previousLand;
      id = next;
    }

    if (!finalId) {
      orphanCount += path.length || 1;
      orphanArea += pathArea(grid, path.length ? path : [start]);
      continue;
    }

    for (const cell of path) {
      const area = metricWeight(grid, cell);
      drainageBasinId[cell] = finalId;
      watershedId[cell] = finalId;
      outletId[cell] = finalOutletId;
      basinSizes.set(finalId, (basinSizes.get(finalId) ?? 0) + 1);
      basinAreas.set(finalId, (basinAreas.get(finalId) ?? 0) + area);
      if (finalType === "external") {
        exorheicLand += 1;
        exorheicArea += area;
      } else {
        endorheicBasin[cell] = 1;
        endorheicLand += 1;
        endorheicArea += area;
        if (finalType === "closed") {
          closedBasinDrainage += 1;
          closedBasinDrainageArea += area;
        }
      }
    }

    if (finalType !== "external" && finalSink >= 0) {
      if (terrain.landMask[finalSink]) {
        endorheicSink[finalSink] = 1;
        depressionMask[finalSink] = 1;
      }
      if (flowAccumulation[finalSink] >= Math.max(10 * flowUnit, landArea * 0.0012) || terrain.inlandWaterCandidate[finalSink]) {
        lakeCandidate[finalSink] = 1;
        if (terrain.landMask[finalSink]) {
          forEachHydrologyNeighbor8(topology, finalSink, (nid) => {
            if (terrain.landMask[nid] && flowAccumulation[nid] >= Math.max(6 * flowUnit, flowAccumulation[finalSink] * 0.35)) lakeCandidate[nid] = 1;
          });
        }
      }
    }
  }

  return {
    flowCycleCount,
    orphanCount,
    orphanArea,
    exorheicLand,
    exorheicArea,
    endorheicLand,
    endorheicArea,
    closedBasinDrainage,
    closedBasinDrainageArea,
    outletCount: outletIds.size,
    endorheicBasinCount: sinkIds.size,
    largestWatershed: maxIterableValue(basinSizes.values()),
    largestWatershedArea: maxIterableValue(basinAreas.values()),
  };
}

function buildRivers(terrain, flowTarget, flowAccumulation, flowSlope, riverThreshold, riverMask, riverStrength, lakeCandidate, endorheicSink, landCells) {
  let maxAccumulation = 1;
  for (const id of landCells) maxAccumulation = Math.max(maxAccumulation, flowAccumulation[id]);
  const logMax = Math.log1p(maxAccumulation);
  for (const id of landCells) {
    const acc = flowAccumulation[id];
    const accNorm = logMax > 0 ? Math.log1p(acc) / logMax : 0;
    const slopeModifier = 0.65 + Math.min(0.35, Math.sqrt(Math.max(0, flowSlope[id]) * 72) * 0.08);
    riverStrength[id] = clamp01(accNorm * slopeModifier);
    if (acc >= riverThreshold && (flowTarget[id] >= 0 || lakeCandidate[id] || endorheicSink[id])) riverMask[id] = 1;
  }
}

function assignRiverOrder(terrain, flowTarget, flowAccumulation, riverMask, riverOrder, landCells) {
  const sameOrderHits = new Uint8Array(riverOrder.length);
  for (const id of landCells) {
    if (!riverMask[id]) continue;
    if (!riverOrder[id]) riverOrder[id] = 1;
    const target = flowTarget[id];
    if (target < 0 || !terrain.landMask[target] || !riverMask[target]) continue;
    const order = riverOrder[id];
    if (order > riverOrder[target]) {
      riverOrder[target] = order;
      sameOrderHits[target] = 1;
    } else if (order === riverOrder[target]) {
      sameOrderHits[target] += 1;
      if (sameOrderHits[target] >= 2) riverOrder[target] = Math.min(255, riverOrder[target] + 1);
    }
    if (flowAccumulation[target] > flowAccumulation[id] * 1.6 && riverOrder[target] < riverOrder[id]) riverOrder[target] = riverOrder[id];
  }
}

function buildWetlands(topology, terrain, flowAccumulation, flowSlope, riverStrength, endorheicBasin, lakeCandidate, wetlandCandidate, landCells) {
  for (const id of landCells) {
    const lowSlope = 1 - Math.min(1, flowSlope[id] * 160);
    const coast = terrain.coastDistance[id] <= 3 ? 0.28 : 0;
    const basin = endorheicBasin[id] ? 0.22 : 0;
    const river = riverStrength[id] * 0.32;
    wetlandCandidate[id] = clamp01(lowSlope * (coast + basin + river) + (lakeCandidate[id] ? 0.55 : 0));
    if (!lakeCandidate[id]) continue;
    forEachHydrologyNeighbor8(topology, id, (nid) => {
      if (terrain.landMask[nid]) wetlandCandidate[nid] = Math.max(wetlandCandidate[nid], 0.28);
    });
  }
}

function measureHydrologyDiagnostics({
  diagnostics,
  grid,
  size,
  landCount,
  landArea,
  coastalLandCount,
  coastalLandArea,
  flowTarget,
  flowAccumulation,
  drainageBasinId,
  outletId,
  riverMask,
  riverOutlet,
  depressionMask,
  endorheicBasin,
  lakeCandidate,
  terrain,
  drainage,
}) {
  let assigned = 0;
  let assignedArea = 0;
  let depression = 0;
  let depressionArea = 0;
  let endorheic = 0;
  let endorheicArea = 0;
  let lake = 0;
  let lakeArea = 0;
  let river = 0;
  let riverArea = 0;
  let riverContinuous = 0;
  let riverOutletArea = 0;
  let external = 0;
  let externalArea = 0;
  let orphan = drainage.orphanCount;
  let orphanArea = drainage.orphanArea ?? drainage.orphanCount;
  let max = 0;
  const full = diagnostics === "full";
  const accumulations = full ? [] : null;
  const graphBacked = isGraphBackedGrid(grid);
  const totalArea = graphBacked ? totalMetricArea(grid) : size;
  const landDenominator = graphBacked ? landArea : landCount;
  const coastalLandDenominator = graphBacked ? coastalLandArea : coastalLandCount;

  for (let i = 0; i < size; i += 1) {
    const area = metricWeight(grid, i);
    if (terrain.landMask[i]) {
      if (flowTarget[i] >= 0) {
        assigned += 1;
        assignedArea += area;
      }
      if (depressionMask[i]) {
        depression += 1;
        depressionArea += area;
      }
      if (endorheicBasin[i]) {
        endorheic += 1;
        endorheicArea += area;
      }
      if (outletId[i] > 0) {
        external += 1;
        externalArea += area;
      }
      if (!drainageBasinId[i]) {
        orphan += 1;
        orphanArea += area;
      }
      if (flowAccumulation[i] > max) max = flowAccumulation[i];
      if (full) accumulations.push(flowAccumulation[i]);
    }
    if (lakeCandidate[i]) {
      lake += 1;
      lakeArea += area;
    }
    if (riverOutlet[i]) riverOutletArea += area;
    if (riverMask[i]) {
      river += 1;
      riverArea += area;
      if (full) {
        const target = flowTarget[i];
        if (target >= 0 && (!terrain.landMask[target] || riverMask[target])) riverContinuous += 1;
        else if (lakeCandidate[i] || depressionMask[i]) riverContinuous += 1;
      }
    }
  }

  let p95 = 0;
  if (full) {
    accumulations.sort((a, b) => a - b);
    p95 = accumulations.length ? accumulations[Math.min(accumulations.length - 1, Math.floor(accumulations.length * 0.95))] : 0;
    max = accumulations.length ? accumulations[accumulations.length - 1] : max;
  }
  const riverOutletCount = countMask(riverOutlet);

  return {
    hydrologyValid: drainage.flowCycleCount === 0 && shareValue(graphBacked ? orphanArea : orphan, landDenominator) < 0.001,
    flowAssignedShare: shareValue(graphBacked ? assignedArea : assigned, landDenominator),
    flowCycleCount: drainage.flowCycleCount,
    orphanFlowShare: shareValue(graphBacked ? orphanArea : orphan, landDenominator),
    depressionShare: shareValue(graphBacked ? depressionArea : depression, landDenominator),
    endorheicBasinCount: drainage.endorheicBasinCount,
    endorheicLandShare: shareValue(graphBacked ? endorheicArea : endorheic, landDenominator),
    lakeCandidateShare: shareValue(graphBacked ? lakeArea : lake, totalArea),
    riverCellShare: shareValue(graphBacked ? riverArea : river, landDenominator),
    riverContinuityScore: full ? (river ? riverContinuous / river : 1) : null,
    riverOutletCount,
    coastalOutletShare: full ? shareValue(graphBacked ? riverOutletArea : riverOutletCount, coastalLandDenominator) : null,
    externalSeaDrainageShare: shareValue(graphBacked ? externalArea : external, landDenominator),
    closedBasinDrainageShare: shareValue(graphBacked ? (drainage.closedBasinDrainageArea ?? drainage.closedBasinDrainage) : drainage.closedBasinDrainage, landDenominator),
    largestWatershedShare: full ? shareValue(graphBacked ? (drainage.largestWatershedArea ?? drainage.largestWatershed) : drainage.largestWatershed, landDenominator) : null,
    flowAccumulationP95: full ? p95 : null,
    flowAccumulationMax: max,
    riverResolutionDrift: 0,
    diagnosticsLevel: diagnostics,
  };
}

function normalizeDiagnostics(value) {
  if (value === "none" || value === "full") return value;
  return "basic";
}

function createProfile() {
  return { timingsMs: {}, total: 0 };
}

function timed(profile, name, fn) {
  if (!profile) return fn();
  const start = performance.now();
  const value = fn();
  profile.timingsMs[name] = (profile.timingsMs[name] ?? 0) + performance.now() - start;
  return value;
}

function sumProfile(timings) {
  let total = 0;
  for (const value of Object.values(timings)) total += value;
  return total;
}

function touchesMask(topology, id, mask, mode = 4) {
  let touches = false;
  const visit = mode === 8 ? forEachHydrologyNeighbor8 : forEachHydrologyNeighbor4;
  visit(topology, id, (nid) => {
    if (mask[nid]) touches = true;
  });
  return touches;
}

function directionCode(dx, dy) {
  if (dx > 0 && dy === 0) return 0;
  if (dx > 0 && dy > 0) return 1;
  if (dx === 0 && dy > 0) return 2;
  if (dx < 0 && dy > 0) return 3;
  if (dx < 0 && dy === 0) return 4;
  if (dx < 0 && dy < 0) return 5;
  if (dx === 0 && dy < 0) return 6;
  if (dx > 0 && dy < 0) return 7;
  return NO_FLOW;
}

function lowestPathCell(path, terrain, fallback) {
  let best = fallback;
  let bestElevation = terrain.relativeElevation[fallback] ?? Number.POSITIVE_INFINITY;
  for (const id of path) {
    const elevation = terrain.relativeElevation[id];
    if (elevation >= bestElevation) continue;
    bestElevation = elevation;
    best = id;
  }
  return best;
}

function endorheicSinkIndex(endorheicSink, fallback) {
  return endorheicSink[fallback] ? fallback : NO_FLOW;
}

function smoothHydroElevation(topology, field) {
  const output = new Float32Array(field.length);
  for (let i = 0; i < field.length; i += 1) {
    let total = field[i] * 2;
    let weight = 2;
    forEachHydrologyNeighborRadius(topology, i, 1, (nid, dx, dy) => {
      const distance = Math.max(1, Math.hypot(dx, dy));
      const w = 1 / (1 + distance);
      total += field[nid] * w;
      weight += w;
    });
    output[i] = total / weight;
  }
  return output;
}

function forEachHydrologyNeighbor4(topology, id, visit) {
  if (isGraphBackedGrid(topology.grid) && typeof topology.forEachNeighbor === "function") {
    topology.forEachNeighbor(id, (nid, slot, edgeLength) => {
      visit(nid, 0, 0, edgeLength, slot);
    });
    return;
  }
  if (typeof topology.forEachNeighbor4 === "function") {
    topology.forEachNeighbor4(id, visit);
    return;
  }
  forEachNeighbor4ById(topology.grid, id, visit);
}

function forEachHydrologyNeighbor8(topology, id, visit) {
  if (isGraphBackedGrid(topology.grid) && typeof topology.forEachNeighbor === "function") {
    topology.forEachNeighbor(id, (nid, slot, edgeLength) => {
      visit(nid, 0, 0, edgeLength, slot);
    });
    return;
  }
  if (typeof topology.forEachNeighbor8 === "function") {
    topology.forEachNeighbor8(id, visit);
    return;
  }
  forEachNeighbor8ById(topology.grid, id, visit);
}

function forEachHydrologyNeighborRadius(topology, id, radius, visit) {
  if (isGraphBackedGrid(topology.grid) && typeof topology.forEachNeighborRing === "function") {
    topology.forEachNeighborRing(id, radius, (nid, depth) => {
      visit(nid, depth, 0);
    });
    return;
  }
  if (typeof topology.forEachNeighborRadius === "function") {
    topology.forEachNeighborRadius(id, radius, visit);
    return;
  }
  forEachNeighborRadiusById(topology.grid, id, radius, visit);
}

function maxIterableValue(values) {
  let max = 0;
  for (const value of values) {
    if (value > max) max = value;
  }
  return max;
}

function countMask(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) count += mask[i] ? 1 : 0;
  return count;
}

function metricWeight(grid, id) {
  if (!isGraphBackedGrid(grid)) return 1;
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function totalMetricArea(grid) {
  if (!isGraphBackedGrid(grid)) return grid.size ?? 0;
  let total = 0;
  for (let i = 0; i < grid.size; i += 1) total += metricWeight(grid, i);
  return total;
}

function pathArea(grid, path) {
  let total = 0;
  for (const id of path) total += metricWeight(grid, id);
  return total;
}

function hydrologyFlowUnit(grid, landArea, landCount) {
  if (!isGraphBackedGrid(grid)) return 1;
  return landArea / Math.max(1, landCount);
}

function shareValue(value, denominator) {
  return value / Math.max(Number.EPSILON, denominator);
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
