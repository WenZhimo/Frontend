import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { runWebGpuElevationCandidate } from "../src/gpu/elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "../src/gpu/isostasyCompute.js";

const DEFAULT_SEED = "龙骨海-纪元7";

const { positional, options } = parseOptions(process.argv.slice(2));
const invocation = parseInvocation(positional, options);
const { seedText, pipelineMode, resolution, steps, fields, candidateBackend } = invocation;

const baseline = createCheckWorld({ seedText, pipelineMode, resolution });
const candidate = createCheckWorld({ seedText, pipelineMode, resolution });

runSteps(baseline, steps);
runSteps(candidate, steps);

const gpuCapabilities = detectGpuCapabilities(globalThis);
const candidateResult = await runCandidate(candidateBackend, candidate);
const fieldResults = fields.map((fieldName) => {
  const candidateField = candidateResult?.skipped
    ? candidate.grid[fieldName]
    : candidateResult?.fields?.[fieldName] ?? candidate.grid[fieldName];
  return compareField(fieldName, baseline.grid[fieldName], candidateField, thresholdForField(fieldName, candidateBackend));
});

const result = {
  seedText,
  pipelineMode,
  resolution,
  steps,
  backend: isWebGpuBackend(candidateBackend) ? candidateBackend : "cpu-vs-cpu",
  candidate: candidateBackend,
  attempted: isWebGpuBackend(candidateBackend),
  skipped: candidateResult?.skipped ?? false,
  skipReason: candidateResult?.reason ?? null,
  gpuCapabilities: candidateResult?.gpuCapabilities ?? gpuCapabilities,
  timings: candidateResult?.timings ?? null,
  comparedFields: fields,
  valid: (candidateResult?.valid ?? true) && fieldResults.every((field) => field.valid),
  fields: fieldResults,
  invocation,
  note: candidateBackend === "webgpu-isostasy"
    ? "Phase 2A experimental compare: CPU remains authoritative; WebGPU isostasy only runs when explicitly requested."
    : candidateBackend === "webgpu-elevation"
      ? "Phase 2B experimental compare: CPU remains authoritative; WebGPU elevation only runs when explicitly requested."
      : "CPU-vs-CPU compare remains the default path so expected deltas are zero.",
};

console.log(JSON.stringify(result, null, 2));

function parseInvocation(positional, options) {
  const firstBackend = backendAlias(positional[0]);
  if (firstBackend) {
    return {
      format: "backend-first",
      seedText: positional[1] ?? DEFAULT_SEED,
      steps: parseIntOption(options, "steps", Number(positional[2]) || 20),
      pipelineMode: positional[3] ?? "geology-v2",
      resolution: positional[4] ?? "256x128",
      fields: parseCsv(positional[5] ?? options.fields, defaultFieldsForBackend(firstBackend)),
      candidateBackend: backendAlias(options.candidate) ?? firstBackend,
    };
  }

  const candidateBackend = backendAlias(options.candidate) ?? "cpu";
  return {
    format: "legacy",
    seedText: positional[0] ?? DEFAULT_SEED,
    pipelineMode: positional[1] ?? "geology-v2",
    resolution: positional[2] ?? "256x128",
    steps: parseIntOption(options, "steps", Number(positional[3]) || 20),
    fields: parseCsv(positional[4] ?? options.fields, defaultFieldsForBackend(candidateBackend)),
    candidateBackend,
  };
}

function backendAlias(value) {
  if (value === "webgpu-isostasy" || value === "isostasy") return "webgpu-isostasy";
  if (value === "webgpu-elevation" || value === "elevation") return "webgpu-elevation";
  if (value === "cpu" || value === "cpu-vs-cpu") return "cpu";
  return null;
}

function defaultFieldsForBackend(backend) {
  if (backend === "webgpu-isostasy") {
    return [
      "isostaticBase",
      "ageSubsidence",
      "thicknessBuoyancy",
      "sedimentFill",
      "oceanDepthTerms",
    ];
  }
  if (backend === "webgpu-elevation") {
    return ["baseElev", "relief", "boundaryRelief", "elev"];
  }
  return ["elev", "isostaticBase", "oceanDepthTerms"];
}

function runSteps(world, count) {
  for (let i = 0; i < count; i += 1) stepWorld(world);
}

async function runCandidate(candidateName, world) {
  if (candidateName === "webgpu-isostasy") return runWebGpuIsostasyCandidate(world);
  if (candidateName === "webgpu-elevation") return runWebGpuElevationCandidate(world);
  return null;
}

function compareField(fieldName, baselineField, candidateField, threshold = { rmse: 1e-9, maxAbs: 1e-9, p95Abs: 1e-9 }) {
  if (!baselineField || !candidateField) {
    return {
      field: fieldName,
      valid: false,
      reason: "Field is missing on one or both worlds.",
      threshold,
      rmse: null,
      meanAbs: null,
      p95Abs: null,
      maxAbs: null,
    };
  }
  if (baselineField.length !== candidateField.length) {
    return {
      field: fieldName,
      valid: false,
      reason: `Field length mismatch: ${baselineField.length} vs ${candidateField.length}.`,
      threshold,
      rmse: null,
      meanAbs: null,
      p95Abs: null,
      maxAbs: null,
    };
  }

  let sumSq = 0;
  let sumAbs = 0;
  let maxAbs = 0;
  const absDeltas = new Float64Array(baselineField.length);
  for (let i = 0; i < baselineField.length; i += 1) {
    const delta = Number(candidateField[i]) - Number(baselineField[i]);
    const abs = Math.abs(delta);
    absDeltas[i] = abs;
    sumSq += delta * delta;
    sumAbs += abs;
    if (abs > maxAbs) maxAbs = abs;
  }

  const count = Math.max(1, baselineField.length);
  const rmse = Math.sqrt(sumSq / count);
  const meanAbs = sumAbs / count;
  const p95Abs = percentile(absDeltas, 0.95);
  return {
    field: fieldName,
    valid: rmse <= threshold.rmse && maxAbs <= threshold.maxAbs && p95Abs <= threshold.p95Abs,
    threshold,
    rmse,
    meanAbs,
    p95Abs,
    maxAbs,
  };
}

function thresholdForField(fieldName, backend) {
  if (backend === "webgpu-elevation") {
    if (fieldName === "boundaryRelief") return { rmse: 0.003, maxAbs: 0.015, p95Abs: 0.006 };
    if (fieldName === "baseElev" || fieldName === "relief" || fieldName === "elev") {
      return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
    }
    return { rmse: 0.003, maxAbs: 0.015, p95Abs: 0.006 };
  }
  if (backend !== "webgpu-isostasy") return { rmse: 1e-9, maxAbs: 1e-9, p95Abs: 1e-9 };
  if (fieldName === "oceanDepthTerms") return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
  if (
    fieldName === "isostaticBase" ||
    fieldName === "ageSubsidence" ||
    fieldName === "thicknessBuoyancy" ||
    fieldName === "sedimentFill" ||
    fieldName === "crustBuoyancy" ||
    fieldName === "densitySubsidence" ||
    fieldName === "lithosphereCooling"
  ) {
    return { rmse: 0.001, maxAbs: 0.006, p95Abs: 0.002 };
  }
  return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function isWebGpuBackend(backend) {
  return backend === "webgpu-isostasy" || backend === "webgpu-elevation";
}
