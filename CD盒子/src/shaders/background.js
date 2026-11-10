import { commonGLSL } from './common.js';

export const backgroundVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const backgroundFragment = /* glsl */ `
uniform vec3 uLight;
uniform mat4 uTrayInv;
uniform mat4 uLidInv;
uniform float uDiscDark;
uniform float uFade;

varying vec3 vWorld;

${commonGLSL}

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Ray from the paper toward the light, intersected with a plane of the case in
// the case's own frame. Returns (local xy, distance).
vec3 planeHit(mat4 invMat, vec3 origin, vec3 dir, float zPlane) {
  vec3 o = (invMat * vec4(origin, 1.0)).xyz;
  vec3 d = mat3(invMat) * dir;
  if (abs(d.z) < 1e-4) return vec3(1e4, 1e4, -1.0);
  float t = (zPlane - o.z) / d.z;
  if (t <= 0.0) return vec3(1e4, 1e4, -1.0);
  return vec3((o + d * t).xy, t);
}

void main() {
  vec3 world = vWorld;
  float lit = 1.0;

  // Tray body.
  vec3 hit = planeHit(uTrayInv, world, uLight, -2.0);
  if (hit.z > 0.0) {
    float soft = 0.85 + hit.z * 0.06;
    float d = roundedBox(hit.xy, vec2(73.0), 8.0);
    float cover = 1.0 - smoothstep(-soft, soft, d);
    float rail = cover * smoothstep(-14.0 - soft, -9.0 + soft, d);
    lit *= 1.0 - (0.020 * cover + 0.075 * rail) * uFade;
  }

  // Disc.
  hit = planeHit(uTrayInv, world, uLight, -1.8);
  if (hit.z > 0.0) {
    float soft = 0.85 + hit.z * 0.06;
    float r = length(hit.xy);
    float cover = (1.0 - smoothstep(60.0 - soft, 60.0 + soft, r))
                * smoothstep(7.5 - soft, 7.5 + soft, r);
    lit *= 1.0 - uDiscDark * cover * uFade;
  }

  // Lid, wherever it has swung to.
  hit = planeHit(uLidInv, world, uLight, 4.0);
  if (hit.z > 0.0) {
    float soft = 0.85 + hit.z * 0.06;
    float d = roundedBox(hit.xy, vec2(73.0), 8.0);
    float cover = 1.0 - smoothstep(-soft, soft, d);
    float rim = cover * smoothstep(-5.0 - soft, -1.0 + soft, d);
    lit *= 1.0 - (0.026 * cover + 0.045 * rim) * uFade;
  }

  gl_FragColor = vec4(vec3(lit), 0.0);
}
`;
