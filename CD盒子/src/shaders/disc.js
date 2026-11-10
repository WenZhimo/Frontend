import { commonGLSL } from './common.js';

export const discVertex = /* glsl */ `
attribute float aFace;

varying vec3 vLocal;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vRadial;
varying vec3 vTangent;
varying float vFace;

void main() {
  vLocal = position;
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vPos = viewPos.xyz;
  vNormal = normalize(normalMatrix * normal);

  vec2 radial = normalize(position.xy + vec2(1e-5, 0.0));
  vRadial = normalize(mat3(modelViewMatrix) * vec3(radial, 0.0));
  vTangent = normalize(mat3(modelViewMatrix) * vec3(-radial.y, radial.x, 0.0));
  vFace = aFace;

  gl_Position = projectionMatrix * viewPos;
}
`;

export const discFragment = /* glsl */ `
uniform sampler2D uArt;
uniform int uBase;
uniform float uArtIn;
uniform float uPrintOut;
uniform float uMirrorIn;
uniform float uFade;

varying vec3 vLocal;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vRadial;
varying vec3 vTangent;
varying float vFace;

${commonGLSL}

vec3 visibleSpectrum(float wavelength) {
  float x = clamp((wavelength - 400.0) / 300.0, 0.0, 1.0);
  vec3 c1 = vec3(3.54585104, 2.93225262, 2.41593945);
  vec3 x1 = vec3(0.69549072, 0.49228336, 0.27699880);
  vec3 y1 = vec3(0.02312639, 0.15225084, 0.52607955);
  vec3 c2 = vec3(3.90307140, 3.21182957, 3.96587128);
  vec3 x2 = vec3(0.11748627, 0.86755042, 0.66077860);
  vec3 y2 = vec3(0.84897130, 0.88445281, 0.73949448);
  vec3 a = clamp(1.0 - (c1 * (x - x1)) * (c1 * (x - x1)) - y1, 0.0, 1.0);
  vec3 b = clamp(1.0 - (c2 * (x - x2)) * (c2 * (x - x2)) - y2, 0.0, 1.0);
  float inside = step(380.0, wavelength) * step(wavelength, 760.0);
  return (a + b) * inside;
}

// A CD is a radial reflection grating. We do not solve the full grating
// equation per wavelength; instead the radial half-vector component selects a
// wavelength, and three orders are summed. The tangential component limits the
// result to a spoke.
vec3 diffraction(vec3 L, vec3 V, float spread) {
  vec3 H = L + V;
  float along = dot(H, vTangent);
  float radial = abs(dot(H, vRadial));
  float spoke = exp(-along * along / (spread * spread));
  vec3 c = visibleSpectrum(1600.0 * radial)
         + 0.75 * visibleSpectrum(800.0 * radial)
         + 0.45 * visibleSpectrum(533.3 * radial);
  return c * spoke;
}

// Anisotropic highlight for the grooves that run around the disc. The lobe is
// narrow along the tangent and stretched along the radius.
float grooveLobe(vec3 L, vec3 V, vec3 N, float across, float along) {
  vec3 H = normalize(L + V);
  float hn = max(dot(H, N), 1e-3);
  float ht = dot(H, vTangent) / along;
  float hr = dot(H, vRadial) / across;
  float e = exp(-(ht * ht + hr * hr) / (hn * hn));
  return e / (12.566 * across * along
    * sqrt(max(dot(L, N), 0.05) * max(dot(V, N), 0.05)));
}

vec3 smearedStudio(vec3 R, float amount) {
  vec3 c = studio(R - vRadial * amount)
         + studio(R - vRadial * amount * 0.33)
         + studio(R + vRadial * amount * 0.33)
         + studio(R + vRadial * amount);
  return min(c * 0.25, vec3(2.2));
}

vec3 printLights(vec3 N) {
  return vec3(0.40)
       + vec3(0.60) * max(dot(N, KEY_LIGHT), 0.0)
       + vec3(0.26) * max(dot(N, STRIP_LIGHT), 0.0)
       + vec3(0.16) * max(dot(N, TOP_LIGHT), 0.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPos);
  if (dot(N, V) < 0.0) N = -N;

  float cosv = max(dot(N, V), 0.0);
  vec3 R = reflect(-V, N);
  float radius = length(vLocal.xy);

  if (vFace > 1.5) {
    vec3 edge = vec3(0.30, 0.31, 0.33) + studio(R) * 0.25;
    gl_FragColor = vec4(mix(vec3(1.0), edge, uFade), 2.0 * uFade);
    return;
  }

  vec2 uv = vLocal.xy / 120.0 + 0.5;
  vec4 art = texture2D(uArt, uv);
  bool back = vFace > 0.5;

  vec3 silver = vec3(0.58, 0.60, 0.64);
  vec3 mirror = min(studio(R), vec3(1.8)) * 0.55
              + silver * (0.55 + 0.35 * max(dot(N, KEY_LIGHT), 0.0));

  vec3 rainbow = diffraction(KEY_LIGHT, V, 0.050) * 1.6
               + diffraction(STRIP_LIGHT, V, 0.045) * 1.4
               + diffraction(TOP_LIGHT, V, 0.060) * 0.9
               + diffraction(BOUNCE_LIGHT, V, 0.160) * 0.35;
  // Push the spectral fit away from grey: a silver disc should read as silver
  // with saturated spokes, not as a pastel wash.
  float rainbowLuma = dot(rainbow, vec3(0.3333));
  rainbow = max(mix(vec3(rainbowLuma), rainbow, 1.65), 0.0) * 1.55;

  float dataBand = smoothstep(21.5, 23.0, radius) * (1.0 - smoothstep(58.2, 58.8, radius));
  vec3 col;

  if (back) {
    col = mirror * 0.82 + rainbow * dataBand * 2.8;
    col *= 1.0 - 0.35 * (1.0 - smoothstep(0.15, 0.40, abs(radius - 16.6)));
    float clearCentre = 1.0 - smoothstep(14.6, 15.2, radius);
    col = mix(col, vec3(0.62, 0.64, 0.67) + studio(R) * 0.06, clearCentre);
    col = mix(col, studio(R) * 0.35 + vec3(0.22, 0.23, 0.25),
      smoothstep(58.0, 58.9, radius) * 0.85);
    gl_FragColor = vec4(mix(vec3(1.0), col, uFade), 2.0 * uFade);
    return;
  }

  if (uBase == 2) {
    float shade = mix(1.0, clamp(dot(art.rgb, vec3(0.3333)) / 0.3, 0.55, 2.0), art.a);
    float tone = mix(0.82, 1.10, smoothstep(0.5, 1.6, shade));
    float caught = (dot(smearedStudio(R, 0.22), vec3(0.3333)) * 0.15 + 0.40
      + grooveLobe(KEY_LIGHT, V, N, 0.42, 0.05) * 0.30
      + grooveLobe(STRIP_LIGHT, V, N, 0.42, 0.05) * 0.20
      + grooveLobe(TOP_LIGHT, V, N, 0.42, 0.05) * 0.12) * tone;
    float lit = 1.0 - exp(-caught * 1.2);
    col = mix(vec3(0.55, 0.24, 0.04), vec3(1.0, 0.82, 0.42), lit) * (0.65 + 0.65 * lit);

    float cut = smoothstep(1.5, 2.6, shade);
    col = mix(col, vec3(1.0, 0.72, 0.28) * (printLights(N) * 0.7 + 0.2), cut * 0.85);

    // Let the source image read directly as a gold-toned engraving. The dark
    // title and the black band must stay dark; the diagram lines stay bright.
    float luminance = dot(art.rgb, vec3(0.3333));
    float ink = smoothstep(0.04, 0.30, luminance);
    vec3 image = art.rgb * (0.55 + 0.55 * lit) + vec3(0.05, 0.03, 0.0);
    col *= mix(0.16, 1.0, ink) * art.a + (1.0 - art.a);
    col = mix(col, image, art.a * 0.30);
    col = mix(col, vec3(1.0, 0.9, 0.62), smoothstep(0.80, 1.0, luminance) * art.a * 0.25);

    float label = 1.0 - smoothstep(uArtIn - 0.4, uArtIn + 0.2, radius);
    float fleck = step(0.985, fract(sin(dot(floor(vLocal.xy * 6.0), vec2(12.9898, 78.233))) * 43758.5453));
    vec3 lab = vec3(0.018) + vec3(0.9, 0.85, 0.7) * fleck * 0.35 + studio(R) * 0.04;
    col = mix(col, lab, label);
    col += studioGlare(R) * schlick(cosv, 1.5) * 0.4;
  } else if (uBase == 3) {
    float grooved = smoothstep(uArtIn, uArtIn + 0.6, radius)
                  * (1.0 - smoothstep(58.6, 59.2, radius));
    float gaps = 1.0;
    for (int k = 0; k < 4; k++) {
      float at = 30.5 + float(k) * 7.0;
      gaps *= 1.0 - 0.7 * (1.0 - smoothstep(0.12, 0.40, abs(radius - at)));
    }
    float sheen = grooveLobe(KEY_LIGHT, V, N, 0.30, 0.018) * 1.0
                + grooveLobe(STRIP_LIGHT, V, N, 0.30, 0.018) * 0.8
                + grooveLobe(TOP_LIGHT, V, N, 0.30, 0.018) * 0.5
                + grooveLobe(BOUNCE_LIGHT, V, N, 0.30, 0.018) * 0.25;
    col = vec3(0.012) + vec3(0.62, 0.64, 0.68) * sheen * grooved * gaps * 0.14;
    col += smearedStudio(R, 0.08) * schlick(cosv, 1.55) * mix(1.0, 0.6, grooved);
  } else {
    bool dark = uBase == 1;
    col = dark
      ? min(studio(R), vec3(2.0)) * 0.07 + vec3(0.012) + rainbow * dataBand * 1.8
      : mirror * 0.82 + rainbow * dataBand * 2.4;
    col *= 1.0 - 0.35 * (1.0 - smoothstep(0.15, 0.40, abs(radius - 16.6)));
  }

  if (uBase != 2) {
    float printed = art.a * (1.0 - smoothstep(uPrintOut, uPrintOut + 0.4, radius));
    if (uBase <= 1) printed *= smoothstep(uMirrorIn - 0.2, uMirrorIn + 0.2, radius);
    col = mix(col, art.rgb * printLights(N), printed);
    col += min(studioGlare(R), vec3(2.5)) * schlick(cosv, 1.5) * printed * 0.9;
  }

  if (uBase <= 1) {
    float rim = smoothstep(uPrintOut, uPrintOut + 0.5, radius)
              * smoothstep(58.0, 58.9, radius);
    col = mix(col, studio(R) * 0.35 + vec3(0.22, 0.23, 0.25), rim * 0.85);
  }

  gl_FragColor = vec4(mix(vec3(1.0), col, uFade), 2.0 * uFade);
}
`;
