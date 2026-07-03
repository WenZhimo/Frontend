import { parseCsv, parseIntOption, parseOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";
import { detectGpuCapabilities } from "../src/gpu/capability.js";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "龙骨海-纪元7";
const pipelineMode = positional[1] ?? "geology-v2";
const resolution = positional[2] ?? "256x128";
const steps = parseIntOption(options, "steps", Number(positional[3]) || 20);
const fields = parseCsv(positional[4] ?? options.fields, ["elev", "isostaticBase", "oceanDepthTerms"]);

const baseline = createCheckWorld({ seedText, pipelineMode, resolution });
const candidate = createCheckWorld({ seedText, pipelineMode, resolution });

runSteps(baseline, steps);
runSteps(candidate, steps);

const fieldResults = fields.map((fieldName) => compareField(fieldName, baseline.grid[fieldName], candidate.grid[fieldName]));
const result = {
  seedText,
  pipelineMode,
  resolution,
  steps,
  backend: "cpu-vs-cpu",
  gpuCapabilities: detectGpuCapabilities(globalThis),
  valid: fieldResults.every((field) => field.valid),
  fields: fieldResults,
  note: "Phase 0 compare scaffold only: candidate currently uses the CPU path so expected deltas are zero.",
};

console.log(JSON.stringify(result, null, 2));

function runSteps(world, count) {
  for (let i = 0; i < count; i += 1) stepWorld(world);
}

function compareField(fieldName, baselineField, candidateField) {
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
  return {
    field: fieldName,
    valid: maxAbs <= 1e-9,
    rmse: Math.sqrt(sumSq / count),
    meanAbs: sumAbs / count,
    maxAbs,
  };
}
