import { BoundaryType } from "../sim/tectonics.js";
import { boundaryOverlayStrength } from "./cpuMapRenderer.js";

const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 POSITIONS[6] = vec2[6](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0, -1.0),
  vec2( 1.0,  1.0)
);
out vec2 vUv;
void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uElevation;
uniform sampler2D uBoundaryOverlay;
uniform float uSeaLevel;
in vec2 vUv;
out vec4 outColor;

vec3 lerpColor(vec3 a, vec3 b, float t) {
  return mix(a, b, clamp(t, 0.0, 1.0));
}

vec3 colorForElevation(float h) {
  if (h < -0.22) return vec3(7.0, 35.0, 65.0) / 255.0;
  if (h < -0.08) return lerpColor(vec3(11.0, 53.0, 94.0) / 255.0, vec3(31.0, 105.0, 143.0) / 255.0, (h + 0.22) / 0.14);
  if (h < 0.0) return lerpColor(vec3(39.0, 116.0, 145.0) / 255.0, vec3(86.0, 157.0, 164.0) / 255.0, (h + 0.08) / 0.08);
  if (h < 0.12) return lerpColor(vec3(86.0, 132.0, 72.0) / 255.0, vec3(143.0, 163.0, 88.0) / 255.0, h / 0.12);
  if (h < 0.32) return lerpColor(vec3(136.0, 123.0, 77.0) / 255.0, vec3(126.0, 91.0, 62.0) / 255.0, (h - 0.12) / 0.2);
  if (h < 0.56) return lerpColor(vec3(116.0, 94.0, 79.0) / 255.0, vec3(188.0, 182.0, 163.0) / 255.0, (h - 0.32) / 0.24);
  return vec3(236.0, 240.0, 229.0) / 255.0;
}

void main() {
  vec2 texCoord = vec2(vUv.x, 1.0 - vUv.y);
  float elevation = texture(uElevation, texCoord).r;
  vec3 baseColor = colorForElevation(elevation - uSeaLevel);
  vec4 boundaryOverlay = texture(uBoundaryOverlay, texCoord);
  outColor = vec4(mix(baseColor, boundaryOverlay.rgb, boundaryOverlay.a), 1.0);
}`;

export function createExperimentalWebGlMapRenderer(canvas) {
  const gl = getWebGl2Context(canvas);
  if (!gl) {
    return { ok: false, reason: "WebGL2 is not available for this canvas." };
  }

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) {
    return { ok: false, reason: "WebGL2 render shader could not be compiled." };
  }

  const texture = gl.createTexture();
  const boundaryTexture = gl.createTexture();
  const vao = gl.createVertexArray();
  const elevationLocation = gl.getUniformLocation(program, "uElevation");
  const boundaryOverlayLocation = gl.getUniformLocation(program, "uBoundaryOverlay");
  const seaLevelLocation = gl.getUniformLocation(program, "uSeaLevel");
  let width = 0;
  let height = 0;
  let elevationUpload = null;
  let boundaryUpload = null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_2D, boundaryTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  function render(world) {
    const { grid } = world;
    ensureSize(grid.width, grid.height);
    elevationUpload.set(grid.elev);
    writeBoundaryOverlay(world, boundaryUpload);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, elevationUpload);
    gl.uniform1i(elevationLocation, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, boundaryTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, boundaryUpload);
    gl.uniform1i(boundaryOverlayLocation, 1);
    gl.uniform1f(seaLevelLocation, world.seaLevel);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    world.renderBackend = "webgl2-render-experimental";
    world.renderFallbackReason = null;
  }

  function ensureSize(nextWidth, nextHeight) {
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    elevationUpload = new Float32Array(width * height);
    boundaryUpload = new Uint8Array(width * height * 4);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, elevationUpload);
    gl.bindTexture(gl.TEXTURE_2D, boundaryTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, boundaryUpload);
  }

  return {
    ok: true,
    renderer: {
      kind: "webgl2-render-experimental",
      fallbackReason: null,
      render,
    },
  };
}

function writeBoundaryOverlay(world, upload) {
  upload.fill(0);
  if (world.params.showBoundaries === false) return;
  const { grid } = world;
  const { btype, activeBoundary } = grid;
  for (let i = 0; i < grid.size; i += 1) {
    if (btype[i] === BoundaryType.INTERIOR || !activeBoundary[i]) continue;
    const overlayStrength = boundaryOverlayStrength(grid, i);
    if (overlayStrength <= 0) continue;
    const offset = i * 4;
    if (btype[i] === BoundaryType.CONVERGENT) {
      writeOverlayPixel(upload, offset, 231, 86, 66, 0.55 * overlayStrength);
    } else if (btype[i] === BoundaryType.DIVERGENT) {
      writeOverlayPixel(upload, offset, 77, 195, 215, 0.5 * overlayStrength);
    } else {
      writeOverlayPixel(upload, offset, 236, 196, 83, 0.46 * overlayStrength);
    }
  }
}

function writeOverlayPixel(upload, offset, r, g, b, alpha) {
  upload[offset] = r;
  upload[offset + 1] = g;
  upload[offset + 2] = b;
  upload[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
}

function getWebGl2Context(canvas) {
  try {
    return canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  } catch {
    return null;
  }
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return null;
  }
  return shader;
}
