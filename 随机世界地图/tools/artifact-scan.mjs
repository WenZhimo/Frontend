import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";
import { assessArtifactRisk, compactMetrics } from "./lib/metrics-summary.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";

const { options } = parseOptions(process.argv.slice(2));
const pipelineMode = options.mode ?? "geology-v2";
const resolution = options.resolution ?? "256x128";
const steps = parseIntOption(options, "steps", 300);
const seedCount = parseIntOption(options, "seeds", 30);
const sampleEvery = Math.max(1, parseIntOption(options, "sample-every", 5));
const randomPrefix = options["random-prefix"] ?? "artifact-seed";
const seedList = parseCsv(options["seed-list"], []);
const seeds = seedList.length ? seedList : Array.from({ length: seedCount }, (_, i) => `${randomPrefix}-${i + 1}`);

const startedAt = performance.now();
const failures = [];
const passed = [];
const worstMetrics = {};

for (const seedText of seeds) {
  const world = createCheckWorld({ seedText, pipelineMode, resolution });
  let totalMs = 0;
  let firstFailure = null;
  let lastMetrics = compactMetrics(world, { totalMs, averageStepMs: 0 });

  for (let step = 1; step <= steps; step += 1) {
    stepWorld(world);
    totalMs += world.lastStepMs ?? 0;
    if (step % sampleEvery !== 0 && step !== steps) continue;

    lastMetrics = compactMetrics(world, {
      totalMs,
      averageStepMs: totalMs / Math.max(1, world.step),
    });
    updateWorst(worstMetrics, lastMetrics, seedText);
    const risk = assessArtifactRisk(lastMetrics);
    if (risk.failed) {
      firstFailure = {
        seedText,
        step: world.step,
        failureReason: risk.failureReason,
        failures: risk.failures,
        metrics: lastMetrics,
      };
      break;
    }
  }

  if (firstFailure) failures.push(firstFailure);
  else passed.push({ seedText, finalStep: world.step, metrics: lastMetrics });
}

const result = {
  mode: pipelineMode,
  resolution,
  steps,
  sampleEvery,
  testedSeeds: seeds.length,
  passedSeeds: passed.length,
  failedSeeds: failures.length,
  firstFailureSeed: failures[0]?.seedText ?? null,
  firstFailureStep: failures[0]?.step ?? null,
  failureReason: failures[0]?.failureReason ?? null,
  suggestedDebugLayers: suggestedDebugLayers(failures[0]?.failures ?? []),
  totalMs: performance.now() - startedAt,
  worstMetrics,
  failures,
};

console.log(JSON.stringify(result, null, 0));

function updateWorst(worst, metrics, seedText) {
  const keys = [
    "plateCheckerboardScore",
    "coastBoundaryShare",
    "sedimentStraightnessRisk",
    "sedimentOverfillShare",
    "sedimentSeaFillRisk",
    "oldBoundaryReliefCorrelation",
    "reliefDeficit",
  ];
  for (const key of keys) {
    const value = metrics[key] ?? 0;
    if (!worst[key] || value > worst[key].value) {
      worst[key] = { value, seedText, step: metrics.step };
    }
  }
}

function suggestedDebugLayers(failuresForSeed) {
  const layers = new Set(["finalElevation", "seaMask", "plateCheckerboard", "boundaryInfluence"]);
  for (const failure of failuresForSeed) {
    if (failure.metric.includes("sediment")) {
      ["sediment", "sedimentSink", "sedimentCapacity", "sedimentBudgetError", "basin"].forEach((layer) => layers.add(layer));
    }
    if (failure.metric.includes("Boundary") || failure.metric.includes("Transform")) {
      ["activeTransform", "transformMemory", "fractureZoneMemory", "inactiveBoundaryRelief", "oldBoundaryCorrelation"].forEach((layer) => layers.add(layer));
    }
    if (failure.metric.includes("coast") || failure.metric.includes("landRatio")) {
      ["externalSeaMask", "inlandWaterCandidate", "closedBasinId", "continentalShelf", "passiveMargin"].forEach((layer) => layers.add(layer));
    }
    if (failure.metric.includes("relief")) {
      ["reliefDeficit", "planetaryRelief", "flatLandMask", "largePlainMask"].forEach((layer) => layers.add(layer));
    }
  }
  return [...layers];
}
