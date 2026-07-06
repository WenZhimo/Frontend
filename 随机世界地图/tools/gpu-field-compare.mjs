import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { runWebGpuElevationCandidate } from "../src/gpu/elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "../src/gpu/isostasyCompute.js";
import { runWebGpuLocalFieldsCandidate } from "../src/gpu/localFieldsCompute.js";
import { runWebGpuMarginSmoothCandidate } from "../src/gpu/marginSmoothCompute.js";

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
const baselineLocalFields = candidateBackend === "webgpu-local-fields" ? computeCpuLocalFields(baseline) : null;
const candidateLocalFields = candidateBackend === "webgpu-local-fields" ? computeCpuLocalFields(candidate) : null;
const baselineMarginSmooth = candidateBackend === "webgpu-margin-smooth" ? computeCpuMarginSmooth(baseline) : null;
const candidateMarginSmooth = candidateBackend === "webgpu-margin-smooth" ? computeCpuMarginSmooth(candidate) : null;
const fieldResults = fields.map((fieldName) => {
  const candidateField = candidateResult?.skipped
    ? candidateLocalFields?.[fieldName] ?? candidateMarginSmooth?.[fieldName] ?? candidate.grid[fieldName]
    : candidateResult?.fields?.[fieldName] ?? candidateLocalFields?.[fieldName] ?? candidateMarginSmooth?.[fieldName] ?? candidate.grid[fieldName];
  const baselineField = baselineLocalFields?.[fieldName] ?? baselineMarginSmooth?.[fieldName] ?? baseline.grid[fieldName];
  return compareField(fieldName, baselineField, candidateField, thresholdForField(fieldName, candidateBackend));
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
      : candidateBackend === "webgpu-local-fields"
        ? "Phase 3 experimental compare: CPU terrain-derived fields remain authoritative; WebGPU local fields only run when explicitly requested."
        : candidateBackend === "webgpu-margin-smooth"
          ? "Phase 3 experimental compare: CPU margin fields remain authoritative; WebGPU margin smoothing only runs when explicitly requested."
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
  if (value === "webgpu-local-fields" || value === "local-fields" || value === "localTerrain") return "webgpu-local-fields";
  if (value === "webgpu-margin-smooth" || value === "margin-smooth" || value === "marginSmooth") return "webgpu-margin-smooth";
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
  if (backend === "webgpu-local-fields") {
    return ["slope", "aspect", "ruggedness", "localRelief"];
  }
  if (backend === "webgpu-margin-smooth") {
    return [
      "passiveMargin",
      "continentalShelf",
      "continentalSlope",
      "continentalRise",
      "sedimentWedge",
      "abyssalPlain",
    ];
  }
  return ["elev", "isostaticBase", "oceanDepthTerms"];
}

function runSteps(world, count) {
  for (let i = 0; i < count; i += 1) stepWorld(world);
}

async function runCandidate(candidateName, world) {
  if (candidateName === "webgpu-isostasy") return runWebGpuIsostasyCandidate(world);
  if (candidateName === "webgpu-elevation") return runWebGpuElevationCandidate(world);
  if (candidateName === "webgpu-local-fields") return runWebGpuLocalFieldsCandidate(world);
  if (candidateName === "webgpu-margin-smooth") return runWebGpuMarginSmoothCandidate(world);
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
  if (backend === "webgpu-local-fields") {
    if (fieldName === "aspect") return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00001 };
    return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
  }
  if (backend === "webgpu-margin-smooth") {
    return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
  }
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
  return (
    backend === "webgpu-isostasy" ||
    backend === "webgpu-elevation" ||
    backend === "webgpu-local-fields" ||
    backend === "webgpu-margin-smooth"
  );
}

function computeCpuLocalFields(world) {
  const { grid, seaLevel } = world;
  const { size, width, height } = grid;
  const slope = new Float32Array(size);
  const aspect = new Float32Array(size);
  const ruggedness = new Float32Array(size);
  const localRelief = new Float32Array(size);
  const relativeElevation = new Float32Array(size);
  for (let i = 0; i < size; i += 1) relativeElevation[i] = grid.elev[i] - seaLevel;

  for (let id = 0; id < size; id += 1) {
    const x = id % width;
    const y = Math.floor(id / width);
    const center = relativeElevation[id];
    const left = finiteSample(relativeElevation, width, height, x - 1, y, center);
    const right = finiteSample(relativeElevation, width, height, x + 1, y, center);
    const up = finiteSample(relativeElevation, width, height, x, y - 1, center);
    const down = finiteSample(relativeElevation, width, height, x, y + 1, center);
    const dx = (right - left) * 0.5;
    const dy = (down - up) * 0.5;
    slope[id] = Math.hypot(dx, dy);
    aspect[id] = Math.atan2(dy, dx);

    let sum = 0;
    let count = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const nid = indexOf(width, height, nx, ny);
      if (nid < 0) continue;
      sum += Math.abs(center - relativeElevation[nid]);
      count += 1;
    }
    ruggedness[id] = count ? sum / count : 0;
    localRelief[id] = Math.max(
      Math.abs(center - left),
      Math.abs(center - right),
      Math.abs(center - up),
      Math.abs(center - down),
    );
  }
  return { slope, aspect, ruggedness, localRelief };
}

function finiteSample(field, width, height, x, y, fallback) {
  const id = indexOf(width, height, x, y);
  if (id < 0) return fallback;
  const value = field[id];
  return Number.isFinite(value) ? value : fallback;
}

function indexOf(width, height, x, y) {
  if (y < 0 || y >= height) return -1;
  const sx = ((x % width) + width) % width;
  const id = y * width + sx;
  return id >= 0 && id < width * height ? id : -1;
}

function computeCpuMarginSmooth(world) {
  const { grid } = world;
  const { size, width, height } = grid;
  const fields = {
    passiveMargin: new Float32Array(grid.passiveMargin),
    continentalShelf: new Float32Array(grid.continentalShelf),
    continentalSlope: new Float32Array(grid.continentalSlope),
    continentalRise: new Float32Array(grid.continentalRise),
    sedimentWedge: new Float32Array(grid.sedimentWedge),
    abyssalPlain: new Float32Array(grid.abyssalPlain),
  };
  const result = {};
  for (const [name, source] of Object.entries(fields)) {
    const output = new Float32Array(size);
    for (let id = 0; id < size; id += 1) {
      const x = id % width;
      const y = Math.floor(id / width);
      let total = source[id] * 2.5;
      let weight = 2.5;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const nid = indexOf(width, height, nx, ny);
        if (nid < 0) continue;
        total += source[nid];
        weight += 1;
      }
      output[id] = Math.max(0, Math.min(1, total / weight));
    }
    result[name] = output;
  }
  return result;
}
