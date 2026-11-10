import { commonGLSL } from './common.js';

export const rodVertex = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aSide;
attribute vec2 aHalf;
attribute float aRadius;
attribute float aCap;

varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vCenter;
varying vec3 vSide;
varying vec3 vAxis;
varying vec2 vHalf;
varying float vRadius;
varying float vCap;

void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vPos = viewPos.xyz;
  vNormal = normalize(normalMatrix * normal);
  vCenter = (modelViewMatrix * vec4(aCenter, 1.0)).xyz;
  vSide = normalize(mat3(modelViewMatrix) * vec3(aSide, 0.0));
  vAxis = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0));

  float s = length(modelViewMatrix[0].xyz);
  vHalf = aHalf * s;
  vRadius = aRadius * s;
  vCap = aCap;
  gl_Position = projectionMatrix * viewPos;
}
`;

export const rodFragment = /* glsl */ `
uniform sampler2D uBehind;
uniform samplerCube uRoom;
uniform mat4 uProjection;
uniform float uIor;
uniform float uFade;
uniform float uDepth;
uniform vec3 uAbsorb;

varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vCenter;
varying vec3 vSide;
varying vec3 vAxis;
varying vec2 vHalf;
varying float vRadius;
varying float vCap;

${commonGLSL}

vec4 roomSample(vec3 dir, vec3 dx, vec3 dy) {
  float footprint = min(max(length(dx), length(dy)), 0.6);
  float lod = log2(max(footprint * 512.0 * 0.5, 1.0));
  return textureLod(uRoom, normalize(dir), lod);
}

vec2 projectToScreen(vec3 viewPos) {
  vec4 clip = uProjection * vec4(viewPos, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}

vec3 sampleBehind(vec3 viewPos) {
  return textureLod(uBehind, clamp(projectToScreen(viewPos), 0.001, 0.999), 0.0).rgb;
}

// The ray leaves the plastic (or looks through it) and finds either the studio
// cube or the already-rendered page/disc. The latter is a screen-space
// approximation: it is only used for rays close to the line of sight.
vec4 surroundRadiance(vec3 pos, vec3 dir, vec3 dx, vec3 dy) {
  vec4 env = roomSample(dir, dx, dy);
  if (dir.z > -0.05) return env;

  float spread = min(length(dx) + length(dy), 0.3);
  float bend = acos(clamp(dot(dir, normalize(pos)), -1.0, 1.0));
  float w = 1.0 - smoothstep(0.04 - spread, 0.16 + spread, bend);
  vec2 uv = projectToScreen(pos + dir * uDepth);
  w *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  if (w <= 0.0) return env;

  vec4 seen = textureLod(uBehind, clamp(uv, 0.001, 0.999), 0.0);
  float matter = clamp(seen.a, 0.0, 1.0);
  vec3 page = mix(env.rgb, seen.rgb, 0.25);
  vec3 col = mix(env.rgb, mix(page, seen.rgb, matter), w);
  return vec4(col, env.a * (1.0 - w));
}

// Intersect a 2D ray (q,d) with a rounded rectangle of half size b and corner
// radius r. Returns (distance, outward normal). This is what lets the shader
// treat a swept rod as an optical cross-section instead of a triangle soup.
vec3 roundedExit(vec2 q, vec2 d, vec2 b, float r) {
  vec2 wall = vec2(1e5);
  if (abs(d.x) > 1e-5) wall.x = (sign(d.x) * b.x - q.x) / d.x;
  if (abs(d.y) > 1e-5) wall.y = (sign(d.y) * b.y - q.y) / d.y;
  float t = max(min(wall.x, wall.y), 0.0);
  vec2 hit = q + d * t;
  vec2 inner = max(b - r, vec2(0.0));

  if (r > 1e-4 && abs(hit.x) > inner.x && abs(hit.y) > inner.y) {
    vec2 c = sign(hit) * inner;
    vec2 oc = q - c;
    float A = dot(d, d);
    float B = dot(oc, d);
    float C = dot(oc, oc) - r * r;
    float tc = (-B + sqrt(max(B * B - A * C, 0.0))) / max(A, 1e-6);
    return vec3(tc, normalize(q + d * tc - c));
  }

  vec2 n = wall.x < wall.y ? vec2(sign(d.x), 0.0) : vec2(0.0, sign(d.y));
  return vec3(t, n);
}

// Trace a view ray through the rounded rectangular cross-section. Up to three
// exits are followed; the remainder is treated as a dim leak, which is enough
// for a jewel case and much cheaper than a full path tracer.
vec4 traceRod(vec3 P, vec3 N, vec3 I, float spread) {
  vec3 dir = refract(I, N, 1.0 / uIor);
  if (dot(dir, dir) < 1e-6) dir = reflect(I, N);

  vec3 pos = P - N * 0.002;
  vec2 b = max(vHalf, vec2(0.001));
  float r = max(vRadius, 0.001);
  vec3 acc = vec3(0.0);
  float spark = 0.0;
  float path = 0.0;
  float alive = 1.0;

  for (int i = 0; i < 3; i++) {
    vec3 rel = pos - vCenter;
    vec2 q = clamp(vec2(dot(rel, vSide), dot(rel, vAxis)), -b, b);
    vec2 d2 = vec2(dot(dir, vSide), dot(dir, vAxis));

    float t = 200.0;
    vec3 Ne = normalize(vAxis);
    if (dot(d2, d2) > 1e-6) {
      vec3 hit = roundedExit(q, d2, b, r);
      t = clamp(hit.x, 0.0, 200.0);
      Ne = normalize(vSide * hit.y + vAxis * hit.z);
    }

    pos += dir * t;
    path += t;

    vec3 outDir = refract(dir, -Ne, uIor);
    bool trapped = dot(outDir, outDir) < 1e-6;
    float F = trapped ? 1.0 : schlick(abs(dot(outDir, Ne)), uIor);
    vec3 way = trapped ? normalize(dir - Ne * dot(dir, Ne)) : outDir;

    vec3 wx = dFdx(way) * spread;
    vec3 wy = dFdy(way) * spread;
    vec4 seen = surroundRadiance(pos, way, wx, wy);
    float absorb = dot(uAbsorb, vec3(0.3333));
    float weight = alive * (1.0 - F) * exp(-absorb * path);
    acc += weight * seen.rgb;
    spark += dot(vec3(weight), vec3(seen.a));

    alive *= F;
    dir = reflect(dir, Ne);
  }

  float absorb = dot(uAbsorb, vec3(0.3333));
  vec3 leak = roomSample(dir, dFdx(dir) * spread, dFdy(dir) * spread).rgb;
  acc += alive * exp(-absorb * path) * 0.55 * leak;
  return vec4(acc, spark);
}

void main() {
  vec3 V = normalize(-vPos);
  vec3 I = -V;
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;

  float F = schlick(max(dot(N, V), 0.0), uIor);
  vec3 R = reflect(I, N);
  vec4 mirror = roomSample(R, dFdx(R), dFdy(R));
  float spark = mirror.a * F;

  vec3 through;
  if (vCap > 0.5) {
    through = surroundRadiance(vPos, I, dFdx(I), dFdy(I)).rgb * 0.86;
  } else {
    vec4 inside = traceRod(vPos, N, I, 1.0);
    through = inside.rgb;
    spark += inside.a * (1.0 - F);
  }

  vec3 col = mirror.rgb * F + through * (1.0 - F);
  col = mix(sampleBehind(vPos), col, uFade);
  gl_FragColor = vec4(col, 2.0 + spark * uFade);
}
`;
