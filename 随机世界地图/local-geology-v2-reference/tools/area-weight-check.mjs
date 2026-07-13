import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { measureAreaStats, measureHemisphereAreaStats } from "../src/sim/sphere/stats.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const grid = createCubedSphereGrid(faceSize);
const areaStats = measureAreaStats(grid);
const hemisphereStats = measureHemisphereAreaStats(grid);
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
