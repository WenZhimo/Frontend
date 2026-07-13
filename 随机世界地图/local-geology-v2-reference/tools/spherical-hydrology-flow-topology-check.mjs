import { getHydrologyInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
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

const grid = world.grid;
const topology = topologyForGrid(grid);
const terrain = getTerrainDerived(world);
const hydrology = getHydrologyInputs(world, { diagnostics: "full" });
const flowGraph = measureFlowGraphTopology(grid, topology, terrain, hydrology);
const accumulation = measureAccumulationUnits(grid, terrain, hydrology);
const seam = measureFlowSeamBehavior(grid, terrain, hydrology);

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  landShare: weightedShare(grid, terrain.landMask),
  flowAssignedShare: hydrology.hydrologyDiagnostics.flowAssignedShare,
  hydrologyValid: hydrology.hydrologyDiagnostics.hydrologyValid,
  flowTargetGraphEdgeShare: flowGraph.graphEdgeShare,
  nonGraphFlowTargetShare: flowGraph.nonGraphShare,
  downhillFlowShare: flowGraph.downhillShare,
  externalOrClosedSinkShare: flowGraph.externalOrClosedSinkShare,
  flowTargetFiniteShare: flowGraph.finiteShare,
  crossFaceFlowTargetShare: seam.crossFaceFlowTargetShare,
  crossFaceFlowTargetAvailableShare: seam.crossFaceAvailableShare,
  seamAssignedShare: seam.seamAssignedShare,
  seamNonGraphTargetShare: seam.seamNonGraphTargetShare,
  seamFlowAssignedInteriorRatio: seam.seamFlowAssignedInteriorRatio,
  flowAccumulationAreaDeltaMax: accumulation.areaDeltaMax,
  flowAccumulationCellUnitDeltaMax: accumulation.cellUnitDeltaMax,
  flowAccumulationUsesAreaUnit: accumulation.areaDeltaMax < 1e-9,
  flowAccumulationDiffersFromCellUnit: accumulation.cellUnitDeltaMax > 0.1,
  riverContinuityScore: hydrology.hydrologyDiagnostics.riverContinuityScore,
  externalSeaDrainageShare: hydrology.hydrologyDiagnostics.externalSeaDrainageShare,
  closedBasinDrainageShare: hydrology.hydrologyDiagnostics.closedBasinDrainageShare,
  orphanFlowShare: hydrology.hydrologyDiagnostics.orphanFlowShare,
  flowCycleCount: hydrology.hydrologyDiagnostics.flowCycleCount,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  hydrologyValid: metrics.hydrologyValid,
  flowTargetsUseGraphEdges: metrics.flowTargetGraphEdgeShare === 1 && metrics.nonGraphFlowTargetShare === 0,
  assignedFlowPresent: metrics.flowAssignedShare > 0.05,
  downhillOrSinkFlow: metrics.downhillFlowShare + metrics.externalOrClosedSinkShare > 0.92,
  crossFaceFlowCovered:
    metrics.crossFaceFlowTargetAvailableShare === 0 ||
    metrics.crossFaceFlowTargetShare > 0,
  seamTargetsUseGraphEdges: metrics.seamNonGraphTargetShare === 0,
  seamAssignmentNotPathological:
    metrics.seamFlowAssignedInteriorRatio === null ||
    metrics.seamFlowAssignedInteriorRatio < 1.8,
  accumulationUsesAreaUnit: metrics.flowAccumulationUsesAreaUnit,
  accumulationNotCellUnit: metrics.flowAccumulationDiffersFromCellUnit,
  drainageSharesBounded:
    metrics.externalSeaDrainageShare >= 0 &&
    metrics.closedBasinDrainageShare >= 0 &&
    metrics.externalSeaDrainageShare + metrics.closedBasinDrainageShare <= 1 + 1e-9,
  noCycles: metrics.flowCycleCount === 0,
  orphanFlowBounded: metrics.orphanFlowShare < 0.001,
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
  metrics,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function measureFlowGraphTopology(grid, topology, terrain, hydrology) {
  let assignedArea = 0;
  let graphEdgeArea = 0;
  let nonGraphArea = 0;
  let downhillArea = 0;
  let externalOrClosedSinkArea = 0;
  let finiteArea = 0;
  let landArea = 0;

  for (let id = 0; id < grid.size; id += 1) {
    if (!terrain.landMask[id]) continue;
    const area = metricArea(grid, id);
    landArea += area;
    const target = hydrology.flowTarget[id];
    if (target < 0) continue;
    assignedArea += area;
    if (Number.isFinite(hydrology.flowSlope[id])) finiteArea += area;
    if (isGraphNeighbor(topology, id, target)) graphEdgeArea += area;
    else nonGraphArea += area;
    if (hydrology.hydroElevation[target] <= hydrology.hydroElevation[id] + 1e-7) downhillArea += area;
    if (terrain.externalSeaMask[target] || terrain.inlandWaterCandidate[target] || terrain.closedBasinId[target] > 0) {
      externalOrClosedSinkArea += area;
    }
  }

  return {
    graphEdgeShare: assignedArea ? graphEdgeArea / assignedArea : 1,
    nonGraphShare: assignedArea ? nonGraphArea / assignedArea : 0,
    downhillShare: assignedArea ? downhillArea / assignedArea : 1,
    externalOrClosedSinkShare: assignedArea ? externalOrClosedSinkArea / assignedArea : 0,
    finiteShare: landArea ? finiteArea / landArea : 0,
  };
}

function measureFlowSeamBehavior(grid, terrain, hydrology) {
  let seamLandArea = 0;
  let seamAssignedArea = 0;
  let seamCrossFaceTargetArea = 0;
  let seamCrossFaceAvailableArea = 0;
  let seamNonGraphArea = 0;
  let interiorLandArea = 0;
  let interiorAssignedArea = 0;

  for (let id = 0; id < grid.size; id += 1) {
    if (!terrain.landMask[id]) continue;
    const area = metricArea(grid, id);
    const target = hydrology.flowTarget[id];
    const seamCell = touchesOtherFace(grid, id);
    if (seamCell) {
      seamLandArea += area;
      if (hasPassableOtherFaceNeighbor(grid, terrain, id)) seamCrossFaceAvailableArea += area;
      if (target >= 0) {
        seamAssignedArea += area;
        if (!isNeighborByRawGraph(grid, id, target)) seamNonGraphArea += area;
        if (grid.face?.[target] !== grid.face?.[id]) seamCrossFaceTargetArea += area;
      }
    } else {
      interiorLandArea += area;
      if (target >= 0) interiorAssignedArea += area;
    }
  }

  const seamAssignedShare = seamLandArea ? seamAssignedArea / seamLandArea : 0;
  const interiorAssignedShare = interiorLandArea ? interiorAssignedArea / interiorLandArea : 0;
  return {
    crossFaceFlowTargetShare: seamAssignedArea ? seamCrossFaceTargetArea / seamAssignedArea : 0,
    crossFaceAvailableShare: seamLandArea ? seamCrossFaceAvailableArea / seamLandArea : 0,
    seamAssignedShare,
    seamNonGraphTargetShare: seamAssignedArea ? seamNonGraphArea / seamAssignedArea : 0,
    seamFlowAssignedInteriorRatio: interiorAssignedShare > 0
      ? seamAssignedShare / Math.max(interiorAssignedShare, Number.EPSILON)
      : null,
  };
}

function measureAccumulationUnits(grid, terrain, hydrology) {
  return {
    areaDeltaMax: maxExpectedAccumulationDelta(grid, terrain, hydrology, (id) => metricArea(grid, id)),
    cellUnitDeltaMax: maxExpectedAccumulationDelta(grid, terrain, hydrology, () => 1),
  };
}

function maxExpectedAccumulationDelta(grid, terrain, hydrology, sourceUnitForId) {
  const expected = new Float32Array(grid.size);
  const landCells = [];
  for (let id = 0; id < grid.size; id += 1) {
    if (!terrain.landMask[id]) continue;
    expected[id] = sourceUnitForId(id);
    landCells.push(id);
  }
  landCells.sort((a, b) => hydrology.hydroElevation[b] - hydrology.hydroElevation[a]);
  for (const id of landCells) {
    const target = hydrology.flowTarget[id];
    if (target < 0) continue;
    expected[target] += expected[id];
  }
  let max = 0;
  for (const id of landCells) max = Math.max(max, Math.abs(hydrology.flowAccumulation[id] - expected[id]));
  return max;
}

function isGraphNeighbor(topology, id, target) {
  let found = false;
  topology.forEachNeighbor(id, (nid) => {
    if (nid === target) found = true;
  });
  return found;
}

function isNeighborByRawGraph(grid, id, target) {
  const start = grid.neighborStart[id];
  const count = grid.neighborCount[id];
  for (let k = 0; k < count; k += 1) {
    if (grid.neighbors[start + k] === target) return true;
  }
  return false;
}

function touchesOtherFace(grid, id) {
  if (!grid.face) return false;
  const face = grid.face[id];
  const start = grid.neighborStart[id];
  const count = grid.neighborCount[id];
  for (let k = 0; k < count; k += 1) {
    if (grid.face[grid.neighbors[start + k]] !== face) return true;
  }
  return false;
}

function hasPassableOtherFaceNeighbor(grid, terrain, id) {
  const face = grid.face?.[id];
  const start = grid.neighborStart[id];
  const count = grid.neighborCount[id];
  for (let k = 0; k < count; k += 1) {
    const nid = grid.neighbors[start + k];
    if (grid.face?.[nid] === face) continue;
    if (terrain.landMask[nid] || terrain.externalSeaMask[nid] || terrain.inlandWaterCandidate[nid]) return true;
  }
  return false;
}

function metricArea(grid, id) {
  const area = grid.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}
