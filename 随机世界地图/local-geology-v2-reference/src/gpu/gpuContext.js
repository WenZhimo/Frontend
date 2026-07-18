import { detectGpuCapabilities } from "./capability.js";

export class GpuContextSkeleton {
  constructor({ globalObject = globalThis } = {}) {
    this.capabilities = detectGpuCapabilities(globalObject);
    this.cpuAuthoritative = true;
    this.device = null;
    this.queue = null;
    this.note = "Phase 0 skeleton only: no GPU device is requested and no kernels are executed.";
  }

  supports(featureName) {
    if (featureName === "capability-detection") return true;
    if (featureName === "cpu-fallback") return true;
    return false;
  }

  async requestDevice() {
    return {
      ok: false,
      device: null,
      reason: "GPU devices are intentionally not requested during Phase 0.",
    };
  }

  dispose() {
    this.device = null;
    this.queue = null;
  }
}

export function createGpuContextSkeleton(options = {}) {
  return new GpuContextSkeleton(options);
}
