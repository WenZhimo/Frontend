export const REFERENCE_WIDTH = 512;
export const REFERENCE_HEIGHT = 256;

export function resolutionScale(grid) {
  const xScale = grid.width / REFERENCE_WIDTH;
  const yScale = grid.height / REFERENCE_HEIGHT;
  return Math.max(0.25, (xScale + yScale) * 0.5);
}

export function cellsFromReference(worldOrGrid, value) {
  const grid = worldOrGrid.grid ?? worldOrGrid;
  return Math.max(1, Math.round(value * resolutionScale(grid)));
}

export function referenceCellsFromGridDistance(grid, distanceCells) {
  return distanceCells / resolutionScale(grid);
}

export function cellCenterU(grid, x) {
  return (x + 0.5) / grid.width;
}

export function cellCenterV(grid, y) {
  return (y + 0.5) / grid.height;
}

export function spherePointForCell(grid, x, y) {
  const lon = cellCenterU(grid, x) * Math.PI * 2;
  const lat = cellCenterV(grid, y) * Math.PI - Math.PI / 2;
  const cosLat = Math.cos(lat);
  return {
    x: Math.cos(lon) * cosLat,
    y: Math.sin(lat),
    z: Math.sin(lon) * cosLat,
  };
}
