import { lonLatToVec3, TAU } from "./vector.js";

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

export function lonLatToEquirectangularPixel(lon, lat, width, height) {
  const wrappedLon = ((lon % TAU) + TAU) % TAU;
  return {
    x: (wrappedLon / TAU) * width - 0.5,
    y: ((lat + Math.PI / 2) / Math.PI) * height - 0.5,
  };
}
