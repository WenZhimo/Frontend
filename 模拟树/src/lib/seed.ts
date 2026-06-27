export function createSeededRng(seed: string) {
  const bytes = new TextEncoder().encode(seed || '种子');

  const hash = (salt: number) => {
    let h = 0x811c9dc5 ^ salt;
    for (const byte of bytes) {
      h ^= byte;
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 13;
    }
    h ^= h >>> 16;
    return h >>> 0;
  };

  let a = hash(0x9e3779b9) || 1;
  let b = hash(0x243f6a88) || 2;
  let c = hash(0xb7e15162) || 3;
  let d = hash(0x94d049bb) || 4;

  return function rng() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const result = (t + d) | 0;
    c = (c + result) | 0;
    return ((result >>> 0) / 4294967296);
  };
}

export function randomRange(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
