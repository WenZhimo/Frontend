export function floodFillGraph(grid, seedIndices, passableFn) {
  const visited = new Uint8Array(grid.size);
  const queue = new Int32Array(grid.size);
  let head = 0;
  let tail = 0;

  for (const seed of seedIndices) {
    if (seed < 0 || seed >= grid.size || visited[seed] || !passableFn(seed)) continue;
    visited[seed] = 1;
    queue[tail++] = seed;
  }

  while (head < tail) {
    const id = queue[head++];
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (visited[nid] || !passableFn(nid)) continue;
      visited[nid] = 1;
      queue[tail++] = nid;
    }
  }

  return visited;
}

export function connectedComponentsGraph(grid, mask) {
  const componentId = new Int32Array(grid.size);
  const queue = new Int32Array(grid.size);
  const componentSizes = [];
  let nextId = 1;

  for (let start = 0; start < grid.size; start += 1) {
    if (!mask[start] || componentId[start]) continue;
    let head = 0;
    let tail = 0;
    componentId[start] = nextId;
    queue[tail++] = start;

    while (head < tail) {
      const id = queue[head++];
      const nStart = grid.neighborStart[id];
      const count = grid.neighborCount[id];
      for (let k = 0; k < count; k += 1) {
        const nid = grid.neighbors[nStart + k];
        if (!mask[nid] || componentId[nid]) continue;
        componentId[nid] = nextId;
        queue[tail++] = nid;
      }
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

export function deriveSphericalOceanConnectivity(grid, seaMask) {
  const externalSeaMask = new Uint8Array(grid.size);
  const inlandWaterCandidate = new Uint8Array(grid.size);
  const oceanConnectivity = new Uint8Array(grid.size);
  const closedBasinId = new Int32Array(grid.size);
  const components = connectedComponentsGraph(grid, seaMask);
  let externalComponent = 0;
  let externalArea = 0;

  for (let component = 1; component <= components.componentCount; component += 1) {
    let area = 0;
    for (let id = 0; id < grid.size; id += 1) {
      if (components.componentId[id] === component) area += grid.area?.[id] ?? 1;
    }
    if (area > externalArea) {
      externalArea = area;
      externalComponent = component;
    }
  }

  const basinMap = new Int32Array(components.componentCount + 1);
  let nextClosedId = 1;
  for (let id = 0; id < grid.size; id += 1) {
    if (!seaMask[id]) continue;
    const component = components.componentId[id];
    if (component === externalComponent) {
      externalSeaMask[id] = 1;
      oceanConnectivity[id] = 2;
    } else {
      inlandWaterCandidate[id] = 1;
      oceanConnectivity[id] = 1;
      if (!basinMap[component]) basinMap[component] = nextClosedId++;
      closedBasinId[id] = basinMap[component];
    }
  }

  return {
    externalSeaMask,
    inlandWaterCandidate,
    oceanConnectivity,
    closedBasinId,
    componentId: components.componentId,
    componentSizes: components.componentSizes,
    componentCount: components.componentCount,
    externalComponent,
    externalArea,
    closedBasinCount: nextClosedId - 1,
  };
}

export function distanceFromGraphSources(grid, sourceMask) {
  const distance = new Float32Array(grid.size);
  const settled = new Uint8Array(grid.size);
  distance.fill(Infinity);

  for (let id = 0; id < grid.size; id += 1) {
    if (!sourceMask[id]) continue;
    distance[id] = 0;
  }

  for (let visited = 0; visited < grid.size; visited += 1) {
    let id = -1;
    let best = Infinity;
    for (let i = 0; i < grid.size; i += 1) {
      if (settled[i] || distance[i] >= best) continue;
      id = i;
      best = distance[i];
    }
    if (id < 0) break;
    settled[id] = 1;
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      const next = distance[id] + (grid.edgeLength?.[start + k] ?? 1);
      if (next >= distance[nid]) continue;
      distance[nid] = next;
    }
  }

  return distance;
}
