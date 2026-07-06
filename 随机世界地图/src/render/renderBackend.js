import { detectGpuCapabilities, GpuRecommendedMode } from "../gpu/capability.js";
import { createCpuMapRenderer } from "./cpuMapRenderer.js";
import { createExperimentalWebGlMapRenderer } from "./gpuMapRenderer.js";

export function createRenderBackend(canvas, options = {}) {
  const capabilities = options.gpuCapabilities ?? detectGpuCapabilities(options.globalObject ?? globalThis);
  const allowExperimentalGpuRender = options.experimentalGpuRender === true;

  if (allowExperimentalGpuRender && capabilities.recommendedMode !== GpuRecommendedMode.CPU) {
    const gpuResult = createExperimentalWebGlMapRenderer(canvas);
    if (gpuResult.ok) {
      return withRuntimeFallback(gpuResult.renderer, capabilities);
    }
    const cpu = createCpuMapRenderer(canvas);
    return withFallback(cpu, capabilities, gpuResult.reason);
  }

  const cpu = createCpuMapRenderer(canvas);
  const reason = allowExperimentalGpuRender
    ? capabilities.reason
    : "Experimental GPU render is disabled; CPU Canvas remains the default reliable backend.";
  return withFallback(cpu, capabilities, reason);
}

function withFallback(renderer, capabilities, reason) {
  return {
    ...renderer,
    kind: "cpu-canvas",
    capabilities,
    fallbackReason: reason,
    cpuFallback: true,
    render(world) {
      renderer.render(world);
      world.renderBackend = "cpu-canvas";
      world.renderFallbackReason = reason;
    },
  };
}

function withRuntimeFallback(gpuRenderer, capabilities) {
  let fallbackReason = null;
  return {
    ...gpuRenderer,
    capabilities,
    cpuFallback: false,
    get fallbackReason() {
      return fallbackReason;
    },
    render(world) {
      if (!fallbackReason) {
        try {
          gpuRenderer.render(world);
          if (!world.renderBackend) world.renderBackend = gpuRenderer.kind;
          world.renderFallbackReason = null;
          return;
        } catch (error) {
          fallbackReason = `Experimental GPU render failed; CPU fallback is active: ${error?.message ?? "unknown error"}`;
        }
      }
      world.renderBackend = "webgl2-render-experimental-failed";
      world.renderFallbackReason = fallbackReason;
    },
  };
}
