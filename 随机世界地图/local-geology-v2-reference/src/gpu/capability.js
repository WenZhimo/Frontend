export const GpuRecommendedMode = {
  CPU: "cpu",
  WEBGL_RENDER_AVAILABLE: "webgl-render-available",
  WEBGPU_EXPERIMENTAL_AVAILABLE: "webgpu-experimental-available",
};

export function detectGpuCapabilities(globalObject = globalThis) {
  try {
    const secureContext = detectSecureContext(globalObject);
    const webgpuAvailable = detectWebGpu(globalObject);
    const webgl2Available = detectWebGl2(globalObject);
    const recommended = recommendMode({ secureContext, webgpuAvailable, webgl2Available });
    return {
      secureContext,
      webgpuAvailable,
      webgl2Available,
      recommendedMode: recommended.mode,
      reason: recommended.reason,
    };
  } catch (error) {
    return {
      secureContext: false,
      webgpuAvailable: false,
      webgl2Available: false,
      recommendedMode: GpuRecommendedMode.CPU,
      reason: `GPU capability detection failed safely: ${error?.message ?? "unknown error"}`,
    };
  }
}

function detectSecureContext(globalObject) {
  if (typeof globalObject?.isSecureContext === "boolean") {
    return globalObject.isSecureContext;
  }
  const protocol = globalObject?.location?.protocol;
  const hostname = globalObject?.location?.hostname;
  if (protocol === "https:") return true;
  if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")) {
    return true;
  }
  return false;
}

function detectWebGpu(globalObject) {
  const navigatorObject = globalObject?.navigator;
  return Boolean(navigatorObject && "gpu" in navigatorObject);
}

function detectWebGl2(globalObject) {
  const documentObject = globalObject?.document;
  if (!documentObject?.createElement) return false;
  try {
    const canvas = documentObject.createElement("canvas");
    return Boolean(canvas?.getContext?.("webgl2"));
  } catch {
    return false;
  }
}

function recommendMode({ secureContext, webgpuAvailable, webgl2Available }) {
  if (secureContext && webgpuAvailable) {
    return {
      mode: GpuRecommendedMode.WEBGPU_EXPERIMENTAL_AVAILABLE,
      reason: "WebGPU is visible in a secure context; keep CPU as authoritative until kernels are validated.",
    };
  }
  if (webgl2Available) {
    return {
      mode: GpuRecommendedMode.WEBGL_RENDER_AVAILABLE,
      reason: webgpuAvailable
        ? "WebGPU is visible but the context is not secure; WebGL2 render experiments may still be available."
        : "WebGL2 is available for future render-only acceleration.",
    };
  }
  return {
    mode: GpuRecommendedMode.CPU,
    reason: webgpuAvailable
      ? "WebGPU is visible but unavailable as the default because this is not a secure context."
      : "No GPU acceleration path is available; CPU fallback remains authoritative.",
  };
}
