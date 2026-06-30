import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { hashSeed, mixSeed, mulberry32 } from "../src/sim/prng.js";

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
  const values = args.filter((arg) => !arg.startsWith("--"));
  return {
    seedCount: Math.max(1, Number(values[0] ?? 8)),
    steps: Math.max(0, Number(values[1] ?? 300)),
    pipelineMode: values[2] ?? "geology-v2",
    resolution: values[3] ?? "256x128",
    baseSeed: values[4] ?? `boundary-random-${Date.now().toString(36)}`,
    failFast: args.includes("--fail-fast"),
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

  for (let i = 0; i < grid.size; i += 1) {
    const checkerValue = grid.plateCheckerboard[i] ?? 0;
    const density = grid.boundaryDensity[i] ?? 0;
    if (checkerValue > 0.4) {
      checkerMask[i] = 1;
      checker += 1;
    }
    if (density > 0.66) {
      denseMask[i] = 1;
      dense += 1;
    }
    if (grid.noisyBoundaryPatch[i]) noisy += 1;
    if (grid.activeBoundary[i]) active += 1;
    if ((density > 0.2 || grid.activeBoundary[i]) && isPlateIslandNoise(grid, i)) islandNoise += 1;
    densitySum += density;
  }

  const checkerStats = maxComponentStats(grid, checkerMask);
  const denseStats = maxComponentStats(grid, denseMask);
  return {
    plateCheckerboardScore: checker / grid.size,
    maxPlateCheckerboardComponent: checkerStats.area,
    activeBoundaryCoverage: active / grid.size,
    localBoundaryDensityMean: densitySum / grid.size,
    noisyBoundaryPatchCoverage: noisy / grid.size,
    plateIslandNoiseShare: islandNoise / grid.size,
    denseBoundaryShare: dense / grid.size,
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
  for (let start = 0; start < grid.size; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let count = 0;
    let head = 0;
    let tail = 0;
    let minX = grid.width;
    let maxX = -1;
    let minY = grid.height;
    let maxY = -1;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const id = queue[head++];
      count += 1;
      const x = id % grid.width;
      const y = Math.floor(id / grid.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      visitNeighbor4Ids(grid, x, y, (nid) => {
        if (!mask[nid] || visited[nid]) return;
        visited[nid] = 1;
        queue[tail++] = nid;
      });
    }
    if (count > bestArea) {
      const bboxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
      bestArea = count;
      bestFill = count / bboxArea;
    }
  }
  return { area: bestArea, fill: bestFill };
}

function isPlateIslandNoise(grid, id) {
  const x = id % grid.width;
  const y = Math.floor(id / grid.width);
  const current = grid.plate[id];
  let same = 0;
  let different = 0;
  visitNeighbor8Ids(grid, x, y, (nid) => {
    if (grid.plate[nid] === current) same += 1;
    else different += 1;
  });
  return same <= 2 && different >= 5;
}

function visitNeighbor4Ids(grid, x, y, visit) {
  visit(y * grid.width + wrapX(grid.width, x - 1));
  visit(y * grid.width + wrapX(grid.width, x + 1));
  if (y > 0) visit((y - 1) * grid.width + x);
  if (y < grid.height - 1) visit((y + 1) * grid.width + x);
}

function visitNeighbor8Ids(grid, x, y, visit) {
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= grid.height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      visit(ny * grid.width + wrapX(grid.width, x + dx));
    }
  }
}

function wrapX(width, x) {
  return ((x % width) + width) % width;
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
