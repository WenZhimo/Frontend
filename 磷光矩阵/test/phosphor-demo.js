import { PhosphorRenderer } from "../phosphor/renderer/phosphor-renderer.js";

const host = window.WebShaderTestHost;
const toggle = document.getElementById("toggleMount");
const quality = document.getElementById("phosphorQuality");
const matrixPitch = document.getElementById("matrixPitchControl");
const matrixPitchOutput = document.getElementById("matrixPitchOutput");
const bloom = document.getElementById("bloomControl");
const bloomOutput = document.getElementById("bloomOutput");
const noise = document.getElementById("noiseControl");
const noiseOutput = document.getElementById("noiseOutput");
const backendOutput = document.getElementById("backendOutput");

let renderer = null;

function ensureRenderer() {
  if (renderer) return renderer;
  renderer = new PhosphorRenderer({
    target: host.target,
    mount: host.mount,
    quality: quality.value,
    bloomStrength: Number(bloom.value),
    noiseAmount: Number(noise.value),
    backend: "auto",
    accessibilityMode: "preserveDom",
    motionMode: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "static" : "realtime",
  });
  window.PhosphorDemo = {
    renderer,
    getState: () => renderer.getState(),
    stop: () => {
      renderer.stop();
      toggle.textContent = "启用磷光矩阵";
      syncBackend();
    },
  };
  syncBackend();
  matrixPitch.value = renderer.getState().config.matrixPitch;
  syncOutput();
  return renderer;
}

function syncOutput() {
  matrixPitchOutput.textContent = matrixPitch.value;
  bloomOutput.textContent = Number(bloom.value).toFixed(2);
  noiseOutput.textContent = Number(noise.value).toFixed(3);
}

function syncBackend() {
  backendOutput.textContent = renderer ? renderer.getState().backend : "pending";
}

function updateRendererConfig() {
  syncOutput();
  if (!renderer) return;
  renderer.updateConfig({
    matrixPitch: Number(matrixPitch.value),
    bloomStrength: Number(bloom.value),
    noiseAmount: Number(noise.value),
  });
}

toggle.addEventListener("click", () => {
  const activeRenderer = ensureRenderer();
  if (activeRenderer.getState().running) {
    activeRenderer.stop();
    toggle.textContent = "启用磷光矩阵";
  } else {
    activeRenderer.start();
    toggle.textContent = "停用磷光矩阵";
  }
  syncBackend();
});

quality.addEventListener("change", () => {
  const activeRenderer = ensureRenderer();
  activeRenderer.setQuality(quality.value);
  matrixPitch.value = activeRenderer.getState().config.matrixPitch;
  bloom.value = activeRenderer.getState().config.bloomStrength;
  syncOutput();
  syncBackend();
});

[matrixPitch, bloom, noise].forEach((input) => {
  input.addEventListener("input", updateRendererConfig);
});

syncOutput();
syncBackend();
