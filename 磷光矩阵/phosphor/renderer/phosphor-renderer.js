import { createPhosphorConfig, applyQualityPreset } from "./config.js";
import { DisplaySurface } from "./display-surface.js";
import { PhosphorPipeline } from "./phosphor-pipeline.js";
import { WebGLPhosphorPipeline } from "./webgl/webgl-pipeline.js";

export class PhosphorRenderer {
  constructor(config = {}) {
    this.config = createPhosphorConfig(config);
    if (!this.config.target) throw new Error("PhosphorRenderer requires a target element.");
    if (!this.config.mount) throw new Error("PhosphorRenderer requires a mount canvas.");
    this.surface = new DisplaySurface(this.config);
    this.pipeline = this.createPipeline();
    this.running = false;
    this.rafId = 0;
    this.lastFrameTime = 0;
    this.render = this.render.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  createPipeline() {
    const requested = this.config.backend;
    if (requested !== "canvas2d") {
      try {
        const pipeline = new WebGLPhosphorPipeline(this.surface, this.config);
        this.backend = "webgl2";
        return pipeline;
      } catch (error) {
        if (requested === "webgl2") throw error;
        this.backendWarning = error.message;
      }
    }
    this.backend = "canvas2d";
    return new PhosphorPipeline();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.surface.show();
    this.lastFrameTime = 0;
    this.rafId = window.requestAnimationFrame(this.render);
  }

  stop() {
    this.running = false;
    if (this.rafId) window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.surface.hide();
  }

  destroy() {
    this.stop();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.surface.destroy();
  }

  updateConfig(nextConfig = {}) {
    this.config = createPhosphorConfig({
      ...this.config,
      ...nextConfig,
      phosphorPalette: {
        ...this.config.phosphorPalette,
        ...(nextConfig.phosphorPalette || {}),
      },
    });
    this.surface.config = this.config;
    this.surface.resize();
    if (nextConfig.backend && nextConfig.backend !== this.backend && nextConfig.backend !== "auto") {
      this.pipeline.destroy?.();
      this.pipeline = this.createPipeline();
    }
    this.pipeline.invalidate();
  }

  setQuality(quality) {
    this.config = applyQualityPreset(this.config, quality);
    this.surface.config = this.config;
    this.surface.resize();
    this.pipeline.invalidate();
  }

  render(time) {
    if (!this.running) return;
    const frameInterval = 1000 / Math.max(1, this.config.frameRate);
    if (time - this.lastFrameTime >= frameInterval || this.config.motionMode === "static") {
      this.lastFrameTime = time;
      this.pipeline.render(null, this.config.target, this.surface, this.config, time);
      if (this.config.motionMode === "static") {
        this.running = false;
        return;
      }
    }
    this.rafId = window.requestAnimationFrame(this.render);
  }

  handleVisibilityChange() {
    if (document.hidden && this.config.motionMode === "powerSave") {
      if (this.rafId) window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.running && !this.rafId) {
      this.rafId = window.requestAnimationFrame(this.render);
    }
  }

  getState() {
    return {
      running: this.running,
      backend: this.backend,
      backendWarning: this.backendWarning || null,
      config: this.config,
      trace: this.pipeline.lastTrace,
      surface: {
        width: this.surface.width,
        height: this.surface.height,
        dpr: this.surface.dpr,
      },
    };
  }
}

export { PHOSPHOR_DEFAULT_CONFIG, createPhosphorConfig } from "./config.js";
