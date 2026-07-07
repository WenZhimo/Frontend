import { createMapRenderer } from "./render/map2d.js";
import { detectGpuCapabilities } from "./gpu/capability.js";
import { createGpuComputeValidator } from "./gpu/computeValidate.js";
import { stepWorld } from "./sim/evolution.js";
import { createWorld, updateWorldParams } from "./sim/world.js";
import { bindControlLabels, randomSeedText, readParams } from "./ui/controls.js";

const elements = {
  canvas: document.querySelector("#mapCanvas"),
  seedText: document.querySelector("#seedText"),
  waterLevel: document.querySelector("#waterLevel"),
  waterLabel: document.querySelector("#waterLabel"),
  intensity: document.querySelector("#intensity"),
  intensityLabel: document.querySelector("#intensityLabel"),
  plateCount: document.querySelector("#plateCount"),
  platesLabel: document.querySelector("#platesLabel"),
  timeScale: document.querySelector("#timeScale"),
  resolution: document.querySelector("#resolution"),
  topologyMode: document.querySelector("#topologyMode"),
  projectionMode: document.querySelector("#projectionMode"),
  faceSize: document.querySelector("#faceSize"),
  faceSizeLabel: document.querySelector("#faceSizeLabel"),
  pipelineMode: document.querySelector("#pipelineMode"),
  showBoundaries: document.querySelector("#showBoundaries"),
  playPause: document.querySelector("#playPause"),
  stepOnce: document.querySelector("#stepOnce"),
  resetWorld: document.querySelector("#resetWorld"),
  randomSeed: document.querySelector("#randomSeed"),
  seedUint: document.querySelector("#seedUint"),
  stepCount: document.querySelector("#stepCount"),
  worldAge: document.querySelector("#worldAge"),
  landSea: document.querySelector("#landSea"),
  seaLevel: document.querySelector("#seaLevel"),
  plateDrift: document.querySelector("#plateDrift"),
  stepMs: document.querySelector("#stepMs"),
  causalityReport: document.querySelector("#causalityReport"),
};

bindControlLabels(elements);
const gpuCapabilities = detectGpuCapabilities(globalThis);
console.info("[gpu]", gpuCapabilities.recommendedMode, gpuCapabilities.reason);
const gpuComputeValidator = createGpuComputeValidator(readGpuComputeOptions());
if (gpuComputeValidator.enabled) {
  console.info("[gpu-compute]", gpuComputeValidator.mode, {
    kernels: gpuComputeValidator.kernels,
    fields: gpuComputeValidator.fields,
    interval: gpuComputeValidator.interval,
  });
}
const renderer = createMapRenderer(elements.canvas, {
  gpuCapabilities,
  experimentalGpuRender: readExperimentalGpuRenderFlag(),
});
console.info("[render]", renderer.kind, renderer.fallbackReason ?? "active");
let world = createWorld(readParams(elements));
world.gpuCapabilities = gpuCapabilities;
let playing = false;
let lastFrame = 0;
let pendingProjectionRender = false;
const projectionCamera = {
  lon: 0,
  lat: 0,
  zoom: 0.92,
};
let projectionDrag = null;
const perfTracker = createBrowserPerfTracker(globalThis, {
  gpuComputeMode: gpuComputeValidator.mode,
});

bindProjectionCameraControls();
renderAll();

elements.playPause.addEventListener("click", () => {
  playing = !playing;
  elements.playPause.textContent = playing ? "暂停" : "播放";
  if (playing) requestAnimationFrame(loop);
});

elements.stepOnce.addEventListener("click", () => {
  updateWorldParams(world, readParams(elements));
  runSimulationStep();
  renderAll();
});

elements.resetWorld.addEventListener("click", rebuildWorld);
elements.randomSeed.addEventListener("click", () => {
  elements.seedText.value = randomSeedText();
  rebuildWorld();
});

for (const element of [
  elements.seedText,
  elements.waterLevel,
  elements.intensity,
  elements.plateCount,
  elements.timeScale,
  elements.resolution,
  elements.topologyMode,
  elements.projectionMode,
  elements.faceSize,
  elements.pipelineMode,
]) {
  if (element) element.addEventListener("change", rebuildWorld);
}

elements.showBoundaries.addEventListener("change", () => {
  updateWorldParams(world, readParams(elements));
  renderAll();
});

function loop(now) {
  if (!playing) return;
  if (now - lastFrame > 32) {
    updateWorldParams(world, readParams(elements));
    runSimulationStep();
    renderAll();
    lastFrame = now;
  }
  requestAnimationFrame(loop);
}

function runSimulationStep() {
  const startedAt = performance.now();
  stepWorld(world);
  const measuredStepMs = Number.isFinite(world.lastStepMs)
    ? world.lastStepMs
    : performance.now() - startedAt;
  perfTracker.recordStep(measuredStepMs, world);
  trackGpuCompute(gpuComputeValidator.maybeValidate(world));
}

function trackGpuCompute(maybeResult) {
  Promise.resolve(maybeResult)
    .then((result) => {
      if (result) perfTracker.recordGpuCompute(result);
    })
    .catch((error) => {
      perfTracker.recordGpuError(error);
    });
}

function rebuildWorld() {
  const wasPlaying = playing;
  playing = false;
  elements.playPause.textContent = "播放";
  world = createWorld(readParams(elements));
  world.gpuCapabilities = gpuCapabilities;
  renderAll();
  if (wasPlaying) {
    playing = true;
    elements.playPause.textContent = "暂停";
    requestAnimationFrame(loop);
  }
}

function renderAll() {
  const startedAt = performance.now();
  applyProjectionCamera(world);
  updateProjectionCursor();
  renderer.render(world);
  perfTracker.recordRender(performance.now() - startedAt, world, {
    projection: usesInteractiveOrthographicProjection(),
  });
  updateStats(world);
  publishRuntimeState(world);
}

function bindProjectionCameraControls() {
  const canvas = elements.canvas;
  if (!canvas) return;

  canvas.addEventListener("pointerdown", (event) => {
    if (!usesInteractiveOrthographicProjection()) return;
    projectionDrag = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    canvas.setPointerCapture?.(event.pointerId);
    updateProjectionCursor(true);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!projectionDrag || projectionDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - projectionDrag.lastX;
    const dy = event.clientY - projectionDrag.lastY;
    projectionDrag.lastX = event.clientX;
    projectionDrag.lastY = event.clientY;
    projectionCamera.lon = wrapLongitude(projectionCamera.lon - dx * 0.01);
    projectionCamera.lat = clamp(projectionCamera.lat + dy * 0.01, -1.45, 1.45);
    requestProjectionRender();
    event.preventDefault();
  });

  const stopDrag = (event) => {
    if (!projectionDrag || projectionDrag.pointerId !== event.pointerId) return;
    canvas.releasePointerCapture?.(event.pointerId);
    projectionDrag = null;
    updateProjectionCursor(false);
    renderAll();
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);
  canvas.addEventListener("lostpointercapture", () => {
    projectionDrag = null;
    updateProjectionCursor(false);
  });

  canvas.addEventListener("wheel", (event) => {
    if (!usesInteractiveOrthographicProjection()) return;
    projectionCamera.zoom = clamp(
      projectionCamera.zoom * Math.exp(-event.deltaY * 0.001),
      0.55,
      1.85,
    );
    requestProjectionRender();
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener("mouseenter", () => updateProjectionCursor(false));
  canvas.addEventListener("mouseleave", () => {
    if (!projectionDrag) updateProjectionCursor(false);
  });
}

function requestProjectionRender() {
  if (pendingProjectionRender) return;
  pendingProjectionRender = true;
  requestAnimationFrame(() => {
    pendingProjectionRender = false;
    renderAll();
  });
}

function applyProjectionCamera(currentWorld) {
  if (!currentWorld?.params) return;
  currentWorld.params.cameraLon = projectionCamera.lon;
  currentWorld.params.cameraLat = projectionCamera.lat;
  currentWorld.params.projectionZoom = projectionCamera.zoom;
}

function updateProjectionCursor(forceDragging = false) {
  const canvas = elements.canvas;
  if (!canvas) return;
  if (!usesInteractiveOrthographicProjection()) {
    canvas.style.cursor = "";
    return;
  }
  canvas.style.cursor = forceDragging || projectionDrag ? "grabbing" : "grab";
}

function usesInteractiveOrthographicProjection() {
  return world?.params?.projectionMode === "orthographic" && isGraphBackedGrid(world?.grid);
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapLongitude(value) {
  const tau = Math.PI * 2;
  return ((value + Math.PI) % tau + tau) % tau - Math.PI;
}

function createBrowserPerfTracker(globalObject, options = {}) {
  const sampleLimit = 180;
  const samples = {
    stepMs: [],
    renderMs: [],
    projectionRenderMs: [],
    gpuSetupMs: [],
    gpuUploadMs: [],
    gpuKernelMs: [],
    gpuDownloadMs: [],
    gpuTotalMs: [],
    gpuCandidateTotalMs: [],
  };
  const summary = {
    valid: true,
    gpuComputeMode: options.gpuComputeMode ?? "off",
    lastStep: 0,
    renderBackend: null,
    step: summarizeSamples(samples.stepMs),
    render: summarizeSamples(samples.renderMs),
    projectionRender: summarizeSamples(samples.projectionRenderMs),
    gpuCompute: {
      mode: options.gpuComputeMode ?? "off",
      valid: null,
      skipped: null,
      writebackApplied: false,
      fallbackReason: null,
      requestedFields: [],
      downloadedPacks: [],
      adapterInfo: null,
      deviceInfo: null,
      setup: summarizeSamples(samples.gpuSetupMs),
      upload: summarizeSamples(samples.gpuUploadMs),
      kernel: summarizeSamples(samples.gpuKernelMs),
      download: summarizeSamples(samples.gpuDownloadMs),
      total: summarizeSamples(samples.gpuTotalMs),
      candidateTotal: summarizeSamples(samples.gpuCandidateTotalMs),
    },
    longTask: {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      lastMs: null,
    },
    updatedAt: 0,
  };

  installLongTaskObserver(globalObject, summary, publish);
  publish();

  return {
    recordStep(ms, currentWorld) {
      recordSample(samples.stepMs, ms, sampleLimit);
      summary.lastStep = currentWorld?.step ?? summary.lastStep;
      summary.step = summarizeSamples(samples.stepMs);
      publish();
    },
    recordRender(ms, currentWorld, renderOptions = {}) {
      recordSample(samples.renderMs, ms, sampleLimit);
      if (renderOptions.projection) recordSample(samples.projectionRenderMs, ms, sampleLimit);
      summary.renderBackend = currentWorld?.renderBackend ?? null;
      summary.render = summarizeSamples(samples.renderMs);
      summary.projectionRender = summarizeSamples(samples.projectionRenderMs);
      publish();
    },
    recordGpuCompute(result) {
      const timings = summarizeGpuTimings(result);
      if (Number.isFinite(timings.setupMs)) recordSample(samples.gpuSetupMs, timings.setupMs, sampleLimit);
      if (Number.isFinite(timings.uploadMs)) recordSample(samples.gpuUploadMs, timings.uploadMs, sampleLimit);
      if (Number.isFinite(timings.kernelMs)) recordSample(samples.gpuKernelMs, timings.kernelMs, sampleLimit);
      if (Number.isFinite(timings.downloadMs)) recordSample(samples.gpuDownloadMs, timings.downloadMs, sampleLimit);
      if (Number.isFinite(timings.totalGpuPathMs)) recordSample(samples.gpuTotalMs, timings.totalGpuPathMs, sampleLimit);
      if (Number.isFinite(timings.totalCandidateMs)) {
        recordSample(samples.gpuCandidateTotalMs, timings.totalCandidateMs, sampleLimit);
      }
      summary.gpuCompute = {
        mode: result.mode ?? summary.gpuCompute.mode,
        valid: result.valid ?? null,
        skipped: result.skipped ?? null,
        writebackApplied: result.writebackApplied ?? false,
        fallbackReason: result.fallbackReason ?? result.skippedReason ?? null,
        requestedFields: collectGpuCandidateMetadata(result, "requestedFields"),
        downloadedPacks: collectGpuCandidateMetadata(result, "downloadedPacks"),
        adapterInfo: collectFirstGpuCandidateMetadata(result, "adapterInfo"),
        deviceInfo: collectFirstGpuCandidateMetadata(result, "deviceInfo"),
        setup: summarizeSamples(samples.gpuSetupMs),
        upload: summarizeSamples(samples.gpuUploadMs),
        kernel: summarizeSamples(samples.gpuKernelMs),
        download: summarizeSamples(samples.gpuDownloadMs),
        total: summarizeSamples(samples.gpuTotalMs),
        candidateTotal: summarizeSamples(samples.gpuCandidateTotalMs),
      };
      publish();
    },
    recordGpuError(error) {
      summary.gpuCompute = {
        ...summary.gpuCompute,
        valid: false,
        fallbackReason: `GPU compute timing sample failed safely: ${error?.message ?? "unknown error"}`,
      };
      publish();
    },
  };

  function publish() {
    summary.updatedAt = performance.now();
    globalObject.__worldMapPerfSummary = summary;
  }
}

function installLongTaskObserver(globalObject, summary, publish) {
  try {
    const Observer = globalObject.PerformanceObserver;
    if (!Observer?.supportedEntryTypes?.includes("longtask")) return;
    const observer = new Observer((list) => {
      for (const entry of list.getEntries()) {
        const duration = Number(entry.duration);
        if (!Number.isFinite(duration)) continue;
        summary.longTask.count += 1;
        summary.longTask.totalMs += duration;
        summary.longTask.maxMs = Math.max(summary.longTask.maxMs, duration);
        summary.longTask.lastMs = duration;
      }
      publish();
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long Task API is optional; smoke tests still use step/render samples.
  }
}

function summarizeGpuTimings(result) {
  const totals = {
    setupMs: 0,
    uploadMs: 0,
    kernelMs: 0,
    downloadMs: 0,
    totalGpuPathMs: 0,
    totalCandidateMs: 0,
  };
  let count = 0;
  for (const candidate of result?.candidateResults ?? []) {
    const timings = candidate?.timings;
    if (!timings) continue;
    for (const key of Object.keys(totals)) {
      const value = Number(timings[key]);
      if (Number.isFinite(value)) totals[key] += value;
    }
    count += 1;
  }
  if (!count) {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }
  return totals;
}

function collectGpuCandidateMetadata(result, key) {
  const values = [];
  const seen = new Set();
  for (const candidate of result?.candidateResults ?? []) {
    for (const value of candidate?.[key] ?? []) {
      const id = String(value);
      if (seen.has(id)) continue;
      seen.add(id);
      values.push(value);
    }
  }
  return values;
}

function collectFirstGpuCandidateMetadata(result, key) {
  for (const candidate of result?.candidateResults ?? []) {
    if (candidate?.[key]) return candidate[key];
  }
  return null;
}

function recordSample(samplesList, value, limit) {
  if (!Number.isFinite(value)) return;
  samplesList.push(value);
  while (samplesList.length > limit) samplesList.shift();
}

function summarizeSamples(values) {
  if (!values.length) {
    return {
      count: 0,
      lastMs: null,
      averageMs: null,
      p95Ms: null,
      maxMs: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    lastMs: roundPerf(values[values.length - 1]),
    averageMs: roundPerf(sum / values.length),
    p95Ms: roundPerf(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]),
    maxMs: roundPerf(sorted[sorted.length - 1]),
  };
}

function roundPerf(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function updateStats(currentWorld) {
  const stats = currentWorld.stats;
  elements.seedUint.textContent = currentWorld.seedUint32.toString();
  elements.stepCount.textContent = currentWorld.step.toString();
  elements.worldAge.textContent = formatYears(currentWorld.ageYears);
  elements.landSea.textContent = `${Math.round(stats.landRatio * 100)}% 陆 / ${Math.round(stats.seaRatio * 100)}% 海`;
  elements.seaLevel.textContent = currentWorld.seaLevel.toFixed(3);
  elements.plateDrift.textContent = `${stats.avgPlateDrift.toFixed(1)} 格`;
  elements.stepMs.textContent = currentWorld.lastStepMs ? `${currentWorld.lastStepMs.toFixed(1)} ms` : "-";

  const mountainDelta = stats.avgMountainConvergent - stats.avgContinentalInterior;
  const sign = stats.causalityPass ? "通过" : "演化中";
  elements.causalityReport.textContent =
    `${sign}：陆块汇聚造山带均高 ${stats.avgMountainConvergent.toFixed(3)}，陆块内部均高 ${stats.avgContinentalInterior.toFixed(3)}，差值 ${mountainDelta.toFixed(3)}。` +
    ` 全部汇聚边界均值 ${stats.avgConvergent.toFixed(3)}，其中包含会降低均值的海沟。` +
    " 红色边界附近应逐步形成当前山带或海沟；蓝色离散边界在海洋抬升、陆内弱下陷；边界会随板块中心漂移。";
}

function publishRuntimeState(currentWorld) {
  const params = currentWorld?.params ?? {};
  const grid = currentWorld?.grid ?? {};
  globalThis.__worldMapRuntimeState = {
    seedText: params.seedText ?? null,
    seedUint32: currentWorld?.seedUint32 ?? null,
    resolution: params.resolution ?? null,
    topologyMode: params.topologyMode ?? null,
    productionTopologyMode: params.productionTopologyMode ?? null,
    projectionMode: params.projectionMode ?? null,
    pipelineMode: params.pipelineMode ?? null,
    faceSize: params.faceSize ?? null,
    renderWidth: params.renderWidth ?? null,
    renderHeight: params.renderHeight ?? null,
    step: currentWorld?.step ?? null,
    ageYears: currentWorld?.ageYears ?? null,
    renderBackend: currentWorld?.renderBackend ?? null,
    grid: {
      width: grid.width ?? null,
      height: grid.height ?? null,
      size: grid.size ?? null,
      topologyKind: grid.topologyKind ?? null,
      graphBacked: Boolean(grid.topologyOptions?.graphBacked),
    },
  };
}

function formatYears(years) {
  if (years >= 100000000) return `${(years / 100000000).toFixed(2)} 亿年`;
  if (years >= 10000) return `${(years / 10000).toFixed(1)} 万年`;
  return `${years.toLocaleString("zh-CN")} 年`;
}

function readExperimentalGpuRenderFlag() {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    if (params.get("gpuRender") === "0" || params.get("renderBackend") === "cpu") return false;
    return true;
  } catch {
    return true;
  }
}

function readGpuComputeOptions() {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    return {
      mode: params.get("gpuCompute") ?? "off",
      kernels: params.get("gpuKernel") ?? params.get("gpuKernels") ?? "",
      fields: params.get("gpuFields") ?? "",
      interval: params.get("gpuValidateInterval") ?? 20,
      maxReports: params.get("gpuValidateReports") ?? 12,
      globalObject: globalThis,
    };
  } catch {
    return { mode: "off", globalObject: globalThis };
  }
}
