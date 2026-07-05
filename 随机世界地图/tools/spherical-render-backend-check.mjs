import { createWorld } from "../src/sim/world.js";
import { createRenderBackend } from "../src/render/renderBackend.js";
import { GpuRecommendedMode } from "../src/gpu/capability.js";

const capabilities = {
  secureContext: false,
  webgpuAvailable: false,
  webgl2Available: true,
  recommendedMode: GpuRecommendedMode.WEBGL_RENDER_AVAILABLE,
  reason: "Synthetic WebGL2 capability for render backend regression.",
};

const canvas = createFakeCanvas();
const backend = createRenderBackend(canvas, {
  gpuCapabilities: capabilities,
  experimentalGpuRender: true,
});
const defaultCanvas = createFakeCanvas();
const defaultBackend = createRenderBackend(defaultCanvas, {
  gpuCapabilities: capabilities,
});

const sphericalWorld = createWorld({
  seedText: "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: "256x128",
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  productionTopologyMode: "cubed-sphere-adapter",
  projectionMode: "equirectangular",
  faceSize: 16,
  renderWidth: 128,
  renderHeight: 64,
  showBoundaries: false,
});

backend.render(sphericalWorld);
const drawCallsAfterSpherical = canvas.gl.drawCalls;

const rectangularWorld = createWorld({
  seedText: "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: "64x32",
  pipelineMode: "geology-v2",
  topologyMode: "cylindrical",
  showBoundaries: false,
});

backend.render(rectangularWorld);

const defaultRectangularWorld = createWorld({
  seedText: "榫欓娴?绾厓7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: "64x32",
  pipelineMode: "geology-v2",
  topologyMode: "cylindrical",
  showBoundaries: false,
});

defaultBackend.render(defaultRectangularWorld);

const checks = {
  defaultBackendCreatedAsCpu: defaultBackend.kind === "cpu-canvas",
  defaultRectangularUsesCpu: defaultRectangularWorld.renderBackend === "cpu-canvas",
  defaultDidNotDrawWebgl: defaultCanvas.gl.drawCalls === 0,
  defaultExplainsGpuDisabled: /disabled/i.test(defaultRectangularWorld.renderFallbackReason ?? ""),
  backendCreatedAsWebgl: backend.kind === "webgl2-render-experimental",
  sphericalUsesCpuProjection: sphericalWorld.renderBackend === "cpu-spherical-projection",
  sphericalExplainsGpuSkip: /spherical grids/i.test(sphericalWorld.renderFallbackReason ?? ""),
  sphericalDidNotDrawWebgl: drawCallsAfterSpherical === 0,
  rectangularUsesWebgl: rectangularWorld.renderBackend === "webgl2-render-experimental",
  rectangularDrewWebgl: canvas.gl.drawCalls > drawCallsAfterSpherical,
};

const failures = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

const result = {
  valid: failures.length === 0,
  failures,
  checks,
  defaultBackendKind: defaultBackend.kind,
  defaultRectangularRenderBackend: defaultRectangularWorld.renderBackend,
  defaultFallbackReason: defaultRectangularWorld.renderFallbackReason,
  backendKind: backend.kind,
  sphericalRenderBackend: sphericalWorld.renderBackend,
  sphericalFallbackReason: sphericalWorld.renderFallbackReason,
  rectangularRenderBackend: rectangularWorld.renderBackend,
  defaultWebglDrawCalls: defaultCanvas.gl.drawCalls,
  webglDrawCalls: canvas.gl.drawCalls,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createFakeCanvas() {
  const gl = createFakeWebGl2Context();
  const ctx2d = createFakeCanvas2dContext();
  return {
    width: 0,
    height: 0,
    gl,
    getContext(kind) {
      if (kind === "webgl2") return gl;
      if (kind === "2d") return ctx2d;
      return null;
    },
  };
}

function createFakeCanvas2dContext() {
  return {
    createImageData(width, height) {
      return {
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      };
    },
    putImageData() {},
  };
}

function createFakeWebGl2Context() {
  let nextId = 1;
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    UNPACK_ALIGNMENT: 0x0cf5,
    R32F: 0x822e,
    RED: 0x1903,
    FLOAT: 0x1406,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TRIANGLES: 0x0004,
    drawCalls: 0,
    createTexture: () => ({ id: nextId++ }),
    createVertexArray: () => ({ id: nextId++ }),
    createShader: (type) => ({ id: nextId++, type }),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    createProgram: () => ({ id: nextId++ }),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getUniformLocation: (_program, name) => ({ name }),
    bindTexture() {},
    texParameteri() {},
    bindVertexArray() {},
    viewport() {},
    useProgram() {},
    activeTexture() {},
    pixelStorei() {},
    texSubImage2D() {},
    uniform1i() {},
    uniform1f() {},
    texImage2D() {},
    drawArrays() {
      this.drawCalls += 1;
    },
  };
  return gl;
}
