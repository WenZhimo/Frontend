import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(16, Math.trunc(Number(process.argv[3] ?? 16)));
const steps = Math.max(0, Math.trunc(Number(process.argv[4] ?? 2)));
const outputResolution = process.argv[5] ?? "128x64";

const renderOutput = "_spherical_render_gate.ppm";
const gpuOutputPrefix = "_spherical_gpu_render_gate";
const gpuOutput = `${gpuOutputPrefix}_cpu.ppm`;
const debugOutputDir = "_spherical_debug_render_gate";
const debugOutput = `${debugOutputDir}/flowAccumulation.ppm`;
const finalElevationDebugOutput = `${debugOutputDir}/finalElevation.ppm`;
const externalSeaDebugOutput = `${debugOutputDir}/externalSeaMask.ppm`;
const topologyDebugOutput = `${debugOutputDir}/topologyFace.ppm`;
const cellIdDebugOutput = `${debugOutputDir}/debugCellId.ppm`;
const neighborCountDebugOutput = `${debugOutputDir}/debugNeighborCount.ppm`;
const areaDebugOutput = `${debugOutputDir}/debugArea.ppm`;
const seamDebugOutput = `${debugOutputDir}/debugFaceSeamRisk.ppm`;
const samplingDebugOutput = `${debugOutputDir}/debugProjectionSampling.ppm`;

cleanup();

const renderCheck = runJsonCheck("render-check", [
  "tools/render-check.mjs",
  seedText,
  String(steps),
  renderOutput,
  "geology-v2",
  "256x128",
  "--topology",
  "cubed-sphere",
  "--projection",
  "equirectangular",
  "--face-size",
  String(faceSize),
  "--output-resolution",
  outputResolution,
]);

const gpuRenderCheck = runJsonCheck("gpu-render-check", [
  "tools/gpu-render-check.mjs",
  seedText,
  String(steps),
  gpuOutputPrefix,
  "geology-v2",
  "256x128",
  "--topology",
  "cubed-sphere",
  "--projection",
  "equirectangular",
  "--face-size",
  String(faceSize),
  "--output-resolution",
  outputResolution,
]);

const debugRenderCheck = runJsonCheck("geology-debug-render", [
  "tools/geology-debug-render.mjs",
  seedText,
  String(steps),
  debugOutputDir,
  "geology-v2",
  "256x128",
  "--topology",
  "cubed-sphere",
  "--projection",
  "equirectangular",
  "--face-size",
  String(faceSize),
  "--output-resolution",
  outputResolution,
  "--layers",
  "flowAccumulation,finalElevation,externalSeaMask,topologyFace,debugCellId,debugNeighborCount,debugArea,debugFaceSeamRisk,debugProjectionSampling",
]);

const finalElevationStats = ppmStats(finalElevationDebugOutput);
const externalSeaStats = ppmStats(externalSeaDebugOutput);
const topologyStats = ppmStats(topologyDebugOutput);
const cellIdStats = ppmStats(cellIdDebugOutput);
const neighborCountStats = ppmStats(neighborCountDebugOutput);
const areaStats = ppmStats(areaDebugOutput);
const seamStats = ppmStats(seamDebugOutput);
const samplingStats = ppmStats(samplingDebugOutput);

const checks = {
  renderCheckValid: renderCheck.status === 0 && renderCheck.parsed !== null,
  renderUsesSphericalProjection: renderCheck.parsed?.renderUsesSphericalProjection === true,
  renderTopologyCubedSphere: renderCheck.parsed?.topologyMode === "cubed-sphere",
  renderOutputExists: existsSync(renderOutput),
  gpuCheckValid: gpuRenderCheck.status === 0 && gpuRenderCheck.parsed !== null,
  gpuUsesSphericalCpuReference: gpuRenderCheck.parsed?.cpuRenderUsesSphericalProjection === true,
  gpuRectangularPathSkipped: gpuRenderCheck.parsed?.experimentalGpuRender?.skipped === true,
  gpuOutputExists: existsSync(gpuOutput),
  debugCheckValid: debugRenderCheck.status === 0 && debugRenderCheck.parsed !== null,
  debugTopologyCubedSphere: debugRenderCheck.parsed?.topologyMode === "cubed-sphere",
  debugLayerRestricted:
    Array.isArray(debugRenderCheck.parsed?.requestedLayers) &&
    debugRenderCheck.parsed.requestedLayers.includes("flowAccumulation") &&
    debugRenderCheck.parsed.requestedLayers.includes("finalElevation") &&
    debugRenderCheck.parsed.requestedLayers.includes("externalSeaMask") &&
    debugRenderCheck.parsed.requestedLayers.includes("topologyFace") &&
    debugRenderCheck.parsed.requestedLayers.includes("debugCellId") &&
    debugRenderCheck.parsed.requestedLayers.includes("debugNeighborCount") &&
    debugRenderCheck.parsed.requestedLayers.includes("debugArea") &&
    debugRenderCheck.parsed.requestedLayers.includes("debugFaceSeamRisk") &&
    debugRenderCheck.parsed.requestedLayers.includes("debugProjectionSampling"),
  debugOutputExists: existsSync(debugOutput),
  finalElevationDebugOutputExists: existsSync(finalElevationDebugOutput),
  externalSeaDebugOutputExists: existsSync(externalSeaDebugOutput),
  topologyDebugOutputExists: existsSync(topologyDebugOutput),
  cellIdDebugOutputExists: existsSync(cellIdDebugOutput),
  neighborCountDebugOutputExists: existsSync(neighborCountDebugOutput),
  areaDebugOutputExists: existsSync(areaDebugOutput),
  seamDebugOutputExists: existsSync(seamDebugOutput),
  samplingDebugOutputExists: existsSync(samplingDebugOutput),
  finalElevationDebugInformative: finalElevationStats.uniqueColorCount > 24 && finalElevationStats.nonBackgroundShare > 0.65,
  externalSeaDebugInformative: externalSeaStats.uniqueColorCount >= 2 && externalSeaStats.nonBackgroundShare > 0.08,
  topologyFaceDebugShowsFaces: topologyStats.uniqueColorCount >= 6 && topologyStats.nonBackgroundShare > 0.8,
  cellIdDebugInformative: cellIdStats.uniqueColorCount > 48 && cellIdStats.nonBackgroundShare > 0.8,
  neighborCountDebugInformative: neighborCountStats.uniqueColorCount >= 1 && neighborCountStats.nonBackgroundShare > 0.8,
  areaDebugInformative: areaStats.uniqueColorCount >= 4 && areaStats.nonBackgroundShare > 0.8,
  faceSeamRiskDebugShowsSeams: seamStats.highlightShare > 0.004 && seamStats.uniqueColorCount >= 3,
  projectionSamplingDebugShowsFaceGrid: samplingStats.uniqueColorCount >= 4 && samplingStats.nonBackgroundShare > 0.8,
};

const failures = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

const result = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  steps,
  outputResolution,
  failures,
  checks,
  renderCheck: compactRenderResult(renderCheck),
  gpuRenderCheck: compactGpuResult(gpuRenderCheck),
  debugRenderCheck: compactDebugResult(debugRenderCheck),
  debugLayerStats: {
    finalElevation: finalElevationStats,
    externalSeaMask: externalSeaStats,
    topologyFace: topologyStats,
    debugCellId: cellIdStats,
    debugNeighborCount: neighborCountStats,
    debugArea: areaStats,
    debugFaceSeamRisk: seamStats,
    debugProjectionSampling: samplingStats,
  },
};

cleanup();
console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function runJsonCheck(name, args) {
  const child = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = String(child.stdout ?? "").trim();
  const stderr = String(child.stderr ?? "").trim();
  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  return {
    name,
    status: child.status,
    parsed,
    stderr: stderr ? stderr.slice(0, 1200) : undefined,
  };
}

function compactRenderResult(result) {
  const parsed = result.parsed ?? {};
  return {
    status: result.status,
    renderBackend: parsed.renderBackend ?? null,
    renderUsesSphericalProjection: parsed.renderUsesSphericalProjection ?? null,
    topologyMode: parsed.topologyMode ?? null,
    projectionMode: parsed.projectionMode ?? null,
    outputWidth: parsed.outputWidth ?? null,
    outputHeight: parsed.outputHeight ?? null,
    landRatio: parsed.landRatio ?? null,
    stderr: result.stderr,
  };
}

function compactGpuResult(result) {
  const parsed = result.parsed ?? {};
  return {
    status: result.status,
    cpuRenderBackend: parsed.cpuRenderBackend ?? null,
    cpuRenderUsesSphericalProjection: parsed.cpuRenderUsesSphericalProjection ?? null,
    topologyMode: parsed.topologyMode ?? null,
    projectionMode: parsed.projectionMode ?? null,
    outputWidth: parsed.outputWidth ?? null,
    outputHeight: parsed.outputHeight ?? null,
    experimentalGpuRender: parsed.experimentalGpuRender ?? null,
    stderr: result.stderr,
  };
}

function compactDebugResult(result) {
  const parsed = result.parsed ?? {};
  return {
    status: result.status,
    topologyMode: parsed.topologyMode ?? null,
    projectionMode: parsed.projectionMode ?? null,
    faceSize: parsed.faceSize ?? null,
    requestedLayers: parsed.requestedLayers ?? null,
    outputCount: Array.isArray(parsed.outputs) ? parsed.outputs.length : null,
    stderr: result.stderr,
  };
}

function ppmStats(path) {
  if (!existsSync(path)) return emptyPpmStats();
  const buffer = readFileSync(path);
  const header = parsePpmHeader(buffer);
  if (!header) return emptyPpmStats();
  const pixels = buffer.subarray(header.offset);
  const pixelCount = Math.max(1, header.width * header.height);
  const colors = new Set();
  let backgroundPixels = 0;
  let highlightedPixels = 0;
  const background = [31, 34, 36];
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    colors.add(`${r},${g},${b}`);
    if (Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) <= 8) {
      backgroundPixels += 1;
    }
    if (r + g + b > 180 && Math.max(r, g, b) - Math.min(r, g, b) > 35) highlightedPixels += 1;
  }
  return {
    width: header.width,
    height: header.height,
    uniqueColorCount: colors.size,
    backgroundShare: backgroundPixels / pixelCount,
    nonBackgroundShare: 1 - backgroundPixels / pixelCount,
    highlightShare: highlightedPixels / pixelCount,
  };
}

function emptyPpmStats() {
  return {
    width: 0,
    height: 0,
    uniqueColorCount: 0,
    backgroundShare: 1,
    nonBackgroundShare: 0,
    highlightShare: 0,
  };
}

function parsePpmHeader(buffer) {
  const tokens = [];
  let offset = 0;
  while (tokens.length < 4 && offset < buffer.length) {
    while (offset < buffer.length && isWhitespace(buffer[offset])) offset += 1;
    if (buffer[offset] === 35) {
      while (offset < buffer.length && buffer[offset] !== 10) offset += 1;
      continue;
    }
    const start = offset;
    while (offset < buffer.length && !isWhitespace(buffer[offset])) offset += 1;
    tokens.push(buffer.subarray(start, offset).toString("ascii"));
  }
  while (offset < buffer.length && isWhitespace(buffer[offset])) offset += 1;
  if (tokens[0] !== "P6") return null;
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  const max = Number(tokens[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || max !== 255) return null;
  return { width, height, offset };
}

function isWhitespace(byte) {
  return byte === 9 || byte === 10 || byte === 13 || byte === 32;
}

function cleanup() {
  for (const path of [
    renderOutput,
    gpuOutput,
    debugOutput,
    finalElevationDebugOutput,
    externalSeaDebugOutput,
    topologyDebugOutput,
    cellIdDebugOutput,
    neighborCountDebugOutput,
    areaDebugOutput,
    seamDebugOutput,
    samplingDebugOutput,
  ]) {
    if (existsSync(path)) rmSync(path, { force: true });
  }
  if (existsSync(debugOutputDir)) rmSync(debugOutputDir, { recursive: true, force: true });
}
