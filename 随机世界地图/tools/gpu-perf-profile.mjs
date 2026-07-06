import { parseIntOption, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { runWebGpuElevationCandidate } from "../src/gpu/elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "../src/gpu/isostasyCompute.js";
import { runWebGpuLocalFieldsCandidate } from "../src/gpu/localFieldsCompute.js";

const DEFAULT_SEED = "龙骨海-纪元7";

const { positional, options } = parseOptions(process.argv.slice(2));
const invocation = parseInvocation(positional, options);
const { seedText, pipelineMode, resolution, steps, kernel } = invocation;

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
const totalGpuPathMs = gpuCandidate?.timings?.totalGpuPathMs;
const speedup = Number.isFinite(totalGpuPathMs) && totalGpuPathMs > 0
  ? cpuBaselineMs / totalGpuPathMs
  : null;

const result = {
  seedText,
  pipelineMode,
  resolution,
  steps,
  backend: kernel === "isostasy" ? "webgpu-isostasy" : kernel === "elevation" ? "webgpu-elevation" : kernel === "local-fields" ? "webgpu-local-fields" : gpuCapabilities.recommendedMode,
  kernel,
  attempted: kernel === "isostasy" || kernel === "elevation" || kernel === "local-fields",
  skipped: gpuCandidate?.skipped ?? false,
  skipReason: gpuCandidate?.reason ?? null,
  gpuCapabilities: gpuCandidate?.gpuCapabilities ?? gpuCapabilities,
  totalWallMs: round2(totalMs),
  cpuBaselineMs: round2(cpuBaselineMs),
  cpuBaselineTotalStepMs: round2(cpuBaselineMs),
  cpuBaselineAverageStepMs: round2(cpuBaselineMs / Math.max(1, steps)),
  averageStepMs: round2(cpuBaselineMs / Math.max(1, steps)),
  p95StepMs: round2(percentile(stepMs, 0.95)),
  uploadMs: roundNullable(gpuCandidate?.timings?.uploadMs),
  kernelMs: roundNullable(gpuCandidate?.timings?.kernelMs),
  downloadMs: roundNullable(gpuCandidate?.timings?.downloadMs),
  totalGpuPathMs: roundNullable(totalGpuPathMs),
  speedup: roundNullable(speedup),
  slowdown: roundNullable(speedup ? 1 / speedup : null),
  fasterThanCpuBaseline: Number.isFinite(speedup) ? speedup > 1 : null,
  finalLandRatio: world.stats.landRatio,
  finalSeaRatio: world.stats.seaRatio,
  invocation,
  note: kernel === "isostasy"
    ? "Phase 2A experimental profile: CPU step path remains authoritative; GPU timing includes upload, compute, and download when available."
    : kernel === "elevation"
      ? "Phase 2B experimental profile: CPU step path remains authoritative; this is a single elevation candidate pass, not a production pipeline profile."
      : kernel === "local-fields"
        ? "Phase 3 experimental profile: CPU terrain-derived fields remain authoritative; this profiles a single local stencil candidate pass."
      : "Default profile keeps the CPU baseline and capability report without requesting a GPU device.",
};

console.log(JSON.stringify(result, null, 2));

function parseInvocation(positional, options) {
  const firstKernel = kernelAlias(positional[0]);
  if (firstKernel !== undefined) {
    return {
      format: "kernel-first",
      kernel: kernelAlias(options.kernel) ?? firstKernel,
      seedText: positional[1] ?? DEFAULT_SEED,
      steps: parseIntOption(options, "steps", Number(positional[2]) || 20),
      pipelineMode: positional[3] ?? "geology-v2",
      resolution: positional[4] ?? "256x128",
    };
  }

  return {
    format: "legacy",
    seedText: positional[0] ?? DEFAULT_SEED,
    pipelineMode: positional[1] ?? "geology-v2",
    resolution: positional[2] ?? "256x128",
    steps: parseIntOption(options, "steps", Number(positional[3]) || 20),
    kernel: kernelAlias(options.kernel) ?? null,
  };
}

function kernelAlias(value) {
  if (value === undefined || value === null) return undefined;
  if (value === "webgpu-isostasy" || value === "isostasy") return "isostasy";
  if (value === "webgpu-elevation" || value === "elevation") return "elevation";
  if (value === "webgpu-local-fields" || value === "local-fields" || value === "localTerrain") return "local-fields";
  if (value === "none" || value === "cpu") return null;
  return undefined;
}

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
  if (kernelName === "local-fields") return runWebGpuLocalFieldsCandidate(world);
  return null;
}
