import { writeFileSync } from "node:fs";
import { createWorld } from "../src/sim/world.js";
import { stepWorld } from "../src/sim/evolution.js";

const params = {
  seedText: process.argv[2] ?? "龙骨海-纪元7",
  waterLevel: 50,
  intensity: 1,
  plateCount: 14,
  timeScale: 1_000_000,
  resolution: process.argv[6] ?? "512x256",
  pipelineMode: process.argv[5] ?? "legacy",
  showBoundaries: false,
};
const steps = Number(process.argv[3] ?? 739);
const output = process.argv[4] ?? "_render-check.ppm";

const world = createWorld(params);
for (let i = 0; i < steps; i += 1) stepWorld(world);

const { width, height, elev } = world.grid;
const bytes = Buffer.alloc(width * height * 3);
for (let i = 0; i < world.grid.size; i += 1) {
  const color = colorForElevation(elev[i] - world.seaLevel);
  const offset = i * 3;
  bytes[offset] = color[0];
  bytes[offset + 1] = color[1];
  bytes[offset + 2] = color[2];
}

writeFileSync(output, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), bytes]));
console.log(JSON.stringify({
  output,
  steps,
  ageYears: world.ageYears,
  pipelineMode: params.pipelineMode,
  resolution: params.resolution,
  landRatio: world.stats.landRatio,
  seaRatio: world.stats.seaRatio,
  seaLevel: world.seaLevel,
  causalityPass: world.stats.causalityPass,
  avgMountainConvergent: world.stats.avgMountainConvergent,
  avgContinentalInterior: world.stats.avgContinentalInterior,
  featureStats: measureFeatureStats(world.grid),
}, null, 2));

function measureFeatureStats(grid) {
  const fields = {
    mountainBelt: grid.mountainBelt,
    trench: grid.trench,
    ridge: grid.ridge,
    rift: grid.rift,
    islandArc: grid.islandArc,
    basin: grid.basin,
  };
  const result = {};
  for (const [name, field] of Object.entries(fields)) {
    let sum = 0;
    let max = 0;
    let covered = 0;
    let boundaryCovered = 0;
    for (let i = 0; i < grid.size; i += 1) {
      const v = field[i];
      sum += v;
      if (v > max) max = v;
      if (v > 0.05) {
        covered += 1;
        if (grid.boundaryDistance[i] === 0) boundaryCovered += 1;
      }
    }
    result[name] = {
      average: sum / grid.size,
      max,
      coverage: covered / grid.size,
      boundaryZeroShare: covered ? boundaryCovered / covered : 0,
    };
  }
  return result;
}

function colorForElevation(h) {
  if (h < -0.22) return [7, 35, 65];
  if (h < -0.08) return lerpColor([11, 53, 94], [31, 105, 143], (h + 0.22) / 0.14);
  if (h < 0) return lerpColor([39, 116, 145], [86, 157, 164], (h + 0.08) / 0.08);
  if (h < 0.12) return lerpColor([86, 132, 72], [143, 163, 88], h / 0.12);
  if (h < 0.32) return lerpColor([136, 123, 77], [126, 91, 62], (h - 0.12) / 0.2);
  if (h < 0.56) return lerpColor([116, 94, 79], [188, 182, 163], (h - 0.32) / 0.24);
  return [236, 240, 229];
}

function lerpColor(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}
