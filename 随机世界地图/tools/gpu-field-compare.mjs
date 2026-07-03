import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";
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
const fields = parseCsv(positional[4] ?? options.fields, ["elev", "isostaticBase", "oceanDepthTerms"]);
const candidateBackend = options.candidate ?? "cpu";

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
  backend: candidateBackend === "webgpu-isostasy" || candidateBackend === "webgpu-elevation" ? candidateBackend : "cpu-vs-cpu",
  candidate: candidateBackend,
  skipped: candidateResult?.skipped ?? false,
  skipReason: candidateResult?.reason ?? null,
  gpuCapabilities: candidateResult?.gpuCapabilities ?? gpuCapabilities,
  timings: candidateResult?.timings ?? null,
  valid: (candidateResult?.valid ?? true) && fieldResults.every((field) => field.valid),
  fields: fieldResults,
  note: candidateBackend === "webgpu-isostasy"
    ? "Phase 2A experimental compare: CPU remains authoritative; WebGPU isostasy only runs when explicitly requested."
    : candidateBackend === "webgpu-elevation"
      ? "Phase 2B experimental compare: CPU remains authoritative; WebGPU elevation only runs when explicitly requested."
    : "CPU-vs-CPU compare remains the default path so expected deltas are zero.",
};

console.log(JSON.stringify(result, null, 2));

function runSteps(world, count) {
  for (let i = 0; i < count; i += 1) stepWorld(world);
}

async function runCandidate(candidateName, world) {
  if (candidateName === "webgpu-isostasy") return runWebGpuIsostasyCandidate(world);
  if (candidateName === "webgpu-elevation") return runWebGpuElevationCandidate(world);
  return null;
}

function compareField(fieldName, baselineField, candidateField, threshold = { rmse: 1e-9, maxAbs: 1e-9 }) {
  if (!baselineField || !candidateField) {
    return {
      field: fieldName,
      valid: false,
      reason: "Field is missing on one or both worlds.",
      rmse: null,
      meanAbs: null,
      maxAbs: null,
    };
  }
  if (baselineField.length !== candidateField.length) {
    return {
      field: fieldName,
      valid: false,
      reason: `Field length mismatch: ${baselineField.length} vs ${candidateField.length}.`,
      rmse: null,
      meanAbs: null,
      maxAbs: null,
    };
  }

  let sumSq = 0;
  let sumAbs = 0;
  let maxAbs = 0;
  for (let i = 0; i < baselineField.length; i += 1) {
    const delta = Number(candidateField[i]) - Number(baselineField[i]);
    const abs = Math.abs(delta);
    sumSq += delta * delta;
    sumAbs += abs;
    if (abs > maxAbs) maxAbs = abs;
  }

  const count = Math.max(1, baselineField.length);
  const rmse = Math.sqrt(sumSq / count);
  const meanAbs = sumAbs / count;
  return {
    field: fieldName,
    valid: rmse <= threshold.rmse && maxAbs <= threshold.maxAbs,
    threshold,
    rmse,
    meanAbs,
    maxAbs,
  };
}

function thresholdForField(fieldName, backend) {
  if (backend === "webgpu-elevation") {
    if (fieldName === "boundaryRelief") return { rmse: 0.003, maxAbs: 0.015 };
    if (fieldName === "baseElev" || fieldName === "relief" || fieldName === "elev") {
      return { rmse: 0.002, maxAbs: 0.01 };
    }
    return { rmse: 0.003, maxAbs: 0.015 };
  }
  if (backend !== "webgpu-isostasy") return { rmse: 1e-9, maxAbs: 1e-9 };
  if (fieldName === "oceanDepthTerms") return { rmse: 0.002, maxAbs: 0.01 };
  if (
    fieldName === "isostaticBase" ||
    fieldName === "ageSubsidence" ||
    fieldName === "thicknessBuoyancy" ||
    fieldName === "sedimentFill" ||
    fieldName === "crustBuoyancy" ||
    fieldName === "densitySubsidence" ||
    fieldName === "lithosphereCooling"
  ) {
    return { rmse: 0.001, maxAbs: 0.006 };
  }
  return { rmse: 0.002, maxAbs: 0.01 };
}
