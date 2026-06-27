export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const MATRIX_EMISSION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform vec2 u_resolution;
uniform float u_matrixPitch;
uniform float u_cellFillRatio;
uniform float u_threshold;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_coreIntensity;
uniform vec3 u_coreColor;
uniform vec3 u_hotColor;
uniform vec3 u_glowColor;

in vec2 v_uv;
out vec4 outColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 pixel = v_uv * u_resolution;
  vec2 cell = floor(pixel / u_matrixPitch);
  vec2 cellOrigin = cell * u_matrixPitch;
  vec2 local = (pixel - cellOrigin) / u_matrixPitch;
  vec2 centerDelta = abs(local - 0.5);
  float squareDistance = max(centerDelta.x, centerDelta.y);
  float cellHalf = u_cellFillRatio * 0.5;
  float bodyMask = smoothstep(cellHalf + 0.02, cellHalf - 0.02, squareDistance);
  float glowMask = smoothstep(0.86, 0.18, length(local - 0.5));

  vec2 sampleUv = (cellOrigin + vec2(0.5) * u_matrixPitch) / u_resolution;
  vec3 source = texture(u_source, sampleUv).rgb;
  float energy = max(0.0, (luminance(source) - u_threshold) * u_contrast);
  energy = pow(clamp(energy, 0.0, 1.0), 0.78) * u_brightness;

  float hot = pow(clamp(energy, 0.0, 1.0), 1.55);
  vec3 bodyColor = mix(u_hotColor, u_coreColor, hot);
  float coreMask = smoothstep(0.18, 0.02, length(local - 0.5));
  vec3 glow = u_glowColor * energy * glowMask * 0.5;
  vec3 body = bodyColor * energy * bodyMask * 0.92;
  vec3 core = u_coreColor * max(0.0, energy - 0.34) * coreMask * u_coreIntensity;
  vec3 color = glow + body + core;

  outColor = vec4(color, clamp(max(max(color.r, color.g), color.b), 0.0, 1.0));
}
`;

export const BLOOM_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_strength;
uniform vec3 u_glowColor;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec4 sum = vec4(0.0);
  sum += texture(u_texture, v_uv) * 0.18;
  sum += texture(u_texture, v_uv + vec2( u_texel.x, 0.0) * u_radius) * 0.12;
  sum += texture(u_texture, v_uv + vec2(-u_texel.x, 0.0) * u_radius) * 0.12;
  sum += texture(u_texture, v_uv + vec2(0.0,  u_texel.y) * u_radius) * 0.12;
  sum += texture(u_texture, v_uv + vec2(0.0, -u_texel.y) * u_radius) * 0.12;
  sum += texture(u_texture, v_uv + vec2( u_texel.x,  u_texel.y) * u_radius * 0.72) * 0.085;
  sum += texture(u_texture, v_uv + vec2(-u_texel.x,  u_texel.y) * u_radius * 0.72) * 0.085;
  sum += texture(u_texture, v_uv + vec2( u_texel.x, -u_texel.y) * u_radius * 0.72) * 0.085;
  sum += texture(u_texture, v_uv + vec2(-u_texel.x, -u_texel.y) * u_radius * 0.72) * 0.085;
  vec3 color = mix(sum.rgb, sum.rgb * u_glowColor * 1.85, 0.42);
  outColor = vec4(color * u_strength, sum.a);
}
`;

export const COMPOSE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_emission;
uniform sampler2D u_bloomA;
uniform sampler2D u_bloomB;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_matrixPitch;
uniform float u_noiseAmount;
uniform float u_vignetteStrength;
uniform float u_diffusionStrength;
uniform float u_flickerAmount;
uniform float u_opacity;
uniform vec3 u_blackColor;

in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 pixel = v_uv * u_resolution;
  vec3 emission = texture(u_emission, v_uv).rgb;
  vec3 bloomA = texture(u_bloomA, v_uv).rgb;
  vec3 bloomB = texture(u_bloomB, v_uv).rgb;

  float flicker = 1.0 + sin(u_time * 0.013) * u_flickerAmount;
  vec3 color = u_blackColor;
  color += bloomB * (0.86 + u_diffusionStrength * 0.55);
  color += bloomA * 0.66;
  color += emission * u_opacity * flicker;

  vec2 grid = abs(fract(pixel / u_matrixPitch) - 0.5);
  float gridLine = 1.0 - smoothstep(0.42, 0.5, max(grid.x, grid.y));
  color += vec3(0.015, 0.024, 0.075) * gridLine;

  float n = hash(pixel + u_time * 0.021);
  color += vec3(n * 0.6, n * 0.72, n) * u_noiseAmount;

  float dist = distance(v_uv, vec2(0.5));
  float vignette = smoothstep(0.28, 0.86, dist) * u_vignetteStrength;
  color *= 1.0 - vignette;

  outColor = vec4(color, 1.0);
}
`;
