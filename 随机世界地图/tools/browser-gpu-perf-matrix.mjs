import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";

const { options } = parseOptions(process.argv.slice(2));

const seeds = parseCsv(options.seeds, ["龙骨海-纪元7"]);
const resolutions = parseCsv(options.resolutions ?? options.resolution, ["256x128"]);
const kernels = parseCsv(options.kernels ?? options.kernel, ["local-fields"]);
const steps = parseIntOption(options, "steps", 2);
const waitMs = parseIntOption(options, "wait-ms", 120000);
const postValidationWaitMs = parseIntOption(options, "post-validation-wait-ms", 1000);
const validationCount = parseIntOption(options, "validation-count", 2);
const startPort = parseIntOption(options, "start-port", 9600);
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
  maxWarmGpuTotalMs: maxWarmGpuTotalMs || null,
  maxWarmGpuCandidateMs: maxWarmGpuCandidateMs || null,
};

console.log(JSON.stringify({ summary, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;

function runCase({ seed, resolution, kernel, port, caseIndex }) {
  return () => {
    const fields = defaultFieldsForKernel(kernel);
    const query = new URLSearchParams({
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
    }).toString();
    const args = [
      ".\\tools\\browser-smoke-check.mjs",
      "--mode", "http",
      "--steps", String(steps),
      "--wait-ms", String(waitMs),
      "--post-validation-wait-ms", String(postValidationWaitMs),
      "--remote-debugging-port", String(port),
      "--user-data-dir", `.test-cache/browser-gpu-perf-matrix-${caseIndex}`,
      "--query", query,
      "--require-validation",
      "--require-validation-count", String(validationCount),
      "--require-reused-gpu-context",
      "--require-reused-gpu-setup-zero",
      "--require-gpu-kernels", kernel,
      "--require-gpu-fields", fields.join(","),
      "--require-perf-summary",
    ];
    if (maxWarmGpuTotalMs > 0) args.push("--max-warm-gpu-total-ms", String(maxWarmGpuTotalMs));
    if (maxWarmGpuCandidateMs > 0) args.push("--max-warm-gpu-candidate-ms", String(maxWarmGpuCandidateMs));
    if (chrome) args.push("--chrome", String(chrome));

    const child = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = parseSmokeOutput(child.stdout);
    const pageStateMismatch = parsed
      ? describePageStateMismatch(parsed.pageState, { seed, resolution })
      : null;
    const warmCandidates = parsed
      ? collectWarmCandidates(parsed.gpuValidation)
      : parseWarmCandidatesFromFailure(child.stderr);
    const valid = child.status === 0 && parsed?.valid === true && !pageStateMismatch;
    return {
      valid,
      seed,
      resolution,
      kernel,
      fields,
      exitCode: child.status,
      warmGpuTotalMs: maxNumber(warmCandidates.map((candidate) => candidate.timings?.totalGpuPathMs)),
      warmGpuCandidateMs: maxNumber(warmCandidates.map((candidate) => candidate.timings?.totalCandidateMs ?? candidate.timings?.totalGpuPathMs)),
      reusedContextObserved: parsed?.gpuValidation?.reusedGpuContextObserved ?? warmCandidates.length > 0,
      canvas: parsed?.canvas ?? null,
      pageState: parsed?.pageState ?? null,
      step: parsed?.step ?? null,
      consoleProjectErrors: parsed?.consoleSummary?.projectErrors ?? null,
      error: pageStateMismatch ?? (child.status === 0 ? null : summarizeFailure(child.stderr, child.stdout)),
    };
  };
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

function maxNumber(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? round2(Math.max(...finite)) : null;
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
