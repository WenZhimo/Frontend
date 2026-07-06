import { runWebGpuElevationCandidate } from "./elevationCompute.js";
import { runWebGpuIsostasyCandidate } from "./isostasyCompute.js";
import { runWebGpuLocalFieldsCandidate } from "./localFieldsCompute.js";
import { runWebGpuMarginSmoothCandidate } from "./marginSmoothCompute.js";
import { runWebGpuSedimentCapacityCandidate } from "./sedimentCapacityCompute.js";

const DEFAULT_VALIDATE_FIELDS = ["isostaticBase"];
const DEFAULT_VALIDATE_KERNELS = ["isostasy"];

export function createGpuComputeValidator(options = {}) {
  const mode = normalizeMode(options.mode);
  const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
  const fields = normalizeCsvList(options.fields, DEFAULT_VALIDATE_FIELDS);
  const interval = Math.max(1, Math.trunc(Number(options.interval ?? 20)) || 20);
  const maxReports = Math.max(1, Math.trunc(Number(options.maxReports ?? 12)) || 12);
  const globalObject = options.globalObject ?? globalThis;
  const logger = options.logger ?? console;
  let running = false;
  let reportCount = 0;
  let lastValidatedStep = -1;

  return {
    mode,
    enabled: mode === "validate",
    kernels,
    fields,
    interval,
    async maybeValidate(world) {
      if (mode !== "validate" || !world?.grid || running || reportCount >= maxReports) return null;
      if (!Number.isFinite(world.step) || world.step <= 0 || world.step === lastValidatedStep) return null;
      if (world.step % interval !== 0) return null;
      running = true;
      lastValidatedStep = world.step;
      try {
        const result = await validateGpuComputeCheckpoint(world, {
          kernels,
          fields,
          globalObject,
        });
        reportCount += 1;
        logValidateResult(logger, result);
        world.gpuComputeValidation = result;
        globalObject.__lastGpuComputeValidation = result;
        return result;
      } catch (error) {
        const result = {
          valid: true,
          skipped: true,
          step: world.step,
          mode,
          reason: `GPU compute validate failed safely: ${error?.message ?? "unknown error"}`,
          fields: [],
          candidateResults: [],
        };
        reportCount += 1;
        logValidateResult(logger, result);
        world.gpuComputeValidation = result;
        globalObject.__lastGpuComputeValidation = result;
        return result;
      } finally {
        running = false;
      }
    },
  };
}

export async function validateGpuComputeCheckpoint(world, options = {}) {
  const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
  const fields = normalizeCsvList(options.fields, DEFAULT_VALIDATE_FIELDS);
  const snapshot = createValidationSnapshot(world);
  const candidateResults = [];
  const candidateFields = {};
  const baselineFields = buildBaselineFieldsForKernels(kernels, snapshot);

  for (const kernel of kernels) {
    const result = await runCandidateKernel(kernel, snapshot, options.globalObject);
    candidateResults.push(compactCandidateResult(kernel, result));
    if (!result?.skipped && result?.fields) {
      Object.assign(candidateFields, result.fields);
    }
  }

  const fieldResults = fields.map((fieldName) => {
    const baselineField = baselineFields[fieldName] ?? snapshot.grid[fieldName];
    const candidateField = candidateFields[fieldName] ?? baselineField;
    return {
      ...compareField(fieldName, baselineField, candidateField, thresholdForField(fieldName)),
      baselineSummary: summarizeField(baselineField),
      candidateSummary: summarizeField(candidateField),
    };
  });
  const skipped = candidateResults.length > 0 && candidateResults.every((result) => result.skipped);
  const skippedReason = candidateResults
    .filter((result) => result.skipped)
    .map((result) => `${result.kernel}: ${result.reason}`)
    .join("; ");

  return {
    valid: fieldResults.every((field) => field.valid),
    skipped,
    skippedReason: skipped ? skippedReason : null,
    step: snapshot.step,
    ageYears: snapshot.ageYears,
    mode: "validate",
    kernels,
    fields: fieldResults,
    candidateResults,
    note: "Browser GPU compute validate keeps CPU authoritative; candidate fields are compared but never written back.",
  };
}

function createValidationSnapshot(world) {
  const grid = world?.grid ?? {};
  const snapshotGrid = {};
  for (const [key, value] of Object.entries(grid)) {
    if (ArrayBuffer.isView(value) && typeof value.constructor === "function") {
      snapshotGrid[key] = new value.constructor(value);
    } else {
      snapshotGrid[key] = value;
    }
  }
  return {
    ...world,
    grid: snapshotGrid,
    step: world?.step ?? 0,
    ageYears: world?.ageYears ?? 0,
    seaLevel: world?.seaLevel ?? 0,
    timeScaleFactor: world?.timeScaleFactor ?? 1,
  };
}

function normalizeMode(value) {
  const mode = String(value ?? "off").trim().toLowerCase();
  if (mode === "validate") return "validate";
  if (mode === "candidate") return "candidate";
  if (mode === "experimental") return "experimental";
  return "off";
}

function normalizeCsvList(value, fallback) {
  if (Array.isArray(value)) return value.map(String).map((part) => part.trim()).filter(Boolean);
  if (value === undefined || value === null || value === "") return [...fallback];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function runCandidateKernel(kernel, world, globalObject) {
  if (kernel === "elevation" || kernel === "webgpu-elevation") {
    return runWebGpuElevationCandidate(world, { globalObject });
  }
  if (kernel === "isostasy" || kernel === "webgpu-isostasy") {
    return runWebGpuIsostasyCandidate(world, { globalObject });
  }
  if (kernel === "local-fields" || kernel === "localTerrain" || kernel === "webgpu-local-fields") {
    return runWebGpuLocalFieldsCandidate(world, { globalObject });
  }
  if (kernel === "margin-smooth" || kernel === "marginSmooth" || kernel === "webgpu-margin-smooth") {
    return runWebGpuMarginSmoothCandidate(world, { globalObject });
  }
  if (kernel === "sediment-capacity" || kernel === "sedimentCapacity" || kernel === "webgpu-sediment-capacity") {
    return runWebGpuSedimentCapacityCandidate(world, { globalObject });
  }
  return {
    skipped: true,
    valid: true,
    backend: kernel,
    reason: `Unknown GPU validate kernel: ${kernel}`,
    timings: emptyTimings(),
    fields: {},
  };
}

function compactCandidateResult(kernel, result) {
  return {
    kernel,
    backend: result?.backend ?? kernel,
    skipped: Boolean(result?.skipped),
    valid: result?.valid !== false,
    reason: result?.reason ?? null,
    timings: result?.timings ?? emptyTimings(),
  };
}

function compareField(fieldName, baselineField, candidateField, threshold) {
  if (!baselineField || !candidateField) {
    return {
      field: fieldName,
      valid: false,
      reason: "Field is missing on the world or candidate result.",
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

function summarizeField(field) {
  if (!field || !field.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < field.length; i += 1) {
    const value = Number(field[i]);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    count += 1;
  }
  return {
    min: count ? min : null,
    max: count ? max : null,
    mean: count ? sum / count : null,
    finiteShare: field.length ? count / field.length : 0,
  };
}

function thresholdForField(fieldName) {
  if (fieldName === "aspect") return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00001 };
  if (fieldName === "slope" || fieldName === "ruggedness" || fieldName === "localRelief") {
    return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
  }
  if (
    fieldName === "passiveMargin" ||
    fieldName === "continentalShelf" ||
    fieldName === "continentalSlope" ||
    fieldName === "continentalRise" ||
    fieldName === "sedimentWedge" ||
    fieldName === "abyssalPlain"
  ) {
    return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
  }
  if (fieldName === "sedimentCapacity") return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00002 };
  if (fieldName === "boundaryRelief") return { rmse: 0.003, maxAbs: 0.015, p95Abs: 0.006 };
  if (fieldName === "elev" || fieldName === "baseElev" || fieldName === "relief") {
    return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
  }
  if (
    fieldName === "isostaticBase" ||
    fieldName === "ageSubsidence" ||
    fieldName === "thicknessBuoyancy" ||
    fieldName === "sedimentFill" ||
    fieldName === "crustBuoyancy" ||
    fieldName === "densitySubsidence" ||
    fieldName === "lithosphereCooling"
  ) {
    return { rmse: 0.001, maxAbs: 0.0065, p95Abs: 0.002 };
  }
  return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function buildBaselineFieldsForKernels(kernels, world) {
  const baselineFields = {};
  for (const kernel of kernels) {
    if (kernel === "local-fields" || kernel === "localTerrain" || kernel === "webgpu-local-fields") {
      Object.assign(baselineFields, computeCpuLocalFields(world));
    } else if (kernel === "margin-smooth" || kernel === "marginSmooth" || kernel === "webgpu-margin-smooth") {
      Object.assign(baselineFields, computeCpuMarginSmooth(world));
    }
  }
  return baselineFields;
}

function computeCpuLocalFields(world) {
  const { grid, seaLevel } = world;
  const { size, width, height } = grid;
  if (!isRectangularGrid(grid)) return {};
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

function computeCpuMarginSmooth(world) {
  const { grid } = world;
  const { size, width, height } = grid;
  if (!isRectangularGrid(grid)) return {};
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

function isRectangularGrid(grid) {
  const width = grid?.width;
  const height = grid?.height;
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width * height === grid?.size &&
    !grid?.topologyOptions?.graphBacked &&
    grid?.topologyKind !== "cubed-sphere"
  );
}

function logValidateResult(logger, result) {
  const summary = {
    step: result.step,
    ageYears: result.ageYears,
    valid: result.valid,
    skipped: result.skipped,
    skippedReason: result.skippedReason ?? result.reason ?? null,
    kernels: result.kernels,
    fields: result.fields?.map((field) => ({
      field: field.field,
      valid: field.valid,
      rmse: field.rmse,
      maxAbs: field.maxAbs,
      p95Abs: field.p95Abs,
      baselineMean: field.baselineSummary?.mean ?? null,
      candidateMean: field.candidateSummary?.mean ?? null,
    })) ?? [],
  };
  const method = result.valid ? "info" : "warn";
  logger?.[method]?.("[gpu-compute-validate]", summary);
}

function emptyTimings() {
  return {
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
  };
}
