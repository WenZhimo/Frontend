import { lonLatToEquirectangularPixel } from "./projection.js";
import { lonLatToVec3 } from "./vector.js";
import {
  connectedComponentsGraph,
  distanceFromGraphSources,
  floodFillGraph,
} from "./topologyGraph.js";

export function createSphericalTopology(grid) {
  return {
    topologyKind: grid.topologyKind,
    size: grid.size,
    grid,
    forEachCell: (visit) => {
      for (let id = 0; id < grid.size; id += 1) visit(id);
    },
    forEachNeighbor: (id, visit) => {
      const start = grid.neighborStart[id];
      const count = grid.neighborCount[id];
      for (let k = 0; k < count; k += 1) {
        visit(grid.neighbors[start + k], k, grid.edgeLength[start + k]);
      }
    },
    forEachNeighborRing: (id, radius, visit) => visitNeighborRing(grid, id, radius, visit),
    distance: (a, b) => grid.distance(a, b),
    floodFill: (seedIds, passable) => floodFillGraph(grid, seedIds, passable),
    connectedComponents: (mask) => connectedComponentsGraph(grid, mask),
    shortestDistanceSeeds: (seedMask) => distanceFromGraphSources(grid, seedMask),
    sampleFieldAtLonLat: (field, lon, lat) => {
      const point = lonLatToVec3(lon, lat);
      return field[grid.nearestCell(point.x, point.y, point.z)];
    },
    nearestCellAtLonLat: (lon, lat) => {
      const point = lonLatToVec3(lon, lat);
      return grid.nearestCell(point.x, point.y, point.z);
    },
    projectCell: (id, projection = "equirectangular", options = {}) => {
      if (projection !== "equirectangular") {
        return { x: NaN, y: NaN, visible: false };
      }
      return {
        ...lonLatToEquirectangularPixel(grid.lon[id], grid.lat[id], options.width ?? 512, options.height ?? 256),
        visible: true,
      };
    },
  };
}

function visitNeighborRing(grid, startId, radius, visit) {
  const maxDepth = Math.max(0, Math.trunc(radius));
  const seen = new Uint8Array(grid.size);
  const queue = new Int32Array(grid.size);
  const depth = new Uint16Array(grid.size);
  let head = 0;
  let tail = 0;
  seen[startId] = 1;
  queue[tail++] = startId;

  while (head < tail) {
    const id = queue[head++];
    const currentDepth = depth[id];
    if (currentDepth > 0) visit(id, currentDepth);
    if (currentDepth >= maxDepth) continue;
    const nStart = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[nStart + k];
      if (seen[nid]) continue;
      seen[nid] = 1;
      depth[nid] = currentDepth + 1;
      queue[tail++] = nid;
    }
  }
}
