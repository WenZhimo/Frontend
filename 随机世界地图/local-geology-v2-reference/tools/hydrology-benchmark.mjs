import { performance } from "node:perf_hooks";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { getHydrologyInputs } from "../src/sim/derived/terrain.js";
import { parseCsv, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "dragon-sea-era-7";
const pipelineMode = positional[1] ?? "geology-v2";
const resolutions = parseCsv(positional[2], ["256x128", "512x256"]);
const stepsList = parseCsv(positional[3], ["20", "200"]).map((value) => Number(value)).filter(Number.isFinite);
const diagnostics = normalizeDiagnostics(options.diagnostics ?? "basic");
const results = [];

for (const resolution of resolutions) {
  for (const steps of stepsList) {
    const result = runCase({ seedText, pipelineMode, resolution, steps, diagnostics });
    results.push(result);
    console.log(`${resolution} ${steps} steps ${diagnostics}: total=${result.timingsMs.total}ms sim=${result.timingsMs.simulation}ms hydro=${result.timingsMs.hydrologyFirst}ms cacheFill=${result.timingsMs.hydrologyCacheFill}ms cached=${result.timingsMs.hydrologyCachedReuse}ms valid=${result.hydrologyDiagnostics.hydrologyValid}`);
  }
}

console.log(JSON.stringify({ seedText, pipelineMode, diagnostics, results }, null, 2));

function runCase({ seedText, pipelineMode, resolution, steps, diagnostics }) {
  const params = {
    seedText,
    waterLevel: 50,
    intensity: 1,
    plateCount: 14,
    timeScale: 1_000_000,
    pipelineMode,
    resolution,
  };
  const totalStart = performance.now();
  const worldStart = performance.now();
  const world = createWorld(params);
  const worldGeneration = performance.now() - worldStart;
  const simStart = performance.now();
  for (let i = 0; i < steps; i += 1) stepWorld(world);
  const simulation = performance.now() - simStart;
  const hydrologyStart = performance.now();
  const hydrology = getHydrologyInputs(world, { diagnostics, profile: true });
  const hydrologyFirst = performance.now() - hydrologyStart;
  const cacheFillStart = performance.now();
  const cached = getHydrologyInputs(world, { diagnostics });
  const hydrologyCacheFill = performance.now() - cacheFillStart;
  const cacheReuseStart = performance.now();
  const cachedAgain = getHydrologyInputs(world, { diagnostics });
  const hydrologyCachedReuse = performance.now() - cacheReuseStart;
  return {
    resolution,
    steps,
    cellCount: world.grid.size,
    timingsMs: {
      total: round(performance.now() - totalStart),
      worldGeneration: round(worldGeneration),
      simulation: round(simulation),
      hydrologyFirst: round(hydrologyFirst),
      hydrologyCacheFill: round(hydrologyCacheFill),
      hydrologyCachedReuse: round(hydrologyCachedReuse),
      hydrologyProfileTotal: round(hydrology.hydrologyProfile?.total ?? 0),
    },
    cacheReuseValid: cached === cachedAgain,
    hydrologyDiagnostics: {
      hydrologyValid: hydrology.hydrologyDiagnostics?.hydrologyValid,
      diagnosticsLevel: hydrology.hydrologyDiagnostics?.diagnosticsLevel,
      flowCycleCount: hydrology.hydrologyDiagnostics?.flowCycleCount,
      orphanFlowShare: hydrology.hydrologyDiagnostics?.orphanFlowShare,
      riverCellShare: hydrology.hydrologyDiagnostics?.riverCellShare,
    },
  };
}

function normalizeDiagnostics(value) {
  return value === "none" || value === "full" ? value : "basic";
}

function round(value) {
  return Math.round(value * 100) / 100;
}
