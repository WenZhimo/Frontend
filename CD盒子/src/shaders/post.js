import { commonGLSL, fullscreenVertex } from './common.js';

export const starVertex = fullscreenVertex;

export const starExtractFragment = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;

float sparkAt(vec2 uv) {
  return max(texture2D(uScene, uv).a - 2.0, 0.0);
}

void main() {
  float centre = sparkAt(vUv);

  float peak = 0.0;
  float ring = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.7853981634;
    vec2 dir = vec2(cos(a), sin(a));
    peak = max(peak, sparkAt(vUv + dir * uTexel * 1.42));
    ring += sparkAt(vUv + dir * uTexel * 4.0);
  }

  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  if (centre <= uThreshold || centre < peak) return;

  float seed = max(centre - ring * 0.25 - uThreshold, 0.0);
  vec3 tint = mix(vec3(1.0), vec3(0.45, 0.72, 1.0), 0.45);
  gl_FragColor = vec4(tint * min(seed, 8.0), 1.0);
}
`;

export const blurFragment = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uFalloff;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float total = 1.0;
  for (int i = 1; i <= 8; i++) {
    float w = pow(uFalloff, float(i));
    c += (texture2D(uTex, vUv + uStep * float(i)).rgb
        + texture2D(uTex, vUv - uStep * float(i)).rgb) * w;
    total += 2.0 * w;
  }
  gl_FragColor = vec4(c / total * 3.0, 1.0);
}
`;

export const finalFragment = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uStars;
uniform float uStarStrength;
varying vec2 vUv;

${commonGLSL}

void main() {
  vec3 c = texture2D(uScene, vUv).rgb;
  vec3 stars = texture2D(uStars, vUv).rgb * uStarStrength;

  // On a white page an additive highlight cannot be brighter than white, so the
  // star tints the paper cool before adding its hot core.
  float k = clamp(dot(stars, vec3(0.3333)), 0.0, 1.0);
  c = mix(c, vec3(0.42, 0.62, 1.0), k * 0.60) + stars * vec3(0.80, 0.90, 1.0) * 0.5;

  gl_FragColor = vec4(toSRGB(c), 1.0);
}
`;
