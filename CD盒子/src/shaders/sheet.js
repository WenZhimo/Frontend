import { commonGLSL } from './common.js';

export const sheetVertex = /* glsl */ `
attribute float aThick;
varying vec3 vPos;
varying vec3 vNormal;
varying float vThick;

void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vPos = viewPos.xyz;
  vNormal = normalize(normalMatrix * normal);
  vThick = aThick * length(modelViewMatrix[0].xyz);
  gl_Position = projectionMatrix * viewPos;
}
`;

export const sheetFragment = /* glsl */ `
uniform samplerCube uRoom;
uniform float uIor;
uniform float uFade;
uniform float uTint;
uniform vec3 uAbsorb;

varying vec3 vPos;
varying vec3 vNormal;
varying float vThick;

${commonGLSL}

vec4 roomSample(vec3 dir, vec3 dx, vec3 dy) {
  float footprint = min(max(length(dx), length(dy)), 0.6);
  float lod = log2(max(footprint * 512.0 * 0.5, 1.0));
  return textureLod(uRoom, normalize(dir), lod);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPos);
  if (dot(N, V) < 0.0) N = -N;

  float cosv = abs(dot(N, V));
  float F = schlick(cosv, uIor);
  float F0 = schlick(1.0, uIor);
  float Fall = F + (1.0 - F) * (1.0 - F) * F;
  float Fall0 = F0 + (1.0 - F0) * (1.0 - F0) * F0;
  float cosT = sqrt(max(1.0 - (1.0 - cosv * cosv) / (uIor * uIor), 0.0));
  float absorbed = 1.0 - exp(-dot(uAbsorb, vec3(0.3333)) * vThick / max(cosT, 0.2));

  float takes = clamp(max(Fall - Fall0, 0.0) + Fall0 * 0.05 + absorbed * 0.5, 0.0, 1.0);
  vec3 R = reflect(-V, N);
  vec4 env = roomSample(R, dFdx(R), dFdy(R));
  vec3 refl = min(studioGlare(R) * Fall * 0.25, vec3(0.1))
            + min(env.rgb, vec3(1.2)) * max(Fall - Fall0, 0.0);
  vec3 tint = vec3(0.86, 0.90, 0.93) * (1.0 - cosv) * uTint;

  gl_FragColor = vec4((refl + tint * 0.03) * uFade, takes * uFade);
}
`;
