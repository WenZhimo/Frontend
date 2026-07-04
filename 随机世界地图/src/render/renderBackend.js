import { detectGpuCapabilities, GpuRecommendedMode } from "../gpu/capability.js";
import { createCpuMapRenderer } from "./cpuMapRenderer.js";
import { createExperimentalWebGlMapRenderer } from "./gpuMapRenderer.js";

export function createRenderBackend(canvas, options = {}) {
  const capabilities = options.gpuCapabilities ?? detectGpuCapabilities(options.globalObject ?? globalThis);
  const allowExperimentalGpuRender = options.experimentalGpuRender === true;

  if (allowExperimentalGpuRender && capabilities.recommendedMode !== GpuRecommendedMode.CPU) {
    const gpuResult = createExperimentalWebGlMapRenderer(canvas);
    if (gpuResult.ok) {
      return withRuntimeFallback(gpuResult.renderer, createCpuMapRenderer(canvas), capabilities);
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

function withRuntimeFallback(gpuRenderer, cpuRenderer, capabilities) {
  let fallbackReason = null;
  const sphericalCpuReason =
    "Graph-backed spherical grids use CPU projection rendering; experimental rectangular WebGL2 rendering is skipped.";
  return {
    ...gpuRenderer,
    capabilities,
    cpuFallback: false,
    get fallbackReason() {
      return fallbackReason;
    },
    render(world) {
      if (isGraphBackedGrid(world.grid)) {
        cpuRenderer.render(world);
        world.renderBackend = "cpu-spherical-projection";
        world.renderFallbackReason = sphericalCpuReason;
        return;
      }
      if (!fallbackReason) {
        try {
          gpuRenderer.render(world);
          world.renderBackend = gpuRenderer.kind;
          world.renderFallbackReason = null;
          return;
        } catch (error) {
          fallbackReason = `Experimental GPU render failed; CPU fallback is active: ${error?.message ?? "unknown error"}`;
        }
      }
      cpuRenderer.render(world);
      world.renderBackend = "cpu-canvas";
      world.renderFallbackReason = fallbackReason;
    },
  };
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}
