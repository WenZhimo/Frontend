import { BoundaryType } from "../src/sim/tectonics.js";
import { CrustType } from "../src/sim/geology/crust.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedFieldSummary, weightedShare } from "../src/sim/sphere/stats.js";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

class MinHeap {
  constructor(capacity = 16) {
    this.ids = new Int32Array(capacity);
    this.distances = new Float64Array(capacity);
    this.length = 0;
  }

  push(id, distance) {
    this.ensureCapacity(this.length + 1);
    let index = this.length;
    this.length += 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.distances[parent] <= distance) break;
      this.ids[index] = this.ids[parent];
      this.distances[index] = this.distances[parent];
      index = parent;
    }
    this.ids[index] = id;
    this.distances[index] = distance;
  }

  pop() {
    const id = this.ids[0];
    const distance = this.distances[0];
    this.length -= 1;
    if (this.length > 0) {
      const lastId = this.ids[this.length];
      const lastDistance = this.distances[this.length];
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= this.length) break;
        const right = left + 1;
        const child = right < this.length && this.distances[right] < this.distances[left] ? right : left;
        if (this.distances[child] >= lastDistance) break;
        this.ids[index] = this.ids[child];
        this.distances[index] = this.distances[child];
        index = child;
      }
      this.ids[index] = lastId;
      this.distances[index] = lastDistance;
    }
    return { id, distance };
  }

  ensureCapacity(capacity) {
    if (capacity <= this.ids.length) return;
    const nextCapacity = Math.max(capacity, this.ids.length * 2);
    const ids = new Int32Array(nextCapacity);
    const distances = new Float64Array(nextCapacity);
    ids.set(this.ids);
    distances.set(this.distances);
    this.ids = ids;
    this.distances = distances;
  }
}

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 20)));

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
const ridgeMask = buildActiveRidgeMask(grid);
const expectedRidgeDistance = oceanicDistanceFromRidges(grid, ridgeMask);
const ridgeDistanceDelta = measureRidgeDistanceDelta(grid, expectedRidgeDistance);
const ageContinuity = measureFaceSeamContinuity(grid, grid.crustAge, (id) => grid.crustType[id] === CrustType.OCEANIC);
const distanceContinuity = measureFaceSeamContinuity(grid, grid.ridgeDistance, (id, nid) => (
  grid.crustType[id] === CrustType.OCEANIC &&
  grid.crustType[nid] === CrustType.OCEANIC &&
  Number.isFinite(grid.ridgeDistance[id]) &&
  Number.isFinite(grid.ridgeDistance[nid]) &&
  grid.ridgeDistance[id] >= 0 &&
  grid.ridgeDistance[nid] >= 0
));
const oceanicAgeSummary = weightedFieldSummary(grid, grid.crustAge, {
  predicate: (id) => grid.crustType[id] === CrustType.OCEANIC,
});

const metrics = {
  topologyKind: grid.topologyKind ?? null,
  graphBacked: Boolean(grid.topology?.graphBacked || grid.topologyOptions?.graphBacked),
  faceSize,
  steps,
  cellCount: grid.size,
  crustAgeFiniteShare: finiteShare(grid.crustAge),
  ridgeDistanceFiniteShare: finiteShare(grid.ridgeDistance),
  ridgeDistanceExpectedStorageShare: shareWhere(grid, (id) => (
    grid.crustType[id] !== CrustType.OCEANIC ||
    grid.ridgeDistance[id] === Number.POSITIVE_INFINITY ||
    (
      Number.isFinite(grid.ridgeDistance[id]) &&
      grid.ridgeDistance[id] >= 0
    )
  )),
  oceanicShare: weightedShare(grid, maskFor(grid, (id) => grid.crustType[id] === CrustType.OCEANIC)),
  activeRidgeShare: weightedShare(grid, ridgeMask),
  ridgeDistanceFiniteOceanicShare: weightedShare(grid, maskFor(grid, (id) => (
    grid.crustType[id] === CrustType.OCEANIC &&
    Number.isFinite(grid.ridgeDistance[id]) &&
    grid.ridgeDistance[id] >= 0
  )), { predicate: (id) => grid.crustType[id] === CrustType.OCEANIC }),
  ridgeDistanceReachableOceanicShare: weightedShare(grid, maskFor(grid, (id) => (
    grid.crustType[id] === CrustType.OCEANIC &&
    Number.isFinite(expectedRidgeDistance[id]) &&
    expectedRidgeDistance[id] >= 0
  )), { predicate: (id) => grid.crustType[id] === CrustType.OCEANIC }),
  ridgeAgeMean: weightedMeanWhere(grid, grid.crustAge, (id) => ridgeMask[id]),
  nearRidgeAgeMean: weightedMeanWhere(grid, grid.crustAge, (id) => (
    grid.crustType[id] === CrustType.OCEANIC &&
    grid.ridgeDistance[id] >= 0 &&
    grid.ridgeDistance[id] <= 2
  )),
  oldOceanAgeMean: weightedMeanWhere(grid, grid.crustAge, (id) => (
    grid.crustType[id] === CrustType.OCEANIC &&
    grid.ridgeDistance[id] > 12
  )),
  oceanicAgeMean: oceanicAgeSummary.weightedMean,
  oceanicAgeRange: (oceanicAgeSummary.max ?? 0) - (oceanicAgeSummary.min ?? 0),
  youngOceanNearRidgeShare: weightedShare(grid, maskFor(grid, (id) => (
    grid.crustType[id] === CrustType.OCEANIC &&
    grid.ridgeDistance[id] >= 0 &&
    grid.ridgeDistance[id] <= 4 &&
    grid.crustAge[id] < 0.12
  )), { predicate: (id) => (
    grid.crustType[id] === CrustType.OCEANIC &&
    grid.ridgeDistance[id] >= 0 &&
    grid.ridgeDistance[id] <= 4
  ) }),
  ridgeDistanceGraphMaxDelta: ridgeDistanceDelta.maxDelta,
  ridgeDistanceGraphMeanDelta: ridgeDistanceDelta.meanDelta,
  ridgeDistanceComparedShare: ridgeDistanceDelta.comparedShare,
  ageSeamDiffToInteriorRatio: ageContinuity.seamDiffToInteriorRatio,
  ageSeamRatioDelta: ageContinuity.seamRatioDelta,
  ridgeDistanceSeamDiffToInteriorRatio: distanceContinuity.seamDiffToInteriorRatio,
  ridgeDistanceSeamRatioDelta: distanceContinuity.seamRatioDelta,
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  finiteCrustAge: metrics.crustAgeFiniteShare === 1,
  ridgeDistanceStorageExpected: metrics.ridgeDistanceExpectedStorageShare === 1,
  oceanicPresent: metrics.oceanicShare > 0.05,
  activeRidgesPresent: metrics.activeRidgeShare > 0.0005,
  reachableOceanicPresent: metrics.ridgeDistanceReachableOceanicShare > 0.08,
  ridgeAgeReset: metrics.ridgeAgeMean < 0.08,
  nearRidgeYoungerThanOldOcean: metrics.nearRidgeAgeMean < metrics.oldOceanAgeMean,
  youngOceanNearRidgePresent: metrics.youngOceanNearRidgeShare > 0.6,
  oceanicAgeHasGradient: metrics.oceanicAgeRange > 0.2,
  ridgeDistanceMatchesGraph: metrics.ridgeDistanceGraphMaxDelta < 0.35 && metrics.ridgeDistanceGraphMeanDelta < 0.25,
  ageSeamContinuityBounded: metrics.ageSeamDiffToInteriorRatio < 1.65,
  ridgeDistanceSeamContinuityBounded: metrics.ridgeDistanceSeamDiffToInteriorRatio === null || metrics.ridgeDistanceSeamDiffToInteriorRatio < 1.65,
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

function buildActiveRidgeMask(grid) {
  const mask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const isOceanic = grid.crustType[id] === CrustType.OCEANIC;
    const activeRidge = isOceanic && (
      grid.ridge[id] > 0.045 ||
      (
        grid.boundaryKind[id] === BoundaryType.DIVERGENT &&
        grid.boundaryInfluence[id] > 0.18 &&
        grid.stress[id] > 0.08
      )
    );
    if (activeRidge) mask[id] = 1;
  }
  return mask;
}

function oceanicDistanceFromRidges(grid, ridgeMask) {
  const distance = new Float32Array(grid.size);
  distance.fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap(Math.max(16, grid.size));
  const topology = topologyForGrid(grid);

  for (let id = 0; id < grid.size; id += 1) {
    if (!ridgeMask[id] || grid.crustType[id] !== CrustType.OCEANIC) continue;
    distance[id] = 0;
    heap.push(id, 0);
  }

  while (heap.length > 0) {
    const current = heap.pop();
    if (current.distance > distance[current.id] + 1e-7) continue;
    topology.forEachNeighbor(current.id, (nid, _slot, edgeLength = 1) => {
      if (grid.crustType[nid] !== CrustType.OCEANIC) return;
      const next = distance[current.id] + Math.max(1e-6, edgeLength);
      if (next >= distance[nid]) return;
      distance[nid] = next;
      heap.push(nid, next);
    });
  }

  for (let id = 0; id < grid.size; id += 1) {
    if (grid.crustType[id] !== CrustType.OCEANIC) distance[id] = -1;
  }
  return distance;
}

function measureRidgeDistanceDelta(grid, expected) {
  let compared = 0;
  let comparableArea = 0;
  let totalArea = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    totalArea += area;
    if (grid.crustType[id] !== CrustType.OCEANIC) continue;
    if (!Number.isFinite(expected[id]) || expected[id] < 0) continue;
    if (!Number.isFinite(grid.ridgeDistance[id]) || grid.ridgeDistance[id] < 0) continue;
    const delta = Math.abs(grid.ridgeDistance[id] - expected[id]);
    totalDelta += delta * area;
    maxDelta = Math.max(maxDelta, delta);
    comparableArea += area;
    compared += 1;
  }
  return {
    compared,
    comparedShare: comparableArea / Math.max(totalArea, Number.EPSILON),
    meanDelta: totalDelta / Math.max(comparableArea, Number.EPSILON),
    maxDelta,
  };
}

function measureFaceSeamContinuity(grid, field, predicate) {
  let interiorTotal = 0;
  let interiorCount = 0;
  let seamTotal = 0;
  let seamCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id) continue;
      if (!predicate(id, nid)) continue;
      const diff = Math.abs(field[id] - field[nid]);
      if (grid.face[id] === grid.face[nid]) {
        interiorTotal += diff;
        interiorCount += 1;
      } else {
        seamTotal += diff;
        seamCount += 1;
      }
    }
  }
  const interiorMean = interiorTotal / Math.max(1, interiorCount);
  const seamMean = seamTotal / Math.max(1, seamCount);
  const seamDiffToInteriorRatio = interiorCount && seamCount ? seamMean / Math.max(interiorMean, Number.EPSILON) : null;
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio,
    seamRatioDelta: seamDiffToInteriorRatio === null ? null : seamDiffToInteriorRatio - 1,
  };
}

function weightedMeanWhere(grid, field, predicate) {
  let total = 0;
  let weight = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (!predicate(id)) continue;
    const area = grid.area?.[id] ?? 1;
    total += Number(field[id] ?? 0) * area;
    weight += area;
  }
  return total / Math.max(weight, Number.EPSILON);
}

function maskFor(grid, predicate) {
  const mask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) if (predicate(id)) mask[id] = 1;
  return mask;
}

function shareWhere(grid, predicate) {
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    total += area;
    if (predicate(id)) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}
