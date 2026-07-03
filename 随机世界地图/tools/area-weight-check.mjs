import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const grid = createCubedSphereGrid(faceSize);
const areaStats = measureAreaStats(grid);
const hemisphereStats = measureHemisphereStats(grid);
const valid = Math.abs(areaStats.areaTotal - 4 * Math.PI) < 1e-4 && Math.abs(hemisphereStats.northAreaShare - 0.5) < 0.015 && Math.abs(hemisphereStats.eastAreaShare - 0.5) < 0.015;

console.log(
  JSON.stringify(
    {
      topologyKind: grid.topologyKind,
      faceSize,
      valid,
      ...areaStats,
      ...hemisphereStats,
    },
    null,
    2,
  ),
);
if (!valid) process.exit(1);

function measureAreaStats(grid) {
  let areaTotal = 0;
  let areaMin = Infinity;
  let areaMax = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const value = grid.area[id];
    areaTotal += value;
    areaMin = Math.min(areaMin, value);
    areaMax = Math.max(areaMax, value);
  }
  return {
    areaTotal,
    areaTotalError: areaTotal - 4 * Math.PI,
    areaMin,
    areaMax,
    areaMinMaxRatio: areaMax / Math.max(areaMin, Number.EPSILON),
    equalAreaCell: 4 * Math.PI / grid.size,
  };
}

function measureHemisphereStats(grid) {
  let north = 0;
  let south = 0;
  let east = 0;
  let west = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const value = grid.area[id];
    if (grid.positionY[id] >= 0) north += value;
    else south += value;
    if (grid.positionZ[id] >= 0) east += value;
    else west += value;
  }
  const total = north + south;
  return {
    northAreaShare: north / Math.max(total, Number.EPSILON),
    southAreaShare: south / Math.max(total, Number.EPSILON),
    eastAreaShare: east / Math.max(east + west, Number.EPSILON),
    westAreaShare: west / Math.max(east + west, Number.EPSILON),
  };
}
