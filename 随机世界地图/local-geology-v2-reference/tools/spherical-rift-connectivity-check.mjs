import { getHydrologyInputs, getResourceInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { CrustType } from "../src/sim/geology/crust.js";
import { deriveOceanConnectivity, RiftStage, updateRiftStages } from "../src/sim/geology/rift.js";
import { BoundaryType } from "../src/sim/tectonics.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { weightedShare } from "../src/sim/sphere/stats.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 55)));

const world = createCheckWorld({
  seedText,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize,
});

runToCheckpoints(world, [steps], () => null);

const natural = measureWorld(world);
const controlled = measureControlledRiftScenario(seedText, faceSize);

const checks = {
  cubedSphereGrid: natural.metrics.topologyKind === "cubed-sphere" && controlled.metrics.topologyKind === "cubed-sphere",
  graphBacked: natural.metrics.graphBacked && controlled.metrics.graphBacked,
  saneSeaRatio: natural.metrics.seaRatio > 0.2 && natural.metrics.seaRatio < 0.9,
  externalSeaPresent: natural.metrics.externalSeaShare > 0.05,
  connectivityConsistent: natural.metrics.seaConnectivityMismatchShare === 0 && controlled.metrics.seaConnectivityMismatchShare === 0,
  inlandCandidatesConsistent: natural.metrics.inlandCandidateMismatchShare === 0 && controlled.metrics.inlandCandidateMismatchShare === 0,
  closedBasinLabelsConsistent: natural.metrics.closedBasinLabelMismatchShare === 0 && controlled.metrics.closedBasinLabelMismatchShare === 0,
  closedBasinsSeparateFromExternalSea: natural.metrics.closedBasinExternalOverlapShare === 0 && controlled.metrics.closedBasinExternalOverlapShare === 0,
  controlledRiftStagesPresent: controlled.metrics.activeRiftShare > 0.002,
  controlledRiftStagesNotDominant: controlled.metrics.activeRiftShare < 0.45,
  controlledProtoOceanNotExternalSea: controlled.metrics.protoOceanConnectedShare < 0.05,
  controlledYoungOceanConnectedWhenPresent: controlled.metrics.connectedYoungOceanShare === 0 || controlled.metrics.connectedYoungOceanExternalSeaShare > 0.75,
  controlledBelowSeaRiftsRemainCandidatesWhenUnconnected: controlled.metrics.unconnectedBelowSeaRiftShare === 0 || controlled.metrics.belowSeaRiftInlandCandidateShare > 0.75,
  controlledInlandRiftsDoNotLeakToExternalSea: controlled.metrics.inlandRiftExternalSeaLeakShare < 0.08,
  naturalRiftCoastNotHardBoundaryDominated: natural.metrics.riftCoastBoundaryShare < 0.82,
  naturalRiftStageSeamsContinuous: natural.metrics.riftStageSeamDiffToInteriorRatio < 1.8,
  controlledRiftStageSeamsContinuous: controlled.metrics.riftStageSeamDiffToInteriorRatio < 1.8,
  naturalSeaSeamsContinuous: natural.metrics.seaMaskSeamDiffToInteriorRatio < 1.8,
  controlledSeaSeamsContinuous: controlled.metrics.seaMaskSeamDiffToInteriorRatio < 1.8,
  naturalExternalSeaSeamsContinuous: natural.metrics.externalSeaSeamDiffToInteriorRatio < 1.8,
  controlledExternalSeaSeamsContinuous: controlled.metrics.externalSeaSeamDiffToInteriorRatio < 1.8,
  naturalInlandWaterSeamsContinuous: natural.metrics.inlandWaterSeamDiffToInteriorRatio < 1.8,
  controlledInlandWaterSeamsContinuous: controlled.metrics.inlandWaterSeamDiffToInteriorRatio < 1.8,
};

const failures = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

const result = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  steps,
  failures,
  checks,
  metrics: {
    ...prefixMetrics("natural", natural.metrics),
    ...prefixMetrics("controlled", controlled.metrics),
    topologyKind: natural.metrics.topologyKind,
    graphBacked: natural.metrics.graphBacked,
    faceSize,
    steps,
    cellCount: natural.metrics.cellCount,
    externalSeaShare: natural.metrics.externalSeaShare,
    inlandWaterCandidateShare: natural.metrics.inlandWaterCandidateShare,
    closedBasinCount: natural.metrics.closedBasinCount,
    activeRiftShare: controlled.metrics.activeRiftShare,
    protoOceanShare: controlled.metrics.protoOceanShare,
    connectedYoungOceanShare: controlled.metrics.connectedYoungOceanShare,
    protoOceanConnectedShare: controlled.metrics.protoOceanConnectedShare,
    connectedYoungOceanExternalSeaShare: controlled.metrics.connectedYoungOceanExternalSeaShare,
    unconnectedBelowSeaRiftShare: controlled.metrics.unconnectedBelowSeaRiftShare,
    belowSeaRiftInlandCandidateShare: controlled.metrics.belowSeaRiftInlandCandidateShare,
    inlandRiftExternalSeaLeakShare: controlled.metrics.inlandRiftExternalSeaLeakShare,
    riftStageSeamDiffToInteriorRatio: controlled.metrics.riftStageSeamDiffToInteriorRatio,
    seaConnectivityMismatchShare: Math.max(natural.metrics.seaConnectivityMismatchShare, controlled.metrics.seaConnectivityMismatchShare),
    inlandCandidateMismatchShare: Math.max(natural.metrics.inlandCandidateMismatchShare, controlled.metrics.inlandCandidateMismatchShare),
    closedBasinLabelMismatchShare: Math.max(natural.metrics.closedBasinLabelMismatchShare, controlled.metrics.closedBasinLabelMismatchShare),
  },
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureWorld(world) {
  const grid = world.grid;
  const terrain = getTerrainDerived(world);
  const hydrology = getHydrologyInputs(world);
  const resources = getResourceInputs(world);
const seaMask = terrain.seaMask;
const externalSeaMask = hydrology.externalSeaMask;
const inlandWaterCandidate = terrain.inlandWaterCandidate;
const closedBasinId = hydrology.closedBasinId;
const riftStage = resources.riftStage;
const stageHistogram = weightedHistogram(grid, riftStage, 6);
const topology = topologyForGrid(grid);

const connectivityDelta = measureConnectivityDelta(grid, seaMask, externalSeaMask, inlandWaterCandidate, closedBasinId);
const riftMetrics = measureRiftConnectivity(grid, terrain, hydrology, riftStage);
const seamMetrics = measureRiftSeamContinuity(grid, topology, riftStage, seaMask, externalSeaMask, inlandWaterCandidate);
const closedBasinMetrics = measureClosedBasins(grid, closedBasinId, externalSeaMask);

  return {
    terrain,
    hydrology,
    resources,
    metrics: {
      topologyKind: grid.topologyKind ?? null,
      graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
      faceSize: grid.faceSize ?? faceSize,
      steps: world.step,
      cellCount: grid.size,
      landRatio: weightedShare(grid, terrain.landMask),
      seaRatio: weightedShare(grid, seaMask),
      externalSeaShare: weightedShare(grid, externalSeaMask),
      inlandWaterCandidateShare: weightedShare(grid, inlandWaterCandidate),
      closedBasinCount: closedBasinMetrics.closedBasinCount,
      closedBasinExternalOverlapShare: closedBasinMetrics.externalOverlapShare,
      riftStageHistogram: stageHistogram,
      activeRiftShare: riftMetrics.activeRiftShare,
      protoOceanShare: riftMetrics.protoOceanShare,
      connectedYoungOceanShare: riftMetrics.connectedYoungOceanShare,
      protoOceanConnectedShare: riftMetrics.protoOceanConnectedShare,
      connectedYoungOceanExternalSeaShare: riftMetrics.connectedYoungOceanExternalSeaShare,
      unconnectedBelowSeaRiftShare: riftMetrics.unconnectedBelowSeaRiftShare,
      belowSeaRiftInlandCandidateShare: riftMetrics.belowSeaRiftInlandCandidateShare,
      inlandRiftExternalSeaLeakShare: riftMetrics.inlandRiftExternalSeaLeakShare,
      riftCoastBoundaryShare: riftMetrics.riftCoastBoundaryShare,
      seaConnectivityMismatchShare: connectivityDelta.seaConnectivityMismatchShare,
      inlandCandidateMismatchShare: connectivityDelta.inlandCandidateMismatchShare,
      closedBasinLabelMismatchShare: connectivityDelta.closedBasinLabelMismatchShare,
      riftStageSeamDiffToInteriorRatio: seamMetrics.riftStageSeamDiffToInteriorRatio,
      seaMaskSeamDiffToInteriorRatio: seamMetrics.seaMaskSeamDiffToInteriorRatio,
      externalSeaSeamDiffToInteriorRatio: seamMetrics.externalSeaSeamDiffToInteriorRatio,
      inlandWaterSeamDiffToInteriorRatio: seamMetrics.inlandWaterSeamDiffToInteriorRatio,
    },
  };
}

function measureControlledRiftScenario(seedText, faceSize) {
  const world = createCheckWorld({
    seedText,
    resolution: "256x128",
    pipelineMode: "geology-v2",
    topologyMode: "cubed-sphere",
    projectionMode: "equirectangular",
    faceSize,
  });
  runToCheckpoints(world, [4], () => null);
  injectControlledRift(world);
  updateRiftStages(world);
  deriveOceanConnectivity(world);
  return measureWorld(world);
}

function injectControlledRift(world) {
  const { grid } = world;
  const topology = topologyForGrid(grid);
  const center = chooseControlledRiftCenter(grid);
  const near = topology.shortestDistanceSeeds(maskWithOne(grid, center));
  const seaLevel = world.seaLevel;
  for (let id = 0; id < grid.size; id += 1) {
    const distance = near[id];
    const riftCore = Number.isFinite(distance) ? Math.max(0, 1 - distance / 0.42) : 0;
    if (riftCore <= 0) continue;
    grid.crustType[id] = CrustType.CONTINENTAL;
    grid.crustThickness[id] = Math.min(grid.crustThickness[id], 0.34 + (1 - riftCore) * 0.06);
    grid.weakness[id] = Math.max(grid.weakness[id], 0.78 + riftCore * 0.14);
    grid.boundaryKind[id] = BoundaryType.DIVERGENT;
    grid.boundaryInfluence[id] = Math.max(grid.boundaryInfluence[id], 0.72 + riftCore * 0.18);
    grid.stress[id] = Math.max(grid.stress[id], 1.18 + riftCore * 0.38);
    grid.rift[id] = Math.max(grid.rift[id], 0.7 + riftCore * 0.25);
    grid.riftAge[id] = Math.max(grid.riftAge[id], 0.2 + riftCore * 0.12);
    grid.riftStage[id] = riftCore > 0.78 ? RiftStage.TRANSITIONAL_RIFT : RiftStage.RIFT_BASIN;
    grid.elev[id] = Math.min(grid.elev[id], seaLevel - 0.026 - riftCore * 0.018);
    grid.basin[id] = Math.max(grid.basin[id], 0.36 + riftCore * 0.2);
  }
  deriveOceanConnectivity(world);
}

function chooseControlledRiftCenter(grid) {
  let best = 0;
  let bestScore = -Infinity;
  const totalX = grid.positionX ?? grid.lon;
  const totalY = grid.positionY ?? grid.lat;
  const totalZ = grid.positionZ ?? grid.lon;
  for (let id = 0; id < grid.size; id += 1) {
    const oceanPenalty = grid.elev[id] < 0 ? 0.4 : 0;
    const seamPenalty = isFaceEdge(grid, id) ? 0.25 : 0;
    const score =
      Math.abs(totalX[id] ?? 0) * 0.12 +
      Math.abs(totalY[id] ?? 0) * 0.08 -
      Math.abs(totalZ[id] ?? 0) * 0.06 -
      oceanPenalty -
      seamPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function isFaceEdge(grid, id) {
  const u = grid.faceU?.[id] ?? 2;
  const v = grid.faceV?.[id] ?? 2;
  const max = (grid.faceSize ?? 4) - 1;
  return u <= 1 || v <= 1 || u >= max - 1 || v >= max - 1;
}

function maskWithOne(grid, id) {
  const mask = new Uint8Array(grid.size);
  mask[id] = 1;
  return mask;
}

function prefixMetrics(prefix, metrics) {
  const output = {};
  for (const [key, value] of Object.entries(metrics)) {
    output[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = value;
  }
  return output;
}

function measureConnectivityDelta(grid, seaMask, externalSeaMask, inlandWaterCandidate, closedBasinId) {
  let seaMismatch = 0;
  let inlandMismatch = 0;
  let labelMismatch = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    total += area;
    const expectedInland = seaMask[id] && !externalSeaMask[id] ? 1 : 0;
    if (externalSeaMask[id] && !seaMask[id]) seaMismatch += area;
    if ((inlandWaterCandidate[id] ? 1 : 0) !== expectedInland) inlandMismatch += area;
    if ((closedBasinId[id] > 0 ? 1 : 0) !== expectedInland) labelMismatch += area;
  }
  return {
    seaConnectivityMismatchShare: seaMismatch / Math.max(total, Number.EPSILON),
    inlandCandidateMismatchShare: inlandMismatch / Math.max(total, Number.EPSILON),
    closedBasinLabelMismatchShare: labelMismatch / Math.max(total, Number.EPSILON),
  };
}

function measureRiftConnectivity(grid, terrain, hydrology, riftStage) {
  let totalArea = 0;
  let activeRift = 0;
  let proto = 0;
  let protoConnected = 0;
  let connectedYoung = 0;
  let connectedYoungExternalSea = 0;
  let belowSeaRift = 0;
  let unconnectedBelowSeaRift = 0;
  let belowSeaRiftInlandCandidate = 0;
  let inlandRift = 0;
  let inlandRiftExternalSea = 0;
  let riftCoast = 0;
  let riftCoastNearBoundary = 0;

  for (let id = 0; id < grid.size; id += 1) {
    const area = metricArea(grid, id);
    totalArea += area;
    const stage = riftStage[id] ?? 0;
    if (stage > RiftStage.NONE) activeRift += area;
    if (stage === RiftStage.PROTO_OCEAN_CANDIDATE) {
      proto += area;
      if (hydrology.externalSeaMask[id]) protoConnected += area;
    }
    if (stage === RiftStage.CONNECTED_YOUNG_OCEAN) {
      connectedYoung += area;
      if (hydrology.externalSeaMask[id]) connectedYoungExternalSea += area;
    }
    if (stage > RiftStage.NONE && terrain.seaMask[id]) {
      belowSeaRift += area;
      if (!hydrology.externalSeaMask[id]) {
        unconnectedBelowSeaRift += area;
        if (terrain.inlandWaterCandidate[id]) belowSeaRiftInlandCandidate += area;
      }
    }
    if (stage > RiftStage.NONE && terrain.inlandWaterCandidate[id]) {
      inlandRift += area;
      if (hydrology.externalSeaMask[id]) inlandRiftExternalSea += area;
    }
    if (stage > RiftStage.NONE && isCoastCell(grid, terrain.seaMask, id)) {
      riftCoast += area;
      if (grid.boundaryInfluence[id] > 0.2 || grid.boundaryDistance[id] <= 1) riftCoastNearBoundary += area;
    }
  }

  return {
    activeRiftShare: activeRift / Math.max(totalArea, Number.EPSILON),
    protoOceanShare: proto / Math.max(totalArea, Number.EPSILON),
    connectedYoungOceanShare: connectedYoung / Math.max(totalArea, Number.EPSILON),
    protoOceanConnectedShare: proto ? protoConnected / proto : 0,
    connectedYoungOceanExternalSeaShare: connectedYoung ? connectedYoungExternalSea / connectedYoung : 0,
    unconnectedBelowSeaRiftShare: belowSeaRift ? unconnectedBelowSeaRift / belowSeaRift : 0,
    belowSeaRiftInlandCandidateShare: unconnectedBelowSeaRift ? belowSeaRiftInlandCandidate / unconnectedBelowSeaRift : 1,
    inlandRiftExternalSeaLeakShare: inlandRift ? inlandRiftExternalSea / inlandRift : 0,
    riftCoastBoundaryShare: riftCoast ? riftCoastNearBoundary / riftCoast : 0,
  };
}

function measureClosedBasins(grid, closedBasinId, externalSeaMask) {
  let closedBasinCount = 0;
  let overlap = 0;
  let closed = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const basinId = closedBasinId[id] ?? 0;
    if (basinId > closedBasinCount) closedBasinCount = basinId;
    if (basinId <= 0) continue;
    const area = metricArea(grid, id);
    closed += area;
    if (externalSeaMask[id]) overlap += area;
  }
  return {
    closedBasinCount,
    externalOverlapShare: closed ? overlap / closed : 0,
  };
}

function measureRiftSeamContinuity(grid, topology, riftStage, seaMask, externalSeaMask, inlandWaterCandidate) {
  return {
    riftStageSeamDiffToInteriorRatio: measureBinarySeamContinuity(grid, topology, riftStage, (value) => value > RiftStage.NONE),
    seaMaskSeamDiffToInteriorRatio: measureBinarySeamContinuity(grid, topology, seaMask, Boolean),
    externalSeaSeamDiffToInteriorRatio: measureBinarySeamContinuity(grid, topology, externalSeaMask, Boolean),
    inlandWaterSeamDiffToInteriorRatio: measureBinarySeamContinuity(grid, topology, inlandWaterCandidate, Boolean),
  };
}

function measureBinarySeamContinuity(grid, topology, field, toBool) {
  let interiorDiff = 0;
  let interiorEdges = 0;
  let seamDiff = 0;
  let seamEdges = 0;
  for (let id = 0; id < grid.size; id += 1) {
    topology.forEachNeighbor(id, (nid) => {
      if (nid < id) return;
      const diff = toBool(field[id]) === toBool(field[nid]) ? 0 : 1;
      if (grid.face[id] === grid.face[nid]) {
        interiorDiff += diff;
        interiorEdges += 1;
      } else {
        seamDiff += diff;
        seamEdges += 1;
      }
    });
  }
  const interiorMean = interiorDiff / Math.max(1, interiorEdges);
  const seamMean = seamDiff / Math.max(1, seamEdges);
  return seamEdges ? seamMean / Math.max(interiorMean, Number.EPSILON) : 0;
}

function isCoastCell(grid, seaMask, id) {
  const start = grid.neighborStart[id];
  const count = grid.neighborCount[id];
  for (let k = 0; k < count; k += 1) {
    const nid = grid.neighbors[start + k];
    if (Boolean(seaMask[nid]) !== Boolean(seaMask[id])) return true;
  }
  return false;
}

function weightedHistogram(grid, field, buckets) {
  const counts = Array.from({ length: buckets }, () => 0);
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const bucket = field[id];
    if (bucket < 0 || bucket >= buckets) continue;
    const area = metricArea(grid, id);
    counts[bucket] += area;
    total += area;
  }
  return counts.map((value) => value / Math.max(total, Number.EPSILON));
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
