import {
  createGrid,
  forEachGridCell,
  forEachNeighbor4,
  forEachNeighbor4ById,
  forEachNeighbor8ById,
  forEachNeighborRadiusById,
  indexOf,
  sampleGrid,
  sampleGridWrapped,
  wrapX,
  xyOf,
} from "../src/sim/grid.js";

const sizes = [
  [8, 4],
  [16, 8],
  [32, 16],
];

const failures = [];
const results = [];

for (const [width, height] of sizes) {
  const grid = createGrid(width, height);
  const result = checkGridHelpers(grid);
  results.push(result);
  for (const [name, valid] of Object.entries(result.checks)) {
    if (!valid) failures.push(`${width}x${height}:${name}`);
  }
}

const report = {
  valid: failures.length === 0,
  failures,
  results,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);

function checkGridHelpers(grid) {
  const values = new Int32Array(grid.size);
  for (let i = 0; i < values.length; i += 1) values[i] = i;
  const top = grid.topology;
  const center = indexOf(grid, 1, 1);
  const seam = indexOf(grid, -1, 1);
  const helperNeighbor4 = collectNeighborIds((visit) => forEachNeighbor4ById(grid, center, visit));
  const topologyNeighbor4 = top.neighbors4(center);
  const helperNeighbor8 = collectNeighborIds((visit) => forEachNeighbor8ById(grid, center, visit));
  const topologyNeighbor8 = top.neighbors8(center);
  const helperRadius = collectNeighborIds((visit) => forEachNeighborRadiusById(grid, center, 2, visit));
  const topologyRadius = top.neighborsRadius(center, 2);
  const xy = xyOf(grid, center);
  const cells = [];
  forEachGridCell(grid, (id, x, y) => cells.push({ id, x, y }));
  const coordinateNeighbors = [];
  forEachNeighbor4(grid, 0, 1, (x, y) => {
    coordinateNeighbors.push(indexOf(grid, x, y));
  });

  const checks = {
    wrapXMatchesLegacy: wrapX(grid.width, -1) === grid.width - 1 && wrapX(grid.width, grid.width) === 0,
    indexMatchesTopology: center === top.index(1, 1) && seam === top.index(grid.width - 1, 1),
    xyRoundTrip: xy.x === 1 && xy.y === 1 && indexOf(grid, xy.x, xy.y) === center,
    sampleMatchesTopology: sampleGrid(grid, values, 1, 1) === center,
    sampleWrappedMatchesTopology: sampleGridWrapped(grid, values, -1, 1) === seam,
    cellIterationMatchesTopology: cells.length === grid.size && cells.every((cell) => cell.id === top.index(cell.x, cell.y)),
    neighbor4ByIdMatchesTopology: sameSet(helperNeighbor4, topologyNeighbor4),
    neighbor8ByIdMatchesTopology: sameSet(helperNeighbor8, topologyNeighbor8),
    neighborRadiusByIdMatchesTopology: sameSet(helperRadius, topologyRadius),
    coordinateNeighbor4MatchesId: sameSet(coordinateNeighbors, top.neighbors4(top.index(0, 1))),
  };

  return {
    size: `${grid.width}x${grid.height}`,
    checks,
  };
}

function collectNeighborIds(run) {
  const ids = [];
  run((nid) => ids.push(nid));
  return ids;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort((x, y) => x - y);
  const bb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}
