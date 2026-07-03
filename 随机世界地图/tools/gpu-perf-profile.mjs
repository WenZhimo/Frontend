import { parseIntOption, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { runWebGpuElevationCandidate } from "../src/gpu/elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "../src/gpu/isostasyCompute.js";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "龙骨海-纪元7";
const pipelineMode = positional[1] ?? "geology-v2";
const resolution = positional[2] ?? "256x128";
const steps = parseIntOption(options, "steps", Number(positional[3]) || 20);
const kernel = options.kernel ?? null;

const gpuCapabilities = detectGpuCapabilities(globalThis);
const world = createCheckWorld({ seedText, pipelineMode, resolution });
const stepMs = [];
const startedAt = performance.now();

for (let i = 0; i < steps; i += 1) {
  stepWorld(world);
  stepMs.push(world.lastStepMs ?? 0);
}

const totalMs = performance.now() - startedAt;
const cpuBaselineMs = stepMs.reduce((sum, value) => sum + value, 0);
stepMs.sort((a, b) => a - b);
const gpuCandidate = await runKernelCandidate(kernel, world);

const result = {
  seedText,
  pipelineMode,
  resolution,
  steps,
  backend: kernel === "isostasy" ? "webgpu-isostasy" : kernel === "elevation" ? "webgpu-elevation" : gpuCapabilities.recommendedMode,
  kernel,
  skipped: gpuCandidate?.skipped ?? false,
  skipReason: gpuCandidate?.reason ?? null,
  gpuCapabilities: gpuCandidate?.gpuCapabilities ?? gpuCapabilities,
  totalWallMs: round2(totalMs),
  cpuBaselineMs: round2(cpuBaselineMs),
  averageStepMs: round2(cpuBaselineMs / Math.max(1, steps)),
  p95StepMs: round2(percentile(stepMs, 0.95)),
  uploadMs: roundNullable(gpuCandidate?.timings?.uploadMs),
  kernelMs: roundNullable(gpuCandidate?.timings?.kernelMs),
  downloadMs: roundNullable(gpuCandidate?.timings?.downloadMs),
  totalGpuPathMs: roundNullable(gpuCandidate?.timings?.totalGpuPathMs),
  finalLandRatio: world.stats.landRatio,
  finalSeaRatio: world.stats.seaRatio,
  note: kernel === "isostasy"
    ? "Phase 2A experimental profile: CPU step path remains authoritative; GPU timing includes upload, compute, and download when available."
    : kernel === "elevation"
      ? "Phase 2B experimental profile: CPU step path remains authoritative; this is a single elevation candidate pass, not a production pipeline profile."
    : "Default profile keeps the CPU baseline and capability report without requesting a GPU device.",
};

console.log(JSON.stringify(result, null, 2));

function percentile(values, p) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[index];
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function roundNullable(value) {
  return Number.isFinite(value) ? round2(value) : null;
}

async function runKernelCandidate(kernelName, world) {
  if (kernelName === "isostasy") return runWebGpuIsostasyCandidate(world);
  if (kernelName === "elevation") return runWebGpuElevationCandidate(world);
  return null;
}
