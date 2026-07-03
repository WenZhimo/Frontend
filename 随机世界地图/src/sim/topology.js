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
      nextId += 1;
    }

    return {
      componentId,
      componentSizes,
      componentCount: nextId - 1,
    };
  }

  function forEachCell(fn) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        fn(y * width + x, x, y);
      }
    }
  }

  function sampleWrapped(x, y, field) {
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
    forEachCell,
    sampleWrapped,
  };
}

export function topologyForGrid(grid) {
  if (!grid.topology) {
    grid.topology = createTopology(grid.width, grid.height, grid.topologyOptions);
  }
  return grid.topology;
}

export function measureTopologyDiagnostics(world) {
  const grid = world.grid;
  const topology = topologyForGrid(grid);
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
  const polarAccessRisk = topology.wrapYEnabled ? 1 : 0;

  return {
    topologyKind: topology.kind,
    wrapXEnabled: topology.wrapXEnabled,
    wrapYEnabled: topology.wrapYEnabled,
    neighborConsistencyValid: westWrap && eastWrap && northBlocked && southBlocked && n4.length === 3 && edgeN4.length === 3,
    floodFillTopologyValid: floodCount === grid.size,
    connectedComponentCount: components.componentCount,
    polarAccessRisk,
    topologyResolutionDrift: 0,
  };
}
