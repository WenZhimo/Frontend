import { createMapRenderer } from "./render/map2d.js";
import { detectGpuCapabilities } from "./gpu/capability.js";
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

bindProjectionCameraControls();
renderAll();

elements.playPause.addEventListener("click", () => {
  playing = !playing;
  elements.playPause.textContent = playing ? "暂停" : "播放";
  if (playing) requestAnimationFrame(loop);
});

elements.stepOnce.addEventListener("click", () => {
  updateWorldParams(world, readParams(elements));
  stepWorld(world);
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
    stepWorld(world);
    renderAll();
    lastFrame = now;
  }
  requestAnimationFrame(loop);
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
  applyProjectionCamera(world);
  updateProjectionCursor();
  renderer.render(world);
  updateStats(world);
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
