import { mixSeed, mulberry32 } from "./prng.js";

export function createValueNoise3D(seed) {
  const random = mulberry32(mixSeed(seed, 0x9e3779b9));
  const values = new Float32Array(256);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = random() * 2 - 1;
  }

  function sample(x, y, z) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const xf = x - x0;
    const yf = y - y0;
    const zf = z - z0;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const c000 = lattice(values, x0, y0, z0);
    const c100 = lattice(values, x0 + 1, y0, z0);
    const c010 = lattice(values, x0, y0 + 1, z0);
    const c110 = lattice(values, x0 + 1, y0 + 1, z0);
    const c001 = lattice(values, x0, y0, z0 + 1);
    const c101 = lattice(values, x0 + 1, y0, z0 + 1);
    const c011 = lattice(values, x0, y0 + 1, z0 + 1);
    const c111 = lattice(values, x0 + 1, y0 + 1, z0 + 1);

    const x00 = lerp(c000, c100, u);
    const x10 = lerp(c010, c110, u);
    const x01 = lerp(c001, c101, u);
    const x11 = lerp(c011, c111, u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  return function fbmSphere(nx, ny, nz, octaves = 6, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += amp * sample(nx * freq, ny * freq, nz * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lattice(values, x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return values[(h ^ (h >>> 16)) & 255];
}
