import { createValueNoise3D } from "../src/sim/noise.js";
import { hashSeed, mixSeed } from "../src/sim/prng.js";
import { createCubedSphereGrid } from "../src/sim/sphere/cubedSphere.js";
import { equirectangularPixelToVec3, mollweidePixelToVec3 } from "../src/sim/sphere/projection.js";
import { lonLatToVec3, TAU } from "../src/sim/sphere/vector.js";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const NOISE_SALT = 0x5f51d3ed;

const { positional, options } = parseOptions(process.argv.slice(2));
const faceSize = parseIntOption(options, "face-size", Number(positional[0] ?? 64));
const seedText = positional[1] ?? options.seed ?? "龙骨海-纪元7";
const width = parseIntOption(options, "width", faceSize * 4);
const height = parseIntOption(options, "height", faceSize * 2);
const grid = createCubedSphereGrid(faceSize);
const noise = createValueNoise3D(mixSeed(hashSeed(seedText), NOISE_SALT));
const field = sampleSphericalNoise(grid, noise);

const neighborStats = measureNeighborContinuity(grid, field);
const seamStats = measureFaceSeamContinuity(grid, field, neighborStats.interiorDiffMean);
const poleStats = measurePoleStability(grid, field);
const projectionStats = measureProjectionSampling(grid, noise, width, height);

const valid =
  neighborStats.neighborDiffMean > 0 &&
  seamStats.seamDiffMean <= neighborStats.interiorDiffMean * 1.35 &&
  seamStats.seamDiffMax <= neighborStats.neighborDiffP99 * 1.75 &&
  poleStats.poleLongitudeVarianceMax < 1e-10 &&
  projectionStats.equirectangularFiniteShare === 1 &&
  projectionStats.mollweideFiniteShare === 1 &&
  projectionStats.mollweideBlankShare > 0.12 &&
  projectionStats.mollweideBlankShare < 0.35;

console.log(
  JSON.stringify(
    {
      valid,
      topologyKind: grid.topologyKind,
      faceSize,
      seedText,
      width,
      height,
      ...neighborStats,
      ...seamStats,
      ...poleStats,
      ...projectionStats,
    },
    null,
    2,
  ),
);

process.exit(valid ? 0 : 1);

function sampleSphericalNoise(grid, noise) {
  const field = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    field[id] = noise(x * 2.1 + 31, y * 2.1 - 17, z * 2.1 + 5, 5, 2, 0.52);
  }
  return field;
}

function measureNeighborContinuity(grid, field) {
  const diffs = [];
  let neighborDiffTotal = 0;
  let neighborEdgeCount = 0;
  let interiorDiffTotal = 0;
  let interiorEdgeCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id) continue;
      const diff = Math.abs(field[id] - field[nid]);
      diffs.push(diff);
      neighborDiffTotal += diff;
      neighborEdgeCount += 1;
      if (grid.face[id] === grid.face[nid]) {
        interiorDiffTotal += diff;
        interiorEdgeCount += 1;
      }
    }
  }
  diffs.sort((a, b) => a - b);
  return {
    neighborEdgeCount,
    neighborDiffMean: neighborDiffTotal / Math.max(1, neighborEdgeCount),
    neighborDiffP95: percentile(diffs, 0.95),
    neighborDiffP99: percentile(diffs, 0.99),
    interiorEdgeCount,
    interiorDiffMean: interiorDiffTotal / Math.max(1, interiorEdgeCount),
  };
}

function measureFaceSeamContinuity(grid, field, interiorDiffMean) {
  let seamEdgeCount = 0;
  let seamDiffTotal = 0;
  let seamDiffMax = 0;
  let seamRiskEdgeCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < id || grid.face[id] === grid.face[nid]) continue;
      const diff = Math.abs(field[id] - field[nid]);
      seamEdgeCount += 1;
      seamDiffTotal += diff;
      seamDiffMax = Math.max(seamDiffMax, diff);
      if (diff > interiorDiffMean * 2.25) seamRiskEdgeCount += 1;
    }
  }
  return {
    seamEdgeCount,
    seamDiffMean: seamDiffTotal / Math.max(1, seamEdgeCount),
    seamDiffMax,
    seamDiffToInteriorRatio: seamDiffTotal / Math.max(1, seamEdgeCount) / Math.max(interiorDiffMean, Number.EPSILON),
    seamRiskEdgeShare: seamRiskEdgeCount / Math.max(1, seamEdgeCount),
  };
}

function measurePoleStability(grid, field) {
  const northPoleLongitudeRange = measureExactPoleLongitudeRange(noiseValueAt, Math.PI / 2);
  const southPoleLongitudeRange = measureExactPoleLongitudeRange(noiseValueAt, -Math.PI / 2);
  return {
    northPoleSampleCount: countLatitudeSamples(grid, 0.94),
    southPoleSampleCount: countLatitudeSamples(grid, -0.94),
    northPoleRange: latitudeRange(grid, field, 0.94),
    southPoleRange: latitudeRange(grid, field, -0.94),
    poleRange: Math.max(latitudeRange(grid, field, 0.94), latitudeRange(grid, field, -0.94)),
    northPoleLongitudeRange,
    southPoleLongitudeRange,
    poleLongitudeVarianceMax: Math.max(northPoleLongitudeRange, southPoleLongitudeRange),
  };
}

function measureProjectionSampling(grid, noise, width, height) {
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 32));
  const equirectangular = measureProjectionNoise(noise, width, height, stepX, stepY, equirectangularPixelToVec3);
  const mollweide = measureProjectionNoise(noise, width, height, stepX, stepY, mollweidePixelToVec3);
  return {
    projectionSampleWidth: width,
    projectionSampleHeight: height,
    equirectangularFiniteShare: equirectangular.finiteShare,
    equirectangularBlankShare: equirectangular.blankShare,
    equirectangularValueRange: equirectangular.valueRange,
    mollweideFiniteShare: mollweide.finiteShare,
    mollweideBlankShare: mollweide.blankShare,
    mollweideValueRange: mollweide.valueRange,
  };
}

function measureProjectionNoise(noise, width, height, stepX, stepY, sampler) {
  let finite = 0;
  let blank = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const p = sampler(x, y, width, height);
      count += 1;
      if (p.visible === false) {
        blank += 1;
        continue;
      }
      const value = noise(p.x * 2.1 + 31, p.y * 2.1 - 17, p.z * 2.1 + 5, 5, 2, 0.52);
      if (!Number.isFinite(value)) continue;
      finite += 1;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return {
    finiteShare: finite / Math.max(1, count - blank),
    blankShare: blank / Math.max(1, count),
    valueRange: max - min,
  };
}

function countLatitudeSamples(grid, threshold) {
  let count = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (threshold > 0 && grid.positionY[id] >= threshold) count += 1;
    if (threshold < 0 && grid.positionY[id] <= threshold) count += 1;
  }
  return count;
}

function latitudeRange(grid, field, threshold) {
  let min = Infinity;
  let max = -Infinity;
  for (let id = 0; id < grid.size; id += 1) {
    const inBand = threshold > 0 ? grid.positionY[id] >= threshold : grid.positionY[id] <= threshold;
    if (!inBand) continue;
    min = Math.min(min, field[id]);
    max = Math.max(max, field[id]);
  }
  return max - min;
}

function measureExactPoleLongitudeRange(sample, lat) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 16; i += 1) {
    const p = lonLatToVec3((i / 16) * TAU, lat);
    const value = sample(p.x, p.y, p.z);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return max - min;
}

function noiseValueAt(x, y, z) {
  return noise(x * 2.1 + 31, y * 2.1 - 17, z * 2.1 + 5, 5, 2, 0.52);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * p)));
  return values[index];
}
