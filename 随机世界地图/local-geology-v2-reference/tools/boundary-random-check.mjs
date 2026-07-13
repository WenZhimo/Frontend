import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { hashSeed, mixSeed, mulberry32 } from "../src/sim/prng.js";
import { topologyForGrid } from "../src/sim/topology.js";
import { parseOptions, parseTopologyOptions } from "./lib/cli.mjs";

const options = parseArgs(process.argv.slice(2));
const random = mulberry32(hashSeed(options.baseSeed));
const thresholds = {
  checkerShare: readNumberEnv("CHECKER_SHARE_LIMIT", 0.001),
  checkerComponent: readNumberEnv("CHECKER_COMPONENT_LIMIT", 32),
  plateIslandNoiseShare: readNumberEnv("PLATE_ISLAND_NOISE_LIMIT", 0.004),
  denseBoundaryShare: readNumberEnv("DENSE_BOUNDARY_SHARE_LIMIT", 0.06),
  denseBoundaryArea: readNumberEnv("DENSE_BOUNDARY_AREA_LIMIT", 768),
  denseBoundaryFill: readNumberEnv("DENSE_BOUNDARY_FILL_LIMIT", 0.22),
  noisyBoundaryCoverage: readNumberEnv("NOISY_BOUNDARY_COVERAGE_LIMIT", 0.08),
};

const summary = {
  seedCount: options.seedCount,
  steps: options.steps,
  resolution: options.resolution,
  pipelineMode: options.pipelineMode,
  baseSeed: options.baseSeed,
  thresholds,
  passed: 0,
  failed: 0,
  failures: [],
  peaks: createEmptyPeaks(),
};

for (let seedIndex = 0; seedIndex < options.seedCount; seedIndex += 1) {
  const seedText = makeSeedText(options.baseSeed, seedIndex, random);
  const world = createWorld({
    seedText,
    waterLevel: 50,
    intensity: 1,
    plateCount: 14,
    timeScale: 1_000_000,
    pipelineMode: options.pipelineMode,
    resolution: options.resolution,
    ...options.topologyOptions,
  });

  const seedPeaks = createEmptyPeaks();
  let firstFailure = null;
  for (let step = 0; step <= options.steps; step += 1) {
    if (step > 0) stepWorld(world);
    const metrics = measureBoundaryGridRisk(world.grid);
    updatePeaks(seedPeaks, metrics, step);
    updatePeaks(summary.peaks, metrics, step, seedText);
    const failure = detectFailure(metrics, thresholds);
    if (failure && !firstFailure) {
      firstFailure = { step, reasons: failure, metrics };
      if (options.failFast) break;
    }
  }

  if (firstFailure) {
    summary.failed += 1;
    summary.failures.push({
      seedText,
      firstFailure,
      peaks: seedPeaks,
    });
    console.error(`[FAIL] ${seedText} step=${firstFailure.step} reasons=${firstFailure.reasons.join(",")}`);
    if (options.failFast) break;
  } else {
    summary.passed += 1;
    console.log(`[PASS] ${seedText}`);
  }
}

summary.ok = summary.failed === 0;
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;

function parseArgs(args) {
  const { positional, options } = parseOptions(args);
  return {
    seedCount: Math.max(1, Number(positional[0] ?? 8)),
    steps: Math.max(0, Number(positional[1] ?? 300)),
    pipelineMode: positional[2] ?? "geology-v2",
    resolution: positional[3] ?? "256x128",
    baseSeed: positional[4] ?? `boundary-random-${Date.now().toString(36)}`,
    failFast: options["fail-fast"] === true,
    topologyOptions: parseTopologyOptions(options),
  };
}

function makeSeedText(baseSeed, seedIndex, random) {
  const mixed = mixSeed(hashSeed(baseSeed), seedIndex + 1).toString(16).padStart(8, "0");
  const salt = Math.floor(random() * 0xffffffff).toString(16).padStart(8, "0");
  return `random-boundary-${baseSeed}-${seedIndex + 1}-${mixed}-${salt}`;
}

function measureBoundaryGridRisk(grid) {
  const checkerMask = new Uint8Array(grid.size);
  const denseMask = new Uint8Array(grid.size);
  let checker = 0;
  let dense = 0;
  let noisy = 0;
  let densitySum = 0;
  let active = 0;
  let islandNoise = 0;
  let totalAreaValue = 0;

  for (let i = 0; i < grid.size; i += 1) {
    const area = metricArea(grid, i);
    totalAreaValue += area;
    const checkerValue = grid.plateCheckerboard[i] ?? 0;
    const density = grid.boundaryDensity[i] ?? 0;
    if (checkerValue > 0.4) {
      checkerMask[i] = 1;
      checker += area;
    }
    if (density > 0.66) {
      denseMask[i] = 1;
      dense += area;
    }
    if (grid.noisyBoundaryPatch[i]) noisy += area;
    if (grid.activeBoundary[i]) active += area;
    if ((density > 0.2 || grid.activeBoundary[i]) && isPlateIslandNoise(grid, i)) islandNoise += area;
    densitySum += density * area;
  }

  const checkerStats = maxComponentStats(grid, checkerMask);
  const denseStats = maxComponentStats(grid, denseMask);
  return {
    plateCheckerboardScore: checker / Math.max(totalAreaValue, Number.EPSILON),
    maxPlateCheckerboardComponent: checkerStats.area,
    activeBoundaryCoverage: active / Math.max(totalAreaValue, Number.EPSILON),
    localBoundaryDensityMean: densitySum / Math.max(totalAreaValue, Number.EPSILON),
    noisyBoundaryPatchCoverage: noisy / Math.max(totalAreaValue, Number.EPSILON),
    plateIslandNoiseShare: islandNoise / Math.max(totalAreaValue, Number.EPSILON),
    denseBoundaryShare: dense / Math.max(totalAreaValue, Number.EPSILON),
    maxDenseBoundaryArea: denseStats.area,
    maxDenseBoundaryFill: denseStats.fill,
  };
}

function detectFailure(metrics, limits) {
  const failures = [];
  if (metrics.plateCheckerboardScore > limits.checkerShare) failures.push("checkerShare");
  if (metrics.maxPlateCheckerboardComponent > limits.checkerComponent) failures.push("checkerComponent");
  if (metrics.plateIslandNoiseShare > limits.plateIslandNoiseShare) failures.push("plateIslandNoiseShare");
  if (metrics.denseBoundaryShare > limits.denseBoundaryShare) failures.push("denseBoundaryShare");
  if (metrics.maxDenseBoundaryArea > limits.denseBoundaryArea && metrics.maxDenseBoundaryFill > limits.denseBoundaryFill) {
    failures.push("denseBoundaryPatch");
  }
  if (metrics.noisyBoundaryPatchCoverage > limits.noisyBoundaryCoverage) failures.push("noisyBoundaryCoverage");
  return failures.length ? failures : null;
}

function maxComponentStats(grid, mask) {
  const visited = new Uint8Array(grid.size);
  const queue = new Int32Array(grid.size);
  let bestArea = 0;
  let bestFill = 0;
  const topology = topologyForGrid(grid);
  for (let start = 0; start < grid.size; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let areaSum = 0;
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const id = queue[head++];
      areaSum += metricArea(grid, id);
      forEachNeighbor4(topology, id, (nid) => {
        if (!mask[nid] || visited[nid]) return;
        visited[nid] = 1;
        queue[tail++] = nid;
      });
    }
    const equivalentCells = equivalentCellCount(grid, areaSum);
    if (equivalentCells > bestArea) {
      bestArea = equivalentCells;
      bestFill = componentFillProxy(grid, mask, topology, areaSum, queue, tail);
    }
  }
  return { area: bestArea, fill: bestFill };
}

function isPlateIslandNoise(grid, id) {
  const topology = topologyForGrid(grid);
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  forEachAnyNeighbor(topology, id, (nid) => {
    if (grid.plate[nid] === current) same += 1;
    else different += 1;
  });
  return same <= 2 && different >= 5;
}

function componentFillProxy(grid, mask, topology, areaSum, componentQueue, componentLength) {
  let edgeArea = 0;
  for (let i = 0; i < componentLength; i += 1) {
    const id = componentQueue[i];
    let touchesOutside = false;
    forEachNeighbor4(topology, id, (nid) => {
      if (!mask[nid]) touchesOutside = true;
    });
    if (touchesOutside) edgeArea += metricArea(grid, id);
  }
  return areaSum / Math.max(areaSum + edgeArea, Number.EPSILON);
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

function metricArea(grid, id) {
  const area = grid?.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function equivalentCellCount(grid, areaSum) {
  if (!grid?.area) return areaSum;
  let total = 0;
  for (let i = 0; i < grid.size; i += 1) total += metricArea(grid, i);
  return areaSum / Math.max(total / Math.max(1, grid.size), Number.EPSILON);
}

function createEmptyPeaks() {
  return {
    plateCheckerboardScore: { value: 0, step: 0, seedText: null },
    maxPlateCheckerboardComponent: { value: 0, step: 0, seedText: null },
    activeBoundaryCoverage: { value: 0, step: 0, seedText: null },
    localBoundaryDensityMean: { value: 0, step: 0, seedText: null },
    noisyBoundaryPatchCoverage: { value: 0, step: 0, seedText: null },
    plateIslandNoiseShare: { value: 0, step: 0, seedText: null },
    denseBoundaryShare: { value: 0, step: 0, seedText: null },
    maxDenseBoundaryArea: { value: 0, step: 0, seedText: null },
    maxDenseBoundaryFill: { value: 0, step: 0, seedText: null },
  };
}

function updatePeaks(peaks, metrics, step, seedText = null) {
  for (const [name, value] of Object.entries(metrics)) {
    if (!peaks[name]) continue;
    if (value > peaks[name].value) peaks[name] = { value, step, seedText };
  }
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}
