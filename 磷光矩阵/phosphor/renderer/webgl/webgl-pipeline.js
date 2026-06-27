import { SourceSampler } from "../source-sampler.js";
import {
  bindFullscreenAttribute,
  bindTextureUnit,
  createFramebuffer,
  createFullscreenGeometry,
  createProgram,
  createTexture,
  resizeTexture,
  setTextureImage,
  setUniforms,
} from "./gl-utils.js";
import {
  BLOOM_FRAGMENT_SHADER,
  COMPOSE_FRAGMENT_SHADER,
  FULLSCREEN_VERTEX_SHADER,
  MATRIX_EMISSION_FRAGMENT_SHADER,
} from "./shader-sources.js";

function normalizeColor(color) {
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

export class WebGLPhosphorPipeline {
  static isSupported() {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    if (!gl) return false;
    const loseContext = gl.getExtension("WEBGL_lose_context");
    if (loseContext) loseContext.loseContext();
    return true;
  }

  constructor(surface, config) {
    this.surface = surface;
    this.config = config;
    this.sourceSampler = new SourceSampler();
    this.gl = surface.canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    if (!this.gl) throw new Error("WebGL2 is not available.");
    this.lastTrace = null;
    this.lastSourceTime = -Infinity;
    this.lastSourceSize = "";
    this.sourceFrame = null;
    this.init();
    this.resize();
  }

  init() {
    const gl = this.gl;
    this.geometry = createFullscreenGeometry(gl);
    this.matrixProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, MATRIX_EMISSION_FRAGMENT_SHADER);
    this.bloomProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, BLOOM_FRAGMENT_SHADER);
    this.composeProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, COMPOSE_FRAGMENT_SHADER);
    [this.matrixProgram, this.bloomProgram, this.composeProgram].forEach((program) => {
      bindFullscreenAttribute(gl, program, this.geometry);
    });
    this.sourceTexture = createTexture(gl, 1, 1, { filter: gl.LINEAR });
    this.emissionTexture = createTexture(gl, 1, 1, { filter: gl.LINEAR });
    this.bloomATexture = createTexture(gl, 1, 1, { filter: gl.LINEAR });
    this.bloomBTexture = createTexture(gl, 1, 1, { filter: gl.LINEAR });
    this.emissionFramebuffer = createFramebuffer(gl, this.emissionTexture);
    this.bloomAFramebuffer = createFramebuffer(gl, this.bloomATexture);
    this.bloomBFramebuffer = createFramebuffer(gl, this.bloomBTexture);
  }

  resize() {
    const gl = this.gl;
    const width = this.surface.width;
    const height = this.surface.height;
    const bloomScale = this.config.quality === "high" ? 0.5 : this.config.quality === "low" ? 0.28 : 0.38;
    this.width = width;
    this.height = height;
    this.bloomWidth = Math.max(1, Math.round(width * bloomScale));
    this.bloomHeight = Math.max(1, Math.round(height * bloomScale));
    gl.viewport(0, 0, width, height);
    resizeTexture(gl, this.emissionTexture, width, height);
    resizeTexture(gl, this.bloomATexture, this.bloomWidth, this.bloomHeight);
    resizeTexture(gl, this.bloomBTexture, this.bloomWidth, this.bloomHeight);
  }

  invalidate() {
    this.lastSourceTime = -Infinity;
    this.lastSourceSize = "";
  }

  render(_ctx, target, surface, config, time) {
    this.surface = surface;
    this.config = config;
    if (this.width !== surface.width || this.height !== surface.height) this.resize();

    const sourceSize = `${surface.width}x${surface.height}@${config.sourceScale}`;
    if (!this.sourceFrame || this.lastSourceSize !== sourceSize || time - this.lastSourceTime >= config.sourceFrameInterval) {
      this.sourceFrame = this.sampleSourceFrame(target, surface, config, time);
      setTextureImage(this.gl, this.sourceTexture, this.sourceFrame.canvas);
      this.lastSourceTime = time;
      this.lastSourceSize = sourceSize;
    }

    this.renderMatrixEmission(config);
    this.renderBloom(config);
    this.renderCompose(config, time);

    this.lastTrace = {
      backend: "webgl2",
      sourceFrame: this.sourceFrame,
      modules: [
        "SourceSampler",
        "SourceTexture",
        "MatrixQuantizationPass",
        "PhosphorEmissionPass",
        "BloomDownsampleUpsamplePass",
        "LensDiffusionComposePass",
      ],
      uniforms: {
        matrixPitch: config.matrixPitch,
        bloomStrength: config.bloomStrength,
        quality: config.quality,
        sourceScale: config.sourceScale,
      },
    };
    return this.lastTrace;
  }

  sampleSourceFrame(target, surface, config, time) {
    const sourceScale = Math.min(1, Math.max(0.25, config.sourceScale || 1));
    if (sourceScale >= 0.99) return this.sourceSampler.sample(target, surface, config, time);
    const sourceSurface = {
      ...surface,
      width: Math.max(1, Math.round(surface.width * sourceScale)),
      height: Math.max(1, Math.round(surface.height * sourceScale)),
      dpr: surface.dpr * sourceScale,
    };
    return this.sourceSampler.sample(target, sourceSurface, config, time);
  }

  renderMatrixEmission(config) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.emissionFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.matrixProgram);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bindTextureUnit(gl, 0, this.sourceTexture);
    setUniforms(gl, this.matrixProgram, {
      u_source: { unit: 0 },
      u_resolution: [this.width, this.height],
      u_matrixPitch: config.matrixPitch * this.surface.dpr,
      u_cellFillRatio: config.cellFillRatio,
      u_threshold: config.threshold,
      u_brightness: config.brightness,
      u_contrast: config.contrast,
      u_coreIntensity: config.coreIntensity,
      u_coreColor: normalizeColor(config.phosphorPalette.core),
      u_hotColor: normalizeColor(config.phosphorPalette.hot),
      u_glowColor: normalizeColor(config.phosphorPalette.glow),
    });
    gl.bindVertexArray(this.geometry.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  renderBloom(config) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomAFramebuffer);
    gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
    gl.useProgram(this.bloomProgram);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bindTextureUnit(gl, 0, this.emissionTexture);
    setUniforms(gl, this.bloomProgram, {
      u_texture: { unit: 0 },
      u_texel: [1 / this.width, 1 / this.height],
      u_radius: config.bloomRadius,
      u_strength: config.bloomStrength * 0.72,
      u_glowColor: normalizeColor(config.phosphorPalette.glow),
    });
    gl.bindVertexArray(this.geometry.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomBFramebuffer);
    gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bindTextureUnit(gl, 0, this.bloomATexture);
    setUniforms(gl, this.bloomProgram, {
      u_texture: { unit: 0 },
      u_texel: [1 / this.bloomWidth, 1 / this.bloomHeight],
      u_radius: config.bloomRadius * 1.8,
      u_strength: config.bloomStrength * 0.82,
      u_glowColor: normalizeColor(config.phosphorPalette.outer),
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  renderCompose(config, time) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.composeProgram);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bindTextureUnit(gl, 0, this.emissionTexture);
    bindTextureUnit(gl, 1, this.bloomATexture);
    bindTextureUnit(gl, 2, this.bloomBTexture);
    setUniforms(gl, this.composeProgram, {
      u_emission: { unit: 0 },
      u_bloomA: { unit: 1 },
      u_bloomB: { unit: 2 },
      u_resolution: [this.width, this.height],
      u_time: time,
      u_matrixPitch: config.matrixPitch * this.surface.dpr,
      u_noiseAmount: config.noiseAmount,
      u_vignetteStrength: config.vignetteStrength,
      u_diffusionStrength: config.diffusionStrength,
      u_flickerAmount: config.flickerAmount,
      u_opacity: config.opacity,
      u_blackColor: normalizeColor(config.phosphorPalette.black),
    });
    gl.bindVertexArray(this.geometry.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy() {
    const gl = this.gl;
    [
      this.sourceTexture,
      this.emissionTexture,
      this.bloomATexture,
      this.bloomBTexture,
    ].forEach((texture) => texture && gl.deleteTexture(texture));
    [
      this.emissionFramebuffer,
      this.bloomAFramebuffer,
      this.bloomBFramebuffer,
    ].forEach((framebuffer) => framebuffer && gl.deleteFramebuffer(framebuffer));
    [
      this.matrixProgram,
      this.bloomProgram,
      this.composeProgram,
    ].forEach((program) => program && gl.deleteProgram(program));
    if (this.geometry?.buffer) gl.deleteBuffer(this.geometry.buffer);
    if (this.geometry?.vao) gl.deleteVertexArray(this.geometry.vao);
  }
}
