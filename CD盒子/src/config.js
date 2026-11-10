export const CASE = {
  half: 73,
  corner: 8,
  discRadius: 60,
  discThickness: 1.2,
  hinge: { x: -72, z: 4 },
  openAngle: 3.05,
};

export const CAMERA = {
  fov: 28,
  near: 10,
  far: 4000,
  distance: 488,
  viewOffsetY: 40,
};

export const ROOM = {
  size: 512,
  samples: 4,
  lampPower: 9000,
};

export const DISC_CATALOG = [
  {
    slug: 'holo',
    title: 'Signal Bloom',
    note: 'holo / sticker print',
    base: 1,
    artIn: 16.2,
    printOut: 58.6,
    mirrorIn: 16.2,
    cover: './assets/covers/cover-holo.webp',
    thumb: './assets/covers/cover-holo-thumb.webp',
    uiTilt: -4,
  },
  {
    slug: 'gold',
    title: 'Voyager Gold',
    note: 'gold / brushed metal',
    base: 2,
    artIn: 14.2,
    printOut: 57.9,
    mirrorIn: 20.1,
    cover: './assets/covers/cover-gold.webp',
    thumb: './assets/covers/cover-gold-thumb.webp',
    uiTilt: 5,
  },
  {
    slug: 'rose',
    title: 'Night Rose',
    note: 'vinyl / botanical print',
    base: 3,
    artIn: 23.4,
    printOut: 58.8,
    mirrorIn: 23.4,
    cover: './assets/covers/cover-rose.webp',
    thumb: './assets/covers/cover-rose-thumb.webp',
    uiTilt: -3,
  },
  {
    slug: 'swirl',
    title: 'Liquid Sky',
    note: 'print / silver data side',
    base: 0,
    artIn: 20.1,
    printOut: 57.9,
    mirrorIn: 20.1,
    cover: './assets/covers/cover-swirl.webp',
    thumb: './assets/covers/cover-swirl-thumb.webp',
    uiTilt: 6,
  },
];

export const PALETTE = {
  page: 0xffffff,
  ink: 0x111114,
};

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
