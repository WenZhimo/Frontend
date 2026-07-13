import { topologyForGrid } from "../src/sim/topology.js";
import { finiteShare, weightedShare } from "../src/sim/sphere/stats.js";
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
const topology = topologyForGrid(grid);
const sourceMask = buildPlateBoundarySourceMask(grid, topology);
const expectedDistance = graphDistanceFromSources(grid, sourceMask, maxStoredBoundaryDistance(grid));
const delta = measureBoundaryDistanceDelta(grid, expectedDistance);
const continuity = measureFaceSeamContinuity(grid, grid.boundaryDistance, (id, nid) => (
  Number.isFinite(grid.boundaryDistance[id]) &&
  Number.isFinite(grid.boundaryDistance[nid]) &&
  grid.boundaryDistance[id] < 9999 &&
  grid.boundaryDistance[nid] < 9999
));
const activeSourceShare = weightedShare(grid, sourceMask);
const influenceShare = weightedShare(grid, maskFor(grid, (id) => grid.boundaryInfluence[id] > 0.001));
const activeBoundaryShare = weightedShare(grid, grid.activeBoundary);

const metrics = {
  topologyKind: grid.topologyKind ?? topology?.topologyKind ?? null,
  graphBacked: Boolean(grid.topologyOptions?.graphBacked || topology?.topologyKind === "cubed-sphere"),
  faceSize,
  steps,
  cellCount: grid.size,
  boundaryDistanceFiniteShare: finiteShare(grid.boundaryDistance),
  activeSourceShare,
  activeBoundaryShare,
  boundaryInfluenceShare: influenceShare,
  comparedShare: delta.comparedShare,
  graphBoundaryDistanceMaxDelta: delta.maxDelta,
  graphBoundaryDistanceMeanDelta: delta.meanDelta,
  finiteBoundaryMax: maxStoredBoundaryDistance(grid),
  boundaryDistanceSeamDiffToInteriorRatio: continuity.seamDiffToInteriorRatio,
  boundaryDistanceSeamRatioDelta: continuity.seamRatioDelta,
  boundaryDistanceStoredLimitShare: weightedShare(grid, maskFor(grid, (id) => grid.boundaryDistance[id] < 9999)),
};

const checks = {
  cubedSphereGrid: metrics.topologyKind === "cubed-sphere",
  graphBacked: metrics.graphBacked,
  boundaryDistanceFinite: metrics.boundaryDistanceFiniteShare === 1,
  boundarySourcesPresent: metrics.activeSourceShare > 0.01 && metrics.activeSourceShare < 0.5,
  activeBoundaryPresent: metrics.activeBoundaryShare > 0.01 && metrics.activeBoundaryShare < 0.5,
  boundaryInfluencePresent: metrics.boundaryInfluenceShare > metrics.activeSourceShare,
  boundaryDistanceCompared: metrics.comparedShare > metrics.activeSourceShare,
  boundaryDistanceMatchesGraph:
    metrics.graphBoundaryDistanceMaxDelta < 0.35 &&
    metrics.graphBoundaryDistanceMeanDelta < 0.2,
  boundaryDistanceSeamContinuity:
    metrics.boundaryDistanceSeamDiffToInteriorRatio === null ||
    metrics.boundaryDistanceSeamDiffToInteriorRatio < 1.65,
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

function buildPlateBoundarySourceMask(grid, topology) {
  const mask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const plate = grid.plate[id];
    topology.forEachNeighbor(id, (nid) => {
      if (grid.plate[nid] !== plate) mask[id] = 1;
    });
  }
  return mask;
}

function graphDistanceFromSources(grid, sourceMask, radius) {
  const distance = new Float32Array(grid.size);
  const heap = new MinHeap(Math.max(16, grid.size));
  distance.fill(9999);

  for (let id = 0; id < grid.size; id += 1) {
    if (!sourceMask[id]) continue;
    distance[id] = 0;
    heap.push(id, 0);
  }

  while (heap.length > 0) {
    const current = heap.pop();
    if (current.distance > distance[current.id] + 1e-7) continue;
    const start = grid.neighborStart[current.id];
    const count = grid.neighborCount[current.id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      const next = distance[current.id] + Math.max(1e-6, grid.edgeLength?.[start + k] ?? 1);
      if (next > radius || next >= distance[nid]) continue;
      distance[nid] = next;
      heap.push(nid, next);
    }
  }

  return distance;
}

function measureBoundaryDistanceDelta(grid, expected) {
  let comparedArea = 0;
  let totalArea = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = grid.area?.[id] ?? 1;
    totalArea += area;
    const actual = grid.boundaryDistance[id];
    const target = expected[id];
    if (!Number.isFinite(actual) || !Number.isFinite(target) || actual >= 9999 || target >= 9999) continue;
    const delta = Math.abs(actual - target);
    totalDelta += delta * area;
    maxDelta = Math.max(maxDelta, delta);
    comparedArea += area;
  }
  return {
    comparedShare: comparedArea / Math.max(totalArea, Number.EPSILON),
    meanDelta: totalDelta / Math.max(comparedArea, Number.EPSILON),
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
      if (nid < id || !predicate(id, nid)) continue;
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
  const seamDiffToInteriorRatio = interiorCount && seamCount
    ? seamMean / Math.max(interiorMean, Number.EPSILON)
    : null;
  return {
    interiorMean,
    seamMean,
    seamDiffToInteriorRatio,
    seamRatioDelta: seamDiffToInteriorRatio === null ? null : seamDiffToInteriorRatio - 1,
  };
}

function maxStoredBoundaryDistance(grid) {
  let max = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const value = grid.boundaryDistance[id];
    if (Number.isFinite(value) && value < 9999) max = Math.max(max, value);
  }
  return Math.max(1, max);
}

function maskFor(grid, predicate) {
  const mask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) if (predicate(id)) mask[id] = 1;
  return mask;
}
