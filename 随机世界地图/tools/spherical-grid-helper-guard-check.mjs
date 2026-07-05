import {
  gridParamHeight,
  gridParamToU,
  gridParamToV,
  gridParamWidth,
  indexOf,
  sampleGrid,
  sampleGridBilinear,
  sampleGridWrapped,
  wrapGridParamX,
  xyOf,
} from "../src/sim/grid.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 24)));
const grid = createCubedSphereProductionGridAdapter({ faceSize });
const field = new Float32Array(grid.size);
for (let id = 0; id < field.length; id += 1) field[id] = id;

const guardedHelpers = {
  gridParamWidth: () => gridParamWidth(grid),
  gridParamHeight: () => gridParamHeight(grid),
  wrapGridParamX: () => wrapGridParamX(grid, 0),
  gridParamToU: () => gridParamToU(grid, 0),
  gridParamToV: () => gridParamToV(grid, 0),
  indexOf: () => indexOf(grid, 0, 0),
  xyOf: () => xyOf(grid, 0),
  sampleGrid: () => sampleGrid(grid, field, 0, 0),
  sampleGridWrapped: () => sampleGridWrapped(grid, field, 0, 0),
  sampleGridBilinear: () => sampleGridBilinear(grid, field, 0.25, 0.25, -1),
};

const helperResults = Object.fromEntries(
  Object.entries(guardedHelpers).map(([name, run]) => [name, capturesRectangularGuard(run)]),
);

const graphNeighbors = [];
grid.topology.forEachNeighbor(0, (id) => graphNeighbors.push(id));

const checks = {
  productionGridHasNoLegacyDimensions: !Object.hasOwn(grid, "width") && !Object.hasOwn(grid, "height"),
  allRectangularHelpersGuarded: Object.values(helperResults).every(Boolean),
  topologyGraphStillUsable: graphNeighbors.length >= 2 && graphNeighbors.length <= 4,
  sphericalNearestCellUsable:
    typeof grid.sphericalGrid?.nearestCell === "function" &&
    grid.sphericalGrid.nearestCell(grid.positionX[0], grid.positionY[0], grid.positionZ[0]) === 0,
};

const result = {
  valid: Object.values(checks).every(Boolean),
  faceSize,
  helperResults,
  graphNeighborCount: graphNeighbors.length,
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function capturesRectangularGuard(run) {
  try {
    run();
    return false;
  } catch (error) {
    return String(error?.message ?? "").includes("requires a rectangular grid");
  }
}
