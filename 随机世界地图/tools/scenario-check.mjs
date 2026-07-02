import { writeFileSync } from "node:fs";
import { parseBoolOption, parseNumberList, parseOptions } from "./lib/cli.mjs";
import { compactMetrics, summarizeScenario } from "./lib/metrics-summary.mjs";
import { saveWorldSnapshot } from "./lib/snapshot-cache.mjs";
import { createCheckWorld, runToCheckpoints } from "./lib/world-runner.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "龙骨海-纪元7";
const pipelineMode = positional[1] ?? "geology-v2";
const resolution = positional[2] ?? "512x256";
const checkpoints = parseNumberList(options.checkpoints, [20, 200, 739]);
const full = parseBoolOption(options, "full");
const out = typeof options.out === "string" ? options.out : null;
const snapshotDir = typeof options["snapshot-dir"] === "string" ? options["snapshot-dir"] : null;

const world = createCheckWorld({ seedText, pipelineMode, resolution });
const snapshots = [];
const run = runToCheckpoints(world, checkpoints, (currentWorld, timing) => {
  const metrics = compactMetrics(currentWorld, timing);
  if (snapshotDir) {
    snapshots.push({
      step: currentWorld.step,
      file: saveWorldSnapshot(currentWorld, snapshotDir, { seedText, pipelineMode, resolution }),
    });
  }
  return full
    ? {
        ...metrics,
        stats: currentWorld.stats,
        sedimentBudgetDiagnostics: currentWorld.sedimentBudgetDiagnostics,
        geologicSeaLevelDiagnostics: currentWorld.geologicSeaLevelDiagnostics,
      }
    : metrics;
});

const result = summarizeScenario({
  seedText,
  pipelineMode,
  resolution,
  totalMs: run.totalMs,
  averageStepMs: run.averageStepMs,
  checkpoints: run.results,
});
if (snapshots.length) result.snapshots = snapshots;

if (out) writeFileSync(out, JSON.stringify(result, null, 2));

const terminalResult = out
  ? {
      seedText,
      pipelineMode,
      resolution,
      totalMs: result.totalMs,
      averageStepMs: result.averageStepMs,
      checkpoints: result.checkpoints.map((checkpoint) => compactTerminalCheckpoint(checkpoint)),
      out,
      snapshots,
    }
  : result;

console.log(JSON.stringify(terminalResult, null, full ? 2 : 0));

function compactTerminalCheckpoint(checkpoint) {
  return {
    step: checkpoint.step,
    landRatio: checkpoint.landRatio,
    seaRatio: checkpoint.seaRatio,
    plateCheckerboardScore: checkpoint.plateCheckerboardScore,
    sedimentBudgetError: checkpoint.sedimentBudgetError,
    sedimentStraightnessRisk: checkpoint.sedimentStraightnessRisk,
    sedimentOverfillShare: checkpoint.sedimentOverfillShare,
    sedimentSeaFillRisk: checkpoint.sedimentSeaFillRisk,
    oldBoundaryReliefCorrelation: checkpoint.oldBoundaryReliefCorrelation,
    reliefDeficit: checkpoint.reliefDeficit,
    flatWorldRisk: checkpoint.flatWorldRisk,
    totalMs: checkpoint.totalMs,
    averageStepMs: checkpoint.averageStepMs,
  };
}
