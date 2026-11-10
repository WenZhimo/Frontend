import { commonGLSL } from './common.js';

export const roomFragment = /* glsl */ `
uniform int uFace;
uniform float uSize;

${commonGLSL}

vec3 lamp(vec2 p, vec2 at, float radius, vec3 color) {
  return color * (1.0 - smoothstep(radius * 0.5, radius, length(p - at)));
}

vec3 pinLights(vec3 dir) {
  dir = normalize(dir);
  vec2 p = dir.xy / max(abs(dir.z), 0.08);
  vec3 c = vec3(0.0);
  if (dir.z > 0.0) {
    c += lamp(p, vec2(-0.42, 0.98), 0.010, vec3(1.00, 1.10, 1.27));
    c += lamp(p, vec2( 0.62, 0.72), 0.010, vec3(0.85, 0.96, 1.10));
    c += lamp(p, vec2(-0.95, -0.50), 0.010, vec3(0.75, 0.85, 1.00));
    c += lamp(p, vec2( 0.85, -0.70), 0.010, vec3(0.75, 0.85, 1.00));
    return c * smoothstep(0.0, 0.2, dir.z) * 9000.0;
  }
  c += lamp(p, vec2(-0.62, 0.58), 0.010, vec3(0.15, 0.17, 0.20));
  c += lamp(p, vec2( 0.66, -0.60), 0.010, vec3(0.15, 0.17, 0.20));
  return c * smoothstep(0.0, 0.2, -dir.z) * 9000.0;
}

vec3 faceDirection(int face, vec2 st) {
  vec2 c = st * 2.0 - 1.0;
  if (face == 0) return vec3( 1.0, -c.y, -c.x);
  if (face == 1) return vec3(-1.0, -c.y,  c.x);
  if (face == 2) return vec3( c.x,  1.0,  c.y);
  if (face == 3) return vec3( c.x, -1.0, -c.y);
  if (face == 4) return vec3( c.x, -c.y,  1.0);
  return vec3(-c.x, -c.y, -1.0);
}

void main() {
  const int N = 4;
  vec4 sum = vec4(0.0);
  for (int y = 0; y < N; y++) {
    for (int x = 0; x < N; x++) {
      vec2 st = (gl_FragCoord.xy + (vec2(float(x), float(y)) + 0.5) / float(N) - 0.5) / uSize;
      vec3 dir = normalize(faceDirection(uFace, st));
      vec3 pins = pinLights(dir);
      sum += vec4(studioRoom(dir) + pins, dot(pins, vec3(0.3333)));
    }
  }
  gl_FragColor = sum / float(N * N);
}
`;
