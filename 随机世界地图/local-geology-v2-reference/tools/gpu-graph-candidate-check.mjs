import { detectGpuCapabilities } from "../src/gpu/capability.js";
import { getHydrologyInputs, getTerrainDerived } from "../src/sim/derived/terrain.js";
import { measureTopologyDiagnostics } from "../src/sim/topology.js";
import { parseIntOption, parseOptions, parseTopologyOptions } from "./lib/cli.mjs";
import { createCheckWorld } from "./lib/world-runner.mjs";
import { stepWorld } from "../src/sim/evolution.js";

const DEFAULT_SEED = "龙骨海-纪元7";

const { positional, options } = parseOptions(process.argv.slice(2));
const invocation = parseInvocation(positional, options);
const world = createCheckWorld(invocation);
for (let i = 0; i < invocation.steps; i += 1) stepWorld(world);

const terrain = getTerrainDerived(world);
const hydrology = getHydrologyInputs(world, { diagnostics: "basic" });
const topologyDiagnostics = measureTopologyDiagnostics(world);
const gpuCapabilities = detectGpuCapabilities(globalThis);
const fieldNames = defaultFieldsForCandidate(invocation.candidate);
const fields = fieldNames.map((fieldName) => summarizeNamedField(fieldName, terrain, hydrology));
const missingFields = fields.filter((field) => !field.present).map((field) => field.field);

const result = {
  valid: missingFields.length === 0,
  candidate: invocation.candidate,
  attempted: false,
  skipped: true,
  skippedReason: "No WebGPU graph candidate is implemented yet; CPU graph algorithms remain authoritative.",
  seedText: invocation.seedText,
  steps: invocation.steps,
  ageYears: world.ageYears,
  pipelineMode: invocation.pipelineMode,
  resolution: invocation.resolution,
  topologyMode: world.params.topologyMode,
  projectionMode: world.params.projectionMode,
  productionTopologyMode: world.params.productionTopologyMode,
  faceSize: world.params.faceSize,
  gridSize: world.grid.size,
  gpuCapabilities,
  topologyDiagnostics: {
    topologyKind: topologyDiagnostics.topologyKind,
    wrapXEnabled: topologyDiagnostics.wrapXEnabled,
    wrapYEnabled: topologyDiagnostics.wrapYEnabled,
    neighborConsistencyValid: topologyDiagnostics.neighborConsistencyValid,
    connectedComponentTopologyValid: topologyDiagnostics.connectedComponentTopologyValid,
    floodFillTopologyValid: topologyDiagnostics.floodFillTopologyValid,
    topologyMigrationCoverage: topologyDiagnostics.topologyMigrationCoverage,
  },
  cpuBaseline: {
    fields,
    hydrologyDiagnostics: hydrology.hydrologyDiagnostics ?? null,
  },
  missingFields,
  recommendation: recommendationForCandidate(invocation.candidate),
  invocation,
};

console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;

function parseInvocation(positionalArgs, optionBag) {
  const candidate = normalizeCandidate(positionalArgs[0] ?? optionBag.candidate ?? "distance-field");
  return {
    candidate,
    seedText: positionalArgs[1] ?? optionBag.seed ?? optionBag.seedText ?? DEFAULT_SEED,
    steps: parseIntOption(optionBag, "steps", Number(positionalArgs[2]) || 20),
    pipelineMode: positionalArgs[3] ?? optionBag.pipeline ?? "geology-v2",
    resolution: positionalArgs[4] ?? optionBag.resolution ?? optionBag.res ?? "256x128",
    ...parseTopologyOptions(optionBag),
  };
}

function normalizeCandidate(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "distance" || normalized === "distance-fields" || normalized === "margin-distance") {
    return "distance-field";
  }
  if (normalized === "external-sea-mask" || normalized === "closed-basin" || normalized === "closed-basins") {
    return "external-sea";
  }
  if (normalized === "landmass" || normalized === "landmass-id" || normalized === "islands") {
    return "land-components";
  }
  if (normalized === "hydrology" || normalized === "flow-accumulation" || normalized === "watershed") {
    return "hydrology-flow";
  }
  return normalized || "distance-field";
}

function defaultFieldsForCandidate(candidate) {
  if (candidate === "distance-field") {
    return [
      "terrain.coastDistance",
      "terrain.distanceToOcean",
      "terrain.passiveMargin",
      "terrain.continentalShelf",
      "terrain.continentalSlope",
      "terrain.continentalRise",
    ];
  }
  if (candidate === "external-sea") {
    return [
      "terrain.seaMask",
      "terrain.inlandWaterCandidate",
      "hydrology.externalSeaMask",
      "hydrology.oceanConnectivity",
      "hydrology.closedBasinId",
    ];
  }
  if (candidate === "land-components") {
    return [
      "terrain.landMask",
      "terrain.landmassId",
      "terrain.islandId",
    ];
  }
  if (candidate === "hydrology-flow") {
    return [
      "hydrology.flowTarget",
      "hydrology.flowAccumulation",
      "hydrology.drainageBasinId",
      "hydrology.watershedId",
      "hydrology.riverMask",
    ];
  }
  return [];
}

function summarizeNamedField(path, terrain, hydrology) {
  const [group, name] = path.split(".");
  const source = group === "terrain" ? terrain : group === "hydrology" ? hydrology : null;
  return summarizeField(path, source?.[name]);
}

function summarizeField(fieldName, field) {
  if (!field || typeof field.length !== "number") {
    return { field: fieldName, present: false, type: typeof field };
  }
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nonZero = 0;
  const unique = new Set();
  const uniqueLimit = 64;
  for (let i = 0; i < field.length; i += 1) {
    const value = Number(field[i]);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    if (Math.abs(value) > 0.000001) nonZero += 1;
    if (unique.size <= uniqueLimit) unique.add(value);
  }
  const count = Math.max(1, field.length);
  return {
    field: fieldName,
    present: true,
    type: field.constructor?.name ?? typeof field,
    length: field.length,
    min: round6(min),
    max: round6(max),
    mean: round6(sum / count),
    nonZeroShare: round6(nonZero / count),
    uniqueCount: unique.size > uniqueLimit ? `${uniqueLimit}+` : unique.size,
  };
}

function recommendationForCandidate(candidate) {
  if (candidate === "distance-field") {
    return "Candidate may be researched first, but only as read-only distance-field validation; do not write back passive-margin or coast fields until mismatch gates exist.";
  }
  if (candidate === "external-sea") {
    return "Keep CPU authoritative. A future GPU candidate should validate externalSeaMask only before considering closedBasinId.";
  }
  if (candidate === "land-components") {
    return "Keep CPU authoritative unless landmass/island labeling becomes a measured bottleneck.";
  }
  if (candidate === "hydrology-flow") {
    return "Do not migrate soon. Flow accumulation and watershed labeling remain CPU graph algorithms.";
  }
  return "Unknown graph candidate; safe skip until the candidate is documented.";
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null;
}
