import { lonLatToVec3, TAU } from "./vector.js";

const SQRT2 = Math.SQRT2;

export function equirectangularPixelToLonLat(x, y, width, height) {
  return {
    lon: ((x + 0.5) / width) * TAU,
    lat: ((y + 0.5) / height) * Math.PI - Math.PI / 2,
  };
}

export function equirectangularPixelToVec3(x, y, width, height) {
  const { lon, lat } = equirectangularPixelToLonLat(x, y, width, height);
  return lonLatToVec3(lon, lat);
}

export function mollweidePixelToVec3(x, y, width, height) {
  const mx = (((x + 0.5) / width) * 2 - 1) * 2 * SQRT2;
  const my = (1 - ((y + 0.5) / height) * 2) * SQRT2;
  const ellipse = (mx * mx) / 8 + (my * my) / 2;
  if (ellipse > 1) return { x: 0, y: 0, z: 0, visible: false };

  const theta = Math.asin(Math.max(-1, Math.min(1, my / SQRT2)));
  const cosTheta = Math.cos(theta);
  const lon = Math.abs(cosTheta) < 1e-12 ? 0 : (Math.PI * mx) / (2 * SQRT2 * cosTheta);
  const latArg = (2 * theta + Math.sin(2 * theta)) / Math.PI;
  const lat = Math.asin(Math.max(-1, Math.min(1, latArg)));
  return { ...lonLatToVec3(lon, lat), visible: true };
}

export function lonLatToEquirectangularPixel(lon, lat, width, height) {
  const wrappedLon = ((lon % TAU) + TAU) % TAU;
  return {
    x: (wrappedLon / TAU) * width - 0.5,
    y: ((lat + Math.PI / 2) / Math.PI) * height - 0.5,
  };
}
