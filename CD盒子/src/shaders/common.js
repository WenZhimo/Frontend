/**
 * Shared studio lighting. This is an original re-implementation of the lighting
 * ideas described in TECHNICAL.md: a white cyclorama, black flags, strip lights
 * and a few very bright pin-point lamps. It is intentionally procedural so the
 * project needs no HDR environment map.
 */
export const commonGLSL = /* glsl */ `
const float PI = 3.141592653589793;

float saturate(float x) { return clamp(x, 0.0, 1.0); }

float schlick(float cosTheta, float ior) {
  float f0 = (ior - 1.0) / (ior + 1.0);
  f0 *= f0;
  return f0 + (1.0 - f0) * pow(1.0 - saturate(cosTheta), 5.0);
}

float band(float q, float center, float halfWidth, float softness) {
  return 1.0 - smoothstep(halfWidth - softness, halfWidth + softness, abs(q - center));
}

float softBox(vec2 p, vec2 center, vec2 halfSize, float softness) {
  vec2 q = abs(p - center) - halfSize;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-softness, softness, d);
}

float flagBands(float q) {
  float m = band(q, 0.27, 0.07, 0.02);
  m = max(m, band(q, 0.74, 0.12, 0.03));
  m = max(m, band(q, -0.32, 0.08, 0.02));
  m = max(m, band(q, -0.86, 0.14, 0.03));
  return m;
}

float hotBands(float q) {
  return band(q, 0.48, 0.07, 0.02)
       + band(q, 1.08, 0.14, 0.03)
       + band(q, -0.56, 0.08, 0.02)
       + 0.8 * band(q, -1.25, 0.15, 0.03);
}

// Directions are projected onto a virtual wall; this keeps the studio cheap and
// gives the plastic something with sharp, straight edges to refract.
vec3 studioRoom(vec3 dir) {
  dir = normalize(dir);
  vec2 p = dir.xy / max(abs(dir.z), 0.08);
  vec3 dim = vec3(0.018, 0.020, 0.026);
  vec3 c = vec3(0.0);

  if (dir.z < 0.0) {
    c = vec3(0.090, 0.095, 0.105) * (1.0 - 0.5 * smoothstep(0.4, 1.6, length(p)));
    c += vec3(0.72) * (1.0 - smoothstep(0.04, 0.13, length(p)));
    c *= 1.0 - 0.95 * max(flagBands(p.x), flagBands(p.y));
    c += vec3(2.2, 2.45, 2.9) * (hotBands(p.x) + hotBands(p.y));
    return mix(dim, c, smoothstep(0.0, 0.2, -dir.z));
  }

  c = dim * (0.5 + 0.5 * smoothstep(-1.2, 1.6, p.y));
  c += vec3(0.32) * smoothstep(-0.7, 0.8, p.y) * (1.0 - smoothstep(0.5, 1.0, length(p)));
  c += vec3(1.0, 0.99, 0.97) * 20.0 * softBox(p, vec2(-0.86, 0.30), vec2(0.06, 0.85), 0.035);
  c += vec3(0.96, 0.98, 1.00) * 16.0 * softBox(p, vec2(1.06, 0.04), vec2(0.06, 1.15), 0.030);
  c += vec3(1.0) * 10.0 * softBox(p, vec2(0.05, 1.28), vec2(1.25, 0.055), 0.030);
  c += vec3(0.92, 0.94, 0.97) * 2.0 * softBox(p, vec2(0.10, -1.05), vec2(1.15, 0.24), 0.28);
  c *= 1.0 - 0.92 * softBox(p, vec2(-0.20, 0.50), vec2(0.055, 1.4), 0.02);
  c *= 1.0 - 0.85 * softBox(p, vec2(0.62, -0.35), vec2(0.04, 0.9), 0.02);
  return mix(dim, c, smoothstep(0.0, 0.2, dir.z));
}

// The white paper/cyclorama behind the object. A ray that is bent more than a
// few degrees looks past it into the grey studio, which is what makes the clear
// plastic read as thick rather than as a white sheet.
float backdropMask(vec3 dir) {
  dir = normalize(dir);
  vec2 p = dir.xy / max(abs(dir.z), 0.08);
  float lit = 1.0 - smoothstep(0.30, 0.68, length(p * vec2(0.92, 1.0)));
  return dir.z < 0.0 ? lit * smoothstep(0.0, 0.2, -dir.z) : 0.0;
}

vec3 studio(vec3 dir) {
  return mix(studioRoom(dir), vec3(1.0), backdropMask(dir));
}

vec3 studioGlare(vec3 dir) {
  return max(studio(dir) - vec3(0.45), 0.0);
}

// A few point lights, used only for the sparkle channel and for the disc's
// diffraction spokes.
const vec3 KEY_LIGHT  = vec3(-0.625, 0.218, 0.750);
const vec3 STRIP_LIGHT = vec3(0.725, 0.028, 0.688);
const vec3 TOP_LIGHT   = vec3(0.031, 0.786, 0.618);
const vec3 BOUNCE_LIGHT = vec3(0.069, -0.722, 0.688);

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

export const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
