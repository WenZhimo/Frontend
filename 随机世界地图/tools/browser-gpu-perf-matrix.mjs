import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseBoolOption, parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";

const { options } = parseOptions(process.argv.slice(2));

const seeds = parseCsv(options.seeds, ["龙骨海-纪元7"]);
const resolutions = parseCsv(options.resolutions ?? options.resolution, ["256x128"]);
const kernels = parseCsv(options.kernels ?? options.kernel, ["local-fields"]);
const steps = parseIntOption(options, "steps", 2);
const waitMs = parseIntOption(options, "wait-ms", 120000);
const baselineWaitMs = parseIntOption(options, "baseline-wait-ms", 8000);
const postValidationWaitMs = parseIntOption(options, "post-validation-wait-ms", 1000);
const validationCount = parseIntOption(options, "validation-count", 2);
const gpuValidateMaxCandidateMs = parseIntOption(options, "gpu-validate-max-candidate-ms", parseIntOption(options, "gpuValidateMaxCandidateMs", 0));
const gpuValidateMaxTotalMs = parseIntOption(options, "gpu-validate-max-total-ms", parseIntOption(options, "gpuValidateMaxTotalMs", 0));
const gpuValidateCooldownSteps = parseIntOption(options, "gpu-validate-cooldown-steps", parseIntOption(options, "gpuValidateCooldownSteps", 0));
const requireValidationThrottle = parseBoolOption(options, "require-validation-throttle");
const startPort = parseIntOption(options, "start-port", 9600);
const maxAverageStepMs = parseIntOption(options, "max-average-step-ms", 0);
const maxAverageRenderMs = parseIntOption(options, "max-average-render-ms", 0);
const maxLongTaskMs = parseIntOption(options, "max-long-task-ms", 0);
const maxStepRatio = parseNumberOption(options, "max-step-ratio", 0);
const maxRenderRatio = parseNumberOption(options, "max-render-ratio", 0);
const maxLongTaskRatio = parseNumberOption(options, "max-long-task-ratio", 0);
const includeCpuBaseline = parseBoolOption(options, "include-cpu-baseline")
  || maxStepRatio > 0
  || maxRenderRatio > 0
  || maxLongTaskRatio > 0;
const maxWarmGpuTotalMs = parseIntOption(options, "max-warm-gpu-total-ms", 0);
const maxWarmGpuCandidateMs = parseIntOption(options, "max-warm-gpu-candidate-ms", 0);
const renderBackend = String(options["render-backend"] ?? options.renderBackend ?? "cpu");
const topology = String(options.topology ?? "cylindrical");
const projection = String(options.projection ?? "equirectangular");
const root = resolve(options.root ?? ".");
const chrome = options.chrome;

const cases = [];
let caseIndex = 0;
for (const seed of seeds) {
  for (const resolution of resolutions) {
    for (const kernel of kernels.map(normalizeKernelName)) {
      caseIndex += 1;
      cases.push(runCase({
        seed,
        resolution,
        kernel,
        port: startPort + caseIndex,
        caseIndex,
      }));
    }
  }
}

const results = [];
for (const run of cases) {
  results.push(run());
}

const failed = results.filter((result) => !result.valid);
const summary = {
  valid: failed.length === 0,
  totalCases: results.length,
  failedCases: failed.length,
  seeds,
  resolutions,
  kernels: kernels.map(normalizeKernelName),
  includeCpuBaseline,
  maxAverageStepMs: maxAverageStepMs || null,
  maxAverageRenderMs: maxAverageRenderMs || null,
  maxLongTaskMs: maxLongTaskMs || null,
  maxStepRatio: maxStepRatio || null,
  maxRenderRatio: maxRenderRatio || null,
  maxLongTaskRatio: maxLongTaskRatio || null,
  maxWarmGpuTotalMs: maxWarmGpuTotalMs || null,
  maxWarmGpuCandidateMs: maxWarmGpuCandidateMs || null,
  gpuValidateMaxCandidateMs: gpuValidateMaxCandidateMs || null,
  gpuValidateMaxTotalMs: gpuValidateMaxTotalMs || null,
  gpuValidateCooldownSteps: gpuValidateCooldownSteps || null,
  requireValidationThrottle,
};

console.log(JSON.stringify({ summary, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;

function runCase({ seed, resolution, kernel, port, caseIndex }) {
  return () => {
    const fields = defaultFieldsForKernel(kernel);
    const queryParams = new URLSearchParams({
      topology,
      projection,
      resolution,
      gpuCompute: "validate",
      gpuValidateInterval: "1",
      gpuValidateReports: String(validationCount),
      gpuKernel: kernel,
      gpuFields: fields.join(","),
      renderBackend,
      seedText: seed,
      cacheBust: `gpuPerfMatrix${Date.now()}_${caseIndex}`,
    });
    if (gpuValidateMaxCandidateMs > 0) queryParams.set("gpuValidateMaxCandidateMs", String(gpuValidateMaxCandidateMs));
    if (gpuValidateMaxTotalMs > 0) queryParams.set("gpuValidateMaxTotalMs", String(gpuValidateMaxTotalMs));
    if (gpuValidateCooldownSteps > 0) queryParams.set("gpuValidateCooldownSteps", String(gpuValidateCooldownSteps));
    const queryString = queryParams.toString();
    const args = [
      ".\\tools\\browser-smoke-check.mjs",
      "--mode", "http",
      "--steps", String(steps),
      "--wait-ms", String(waitMs),
      "--post-validation-wait-ms", String(postValidationWaitMs),
      "--remote-debugging-port", String(port),
      "--user-data-dir", `.test-cache/browser-gpu-perf-matrix-${caseIndex}`,
      "--query", queryString,
      "--require-validation",
      "--require-validation-count", String(validationCount),
      "--require-gpu-kernels", kernel,
      "--require-gpu-fields", fields.join(","),
      "--require-perf-summary",
    ];
    if (requireValidationThrottle) {
      args.push("--require-validation-throttle");
    } else {
      args.push("--require-reused-gpu-context", "--require-reused-gpu-setup-zero");
    }
    if (maxAverageStepMs > 0) args.push("--max-average-step-ms", String(maxAverageStepMs));
    if (maxAverageRenderMs > 0) args.push("--max-average-render-ms", String(maxAverageRenderMs));
    if (maxLongTaskMs > 0) args.push("--max-long-task-ms", String(maxLongTaskMs));
    if (maxWarmGpuTotalMs > 0) args.push("--max-warm-gpu-total-ms", String(maxWarmGpuTotalMs));
    if (maxWarmGpuCandidateMs > 0) args.push("--max-warm-gpu-candidate-ms", String(maxWarmGpuCandidateMs));
    if (chrome) args.push("--chrome", String(chrome));

    const child = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    const baseline = includeCpuBaseline
      ? runCpuBaselineCase({ seed, resolution, port: port + 10000, caseIndex })
      : null;
    const parsed = parseSmokeOutput(child.stdout);
    const pageStateMismatch = parsed
      ? describePageStateMismatch(parsed.pageState, { seed, resolution, topology, projection })
      : null;
    const baselineMismatch = baseline?.parsed
      ? describePageStateMismatch(baseline.parsed.pageState, { seed, resolution, topology, projection })
      : null;
    const warmCandidates = parsed
      ? collectWarmCandidates(parsed.gpuValidation)
      : parseWarmCandidatesFromFailure(child.stderr);
    const baselineValid = !includeCpuBaseline
      || (baseline?.child.status === 0 && baseline?.parsed?.valid === true && !baselineMismatch);
    const valid = child.status === 0 && parsed?.valid === true && !pageStateMismatch && baselineValid;
    const performance = summarizePerformance(parsed?.performance);
    const baselinePerformance = summarizePerformance(baseline?.parsed?.performance);
    const performanceRatio = comparePerformance(performance, baselinePerformance);
    const ratioFailure = describePerformanceRatioFailure(performanceRatio);
    return {
      valid: valid && !ratioFailure,
      seed,
      resolution,
      kernel,
      fields,
      exitCode: child.status,
      validationTotalMs: maxNumber(collectValidationTimings(parsed?.gpuValidation).map((timing) => timing.totalValidationMs)),
      validationSnapshotMs: maxNumber(collectValidationTimings(parsed?.gpuValidation).map((timing) => timing.snapshotMs)),
      validationBaselineMs: maxNumber(collectValidationTimings(parsed?.gpuValidation).map((timing) => timing.baselineMs)),
      validationCompareMs: maxNumber(collectValidationTimings(parsed?.gpuValidation).map((timing) => timing.compareMs)),
      validationThrottled: validationThrottleObserved(parsed?.gpuValidation),
      validationThrottleReason: latestThrottleReason(parsed?.gpuValidation),
      warmGpuTotalMs: maxNumber(warmCandidates.map((candidate) => candidate.timings?.totalGpuPathMs)),
      warmGpuCandidateMs: maxNumber(warmCandidates.map((candidate) => candidate.timings?.totalCandidateMs ?? candidate.timings?.totalGpuPathMs)),
      reusedContextObserved: parsed?.gpuValidation?.reusedGpuContextObserved ?? warmCandidates.length > 0,
      canvas: parsed?.canvas ?? null,
      pageState: parsed?.pageState ?? null,
      performance,
      cpuBaseline: includeCpuBaseline
        ? {
            valid: baselineValid,
            exitCode: baseline?.child.status ?? null,
            canvas: baseline?.parsed?.canvas ?? null,
            pageState: baseline?.parsed?.pageState ?? null,
            performance: baselinePerformance,
            consoleProjectErrors: baseline?.parsed?.consoleSummary?.projectErrors ?? null,
            error: baselineMismatch ?? (baseline?.child.status === 0 ? null : summarizeFailure(baseline?.child.stderr, baseline?.child.stdout)),
          }
        : null,
      performanceRatio,
      step: parsed?.step ?? null,
      consoleProjectErrors: parsed?.consoleSummary?.projectErrors ?? null,
      error: pageStateMismatch
        ?? baselineMismatch
        ?? ratioFailure
        ?? (child.status === 0 ? null : summarizeFailure(child.stderr, child.stdout))
        ?? (baselineValid ? null : summarizeFailure(baseline?.child.stderr, baseline?.child.stdout)),
    };
  };
}

function runCpuBaselineCase({ seed, resolution, port, caseIndex }) {
  const query = new URLSearchParams({
    topology,
    projection,
    resolution,
    renderBackend,
    seedText: seed,
    cacheBust: `gpuPerfMatrixBaseline${Date.now()}_${caseIndex}`,
  }).toString();
  const args = [
    ".\\tools\\browser-smoke-check.mjs",
    "--mode", "http",
    "--steps", String(steps),
    "--wait-ms", String(baselineWaitMs),
    "--remote-debugging-port", String(port),
    "--user-data-dir", `.test-cache/browser-gpu-perf-matrix-baseline-${caseIndex}`,
    "--query", query,
    "--require-perf-summary",
  ];
  if (maxAverageStepMs > 0) args.push("--max-average-step-ms", String(maxAverageStepMs));
  if (maxAverageRenderMs > 0) args.push("--max-average-render-ms", String(maxAverageRenderMs));
  if (maxLongTaskMs > 0) args.push("--max-long-task-ms", String(maxLongTaskMs));
  if (chrome) args.push("--chrome", String(chrome));
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    child,
    parsed: parseSmokeOutput(child.stdout),
  };
}

function summarizePerformance(performance) {
  if (!performance) return null;
  return {
    step: summarizeSample(performance.step),
    render: summarizeSample(performance.render),
    projectionRender: summarizeSample(performance.projectionRender),
    longTask: performance.longTask
      ? {
          count: performance.longTask.count ?? 0,
          totalMs: round2(Number(performance.longTask.totalMs ?? 0)),
          maxMs: round2(Number(performance.longTask.maxMs ?? 0)),
        }
      : null,
  };
}

function comparePerformance(gpuPerformance, cpuPerformance) {
  if (!gpuPerformance || !cpuPerformance) return null;
  return {
    stepAverage: ratio(gpuPerformance.step?.averageMs, cpuPerformance.step?.averageMs),
    renderAverage: ratio(gpuPerformance.render?.averageMs, cpuPerformance.render?.averageMs),
    longTaskMax: ratio(gpuPerformance.longTask?.maxMs, cpuPerformance.longTask?.maxMs),
  };
}

function describePerformanceRatioFailure(performanceRatio) {
  const failures = [];
  if (maxStepRatio > 0) {
    if (!Number.isFinite(performanceRatio?.stepAverage)) failures.push("stepAverage ratio is unavailable");
    else if (performanceRatio.stepAverage > maxStepRatio) {
      failures.push(`stepAverage ratio ${performanceRatio.stepAverage} exceeded ${maxStepRatio}`);
    }
  }
  if (maxRenderRatio > 0) {
    if (!Number.isFinite(performanceRatio?.renderAverage)) failures.push("renderAverage ratio is unavailable");
    else if (performanceRatio.renderAverage > maxRenderRatio) {
      failures.push(`renderAverage ratio ${performanceRatio.renderAverage} exceeded ${maxRenderRatio}`);
    }
  }
  if (maxLongTaskRatio > 0) {
    if (!Number.isFinite(performanceRatio?.longTaskMax)) failures.push("longTaskMax ratio is unavailable");
    else if (performanceRatio.longTaskMax > maxLongTaskRatio) {
      failures.push(`longTaskMax ratio ${performanceRatio.longTaskMax} exceeded ${maxLongTaskRatio}`);
    }
  }
  return failures.length ? `GPU/CPU performance ratio gate failed: ${failures.join("; ")}` : null;
}

function ratio(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || Math.abs(bottom) < 0.000001) return null;
  return round2(top / bottom);
}

function summarizeSample(sample) {
  if (!sample) return null;
  return {
    count: sample.count ?? 0,
    averageMs: nullableRound2(sample.averageMs),
    p95Ms: nullableRound2(sample.p95Ms),
    maxMs: nullableRound2(sample.maxMs),
  };
}

function nullableRound2(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round2(number) : null;
}

function describePageStateMismatch(pageState, expected) {
  if (!pageState) return "Browser smoke did not expose runtime pageState.";
  const mismatches = [];
  if (pageState.seedText !== expected.seed) {
    mismatches.push(`seedText expected ${JSON.stringify(expected.seed)} got ${JSON.stringify(pageState.seedText)}`);
  }
  if (pageState.resolution !== expected.resolution) {
    mismatches.push(`resolution expected ${JSON.stringify(expected.resolution)} got ${JSON.stringify(pageState.resolution)}`);
  }
  if (expected.topology && pageState.topologyMode !== expected.topology) {
    mismatches.push(`topologyMode expected ${JSON.stringify(expected.topology)} got ${JSON.stringify(pageState.topologyMode)}`);
  }
  if (expected.projection && pageState.projectionMode !== expected.projection) {
    mismatches.push(`projectionMode expected ${JSON.stringify(expected.projection)} got ${JSON.stringify(pageState.projectionMode)}`);
  }
  return mismatches.length ? `Runtime pageState mismatch: ${mismatches.join("; ")}` : null;
}

function parseSmokeOutput(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeFailure(stderr, stdout) {
  const text = `${stderr ?? ""}\n${stdout ?? ""}`.trim();
  return text.split(/\r?\n/).slice(-12).join("\n");
}

function parseWarmCandidatesFromFailure(stderr) {
  const text = String(stderr ?? "");
  const match = text.match(/Warm GPU (?:total path|candidate total) exceeded \d+ms: (\[[^\r\n]+\])/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function collectWarmCandidates(validation) {
  const candidates = [
    ...(validation?.history ?? []).flatMap((entry) => entry.candidateResults ?? []),
    ...(validation?.history?.length ? [] : validation?.candidateResults ?? []),
  ];
  return candidates.filter((candidate) => !candidate?.skipped && candidate?.reusedContext === true);
}

function collectValidationTimings(validation) {
  const timings = [
    ...(validation?.history ?? []).map((entry) => entry.validationTimings),
    ...(validation?.history?.length ? [] : [validation?.validationTimings]),
  ];
  return timings.filter(Boolean);
}

function validationThrottleObserved(validation) {
  if (validation?.throttled) return true;
  return (validation?.history ?? []).some((entry) => entry?.throttled);
}

function latestThrottleReason(validation) {
  if (validation?.throttleReason) return validation.throttleReason;
  const throttled = [...(validation?.history ?? [])].reverse().find((entry) => entry?.throttleReason);
  return throttled?.throttleReason ?? null;
}

function maxNumber(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? round2(Math.max(...finite)) : null;
}

function parseNumberOption(optionBag, name, fallback) {
  const value = Number(optionBag[name]);
  return Number.isFinite(value) ? value : fallback;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeKernelName(value) {
  if (value === "webgpu-local-fields" || value === "localTerrain") return "local-fields";
  if (value === "webgpu-margin-smooth" || value === "marginSmooth") return "margin-smooth";
  if (value === "webgpu-sediment-capacity" || value === "sedimentCapacity") return "sediment-capacity";
  if (value === "webgpu-isostasy") return "isostasy";
  if (value === "webgpu-elevation") return "elevation";
  return String(value ?? "").trim();
}

function defaultFieldsForKernel(kernel) {
  if (kernel === "isostasy") return ["isostaticBase"];
  if (kernel === "elevation") return ["baseElev", "relief", "boundaryRelief", "elev"];
  if (kernel === "local-fields") return ["slope", "ruggedness", "localRelief"];
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
