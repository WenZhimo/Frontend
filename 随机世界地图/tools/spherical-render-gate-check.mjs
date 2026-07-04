import { existsSync, rmSync } from "node:fs";
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
  "flowAccumulation",
]);

const checks = {
  renderCheckValid: renderCheck.status === 0 && renderCheck.parsed !== null,
  renderUsesSphericalProjection: renderCheck.parsed?.renderBackend === "cpu-spherical-projection-reference",
  renderTopologyCubedSphere: renderCheck.parsed?.topologyMode === "cubed-sphere",
  renderOutputExists: existsSync(renderOutput),
  gpuCheckValid: gpuRenderCheck.status === 0 && gpuRenderCheck.parsed !== null,
  gpuUsesSphericalCpuReference: gpuRenderCheck.parsed?.cpuRenderBackend === "cpu-spherical-projection-reference",
  gpuRectangularPathSkipped: gpuRenderCheck.parsed?.experimentalGpuRender?.skipped === true,
  gpuOutputExists: existsSync(gpuOutput),
  debugCheckValid: debugRenderCheck.status === 0 && debugRenderCheck.parsed !== null,
  debugTopologyCubedSphere: debugRenderCheck.parsed?.topologyMode === "cubed-sphere",
  debugLayerRestricted:
    Array.isArray(debugRenderCheck.parsed?.requestedLayers) &&
    debugRenderCheck.parsed.requestedLayers.includes("flowAccumulation"),
  debugOutputExists: existsSync(debugOutput),
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

function cleanup() {
  for (const path of [renderOutput, gpuOutput, debugOutput]) {
    if (existsSync(path)) rmSync(path, { force: true });
  }
  if (existsSync(debugOutputDir)) rmSync(debugOutputDir, { recursive: true, force: true });
}
