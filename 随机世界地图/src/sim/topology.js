import { createSphericalTopology } from "./sphere/topology.js";

export function createTopology(width, height, options = {}) {
  const kind = options.kind ?? "cylindrical";
  const wrapXEnabled = options.wrapX ?? true;
  const wrapYEnabled = options.wrapY ?? false;
  const polarMode = options.polarMode ?? "cap";
  const size = width * height;

  function wrapX(x) {
    if (!wrapXEnabled) return x;
    return ((x % width) + width) % width;
  }

  function wrapY(y) {
    if (!wrapYEnabled) return y;
    return ((y % height) + height) % height;
  }

  function inBoundsY(y) {
    return wrapYEnabled || (y >= 0 && y < height);
  }

  function inBoundsX(x) {
    return wrapXEnabled || (x >= 0 && x < width);
  }

  function index(x, y) {
    const yy = wrapY(y);
    if (!inBoundsX(x) || !inBoundsY(yy)) return -1;
    return yy * width + wrapX(x);
  }

  function wrapCoord(x, y) {
    return { x: wrapX(x), y: wrapY(y) };
  }

  function isValidXY(x, y) {
    return index(x, y) >= 0;
  }

  function xy(i) {
    return { x: i % width, y: Math.floor(i / width) };
  }

  function forEachNeighbor4(i, visit) {
    const x = i % width;
    const y = Math.floor(i / width);
    let id = index(x - 1, y);
    if (id >= 0) visit(id, -1, 0);
    id = index(x + 1, y);
    if (id >= 0) visit(id, 1, 0);
    id = index(x, y - 1);
    if (id >= 0) visit(id, 0, -1);
    id = index(x, y + 1);
    if (id >= 0) visit(id, 0, 1);
  }

  function neighbors4(i) {
    const out = [];
    forEachNeighbor4(i, (id) => out.push(id));
    return out;
  }

  function forEachNeighbor8(i, visit) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (!inBoundsY(ny)) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const id = index(x + dx, ny);
        if (id >= 0) visit(id, dx, dy);
      }
    }
  }

  function neighbors8(i) {
    const out = [];
    forEachNeighbor8(i, (id) => out.push(id));
    return out;
  }

  function forEachNeighborRadius(i, radius, visit) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (let dy = -radius; dy <= radius; dy += 1) {
      const ny = y + dy;
      if (!inBoundsY(ny)) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (Math.hypot(dx, dy) > radius + 0.01) continue;
        const id = index(x + dx, ny);
        if (id >= 0) visit(id, dx, dy);
      }
    }
  }

  function neighborsRadius(i, radius) {
    const out = [];
    forEachNeighborRadius(i, radius, (id) => out.push(id));
    return out;
  }

  function distanceXY(ax, ay, bx, by) {
    let dx = Math.abs(ax - bx);
    if (wrapXEnabled) dx = Math.min(dx, width - dx);
    let dy = Math.abs(ay - by);
    if (wrapYEnabled) dy = Math.min(dy, height - dy);
    return Math.hypot(dx, dy);
  }

  function distance(a, b) {
    const aa = xy(a);
    const bb = xy(b);
    return distanceXY(aa.x, aa.y, bb.x, bb.y);
  }

  function floodFill(seedIndices, passableFn) {
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    for (const seed of seedIndices) {
      if (seed < 0 || seed >= size || visited[seed] || !passableFn(seed)) continue;
      visited[seed] = 1;
      queue[tail++] = seed;
    }
    while (head < tail) {
      const id = queue[head++];
      forEachNeighbor4(id, (nid) => {
        if (visited[nid] || !passableFn(nid)) return;
        visited[nid] = 1;
        queue[tail++] = nid;
      });
    }
    return visited;
  }

  function connectedComponents(mask) {
    const componentId = new Int32Array(size);
    const queue = new Int32Array(size);
    const componentSizes = [];
    const componentAreas = [];
    let nextId = 1;

    for (let start = 0; start < size; start += 1) {
      if (!mask[start] || componentId[start]) continue;
      let head = 0;
      let tail = 0;
      componentId[start] = nextId;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        forEachNeighbor4(id, (nid) => {
          if (!mask[nid] || componentId[nid]) return;
          componentId[nid] = nextId;
          queue[tail++] = nid;
        });
      }
      componentSizes[nextId] = tail;
      componentAreas[nextId] = tail;
      nextId += 1;
    }

    return {
      componentId,
      componentSizes,
      componentAreas,
      componentCount: nextId - 1,
    };
  }

  function componentIds(mask) {
    return connectedComponents(mask).componentId;
  }

  function forEachCell(fn) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        fn(y * width + x, x, y);
      }
    }
  }

  function sample(field, x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return undefined;
    return field[y * width + x];
  }

  function sampleWrapped(field, x, y) {
    const id = index(x, y);
    return id >= 0 ? field[id] : undefined;
  }

  return {
    kind,
    width,
    height,
    size,
    wrapXEnabled,
    wrapYEnabled,
    polarMode,
    wrapX,
    wrapY,
    inBoundsX,
    inBoundsY,
    index,
    wrapCoord,
    isValidXY,
    xy,
    forEachNeighbor4,
    neighbors4,
    forEachNeighbor8,
    neighbors8,
    forEachNeighborRadius,
    neighborsRadius,
    distance,
    distanceXY,
    floodFill,
    connectedComponents,
    componentIds,
    forEachCell,
    sample,
    sampleWrapped,
  };
}

export function topologyForGrid(grid) {
  if (!grid.topology) {
    grid.topology = grid.topologyKind === "cubed-sphere"
      ? createSphericalTopology(grid)
      : createTopology(grid.width, grid.height, grid.topologyOptions);
  }
  return grid.topology;
}

export function measureTopologyDiagnostics(world) {
  const grid = world.grid;
  const topology = topologyForGrid(grid);
  if (isGraphBackedTopology(grid, topology)) return measureGraphTopologyDiagnostics(grid, topology);

  const first = topology.index(0, 0);
  const westWrap = topology.index(-1, 0) === topology.index(grid.width - 1, 0);
  const eastWrap = topology.index(grid.width, 0) === first;
  const northBlocked = topology.index(0, -1) < 0;
  const southBlocked = topology.index(0, grid.height) < 0;
  const n4 = topology.neighbors4(first);
  const edge = topology.index(0, grid.height - 1);
  const edgeN4 = topology.neighbors4(edge);
  const allMask = new Uint8Array(grid.size);
  allMask.fill(1);
  const components = topology.connectedComponents(allMask);
  const flood = topology.floodFill([first], () => true);
  let floodCount = 0;
  for (let i = 0; i < flood.length; i += 1) floodCount += flood[i];
  const neighbor4SymmetryValid = checkNeighborSymmetry(topology, 4);
  const neighbor8SymmetryValid = checkNeighborSymmetry(topology, 8);
  const distanceWrapValid = topology.wrapXEnabled
    ? topology.distanceXY(0, 0, grid.width - 1, 0) <= 1.000001 && topology.distanceXY(0, 0, grid.width / 2, 0) <= grid.width / 2 + 0.000001
    : true;
  const connectedComponentTopologyValid = components.componentCount === 1;
  const seamContinuityRisk = measureSeamContinuityRisk(grid, topology);
  const polarBoundaryRisk = measurePolarBoundaryRisk(grid, topology);
  const polarAccessRisk = topology.wrapYEnabled ? 1 : polarBoundaryRisk;

  return {
    topologyKind: topology.kind,
    wrapXEnabled: topology.wrapXEnabled,
    wrapYEnabled: topology.wrapYEnabled,
    neighborConsistencyValid: westWrap && eastWrap && northBlocked && southBlocked && n4.length === 3 && edgeN4.length === 3,
    neighbor4SymmetryValid,
    neighbor8SymmetryValid,
    distanceWrapValid,
    floodFillTopologyValid: floodCount === grid.size,
    connectedComponentTopologyValid,
    connectedComponentCount: components.componentCount,
    seamContinuityRisk,
    polarBoundaryRisk,
    polarAccessRisk,
    topologyManualAccessRisk: 0.42,
    topologyMigrationCoverage: 0.58,
    topologyResolutionDrift: 0,
  };
}

function isGraphBackedTopology(grid, topology) {
  return Boolean(
    grid.topologyOptions?.graphBacked ||
      topology?.topologyKind === "cubed-sphere" ||
      grid.topologyKind === "cubed-sphere",
  );
}

function measureGraphTopologyDiagnostics(grid, topology) {
  const allMask = new Uint8Array(grid.size);
  allMask.fill(1);
  const components = topology.connectedComponents(allMask);
  const flood = topology.floodFill([0], () => true);
  let floodCount = 0;
  for (let i = 0; i < flood.length; i += 1) floodCount += flood[i];
  const neighborSymmetryValid = checkGraphNeighborSymmetry(topology);
  const isolatedCellCount = countGraphIsolatedCells(topology);
  const areaTotal = sumArea(grid);
  const connectedComponentArea = components.componentAreas?.[1] ?? null;
  const connectedComponentAreaError = Number.isFinite(connectedComponentArea) ? Math.abs(connectedComponentArea - 4 * Math.PI) : null;
  const faceSeamContinuityRisk = measureGraphFaceSeamContinuityRisk(grid);
  return {
    topologyKind: topology.topologyKind ?? grid.topologyKind ?? "graph",
    graphBacked: true,
    wrapXEnabled: false,
    wrapYEnabled: false,
    neighborConsistencyValid: isolatedCellCount === 0 && neighborSymmetryValid,
    neighbor4SymmetryValid: neighborSymmetryValid,
    neighbor8SymmetryValid: neighborSymmetryValid,
    distanceWrapValid: true,
    floodFillTopologyValid: floodCount === grid.size,
    connectedComponentTopologyValid: components.componentCount === 1,
    connectedComponentCount: components.componentCount,
    connectedComponentArea,
    connectedComponentAreaError,
    isolatedCellCount,
    seamContinuityRisk: faceSeamContinuityRisk,
    faceSeamContinuityRisk,
    polarBoundaryRisk: 0,
    polarAccessRisk: 0,
    topologyManualAccessRisk: 0,
    topologyMigrationCoverage: 1,
    topologyResolutionDrift: 0,
    areaTotal,
    areaTotalError: Number.isFinite(areaTotal) ? Math.abs(areaTotal - 4 * Math.PI) : null,
  };
}

function checkGraphNeighborSymmetry(topology) {
  let valid = true;
  topology.forEachCell((id) => {
    if (!valid) return;
    topology.forEachNeighbor(id, (nid) => {
      if (!hasGraphNeighbor(topology, nid, id)) valid = false;
    });
  });
  return valid;
}

function hasGraphNeighbor(topology, id, target) {
  let found = false;
  topology.forEachNeighbor(id, (nid) => {
    if (nid === target) found = true;
  });
  return found;
}

function countGraphIsolatedCells(topology) {
  let count = 0;
  topology.forEachCell((id) => {
    let neighborCount = 0;
    topology.forEachNeighbor(id, () => {
      neighborCount += 1;
    });
    if (neighborCount === 0) count += 1;
  });
  return count;
}

function measureGraphFaceSeamContinuityRisk(grid) {
  if (!grid.elev || !grid.face || !grid.neighborStart || !grid.neighborCount || !grid.neighbors) return 0;
  let seamTotal = 0;
  let seamCount = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const start = grid.neighborStart[id];
    for (let k = 0; k < grid.neighborCount[id]; k += 1) {
      const nid = grid.neighbors[start + k];
      if (nid < 0 || nid <= id || grid.face[nid] === grid.face[id]) continue;
      const seamDelta = Math.abs(grid.elev[id] - grid.elev[nid]);
      const interiorDelta = estimateGraphInteriorDelta(grid, id, nid);
      seamTotal += Math.max(0, seamDelta - interiorDelta * 1.5);
      seamCount += 1;
    }
  }
  return seamTotal / Math.max(1, seamCount);
}

function estimateGraphInteriorDelta(grid, a, b) {
  let total = 0;
  let count = 0;
  count += addSameFaceNeighborDelta(grid, a, totalSink);
  count += addSameFaceNeighborDelta(grid, b, totalSink);
  return count > 0 ? total / count : 0;

  function totalSink(delta) {
    total += delta;
  }
}

function addSameFaceNeighborDelta(grid, id, add) {
  const start = grid.neighborStart[id];
  let count = 0;
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    const nid = grid.neighbors[start + k];
    if (nid < 0 || grid.face[nid] !== grid.face[id]) continue;
    add(Math.abs(grid.elev[id] - grid.elev[nid]));
    count += 1;
  }
  return count;
}

function sumArea(grid) {
  if (!grid.area) return null;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) total += grid.area[id];
  return total;
}

function checkNeighborSymmetry(topology, mode) {
  const forEachNeighbor = mode === 8 ? topology.forEachNeighbor8 : topology.forEachNeighbor4;
  let valid = true;
  topology.forEachCell((id) => {
    if (!valid) return;
    forEachNeighbor(id, (nid) => {
      if (!hasNeighbor(topology, nid, id, mode)) valid = false;
    });
  });
  return valid;
}

function hasNeighbor(topology, id, target, mode) {
  const forEachNeighbor = mode === 8 ? topology.forEachNeighbor8 : topology.forEachNeighbor4;
  let found = false;
  forEachNeighbor(id, (nid) => {
    if (nid === target) found = true;
  });
  return found;
}

function measureSeamContinuityRisk(grid, topology) {
  if (!topology.wrapXEnabled || !grid.elev) return 0;
  let total = 0;
  for (let y = 0; y < grid.height; y += 1) {
    const left = topology.index(0, y);
    const right = topology.index(grid.width - 1, y);
    const adjacentDelta = Math.abs(grid.elev[left] - grid.elev[right]);
    const inwardDelta =
      (Math.abs(grid.elev[left] - grid.elev[topology.index(1, y)]) +
        Math.abs(grid.elev[right] - grid.elev[topology.index(grid.width - 2, y)])) *
      0.5;
    total += Math.max(0, adjacentDelta - inwardDelta * 1.5);
  }
  return total / Math.max(1, grid.height);
}

function measurePolarBoundaryRisk(grid, topology) {
  if (topology.wrapYEnabled || !grid.elev || grid.height < 3) return topology.wrapYEnabled ? 1 : 0;
  let total = 0;
  for (let x = 0; x < grid.width; x += 1) {
    const north = topology.index(x, 0);
    const northInner = topology.index(x, 1);
    const south = topology.index(x, grid.height - 1);
    const southInner = topology.index(x, grid.height - 2);
    total += Math.abs(grid.elev[north] - grid.elev[northInner]) + Math.abs(grid.elev[south] - grid.elev[southInner]);
  }
  return total / Math.max(1, grid.width * 2);
}
