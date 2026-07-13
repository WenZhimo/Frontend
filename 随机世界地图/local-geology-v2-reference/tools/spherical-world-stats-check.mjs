import { createGrid } from "../src/sim/grid.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { weightedShare } from "../src/sim/sphere/stats.js";
import { analyzeWorld } from "../src/sim/world.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 24)));

const cylindricalWorld = createSyntheticCylindricalWorld();
const cylindricalStats = analyzeWorld(cylindricalWorld);
const cylindricalCellLandShare = cellShare(cylindricalWorld.grid, (id) => cylindricalWorld.grid.elev[id] >= cylindricalWorld.seaLevel);

const sphericalWorld = createSyntheticSphericalWorld(faceSize);
const sphericalStats = analyzeWorld(sphericalWorld);
const sphericalCellLandShare = cellShare(sphericalWorld.grid, (id) => sphericalWorld.grid.elev[id] >= sphericalWorld.seaLevel);
const sphericalAreaLandShare = weightedShare(sphericalWorld.grid, sphericalWorld.grid.isContinental);

const checks = {
  cylindricalUsesCellShare: nearlyEqual(cylindricalStats.landRatio, cylindricalCellLandShare, 1e-12),
  sphericalUsesAreaShare: nearlyEqual(sphericalStats.landRatio, sphericalAreaLandShare, 1e-12),
  sphericalAreaDiffersFromCellShare: Math.abs(sphericalStats.landRatio - sphericalCellLandShare) > 0.01,
  sphericalSeaComplementsLand: nearlyEqual(sphericalStats.landRatio + sphericalStats.seaRatio, 1, 1e-12),
  sphericalStatsFinite: Number.isFinite(sphericalStats.avgInterior) && Number.isFinite(sphericalStats.maxElev),
};

const result = {
  valid: Object.values(checks).every(Boolean),
  faceSize,
  cylindrical: {
    landRatio: cylindricalStats.landRatio,
    cellLandShare: cylindricalCellLandShare,
  },
  spherical: {
    landRatio: sphericalStats.landRatio,
    cellLandShare: sphericalCellLandShare,
    areaLandShare: sphericalAreaLandShare,
    seaRatio: sphericalStats.seaRatio,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createSyntheticCylindricalWorld() {
  const grid = createGrid(4, 2);
  grid.elev.fill(-1);
  grid.isContinental.fill(0);
  for (let id = 0; id < 2; id += 1) {
    grid.elev[id] = 1;
    grid.isContinental[id] = 1;
  }
  return {
    grid,
    seaLevel: 0,
    plates: null,
    initialPlateCentersU: null,
    initialPlateCentersV: null,
  };
}

function createSyntheticSphericalWorld(faceSize) {
  const grid = createCubedSphereProductionGridAdapter({ faceSize });
  grid.elev.fill(-1);
  grid.isContinental.fill(0);
  for (let id = 0; id < grid.size; id += 1) {
    if (grid.positionY[id] > 0.45) {
      grid.elev[id] = 1;
      grid.isContinental[id] = 1;
    }
  }
  return {
    grid,
    seaLevel: 0,
    plates: null,
    initialPlateCentersU: null,
    initialPlateCentersV: null,
  };
}

function cellShare(grid, predicate) {
  let covered = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate(id)) covered += 1;
  }
  return covered / Math.max(1, grid.size);
}

function nearlyEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}
