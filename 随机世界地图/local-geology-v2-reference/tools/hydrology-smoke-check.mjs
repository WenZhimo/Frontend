import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { getHydrologyInputs } from "../src/sim/derived/terrain.js";
import { parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? "dragon-sea-era-7";
const pipelineMode = positional[1] ?? "geology-v2";
const resolution = positional[2] ?? "256x128";
const steps = Number(options.steps ?? 20);
const diagnostics = options.diagnostics === "full" ? "full" : "basic";

const world = createWorld({
  seedText,
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  pipelineMode,
  resolution,
});
for (let i = 0; i < steps; i += 1) stepWorld(world);
const hydrology = getHydrologyInputs(world, { diagnostics });
const diagnosticsOut = hydrology.hydrologyDiagnostics ?? {};
const requiredFields = [
  "flowDirection",
  "flowTarget",
  "flowAccumulation",
  "flowSlope",
  "drainageBasinId",
  "watershedId",
  "riverMask",
  "riverStrength",
  "riverOutlet",
  "outletId",
  "endorheicBasin",
  "endorheicSink",
  "depressionMask",
  "lakeCandidate",
  "wetlandCandidate",
  "hydrologyDiagnostics",
];
const missingFields = requiredFields.filter((field) => !hydrology[field]);
const valid =
  missingFields.length === 0 &&
  diagnosticsOut.hydrologyValid === true &&
  (diagnosticsOut.flowCycleCount ?? 0) === 0 &&
  (diagnosticsOut.orphanFlowShare ?? 1) < 0.01;

console.log(JSON.stringify({
  seedText,
  steps,
  pipelineMode,
  resolution,
  diagnostics,
  valid,
  missingFields,
  hydrologyDiagnostics: {
    hydrologyValid: diagnosticsOut.hydrologyValid,
    diagnosticsLevel: diagnosticsOut.diagnosticsLevel,
    flowAssignedShare: diagnosticsOut.flowAssignedShare,
    flowCycleCount: diagnosticsOut.flowCycleCount,
    orphanFlowShare: diagnosticsOut.orphanFlowShare,
    depressionShare: diagnosticsOut.depressionShare,
    endorheicLandShare: diagnosticsOut.endorheicLandShare,
    lakeCandidateShare: diagnosticsOut.lakeCandidateShare,
    riverCellShare: diagnosticsOut.riverCellShare,
    externalSeaDrainageShare: diagnosticsOut.externalSeaDrainageShare,
    closedBasinDrainageShare: diagnosticsOut.closedBasinDrainageShare,
  },
}, null, 2));

if (!valid) process.exitCode = 1;
