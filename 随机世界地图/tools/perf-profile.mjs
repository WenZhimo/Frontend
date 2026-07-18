import { parseIntOption, parseOptions, parseTopologyOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "龙骨海-纪元7";
const pipelineMode = positional[1] ?? "geology-v2";
const resolution = positional[2] ?? "256x128";
const steps = parseIntOption(options, "steps", Number(positional[3]) || 100);
const topologyOptions = parseTopologyOptions(options);

const world = createCheckWorld({ seedText, pipelineMode, resolution, ...topologyOptions });
const profileStages = options.stages !== false && options["no-stages"] !== true;
if (profileStages && pipelineMode === "geology-v2") {
  world.profileGeologyV2Stages = true;
  world.geologyV2StageTimings = new Map();
}
const stepMs = [];
const startedAt = performance.now();

for (let i = 0; i < steps; i += 1) {
  stepWorld(world);
  stepMs.push(world.lastStepMs ?? 0);
}

stepMs.sort((a, b) => a - b);
const totalMs = performance.now() - startedAt;
const sumStepMs = stepMs.reduce((sum, value) => sum + value, 0);
const result = {
  seedText,
  pipelineMode,
  resolution,
  ...topologyOptions,
  steps,
  totalMs,
  averageStepMs: sumStepMs / Math.max(1, stepMs.length),
  minStepMs: stepMs[0] ?? 0,
  p50StepMs: percentile(stepMs, 0.5),
  p90StepMs: percentile(stepMs, 0.9),
  p95StepMs: percentile(stepMs, 0.95),
  maxStepMs: stepMs[stepMs.length - 1] ?? 0,
  geologyStageTimings: formatStageTimings(world.geologyV2StageTimings),
  finalLandRatio: world.stats.landRatio,
  finalSeaRatio: world.stats.seaRatio,
  note: profileStages
    ? "Stage timings are enabled for geology-v2 only."
    : "Whole-step timing only; pass --stages to enable geology-v2 stage timings.",
};

console.log(JSON.stringify(result, null, 0));

function percentile(values, p) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[index];
}

function formatStageTimings(timings) {
  if (!timings) return [];
  return [...timings.entries()]
    .map(([name, value]) => ({
      name,
      calls: value.calls,
      totalMs: round2(value.totalMs),
      averageMs: round2(value.totalMs / Math.max(1, value.calls)),
      maxMs: round2(value.maxMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

