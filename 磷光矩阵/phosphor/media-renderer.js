import { createPhosphorConfig, applyQualityPreset } from "./renderer/config.js";
import { resizeCanvas } from "./renderer/utils.js";
import { WebGLPhosphorPipeline } from "./renderer/webgl/webgl-pipeline.js";

function isVideoElement(source) {
  return source instanceof HTMLVideoElement;
}

function resolveSourceSize(source) {
  return {
    width: Math.max(1, source.videoWidth || source.naturalWidth || source.width || source.displayWidth || 1),
    height: Math.max(1, source.videoHeight || source.naturalHeight || source.height || source.displayHeight || 1),
  };
}

function sourceNeedsRealtimeUpload(source, mode) {
  if (mode === "static") return false;
  if (mode === "realtime") return true;
  return isVideoElement(source) || source instanceof HTMLCanvasElement;
}

function isTransientFrameError(error) {
  return error?.message === "Video source has no drawable frame yet.";
}

class MediaSurface {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.resize = this.resize.bind(this);
    this.resize();
    window.addEventListener("resize", this.resize, { passive: true });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || window.innerWidth));
    const cssHeight = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxDpr);
    this.dpr = dpr;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.width = Math.max(1, Math.round(cssWidth * dpr));
    this.height = Math.max(1, Math.round(cssHeight * dpr));
    resizeCanvas(this.canvas, this.width, this.height);
  }

  clear() {
    const gl = this.canvas.getContext("webgl2");
    if (!gl) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    window.removeEventListener("resize", this.resize);
  }
}

export class PhosphorMediaRenderer {
  constructor(options = {}) {
    if (!options.mount) throw new Error("PhosphorMediaRenderer requires a mount canvas.");
    if (!options.source) throw new Error("PhosphorMediaRenderer requires an image, video, canvas, or ImageBitmap source.");
    this.config = createPhosphorConfig({
      ...options,
      target: null,
      mount: options.mount,
      backend: "webgl2",
    });
    this.source = options.source;
    this.fit = options.fit || "contain";
    this.sourceUpdateMode = options.sourceUpdateMode || "auto";
    this.surface = new MediaSurface(options.mount, this.config);
    this.pipeline = new WebGLPhosphorPipeline(this.surface, this.config);
    this.running = false;
    this.rafId = 0;
    this.lastFrameTime = 0;
    this.hasRenderedStaticFrame = false;
    this.lastError = null;
    this.errorRetryTime = 0;
    this.render = this.render.bind(this);
  }

  static isSupported() {
    return WebGLPhosphorPipeline.isSupported();
  }

  setSource(source, options = {}) {
    this.source = source;
    if (options.fit) this.fit = options.fit;
    if (options.sourceUpdateMode) this.sourceUpdateMode = options.sourceUpdateMode;
    this.hasRenderedStaticFrame = false;
    this.lastError = null;
    this.errorRetryTime = 0;
    this.pipeline.invalidate();
    this.surface.resize();
    if (!this.running) this.renderFrame(performance.now());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = 0;
    this.rafId = window.requestAnimationFrame(this.render);
  }

  stop() {
    this.running = false;
    if (this.rafId) window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  destroy() {
    this.stop();
    this.pipeline.destroy();
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
      target: null,
      mount: this.surface.canvas,
      backend: "webgl2",
    });
    this.surface.config = this.config;
    this.surface.resize();
    this.pipeline.invalidate();
    this.hasRenderedStaticFrame = false;
  }

  setQuality(quality) {
    this.config = applyQualityPreset(this.config, quality);
    this.config.target = null;
    this.config.mount = this.surface.canvas;
    this.config.backend = "webgl2";
    this.surface.config = this.config;
    this.surface.resize();
    this.pipeline.invalidate();
    this.hasRenderedStaticFrame = false;
  }

  renderFrame(time = performance.now()) {
    const frameInterval = 1000 / Math.max(1, this.config.frameRate);
    const realtimeSource = sourceNeedsRealtimeUpload(this.source, this.sourceUpdateMode);
    if (this.lastError && time < this.errorRetryTime) {
      return;
    }
    const shouldRender = realtimeSource ||
      !this.hasRenderedStaticFrame ||
      time - this.lastFrameTime >= frameInterval;

    if (shouldRender) {
      this.lastFrameTime = time;
      this.surface.resize();
      try {
        this.pipeline.renderMediaSource(this.source, this.surface, this.config, time, { fit: this.fit });
        this.hasRenderedStaticFrame = true;
        this.lastError = null;
      } catch (error) {
        this.lastError = isTransientFrameError(error) ? null : error;
        this.errorRetryTime = time + 250;
      }
    }
  }

  render(time = performance.now()) {
    this.renderFrame(time);
    if (this.running) {
      this.rafId = window.requestAnimationFrame(this.render);
    }
  }

  getState() {
    return {
      running: this.running,
      backend: "webgl2",
      config: this.config,
      fit: this.fit,
      sourceUpdateMode: this.sourceUpdateMode,
      error: this.lastError ? this.lastError.message : null,
      source: resolveSourceSize(this.source),
      trace: this.pipeline.lastTrace,
      surface: {
        width: this.surface.width,
        height: this.surface.height,
        dpr: this.surface.dpr,
      },
    };
  }
}

export { PHOSPHOR_DEFAULT_CONFIG, createPhosphorConfig } from "./renderer/config.js";
