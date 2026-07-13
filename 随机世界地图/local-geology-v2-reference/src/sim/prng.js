export function hashSeed(seedText) {
  const text = String(seedText ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      hash = fnvByte(hash, code);
    } else if (code < 0x800) {
      hash = fnvByte(hash, 0xc0 | (code >> 6));
      hash = fnvByte(hash, 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        hash = fnvByte(hash, 0xf0 | (point >> 18));
        hash = fnvByte(hash, 0x80 | ((point >> 12) & 0x3f));
        hash = fnvByte(hash, 0x80 | ((point >> 6) & 0x3f));
        hash = fnvByte(hash, 0x80 | (point & 0x3f));
        i += 1;
      }
    } else {
      hash = fnvByte(hash, 0xe0 | (code >> 12));
      hash = fnvByte(hash, 0x80 | ((code >> 6) & 0x3f));
      hash = fnvByte(hash, 0x80 | (code & 0x3f));
    }
  }
  return hash >>> 0;
}

function fnvByte(hash, byte) {
  hash ^= byte;
  return Math.imul(hash, 0x01000193) >>> 0;
}

export function mixSeed(seed, salt) {
  let x = (seed ^ salt) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
