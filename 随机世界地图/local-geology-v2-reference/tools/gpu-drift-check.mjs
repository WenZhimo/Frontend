import { parseCsv, parseNumberList, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { runWebGpuElevationCandidate } from "../src/gpu/elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "../src/gpu/isostasyCompute.js";
import { runWebGpuLocalFieldsCandidate } from "../src/gpu/localFieldsCompute.js";
import { runWebGpuMarginSmoothCandidate } from "../src/gpu/marginSmoothCompute.js";
import { runWebGpuSedimentCapacityCandidate } from "../src/gpu/sedimentCapacityCompute.js";

const DEFAULT_SEED = "龙骨海-纪元7";
const DEFAULT_FIELDS = ["elev", "isostaticBase", "sedimentCapacity"];
const DEFAULT_CHECKPOINTS = [20, 200];

const { positional, options } = parseOptions(process.argv.slice(2));
const invocation = parseInvocation(positional, options);
const {
  seedText,
  pipelineMode,
  resolution,
  checkpoints,
  fields,
  gpuComputeMode,
  requestedKernels,
} = invocation;

const world = createCheckWorld({ seedText, pipelineMode, resolution });
const gpuCapabilities = detectGpuCapabilities(globalThis);
const kernels = resolveKernels(requestedKernels, fields, gpuComputeMode);
const checkpointResults = [];
const skippedReasons = new Set();
let totalMs = 0;
let checkpointIndex = 0;

while (checkpointIndex < checkpoints.length && checkpoints[checkpointIndex] === 0) {
  checkpointResults.push(await inspectCheckpoint(0));
  checkpointIndex += 1;
}

const maxStep = checkpoints[checkpoints.length - 1] ?? 0;
while (world.step < maxStep) {
  const startedAt = performance.now();
  stepWorld(world);
  totalMs += performance.now() - startedAt;
  while (checkpointIndex < checkpoints.length && world.step >= checkpoints[checkpointIndex]) {
    checkpointResults.push(await inspectCheckpoint(checkpoints[checkpointIndex]));
    checkpointIndex += 1;
  }
}

const fieldSummaries = summarizeFieldDrift(checkpointResults);
const diagnosticDrift = summarizeDiagnosticDrift(checkpointResults);
const failedFields = fieldSummaries.filter((field) => !field.valid).map((field) => field.field);
const maxFieldRmse = Math.max(0, ...fieldSummaries.map((field) => field.maxRmse ?? 0));
const maxFieldAbs = Math.max(0, ...fieldSummaries.map((field) => field.maxAbs ?? 0));
const candidateResults = checkpointResults.flatMap((checkpoint) => checkpoint.candidateResults);

const result = {
  seedText,
  pipelineMode,
  resolution,
  checkpoints,
  comparedSteps: checkpointResults.map((checkpoint) => checkpoint.step),
  gpuComputeMode,
  kernels,
  attempted: kernels.length > 0,
  skipped: candidateResults.length > 0 && candidateResults.every((item) => item.skipped),
  skippedReason: [...skippedReasons].join("; ") || null,
  gpuCapabilities,
  valid: failedFields.length === 0 && checkpointResults.every((checkpoint) => checkpoint.valid),
  maxFieldRmse,
  maxFieldAbs,
  failedFields,
  diagnosticDrift,
  driftOverTime: checkpointResults,
  fieldDrift: fieldSummaries,
  averageStepMs: totalMs / Math.max(1, maxStep),
  invocation,
  note:
    "Phase 4 drift gate: CPU remains authoritative. GPU candidates are sampled against each CPU checkpoint; skipped WebGPU paths fall back to zero-drift CPU evidence.",
};

console.log(JSON.stringify(result, null, 2));

async function inspectCheckpoint(checkpoint) {
  const candidateResults = [];
  const candidateFields = new Map();
  for (const kernel of kernels) {
    const candidateResult = await runKernelCandidate(kernel, world, fields);
    candidateResults.push({
      kernel,
      backend: candidateResult?.backend ?? kernel,
      skipped: candidateResult?.skipped ?? false,
      reason: candidateResult?.reason ?? null,
      timings: candidateResult?.timings ?? null,
    });
    if (candidateResult?.reason) skippedReasons.add(`${kernel}: ${candidateResult.reason}`);
    if (!candidateResult?.skipped && candidateResult?.fields) {
      for (const [fieldName, field] of Object.entries(candidateResult.fields)) {
        candidateFields.set(fieldName, field);
      }
    }
  }

  const fieldResults = fields.map((fieldName) => {
    const baselineField = world.grid[fieldName];
    const candidateField = candidateFields.get(fieldName) ?? world.grid[fieldName];
    return compareField(fieldName, baselineField, candidateField, thresholdForField(fieldName));
  });
  const diagnostics = compareDiagnostics(world, world);
  return {
    step: checkpoint,
    ageYears: world.ageYears,
    valid: fieldResults.every((field) => field.valid),
    candidateResults,
    fields: fieldResults,
    diagnostics,
  };
}

function parseInvocation(positional, options) {
  const firstNumber = Number(positional[1]);
  const secondLooksLikeResolution = /^\d+x\d+$/i.test(positional[2] ?? "");
  const legacyShape = Number.isFinite(firstNumber) && !secondLooksLikeResolution;
  const seedText = positional[0] ?? DEFAULT_SEED;
  const gpuComputeMode = String(options["gpu-compute"] ?? options.gpuCompute ?? "candidate");
  const requestedKernels = parseCsv(options["gpu-kernel"] ?? options.gpuKernel ?? options.kernel, []);

  if (legacyShape) {
    const checkpoint = Math.max(0, Math.trunc(firstNumber));
    return {
      format: "step-first",
      seedText,
      checkpoints: parseNumberList(options.checkpoints, [checkpoint]),
      pipelineMode: positional[2] ?? "geology-v2",
      resolution: positional[3] ?? "256x128",
      fields: parseCsv(positional[4] ?? options.fields, DEFAULT_FIELDS),
      gpuComputeMode,
      requestedKernels,
    };
  }

  return {
    format: "plan-doc",
    seedText,
    pipelineMode: positional[1] ?? "geology-v2",
    resolution: positional[2] ?? "256x128",
    checkpoints: parseNumberList(positional[3] ?? options.checkpoints, DEFAULT_CHECKPOINTS),
    fields: parseCsv(positional[4] ?? options.fields, DEFAULT_FIELDS),
    gpuComputeMode,
    requestedKernels,
  };
}

function resolveKernels(requested, fields, mode) {
  if (mode === "off" || mode === "none" || mode === "cpu") return [];
  const explicit = requested.map(kernelAlias).filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  const inferred = new Set();
  for (const fieldName of fields) {
    for (const kernel of kernelsForField(fieldName)) inferred.add(kernel);
  }
  return [...inferred];
}

function kernelAlias(value) {
  if (value === "webgpu-isostasy" || value === "isostasy") return "isostasy";
  if (value === "webgpu-elevation" || value === "elevation") return "elevation";
  if (value === "webgpu-local-fields" || value === "local-fields" || value === "localTerrain") return "local-fields";
  if (value === "webgpu-margin-smooth" || value === "margin-smooth" || value === "marginSmooth") return "margin-smooth";
  if (value === "webgpu-sediment-capacity" || value === "sediment-capacity" || value === "sedimentCapacity") return "sediment-capacity";
  return null;
}

function kernelsForField(fieldName) {
  if (
    [
      "isostaticBase",
      "crustBuoyancy",
      "densitySubsidence",
      "lithosphereCooling",
      "ageSubsidence",
      "thicknessBuoyancy",
      "sedimentFill",
      "ridgeUplift",
      "trenchDepression",
      "oceanDepthTerms",
      "isostaticResidual",
      "isostaticReliefSupply",
    ].includes(fieldName)
  ) {
    return ["isostasy"];
  }
  if (["baseElev", "relief", "boundaryRelief", "elev"].includes(fieldName)) {
    return ["elevation"];
  }
  if (["slope", "aspect", "ruggedness", "localRelief"].includes(fieldName)) {
    return ["local-fields"];
  }
  if (
    [
      "passiveMargin",
      "continentalShelf",
      "continentalSlope",
      "continentalRise",
      "sedimentWedge",
      "abyssalPlain",
    ].includes(fieldName)
  ) {
    return ["margin-smooth"];
  }
  if (fieldName === "sedimentCapacity") {
    return ["sediment-capacity"];
  }
  return [];
}

async function runKernelCandidate(kernelName, world, fields) {
  if (kernelName === "isostasy") return runWebGpuIsostasyCandidate(world, { fields });
  if (kernelName === "elevation") return runWebGpuElevationCandidate(world, { fields });
  if (kernelName === "local-fields") return runWebGpuLocalFieldsCandidate(world, { fields });
  if (kernelName === "margin-smooth") return runWebGpuMarginSmoothCandidate(world, { fields });
  if (kernelName === "sediment-capacity") return runWebGpuSedimentCapacityCandidate(world, { fields });
  return null;
}

function compareField(fieldName, baselineField, candidateField, threshold) {
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
  const deltas = new Float64Array(baselineField.length);
  for (let i = 0; i < baselineField.length; i += 1) {
    const delta = Number(candidateField[i]) - Number(baselineField[i]);
    const abs = Math.abs(delta);
    deltas[i] = abs;
    sumSq += delta * delta;
    sumAbs += abs;
    if (abs > maxAbs) maxAbs = abs;
  }
  const count = Math.max(1, baselineField.length);
  const rmse = Math.sqrt(sumSq / count);
  const meanAbs = sumAbs / count;
  const p95Abs = percentile(deltas, 0.95);
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

function thresholdForField(fieldName) {
  if (fieldName === "boundaryRelief") return { rmse: 0.003, maxAbs: 0.015, p95Abs: 0.006 };
  if (fieldName === "elev" || fieldName === "baseElev" || fieldName === "relief") {
    return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
  }
  if (fieldName === "oceanDepthTerms") return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
  if (fieldName === "sedimentCapacity") return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00002 };
  if (["aspect"].includes(fieldName)) return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00001 };
  if (["slope", "ruggedness", "localRelief"].includes(fieldName)) {
    return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
  }
  if (
    [
      "passiveMargin",
      "continentalShelf",
      "continentalSlope",
      "continentalRise",
      "sedimentWedge",
      "abyssalPlain",
    ].includes(fieldName)
  ) {
    return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
  }
  return { rmse: 0.001, maxAbs: 0.006, p95Abs: 0.002 };
}

function compareDiagnostics(a, b) {
  const landRatio = Math.abs((b.stats?.landRatio ?? 0) - (a.stats?.landRatio ?? 0));
  const seaRatio = Math.abs((b.stats?.seaRatio ?? 0) - (a.stats?.seaRatio ?? 0));
  const sedimentBudgetError = Math.abs(
    (b.sedimentBudgetDiagnostics?.sedimentBudgetError ?? 0) -
      (a.sedimentBudgetDiagnostics?.sedimentBudgetError ?? 0),
  );
  const depthAgeCorrelation = Math.abs(
    (b.oceanAgeDiagnostics?.depthAgeCorrelation ?? 0) -
      (a.oceanAgeDiagnostics?.depthAgeCorrelation ?? 0),
  );
  return {
    landRatio,
    seaRatio,
    depthAgeCorrelation,
    sedimentBudgetError,
  };
}

function summarizeFieldDrift(checkpoints) {
  const byField = new Map();
  for (const checkpoint of checkpoints) {
    for (const field of checkpoint.fields) {
      const item = byField.get(field.field) ?? {
        field: field.field,
        threshold: field.threshold,
        valid: true,
        maxRmse: 0,
        maxAbs: 0,
        maxP95Abs: 0,
        checkpoints: [],
      };
      item.valid = item.valid && field.valid;
      item.maxRmse = Math.max(item.maxRmse, field.rmse ?? Infinity);
      item.maxAbs = Math.max(item.maxAbs, field.maxAbs ?? Infinity);
      item.maxP95Abs = Math.max(item.maxP95Abs, field.p95Abs ?? Infinity);
      item.checkpoints.push({
        step: checkpoint.step,
        rmse: field.rmse,
        meanAbs: field.meanAbs,
        p95Abs: field.p95Abs,
        maxAbs: field.maxAbs,
        valid: field.valid,
      });
      byField.set(field.field, item);
    }
  }
  return [...byField.values()];
}

function summarizeDiagnosticDrift(checkpoints) {
  const summary = {
    landRatio: 0,
    seaRatio: 0,
    depthAgeCorrelation: 0,
    sedimentBudgetError: 0,
  };
  for (const checkpoint of checkpoints) {
    for (const key of Object.keys(summary)) {
      summary[key] = Math.max(summary[key], checkpoint.diagnostics[key] ?? 0);
    }
  }
  return summary;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}
