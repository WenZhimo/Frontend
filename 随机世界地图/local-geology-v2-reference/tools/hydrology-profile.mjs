import { performance } from "node:perf_hooks";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { getHydrologyInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "dragon-sea-era-7";
const steps = Number(positional[1] ?? 200);
const pipelineMode = positional[2] ?? "geology-v2";
const resolution = positional[3] ?? "512x256";
const diagnostics = normalizeDiagnostics(options.diagnostics ?? "basic");

const params = {
  seedText,
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  pipelineMode,
  resolution,
};

const timingsMs = {};
const world = timed("worldGeneration", () => createWorld(params));
timed("simulation", () => {
  for (let i = 0; i < steps; i += 1) stepWorld(world);
});
timed("terrainDerived", () => getTerrainDerived(world));
const hydrology = timed("hydrologyTotal", () => getHydrologyInputs(world, { diagnostics, profile: true }));
const cachedHydrology = timed("hydrologyCacheFill", () => getHydrologyInputs(world, { diagnostics }));
const cachedHydrologyAgain = timed("hydrologyCachedReuse", () => getHydrologyInputs(world, { diagnostics }));

console.log(JSON.stringify({
  seedText,
  steps,
  mode: pipelineMode,
  resolution,
  cellCount: world.grid.size,
  diagnostics,
  timingsMs: {
    ...roundTimings(timingsMs),
    ...roundTimings(hydrology.hydrologyProfile?.timingsMs ?? {}),
  },
  hydrologyProfileTotal: round(hydrology.hydrologyProfile?.total ?? 0),
  cacheReuseValid: cachedHydrology === cachedHydrologyAgain,
  hydrologyDiagnostics: summarizeHydrology(hydrology.hydrologyDiagnostics ?? {}),
}, null, 2));

function timed(name, fn) {
  const start = performance.now();
  const value = fn();
  timingsMs[name] = performance.now() - start;
  return value;
}

function summarizeHydrology(diagnostics) {
  return {
    hydrologyValid: diagnostics.hydrologyValid,
    diagnosticsLevel: diagnostics.diagnosticsLevel,
    flowCycleCount: diagnostics.flowCycleCount,
    orphanFlowShare: diagnostics.orphanFlowShare,
    depressionShare: diagnostics.depressionShare,
    riverCellShare: diagnostics.riverCellShare,
    riverContinuityScore: diagnostics.riverContinuityScore,
    largestWatershedShare: diagnostics.largestWatershedShare,
  };
}

function normalizeDiagnostics(value) {
  return value === "none" || value === "full" ? value : "basic";
}

function roundTimings(timings) {
  return Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, round(value)]));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
