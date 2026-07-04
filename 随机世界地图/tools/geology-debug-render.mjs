import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";
import { getHydrologyInputs } from "../src/sim/derived/terrain.js";
import { projectionSampleToVec3 } from "../src/render/sphericalProjectionRenderer.js";
import { nearestCellByVector } from "../src/sim/sphere/cubedSphere.js";
import { parseCsv, parseOptions, parseTopologyOptions } from "./lib/cli.mjs";
import { loadWorldSnapshot } from "./lib/snapshot-cache.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const fromSnapshot = typeof options["from-snapshot"] === "string" ? options["from-snapshot"] : null;
const seedText = fromSnapshot ? null : positional[0] ?? "龙骨海-纪元7";
const steps = fromSnapshot ? 0 : Number(positional[1] ?? 200);
const outDir = fromSnapshot ? positional[0] ?? "_geology_debug" : positional[2] ?? "_geology_debug";
const pipelineMode = fromSnapshot ? null : positional[3] ?? "geology-v2";
const resolution = fromSnapshot ? null : positional[4] ?? "512x256";
const topologyOptions = parseTopologyOptions(options);
const outputResolution = options["output-resolution"] ?? options.outputResolution ?? resolution ?? worldResolutionFromSnapshotHint(fromSnapshot);
const requestedLayers = new Set(parseCsv(options.layers, []));
const hydrologyLayers = new Set([
  "flowDirection",
  "flowAccumulation",
  "riverMask",
  "riverStrength",
  "drainageBasinId",
  "endorheicBasin",
  "depressionMask",
  "lakeCandidate",
  "riverOutlet",
]);

const world = fromSnapshot
  ? loadWorldSnapshot(fromSnapshot)
  : createWorld({
      seedText,
      waterLevel: 50,
      intensity: 1,
      plateCount: 14,
      timeScale: 1_000_000,
      resolution,
      pipelineMode,
      ...topologyOptions,
      showBoundaries: false,
    });

if (!fromSnapshot) {
  for (let i = 0; i < steps; i += 1) stepWorld(world);
}

mkdirSync(outDir, { recursive: true });
const layers = {
  crustType: colorCrustType,
  crustThickness: colorField("crustThickness", 0.15, 0.8, [30, 63, 94], [232, 204, 122]),
  crustDensity: colorField("crustDensity", 0.35, 0.9, [48, 60, 70], [82, 143, 202]),
  crustAge: colorField("crustAge", 0, 1, [43, 184, 212], [20, 42, 82]),
  oceanAge: colorOceanAge,
  isostaticBase: colorSignedField("isostaticBase", -0.18, 0.22),
  crustBuoyancy: colorField("crustBuoyancy", 0, 0.12, [22, 24, 28], [245, 228, 124]),
  densitySubsidence: colorField("densitySubsidence", 0, 0.06, [20, 24, 32], [72, 135, 226]),
  lithosphereCooling: colorField("lithosphereCooling", 0, 0.12, [23, 23, 32], [126, 86, 214]),
  ageSubsidence: colorSignedField("ageSubsidence", -0.12, 0.02),
  sedimentFill: colorField("sedimentFill", 0, 0.08, [20, 43, 69], [224, 211, 154]),
  erosionSource: colorField("erosionSource", 0, 0.003, [54, 32, 22], [239, 126, 42]),
  sedimentFlux: colorField("sedimentFlux", 0, 0.006, [18, 37, 65], [75, 222, 224]),
  sedimentSink: colorField("sedimentSink", 0, 0.004, [24, 53, 37], [224, 221, 82]),
  sedimentCapacity: colorField("sedimentCapacity", 0, 1, [42, 29, 58], [237, 142, 211]),
  sedimentCompaction: colorField("sedimentCompaction", 0, 0.006, [34, 34, 37], [238, 238, 232]),
  sedimentLoadSubsidence: colorField("sedimentLoadSubsidence", 0, 0.02, [23, 36, 72], [206, 68, 163]),
  isostaticResidual: colorSignedField("isostaticResidual", -0.18, 0.18),
  sedimentBudgetError: colorField("sedimentBudgetError", 0, 1, [20, 20, 20], [224, 54, 48]),
  depositionRate: colorField("depositionRate", 0, 0.003, [28, 58, 41], [226, 209, 70]),
  erosionRate: colorField("erosionRate", 0, 0.002, [54, 36, 24], [223, 66, 60]),
  oceanDepthTerms: colorSignedField("oceanDepthTerms", -0.18, 0.08),
  orogeny: colorField("orogeny", 0, 0.18, [30, 38, 42], [216, 169, 112]),
  activeOrogeny: colorField("activeOrogeny", 0, 1, [32, 30, 34], [236, 86, 76]),
  oldOrogeny: colorField("oldOrogeny", 0, 0.45, [35, 35, 32], [172, 124, 84]),
  orogenyAge: colorField("orogenyAge", 0, 1, [45, 126, 202], [136, 86, 190]),
  orogenyErosion: colorField("orogenyErosion", 0, 0.01, [36, 36, 32], [231, 204, 84]),
  forelandBasin: colorField("forelandBasin", 0, 1, [28, 43, 43], [83, 206, 164]),
  tectonicAxis: colorField("tectonicAxis", 0, 1, [24, 28, 30], [235, 238, 225]),
  mountainAxisSeed: colorField("mountainAxisSeed", 0, 1, [42, 29, 32], [236, 92, 74]),
  ridgeAxis: colorField("ridgeAxis", 0, 1, [20, 38, 48], [75, 203, 229]),
  trenchAxis: colorField("trenchAxis", 0, 1, [38, 30, 45], [203, 94, 196]),
  riftAxis: colorField("riftAxis", 0, 1, [43, 35, 28], [228, 150, 60]),
  axisSegmentId: colorIntId("axisSegmentId"),
  axisCurvature: colorField("axisCurvature", 0, 1, [31, 34, 36], [224, 139, 67]),
  axisContinuity: colorField("axisContinuity", 0, 1, [28, 33, 29], [92, 206, 118]),
  axisBoundaryDependency: colorField("axisBoundaryDependency", 0, 1, [31, 26, 27], [226, 63, 56]),
  mountainAxis: colorField("mountainAxis", 0, 1, [28, 30, 34], [236, 238, 226]),
  mountainHeight: colorField("mountainHeight", 0, 0.28, [34, 34, 38], [232, 232, 220]),
  mountainHeightBlockiness: colorField("mountainHeightBlockiness", 0, 1, [22, 35, 39], [236, 62, 158]),
  orographicBarrier: colorField("orographicBarrier", 0, 0.22, [38, 32, 48], [202, 91, 188]),
  orographicBarrierContinuity: colorField("orographicBarrierContinuity", 0, 1, [26, 32, 28], [86, 206, 112]),
  planetaryRelief: colorField("planetaryRelief", 0, 0.28, [22, 24, 26], [238, 240, 232]),
  reliefDeficit: colorField("reliefDeficit", 0, 1, [28, 24, 25], [226, 58, 52]),
  flatLandMask: colorMask("flatLandMask", [222, 205, 72]),
  largePlainMask: colorMask("largePlainMask", [226, 132, 53]),
  seaLevelSensitivity: colorField("seaLevelSensitivity", 0, 1, [20, 29, 34], [72, 213, 220]),
  tectonicReliefSupply: colorField("tectonicReliefSupply", 0, 0.55, [36, 24, 26], [236, 82, 68]),
  isostaticReliefSupply: colorField("isostaticReliefSupply", 0, 0.18, [22, 31, 45], [105, 188, 232]),
  erosionFlatteningPressure: colorField("erosionFlatteningPressure", 0, 0.65, [28, 38, 30], [197, 178, 96]),
  sedimentSmoothingPressure: colorField("sedimentSmoothingPressure", 0, 0.45, [28, 41, 37], [106, 202, 137]),
  ridgeVolumeSignal: colorField("ridgeVolumeSignal", 0, 0.45, [16, 43, 48], [86, 232, 225]),
  oldOceanCapacitySignal: colorField("oldOceanCapacitySignal", 0, 0.22, [30, 28, 58], [139, 119, 224]),
  sedimentDisplacementSignal: colorField("sedimentDisplacementSignal", 0, 0.22, [48, 38, 24], [238, 212, 128]),
  trenchCapacitySignal: colorField("trenchCapacitySignal", 0, 0.18, [42, 28, 51], [199, 91, 211]),
  coastalSensitivity: colorField("coastalSensitivity", 0, 1, [31, 32, 34], [232, 72, 66]),
  orogenicSedimentSupply: colorField("orogenicSedimentSupply", 0, 0.05, [42, 37, 30], [229, 182, 78]),
  sediment: colorField("sediment", 0, 0.22, [27, 52, 71], [221, 206, 157]),
  basin: colorField("basin", 0, 0.7, [29, 55, 79], [110, 169, 187]),
  finalElevation: colorElevation,
  seaMask: colorSeaMask,
  plateId: colorPlateId,
  boundaryInfluence: colorField("boundaryInfluence", 0, 1, [18, 28, 38], [242, 191, 73]),
  boundaryDensity: colorField("boundaryDensity", 0, 1, [24, 26, 30], [224, 63, 54]),
  boundaryCoherence: colorField("boundaryCoherence", 0, 1, [190, 54, 67], [80, 190, 118]),
  noisyBoundaryPatch: colorNoisyBoundaryPatch,
  plateCheckerboard: colorField("plateCheckerboard", 0, 1, [28, 32, 38], [224, 60, 47]),
  boundaryKind: colorBoundaryKind,
  riftStage: colorRiftStage,
  externalSeaMask: colorExternalSeaMask,
  inlandWaterCandidate: colorInlandWaterCandidate,
  closedBasinId: colorClosedBasinId,
  protoOceanCandidate: colorProtoOceanCandidate,
  flowDirection: colorFlowDirection,
  flowAccumulation: colorHydrologyLogField("flowAccumulation", [18, 25, 38], [214, 238, 255]),
  riverMask: colorHydrologyMask("riverMask", [30, 98, 206]),
  riverStrength: colorHydrologyField("riverStrength", 0, 1, [18, 35, 58], [81, 213, 240]),
  drainageBasinId: colorHydrologyIntId("drainageBasinId"),
  endorheicBasin: colorHydrologyMask("endorheicBasin", [144, 82, 196]),
  depressionMask: colorHydrologyMask("depressionMask", [226, 61, 53]),
  lakeCandidate: colorHydrologyMask("lakeCandidate", [80, 215, 224]),
  riverOutlet: colorHydrologyMask("riverOutlet", [245, 235, 122]),
  passiveMargin: colorField("passiveMargin", 0, 1, [31, 45, 42], [182, 214, 88]),
  continentalShelf: colorField("continentalShelf", 0, 1, [24, 60, 75], [104, 211, 214]),
  continentalSlope: colorField("continentalSlope", 0, 1, [28, 41, 79], [119, 92, 190]),
  continentalRise: colorField("continentalRise", 0, 1, [39, 49, 78], [164, 127, 206]),
  abyssalPlain: colorField("abyssalPlain", 0, 1, [15, 28, 48], [95, 109, 124]),
  sedimentWedge: colorField("sedimentWedge", 0, 1, [37, 45, 42], [221, 201, 142]),
  activeTransform: colorField("activeTransform", 0, 1, [38, 38, 35], [246, 213, 69]),
  transformMemory: colorField("transformMemory", 0, 1, [42, 35, 31], [226, 126, 47]),
  fractureZoneMemory: colorField("fractureZoneMemory", 0, 1, [32, 31, 45], [166, 95, 216]),
  inactiveBoundaryRelief: colorField("inactiveBoundaryRelief", 0, 1, [39, 31, 32], [224, 65, 54]),
  oldBoundaryCorrelation: colorOldBoundaryCorrelation,
  ageBandStraightnessRisk: colorField("ageBandStraightnessRisk", 0, 1, [44, 178, 185], [226, 67, 58]),
};

const outputs = [];
const shouldRenderAllLayers = requestedLayers.size === 0;
const needsHydrology = shouldRenderAllLayers || [...requestedLayers].some((name) => hydrologyLayers.has(name));
if (needsHydrology) {
  const hydrologyOnly = requestedLayers.size > 0 && [...requestedLayers].every((name) => hydrologyLayers.has(name));
  world.hydrologyInputs = getHydrologyInputs(world, { diagnostics: hydrologyOnly ? "basic" : "full" });
}
for (const [name, colorFn] of Object.entries(layers)) {
  if (requestedLayers.size && !requestedLayers.has(name)) continue;
  const output = join(outDir, `${name}.ppm`);
  writePpm(world, output, colorFn);
  outputs.push(output);
}

const geologicSeaLevelDiagnostics = world.geologicSeaLevelDiagnostics ?? {};
const sedimentBudgetDiagnostics = world.sedimentBudgetDiagnostics ?? {};

console.log(JSON.stringify({
  seedText: seedText ?? world.snapshotMeta?.seedText ?? world.params?.seedText,
  steps: world.step,
  ageYears: world.ageYears,
  pipelineMode: pipelineMode ?? world.snapshotMeta?.pipelineMode ?? world.params?.pipelineMode,
  resolution: resolution ?? world.snapshotMeta?.resolution ?? world.params?.resolution,
  topologyMode: world.params?.topologyMode ?? topologyOptions.topologyMode,
  projectionMode: world.params?.projectionMode ?? topologyOptions.projectionMode,
  faceSize: world.params?.faceSize ?? topologyOptions.faceSize,
  fromSnapshot,
  requestedLayers: [...requestedLayers],
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  baseSeaLevel: geologicSeaLevelDiagnostics.baseSeaLevel ?? world.baseSeaLevel ?? world.seaLevel,
  seaLevel: world.seaLevel,
  geologicSeaLevelOffset: geologicSeaLevelDiagnostics.geologicSeaLevelOffset ?? world.geologicSeaLevelOffset ?? 0,
  targetGeologicSeaLevelOffset: geologicSeaLevelDiagnostics.targetGeologicSeaLevelOffset ?? world.geologicSeaLevelTargetOffset ?? 0,
  capacityBalance: geologicSeaLevelDiagnostics.capacityBalance ?? 0,
  sedimentBudgetDiagnostics,
  outputs,
}, null, 0));

function writePpm(currentWorld, output, colorFn) {
  const { grid } = currentWorld;
  if (isGraphBackedGrid(grid)) {
    writeProjectedPpm(currentWorld, output, colorFn);
    return;
  }
  const bytes = Buffer.alloc(grid.width * grid.height * 3);
  for (let i = 0; i < grid.size; i += 1) {
    const color = colorFn(currentWorld, i);
    const offset = i * 3;
    bytes[offset] = color[0];
    bytes[offset + 1] = color[1];
    bytes[offset + 2] = color[2];
  }
  writeFileSync(output, Buffer.concat([Buffer.from(`P6\n${grid.width} ${grid.height}\n255\n`), bytes]));
}

function writeProjectedPpm(currentWorld, output, colorFn) {
  const { grid } = currentWorld;
  const { width, height } = parseResolution(outputResolution, 512, 256);
  const bytes = Buffer.alloc(width * height * 3);
  const projectionMode = currentWorld.params?.projectionMode ?? topologyOptions.projectionMode ?? "equirectangular";
  const background = [18, 20, 24];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 3;
      const sample = projectionSampleToVec3(x, y, width, height, projectionMode);
      const color = sample.visible
        ? colorFn(currentWorld, nearestCellByVector(grid, sample.x, sample.y, sample.z))
        : background;
      bytes[offset] = color[0];
      bytes[offset + 1] = color[1];
      bytes[offset + 2] = color[2];
    }
  }
  writeFileSync(output, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), bytes]));
}

function isGraphBackedGrid(grid) {
  return Boolean(grid.topologyOptions?.graphBacked || grid.topologyKind === "cubed-sphere");
}

function parseResolution(value, fallbackWidth, fallbackHeight) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value ?? ""));
  if (!match) return { width: fallbackWidth, height: fallbackHeight };
  return {
    width: Math.max(1, Number(match[1])),
    height: Math.max(1, Number(match[2])),
  };
}

function worldResolutionFromSnapshotHint(snapshotPath) {
  return snapshotPath ? "512x256" : null;
}

function colorCrustType(world, i) {
  const type = world.grid.crustType[i];
  if (type === 1) return [111, 151, 83];
  if (type === 2) return [195, 165, 95];
  return [42, 103, 146];
}

function colorElevation(world, i) {
  return colorForElevation(world.grid.elev[i] - world.seaLevel);
}

function colorSeaMask(world, i) {
  return world.grid.elev[i] >= world.seaLevel ? [125, 154, 91] : [31, 91, 137];
}

function colorPlateId(world, i) {
  const p = world.grid.plate[i] + 1;
  return [
    48 + (p * 73) % 176,
    48 + (p * 151) % 176,
    48 + (p * 211) % 176,
  ];
}

function colorNoisyBoundaryPatch(world, i) {
  if (world.grid.noisyBoundaryPatch[i]) return [188, 68, 194];
  return world.grid.activeBoundary[i] ? [72, 76, 82] : [25, 28, 32];
}

function colorBoundaryKind(world, i) {
  const kind = world.grid.boundaryKind[i];
  if (kind === 1) return [213, 82, 68];
  if (kind === 2) return [79, 179, 209];
  if (kind === 3) return [226, 190, 82];
  return [28, 38, 48];
}

function colorRiftStage(world, i) {
  const stage = world.grid.riftStage[i];
  if (stage === 1) return [224, 198, 83];
  if (stage === 2) return [226, 130, 54];
  if (stage === 3) return [142, 91, 190];
  if (stage === 4) return [70, 205, 205];
  if (stage === 5) return [52, 113, 211];
  return [34, 38, 42];
}

function colorExternalSeaMask(world, i) {
  if (world.grid.externalSeaMask[i]) return [39, 101, 172];
  return world.grid.elev[i] < world.seaLevel ? [45, 54, 69] : [89, 112, 77];
}

function colorInlandWaterCandidate(world, i) {
  if (world.grid.inlandWaterCandidate[i]) return [76, 204, 211];
  return world.grid.elev[i] < world.seaLevel ? [24, 56, 88] : [62, 73, 57];
}

function colorClosedBasinId(world, i) {
  const id = world.grid.closedBasinId[i];
  if (!id) return world.grid.elev[i] < world.seaLevel ? [24, 48, 70] : [45, 52, 47];
  return [
    60 + (id * 73) % 150,
    70 + (id * 131) % 150,
    80 + (id * 47) % 150,
  ];
}

function colorIntId(fieldName) {
  return (world, i) => {
    const id = world.grid[fieldName][i];
    if (!id) return [32, 35, 38];
    return [
      48 + (id * 73) % 170,
      55 + (id * 131) % 165,
      62 + (id * 47) % 160,
    ];
  };
}

function colorProtoOceanCandidate(world, i) {
  if (world.grid.protoOceanCandidate[i]) return [65, 226, 214];
  if (world.grid.riftStage[i] === 5) return [58, 117, 225];
  if (world.grid.riftStage[i] > 0) return [180, 113, 76];
  return [34, 38, 42];
}

function colorFlowDirection(world, i) {
  const hydrology = world.hydrologyInputs;
  if (!hydrology?.flowDirection || !hydrology?.riverStrength) return [31, 34, 36];
  if (!world.grid || world.grid.elev[i] < world.seaLevel) return [22, 33, 43];
  const dir = hydrology.flowDirection[i];
  if (dir < 0) return hydrology.depressionMask?.[i] ? [204, 66, 58] : [58, 58, 54];
  const palette = [
    [72, 164, 220],
    [72, 205, 190],
    [94, 205, 104],
    [180, 207, 88],
    [224, 180, 72],
    [221, 112, 76],
    [190, 88, 190],
    [112, 96, 214],
  ];
  const base = palette[dir % palette.length];
  const strength = Math.max(0.25, Math.min(1, hydrology.riverStrength[i] * 1.4));
  return lerpColor([31, 34, 36], base, strength);
}

function colorHydrologyField(fieldName, min, max, low, high) {
  return (world, i) => {
    const field = world.hydrologyInputs?.[fieldName];
    if (!field) return [31, 34, 36];
    const t = Math.max(0, Math.min(1, (field[i] - min) / (max - min)));
    return lerpColor(low, high, t);
  };
}

function colorHydrologyLogField(fieldName, low, high) {
  return (world, i) => {
    const field = world.hydrologyInputs?.[fieldName];
    if (!field) return [31, 34, 36];
    const max = world.hydrologyInputs?.hydrologyDiagnostics?.flowAccumulationMax ?? 1;
    const t = Math.log1p(Math.max(0, field[i])) / Math.max(1e-6, Math.log1p(max));
    return lerpColor(low, high, Math.max(0, Math.min(1, t)));
  };
}

function colorHydrologyMask(fieldName, high) {
  return (world, i) => (world.hydrologyInputs?.[fieldName]?.[i] ? high : [31, 34, 36]);
}

function colorHydrologyIntId(fieldName) {
  return (world, i) => {
    const id = world.hydrologyInputs?.[fieldName]?.[i] ?? 0;
    if (!id) return [32, 35, 38];
    const n = Math.abs(id);
    return [
      48 + (n * 73) % 170,
      55 + (n * 131) % 165,
      62 + (n * 47) % 160,
    ];
  };
}

function colorMask(fieldName, high) {
  return (world, i) => (world.grid[fieldName][i] ? high : [31, 34, 36]);
}

function colorOceanAge(world, i) {
  if (world.grid.crustType[i] !== 0) return [34, 38, 42];
  const t = Math.max(0, Math.min(1, world.grid.crustAge[i]));
  return lerpColor([80, 204, 214], [20, 35, 89], t);
}

function colorOldBoundaryCorrelation(world, i) {
  const t = Math.max(0, Math.min(1, world.grid.oldBoundaryCorrelation[i]));
  if (t < 0.5) return lerpColor([26, 31, 36], [230, 232, 217], t * 2);
  return lerpColor([230, 232, 217], [218, 55, 49], (t - 0.5) * 2);
}

function colorField(fieldName, min, max, low, high) {
  return (world, i) => {
    const t = Math.max(0, Math.min(1, (world.grid[fieldName][i] - min) / (max - min)));
    return lerpColor(low, high, t);
  };
}

function colorSignedField(fieldName, min, max) {
  return (world, i) => {
    const value = world.grid[fieldName][i];
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    if (t < 0.5) return lerpColor([36, 68, 130], [52, 58, 61], t * 2);
    return lerpColor([52, 58, 61], [226, 187, 98], (t - 0.5) * 2);
  };
}

function colorForElevation(h) {
  if (h < -0.22) return [7, 35, 65];
  if (h < -0.08) return lerpColor([11, 53, 94], [31, 105, 143], (h + 0.22) / 0.14);
  if (h < 0) return lerpColor([39, 116, 145], [86, 157, 164], (h + 0.08) / 0.08);
  if (h < 0.12) return lerpColor([86, 132, 72], [143, 163, 88], h / 0.12);
  if (h < 0.32) return lerpColor([136, 123, 77], [126, 91, 62], (h - 0.12) / 0.2);
  if (h < 0.56) return lerpColor([116, 94, 79], [188, 182, 163], (h - 0.32) / 0.24);
  return [236, 240, 229];
}

function lerpColor(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}
