import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { runWebGpuElevationCandidate } from "../src/gpu/elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "../src/gpu/isostasyCompute.js";
import { runWebGpuLocalFieldsCandidate } from "../src/gpu/localFieldsCompute.js";
import { runWebGpuMarginSmoothCandidate } from "../src/gpu/marginSmoothCompute.js";
import { runWebGpuSedimentCapacityCandidate } from "../src/gpu/sedimentCapacityCompute.js";

const DEFAULT_SEED = "龙骨海-纪元7";

const { positional, options } = parseOptions(process.argv.slice(2));
const invocation = parseInvocation(positional, options);
const { seedText, pipelineMode, resolution, steps, kernel, fields } = invocation;
const candidateRuns = Math.max(1, parseIntOption(options, "candidate-runs", 1));

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
const gpuCandidates = [];
for (let i = 0; i < candidateRuns; i += 1) {
  gpuCandidates.push(await runKernelCandidate(kernel, world, fields));
}
const gpuCandidate = gpuCandidates[gpuCandidates.length - 1];
const candidateRunsSummary = summarizeCandidateRuns(gpuCandidates);
const totalGpuPathMs = gpuCandidate?.timings?.totalGpuPathMs;
const totalCandidateMs = gpuCandidate?.timings?.totalCandidateMs ?? totalGpuPathMs;
const speedup = Number.isFinite(totalCandidateMs) && totalCandidateMs > 0
  ? cpuBaselineMs / totalCandidateMs
  : null;

const result = {
  seedText,
  pipelineMode,
  resolution,
  steps,
  backend: kernel === "isostasy"
    ? "webgpu-isostasy"
    : kernel === "elevation"
      ? "webgpu-elevation"
      : kernel === "local-fields"
        ? "webgpu-local-fields"
        : kernel === "margin-smooth"
          ? "webgpu-margin-smooth"
          : kernel === "sediment-capacity"
            ? "webgpu-sediment-capacity"
          : gpuCapabilities.recommendedMode,
  kernel,
  fields,
  candidateRuns,
  attempted: kernel === "isostasy" || kernel === "elevation" || kernel === "local-fields" || kernel === "margin-smooth" || kernel === "sediment-capacity",
  skipped: gpuCandidate?.skipped ?? false,
  skipReason: gpuCandidate?.reason ?? null,
  candidateRunsSummary,
  reusedContextObserved: candidateRunsSummary.reusedContextObserved,
  gpuCapabilities: gpuCandidate?.gpuCapabilities ?? gpuCapabilities,
  totalWallMs: round2(totalMs),
  cpuBaselineMs: round2(cpuBaselineMs),
  cpuBaselineTotalStepMs: round2(cpuBaselineMs),
  cpuBaselineAverageStepMs: round2(cpuBaselineMs / Math.max(1, steps)),
  averageStepMs: round2(cpuBaselineMs / Math.max(1, steps)),
  p95StepMs: round2(percentile(stepMs, 0.95)),
  setupMs: roundNullable(gpuCandidate?.timings?.setupMs),
  uploadMs: roundNullable(gpuCandidate?.timings?.uploadMs),
  kernelMs: roundNullable(gpuCandidate?.timings?.kernelMs),
  downloadMs: roundNullable(gpuCandidate?.timings?.downloadMs),
  totalGpuPathMs: roundNullable(totalGpuPathMs),
  totalCandidateMs: roundNullable(totalCandidateMs),
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
        : kernel === "margin-smooth"
          ? "Phase 3 experimental profile: CPU margin fields remain authoritative; this profiles a single margin smoothing candidate pass."
          : kernel === "sediment-capacity"
            ? "Phase 3 experimental profile: CPU sediment capacity remains authoritative; this profiles seed + smoothing candidate passes without transport."
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
      fields: parseCsv(positional[5] ?? options.fields, defaultFieldsForKernel(kernelAlias(options.kernel) ?? firstKernel)),
    };
  }

  return {
    format: "legacy",
    seedText: positional[0] ?? DEFAULT_SEED,
    pipelineMode: positional[1] ?? "geology-v2",
    resolution: positional[2] ?? "256x128",
    steps: parseIntOption(options, "steps", Number(positional[3]) || 20),
    kernel: kernelAlias(options.kernel) ?? null,
    fields: parseCsv(positional[4] ?? options.fields, defaultFieldsForKernel(kernelAlias(options.kernel) ?? null)),
  };
}

function kernelAlias(value) {
  if (value === undefined || value === null) return undefined;
  if (value === "webgpu-isostasy" || value === "isostasy") return "isostasy";
  if (value === "webgpu-elevation" || value === "elevation") return "elevation";
  if (value === "webgpu-local-fields" || value === "local-fields" || value === "localTerrain") return "local-fields";
  if (value === "webgpu-margin-smooth" || value === "margin-smooth" || value === "marginSmooth") return "margin-smooth";
  if (value === "webgpu-sediment-capacity" || value === "sediment-capacity" || value === "sedimentCapacity") return "sediment-capacity";
  if (value === "none" || value === "cpu") return null;
  return undefined;
}

function defaultFieldsForKernel(kernel) {
  if (kernel === "isostasy") return ["isostaticBase"];
  if (kernel === "elevation") return ["baseElev", "relief", "boundaryRelief", "elev"];
  if (kernel === "local-fields") return ["slope", "aspect", "ruggedness", "localRelief"];
  if (kernel === "margin-smooth") {
    return [
      "passiveMargin",
      "continentalShelf",
      "continentalSlope",
      "continentalRise",
      "sedimentWedge",
      "abyssalPlain",
    ];
  }
  if (kernel === "sediment-capacity") return ["sedimentCapacity"];
  return [];
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

function summarizeCandidateRuns(candidates) {
  const runs = candidates.map((candidate, index) => {
    const timings = candidate?.timings ?? {};
    return {
      index: index + 1,
      skipped: candidate?.skipped ?? false,
      reusedContext: candidate?.reusedContext ?? false,
      setupMs: roundNullable(timings.setupMs),
      uploadMs: roundNullable(timings.uploadMs),
      kernelMs: roundNullable(timings.kernelMs),
      downloadMs: roundNullable(timings.downloadMs),
      totalGpuPathMs: roundNullable(timings.totalGpuPathMs),
      totalCandidateMs: roundNullable(timings.totalCandidateMs ?? timings.totalGpuPathMs),
    };
  });
  const successful = runs.filter((run) => !run.skipped);
  const warmRuns = successful.filter((run) => run.reusedContext);
  return {
    runs,
    attemptedRuns: runs.length,
    successfulRuns: successful.length,
    reusedContextObserved: warmRuns.length > 0,
    warmRunCount: warmRuns.length,
    warmAverageGpuPathMs: averageRunField(warmRuns, "totalGpuPathMs"),
    warmAverageCandidateMs: averageRunField(warmRuns, "totalCandidateMs"),
    lastRun: runs[runs.length - 1] ?? null,
  };
}

function averageRunField(runs, field) {
  const values = runs.map((run) => run[field]).filter(Number.isFinite);
  if (!values.length) return null;
  return roundNullable(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function runKernelCandidate(kernelName, world, fields) {
  if (kernelName === "isostasy") return runWebGpuIsostasyCandidate(world, { fields });
  if (kernelName === "elevation") return runWebGpuElevationCandidate(world, { fields });
  if (kernelName === "local-fields") return runWebGpuLocalFieldsCandidate(world, { fields });
  if (kernelName === "margin-smooth") return runWebGpuMarginSmoothCandidate(world, { fields });
  if (kernelName === "sediment-capacity") return runWebGpuSedimentCapacityCandidate(world, { fields });
  return null;
}
