import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseBoolOption, parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";

const { options } = parseOptions(process.argv.slice(2));

const root = resolve(options.root ?? ".");
const seeds = parseCsv(options.seeds, ["龙骨海-纪元7", "artifact-seed-3"]);
const resolutions = parseCsv(options.resolutions ?? options.resolution, ["256x128", "512x256"]);
const kernels = parseCsv(options.kernels ?? options.kernel, ["local-fields"]);
const steps = parseIntOption(options, "steps", 2);
const validationCount = parseIntOption(options, "validation-count", 2);
const gpuValidateMaxCandidateMs = parseIntOption(options, "gpu-validate-max-candidate-ms", parseIntOption(options, "gpuValidateMaxCandidateMs", 0));
const gpuValidateMaxTotalMs = parseIntOption(options, "gpu-validate-max-total-ms", parseIntOption(options, "gpuValidateMaxTotalMs", 0));
const gpuValidateCooldownSteps = parseIntOption(options, "gpu-validate-cooldown-steps", parseIntOption(options, "gpuValidateCooldownSteps", 0));
const requireValidationThrottle = parseBoolOption(options, "require-validation-throttle");
const waitMs = parseIntOption(options, "wait-ms", 120000);
const baselineWaitMs = parseIntOption(options, "baseline-wait-ms", 8000);
const startPort = parseIntOption(options, "start-port", 9800);
const topology = String(options.topology ?? "cylindrical");
const projection = String(options.projection ?? "equirectangular");
const renderBackend = String(options["render-backend"] ?? options.renderBackend ?? "cpu");
const maxStepRatio = parseNumberOption(options, "max-step-ratio", 1.0);
const maxRenderRatio = parseNumberOption(options, "max-render-ratio", 1.1);
const maxLongTaskRatio = parseNumberOption(options, "max-long-task-ratio", 1.0);
const maxGpuToCpuStepRatio = parseNumberOption(options, "max-gpu-to-cpu-step-ratio", 0.8);
const maxWarmGpuTotalMs = parseNumberOption(options, "max-warm-gpu-total-ms", 0);
const maxWarmGpuCandidateMs = parseNumberOption(options, "max-warm-gpu-candidate-ms", 0);
const failOnNotReady = parseBoolOption(options, "fail-on-not-ready");
const chrome = options.chrome;

const matrix = runMatrix();
const matrixOutput = parseJson(matrix.stdout);
if (!matrixOutput) {
  console.log(JSON.stringify({
    valid: false,
    ready: false,
    reason: "browser-gpu-perf-matrix did not produce JSON output.",
    matrixExitCode: matrix.status,
    stderr: tail(matrix.stderr),
    stdout: tail(matrix.stdout),
  }, null, 2));
  process.exitCode = 1;
} else {
  const cases = matrixOutput.results ?? [];
  const readinessCases = cases.map(evaluateCase);
  const failedCases = readinessCases.filter((entry) => !entry.browserValid);
  const notReadyCases = readinessCases.filter((entry) => !entry.ready);
  const ready = failedCases.length === 0 && notReadyCases.length === 0 && readinessCases.length > 0;
  const result = {
    valid: failedCases.length === 0 && readinessCases.length > 0,
    ready,
    recommendation: ready
      ? "All checked browser cases meet the conservative default-GPU readiness gate. Review the evidence before changing defaults."
      : "Keep GPU compute experimental for the checked kernels; at least one browser case is not ready for default enablement.",
    criteria: {
      maxStepRatio,
      maxRenderRatio,
      maxLongTaskRatio,
      maxGpuToCpuStepRatio,
      maxWarmGpuTotalMs: maxWarmGpuTotalMs || null,
      maxWarmGpuCandidateMs: maxWarmGpuCandidateMs || null,
      gpuValidateMaxCandidateMs: gpuValidateMaxCandidateMs || null,
      gpuValidateMaxTotalMs: gpuValidateMaxTotalMs || null,
      gpuValidateCooldownSteps: gpuValidateCooldownSteps || null,
      requireValidationThrottle,
    },
    matrixSummary: matrixOutput.summary ?? null,
    totalCases: readinessCases.length,
    readyCases: readinessCases.filter((entry) => entry.ready).length,
    notReadyCases: notReadyCases.length,
    failedCases: failedCases.length,
    cases: readinessCases,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid || (failOnNotReady && !ready)) process.exitCode = 1;
}

function runMatrix() {
  const args = [
    ".\\tools\\browser-gpu-perf-matrix.mjs",
    "--seeds", seeds.join(","),
    "--resolutions", resolutions.join(","),
    "--kernels", kernels.join(","),
    "--steps", String(steps),
    "--validation-count", String(validationCount),
    "--wait-ms", String(waitMs),
    "--baseline-wait-ms", String(baselineWaitMs),
    "--start-port", String(startPort),
    "--topology", topology,
    "--projection", projection,
    "--render-backend", renderBackend,
    "--include-cpu-baseline",
  ];
  if (maxWarmGpuTotalMs > 0) args.push("--max-warm-gpu-total-ms", String(maxWarmGpuTotalMs));
  if (maxWarmGpuCandidateMs > 0) args.push("--max-warm-gpu-candidate-ms", String(maxWarmGpuCandidateMs));
  if (gpuValidateMaxCandidateMs > 0) args.push("--gpu-validate-max-candidate-ms", String(gpuValidateMaxCandidateMs));
  if (gpuValidateMaxTotalMs > 0) args.push("--gpu-validate-max-total-ms", String(gpuValidateMaxTotalMs));
  if (gpuValidateCooldownSteps > 0) args.push("--gpu-validate-cooldown-steps", String(gpuValidateCooldownSteps));
  if (requireValidationThrottle) args.push("--require-validation-throttle");
  if (chrome) args.push("--chrome", String(chrome));
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  });
}

function evaluateCase(entry) {
  const reasons = [];
  const browserValid = entry?.valid === true
    && entry?.cpuBaseline?.valid === true
    && Number(entry?.consoleProjectErrors ?? 0) === 0
    && Number(entry?.cpuBaseline?.consoleProjectErrors ?? 0) === 0
    && (requireValidationThrottle || entry?.reusedContextObserved === true)
    && (requireValidationThrottle || entry?.warmGpuTotalMs !== null);

  if (entry?.valid !== true) reasons.push(entry?.error ?? "Browser GPU validation case failed.");
  if (entry?.cpuBaseline?.valid !== true) reasons.push(entry?.cpuBaseline?.error ?? "CPU browser baseline failed.");
  if (Number(entry?.consoleProjectErrors ?? 0) !== 0) reasons.push("GPU browser case reported project console errors.");
  if (Number(entry?.cpuBaseline?.consoleProjectErrors ?? 0) !== 0) reasons.push("CPU browser baseline reported project console errors.");
  if (requireValidationThrottle && entry?.validationThrottled === true) {
    reasons.push(`GPU validation throttle was observed; keep this path experimental. ${entry.validationThrottleReason ?? ""}`.trim());
  } else {
    if (entry?.reusedContextObserved !== true) reasons.push("Reused GPU context was not observed.");
    if (entry?.reusedBuffersObserved !== true) reasons.push("Reused GPU buffers were not observed.");
    if (Number.isFinite(entry?.warmGpuBufferSetupMs) && Math.abs(entry.warmGpuBufferSetupMs) > 0.000001) {
      reasons.push(`Warm GPU buffer setup ${round2(entry.warmGpuBufferSetupMs)}ms is not zero.`);
    }
    if (entry?.warmGpuTotalMs === null) reasons.push("Warm GPU total path timing is unavailable.");
  }

  const ratioFailures = evaluateRatios(entry);
  reasons.push(...ratioFailures);

  const cpuStepAverage = Number(entry?.cpuBaseline?.performance?.step?.averageMs);
  const warmGpuTotal = Number(entry?.warmGpuTotalMs);
  const warmGpuCandidate = Number(entry?.warmGpuCandidateMs);
  if (requireValidationThrottle && entry?.validationThrottled === true) {
    // Throttle diagnostics prove responsiveness protection, not default-readiness.
  } else if (!Number.isFinite(cpuStepAverage) || cpuStepAverage <= 0) {
    reasons.push("CPU step average is unavailable, so GPU total path cannot be compared.");
  } else if (!Number.isFinite(warmGpuTotal)) {
    reasons.push("Warm GPU total path is unavailable.");
  } else if (warmGpuTotal > cpuStepAverage * maxGpuToCpuStepRatio) {
    reasons.push(`Warm GPU total ${round2(warmGpuTotal)}ms exceeds CPU step average ${round2(cpuStepAverage)}ms * ${maxGpuToCpuStepRatio}.`);
  }
  if (maxWarmGpuTotalMs > 0 && Number.isFinite(warmGpuTotal) && warmGpuTotal > maxWarmGpuTotalMs) {
    reasons.push(`Warm GPU total ${round2(warmGpuTotal)}ms exceeds absolute gate ${maxWarmGpuTotalMs}ms.`);
  }
  if (maxWarmGpuCandidateMs > 0 && Number.isFinite(warmGpuCandidate) && warmGpuCandidate > maxWarmGpuCandidateMs) {
    reasons.push(`Warm GPU candidate ${round2(warmGpuCandidate)}ms exceeds absolute gate ${maxWarmGpuCandidateMs}ms.`);
  }

  return {
    ready: browserValid && reasons.length === 0,
    browserValid,
    seed: entry.seed,
    resolution: entry.resolution,
    kernel: entry.kernel,
    fields: entry.fields ?? [],
    warmGpuTotalMs: entry.warmGpuTotalMs ?? null,
    warmGpuCandidateMs: entry.warmGpuCandidateMs ?? null,
    warmGpuBufferSetupMs: entry.warmGpuBufferSetupMs ?? null,
    warmGpuExecuteDownloadMs: entry.warmGpuExecuteDownloadMs ?? null,
    warmGpuTimingModes: entry.warmGpuTimingModes ?? [],
    reusedBuffersObserved: entry.reusedBuffersObserved ?? false,
    validationTotalMs: entry.validationTotalMs ?? null,
    validationSnapshotMs: entry.validationSnapshotMs ?? null,
    validationBaselineMs: entry.validationBaselineMs ?? null,
    validationCompareMs: entry.validationCompareMs ?? null,
    validationThrottled: entry.validationThrottled ?? false,
    validationThrottleReason: entry.validationThrottleReason ?? null,
    cpuStepAverageMs: nullableRound2(cpuStepAverage),
    performanceRatio: entry.performanceRatio ?? null,
    gpuPerformance: entry.performance ?? null,
    cpuPerformance: entry.cpuBaseline?.performance ?? null,
    reasons,
  };
}

function evaluateRatios(entry) {
  const failures = [];
  const ratios = entry?.performanceRatio ?? {};
  checkRatio(failures, "stepAverage", ratios.stepAverage, maxStepRatio);
  checkRatio(failures, "renderAverage", ratios.renderAverage, maxRenderRatio);
  checkRatio(failures, "longTaskMax", ratios.longTaskMax, maxLongTaskRatio);
  return failures;
}

function checkRatio(failures, name, value, gate) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    failures.push(`${name} GPU/CPU ratio is unavailable.`);
  } else if (number > gate) {
    failures.push(`${name} GPU/CPU ratio ${round2(number)} exceeds ${gate}.`);
  }
}

function parseJson(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseNumberOption(optionBag, name, fallback) {
  const value = Number(optionBag[name]);
  return Number.isFinite(value) ? value : fallback;
}

function tail(text) {
  return String(text ?? "").split(/\r?\n/).slice(-20).join("\n");
}

function nullableRound2(value) {
  return Number.isFinite(value) ? round2(value) : null;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}
