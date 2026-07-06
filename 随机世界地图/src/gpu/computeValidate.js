import { runWebGpuElevationCandidate } from "./elevationCompute.js";
import { GPU_ISOSTASY_OUTPUT_FIELDS, runWebGpuIsostasyCandidate } from "./isostasyCompute.js";
import { runWebGpuLocalFieldsCandidate } from "./localFieldsCompute.js";
import { runWebGpuMarginSmoothCandidate } from "./marginSmoothCompute.js";
import { runWebGpuSedimentCapacityCandidate } from "./sedimentCapacityCompute.js";

const DEFAULT_VALIDATE_FIELDS = ["isostaticBase"];
const DEFAULT_VALIDATE_KERNELS = ["isostasy"];
const DEFAULT_EXPERIMENTAL_KERNELS = ["isostasy"];
const DEFAULT_EXPERIMENTAL_FIELDS = GPU_ISOSTASY_OUTPUT_FIELDS;
const EXPERIMENTAL_WRITEBACK_FIELDS = new Set(GPU_ISOSTASY_OUTPUT_FIELDS);

export function createGpuComputeValidator(options = {}) {
  const mode = normalizeMode(options.mode);
  const kernels = normalizeCsvList(
    options.kernels,
    mode === "experimental" ? DEFAULT_EXPERIMENTAL_KERNELS : DEFAULT_VALIDATE_KERNELS,
  );
  const fields = normalizeCsvList(options.fields, defaultFieldsForMode(mode, kernels));
  const interval = Math.max(1, Math.trunc(Number(options.interval ?? 20)) || 20);
  const maxReports = Math.max(1, Math.trunc(Number(options.maxReports ?? 12)) || 12);
  const globalObject = options.globalObject ?? globalThis;
  const logger = options.logger ?? console;
  let running = false;
  let reportCount = 0;
  let lastValidatedStep = -1;
  const validationHistory = [];

  return {
    mode,
    enabled: mode === "validate" || mode === "experimental",
    kernels,
    fields,
    interval,
    maybeValidate(world) {
      if ((mode !== "validate" && mode !== "experimental") || !world?.grid || running || reportCount >= maxReports) {
        return null;
      }
      if (!Number.isFinite(world.step) || world.step <= 0 || world.step === lastValidatedStep) return null;
      if (world.step % interval !== 0) return null;
      running = true;
      lastValidatedStep = world.step;
      return scheduleValidationTask(globalObject, () => runScheduledValidation(world));
    },
  };

  async function runScheduledValidation(world) {
    try {
      const result =
        mode === "experimental"
          ? await applyExperimentalGpuComputeCheckpoint(world, { kernels, fields, globalObject })
          : await validateGpuComputeCheckpoint(world, { kernels, fields, globalObject });
      reportCount += 1;
      logValidateResult(logger, result);
      publishValidationResult(world, globalObject, validationHistory, result);
      return result;
    } catch (error) {
      const result = {
        valid: true,
        skipped: true,
        step: world.step,
        mode,
        reason: `GPU compute validate failed safely: ${error?.message ?? "unknown error"}`,
        fallbackReason: `GPU compute ${mode} failed safely: ${error?.message ?? "unknown error"}`,
        writebackApplied: false,
        writebackFields: [],
        fields: [],
        candidateResults: [],
      };
      reportCount += 1;
      logValidateResult(logger, result);
      publishValidationResult(world, globalObject, validationHistory, result);
      return result;
    } finally {
      running = false;
    }
  }
}

function scheduleValidationTask(globalObject, task) {
  return new Promise((resolve) => {
    const run = () => {
      resolve(Promise.resolve().then(task));
    };
    if (typeof globalObject?.requestIdleCallback === "function") {
      globalObject.requestIdleCallback(run, { timeout: 250 });
      return;
    }
    globalObject?.setTimeout?.(run, 0);
  });
}

function publishValidationResult(world, globalObject, history, result) {
  history.push(result);
  while (history.length > 24) history.shift();
  world.gpuComputeValidation = result;
  globalObject.__lastGpuComputeValidation = result;
  globalObject.__gpuComputeValidationHistory = history;
}

export async function validateGpuComputeCheckpoint(world, options = {}) {
  const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
  const fields = normalizeCsvList(options.fields, defaultFieldsForMode("validate", kernels));
  const comparison = await compareGpuComputeCheckpoint(world, { ...options, kernels, fields });
  return {
    valid: comparison.fieldResults.every((field) => field.valid),
    skipped: comparison.skipped,
    skippedReason: comparison.skipped ? comparison.skippedReason : null,
    step: comparison.snapshot.step,
    ageYears: comparison.snapshot.ageYears,
    mode: "validate",
    kernels,
    fields: comparison.fieldResults,
    candidateResults: comparison.candidateResults,
    writebackApplied: false,
    writebackFields: [],
    note: "Browser GPU compute validate keeps CPU authoritative; candidate fields are compared but never written back.",
  };
}

export async function applyExperimentalGpuComputeCheckpoint(world, options = {}) {
  const kernels = normalizeCsvList(options.kernels, DEFAULT_EXPERIMENTAL_KERNELS);
  const fields = normalizeCsvList(options.fields, defaultFieldsForMode("experimental", kernels));
  const comparison = await compareGpuComputeCheckpoint(world, { ...options, kernels, fields });
  const invalidFields = comparison.fieldResults.filter((field) => !field.valid);
  const writebackFields = [];
  let fallbackReason = null;

  if (comparison.skipped) {
    fallbackReason = comparison.skippedReason || "GPU candidate skipped.";
  } else if (invalidFields.length > 0) {
    fallbackReason = `GPU candidate exceeded thresholds for: ${invalidFields.map((field) => field.field).join(", ")}.`;
  } else {
    for (const field of comparison.fieldResults) {
      const fieldName = field.field;
      const candidate = comparison.candidateFields[fieldName];
      const target = world.grid?.[fieldName];
      if (!EXPERIMENTAL_WRITEBACK_FIELDS.has(fieldName) || !candidate || !target || target.length !== candidate.length) {
        continue;
      }
      target.set(candidate);
      writebackFields.push(fieldName);
    }
    if (!writebackFields.length) {
      fallbackReason = "No requested fields are enabled for experimental GPU writeback.";
    }
  }

  return {
    valid: invalidFields.length === 0,
    skipped: comparison.skipped,
    skippedReason: comparison.skipped ? comparison.skippedReason : null,
    step: comparison.snapshot.step,
    ageYears: comparison.snapshot.ageYears,
    mode: "experimental",
    kernels,
    fields: comparison.fieldResults,
    candidateResults: comparison.candidateResults,
    writebackApplied: writebackFields.length > 0,
    writebackFields,
    fallbackReason,
    note:
      "Browser GPU compute experimental mode writes back only explicitly validated low-risk derived fields; CPU remains the fallback when validation fails or WebGPU is unavailable.",
  };
}

async function compareGpuComputeCheckpoint(world, options = {}) {
  const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
  const fields = normalizeCsvList(options.fields, defaultFieldsForMode("validate", kernels));
  const snapshot = createValidationSnapshot(world);
  const candidateResults = [];
  const candidateFields = {};
  const baselineFields = buildBaselineFieldsForKernels(kernels, snapshot);

  for (const kernel of kernels) {
    const result = await runCandidateKernel(kernel, snapshot, options.globalObject, fields);
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
    snapshot,
    fieldResults,
    candidateFields,
    candidateResults,
    skipped,
    skippedReason: skipped ? skippedReason : null,
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

function defaultFieldsForMode(mode, kernels) {
  const normalized = normalizeCsvList(kernels, []);
  if (mode === "experimental" && normalized.some((kernel) => kernel === "isostasy" || kernel === "webgpu-isostasy")) {
    return DEFAULT_EXPERIMENTAL_FIELDS;
  }
  return DEFAULT_VALIDATE_FIELDS;
}

async function runCandidateKernel(kernel, world, globalObject, fields) {
  if (kernel === "elevation" || kernel === "webgpu-elevation") {
    return runWebGpuElevationCandidate(world, { globalObject, fields });
  }
  if (kernel === "isostasy" || kernel === "webgpu-isostasy") {
    return runWebGpuIsostasyCandidate(world, { globalObject, fields });
  }
  if (kernel === "local-fields" || kernel === "localTerrain" || kernel === "webgpu-local-fields") {
    return runWebGpuLocalFieldsCandidate(world, { globalObject, fields });
  }
  if (kernel === "margin-smooth" || kernel === "marginSmooth" || kernel === "webgpu-margin-smooth") {
    return runWebGpuMarginSmoothCandidate(world, { globalObject, fields });
  }
  if (kernel === "sediment-capacity" || kernel === "sedimentCapacity" || kernel === "webgpu-sediment-capacity") {
    return runWebGpuSedimentCapacityCandidate(world, { globalObject, fields });
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
    requestedFields: result?.requestedFields ?? [],
    downloadedPacks: result?.downloadedPacks ?? [],
    adapterInfo: result?.adapterInfo ?? null,
    deviceInfo: result?.deviceInfo ?? null,
    reusedContext: result?.reusedContext ?? false,
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
    } else if (kernel === "sediment-capacity" || kernel === "sedimentCapacity" || kernel === "webgpu-sediment-capacity") {
      Object.assign(baselineFields, computeCpuSedimentCapacity(world));
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

function computeCpuSedimentCapacity(world) {
  const { grid, seaLevel } = world;
  const { size, width, height } = grid;
  if (!isRectangularGrid(grid)) return {};
  const sedimentCapacity = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const rel = grid.elev[i] - seaLevel;
    const nearOrBelowSea = clamp01((seaLevel + 0.08 - grid.elev[i]) / 0.16);
    const shelfCapacity =
      (grid.continentalShelf?.[i] ?? 0) * 0.34 +
      (grid.continentalRise?.[i] ?? 0) * 0.24 +
      (grid.sedimentWedge?.[i] ?? 0) * 0.22 +
      (grid.passiveMargin?.[i] ?? 0) * 0.16;
    const naturalCapacitySupport = clamp01(
      nearOrBelowSea * 0.28 +
        (grid.continentalShelf?.[i] ?? 0) * 0.55 +
        (grid.continentalRise?.[i] ?? 0) * 0.42 +
        (grid.sedimentWedge?.[i] ?? 0) * 0.36 +
        (grid.passiveMargin?.[i] ?? 0) * 0.28 +
        (grid.forelandBasin?.[i] ?? 0) * 0.34 +
        (grid.inlandWaterCandidate?.[i] ?? 0) * 0.42 +
        (grid.abyssalPlain?.[i] ?? 0) * 0.12,
    );
    const structuralLine = sedimentStructuralLineMemory(grid, i);
    const broadBasin = localAverage8(grid, grid.basin, i);
    const basinCapacity =
      broadBasin * (0.11 + naturalCapacitySupport * 0.2) +
      (grid.basin?.[i] ?? 0) * (0.035 + naturalCapacitySupport * 0.065) * (1 - structuralLine * 0.55) +
      (grid.forelandBasin?.[i] ?? 0) * 0.27 +
      (grid.riftAxis?.[i] ?? 0) * 0.052 +
      (grid.inlandWaterCandidate?.[i] ?? 0) * 0.2;
    const trenchForearcCapacity =
      (grid.trench?.[i] ?? 0) * 0.055 +
      (grid.trenchAxis?.[i] ?? 0) * 0.045 +
      (grid.islandArc?.[i] ?? 0) * 0.04;
    const isOceanic = Math.trunc((grid.crustType?.[i] ?? 1) + 0.5) === 0;
    const deepOceanCapacity = (grid.abyssalPlain?.[i] ?? 0) * 0.075 * (isOceanic ? clamp01(grid.crustAge?.[i] ?? 0) : 0);
    const activeConstructivePenalty =
      (grid.ridgeAxis?.[i] ?? 0) * 0.34 +
      (grid.ridge?.[i] ?? 0) * 0.24 +
      (grid.activeOrogeny?.[i] ?? 0) * 0.18 +
      (rel > 0.12 ? smoothstep(0.12, 0.32, rel) * 0.08 : 0);
    sedimentCapacity[i] = clamp01(
      shelfCapacity +
        basinCapacity +
        trenchForearcCapacity +
        deepOceanCapacity +
        nearOrBelowSea * 0.08 -
        activeConstructivePenalty,
    );
  }
  softenCpuSedimentCapacity(world, sedimentCapacity);
  return { sedimentCapacity };
}

function softenCpuSedimentCapacity(world, sedimentCapacity) {
  const { grid } = world;
  const scratch = new Float32Array(sedimentCapacity.length);
  for (let pass = 0; pass < 2; pass += 1) {
    scratch.set(sedimentCapacity);
    for (let id = 0; id < sedimentCapacity.length; id += 1) {
      let total = scratch[id] * 1.8;
      let weight = 1.8;
      visitNeighbor8(grid, id, (nid, diagonal) => {
        const w = diagonal ? 0.38 : 0.72;
        total += scratch[nid] * w;
        weight += w;
      });
      const local = scratch[id];
      const smoothed = total / weight;
      const naturalSink = cpuSoftDepositionalSink(grid, id);
      const structuralLine = clamp01(
        Math.max(0, (grid.boundaryInfluence?.[id] ?? 0) - 0.14) * 1.8 +
          (grid.fractureZoneMemory?.[id] ?? 0) * 0.65 +
          (grid.transformMemory?.[id] ?? 0) * 0.42 +
          (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2,
      );
      const blend = clamp01(0.16 + naturalSink * 0.16 + structuralLine * 0.22);
      const edgeClamp = 0.06 + naturalSink * 0.04;
      sedimentCapacity[id] = clamp01(mix(local, Math.min(local + edgeClamp, smoothed), blend));
    }
  }
}

function cpuSoftDepositionalSink(grid, id) {
  const broadBasin = localAverage8(grid, grid.basin, id);
  const structuralLine = sedimentStructuralLineMemory(grid, id);
  const natural =
    (grid.passiveMargin?.[id] ?? 0) * 0.54 +
    (grid.continentalShelf?.[id] ?? 0) * 0.72 +
    (grid.continentalRise?.[id] ?? 0) * 0.54 +
    (grid.sedimentWedge?.[id] ?? 0) * 0.5 +
    (grid.forelandBasin?.[id] ?? 0) * 0.62 +
    (grid.inlandWaterCandidate?.[id] ?? 0) * 0.44 +
    (grid.abyssalPlain?.[id] ?? 0) * 0.22;
  const basinPart = (broadBasin * 0.2 + (grid.basin?.[id] ?? 0) * 0.08) * (0.35 + natural * 0.65) * (1 - structuralLine * 0.55);
  return clamp01(natural + basinPart);
}

function sedimentStructuralLineMemory(grid, id) {
  return clamp01(
    Math.max(0, (grid.boundaryInfluence?.[id] ?? 0) - 0.12) * 1.25 +
      (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2 +
      (grid.fractureZoneMemory?.[id] ?? 0) * 0.9 +
      (grid.transformMemory?.[id] ?? 0) * 0.55,
  );
}

function localAverage8(grid, field, id) {
  if (!field) return 0;
  let total = field[id] * 1.5;
  let weight = 1.5;
  visitNeighbor8(grid, id, (nid, diagonal) => {
    const w = diagonal ? 0.45 : 0.8;
    total += field[nid] * w;
    weight += w;
  });
  return total / weight;
}

function visitNeighbor8(grid, id, visit) {
  const width = grid.width;
  const x = id % width;
  const y = Math.floor(id / width);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nid = indexOf(width, grid.height, x + dx, y + dy);
      if (nid < 0) continue;
      visit(nid, dx !== 0 && dy !== 0);
    }
  }
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a * (1 - t) + b * t;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
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
    mode: result.mode,
    valid: result.valid,
    skipped: result.skipped,
    skippedReason: result.skippedReason ?? result.reason ?? null,
    fallbackReason: result.fallbackReason ?? null,
    writebackApplied: result.writebackApplied ?? false,
    writebackFields: result.writebackFields ?? [],
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
  const label = result.mode === "experimental" ? "[gpu-compute-experimental]" : "[gpu-compute-validate]";
  logger?.[method]?.(label, summary);
}

function emptyTimings() {
  return {
    setupMs: null,
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
    totalCandidateMs: null,
  };
}
