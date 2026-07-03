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
  const componentAreas = [];
  let nextId = 1;

  for (let start = 0; start < grid.size; start += 1) {
    if (!mask[start] || componentId[start]) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    componentId[start] = nextId;
    queue[tail++] = start;

    while (head < tail) {
      const id = queue[head++];
      area += grid.area?.[id] ?? 1;
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
    componentAreas[nextId] = area;
    nextId += 1;
  }

  return {
    componentId,
    componentSizes,
    componentAreas,
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
    const area = components.componentAreas[component] ?? 0;
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
    componentAreas: components.componentAreas,
    componentCount: components.componentCount,
    externalComponent,
    externalArea,
    closedBasinCount: nextClosedId - 1,
  };
}

export function distanceFromGraphSources(grid, sourceMask) {
  const distance = new Float32Array(grid.size);
  const heap = new MinDistanceHeap(Math.max(16, grid.size));
  distance.fill(Infinity);

  for (let id = 0; id < grid.size; id += 1) {
    if (!sourceMask[id]) continue;
    distance[id] = 0;
    heap.push(id, 0);
  }

  while (heap.length > 0) {
    const current = heap.pop();
    const id = current.id;
    if (current.distance > distance[id] + 1e-7) continue;
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      const next = distance[id] + (grid.edgeLength?.[start + k] ?? 1);
      if (next >= distance[nid]) continue;
      distance[nid] = next;
      heap.push(nid, distance[nid]);
    }
  }

  return distance;
}

class MinDistanceHeap {
  constructor(capacity) {
    this.ids = new Int32Array(capacity);
    this.distances = new Float64Array(capacity);
    this.length = 0;
  }

  push(id, distance) {
    this.ensureCapacity(this.length + 1);
    let index = this.length++;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.distances[parent] <= distance) break;
      this.ids[index] = this.ids[parent];
      this.distances[index] = this.distances[parent];
      index = parent;
    }
    this.ids[index] = id;
    this.distances[index] = distance;
  }

  pop() {
    const id = this.ids[0];
    const distance = this.distances[0];
    const lastId = this.ids[--this.length];
    const lastDistance = this.distances[this.length];
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.length) break;
      let child = left;
      if (right < this.length && this.distances[right] < this.distances[left]) child = right;
      if (this.distances[child] >= lastDistance) break;
      this.ids[index] = this.ids[child];
      this.distances[index] = this.distances[child];
      index = child;
    }
    if (this.length > 0) {
      this.ids[index] = lastId;
      this.distances[index] = lastDistance;
    }
    return { id, distance };
  }

  ensureCapacity(required) {
    if (required <= this.ids.length) return;
    const nextCapacity = Math.max(required, this.ids.length * 2);
    const ids = new Int32Array(nextCapacity);
    const distances = new Float64Array(nextCapacity);
    ids.set(this.ids);
    distances.set(this.distances);
    this.ids = ids;
    this.distances = distances;
  }
}
