import { createGrid } from "../src/sim/grid.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { initializeSeaLevel, updateSeaLevel } from "../src/sim/terrain.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 24)));

const cylindrical = createSyntheticCylindricalWorld();
initializeSeaLevel(cylindrical);
const cylindricalExpected = cellQuantile(cylindrical.grid.elev, cylindrical.params.waterLevel / 100);

const spherical = createSyntheticSphericalWorld(faceSize);
const expectedWeighted = areaWeightedQuantile(spherical.grid, spherical.grid.elev, spherical.params.waterLevel / 100);
const unweighted = cellQuantile(spherical.grid.elev, spherical.params.waterLevel / 100);
initializeSeaLevel(spherical);
const initialWeightedVolume = measureAreaWeightedWaterVolume(spherical.grid, spherical.seaLevel);
const initialCellVolume = measureCellWaterVolume(spherical.grid.elev, spherical.seaLevel);
const totalArea = measureTotalArea(spherical.grid);
const initialWeightedMeanDepth = initialWeightedVolume / Math.max(totalArea, Number.EPSILON);
const initialCellMeanDepth = initialCellVolume / Math.max(1, spherical.grid.size);

for (let id = 0; id < spherical.grid.size; id += 1) {
  if (spherical.grid.elev[id] < spherical.seaLevel) {
    const areaBias = metricArea(spherical.grid, id) > spherical.averageCellArea ? 1 : -1;
    spherical.grid.elev[id] += areaBias > 0 ? -0.055 : 0.018;
  } else {
    spherical.grid.elev[id] += 0.012;
  }
}
updateSeaLevel(spherical);
const updatedWeightedVolume = measureAreaWeightedWaterVolume(spherical.grid, spherical.seaLevel);
const updatedCellVolume = measureCellWaterVolume(spherical.grid.elev, spherical.seaLevel);
const updatedWeightedMeanDepth = updatedWeightedVolume / Math.max(totalArea, Number.EPSILON);
const updatedCellMeanDepth = updatedCellVolume / Math.max(1, spherical.grid.size);

const checks = {
  cylindricalKeepsCellQuantile: nearlyEqual(cylindrical.seaLevel, cylindricalExpected, 1e-12),
  sphericalUsesWeightedQuantile: nearlyEqual(spherical.initialSeaLevel, expectedWeighted, 1e-12),
  weightedDiffersFromCellQuantile: Math.abs(expectedWeighted - unweighted) > 1e-4,
  initialWaterVolumeWeighted: nearlyEqual(spherical.waterVolume, initialWeightedVolume, 1e-12),
  updatedWaterVolumeConserved: nearlyEqual(spherical.waterVolume, updatedWeightedVolume, 1e-6),
  normalizedCellVolumeWouldDiffer: Math.abs(initialWeightedMeanDepth - initialCellMeanDepth) > 0.004,
  updatedCellVolumeNotAuthoritative: Math.abs(updatedWeightedMeanDepth - updatedCellMeanDepth) > 0.004,
};

const result = {
  valid: Object.values(checks).every(Boolean),
  faceSize,
  cylindrical: {
    seaLevel: cylindrical.seaLevel,
    expectedCellQuantile: cylindricalExpected,
  },
  spherical: {
    initialSeaLevel: spherical.initialSeaLevel,
    updatedSeaLevel: spherical.seaLevel,
    expectedWeightedQuantile: expectedWeighted,
    unweightedQuantile: unweighted,
    weightedQuantileDelta: expectedWeighted - unweighted,
    storedWaterVolume: spherical.waterVolume,
    initialWeightedVolume,
    updatedWeightedVolume,
    initialCellVolume,
    updatedCellVolume,
    totalArea,
    initialWeightedMeanDepth,
    initialCellMeanDepth,
    updatedWeightedMeanDepth,
    updatedCellMeanDepth,
    averageCellArea: spherical.averageCellArea,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createSyntheticCylindricalWorld() {
  const grid = createGrid(8, 2);
  for (let id = 0; id < grid.size; id += 1) grid.elev[id] = id < 8 ? -1 : 1;
  return {
    grid,
    params: { waterLevel: 50 },
    seaLevel: 0,
    waterVolume: 0,
  };
}

function createSyntheticSphericalWorld(faceSize) {
  const grid = createCubedSphereProductionGridAdapter({ faceSize });
  const rankedByArea = Array.from({ length: grid.size }, (_, id) => ({
    id,
    area: metricArea(grid, id),
  })).sort((a, b) => b.area - a.area);
  let selectedArea = 0;
  let selectedCount = 0;
  const totalArea = rankedByArea.reduce((sum, item) => sum + item.area, 0);
  const lowCells = new Uint8Array(grid.size);
  for (const item of rankedByArea) {
    if (selectedArea > totalArea * 0.52 && selectedCount > grid.size * 0.2) break;
    lowCells[item.id] = 1;
    selectedArea += item.area;
    selectedCount += 1;
  }
  for (let id = 0; id < grid.size; id += 1) {
    grid.elev[id] = lowCells[id]
      ? -0.34 + (grid.positionX[id] * 0.045 + grid.positionZ[id] * 0.035)
      : 0.28 + (grid.positionY[id] * 0.08);
  }
  const world = {
    grid,
    params: { waterLevel: 50 },
    seaLevel: 0,
    waterVolume: 0,
    initialSeaLevel: 0,
    averageCellArea: totalArea / grid.size,
  };
  const initialize = initializeSeaLevel;
  world.initializeSeaLevel = () => {
    initialize(world);
    world.initialSeaLevel = world.seaLevel;
  };
  world.initializeSeaLevel();
  return world;
}

function areaWeightedQuantile(grid, values, fraction) {
  const sorted = Array.from(values, (value, id) => ({ value, weight: metricArea(grid, id) }))
    .sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  const target = fraction * total;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative > target) return item.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

function cellQuantile(values, fraction) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * fraction)));
  return sorted[index];
}

function measureAreaWeightedWaterVolume(grid, seaLevel) {
  let volume = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.elev[id] < seaLevel) volume += (seaLevel - grid.elev[id]) * metricArea(grid, id);
  }
  return volume;
}

function measureCellWaterVolume(elev, seaLevel) {
  let volume = 0;
  for (let id = 0; id < elev.length; id += 1) {
    if (elev[id] < seaLevel) volume += seaLevel - elev[id];
  }
  return volume;
}

function metricArea(grid, id) {
  const area = grid?.area?.[id];
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function measureTotalArea(grid) {
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) total += metricArea(grid, id);
  return total;
}

function nearlyEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}
