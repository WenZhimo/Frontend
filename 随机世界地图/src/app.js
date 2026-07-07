(function () {
  "use strict";

  // ---- src/sim/prng.js ----
  function hashSeed(seedText) {
    const text = String(seedText ?? "");
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      let code = text.charCodeAt(i);
      if (code < 0x80) {
        hash = fnvByte(hash, code);
      } else if (code < 0x800) {
        hash = fnvByte(hash, 0xc0 | (code >> 6));
        hash = fnvByte(hash, 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          hash = fnvByte(hash, 0xf0 | (point >> 18));
          hash = fnvByte(hash, 0x80 | ((point >> 12) & 0x3f));
          hash = fnvByte(hash, 0x80 | ((point >> 6) & 0x3f));
          hash = fnvByte(hash, 0x80 | (point & 0x3f));
          i += 1;
        }
      } else {
        hash = fnvByte(hash, 0xe0 | (code >> 12));
        hash = fnvByte(hash, 0x80 | ((code >> 6) & 0x3f));
        hash = fnvByte(hash, 0x80 | (code & 0x3f));
      }
    }
    return hash >>> 0;
  }

  function fnvByte(hash, byte) {
    hash ^= byte;
    return Math.imul(hash, 0x01000193) >>> 0;
  }

  function mixSeed(seed, salt) {
    let x = (seed ^ salt) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  // ---- src/sim/scale.js ----
  const REFERENCE_WIDTH = 512;
  const REFERENCE_HEIGHT = 256;
  const REFERENCE_CUBED_SPHERE_FACE_SIZE = REFERENCE_WIDTH / 4;

  function resolutionScale(grid) {
    if (grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.kind === "cubed-sphere") {
      return Math.max(0.25, (grid.faceSize ?? REFERENCE_CUBED_SPHERE_FACE_SIZE) / REFERENCE_CUBED_SPHERE_FACE_SIZE);
    }
    const xScale = grid.width / REFERENCE_WIDTH;
    const yScale = grid.height / REFERENCE_HEIGHT;
    return Math.max(0.25, (xScale + yScale) * 0.5);
  }

  function cellsFromReference(worldOrGrid, value) {
    const grid = worldOrGrid.grid ?? worldOrGrid;
    return Math.max(1, Math.round(value * resolutionScale(grid)));
  }

  function referenceCellsFromGridDistance(grid, distanceCells) {
    return distanceCells / resolutionScale(grid);
  }

  function cellCenterU(grid, x) {
    if (!Number.isFinite(grid.width)) throw new Error("cellCenterU requires a rectangular grid width");
    return (x + 0.5) / grid.width;
  }

  function cellCenterV(grid, y) {
    if (!Number.isFinite(grid.height)) throw new Error("cellCenterV requires a rectangular grid height");
    return (y + 0.5) / grid.height;
  }

  function spherePointForCell(grid, x, y) {
    if (grid.topologyKind === "cubed-sphere" || grid.topologyOptions?.kind === "cubed-sphere") {
      throw new Error("spherePointForCell(x, y) is only valid for rectangular grids; use cubed-sphere cell vectors instead");
    }
    const lon = cellCenterU(grid, x) * Math.PI * 2;
    const lat = cellCenterV(grid, y) * Math.PI - Math.PI / 2;
    const cosLat = Math.cos(lat);
    return {
      x: Math.cos(lon) * cosLat,
      y: Math.sin(lat),
      z: Math.sin(lon) * cosLat,
    };
  }


  // ---- src/sim/topology.js ----

  function createTopology(width, height, options = {}) {
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

  function topologyForGrid(grid) {
    if (!grid.topology) {
      grid.topology = grid.topologyKind === "cubed-sphere"
        ? createSphericalTopology(grid)
        : createTopology(grid.width, grid.height, grid.topologyOptions);
    }
    return grid.topology;
  }

  function measureTopologyDiagnostics(world) {
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


  // ---- src/sim/grid.js ----

  function createGrid(width, height) {
    const size = width * height;
    return {
      width,
      height,
      size,
      topology: createTopology(width, height),
      topologyOptions: { kind: "cylindrical", wrapX: true, wrapY: false },
      elev: new Float32Array(size),
      baseElev: new Float32Array(size),
      relief: new Float32Array(size),
      boundaryRelief: new Float32Array(size),
      geologyBroadNoise: new Float32Array(size),
      geologyMicroNoise: new Float32Array(size),
      scratch: new Float32Array(size),
      scratch2: new Float32Array(size),
      scratch3: new Float32Array(size),
      crust: new Float32Array(size),
      crustReference: new Float32Array(size),
      crustType: new Uint8Array(size),
      crustThickness: new Float32Array(size),
      crustAge: new Float32Array(size),
      ridgeDistance: new Float32Array(size),
      isostaticBase: new Float32Array(size),
      crustBuoyancy: new Float32Array(size),
      densitySubsidence: new Float32Array(size),
      lithosphereCooling: new Float32Array(size),
      isostaticResidual: new Float32Array(size),
      ageSubsidence: new Float32Array(size),
      thicknessBuoyancy: new Float32Array(size),
      sedimentFill: new Float32Array(size),
      erosionSource: new Float32Array(size),
      sedimentFlux: new Float32Array(size),
      sedimentSink: new Float32Array(size),
      sedimentCapacity: new Float32Array(size),
      sedimentCompaction: new Float32Array(size),
      sedimentLoadSubsidence: new Float32Array(size),
      depositionRate: new Float32Array(size),
      erosionRate: new Float32Array(size),
      sedimentBudgetError: new Float32Array(size),
      ridgeUplift: new Float32Array(size),
      trenchDepression: new Float32Array(size),
      oceanDepthTerms: new Float32Array(size),
      crustDensity: new Float32Array(size),
      weakness: new Float32Array(size),
      orogeny: new Float32Array(size),
      activeOrogeny: new Float32Array(size),
      oldOrogeny: new Float32Array(size),
      orogenyAge: new Float32Array(size),
      orogenyErosion: new Float32Array(size),
      forelandBasin: new Float32Array(size),
      mountainAxis: new Float32Array(size),
      mountainHeight: new Float32Array(size),
      orographicBarrier: new Float32Array(size),
      orogenicSedimentSupply: new Float32Array(size),
      tectonicAxis: new Float32Array(size),
      mountainAxisSeed: new Float32Array(size),
      ridgeAxis: new Float32Array(size),
      trenchAxis: new Float32Array(size),
      riftAxis: new Float32Array(size),
      axisSegmentId: new Int32Array(size),
      axisCurvature: new Float32Array(size),
      axisContinuity: new Float32Array(size),
      axisBoundaryDependency: new Float32Array(size),
      mountainHeightBlockiness: new Float32Array(size),
      orographicBarrierContinuity: new Float32Array(size),
      planetaryRelief: new Float32Array(size),
      tectonicReliefSupply: new Float32Array(size),
      isostaticReliefSupply: new Float32Array(size),
      erosionFlatteningPressure: new Float32Array(size),
      sedimentSmoothingPressure: new Float32Array(size),
      reliefDeficit: new Float32Array(size),
      seaLevelSensitivity: new Float32Array(size),
      largePlainMask: new Uint8Array(size),
      flatLandMask: new Uint8Array(size),
      ridgeVolumeSignal: new Float32Array(size),
      oldOceanCapacitySignal: new Float32Array(size),
      sedimentDisplacementSignal: new Float32Array(size),
      trenchCapacitySignal: new Float32Array(size),
      coastalSensitivity: new Float32Array(size),
      isYoungOcean: new Uint8Array(size),
      boundaryInfluence: new Float32Array(size),
      boundaryDistance: new Float32Array(size),
      boundaryDensity: new Float32Array(size),
      boundaryCoherence: new Float32Array(size),
      noisyBoundaryPatch: new Uint8Array(size),
      plateCheckerboard: new Float32Array(size),
      boundaryKind: new Int8Array(size),
      plate: new Int32Array(size),
      pvx: new Float32Array(size),
      pvy: new Float32Array(size),
      pvz: new Float32Array(size),
      btype: new Int8Array(size),
      stress: new Float32Array(size),
      uplift: new Float32Array(size),
      sediment: new Float32Array(size),
      tectonicFeature: new Int8Array(size),
      featureIntensity: new Float32Array(size),
      mountainBelt: new Float32Array(size),
      trench: new Float32Array(size),
      ridge: new Float32Array(size),
      rift: new Float32Array(size),
      riftStage: new Uint8Array(size),
      riftAge: new Float32Array(size),
      protoOceanCandidate: new Uint8Array(size),
      inlandWaterCandidate: new Uint8Array(size),
      externalSeaMask: new Uint8Array(size),
      oceanConnectivity: new Uint8Array(size),
      closedBasinId: new Int32Array(size),
      passiveMargin: new Float32Array(size),
      continentalShelf: new Float32Array(size),
      continentalSlope: new Float32Array(size),
      continentalRise: new Float32Array(size),
      abyssalPlain: new Float32Array(size),
      sedimentWedge: new Float32Array(size),
      marginCoastDistance: new Float32Array(size),
      marginContinentalDistance: new Float32Array(size),
      marginOceanDistance: new Float32Array(size),
      marginExternalSeaDistance: new Float32Array(size),
      activeTransform: new Float32Array(size),
      transformMemory: new Float32Array(size),
      fractureZoneMemory: new Float32Array(size),
      inactiveBoundaryRelief: new Float32Array(size),
      oldBoundaryCorrelation: new Float32Array(size),
      ageBandStraightnessRisk: new Float32Array(size),
      islandArc: new Float32Array(size),
      basin: new Float32Array(size),
      isContinental: new Uint8Array(size),
      activeBoundary: new Uint8Array(size),
    };
  }


  function physicalRadius(grid, referenceCells) {
    return cellsFromReference(grid, referenceCells);
  }

  function wrapX(width, x) {
    return ((x % width) + width) % width;
  }

  function gridParamWidth(grid) {
    assertRectangularGrid(grid, "gridParamWidth");
    return topologyForGrid(grid).width;
  }

  function gridParamHeight(grid) {
    assertRectangularGrid(grid, "gridParamHeight");
    return topologyForGrid(grid).height;
  }

  function wrapGridParamX(grid, x) {
    assertRectangularGrid(grid, "wrapGridParamX");
    const topology = topologyForGrid(grid);
    if (typeof topology.wrapX === "function") return topology.wrapX(x);
    const width = gridParamWidth(grid);
    return width ? wrapX(width, x) : 0;
  }

  function clampGridParamY(grid, y) {
    assertRectangularGrid(grid, "clampGridParamY");
    const topology = topologyForGrid(grid);
    const height = gridParamHeight(grid);
    return Math.max(0, Math.min(height - 1, y));
  }

  function gridParamToU(grid, x) {
    const width = gridParamWidth(grid);
    return width ? wrapGridParamX(grid, x) / width : 0;
  }

  function gridParamToV(grid, y) {
    const height = gridParamHeight(grid);
    return height ? Math.max(0, Math.min(1, y / height)) : 0;
  }

  function indexOf(grid, x, y) {
    assertRectangularGrid(grid, "indexOf");
    const topology = topologyForGrid(grid);
    if (typeof topology.index === "function") return topology.index(x, y);
    const width = gridParamWidth(grid);
    const height = gridParamHeight(grid);
    if (!width || !height) return -1;
    const sx = wrapGridParamX(grid, Math.floor(x));
    const sy = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const id = sy * width + sx;
    return id >= 0 && id < grid.size ? id : -1;
  }

  function xyOf(grid, id) {
    assertRectangularGrid(grid, "xyOf");
    const topology = topologyForGrid(grid);
    if (typeof topology.xy === "function") return topology.xy(id);
    const width = gridParamWidth(grid);
    return width ? { x: id % width, y: Math.floor(id / width) } : { x: id, y: 0 };
  }

  function sampleGrid(grid, field, x, y) {
    assertRectangularGrid(grid, "sampleGrid");
    const topology = topologyForGrid(grid);
    if (typeof topology.sample === "function") return topology.sample(field, x, y);
    const id = indexOf(grid, x, y);
    return id >= 0 ? field[id] : undefined;
  }

  function sampleGridWrapped(grid, field, x, y) {
    assertRectangularGrid(grid, "sampleGridWrapped");
    const topology = topologyForGrid(grid);
    if (typeof topology.sampleWrapped === "function") return topology.sampleWrapped(field, x, y);
    const id = indexOf(grid, x, y);
    return id >= 0 ? field[id] : undefined;
  }

  function sampleGridBilinear(grid, field, x, y, fallback = 0) {
    assertRectangularGrid(grid, "sampleGridBilinear");
    const height = gridParamHeight(grid);
    if (!height) return fallback;
    const sx = wrapGridParamX(grid, x);
    const sy = Math.max(0, Math.min(height - 1.001, y));
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = wrapGridParamX(grid, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = sx - x0;
    const ty = sy - y0;
    const i00 = indexOf(grid, x0, y0);
    const i10 = indexOf(grid, x1, y0);
    const i01 = indexOf(grid, x0, y1);
    const i11 = indexOf(grid, x1, y1);
    if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) {
      const nearest = sampleGridWrapped(grid, field, Math.round(x), Math.round(y));
      return Number.isFinite(nearest) ? nearest : fallback;
    }
    const a = field[i00] * (1 - tx) + field[i10] * tx;
    const b = field[i01] * (1 - tx) + field[i11] * tx;
    return a * (1 - ty) + b * ty;
  }

  function assertRectangularGrid(grid, helperName) {
    if (grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere") {
      throw new Error(`${helperName} requires a rectangular grid; use topology graph or spherical projection helpers for cubed-sphere grids`);
    }
  }

  function forEachGridCell(grid, visit) {
    topologyForGrid(grid).forEachCell(visit);
  }

  function forEachNeighbor4(grid, x, y, visit) {
    assertRectangularGrid(grid, "forEachNeighbor4");
    const topology = topologyForGrid(grid);
    if (typeof topology.index !== "function" || typeof topology.forEachNeighbor4 !== "function") return;
    const id = topology.index(x, y);
    if (id < 0) return;
    topology.forEachNeighbor4(id, (nid, dx, dy) => {
      const xy = typeof topology.xy === "function"
        ? topology.xy(nid)
        : { x: nid % grid.width, y: Math.floor(nid / grid.width) };
      visit(xy.x, xy.y, dx, dy);
    });
  }

  function forEachNeighbor4ById(grid, id, visit) {
    const topology = topologyForGrid(grid);
    if (topology.forEachNeighbor4) {
      topology.forEachNeighbor4(id, (nid, dx, dy) => {
        visit(nid, dx, dy);
      });
      return;
    }
    topology.forEachNeighbor(id, (nid, slot, edgeLength) => {
      visit(nid, 0, 0, edgeLength, slot);
    });
  }

  function forEachNeighbor8ById(grid, id, visit) {
    const topology = topologyForGrid(grid);
    if (topology.forEachNeighbor8) {
      topology.forEachNeighbor8(id, (nid, dx, dy) => {
        visit(nid, dx, dy);
      });
      return;
    }
    topology.forEachNeighbor(id, (nid, slot, edgeLength) => {
      visit(nid, 0, 0, edgeLength, slot);
    });
  }

  function forEachNeighborRadiusById(grid, id, radius, visit) {
    const topology = topologyForGrid(grid);
    if (topology.forEachNeighborRadius) {
      topology.forEachNeighborRadius(id, radius, (nid, dx, dy) => {
        visit(nid, dx, dy);
      });
      return;
    }
    topology.forEachNeighborRing(id, radius, (nid, depth) => {
      visit(nid, depth, 0);
    });
  }


  // ---- src/sim/sphere/vector.js ----
  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dot3(ax, ay, az, bx, by, bz) {
    return ax * bx + ay * by + az * bz;
  }

  function length3(x, y, z) {
    return Math.hypot(x, y, z);
  }

  function normalize3(x, y, z) {
    const length = length3(x, y, z) || 1;
    return {
      x: x / length,
      y: y / length,
      z: z / length,
    };
  }

  function cross3(ax, ay, az, bx, by, bz) {
    return {
      x: ay * bz - az * by,
      y: az * bx - ax * bz,
      z: ax * by - ay * bx,
    };
  }

  function angularDistance3(ax, ay, az, bx, by, bz) {
    return Math.acos(clamp(dot3(ax, ay, az, bx, by, bz), -1, 1));
  }

  function lonLatToVec3(lon, lat) {
    const cosLat = Math.cos(lat);
    return {
      x: Math.cos(lon) * cosLat,
      y: Math.sin(lat),
      z: Math.sin(lon) * cosLat,
    };
  }

  function vec3ToLonLat(x, y, z) {
    let lon = Math.atan2(z, x);
    if (lon < 0) lon += TAU;
    return {
      lon,
      lat: Math.asin(clamp(y, -1, 1)),
    };
  }

  function rotateAroundAxis(point, axis, angle) {
    const n = normalize3(axis.x, axis.y, axis.z);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const axisDot = dot3(n.x, n.y, n.z, point.x, point.y, point.z);
    const cross = cross3(n.x, n.y, n.z, point.x, point.y, point.z);
    return normalize3(
      point.x * cos + cross.x * sin + n.x * axisDot * (1 - cos),
      point.y * cos + cross.y * sin + n.y * axisDot * (1 - cos),
      point.z * cos + cross.z * sin + n.z * axisDot * (1 - cos),
    );
  }


  // ---- src/sim/sphere/cubedSphere.js ----

  const FACE_COUNT = 6;
  const FACE_POS_X = 0;
  const FACE_NEG_X = 1;
  const FACE_POS_Y = 2;
  const FACE_NEG_Y = 3;
  const FACE_POS_Z = 4;
  const FACE_NEG_Z = 5;

  function createCubedSphereGrid(faceSize = 64) {
    const n = Math.max(2, Math.trunc(faceSize));
    const faceCellCount = n * n;
    const size = FACE_COUNT * faceCellCount;
    const positionX = new Float32Array(size);
    const positionY = new Float32Array(size);
    const positionZ = new Float32Array(size);
    const lon = new Float32Array(size);
    const lat = new Float32Array(size);
    const area = new Float32Array(size);
    const face = new Uint8Array(size);
    const faceU = new Uint16Array(size);
    const faceV = new Uint16Array(size);
    const neighborStart = new Int32Array(size);
    const neighborCount = new Uint8Array(size);
    const neighbors = new Int32Array(size * 4);
    const edgeLength = new Float32Array(size * 4);
    const edgeTangentX = new Float32Array(size * 4);
    const edgeTangentY = new Float32Array(size * 4);
    const edgeTangentZ = new Float32Array(size * 4);

    for (let f = 0; f < FACE_COUNT; f += 1) {
      for (let v = 0; v < n; v += 1) {
        for (let u = 0; u < n; u += 1) {
          const id = cellId(n, f, u, v);
          const p = faceUvToVec3(f, uvToLocal(u, n), uvToLocal(v, n));
          const ll = vec3ToLonLat(p.x, p.y, p.z);
          positionX[id] = p.x;
          positionY[id] = p.y;
          positionZ[id] = p.z;
          lon[id] = ll.lon;
          lat[id] = ll.lat;
          face[id] = f;
          faceU[id] = u;
          faceV[id] = v;
        }
      }
    }

    for (let id = 0; id < size; id += 1) {
      neighborStart[id] = id * 4;
      const f = face[id];
      const u = faceU[id];
      const v = faceV[id];
      let count = 0;
      count = addNeighbor(n, neighbors, id, count, f, u - 1, v);
      count = addNeighbor(n, neighbors, id, count, f, u + 1, v);
      count = addNeighbor(n, neighbors, id, count, f, u, v - 1);
      count = addNeighbor(n, neighbors, id, count, f, u, v + 1);
      neighborCount[id] = count;
    }

    for (let id = 0; id < size; id += 1) {
      const start = neighborStart[id];
      for (let k = 0; k < neighborCount[id]; k += 1) {
        const nid = neighbors[start + k];
        const offset = start + k;
        edgeLength[start + k] = angularDistance3(
          positionX[id],
          positionY[id],
          positionZ[id],
          positionX[nid],
          positionY[nid],
          positionZ[nid],
        );
        const tangent = tangentTowardNeighbor(
          positionX[id],
          positionY[id],
          positionZ[id],
          positionX[nid],
          positionY[nid],
          positionZ[nid],
        );
        edgeTangentX[offset] = tangent.x;
        edgeTangentY[offset] = tangent.y;
        edgeTangentZ[offset] = tangent.z;
      }
    }

    estimateCellAreas({ faceSize: n, size, positionX, positionY, positionZ, area });

    return {
      topologyKind: "cubed-sphere",
      kind: "cubed-sphere",
      faceSize: n,
      faceCount: FACE_COUNT,
      size,
      positionX,
      positionY,
      positionZ,
      lon,
      lat,
      area,
      face,
      faceU,
      faceV,
      neighborStart,
      neighborCount,
      neighbors,
      edgeLength,
      edgeTangentX,
      edgeTangentY,
      edgeTangentZ,
      cellId: (f, u, v) => cellId(n, f, u, v),
      faceUv: (id) => faceUvFromId(n, id),
      forEachCell: (visit) => {
        for (let id = 0; id < size; id += 1) visit(id);
      },
      forEachNeighbor: (id, visit) => {
        const start = neighborStart[id];
        for (let k = 0; k < neighborCount[id]; k += 1) visit(neighbors[start + k], k, edgeLength[start + k]);
      },
      neighborsOf: (id) => {
        const out = [];
        const start = neighborStart[id];
        for (let k = 0; k < neighborCount[id]; k += 1) out.push(neighbors[start + k]);
        return out;
      },
      distance: (a, b) =>
        angularDistance3(positionX[a], positionY[a], positionZ[a], positionX[b], positionY[b], positionZ[b]),
      nearestCell: (x, y, z) => nearestCellByVector({ faceSize: n, size, positionX, positionY, positionZ }, x, y, z),
    };
  }

  function tangentTowardNeighbor(ax, ay, az, bx, by, bz) {
    const radialProjection = dot3(bx, by, bz, ax, ay, az);
    return normalize3(
      bx - ax * radialProjection,
      by - ay * radialProjection,
      bz - az * radialProjection,
    );
  }

  function cellId(faceSize, face, u, v) {
    return face * faceSize * faceSize + v * faceSize + u;
  }

  function faceUvFromId(faceSize, id) {
    const faceCellCount = faceSize * faceSize;
    const face = Math.floor(id / faceCellCount);
    const local = id - face * faceCellCount;
    const v = Math.floor(local / faceSize);
    const u = local - v * faceSize;
    return { face, u, v };
  }

  function faceUvToVec3(face, u, v) {
    if (face === FACE_POS_X) return normalize3(1, v, -u);
    if (face === FACE_NEG_X) return normalize3(-1, v, u);
    if (face === FACE_POS_Y) return normalize3(u, 1, -v);
    if (face === FACE_NEG_Y) return normalize3(u, -1, v);
    if (face === FACE_POS_Z) return normalize3(u, v, 1);
    return normalize3(-u, v, -1);
  }

  function vec3ToFaceUv(x, y, z) {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);
    if (ax >= ay && ax >= az) {
      return x >= 0
        ? { face: FACE_POS_X, u: -z / ax, v: y / ax }
        : { face: FACE_NEG_X, u: z / ax, v: y / ax };
    }
    if (ay >= ax && ay >= az) {
      return y >= 0
        ? { face: FACE_POS_Y, u: x / ay, v: -z / ay }
        : { face: FACE_NEG_Y, u: x / ay, v: z / ay };
    }
    return z >= 0
      ? { face: FACE_POS_Z, u: x / az, v: y / az }
      : { face: FACE_NEG_Z, u: -x / az, v: y / az };
  }

  function nearestCellByVector(grid, x, y, z) {
    if (Number.isFinite(grid?.faceSize) && grid.faceSize > 1) {
      const mapped = vec3ToFaceUv(x, y, z);
      return cellId(
        grid.faceSize,
        mapped.face,
        localToIndex(mapped.u, grid.faceSize),
        localToIndex(mapped.v, grid.faceSize),
      );
    }

    let best = 0;
    let bestDot = -Infinity;
    for (let id = 0; id < grid.size; id += 1) {
      const d = grid.positionX[id] * x + grid.positionY[id] * y + grid.positionZ[id] * z;
      if (d > bestDot) {
        bestDot = d;
        best = id;
      }
    }
    return best;
  }

  function uvToLocal(i, faceSize) {
    return ((i + 0.5) / faceSize) * 2 - 1;
  }

  function localToIndex(value, faceSize) {
    const normalized = (value + 1) * 0.5 * faceSize;
    return Math.max(0, Math.min(faceSize - 1, Math.floor(normalized)));
  }

  function addNeighbor(faceSize, neighbors, id, count, face, u, v) {
    let nid;
    if (u >= 0 && u < faceSize && v >= 0 && v < faceSize) {
      nid = cellId(faceSize, face, u, v);
    } else {
      const localU = uvToLocal(u, faceSize);
      const localV = uvToLocal(v, faceSize);
      const p = faceUvToVec3(face, localU, localV);
      const mapped = vec3ToFaceUv(p.x, p.y, p.z);
      nid = cellId(faceSize, mapped.face, localToIndex(mapped.u, faceSize), localToIndex(mapped.v, faceSize));
    }
    const start = id * 4;
    for (let i = 0; i < count; i += 1) {
      if (neighbors[start + i] === nid) return count;
    }
    neighbors[start + count] = nid;
    return count + 1;
  }

  function estimateCellAreas(grid) {
    const { faceSize, size, area } = grid;
    let total = 0;
    for (let f = 0; f < FACE_COUNT; f += 1) {
      for (let v = 0; v < faceSize; v += 1) {
        for (let u = 0; u < faceSize; u += 1) {
          const id = cellId(faceSize, f, u, v);
          const u0 = edgeToLocal(u, faceSize);
          const u1 = edgeToLocal(u + 1, faceSize);
          const v0 = edgeToLocal(v, faceSize);
          const v1 = edgeToLocal(v + 1, faceSize);
          const a = faceUvToVec3(f, u0, v0);
          const b = faceUvToVec3(f, u1, v0);
          const c = faceUvToVec3(f, u1, v1);
          const d = faceUvToVec3(f, u0, v1);
          const solidAngle = sphericalTriangleArea(a, b, c) + sphericalTriangleArea(a, c, d);
          area[id] = solidAngle;
          total += solidAngle;
        }
      }
    }
    const scale = (4 * Math.PI) / Math.max(total, Number.EPSILON);
    for (let id = 0; id < size; id += 1) area[id] *= scale;
  }

  function edgeToLocal(edge, faceSize) {
    return (edge / faceSize) * 2 - 1;
  }

  function sphericalTriangleArea(a, b, c) {
    const det =
      a.x * (b.y * c.z - b.z * c.y) -
      a.y * (b.x * c.z - b.z * c.x) +
      a.z * (b.x * c.y - b.y * c.x);
    const denominator = 1 + dot3(a.x, a.y, a.z, b.x, b.y, b.z) + dot3(b.x, b.y, b.z, c.x, c.y, c.z) + dot3(c.x, c.y, c.z, a.x, a.y, a.z);
    return Math.abs(2 * Math.atan2(det, denominator));
  }


  // ---- src/sim/sphere/projection.js ----

  const SQRT2 = Math.SQRT2;

  function equirectangularPixelToLonLat(x, y, width, height) {
    return {
      lon: ((x + 0.5) / width) * TAU,
      lat: ((y + 0.5) / height) * Math.PI - Math.PI / 2,
    };
  }

  function equirectangularPixelToVec3(x, y, width, height) {
    const { lon, lat } = equirectangularPixelToLonLat(x, y, width, height);
    return lonLatToVec3(lon, lat);
  }

  function mollweidePixelToVec3(x, y, width, height) {
    const mx = (((x + 0.5) / width) * 2 - 1) * 2 * SQRT2;
    const my = (1 - ((y + 0.5) / height) * 2) * SQRT2;
    const ellipse = (mx * mx) / 8 + (my * my) / 2;
    if (ellipse > 1) return { x: 0, y: 0, z: 0, visible: false };

    const theta = Math.asin(Math.max(-1, Math.min(1, my / SQRT2)));
    const cosTheta = Math.cos(theta);
    const lon = Math.abs(cosTheta) < 1e-12 ? 0 : (Math.PI * mx) / (2 * SQRT2 * cosTheta);
    const latArg = (2 * theta + Math.sin(2 * theta)) / Math.PI;
    const lat = Math.asin(Math.max(-1, Math.min(1, latArg)));
    return { ...lonLatToVec3(lon, lat), visible: true };
  }

  function lonLatToEquirectangularPixel(lon, lat, width, height) {
    const wrappedLon = ((lon % TAU) + TAU) % TAU;
    return {
      x: (wrappedLon / TAU) * width - 0.5,
      y: ((lat + Math.PI / 2) / Math.PI) * height - 0.5,
    };
  }


  // ---- src/sim/sphere/stats.js ----
  function areaTotal(grid) {
    let total = 0;
    for (let id = 0; id < grid.size; id += 1) total += cellArea(grid, id);
    return total;
  }

  function weightedSum(grid, field, options = {}) {
    const predicate = options.predicate;
    let total = 0;
    for (let id = 0; id < grid.size; id += 1) {
      if (predicate && !predicate(id)) continue;
      total += Number(field[id] ?? 0) * cellArea(grid, id);
    }
    return total;
  }

  function weightedMean(grid, field, options = {}) {
    const predicate = options.predicate;
    let total = 0;
    let weight = 0;
    for (let id = 0; id < grid.size; id += 1) {
      if (predicate && !predicate(id)) continue;
      const area = cellArea(grid, id);
      total += Number(field[id] ?? 0) * area;
      weight += area;
    }
    return total / Math.max(weight, Number.EPSILON);
  }

  function weightedShare(grid, mask, options = {}) {
    const predicate = options.predicate;
    let covered = 0;
    let total = 0;
    for (let id = 0; id < grid.size; id += 1) {
      if (predicate && !predicate(id)) continue;
      const area = cellArea(grid, id);
      total += area;
      if (mask[id]) covered += area;
    }
    return covered / Math.max(total, Number.EPSILON);
  }

  function weightedCategoryShares(grid, categories, categoryCount, options = {}) {
    const predicate = options.predicate;
    const areaByCategory = new Float64Array(Math.max(0, categoryCount));
    let total = 0;
    for (let id = 0; id < grid.size; id += 1) {
      if (predicate && !predicate(id)) continue;
      const category = categories[id];
      if (category < 0 || category >= areaByCategory.length) continue;
      const area = cellArea(grid, id);
      areaByCategory[category] += area;
      total += area;
    }
    const shares = new Float64Array(areaByCategory.length);
    for (let i = 0; i < areaByCategory.length; i += 1) {
      shares[i] = areaByCategory[i] / Math.max(total, Number.EPSILON);
    }
    return { areaByCategory, shares, totalArea: total };
  }

  function weightedFieldSummary(grid, field, options = {}) {
    const predicate = options.predicate;
    let weightedTotal = 0;
    let totalArea = 0;
    let finiteArea = 0;
    let nonZeroArea = 0;
    let positiveArea = 0;
    let negativeArea = 0;
    let finiteCount = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let id = 0; id < grid.size; id += 1) {
      if (predicate && !predicate(id)) continue;
      const area = cellArea(grid, id);
      totalArea += area;
      const value = Number(field[id] ?? NaN);
      if (!Number.isFinite(value)) continue;
      finiteCount += 1;
      finiteArea += area;
      weightedTotal += value * area;
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (value !== 0) nonZeroArea += area;
      if (value > 0) positiveArea += area;
      if (value < 0) negativeArea += area;
    }
    const safeTotalArea = Math.max(totalArea, Number.EPSILON);
    const safeFiniteArea = Math.max(finiteArea, Number.EPSILON);
    return {
      finiteShare: finiteArea / safeTotalArea,
      finiteCount,
      weightedMean: weightedTotal / safeFiniteArea,
      min: finiteCount ? min : null,
      max: finiteCount ? max : null,
      nonZeroShare: nonZeroArea / safeTotalArea,
      positiveShare: positiveArea / safeTotalArea,
      negativeShare: negativeArea / safeTotalArea,
      sampledArea: totalArea,
    };
  }

  function measureAreaStats(grid) {
    let total = 0;
    let min = Infinity;
    let max = 0;
    for (let id = 0; id < grid.size; id += 1) {
      const area = cellArea(grid, id);
      total += area;
      min = Math.min(min, area);
      max = Math.max(max, area);
    }
    return {
      areaTotal: total,
      areaTotalError: total - 4 * Math.PI,
      areaMin: min,
      areaMax: max,
      areaMinMaxRatio: max / Math.max(min, Number.EPSILON),
      equalAreaCell: 4 * Math.PI / Math.max(1, grid.size),
    };
  }

  function measureHemisphereAreaStats(grid) {
    let north = 0;
    let south = 0;
    let east = 0;
    let west = 0;
    for (let id = 0; id < grid.size; id += 1) {
      const area = cellArea(grid, id);
      if (grid.positionY[id] >= 0) north += area;
      else south += area;
      if (grid.positionZ[id] >= 0) east += area;
      else west += area;
    }
    return {
      northAreaShare: north / Math.max(north + south, Number.EPSILON),
      southAreaShare: south / Math.max(north + south, Number.EPSILON),
      eastAreaShare: east / Math.max(east + west, Number.EPSILON),
      westAreaShare: west / Math.max(east + west, Number.EPSILON),
    };
  }

  function finiteShare(field) {
    let finite = 0;
    for (let i = 0; i < field.length; i += 1) {
      if (Number.isFinite(field[i])) finite += 1;
    }
    return finite / Math.max(1, field.length);
  }

  function maxFinite(field) {
    let max = 0;
    for (let i = 0; i < field.length; i += 1) {
      if (Number.isFinite(field[i]) && field[i] > max) max = field[i];
    }
    return max;
  }

  function cellArea(grid, id) {
    return grid.area?.[id] ?? 1;
  }


  // ---- src/sim/sphere/plates.js ----

  const PLATE_SALT = 0x73706c74;
  const SPEED_SALT = 0x73707665;

  function createSphericalPlates({ seedUint32, plateCount = 14, intensity = 1 } = {}) {
    const count = Math.max(1, Math.trunc(plateCount));
    const centerX = new Float32Array(count);
    const centerY = new Float32Array(count);
    const centerZ = new Float32Array(count);
    const angularVelocityX = new Float32Array(count);
    const angularVelocityY = new Float32Array(count);
    const angularVelocityZ = new Float32Array(count);
    const speed = new Float32Array(count);

    const centerRandom = mulberry32(mixSeed(seedUint32 ?? 0, PLATE_SALT));
    const speedRandom = mulberry32(mixSeed(seedUint32 ?? 0, SPEED_SALT));

    for (let p = 0; p < count; p += 1) {
      const center = fibonacciSpherePoint(p, count, centerRandom);
      const axisSeed = randomUnitVector(speedRandom);
      const tangentAxis = tangentOrFallback(axisSeed, center);
      const spin = (0.0008 + speedRandom() * 0.0018) * Math.max(0, intensity);

      centerX[p] = center.x;
      centerY[p] = center.y;
      centerZ[p] = center.z;
      angularVelocityX[p] = tangentAxis.x * spin;
      angularVelocityY[p] = tangentAxis.y * spin;
      angularVelocityZ[p] = tangentAxis.z * spin;
      speed[p] = spin;
    }

    return {
      kind: "spherical-plates",
      count,
      centerX,
      centerY,
      centerZ,
      angularVelocityX,
      angularVelocityY,
      angularVelocityZ,
      speed,
    };
  }

  function driftSphericalPlates(plates, deltaTime = 1) {
    for (let p = 0; p < plates.count; p += 1) {
      const wx = plates.angularVelocityX[p];
      const wy = plates.angularVelocityY[p];
      const wz = plates.angularVelocityZ[p];
      const angularSpeed = Math.hypot(wx, wy, wz);
      if (angularSpeed <= 0) continue;
      const center = {
        x: plates.centerX[p],
        y: plates.centerY[p],
        z: plates.centerZ[p],
      };
      const axis = normalize3(wx, wy, wz);
      const next = rotateAroundAxis(center, axis, angularSpeed * deltaTime);
      plates.centerX[p] = next.x;
      plates.centerY[p] = next.y;
      plates.centerZ[p] = next.z;
    }
  }

  function assignNearestSphericalPlates(grid, plates) {
    const plate = new Int32Array(grid.size);
    const distance = new Float32Array(grid.size);

    for (let id = 0; id < grid.size; id += 1) {
      let bestPlate = 0;
      let bestDot = -Infinity;
      const x = grid.positionX[id];
      const y = grid.positionY[id];
      const z = grid.positionZ[id];
      for (let p = 0; p < plates.count; p += 1) {
        const d = dot3(x, y, z, plates.centerX[p], plates.centerY[p], plates.centerZ[p]);
        if (d > bestDot) {
          bestDot = d;
          bestPlate = p;
        }
      }
      plate[id] = bestPlate;
      distance[id] = Math.acos(Math.max(-1, Math.min(1, bestDot)));
    }

    return { plate, distance };
  }

  function sphericalPlateVelocityAt(plates, plateId, x, y, z) {
    return cross3(
      plates.angularVelocityX[plateId],
      plates.angularVelocityY[plateId],
      plates.angularVelocityZ[plateId],
      x,
      y,
      z,
    );
  }

  const SphericalBoundaryType = {
    INTERIOR: 0,
    CONVERGENT: 1,
    DIVERGENT: 2,
    TRANSFORM: 3,
  };

  function classifySphericalPlateBoundaries(grid, plates, assignment, options = {}) {
    const plate = assignment.plate ?? assignment;
    const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.000025;
    const boundaryType = new Uint8Array(grid.size);
    const stress = new Float32Array(grid.size);
    const activeBoundary = new Uint8Array(grid.size);
    const normalMotion = new Float32Array(grid.size);
    const shearMotion = new Float32Array(grid.size);

    for (let id = 0; id < grid.size; id += 1) {
      const currentPlate = plate[id];
      let convergent = 0;
      let divergent = 0;
      let shear = 0;
      let touchesBoundary = false;
      const start = grid.neighborStart[id];
      const count = grid.neighborCount[id];

      for (let k = 0; k < count; k += 1) {
        const nid = grid.neighbors[start + k];
        if (plate[nid] === currentPlate) continue;
        touchesBoundary = true;
        const split = splitSphericalBoundaryMotion(grid, plates, id, nid, currentPlate, plate[nid]);
        if (split.normal > threshold) divergent += split.normal;
        else if (split.normal < -threshold) convergent += -split.normal;
        shear += Math.abs(split.shear);
      }

      if (!touchesBoundary) continue;
      activeBoundary[id] = 1;
      normalMotion[id] = divergent - convergent;
      shearMotion[id] = shear;
      if (convergent > divergent && convergent > shear * 0.55) {
        boundaryType[id] = SphericalBoundaryType.CONVERGENT;
        stress[id] = convergent;
      } else if (divergent > convergent && divergent > shear * 0.55) {
        boundaryType[id] = SphericalBoundaryType.DIVERGENT;
        stress[id] = divergent;
      } else {
        boundaryType[id] = SphericalBoundaryType.TRANSFORM;
        stress[id] = shear * 0.5;
      }
    }

    return {
      boundaryType,
      stress,
      activeBoundary,
      normalMotion,
      shearMotion,
    };
  }

  function summarizeSphericalBoundaries(grid, classified) {
    const counts = {
      interior: 0,
      convergent: 0,
      divergent: 0,
      transform: 0,
      faceSeamBoundary: 0,
      activeBoundary: 0,
    };
    const areas = {
      total: 0,
      interior: 0,
      convergent: 0,
      divergent: 0,
      transform: 0,
      faceSeamBoundary: 0,
      activeBoundary: 0,
    };
    let stressTotal = 0;
    let stressMax = 0;
    let seamBoundaryStress = 0;

    for (let id = 0; id < grid.size; id += 1) {
      const type = classified.boundaryType[id];
      const area = grid.area?.[id] ?? 1;
      areas.total += area;
      if (type === SphericalBoundaryType.CONVERGENT) {
        counts.convergent += 1;
        areas.convergent += area;
      } else if (type === SphericalBoundaryType.DIVERGENT) {
        counts.divergent += 1;
        areas.divergent += area;
      } else if (type === SphericalBoundaryType.TRANSFORM) {
        counts.transform += 1;
        areas.transform += area;
      } else {
        counts.interior += 1;
        areas.interior += area;
      }

      if (!classified.activeBoundary[id]) continue;
      counts.activeBoundary += 1;
      areas.activeBoundary += area;
      const stress = classified.stress[id];
      stressTotal += stress * area;
      stressMax = Math.max(stressMax, stress);
      if (touchesFaceSeam(grid, id)) {
        counts.faceSeamBoundary += 1;
        areas.faceSeamBoundary += area;
        seamBoundaryStress += stress * area;
      }
    }

    const active = Math.max(1, counts.activeBoundary);
    const activeArea = Math.max(areas.activeBoundary, Number.EPSILON);
    return {
      ...counts,
      activeBoundaryArea: areas.activeBoundary,
      activeBoundaryCellShare: counts.activeBoundary / Math.max(1, grid.size),
      activeBoundaryShare: areas.activeBoundary / Math.max(areas.total, Number.EPSILON),
      convergentShareOfActive: areas.convergent / activeArea,
      divergentShareOfActive: areas.divergent / activeArea,
      transformShareOfActive: areas.transform / activeArea,
      faceSeamBoundaryShareOfActive: areas.faceSeamBoundary / activeArea,
      convergentCellShareOfActive: counts.convergent / active,
      divergentCellShareOfActive: counts.divergent / active,
      transformCellShareOfActive: counts.transform / active,
      stressMean: stressTotal / activeArea,
      stressMax,
      faceSeamStressMean: seamBoundaryStress / Math.max(areas.faceSeamBoundary, Number.EPSILON),
    };
  }

  function measureSphericalPlateDrift(initialPlates, currentPlates) {
    let total = 0;
    for (let p = 0; p < currentPlates.count; p += 1) {
      total += angularDistance3(
        initialPlates.centerX[p],
        initialPlates.centerY[p],
        initialPlates.centerZ[p],
        currentPlates.centerX[p],
        currentPlates.centerY[p],
        currentPlates.centerZ[p],
      );
    }
    return total / Math.max(1, currentPlates.count);
  }

  function splitSphericalBoundaryMotion(grid, plates, id, nid, plateA, plateB) {
    const ax = grid.positionX[id];
    const ay = grid.positionY[id];
    const az = grid.positionZ[id];
    const bx = grid.positionX[nid];
    const by = grid.positionY[nid];
    const bz = grid.positionZ[nid];
    const va = sphericalPlateVelocityAt(plates, plateA, ax, ay, az);
    const vb = sphericalPlateVelocityAt(plates, plateB, bx, by, bz);
    const rvx = vb.x - va.x;
    const rvy = vb.y - va.y;
    const rvz = vb.z - va.z;
    const mid = normalize3(ax + bx, ay + by, az + bz);
    const rawNormal = normalize3(bx - ax, by - ay, bz - az);
    const normalDotRadial = dot3(rawNormal.x, rawNormal.y, rawNormal.z, mid.x, mid.y, mid.z);
    const normal = normalize3(
      rawNormal.x - mid.x * normalDotRadial,
      rawNormal.y - mid.y * normalDotRadial,
      rawNormal.z - mid.z * normalDotRadial,
    );
    const tangent = cross3(mid.x, mid.y, mid.z, normal.x, normal.y, normal.z);
    return {
      normal: rvx * normal.x + rvy * normal.y + rvz * normal.z,
      shear: rvx * tangent.x + rvy * tangent.y + rvz * tangent.z,
    };
  }

  function touchesFaceSeam(grid, id) {
    const face = grid.face[id];
    const start = grid.neighborStart[id];
    const count = grid.neighborCount[id];
    for (let k = 0; k < count; k += 1) {
      if (grid.face[grid.neighbors[start + k]] !== face) return true;
    }
    return false;
  }

  function fibonacciSpherePoint(index, count, random) {
    const jitter = random();
    const k = index + jitter;
    const y = 1 - (2 * k + 1) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const theta = (k * goldenAngle + random() * TAU) % TAU;
    return {
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
    };
  }

  function randomUnitVector(random) {
    const z = random() * 2 - 1;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = random() * TAU;
    return {
      x: Math.cos(theta) * radius,
      y: z,
      z: Math.sin(theta) * radius,
    };
  }

  function tangentOrFallback(axisSeed, center) {
    const projectedDot = dot3(axisSeed.x, axisSeed.y, axisSeed.z, center.x, center.y, center.z);
    let tangent = normalize3(
      axisSeed.x - center.x * projectedDot,
      axisSeed.y - center.y * projectedDot,
      axisSeed.z - center.z * projectedDot,
    );
    if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.0001) {
      tangent = normalize3(-center.z, 0, center.x);
    }
    return tangent;
  }


  // ---- src/sim/sphere/topologyGraph.js ----
  function floodFillGraph(grid, seedIndices, passableFn) {
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

  function connectedComponentsGraph(grid, mask) {
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

  function deriveSphericalOceanConnectivity(grid, seaMask) {
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

  function distanceFromGraphSources(grid, sourceMask) {
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

  function smoothGraphField(grid, field, options = {}) {
    const iterations = Math.max(0, Math.trunc(options.iterations ?? 1));
    const strength = Math.max(0, Math.min(1, Number(options.strength ?? 0.5)));
    const mask = options.mask ?? null;
    let current = new Float32Array(field);
    let next = new Float32Array(grid.size);

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let id = 0; id < grid.size; id += 1) {
        if (mask && !mask[id]) {
          next[id] = current[id];
          continue;
        }
        const start = grid.neighborStart[id];
        const count = grid.neighborCount[id];
        let total = current[id];
        let weight = 1;
        for (let k = 0; k < count; k += 1) {
          const nid = grid.neighbors[start + k];
          if (mask && !mask[nid]) continue;
          total += current[nid];
          weight += 1;
        }
        const neighborMean = total / Math.max(1, weight);
        next[id] = current[id] * (1 - strength) + neighborMean * strength;
      }
      const swap = current;
      current = next;
      next = swap;
    }

    return current;
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


  // ---- src/sim/sphere/topology.js ----

  function createSphericalTopology(grid) {
    return {
      topologyKind: grid.topologyKind,
      width: grid.faceSize,
      height: grid.faceCount * grid.faceSize,
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


  // ---- src/sim/sphere/productionGridAdapter.js ----

  const FIELD_SPECS = [
    ["elev", Float32Array],
    ["baseElev", Float32Array],
    ["relief", Float32Array],
    ["boundaryRelief", Float32Array],
    ["geologyBroadNoise", Float32Array],
    ["geologyMicroNoise", Float32Array],
    ["scratch", Float32Array],
    ["scratch2", Float32Array],
    ["scratch3", Float32Array],
    ["crust", Float32Array],
    ["crustReference", Float32Array],
    ["crustType", Uint8Array],
    ["crustThickness", Float32Array],
    ["crustAge", Float32Array],
    ["crustDensity", Float32Array],
    ["weakness", Float32Array],
    ["plate", Int32Array],
    ["pvx", Float32Array],
    ["pvy", Float32Array],
    ["pvz", Float32Array],
    ["btype", Int8Array],
    ["boundaryKind", Int8Array],
    ["boundaryInfluence", Float32Array],
    ["boundaryDistance", Float32Array],
    ["boundaryDensity", Float32Array],
    ["boundaryCoherence", Float32Array],
    ["noisyBoundaryPatch", Uint8Array],
    ["plateCheckerboard", Float32Array],
    ["activeBoundary", Uint8Array],
    ["stress", Float32Array],
    ["uplift", Float32Array],
    ["riftStage", Uint8Array],
    ["riftAge", Float32Array],
    ["protoOceanCandidate", Uint8Array],
    ["externalSeaMask", Uint8Array],
    ["oceanConnectivity", Uint8Array],
    ["inlandWaterCandidate", Uint8Array],
    ["closedBasinId", Int32Array],
    ["passiveMargin", Float32Array],
    ["continentalShelf", Float32Array],
    ["continentalSlope", Float32Array],
    ["continentalRise", Float32Array],
    ["abyssalPlain", Float32Array],
    ["sedimentWedge", Float32Array],
    ["marginCoastDistance", Float32Array],
    ["marginContinentalDistance", Float32Array],
    ["marginOceanDistance", Float32Array],
    ["marginExternalSeaDistance", Float32Array],
    ["sediment", Float32Array],
    ["sedimentFlux", Float32Array],
    ["sedimentSink", Float32Array],
    ["sedimentCapacity", Float32Array],
    ["sedimentCompaction", Float32Array],
    ["sedimentLoadSubsidence", Float32Array],
    ["depositionRate", Float32Array],
    ["erosionRate", Float32Array],
    ["erosionSource", Float32Array],
    ["isostaticBase", Float32Array],
    ["crustBuoyancy", Float32Array],
    ["densitySubsidence", Float32Array],
    ["lithosphereCooling", Float32Array],
    ["isostaticResidual", Float32Array],
    ["ageSubsidence", Float32Array],
    ["thicknessBuoyancy", Float32Array],
    ["sedimentFill", Float32Array],
    ["ridgeUplift", Float32Array],
    ["trenchDepression", Float32Array],
    ["oceanDepthTerms", Float32Array],
    ["sedimentBudgetError", Float32Array],
    ["basin", Float32Array],
    ["orogeny", Float32Array],
    ["activeOrogeny", Float32Array],
    ["oldOrogeny", Float32Array],
    ["orogenyAge", Float32Array],
    ["orogenyErosion", Float32Array],
    ["forelandBasin", Float32Array],
    ["orogenicSedimentSupply", Float32Array],
    ["mountainBelt", Float32Array],
    ["mountainAxis", Float32Array],
    ["mountainAxisSeed", Float32Array],
    ["tectonicAxis", Float32Array],
    ["axisSegmentId", Int32Array],
    ["axisCurvature", Float32Array],
    ["axisContinuity", Float32Array],
    ["axisBoundaryDependency", Float32Array],
    ["mountainHeight", Float32Array],
    ["mountainHeightBlockiness", Float32Array],
    ["orographicBarrier", Float32Array],
    ["orographicBarrierContinuity", Float32Array],
    ["planetaryRelief", Float32Array],
    ["tectonicReliefSupply", Float32Array],
    ["isostaticReliefSupply", Float32Array],
    ["erosionFlatteningPressure", Float32Array],
    ["sedimentSmoothingPressure", Float32Array],
    ["reliefDeficit", Float32Array],
    ["seaLevelSensitivity", Float32Array],
    ["largePlainMask", Uint8Array],
    ["flatLandMask", Uint8Array],
    ["coastalSensitivity", Float32Array],
    ["ridgeVolumeSignal", Float32Array],
    ["oldOceanCapacitySignal", Float32Array],
    ["sedimentDisplacementSignal", Float32Array],
    ["trenchCapacitySignal", Float32Array],
    ["ridge", Float32Array],
    ["ridgeDistance", Float32Array],
    ["trench", Float32Array],
    ["rift", Float32Array],
    ["islandArc", Float32Array],
    ["ridgeAxis", Float32Array],
    ["trenchAxis", Float32Array],
    ["riftAxis", Float32Array],
    ["activeTransform", Float32Array],
    ["transformMemory", Float32Array],
    ["fractureZoneMemory", Float32Array],
    ["inactiveBoundaryRelief", Float32Array],
    ["oldBoundaryCorrelation", Float32Array],
    ["ageBandStraightnessRisk", Float32Array],
    ["isContinental", Uint8Array],
    ["isYoungOcean", Uint8Array],
    ["tectonicFeature", Int8Array],
    ["featureIntensity", Float32Array],
    ["diagnosticElevation", Float32Array],
    ["diagnosticSeaCandidate", Uint8Array],
    ["diagnosticRidgeCandidate", Float32Array],
    ["diagnosticTrenchCandidate", Float32Array],
  ];

  function createCubedSphereProductionGridAdapter({
    faceSize = 64,
    seedUint32 = 0,
  } = {}) {
    const sphericalGrid = createCubedSphereGrid(faceSize);
    const topology = createSphericalTopology(sphericalGrid);
    const grid = {
      kind: "cubed-sphere-production-grid-adapter",
      topologyKind: "cubed-sphere",
      size: sphericalGrid.size,
      cellCount: sphericalGrid.size,
      faceSize: sphericalGrid.faceSize,
      faceCount: sphericalGrid.faceCount,
      sphericalGrid,
      topology,
      topologyOptions: {
        kind: "cubed-sphere",
        graphBacked: true,
        wrapX: false,
        wrapY: false,
        rectangularIndexing: false,
      },
      positionX: sphericalGrid.positionX,
      positionY: sphericalGrid.positionY,
      positionZ: sphericalGrid.positionZ,
      lon: sphericalGrid.lon,
      lat: sphericalGrid.lat,
      area: sphericalGrid.area,
      face: sphericalGrid.face,
      faceU: sphericalGrid.faceU,
      faceV: sphericalGrid.faceV,
      neighborStart: sphericalGrid.neighborStart,
      neighborCount: sphericalGrid.neighborCount,
      neighbors: sphericalGrid.neighbors,
      edgeLength: sphericalGrid.edgeLength,
      edgeTangentX: sphericalGrid.edgeTangentX,
      edgeTangentY: sphericalGrid.edgeTangentY,
      edgeTangentZ: sphericalGrid.edgeTangentZ,
    };

    for (const [name, Type] of FIELD_SPECS) {
      grid[name] = new Type(sphericalGrid.size);
    }

    populateProductionAdapterDiagnosticTerrain(grid, { seedUint32 });
    return grid;
  }

  function populateProductionAdapterDiagnosticTerrain(grid, { seedUint32 = 0 } = {}) {
    const diagnosticNoise = createSphericalDiagnosticNoiseFields(grid, seedUint32);
    const diagnosticBoundaries = createDiagnosticBoundaryProbe(grid);
    const diagnosticTerrain = createSphericalDiagnosticTerrainFields(
      grid,
      diagnosticNoise,
      diagnosticBoundaries,
    );
    grid.diagnosticNoise = diagnosticNoise;
    grid.diagnosticBoundaries = diagnosticBoundaries;
    grid.diagnosticTerrain = diagnosticTerrain;
    grid.diagnosticElevation.set(diagnosticTerrain.elevation);
    grid.diagnosticSeaCandidate.set(diagnosticTerrain.seaCandidate);
    grid.diagnosticRidgeCandidate.set(diagnosticTerrain.ridgeCandidate);
    grid.diagnosticTrenchCandidate.set(diagnosticTerrain.trenchCandidate);
    grid.baseElev.set(diagnosticTerrain.elevation);
    grid.elev.set(diagnosticTerrain.elevation);
    grid.relief.set(diagnosticNoise.combined);
    grid.isostaticBase.set(diagnosticTerrain.elevation);
    grid.ridge.set(diagnosticTerrain.ridgeCandidate);
    grid.ridgeAxis.set(diagnosticTerrain.ridgeCandidate);
    grid.ridgeUplift.set(diagnosticTerrain.ridgeCandidate);
    grid.trench.set(diagnosticTerrain.trenchCandidate);
    grid.trenchAxis.set(diagnosticTerrain.trenchCandidate);
    grid.trenchDepression.set(diagnosticTerrain.trenchCandidate);
    grid.tectonicAxis.set(diagnosticTerrain.ridgeCandidate);
    for (let id = 0; id < grid.size; id += 1) {
      const sea = diagnosticTerrain.seaCandidate[id] ? 1 : 0;
      const ridge = diagnosticTerrain.ridgeCandidate[id];
      const trench = diagnosticTerrain.trenchCandidate[id];
      grid.crustType[id] = sea ? 0 : 1;
      grid.crustThickness[id] = sea ? 0.28 : 0.64;
      grid.crustAge[id] = sea ? Math.max(0.02, Math.min(1, 0.45 + grid.positionY[id] * 0.22)) : 0;
      grid.crustDensity[id] = sea ? 0.62 : 0.32;
      grid.weakness[id] = Math.max(ridge, trench, Math.abs(diagnosticNoise.micro[id]) * 0.2);
      grid.boundaryInfluence[id] = Math.max(ridge, trench);
      grid.activeBoundary[id] = grid.boundaryInfluence[id] > 0 ? 1 : 0;
      grid.boundaryKind[id] = ridge > 0 ? 2 : trench > 0 ? 1 : 0;
      grid.stress[id] = Math.max(ridge, trench);
      grid.crustBuoyancy[id] = sea ? -0.08 : 0.08;
      grid.densitySubsidence[id] = sea ? -0.04 : 0.01;
      grid.lithosphereCooling[id] = sea ? -grid.crustAge[id] * 0.05 : 0;
      grid.ageSubsidence[id] = -grid.crustAge[id] * 0.05;
      grid.thicknessBuoyancy[id] = grid.crustThickness[id] * 0.12;
      grid.oceanDepthTerms[id] = sea ? grid.ageSubsidence[id] + grid.densitySubsidence[id] : 0;
      grid.isostaticResidual[id] = grid.elev[id] - grid.isostaticBase[id];
      grid.abyssalPlain[id] = sea && Math.abs(grid.elev[id] - diagnosticTerrain.seaLevel) > 0.16 ? 0.35 : 0;
      grid.continentalShelf[id] = sea && Math.abs(grid.elev[id] - diagnosticTerrain.seaLevel) < 0.08 ? 0.28 : 0;
      grid.continentalSlope[id] = sea && grid.continentalShelf[id] > 0 ? 0.12 : 0;
      grid.passiveMargin[id] = grid.continentalShelf[id] * 0.5;
      grid.sedimentCapacity[id] = sea ? 0.25 : 0.18;
      grid.sedimentSink[id] = Math.max(grid.continentalShelf[id], grid.abyssalPlain[id] * 0.2) * 0.1;
      grid.sediment[id] = grid.sedimentSink[id] * 0.4;
      grid.sedimentFill[id] = grid.sediment[id] * 0.08;
      grid.mountainHeight[id] = Math.max(0, grid.elev[id] - diagnosticTerrain.seaLevel);
      grid.orographicBarrier[id] = grid.mountainHeight[id] * 0.25;
      grid.planetaryRelief[id] = Math.abs(grid.relief[id]);
      grid.coastalSensitivity[id] = Math.max(0, 1 - Math.abs(grid.elev[id] - diagnosticTerrain.seaLevel) / 0.08);
    }
    grid.externalSeaMask.fill(0);
    grid.oceanConnectivity.fill(0);
    grid.inlandWaterCandidate.fill(0);
    grid.closedBasinId.fill(0);
    const connectivity = deriveSphericalOceanConnectivity(grid, grid.diagnosticSeaCandidate);
    grid.externalSeaMask.set(connectivity.externalSeaMask);
    grid.oceanConnectivity.set(connectivity.oceanConnectivity);
    grid.inlandWaterCandidate.set(connectivity.inlandWaterCandidate);
    grid.closedBasinId.set(connectivity.closedBasinId);
    grid.diagnosticConnectivity = connectivity;
    grid.diagnosticDistanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);
    return grid;
  }

  function summarizeProductionGridAdapter(grid) {
    const areaTotal = sumField(grid.area);
    const synthetic = createStatsProbeFields(grid);
    const categoryShares = weightedCategoryShares(grid, synthetic.category, 3);
    const connectivity = createConnectivityProbe(grid, synthetic.seaMask);
    return {
      kind: grid.kind,
      topologyKind: grid.topologyKind,
      topologyApiKind: grid.topology?.topologyKind ?? null,
      size: grid.size,
      cellCount: grid.cellCount,
      faceSize: grid.faceSize,
      faceCount: grid.faceCount,
      hasLegacyDimensions: Object.hasOwn(grid, "width") && Object.hasOwn(grid, "height"),
      rectangularIndexing: Boolean(grid.topologyOptions?.rectangularIndexing),
      graphBacked: Boolean(grid.topologyOptions?.graphBacked),
      areaTotal,
      areaTotalError: Math.abs(areaTotal - 4 * Math.PI),
      areaStats: measureAreaStats(grid),
      hemisphereAreaStats: measureHemisphereAreaStats(grid),
      fieldCount: FIELD_SPECS.length,
      allFieldsMatchSize: FIELD_SPECS.every(([name]) => grid[name]?.length === grid.size),
      neighborSymmetryValid: measureNeighborSymmetry(grid),
      fieldSummaries: summarizeAdapterFields(grid),
      statsProbe: {
        weightedSum: weightedSum(grid, synthetic.scalar),
        weightedMean: weightedMean(grid, synthetic.scalar),
        northShare: weightedShare(grid, synthetic.northMask),
        categoryShares: Array.from(categoryShares.shares),
        categoryShareTotal: Array.from(categoryShares.shares).reduce((sum, value) => sum + value, 0),
        categoryTotalArea: categoryShares.totalArea,
      },
      connectivityProbe: connectivity,
      diagnosticTerrainProbe: createDiagnosticTerrainProbe(grid),
    };
  }

  function productionAdapterFieldNames() {
    return FIELD_SPECS.map(([name]) => name);
  }

  function summarizeAdapterFields(grid, names = productionAdapterFieldNames()) {
    const summaries = {};
    for (const name of names) {
      if (!grid[name] || grid[name].length !== grid.size) continue;
      summaries[name] = weightedFieldSummary(grid, grid[name]);
    }
    return summaries;
  }

  function measureNeighborSymmetry(grid) {
    let valid = true;
    for (let id = 0; id < grid.size && valid; id += 1) {
      const start = grid.neighborStart[id];
      for (let k = 0; k < grid.neighborCount[id]; k += 1) {
        const nid = grid.neighbors[start + k];
        if (!hasNeighbor(grid, nid, id)) {
          valid = false;
          break;
        }
      }
    }
    return valid;
  }

  function hasNeighbor(grid, id, target) {
    const start = grid.neighborStart[id];
    for (let k = 0; k < grid.neighborCount[id]; k += 1) {
      if (grid.neighbors[start + k] === target) return true;
    }
    return false;
  }

  function sumField(field) {
    let total = 0;
    for (let i = 0; i < field.length; i += 1) total += field[i];
    return total;
  }

  function createStatsProbeFields(grid) {
    const scalar = new Float32Array(grid.size);
    const northMask = new Uint8Array(grid.size);
    const category = new Int32Array(grid.size);
    const seaMask = new Uint8Array(grid.size);
    for (let id = 0; id < grid.size; id += 1) {
      const x = grid.positionX[id];
      const y = grid.positionY[id];
      const z = grid.positionZ[id];
      scalar[id] = grid.positionY[id] * 0.5 + grid.positionZ[id] * 0.25;
      northMask[id] = grid.positionY[id] >= 0 ? 1 : 0;
      category[id] = grid.face[id] % 3;
      if (
        y < 0.26 ||
        (z > 0.25 && x < 0.2) ||
        (x > 0.34 && x < 0.62 && y > 0.38 && z > -0.18 && z < 0.28) ||
        (x < -0.42 && y > 0.18 && y < 0.56 && z < -0.18)
      ) {
        seaMask[id] = 1;
      }
    }
    return { scalar, northMask, category, seaMask };
  }

  function createConnectivityProbe(grid, seaMask) {
    const connectivity = deriveSphericalOceanConnectivity(grid, seaMask);
    const distanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);
    return {
      seaShare: weightedShare(grid, seaMask),
      externalSeaShare: weightedShare(grid, connectivity.externalSeaMask),
      inlandWaterCandidateShare: weightedShare(grid, connectivity.inlandWaterCandidate),
      closedBasinCount: connectivity.closedBasinCount,
      componentCount: connectivity.componentCount,
      externalComponent: connectivity.externalComponent,
      externalArea: connectivity.externalArea,
      closedBasinIdMax: maxInt(connectivity.closedBasinId),
      distanceFiniteShare: finiteShare(distanceToExternalSea),
      distanceMaxFinite: maxFinite(distanceToExternalSea),
      largestComponentIsExternal: isLargestExternalComponent(connectivity),
    };
  }

  function createDiagnosticTerrainProbe(grid) {
    const terrain = grid.diagnosticTerrain;
    const connectivity = grid.diagnosticConnectivity;
    const distance = grid.diagnosticDistanceToExternalSea;
    return {
      hasDiagnosticTerrain: Boolean(terrain),
      seaLevel: terrain?.seaLevel ?? null,
      elevationMean: weightedMean(grid, grid.diagnosticElevation),
      seaCandidateShare: weightedShare(grid, grid.diagnosticSeaCandidate),
      externalSeaShare: weightedShare(grid, grid.externalSeaMask),
      inlandWaterCandidateShare: weightedShare(grid, grid.inlandWaterCandidate),
      closedBasinCount: connectivity?.closedBasinCount ?? 0,
      distanceFiniteShare: distance ? finiteShare(distance) : 0,
      ridgeCandidateMean: weightedMean(grid, grid.diagnosticRidgeCandidate),
      trenchCandidateMean: weightedMean(grid, grid.diagnosticTrenchCandidate),
      noiseCombinedMean: grid.diagnosticNoise ? weightedMean(grid, grid.diagnosticNoise.combined) : null,
    };
  }

  function createDiagnosticBoundaryProbe(grid) {
    const boundaryType = new Uint8Array(grid.size);
    const stress = new Float32Array(grid.size);
    for (let id = 0; id < grid.size; id += 1) {
      const x = grid.positionX[id];
      const y = grid.positionY[id];
      const z = grid.positionZ[id];
      const ridge = Math.abs(z + Math.sin(y * 3.1) * 0.18) < 0.035 && x > -0.75;
      const trench = Math.abs(x - Math.cos(z * 2.3) * 0.28) < 0.03 && y < 0.42;
      if (ridge) {
        boundaryType[id] = 2;
        stress[id] = 0.004 + Math.abs(y) * 0.002;
      } else if (trench) {
        boundaryType[id] = 1;
        stress[id] = 0.004 + Math.abs(z) * 0.002;
      }
    }
    return { boundaryType, stress };
  }

  function isLargestExternalComponent(connectivity) {
    for (let component = 1; component <= connectivity.componentCount; component += 1) {
      if (component === connectivity.externalComponent) continue;
      if ((connectivity.componentAreas[component] ?? 0) > connectivity.externalArea + 1e-8) return false;
    }
    return true;
  }

  function maxInt(field) {
    let max = 0;
    for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
    return max;
  }


  // ---- src/sim/sphere/sphericalWorld.js ----

  const DIAGNOSTIC_NOISE_SALT = 0x5f51d3ed;

  function createSphericalExperimentalWorld({
    seedUint32 = 0,
    seedText = "",
    faceSize = 64,
    plateCount = 14,
    intensity = 1,
    steps = 0,
  } = {}) {
    const grid = createCubedSphereGrid(faceSize);
    const topology = createSphericalTopology(grid);
    const plates = createSphericalPlates({ seedUint32, plateCount, intensity });
    const initialPlates = cloneSphericalPlates(plates);

    for (let i = 0; i < steps; i += 1) driftSphericalPlates(plates, 1);

    const diagnosticNoise = createSphericalDiagnosticNoiseFields(grid, seedUint32);
    const geometricSeaMask = createDiagnosticSeaMask(grid);
    const world = {
      kind: "spherical-experimental-world",
      role: "diagnostic-sidecar",
      authoritative: false,
      writesProductionState: false,
      diagnosticPurpose: "legacy spherical probes only; production geology reads world.grid",
      seedText,
      seedUint32,
      grid,
      topology,
      plates,
      initialPlates,
      geometricSeaMask,
      diagnosticNoise,
      diagnosticStep: steps,
    };
    return rebuildSphericalExperimentalWorldDerived(world);
  }

  function stepSphericalExperimentalWorld(world, deltaTime = 1) {
    if (!world || world.kind !== "spherical-experimental-world") return world;
    driftSphericalPlates(world.plates, deltaTime);
    world.diagnosticStep = (world.diagnosticStep ?? 0) + deltaTime;
    return rebuildSphericalExperimentalWorldDerived(world);
  }

  function rebuildSphericalExperimentalWorldDerived(world) {
    const grid = world.grid;
    world.plateAssignment = assignNearestSphericalPlates(grid, world.plates);
    world.boundaries = classifySphericalPlateBoundaries(grid, world.plates, world.plateAssignment);
    world.boundarySummary = summarizeSphericalBoundaries(grid, world.boundaries);
    world.diagnosticTerrain = createSphericalDiagnosticTerrainFields(
      grid,
      world.diagnosticNoise,
      world.boundaries,
    );
    world.seaMask = world.diagnosticTerrain.seaCandidate;
    world.connectivity = deriveSphericalOceanConnectivity(grid, world.seaMask);
    world.distanceToExternalSea = distanceFromGraphSources(grid, world.connectivity.externalSeaMask);
    world.stats = summarizeSphericalExperimentalWorld(world);
    return world;
  }

  function summarizeSphericalExperimentalWorld(world) {
    const grid = world.grid;
    return {
      topologyKind: grid.topologyKind,
      topologyApiKind: world.topology?.topologyKind ?? null,
      faceSize: grid.faceSize,
      cellCount: grid.size,
      plateCount: world.plates.count,
      meanPlateDriftRadians: measureSphericalPlateDrift(world.initialPlates, world.plates),
      plateCoverage: measurePlateCoverage(grid, world.plateAssignment.plate, world.plates.count),
      activeBoundaryShare: world.boundarySummary.activeBoundaryShare,
      convergentShareOfActive: world.boundarySummary.convergentShareOfActive,
      divergentShareOfActive: world.boundarySummary.divergentShareOfActive,
      transformShareOfActive: world.boundarySummary.transformShareOfActive,
      faceSeamBoundaryShareOfActive: world.boundarySummary.faceSeamBoundaryShareOfActive,
      geometricSeaShare: weightedShare(grid, world.geometricSeaMask),
      derivedSeaShare: weightedShare(grid, world.seaMask),
      geometricDerivedSeaOverlapShare: weightedOverlapShare(grid, world.geometricSeaMask, world.seaMask),
      externalSeaShare: weightedShare(grid, world.connectivity.externalSeaMask),
      inlandWaterCandidateShare: weightedShare(grid, world.connectivity.inlandWaterCandidate),
      closedBasinCount: world.connectivity.closedBasinCount,
      distanceToExternalSeaFiniteShare: finiteShare(world.distanceToExternalSea),
      distanceToExternalSeaMax: maxFinite(world.distanceToExternalSea),
      diagnosticBroadNoiseMean: weightedMean(grid, world.diagnosticNoise.broad),
      diagnosticMicroNoiseMean: weightedMean(grid, world.diagnosticNoise.micro),
      diagnosticNoiseRange: maxFinite(world.diagnosticNoise.combined) - minFinite(world.diagnosticNoise.combined),
      diagnosticElevationMean: weightedMean(grid, world.diagnosticTerrain.elevation),
      diagnosticElevationRange: maxFinite(world.diagnosticTerrain.elevation) - minFinite(world.diagnosticTerrain.elevation),
      diagnosticSeaCandidateShare: weightedShare(grid, world.diagnosticTerrain.seaCandidate),
    };
  }

  function createSphericalDiagnosticNoiseFields(grid, seedUint32 = 0) {
    const noise = createValueNoise3D(mixSeed(seedUint32, DIAGNOSTIC_NOISE_SALT));
    const broad = new Float32Array(grid.size);
    const micro = new Float32Array(grid.size);
    const combined = new Float32Array(grid.size);
    for (let id = 0; id < grid.size; id += 1) {
      const x = grid.positionX[id];
      const y = grid.positionY[id];
      const z = grid.positionZ[id];
      broad[id] = noise(x * 2.1 + 31, y * 2.1 - 17, z * 2.1 + 5, 5, 2, 0.52);
      micro[id] = noise(x * 8.5 - 7, y * 8.5 + 3, z * 8.5 + 23, 3, 2.2, 0.45);
      combined[id] = broad[id] * 0.72 + micro[id] * 0.28;
    }
    return { broad, micro, combined };
  }

  function createSphericalDiagnosticTerrainFields(grid, diagnosticNoise, boundaries) {
    const elevation = new Float32Array(grid.size);
    const seaCandidate = new Uint8Array(grid.size);
    const ridgeCandidate = new Float32Array(grid.size);
    const trenchCandidate = new Float32Array(grid.size);
    const targetSeaShare = 0.58;

    for (let id = 0; id < grid.size; id += 1) {
      const x = grid.positionX[id];
      const y = grid.positionY[id];
      const z = grid.positionZ[id];
      const latitudeLift = y * 0.05;
      const basinWave =
        Math.sin(x * 2.2 + z * 1.4) * 0.18 +
        Math.cos(z * 2.0 - y * 1.3) * 0.16 -
        Math.sin((x - y + z) * 1.15) * 0.12;
      const noiseRelief = diagnosticNoise.combined[id] * 0.18 + diagnosticNoise.broad[id] * 0.22;
      const divergent = boundaries.boundaryType[id] === 2 ? boundaries.stress[id] * 42 : 0;
      const convergent = boundaries.boundaryType[id] === 1 ? boundaries.stress[id] * 36 : 0;
      ridgeCandidate[id] = divergent;
      trenchCandidate[id] = convergent;
      elevation[id] = basinWave + noiseRelief + latitudeLift + divergent * 0.12 - convergent * 0.08;
    }

    const seaLevel = areaWeightedQuantile(grid, elevation, targetSeaShare);
    for (let id = 0; id < grid.size; id += 1) {
      if (elevation[id] <= seaLevel) seaCandidate[id] = 1;
    }

    return { elevation, seaCandidate, ridgeCandidate, trenchCandidate, seaLevel };
  }

  function createDiagnosticSeaMask(grid) {
    const seaMask = new Uint8Array(grid.size);
    for (let id = 0; id < grid.size; id += 1) {
      const x = grid.positionX[id];
      const y = grid.positionY[id];
      const z = grid.positionZ[id];
      const externalOcean = y < 0.24 || (z > 0.28 && x < 0.18);
      const closedBasin = x > 0.34 && x < 0.62 && y > 0.38 && z > -0.18 && z < 0.28;
      if (externalOcean || closedBasin) seaMask[id] = 1;
    }
    return seaMask;
  }

  function weightedMean(grid, field) {
    let total = 0;
    let weight = 0;
    for (let id = 0; id < grid.size; id += 1) {
      const area = grid.area?.[id] ?? 1;
      total += field[id] * area;
      weight += area;
    }
    return total / Math.max(weight, Number.EPSILON);
  }

  function weightedOverlapShare(grid, a, b) {
    let overlap = 0;
    let total = 0;
    for (let id = 0; id < grid.size; id += 1) {
      const area = grid.area?.[id] ?? 1;
      total += area;
      if (a[id] && b[id]) overlap += area;
    }
    return overlap / Math.max(total, Number.EPSILON);
  }

  function areaWeightedQuantile(grid, field, targetShare) {
    const samples = [];
    let totalArea = 0;
    for (let id = 0; id < grid.size; id += 1) {
      const area = grid.area?.[id] ?? 1;
      samples.push({ value: field[id], area });
      totalArea += area;
    }
    samples.sort((a, b) => a.value - b.value);
    const targetArea = totalArea * Math.max(0, Math.min(1, targetShare));
    let cumulative = 0;
    for (const sample of samples) {
      cumulative += sample.area;
      if (cumulative >= targetArea) return sample.value;
    }
    return samples[samples.length - 1]?.value ?? 0;
  }

  function minFinite(field) {
    let min = Infinity;
    for (let i = 0; i < field.length; i += 1) {
      if (Number.isFinite(field[i]) && field[i] < min) min = field[i];
    }
    return min;
  }

  function cloneSphericalPlates(plates) {
    return {
      kind: plates.kind,
      count: plates.count,
      centerX: new Float32Array(plates.centerX),
      centerY: new Float32Array(plates.centerY),
      centerZ: new Float32Array(plates.centerZ),
      angularVelocityX: new Float32Array(plates.angularVelocityX),
      angularVelocityY: new Float32Array(plates.angularVelocityY),
      angularVelocityZ: new Float32Array(plates.angularVelocityZ),
      speed: new Float32Array(plates.speed),
    };
  }

  function measurePlateCoverage(grid, plate, plateCount) {
    const { areaByCategory: areaByPlate, totalArea: total } = weightedCategoryShares(grid, plate, plateCount);
    let min = Infinity;
    let max = 0;
    let emptyCount = 0;
    for (let p = 0; p < plateCount; p += 1) {
      const share = areaByPlate[p] / Math.max(total, Number.EPSILON);
      min = Math.min(min, share);
      max = Math.max(max, share);
      if (areaByPlate[p] <= 0) emptyCount += 1;
    }
    return {
      min,
      max,
      mean: 1 / Math.max(1, plateCount),
      emptyCount,
    };
  }


  // ---- src/sim/noise.js ----

  function createValueNoise3D(seed) {
    const random = mulberry32(mixSeed(seed, 0x9e3779b9));
    const values = new Float32Array(256);
    for (let i = 0; i < values.length; i += 1) {
      values[i] = random() * 2 - 1;
    }

    function sample(x, y, z) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const z0 = Math.floor(z);
      const xf = x - x0;
      const yf = y - y0;
      const zf = z - z0;
      const u = fade(xf);
      const v = fade(yf);
      const w = fade(zf);

      const c000 = lattice(values, x0, y0, z0);
      const c100 = lattice(values, x0 + 1, y0, z0);
      const c010 = lattice(values, x0, y0 + 1, z0);
      const c110 = lattice(values, x0 + 1, y0 + 1, z0);
      const c001 = lattice(values, x0, y0, z0 + 1);
      const c101 = lattice(values, x0 + 1, y0, z0 + 1);
      const c011 = lattice(values, x0, y0 + 1, z0 + 1);
      const c111 = lattice(values, x0 + 1, y0 + 1, z0 + 1);

      const x00 = lerp(c000, c100, u);
      const x10 = lerp(c010, c110, u);
      const x01 = lerp(c001, c101, u);
      const x11 = lerp(c011, c111, u);
      return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
    }

    return function fbmSphere(nx, ny, nz, octaves = 6, lacunarity = 2, gain = 0.5) {
      let amp = 1;
      let freq = 1;
      let sum = 0;
      let norm = 0;
      for (let octave = 0; octave < octaves; octave += 1) {
        sum += amp * sample(nx * freq, ny * freq, nz * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    };
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lattice(values, x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return values[(h ^ (h >>> 16)) & 255];
  }


  // ---- src/sim/terrain.js ----

  function initializeBaseTerrain(world) {
    const { grid, seedUint32 } = world;
    grid.relief.fill(0);
    grid.boundaryRelief.fill(0);
    grid.boundaryDensity.fill(0);
    grid.boundaryCoherence.fill(1);
    grid.noisyBoundaryPatch.fill(0);
    grid.plateCheckerboard.fill(0);
    grid.orogeny.fill(0);
    grid.activeOrogeny.fill(0);
    grid.oldOrogeny.fill(0);
    grid.orogenyAge.fill(0);
    grid.orogenyErosion.fill(0);
    grid.forelandBasin.fill(0);
    grid.mountainAxis.fill(0);
    grid.mountainHeight.fill(0);
    grid.orographicBarrier.fill(0);
    grid.orogenicSedimentSupply.fill(0);
    grid.tectonicAxis.fill(0);
    grid.mountainAxisSeed.fill(0);
    grid.ridgeAxis.fill(0);
    grid.trenchAxis.fill(0);
    grid.riftAxis.fill(0);
    grid.axisSegmentId.fill(0);
    grid.axisCurvature.fill(0);
    grid.axisContinuity.fill(0);
    grid.axisBoundaryDependency.fill(0);
    grid.mountainHeightBlockiness.fill(0);
    grid.orographicBarrierContinuity.fill(0);
    grid.planetaryRelief.fill(0);
    grid.tectonicReliefSupply.fill(0);
    grid.isostaticReliefSupply.fill(0);
    grid.erosionFlatteningPressure.fill(0);
    grid.sedimentSmoothingPressure.fill(0);
    grid.reliefDeficit.fill(0);
    grid.seaLevelSensitivity.fill(0);
    grid.largePlainMask.fill(0);
    grid.flatLandMask.fill(0);
    grid.ridgeVolumeSignal.fill(0);
    grid.oldOceanCapacitySignal.fill(0);
    grid.sedimentDisplacementSignal.fill(0);
    grid.trenchCapacitySignal.fill(0);
    grid.coastalSensitivity.fill(0);
    grid.isYoungOcean.fill(0);
    grid.featureIntensity.fill(0);
    grid.mountainBelt.fill(0);
    grid.trench.fill(0);
    grid.ridge.fill(0);
    grid.riftStage.fill(0);
    grid.riftAge.fill(0);
    grid.protoOceanCandidate.fill(0);
    grid.inlandWaterCandidate.fill(0);
    grid.externalSeaMask.fill(0);
    grid.oceanConnectivity.fill(0);
    grid.closedBasinId.fill(0);
    grid.passiveMargin.fill(0);
    grid.continentalShelf.fill(0);
    grid.continentalSlope.fill(0);
    grid.continentalRise.fill(0);
    grid.abyssalPlain.fill(0);
    grid.sedimentWedge.fill(0);
    grid.marginCoastDistance.fill(0);
    grid.marginContinentalDistance.fill(0);
    grid.marginOceanDistance.fill(0);
    grid.marginExternalSeaDistance.fill(0);
    grid.activeTransform.fill(0);
    grid.transformMemory.fill(0);
    grid.fractureZoneMemory.fill(0);
    grid.inactiveBoundaryRelief.fill(0);
    grid.oldBoundaryCorrelation.fill(0);
    grid.ageBandStraightnessRisk.fill(0);
    grid.ridgeDistance.fill(0);
    grid.isostaticBase.fill(0);
    grid.crustBuoyancy.fill(0);
    grid.densitySubsidence.fill(0);
    grid.lithosphereCooling.fill(0);
    grid.isostaticResidual.fill(0);
    grid.ageSubsidence.fill(0);
    grid.thicknessBuoyancy.fill(0);
    grid.sedimentFill.fill(0);
    grid.erosionSource.fill(0);
    grid.sedimentFlux.fill(0);
    grid.sedimentSink.fill(0);
    grid.sedimentCapacity.fill(0);
    grid.sedimentCompaction.fill(0);
    grid.sedimentLoadSubsidence.fill(0);
    grid.depositionRate.fill(0);
    grid.erosionRate.fill(0);
    grid.sedimentBudgetError.fill(0);
    grid.ridgeUplift.fill(0);
    grid.trenchDepression.fill(0);
    grid.oceanDepthTerms.fill(0);
    grid.rift.fill(0);
    grid.islandArc.fill(0);
    grid.basin.fill(0);
    world.continentNoise = createValueNoise3D(mixSeed(seedUint32, 0x51f15eed));
    world.textureNoise = createValueNoise3D(mixSeed(seedUint32, 0xa24baed1));
    world.geologicSeaLevelOffset = 0;
    world.baseSeaLevel = 0;
    world.geologicSeaLevelTargetOffset = 0;
    world.geologicSeaLevelPreviousOffset = 0;
    world.geologicSeaLevelStep = -1;
    world.geologicSeaLevelDiagnostics = null;
    world.sedimentBudgetStep = -1;
    world.sedimentBudgetDiagnostics = null;
    initializeCrust(world);
    grid.crustReference.set(grid.crust);
    initializeCrustState(grid);
    initializeWeakness(world);
    rebuildElevation(world);
  }

  function initializeCrustState(grid) {
    const { size, crust, crustType, crustThickness, crustAge, crustDensity } = grid;
    for (let i = 0; i < size; i += 1) {
      const continental = crust[i] > 0;
      crustType[i] = continental ? 1 : 0;
      crustThickness[i] = continental ? 0.62 + Math.min(0.38, Math.max(0, crust[i]) * 0.32) : 0.22 + Math.max(0, crust[i] + 1.4) * 0.08;
      crustAge[i] = continental ? 0.65 : 0.18;
      crustDensity[i] = continental ? 0.42 : 0.72;
    }
  }

  function initializeCrust(world) {
    const { grid, params, continentNoise, textureNoise } = world;
    const { crust } = grid;
    const threshold = -0.08 + (params.waterLevel / 100 - 0.5) * 0.78;

    forEachGridCell(grid, (id, x, y) => {
      const sphere = spherePointForGridCell(grid, id, x, y);
      const continentality = continentNoise(sphere.x * 1.45 + 17, sphere.y * 1.45 - 3, sphere.z * 1.45 + 9, 5, 2, 0.54);
      const ragged = textureNoise(sphere.x * 3.7 - 5, sphere.y * 3.7 + 13, sphere.z * 3.7 + 2, 3, 2, 0.45) * 0.18;
      crust[id] = continentality + ragged - threshold;
    });
  }

  function initializeWeakness(world) {
    const { grid, textureNoise } = world;
    const { weakness, crust } = grid;
    forEachGridCell(grid, (id, x, y) => {
      const sphere = spherePointForGridCell(grid, id, x, y);
      const broad = textureNoise(sphere.x * 2.1 + 31, sphere.y * 2.1 - 17, sphere.z * 2.1 + 5, 4, 2, 0.52);
      const fine = textureNoise(sphere.x * 8.5 - 7, sphere.y * 8.5 + 3, sphere.z * 8.5 + 23, 3, 2.2, 0.45);
      const coastWeakness = 1 - Math.min(1, Math.abs(crust[id]) * 2.8);
      weakness[id] = Math.max(0, Math.min(1, 0.5 + broad * 0.32 + fine * 0.16 + coastWeakness * 0.18));
    });
  }

  function rebuildElevation(world) {
    const { grid, textureNoise } = world;
    const { crust, baseElev, relief, boundaryRelief, elev, isContinental, crustType } = grid;

    forEachGridCell(grid, (i, x, y) => {
      const sphere = spherePointForGridCell(grid, i, x, y);
      const micro = textureNoise(sphere.x * 7.5 - 11, sphere.y * 7.5 + 19, sphere.z * 7.5 - 7, 3, 2.15, 0.42);
      const c = crust[i];
      const continental = c > 0;
      isContinental[i] = continental ? 1 : 0;
      crustType[i] = continental ? 1 : 0;

      const blend = Math.tanh(c * 2.5);
      baseElev[i] = blend >= 0
        ? 0.065 + blend * 0.075 + micro * 0.014
        : -0.085 + blend * 0.095 + micro * 0.012;
      elev[i] = baseElev[i] + relief[i] + boundaryRelief[i];
    });
  }

  function spherePointForGridCell(grid, id, x, y) {
    const px = grid.positionX?.[id];
    const py = grid.positionY?.[id];
    const pz = grid.positionZ?.[id];
    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
      return { x: px, y: py, z: pz };
    }
    return spherePointForCell(grid, x, y);
  }

  function initializeSeaLevel(world) {
    const seaFraction = Math.max(0.05, Math.min(0.95, world.params.waterLevel / 100));
    const initialSeaLevel = areaWeightedQuantile(world.grid, world.grid.elev, seaFraction);
    world.seaLevel = initialSeaLevel;
    world.waterVolume = measureWaterVolume(world.grid, initialSeaLevel);
  }

  function updateSeaLevel(world) {
    solveSeaLevel(world);
  }

  function solveSeaLevel(world) {
    const { elev } = world.grid;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < elev.length; i += 1) {
      const h = elev[i];
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    lo -= 1;
    hi += 1;

    for (let iter = 0; iter < 28; iter += 1) {
      const mid = (lo + hi) * 0.5;
      const volume = measureWaterVolume(world.grid, mid);
      if (volume < world.waterVolume) lo = mid;
      else hi = mid;
    }
    world.seaLevel = (lo + hi) * 0.5;
  }

  function measureWaterVolume(grid, seaLevel) {
    const { elev } = grid;
    let volume = 0;
    for (let i = 0; i < elev.length; i += 1) {
      if (elev[i] < seaLevel) volume += (seaLevel - elev[i]) * metricArea(grid, i);
    }
    return volume;
  }

  function areaWeightedQuantile(grid, values, fraction) {
    const sorted = Array.from(values, (value, id) => ({
      value,
      weight: metricArea(grid, id),
    })).sort((a, b) => a.value - b.value);
    let totalWeight = 0;
    for (const entry of sorted) totalWeight += entry.weight;
    const clampedFraction = Math.max(0, Math.min(1, fraction));
    if (clampedFraction <= 0) return sorted.length ? sorted[0].value : 0;
    const target = clampedFraction * Math.max(totalWeight, Number.EPSILON);
    let cumulative = 0;
    for (const entry of sorted) {
      cumulative += entry.weight;
      if (cumulative > target) return entry.value;
    }
    return sorted.length ? sorted[sorted.length - 1].value : 0;
  }

  function metricArea(grid, id) {
    const area = grid?.area?.[id];
    return Number.isFinite(area) && area > 0 ? area : 1;
  }

  function applyErosionAndDeposition(world) {
    const { grid, params } = world;
    const { size, relief, boundaryRelief, sediment, boundaryInfluence, isContinental } = grid;
    const dt = world.timeScaleFactor;
    const erosion = (0.0045 + params.intensity * 0.0018) * dt;
    sediment.fill(0);

    for (let i = 0; i < size; i += 1) {
      const inactive = 1 - Math.min(1, boundaryInfluence[i]);
      const oceanBoost = isContinental[i] ? 1 : 2.7;
      const localErosion = erosion * (1 + inactive * 4.5) * oceanBoost;
      if (relief[i] > 0) {
        const removed = Math.min(relief[i], relief[i] * localErosion);
        relief[i] -= removed;
        sediment[i] += removed;
      } else if (relief[i] < 0) {
        relief[i] *= Math.max(0, 1 - 0.005 * dt * (1 + inactive * 2));
      }
      const deadRelief = isContinental[i] ? 0.032 : 0.05;
      if (inactive > 0.75 && Math.abs(relief[i]) < deadRelief) relief[i] = 0;
    }
    smoothInactiveRelief(grid);
    healInactiveCrust(world);
    rebuildElevation(world);
  }

  function smoothInactiveRelief(grid) {
    const { size, relief, boundaryInfluence, isContinental, scratch } = grid;
    const radius = physicalRadius(grid, 1);
    const scale = resolutionScale(grid);
    scratch.set(relief);
    for (let id = 0; id < size; id += 1) {
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      if (inactive < 0.65 || Math.abs(scratch[id]) < 0.002) continue;
      let total = scratch[id] * 2;
      let count = 2;
      forEachNeighborRadiusById(grid, id, radius, (nid, dx, dy) => {
        const dist = Math.hypot(dx, dy);
        const w = 1 / (1 + dist / scale);
        total += scratch[nid] * w;
        count += w;
      });
      const smooth = total / count;
      const lowRelief = Math.abs(scratch[id]) < 0.09 ? 1 : 0;
      const mix = isContinental[id] ? 0.24 + lowRelief * 0.16 : 0.52;
      relief[id] = scratch[id] * (1 - mix) + smooth * mix;
    }
  }

  function healInactiveCrust(world) {
    const { grid } = world;
    const { size, crust, crustReference, boundaryInfluence, isContinental, scratch } = grid;
    const dt = world.timeScaleFactor;
    const radius = physicalRadius(grid, 1);
    const scale = resolutionScale(grid);

    scratch.set(crust);
    for (let i = 0; i < size; i += 1) {
      const inactive = 1 - Math.min(1, boundaryInfluence[i]);
      if (inactive < 0.45) continue;
      const oceanic = isContinental[i] ? 0 : 1;
      const relax = Math.min(0.06, 0.006 * dt * inactive * inactive * (oceanic ? 3.4 : 0.38));
      crust[i] = scratch[i] + (crustReference[i] - scratch[i]) * relax;
    }

    scratch.set(crust);
    for (let id = 0; id < size; id += 1) {
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      if (inactive < 0.6) continue;
      const coast = 1 - Math.min(1, Math.abs(scratch[id]) * 3.2);
      const oceanic = isContinental[id] ? 0 : 1;
      const mix = Math.min(0.38, inactive * (oceanic ? 0.26 : 0.06) + coast * 0.08);
      if (mix <= 0.01) continue;

      let total = scratch[id] * 3;
      let weightSum = 3;
      forEachNeighborRadiusById(grid, id, radius, (nid, dx, dy) => {
        const dist = Math.hypot(dx, dy);
        const w = 1 / (1 + dist / scale);
        total += scratch[nid] * w;
        weightSum += w;
      });
      crust[id] = scratch[id] * (1 - mix) + (total / weightSum) * mix;
    }
  }


  // ---- src/sim/tectonics.js ----

  const BoundaryType = {
    INTERIOR: 0,
    CONVERGENT: 1,
    DIVERGENT: 2,
    TRANSFORM: 3,
  };

  function assignPlates(world) {
    const { grid, params, seedUint32 } = world;
    if (isGraphBackedGrid(grid)) {
      const plates = createSphericalPlates({
        seedUint32,
        plateCount: params.plateCount,
        intensity: params.intensity,
      });
      world.plates = plates;
      world.initialSphericalPlates = cloneSphericalPlates(plates);
      world.initialPlateCentersU = null;
      world.initialPlateCentersV = null;
      world.initialPlateCentersX = null;
      world.initialPlateCentersY = null;
      return;
    }

    const width = legacyTectonicsGridParamWidth(grid);
    const height = legacyTectonicsGridParamHeight(grid);
    const plateCount = params.plateCount;
    const random = mulberry32(mixSeed(seedUint32, 0x706c6174));
    const centersU = new Float32Array(plateCount);
    const centersV = new Float32Array(plateCount);
    const centersX = new Float32Array(plateCount);
    const centersY = new Float32Array(plateCount);
    const plateVx = new Float32Array(plateCount);
    const plateVy = new Float32Array(plateCount);

    for (let p = 0; p < plateCount; p += 1) {
      centersU[p] = random();
      centersV[p] = random();
      centersX[p] = centersU[p] * width;
      centersY[p] = centersV[p] * height;

      const angle = random() * Math.PI * 2;
      const speed = (0.35 + random() * 0.65) * params.intensity;
      plateVx[p] = Math.cos(angle) * speed;
      plateVy[p] = Math.sin(angle) * speed;
    }

    world.plates = { centersU, centersV, centersX, centersY, vx: plateVx, vy: plateVy };
    world.initialPlateCentersU = new Float32Array(centersU);
    world.initialPlateCentersV = new Float32Array(centersV);
    world.initialPlateCentersX = new Float32Array(centersX);
    world.initialPlateCentersY = new Float32Array(centersY);
    rasterizePlates(world);
  }

  function cloneSphericalPlates(plates) {
    return {
      kind: plates.kind,
      count: plates.count,
      centerX: new Float32Array(plates.centerX),
      centerY: new Float32Array(plates.centerY),
      centerZ: new Float32Array(plates.centerZ),
      angularVelocityX: new Float32Array(plates.angularVelocityX),
      angularVelocityY: new Float32Array(plates.angularVelocityY),
      angularVelocityZ: new Float32Array(plates.angularVelocityZ),
      speed: new Float32Array(plates.speed),
    };
  }

  function isGraphBackedGrid(grid) {
    return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
  }

  function driftPlates(world) {
    const { grid, plates, params } = world;
    if (!plates) return;
    const driftScale = plateDriftScale(world);

    for (let p = 0; p < plates.centersX.length; p += 1) {
      plates.centersX[p] = legacyTectonicsWrapGridParamX(grid, plates.centersX[p] + plates.vx[p] * driftScale);
      plates.centersY[p] = clampGridParamY(grid, plates.centersY[p] + plates.vy[p] * driftScale);
      syncPlateCenterUv(grid, plates, p);
    }

    const interval = grid.size >= 131072 ? 3 : 2;
    if (world.step > 0 && world.step % interval !== 0) return;
    rasterizePlates(world);
  }

  function syncPlateCenterUv(grid, plates, p) {
    if (!plates.centersU || !plates.centersV) return;
    plates.centersU[p] = legacyTectonicsGridParamToU(grid, plates.centersX[p]);
    plates.centersV[p] = legacyTectonicsGridParamToV(grid, plates.centersY[p]);
  }

  function plateDriftScale(world) {
    return 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(world.grid);
  }

  function rasterizePlates(world) {
    const { grid, plates } = world;
    const { size, plate, pvx, pvy, weakness, crust } = grid;
    const maxCost = size * 8;
    const cost = new Float32Array(size);
    const q = new Int32Array(size * 8);
    let head = 0;
    let tail = 0;
    plate.fill(-1);
    cost.fill(Infinity);

    for (let p = 0; p < plates.centersX.length; p += 1) {
      const x = Math.floor(legacyTectonicsWrapGridParamX(grid, plates.centersX[p]));
      const y = Math.floor(clampGridParamY(grid, plates.centersY[p]));
      const id = legacyTectonicsIndexOf(grid, x, y);
      if (id < 0) continue;
      plate[id] = p;
      cost[id] = 0;
      q[tail] = id;
      tail += 1;
    }

    while (head < tail) {
      const base = q[head];
      const p = plate[base];
      head += 1;
      forEachNeighbor8(grid, base, (nid, weight) => {
        const crustContrast = Math.min(1.2, Math.abs(crust[nid] - crust[base]));
        const stepCost = weight * (1.15 - weakness[nid] * 0.62 + crustContrast * 0.22);
        const nextCost = cost[base] + stepCost;
        if (nextCost + 0.0001 < cost[nid] && nextCost < maxCost && tail < q.length) {
          cost[nid] = nextCost;
          plate[nid] = p;
          q[tail] = nid;
          tail += 1;
        }
      });
    }

    for (let i = 0; i < size; i += 1) {
      const bestPlate = plate[i] < 0 ? 0 : plate[i];
      plate[i] = bestPlate;
      pvx[i] = plates.vx[bestPlate];
      pvy[i] = plates.vy[bestPlate];
    }
    computeBoundaryInfluence(grid);
  }

  function computeBoundaryInfluence(grid) {
    const { size, plate, boundaryDistance, boundaryInfluence, weakness } = grid;
    const bandRadius = physicalRadius(grid, 4);
    boundaryDistance.fill(9999);
    boundaryInfluence.fill(0);
    const q = new Int32Array(size);
    let head = 0;
    let tail = 0;

    forEachGridCell(grid, (id) => {
      let edge = false;
      forEachNeighbor4ById(grid, id, (nid) => {
        if (plate[nid] !== plate[id]) edge = true;
      });
      if (edge) {
        boundaryDistance[id] = 0;
        q[tail++] = id;
      }
    });

    while (head < tail) {
      const id = q[head++];
      const d = boundaryDistance[id] + 1;
      if (d > bandRadius) continue;
      forEachNeighbor4ById(grid, id, (nid) => {
        if (d < boundaryDistance[nid]) {
          boundaryDistance[nid] = d;
          q[tail++] = nid;
        }
      });
    }

    for (let i = 0; i < size; i += 1) {
      const distanceBand = Math.max(0, 1 - boundaryDistance[i] / bandRadius);
      if (distanceBand <= 0) {
        boundaryInfluence[i] = 0;
      } else {
        const weakPath = 0.45 + weakness[i] * 0.85;
        const segmented = weakness[i] > 0.38 ? 1 : 0.55;
        boundaryInfluence[i] = Math.min(1, distanceBand * weakPath * segmented);
      }
    }
  }

  function computeBoundaryStress(world) {
    const { grid } = world;
    const { plate, btype, stress, activeBoundary } = grid;
    btype.fill(BoundaryType.INTERIOR);
    stress.fill(0);
    activeBoundary.fill(0);

    forEachGridCell(grid, (id) => {
      const currentPlate = plate[id];
      let convergent = 0;
      let divergent = 0;
      let shear = 0;
      let touchesBoundary = false;

      forEachNeighbor4ById(grid, id, (nid, dx, dy) => {
        inspectNeighbor(grid, id, nid, dx, dy, currentPlate, (dot, tangential) => {
          touchesBoundary = true;
          if (dot > 0.02) convergent += dot;
          else if (dot < -0.02) divergent += -dot;
          shear += Math.abs(tangential);
        });
      });

      if (!touchesBoundary) return;
      activeBoundary[id] = 1;
      if (convergent > divergent && convergent > shear * 0.55) {
        btype[id] = BoundaryType.CONVERGENT;
        stress[id] = convergent;
      } else if (divergent > convergent && divergent > shear * 0.55) {
        btype[id] = BoundaryType.DIVERGENT;
        stress[id] = divergent;
      } else {
        btype[id] = BoundaryType.TRANSFORM;
        stress[id] = shear * 0.5;
      }
    });
  }

  function inspectNeighbor(grid, id, nid, dx, dy, currentPlate, visit) {
    if (grid.plate[nid] === currentPlate) return;

    const rvx = grid.pvx[id] - grid.pvx[nid];
    const rvy = grid.pvy[id] - grid.pvy[nid];
    const dot = rvx * dx + rvy * dy;
    const tangential = rvx * -dy + rvy * dx;
    visit(dot, tangential);
  }

  function tectonicStep(world) {
    driftPlates(world);
    advectContinentalCrust(world);
    computeBoundaryStress(world);
    const { grid, params } = world;
    const { size, relief, boundaryRelief, crust, btype, stress, uplift, isContinental, boundaryInfluence, weakness } = grid;
    const dt = world.timeScaleFactor;
    const scale = resolutionScale(grid);
    const strength = params.intensity * Math.sqrt(dt) / Math.sqrt(scale);
    uplift.fill(0);
    boundaryRelief.fill(0);

    for (let i = 0; i < size; i += 1) {
        const s = Math.min(stress[i], 2.5);
        const band = boundaryInfluence[i];
      const rough = 0.38 + weakness[i] * 0.92;
      if (btype[i] === BoundaryType.CONVERGENT) {
        if (isContinental[i] && s > 0.7 && band > 0.75) {
          uplift[i] = s * 0.0049 * strength * band * rough;
          boundaryRelief[i] += s * 0.052 * band * rough;
          crust[i] += s * 0.00055 * strength * band * rough;
        } else {
          boundaryRelief[i] -= s * 0.026 * band * rough;
          crust[i] += s * 0.000025 * strength * band * rough;
        }
      } else if (btype[i] === BoundaryType.DIVERGENT) {
        if (isContinental[i]) {
          uplift[i] = -s * 0.00008 * strength * band * rough;
          boundaryRelief[i] -= s * 0.01 * band * rough;
          crust[i] -= s * 0.000045 * strength * band * rough;
        } else {
          boundaryRelief[i] += s * 0.032 * band * rough;
        }
      } else if (btype[i] === BoundaryType.TRANSFORM) {
        boundaryRelief[i] += (weakness[i] - 0.5) * s * 0.004 * band;
      }
    }

    spreadBoundaryEffects(grid, strength);
    smoothPersistentUplift(grid);
    for (let i = 0; i < size; i += 1) {
      relief[i] = Math.max(-0.45, Math.min(1.25, relief[i] + uplift[i]));
      crust[i] = Math.max(-1.4, Math.min(1.4, crust[i]));
    }

    smoothCrustNearBoundaries(grid);
    smoothBoundaryRelief(grid);
    rebuildElevation(world);
  }

  function advectContinentalCrust(world) {
    const { grid } = world;
    const {
      size,
      crust,
      crustReference,
      relief,
      pvx,
      pvy,
      isContinental,
      boundaryInfluence,
      btype,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const interval = 4;
    if (world.step > 0 && world.step % interval !== 0) return;
    const scale = plateDriftScale(world) * interval;
    if (scale <= 0) return;

    scratch.set(crust);
    scratch2.set(crustReference);
    scratch3.set(relief);

    forEachGridCell(grid, (id, x, y) => {
      const sx = x - pvx[id] * scale;
      const sy = y - pvy[id] * scale;
      const movedCrust = sampleBilinear(grid, scratch, sx, sy);
      const movedReference = sampleBilinear(grid, scratch2, sx, sy);
      const movedRelief = sampleBilinear(grid, scratch3, sx, sy);
      const active = Math.min(1, boundaryInfluence[id]);
      const continental = movedCrust > 0;
      const crustMix = continental ? 0.88 - active * 0.22 : 0.82;
      const reliefMix = continental ? 0.86 - active * 0.28 : 0.42;
      const stretchingBoundary = btype[id] === BoundaryType.DIVERGENT || btype[id] === BoundaryType.TRANSFORM;
      const boundaryConsumption = continental && stretchingBoundary ? active * active * 0.006 : 0;

      crust[id] = scratch[id] * (1 - crustMix) + movedCrust * crustMix - boundaryConsumption;
      crustReference[id] = scratch2[id] * (1 - crustMix) + movedReference * crustMix;
      relief[id] = scratch3[id] * (1 - reliefMix) + movedRelief * reliefMix;
      isContinental[id] = crust[id] > 0 ? 1 : 0;
    });
    rebuildElevation(world);
  }

  function sampleBilinear(grid, field, x, y) {
    return legacyTectonicsSampleBilinear(grid, field, x, y, 0);
  }

  function spreadBoundaryEffects(grid, strength) {
    const { uplift, boundaryRelief, crust, btype, stress, isContinental, boundaryInfluence, weakness } = grid;
    const effectRadius = physicalRadius(grid, 3);
    forEachGridCell(grid, (id) => {
      const type = btype[id];
      if (type === BoundaryType.INTERIOR) return;
      const s = Math.min(stress[id], 2.5);
      forEachNeighborRadius(grid, id, effectRadius, (nid, weight) => {
        const band = Math.max(0, boundaryInfluence[nid]);
        const rough = 0.65 + weakness[nid] * 0.55;
        if (type === BoundaryType.CONVERGENT) {
          if (isContinental[nid] && s > 0.9 && band > 0.55) {
            const d = s * 0.00042 * strength * weight * band * rough;
            uplift[nid] += d;
            boundaryRelief[nid] += s * 0.086 * weight * band * rough;
            crust[nid] = Math.min(1.4, crust[nid] + s * 0.00008 * strength * weight * band * rough);
          } else {
            boundaryRelief[nid] -= s * 0.024 * weight * band * rough;
          }
        } else if (type === BoundaryType.DIVERGENT && isContinental[nid]) {
          const d = s * 0.000025 * strength * weight * band * rough;
          uplift[nid] -= d;
          crust[nid] = Math.max(-1.4, crust[nid] - s * 0.000025 * strength * weight * band * rough);
        } else if (type === BoundaryType.DIVERGENT) {
          boundaryRelief[nid] += s * 0.03 * weight * band * rough;
        }
      });
    });
  }

  function smoothPersistentUplift(grid) {
    const { uplift, scratch, isContinental, boundaryInfluence, weakness } = grid;
    const upliftRadius = physicalRadius(grid, 3);
    scratch.set(uplift);
    forEachGridCell(grid, (id) => {
      if (!isContinental[id]) return;
      if (boundaryInfluence[id] < 0.05 && Math.abs(scratch[id]) < 0.000001) return;
      let total = scratch[id] * 2.8;
      let weightSum = 2.8;
      let signal = Math.abs(scratch[id]) * 2.8;
      forEachNeighborRadius(grid, id, upliftRadius, (nid, weight) => {
        if (!isContinental[nid]) return;
        const belt = Math.max(0.15, boundaryInfluence[nid]);
        const rough = 0.78 + weakness[nid] * 0.44;
        const w = weight * belt * rough;
        const warped = warpedNeighborId(grid, nid, weakness[nid]);
        total += scratch[warped] * w;
        weightSum += w;
        signal += Math.abs(scratch[warped]) * w;
      });
      if (signal < 0.000001) return;
      uplift[id] = total / weightSum;
    });
  }

  function forEachNeighbor8(grid, id, visit) {
    forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
      visit(nid, dx === 0 || dy === 0 ? 1 : 0.55);
    });
  }

  function forEachNeighborRadius(grid, id, radius, visit) {
    const scale = resolutionScale(grid);
    forEachNeighborRadiusById(grid, id, radius, (nid, dx, dy) => {
      const dist = Math.hypot(dx, dy);
      visit(nid, 1 / (1 + (dist / scale) * 1.35));
    });
  }

  function smoothCrustNearBoundaries(grid) {
    const { crust, boundaryInfluence, isContinental, scratch } = grid;
    scratch.set(crust);
    forEachGridCell(grid, (id) => {
      const influence = boundaryInfluence[id];
      if (influence < 0.35) return;
      let total = scratch[id] * 2;
      let count = 2;
      forEachNeighbor4ById(grid, id, (nid) => {
        total += scratch[nid];
        count += 1;
      });
      const blend = influence * (isContinental[id] ? 0.08 : 0.18);
      crust[id] = scratch[id] * (1 - blend) + (total / count) * blend;
    });
  }

  function smoothBoundaryRelief(grid) {
    const { boundaryRelief, scratch, boundaryInfluence, weakness } = grid;
    const reliefRadius = physicalRadius(grid, 3);
    scratch.set(boundaryRelief);
    forEachGridCell(grid, (id) => {
      if (boundaryInfluence[id] < 0.05 && Math.abs(scratch[id]) < 0.0001) return;
      let total = scratch[id] * 2.4;
      let weightSum = 2.4;
      let signal = Math.abs(scratch[id]) * 2.4;
      forEachNeighborRadius(grid, id, reliefRadius, (nid, weight) => {
        const band = Math.max(0.08, boundaryInfluence[nid]);
        const rough = 0.7 + weakness[nid] * 0.5;
        const w = weight * band * rough;
        const warped = warpedNeighborId(grid, nid, weakness[nid]);
        total += scratch[warped] * w;
        weightSum += w;
        signal += Math.abs(scratch[warped]) * w;
      });
      if (signal < 0.0001) return;
      boundaryRelief[id] = total / weightSum;
    });
  }

  function warpedNeighborId(grid, id, weak) {
    const { x, y } = legacyTectonicsXyOf(grid, id);
    const bend = Math.round((weak - 0.5) * 2 * resolutionScale(grid));
    const warped = legacyTectonicsIndexOf(grid, x + bend, y - bend);
    return warped >= 0 ? warped : id;
  }

  function legacyTectonicsGridParamWidth(grid) {
    return gridParamWidth(grid);
  }

  function legacyTectonicsGridParamHeight(grid) {
    return gridParamHeight(grid);
  }

  function legacyTectonicsWrapGridParamX(grid, x) {
    return wrapGridParamX(grid, x);
  }

  function legacyTectonicsGridParamToU(grid, x) {
    return gridParamToU(grid, x);
  }

  function legacyTectonicsGridParamToV(grid, y) {
    return gridParamToV(grid, y);
  }

  function legacyTectonicsIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function legacyTectonicsSampleBilinear(grid, field, x, y, fallback) {
    return sampleGridBilinear(grid, field, x, y, fallback);
  }

  function legacyTectonicsXyOf(grid, id) {
    return xyOf(grid, id);
  }


  // ---- src/sim/legacyPipeline.js ----

  function runLegacyStep(world) {
    tectonicStep(world);
    applyErosionAndDeposition(world);
    updateSeaLevel(world);
  }


  // ---- src/sim/geology/plates.js ----

  function advectCrust(world) {
    advectPlatesV2(world);
    rasterizePlatesV2(world);
    advectCrustByPlateMotion(world);
    world.geologyV2LastAdvectionStep = world.step;
  }

  function advectPlatesV2(world) {
    const { grid, plates, params } = world;
    if (!plates) return;
    if (plates.kind === "spherical-plates" && isGraphBackedGrid(grid)) {
      const drift = world.timeScaleFactor * Math.max(0, params.intensity);
      driftSphericalPlates(plates, drift);
      return;
    }
    const drift = 0.1 * world.timeScaleFactor * Math.max(0, params.intensity) * resolutionScale(grid);
    for (let p = 0; p < plates.centersX.length; p += 1) {
      plates.centersX[p] = legacyPlateWrapGridParamX(grid, plates.centersX[p] + plates.vx[p] * drift);
      plates.centersY[p] = clampGridParamY(grid, plates.centersY[p] + plates.vy[p] * drift);
      syncPlateCenterUv(grid, plates, p);
    }
  }

  function rasterizePlatesV2(world) {
    const { grid, plates } = world;
    if (!plates) return;
    if (plates.kind === "spherical-plates" && isGraphBackedGrid(grid)) {
      rasterizeSphericalPlatesV2(world);
      return;
    }
    const { size, plate, pvx, pvy, weakness, crustThickness } = grid;
    const cost = new Float32Array(size);
    const q = new Int32Array(size * 8);
    let head = 0;
    let tail = 0;
    plate.fill(-1);
    cost.fill(Infinity);

    for (let p = 0; p < plates.centersX.length; p += 1) {
      const x = Math.floor(legacyPlateWrapGridParamX(grid, plates.centersX[p]));
      const y = Math.floor(clampGridParamY(grid, plates.centersY[p]));
      const id = legacyPlateIndexOf(grid, x, y);
      if (id < 0) continue;
      plate[id] = p;
      cost[id] = 0;
      q[tail++] = id;
    }

    while (head < tail) {
      const id = q[head++];
      const p = plate[id];
      forEachNeighbor8Local(grid, id, (nid, weight) => {
        const thicknessContrast = Math.min(1.2, Math.abs(crustThickness[nid] - crustThickness[id]));
        const stepCost = weight * (1.12 - weakness[nid] * 0.58 + thicknessContrast * 0.18);
        const next = cost[id] + stepCost;
        if (next + 0.0001 < cost[nid] && tail < q.length) {
          cost[nid] = next;
          plate[nid] = p;
          q[tail++] = nid;
        }
      });
    }

    cleanupPlateCheckerboards(grid);

    for (let i = 0; i < size; i += 1) {
      const p = plate[i] < 0 ? 0 : plate[i];
      plate[i] = p;
      pvx[i] = plates.vx[p];
      pvy[i] = plates.vy[p];
    }
  }

  function rasterizeSphericalPlatesV2(world) {
    const { grid, plates } = world;
    const assignment = assignNearestSphericalPlates(grid, plates);
    grid.plate.set(assignment.plate);
    world.plateAssignment = assignment;
    for (let id = 0; id < grid.size; id += 1) {
      const p = grid.plate[id] < 0 ? 0 : grid.plate[id];
      grid.plate[id] = p;
      const v = sphericalPlateVelocityAt(
        plates,
        p,
        grid.positionX[id],
        grid.positionY[id],
        grid.positionZ[id],
      );
      grid.pvx[id] = v.x;
      grid.pvy[id] = v.y;
      if (grid.pvz) grid.pvz[id] = v.z;
    }
  }

  function advectCrustByPlateMotion(world) {
    const { grid } = world;
    const interval = 4;
    if (world.step > 0 && world.step % interval !== 0) return;
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      advectCrustBySphericalPlateMotion(world, interval);
      return;
    }

    const {
      size,
      pvx,
      pvy,
      crustType,
      crustThickness,
      crustAge,
      orogeny,
      oldOrogeny,
      orogenyAge,
      forelandBasin,
      sediment,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const drift = 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(grid) * interval;
    if (drift <= 0) return;

    scratch.set(crustThickness);
    scratch2.set(crustAge);
    scratch3.set(orogeny);
    const sedimentSource = new Float32Array(sediment);
    const oldOrogenySource = new Float32Array(oldOrogeny);
    const orogenyAgeSource = new Float32Array(orogenyAge);
    const forelandSource = new Float32Array(forelandBasin);

    forEachGridCell(grid, (id, x, y) => {
      const previousType = crustType[id];
      const sx = x - pvx[id] * drift;
      const sy = y - pvy[id] * drift;
      crustThickness[id] = sampleBilinear(grid, scratch, sx, sy);
      if (previousType !== CrustType.OCEANIC) crustAge[id] = sampleBilinear(grid, scratch2, sx, sy);
      orogeny[id] = sampleBilinear(grid, scratch3, sx, sy) * 0.992;
      oldOrogeny[id] = sampleBilinear(grid, oldOrogenySource, sx, sy) * 0.996;
      orogenyAge[id] = sampleBilinear(grid, orogenyAgeSource, sx, sy);
      forelandBasin[id] = sampleBilinear(grid, forelandSource, sx, sy) * 0.998;
      sediment[id] = sampleBilinear(grid, sedimentSource, sx, sy) * 0.998;
      crustType[id] = classifyCrustType(crustThickness[id], crustAge[id], crustType[id]);
    });

    // Keep legacy compatibility fields coherent without making them the source of truth.
    syncLegacyCrustCompatibilityFields(grid);
  }

  function advectCrustBySphericalPlateMotion(world, interval) {
    const { grid } = world;
    const {
      size,
      pvx,
      pvy,
      pvz,
      crustType,
      crustThickness,
      crustAge,
      orogeny,
      oldOrogeny,
      orogenyAge,
      forelandBasin,
      sediment,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const drift = world.timeScaleFactor * Math.max(0, world.params.intensity) * interval;
    if (drift <= 0) return;

    scratch.set(crustThickness);
    scratch2.set(crustAge);
    scratch3.set(orogeny);
    const sedimentSource = new Float32Array(sediment);
    const oldOrogenySource = new Float32Array(oldOrogeny);
    const orogenyAgeSource = new Float32Array(orogenyAge);
    const forelandSource = new Float32Array(forelandBasin);

    for (let id = 0; id < size; id += 1) {
      const previousType = crustType[id];
      const source = backtrackSphericalPosition(grid, id, pvx[id], pvy[id], pvz?.[id] ?? 0, drift);
      crustThickness[id] = sampleSphericalField(grid, scratch, source.x, source.y, source.z, scratch[id]);
      if (previousType !== CrustType.OCEANIC) {
        crustAge[id] = sampleSphericalField(grid, scratch2, source.x, source.y, source.z, scratch2[id]);
      }
      orogeny[id] = sampleSphericalField(grid, scratch3, source.x, source.y, source.z, scratch3[id]) * 0.992;
      oldOrogeny[id] = sampleSphericalField(grid, oldOrogenySource, source.x, source.y, source.z, oldOrogenySource[id]) * 0.996;
      orogenyAge[id] = sampleSphericalField(grid, orogenyAgeSource, source.x, source.y, source.z, orogenyAgeSource[id]);
      forelandBasin[id] = sampleSphericalField(grid, forelandSource, source.x, source.y, source.z, forelandSource[id]) * 0.998;
      sediment[id] = sampleSphericalField(grid, sedimentSource, source.x, source.y, source.z, sedimentSource[id]) * 0.998;
      crustType[id] = classifyCrustType(crustThickness[id], crustAge[id], crustType[id]);
    }

    syncLegacyCrustCompatibilityFields(grid);
  }

  function backtrackSphericalPosition(grid, id, vx, vy, vz, drift) {
    const x = grid.positionX?.[id] ?? 0;
    const y = grid.positionY?.[id] ?? 0;
    const z = grid.positionZ?.[id] ?? 1;
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) return normalize3(x, y, z);
    return normalize3(x - vx * drift, y - vy * drift, z - vz * drift);
  }

  function sampleSphericalField(grid, field, x, y, z, fallback = 0) {
    const nearest = nearestSphericalCell(grid, x, y, z);
    if (nearest < 0 || nearest >= grid.size) return fallback;
    let total = 0;
    let weight = 0;

    const add = (id) => {
      const value = field[id];
      if (!Number.isFinite(value)) return;
      const dot = Math.max(
        -1,
        Math.min(1, (grid.positionX?.[id] ?? 0) * x + (grid.positionY?.[id] ?? 0) * y + (grid.positionZ?.[id] ?? 0) * z),
      );
      const distance = Math.acos(dot);
      const w = 1 / (1e-7 + distance * distance);
      total += value * w;
      weight += w;
    };

    add(nearest);
    const start = grid.neighborStart?.[nearest] ?? 0;
    const count = grid.neighborCount?.[nearest] ?? 0;
    for (let k = 0; k < count; k += 1) add(grid.neighbors[start + k]);

    return weight > 0 ? total / weight : fallback;
  }

  function nearestSphericalCell(grid, x, y, z) {
    if (typeof grid.nearestCell === "function") return grid.nearestCell(x, y, z);
    if (typeof grid.sphericalGrid?.nearestCell === "function") return grid.sphericalGrid.nearestCell(x, y, z);
    let best = 0;
    let bestDot = -Infinity;
    for (let id = 0; id < grid.size; id += 1) {
      const d = (grid.positionX?.[id] ?? 0) * x + (grid.positionY?.[id] ?? 0) * y + (grid.positionZ?.[id] ?? 0) * z;
      if (d > bestDot) {
        bestDot = d;
        best = id;
      }
    }
    return best;
  }

  function syncLegacyCrustCompatibilityFields(grid) {
    const { size, crustType, crustThickness, crustAge } = grid;
    for (let i = 0; i < size; i += 1) {
      if (crustType[i] === CrustType.CONTINENTAL) {
        grid.crust[i] = (crustThickness[i] - 0.52) * 1.85;
        grid.isContinental[i] = 1;
      } else if (crustType[i] === CrustType.TRANSITIONAL) {
        grid.crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
        grid.isContinental[i] = 0;
      } else {
        grid.crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
        grid.isContinental[i] = 0;
      }
    }
  }

  function sampleBilinear(grid, field, x, y) {
    return legacyPlateSampleBilinear(grid, field, x, y, 0);
  }

  function classifyCrustType(thickness, age, previousType) {
    if (previousType === CrustType.CONTINENTAL) {
      if (thickness > 0.48) return CrustType.CONTINENTAL;
      if (thickness > 0.34) return CrustType.TRANSITIONAL;
      return age < 0.24 ? CrustType.TRANSITIONAL : CrustType.OCEANIC;
    }
    if (previousType === CrustType.TRANSITIONAL) {
      if (thickness > 0.56) return CrustType.CONTINENTAL;
      if (thickness < 0.29 && age > 0.32) return CrustType.OCEANIC;
      return CrustType.TRANSITIONAL;
    }
    if (thickness > 0.48 && age < 0.48) return CrustType.TRANSITIONAL;
    return CrustType.OCEANIC;
  }

  function forEachNeighbor8Local(grid, id, visit) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
        const weight = Number.isFinite(edgeLength) && edgeLength > 1e-6 ? edgeLength : 1;
        visit(nid, weight);
      });
      return;
    }
    forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
      visit(nid, dx === 0 || dy === 0 ? 1 : Math.SQRT2);
    });
  }

  function cleanupPlateCheckerboards(grid) {
    const { size, plate } = grid;
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    const next = new Int32Array(plate);
    let maxPlate = 0;
    for (let i = 0; i < size; i += 1) if (plate[i] > maxPlate) maxPlate = plate[i];
    const counts = new Int16Array(maxPlate + 1);
    const touched = [];
    forEachGridCell(grid, (id, x, y) => {
      const current = plate[id];
      touched.length = 0;
      let same = 0;
      let majorityPlate = current;
      let majorityCount = 0;
      forEachNeighbor8Local(grid, id, (nid) => {
        const other = plate[nid];
        if (other === current) same += 1;
        if (counts[other] === 0) touched.push(other);
        const count = counts[other] + 1;
        counts[other] = count;
        if (count > majorityCount) {
          majorityCount = count;
          majorityPlate = other;
        }
      });

      const checker = graphBacked ? false : isCheckerboardCell(grid, x, y);
      if ((majorityCount >= 5 && same <= 2) || (checker && majorityCount >= 4 && same <= 3)) {
        next[id] = majorityPlate;
      }
      for (const p of touched) counts[p] = 0;
    });
    plate.set(next);
  }

  function isCheckerboardCell(grid, x, y) {
    for (let dy = -1; dy <= 0; dy += 1) {
      const y0 = y + dy;
      const y1 = y0 + 1;
      for (let dx = -1; dx <= 0; dx += 1) {
        const x0 = x + dx;
        const x1 = x + dx + 1;
        const aId = legacyPlateIndexOf(grid, x0, y0);
        const bId = legacyPlateIndexOf(grid, x1, y0);
        const cId = legacyPlateIndexOf(grid, x0, y1);
        const dId = legacyPlateIndexOf(grid, x1, y1);
        if (aId < 0 || bId < 0 || cId < 0 || dId < 0) continue;
        const a = grid.plate[aId];
        const b = grid.plate[bId];
        const c = grid.plate[cId];
        const d = grid.plate[dId];
        if (a === d && b === c && a !== b) return true;
      }
    }
    return false;
  }

  function syncPlateCenterUv(grid, plates, p) {
    if (!plates.centersU || !plates.centersV) return;
    plates.centersU[p] = legacyPlateGridParamToU(grid, plates.centersX[p]);
    plates.centersV[p] = legacyPlateGridParamToV(grid, plates.centersY[p]);
  }

  function legacyPlateWrapGridParamX(grid, x) {
    return wrapGridParamX(grid, x);
  }

  function legacyPlateIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function legacyPlateSampleBilinear(grid, field, x, y, fallback) {
    return sampleGridBilinear(grid, field, x, y, fallback);
  }

  function legacyPlateGridParamToU(grid, x) {
    return gridParamToU(grid, x);
  }

  function legacyPlateGridParamToV(grid, y) {
    return gridParamToV(grid, y);
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }


  // ---- src/sim/geology/crust.js ----

  const CrustType = {
    OCEANIC: 0,
    CONTINENTAL: 1,
    TRANSITIONAL: 2,
  };

  function updateCrustProperties(world) {
    updateCrustPropertiesV2(world);
  }

  function updateCrustPropertiesV2(world) {
    const { grid } = world;
    const {
      size,
      crust,
      crustType,
      crustThickness,
      crustAge,
      crustDensity,
      weakness,
      orogeny,
      sediment,
      boundaryKind,
      boundaryInfluence,
      stress,
      isContinental,
    } = grid;
    const dt = world.timeScaleFactor;
    const step = Math.sqrt(dt);

    for (let i = 0; i < size; i += 1) {
      let type = crustType[i];
      const active = Math.min(1, boundaryInfluence[i]);
      const s = Math.min(2.5, stress[i]);
      const kind = boundaryKind[i];
      const boundaryPower = active * s;

      if (type === CrustType.OCEANIC) {
        crustAge[i] = Math.min(1, crustAge[i] + 0.005 * dt);
        crustThickness[i] = Math.max(0.12, Math.min(0.42, crustThickness[i] + 0.00035 * dt));
      } else if (type === CrustType.TRANSITIONAL) {
        crustAge[i] = Math.min(0.55, crustAge[i] + 0.00055 * dt);
        crustThickness[i] = Math.max(0.32, Math.min(0.72, crustThickness[i]));
      } else {
        crustAge[i] = Math.min(1, crustAge[i] + 0.00025 * dt);
        crustThickness[i] = Math.max(0.42, Math.min(1.25, crustThickness[i]));
      }

      if (kind === BoundaryType.DIVERGENT) {
        if (type === CrustType.CONTINENTAL) {
          crustThickness[i] = Math.max(0.36, crustThickness[i] - active * s * 0.00028 * step);
          weakness[i] = Math.min(1, weakness[i] + active * s * 0.0025 * dt);
          sediment[i] *= 0.998;
          if (crustThickness[i] < 0.47 && weakness[i] > 0.58 && boundaryPower > 0.55) {
            type = CrustType.TRANSITIONAL;
            crustType[i] = type;
            crustAge[i] = Math.min(crustAge[i], 0.22);
            sediment[i] = Math.min(1, sediment[i] + boundaryPower * 0.0012 * dt);
          }
        } else if (type === CrustType.TRANSITIONAL) {
          crustThickness[i] = Math.max(0.27, crustThickness[i] - active * s * 0.00024 * step);
          weakness[i] = Math.min(1, weakness[i] + active * s * 0.0032 * dt);
          sediment[i] = Math.min(1, sediment[i] + boundaryPower * 0.001 * dt);
          crustAge[i] = Math.min(0.35, crustAge[i] + boundaryPower * 0.0008 * dt);
          if (grid.riftStage[i] === 5 && crustThickness[i] < 0.285 && weakness[i] > 0.72 && boundaryPower > 0.74) {
            type = CrustType.OCEANIC;
            crustType[i] = type;
            crustAge[i] = 0;
            crustThickness[i] = Math.max(0.18, Math.min(0.26, crustThickness[i]));
            sediment[i] *= 0.45;
          }
        } else {
          crustType[i] = CrustType.OCEANIC;
          crustAge[i] = Math.min(crustAge[i], 0.03);
          crustThickness[i] = Math.max(0.16, Math.min(crustThickness[i], 0.28));
          sediment[i] *= 0.985;
        }
      } else if (kind === BoundaryType.CONVERGENT) {
        if (type === CrustType.CONTINENTAL) {
          crustThickness[i] = Math.min(1.35, crustThickness[i] + active * s * 0.00055 * step);
          orogeny[i] = Math.min(1, orogeny[i] + active * s * 0.0012 * dt);
        } else if (type === CrustType.TRANSITIONAL) {
          crustThickness[i] = Math.min(0.82, crustThickness[i] + active * s * 0.00018 * step);
          sediment[i] = Math.min(1, sediment[i] + boundaryPower * 0.0014 * dt);
        } else {
          const ageFactor = 0.45 + crustAge[i] * 1.25;
          crustThickness[i] = Math.max(0.08, crustThickness[i] - active * s * (0.00015 + crustAge[i] * 0.00034) * step);
          sediment[i] = Math.min(1, sediment[i] + boundaryPower * ageFactor * 0.00075 * dt);
        }
      } else if (kind === BoundaryType.TRANSFORM) {
        weakness[i] = Math.min(1, weakness[i] + active * s * 0.003 * dt);
        sediment[i] = Math.min(1, sediment[i] + active * s * 0.0007 * dt);
        orogeny[i] *= Math.max(0, 1 - active * 0.0015 * dt);
      } else {
        weakness[i] += (0.5 - weakness[i]) * Math.min(0.02, 0.0015 * dt);
      }

      if (type === CrustType.CONTINENTAL && crustThickness[i] < 0.43 && weakness[i] > 0.68) {
        type = CrustType.TRANSITIONAL;
        crustType[i] = type;
      }

      if (type === CrustType.CONTINENTAL) {
        crustDensity[i] = 0.4 + Math.max(0, crustThickness[i] - 0.55) * 0.08;
        crust[i] = (crustThickness[i] - 0.52) * 1.85;
        isContinental[i] = 1;
      } else if (type === CrustType.TRANSITIONAL) {
        crustDensity[i] = 0.56 + Math.max(0, 0.55 - crustThickness[i]) * 0.14 + crustAge[i] * 0.04;
        crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
        isContinental[i] = 0;
      } else {
        crustDensity[i] = 0.68 + crustAge[i] * 0.12;
        crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
        isContinental[i] = 0;
      }
    }
    rebuildOceanicAgeFromRidges(world);
    rebuildCrustCompatibilityFields(grid);
  }

  function rebuildOceanicAgeFromRidges(world) {
    const { grid } = world;
    const {
      size,
      crustType,
      crustAge,
      crustThickness,
      crustDensity,
      ridge,
      boundaryKind,
      boundaryInfluence,
      stress,
      ridgeDistance,
      scratch,
      scratch2,
    } = grid;
    const agePerStep = 1 / 200;
    const dtAge = agePerStep * world.timeScaleFactor;
    const rebuildDistance = !world.geologyV2RidgeDistanceInitialized || world.step % 4 === 0;
    const ridgeMask = scratch;
    ridgeMask.fill(0);
    if (rebuildDistance) ridgeDistance.fill(Number.POSITIVE_INFINITY);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;

    for (let i = 0; i < size; i += 1) {
      const isOceanic = crustType[i] === CrustType.OCEANIC;
      const activeRidge = isOceanic && (
        ridge[i] > 0.045 ||
        (boundaryKind[i] === BoundaryType.DIVERGENT && boundaryInfluence[i] > 0.18 && stress[i] > 0.08)
      );
      if (!activeRidge) continue;
      ridgeMask[i] = 1;
      ridgeDistance[i] = 0;
      queue[tail++] = i;
      crustAge[i] = Math.min(crustAge[i], 0.012);
      crustThickness[i] = Math.max(0.16, Math.min(crustThickness[i], 0.28));
    }

    if (rebuildDistance) {
      const topology = topologyForGrid(grid);
      if (isGraphBackedGrid(grid, topology)) {
        rebuildGraphRidgeDistance(grid, topology, ridgeMask);
      } else {
        while (head < tail) {
          const id = queue[head++];
          const nextDistance = ridgeDistance[id] + 1;
          forEachNeighbor4ById(grid, id, (nid) => {
            if (crustType[nid] !== CrustType.OCEANIC) return;
            if (nextDistance >= ridgeDistance[nid]) return;
            ridgeDistance[nid] = nextDistance;
            queue[tail++] = nid;
          });
        }
      }
      world.geologyV2RidgeDistanceInitialized = true;
    }

    const maxDistance = Math.max(8, physicalRadius(grid, 72));
    for (let i = 0; i < size; i += 1) {
      if (crustType[i] !== CrustType.OCEANIC) {
        ridgeDistance[i] = -1;
        continue;
      }
      const reachable = ridgeDistance[i] >= 0 && Number.isFinite(ridgeDistance[i]);
      const distanceAge = reachable ? Math.min(1, ridgeDistance[i] / maxDistance) : 1;
      const timeAge = Math.min(1, crustAge[i] + dtAge);
      const ridgeReset = ridgeMask[i] ? 0 : Math.min(timeAge, distanceAge + dtAge * 0.35);
      crustAge[i] = Math.min(1, Math.max(0, ridgeReset));
      crustThickness[i] = Math.max(0.14, Math.min(0.42, 0.18 + crustAge[i] * 0.16 + Math.max(0, crustThickness[i] - 0.18) * 0.28));
    }

    const topology = topologyForGrid(grid);
    scratch2.set(crustAge);
    forEachGridCell(grid, (id) => {
      if (crustType[id] !== CrustType.OCEANIC || ridgeDistance[id] <= 1) return;
      let total = scratch2[id] * 2.5;
      let weight = 2.5;
      visitRidgeAgeSmoothingNeighbors(grid, topology, id, (nid) => {
        if (crustType[nid] !== CrustType.OCEANIC || Math.abs(ridgeDistance[nid] - ridgeDistance[id]) > 3) return;
        total += scratch2[nid];
        weight += 1;
      });
      crustAge[id] = Math.min(1, total / weight);
    });
  }

  function visitRidgeAgeSmoothingNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function rebuildGraphRidgeDistance(grid, topology, ridgeMask) {
    const { size, crustType, ridgeDistance } = grid;
    const heap = new CrustDistanceHeap(Math.max(16, size));
    ridgeDistance.fill(Number.POSITIVE_INFINITY);

    for (let id = 0; id < size; id += 1) {
      if (!ridgeMask[id] || crustType[id] !== CrustType.OCEANIC) continue;
      ridgeDistance[id] = 0;
      heap.push(id, 0);
    }

    while (heap.length > 0) {
      const current = heap.pop();
      const id = current.id;
      if (current.distance > ridgeDistance[id] + 1e-7) continue;
      topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
        if (crustType[nid] !== CrustType.OCEANIC) return;
        const next = ridgeDistance[id] + Math.max(1e-6, edgeLength);
        if (next >= ridgeDistance[nid]) return;
        ridgeDistance[nid] = next;
        heap.push(nid, next);
      });
    }
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  class CrustDistanceHeap {
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

  function rebuildCrustCompatibilityFields(grid) {
    const { size, crustType, crustAge, crustThickness, crustDensity, crust, isContinental } = grid;
    for (let i = 0; i < size; i += 1) {
      if (crustType[i] === CrustType.CONTINENTAL) {
        crustDensity[i] = 0.4 + Math.max(0, crustThickness[i] - 0.55) * 0.08;
        crust[i] = (crustThickness[i] - 0.52) * 1.85;
        isContinental[i] = 1;
      } else if (crustType[i] === CrustType.TRANSITIONAL) {
        crustDensity[i] = 0.56 + Math.max(0, 0.55 - crustThickness[i]) * 0.14 + crustAge[i] * 0.04;
        crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
        isContinental[i] = 0;
      } else {
        crustDensity[i] = 0.68 + crustAge[i] * 0.12;
        crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
        isContinental[i] = 0;
      }
    }
  }


  // ---- src/sim/geology/boundaries.js ----

  function updatePlateBoundaries(world) {
    updatePlateBoundariesV2(world);
    classifyBoundaryKindV2(world);
  }

  function updatePlateBoundariesV2(world) {
    const { grid } = world;
    const { size, plate, boundaryDistance, boundaryInfluence, weakness, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
    const radius = physicalRadius(grid, 4);
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    const q = new Int32Array(size);
    let head = 0;
    let tail = 0;
    boundaryDistance.fill(9999);
    boundaryInfluence.fill(0);
    activeBoundary.fill(0);
    boundaryDensity.fill(0);
    boundaryCoherence.fill(1);
    noisyBoundaryPatch.fill(0);
    plateCheckerboard.fill(0);

    forEachGridCell(grid, (id) => {
      let edge = false;
      visitBoundarySourceNeighbors(grid, topology, graphBacked, id, (nid) => {
        if (plate[nid] !== plate[id]) edge = true;
      });
      if (edge) {
        boundaryDistance[id] = 0;
        activeBoundary[id] = 1;
        if (!graphBacked) q[tail++] = id;
      }
    });

    deriveBoundaryCoherence(grid);

    if (graphBacked) {
      rebuildGraphBoundaryDistance(grid, topology, activeBoundary, radius);
    } else {
      while (head < tail) {
        const id = q[head++];
        const nextDistance = boundaryDistance[id] + 1;
        if (nextDistance > radius) continue;
        forEachNeighbor4ById(grid, id, (nid) => {
          if (nextDistance < boundaryDistance[nid]) {
            boundaryDistance[nid] = nextDistance;
            q[tail++] = nid;
          }
        });
      }
    }

    for (let i = 0; i < size; i += 1) {
      const distanceBand = Math.max(0, 1 - boundaryDistance[i] / radius);
      if (distanceBand <= 0) continue;
      const weakPath = 0.42 + weakness[i] * 0.9;
      const segmented = weakness[i] > 0.36 ? 1 : 0.5;
      const coherenceGate = 0.25 + boundaryCoherence[i] * 0.75;
      const noisyGate = noisyBoundaryPatch[i] ? 0.32 : 1;
      boundaryInfluence[i] = Math.min(1, distanceBand * weakPath * segmented * coherenceGate * noisyGate);
    }
  }

  function visitBoundarySourceNeighbors(grid, topology, graphBacked, id, visit) {
    if (graphBacked) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function classifyBoundaryKindV2(world) {
    const { grid } = world;
    const { size, plate, btype, boundaryKind, stress, activeBoundary, boundaryCoherence, noisyBoundaryPatch } = grid;
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    const motionThreshold = graphBacked ? 0.000025 : 0.02;
    btype.fill(BoundaryType.INTERIOR);
    boundaryKind.fill(BoundaryType.INTERIOR);
    stress.fill(0);

    forEachGridCell(grid, (id) => {
      const currentPlate = plate[id];
      let convergent = 0;
      let divergent = 0;
      let shear = 0;
      let touches = false;

      visitBoundaryClassificationNeighbors(grid, topology, id, (nid, dx, dy, slot) => {
        inspectBoundaryNeighbor(grid, id, nid, dx, dy, currentPlate, slot, (normal, tangent) => {
          touches = true;
          if (normal > motionThreshold) convergent += normal;
          else if (normal < -motionThreshold) divergent += -normal;
          shear += Math.abs(tangent);
        });
      });

      if (!touches) return;
      activeBoundary[id] = 1;
      const coherenceGate = noisyBoundaryPatch[id] ? 0.22 : 0.45 + boundaryCoherence[id] * 0.55;
      if (convergent > divergent && convergent > shear * 0.55) {
        btype[id] = BoundaryType.CONVERGENT;
        stress[id] = convergent * coherenceGate;
      } else if (divergent > convergent && divergent > shear * 0.55) {
        btype[id] = BoundaryType.DIVERGENT;
        stress[id] = divergent * coherenceGate;
      } else {
        btype[id] = BoundaryType.TRANSFORM;
        stress[id] = shear * 0.5 * coherenceGate;
      }
      boundaryKind[id] = btype[id];
    });

    for (let i = 0; i < size; i += 1) {
      if (boundaryKind[i] === BoundaryType.INTERIOR && grid.boundaryInfluence[i] > 0.01) {
        boundaryKind[i] = nearestBoundaryKind(grid, i);
      }
    }
  }

  function deriveBoundaryCoherence(grid) {
    const { plate, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
    const topology = topologyForGrid(grid);
    forEachGridCell(grid, (id) => {
      let boundaryCount = activeBoundary[id] ? 1 : 0;
      let cells = 1;
      let same = 0;
      let different = 0;
      visitBoundaryCoherenceNeighbors(grid, topology, id, (nid) => {
        cells += 1;
        if (activeBoundary[nid]) boundaryCount += 1;
        if (plate[nid] === plate[id]) same += 1;
        else different += 1;
      });

      const density = cells ? boundaryCount / cells : 0;
      const checker = isGraphBackedGrid(grid, topology)
        ? graphCheckerboardRiskAt(grid, topology, id)
        : legacyCheckerboardRiskAt(grid, id);
      const islandNoise = same <= 2 && different >= 5 ? 1 : 0;
      const coherence = Math.max(0, Math.min(1, 1 - Math.max(0, density - 0.42) * 1.35 - checker * 0.75 - islandNoise * 0.55));
      boundaryDensity[id] = density;
      plateCheckerboard[id] = checker;
      boundaryCoherence[id] = coherence;
      if (density > 0.66 || checker > 0.4 || islandNoise) noisyBoundaryPatch[id] = 1;
    });
  }

  function visitBoundaryCoherenceNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor8ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function legacyCheckerboardRiskAt(grid, id) {
    const { x, y } = legacyBoundaryXyOf(grid, id);
    let risk = 0;
    for (let dy = -1; dy <= 0; dy += 1) {
      const y0 = y + dy;
      const y1 = y0 + 1;
      for (let dx = -1; dx <= 0; dx += 1) {
        const x0 = x + dx;
        const x1 = x + dx + 1;
        const aId = legacyBoundaryIndexOf(grid, x0, y0);
        const bId = legacyBoundaryIndexOf(grid, x1, y0);
        const cId = legacyBoundaryIndexOf(grid, x0, y1);
        const dId = legacyBoundaryIndexOf(grid, x1, y1);
        if (aId < 0 || bId < 0 || cId < 0 || dId < 0) continue;
        const a = grid.plate[aId];
        const b = grid.plate[bId];
        const c = grid.plate[cId];
        const d = grid.plate[dId];
        if (a === d && b === c && a !== b) risk = 1;
      }
    }
    return risk;
  }

  function legacyBoundaryXyOf(grid, id) {
    return xyOf(grid, id);
  }

  function legacyBoundaryIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function graphCheckerboardRiskAt(grid, topology, id) {
    const current = grid.plate[id];
    let same = 0;
    let different = 0;
    let otherA = -1;
    let otherB = -1;
    topology.forEachNeighbor(id, (nid) => {
      const plate = grid.plate[nid];
      if (plate === current) {
        same += 1;
        return;
      }
      different += 1;
      if (otherA < 0) otherA = plate;
      else if (plate !== otherA) otherB = plate;
    });
    if (different < 3 || same > 1 || otherB < 0) return 0;
    return Math.min(1, (different - same) / Math.max(1, different));
  }

  function visitBoundaryClassificationNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid, slot) => {
        const direction = graphBoundaryDirection(grid, id, nid, slot);
        visit(nid, direction.dx, direction.dy, slot);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid, dx, dy) => {
      visit(nid, dx, dy, -1);
    });
  }

  function graphBoundaryDirection(grid, id, nid, slot) {
    const start = grid.neighborStart?.[id] ?? -1;
    const offset = start >= 0 ? start + slot : -1;
    let dx = offset >= 0 && grid.edgeTangentX ? grid.edgeTangentX[offset] : 0;
    let dy = offset >= 0 && grid.edgeTangentY ? grid.edgeTangentY[offset] : 0;
    let dz = offset >= 0 && grid.edgeTangentZ ? grid.edgeTangentZ[offset] : 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) || Math.hypot(dx, dy, dz) < 1e-6) {
      const ax = grid.positionX?.[id] ?? 0;
      const ay = grid.positionY?.[id] ?? 0;
      const az = grid.positionZ?.[id] ?? 0;
      const bx = grid.positionX?.[nid] ?? 0;
      const by = grid.positionY?.[nid] ?? 0;
      const bz = grid.positionZ?.[nid] ?? 0;
      const radialProjection = bx * ax + by * ay + bz * az;
      dx = bx - ax * radialProjection;
      dy = by - ay * radialProjection;
      dz = bz - az * radialProjection;
    }
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return { dx: 1, dy: 0, dz: 0 };
    return { dx: dx / length, dy: dy / length, dz: dz / length };
  }

  function inspectBoundaryNeighbor(grid, id, nid, dx, dy, currentPlate, _slot, visit) {
    if (grid.plate[nid] === currentPlate) return;
    const rvx = grid.pvx[id] - grid.pvx[nid];
    const rvy = grid.pvy[id] - grid.pvy[nid];
    if (grid.pvz && Number.isFinite(_slot) && isGraphBackedGrid(grid)) {
      const direction = graphBoundaryDirection(grid, id, nid, _slot);
      const rvz = grid.pvz[id] - grid.pvz[nid];
      const normal = rvx * direction.dx + rvy * direction.dy + rvz * direction.dz;
      const tangent = sphericalBoundaryShear(grid, id, nid, direction, rvx, rvy, rvz);
      visit(normal, tangent);
      return;
    }
    visit(rvx * dx + rvy * dy, rvx * -dy + rvy * dx);
  }

  function sphericalBoundaryShear(grid, id, nid, normalDirection, rvx, rvy, rvz) {
    const mx = (grid.positionX?.[id] ?? 0) + (grid.positionX?.[nid] ?? 0);
    const my = (grid.positionY?.[id] ?? 0) + (grid.positionY?.[nid] ?? 0);
    const mz = (grid.positionZ?.[id] ?? 0) + (grid.positionZ?.[nid] ?? 0);
    const mLength = Math.hypot(mx, my, mz);
    if (mLength < 1e-6) return 0;
    const rx = mx / mLength;
    const ry = my / mLength;
    const rz = mz / mLength;
    const tx = ry * normalDirection.dz - rz * normalDirection.dy;
    const ty = rz * normalDirection.dx - rx * normalDirection.dz;
    const tz = rx * normalDirection.dy - ry * normalDirection.dx;
    const tLength = Math.hypot(tx, ty, tz);
    if (tLength < 1e-6) return 0;
    return (rvx * tx + rvy * ty + rvz * tz) / tLength;
  }

  function nearestBoundaryKind(grid, id) {
    let best = BoundaryType.INTERIOR;
    const topology = topologyForGrid(grid);
    visitNearestBoundaryKindNeighbors(grid, topology, id, (nid) => {
      const kind = grid.boundaryKind[nid];
      if (kind !== BoundaryType.INTERIOR) best = kind;
    });
    return best;
  }

  function visitNearestBoundaryKindNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function rebuildGraphBoundaryDistance(grid, topology, sourceMask, radius) {
    const { size, boundaryDistance } = grid;
    const heap = new BoundaryDistanceHeap(Math.max(16, size));
    boundaryDistance.fill(9999);

    for (let id = 0; id < size; id += 1) {
      if (!sourceMask[id]) continue;
      boundaryDistance[id] = 0;
      heap.push(id, 0);
    }

    while (heap.length > 0) {
      const current = heap.pop();
      const id = current.id;
      if (current.distance > boundaryDistance[id] + 1e-7) continue;
      topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
        const next = boundaryDistance[id] + Math.max(1e-6, edgeLength);
        if (next > radius || next >= boundaryDistance[nid]) return;
        boundaryDistance[nid] = next;
        heap.push(nid, next);
      });
    }
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  class BoundaryDistanceHeap {
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


  // ---- src/sim/geology/axes.js ----

  function updateTectonicAxes(world) {
    const { grid } = world;
    decayAxes(grid);
    const seeds = buildAxisSeeds(grid);
    naturalizeAxis(grid, seeds.mountain, grid.mountainAxisSeed, 5, 0.62, { continentalBias: true });
    naturalizeAxis(grid, seeds.ridge, grid.ridgeAxis, 4, 0.7, { oceanicBias: true });
    naturalizeAxis(grid, seeds.trench, grid.trenchAxis, 3, 0.68, { oceanicBias: true, arcBend: true });
    naturalizeAxis(grid, seeds.rift, grid.riftAxis, 5, 0.58, { continentalBias: true, segmented: true });
    rebuildCombinedAxis(grid);
    measureAxisDiagnostics(grid);
  }

  function updateSurfaceContinuityDiagnostics(grid) {
    measureFieldBlockiness(grid, grid.mountainHeight, grid.mountainHeightBlockiness);
    measureFieldContinuity(grid, grid.orographicBarrier, grid.orographicBarrierContinuity);
  }

  function decayAxes(grid) {
    const { size, tectonicAxis, mountainAxisSeed, ridgeAxis, trenchAxis, riftAxis, axisBoundaryDependency } = grid;
    for (let i = 0; i < size; i += 1) {
      tectonicAxis[i] *= 0.9;
      mountainAxisSeed[i] *= 0.88;
      ridgeAxis[i] *= 0.82;
      trenchAxis[i] *= 0.84;
      riftAxis[i] *= 0.9;
      axisBoundaryDependency[i] *= 0.88;
    }
  }

  function buildAxisSeeds(grid) {
    const {
      size,
      crustType,
      crustThickness,
      crustAge,
      boundaryKind,
      boundaryInfluence,
      boundaryCoherence,
      noisyBoundaryPatch,
      plateCheckerboard,
      stress,
      weakness,
      oldOrogeny,
      transformMemory,
      fractureZoneMemory,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const mountain = scratch;
    const ridge = scratch2;
    const trench = scratch3;
    const rift = new Float32Array(size);
    mountain.fill(0);
    ridge.fill(0);
    trench.fill(0);
    const graphBacked = isGraphBackedGrid(grid);
    const stressModel = graphBacked ? measureAxisGraphStressModel(grid) : null;

    for (let i = 0; i < size; i += 1) {
      const active = Math.min(1, graphBacked ? axisActiveBoundaryInfluence(grid, i) : boundaryInfluence[i]);
      const s = graphBacked ? normalizedAxisGraphStress(stress[i], stressModel) : Math.min(2.5, stress[i]);
      if (active <= 0.012 || s <= (graphBacked ? 0.03 : 0.008)) continue;
      const coherence = Math.max(0, Math.min(1, boundaryCoherence[i] ?? 1));
      const noisyGate = noisyBoundaryPatch[i] ? 0.06 : 1;
      const checkerGate = Math.max(0, 1 - (plateCheckerboard[i] ?? 0) * 2.4);
      const memoryPull = 0.55 + Math.min(0.45, oldOrogeny[i] * 0.8 + transformMemory[i] * 0.2 + fractureZoneMemory[i] * 0.12);
      const seedPower = active * s * (0.2 + coherence * 0.8) * noisyGate * checkerGate * memoryPull * (graphBacked ? 0.24 : 1);
      if (seedPower <= 0.0001) continue;

      const continental = crustType[i] === CrustType.CONTINENTAL;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      const oceanic = crustType[i] === CrustType.OCEANIC;
      if (boundaryKind[i] === BoundaryType.CONVERGENT) {
        if (continental || transitional) mountain[i] = Math.max(mountain[i], seedPower * (0.7 + crustThickness[i] * 0.55));
        if (oceanic || transitional) trench[i] = Math.max(trench[i], seedPower * (0.65 + crustAge[i] * 0.5));
      } else if (boundaryKind[i] === BoundaryType.DIVERGENT) {
        if (oceanic) ridge[i] = Math.max(ridge[i], seedPower * (0.8 + Math.max(0, 0.35 - crustAge[i]) * 0.7));
        else rift[i] = Math.max(rift[i], seedPower * (0.65 + weakness[i] * 0.55));
      }
    }
    return { mountain, ridge, trench, rift };
  }

  function axisActiveBoundaryInfluence(grid, id) {
    if (!grid.activeBoundary?.[id]) return 0;
    return Math.min(1, grid.boundaryInfluence[id] * 0.72 + 0.28);
  }

  function measureAxisGraphStressModel(grid) {
    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < grid.size; i += 1) {
      if (!grid.activeBoundary?.[i]) continue;
      const value = grid.stress[i];
      if (!Number.isFinite(value) || value <= 0) continue;
      sum += value;
      count += 1;
      if (value > max) max = value;
    }
    return {
      max,
      scale: Math.max(0.00045, Math.min(0.006, max * 0.55, count ? (sum / count) * 2.8 : 0.00045)),
    };
  }

  function normalizedAxisGraphStress(value, model) {
    if (!model || value <= 0 || model.max <= 0) return 0;
    const scaled = value / Math.max(1e-7, model.scale);
    return Math.min(1, scaled / (1 + scaled));
  }

  function naturalizeAxis(grid, source, target, referenceRadius, gain, options = {}) {
    const { size, weakness, oldOrogeny, riftStage, transformMemory, fractureZoneMemory, crustType, noisyBoundaryPatch, plateCheckerboard } = grid;
    const radius = Math.max(1, Math.min(physicalRadius(grid, referenceRadius), physicalRadius(grid, 8)));
    const seedSource = new Float32Array(source);
    const spread = new Float32Array(size);
    const topology = topologyForGrid(grid);

    if (isGraphBackedGrid(grid, topology)) {
      naturalizeAxisGraph(grid, topology, seedSource, spread, radius, gain, options);
      for (let i = 0; i < size; i += 1) {
        if (spread[i] > 0) target[i] = Math.min(1, Math.max(target[i], spread[i]));
      }
      return;
    }

    forEachGridCell(grid, (id, x, y) => {
      const seed = seedSource[id];
      if (seed <= 0.0001) return;
      const pull = weakness[id] - 0.5 + oldOrogeny[id] * 0.18 + (riftStage[id] > 0 ? 0.12 : 0) + transformMemory[id] * 0.08 - fractureZoneMemory[id] * 0.04;
      const bendX = Math.round(pull * radius * 1.15 + (hash2(Math.floor(x / 13), Math.floor(y / 9)) - 0.5) * radius * 0.8);
      const bendY = Math.round((hash2(Math.floor((x + 5) / 17), Math.floor((y + 3) / 11)) - 0.5) * radius * 0.7);
      const segment = legacyAxisSegmentMask(x, y, weakness[id], options.segmented);
      const arcShift = options.arcBend ? Math.max(1, Math.round(radius * 0.55)) : 0;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const dist = Math.hypot(dx, dy);
          if (dist > radius + 0.01) continue;
          const nid = legacyAxisIndexOf(grid, x + dx + bendX, y + dy + bendY + arcShift);
          if (nid < 0) continue;
          if (noisyBoundaryPatch[nid] && dist <= 1.5) continue;
          if ((plateCheckerboard[nid] ?? 0) > 0.32) continue;
          if (options.continentalBias && crustType[nid] === CrustType.OCEANIC && dist > radius * 0.45) continue;
          if (options.oceanicBias && crustType[nid] === CrustType.CONTINENTAL && dist > radius * 0.55) continue;
          const weakWeight = 0.55 + weakness[nid] * 0.65 + oldOrogeny[nid] * 0.25;
          const falloff = Math.max(0, 1 - dist / (radius + 0.65));
          const addition = seed * gain * falloff * weakWeight * segment;
          if (addition > spread[nid]) spread[nid] = addition;
        }
      }
    });

    for (let i = 0; i < size; i += 1) {
      if (spread[i] > 0) target[i] = Math.min(1, Math.max(target[i], spread[i]));
    }
  }

  function naturalizeAxisGraph(grid, topology, source, spread, radius, gain, options = {}) {
    const { weakness, oldOrogeny, riftStage, transformMemory, fractureZoneMemory, crustType, noisyBoundaryPatch, plateCheckerboard } = grid;
    const radiusLimit = radius + 0.5;
    for (let id = 0; id < grid.size; id += 1) {
      const seed = source[id];
      if (seed <= 0.0001) continue;
      const pull = weakness[id] - 0.5 + oldOrogeny[id] * 0.18 + (riftStage[id] > 0 ? 0.12 : 0) + transformMemory[id] * 0.08 - fractureZoneMemory[id] * 0.04;
      const segment = graphAxisSegmentMask(grid, id, id, weakness[id], options.segmented);
      topology.forEachNeighborRing(id, radius, (nid, depth) => {
        const dist = Math.max(0, depth);
        if (dist > radiusLimit) return;
        if (noisyBoundaryPatch[nid] && dist <= 1.5) return;
        if ((plateCheckerboard[nid] ?? 0) > 0.32) return;
        if (options.continentalBias && crustType[nid] === CrustType.OCEANIC && dist > radius * 0.45) return;
        if (options.oceanicBias && crustType[nid] === CrustType.CONTINENTAL && dist > radius * 0.55) return;
        const bendWeight = Math.max(0.55, Math.min(1.15, 0.92 + pull * 0.18));
        const weakWeight = 0.55 + weakness[nid] * 0.65 + oldOrogeny[nid] * 0.25;
        const falloff = Math.max(0, 1 - dist / radiusLimit);
        const localSegment = Math.min(segment, graphAxisSegmentMask(grid, id, nid, weakness[nid], options.segmented));
        const addition = seed * gain * falloff * weakWeight * bendWeight * localSegment;
        if (addition > spread[nid]) spread[nid] = addition;
      });
      spread[id] = Math.max(spread[id], seed * gain * (0.6 + weakness[id] * 0.55) * segment);
    }
  }

  function rebuildCombinedAxis(grid) {
    const { size, tectonicAxis, mountainAxisSeed, ridgeAxis, trenchAxis, riftAxis } = grid;
    for (let i = 0; i < size; i += 1) {
      tectonicAxis[i] = Math.max(mountainAxisSeed[i], ridgeAxis[i] * 0.9, trenchAxis[i] * 0.95, riftAxis[i] * 0.82);
    }
  }

  function measureAxisDiagnostics(grid) {
    const { tectonicAxis, axisCurvature, axisContinuity, axisBoundaryDependency, axisSegmentId, boundaryInfluence, activeBoundary, scratch } = grid;
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    const axisThreshold = graphBacked ? 0.016 : 0.035;
    const segmentThreshold = graphBacked ? 0.028 : 0.06;
    scratch.fill(0);
    let nextSegment = 1;

    forEachGridCell(grid, (id, x, y) => {
      const v = tectonicAxis[id];
      if (v <= axisThreshold) {
        axisCurvature[id] = 0;
        axisContinuity[id] = 0;
        axisBoundaryDependency[id] = 0;
        axisSegmentId[id] = 0;
        return;
      }

      const diagnostic = isGraphBackedGrid(grid, topology)
        ? sampleGraphAxisDiagnostic(grid, topology, tectonicAxis, id)
        : sampleLegacyAxisDiagnostic(grid, tectonicAxis, x, y);
      axisCurvature[id] = diagnostic.curvature;
      axisContinuity[id] = Math.min(1, (diagnostic.localMax + v) * 0.5);
      axisBoundaryDependency[id] = Math.min(1, v * 0.45 + boundaryInfluence[id] * 0.45 + (activeBoundary[id] ? 0.1 : 0));
    });

    for (let i = 0; i < axisSegmentId.length; i += 1) axisSegmentId[i] = 0;
    const queue = new Int32Array(axisSegmentId.length);
    for (let start = 0; start < axisSegmentId.length; start += 1) {
      if (tectonicAxis[start] <= segmentThreshold || axisSegmentId[start]) continue;
      const segmentId = nextSegment++;
      let head = 0;
      let tail = 0;
      axisSegmentId[start] = segmentId;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        visitAxisSegmentNeighbors(grid, topology, id, (nid) => {
          if (tectonicAxis[nid] <= segmentThreshold || axisSegmentId[nid]) return;
          axisSegmentId[nid] = segmentId;
          queue[tail++] = nid;
        });
      }
    }
  }

  function measureFieldBlockiness(grid, field, output) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      measureGraphFieldBlockiness(grid, topology, field, output);
      return;
    }

    forEachGridCell(grid, (id, x, y) => {
      const v = field[id];
      if (v <= 0.0001) {
        output[id] = 0;
        return;
      }
      const left = legacyAxisSample(grid, field, x - 1, y);
      const right = legacyAxisSample(grid, field, x + 1, y);
      const up = legacyAxisSample(grid, field, x, y - 1);
      const down = legacyAxisSample(grid, field, x, y + 1);
      const cardinal = Math.abs(left - right) + Math.abs(up - down);
      const diagonal = Math.abs(legacyAxisSample(grid, field, x - 1, y - 1) - legacyAxisSample(grid, field, x + 1, y + 1))
        + Math.abs(legacyAxisSample(grid, field, x + 1, y - 1) - legacyAxisSample(grid, field, x - 1, y + 1));
      output[id] = Math.min(1, Math.abs(cardinal - diagonal) * 2.8);
    });
  }

  function measureFieldContinuity(grid, field, output) {
    const topology = topologyForGrid(grid);
    forEachGridCell(grid, (id) => {
      const v = field[id];
      if (v <= 0.0001) {
        output[id] = 0;
        return;
      }
      let neighbors = 0;
      let total = 0;
      visitAxisSegmentNeighbors(grid, topology, id, (nid) => {
        total += 1;
        if (field[nid] > v * 0.35) neighbors += 1;
      });
      output[id] = total ? neighbors / total : 0;
    });
  }

  function sampleLegacyAxisDiagnostic(grid, field, x, y) {
    const left = legacyAxisSample(grid, field, x - 1, y);
    const right = legacyAxisSample(grid, field, x + 1, y);
    const up = legacyAxisSample(grid, field, x, y - 1);
    const down = legacyAxisSample(grid, field, x, y + 1);
    const dx = Math.abs(left - right);
    const dy = Math.abs(up - down);
    const localMax = Math.max(left, right, up, down);
    return {
      curvature: Math.min(1, Math.abs(dx - dy) * 4 + Math.min(dx + dy, 1) * 0.25),
      localMax,
    };
  }

  function sampleGraphAxisDiagnostic(grid, topology, field, id) {
    const center = field[id];
    let neighborCount = 0;
    let localMax = 0;
    let totalDelta = 0;
    let totalDeltaSq = 0;
    topology.forEachNeighbor(id, (nid) => {
      const delta = Math.abs(center - field[nid]);
      neighborCount += 1;
      totalDelta += delta;
      totalDeltaSq += delta * delta;
      if (field[nid] > localMax) localMax = field[nid];
    });
    if (!neighborCount) return { curvature: 0, localMax: 0 };
    const mean = totalDelta / neighborCount;
    const variance = Math.max(0, totalDeltaSq / neighborCount - mean * mean);
    return {
      curvature: Math.min(1, Math.sqrt(variance) * 5.2 + mean * 0.32),
      localMax,
    };
  }

  function measureGraphFieldBlockiness(grid, topology, field, output) {
    forEachGridCell(grid, (id) => {
      const v = field[id];
      if (v <= 0.0001) {
        output[id] = 0;
        return;
      }
      let count = 0;
      let totalDelta = 0;
      let totalDeltaSq = 0;
      topology.forEachNeighbor(id, (nid) => {
        const delta = Math.abs(v - field[nid]);
        count += 1;
        totalDelta += delta;
        totalDeltaSq += delta * delta;
      });
      if (!count) {
        output[id] = 0;
        return;
      }
      const mean = totalDelta / count;
      const variance = Math.max(0, totalDeltaSq / count - mean * mean);
      output[id] = Math.min(1, Math.sqrt(variance) * 3.8 + mean * 0.18);
    });
  }

  function visitAxisSegmentNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function legacyAxisSegmentMask(x, y, weakness, forceSegmented) {
    const coarse = hash2(Math.floor((x + 3) / 19), Math.floor((y + 5) / 13));
    const fine = hash2(Math.floor((x + 11) / 7), Math.floor((y + 2) / 7));
    const keep = forceSegmented ? 0.62 + weakness * 0.28 : 0.76 + weakness * 0.2;
    return coarse * 0.7 + fine * 0.3 <= keep ? 1 : 0.72;
  }

  function graphAxisSegmentMask(grid, sourceId, targetId, weakness, forceSegmented) {
    const sx = grid.positionX?.[sourceId] ?? 0;
    const sy = grid.positionY?.[sourceId] ?? 0;
    const sz = grid.positionZ?.[sourceId] ?? 1;
    const tx = grid.positionX?.[targetId] ?? 0;
    const ty = grid.positionY?.[targetId] ?? 0;
    const tz = grid.positionZ?.[targetId] ?? 1;
    const mx = sx + tx;
    const my = sy + ty;
    const mz = sz + tz;
    const length = Math.hypot(mx, my, mz) || 1;
    const lat = Math.asin(Math.max(-1, Math.min(1, my / length)));
    const lon = Math.atan2(mz / length, mx / length);
    const coarseLon = Math.floor((lon + Math.PI) * 5.25);
    const coarseLat = Math.floor((lat + Math.PI / 2) * 6.5);
    const fineLon = Math.floor((lon + Math.PI) * 14.5);
    const fineLat = Math.floor((lat + Math.PI / 2) * 18.5);
    const sourceBand = Math.floor((Math.atan2(sz, sx) + Math.PI) * 3.5);
    const coarse = hash2(coarseLon + sourceBand * 17, coarseLat + sourceBand * 11);
    const fine = hash2(fineLon + sourceBand * 23, fineLat + sourceBand * 19);
    const keep = forceSegmented ? 0.62 + weakness * 0.28 : 0.76 + weakness * 0.2;
    return coarse * 0.7 + fine * 0.3 <= keep ? 1 : 0.72;
  }

  function hash2(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function legacyAxisIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function legacyAxisSample(grid, field, x, y) {
    const id = legacyAxisIndexOf(grid, x, y);
    if (id < 0) return 0;
    return sampleGridWrapped(grid, field, x, y);
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }


  // ---- src/sim/geology/features.js ----

  const TectonicFeature = {
    NONE: 0,
    MOUNTAIN_BELT: 1,
    TRENCH: 2,
    RIDGE: 3,
    RIFT: 4,
    ISLAND_ARC: 5,
    BASIN: 6,
  };

  function buildTectonicFeatures(world) {
    buildTectonicFeaturesV2(world);
  }

  function buildTectonicFeaturesV2(world) {
    const { grid } = world;
    decayActiveFeatures(grid);
    const sources = seedFeatureSources(grid);
    blendAxisSources(grid, sources);
    diffuseFeature(grid, sources.mountain, grid.mountainBelt, 6, 0.18, { continentalOnly: true, minWeakness: 0.28 });
    diffuseFeature(grid, sources.trench, grid.trench, 2, 0.24, { oceanicBias: true, minWeakness: 0.2 });
    diffuseFeature(grid, sources.ridge, grid.ridge, 4, 0.2, { oceanicBias: true, minWeakness: 0.32 });
    diffuseFeature(grid, sources.rift, grid.rift, 5, 0.16, { continentalOnly: true, minWeakness: 0.42, segmented: true });
    diffuseFeature(grid, sources.arc, grid.islandArc, 3, 0.18, { minWeakness: 0.24, arcOffset: true });
    diffuseFeature(grid, sources.basin, grid.basin, 5, 0.08, { minWeakness: 0.22, segmented: true });
    updateDominantFeature(grid);
  }

  function decayActiveFeatures(grid) {
    const { size, mountainBelt, trench, ridge, rift, islandArc, basin, sediment } = grid;
    for (let i = 0; i < size; i += 1) {
      mountainBelt[i] *= 0.90;
      trench[i] *= 0.78;
      ridge[i] *= 0.76;
      rift[i] *= 0.86;
      islandArc[i] *= 0.82;
      basin[i] = Math.min(1, basin[i] * 0.995 + sediment[i] * 0.0008);
    }
  }

  function seedFeatureSources(grid) {
    const { size, crustType, crustThickness, crustAge, boundaryKind, boundaryInfluence, stress, weakness, boundaryCoherence, noisyBoundaryPatch, scratch, scratch2, scratch3 } = grid;
    const mountain = scratch;
    const trench = scratch2;
    const ridge = scratch3;
    const rift = new Float32Array(size);
    const arc = new Float32Array(size);
    const basin = new Float32Array(size);
    mountain.fill(0);
    trench.fill(0);
    ridge.fill(0);
    const graphBacked = isGraphBackedGrid(grid);
    const stressModel = graphBacked ? measureFeatureGraphStressModel(grid) : null;

    for (let i = 0; i < size; i += 1) {
      const active = Math.min(1, graphBacked ? featureActiveBoundaryInfluence(grid, i) : boundaryInfluence[i]);
      const s = graphBacked
        ? normalizedFeatureGraphStress(stress[i], stressModel)
        : Math.min(2.5, stress[i]);
      if (active <= 0.015 || s <= (graphBacked ? 0.03 : 0.01)) continue;
      const weak = weakness[i];
      const weakGate = weak > 0.34 ? 1 : weak > 0.22 ? 0.45 : 0.12;
      const broken = weak < 0.3 && featureSeedBreakNoise(grid, i, graphBacked) < 0.375 ? 0.35 : 1;
      const coherenceFactor = noisyBoundaryPatch[i] ? 0.12 : 0.35 + (boundaryCoherence[i] ?? 1) * 0.65;
      const signal = active * s * weakGate * broken * coherenceFactor * (graphBacked ? 0.42 : 1);
      const continental = crustType[i] === CrustType.CONTINENTAL;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      const oceanic = crustType[i] === CrustType.OCEANIC;

      if (boundaryKind[i] === BoundaryType.CONVERGENT) {
        if (continental && crustThickness[i] > 0.54) {
          mountain[i] += signal * (0.9 + crustThickness[i] * 0.35);
        } else if (transitional && crustThickness[i] > 0.42) {
          arc[i] += signal * 0.35;
          basin[i] += signal * 0.18;
        } else if (oceanic && crustAge[i] > 0.2) {
          trench[i] += signal * (0.75 + crustAge[i] * 0.55);
          arc[i] += signal * 0.42;
        } else {
          arc[i] += signal * 0.5;
          trench[i] += signal * 0.25;
        }
      } else if (boundaryKind[i] === BoundaryType.DIVERGENT) {
        if (continental) {
          rift[i] += signal * (0.75 + weak * 0.55);
          basin[i] += signal * 0.22;
        } else if (transitional) {
          rift[i] += signal * (0.55 + weak * 0.5);
          basin[i] += signal * 0.34;
        } else {
          ridge[i] += signal * (0.75 + Math.max(0, 0.4 - crustAge[i]) * 0.8);
        }
      } else if (boundaryKind[i] === BoundaryType.TRANSFORM) {
        basin[i] += signal * (0.22 + weak * 0.25);
      }
    }

    return { mountain, trench, ridge, rift, arc, basin };
  }

  function featureActiveBoundaryInfluence(grid, id) {
    if (!grid.activeBoundary?.[id]) return 0;
    return Math.min(1, grid.boundaryInfluence[id] * 0.72 + 0.28);
  }

  function measureFeatureGraphStressModel(grid) {
    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < grid.size; i += 1) {
      if (!grid.activeBoundary?.[i]) continue;
      const value = grid.stress[i];
      if (!Number.isFinite(value) || value <= 0) continue;
      sum += value;
      count += 1;
      if (value > max) max = value;
    }
    return {
      mean: count ? sum / count : 0,
      max,
      scale: Math.max(0.00045, Math.min(0.006, max * 0.55, count ? (sum / count) * 2.8 : 0.00045)),
    };
  }

  function normalizedFeatureGraphStress(value, model) {
    if (!model || value <= 0 || model.max <= 0) return 0;
    const scaled = value / Math.max(1e-7, model.scale);
    const normalized = scaled / (1 + scaled);
    return Math.min(1, normalized);
  }

  function featureSeedBreakNoise(grid, id, graphBacked) {
    if (graphBacked) {
      const px = grid.positionX?.[id] ?? 0;
      const py = grid.positionY?.[id] ?? 0;
      const pz = grid.positionZ?.[id] ?? 1;
      const lon = Math.atan2(py, px);
      const lat = Math.asin(Math.max(-1, Math.min(1, pz)));
      const coarseLon = Math.floor((lon + Math.PI) * 9.5);
      const coarseLat = Math.floor((lat + Math.PI / 2) * 11.5);
      const fineLon = Math.floor((lon + Math.PI) * 23.5);
      const fineLat = Math.floor((lat + Math.PI / 2) * 27.5);
      return hash2(coarseLon, coarseLat) * 0.7 + hash2(fineLon + 17, fineLat + 29) * 0.3;
    }
    return (((id * 1103515245 + 12345) >>> 0) & 7) / 8;
  }

  function blendAxisSources(grid, sources) {
    const { size, mountainAxisSeed, ridgeAxis, trenchAxis, riftAxis } = grid;
    for (let i = 0; i < size; i += 1) {
      sources.mountain[i] = Math.max(sources.mountain[i] * 0.25, mountainAxisSeed[i] * 0.95);
      sources.ridge[i] = Math.max(sources.ridge[i] * 0.25, ridgeAxis[i] * 0.92);
      sources.trench[i] = Math.max(sources.trench[i] * 0.25, trenchAxis[i] * 0.9);
      sources.rift[i] = Math.max(sources.rift[i] * 0.25, riftAxis[i] * 0.9);
      sources.arc[i] = Math.max(sources.arc[i] * 0.45, trenchAxis[i] * 0.36);
      sources.basin[i] = Math.max(sources.basin[i], riftAxis[i] * 0.18, mountainAxisSeed[i] * 0.08);
    }
  }

  function diffuseFeature(grid, source, target, referenceRadius, gain, options = {}) {
    const { size, crustType, weakness } = grid;
    const radius = Math.max(1, Math.min(physicalRadius(grid, referenceRadius), physicalRadius(grid, 8)));
    const spread = new Float32Array(size);
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      diffuseFeatureGraph(grid, topology, source, spread, radius, gain, options);
    } else {
      legacyDiffuseFeatureRaster(grid, source, spread, radius, gain, options);
    }

    for (let i = 0; i < size; i += 1) {
      if (spread[i] > 0) target[i] = Math.min(1, target[i] + spread[i]);
    }
  }

  function legacyDiffuseFeatureRaster(grid, source, spread, radius, gain, options) {
    const { crustType, weakness } = grid;
    forEachGridCell(grid, (id, x, y) => {
      const seed = source[id];
      if (seed <= 0.0001) return;
      const bend = Math.round((weakness[id] - 0.5) * radius * 0.9);
      const arcShift = options.arcOffset ? Math.max(1, Math.round(radius * 0.75)) : 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const dist = Math.hypot(dx, dy);
          if (dist > radius + 0.01) continue;
          const sx = x + dx + bend;
          const sy = y + dy + arcShift;
          const nid = legacyFeatureIndexOf(grid, sx, sy);
          if (nid < 0) continue;
          if (options.continentalOnly && crustType[nid] !== CrustType.CONTINENTAL) continue;
          if (options.oceanicBias && crustType[nid] !== CrustType.OCEANIC && dist > radius * 0.45) continue;
          const weak = weakness[nid];
          if (weak < (options.minWeakness ?? 0) && dist > 1.5) continue;
          if (options.segmented && weak < 0.38 && legacySegmentMask(sx, sy, weak) < 0.8) continue;
          const falloff = Math.max(0, 1 - dist / (radius + 0.5));
          const weakWeight = 0.45 + weak * 0.9;
          const addition = seed * gain * falloff * weakWeight;
          if (addition > spread[nid]) spread[nid] = addition;
        }
      }
    });
  }

  function diffuseFeatureGraph(grid, topology, source, spread, radius, gain, options) {
    const { size, crustType, weakness } = grid;
    const radiusLimit = radius + 0.5;
    for (let id = 0; id < size; id += 1) {
      const seed = source[id];
      if (seed <= 0.0001) continue;
      const arcOffsetDepth = options.arcOffset ? Math.max(1, Math.round(radius * 0.75)) : 0;
      topology.forEachNeighborRing(id, radius + arcOffsetDepth, (nid, dx) => {
        const edgeDistance = Math.max(0, dx);
        if (edgeDistance > radiusLimit + arcOffsetDepth) return;
        const targetDistance = Math.max(0, edgeDistance - arcOffsetDepth);
        if (targetDistance > radiusLimit) return;
        if (options.continentalOnly && crustType[nid] !== CrustType.CONTINENTAL) return;
        if (options.oceanicBias && crustType[nid] !== CrustType.OCEANIC && targetDistance > radius * 0.45) return;
        const weak = weakness[nid];
        if (weak < (options.minWeakness ?? 0) && targetDistance > 1.5) return;
        if (options.segmented) {
          if (weak < 0.38 && graphSegmentMask(grid, id, nid, weak) < 0.8) return;
        }
        if (options.arcOffset && edgeDistance < arcOffsetDepth) return;
        const falloff = Math.max(0, 1 - targetDistance / radiusLimit);
        const weakWeight = 0.45 + weak * 0.9;
        const addition = seed * gain * falloff * weakWeight;
        if (addition > spread[nid]) spread[nid] = addition;
      });
      if (!options.arcOffset) {
        const weak = weakness[id];
        if (!options.continentalOnly || crustType[id] === CrustType.CONTINENTAL) {
          spread[id] = Math.max(spread[id], seed * gain * (0.45 + weak * 0.9));
        }
      }
    }
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  function legacySegmentMask(x, y, weakness) {
    const sx = Math.floor((x + 5) / 11);
    const sy = Math.floor((y + 3) / 9);
    const n = hash2(sx, sy);
    return n < 0.58 + weakness * 0.28 ? 1 : 0.65;
  }

  function legacyFeatureIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function graphSegmentMask(grid, sourceId, targetId, weakness) {
    const sx = grid.positionX?.[sourceId] ?? 0;
    const sy = grid.positionY?.[sourceId] ?? 0;
    const sz = grid.positionZ?.[sourceId] ?? 1;
    const tx = grid.positionX?.[targetId] ?? 0;
    const ty = grid.positionY?.[targetId] ?? 0;
    const tz = grid.positionZ?.[targetId] ?? 1;
    const mx = sx + tx;
    const my = sy + ty;
    const mz = sz + tz;
    const length = Math.hypot(mx, my, mz) || 1;
    const lat = Math.asin(Math.max(-1, Math.min(1, my / length)));
    const lon = Math.atan2(mz / length, mx / length);
    const coarseLon = Math.floor((lon + Math.PI) * 5.6);
    const coarseLat = Math.floor((lat + Math.PI / 2) * 7.2);
    const fineLon = Math.floor((lon + Math.PI) * 15.4);
    const fineLat = Math.floor((lat + Math.PI / 2) * 18.8);
    const sourceBand = Math.floor((Math.atan2(sz, sx) + Math.PI) * 4.1);
    const coarse = hash2(coarseLon + sourceBand * 13, coarseLat + sourceBand * 17);
    const fine = hash2(fineLon + sourceBand * 19, fineLat + sourceBand * 23);
    const n = coarse * 0.72 + fine * 0.28;
    return n < 0.58 + weakness * 0.28 ? 1 : 0.65;
  }

  function hash2(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function updateDominantFeature(grid) {
    const { size, tectonicFeature, featureIntensity, mountainBelt, trench, ridge, rift, islandArc, basin } = grid;
    for (let i = 0; i < size; i += 1) {
      let kind = TectonicFeature.NONE;
      let value = 0;
      if (mountainBelt[i] > value) { kind = TectonicFeature.MOUNTAIN_BELT; value = mountainBelt[i]; }
      if (trench[i] > value) { kind = TectonicFeature.TRENCH; value = trench[i]; }
      if (ridge[i] > value) { kind = TectonicFeature.RIDGE; value = ridge[i]; }
      if (rift[i] > value) { kind = TectonicFeature.RIFT; value = rift[i]; }
      if (islandArc[i] > value) { kind = TectonicFeature.ISLAND_ARC; value = islandArc[i]; }
      if (basin[i] > value) { kind = TectonicFeature.BASIN; value = basin[i]; }
      tectonicFeature[i] = kind;
      featureIntensity[i] = value;
    }
  }


  // ---- src/sim/geology/orogeny.js ----

  function updateOrogenicLifecycle(world) {
    updateActiveOrogeny(world);
    erodeAndAgeOrogens(world);
    if (world.step % 4 === 0) {
      broadenOldOrogeny(world.grid);
      updateForelandBasins(world.grid);
    }
    rebuildMountainInterfaceFields(world);
  }

  function updateActiveOrogeny(world) {
    const { grid } = world;
    const {
      size,
      crustType,
      crustThickness,
      boundaryKind,
      boundaryInfluence,
      boundaryCoherence,
      noisyBoundaryPatch,
      mountainAxisSeed,
      trenchAxis,
      stress,
      activeOrogeny,
      oldOrogeny,
      orogeny,
      orogenyAge,
      mountainBelt,
      islandArc,
      trench,
    } = grid;
    const dt = world.timeScaleFactor;
    const activeDecay = Math.pow(0.5, dt / 18);

    for (let i = 0; i < size; i += 1) {
      activeOrogeny[i] *= activeDecay;
      if (boundaryKind[i] !== BoundaryType.CONVERGENT) continue;

      const axis = Math.max(mountainAxisSeed[i], trenchAxis[i] * 0.42);
      const active = Math.max(Math.min(1, boundaryInfluence[i]) * 0.28, axis);
      const s = Math.min(2.5, stress[i]);
      if (active <= 0.025 || s <= 0.02) continue;

      const continental = crustType[i] === CrustType.CONTINENTAL;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      const oceanic = crustType[i] === CrustType.OCEANIC;
      const coherent = noisyBoundaryPatch[i] ? 0.08 : 0.38 + (boundaryCoherence[i] ?? 1) * 0.62;
      const thick = Math.max(0, crustThickness[i] - 0.42);
      const collisionPower = continental ? active * s * coherent * (0.85 + thick * 1.35) : 0;
      const arcPower = transitional || oceanic ? active * s * coherent * (0.22 + (trench[i] + islandArc[i]) * 0.62) : 0;
      const power = Math.min(1, collisionPower * 0.92 + arcPower * 0.46);
      if (power <= 0.0001) continue;

      activeOrogeny[i] = Math.max(activeOrogeny[i], power);
      mountainBelt[i] = Math.min(1, mountainBelt[i] + power * (continental ? 0.065 : 0.024) * dt);
      const rootGain = power * (continental ? 0.034 : transitional ? 0.011 : 0.0028) * dt;
      orogeny[i] = Math.min(1, orogeny[i] + rootGain);
      orogenyAge[i] = Math.max(0, orogenyAge[i] * (1 - Math.min(0.65, power * 0.18 * dt)));
    }
  }

  function erodeAndAgeOrogens(world) {
    const { grid } = world;
    const {
      size,
      crustType,
      elev,
      boundaryInfluence,
      activeOrogeny,
      oldOrogeny,
      orogeny,
      orogenyAge,
      orogenyErosion,
      orogenicSedimentSupply,
      sediment,
      basin,
      passiveMargin,
      continentalRise,
      forelandBasin,
      mountainBelt,
    } = grid;
    const dt = world.timeScaleFactor;
    const ageGain = 1 / 260;
    const activeDecay = Math.pow(0.5, dt / 18);
    const oldDecay = Math.pow(0.5, dt / 460);

    for (let i = 0; i < size; i += 1) {
      const active = Math.min(1, boundaryInfluence[i]);
      const inactive = 1 - active;
      const continentalFamily = crustType[i] === CrustType.CONTINENTAL || crustType[i] === CrustType.TRANSITIONAL;
      orogenyAge[i] = Math.min(1, orogenyAge[i] + ageGain * dt * (0.35 + inactive * 0.95));
      const inactiveRoot = orogeny[i] * inactive * inactive * (continentalFamily ? 1.35 : 0.42);
      oldOrogeny[i] = Math.max(oldOrogeny[i] * oldDecay, inactiveRoot);

      const ageFactor = smoothstep(0.08, 0.8, orogenyAge[i]);
      const heightProxy = Math.max(0, elev[i]);
      const erosion =
        (activeOrogeny[i] * 0.0022 + oldOrogeny[i] * 0.001 + orogeny[i] * 0.00055) *
        dt *
        (0.55 + inactive * 0.8 + ageFactor * 0.45 + heightProxy * 1.6);
      const eroded = Math.min(orogeny[i] + oldOrogeny[i] * 0.45, erosion);

      orogeny[i] = Math.max(0, orogeny[i] - eroded * 0.5);
      oldOrogeny[i] = Math.max(0, oldOrogeny[i] - eroded * 0.18);
      mountainBelt[i] *= activeDecay;
      if (!continentalFamily) oldOrogeny[i] *= Math.max(0, 1 - 0.028 * dt);

      orogenyErosion[i] = eroded;
      orogenicSedimentSupply[i] = Math.max(0, orogenicSedimentSupply[i] * 0.9 + eroded * 2.8);
      const localSink = Math.max(
        forelandBasin[i] * 1.9,
        basin[i] * 1.15,
        passiveMargin[i] * 0.95,
        continentalRise[i] * 1.05,
      );
      sediment[i] = Math.min(1, sediment[i] + eroded * (0.16 + localSink * 0.22));
      basin[i] = Math.min(1, basin[i] + forelandBasin[i] * eroded * 0.28);
    }
  }

  function broadenOldOrogeny(grid) {
    const { width, oldOrogeny, orogeny, orogenyAge, weakness, crustType, boundaryInfluence, scratch, scratch2, scratch3 } = grid;
    const radius = Math.max(2, physicalRadius(grid, 5));
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    scratch.set(oldOrogeny);
    scratch2.set(orogenyAge);
    scratch3.set(orogeny);

    forEachGridCell(grid, (id, x, y) => {
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      const sourceMemory = Math.max(scratch[id], scratch3[id] * inactive * 0.85);
      if (sourceMemory < 0.0035) return;
      const rootMemory = sourceMemory + Math.max(0, scratch2[id] - 0.35) * sourceMemory * 0.45;
      const bend = Math.round((weakness[id] - 0.5) * radius * 0.9);
      let total = rootMemory * 3.5;
      let ageTotal = scratch2[id] * 3.5;
      let weight = 3.5;
      visitOrogenyNeighborhood(grid, topology, id, x, y, radius, bend, (nid, dist) => {
        if (crustType[nid] === CrustType.OCEANIC) return;
        const falloff = (1 - dist / (radius + 0.5)) * (0.55 + weakness[nid] * 0.65);
        if (falloff <= 0) return;
        const neighborInactive = 1 - Math.min(1, boundaryInfluence[nid]);
        const neighborSource = Math.max(scratch[nid], scratch3[nid] * neighborInactive * 0.85);
        const neighborMemory = neighborSource + Math.max(0, scratch2[nid] - 0.35) * neighborSource * 0.45;
        total += neighborMemory * falloff;
        ageTotal += scratch2[nid] * falloff;
        weight += falloff;
      });
      const smooth = total / weight;
      const ageSmooth = ageTotal / weight;
      const segment = graphBacked
        ? graphSegmentMask(grid, id, weakness[id])
        : segmentMask(x, y, width ?? grid.faceSize ?? 1, weakness[id]);
      const mix = Math.min(0.42, 0.1 + inactive * 0.26);
      oldOrogeny[id] = Math.min(1, Math.max(sourceMemory, scratch[id] * (1 - mix) + smooth * mix) * segment);
      orogenyAge[id] = Math.max(scratch2[id], ageSmooth * 0.98);
    });
  }

  function updateForelandBasins(grid) {
    const { activeOrogeny, oldOrogeny, forelandBasin, crustType, elev, ridge, trench, basin, sediment, scratch } = grid;
    const radius = Math.max(1, physicalRadius(grid, 5));
    const topology = topologyForGrid(grid);
    scratch.fill(0);

    forEachGridCell(grid, (id, x, y) => {
      const source = Math.max(activeOrogeny[id], oldOrogeny[id] * 0.55);
      if (source < 0.04) return;
      visitForelandNeighborhood(grid, topology, id, x, y, radius, (nid, dist) => {
        const continentalFamily = crustType[nid] === CrustType.CONTINENTAL || crustType[nid] === CrustType.TRANSITIONAL;
        if (!continentalFamily) return;
        const lowRelief = Math.max(0, 1 - Math.max(0, elev[nid]) * 5.5);
        const activeMarginPenalty = Math.max(ridge[nid], trench[nid]) > 0.08 ? 0.25 : 1;
        const falloff = Math.max(0, 1 - dist / (radius + 0.5));
        const value = source * falloff * lowRelief * activeMarginPenalty * 0.32;
        if (value > scratch[nid]) scratch[nid] = value;
      });
    });

    for (let i = 0; i < forelandBasin.length; i += 1) {
      forelandBasin[i] = Math.min(1, forelandBasin[i] * 0.992 + scratch[i]);
      basin[i] = Math.min(1, basin[i] + forelandBasin[i] * 0.0025);
      sediment[i] = Math.min(1, sediment[i] + forelandBasin[i] * 0.0018);
    }
  }

  function rebuildMountainInterfaceFields(world) {
    const { grid, seaLevel } = world;
    const { size, elev, mountainBelt, activeOrogeny, oldOrogeny, orogeny, mountainAxisSeed, tectonicAxis, mountainAxis, mountainHeight, orographicBarrier, scratch, scratch3, crustType } = grid;
    for (let i = 0; i < size; i += 1) {
      const continentalFamily = crustType[i] === CrustType.CONTINENTAL || crustType[i] === CrustType.TRANSITIONAL;
      const naturalAxis = Math.max(mountainAxisSeed[i], tectonicAxis[i] * 0.35);
      const activeMemory = Math.max(mountainBelt[i] * 0.36, activeOrogeny[i] * 0.42);
      const oldMemory = Math.max(oldOrogeny[i] * 0.08, orogeny[i] * 0.06);
      scratch[i] = continentalFamily
        ? Math.max(naturalAxis, activeMemory, oldMemory)
        : Math.max(naturalAxis * 0.16, activeMemory * 0.12);
    }
    smoothAxisField(grid, scratch, mountainAxis);

    for (let i = 0; i < size; i += 1) {
      const rel = Math.max(0, elev[i] - seaLevel);
      const axis = mountainAxis[i];
      const mountainSignal = Math.min(1, axis * 2.4 + mountainBelt[i] * 0.42 + activeOrogeny[i] * 0.35 + oldOrogeny[i] * 0.18);
      scratch3[i] = rel * mountainSignal;
      scratch[i] = rel * Math.min(1, axis * 1.65 + mountainBelt[i] * 0.42 + oldOrogeny[i] * 0.14);
    }
    smoothMountainHeightField(grid, scratch3, mountainHeight);
    smoothBarrierField(grid, scratch, orographicBarrier);
  }

  function segmentMask(x, y, width, weakness) {
    const sx = Math.floor((x + width * 0.17) / 11);
    const sy = Math.floor((y + 7) / 7);
    const noise = hash2(sx, sy);
    const keep = weakness > 0.54 ? 0.9 : weakness > 0.38 ? 0.78 : 0.66;
    return noise <= keep ? 1 : 0.82;
  }

  function graphSegmentMask(grid, id, weakness) {
    const x = grid.positionX?.[id] ?? 0;
    const y = grid.positionY?.[id] ?? 0;
    const z = grid.positionZ?.[id] ?? 1;
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    const lon = Math.atan2(z, x);
    const coarseLon = Math.floor((lon + Math.PI) * 4.75);
    const coarseLat = Math.floor((lat + Math.PI / 2) * 6.25);
    const fineLon = Math.floor((lon + Math.PI) * 13.5);
    const fineLat = Math.floor((lat + Math.PI / 2) * 17.5);
    const hemisphereBand = y >= 0 ? 19 : 41;
    const coarse = hash2(coarseLon + hemisphereBand, coarseLat + hemisphereBand * 3);
    const fine = hash2(fineLon + hemisphereBand * 5, fineLat + hemisphereBand * 7);
    const noise = coarse * 0.7 + fine * 0.3;
    const keep = weakness > 0.54 ? 0.9 : weakness > 0.38 ? 0.78 : 0.66;
    return noise <= keep ? 1 : 0.82;
  }

  function visitOrogenyNeighborhood(grid, topology, id, x, y, radius, bend, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      const bendDepth = Math.max(0, Math.min(radius, Math.abs(Math.round(bend))));
      topology.forEachNeighborRing(id, radius + bendDepth, (nid, depth) => {
        if (nid === id || depth <= bendDepth || depth > radius + bendDepth + 0.01) return;
        visit(nid, Math.max(0.01, depth - bendDepth));
      });
      return;
    }
    legacyVisitOrogenyNeighborhood(grid, x, y, radius, bend, visit);
  }

  function legacyVisitOrogenyNeighborhood(grid, x, y, radius, bend, visit) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01 || dist > radius + 0.01) continue;
        const nid = legacyOrogenyIndexOf(grid, x + dx + bend, y + dy);
        if (nid >= 0) visit(nid, dist);
      }
    }
  }

  function visitForelandNeighborhood(grid, topology, id, x, y, radius, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighborRing(id, radius, (nid, depth) => {
        if (nid === id || depth < 1 || depth > radius + 0.01) return;
        visit(nid, depth);
      });
      return;
    }
    legacyVisitForelandNeighborhood(grid, x, y, radius, visit);
  }

  function legacyVisitForelandNeighborhood(grid, x, y, radius, visit) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dist = Math.hypot(dx, dy);
        if (dist < 1 || dist > radius + 0.01) continue;
        const nid = legacyOrogenyIndexOf(grid, x + dx, y + dy);
        if (nid >= 0) visit(nid, dist);
      }
    }
  }

  function legacyOrogenyIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  function hash2(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function smoothAxisField(grid, source, target) {
    const { size, scratch2 } = grid;
    const topology = topologyForGrid(grid);
    scratch2.set(source);
    for (let id = 0; id < size; id += 1) {
      let total = scratch2[id] * 2.2;
      let weight = 2.2;
      visitMountainInterfaceNeighbors(grid, topology, id, (nid, dx, dy) => {
        const w = dx === 0 || dy === 0 ? 0.72 : 0.38;
        total += scratch2[nid] * w;
        weight += w;
      });
      target[id] = Math.min(1, total / weight);
    }
  }

  function smoothMountainHeightField(grid, source, target) {
    const { size, mountainAxis, scratch2 } = grid;
    const topology = topologyForGrid(grid);
    scratch2.set(source);
    for (let id = 0; id < size; id += 1) {
      if (scratch2[id] <= 0.0001 && mountainAxis[id] <= 0.025) {
        target[id] = 0;
        continue;
      }
      let total = scratch2[id] * 2.8;
      let weight = 2.8;
      visitMountainInterfaceNeighbors(grid, topology, id, (nid, dx, dy) => {
        const axisWeight = 0.3 + Math.min(1, Math.max(mountainAxis[id], mountainAxis[nid]) * 1.4);
        const w = (dx === 0 || dy === 0 ? 0.68 : 0.36) * axisWeight;
        total += scratch2[nid] * w;
        weight += w;
      });
      target[id] = total / weight;
    }
  }

  function smoothBarrierField(grid, source, target) {
    const { size, mountainAxis, scratch2 } = grid;
    const topology = topologyForGrid(grid);
    scratch2.set(source);
    for (let id = 0; id < size; id += 1) {
      if (source[id] <= 0.0001 && mountainAxis[id] <= 0.03) {
        target[id] = 0;
        continue;
      }
      let total = source[id] * 2.4;
      let weight = 2.4;
      visitMountainInterfaceNeighbors(grid, topology, id, (nid, dx, dy) => {
        const w = (dx === 0 || dy === 0 ? 0.8 : 0.45) * (0.35 + Math.min(1, mountainAxis[nid] * 1.2));
        total += scratch2[nid] * w;
        weight += w;
      });
      target[id] = total / weight;
    }
  }

  function visitMountainInterfaceNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid, 1, 0);
      });
      return;
    }
    forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
      visit(nid, dx, dy);
    });
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }


  // ---- src/sim/geology/rift.js ----

  const RiftStage = {
    NONE: 0,
    INCIPIENT_RIFT: 1,
    RIFT_BASIN: 2,
    TRANSITIONAL_RIFT: 3,
    PROTO_OCEAN_CANDIDATE: 4,
    CONNECTED_YOUNG_OCEAN: 5,
  };

  function updateRiftStages(world) {
    const connectivity = deriveOceanConnectivity(world);
    const { grid } = world;
    const {
      size,
      crustType,
      crustThickness,
      crustAge,
      weakness,
      boundaryKind,
      boundaryInfluence,
      stress,
      rift,
      basin,
      sediment,
      riftStage,
      riftAge,
      protoOceanCandidate,
    } = grid;
    const dt = world.timeScaleFactor;
    const rel = connectivity.relativeElevation;
    protoOceanCandidate.fill(0);

    for (let i = 0; i < size; i += 1) {
      const divergent = boundaryKind[i] === BoundaryType.DIVERGENT ? 1 : 0;
      const riftPower = Math.max(divergent * Math.min(1, boundaryInfluence[i]) * Math.min(2.5, stress[i]) * (0.45 + weakness[i]), rift[i] * (0.55 + weakness[i]));
      const activeRift = riftPower > 0.09;
      const belowSea = rel[i] < 0;
      const nearSea = rel[i] < 0.045;
      let stage = riftStage[i];

      if (activeRift) {
        riftAge[i] = Math.min(1, riftAge[i] + dt / 80);
      } else {
        riftAge[i] = Math.max(0, riftAge[i] - dt / 260);
      }

      if (stage === RiftStage.NONE) {
        if (crustType[i] === CrustType.CONTINENTAL && riftPower > 0.14 && weakness[i] > 0.48) stage = RiftStage.INCIPIENT_RIFT;
      } else if (stage === RiftStage.INCIPIENT_RIFT) {
        if (activeRift && (riftAge[i] > 0.05 || crustThickness[i] < 0.54)) stage = RiftStage.RIFT_BASIN;
        else if (!activeRift && riftAge[i] <= 0.01) stage = RiftStage.NONE;
      } else if (stage === RiftStage.RIFT_BASIN) {
        if (activeRift && crustThickness[i] < 0.49 && weakness[i] > 0.56 && riftAge[i] > 0.11) stage = RiftStage.TRANSITIONAL_RIFT;
        else if (!activeRift && riftAge[i] <= 0.02) stage = RiftStage.INCIPIENT_RIFT;
      } else if (stage === RiftStage.TRANSITIONAL_RIFT) {
        if (activeRift && crustThickness[i] < 0.36 && nearSea && riftAge[i] > 0.18) stage = RiftStage.PROTO_OCEAN_CANDIDATE;
        else if (!activeRift && riftAge[i] <= 0.03) stage = RiftStage.RIFT_BASIN;
      } else if (stage === RiftStage.PROTO_OCEAN_CANDIDATE) {
        if (activeRift && belowSea && connectivity.externalSeaMask[i]) stage = RiftStage.CONNECTED_YOUNG_OCEAN;
        else if (!activeRift && (!belowSea || riftAge[i] <= 0.06)) stage = RiftStage.TRANSITIONAL_RIFT;
      } else if (stage === RiftStage.CONNECTED_YOUNG_OCEAN) {
        if (!connectivity.externalSeaMask[i] && !activeRift) stage = RiftStage.PROTO_OCEAN_CANDIDATE;
      }

      if (stage >= RiftStage.RIFT_BASIN) {
        basin[i] = Math.min(1, basin[i] + (0.0012 + riftPower * 0.0018) * dt);
        sediment[i] = Math.min(1, sediment[i] + (0.00025 + basin[i] * 0.00045) * dt);
      }
      if (stage >= RiftStage.TRANSITIONAL_RIFT && crustType[i] === CrustType.CONTINENTAL) {
        crustType[i] = CrustType.TRANSITIONAL;
        crustAge[i] = Math.min(crustAge[i], 0.22);
      }
      if (stage === RiftStage.PROTO_OCEAN_CANDIDATE) {
        protoOceanCandidate[i] = 1;
        crustType[i] = CrustType.TRANSITIONAL;
        crustAge[i] = Math.min(crustAge[i], 0.16);
        crustThickness[i] = Math.max(0.29, Math.min(crustThickness[i], 0.38));
      }
      if (stage === RiftStage.CONNECTED_YOUNG_OCEAN) {
        crustType[i] = CrustType.OCEANIC;
        crustAge[i] = Math.min(crustAge[i], 0.025);
        crustThickness[i] = Math.max(0.18, Math.min(crustThickness[i], 0.28));
        protoOceanCandidate[i] = 0;
      }

      if (activeRift && crustType[i] !== CrustType.OCEANIC) {
        const thinning = (stage >= RiftStage.RIFT_BASIN ? 0.00018 : 0.00008) * Math.sqrt(dt) * (0.5 + riftPower);
        crustThickness[i] = Math.max(stage >= RiftStage.TRANSITIONAL_RIFT ? 0.29 : 0.36, crustThickness[i] - thinning);
      }

      riftStage[i] = stage;
    }
  }

  function deriveOceanConnectivity(world) {
    const { grid, seaLevel } = world;
    const { size, elev, externalSeaMask, inlandWaterCandidate, oceanConnectivity, closedBasinId } = grid;
    const relativeElevation = new Float32Array(size);
    const seaMask = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      const rel = elev[i] - seaLevel;
      relativeElevation[i] = rel;
      if (rel < 0) seaMask[i] = 1;
    }

    fillExternalSea(grid, seaMask, externalSeaMask);
    labelClosedBasins(grid, seaMask, externalSeaMask, closedBasinId);

    for (let i = 0; i < size; i += 1) {
      inlandWaterCandidate[i] = seaMask[i] && !externalSeaMask[i] ? 1 : 0;
      oceanConnectivity[i] = externalSeaMask[i] ? 2 : inlandWaterCandidate[i] ? 1 : 0;
      if (grid.riftStage[i] === RiftStage.PROTO_OCEAN_CANDIDATE && externalSeaMask[i]) {
        grid.riftStage[i] = RiftStage.CONNECTED_YOUNG_OCEAN;
        grid.protoOceanCandidate[i] = 0;
      }
    }

    return { relativeElevation, seaMask, externalSeaMask, inlandWaterCandidate, oceanConnectivity, closedBasinId };
  }

  function fillExternalSea(grid, seaMask, externalSeaMask) {
    const { size } = grid;
    const topology = topologyForGrid(grid);
    externalSeaMask.fill(0);
    const components = topology.connectedComponents(seaMask);
    let largestStart = -1;
    let largestArea = 0;

    for (let id = 1; id < components.componentSizes.length; id += 1) {
      const componentArea = components.componentAreas?.[id] ?? components.componentSizes[id] ?? 0;
      if (componentArea > largestArea) {
        largestArea = componentArea;
        largestStart = id;
      }
    }

    if (largestStart < 0) return;
    for (let i = 0; i < size; i += 1) {
      if (components.componentId[i] === largestStart) externalSeaMask[i] = 1;
    }
  }

  function labelClosedBasins(grid, seaMask, externalSeaMask, closedBasinId) {
    const { size } = grid;
    const topology = topologyForGrid(grid);
    closedBasinId.fill(0);
    const closedMask = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      if (seaMask[i] && !externalSeaMask[i]) closedMask[i] = 1;
    }
    const components = topology.connectedComponents(closedMask);
    let nextId = 1;

    for (let componentId = 1; componentId <= components.componentCount; componentId += 1) {
      for (let i = 0; i < size; i += 1) {
        if (components.componentId[i] === componentId) closedBasinId[i] = nextId;
      }
      nextId += 1;
    }
  }


  // ---- src/sim/geology/margins.js ----

  function updatePassiveMargins(world) {
    const { grid, seaLevel } = world;
    const {
      width,
      height,
      size,
      elev,
      crustType,
      crustThickness,
      crustAge,
      sediment,
      basin,
      boundaryInfluence,
      ridge,
      trench,
      externalSeaMask,
      inlandWaterCandidate,
      passiveMargin,
      continentalShelf,
      continentalSlope,
      continentalRise,
      abyssalPlain,
      sedimentWedge,
      marginCoastDistance,
      marginContinentalDistance,
      marginOceanDistance,
      marginExternalSeaDistance,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const topology = topologyForGrid(grid);

    const refreshDistance = !world.geologyV2MarginDistanceInitialized || world.step % 4 === 0;
    if (refreshDistance) {
      const landMask = new Uint8Array(size);
      const coastMask = new Uint8Array(size);
      for (let i = 0; i < size; i += 1) {
        if (elev[i] >= seaLevel) landMask[i] = 1;
      }

      forEachGridCell(grid, (id) => {
        let coast = false;
        visitMarginNeighbors(grid, topology, id, (nid) => {
          if (landMask[nid] !== landMask[id]) coast = true;
        });
        if (coast) coastMask[id] = 1;
      });

      marginCoastDistance.set(marginDistanceFromSources(grid, coastMask, scratch));
      marginContinentalDistance.set(marginDistanceFromCrust(grid, (type) => type === CrustType.CONTINENTAL, scratch2));
      marginOceanDistance.set(marginDistanceFromCrust(grid, (type) => type === CrustType.OCEANIC, scratch3));
      marginExternalSeaDistance.set(marginDistanceFromSources(grid, externalSeaMask, scratch));
      world.geologyV2MarginDistanceInitialized = true;
    }

    const coastDistance = marginCoastDistance;
    const continentalDistance = marginContinentalDistance;
    const oceanDistance = marginOceanDistance;
    const maxShelf = Math.max(3, physicalRadius(grid, 9));
    const maxRise = Math.max(6, physicalRadius(grid, 18));
    const externalSeaDistance = marginExternalSeaDistance;

    for (let i = 0; i < size; i += 1) {
      const externalSea = externalSeaMask[i] ? 1 : 0;
      const nearExternalSea = externalSeaDistance[i] <= maxRise * 1.15 ? 1 : 0;
      const land = elev[i] >= seaLevel ? 1 : 0;
      const externalOrCoastLand = externalSea || (land && nearExternalSea && coastDistance[i] <= maxShelf);
      const inactive = 1 - Math.min(1, boundaryInfluence[i]);
      const activeFeature = Math.max(ridge[i], trench[i], boundaryInfluence[i]);
      const passiveGate = Math.max(0, inactive) * Math.max(0, 1 - activeFeature * 1.6) * (inlandWaterCandidate[i] ? 0 : 1);
      const transition = crustType[i] === CrustType.TRANSITIONAL
        ? 1
        : crustType[i] === CrustType.OCEANIC && continentalDistance[i] <= maxRise
          ? Math.max(0, 1 - continentalDistance[i] / maxRise)
          : crustType[i] === CrustType.CONTINENTAL && oceanDistance[i] <= maxShelf
            ? Math.max(0, 1 - oceanDistance[i] / maxShelf) * 0.65
            : 0;
      const sedimentSupport = Math.min(1, sediment[i] * 2.6 + basin[i] * 0.55);
      const coastSupport = Math.max(0, 1 - Math.min(coastDistance[i], externalSeaDistance[i]) / Math.max(1, maxRise));
      const marginCore = Math.max(0, transition * 0.82 + sedimentSupport * 0.18 + coastSupport * 0.08 - 0.12);
      const rawPassiveMargin = passiveGate * externalOrCoastLand * marginCore * (0.78 + coastSupport * 0.22);
      passiveMargin[i] = Math.max(0, Math.min(1, Math.pow(rawPassiveMargin, 1.18)));

      const rel = elev[i] - seaLevel;
      const depth = Math.max(0, -rel);
      const shallow = externalSea && depth < 0.09 ? 1 - depth / 0.09 : 0;
      const nearCoast = Math.max(0, 1 - coastDistance[i] / Math.max(1, maxShelf));
      continentalShelf[i] = Math.max(0, Math.min(1, passiveMargin[i] * shallow * nearCoast * (0.55 + sedimentSupport * 0.45)));

      const slopeBand = externalSea && coastDistance[i] > maxShelf * 0.45 && coastDistance[i] <= maxRise * 0.85
        ? 1 - Math.abs(coastDistance[i] - maxShelf) / Math.max(1, maxRise * 0.55)
        : 0;
      const thicknessGradient = crustType[i] === CrustType.TRANSITIONAL ? 0.8 : Math.max(0, 1 - Math.abs(crustThickness[i] - 0.32) / 0.22);
      continentalSlope[i] = Math.max(0, Math.min(1, passiveMargin[i] * slopeBand * thicknessGradient));

      const riseBand = externalSea && coastDistance[i] > maxShelf && coastDistance[i] <= maxRise
        ? Math.max(0, 1 - Math.abs(coastDistance[i] - maxRise * 0.72) / Math.max(1, maxRise * 0.45))
        : 0;
      sedimentWedge[i] = Math.max(0, Math.min(1, passiveMargin[i] * (sedimentSupport * 0.72 + basin[i] * 0.22 + riseBand * 0.18)));
      continentalRise[i] = Math.max(0, Math.min(1, riseBand * sedimentWedge[i] * passiveGate));

      const oldOcean = crustType[i] === CrustType.OCEANIC && crustAge[i] > 0.35;
      const farFromActive = Math.max(ridge[i], trench[i], boundaryInfluence[i]) < 0.12;
      abyssalPlain[i] = oldOcean && externalSea && farFromActive
        ? Math.max(0, Math.min(1, (crustAge[i] - 0.25) * 1.1 + sediment[i] * 1.25 + basin[i] * 0.25))
        : 0;
    }

    smoothMarginFields(grid);
    clampMarginFields(grid);
  }

  function marginDistanceFromSources(grid, sourceMask, scratch) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology) && typeof topology.shortestDistanceSeeds === "function") {
      return topology.shortestDistanceSeeds(sourceMask);
    }

    const { size } = grid;
    scratch.fill(Number.POSITIVE_INFINITY);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < size; i += 1) {
      if (!sourceMask[i]) continue;
      scratch[i] = 0;
      queue[tail++] = i;
    }
    while (head < tail) {
      const id = queue[head++];
      const next = scratch[id] + 1;
      forEachNeighbor4ById(grid, id, (nid) => {
        if (next >= scratch[nid]) return;
        scratch[nid] = next;
        queue[tail++] = nid;
      });
    }
    return new Float32Array(scratch);
  }

  function marginDistanceFromCrust(grid, predicate, scratch) {
    const source = new Uint8Array(grid.size);
    for (let i = 0; i < grid.size; i += 1) {
      if (predicate(grid.crustType[i])) source[i] = 1;
    }
    return marginDistanceFromSources(grid, source, scratch);
  }

  function smoothMarginFields(grid) {
    const fields = [
      grid.passiveMargin,
      grid.continentalShelf,
      grid.continentalSlope,
      grid.continentalRise,
      grid.sedimentWedge,
      grid.abyssalPlain,
    ];
    const { scratch } = grid;
    const topology = topologyForGrid(grid);
    for (const field of fields) {
      scratch.set(field);
      forEachGridCell(grid, (id) => {
        let total = scratch[id] * 2.5;
        let weight = 2.5;
        visitMarginNeighbors(grid, topology, id, (nid) => {
          total += scratch[nid];
          weight += 1;
        });
        field[id] = Math.max(0, Math.min(1, total / weight));
      });
    }
  }

  function visitMarginNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function clampMarginFields(grid) {
    const {
      size,
      boundaryInfluence,
      ridge,
      trench,
      inlandWaterCandidate,
      externalSeaMask,
      passiveMargin,
      continentalShelf,
      continentalSlope,
      continentalRise,
      sedimentWedge,
      abyssalPlain,
    } = grid;
    for (let i = 0; i < size; i += 1) {
      const activeFeature = Math.max(boundaryInfluence[i], ridge[i], trench[i]);
      if (inlandWaterCandidate[i] || activeFeature > 0.46) {
        passiveMargin[i] = 0;
        continentalShelf[i] = 0;
        continentalSlope[i] = 0;
        continentalRise[i] = 0;
        sedimentWedge[i] = 0;
      }
      if (!externalSeaMask[i]) {
        continentalShelf[i] = 0;
        continentalSlope[i] = 0;
        continentalRise[i] = 0;
        abyssalPlain[i] = 0;
      }
    }
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }


  // ---- src/sim/geology/transforms.js ----

  function updateTransformMemory(world) {
    const { grid } = world;
    const {
      size,
      crustType,
      crustAge,
      weakness,
      boundaryKind,
      boundaryInfluence,
      stress,
      activeTransform,
      transformMemory,
      fractureZoneMemory,
      inactiveBoundaryRelief,
      oldBoundaryCorrelation,
      ageBandStraightnessRisk,
    } = grid;
    const dt = world.timeScaleFactor;
    const activeThreshold = 0.08;
    const graphBacked = isGraphBackedGrid(grid);
    const stressModel = graphBacked ? measureGraphTransformStressModel(grid) : null;
    for (let i = 0; i < size; i += 1) {
      const activeInfluence = graphBacked ? graphActiveBoundaryInfluence(grid, i) : boundaryInfluence[i];
      const transformStress = graphBacked
        ? normalizedGraphTransformStress(stress[i], stressModel)
        : Math.min(2.5, stress[i]);
      const active = boundaryKind[i] === BoundaryType.TRANSFORM && boundaryInfluence[i] > activeThreshold
        ? Math.min(1, activeInfluence * transformStress * (graphBacked ? 0.18 : 0.9))
        : 0;
      activeTransform[i] = active;

      const oceanic = crustType[i] === CrustType.OCEANIC;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      const transformHalfLife = oceanic ? 28 : transitional ? 70 : 150;
      const fractureHalfLife = oceanic ? 65 : transitional ? 120 : 180;
      const reliefHalfLife = oceanic ? 12 : transitional ? 32 : 90;
      const transformDecay = halfLifeDecay(dt, transformHalfLife);
      const fractureDecay = halfLifeDecay(dt, fractureHalfLife);
      const reliefDecay = halfLifeDecay(dt, reliefHalfLife);

      transformMemory[i] *= transformDecay;
      fractureZoneMemory[i] *= fractureDecay;
      inactiveBoundaryRelief[i] *= reliefDecay;

      if (active > 0) {
        transformMemory[i] = Math.max(transformMemory[i], active);
        weakness[i] = Math.min(1, weakness[i] + active * (oceanic ? 0.0012 : 0.0024) * dt);
        if (oceanic || transitional) {
          fractureZoneMemory[i] = Math.max(fractureZoneMemory[i], active * (0.55 + Math.min(1, crustAge[i]) * 0.35));
        }
      }

      const inactive = 1 - Math.min(1, boundaryInfluence[i]);
      inactiveBoundaryRelief[i] = Math.max(0, Math.min(1, inactiveBoundaryRelief[i] + transformMemory[i] * inactive * (oceanic ? 0.0024 : 0.001) * dt));
      oldBoundaryCorrelation[i] = Math.max(0, Math.min(1, inactiveBoundaryRelief[i] * 0.55 + fractureZoneMemory[i] * 0.35 + transformMemory[i] * inactive * 0.2));
      ageBandStraightnessRisk[i] = 0;
    }
    diffuseFractureMemory(grid);
    updateAgeBandRisk(grid);
    if (world.step % 4 === 0) {
      softenInactiveFractureSourceFields(grid, dt * 4);
    }
  }

  function graphActiveBoundaryInfluence(grid, id) {
    if (!grid.activeBoundary?.[id]) return 0;
    return Math.min(1, grid.boundaryInfluence[id] * 0.72 + 0.28);
  }

  function measureGraphTransformStressModel(grid) {
    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < grid.size; i += 1) {
      if (!grid.activeBoundary?.[i] || grid.boundaryKind[i] !== BoundaryType.TRANSFORM) continue;
      const value = grid.stress[i];
      if (!Number.isFinite(value) || value <= 0) continue;
      sum += value;
      count += 1;
      if (value > max) max = value;
    }
    return {
      max,
      scale: Math.max(0.00035, Math.min(0.004, max * 0.55, count ? (sum / count) * 2.6 : 0.00035)),
    };
  }

  function normalizedGraphTransformStress(value, model) {
    if (!model || value <= 0 || model.max <= 0) return 0;
    const scaled = value / Math.max(1e-7, model.scale);
    return Math.min(1, scaled / (1 + scaled));
  }

  function suppressInactiveFractureRelief(world) {
    const { grid, seaLevel } = world;
    const {
      elev,
      crustType,
      boundaryInfluence,
      ridge,
      trench,
      sediment,
      abyssalPlain,
      sedimentWedge,
      transformMemory,
      fractureZoneMemory,
      inactiveBoundaryRelief,
      oldBoundaryCorrelation,
      scratch,
    } = grid;
    const topology = topologyForGrid(grid);

    scratch.set(elev);
    forEachGridCell(grid, (id) => {
      if (crustType[id] !== CrustType.OCEANIC) return;
      if (boundaryInfluence[id] > 0.18 || ridge[id] > 0.08 || trench[id] > 0.08) return;
      const memory = Math.max(transformMemory[id] * 0.55, fractureZoneMemory[id], inactiveBoundaryRelief[id]);
      if (memory <= 0.025) return;

      let total = scratch[id] * 2;
      let weight = 2;
      visitFractureSmoothingNeighbors(grid, topology, id, (nid, neighborWeight = 1) => {
        if (crustType[nid] !== CrustType.OCEANIC || ridge[nid] > 0.08 || trench[nid] > 0.08) return;
        total += scratch[nid] * neighborWeight;
        weight += neighborWeight;
      });
      const smooth = total / weight;
      const oldPositiveRelief = Math.max(0, scratch[id] - smooth);
      const flatness = 0.35 + Math.min(1, abyssalPlain[id] + sediment[id] * 1.4 + sedimentWedge[id] * 0.8) * 0.65;
      const mix = Math.min(0.42, memory * flatness * 0.24);
      const depressed = scratch[id] - oldPositiveRelief * Math.min(0.65, memory * 0.5);
      elev[id] = depressed * (1 - mix) + smooth * mix;
      inactiveBoundaryRelief[id] = Math.max(0, inactiveBoundaryRelief[id] * (1 - mix * 0.45));
    });

    for (let i = 0; i < grid.size; i += 1) {
      if (crustType[i] !== CrustType.OCEANIC) continue;
      oldBoundaryCorrelation[i] = Math.max(0, Math.min(1, oldBoundaryCorrelation[i] * 0.88 + Math.abs(elev[i] - scratch[i]) * 8));
    }
  }

  function diffuseFractureMemory(grid) {
    const { crustType, fractureZoneMemory, boundaryInfluence, ridge, trench, scratch } = grid;
    const topology = topologyForGrid(grid);
    scratch.set(fractureZoneMemory);
    forEachGridCell(grid, (id) => {
      if (crustType[id] !== CrustType.OCEANIC || scratch[id] < 0.02) return;
      if (boundaryInfluence[id] > 0.35 || ridge[id] > 0.2 || trench[id] > 0.2) return;
      let total = scratch[id] * 3;
      let weight = 3;
      visitFractureSmoothingNeighbors(grid, topology, id, (nid, neighborWeight = 1) => {
        if (crustType[nid] !== CrustType.OCEANIC) return;
        const memoryWeight = 0.55 * neighborWeight;
        total += scratch[nid] * memoryWeight;
        weight += memoryWeight;
      });
      fractureZoneMemory[id] = Math.min(1, total / weight);
    });
  }

  function updateAgeBandRisk(grid) {
    const { crustType, crustAge, ridge, boundaryInfluence, fractureZoneMemory, ageBandStraightnessRisk } = grid;
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      updateGraphAgeBandRisk(grid, topology);
      return;
    }

    forEachGridCell(grid, (id, x, y) => {
      if (crustType[id] !== CrustType.OCEANIC) return;
      const band = Math.floor(crustAge[id] * 10);
      const horizontal = legacySameAgeBandAt(grid, x - 1, y, band) + legacySameAgeBandAt(grid, x + 1, y, band);
      const vertical = legacySameAgeBandAt(grid, x, y - 1, band) + legacySameAgeBandAt(grid, x, y + 1, band);
      const diagA = legacySameAgeBandAt(grid, x - 1, y - 1, band) + legacySameAgeBandAt(grid, x + 1, y + 1, band);
      const diagB = legacySameAgeBandAt(grid, x + 1, y - 1, band) + legacySameAgeBandAt(grid, x - 1, y + 1, band);
      const aligned = Math.max(horizontal, vertical, diagA, diagB);
      if (aligned < 2) return;
      const nearRidge = ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3;
      if (nearRidge) return;
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      ageBandStraightnessRisk[id] = Math.max(0, Math.min(1, inactive * (0.4 + fractureZoneMemory[id] * 0.8)));
    });
  }

  function updateGraphAgeBandRisk(grid, topology) {
    const { size, crustType, crustAge, ridge, boundaryInfluence, fractureZoneMemory, ageBandStraightnessRisk } = grid;
    for (let id = 0; id < size; id += 1) {
      if (crustType[id] !== CrustType.OCEANIC) continue;
      const band = Math.floor(crustAge[id] * 10);
      let sameAdjacent = 0;
      let oceanicAdjacent = 0;
      let sameSecondRing = 0;

      topology.forEachNeighbor(id, (nid) => {
        if (crustType[nid] !== CrustType.OCEANIC) return;
        oceanicAdjacent += 1;
        if (Math.floor(crustAge[nid] * 10) === band) sameAdjacent += 1;
      });

      if (sameAdjacent < 2) continue;
      if (typeof topology.forEachNeighborRing === "function") {
        topology.forEachNeighborRing(id, 2, (nid, depth) => {
          if (depth !== 2 || crustType[nid] !== CrustType.OCEANIC) return;
          if (Math.floor(crustAge[nid] * 10) === band) sameSecondRing += 1;
        });
      }

      const continuity = Math.min(1, (sameAdjacent + sameSecondRing * 0.35) / Math.max(2, oceanicAdjacent * 0.6));
      if (continuity < 0.72) continue;
      const nearRidge = ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3;
      if (nearRidge) continue;
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      ageBandStraightnessRisk[id] = Math.max(0, Math.min(1, inactive * continuity * (0.28 + fractureZoneMemory[id] * 0.72)));
    }
  }

  function softenInactiveFractureSourceFields(grid, dt) {
    const {
      crustType,
      crustAge,
      crustThickness,
      sediment,
      boundaryInfluence,
      ridge,
      trench,
      ridgeDistance,
      transformMemory,
      fractureZoneMemory,
      ageBandStraightnessRisk,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const topology = topologyForGrid(grid);
    scratch.set(crustAge);
    scratch2.set(crustThickness);
    scratch3.set(sediment);

    forEachGridCell(grid, (id) => {
      if (crustType[id] !== CrustType.OCEANIC) return;
      if (boundaryInfluence[id] > 0.16 || ridge[id] > 0.05 || trench[id] > 0.08) return;
      if (ridgeDistance[id] >= 0 && ridgeDistance[id] <= 4) return;

      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      const memory = Math.max(fractureZoneMemory[id], transformMemory[id] * 0.45);
      const risk = Math.max(ageBandStraightnessRisk[id], Math.max(0, memory - 0.04) * 0.75);
      if (risk <= 0.035) return;

      let ageTotal = scratch[id] * 3.5;
      let thickTotal = scratch2[id] * 3.5;
      let sedTotal = scratch3[id] * 2.5;
      let ageWeight = 3.5;
      let sedWeight = 2.5;
      visitFractureSmoothingNeighbors(grid, topology, id, (nid, neighborWeight = 1) => {
        if (crustType[nid] !== CrustType.OCEANIC) return;
        if (ridge[nid] > 0.06 || trench[nid] > 0.09 || boundaryInfluence[nid] > 0.22) return;
        ageTotal += scratch[nid] * neighborWeight;
        thickTotal += scratch2[nid] * neighborWeight;
        sedTotal += scratch3[nid] * neighborWeight;
        ageWeight += neighborWeight;
        sedWeight += neighborWeight;
      });

      const ageSmooth = ageTotal / ageWeight;
      const thickSmooth = thickTotal / ageWeight;
      const sedSmooth = sedTotal / sedWeight;
      const mix = Math.min(0.18, risk * inactive * Math.min(1, dt / 2) * 0.13);
      crustAge[id] = Math.max(0, Math.min(1, scratch[id] * (1 - mix) + ageSmooth * mix));
      crustThickness[id] = Math.max(0.12, Math.min(0.42, scratch2[id] * (1 - mix * 0.6) + thickSmooth * mix * 0.6));
      sediment[id] = Math.max(0, Math.min(1, scratch3[id] * (1 - mix * 0.35) + sedSmooth * mix * 0.35));
    });
  }

  function visitFractureSmoothingNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      if (typeof topology.forEachNeighborRing === "function") {
        topology.forEachNeighborRing(id, 2, (nid, depth) => {
          visit(nid, depth <= 1 ? 1 : 0.38);
        });
        return;
      }
      topology.forEachNeighbor(id, (nid) => {
        visit(nid, 1);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid, 1);
    });
  }

  function legacySameAgeBandAt(grid, x, y, band) {
    const id = legacyTransformIndexOf(grid, x, y);
    if (id < 0) return 0;
    return grid.crustType[id] === CrustType.OCEANIC && Math.floor(grid.crustAge[id] * 10) === band ? 1 : 0;
  }

  function legacyTransformIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  function halfLifeDecay(dt, halfLifeMyr) {
    return Math.pow(0.5, dt / Math.max(1, halfLifeMyr));
  }


  // ---- src/sim/geology/isostasy.js ----

  function updateIsostasy(world) {
    const { grid } = world;
    const {
      size,
      crustType,
      crustThickness,
      crustAge,
      crustDensity,
      sediment,
      sedimentFill,
      sedimentLoadSubsidence,
      ageSubsidence,
      thicknessBuoyancy,
      oceanDepthTerms,
      ridgeUplift,
      trenchDepression,
      isostaticBase,
      crustBuoyancy,
      densitySubsidence,
      lithosphereCooling,
      isostaticResidual,
      isostaticReliefSupply,
      elev,
    } = grid;

    for (let i = 0; i < size; i += 1) {
      const type = crustType[i];
      const continental = type === CrustType.CONTINENTAL;
      const transitional = type === CrustType.TRANSITIONAL;
      const oceanic = type === CrustType.OCEANIC;
      const ageNorm = clamp01(crustAge[i]);
      const sedimentSurfaceFill = saturatingFill(sediment[i], oceanic ? 0.062 : transitional ? 0.08 : 0.03, oceanic ? 1.7 : transitional ? 1.9 : 1.45);
      sedimentFill[i] = sedimentSurfaceFill;
      ridgeUplift[i] = oceanic ? grid.ridge[i] * 0.06 : transitional ? grid.ridge[i] * 0.018 : 0;
      trenchDepression[i] = oceanic
        ? -grid.trench[i] * (0.075 + ageNorm * 0.035)
        : transitional
          ? -grid.trench[i] * 0.026
          : 0;

      let baseElevation;
      let thicknessNorm;
      let densityNorm;
      let buoyancyScale;
      let densityScale;
      let coolingScale;
      if (continental) {
        baseElevation = 0.072;
        thicknessNorm = smoothstep(0, 1, (crustThickness[i] - 0.42) / 0.58);
        densityNorm = clamp01((crustDensity[i] - 0.38) / 0.22);
        buoyancyScale = 0.105;
        densityScale = 0.018;
        coolingScale = 0.002;
      } else if (transitional) {
        baseElevation = 0.018;
        thicknessNorm = smoothstep(0, 1, (crustThickness[i] - 0.28) / 0.46);
        densityNorm = clamp01((crustDensity[i] - 0.5) / 0.32);
        buoyancyScale = 0.062;
        densityScale = 0.038;
        coolingScale = 0.028;
      } else {
        baseElevation = -0.032;
        thicknessNorm = smoothstep(0, 1, (crustThickness[i] - 0.12) / 0.3);
        densityNorm = clamp01((crustDensity[i] - 0.62) / 0.24);
        buoyancyScale = 0.034;
        densityScale = 0.05;
        coolingScale = 0.106;
      }

      crustBuoyancy[i] = thicknessNorm * buoyancyScale;
      densitySubsidence[i] = densityNorm * densityScale;
      lithosphereCooling[i] = (oceanic ? 1 : transitional ? 0.42 : 0.03) * Math.sqrt(ageNorm) * coolingScale;

      const load = sedimentLoadSubsidence[i] * (continental ? 0.18 : transitional ? 0.34 : 0.3);
      const sedimentLoad = load * (1 - clamp01(sediment[i]) * 0.28);
      isostaticBase[i] =
        baseElevation +
        crustBuoyancy[i] -
        densitySubsidence[i] -
        lithosphereCooling[i] -
        sedimentLoad +
        sedimentSurfaceFill;

      ageSubsidence[i] = -lithosphereCooling[i];
      thicknessBuoyancy[i] = crustBuoyancy[i];
      oceanDepthTerms[i] = ageSubsidence[i] + thicknessBuoyancy[i] + sedimentSurfaceFill + ridgeUplift[i] + trenchDepression[i] - densitySubsidence[i] - sedimentLoad;
      isostaticResidual[i] = elev[i] - isostaticBase[i];
      isostaticReliefSupply[i] = Math.abs(crustBuoyancy[i]) + Math.abs(densitySubsidence[i]) + Math.abs(lithosphereCooling[i]) + Math.abs(sedimentLoad);
    }

    world.isostasyDiagnostics = measureIsostasyDiagnostics(world);
    return world.isostasyDiagnostics;
  }

  function measureIsostasyDiagnostics(world) {
    const { grid, seaLevel } = world;
    const {
      size,
      crustType,
      crustAge,
      crustThickness,
      isostaticBase,
      isostaticResidual,
      sedimentLoadSubsidence,
      elev,
    } = grid;

    const sums = {
      continental: 0,
      oceanic: 0,
      transitional: 0,
      continentalCount: 0,
      oceanicCount: 0,
      transitionalCount: 0,
      youngDepth: 0,
      youngCount: 0,
      oldDepth: 0,
      oldCount: 0,
      residualAbs: 0,
      sedimentLoad: 0,
    };
    const residuals = [];
    const isoVals = [];
    const elevVals = [];
    const thickVals = [];
    const relVals = [];
    const ageVals = [];
    const depthVals = [];

    for (let i = 0; i < size; i += 1) {
      const rel = elev[i] - seaLevel;
      const baseRel = isostaticBase[i] - seaLevel;
      const residual = Math.abs(isostaticResidual[i]);
      residuals.push(residual);
      isoVals.push(isostaticBase[i]);
      elevVals.push(elev[i]);
      thickVals.push(crustThickness[i]);
      relVals.push(rel);
      sums.residualAbs += residual;
      sums.sedimentLoad += sedimentLoadSubsidence[i];

      if (crustType[i] === CrustType.CONTINENTAL) {
        sums.continental += baseRel;
        sums.continentalCount += 1;
      } else if (crustType[i] === CrustType.TRANSITIONAL) {
        sums.transitional += baseRel;
        sums.transitionalCount += 1;
      } else {
        const depth = Math.max(0, seaLevel - elev[i]);
        sums.oceanic += baseRel;
        sums.oceanicCount += 1;
        ageVals.push(crustAge[i]);
        depthVals.push(depth);
        if (crustAge[i] < 0.18) {
          sums.youngDepth += depth;
          sums.youngCount += 1;
        }
        if (crustAge[i] > 0.72) {
          sums.oldDepth += depth;
          sums.oldCount += 1;
        }
      }
    }

    residuals.sort((a, b) => a - b);
    const continentalMean = mean(sums.continental, sums.continentalCount);
    const oceanicMean = mean(sums.oceanic, sums.oceanicCount);
    const transitionalMean = mean(sums.transitional, sums.transitionalCount);
    return {
      isostaticContinentalMean: continentalMean,
      isostaticOceanicMean: oceanicMean,
      isostaticTransitionalMean: transitionalMean,
      continentalOceanReliefGap: continentalMean - oceanicMean,
      youngOldOceanDepthGap: mean(sums.oldDepth, sums.oldCount) - mean(sums.youngDepth, sums.youngCount),
      sedimentLoadSubsidenceMean: sums.sedimentLoad / Math.max(1, size),
      isostaticResidualMean: sums.residualAbs / Math.max(1, size),
      isostaticResidualP95: residuals.length ? residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * 0.95))] : 0,
      isostasyElevationCorrelation: correlation(isoVals, elevVals),
      crustThicknessElevationCorrelation: correlation(thickVals, relVals),
      crustAgeOceanDepthCorrelation: correlation(ageVals, depthVals),
      transitionalElevationBand: transitionalMean,
      seaLevelDriftAfterIsostasy: Math.abs((world.geologicSeaLevelOffset ?? 0) - (world.geologicSeaLevelPreviousOffset ?? world.geologicSeaLevelOffset ?? 0)),
      landRatioDriftAfterIsostasy: Math.abs((world.stats?.landRatio ?? 0) - (world.isostasyPreviousLandRatio ?? world.stats?.landRatio ?? 0)),
    };
  }

  function getIsostasyDiagnostics(world) {
    return world.isostasyDiagnostics ?? measureIsostasyDiagnostics(world);
  }

  function refreshIsostaticResidual(world) {
    const { grid } = world;
    for (let i = 0; i < grid.size; i += 1) {
      grid.isostaticResidual[i] = grid.elev[i] - grid.isostaticBase[i];
    }
    world.isostasyDiagnostics = measureIsostasyDiagnostics(world);
    return world.isostasyDiagnostics;
  }

  function saturatingFill(sediment, fillMax, fillScale) {
    return fillMax * (1 - Math.exp(-Math.max(0, sediment) * fillScale));
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / Math.max(0.000001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function mean(sum, count) {
    return count ? sum / count : 0;
  }

  function correlation(a, b) {
    const count = Math.min(a.length, b.length);
    if (count < 3) return 0;
    let aSum = 0;
    let bSum = 0;
    for (let i = 0; i < count; i += 1) {
      aSum += a[i];
      bSum += b[i];
    }
    const aMean = aSum / count;
    const bMean = bSum / count;
    let cov = 0;
    let aVar = 0;
    let bVar = 0;
    for (let i = 0; i < count; i += 1) {
      const da = a[i] - aMean;
      const db = b[i] - bMean;
      cov += da * db;
      aVar += da * da;
      bVar += db * db;
    }
    return aVar > 0 && bVar > 0 ? cov / Math.sqrt(aVar * bVar) : 0;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }


  // ---- src/sim/geology/elevation.js ----

  function rebuildGeologyElevation(world) {
    rebuildGeologyElevationV2(world);
  }

  function rebuildGeologyElevationV2(world) {
    const { grid, textureNoise } = world;
    updateIsostasy(world);
    ensureGeologyElevationNoise(world);
    const {
      width,
      height,
      size,
      crustType,
      orogeny,
      activeOrogeny,
      oldOrogeny,
      orogenyAge,
      sediment,
      sedimentLoadSubsidence,
      sedimentFill,
      ridgeUplift,
      trenchDepression,
      isostaticBase,
      passiveMargin,
      continentalShelf,
      continentalSlope,
      continentalRise,
      abyssalPlain,
      sedimentWedge,
      forelandBasin,
      activeTransform,
      transformMemory,
      fractureZoneMemory,
      inactiveBoundaryRelief,
      baseElev,
      relief,
      boundaryRelief,
      geologyBroadNoise,
      geologyMicroNoise,
      elev,
      isContinental,
      mountainBelt,
      trench,
      ridge,
      rift,
      islandArc,
      basin,
    } = grid;

    for (let i = 0; i < size; i += 1) {
      const micro = geologyMicroNoise[i];
      const broad = geologyBroadNoise[i];
      const continental = crustType[i] === CrustType.CONTINENTAL;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      isContinental[i] = continental ? 1 : 0;

      const crustBase = isostaticBase[i];
      const ageReduction = 0.35 + Math.max(0, Math.min(1, orogenyAge?.[i] ?? 0)) * 0.55;
      const oldOrogenRelief = (oldOrogeny?.[i] ?? 0) * (continental ? 0.075 : transitional ? 0.035 : 0.004) * (1 - ageReduction * 0.62);
      const rootRelief = orogeny[i] * (continental ? 0.105 : transitional ? 0.032 : 0.004);
      const forelandSubsidence = (forelandBasin?.[i] ?? 0) * (continental ? 0.026 : transitional ? 0.018 : 0.002);
      const loadSubsidence = (sedimentLoadSubsidence?.[i] ?? 0) * (continental ? 0.06 : transitional ? 0.08 : 0.07);
      const longTerm = rootRelief + oldOrogenRelief + sedimentFill[i] * 0.36 - basin[i] * (transitional ? 0.002 : 0.018) - forelandSubsidence - loadSubsidence;
      const activeFeature =
        mountainBelt[i] * 0.15 +
        (activeOrogeny?.[i] ?? 0) * (continental ? 0.055 : transitional ? 0.024 : 0.006) -
        (continental ? trench[i] * 0.105 : -trenchDepression[i]) +
        (continental ? ridge[i] * 0.048 : ridgeUplift[i]) -
        rift[i] * 0.055 +
        islandArc[i] * 0.06 -
        basin[i] * 0.025;

      const abyssal = abyssalPlain?.[i] ?? 0;
      const margin = passiveMargin?.[i] ?? 0;
      const shelf = continentalShelf?.[i] ?? 0;
      const slope = continentalSlope?.[i] ?? 0;
      const rise = continentalRise?.[i] ?? 0;
      const wedge = sedimentWedge?.[i] ?? 0;
      const roughnessDamp = Math.max(0, 1 - abyssal * 0.58 - margin * 0.12);
      const marginElevation =
        shelf * 0.018 +
        rise * 0.015 +
        wedge * 0.012 -
        slope * 0.012 -
        abyssal * 0.006;
      const transformActiveRelief = (activeTransform?.[i] ?? 0) * (continental ? 0.012 : transitional ? 0.008 : 0.006) * (0.45 + Math.abs(micro));
      const inactiveTransformPenalty = !continental
        ? Math.max(0, (transformMemory?.[i] ?? 0) * 0.003 + (fractureZoneMemory?.[i] ?? 0) * 0.005 + (inactiveBoundaryRelief?.[i] ?? 0) * 0.006) * (0.4 + abyssal + sediment[i])
        : 0;

      baseElev[i] = crustBase + broad * (continental ? 0.018 : transitional ? 0.014 : 0.009) * roughnessDamp + micro * (continental ? 0.011 : transitional ? 0.008 : 0.006) * roughnessDamp;
      relief[i] = longTerm;
      boundaryRelief[i] = activeFeature + marginElevation + transformActiveRelief - inactiveTransformPenalty;
      elev[i] = baseElev[i] + relief[i] + boundaryRelief[i];
    }
    refreshIsostaticResidual(world);
  }

  function ensureGeologyElevationNoise(world) {
    if (world.geologyElevationNoiseInitialized) return;
    const { grid, textureNoise } = world;
    const { geologyBroadNoise, geologyMicroNoise } = grid;
    forEachGridCell(grid, (id, x, y) => {
      const sphere = spherePointForGridCell(grid, id, x, y);
      geologyMicroNoise[id] = textureNoise(sphere.x * 7.5 - 11, sphere.y * 7.5 + 19, sphere.z * 7.5 - 7, 3, 2.15, 0.42);
      geologyBroadNoise[id] = textureNoise(sphere.x * 2.2 + 7, sphere.y * 2.2 - 5, sphere.z * 2.2 + 17, 3, 2, 0.48);
    });
    world.geologyElevationNoiseInitialized = true;
  }

  function spherePointForGridCell(grid, id, x, y) {
    const px = grid.positionX?.[id];
    const py = grid.positionY?.[id];
    const pz = grid.positionZ?.[id];
    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
      return { x: px, y: py, z: pz };
    }
    return spherePointForCell(grid, x, y);
  }


  // ---- src/sim/geology/reliefBudget.js ----

  function updateReliefBudgetDiagnostics(world) {
    const { grid, seaLevel, params } = world;
    const stats = measureElevationDistribution(grid, seaLevel);
    const radius = Math.max(1, physicalRadius(grid, 4));
    const lowSlope = 0.0048;
    const lowRelief = 0.038;
    const seaLevelBand = 0.018;

    let flatLand = 0;
    let largePlain = 0;
    let sensitive = 0;
    let tectonicSum = 0;
    let isostaticSum = 0;
    let erosionSum = 0;
    let smoothingSum = 0;
    let slopeLandSum = 0;
    let landArea = 0;
    let orographicPotential = 0;
    let seaSensitivityWeightSum = 0;
    let totalAreaValue = 0;

    const target = targetReliefForWorld(params, stats);
    const deficit =
      Math.max(0, target.hypsometricSpread - stats.hypsometricSpread) +
      Math.max(0, target.landReliefSpread - stats.landReliefSpread) +
      Math.max(0, target.globalElevationStd - stats.globalElevationStd);
    const normalizedDeficit = Math.min(1, deficit / 0.18);

    forEachGridCell(grid, (i) => {
        const area = metricArea(grid, i);
        totalAreaValue += area;
        const relative = grid.elev[i] - seaLevel;
        const land = relative >= 0;
        const local = localRelief(grid, i, radius);
        const slope = localSlope(grid, i, seaLevel);
        const seaSensitive = Math.abs(relative) < seaLevelBand ? 1 : 0;
        const plain = land && slope < lowSlope && local < lowRelief ? 1 : 0;
        const broadPlain = plain && local < lowRelief * 0.72 && grid.sediment[i] + grid.basin[i] > 0.05 ? 1 : 0;

        const tectonic =
          grid.activeOrogeny[i] * 1 +
          grid.oldOrogeny[i] * 0.35 +
          grid.ridge[i] * 0.45 +
          grid.rift[i] * 0.25 +
          grid.trench[i] * 0.25 +
          grid.islandArc[i] * 0.35;
        const currentIsostatic = grid.isostaticReliefSupply?.[i] ?? 0;
        const isostatic = currentIsostatic > 0
          ? currentIsostatic
          : Math.abs(grid.crustBuoyancy?.[i] ?? grid.thicknessBuoyancy[i]) +
            Math.abs(grid.densitySubsidence?.[i] ?? 0) +
            Math.abs(grid.lithosphereCooling?.[i] ?? -grid.ageSubsidence[i]) +
            Math.abs(grid.oceanDepthTerms[i]) * 0.35;
        const smoothing =
          grid.abyssalPlain[i] * 0.35 +
          grid.sedimentWedge[i] * 0.2 +
          grid.forelandBasin[i] * 0.15;
        const erosion =
          grid.sediment[i] * 0.35 +
          grid.basin[i] * 0.25 +
          smoothing;
        const relief = Math.max(0, tectonic + isostatic - erosion);

        grid.tectonicReliefSupply[i] = tectonic;
        grid.isostaticReliefSupply[i] = isostatic;
        grid.sedimentSmoothingPressure[i] = smoothing;
        grid.erosionFlatteningPressure[i] = erosion;
        grid.planetaryRelief[i] = relief;
        grid.reliefDeficit[i] = normalizedDeficit * (0.45 + plain * 0.35 + seaSensitive * 0.2);
        grid.seaLevelSensitivity[i] = seaSensitive ? 1 - Math.abs(relative) / seaLevelBand : 0;
        grid.flatLandMask[i] = plain;
        grid.largePlainMask[i] = broadPlain;

        flatLand += plain * area;
        largePlain += broadPlain * area;
        sensitive += seaSensitive * area;
        tectonicSum += tectonic * area;
        isostaticSum += isostatic * area;
        erosionSum += erosion * area;
        smoothingSum += smoothing * area;
        seaSensitivityWeightSum += grid.seaLevelSensitivity[i] * area;
        if (land) {
          slopeLandSum += slope * area;
          landArea += area;
        }
        if (grid.orographicBarrier[i] > orographicPotential) orographicPotential = grid.orographicBarrier[i];
    });

    const areaDenominator = Math.max(totalAreaValue, Number.EPSILON);
    const flatLandShare = flatLand / areaDenominator;
    const largePlainShare = largePlain / areaDenominator;
    const seaLevelSensitivityShare = sensitive / areaDenominator;
    const inverseSpread = 1 - Math.min(1, stats.hypsometricSpread / 0.34);
    const coastInstabilityRisk = seaLevelSensitivityShare * (0.45 + inverseSpread * 0.55);
    world.reliefDiagnostics = {
      ...stats,
      flatLandShare,
      largePlainShare,
      seaLevelSensitivity: seaLevelSensitivityShare,
      seaLevelSensitivityMean: seaSensitivityWeightSum / areaDenominator,
      coastInstabilityRisk,
      reliefDeficit: deficit,
      normalizedReliefDeficit: normalizedDeficit,
      targetHypsometricSpread: target.hypsometricSpread,
      targetLandReliefSpread: target.landReliefSpread,
      targetGlobalElevationStd: target.globalElevationStd,
      tectonicReliefSupplyMean: tectonicSum / areaDenominator,
      isostaticReliefSupplyMean: isostaticSum / areaDenominator,
      erosionFlatteningPressureMean: erosionSum / areaDenominator,
      sedimentSmoothingPressureMean: smoothingSum / areaDenominator,
      drainageGradientPotential: landArea ? slopeLandSum / landArea * stats.landReliefSpread : 0,
      orographicReliefPotential: orographicPotential,
      flatWorldRisk: stats.globalElevationStd < target.globalElevationStd * 0.72 &&
        stats.hypsometricSpread < target.hypsometricSpread * 0.72 &&
        largePlainShare > 0.38,
    };
    return world.reliefDiagnostics;
  }

  function metricArea(grid, id) {
    const area = grid?.area?.[id];
    return Number.isFinite(area) && area > 0 ? area : 1;
  }

  function getReliefDiagnostics(world) {
    return world.reliefDiagnostics ?? emptyReliefDiagnostics();
  }

  function emptyReliefDiagnostics() {
    return {
      globalElevationStd: 0,
      landElevationStd: 0,
      oceanElevationStd: 0,
      hypsometricSpread: 0,
      landReliefSpread: 0,
      oceanReliefSpread: 0,
      flatLandShare: 0,
      largePlainShare: 0,
      seaLevelSensitivity: 0,
      seaLevelSensitivityMean: 0,
      coastInstabilityRisk: 0,
      reliefDeficit: 0,
      normalizedReliefDeficit: 0,
      targetHypsometricSpread: 0,
      targetLandReliefSpread: 0,
      targetGlobalElevationStd: 0,
      tectonicReliefSupplyMean: 0,
      isostaticReliefSupplyMean: 0,
      erosionFlatteningPressureMean: 0,
      sedimentSmoothingPressureMean: 0,
      drainageGradientPotential: 0,
      orographicReliefPotential: 0,
      flatWorldRisk: false,
    };
  }

  function measureElevationDistribution(grid, seaLevel) {
    const all = [];
    const land = [];
    const ocean = [];
    for (let i = 0; i < grid.size; i += 1) {
      const h = grid.elev[i];
      all.push(h);
      if (h >= seaLevel) land.push(h);
      else ocean.push(h);
    }
    return {
      globalElevationStd: std(all),
      landElevationStd: std(land),
      oceanElevationStd: std(ocean),
      hypsometricSpread: percentileSorted(all, 0.95) - percentileSorted(all, 0.05),
      landReliefSpread: land.length ? percentileSorted(land, 0.9) - percentileSorted(land, 0.1) : 0,
      oceanReliefSpread: ocean.length ? percentileSorted(ocean, 0.9) - percentileSorted(ocean, 0.1) : 0,
    };
  }

  function targetReliefForWorld(params, stats) {
    const intensity = Math.max(0, Math.min(2, params?.intensity ?? 1));
    const waterFraction = Math.max(0.05, Math.min(0.95, (params?.waterLevel ?? 50) / 100));
    const intensityFactor = 0.75 + intensity * 0.25;
    const waterWorldAdjustment = 1 - Math.max(0, waterFraction - 0.55) * 0.18;
    return {
      hypsometricSpread: 0.24 * intensityFactor * waterWorldAdjustment,
      landReliefSpread: 0.135 * intensityFactor,
      globalElevationStd: 0.048 * intensityFactor,
    };
  }

  function localRelief(grid, id, radius) {
    let min = grid.elev[id];
    let max = grid.elev[id];
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighborRing(id, radius, (nid) => {
        const h = grid.elev[nid];
        if (h < min) min = h;
        if (h > max) max = h;
      });
      return max - min;
    }

    forEachNeighborRadiusById(grid, id, radius, (nid) => {
      const h = grid.elev[nid];
      if (h < min) min = h;
      if (h > max) max = h;
    });
    return max - min;
  }

  function localSlope(grid, id, seaLevel) {
    const center = grid.elev[id] - seaLevel;
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      let sumSq = 0;
      let count = 0;
      topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
        const scale = Math.max(0.25, edgeLength || 1);
        const gradient = (grid.elev[nid] - seaLevel - center) / scale;
        sumSq += gradient * gradient;
        count += 1;
      });
      return count ? Math.sqrt(sumSq / count) : 0;
    }

    let left = center;
    let right = center;
    let up = center;
    let down = center;
    forEachNeighbor4ById(grid, id, (nid, dx, dy) => {
      const value = grid.elev[nid] - seaLevel;
      if (dx < 0) left = value;
      else if (dx > 0) right = value;
      else if (dy < 0) up = value;
      else if (dy > 0) down = value;
    });
    return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  function std(values) {
    if (!values.length) return 0;
    let sum = 0;
    let sumSq = 0;
    for (const v of values) {
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / values.length;
    return Math.sqrt(Math.max(0, sumSq / values.length - mean * mean));
  }

  function percentileSorted(values, p) {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * p)));
    return values[index];
  }


  // ---- src/sim/geology/seaLevel.js ----

  const BASELINES = {
    ridge: 0.08,
    ridgeScale: 0.12,
    young: 0.18,
    youngScale: 0.2,
    old: 0.16,
    oldScale: 0.18,
    sediment: 0.1,
    sedimentScale: 0.16,
    trench: 0.04,
    trenchScale: 0.08,
  };

  const WEIGHTS = {
    ridge: 0.34,
    young: 0.28,
    sediment: 0.14,
    old: 0.34,
    trench: 0.1,
  };

  function updateGeologicSeaLevel(world) {
    world.baseSeaLevel = world.seaLevel;
    const previousOffset = world.geologicSeaLevelOffset ?? 0;
    const sameStep = world.geologicSeaLevelStep === world.step;
    const diagnostics = computeGeologicSeaLevelSignals(world, world.baseSeaLevel);

    let offset = previousOffset;
    let change = world.geologicSeaLevelDiagnostics?.seaLevelChangeRate ?? 0;
    if (!sameStep) {
      let maxStep = diagnostics.maxOffsetStep;
      if (diagnostics.coastalFlipRisk > 0.18) maxStep *= 0.5;
      offset = moveToward(previousOffset, diagnostics.targetGeologicSeaLevelOffset, maxStep);
      offset = clamp(offset, -diagnostics.maxOffset, diagnostics.maxOffset);
      change = offset - previousOffset;
      world.geologicSeaLevelPreviousOffset = previousOffset;
      world.geologicSeaLevelOffset = offset;
      world.geologicSeaLevelTargetOffset = diagnostics.targetGeologicSeaLevelOffset;
      world.geologicSeaLevelStep = world.step;
    }

    world.seaLevel = world.baseSeaLevel + offset;
    writeGeologicSeaLevelFields(world, world.seaLevel);
    const landAfter = shareLand(world.grid, world.seaLevel);
    world.geologicSeaLevelDiagnostics = {
      ...diagnostics,
      baseSeaLevel: world.baseSeaLevel,
      seaLevel: world.seaLevel,
      geologicSeaLevelOffset: offset,
      targetGeologicSeaLevelOffset: diagnostics.targetGeologicSeaLevelOffset,
      seaLevelChangeRate: change,
      coastalSensitivityMean: average(world.grid.coastalSensitivity, world.grid),
      landShareAfterGeologicOffset: landAfter,
      geologicSeaLevelLandShareDelta: landAfter - diagnostics.landShareBeforeGeologicOffset,
    };
    return world.geologicSeaLevelDiagnostics;
  }

  function getGeologicSeaLevelDiagnostics(world) {
    return world.geologicSeaLevelDiagnostics ?? {
      baseSeaLevel: world.baseSeaLevel ?? world.seaLevel ?? 0,
      seaLevel: world.seaLevel ?? 0,
      geologicSeaLevelOffset: world.geologicSeaLevelOffset ?? 0,
      targetGeologicSeaLevelOffset: world.geologicSeaLevelTargetOffset ?? 0,
      seaLevelChangeRate: 0,
      youngOceanShare: 0,
      oldOceanShare: 0,
      ridgeVolumeSignalMean: 0,
      oldOceanCapacitySignalMean: 0,
      sedimentDisplacementSignalMean: 0,
      trenchCapacitySignalMean: 0,
      ridgeVolumeNormalized: 0,
      youngOceanNormalized: 0,
      oldOceanCapacityNormalized: 0,
      sedimentDisplacementNormalized: 0,
      trenchCapacityNormalized: 0,
      capacityBalance: 0,
      oceanBasinCapacitySignalMean: 0,
      coastalFlipRisk: 0,
      coastalSensitivityMean: 0,
      seaLevelCouplingStrength: 0,
      landShareBeforeGeologicOffset: 0,
      landShareAfterGeologicOffset: 0,
      geologicSeaLevelLandShareDelta: 0,
    };
  }

  function computeGeologicSeaLevelSignals(world, baseSeaLevel) {
    const { grid } = world;
    let oceanicCount = 0;
    let youngOceanCount = 0;
    let oldOceanCount = 0;
    let ridgeSum = 0;
    let oldCapacitySum = 0;
    let sedimentSum = 0;
    let trenchSum = 0;
    let totalAreaValue = 0;

    for (let i = 0; i < grid.size; i += 1) {
      const area = metricArea(grid, i);
      totalAreaValue += area;
      const oceanic = grid.crustType[i] === CrustType.OCEANIC;
      const age = grid.crustAge[i];
      const youngOcean = oceanic && age < 0.18;
      const oldOcean = oceanic && age > 0.62;
      const depth = Math.max(0, baseSeaLevel - grid.elev[i]);
      const ridgeSignal = oceanic ? clamp01(
        grid.ridgeUplift[i] * 0.45 +
        grid.ridge[i] * 0.3 +
        grid.ridgeAxis[i] * 0.25 +
        Math.max(0, 1 - age / 0.18) * 0.35
      ) : 0;
      const oldCapacity = oldOcean ? clamp01(
        depth * 2.1 +
        Math.max(0, -grid.ageSubsidence[i]) * 2.4 +
        Math.max(0, -grid.oceanDepthTerms[i]) * 1.1
      ) : 0;
      const sedimentDisplacement = clamp01(
        grid.sedimentFill[i] * 0.45 +
        grid.sedimentWedge[i] * 0.35 +
        grid.continentalRise[i] * 0.15 +
        grid.continentalShelf[i] * 0.1 +
        grid.sediment[i] * 0.15
      );
      const trenchCapacity = oceanic ? clamp01(
        Math.max(0, -grid.trenchDepression[i]) * 4.5 +
        grid.trench[i] * 0.35 +
        grid.trenchAxis[i] * 0.1
      ) : 0;

      grid.isYoungOcean[i] = youngOcean ? 1 : 0;
      grid.ridgeVolumeSignal[i] = ridgeSignal;
      grid.oldOceanCapacitySignal[i] = oldCapacity;
      grid.sedimentDisplacementSignal[i] = sedimentDisplacement;
      grid.trenchCapacitySignal[i] = trenchCapacity;

      if (oceanic) {
        oceanicCount += area;
        if (youngOcean) youngOceanCount += area;
        if (oldOcean) oldOceanCount += area;
        ridgeSum += ridgeSignal * area;
        oldCapacitySum += oldCapacity * area;
        trenchSum += trenchCapacity * area;
      }
      if (grid.elev[i] < baseSeaLevel || grid.continentalShelf[i] > 0.01 || grid.sedimentWedge[i] > 0.01) {
        sedimentSum += sedimentDisplacement * area;
      }
    }

    const invOceanic = oceanicCount ? 1 / oceanicCount : 0;
    const youngOceanShare = youngOceanCount * invOceanic;
    const oldOceanShare = oldOceanCount * invOceanic;
    const ridgeMean = ridgeSum * invOceanic;
    const oldCapacityMean = oldCapacitySum * invOceanic;
    const trenchMean = trenchSum * invOceanic;
    const sedimentMean = sedimentSum / Math.max(totalAreaValue, Number.EPSILON);
    const ridgeN = normalizeCentered(ridgeMean, BASELINES.ridge, BASELINES.ridgeScale);
    const youngN = normalizeCentered(youngOceanShare, BASELINES.young, BASELINES.youngScale);
    const oldN = normalizeCentered(oldCapacityMean, BASELINES.old, BASELINES.oldScale);
    const sedimentN = normalizeCentered(sedimentMean, BASELINES.sediment, BASELINES.sedimentScale);
    const trenchN = normalizeCentered(trenchMean, BASELINES.trench, BASELINES.trenchScale);
    const capacityBalance =
      ridgeN * WEIGHTS.ridge +
      youngN * WEIGHTS.young +
      sedimentN * WEIGHTS.sediment -
      oldN * WEIGHTS.old -
      trenchN * WEIGHTS.trench;
    const maxOffset = 0.032;
    const seaLevelCouplingStrength = world.params.pipelineMode === "geology-v2" ? 0.38 : 0;
    const targetOffset = clamp(capacityBalance * maxOffset * seaLevelCouplingStrength, -maxOffset, maxOffset);
    const dt = world.timeScaleFactor ?? 1;
    const maxOffsetStep = 0.0016 * clamp(dt, 0.25, 4);
    const previousOffset = world.geologicSeaLevelOffset ?? 0;
    const estimatedChange = clamp(targetOffset - previousOffset, -maxOffsetStep, maxOffsetStep);

    writeCoastalSensitivity(world, baseSeaLevel + previousOffset);

    return {
      targetGeologicSeaLevelOffset: targetOffset,
      youngOceanShare,
      oldOceanShare,
      ridgeVolumeSignalMean: ridgeMean,
      oldOceanCapacitySignalMean: oldCapacityMean,
      sedimentDisplacementSignalMean: sedimentMean,
      trenchCapacitySignalMean: trenchMean,
      ridgeVolumeNormalized: ridgeN,
      youngOceanNormalized: youngN,
      oldOceanCapacityNormalized: oldN,
      sedimentDisplacementNormalized: sedimentN,
      trenchCapacityNormalized: trenchN,
      capacityBalance,
      oceanBasinCapacitySignalMean: capacityBalance,
      coastalFlipRisk: coastalFlipRisk(grid, baseSeaLevel + previousOffset, estimatedChange),
      seaLevelCouplingStrength,
      landShareBeforeGeologicOffset: shareLand(grid, baseSeaLevel),
      maxOffset,
      maxOffsetStep,
      baselines: BASELINES,
    };
  }

  function writeGeologicSeaLevelFields(world, seaLevel) {
    writeCoastalSensitivity(world, seaLevel);
  }

  function writeCoastalSensitivity(world, seaLevel) {
    const { grid } = world;
    for (let i = 0; i < grid.size; i += 1) {
      const relative = grid.elev[i] - seaLevel;
      const nearSeaLevel = 1 - clamp01(Math.abs(relative) / 0.02);
      const lowSlope = 1 - clamp01(localSlope(grid, i) / 0.018);
      const lowRelief = 1 - clamp01(localRelief4(grid, i) / 0.055);
      const shelfFactor = clamp01(
        grid.continentalShelf[i] * 0.45 +
        grid.passiveMargin[i] * 0.25 +
        grid.sedimentWedge[i] * 0.15 +
        grid.basin[i] * 0.1
      );
      grid.coastalSensitivity[i] = clamp01(
        nearSeaLevel * 0.45 +
        lowSlope * 0.2 +
        lowRelief * 0.15 +
        shelfFactor * 0.2
      );
    }
  }

  function coastalFlipRisk(grid, seaLevel, change) {
    const baseBand = 0.018;
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < grid.size; i += 1) {
      const area = metricArea(grid, i);
      const potential = clamp01((Math.abs(change) * 8 + baseBand - Math.abs(grid.elev[i] - seaLevel)) / baseBand);
      sum += grid.coastalSensitivity[i] * potential * area;
      weight += area;
    }
    return sum / Math.max(weight, Number.EPSILON);
  }

  function localSlope(grid, id) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) return localGraphSlope(grid, topology, id);
    return legacyLocalSlope(grid, id);
  }

  function legacyLocalSlope(grid, id) {
    const { x, y } = legacySeaLevelXyOf(grid, id);
    const left = legacySeaLevelSampleWrapped(grid, grid.elev, x - 1, y);
    const right = legacySeaLevelSampleWrapped(grid, grid.elev, x + 1, y);
    const upId = legacySeaLevelIndexOf(grid, x, y - 1);
    const downId = legacySeaLevelIndexOf(grid, x, y + 1);
    const up = upId >= 0 ? grid.elev[upId] : grid.elev[id];
    const down = downId >= 0 ? grid.elev[downId] : grid.elev[id];
    return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
  }

  function legacySeaLevelXyOf(grid, id) {
    return xyOf(grid, id);
  }

  function legacySeaLevelIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function legacySeaLevelSampleWrapped(grid, field, x, y) {
    return sampleGridWrapped(grid, field, x, y);
  }

  function localRelief4(grid, id) {
    const topology = topologyForGrid(grid);
    let min = grid.elev[id];
    let max = grid.elev[id];
    visitLocalReliefNeighbors(grid, topology, id, (nid) => {
      const value = grid.elev[nid];
      if (value < min) min = value;
      if (value > max) max = value;
    });
    return max - min;
  }

  function localGraphSlope(grid, topology, id) {
    const center = grid.elev[id];
    let count = 0;
    let totalSq = 0;
    topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
      const length = Number.isFinite(edgeLength) && edgeLength > 1e-6 ? edgeLength : 1;
      const gradient = (grid.elev[nid] - center) / length;
      totalSq += gradient * gradient;
      count += 1;
    });
    return count ? Math.sqrt(totalSq / count) : 0;
  }

  function visitLocalReliefNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function shareLand(grid, seaLevel) {
    let land = 0;
    let total = 0;
    for (let i = 0; i < grid.size; i += 1) {
      const area = metricArea(grid, i);
      total += area;
      if (grid.elev[i] >= seaLevel) land += area;
    }
    return land / Math.max(total, Number.EPSILON);
  }

  function average(field, grid = null) {
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < field.length; i += 1) {
      const area = metricArea(grid, i);
      sum += field[i] * area;
      weight += area;
    }
    return sum / Math.max(weight, Number.EPSILON);
  }

  function metricArea(grid, id) {
    const area = grid?.area?.[id];
    return Number.isFinite(area) && area > 0 ? area : 1;
  }

  function normalizeCentered(value, baseline, scale) {
    return clamp((value - baseline) / Math.max(1e-6, scale), -1, 1);
  }

  function moveToward(current, target, maxStep) {
    return current + clamp(target - current, -maxStep, maxStep);
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }


  // ---- src/sim/geology/sediment.js ----

  const TRANSPORT_PASSES = 4;
  const CAPACITY_SMOOTH_PASSES = 2;

  function updateSedimentBudget(world) {
    if (world.sedimentBudgetStep === world.step) return world.sedimentBudgetDiagnostics;

    const { grid, seaLevel } = world;
    const {
      size,
      elev,
      crustType,
      sediment,
      basin,
      activeOrogeny,
      oldOrogeny,
      orogeny,
      mountainBelt,
      mountainAxis,
      orographicBarrier,
      orogenyErosion,
      orogenicSedimentSupply,
      forelandBasin,
      passiveMargin,
      continentalShelf,
      continentalRise,
      sedimentWedge,
      abyssalPlain,
      riftAxis,
      trench,
      trenchAxis,
      ridge,
      ridgeAxis,
      islandArc,
      inlandWaterCandidate,
      externalSeaMask,
      boundaryInfluence,
      axisCurvature,
      weakness,
      erosionSource,
      sedimentFlux,
      sedimentSink,
      sedimentCapacity,
      sedimentCompaction,
      sedimentLoadSubsidence,
      depositionRate,
      erosionRate,
      sedimentBudgetError,
      scratch,
      scratch2,
      scratch3,
    } = grid;
    const dt = world.timeScaleFactor;
    const massBefore = sumField(grid, sediment);

    erosionSource.fill(0);
    sedimentFlux.fill(0);
    sedimentSink.fill(0);
    sedimentCapacity.fill(0);
    sedimentCompaction.fill(0);
    sedimentLoadSubsidence.fill(0);
    depositionRate.fill(0);
    erosionRate.fill(0);
    sedimentBudgetError.fill(0);
    scratch.fill(0);
    scratch2.fill(0);
    scratch3.fill(0);

    let produced = 0;
    forEachGridCell(grid, (id) => {
      const rel = elev[id] - seaLevel;
      const land = rel >= -0.006;
      const slope = localSlope(grid, elev, id);
      const relief = localRelief(grid, elev, id);
      const activeConstructive = Math.max(ridge[id], ridgeAxis[id], trench[id] * 0.55, trenchAxis[id] * 0.45);
      const mountainSource = land
        ? activeOrogeny[id] * 0.00042 +
          mountainBelt[id] * 0.00034 +
          oldOrogeny[id] * 0.00016 +
          orogeny[id] * 0.00018 +
          mountainAxis[id] * 0.00014 +
          orographicBarrier[id] * 0.00009 +
          orogenicSedimentSupply[id] * 0.00032
        : 0;
      const slopeSource = land
        ? smoothstep(0.012, 0.055, slope) * smoothstep(0.018, 0.12, relief) * 0.00023
        : 0;
      const riftShoulderSource = land
        ? riftAxis[id] * smoothstep(0.006, 0.08, rel) * 0.000055
        : 0;
      const boundaryDamp = 1 - Math.min(0.75, activeConstructive * 0.72 + Math.max(0, boundaryInfluence[id] - 0.45) * 0.25);
      const source = clamp01((mountainSource + slopeSource + riftShoulderSource) * dt * boundaryDamp);
      erosionSource[id] = source;
      erosionRate[id] = source / Math.max(0.000001, dt);
      scratch[id] = source;
      sedimentFlux[id] = source;
      produced += source;
    });

    for (let i = 0; i < size; i += 1) {
      const rel = elev[i] - seaLevel;
      const nearOrBelowSea = clamp01((seaLevel + 0.08 - elev[i]) / 0.16);
      const shelfCapacity =
        continentalShelf[i] * 0.34 +
        continentalRise[i] * 0.24 +
        sedimentWedge[i] * 0.22 +
        passiveMargin[i] * 0.16;
      const naturalCapacitySupport = clamp01(
        nearOrBelowSea * 0.28 +
          continentalShelf[i] * 0.55 +
          continentalRise[i] * 0.42 +
          sedimentWedge[i] * 0.36 +
          passiveMargin[i] * 0.28 +
          forelandBasin[i] * 0.34 +
          inlandWaterCandidate[i] * 0.42 +
          abyssalPlain[i] * 0.12,
      );
      const structuralLine = structuralLineMemory(grid, i);
      const broadBasin = localAverage8ById(grid, basin, i);
      const basinCapacity =
        broadBasin * (0.11 + naturalCapacitySupport * 0.2) +
        basin[i] * (0.035 + naturalCapacitySupport * 0.065) * (1 - structuralLine * 0.55) +
        forelandBasin[i] * 0.27 +
        riftAxis[i] * 0.052 +
        inlandWaterCandidate[i] * 0.2;
      const trenchForearcCapacity =
        trench[i] * 0.055 +
        trenchAxis[i] * 0.045 +
        islandArc[i] * 0.04;
      const deepOceanCapacity =
        abyssalPlain[i] * 0.075 * (crustType[i] === CrustType.OCEANIC ? clamp01(grid.crustAge[i]) : 0);
      const activeConstructivePenalty =
        ridgeAxis[i] * 0.34 +
        ridge[i] * 0.24 +
        activeOrogeny[i] * 0.18 +
        (rel > 0.12 ? smoothstep(0.12, 0.32, rel) * 0.08 : 0);
      sedimentCapacity[i] = clamp01(
        shelfCapacity +
        basinCapacity +
        trenchForearcCapacity +
        deepOceanCapacity +
        nearOrBelowSea * 0.08 -
        activeConstructivePenalty,
      );
    }
    softenSedimentCapacity(grid);

    let deposited = 0;
    let dissipated = 0;
    for (let pass = 0; pass < TRANSPORT_PASSES; pass += 1) {
      scratch2.fill(0);
      forEachGridCell(grid, (id) => {
        let remaining = scratch[id];
        if (remaining <= 0) return;
        const maxSediment = maxSedimentForCell(grid, id, elev[id] - seaLevel);
        const saturation = clamp01(sediment[id] / Math.max(0.001, maxSediment));
        const sinkEfficiency = 0.32 + pass * 0.12;
        const localCapacity = sedimentCapacity[id] * (1 - saturation * 0.82) * sinkEfficiency * 0.018 * dt;
        const localDeposit = Math.min(remaining, Math.max(0, localCapacity));
        if (localDeposit > 0) {
          sedimentSink[id] += localDeposit;
          remaining -= localDeposit;
          deposited += localDeposit;
        }
        if (remaining <= 0) return;

        const centerElev = elev[id];
        const deterministicJitter = sedimentTransportJitter(grid, id, pass);
        let weightSum = 0;
        let fallback = -1;
        let fallbackScore = -Infinity;
        const candidates = [];
        visitNeighbor8(grid, id, (nid, diagonal) => {
          const downslope = Math.max(0, centerElev - elev[nid]);
          const softSink = softDepositionalSink(grid, nid);
          const attraction =
            softSink * 0.74 +
            basin[nid] * 0.24 +
            forelandBasin[nid] * 0.5 +
            passiveMargin[nid] * 0.32 +
            continentalShelf[nid] * 0.52 +
            continentalRise[nid] * 0.34 +
            inlandWaterCandidate[nid] * 0.48 +
            sedimentCapacity[nid] * 0.42 +
            abyssalPlain[nid] * 0.12;
          const constructivePenalty = ridge[nid] * 0.48 + ridgeAxis[nid] * 0.58 + activeOrogeny[nid] * 0.24;
          const bend = 0.88 + Math.min(0.3, (axisCurvature?.[nid] ?? 0) * 0.16 + (weakness?.[nid] ?? 0) * 0.08);
          const score = downslope * 12 + attraction - constructivePenalty;
          const weight = Math.max(0, score) * (diagonal ? 0.68 : 1) * bend * deterministicJitter;
          if (weight > 0) {
            candidates.push([nid, weight]);
            weightSum += weight;
          }
          if (score > fallbackScore) {
            fallback = nid;
            fallbackScore = score;
          }
        });

        if (weightSum > 0) {
          const travel = remaining * (0.72 - pass * 0.08);
          const localLoss = remaining - travel;
          dissipated += localLoss;
          for (const [nid, weight] of candidates) scratch2[nid] += travel * (weight / weightSum);
        } else if (fallback >= 0 && sedimentCapacity[fallback] > sedimentCapacity[id] * 0.95) {
          const travel = remaining * 0.42;
          scratch2[fallback] += travel;
          dissipated += remaining - travel;
        } else {
          const extraDeposit = Math.min(remaining, Math.max(0, sedimentCapacity[id] * 0.006 * dt));
          sedimentSink[id] += extraDeposit;
          deposited += extraDeposit;
          dissipated += remaining - extraDeposit;
        }
      });
      scratch.set(scratch2);
      for (let i = 0; i < size; i += 1) sedimentFlux[i] += scratch[i];
    }

    let compactionTotal = 0;
    for (let i = 0; i < size; i += 1) {
      const maxSediment = maxSedimentForCell(grid, i, elev[i] - seaLevel);
      const saturation = clamp01(sediment[i] / Math.max(0.001, maxSediment));
      const gain = sedimentSink[i] * (0.72 + sedimentCapacity[i] * 0.42) * (1 - saturation * 0.72);
      sediment[i] = Math.min(maxSediment, sediment[i] + Math.max(0, gain));

      const compaction = Math.min(sediment[i] * 0.12, sediment[i] * sediment[i] * 0.0024 * dt);
      sedimentCompaction[i] = compaction;
      sediment[i] = Math.max(0, sediment[i] - compaction * 0.62);
      compactionTotal += compaction;

      const typeFactor = crustType[i] === CrustType.TRANSITIONAL ? 1.2 : crustType[i] === CrustType.OCEANIC ? 0.9 : 0.6;
      sedimentLoadSubsidence[i] = sediment[i] * 0.028 * typeFactor;
      depositionRate[i] = sedimentSink[i] / Math.max(0.000001, dt);
      const lineDamp = 1 - structuralLineMemory(grid, i) * 0.48;
      basin[i] = Math.max(0, Math.min(1, basin[i] + sedimentSink[i] * 0.08 * lineDamp - sediment[i] * sedimentCapacity[i] * 0.0009 * dt));
    }
    softenSedimentDeposits(grid, seaLevel);

    const massAfter = sumField(grid, sediment);
    const massDelta = massAfter - massBefore;
    const residualFlux = sumField(grid, scratch);
    const budgetErrorValue = produced
      ? Math.abs(produced - deposited - dissipated - residualFlux) / Math.max(0.000001, produced)
      : 0;
    sedimentBudgetError.fill(Math.min(1, budgetErrorValue));

    const diagnostics = measureSedimentBudget(world, {
      produced,
      deposited,
      dissipated,
      compactionTotal,
      residualFlux,
      massBefore,
      massAfter,
      massDelta,
      budgetErrorValue,
    });
    world.sedimentBudgetStep = world.step;
    world.sedimentBudgetDiagnostics = diagnostics;
    return diagnostics;
  }

  function getSedimentBudgetDiagnostics(world) {
    return world.sedimentBudgetDiagnostics ?? measureSedimentBudget(world, {
      produced: sumField(world.grid, world.grid.erosionSource),
      deposited: sumField(world.grid, world.grid.sedimentSink),
      dissipated: 0,
      compactionTotal: sumField(world.grid, world.grid.sedimentCompaction),
      residualFlux: sumField(world.grid, world.grid.sedimentFlux),
      massBefore: sumField(world.grid, world.grid.sediment),
      massAfter: sumField(world.grid, world.grid.sediment),
      massDelta: 0,
      budgetErrorValue: averageField(world.grid, world.grid.sedimentBudgetError),
    });
  }

  function measureSedimentBudget(world, totals) {
    const { grid } = world;
    const {
      size,
      erosionSource,
      sedimentFlux,
      sedimentSink,
      sedimentCapacity,
      sedimentCompaction,
      sedimentLoadSubsidence,
      sediment,
      passiveMargin,
      continentalShelf,
      continentalRise,
      sedimentWedge,
      basin,
      forelandBasin,
      trench,
      trenchAxis,
      inlandWaterCandidate,
      abyssalPlain,
      activeOrogeny,
      oldOrogeny,
      mountainBelt,
    } = grid;

    const totalAreaValue = totalArea(grid);
    let mountainErosion = 0;
    let passiveMarginDeposition = 0;
    let basinDeposition = 0;
    let trenchForearcDeposition = 0;
    let inlandBasinDeposition = 0;
    let shelfDeposition = 0;
    let abyssalDeposition = 0;
    let overfilled = 0;
    let shallowSeaHighSediment = 0;
    let shallowSea = 0;

    for (let i = 0; i < size; i += 1) {
      const area = metricArea(grid, i);
      const sink = sedimentSink[i];
      const mountainMask = Math.max(activeOrogeny[i], oldOrogeny[i], mountainBelt[i]);
      mountainErosion += erosionSource[i] * clamp01(mountainMask * 3.2);
      passiveMarginDeposition += sink * clamp01(passiveMargin[i] + continentalShelf[i] + continentalRise[i] + sedimentWedge[i]);
      basinDeposition += sink * clamp01(basin[i] + forelandBasin[i]);
      trenchForearcDeposition += sink * clamp01(trench[i] + trenchAxis[i]);
      inlandBasinDeposition += sink * (inlandWaterCandidate[i] ? 1 : 0);
      shelfDeposition += sink * clamp01(continentalShelf[i] + continentalRise[i] + sedimentWedge[i]);
      abyssalDeposition += sink * clamp01(abyssalPlain[i]);
      if (sediment[i] > maxSedimentForCell(grid, i, grid.elev[i] - world.seaLevel) * 0.92) overfilled += area;
      if (grid.elev[i] < world.seaLevel && world.seaLevel - grid.elev[i] < 0.05) {
        shallowSea += area;
        if (sediment[i] > 0.38) shallowSeaHighSediment += area;
      }
    }

    return {
      erosionSourceMean: averageField(grid, erosionSource),
      erosionSourceTotal: totals.produced,
      depositionTotal: totals.deposited,
      sedimentFluxMean: averageField(grid, sedimentFlux),
      sedimentSinkMean: averageField(grid, sedimentSink),
      sedimentCapacityMean: averageField(grid, sedimentCapacity),
      sedimentCompactionMean: averageField(grid, sedimentCompaction),
      sedimentLoadSubsidenceMean: averageField(grid, sedimentLoadSubsidence),
      sedimentBudgetError: totals.budgetErrorValue,
      sedimentMassBefore: totals.massBefore,
      sedimentMassAfter: totals.massAfter,
      sedimentMassDelta: totals.massDelta,
      mountainErosionShare: totals.produced ? mountainErosion / totals.produced : 0,
      passiveMarginDepositionShare: totals.deposited ? passiveMarginDeposition / totals.deposited : 0,
      basinDepositionShare: totals.deposited ? basinDeposition / totals.deposited : 0,
      trenchForearcDepositionShare: totals.deposited ? trenchForearcDeposition / totals.deposited : 0,
      inlandBasinDepositionShare: totals.deposited ? inlandBasinDeposition / totals.deposited : 0,
      sedimentOverfillShare: overfilled / Math.max(totalAreaValue, Number.EPSILON),
      sedimentPatchiness: measurePatchiness(grid, sediment),
      ...measureSedimentStraightnessDiagnostics(grid, sediment),
      sedimentSeaFillRisk: shallowSea ? shallowSeaHighSediment / shallowSea : 0,
      sedimentShelfConcentration: totals.deposited ? shelfDeposition / totals.deposited : 0,
      sedimentAbyssalConcentration: totals.deposited ? abyssalDeposition / totals.deposited : 0,
      sedimentResidualDissipation: totals.dissipated,
      sedimentResidualFlux: totals.residualFlux ?? 0,
    };
  }

  function softenSedimentCapacity(grid) {
    const { sedimentCapacity, scratch3 } = grid;
    for (let pass = 0; pass < CAPACITY_SMOOTH_PASSES; pass += 1) {
      scratch3.set(sedimentCapacity);
      forEachGridCell(grid, (id) => {
        let total = scratch3[id] * 1.8;
        let weight = 1.8;
        visitNeighbor8(grid, id, (nid, diagonal) => {
          const w = diagonal ? 0.38 : 0.72;
          total += scratch3[nid] * w;
          weight += w;
        });
        const local = scratch3[id];
        const smoothed = total / weight;
        const naturalSink = softDepositionalSink(grid, id);
        const structuralLine = clamp01(
          Math.max(0, grid.boundaryInfluence[id] - 0.14) * 1.8 +
            (grid.fractureZoneMemory?.[id] ?? 0) * 0.65 +
            (grid.transformMemory?.[id] ?? 0) * 0.42 +
            (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2,
        );
        const blend = clamp01(0.16 + naturalSink * 0.16 + structuralLine * 0.22);
        const edgeClamp = 0.06 + naturalSink * 0.04;
        sedimentCapacity[id] = clamp01(mix(local, Math.min(local + edgeClamp, smoothed), blend));
      });
    }
  }

  function softDepositionalSink(grid, id) {
    const broadBasin = localAverage8ById(grid, grid.basin, id);
    const structuralLine = structuralLineMemory(grid, id);
    const natural =
      grid.passiveMargin[id] * 0.54 +
      grid.continentalShelf[id] * 0.72 +
      grid.continentalRise[id] * 0.54 +
      grid.sedimentWedge[id] * 0.5 +
      grid.forelandBasin[id] * 0.62 +
      grid.inlandWaterCandidate[id] * 0.44 +
      grid.abyssalPlain[id] * 0.22;
    const basinPart = (broadBasin * 0.2 + grid.basin[id] * 0.08) * (0.35 + natural * 0.65) * (1 - structuralLine * 0.55);
    return clamp01(natural + basinPart);
  }

  function softenSedimentDeposits(grid, seaLevel) {
    const { sediment, scratch3 } = grid;
    scratch3.set(sediment);
    forEachGridCell(grid, (id) => {
      const structuralLine = structuralLineMemory(grid, id);
      const naturalSink = softDepositionalSink(grid, id);
      const blend = clamp01(structuralLine * 0.085 + naturalSink * 0.035);
      if (blend <= 0.002) return;
      let total = scratch3[id] * 1.9;
      let weight = 1.9;
      visitNeighbor8(grid, id, (nid, diagonal) => {
        const w = diagonal ? 0.28 : 0.58;
        total += scratch3[nid] * w;
        weight += w;
      });
      const maxSediment = maxSedimentForCell(grid, id, grid.elev[id] - seaLevel);
      sediment[id] = Math.min(maxSediment, mix(scratch3[id], total / weight, blend));
    });
  }

  function maxSedimentForCell(grid, id, relativeElevation) {
    if (grid.ridge[id] > 0.12 || grid.ridgeAxis[id] > 0.08) return 0.18;
    const shelf = Math.max(grid.continentalShelf[id], grid.sedimentWedge[id]);
    if (shelf > 0.08) return 0.65 + shelf * 0.08;
    if (grid.continentalRise[id] > 0.08) return 0.75;
    if (grid.passiveMargin[id] > 0.08) return 0.8;
    if (grid.forelandBasin[id] > 0.08) return 0.7;
    if (grid.riftStage[id] > 0 || grid.riftAxis[id] > 0.08) return 0.55;
    if (grid.abyssalPlain[id] > 0.08) return 0.45;
    if (grid.crustType[id] === CrustType.OCEANIC) return relativeElevation < 0 ? 0.35 : 0.28;
    return relativeElevation < 0 ? 0.42 : 0.3;
  }

  function localSlope(grid, field, id) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) return localGraphSlope(grid, topology, field, id);

    const { x, y } = legacySedimentXyOf(grid, id);
    const center = field[id];
    const left = legacyFiniteSample(grid, field, x - 1, y, center);
    const right = legacyFiniteSample(grid, field, x + 1, y, center);
    const up = legacyFiniteSample(grid, field, x, y - 1, center);
    const down = legacyFiniteSample(grid, field, x, y + 1, center);
    return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
  }

  function localRelief(grid, field, id) {
    const topology = topologyForGrid(grid);
    const center = field[id];
    let maxDelta = 0;
    visitNeighbor4(grid, topology, id, (nid) => {
      maxDelta = Math.max(maxDelta, Math.abs(center - field[nid]));
    });
    return maxDelta;
  }

  function visitNeighbor8(grid, id, visit) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid, false);
      });
      return;
    }
    forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
      visit(nid, dx !== 0 && dy !== 0);
    });
  }

  function visitNeighbor4(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function localGraphSlope(grid, topology, field, id) {
    const center = field[id];
    let count = 0;
    let totalSq = 0;
    topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
      const length = Number.isFinite(edgeLength) && edgeLength > 1e-6 ? edgeLength : 1;
      const gradient = (field[nid] - center) / length;
      totalSq += gradient * gradient;
      count += 1;
    });
    return count ? Math.sqrt(totalSq / count) : 0;
  }

  function measurePatchiness(grid, field) {
    let total = 0;
    let weight = 0;
    forEachGridCell(grid, (id) => {
      const area = metricArea(grid, id);
      total += localRelief(grid, field, id) * area;
      weight += area;
    });
    return total / Math.max(weight, Number.EPSILON);
  }

  function measureSedimentStraightnessDiagnostics(grid, field) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) return measureGraphSedimentStraightnessDiagnostics(grid, topology, field);

    let totalWeight = 0;
    let weightedRisk = 0;
    let structuralWeight = 0;
    let naturalWeight = 0;
    let axisWeight = 0;
    forEachGridCell(grid, (id, x, y) => {
      if (field[id] < 0.05) return;
      const contrast = localRelief(grid, field, id);
      if (contrast < 0.012) return;

      const horizontal = legacyBandScore(grid, field, x, y, 1, 0, 0, 1);
      const vertical = legacyBandScore(grid, field, x, y, 0, 1, 1, 0);
      const diagA = legacyBandScore(grid, field, x, y, 1, 1, 1, -1);
      const diagB = legacyBandScore(grid, field, x, y, 1, -1, 1, 1);
      const directionalRisk = Math.max(horizontal, vertical, diagA, diagB);
      if (directionalRisk <= 0) return;

      const naturalSink = clamp01(
        grid.passiveMargin[id] +
          grid.continentalShelf[id] +
          grid.continentalRise[id] +
          grid.sedimentWedge[id] +
          localAverage8ById(grid, grid.basin, id) * 0.28 +
          grid.forelandBasin[id] +
          grid.abyssalPlain[id] * 0.5,
      );
      const structuralMemory = clamp01(
        (grid.inactiveBoundaryRelief?.[id] ?? 0) * 5 +
          (grid.fractureZoneMemory?.[id] ?? 0) * 2 +
          (grid.transformMemory?.[id] ?? 0) * 1.2 +
          Math.max(0, grid.boundaryInfluence[id] - 0.1) * 2,
      );
      const suspiciousWeight = Math.max(0.15, structuralMemory) * (1 - naturalSink * 0.65);
      totalWeight += suspiciousWeight;
      weightedRisk += directionalRisk * suspiciousWeight;
      structuralWeight += directionalRisk * structuralMemory;
      naturalWeight += directionalRisk * naturalSink;
      axisWeight += Math.max(horizontal, vertical) * suspiciousWeight;
    });
    return {
      sedimentStraightnessRisk: totalWeight ? weightedRisk / totalWeight : 0,
      sedimentBoundaryCorrelation: totalWeight ? structuralWeight / totalWeight : 0,
      sedimentGridAlignment: totalWeight ? axisWeight / totalWeight : 0,
      sedimentNaturalSinkShare: totalWeight ? naturalWeight / totalWeight : 0,
    };
  }

  function measureGraphSedimentStraightnessDiagnostics(grid, topology, field) {
    let totalWeight = 0;
    let weightedRisk = 0;
    let structuralWeight = 0;
    let naturalWeight = 0;
    let gridLikeWeight = 0;
    forEachGridCell(grid, (id) => {
      if (field[id] < 0.05) return;
      const contrast = localRelief(grid, field, id);
      if (contrast < 0.012) return;

      let neighborCount = 0;
      let similarCount = 0;
      let crossContrast = 0;
      let maxNeighborDelta = 0;
      topology.forEachNeighbor(id, (nid) => {
        const delta = Math.abs(field[nid] - field[id]);
        neighborCount += 1;
        if (delta < 0.018) similarCount += 1;
        else crossContrast += smoothstep(0.012, 0.045, delta);
        if (delta > maxNeighborDelta) maxNeighborDelta = delta;
      });
      if (!neighborCount) return;

      const continuity = similarCount / neighborCount;
      const edgeContrast = crossContrast / neighborCount;
      const patchEdge = smoothstep(0.012, 0.055, maxNeighborDelta);
      const directionalRisk = clamp01((continuity * 0.46 + edgeContrast * 0.36 + patchEdge * 0.18) * 0.85);
      if (directionalRisk <= 0) return;

      const naturalSink = clamp01(
        grid.passiveMargin[id] +
          grid.continentalShelf[id] +
          grid.continentalRise[id] +
          grid.sedimentWedge[id] +
          localAverage8ById(grid, grid.basin, id) * 0.28 +
          grid.forelandBasin[id] +
          grid.abyssalPlain[id] * 0.5,
      );
      const structuralMemory = clamp01(
        (grid.inactiveBoundaryRelief?.[id] ?? 0) * 5 +
          (grid.fractureZoneMemory?.[id] ?? 0) * 2 +
          (grid.transformMemory?.[id] ?? 0) * 1.2 +
          Math.max(0, grid.boundaryInfluence[id] - 0.1) * 2,
      );
      const suspiciousWeight = Math.max(0.15, structuralMemory) * (1 - naturalSink * 0.65);
      totalWeight += suspiciousWeight;
      weightedRisk += directionalRisk * suspiciousWeight;
      structuralWeight += directionalRisk * structuralMemory;
      naturalWeight += directionalRisk * naturalSink;
      gridLikeWeight += directionalRisk * structuralMemory * (1 - naturalSink);
    });
    return {
      sedimentStraightnessRisk: totalWeight ? weightedRisk / totalWeight : 0,
      sedimentBoundaryCorrelation: totalWeight ? structuralWeight / totalWeight : 0,
      sedimentGridAlignment: totalWeight ? gridLikeWeight / totalWeight : 0,
      sedimentNaturalSinkShare: totalWeight ? naturalWeight / totalWeight : 0,
    };
  }

  function legacyBandScore(grid, field, x, y, alongDx, alongDy, perpDx, perpDy) {
    const id = legacySedimentIndexOf(grid, x, y);
    if (id < 0) return 0;
    const value = field[id];
    const along =
      legacySimilarity(grid, field, x + alongDx, y + alongDy, value) *
      legacySimilarity(grid, field, x - alongDx, y - alongDy, value);
    const cross =
      legacyContrastAgainst(grid, field, x + perpDx, y + perpDy, value) *
      legacyContrastAgainst(grid, field, x - perpDx, y - perpDy, value);
    return along * cross;
  }

  function legacySimilarity(grid, field, x, y, value) {
    const sample = legacySedimentSampleWrapped(grid, field, x, y);
    return Number.isFinite(sample) ? clamp01(1 - Math.abs(sample - value) / 0.018) : 0;
  }

  function legacyContrastAgainst(grid, field, x, y, value) {
    const sample = legacySedimentSampleWrapped(grid, field, x, y);
    return Number.isFinite(sample) ? smoothstep(0.012, 0.045, Math.abs(sample - value)) : 0;
  }

  function legacyFiniteSample(grid, field, x, y, fallback) {
    const sample = legacySedimentSampleWrapped(grid, field, x, y);
    return Number.isFinite(sample) ? sample : fallback;
  }

  function sumField(grid, field) {
    let sum = 0;
    for (let i = 0; i < field.length; i += 1) sum += field[i] * metricArea(grid, i);
    return sum;
  }

  function averageField(grid, field) {
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < field.length; i += 1) {
      const area = metricArea(grid, i);
      sum += field[i] * area;
      weight += area;
    }
    return sum / Math.max(weight, Number.EPSILON);
  }

  function totalArea(grid) {
    let total = 0;
    for (let i = 0; i < grid.size; i += 1) total += metricArea(grid, i);
    return total;
  }

  function metricArea(grid, id) {
    const area = grid?.area?.[id];
    return Number.isFinite(area) && area > 0 ? area : 1;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / Math.max(0.000001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function legacySedimentXyOf(grid, id) {
    return xyOf(grid, id);
  }

  function legacySedimentIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function legacySedimentSampleWrapped(grid, field, x, y) {
    return sampleGridWrapped(grid, field, x, y);
  }

  function localAverage8ById(grid, field, id) {
    let total = field[id] * 1.5;
    let weight = 1.5;
    visitNeighbor8(grid, id, (nid, diagonal) => {
      const w = diagonal ? 0.45 : 0.8;
      total += field[nid] * w;
      weight += w;
    });
    return weight ? total / weight : 0;
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }

  function structuralLineMemory(grid, id) {
    return clamp01(
      Math.max(0, grid.boundaryInfluence[id] - 0.12) * 1.25 +
        (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2 +
        (grid.fractureZoneMemory?.[id] ?? 0) * 0.9 +
        (grid.transformMemory?.[id] ?? 0) * 0.55,
    );
  }

  function sedimentTransportJitter(grid, id, pass) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      const px = grid.positionX?.[id] ?? 0;
      const py = grid.positionY?.[id] ?? 0;
      const pz = grid.positionZ?.[id] ?? 1;
      const lon = Math.atan2(py, px) / (Math.PI * 2);
      const lat = Math.asin(Math.max(-1, Math.min(1, pz))) / Math.PI;
      const coarseLon = Math.floor(lon * 37 + pass * 5);
      const coarseLat = Math.floor(lat * 31 + pass * 7);
      const fineLon = Math.floor(lon * 91 + pass * 11);
      const fineLat = Math.floor(lat * 73 + pass * 13);
      const coarse = hash2(coarseLon, coarseLat);
      const fine = hash2(fineLon, fineLat);
      return 0.82 + (coarse * 0.62 + fine * 0.38) * 0.18;
    }
    return 0.82 + (((id * 1103515245 + pass * 1013904223) >>> 0) % 997) / 997 * 0.18;
  }

  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function mix(a, b, t) {
    return a * (1 - t) + b * t;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }


  // ---- src/sim/geology/pipeline.js ----

  function runGeologyV2Step(world) {
    // The staged calls below define the geology-v2 pipeline contract.
    runStage(world, "advectCrust", advectCrust);
    runStage(world, "updatePlateBoundaries", updatePlateBoundaries);
    runStage(world, "updateCrustProperties", updateCrustProperties);
    runStage(world, "updateTransformMemory", updateTransformMemory);
    runStage(world, "updateTectonicAxes", updateTectonicAxes);
    runStage(world, "buildTectonicFeatures", buildTectonicFeatures);
    runStage(world, "updateOrogenicLifecycle", updateOrogenicLifecycle);
    runStage(world, "updateSedimentBudget", updateSedimentBudget);
    runStage(world, "rebuildGeologyElevation:initial", rebuildGeologyElevation);
    if (!world.geologyV2SeaInitialized) {
      initializeSeaLevel(world);
      world.geologyV2SeaInitialized = true;
    }
    runStage(world, "updateRiftStages", updateRiftStages);
    runStage(world, "rebuildGeologyElevation:rift", rebuildGeologyElevation);
    runStage(world, "applyGeologyV2SurfaceAging", applyGeologyV2SurfaceAging);
    runStage(world, "rebuildGeologyElevation:aging", rebuildGeologyElevation);
    runStage(world, "rebuildMountainInterfaceFields:preMargin", rebuildMountainInterfaceFields);
    runStage(world, "updateSeaLevel:preMargin", updateSeaLevel);
    runStage(world, "updateGeologicSeaLevel:preMargin", updateGeologicSeaLevel);
    runStage(world, "deriveOceanConnectivity:preMargin", deriveOceanConnectivity);
    runStage(world, "updatePassiveMargins:first", updatePassiveMargins);
    runStage(world, "rebuildGeologyElevation:margin", rebuildGeologyElevation);
    runStage(world, "rebuildMountainInterfaceFields:postMargin", rebuildMountainInterfaceFields);
    runStage(world, "suppressInactiveFractureRelief:first", suppressInactiveFractureRelief);
    runStage(world, "updateSeaLevel:postFracture", updateSeaLevel);
    runStage(world, "updateGeologicSeaLevel:postFracture", updateGeologicSeaLevel);
    runStage(world, "deriveOceanConnectivity:postFracture", deriveOceanConnectivity);
    if (shouldRunSecondMarginPass(world)) {
      runStage(world, "updatePassiveMargins:second", updatePassiveMargins);
      runStage(world, "suppressInactiveFractureRelief:second", suppressInactiveFractureRelief);
    }
    runStage(world, "updateSeaLevel:final", updateSeaLevel);
    runStage(world, "updateGeologicSeaLevel:final", updateGeologicSeaLevel);
    runStage(world, "deriveOceanConnectivity:final", deriveOceanConnectivity);
    runStage(world, "rebuildMountainInterfaceFields:final", rebuildMountainInterfaceFields);
    runStage(world, "updateSurfaceContinuityDiagnostics", () => updateSurfaceContinuityDiagnostics(world.grid));
    if (shouldRefreshFullGeologyDiagnostics(world)) {
      runStage(world, "updateReliefBudgetDiagnostics", updateReliefBudgetDiagnostics);
    }
  }

  function runStage(world, name, fn) {
    if (!world.profileGeologyV2Stages) {
      return fn(world);
    }
    const t0 = performance.now();
    const result = fn(world);
    const elapsed = performance.now() - t0;
    const timings = world.geologyV2StageTimings ?? (world.geologyV2StageTimings = new Map());
    const current = timings.get(name) ?? { totalMs: 0, calls: 0, maxMs: 0 };
    current.totalMs += elapsed;
    current.calls += 1;
    if (elapsed > current.maxMs) current.maxMs = elapsed;
    timings.set(name, current);
    return result;
  }

  function shouldRefreshFullGeologyDiagnostics(world) {
    return Boolean(world.profileGeologyV2Stages || world.fullGeologyDiagnostics || world.step === 0 || world.step % 20 === 19);
  }

  function shouldRunSecondMarginPass(world) {
    return Boolean(world.fullGeologyDiagnostics || world.step < 2 || world.step % 5 === 4);
  }

  function applyGeologyV2SurfaceAging(world) {
    const { grid } = world;
    const { size, crustType, crustAge, crustThickness, orogeny, oldOrogeny, orogenyErosion, sediment, mountainBelt, trench, ridge, rift, islandArc, basin, boundaryInfluence, isContinental } = grid;
    const dt = world.timeScaleFactor;
    for (let i = 0; i < size; i += 1) {
      const inactive = 1 - Math.min(1, boundaryInfluence[i]);
      const oceanic = crustType[i] === CrustType.OCEANIC;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      const erosion = (isContinental[i] ? 0.0018 : transitional ? 0.0024 : 0.0032) * dt * (0.25 + inactive);
      const lostOrogeny = Math.min(orogeny[i], orogeny[i] * erosion);
      orogeny[i] -= lostOrogeny;
      oldOrogeny[i] = Math.max(oldOrogeny[i], orogeny[i] * inactive * inactive * 0.55);
      orogenyErosion[i] = Math.max(orogenyErosion[i], lostOrogeny);
      const lowOrPassive = inactive * (transitional ? 1.45 : oceanic && crustAge[i] > 0.45 ? 0.75 : 0.35);
      sediment[i] = Math.min(1, sediment[i] + lostOrogeny * 0.055 + lowOrPassive * Math.max(0, 0.58 - crustThickness[i]) * 0.00055 * dt);
      mountainBelt[i] *= Math.max(0, 1 - 0.009 * dt * inactive);
      trench[i] *= Math.max(0, 1 - 0.018 * dt);
      ridge[i] *= Math.max(0, 1 - 0.014 * dt);
      rift[i] *= Math.max(0, 1 - 0.008 * dt * inactive);
      islandArc[i] *= Math.max(0, 1 - 0.01 * dt * inactive);
      basin[i] = Math.min(1, basin[i] * Math.max(0, 1 - 0.0015 * dt * (1 - inactive)) + sediment[i] * 0.0008 * dt);
    }
    if (world.step % 4 === 0) {
      broadenLongTermMemory(grid);
      smoothPassiveCrustFields(grid);
    }
    rebuildCompatibilityCrust(grid);
  }

  function broadenLongTermMemory(grid) {
    const { orogeny, oldOrogeny, sediment, basin, boundaryInfluence, crustType, scratch, scratch2, scratch3 } = grid;
    const radius = physicalRadius(grid, 2);
    const topology = topologyForGrid(grid);
    scratch.set(orogeny);
    scratch2.set(sediment);
    scratch3.set(basin);

    forEachGridCell(grid, (id, x, y) => {
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      if (inactive <= 0.35 && scratch[id] < 0.015 && scratch2[id] < 0.035 && scratch3[id] < 0.035) return;

      let oroTotal = scratch[id] * 3;
      let sedTotal = scratch2[id] * 2.2;
      let basinTotal = scratch3[id] * 2.2;
      let oroWeight = 3;
      let sedWeight = 2.2;
      let basinWeight = 2.2;

      visitSmoothingNeighborhood(grid, topology, id, x, y, radius, (nid, dist) => {
        const falloff = 1 / (1 + dist);
        if (crustType[nid] === CrustType.CONTINENTAL || crustType[id] === CrustType.CONTINENTAL) {
          oroTotal += scratch[nid] * falloff;
          oroWeight += falloff;
        }
        const sedWeightLocal = falloff * (crustType[nid] === CrustType.TRANSITIONAL ? 1.35 : 1);
        sedTotal += scratch2[nid] * sedWeightLocal;
        sedWeight += sedWeightLocal;
        basinTotal += scratch3[nid] * falloff;
        basinWeight += falloff;
      });

      const oroSmooth = oroTotal / oroWeight;
      const sedSmooth = sedTotal / sedWeight;
      const basinSmooth = basinTotal / basinWeight;
      const oroMix = Math.min(0.28, inactive * 0.18);
      const sedMix = Math.min(0.36, 0.12 + inactive * 0.18);
      const basinMix = Math.min(0.32, 0.1 + inactive * 0.16);
      orogeny[id] = scratch[id] * (1 - oroMix) + oroSmooth * oroMix;
      oldOrogeny[id] = Math.max(oldOrogeny[id], orogeny[id] * inactive * inactive * 0.58);
      sediment[id] = Math.min(1, scratch2[id] * (1 - sedMix) + sedSmooth * sedMix);
      basin[id] = Math.min(1, scratch3[id] * (1 - basinMix) + basinSmooth * basinMix);
    });
  }

  function rebuildCompatibilityCrust(grid) {
    const { size, crustType, crustThickness, crustAge, crust, isContinental } = grid;
    for (let i = 0; i < size; i += 1) {
      if (crustType[i] === CrustType.CONTINENTAL) {
        crust[i] = (crustThickness[i] - 0.52) * 1.85;
        isContinental[i] = 1;
      } else if (crustType[i] === CrustType.TRANSITIONAL) {
        crust[i] = -0.08 + (crustThickness[i] - 0.38) * 1.15 - crustAge[i] * 0.08;
        isContinental[i] = 0;
      } else {
        crust[i] = -0.55 - crustAge[i] * 0.32 - Math.max(0, 0.3 - crustThickness[i]) * 0.7;
        isContinental[i] = 0;
      }
    }
  }

  function smoothPassiveCrustFields(grid) {
    const { crustType, crustAge, crustThickness, sediment, basin, boundaryInfluence, weakness, scratch, scratch2, scratch3 } = grid;
    const topology = topologyForGrid(grid);
    scratch.set(crustAge);
    scratch2.set(crustThickness);
    scratch3.set(sediment);

    forEachGridCell(grid, (id) => {
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      const passive = crustType[id] === CrustType.OCEANIC || crustType[id] === CrustType.TRANSITIONAL;
      if (!passive || crustType[id] === CrustType.OCEANIC || inactive < 0.55) return;

      let ageTotal = scratch[id] * 2.5;
      let thickTotal = scratch2[id] * 2.5;
      let sedTotal = scratch3[id] * 2.5;
      let weightTotal = 2.5;
      visitPassiveCrustNeighbors(grid, topology, id, (nid, dx, dy) => {
        const sameFamily = crustType[nid] === CrustType.OCEANIC || crustType[nid] === CrustType.TRANSITIONAL;
        if (!sameFamily || boundaryInfluence[nid] > 0.55) return;
        const w = dx === 0 || dy === 0 ? 1 : 0.55;
        ageTotal += scratch[nid] * w;
        thickTotal += scratch2[nid] * w;
        sedTotal += scratch3[nid] * w;
        weightTotal += w;
      });

      const mix = Math.min(0.2, inactive * 0.12);
      crustAge[id] = scratch[id] * (1 - mix) + (ageTotal / weightTotal) * mix;
      crustThickness[id] = scratch2[id] * (1 - mix) + (thickTotal / weightTotal) * mix;
      sediment[id] = Math.min(1, scratch3[id] * (1 - mix) + (sedTotal / weightTotal) * mix);
    });

    scratch.set(crustAge);
    scratch2.set(sediment);
    scratch3.set(basin);
    const radius = Math.max(1, physicalRadius(grid, 2));
    forEachGridCell(grid, (id, x, y) => {
      const inactive = 1 - Math.min(1, boundaryInfluence[id]);
      const passive = crustType[id] === CrustType.OCEANIC || crustType[id] === CrustType.TRANSITIONAL;
      if (!passive || inactive < 0.62) return;

      const bendX = Math.round((weakness[id] - 0.5) * radius);
      const bendY = Math.round((weakness[id] - 0.5) * radius * 0.45);
      let ageTotal = scratch[id] * 3;
      let sedTotal = scratch2[id] * 2;
      let basinTotal = scratch3[id] * 2;
      let ageWeight = 3;
      let fillWeight = 2;

      visitBentSmoothingNeighborhood(grid, topology, id, x, y, radius, bendX, bendY, (nid, dist) => {
        const samePassive = crustType[nid] === CrustType.OCEANIC || crustType[nid] === CrustType.TRANSITIONAL;
        if (!samePassive || boundaryInfluence[nid] > 0.52) return;
        const falloff = 1 / (1 + dist);
        ageTotal += scratch[nid] * falloff;
        sedTotal += scratch2[nid] * falloff;
        basinTotal += scratch3[nid] * falloff;
        ageWeight += falloff;
        fillWeight += falloff;
      });

      const ageSmooth = ageTotal / ageWeight;
      const sedSmooth = sedTotal / fillWeight;
      const basinSmooth = basinTotal / fillWeight;
      const ageMix = Math.min(0.16, inactive * 0.09);
      const fillMix = Math.min(0.22, inactive * 0.13);
      if (crustType[id] !== CrustType.OCEANIC) crustAge[id] = scratch[id] * (1 - ageMix) + ageSmooth * ageMix;
      sediment[id] = Math.min(1, scratch2[id] * (1 - fillMix) + sedSmooth * fillMix);
      basin[id] = Math.min(1, scratch3[id] * (1 - fillMix) + basinSmooth * fillMix);
    });
  }

  function visitPassiveCrustNeighbors(grid, topology, id, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid, 1, 0);
      });
      return;
    }
    forEachNeighbor8ById(grid, id, (nid, dx, dy) => {
      visit(nid, dx, dy);
    });
  }

  function visitSmoothingNeighborhood(grid, topology, id, x, y, radius, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      topology.forEachNeighborRing(id, radius, (nid, depth) => {
        if (nid === id || depth <= 0 || depth > radius + 0.01) return;
        visit(nid, depth);
      });
      return;
    }
    legacyVisitSmoothingNeighborhood(grid, x, y, radius, visit);
  }

  function legacyVisitSmoothingNeighborhood(grid, x, y, radius, visit) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius + 0.01) continue;
        const nid = legacyPipelineIndexOf(grid, x + dx, y + dy);
        if (nid >= 0) visit(nid, dist);
      }
    }
  }

  function visitBentSmoothingNeighborhood(grid, topology, id, x, y, radius, bendX, bendY, visit) {
    if (isGraphBackedGrid(grid, topology)) {
      const bendDepth = Math.max(0, Math.min(radius, Math.round(Math.hypot(bendX, bendY))));
      topology.forEachNeighborRing(id, radius + bendDepth, (nid, depth) => {
        if (nid === id || depth <= bendDepth || depth > radius + bendDepth + 0.01) return;
        visit(nid, Math.max(0.01, depth - bendDepth));
      });
      return;
    }
    legacyVisitBentSmoothingNeighborhood(grid, x, y, radius, bendX, bendY, visit);
  }

  function legacyVisitBentSmoothingNeighborhood(grid, x, y, radius, bendX, bendY, visit) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01 || dist > radius + 0.01) continue;
        const nid = legacyPipelineIndexOf(grid, x + dx + bendX, y + dy + bendY);
        if (nid >= 0) visit(nid, dist);
      }
    }
  }

  function legacyPipelineIndexOf(grid, x, y) {
    return indexOf(grid, x, y);
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(
      grid.topologyOptions?.graphBacked ||
        topology?.topologyKind === "cubed-sphere" ||
        grid.topologyKind === "cubed-sphere",
    );
  }


  // ---- src/sim/derived/terrain.js ----

  const TERRAIN_BASE_CACHE = Symbol("terrainBaseCache");
  const TERRAIN_DERIVED_CACHE = Symbol("terrainDerivedCache");
  const HYDROLOGY_CACHE = Symbol("hydrologyInputsCache");

  function getTerrainDerived(world) {
    const cached = getStepCache(world, TERRAIN_DERIVED_CACHE);
    if (cached) return cached.value;

    const base = getTerrainBase(world);
    const value = {
      relativeElevation: base.relativeElevation,
      landMask: base.landMask,
      seaMask: base.seaMask,
      shallowSeaMask: base.shallowSeaMask,
      deepOceanMask: base.deepOceanMask,
      slope: base.slope,
      aspect: base.aspect,
      ruggedness: base.ruggedness,
      coastDistance: base.coastDistance,
      distanceToOcean: base.distanceToOcean,
      landmassId: base.landmassId,
      islandId: base.islandId,
      externalSeaMask: base.externalSeaMask,
      oceanConnectivity: base.oceanConnectivity,
      closedBasinId: base.closedBasinId,
      inlandWaterCandidate: base.inlandWaterCandidate,
      passiveMargin: base.passiveMargin,
      continentalShelf: base.continentalShelf,
      continentalSlope: base.continentalSlope,
      continentalRise: base.continentalRise,
      abyssalPlain: base.abyssalPlain,
      sedimentWedge: base.sedimentWedge,
      erosionSource: base.erosionSource,
      sedimentFlux: base.sedimentFlux,
      sedimentSink: base.sedimentSink,
      sedimentCapacity: base.sedimentCapacity,
      sedimentCompaction: base.sedimentCompaction,
      sedimentLoadSubsidence: base.sedimentLoadSubsidence,
      isostaticBase: base.isostaticBase,
      crustBuoyancy: base.crustBuoyancy,
      densitySubsidence: base.densitySubsidence,
      lithosphereCooling: base.lithosphereCooling,
      isostaticResidual: base.isostaticResidual,
      sedimentBudgetError: base.sedimentBudgetError,
      depositionRate: base.depositionRate,
      erosionRate: base.erosionRate,
      sedimentBudgetDiagnostics: base.sedimentBudgetDiagnostics,
      isostasyDiagnostics: base.isostasyDiagnostics,
      topologyDiagnostics: measureTopologyDiagnostics(world),
      forelandBasin: base.forelandBasin,
      orogenicSedimentSupply: base.orogenicSedimentSupply,
      activeTransform: base.activeTransform,
      transformMemory: base.transformMemory,
      fractureZoneMemory: base.fractureZoneMemory,
      tectonicAxis: base.tectonicAxis,
      axisCurvature: base.axisCurvature,
      axisContinuity: base.axisContinuity,
      axisBoundaryDependency: base.axisBoundaryDependency,
      mountainHeightBlockiness: base.mountainHeightBlockiness,
      orographicBarrierContinuity: base.orographicBarrierContinuity,
      planetaryRelief: base.planetaryRelief,
      reliefDeficit: base.reliefDeficit,
      seaLevelSensitivity: base.seaLevelSensitivity,
      largePlainMask: base.largePlainMask,
      flatLandMask: base.flatLandMask,
      baseSeaLevel: base.geologicSeaLevelDiagnostics.baseSeaLevel,
      geologicSeaLevelOffset: base.geologicSeaLevelDiagnostics.geologicSeaLevelOffset,
      coastalSensitivity: base.coastalSensitivity,
      ridgeVolumeSignal: base.ridgeVolumeSignal,
      oldOceanCapacitySignal: base.oldOceanCapacitySignal,
      sedimentDisplacementSignal: base.sedimentDisplacementSignal,
      trenchCapacitySignal: base.trenchCapacitySignal,
    };
    setStepCache(world, TERRAIN_DERIVED_CACHE, value);
    return value;
  }

  function getClimateInputs(world) {
    const base = getTerrainBase(world);
    const { grid } = world;
    const {
      size,
      mountainBelt,
      activeOrogeny,
      oldOrogeny,
      orogeny,
      mountainAxis: storedMountainAxis,
      mountainHeight: storedMountainHeight,
      orographicBarrier: storedOrographicBarrier,
    } = grid;
    const latitude = new Float32Array(size);
    const oceanDepth = new Float32Array(size);
    const orographicBarrier = new Float32Array(size);
    const mountainAxis = new Float32Array(size);
    const mountainHeight = new Float32Array(size);

    forEachGridCell(grid, (id, _x, y) => {
      const lat = latitudeDegrees(grid, id, y);
      const rel = base.relativeElevation[id];
      latitude[id] = lat;
      oceanDepth[id] = Math.max(0, -rel);
      mountainAxis[id] = Math.max(storedMountainAxis?.[id] ?? 0, mountainBelt?.[id] ?? 0, activeOrogeny?.[id] ?? 0, oldOrogeny?.[id] ?? 0, orogeny?.[id] ?? 0);
      mountainHeight[id] = Math.max(storedMountainHeight?.[id] ?? 0, Math.max(0, rel) * (0.45 + Math.min(1, mountainAxis[id] * 2.2)));
      orographicBarrier[id] = Math.max(storedOrographicBarrier?.[id] ?? 0, Math.max(0, rel) * Math.min(1, base.ruggedness[id] * 5.5 + mountainAxis[id] * 1.4));
    });

    return {
      latitude,
      relativeElevation: base.relativeElevation,
      landMask: base.landMask,
      seaMask: base.seaMask,
      oceanDepth,
      shallowSeaMask: base.shallowSeaMask,
      continentalShelf: base.continentalShelf,
      coastDistance: base.coastDistance,
      distanceToOcean: base.distanceToOcean,
      orographicBarrier,
      mountainAxis,
      mountainHeight,
      hypsometricSpread: base.reliefDiagnostics.hypsometricSpread,
      landReliefSpread: base.reliefDiagnostics.landReliefSpread,
      orographicReliefPotential: base.reliefDiagnostics.orographicReliefPotential,
      seaLevel: world.seaLevel,
      baseSeaLevel: base.geologicSeaLevelDiagnostics.baseSeaLevel,
      geologicSeaLevelOffset: base.geologicSeaLevelDiagnostics.geologicSeaLevelOffset,
      coastalSensitivity: base.coastalSensitivity,
    };
  }

  function getHydrologyInputs(world, options = {}) {
    const diagnostics = options.diagnostics ?? "basic";
    const level = diagnosticsLevel(diagnostics);
    const cached = getStepCache(world, HYDROLOGY_CACHE);
    if (cached && cached.level >= level && !options.profile) return cached.value;

    const base = getTerrainBase(world);
    const value = deriveHydrology(world, base, options);
    if (!options.profile) setStepCache(world, HYDROLOGY_CACHE, value, { level });
    return value;
  }

  function getBiosphereInputs(world) {
    const base = getTerrainBase(world);
    const { grid } = world;
    const { size, elev, crustType, sediment, boundaryInfluence, ridge, trench, rift, islandArc, mountainBelt, activeOrogeny, oldOrogeny, forelandBasin, orogenicSedimentSupply } = grid;
    const biomeBaseElevation = smoothElevation(grid, elev, physicalRadius(grid, 1));
    const soilParentMaterial = new Int8Array(size);
    const soilDepthPotential = new Float32Array(size);
    const waterAvailability = new Float32Array(size);
    const groundwaterPotential = new Float32Array(size);
    const floodplainPotential = new Float32Array(size);
    const coastalWetlandPotential = new Float32Array(size);
    const volcanicSoilPotential = new Float32Array(size);
    const disturbance = new Float32Array(size);
    const connectivityToLandmass = new Float32Array(size);
    const landmassAreas = measureComponentAreas(grid, base.landmassId);
    const landConnectivityScale = metricTotal(grid) * 0.18;

    for (let i = 0; i < size; i += 1) {
      const type = crustType?.[i] ?? (base.landMask[i] ? 1 : 0);
      const sed = sediment?.[i] ?? 0;
      soilParentMaterial[i] = type;
      soilDepthPotential[i] = Math.max(0, Math.min(1, sed * 0.52 + (orogenicSedimentSupply?.[i] ?? 0) * 0.24 + (forelandBasin?.[i] ?? 0) * 0.18 + (1 - Math.min(1, base.slope[i] * 5.5)) * 0.3 + Math.max(0, base.relativeElevation[i]) * 0.06));
      waterAvailability[i] = 0;
      groundwaterPotential[i] = Math.max(0, Math.min(1, sed * 0.45 + (base.shallowSeaMask[i] ? 0.18 : 0) - base.slope[i] * 1.1));
      floodplainPotential[i] = Math.max(0, Math.min(1, (1 - Math.min(1, base.slope[i] * 7)) * sed * (base.landMask[i] ? 1 : 0)));
      coastalWetlandPotential[i] = base.landMask[i] && base.coastDistance[i] <= physicalRadius(grid, 2) && base.relativeElevation[i] < 0.045
        ? Math.max(0, Math.min(1, 0.6 - base.coastDistance[i] * 0.08 + sed * 0.35))
        : 0;
      volcanicSoilPotential[i] = Math.max(islandArc?.[i] ?? 0, ridge?.[i] ?? 0, rift?.[i] ?? 0);
      disturbance[i] = Math.max(
        boundaryInfluence?.[i] ?? 0,
        ridge?.[i] ?? 0,
        trench?.[i] ?? 0,
        rift?.[i] ?? 0,
        mountainBelt?.[i] ?? 0,
        activeOrogeny?.[i] ?? 0,
        (oldOrogeny?.[i] ?? 0) * 0.35,
      );
      const landId = base.landmassId[i];
      connectivityToLandmass[i] = landId ? Math.min(1, (landmassAreas.get(landId) ?? 0) / Math.max(Number.EPSILON, landConnectivityScale)) : 0;
    }

    return {
      biomeBaseElevation,
      soilParentMaterial,
      soilDepthPotential,
      slope: base.slope,
      ruggedness: base.ruggedness,
      waterAvailability,
      groundwaterPotential,
      floodplainPotential,
      coastalWetlandPotential,
      volcanicSoilPotential,
      disturbance,
      landmassId: base.landmassId,
      islandId: base.islandId,
      connectivityToLandmass,
    };
  }

  function getResourceInputs(world) {
    const base = getTerrainBase(world);
    const { grid } = world;
    const { size, crustType, crustAge, crustThickness, crustBuoyancy, isostaticResidual, orogeny, activeOrogeny, oldOrogeny, forelandBasin, islandArc, riftStage, sediment, sedimentSink, basin, ridge, weakness, boundaryInfluence } = grid;
    const volcanicArc = new Float32Array(size);
    const passiveMargin = new Float32Array(grid.passiveMargin);
    const sedimentaryBasin = new Float32Array(size);
    const metamorphicBelt = new Float32Array(size);
    const igneousProvince = new Float32Array(size);
    const hydrothermalPotential = new Float32Array(size);
    const mineralProvince = new Int16Array(size);

    for (let i = 0; i < size; i += 1) {
      const type = crustType?.[i] ?? (base.landMask[i] ? 1 : 0);
      const riftValue = grid.rift?.[i] ?? 0;
      volcanicArc[i] = islandArc?.[i] ?? 0;
      sedimentaryBasin[i] = Math.max(0, Math.min(1, (basin?.[i] ?? 0) * 0.52 + (forelandBasin?.[i] ?? 0) * 0.38 + (sediment?.[i] ?? 0) * 0.42));
      metamorphicBelt[i] = Math.max(orogeny?.[i] ?? 0, oldOrogeny?.[i] ?? 0);
      igneousProvince[i] = Math.max(ridge?.[i] ?? 0, islandArc?.[i] ?? 0, riftValue * 0.65);
      hydrothermalPotential[i] = Math.max(0, Math.min(1, (ridge?.[i] ?? 0) * 0.42 + volcanicArc[i] * 0.45 + riftValue * 0.18 + (weakness?.[i] ?? 0) * (boundaryInfluence?.[i] ?? 0) * 0.22));
      mineralProvince[i] = 0;
    }

    return {
      crustType,
      crustAge,
      crustThickness,
      crustBuoyancy: new Float32Array(crustBuoyancy),
      isostaticResidual: new Float32Array(isostaticResidual),
      orogeny,
      orogenicBelt: maxFields(activeOrogeny, oldOrogeny, orogeny),
      tectonicAxis: new Float32Array(grid.tectonicAxis),
      activeOrogeny,
      oldOrogeny,
      forelandBasin,
      volcanicArc,
      riftStage,
      passiveMargin,
      sediment: new Float32Array(sediment),
      sedimentSink: new Float32Array(sedimentSink),
      basin,
      sedimentaryBasin,
      metamorphicBelt,
      igneousProvince,
      hydrothermalPotential,
      mineralProvince,
      activeTransform: new Float32Array(grid.activeTransform),
      transformMemory: new Float32Array(grid.transformMemory),
      fractureZoneMemory: new Float32Array(grid.fractureZoneMemory),
    };
  }

  function getTerrainBase(world) {
    const cached = getStepCache(world, TERRAIN_BASE_CACHE);
    if (cached) return cached.value;
    const value = buildTerrainBase(world);
    setStepCache(world, TERRAIN_BASE_CACHE, value);
    return value;
  }

  function getStepCache(world, key) {
    const cached = world[key];
    if (!cached || cached.step !== world.step || cached.ageYears !== world.ageYears) return null;
    return cached;
  }

  function setStepCache(world, key, value, extra = {}) {
    world[key] = {
      step: world.step,
      ageYears: world.ageYears,
      value,
      ...extra,
    };
  }

  function diagnosticsLevel(diagnostics) {
    if (diagnostics === "full") return 2;
    if (diagnostics === "none") return 0;
    return 1;
  }

  function buildTerrainBase(world) {
    const { grid, seaLevel } = world;
    const { size, elev } = grid;
    const relativeElevation = new Float32Array(size);
    const landMask = new Uint8Array(size);
    const seaMask = new Uint8Array(size);
    const shallowSeaMask = new Uint8Array(size);
    const deepOceanMask = new Uint8Array(size);

    for (let i = 0; i < size; i += 1) {
      const rel = elev[i] - seaLevel;
      relativeElevation[i] = rel;
      if (rel >= 0) {
        landMask[i] = 1;
      } else {
        seaMask[i] = 1;
        if (rel > -0.08) shallowSeaMask[i] = 1;
        if (rel < -0.22) deepOceanMask[i] = 1;
      }
    }

    const { slope, aspect, ruggedness } = measureTerrainShape(grid, relativeElevation);
    const connectivity = deriveOceanConnectivity(world);
    const externalSeaMask = new Uint8Array(connectivity.externalSeaMask);
    const inlandWaterCandidate = new Uint8Array(connectivity.inlandWaterCandidate);
    const oceanConnectivity = new Uint8Array(connectivity.oceanConnectivity);
    const closedBasinId = new Int32Array(connectivity.closedBasinId);
    const coastDistance = distanceFromCoast(grid, landMask);
    const distanceToOcean = distanceFromSources(grid, externalSeaMask);
    const { landmassId, islandId } = labelLandmasses(grid, landMask);
    const passiveMargin = new Float32Array(grid.passiveMargin);
    const continentalShelf = new Float32Array(grid.continentalShelf);
    const continentalSlope = new Float32Array(grid.continentalSlope);
    const continentalRise = new Float32Array(grid.continentalRise);
    const abyssalPlain = new Float32Array(grid.abyssalPlain);
    const sedimentWedge = new Float32Array(grid.sedimentWedge);
    const erosionSource = new Float32Array(grid.erosionSource);
    const sedimentFlux = new Float32Array(grid.sedimentFlux);
    const sedimentSink = new Float32Array(grid.sedimentSink);
    const sedimentCapacity = new Float32Array(grid.sedimentCapacity);
    const sedimentCompaction = new Float32Array(grid.sedimentCompaction);
    const sedimentLoadSubsidence = new Float32Array(grid.sedimentLoadSubsidence);
    const isostaticBase = new Float32Array(grid.isostaticBase);
    const crustBuoyancy = new Float32Array(grid.crustBuoyancy);
    const densitySubsidence = new Float32Array(grid.densitySubsidence);
    const lithosphereCooling = new Float32Array(grid.lithosphereCooling);
    const isostaticResidual = new Float32Array(grid.isostaticResidual);
    const sedimentBudgetError = new Float32Array(grid.sedimentBudgetError);
    const depositionRate = new Float32Array(grid.depositionRate);
    const erosionRate = new Float32Array(grid.erosionRate);
    const sedimentBudgetDiagnostics = getSedimentBudgetDiagnostics(world);
    const isostasyDiagnostics = getIsostasyDiagnostics(world);
    const activeTransform = new Float32Array(grid.activeTransform);
    const transformMemory = new Float32Array(grid.transformMemory);
    const fractureZoneMemory = new Float32Array(grid.fractureZoneMemory);
    const forelandBasin = new Float32Array(grid.forelandBasin);
    const orogenicSedimentSupply = new Float32Array(grid.orogenicSedimentSupply);
    const tectonicAxis = new Float32Array(grid.tectonicAxis);
    const axisCurvature = new Float32Array(grid.axisCurvature);
    const axisContinuity = new Float32Array(grid.axisContinuity);
    const axisBoundaryDependency = new Float32Array(grid.axisBoundaryDependency);
    const mountainHeightBlockiness = new Float32Array(grid.mountainHeightBlockiness);
    const orographicBarrierContinuity = new Float32Array(grid.orographicBarrierContinuity);
    const planetaryRelief = new Float32Array(grid.planetaryRelief);
    const reliefDeficit = new Float32Array(grid.reliefDeficit);
    const seaLevelSensitivity = new Float32Array(grid.seaLevelSensitivity);
    const largePlainMask = new Uint8Array(grid.largePlainMask);
    const flatLandMask = new Uint8Array(grid.flatLandMask);
    const reliefDiagnostics = updateReliefBudgetDiagnostics(world);
    const geologicSeaLevelDiagnostics = getGeologicSeaLevelDiagnostics(world);
    const coastalSensitivity = new Float32Array(grid.coastalSensitivity);
    const ridgeVolumeSignal = new Float32Array(grid.ridgeVolumeSignal);
    const oldOceanCapacitySignal = new Float32Array(grid.oldOceanCapacitySignal);
    const sedimentDisplacementSignal = new Float32Array(grid.sedimentDisplacementSignal);
    const trenchCapacitySignal = new Float32Array(grid.trenchCapacitySignal);

    return {
      relativeElevation,
      landMask,
      seaMask,
      shallowSeaMask,
      deepOceanMask,
      slope,
      aspect,
      ruggedness,
      coastDistance,
      distanceToOcean,
      landmassId,
      islandId,
      externalSeaMask,
      inlandWaterCandidate,
      oceanConnectivity,
      closedBasinId,
      passiveMargin,
      continentalShelf,
      continentalSlope,
      continentalRise,
      abyssalPlain,
      sedimentWedge,
      erosionSource,
      sedimentFlux,
      sedimentSink,
      sedimentCapacity,
      sedimentCompaction,
      sedimentLoadSubsidence,
      isostaticBase,
      crustBuoyancy,
      densitySubsidence,
      lithosphereCooling,
      isostaticResidual,
      sedimentBudgetError,
      depositionRate,
      erosionRate,
      sedimentBudgetDiagnostics,
      isostasyDiagnostics,
      forelandBasin,
      orogenicSedimentSupply,
      activeTransform,
      transformMemory,
      fractureZoneMemory,
      tectonicAxis,
      axisCurvature,
      axisContinuity,
      axisBoundaryDependency,
      mountainHeightBlockiness,
      orographicBarrierContinuity,
      planetaryRelief,
      reliefDeficit,
      seaLevelSensitivity,
      largePlainMask,
      flatLandMask,
      reliefDiagnostics,
      geologicSeaLevelDiagnostics,
      coastalSensitivity,
      ridgeVolumeSignal,
      oldOceanCapacitySignal,
      sedimentDisplacementSignal,
      trenchCapacitySignal,
    };
  }

  function maxFields(...fields) {
    const size = fields.find(Boolean)?.length ?? 0;
    const output = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      let value = 0;
      for (const field of fields) if (field?.[i] > value) value = field[i];
      output[i] = value;
    }
    return output;
  }

  function measureTerrainShape(grid, field) {
    const { size } = grid;
    const slope = new Float32Array(size);
    const aspect = new Float32Array(size);
    const ruggedness = new Float32Array(size);
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      for (let id = 0; id < size; id += 1) {
        const center = field[id];
        let maxDiff = 0;
        let totalDiff = 0;
        let count = 0;
        topology.forEachNeighbor(id, (nid, _slot, edgeLength = 1) => {
          const diff = field[nid] - center;
          const scaled = Math.abs(diff) / Math.max(1, edgeLength);
          if (scaled > maxDiff) maxDiff = scaled;
          totalDiff += Math.abs(diff);
          count += 1;
        });
        slope[id] = maxDiff;
        aspect[id] = 0;
        ruggedness[id] = count ? totalDiff / count : 0;
      }
      return { slope, aspect, ruggedness };
    }

    forEachGridCell(grid, (id, x, y) => {
      const center = field[id];
      const left = legacyFiniteSample(grid, field, x - 1, y, center);
      const right = legacyFiniteSample(grid, field, x + 1, y, center);
      const up = legacyFiniteSample(grid, field, x, y - 1, center);
      const down = legacyFiniteSample(grid, field, x, y + 1, center);
      const dx = (right - left) * 0.5;
      const dy = (down - up) * 0.5;
      slope[id] = Math.hypot(dx, dy);
      aspect[id] = Math.atan2(dy, dx);

      let sum = 0;
      let count = 0;
      forEachNeighbor4ById(grid, id, (nid) => {
        sum += Math.abs(field[id] - field[nid]);
        count += 1;
      });
      ruggedness[id] = count ? sum / count : 0;
    });

    return { slope, aspect, ruggedness };
  }

  function distanceFromCoast(grid, landMask) {
    const coast = new Uint8Array(grid.size);
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology)) {
      for (let id = 0; id < grid.size; id += 1) {
        let nearOpposite = false;
        topology.forEachNeighbor(id, (nid) => {
          if (landMask[nid] !== landMask[id]) nearOpposite = true;
        });
        if (nearOpposite) coast[id] = 1;
      }
      return topology.shortestDistanceSeeds(coast);
    }

    forEachGridCell(grid, (id) => {
      let nearOpposite = false;
      forEachNeighbor4ById(grid, id, (nid) => {
        if (landMask[nid] !== landMask[id]) nearOpposite = true;
      });
      if (nearOpposite) coast[id] = 1;
    });
    return distanceFromSources(grid, coast);
  }

  function distanceFromSources(grid, sourceMask) {
    const topology = topologyForGrid(grid);
    if (isGraphBackedGrid(grid, topology) && topology.shortestDistanceSeeds) {
      return topology.shortestDistanceSeeds(sourceMask);
    }
    const { size } = grid;
    const distance = new Float32Array(size);
    distance.fill(Number.POSITIVE_INFINITY);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;

    for (let i = 0; i < size; i += 1) {
      if (!sourceMask[i]) continue;
      distance[i] = 0;
      queue[tail++] = i;
    }

    while (head < tail) {
      const id = queue[head++];
      const nextDistance = distance[id] + 1;
      forEachNeighbor4ById(grid, id, (nid) => {
        if (nextDistance >= distance[nid]) return;
        distance[nid] = nextDistance;
        queue[tail++] = nid;
      });
    }

    return distance;
  }

  function labelLandmasses(grid, landMask) {
    const { size } = grid;
    const landmassId = new Int32Array(size);
    const islandId = new Int32Array(size);
    const queue = new Int32Array(size);
    let nextLandId = 1;
    let nextIslandId = 1;
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    const islandLimit = graphBacked ? metricTotal(grid) * 0.018 : Math.max(24, Math.floor(size * 0.018));

    for (let start = 0; start < size; start += 1) {
      if (!landMask[start] || landmassId[start]) continue;
      let head = 0;
      let tail = 0;
      let componentMeasure = 0;
      landmassId[start] = nextLandId;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        componentMeasure += metricArea(grid, id);
        visitTerrainCardinalNeighbor(grid, topology, id, graphBacked, (nid) => {
          if (!landMask[nid] || landmassId[nid]) return;
          landmassId[nid] = nextLandId;
          queue[tail++] = nid;
        });
      }

      if (componentMeasure <= islandLimit) {
        for (let i = 0; i < tail; i += 1) islandId[queue[i]] = nextIslandId;
        nextIslandId += 1;
      }
      nextLandId += 1;
    }

    return { landmassId, islandId };
  }

  function smoothElevation(grid, field, radius) {
    const { size } = grid;
    const output = new Float32Array(field.length);
    const topology = topologyForGrid(grid);
    const graphBacked = isGraphBackedGrid(grid, topology);
    for (let id = 0; id < size; id += 1) {
      let total = field[id] * 2;
      let weight = 2;
      visitTerrainRadiusNeighbor(grid, topology, id, radius, graphBacked, (nid, distance) => {
        const w = 1 / (1 + distance);
        total += field[nid] * w;
        weight += w;
      });
      output[id] = total / weight;
    }
    return output;
  }

  function visitTerrainCardinalNeighbor(grid, topology, id, graphBacked, visit) {
    if (graphBacked) {
      topology.forEachNeighbor(id, (nid) => {
        visit(nid);
      });
      return;
    }
    forEachNeighbor4ById(grid, id, (nid) => {
      visit(nid);
    });
  }

  function visitTerrainRadiusNeighbor(grid, topology, id, radius, graphBacked, visit) {
    if (graphBacked) {
      topology.forEachNeighborRing(id, radius, (nid, depth) => {
        if (nid === id || depth <= 0) return;
        visit(nid, depth);
      });
      return;
    }
    forEachNeighborRadiusById(grid, id, radius, (nid, dx, dy) => {
      visit(nid, Math.hypot(dx, dy));
    });
  }

  function legacyFiniteSample(grid, field, x, y, fallback) {
    const value = sampleGridWrapped(grid, field, x, y);
    return Number.isFinite(value) ? value : fallback;
  }

  function latitudeDegrees(grid, id, y) {
    if (grid.lat && Number.isFinite(grid.lat[id])) return grid.lat[id] * 180 / Math.PI;
    return legacyLatitudeDegrees(grid, y);
  }

  function legacyLatitudeDegrees(grid, y) {
    const height = gridParamHeight(grid);
    return height ? ((y + 0.5) / height - 0.5) * 180 : 0;
  }

  function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
    return Boolean(grid.topologyOptions?.graphBacked || topology?.topologyKind === "cubed-sphere" || grid.topologyKind === "cubed-sphere");
  }

  function metricArea(grid, id) {
    return grid.area?.[id] ?? 1;
  }

  function metricTotal(grid) {
    if (!grid.area) return grid.size;
    let total = 0;
    for (let i = 0; i < grid.size; i += 1) total += metricArea(grid, i);
    return total;
  }

  function measureComponentAreas(grid, componentId) {
    const sizes = new Map();
    for (let i = 0; i < componentId.length; i += 1) {
      const id = componentId[i];
      if (!id) continue;
      sizes.set(id, (sizes.get(id) ?? 0) + metricArea(grid, i));
    }
    return sizes;
  }


  // ---- src/sim/world.js ----

  const PipelineMode = {
    LEGACY: "legacy",
    GEOLOGY_V2: "geology-v2",
  };

  const TopologyMode = {
    CYLINDRICAL: "cylindrical",
    CUBED_SPHERE: "cubed-sphere",
  };

  const ProjectionMode = {
    EQUIRECTANGULAR: "equirectangular",
    ORTHOGRAPHIC: "orthographic",
    DEBUG_FACE: "debug-face",
    DEBUG_CELL_ID: "debug-cell-id",
    DEBUG_NEIGHBOR_COUNT: "debug-neighbor-count",
    DEBUG_AREA: "debug-area",
    DEBUG_FACE_SEAM_RISK: "debug-face-seam-risk",
    DEBUG_PROJECTION_SAMPLING: "debug-projection-sampling",
  };

  const ProductionTopologyMode = {
    CYLINDRICAL: "cylindrical",
    CUBED_SPHERE_ADAPTER: "cubed-sphere-adapter",
  };

  function createWorld(params) {
    const normalizedParams = normalizeParams(params);
    const [width, height] = normalizedParams.resolution.split("x").map(Number);
    const seedUint32 = hashSeed(normalizedParams.seedText);
    const grid = createProductionGrid(normalizedParams, width, height, seedUint32);
    const world = {
      grid,
      sphericalGrid: createExperimentalSphericalGrid(normalizedParams),
      sphericalWorld: createExperimentalSphericalWorld(normalizedParams, seedUint32),
      params: normalizedParams,
      seedUint32,
      step: 0,
      ageYears: 0,
      timeScaleFactor: timeScaleFactor(normalizedParams.timeScale),
      seaLevel: 0,
      waterVolume: 0,
      plates: null,
      continentNoise: null,
      textureNoise: null,
      initialPlateCentersX: null,
      initialPlateCentersY: null,
      initialPlateCentersU: null,
      initialPlateCentersV: null,
      initialSphericalPlates: null,
      stats: {},
    };
    initializeBaseTerrain(world);
    assignPlates(world);
    initializeSeaLevel(world);
    if (world.params.pipelineMode === PipelineMode.GEOLOGY_V2) {
      rasterizePlatesV2(world);
      updatePlateBoundaries(world);
    } else {
      computeBoundaryStress(world);
    }
    updateSeaLevel(world);
    world.stats = analyzeWorld(world);
    return world;
  }

  function updateWorldParams(world, params) {
    world.params = normalizeParams({ ...world.params, ...params });
    world.timeScaleFactor = timeScaleFactor(world.params.timeScale);
  }

  function normalizeParams(params) {
    const topologyMode = params.topologyMode === TopologyMode.CUBED_SPHERE
      ? TopologyMode.CUBED_SPHERE
      : TopologyMode.CYLINDRICAL;
    const productionTopologyMode = normalizeProductionTopologyMode({ ...params, topologyMode });
    const pipelineMode = productionTopologyMode === ProductionTopologyMode.CUBED_SPHERE_ADAPTER || params.pipelineMode === PipelineMode.GEOLOGY_V2
      ? PipelineMode.GEOLOGY_V2
      : PipelineMode.LEGACY;
    const projectionMode = Object.values(ProjectionMode).includes(params.projectionMode)
      ? params.projectionMode
      : ProjectionMode.EQUIRECTANGULAR;
    return {
      ...params,
      pipelineMode,
      topologyMode,
      projectionMode,
      productionTopologyMode,
      faceSize: normalizeFaceSize(params.faceSize, params.resolution),
    };
  }

  function normalizeProductionTopologyMode(params) {
    if (
      params.topologyMode === TopologyMode.CUBED_SPHERE ||
      params.productionTopologyMode === ProductionTopologyMode.CUBED_SPHERE_ADAPTER ||
      params.useSphericalProductionGrid === true
    ) {
      return ProductionTopologyMode.CUBED_SPHERE_ADAPTER;
    }
    return ProductionTopologyMode.CYLINDRICAL;
  }

  function createProductionGrid(params, width, height, seedUint32) {
    if (params.productionTopologyMode === ProductionTopologyMode.CUBED_SPHERE_ADAPTER) {
      return createCubedSphereProductionGridAdapter({
        faceSize: params.faceSize,
        seedUint32,
      });
    }
    return createGrid(width, height);
  }

  function createExperimentalSphericalGrid(params) {
    if (params.topologyMode !== TopologyMode.CUBED_SPHERE) return null;
    return createCubedSphereGrid(params.faceSize);
  }

  function createExperimentalSphericalWorld(params, seedUint32) {
    if (params.topologyMode !== TopologyMode.CUBED_SPHERE) return null;
    return createSphericalExperimentalWorld({
      seedText: params.seedText,
      seedUint32,
      faceSize: params.faceSize,
      plateCount: params.plateCount,
      intensity: params.intensity,
      steps: 0,
    });
  }

  function normalizeFaceSize(faceSize, resolution) {
    const explicit = Number(faceSize);
    if (Number.isFinite(explicit) && explicit >= 2) return Math.trunc(explicit);
    const [width, height] = String(resolution ?? "512x256").split("x").map(Number);
    const base = Math.max(2, Math.min(width || 512, height || 256));
    return Math.max(2, Math.round(base / 2));
  }

  function analyzeWorld(world) {
    const { grid } = world;
    const { size, elev, btype, isContinental } = grid;
    const areaWeighted = isGraphBackedGrid(grid);
    let landArea = 0;
    let totalArea = 0;
    let convergentSum = 0;
    let convergentWeight = 0;
    let mountainConvergentSum = 0;
    let mountainConvergentWeight = 0;
    let divergentSum = 0;
    let divergentWeight = 0;
    let interiorSum = 0;
    let interiorWeight = 0;
    let continentalInteriorSum = 0;
    let continentalInteriorWeight = 0;
    let convergentCount = 0;
    let mountainConvergentCount = 0;
    let divergentCount = 0;
    let maxElev = -Infinity;

    for (let i = 0; i < size; i += 1) {
      const h = elev[i];
      const weight = areaWeighted ? grid.area?.[i] ?? 1 : 1;
      totalArea += weight;
      if (h >= world.seaLevel) landArea += weight;
      if (h > maxElev) maxElev = h;
      if (btype[i] === 1) {
        convergentSum += h * weight;
        convergentWeight += weight;
        convergentCount += 1;
        if (isContinental[i]) {
          mountainConvergentSum += h * weight;
          mountainConvergentWeight += weight;
          mountainConvergentCount += 1;
        }
      } else if (btype[i] === 2) {
        divergentSum += h * weight;
        divergentWeight += weight;
        divergentCount += 1;
      } else if (btype[i] === 0) {
        interiorSum += h * weight;
        interiorWeight += weight;
        if (isContinental[i]) {
          continentalInteriorSum += h * weight;
          continentalInteriorWeight += weight;
        }
      }
    }

    const avgConvergent = convergentWeight ? convergentSum / convergentWeight : 0;
    const avgMountainConvergent = mountainConvergentWeight ? mountainConvergentSum / mountainConvergentWeight : avgConvergent;
    const avgDivergent = divergentWeight ? divergentSum / divergentWeight : 0;
    const avgInterior = interiorWeight ? interiorSum / interiorWeight : 0;
    const avgContinentalInterior = continentalInteriorWeight ? continentalInteriorSum / continentalInteriorWeight : avgInterior;
    const avgPlateDrift = measurePlateDrift(world);
    const mountainDelta = avgMountainConvergent - avgContinentalInterior;
    const broadDelta = avgMountainConvergent - avgInterior;
    const landRatio = landArea / Math.max(totalArea, Number.EPSILON);
    return {
      landRatio,
      seaRatio: 1 - landRatio,
      avgConvergent,
      avgMountainConvergent,
      avgDivergent,
      avgInterior,
      avgContinentalInterior,
      maxElev,
      convergentCount,
      mountainConvergentCount,
      divergentCount,
      seaLevel: world.seaLevel,
      avgPlateDrift,
      causalityPass: mountainConvergentCount > 0 && (mountainDelta > 0.015 || broadDelta > 0.05),
    };
  }

  function isGraphBackedGrid(grid) {
    return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
  }

  function measurePlateDrift(world) {
    if (world.plates?.kind === "spherical-plates" && world.initialSphericalPlates) {
      return measureSphericalPlateDrift(world.initialSphericalPlates, world.plates);
    }
    if (!world.plates || !world.initialPlateCentersU || !world.initialPlateCentersV) return 0;
    let total = 0;
    for (let p = 0; p < world.plates.centersX.length; p += 1) {
      const duRaw = Math.abs(world.plates.centersU[p] - world.initialPlateCentersU[p]);
      const du = Math.min(duRaw, 1 - duRaw);
      const dv = world.plates.centersV[p] - world.initialPlateCentersV[p];
      total += Math.hypot(du * 512, dv * 256);
    }
    return total / world.plates.centersX.length;
  }

  function timeScaleFactor(years) {
    const value = Number(years);
    if (value <= 1) return 0.04;
    if (value <= 100) return 0.12;
    if (value <= 1000) return 0.35;
    if (value <= 10000) return 0.75;
    return 1.4;
  }


  // ---- src/sim/evolution.js ----

  function stepWorld(world) {
    const t0 = performance.now();
    if (world.params.pipelineMode === "geology-v2") {
      runGeologyV2Step(world);
    } else {
      runLegacyStep(world);
    }

    // Future phases plug in here: climateStep, hydrologyStep, biomeStep, resourceStep, impactStep.
    world.step += 1;
    world.ageYears += Number(world.params.timeScale);
    if (shouldStepSphericalDiagnosticSidecar(world)) {
      stepSphericalExperimentalWorld(world.sphericalWorld, 1);
    }
    world.stats = analyzeWorld(world);
    world.lastStepMs = performance.now() - t0;
    return world;
  }

  function shouldStepSphericalDiagnosticSidecar(world) {
    const sidecar = world.sphericalWorld;
    return world.params.topologyMode === "cubed-sphere"
      && sidecar?.kind === "spherical-experimental-world"
      && sidecar.role === "diagnostic-sidecar"
      && sidecar.authoritative === false
      && sidecar.writesProductionState === false;
  }


  // ---- src/gpu/capability.js ----
  const GpuRecommendedMode = {
    CPU: "cpu",
    WEBGL_RENDER_AVAILABLE: "webgl-render-available",
    WEBGPU_EXPERIMENTAL_AVAILABLE: "webgpu-experimental-available",
  };

  function detectGpuCapabilities(globalObject = globalThis) {
    try {
      const secureContext = detectSecureContext(globalObject);
      const webgpuAvailable = detectWebGpu(globalObject);
      const webgl2Available = detectWebGl2(globalObject);
      const recommended = recommendMode({ secureContext, webgpuAvailable, webgl2Available });
      return {
        secureContext,
        webgpuAvailable,
        webgl2Available,
        recommendedMode: recommended.mode,
        reason: recommended.reason,
      };
    } catch (error) {
      return {
        secureContext: false,
        webgpuAvailable: false,
        webgl2Available: false,
        recommendedMode: GpuRecommendedMode.CPU,
        reason: `GPU capability detection failed safely: ${error?.message ?? "unknown error"}`,
      };
    }
  }

  function detectSecureContext(globalObject) {
    if (typeof globalObject?.isSecureContext === "boolean") {
      return globalObject.isSecureContext;
    }
    const protocol = globalObject?.location?.protocol;
    const hostname = globalObject?.location?.hostname;
    if (protocol === "https:") return true;
    if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")) {
      return true;
    }
    return false;
  }

  function detectWebGpu(globalObject) {
    const navigatorObject = globalObject?.navigator;
    return Boolean(navigatorObject && "gpu" in navigatorObject);
  }

  function detectWebGl2(globalObject) {
    const documentObject = globalObject?.document;
    if (!documentObject?.createElement) return false;
    try {
      const canvas = documentObject.createElement("canvas");
      return Boolean(canvas?.getContext?.("webgl2"));
    } catch {
      return false;
    }
  }

  function recommendMode({ secureContext, webgpuAvailable, webgl2Available }) {
    if (secureContext && webgpuAvailable) {
      return {
        mode: GpuRecommendedMode.WEBGPU_EXPERIMENTAL_AVAILABLE,
        reason: "WebGPU is visible in a secure context; keep CPU as authoritative until kernels are validated.",
      };
    }
    if (webgl2Available) {
      return {
        mode: GpuRecommendedMode.WEBGL_RENDER_AVAILABLE,
        reason: webgpuAvailable
          ? "WebGPU is visible but the context is not secure; WebGL2 render experiments may still be available."
          : "WebGL2 is available for future render-only acceleration.",
      };
    }
    return {
      mode: GpuRecommendedMode.CPU,
      reason: webgpuAvailable
        ? "WebGPU is visible but unavailable as the default because this is not a secure context."
        : "No GPU acceleration path is available; CPU fallback remains authoritative.",
    };
  }


  // ---- src/gpu/kernels/isostasyKernel.js ----
  const ISOSTASY_WGSL = String.raw`
  struct Params {
    size: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> input0: array<vec4<f32>>;
  @group(0) @binding(2) var<storage, read> input1: array<vec4<f32>>;
  @group(0) @binding(3) var<storage, read> input2: array<vec4<f32>>;
  @group(0) @binding(4) var<storage, read_write> output0: array<vec4<f32>>;
  @group(0) @binding(5) var<storage, read_write> output1: array<vec4<f32>>;
  @group(0) @binding(6) var<storage, read_write> output2: array<vec4<f32>>;

  fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
  }

  fn smoothstep_local(edge0: f32, edge1: f32, value: f32) -> f32 {
    let t = clamp01((value - edge0) / max(0.000001, edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
  }

  fn saturating_fill(sediment: f32, fill_max: f32, fill_scale: f32) -> f32 {
    return fill_max * (1.0 - exp(-max(0.0, sediment) * fill_scale));
  }

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.size) {
      return;
    }

    let a = input0[i];
    let b = input1[i];
    let c = input2[i];

    let crust_type = u32(a.x + 0.5);
    let crust_thickness = a.y;
    let crust_age = a.z;
    let crust_density = a.w;
    let sediment = b.x;
    let sediment_load_subsidence = b.y;
    let ridge = b.z;
    let trench = b.w;
    let elev = c.x;

    let continental = crust_type == 1u;
    let transitional = crust_type == 2u;
    let oceanic = crust_type == 0u;
    let age_norm = clamp01(crust_age);
    let sediment_surface_fill = select(
      select(
        saturating_fill(sediment, 0.062, 1.7),
        saturating_fill(sediment, 0.08, 1.9),
        transitional
      ),
      saturating_fill(sediment, 0.03, 1.45),
      continental
    );
    let ridge_uplift = select(select(0.0, ridge * 0.06, oceanic), ridge * 0.018, transitional);
    let trench_depression = select(
      select(0.0, -trench * (0.075 + age_norm * 0.035), oceanic),
      -trench * 0.026,
      transitional
    );

    var base_elevation: f32;
    var thickness_norm: f32;
    var density_norm: f32;
    var buoyancy_scale: f32;
    var density_scale: f32;
    var cooling_scale: f32;
    if (continental) {
      base_elevation = 0.072;
      thickness_norm = smoothstep_local(0.0, 1.0, (crust_thickness - 0.42) / 0.58);
      density_norm = clamp01((crust_density - 0.38) / 0.22);
      buoyancy_scale = 0.105;
      density_scale = 0.018;
      cooling_scale = 0.002;
    } else if (transitional) {
      base_elevation = 0.018;
      thickness_norm = smoothstep_local(0.0, 1.0, (crust_thickness - 0.28) / 0.46);
      density_norm = clamp01((crust_density - 0.5) / 0.32);
      buoyancy_scale = 0.062;
      density_scale = 0.038;
      cooling_scale = 0.028;
    } else {
      base_elevation = -0.032;
      thickness_norm = smoothstep_local(0.0, 1.0, (crust_thickness - 0.12) / 0.3);
      density_norm = clamp01((crust_density - 0.62) / 0.24);
      buoyancy_scale = 0.034;
      density_scale = 0.05;
      cooling_scale = 0.106;
    }

    let crust_buoyancy = thickness_norm * buoyancy_scale;
    let density_subsidence = density_norm * density_scale;
    let lithosphere_cooling = select(select(0.03, 1.0, oceanic), 0.42, transitional) * sqrt(age_norm) * cooling_scale;
    let load = sediment_load_subsidence * select(select(0.3, 0.34, transitional), 0.18, continental);
    let sediment_load = load * (1.0 - clamp01(sediment) * 0.28);
    let isostatic_base =
      base_elevation +
      crust_buoyancy -
      density_subsidence -
      lithosphere_cooling -
      sediment_load +
      sediment_surface_fill;
    let age_subsidence = -lithosphere_cooling;
    let thickness_buoyancy = crust_buoyancy;
    let ocean_depth_terms =
      age_subsidence +
      thickness_buoyancy +
      sediment_surface_fill +
      ridge_uplift +
      trench_depression -
      density_subsidence -
      sediment_load;
    let isostatic_residual = elev - isostatic_base;
    let isostatic_relief_supply =
      abs(crust_buoyancy) +
      abs(density_subsidence) +
      abs(lithosphere_cooling) +
      abs(sediment_load);

    output0[i] = vec4<f32>(sediment_surface_fill, ridge_uplift, trench_depression, crust_buoyancy);
    output1[i] = vec4<f32>(density_subsidence, lithosphere_cooling, isostatic_base, age_subsidence);
    output2[i] = vec4<f32>(thickness_buoyancy, ocean_depth_terms, isostatic_residual, isostatic_relief_supply);
  }
  `;


  // ---- src/gpu/isostasyCompute.js ----

  const GPU_ISOSTASY_OUTPUT_FIELDS = [
    "sedimentFill",
    "ridgeUplift",
    "trenchDepression",
    "crustBuoyancy",
    "densitySubsidence",
    "lithosphereCooling",
    "isostaticBase",
    "ageSubsidence",
    "thicknessBuoyancy",
    "oceanDepthTerms",
    "isostaticResidual",
    "isostaticReliefSupply",
  ];

  const GPU_ISOSTASY_OUTPUT_PACKS = [
    {
      index: 0,
      fields: ["sedimentFill", "ridgeUplift", "trenchDepression", "crustBuoyancy"],
    },
    {
      index: 1,
      fields: ["densitySubsidence", "lithosphereCooling", "isostaticBase", "ageSubsidence"],
    },
    {
      index: 2,
      fields: ["thicknessBuoyancy", "oceanDepthTerms", "isostaticResidual", "isostaticReliefSupply"],
    },
  ];

  const isostasyContextCache = new WeakMap();

  async function runWebGpuIsostasyCandidate(world, options = {}) {
    const globalObject = options.globalObject ?? globalThis;
    const capabilities = detectGpuCapabilities(globalObject);
    const requestedFields = normalizeRequestedFields(options.fields ?? options.requestedFields, GPU_ISOSTASY_OUTPUT_FIELDS);
    if (!requestedFields.length) {
      return skippedResult(capabilities, "No WebGPU isostasy output fields were requested.");
    }
    const gpu = globalObject?.navigator?.gpu;
    if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
      return skippedResult(capabilities, "WebGPU is not available in this environment.");
    }

    let context;
    try {
      context = await getIsostasyGpuContext(globalObject, gpu);
    } catch (error) {
      return skippedResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
    }

    try {
      return await computeIsostasyOnDevice(world, context, capabilities, requestedFields);
    } catch (error) {
      return {
        skipped: true,
        valid: true,
        backend: "webgpu-isostasy",
        gpuCapabilities: capabilities,
        adapterInfo: context?.adapterInfo ?? null,
        deviceInfo: context?.deviceInfo ?? null,
        reason: `WebGPU isostasy candidate failed safely: ${error?.message ?? "unknown error"}`,
        timings: emptyTimings(),
        fields: {},
      };
    }
  }

  async function getIsostasyGpuContext(globalObject, gpu) {
    const cached = isostasyContextCache.get(globalObject);
    if (cached?.device && cached?.pipeline) {
      cached.reused = true;
      return cached;
    }

    const setupStartedAt = performance.now();
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU adapter request returned null.");
    }
    const adapterInfo = await collectAdapterInfo(adapter);
    const device = await adapter.requestDevice();
    const deviceInfo = collectDeviceInfo(device);
    const shaderModule = device.createShaderModule({ code: ISOSTASY_WGSL });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });
    const context = {
      device,
      pipeline,
      adapterInfo,
      deviceInfo,
      setupMs: performance.now() - setupStartedAt,
      reused: false,
    };
    device.lost?.then?.(() => {
      if (isostasyContextCache.get(globalObject) === context) {
        isostasyContextCache.delete(globalObject);
      }
    });
    isostasyContextCache.set(globalObject, context);
    return context;
  }

  async function computeIsostasyOnDevice(world, context, capabilities, requestedFields) {
    const { device, pipeline } = context;
    const { grid } = world;
    const size = grid.size;
    const requestedSet = new Set(requestedFields);
    const requestedPacks = GPU_ISOSTASY_OUTPUT_PACKS.filter((pack) =>
      pack.fields.some((fieldName) => requestedSet.has(fieldName)),
    );
    const input0 = new Float32Array(size * 4);
    const input1 = new Float32Array(size * 4);
    const input2 = new Float32Array(size * 4);

    const uploadStartedAt = performance.now();
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      input0[offset] = grid.crustType[i];
      input0[offset + 1] = grid.crustThickness[i];
      input0[offset + 2] = grid.crustAge[i];
      input0[offset + 3] = grid.crustDensity[i];
      input1[offset] = grid.sediment[i];
      input1[offset + 1] = grid.sedimentLoadSubsidence[i];
      input1[offset + 2] = grid.ridge[i];
      input1[offset + 3] = grid.trench[i];
      input2[offset] = grid.elev[i];
    }

    const usage = globalThis.GPUBufferUsage;
    const mapMode = globalThis.GPUMapMode;
    if (!usage || !mapMode) {
      return skippedResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
    }

    const paramData = new Uint32Array([size, 0, 0, 0]);
    const paramBuffer = createBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
    const inputBuffer0 = createBufferWithData(device, input0, usage.STORAGE | usage.COPY_DST);
    const inputBuffer1 = createBufferWithData(device, input1, usage.STORAGE | usage.COPY_DST);
    const inputBuffer2 = createBufferWithData(device, input2, usage.STORAGE | usage.COPY_DST);
    const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
    const outputBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const outputBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const outputBuffer2 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const outputBuffers = [outputBuffer0, outputBuffer1, outputBuffer2];
    const readBuffers = [null, null, null];
    for (const pack of requestedPacks) {
      readBuffers[pack.index] = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
    }
    const uploadMs = performance.now() - uploadStartedAt;

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramBuffer } },
        { binding: 1, resource: { buffer: inputBuffer0 } },
        { binding: 2, resource: { buffer: inputBuffer1 } },
        { binding: 3, resource: { buffer: inputBuffer2 } },
        { binding: 4, resource: { buffer: outputBuffer0 } },
        { binding: 5, resource: { buffer: outputBuffer1 } },
        { binding: 6, resource: { buffer: outputBuffer2 } },
      ],
    });

    const kernelStartedAt = performance.now();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(size / 64));
    pass.end();
    for (const pack of requestedPacks) {
      encoder.copyBufferToBuffer(outputBuffers[pack.index], 0, readBuffers[pack.index], 0, outputBytes);
    }
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const kernelMs = performance.now() - kernelStartedAt;

    const downloadStartedAt = performance.now();
    await Promise.all(readBuffers.filter(Boolean).map((buffer) => buffer.mapAsync(mapMode.READ)));
    const packed = [null, null, null];
    for (const pack of requestedPacks) {
      const readBuffer = readBuffers[pack.index];
      packed[pack.index] = new Float32Array(readBuffer.getMappedRange().slice(0));
      readBuffer.unmap();
    }
    const downloadMs = performance.now() - downloadStartedAt;

    const fields = unpackIsostasyFields(size, packed[0], packed[1], packed[2], requestedFields);
    destroyBuffers([
      paramBuffer,
      inputBuffer0,
      inputBuffer1,
      inputBuffer2,
      outputBuffer0,
      outputBuffer1,
      outputBuffer2,
      ...readBuffers,
    ]);

    return {
      skipped: false,
      valid: true,
      backend: "webgpu-isostasy",
      gpuCapabilities: capabilities,
      adapterInfo: context.adapterInfo ?? null,
      deviceInfo: context.deviceInfo ?? null,
      reason: null,
      timings: {
        setupMs: context.reused ? 0 : context.setupMs,
        uploadMs,
        kernelMs,
        downloadMs,
        totalGpuPathMs: uploadMs + kernelMs + downloadMs,
        totalCandidateMs: (context.reused ? 0 : context.setupMs) + uploadMs + kernelMs + downloadMs,
      },
      requestedFields,
      downloadedPacks: requestedPacks.map((pack) => pack.index),
      reusedContext: context.reused,
      fields,
    };
  }

  async function collectAdapterInfo(adapter) {
    try {
      const rawInfo =
        adapter?.info ??
        (typeof adapter?.requestAdapterInfo === "function" ? await adapter.requestAdapterInfo() : null);
      const info = {};
      for (const key of [
        "vendor",
        "architecture",
        "device",
        "description",
        "subgroupMinSize",
        "subgroupMaxSize",
      ]) {
        const value = rawInfo?.[key];
        if (value !== undefined && value !== "") info[key] = value;
      }
      if (typeof adapter?.isFallbackAdapter === "boolean") {
        info.isFallbackAdapter = adapter.isFallbackAdapter;
      }
      return Object.keys(info).length ? info : null;
    } catch (error) {
      return {
        unavailableReason: `GPU adapter info unavailable: ${error?.message ?? "unknown error"}`,
      };
    }
  }

  function collectDeviceInfo(device) {
    try {
      return {
        features: [...(device?.features ?? [])].sort(),
        limits: pickDeviceLimits(device?.limits),
      };
    } catch (error) {
      return {
        unavailableReason: `GPU device info unavailable: ${error?.message ?? "unknown error"}`,
      };
    }
  }

  function pickDeviceLimits(limits) {
    if (!limits) return {};
    const keys = [
      "maxBindGroups",
      "maxBufferSize",
      "maxComputeInvocationsPerWorkgroup",
      "maxComputeWorkgroupSizeX",
      "maxStorageBufferBindingSize",
    ];
    const picked = {};
    for (const key of keys) {
      const value = limits[key];
      if (Number.isFinite(value)) picked[key] = value;
    }
    return picked;
  }

  function createBufferWithData(device, typedArray, usage) {
    const buffer = device.createBuffer({
      size: typedArray.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
    buffer.unmap();
    return buffer;
  }

  function unpackIsostasyFields(size, packed0, packed1, packed2, requestedFields) {
    const fields = {};
    for (const name of requestedFields) {
      fields[name] = new Float32Array(size);
    }
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      if (packed0) {
        if (fields.sedimentFill) fields.sedimentFill[i] = packed0[offset];
        if (fields.ridgeUplift) fields.ridgeUplift[i] = packed0[offset + 1];
        if (fields.trenchDepression) fields.trenchDepression[i] = packed0[offset + 2];
        if (fields.crustBuoyancy) fields.crustBuoyancy[i] = packed0[offset + 3];
      }
      if (packed1) {
        if (fields.densitySubsidence) fields.densitySubsidence[i] = packed1[offset];
        if (fields.lithosphereCooling) fields.lithosphereCooling[i] = packed1[offset + 1];
        if (fields.isostaticBase) fields.isostaticBase[i] = packed1[offset + 2];
        if (fields.ageSubsidence) fields.ageSubsidence[i] = packed1[offset + 3];
      }
      if (packed2) {
        if (fields.thicknessBuoyancy) fields.thicknessBuoyancy[i] = packed2[offset];
        if (fields.oceanDepthTerms) fields.oceanDepthTerms[i] = packed2[offset + 1];
        if (fields.isostaticResidual) fields.isostaticResidual[i] = packed2[offset + 2];
        if (fields.isostaticReliefSupply) fields.isostaticReliefSupply[i] = packed2[offset + 3];
      }
    }
    return fields;
  }

  function destroyBuffers(buffers) {
    for (const buffer of buffers) {
      buffer?.destroy?.();
    }
  }

  function normalizeRequestedFields(value, fallback) {
    const available = new Set(GPU_ISOSTASY_OUTPUT_FIELDS);
    const raw =
      value === undefined || value === null || value === ""
        ? fallback
        : Array.isArray(value)
          ? value
          : String(value).split(",");
    const fields = [];
    const seen = new Set();
    for (const part of raw) {
      const fieldName = String(part).trim();
      if (!available.has(fieldName) || seen.has(fieldName)) continue;
      seen.add(fieldName);
      fields.push(fieldName);
    }
    return fields;
  }

  function skippedResult(capabilities, reason) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-isostasy",
      gpuCapabilities: capabilities,
      reason,
      timings: emptyTimings(),
      fields: {},
    };
  }

  function emptyTimings() {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }


  // ---- src/gpu/kernels/elevationKernel.js ----
  const ELEVATION_WGSL = String.raw`
  struct Params {
    size: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> inputPacked: array<vec4<f32>>;
  @group(0) @binding(2) var<storage, read_write> output0: array<vec4<f32>>;

  fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
  }

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.size) {
      return;
    }

    let offset = i * 8u;
    let a = inputPacked[offset];
    let b = inputPacked[offset + 1u];
    let c = inputPacked[offset + 2u];
    let d = inputPacked[offset + 3u];
    let e = inputPacked[offset + 4u];
    let f = inputPacked[offset + 5u];
    let g = inputPacked[offset + 6u];
    let h = inputPacked[offset + 7u];

    let crust_type = u32(a.x + 0.5);
    let orogeny = a.y;
    let active_orogeny = a.z;
    let old_orogeny = a.w;
    let orogeny_age = b.x;
    let sediment = b.y;
    let sediment_load_subsidence = b.z;
    let sediment_fill = b.w;
    let ridge_uplift = c.x;
    let trench_depression = c.y;
    let isostatic_base = c.z;
    let passive_margin = c.w;
    let continental_shelf = d.x;
    let continental_slope = d.y;
    let continental_rise = d.z;
    let abyssal_plain = d.w;
    let sediment_wedge = e.x;
    let foreland_basin = e.y;
    let active_transform = e.z;
    let transform_memory = e.w;
    let fracture_zone_memory = f.x;
    let inactive_boundary_relief = f.y;
    let geology_broad_noise = f.z;
    let geology_micro_noise = f.w;
    let mountain_belt = g.x;
    let trench = g.y;
    let ridge = g.z;
    let rift = g.w;
    let island_arc = h.x;
    let basin = h.y;

    let continental = crust_type == 1u;
    let transitional = crust_type == 2u;

    let age_reduction = 0.35 + clamp01(orogeny_age) * 0.55;
    let old_orogen_relief = old_orogeny * select(select(0.004, 0.035, transitional), 0.075, continental) * (1.0 - age_reduction * 0.62);
    let root_relief = orogeny * select(select(0.004, 0.032, transitional), 0.105, continental);
    let foreland_subsidence = foreland_basin * select(select(0.002, 0.018, transitional), 0.026, continental);
    let load_subsidence = sediment_load_subsidence * select(select(0.07, 0.08, transitional), 0.06, continental);
    let long_term =
      root_relief +
      old_orogen_relief +
      sediment_fill * 0.36 -
      basin * select(0.018, 0.002, transitional) -
      foreland_subsidence -
      load_subsidence;
    let active_feature =
      mountain_belt * 0.15 +
      active_orogeny * select(select(0.006, 0.024, transitional), 0.055, continental) -
      select(-trench_depression, trench * 0.105, continental) +
      select(ridge_uplift, ridge * 0.048, continental) -
      rift * 0.055 +
      island_arc * 0.06 -
      basin * 0.025;

    let roughness_damp = max(0.0, 1.0 - abyssal_plain * 0.58 - passive_margin * 0.12);
    let margin_elevation =
      continental_shelf * 0.018 +
      continental_rise * 0.015 +
      sediment_wedge * 0.012 -
      continental_slope * 0.012 -
      abyssal_plain * 0.006;
    let transform_active_relief =
      active_transform *
      select(select(0.006, 0.008, transitional), 0.012, continental) *
      (0.45 + abs(geology_micro_noise));
    let inactive_transform_penalty = select(
      max(0.0, transform_memory * 0.003 + fracture_zone_memory * 0.005 + inactive_boundary_relief * 0.006) *
        (0.4 + abyssal_plain + sediment),
      0.0,
      continental
    );

    let base_elev =
      isostatic_base +
      geology_broad_noise * select(select(0.009, 0.014, transitional), 0.018, continental) * roughness_damp +
      geology_micro_noise * select(select(0.006, 0.008, transitional), 0.011, continental) * roughness_damp;
    let relief = long_term;
    let boundary_relief = active_feature + margin_elevation + transform_active_relief - inactive_transform_penalty;
    let elev = base_elev + relief + boundary_relief;
    let is_continental = select(0.0, 1.0, continental);

    output0[i] = vec4<f32>(base_elev, relief, boundary_relief, elev + is_continental * 0.0);
  }
  `;


  // ---- src/gpu/elevationCompute.js ----

  const GPU_ELEVATION_OUTPUT_FIELDS = [
    "baseElev",
    "relief",
    "boundaryRelief",
    "elev",
  ];

  async function runWebGpuElevationCandidate(world, options = {}) {
    const candidateStartedAt = performance.now();
    const globalObject = options.globalObject ?? globalThis;
    const capabilities = detectGpuCapabilities(globalObject);
    const gpu = globalObject?.navigator?.gpu;
    if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
      return skippedElevationResult(capabilities, "WebGPU is not available in this environment.");
    }

    let adapter;
    let device;
    try {
      adapter = await gpu.requestAdapter();
      if (!adapter) {
        return skippedElevationResult(capabilities, "WebGPU adapter request returned null.");
      }
      device = await adapter.requestDevice();
    } catch (error) {
      return skippedElevationResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
    }

    try {
      return withCandidateTiming(await computeElevationOnDevice(world, device, capabilities), candidateStartedAt);
    } catch (error) {
      return {
        skipped: true,
        valid: true,
        backend: "webgpu-elevation",
        gpuCapabilities: capabilities,
        reason: `WebGPU elevation candidate failed safely: ${error?.message ?? "unknown error"}`,
        timings: emptyElevationTimings(),
        fields: {},
      };
    } finally {
      device?.destroy?.();
    }
  }

  function withCandidateTiming(result, candidateStartedAt) {
    if (!result || result.skipped) return result;
    const totalCandidateMs = performance.now() - candidateStartedAt;
    const totalGpuPathMs = Number(result.timings?.totalGpuPathMs);
    return {
      ...result,
      timings: {
        ...result.timings,
        setupMs: Number.isFinite(totalGpuPathMs) ? Math.max(0, totalCandidateMs - totalGpuPathMs) : null,
        totalCandidateMs,
      },
    };
  }

  async function computeElevationOnDevice(world, device, capabilities) {
    const { grid } = world;
    const size = grid.size;
    const inputPacked = new Float32Array(size * 8 * 4);

    const uploadStartedAt = performance.now();
    for (let i = 0; i < size; i += 1) {
      const offset = i * 8 * 4;
      inputPacked[offset] = grid.crustType[i];
      inputPacked[offset + 1] = grid.orogeny[i];
      inputPacked[offset + 2] = grid.activeOrogeny?.[i] ?? 0;
      inputPacked[offset + 3] = grid.oldOrogeny?.[i] ?? 0;
      inputPacked[offset + 4] = grid.orogenyAge?.[i] ?? 0;
      inputPacked[offset + 5] = grid.sediment[i];
      inputPacked[offset + 6] = grid.sedimentLoadSubsidence?.[i] ?? 0;
      inputPacked[offset + 7] = grid.sedimentFill[i];
      inputPacked[offset + 8] = grid.ridgeUplift[i];
      inputPacked[offset + 9] = grid.trenchDepression[i];
      inputPacked[offset + 10] = grid.isostaticBase[i];
      inputPacked[offset + 11] = grid.passiveMargin?.[i] ?? 0;
      inputPacked[offset + 12] = grid.continentalShelf?.[i] ?? 0;
      inputPacked[offset + 13] = grid.continentalSlope?.[i] ?? 0;
      inputPacked[offset + 14] = grid.continentalRise?.[i] ?? 0;
      inputPacked[offset + 15] = grid.abyssalPlain?.[i] ?? 0;
      inputPacked[offset + 16] = grid.sedimentWedge?.[i] ?? 0;
      inputPacked[offset + 17] = grid.forelandBasin?.[i] ?? 0;
      inputPacked[offset + 18] = grid.activeTransform?.[i] ?? 0;
      inputPacked[offset + 19] = grid.transformMemory?.[i] ?? 0;
      inputPacked[offset + 20] = grid.fractureZoneMemory?.[i] ?? 0;
      inputPacked[offset + 21] = grid.inactiveBoundaryRelief?.[i] ?? 0;
      inputPacked[offset + 22] = grid.geologyBroadNoise[i];
      inputPacked[offset + 23] = grid.geologyMicroNoise[i];
      inputPacked[offset + 24] = grid.mountainBelt[i];
      inputPacked[offset + 25] = grid.trench[i];
      inputPacked[offset + 26] = grid.ridge[i];
      inputPacked[offset + 27] = grid.rift[i];
      inputPacked[offset + 28] = grid.islandArc[i];
      inputPacked[offset + 29] = grid.basin[i];
    }

    const usage = globalThis.GPUBufferUsage;
    const mapMode = globalThis.GPUMapMode;
    if (!usage || !mapMode) {
      return skippedElevationResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
    }

    const paramData = new Uint32Array([size, 0, 0, 0]);
    const paramBuffer = createElevationBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
    const inputBuffer = createElevationBufferWithData(device, inputPacked, usage.STORAGE | usage.COPY_DST);
    const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
    const outputBuffer = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const readBuffer = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
    const uploadMs = performance.now() - uploadStartedAt;

    const shaderModule = device.createShaderModule({ code: ELEVATION_WGSL });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    });

    const kernelStartedAt = performance.now();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(size / 64));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBytes);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const kernelMs = performance.now() - kernelStartedAt;

    const downloadStartedAt = performance.now();
    await readBuffer.mapAsync(mapMode.READ);
    const packed = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    const downloadMs = performance.now() - downloadStartedAt;

    const fields = unpackElevationFields(size, packed);
    destroyElevationBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);

    return {
      skipped: false,
      valid: true,
      backend: "webgpu-elevation",
      gpuCapabilities: capabilities,
      reason: null,
      timings: {
        uploadMs,
        kernelMs,
        downloadMs,
        totalGpuPathMs: uploadMs + kernelMs + downloadMs,
      },
      fields,
    };
  }

  function createElevationBufferWithData(device, typedArray, usage) {
    const buffer = device.createBuffer({
      size: typedArray.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
    buffer.unmap();
    return buffer;
  }

  function unpackElevationFields(size, packed) {
    const fields = {};
    for (const name of GPU_ELEVATION_OUTPUT_FIELDS) {
      fields[name] = new Float32Array(size);
    }
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      fields.baseElev[i] = packed[offset];
      fields.relief[i] = packed[offset + 1];
      fields.boundaryRelief[i] = packed[offset + 2];
      fields.elev[i] = packed[offset + 3];
    }
    return fields;
  }

  function destroyElevationBuffers(buffers) {
    for (const buffer of buffers) {
      buffer?.destroy?.();
    }
  }

  function skippedElevationResult(capabilities, reason) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-elevation",
      gpuCapabilities: capabilities,
      reason,
      timings: emptyElevationTimings(),
      fields: {},
    };
  }

  function emptyElevationTimings() {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }


  // ---- src/gpu/kernels/localFieldsKernel.js ----
  const LOCAL_FIELDS_WGSL = String.raw`
  struct Params {
    size: u32,
    width: u32,
    height: u32,
    _pad0: u32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> packed: array<vec4<f32>>;
  @group(0) @binding(2) var<storage, read_write> output0: array<vec4<f32>>;

  fn field_at(id: u32) -> f32 {
    return packed[id].x;
  }

  fn index_of(x: i32, y: i32) -> i32 {
    if (y < 0 || y >= i32(params.height)) {
      return -1;
    }
    let width = i32(params.width);
    let wrapped_x = ((x % width) + width) % width;
    let id = y * width + wrapped_x;
    if (id < 0 || id >= i32(params.size)) {
      return -1;
    }
    return id;
  }

  fn finite_sample(x: i32, y: i32, fallback: f32) -> f32 {
    let id = index_of(x, y);
    if (id < 0) {
      return fallback;
    }
    let value = field_at(u32(id));
    if (value != value || abs(value) > 3.3e38) {
      return fallback;
    }
    return value;
  }

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.size) {
      return;
    }

    let width = params.width;
    let x = i32(i % width);
    let y = i32(i / width);
    let center = field_at(i);

    let left = finite_sample(x - 1, y, center);
    let right = finite_sample(x + 1, y, center);
    let up = finite_sample(x, y - 1, center);
    let down = finite_sample(x, y + 1, center);
    let dx = (right - left) * 0.5;
    let dy = (down - up) * 0.5;
    let slope = sqrt(dx * dx + dy * dy);
    let aspect = atan2(dy, dx);

    var sum = 0.0;
    var count = 0.0;
    let west = index_of(x - 1, y);
    if (west >= 0) {
      sum += abs(center - field_at(u32(west)));
      count += 1.0;
    }
    let east = index_of(x + 1, y);
    if (east >= 0) {
      sum += abs(center - field_at(u32(east)));
      count += 1.0;
    }
    let north = index_of(x, y - 1);
    if (north >= 0) {
      sum += abs(center - field_at(u32(north)));
      count += 1.0;
    }
    let south = index_of(x, y + 1);
    if (south >= 0) {
      sum += abs(center - field_at(u32(south)));
      count += 1.0;
    }
    let ruggedness = select(0.0, sum / count, count > 0.0);
    let local_relief = max(max(abs(center - left), abs(center - right)), max(abs(center - up), abs(center - down)));

    output0[i] = vec4<f32>(slope, aspect, ruggedness, local_relief);
  }
  `;


  // ---- src/gpu/localFieldsCompute.js ----

  const GPU_LOCAL_FIELDS_OUTPUT_FIELDS = [
    "slope",
    "aspect",
    "ruggedness",
    "localRelief",
  ];

  async function runWebGpuLocalFieldsCandidate(world, options = {}) {
    const candidateStartedAt = performance.now();
    const globalObject = options.globalObject ?? globalThis;
    const capabilities = detectGpuCapabilities(globalObject);
    const gpu = globalObject?.navigator?.gpu;
    if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
      return skippedLocalFieldsResult(capabilities, "WebGPU local fields candidate currently supports rectangular grids only.");
    }
    if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
      return skippedLocalFieldsResult(capabilities, "WebGPU is not available in this environment.");
    }

    let adapter;
    let device;
    try {
      adapter = await gpu.requestAdapter();
      if (!adapter) {
        return skippedLocalFieldsResult(capabilities, "WebGPU adapter request returned null.");
      }
      device = await adapter.requestDevice();
    } catch (error) {
      return skippedLocalFieldsResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
    }

    try {
      return withCandidateTiming(await computeLocalFieldsOnDevice(world, device, capabilities), candidateStartedAt);
    } catch (error) {
      return {
        skipped: true,
        valid: true,
        backend: "webgpu-local-fields",
        gpuCapabilities: capabilities,
        reason: `WebGPU local fields candidate failed safely: ${error?.message ?? "unknown error"}`,
        timings: emptyLocalFieldsTimings(),
        fields: {},
      };
    } finally {
      device?.destroy?.();
    }
  }

  function withCandidateTiming(result, candidateStartedAt) {
    if (!result || result.skipped) return result;
    const totalCandidateMs = performance.now() - candidateStartedAt;
    const totalGpuPathMs = Number(result.timings?.totalGpuPathMs);
    return {
      ...result,
      timings: {
        ...result.timings,
        setupMs: Number.isFinite(totalGpuPathMs) ? Math.max(0, totalCandidateMs - totalGpuPathMs) : null,
        totalCandidateMs,
      },
    };
  }

  async function computeLocalFieldsOnDevice(world, device, capabilities) {
    const { grid, seaLevel } = world;
    const size = grid.size;
    const width = grid.width;
    const height = grid.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height !== size) {
      return skippedLocalFieldsResult(capabilities, "World grid is not a rectangular width x height layout.");
    }

    const uploadStartedAt = performance.now();
    const relativeElevation = new Float32Array(size * 4);
    for (let i = 0; i < size; i += 1) {
      relativeElevation[i * 4] = grid.elev[i] - seaLevel;
    }

    const usage = globalThis.GPUBufferUsage;
    const mapMode = globalThis.GPUMapMode;
    if (!usage || !mapMode) {
      return skippedLocalFieldsResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
    }

    const paramData = new Uint32Array([size, width, height, 0]);
    const paramBuffer = createBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
    const inputBuffer = createBufferWithData(device, relativeElevation, usage.STORAGE | usage.COPY_DST);
    const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
    const outputBuffer = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const readBuffer = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
    const uploadMs = performance.now() - uploadStartedAt;

    device.pushErrorScope?.("validation");
    const shaderModule = device.createShaderModule({ code: LOCAL_FIELDS_WGSL });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });
    const pipelineError = await device.popErrorScope?.();
    if (pipelineError) {
      destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
      return skippedLocalFieldsResult(capabilities, `WebGPU local fields pipeline validation failed: ${pipelineError.message ?? pipelineError}`);
    }

    device.pushErrorScope?.("validation");
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    });
    const bindGroupError = await device.popErrorScope?.();
    if (bindGroupError) {
      destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
      return skippedLocalFieldsResult(capabilities, `WebGPU local fields bind group validation failed: ${bindGroupError.message ?? bindGroupError}`);
    }

    const kernelStartedAt = performance.now();
    device.pushErrorScope?.("validation");
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(size / 64));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBytes);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const dispatchError = await device.popErrorScope?.();
    if (dispatchError) {
      destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
      return skippedLocalFieldsResult(capabilities, `WebGPU local fields dispatch validation failed: ${dispatchError.message ?? dispatchError}`);
    }
    const kernelMs = performance.now() - kernelStartedAt;

    const downloadStartedAt = performance.now();
    await readBuffer.mapAsync(mapMode.READ);
    const packed = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    const downloadMs = performance.now() - downloadStartedAt;

    const fields = unpackLocalFields(size, packed);
    destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);

    return {
      skipped: false,
      valid: true,
      backend: "webgpu-local-fields",
      gpuCapabilities: capabilities,
      reason: null,
      timings: {
        uploadMs,
        kernelMs,
        downloadMs,
        totalGpuPathMs: uploadMs + kernelMs + downloadMs,
      },
      fields,
    };
  }

  function createBufferWithData(device, typedArray, usage) {
    const buffer = device.createBuffer({
      size: typedArray.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
    buffer.unmap();
    return buffer;
  }

  function unpackLocalFields(size, packed) {
    const fields = {};
    for (const name of GPU_LOCAL_FIELDS_OUTPUT_FIELDS) {
      fields[name] = new Float32Array(size);
    }
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      fields.slope[i] = packed[offset];
      fields.aspect[i] = packed[offset + 1];
      fields.ruggedness[i] = packed[offset + 2];
      fields.localRelief[i] = packed[offset + 3];
    }
    return fields;
  }

  function destroyBuffers(buffers) {
    for (const buffer of buffers) {
      buffer?.destroy?.();
    }
  }

  function skippedLocalFieldsResult(capabilities, reason) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-local-fields",
      gpuCapabilities: capabilities,
      reason,
      timings: emptyLocalFieldsTimings(),
      fields: {},
    };
  }

  function emptyLocalFieldsTimings() {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }


  // ---- src/gpu/kernels/marginSmoothKernel.js ----
  const MARGIN_SMOOTH_WGSL = String.raw`
  struct Params {
    size: u32,
    width: u32,
    height: u32,
    _pad0: u32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> input0: array<vec4<f32>>;
  @group(0) @binding(2) var<storage, read> input1: array<vec4<f32>>;
  @group(0) @binding(3) var<storage, read_write> output0: array<vec4<f32>>;
  @group(0) @binding(4) var<storage, read_write> output1: array<vec4<f32>>;

  fn index_of(x: i32, y: i32) -> i32 {
    if (y < 0 || y >= i32(params.height)) {
      return -1;
    }
    let width = i32(params.width);
    let wrapped_x = ((x % width) + width) % width;
    let id = y * width + wrapped_x;
    if (id < 0 || id >= i32(params.size)) {
      return -1;
    }
    return id;
  }

  fn smooth_vec4(center: vec4<f32>, x: i32, y: i32, source: ptr<storage, array<vec4<f32>>, read>) -> vec4<f32> {
    var total = center * 2.5;
    var weight = 2.5;
    let west = index_of(x - 1, y);
    if (west >= 0) {
      total += (*source)[u32(west)];
      weight += 1.0;
    }
    let east = index_of(x + 1, y);
    if (east >= 0) {
      total += (*source)[u32(east)];
      weight += 1.0;
    }
    let north = index_of(x, y - 1);
    if (north >= 0) {
      total += (*source)[u32(north)];
      weight += 1.0;
    }
    let south = index_of(x, y + 1);
    if (south >= 0) {
      total += (*source)[u32(south)];
      weight += 1.0;
    }
    return clamp(total / weight, vec4<f32>(0.0), vec4<f32>(1.0));
  }

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.size) {
      return;
    }

    let width = params.width;
    let x = i32(i % width);
    let y = i32(i / width);

    let a = input0[i];
    let b = input1[i];
    output0[i] = smooth_vec4(a, x, y, &input0);
    output1[i] = smooth_vec4(b, x, y, &input1);
  }
  `;


  // ---- src/gpu/marginSmoothCompute.js ----

  const GPU_MARGIN_SMOOTH_OUTPUT_FIELDS = [
    "passiveMargin",
    "continentalShelf",
    "continentalSlope",
    "continentalRise",
    "sedimentWedge",
    "abyssalPlain",
  ];

  async function runWebGpuMarginSmoothCandidate(world, options = {}) {
    const candidateStartedAt = performance.now();
    const globalObject = options.globalObject ?? globalThis;
    const capabilities = detectGpuCapabilities(globalObject);
    const gpu = globalObject?.navigator?.gpu;
    if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
      return skippedMarginSmoothResult(capabilities, "WebGPU margin smoothing candidate currently supports rectangular grids only.");
    }
    if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
      return skippedMarginSmoothResult(capabilities, "WebGPU is not available in this environment.");
    }

    let adapter;
    let device;
    try {
      adapter = await gpu.requestAdapter();
      if (!adapter) {
        return skippedMarginSmoothResult(capabilities, "WebGPU adapter request returned null.");
      }
      device = await adapter.requestDevice();
    } catch (error) {
      return skippedMarginSmoothResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
    }

    try {
      return withCandidateTiming(await computeMarginSmoothOnDevice(world, device, capabilities), candidateStartedAt);
    } catch (error) {
      return {
        skipped: true,
        valid: true,
        backend: "webgpu-margin-smooth",
        gpuCapabilities: capabilities,
        reason: `WebGPU margin smoothing candidate failed safely: ${error?.message ?? "unknown error"}`,
        timings: emptyMarginSmoothTimings(),
        fields: {},
      };
    } finally {
      device?.destroy?.();
    }
  }

  function withCandidateTiming(result, candidateStartedAt) {
    if (!result || result.skipped) return result;
    const totalCandidateMs = performance.now() - candidateStartedAt;
    const totalGpuPathMs = Number(result.timings?.totalGpuPathMs);
    return {
      ...result,
      timings: {
        ...result.timings,
        setupMs: Number.isFinite(totalGpuPathMs) ? Math.max(0, totalCandidateMs - totalGpuPathMs) : null,
        totalCandidateMs,
      },
    };
  }

  async function computeMarginSmoothOnDevice(world, device, capabilities) {
    const { grid } = world;
    const size = grid.size;
    const width = grid.width;
    const height = grid.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height !== size) {
      return skippedMarginSmoothResult(capabilities, "World grid is not a rectangular width x height layout.");
    }

    const uploadStartedAt = performance.now();
    const input0 = new Float32Array(size * 4);
    const input1 = new Float32Array(size * 4);
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      input0[offset] = grid.passiveMargin?.[i] ?? 0;
      input0[offset + 1] = grid.continentalShelf?.[i] ?? 0;
      input0[offset + 2] = grid.continentalSlope?.[i] ?? 0;
      input0[offset + 3] = grid.continentalRise?.[i] ?? 0;
      input1[offset] = grid.sedimentWedge?.[i] ?? 0;
      input1[offset + 1] = grid.abyssalPlain?.[i] ?? 0;
    }

    const usage = globalThis.GPUBufferUsage;
    const mapMode = globalThis.GPUMapMode;
    if (!usage || !mapMode) {
      return skippedMarginSmoothResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
    }

    const paramData = new Uint32Array([size, width, height, 0]);
    const paramBuffer = createBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
    const inputBuffer0 = createBufferWithData(device, input0, usage.STORAGE | usage.COPY_DST);
    const inputBuffer1 = createBufferWithData(device, input1, usage.STORAGE | usage.COPY_DST);
    const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
    const outputBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const outputBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const readBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
    const readBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
    const uploadMs = performance.now() - uploadStartedAt;

    const shaderModule = device.createShaderModule({ code: MARGIN_SMOOTH_WGSL });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramBuffer } },
        { binding: 1, resource: { buffer: inputBuffer0 } },
        { binding: 2, resource: { buffer: inputBuffer1 } },
        { binding: 3, resource: { buffer: outputBuffer0 } },
        { binding: 4, resource: { buffer: outputBuffer1 } },
      ],
    });

    const kernelStartedAt = performance.now();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(size / 64));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer0, 0, readBuffer0, 0, outputBytes);
    encoder.copyBufferToBuffer(outputBuffer1, 0, readBuffer1, 0, outputBytes);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const kernelMs = performance.now() - kernelStartedAt;

    const downloadStartedAt = performance.now();
    await Promise.all([
      readBuffer0.mapAsync(mapMode.READ),
      readBuffer1.mapAsync(mapMode.READ),
    ]);
    const packed0 = new Float32Array(readBuffer0.getMappedRange().slice(0));
    const packed1 = new Float32Array(readBuffer1.getMappedRange().slice(0));
    readBuffer0.unmap();
    readBuffer1.unmap();
    const downloadMs = performance.now() - downloadStartedAt;

    const fields = unpackMarginSmoothFields(size, packed0, packed1);
    destroyBuffers([paramBuffer, inputBuffer0, inputBuffer1, outputBuffer0, outputBuffer1, readBuffer0, readBuffer1]);

    return {
      skipped: false,
      valid: true,
      backend: "webgpu-margin-smooth",
      gpuCapabilities: capabilities,
      reason: null,
      timings: {
        uploadMs,
        kernelMs,
        downloadMs,
        totalGpuPathMs: uploadMs + kernelMs + downloadMs,
      },
      fields,
    };
  }

  function createBufferWithData(device, typedArray, usage) {
    const buffer = device.createBuffer({
      size: typedArray.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
    buffer.unmap();
    return buffer;
  }

  function unpackMarginSmoothFields(size, packed0, packed1) {
    const fields = {};
    for (const name of GPU_MARGIN_SMOOTH_OUTPUT_FIELDS) {
      fields[name] = new Float32Array(size);
    }
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      fields.passiveMargin[i] = packed0[offset];
      fields.continentalShelf[i] = packed0[offset + 1];
      fields.continentalSlope[i] = packed0[offset + 2];
      fields.continentalRise[i] = packed0[offset + 3];
      fields.sedimentWedge[i] = packed1[offset];
      fields.abyssalPlain[i] = packed1[offset + 1];
    }
    return fields;
  }

  function destroyBuffers(buffers) {
    for (const buffer of buffers) {
      buffer?.destroy?.();
    }
  }

  function skippedMarginSmoothResult(capabilities, reason) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-margin-smooth",
      gpuCapabilities: capabilities,
      reason,
      timings: emptyMarginSmoothTimings(),
      fields: {},
    };
  }

  function emptyMarginSmoothTimings() {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }


  // ---- src/gpu/kernels/sedimentCapacityKernel.js ----
  const SEDIMENT_CAPACITY_WGSL = String.raw`
  struct Params {
    size: u32,
    width: u32,
    height: u32,
    _pad0: u32,
    sea_level: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> input0: array<vec4<f32>>;
  @group(0) @binding(2) var<storage, read> input1: array<vec4<f32>>;
  @group(0) @binding(3) var<storage, read> input2: array<vec4<f32>>;
  @group(0) @binding(4) var<storage, read> input3: array<vec4<f32>>;
  @group(0) @binding(5) var<storage, read> input4: array<vec4<f32>>;
  @group(0) @binding(6) var<storage, read> input5: array<vec4<f32>>;
  @group(0) @binding(7) var<storage, read> source_capacity: array<f32>;
  @group(0) @binding(8) var<storage, read_write> output_capacity: array<f32>;

  fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
  }

  fn smoothstep01(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = clamp01((x - edge0) / max(0.000001, edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
  }

  fn mix_value(a: f32, b: f32, t: f32) -> f32 {
    return a * (1.0 - t) + b * t;
  }

  fn index_of(x: i32, y: i32) -> i32 {
    if (y < 0 || y >= i32(params.height)) {
      return -1;
    }
    let width = i32(params.width);
    let wrapped_x = ((x % width) + width) % width;
    let id = y * width + wrapped_x;
    if (id < 0 || id >= i32(params.size)) {
      return -1;
    }
    return id;
  }

  fn basin_at(id: u32) -> f32 {
    return input0[id].y;
  }

  fn structural_line_memory(id: u32) -> f32 {
    let boundary_influence = input3[id].z;
    let fracture_zone_memory = input4[id].y;
    let transform_memory = input4[id].z;
    let inactive_boundary_relief = input4[id].w;
    return clamp01(
      max(0.0, boundary_influence - 0.12) * 1.25 +
        inactive_boundary_relief * 2.2 +
        fracture_zone_memory * 0.9 +
        transform_memory * 0.55
    );
  }

  fn local_average8_basin(i: u32, x: i32, y: i32) -> f32 {
    var total = basin_at(i) * 1.5;
    var weight = 1.5;
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        if (dx == 0 && dy == 0) {
          continue;
        }
        let nid = index_of(x + dx, y + dy);
        if (nid < 0) {
          continue;
        }
        let diagonal = dx != 0 && dy != 0;
        let w = select(0.8, 0.45, diagonal);
        total += basin_at(u32(nid)) * w;
        weight += w;
      }
    }
    return total / weight;
  }

  fn soft_depositional_sink(i: u32, x: i32, y: i32) -> f32 {
    let a = input0[i];
    let c = input2[i];
    let d = input3[i];
    let basin = a.y;
    let foreland_basin = a.z;
    let passive_margin = c.y;
    let continental_shelf = c.z;
    let continental_rise = c.w;
    let sediment_wedge = d.x;
    let abyssal_plain = d.y;
    let inland_water_candidate = input5[i].z;
    let broad_basin = local_average8_basin(i, x, y);
    let structural_line = structural_line_memory(i);
    let natural =
      passive_margin * 0.54 +
      continental_shelf * 0.72 +
      continental_rise * 0.54 +
      sediment_wedge * 0.5 +
      foreland_basin * 0.62 +
      inland_water_candidate * 0.44 +
      abyssal_plain * 0.22;
    let basin_part = (broad_basin * 0.2 + basin * 0.08) * (0.35 + natural * 0.65) * (1.0 - structural_line * 0.55);
    return clamp01(natural + basin_part);
  }

  fn initial_capacity(i: u32, x: i32, y: i32) -> f32 {
    let a = input0[i];
    let b = input1[i];
    let c = input2[i];
    let d = input3[i];
    let e = input4[i];
    let f = input5[i];

    let elev = a.x;
    let basin = a.y;
    let foreland_basin = a.z;
    let rift_axis = a.w;
    let trench = b.x;
    let trench_axis = b.y;
    let ridge = b.z;
    let ridge_axis = b.w;
    let island_arc = c.x;
    let passive_margin = c.y;
    let continental_shelf = c.z;
    let continental_rise = c.w;
    let sediment_wedge = d.x;
    let abyssal_plain = d.y;
    let boundary_influence = d.z;
    let crust_age = f.x;
    let crust_type = u32(f.y + 0.5);
    let inland_water_candidate = f.z;
    let active_orogeny = f.w;

    let rel = elev - params.sea_level;
    let near_or_below_sea = clamp01((params.sea_level + 0.08 - elev) / 0.16);
    let shelf_capacity =
      continental_shelf * 0.34 +
      continental_rise * 0.24 +
      sediment_wedge * 0.22 +
      passive_margin * 0.16;
    let natural_capacity_support = clamp01(
      near_or_below_sea * 0.28 +
        continental_shelf * 0.55 +
        continental_rise * 0.42 +
        sediment_wedge * 0.36 +
        passive_margin * 0.28 +
        foreland_basin * 0.34 +
        inland_water_candidate * 0.42 +
        abyssal_plain * 0.12
    );
    let structural_line = structural_line_memory(i);
    let broad_basin = local_average8_basin(i, x, y);
    let basin_capacity =
      broad_basin * (0.11 + natural_capacity_support * 0.2) +
      basin * (0.035 + natural_capacity_support * 0.065) * (1.0 - structural_line * 0.55) +
      foreland_basin * 0.27 +
      rift_axis * 0.052 +
      inland_water_candidate * 0.2;
    let trench_forearc_capacity =
      trench * 0.055 +
      trench_axis * 0.045 +
      island_arc * 0.04;
    let deep_ocean_capacity = abyssal_plain * 0.075 * select(0.0, clamp01(crust_age), crust_type == 0u);
    let active_constructive_penalty =
      ridge_axis * 0.34 +
      ridge * 0.24 +
      active_orogeny * 0.18 +
      select(0.0, smoothstep01(0.12, 0.32, rel) * 0.08, rel > 0.12);
    return clamp01(
      shelf_capacity +
        basin_capacity +
        trench_forearc_capacity +
        deep_ocean_capacity +
        near_or_below_sea * 0.08 -
        active_constructive_penalty
    );
  }

  fn smoothed_capacity(i: u32, x: i32, y: i32) -> f32 {
    var total = source_capacity[i] * 1.8;
    var weight = 1.8;
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        if (dx == 0 && dy == 0) {
          continue;
        }
        let nid = index_of(x + dx, y + dy);
        if (nid < 0) {
          continue;
        }
        let diagonal = dx != 0 && dy != 0;
        let w = select(0.72, 0.38, diagonal);
        total += source_capacity[u32(nid)] * w;
        weight += w;
      }
    }
    let local = source_capacity[i];
    let smoothed = total / weight;
    let natural_sink = soft_depositional_sink(i, x, y);
    let boundary_influence = input3[i].z;
    let fracture_zone_memory = input4[i].y;
    let transform_memory = input4[i].z;
    let inactive_boundary_relief = input4[i].w;
    let structural_line = clamp01(
      max(0.0, boundary_influence - 0.14) * 1.8 +
        fracture_zone_memory * 0.65 +
        transform_memory * 0.42 +
        inactive_boundary_relief * 2.2
    );
    let blend = clamp01(0.16 + natural_sink * 0.16 + structural_line * 0.22);
    let edge_clamp = 0.06 + natural_sink * 0.04;
    return clamp01(mix_value(local, min(local + edge_clamp, smoothed), blend));
  }

  @compute @workgroup_size(64)
  fn seed_capacity(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.size) {
      return;
    }
    let width = params.width;
    let x = i32(i % width);
    let y = i32(i / width);
    output_capacity[i] = initial_capacity(i, x, y);
  }

  @compute @workgroup_size(64)
  fn smooth_capacity(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.size) {
      return;
    }
    let width = params.width;
    let x = i32(i % width);
    let y = i32(i / width);
    output_capacity[i] = smoothed_capacity(i, x, y);
  }
  `;


  // ---- src/gpu/sedimentCapacityCompute.js ----

  const GPU_SEDIMENT_CAPACITY_OUTPUT_FIELDS = ["sedimentCapacity"];

  async function runWebGpuSedimentCapacityCandidate(world, options = {}) {
    const candidateStartedAt = performance.now();
    const globalObject = options.globalObject ?? globalThis;
    const capabilities = detectGpuCapabilities(globalObject);
    const gpu = globalObject?.navigator?.gpu;
    if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
      return skippedSedimentCapacityResult(capabilities, "WebGPU sediment capacity candidate currently supports rectangular grids only.");
    }
    if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
      return skippedSedimentCapacityResult(capabilities, "WebGPU is not available in this environment.");
    }

    let adapter;
    let device;
    try {
      adapter = await gpu.requestAdapter();
      if (!adapter) {
        return skippedSedimentCapacityResult(capabilities, "WebGPU adapter request returned null.");
      }
      device = await adapter.requestDevice();
    } catch (error) {
      return skippedSedimentCapacityResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
    }

    try {
      return withCandidateTiming(await computeSedimentCapacityOnDevice(world, device, capabilities), candidateStartedAt);
    } catch (error) {
      return {
        skipped: true,
        valid: true,
        backend: "webgpu-sediment-capacity",
        gpuCapabilities: capabilities,
        reason: `WebGPU sediment capacity candidate failed safely: ${error?.message ?? "unknown error"}`,
        timings: emptySedimentCapacityTimings(),
        fields: {},
      };
    } finally {
      device?.destroy?.();
    }
  }

  function withCandidateTiming(result, candidateStartedAt) {
    if (!result || result.skipped) return result;
    const totalCandidateMs = performance.now() - candidateStartedAt;
    const totalGpuPathMs = Number(result.timings?.totalGpuPathMs);
    return {
      ...result,
      timings: {
        ...result.timings,
        setupMs: Number.isFinite(totalGpuPathMs) ? Math.max(0, totalCandidateMs - totalGpuPathMs) : null,
        totalCandidateMs,
      },
    };
  }

  async function computeSedimentCapacityOnDevice(world, device, capabilities) {
    const { grid, seaLevel } = world;
    const size = grid.size;
    const width = grid.width;
    const height = grid.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height !== size) {
      return skippedSedimentCapacityResult(capabilities, "World grid is not a rectangular width x height layout.");
    }

    const uploadStartedAt = performance.now();
    const inputs = Array.from({ length: 6 }, () => new Float32Array(size * 4));
    for (let i = 0; i < size; i += 1) {
      const offset = i * 4;
      inputs[0][offset] = grid.elev?.[i] ?? 0;
      inputs[0][offset + 1] = grid.basin?.[i] ?? 0;
      inputs[0][offset + 2] = grid.forelandBasin?.[i] ?? 0;
      inputs[0][offset + 3] = grid.riftAxis?.[i] ?? 0;
      inputs[1][offset] = grid.trench?.[i] ?? 0;
      inputs[1][offset + 1] = grid.trenchAxis?.[i] ?? 0;
      inputs[1][offset + 2] = grid.ridge?.[i] ?? 0;
      inputs[1][offset + 3] = grid.ridgeAxis?.[i] ?? 0;
      inputs[2][offset] = grid.islandArc?.[i] ?? 0;
      inputs[2][offset + 1] = grid.passiveMargin?.[i] ?? 0;
      inputs[2][offset + 2] = grid.continentalShelf?.[i] ?? 0;
      inputs[2][offset + 3] = grid.continentalRise?.[i] ?? 0;
      inputs[3][offset] = grid.sedimentWedge?.[i] ?? 0;
      inputs[3][offset + 1] = grid.abyssalPlain?.[i] ?? 0;
      inputs[3][offset + 2] = grid.boundaryInfluence?.[i] ?? 0;
      inputs[3][offset + 3] = grid.axisCurvature?.[i] ?? 0;
      inputs[4][offset] = grid.weakness?.[i] ?? 0;
      inputs[4][offset + 1] = grid.fractureZoneMemory?.[i] ?? 0;
      inputs[4][offset + 2] = grid.transformMemory?.[i] ?? 0;
      inputs[4][offset + 3] = grid.inactiveBoundaryRelief?.[i] ?? 0;
      inputs[5][offset] = grid.crustAge?.[i] ?? 0;
      inputs[5][offset + 1] = grid.crustType?.[i] ?? 0;
      inputs[5][offset + 2] = grid.inlandWaterCandidate?.[i] ?? 0;
      inputs[5][offset + 3] = grid.activeOrogeny?.[i] ?? 0;
    }

    const usage = globalThis.GPUBufferUsage;
    const mapMode = globalThis.GPUMapMode;
    if (!usage || !mapMode) {
      return skippedSedimentCapacityResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
    }

    const paramBuffer = createBufferWithData(device, createParamData(size, width, height, seaLevel), usage.UNIFORM | usage.COPY_DST);
    const inputBuffers = inputs.map((input) => createBufferWithData(device, input, usage.STORAGE | usage.COPY_DST));
    const zeroSource = createBufferWithData(device, new Float32Array(size), usage.STORAGE | usage.COPY_DST);
    const capacityBytes = size * Float32Array.BYTES_PER_ELEMENT;
    const capacityA = device.createBuffer({ size: capacityBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const capacityB = device.createBuffer({ size: capacityBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const outputBuffer = device.createBuffer({ size: capacityBytes, usage: usage.STORAGE | usage.COPY_SRC });
    const readBuffer = device.createBuffer({ size: capacityBytes, usage: usage.COPY_DST | usage.MAP_READ });
    const uploadMs = performance.now() - uploadStartedAt;

    device.pushErrorScope?.("validation");
    const shaderModule = device.createShaderModule({ code: SEDIMENT_CAPACITY_WGSL });
    const bindGroupLayout = createSedimentCapacityBindGroupLayout(device, usage);
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const seedPipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: "seed_capacity" },
    });
    const smoothPipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: "smooth_capacity" },
    });
    const pipelineError = await device.popErrorScope?.();
    if (pipelineError) {
      destroyBuffers([paramBuffer, ...inputBuffers, zeroSource, capacityA, capacityB, outputBuffer, readBuffer]);
      return skippedSedimentCapacityResult(capabilities, `WebGPU sediment capacity pipeline validation failed: ${pipelineError.message ?? pipelineError}`);
    }

    const kernelStartedAt = performance.now();
    device.pushErrorScope?.("validation");
    const encoder = device.createCommandEncoder();
    encodeSedimentPass(encoder, seedPipeline, bindGroupLayout, device, paramBuffer, inputBuffers, zeroSource, capacityA, size);
    encodeSedimentPass(encoder, smoothPipeline, bindGroupLayout, device, paramBuffer, inputBuffers, capacityA, capacityB, size);
    encodeSedimentPass(encoder, smoothPipeline, bindGroupLayout, device, paramBuffer, inputBuffers, capacityB, outputBuffer, size);
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, capacityBytes);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const dispatchError = await device.popErrorScope?.();
    if (dispatchError) {
      destroyBuffers([paramBuffer, ...inputBuffers, zeroSource, capacityA, capacityB, outputBuffer, readBuffer]);
      return skippedSedimentCapacityResult(capabilities, `WebGPU sediment capacity dispatch validation failed: ${dispatchError.message ?? dispatchError}`);
    }
    const kernelMs = performance.now() - kernelStartedAt;

    const downloadStartedAt = performance.now();
    await readBuffer.mapAsync(mapMode.READ);
    const sedimentCapacity = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    const downloadMs = performance.now() - downloadStartedAt;

    destroyBuffers([paramBuffer, ...inputBuffers, zeroSource, capacityA, capacityB, outputBuffer, readBuffer]);

    return {
      skipped: false,
      valid: true,
      backend: "webgpu-sediment-capacity",
      gpuCapabilities: capabilities,
      reason: null,
      timings: {
        uploadMs,
        kernelMs,
        downloadMs,
        totalGpuPathMs: uploadMs + kernelMs + downloadMs,
      },
      fields: { sedimentCapacity },
    };
  }

  function encodeSedimentPass(encoder, pipeline, bindGroupLayout, device, paramBuffer, inputBuffers, sourceBuffer, outputBuffer, size) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: paramBuffer } },
        ...inputBuffers.map((buffer, index) => ({ binding: index + 1, resource: { buffer } })),
        { binding: 7, resource: { buffer: sourceBuffer } },
        { binding: 8, resource: { buffer: outputBuffer } },
      ],
    }));
    pass.dispatchWorkgroups(Math.ceil(size / 64));
    pass.end();
  }

  function createSedimentCapacityBindGroupLayout(device) {
    const entries = [
      {
        binding: 0,
        visibility: globalThis.GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ];
    for (let binding = 1; binding <= 7; binding += 1) {
      entries.push({
        binding,
        visibility: globalThis.GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      });
    }
    entries.push({
      binding: 8,
      visibility: globalThis.GPUShaderStage.COMPUTE,
      buffer: { type: "storage" },
    });
    return device.createBindGroupLayout({ entries });
  }

  function createParamData(size, width, height, seaLevel) {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setUint32(0, size, true);
    view.setUint32(4, width, true);
    view.setUint32(8, height, true);
    view.setUint32(12, 0, true);
    view.setFloat32(16, seaLevel, true);
    return new Uint8Array(buffer);
  }

  function createBufferWithData(device, typedArray, usage) {
    const buffer = device.createBuffer({
      size: typedArray.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
    buffer.unmap();
    return buffer;
  }

  function destroyBuffers(buffers) {
    for (const buffer of buffers) {
      buffer?.destroy?.();
    }
  }

  function skippedSedimentCapacityResult(capabilities, reason) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-sediment-capacity",
      gpuCapabilities: capabilities,
      reason,
      timings: emptySedimentCapacityTimings(),
      fields: {},
    };
  }

  function emptySedimentCapacityTimings() {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }


  // ---- src/gpu/computeValidate.js ----

  const DEFAULT_VALIDATE_FIELDS = ["isostaticBase"];
  const DEFAULT_VALIDATE_KERNELS = ["isostasy"];
  const DEFAULT_EXPERIMENTAL_KERNELS = ["isostasy"];
  const DEFAULT_EXPERIMENTAL_FIELDS = GPU_ISOSTASY_OUTPUT_FIELDS;
  const EXPERIMENTAL_WRITEBACK_FIELDS = new Set(GPU_ISOSTASY_OUTPUT_FIELDS);

  function createGpuComputeValidator(options = {}) {
    const mode = normalizeMode(options.mode);
    const kernels = normalizeCsvList(
      options.kernels,
      mode === "experimental" ? DEFAULT_EXPERIMENTAL_KERNELS : DEFAULT_VALIDATE_KERNELS,
    );
    const fields = normalizeCsvList(options.fields, defaultFieldsForMode(mode, kernels));
    const interval = Math.max(1, Math.trunc(Number(options.interval ?? 20)) || 20);
    const maxReports = Math.max(1, Math.trunc(Number(options.maxReports ?? 12)) || 12);
    const globalObject = options.globalObject ?? globalThis;
    const logger = options.logger ?? console;
    let running = false;
    let reportCount = 0;
    let lastValidatedStep = -1;
    const validationHistory = [];

    return {
      mode,
      enabled: mode === "candidate" || mode === "validate" || mode === "experimental",
      kernels,
      fields,
      interval,
      maybeValidate(world) {
        if ((mode !== "candidate" && mode !== "validate" && mode !== "experimental") || !world?.grid || running || reportCount >= maxReports) {
          return null;
        }
        if (!Number.isFinite(world.step) || world.step <= 0 || world.step === lastValidatedStep) return null;
        if (world.step % interval !== 0) return null;
        running = true;
        lastValidatedStep = world.step;
        return scheduleValidationTask(globalObject, () => runScheduledValidation(world));
      },
    };

    async function runScheduledValidation(world) {
      try {
        const result =
          mode === "experimental"
            ? await applyExperimentalGpuComputeCheckpoint(world, { kernels, fields, globalObject })
            : mode === "candidate"
              ? await candidateGpuComputeCheckpoint(world, { kernels, fields, globalObject })
            : await validateGpuComputeCheckpoint(world, { kernels, fields, globalObject });
        reportCount += 1;
        logValidateResult(logger, result);
        publishValidationResult(world, globalObject, validationHistory, result);
        return result;
      } catch (error) {
        const result = {
          valid: true,
          skipped: true,
          step: world.step,
          mode,
          reason: `GPU compute validate failed safely: ${error?.message ?? "unknown error"}`,
          fallbackReason: `GPU compute ${mode} failed safely: ${error?.message ?? "unknown error"}`,
          writebackApplied: false,
          writebackFields: [],
          fields: [],
          candidateResults: [],
        };
        reportCount += 1;
        logValidateResult(logger, result);
        publishValidationResult(world, globalObject, validationHistory, result);
        return result;
      } finally {
        running = false;
      }
    }
  }

  function scheduleValidationTask(globalObject, task) {
    return new Promise((resolve) => {
      const run = () => {
        resolve(Promise.resolve().then(task));
      };
      if (typeof globalObject?.requestIdleCallback === "function") {
        globalObject.requestIdleCallback(run, { timeout: 250 });
        return;
      }
      globalObject?.setTimeout?.(run, 0);
    });
  }

  function publishValidationResult(world, globalObject, history, result) {
    history.push(result);
    while (history.length > 24) history.shift();
    world.gpuComputeValidation = result;
    globalObject.__lastGpuComputeValidation = result;
    globalObject.__gpuComputeValidationHistory = history;
  }

  async function candidateGpuComputeCheckpoint(world, options = {}) {
    const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
    const fields = normalizeCsvList(options.fields, defaultFieldsForMode("candidate", kernels));
    const comparison = await compareGpuComputeCheckpoint(world, { ...options, kernels, fields });
    return {
      valid: comparison.fieldResults.every((field) => field.valid),
      skipped: comparison.skipped,
      skippedReason: comparison.skipped ? comparison.skippedReason : null,
      step: comparison.snapshot.step,
      ageYears: comparison.snapshot.ageYears,
      mode: "candidate",
      kernels,
      fields: comparison.fieldResults,
      candidateResults: comparison.candidateResults,
      writebackApplied: false,
      writebackFields: [],
      note: "Browser GPU compute candidate mode samples WebGPU fields for inspection; CPU remains authoritative and no writeback occurs.",
    };
  }

  async function validateGpuComputeCheckpoint(world, options = {}) {
    const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
    const fields = normalizeCsvList(options.fields, defaultFieldsForMode("validate", kernels));
    const comparison = await compareGpuComputeCheckpoint(world, { ...options, kernels, fields });
    return {
      valid: comparison.fieldResults.every((field) => field.valid),
      skipped: comparison.skipped,
      skippedReason: comparison.skipped ? comparison.skippedReason : null,
      step: comparison.snapshot.step,
      ageYears: comparison.snapshot.ageYears,
      mode: "validate",
      kernels,
      fields: comparison.fieldResults,
      candidateResults: comparison.candidateResults,
      writebackApplied: false,
      writebackFields: [],
      note: "Browser GPU compute validate keeps CPU authoritative; candidate fields are compared but never written back.",
    };
  }

  async function applyExperimentalGpuComputeCheckpoint(world, options = {}) {
    const kernels = normalizeCsvList(options.kernels, DEFAULT_EXPERIMENTAL_KERNELS);
    const fields = normalizeCsvList(options.fields, defaultFieldsForMode("experimental", kernels));
    const comparison = await compareGpuComputeCheckpoint(world, { ...options, kernels, fields });
    const invalidFields = comparison.fieldResults.filter((field) => !field.valid);
    const writebackFields = [];
    let fallbackReason = null;

    if (comparison.skipped) {
      fallbackReason = comparison.skippedReason || "GPU candidate skipped.";
    } else if (invalidFields.length > 0) {
      fallbackReason = `GPU candidate exceeded thresholds for: ${invalidFields.map((field) => field.field).join(", ")}.`;
    } else {
      for (const field of comparison.fieldResults) {
        const fieldName = field.field;
        const candidate = comparison.candidateFields[fieldName];
        const target = world.grid?.[fieldName];
        if (!EXPERIMENTAL_WRITEBACK_FIELDS.has(fieldName) || !candidate || !target || target.length !== candidate.length) {
          continue;
        }
        target.set(candidate);
        writebackFields.push(fieldName);
      }
      if (!writebackFields.length) {
        fallbackReason = "No requested fields are enabled for experimental GPU writeback.";
      }
    }

    return {
      valid: invalidFields.length === 0,
      skipped: comparison.skipped,
      skippedReason: comparison.skipped ? comparison.skippedReason : null,
      step: comparison.snapshot.step,
      ageYears: comparison.snapshot.ageYears,
      mode: "experimental",
      kernels,
      fields: comparison.fieldResults,
      candidateResults: comparison.candidateResults,
      writebackApplied: writebackFields.length > 0,
      writebackFields,
      fallbackReason,
      note:
        "Browser GPU compute experimental mode writes back only explicitly validated low-risk derived fields; CPU remains the fallback when validation fails or WebGPU is unavailable.",
    };
  }

  async function compareGpuComputeCheckpoint(world, options = {}) {
    const kernels = normalizeCsvList(options.kernels, DEFAULT_VALIDATE_KERNELS);
    const fields = normalizeCsvList(options.fields, defaultFieldsForMode("validate", kernels));
    const snapshot = createValidationSnapshot(world);
    const candidateResults = [];
    const candidateFields = {};
    const baselineFields = buildBaselineFieldsForKernels(kernels, snapshot);

    for (const kernel of kernels) {
      const result = await runCandidateKernel(kernel, snapshot, options.globalObject, fields);
      candidateResults.push(compactCandidateResult(kernel, result));
      if (!result?.skipped && result?.fields) {
        Object.assign(candidateFields, result.fields);
      }
    }

    const fieldResults = fields.map((fieldName) => {
      const baselineField = baselineFields[fieldName] ?? snapshot.grid[fieldName];
      const candidateField = candidateFields[fieldName] ?? baselineField;
      return {
        ...compareField(fieldName, baselineField, candidateField, thresholdForField(fieldName)),
        baselineSummary: summarizeField(baselineField),
        candidateSummary: summarizeField(candidateField),
      };
    });
    const skipped = candidateResults.length > 0 && candidateResults.every((result) => result.skipped);
    const skippedReason = candidateResults
      .filter((result) => result.skipped)
      .map((result) => `${result.kernel}: ${result.reason}`)
      .join("; ");

    return {
      snapshot,
      fieldResults,
      candidateFields,
      candidateResults,
      skipped,
      skippedReason: skipped ? skippedReason : null,
    };
  }

  function createValidationSnapshot(world) {
    const grid = world?.grid ?? {};
    const snapshotGrid = {};
    for (const [key, value] of Object.entries(grid)) {
      if (ArrayBuffer.isView(value) && typeof value.constructor === "function") {
        snapshotGrid[key] = new value.constructor(value);
      } else {
        snapshotGrid[key] = value;
      }
    }
    return {
      ...world,
      grid: snapshotGrid,
      step: world?.step ?? 0,
      ageYears: world?.ageYears ?? 0,
      seaLevel: world?.seaLevel ?? 0,
      timeScaleFactor: world?.timeScaleFactor ?? 1,
    };
  }

  function normalizeMode(value) {
    const mode = String(value ?? "off").trim().toLowerCase();
    if (mode === "validate") return "validate";
    if (mode === "candidate") return "candidate";
    if (mode === "experimental") return "experimental";
    return "off";
  }

  function normalizeCsvList(value, fallback) {
    if (Array.isArray(value)) return value.map(String).map((part) => part.trim()).filter(Boolean);
    if (value === undefined || value === null || value === "") return [...fallback];
    return String(value)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function defaultFieldsForMode(mode, kernels) {
    const normalized = normalizeCsvList(kernels, []);
    if (mode === "experimental" && normalized.some((kernel) => kernel === "isostasy" || kernel === "webgpu-isostasy")) {
      return DEFAULT_EXPERIMENTAL_FIELDS;
    }
    return DEFAULT_VALIDATE_FIELDS;
  }

  async function runCandidateKernel(kernel, world, globalObject, fields) {
    if (kernel === "elevation" || kernel === "webgpu-elevation") {
      return runWebGpuElevationCandidate(world, { globalObject, fields });
    }
    if (kernel === "isostasy" || kernel === "webgpu-isostasy") {
      return runWebGpuIsostasyCandidate(world, { globalObject, fields });
    }
    if (kernel === "local-fields" || kernel === "localTerrain" || kernel === "webgpu-local-fields") {
      return runWebGpuLocalFieldsCandidate(world, { globalObject, fields });
    }
    if (kernel === "margin-smooth" || kernel === "marginSmooth" || kernel === "webgpu-margin-smooth") {
      return runWebGpuMarginSmoothCandidate(world, { globalObject, fields });
    }
    if (kernel === "sediment-capacity" || kernel === "sedimentCapacity" || kernel === "webgpu-sediment-capacity") {
      return runWebGpuSedimentCapacityCandidate(world, { globalObject, fields });
    }
    return {
      skipped: true,
      valid: true,
      backend: kernel,
      reason: `Unknown GPU validate kernel: ${kernel}`,
      timings: emptyTimings(),
      fields: {},
    };
  }

  function compactCandidateResult(kernel, result) {
    return {
      kernel,
      backend: result?.backend ?? kernel,
      skipped: Boolean(result?.skipped),
      valid: result?.valid !== false,
      reason: result?.reason ?? null,
      requestedFields: result?.requestedFields ?? [],
      downloadedPacks: result?.downloadedPacks ?? [],
      adapterInfo: result?.adapterInfo ?? null,
      deviceInfo: result?.deviceInfo ?? null,
      reusedContext: result?.reusedContext ?? false,
      timings: result?.timings ?? emptyTimings(),
    };
  }

  function compareField(fieldName, baselineField, candidateField, threshold) {
    if (!baselineField || !candidateField) {
      return {
        field: fieldName,
        valid: false,
        reason: "Field is missing on the world or candidate result.",
        threshold,
        rmse: null,
        meanAbs: null,
        p95Abs: null,
        maxAbs: null,
      };
    }
    if (baselineField.length !== candidateField.length) {
      return {
        field: fieldName,
        valid: false,
        reason: `Field length mismatch: ${baselineField.length} vs ${candidateField.length}.`,
        threshold,
        rmse: null,
        meanAbs: null,
        p95Abs: null,
        maxAbs: null,
      };
    }

    let sumSq = 0;
    let sumAbs = 0;
    let maxAbs = 0;
    const absDeltas = new Float64Array(baselineField.length);
    for (let i = 0; i < baselineField.length; i += 1) {
      const delta = Number(candidateField[i]) - Number(baselineField[i]);
      const abs = Math.abs(delta);
      absDeltas[i] = abs;
      sumSq += delta * delta;
      sumAbs += abs;
      if (abs > maxAbs) maxAbs = abs;
    }

    const count = Math.max(1, baselineField.length);
    const rmse = Math.sqrt(sumSq / count);
    const meanAbs = sumAbs / count;
    const p95Abs = percentile(absDeltas, 0.95);
    return {
      field: fieldName,
      valid: rmse <= threshold.rmse && maxAbs <= threshold.maxAbs && p95Abs <= threshold.p95Abs,
      threshold,
      rmse,
      meanAbs,
      p95Abs,
      maxAbs,
    };
  }

  function summarizeField(field) {
    if (!field || !field.length) return null;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < field.length; i += 1) {
      const value = Number(field[i]);
      if (!Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
      count += 1;
    }
    return {
      min: count ? min : null,
      max: count ? max : null,
      mean: count ? sum / count : null,
      finiteShare: field.length ? count / field.length : 0,
    };
  }

  function thresholdForField(fieldName) {
    if (fieldName === "aspect") return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00001 };
    if (fieldName === "slope" || fieldName === "ruggedness" || fieldName === "localRelief") {
      return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
    }
    if (
      fieldName === "passiveMargin" ||
      fieldName === "continentalShelf" ||
      fieldName === "continentalSlope" ||
      fieldName === "continentalRise" ||
      fieldName === "sedimentWedge" ||
      fieldName === "abyssalPlain"
    ) {
      return { rmse: 0.000001, maxAbs: 0.00001, p95Abs: 0.000001 };
    }
    if (fieldName === "sedimentCapacity") return { rmse: 0.00001, maxAbs: 0.0001, p95Abs: 0.00002 };
    if (fieldName === "boundaryRelief") return { rmse: 0.003, maxAbs: 0.015, p95Abs: 0.006 };
    if (fieldName === "elev" || fieldName === "baseElev" || fieldName === "relief") {
      return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
    }
    if (
      fieldName === "isostaticBase" ||
      fieldName === "ageSubsidence" ||
      fieldName === "thicknessBuoyancy" ||
      fieldName === "sedimentFill" ||
      fieldName === "crustBuoyancy" ||
      fieldName === "densitySubsidence" ||
      fieldName === "lithosphereCooling"
    ) {
      return { rmse: 0.001, maxAbs: 0.0065, p95Abs: 0.002 };
    }
    return { rmse: 0.002, maxAbs: 0.01, p95Abs: 0.004 };
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = Array.from(values).sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  }

  function buildBaselineFieldsForKernels(kernels, world) {
    const baselineFields = {};
    for (const kernel of kernels) {
      if (kernel === "local-fields" || kernel === "localTerrain" || kernel === "webgpu-local-fields") {
        Object.assign(baselineFields, computeCpuLocalFields(world));
      } else if (kernel === "margin-smooth" || kernel === "marginSmooth" || kernel === "webgpu-margin-smooth") {
        Object.assign(baselineFields, computeCpuMarginSmooth(world));
      } else if (kernel === "sediment-capacity" || kernel === "sedimentCapacity" || kernel === "webgpu-sediment-capacity") {
        Object.assign(baselineFields, computeCpuSedimentCapacity(world));
      }
    }
    return baselineFields;
  }

  function computeCpuLocalFields(world) {
    const { grid, seaLevel } = world;
    const { size, width, height } = grid;
    if (!isRectangularGrid(grid)) return {};
    const slope = new Float32Array(size);
    const aspect = new Float32Array(size);
    const ruggedness = new Float32Array(size);
    const localRelief = new Float32Array(size);
    const relativeElevation = new Float32Array(size);
    for (let i = 0; i < size; i += 1) relativeElevation[i] = grid.elev[i] - seaLevel;

    for (let id = 0; id < size; id += 1) {
      const x = id % width;
      const y = Math.floor(id / width);
      const center = relativeElevation[id];
      const left = finiteSample(relativeElevation, width, height, x - 1, y, center);
      const right = finiteSample(relativeElevation, width, height, x + 1, y, center);
      const up = finiteSample(relativeElevation, width, height, x, y - 1, center);
      const down = finiteSample(relativeElevation, width, height, x, y + 1, center);
      const dx = (right - left) * 0.5;
      const dy = (down - up) * 0.5;
      slope[id] = Math.hypot(dx, dy);
      aspect[id] = Math.atan2(dy, dx);

      let sum = 0;
      let count = 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const nid = indexOf(width, height, nx, ny);
        if (nid < 0) continue;
        sum += Math.abs(center - relativeElevation[nid]);
        count += 1;
      }
      ruggedness[id] = count ? sum / count : 0;
      localRelief[id] = Math.max(
        Math.abs(center - left),
        Math.abs(center - right),
        Math.abs(center - up),
        Math.abs(center - down),
      );
    }
    return { slope, aspect, ruggedness, localRelief };
  }

  function computeCpuMarginSmooth(world) {
    const { grid } = world;
    const { size, width, height } = grid;
    if (!isRectangularGrid(grid)) return {};
    const fields = {
      passiveMargin: new Float32Array(grid.passiveMargin),
      continentalShelf: new Float32Array(grid.continentalShelf),
      continentalSlope: new Float32Array(grid.continentalSlope),
      continentalRise: new Float32Array(grid.continentalRise),
      sedimentWedge: new Float32Array(grid.sedimentWedge),
      abyssalPlain: new Float32Array(grid.abyssalPlain),
    };
    const result = {};
    for (const [name, source] of Object.entries(fields)) {
      const output = new Float32Array(size);
      for (let id = 0; id < size; id += 1) {
        const x = id % width;
        const y = Math.floor(id / width);
        let total = source[id] * 2.5;
        let weight = 2.5;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const nid = indexOf(width, height, nx, ny);
          if (nid < 0) continue;
          total += source[nid];
          weight += 1;
        }
        output[id] = Math.max(0, Math.min(1, total / weight));
      }
      result[name] = output;
    }
    return result;
  }

  function computeCpuSedimentCapacity(world) {
    const { grid, seaLevel } = world;
    const { size, width, height } = grid;
    if (!isRectangularGrid(grid)) return {};
    const sedimentCapacity = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      const rel = grid.elev[i] - seaLevel;
      const nearOrBelowSea = clamp01((seaLevel + 0.08 - grid.elev[i]) / 0.16);
      const shelfCapacity =
        (grid.continentalShelf?.[i] ?? 0) * 0.34 +
        (grid.continentalRise?.[i] ?? 0) * 0.24 +
        (grid.sedimentWedge?.[i] ?? 0) * 0.22 +
        (grid.passiveMargin?.[i] ?? 0) * 0.16;
      const naturalCapacitySupport = clamp01(
        nearOrBelowSea * 0.28 +
          (grid.continentalShelf?.[i] ?? 0) * 0.55 +
          (grid.continentalRise?.[i] ?? 0) * 0.42 +
          (grid.sedimentWedge?.[i] ?? 0) * 0.36 +
          (grid.passiveMargin?.[i] ?? 0) * 0.28 +
          (grid.forelandBasin?.[i] ?? 0) * 0.34 +
          (grid.inlandWaterCandidate?.[i] ?? 0) * 0.42 +
          (grid.abyssalPlain?.[i] ?? 0) * 0.12,
      );
      const structuralLine = sedimentStructuralLineMemory(grid, i);
      const broadBasin = localAverage8(grid, grid.basin, i);
      const basinCapacity =
        broadBasin * (0.11 + naturalCapacitySupport * 0.2) +
        (grid.basin?.[i] ?? 0) * (0.035 + naturalCapacitySupport * 0.065) * (1 - structuralLine * 0.55) +
        (grid.forelandBasin?.[i] ?? 0) * 0.27 +
        (grid.riftAxis?.[i] ?? 0) * 0.052 +
        (grid.inlandWaterCandidate?.[i] ?? 0) * 0.2;
      const trenchForearcCapacity =
        (grid.trench?.[i] ?? 0) * 0.055 +
        (grid.trenchAxis?.[i] ?? 0) * 0.045 +
        (grid.islandArc?.[i] ?? 0) * 0.04;
      const isOceanic = Math.trunc((grid.crustType?.[i] ?? 1) + 0.5) === 0;
      const deepOceanCapacity = (grid.abyssalPlain?.[i] ?? 0) * 0.075 * (isOceanic ? clamp01(grid.crustAge?.[i] ?? 0) : 0);
      const activeConstructivePenalty =
        (grid.ridgeAxis?.[i] ?? 0) * 0.34 +
        (grid.ridge?.[i] ?? 0) * 0.24 +
        (grid.activeOrogeny?.[i] ?? 0) * 0.18 +
        (rel > 0.12 ? smoothstep(0.12, 0.32, rel) * 0.08 : 0);
      sedimentCapacity[i] = clamp01(
        shelfCapacity +
          basinCapacity +
          trenchForearcCapacity +
          deepOceanCapacity +
          nearOrBelowSea * 0.08 -
          activeConstructivePenalty,
      );
    }
    softenCpuSedimentCapacity(world, sedimentCapacity);
    return { sedimentCapacity };
  }

  function softenCpuSedimentCapacity(world, sedimentCapacity) {
    const { grid } = world;
    const scratch = new Float32Array(sedimentCapacity.length);
    for (let pass = 0; pass < 2; pass += 1) {
      scratch.set(sedimentCapacity);
      for (let id = 0; id < sedimentCapacity.length; id += 1) {
        let total = scratch[id] * 1.8;
        let weight = 1.8;
        visitNeighbor8(grid, id, (nid, diagonal) => {
          const w = diagonal ? 0.38 : 0.72;
          total += scratch[nid] * w;
          weight += w;
        });
        const local = scratch[id];
        const smoothed = total / weight;
        const naturalSink = cpuSoftDepositionalSink(grid, id);
        const structuralLine = clamp01(
          Math.max(0, (grid.boundaryInfluence?.[id] ?? 0) - 0.14) * 1.8 +
            (grid.fractureZoneMemory?.[id] ?? 0) * 0.65 +
            (grid.transformMemory?.[id] ?? 0) * 0.42 +
            (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2,
        );
        const blend = clamp01(0.16 + naturalSink * 0.16 + structuralLine * 0.22);
        const edgeClamp = 0.06 + naturalSink * 0.04;
        sedimentCapacity[id] = clamp01(mix(local, Math.min(local + edgeClamp, smoothed), blend));
      }
    }
  }

  function cpuSoftDepositionalSink(grid, id) {
    const broadBasin = localAverage8(grid, grid.basin, id);
    const structuralLine = sedimentStructuralLineMemory(grid, id);
    const natural =
      (grid.passiveMargin?.[id] ?? 0) * 0.54 +
      (grid.continentalShelf?.[id] ?? 0) * 0.72 +
      (grid.continentalRise?.[id] ?? 0) * 0.54 +
      (grid.sedimentWedge?.[id] ?? 0) * 0.5 +
      (grid.forelandBasin?.[id] ?? 0) * 0.62 +
      (grid.inlandWaterCandidate?.[id] ?? 0) * 0.44 +
      (grid.abyssalPlain?.[id] ?? 0) * 0.22;
    const basinPart = (broadBasin * 0.2 + (grid.basin?.[id] ?? 0) * 0.08) * (0.35 + natural * 0.65) * (1 - structuralLine * 0.55);
    return clamp01(natural + basinPart);
  }

  function sedimentStructuralLineMemory(grid, id) {
    return clamp01(
      Math.max(0, (grid.boundaryInfluence?.[id] ?? 0) - 0.12) * 1.25 +
        (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2 +
        (grid.fractureZoneMemory?.[id] ?? 0) * 0.9 +
        (grid.transformMemory?.[id] ?? 0) * 0.55,
    );
  }

  function localAverage8(grid, field, id) {
    if (!field) return 0;
    let total = field[id] * 1.5;
    let weight = 1.5;
    visitNeighbor8(grid, id, (nid, diagonal) => {
      const w = diagonal ? 0.45 : 0.8;
      total += field[nid] * w;
      weight += w;
    });
    return total / weight;
  }

  function visitNeighbor8(grid, id, visit) {
    const width = grid.width;
    const x = id % width;
    const y = Math.floor(id / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nid = indexOf(width, grid.height, x + dx, y + dy);
        if (nid < 0) continue;
        visit(nid, dx !== 0 && dy !== 0);
      }
    }
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function mix(a, b, t) {
    return a * (1 - t) + b * t;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function finiteSample(field, width, height, x, y, fallback) {
    const id = indexOf(width, height, x, y);
    if (id < 0) return fallback;
    const value = field[id];
    return Number.isFinite(value) ? value : fallback;
  }

  function indexOf(width, height, x, y) {
    if (y < 0 || y >= height) return -1;
    const sx = ((x % width) + width) % width;
    const id = y * width + sx;
    return id >= 0 && id < width * height ? id : -1;
  }

  function isRectangularGrid(grid) {
    const width = grid?.width;
    const height = grid?.height;
    return (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0 &&
      width * height === grid?.size &&
      !grid?.topologyOptions?.graphBacked &&
      grid?.topologyKind !== "cubed-sphere"
    );
  }

  function logValidateResult(logger, result) {
    const summary = {
      step: result.step,
      ageYears: result.ageYears,
      mode: result.mode,
      valid: result.valid,
      skipped: result.skipped,
      skippedReason: result.skippedReason ?? result.reason ?? null,
      fallbackReason: result.fallbackReason ?? null,
      writebackApplied: result.writebackApplied ?? false,
      writebackFields: result.writebackFields ?? [],
      kernels: result.kernels,
      fields: result.fields?.map((field) => ({
        field: field.field,
        valid: field.valid,
        rmse: field.rmse,
        maxAbs: field.maxAbs,
        p95Abs: field.p95Abs,
        baselineMean: field.baselineSummary?.mean ?? null,
        candidateMean: field.candidateSummary?.mean ?? null,
      })) ?? [],
    };
    const method = result.valid ? "info" : "warn";
    const label =
      result.mode === "experimental"
        ? "[gpu-compute-experimental]"
        : result.mode === "candidate"
          ? "[gpu-compute-candidate]"
          : "[gpu-compute-validate]";
    logger?.[method]?.(label, summary);
  }

  function emptyTimings() {
    return {
      setupMs: null,
      uploadMs: null,
      kernelMs: null,
      downloadMs: null,
      totalGpuPathMs: null,
      totalCandidateMs: null,
    };
  }


  // ---- src/render/cpuMapRenderer.js ----

  const SPHERICAL_DEBUG_PROJECTION_MODES = new Set([
    "debug-face",
    "debug-cell-id",
    "debug-neighbor-count",
    "debug-area",
    "debug-face-seam-risk",
    "debug-projection-sampling",
  ]);

  function createCpuMapRenderer(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    let imageData = null;

    function render(world) {
      const { grid } = world;
      if (isGraphBackedGrid(grid)) {
        renderSphericalWorld(world);
        return;
      }
      renderRectangularWorld(world);
    }

    function renderRectangularWorld(world) {
      const { grid } = world;
      const { width, height, elev, btype, activeBoundary } = grid;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        imageData = null;
      }
      if (!imageData) imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      for (let i = 0; i < grid.size; i += 1) {
        const color = colorForElevation(elev[i] - world.seaLevel);
        const offset = i * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }

      if (world.params.showBoundaries !== false) {
        for (let i = 0; i < grid.size; i += 1) {
          if (btype[i] === BoundaryType.INTERIOR || !activeBoundary[i]) continue;
          const overlayStrength = boundaryOverlayStrength(grid, i);
          if (overlayStrength <= 0) continue;
          const offset = i * 4;
          if (btype[i] === BoundaryType.CONVERGENT) {
            blendPixel(data, offset, [231, 86, 66], 0.55 * overlayStrength);
          } else if (btype[i] === BoundaryType.DIVERGENT) {
            blendPixel(data, offset, [77, 195, 215], 0.5 * overlayStrength);
          } else {
            blendPixel(data, offset, [236, 196, 83], 0.46 * overlayStrength);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    function renderSphericalWorld(world) {
      const { grid } = world;
      const width = Number.isFinite(world.params?.renderWidth) ? world.params.renderWidth : 512;
      const height = Number.isFinite(world.params?.renderHeight) ? world.params.renderHeight : 256;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        imageData = null;
      }
      if (!imageData) imageData = ctx.createImageData(width, height);
      const projectionMode = world.params?.projectionMode ?? "equirectangular";
      const projectionOptions = {
        cameraLon: world.params?.cameraLon,
        cameraLat: world.params?.cameraLat,
        zoom: world.params?.projectionZoom,
      };
      const rendered = SPHERICAL_DEBUG_PROJECTION_MODES.has(projectionMode)
        ? renderSphericalDebugLayer(grid, projectionMode, {
            width,
            height,
            projectionMode: "equirectangular",
          })
        : renderSphericalField(grid, grid.elev, {
            width,
            height,
            projectionMode,
            ...projectionOptions,
            colorRamp: (value, cell) => {
              const color = colorForElevation(value - world.seaLevel);
              if (world.params.showBoundaries === false) return color;
              const overlay = sphericalBoundaryOverlay(grid, cell);
              if (!overlay) return color;
              const { type, strength: overlayStrength } = overlay;
              if (overlayStrength <= 0) return color;
              if (type === BoundaryType.CONVERGENT) {
                return blendedColor(color, [231, 86, 66], 0.55 * overlayStrength);
              }
              if (type === BoundaryType.DIVERGENT) {
                return blendedColor(color, [77, 195, 215], 0.5 * overlayStrength);
              }
              return blendedColor(color, [236, 196, 83], 0.46 * overlayStrength);
            },
          });
      imageData.data.set(rendered.pixels);
      ctx.putImageData(imageData, 0, 0);
    }

    return {
      kind: "cpu-canvas",
      fallbackReason: null,
      render,
    };
  }

  function boundaryOverlayStrength(grid, id) {
    const checker = grid.plateCheckerboard?.[id] ?? 0;
    if (checker > 0.35) return 0;
    const noisy = grid.noisyBoundaryPatch?.[id] ?? 0;
    const density = grid.boundaryDensity?.[id] ?? 0;
    const coherence = grid.boundaryCoherence?.[id] ?? 1;
    if (noisy && density > 0.36) return 0;
    if (density > 0.58 && coherence < 0.78) return 0;
    return Math.max(0.35, Math.min(1, 0.45 + coherence * 0.55));
  }

  function blendPixel(data, offset, color, alpha) {
    data[offset] = Math.round(data[offset] * (1 - alpha) + color[0] * alpha);
    data[offset + 1] = Math.round(data[offset + 1] * (1 - alpha) + color[1] * alpha);
    data[offset + 2] = Math.round(data[offset + 2] * (1 - alpha) + color[2] * alpha);
  }

  function blendedColor(base, overlay, alpha) {
    const k = Math.max(0, Math.min(1, alpha));
    return [
      Math.round(base[0] * (1 - k) + overlay[0] * k),
      Math.round(base[1] * (1 - k) + overlay[1] * k),
      Math.round(base[2] * (1 - k) + overlay[2] * k),
    ];
  }

  function hasActiveBoundary(grid, id) {
    return grid.btype?.[id] !== BoundaryType.INTERIOR && Boolean(grid.activeBoundary?.[id]);
  }

  function sphericalBoundaryOverlay(grid, id) {
    if (hasActiveBoundary(grid, id)) {
      return {
        type: grid.btype[id],
        strength: Math.max(0.45, boundaryOverlayStrength(grid, id)),
      };
    }

    const start = grid.neighborStart?.[id];
    const count = grid.neighborCount?.[id];
    const neighbors = grid.neighbors;
    if (!neighbors || start === undefined || count === undefined) return null;

    let bestType = BoundaryType.INTERIOR;
    let bestStrength = 0;
    for (let n = 0; n < count; n += 1) {
      const neighbor = neighbors[start + n];
      if (!hasActiveBoundary(grid, neighbor)) continue;
      const strength = Math.max(0.28, boundaryOverlayStrength(grid, neighbor) * 0.55);
      if (strength > bestStrength) {
        bestStrength = strength;
        bestType = grid.btype[neighbor];
      }
    }
    if (bestStrength <= 0) return null;
    return { type: bestType, strength: bestStrength };
  }

  function isGraphBackedGrid(grid) {
    return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
  }

  function colorForElevation(h) {
    if (h < -0.22) return [7, 35, 65];
    if (h < -0.08) return lerpColor([11, 53, 94], [31, 105, 143], (h + 0.22) / 0.14);
    if (h < 0) return lerpColor([39, 116, 145], [86, 157, 164], (h + 0.08) / 0.08);
    if (h < 0.12) return lerpColor([86, 132, 72], [143, 163, 88], h / 0.12);
    if (h < 0.32) return lerpColor([136, 123, 77], [126, 91, 62], (h - 0.12) / 0.2);
    if (h < 0.56) return lerpColor([116, 94, 79], [188, 182, 163], (h - 0.32) / 0.24);
    return [236, 240, 229];
  }

  function lerpColor(a, b, t) {
    const k = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k),
    ];
  }


  // ---- src/render/sphericalProjectionRenderer.js ----

  function renderSphericalField(grid, field, options = {}) {
    const width = Math.max(1, Math.trunc(options.width ?? 512));
    const height = Math.max(1, Math.trunc(options.height ?? 256));
    const projectionMode = options.projectionMode ?? "equirectangular";
    const colorRamp = options.colorRamp ?? colorRampElevation;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const stats = {
      projectionMode,
      width,
      height,
      sampledPixels: 0,
      blankPixels: 0,
      nearestCellMaxReuse: 0,
    };
    const reuse = new Uint16Array(grid.size);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const sample = projectionSampleToVec3(x, y, width, height, projectionMode, options);
        if (!sample.visible) {
          pixels[offset] = options.background?.[0] ?? 0;
          pixels[offset + 1] = options.background?.[1] ?? 0;
          pixels[offset + 2] = options.background?.[2] ?? 0;
          pixels[offset + 3] = 255;
          stats.blankPixels += 1;
          continue;
        }

        const cell = nearestCellByVector(grid, sample.x, sample.y, sample.z);
        reuse[cell] += 1;
        if (reuse[cell] > stats.nearestCellMaxReuse) stats.nearestCellMaxReuse = reuse[cell];
        const color = colorRamp(field[cell], cell, grid);
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = 255;
        stats.sampledPixels += 1;
      }
    }

    return { pixels, stats };
  }

  function renderSphericalDebugFace(grid, options = {}) {
    return renderSphericalDebugLayer(grid, "debug-face", options);
  }

  function renderSphericalDebugLayer(grid, layer, options = {}) {
    return renderSphericalField(grid, debugLayerField(grid), {
      ...options,
      colorRamp: (_value, cell) => colorDebugLayer(grid, layer, cell),
    });
  }

  function projectionSampleToVec3(x, y, width, height, projectionMode, options = {}) {
    if (projectionMode === "orthographic") {
      return orthographicPixelToVec3(x, y, width, height, options);
    }
    if (projectionMode === "mollweide") {
      return mollweidePixelToVec3(x, y, width, height);
    }
    return {
      ...equirectangularPixelToVec3(x, y, width, height),
      visible: true,
    };
  }

  function orthographicPixelToVec3(x, y, width, height, options = {}) {
    const size = Math.min(width, height);
    const zoom = Number.isFinite(options.zoom) ? Math.max(0.1, options.zoom) : 0.92;
    const nx = ((x + 0.5) - width / 2) / (size / 2 * zoom);
    const ny = (height / 2 - (y + 0.5)) / (size / 2 * zoom);
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) return { x: 0, y: 0, z: 0, visible: false };

    const cameraLon = options.cameraLon ?? 0;
    const cameraLat = options.cameraLat ?? 0;
    const forward = lonLatToVec3(cameraLon, cameraLat);
    const east = normalize3(-Math.sin(cameraLon), 0, Math.cos(cameraLon));
    const north = normalize3(
      -Math.cos(cameraLon) * Math.sin(cameraLat),
      Math.cos(cameraLat),
      -Math.sin(cameraLon) * Math.sin(cameraLat),
    );
    const radial = Math.sqrt(Math.max(0, 1 - r2));
    const point = normalize3(
      forward.x * radial + east.x * nx + north.x * ny,
      forward.y * radial + east.y * nx + north.y * ny,
      forward.z * radial + east.z * nx + north.z * ny,
    );
    return { ...point, visible: true };
  }

  function colorRampElevation(value) {
    const h = Math.max(-1, Math.min(1, value));
    if (h < -0.25) return lerpColor([7, 35, 65], [16, 72, 116], (h + 1) / 0.75);
    if (h < 0) return lerpColor([16, 72, 116], [81, 151, 163], (h + 0.25) / 0.25);
    if (h < 0.35) return lerpColor([86, 132, 72], [151, 162, 92], h / 0.35);
    return lerpColor([126, 91, 62], [236, 240, 229], (h - 0.35) / 0.65);
  }

  const FACE_COLORS = [
    [220, 75, 75],
    [78, 145, 220],
    [90, 180, 105],
    [235, 180, 70],
    [160, 100, 210],
    [70, 190, 195],
  ];

  function debugLayerField(grid) {
    if (!grid.__debugProjectionField || grid.__debugProjectionField.length !== grid.size) {
      Object.defineProperty(grid, "__debugProjectionField", {
        value: new Uint8Array(grid.size),
        configurable: true,
      });
    }
    return grid.__debugProjectionField;
  }

  function colorDebugLayer(grid, layer, cell) {
    if (layer === "debug-face") return FACE_COLORS[(grid.face?.[cell] ?? 0) % FACE_COLORS.length];
    if (layer === "debug-cell-id") return colorDebugCellId(grid, cell);
    if (layer === "debug-neighbor-count") return colorDebugNeighborCount(grid, cell);
    if (layer === "debug-area") return colorDebugArea(grid, cell);
    if (layer === "debug-face-seam-risk") return colorDebugFaceSeamRisk(grid, cell);
    if (layer === "debug-projection-sampling") return colorDebugProjectionSampling(grid, cell);
    throw new Error(`Unknown spherical debug layer: ${layer}`);
  }

  function colorDebugCellId(grid, cell) {
    const face = grid.face?.[cell] ?? 0;
    const u = grid.faceU?.[cell] ?? 0;
    const v = grid.faceV?.[cell] ?? 0;
    const hash = (cell * 1103515245 + face * 1013904223 + u * 374761393 + v * 668265263) >>> 0;
    return [
      45 + (hash & 0x7f),
      55 + ((hash >>> 8) & 0x7f),
      65 + ((hash >>> 16) & 0x7f),
    ];
  }

  function colorDebugNeighborCount(grid, cell) {
    const count = grid.neighborCount?.[cell] ?? 0;
    if (count <= 2) return [228, 76, 68];
    if (count === 3) return [235, 189, 76];
    if (count === 4) return [72, 178, 112];
    return [82, 174, 224];
  }

  function colorDebugArea(grid, cell) {
    const area = grid.area?.[cell];
    const metricArea = Number.isFinite(area) && area > 0 ? area : 1;
    const faceSize = Math.max(1, grid.faceSize ?? 1);
    const ideal = (4 * Math.PI) / Math.max(1, 6 * faceSize * faceSize);
    const ratio = metricArea / Math.max(ideal, Number.EPSILON);
    if (ratio < 1) return lerpColor([40, 84, 156], [50, 60, 65], ratio);
    return lerpColor([50, 60, 65], [230, 188, 82], Math.min(1, ratio - 1));
  }

  function colorDebugFaceSeamRisk(grid, cell) {
    let seam = false;
    const start = grid.neighborStart?.[cell] ?? 0;
    const count = grid.neighborCount?.[cell] ?? 0;
    for (let k = 0; k < count; k += 1) {
      const nid = grid.neighbors[start + k];
      if (grid.face?.[nid] !== grid.face?.[cell]) seam = true;
    }
    if (!seam) return [29, 34, 38];
    const edgeLength = meanNeighborEdgeLength(grid, cell);
    const t = Math.max(0, Math.min(1, edgeLength / Math.max(1e-6, Math.PI / Math.max(2, grid.faceSize ?? 2))));
    return lerpColor([238, 216, 75], [226, 62, 54], t);
  }

  function colorDebugProjectionSampling(grid, cell) {
    const u = grid.faceU?.[cell] ?? 0;
    const v = grid.faceV?.[cell] ?? 0;
    const faceSize = Math.max(1, grid.faceSize ?? 1);
    const edge = u === 0 || v === 0 || u === faceSize - 1 || v === faceSize - 1;
    const checker = ((Math.floor(u / 2) + Math.floor(v / 2) + (grid.face?.[cell] ?? 0)) % 2) === 0;
    if (edge) return checker ? [240, 238, 118] : [230, 92, 76];
    return checker ? [70, 122, 186] : [38, 64, 102];
  }

  function meanNeighborEdgeLength(grid, cell) {
    const start = grid.neighborStart?.[cell] ?? 0;
    const count = grid.neighborCount?.[cell] ?? 0;
    if (!count) return 0;
    let total = 0;
    for (let k = 0; k < count; k += 1) total += grid.edgeLength?.[start + k] ?? 0;
    return total / count;
  }

  function lerpColor(a, b, t) {
    const k = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k),
    ];
  }


  // ---- src/render/gpuMapRenderer.js ----

  const VERTEX_SHADER = `#version 300 es
  precision highp float;
  const vec2 POSITIONS[6] = vec2[6](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2( 1.0,  1.0)
  );
  out vec2 vUv;
  void main() {
    vec2 position = POSITIONS[gl_VertexID];
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }`;

  const FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  uniform sampler2D uElevation;
  uniform sampler2D uBoundaryOverlay;
  uniform float uSeaLevel;
  in vec2 vUv;
  out vec4 outColor;

  vec3 lerpColor(vec3 a, vec3 b, float t) {
    return mix(a, b, clamp(t, 0.0, 1.0));
  }

  vec3 colorForElevation(float h) {
    if (h < -0.22) return vec3(7.0, 35.0, 65.0) / 255.0;
    if (h < -0.08) return lerpColor(vec3(11.0, 53.0, 94.0) / 255.0, vec3(31.0, 105.0, 143.0) / 255.0, (h + 0.22) / 0.14);
    if (h < 0.0) return lerpColor(vec3(39.0, 116.0, 145.0) / 255.0, vec3(86.0, 157.0, 164.0) / 255.0, (h + 0.08) / 0.08);
    if (h < 0.12) return lerpColor(vec3(86.0, 132.0, 72.0) / 255.0, vec3(143.0, 163.0, 88.0) / 255.0, h / 0.12);
    if (h < 0.32) return lerpColor(vec3(136.0, 123.0, 77.0) / 255.0, vec3(126.0, 91.0, 62.0) / 255.0, (h - 0.12) / 0.2);
    if (h < 0.56) return lerpColor(vec3(116.0, 94.0, 79.0) / 255.0, vec3(188.0, 182.0, 163.0) / 255.0, (h - 0.32) / 0.24);
    return vec3(236.0, 240.0, 229.0) / 255.0;
  }

  void main() {
    vec2 texCoord = vec2(vUv.x, 1.0 - vUv.y);
    float elevation = texture(uElevation, texCoord).r;
    vec3 baseColor = colorForElevation(elevation - uSeaLevel);
    vec4 boundaryOverlay = texture(uBoundaryOverlay, texCoord);
    outColor = vec4(mix(baseColor, boundaryOverlay.rgb, boundaryOverlay.a), 1.0);
  }`;

  function createExperimentalWebGlMapRenderer(canvas) {
    const gl = getWebGl2Context(canvas);
    if (!gl) {
      return { ok: false, reason: "WebGL2 is not available for this canvas." };
    }

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) {
      return { ok: false, reason: "WebGL2 render shader could not be compiled." };
    }

    const texture = gl.createTexture();
    const boundaryTexture = gl.createTexture();
    const vao = gl.createVertexArray();
    const elevationLocation = gl.getUniformLocation(program, "uElevation");
    const boundaryOverlayLocation = gl.getUniformLocation(program, "uBoundaryOverlay");
    const seaLevelLocation = gl.getUniformLocation(program, "uSeaLevel");
    let width = 0;
    let height = 0;
    let elevationUpload = null;
    let boundaryUpload = null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, boundaryTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    function render(world) {
      const { grid } = world;
      if (isGraphBackedGrid(grid)) {
        renderSphericalProjection(world);
        return;
      }
      ensureSize(grid.width, grid.height);
      elevationUpload.set(grid.elev);
      writeBoundaryOverlay(world, boundaryUpload);

      drawUploadedTextures(world.seaLevel);
      world.renderBackend = "webgl2-render-experimental";
      world.renderFallbackReason = null;
    }

    function renderSphericalProjection(world) {
      const { grid } = world;
      const width = Number.isFinite(world.params?.renderWidth) ? world.params.renderWidth : 512;
      const height = Number.isFinite(world.params?.renderHeight) ? world.params.renderHeight : 256;
      const projectionMode = world.params?.projectionMode ?? "equirectangular";
      const rendered = renderSphericalField(grid, grid.elev, {
        width,
        height,
        projectionMode,
        cameraLon: world.params?.cameraLon,
        cameraLat: world.params?.cameraLat,
        zoom: world.params?.projectionZoom,
        colorRamp: (value, cell) => {
          const color = colorForElevation(value - world.seaLevel);
          if (world.params.showBoundaries === false) return color;
          const overlay = sphericalBoundaryOverlay(grid, cell);
          if (!overlay) return color;
          const { type, strength } = overlay;
          if (type === BoundaryType.CONVERGENT) {
            return blendedColor(color, [231, 86, 66], 0.55 * strength);
          }
          if (type === BoundaryType.DIVERGENT) {
            return blendedColor(color, [77, 195, 215], 0.5 * strength);
          }
          return blendedColor(color, [236, 196, 83], 0.46 * strength);
        },
      });

      ensureSize(width, height);
      elevationUpload.fill(0);
      boundaryUpload.set(rendered.pixels);
      drawUploadedTextures(0);
      world.renderBackend = "webgl2-spherical-projection-experimental";
      world.renderFallbackReason = null;
    }

    function drawUploadedTextures(seaLevel) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, elevationUpload);
      gl.uniform1i(elevationLocation, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, boundaryTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, boundaryUpload);
      gl.uniform1i(boundaryOverlayLocation, 1);
      gl.uniform1f(seaLevelLocation, seaLevel);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function ensureSize(nextWidth, nextHeight) {
      if (width === nextWidth && height === nextHeight) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      elevationUpload = new Float32Array(width * height);
      boundaryUpload = new Uint8Array(width * height * 4);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, elevationUpload);
      gl.bindTexture(gl.TEXTURE_2D, boundaryTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, boundaryUpload);
    }

    return {
      ok: true,
      renderer: {
        kind: "webgl2-render-experimental",
        fallbackReason: null,
        render,
      },
    };
  }

  function writeBoundaryOverlay(world, upload) {
    upload.fill(0);
    if (world.params.showBoundaries === false) return;
    const { grid } = world;
    const { btype, activeBoundary } = grid;
    for (let i = 0; i < grid.size; i += 1) {
      if (btype[i] === BoundaryType.INTERIOR || !activeBoundary[i]) continue;
      const overlayStrength = boundaryOverlayStrength(grid, i);
      if (overlayStrength <= 0) continue;
      const offset = i * 4;
      if (btype[i] === BoundaryType.CONVERGENT) {
        writeOverlayPixel(upload, offset, 231, 86, 66, 0.55 * overlayStrength);
      } else if (btype[i] === BoundaryType.DIVERGENT) {
        writeOverlayPixel(upload, offset, 77, 195, 215, 0.5 * overlayStrength);
      } else {
        writeOverlayPixel(upload, offset, 236, 196, 83, 0.46 * overlayStrength);
      }
    }
  }

  function writeOverlayPixel(upload, offset, r, g, b, alpha) {
    upload[offset] = r;
    upload[offset + 1] = g;
    upload[offset + 2] = b;
    upload[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  }

  function sphericalBoundaryOverlay(grid, id) {
    if (hasActiveBoundary(grid, id)) {
      return {
        type: grid.btype[id],
        strength: Math.max(0.45, boundaryOverlayStrength(grid, id)),
      };
    }

    const start = grid.neighborStart?.[id];
    const count = grid.neighborCount?.[id];
    const neighbors = grid.neighbors;
    if (!neighbors || start === undefined || count === undefined) return null;

    let bestType = BoundaryType.INTERIOR;
    let bestStrength = 0;
    for (let n = 0; n < count; n += 1) {
      const neighbor = neighbors[start + n];
      if (!hasActiveBoundary(grid, neighbor)) continue;
      const strength = Math.max(0.28, boundaryOverlayStrength(grid, neighbor) * 0.55);
      if (strength > bestStrength) {
        bestStrength = strength;
        bestType = grid.btype[neighbor];
      }
    }
    if (bestStrength <= 0) return null;
    return { type: bestType, strength: bestStrength };
  }

  function hasActiveBoundary(grid, id) {
    return grid.btype?.[id] !== BoundaryType.INTERIOR && Boolean(grid.activeBoundary?.[id]);
  }

  function blendedColor(base, overlay, alpha) {
    const k = Math.max(0, Math.min(1, alpha));
    return [
      Math.round(base[0] * (1 - k) + overlay[0] * k),
      Math.round(base[1] * (1 - k) + overlay[1] * k),
      Math.round(base[2] * (1 - k) + overlay[2] * k),
    ];
  }

  function isGraphBackedGrid(grid) {
    return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
  }

  function getWebGl2Context(canvas) {
    try {
      return canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    } catch {
      return null;
    }
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return null;
    }
    return program;
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      return null;
    }
    return shader;
  }


  // ---- src/render/renderBackend.js ----

  function createRenderBackend(canvas, options = {}) {
    const capabilities = options.gpuCapabilities ?? detectGpuCapabilities(options.globalObject ?? globalThis);
    const allowExperimentalGpuRender = options.experimentalGpuRender === true;

    if (allowExperimentalGpuRender && capabilities.recommendedMode !== GpuRecommendedMode.CPU) {
      const gpuResult = createExperimentalWebGlMapRenderer(canvas);
      if (gpuResult.ok) {
        return withRuntimeFallback(gpuResult.renderer, capabilities);
      }
      const cpu = createCpuMapRenderer(canvas);
      return withFallback(cpu, capabilities, gpuResult.reason);
    }

    const cpu = createCpuMapRenderer(canvas);
    const reason = allowExperimentalGpuRender
      ? capabilities.reason
      : "Experimental GPU render is disabled; CPU Canvas remains the default reliable backend.";
    return withFallback(cpu, capabilities, reason);
  }

  function withFallback(renderer, capabilities, reason) {
    return {
      ...renderer,
      kind: "cpu-canvas",
      capabilities,
      fallbackReason: reason,
      cpuFallback: true,
      render(world) {
        renderer.render(world);
        world.renderBackend = "cpu-canvas";
        world.renderFallbackReason = reason;
      },
    };
  }

  function withRuntimeFallback(gpuRenderer, capabilities) {
    let fallbackReason = null;
    return {
      ...gpuRenderer,
      capabilities,
      cpuFallback: false,
      get fallbackReason() {
        return fallbackReason;
      },
      render(world) {
        if (!fallbackReason) {
          try {
            gpuRenderer.render(world);
            if (!world.renderBackend) world.renderBackend = gpuRenderer.kind;
            world.renderFallbackReason = null;
            return;
          } catch (error) {
            fallbackReason = `Experimental GPU render failed; CPU fallback is active: ${error?.message ?? "unknown error"}`;
          }
        }
        world.renderBackend = "webgl2-render-experimental-failed";
        world.renderFallbackReason = fallbackReason;
      },
    };
  }


  // ---- src/render/map2d.js ----

  function createMapRenderer(canvas, options = {}) {
    const backend = createRenderBackend(canvas, options);

    return {
      get kind() {
        return backend.kind;
      },
      get fallbackReason() {
        return backend.fallbackReason;
      },
      render(world) {
        backend.render(world);
        if (!world.renderBackend) world.renderBackend = backend.kind;
        if (backend.fallbackReason && !world.renderFallbackReason) {
          world.renderFallbackReason = backend.fallbackReason;
        }
      },
    };
  }


  // ---- src/ui/controls.js ----
  function readParams(elements) {
    const urlParams = readUrlOnlyParams();
    const topologyMode = urlParams.topologyMode ?? elements.topologyMode?.value;
    const projectionMode = urlParams.projectionMode ?? elements.projectionMode?.value;
    const resolution = elements.resolution.value;
    const faceSize = urlParams.faceSize
      ?? optionalNumber(elements.faceSize?.value)
      ?? interactiveAutoFaceSize(topologyMode, urlParams.productionTopologyMode, resolution);
    return {
      seedText: elements.seedText.value,
      waterLevel: Number(elements.waterLevel.value),
      intensity: Number(elements.intensity.value),
      plateCount: Number(elements.plateCount.value),
      timeScale: Number(elements.timeScale.value),
      resolution,
      topologyMode,
      projectionMode,
      faceSize,
      showBoundaries: elements.showBoundaries.checked,
      pipelineMode: elements.pipelineMode?.value ?? "geology-v2",
      ...urlParams,
      topologyMode,
      projectionMode,
      faceSize,
    };
  }

  function bindControlLabels(elements) {
    const update = () => {
      elements.waterLabel.textContent = `${elements.waterLevel.value}%`;
      elements.intensityLabel.textContent = `${Number(elements.intensity.value).toFixed(2)}x`;
      elements.platesLabel.textContent = elements.plateCount.value;
      if (elements.faceSizeLabel) {
        elements.faceSizeLabel.textContent = elements.faceSize?.value ? elements.faceSize.value : "自动";
      }
    };
    elements.waterLevel.addEventListener("input", update);
    elements.intensity.addEventListener("input", update);
    elements.plateCount.addEventListener("input", update);
    elements.faceSize?.addEventListener("change", update);
    update();
  }

  function randomSeedText() {
    const roots = ["玄武", "龙骨", "晨汐", "铁雨", "青焰", "星盐", "雾冠", "赤潮"];
    const forms = ["海", "陆桥", "裂谷", "群岛", "高原", "盆地", "洋脊", "纪元"];
    const bytes = new Uint32Array(2);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      bytes[0] = Date.now() >>> 0;
      bytes[1] = Math.floor(performance.now() * 1000) >>> 0;
    }
    return `${roots[bytes[0] % roots.length]}${forms[bytes[1] % forms.length]}-${(bytes[0] ^ bytes[1]).toString(36).slice(-5)}`;
  }

  function readUrlOnlyParams() {
    let params;
    try {
      params = new URLSearchParams(globalThis.location?.search ?? "");
    } catch {
      return {};
    }

    const result = {};
    assignStringParam(result, "topologyMode", firstParam(params, ["topology", "topologyMode", "topology-mode"]));
    assignStringParam(result, "projectionMode", firstParam(params, ["projection", "projectionMode", "projection-mode"]));
    assignStringParam(
      result,
      "productionTopologyMode",
      firstParam(params, ["productionTopology", "productionTopologyMode", "production-topology"]),
    );
    assignNumberParam(result, "faceSize", firstParam(params, ["faceSize", "face-size"]));
    assignNumberParam(result, "renderWidth", firstParam(params, ["renderWidth", "render-width"]));
    assignNumberParam(result, "renderHeight", firstParam(params, ["renderHeight", "render-height"]));
    assignStringParam(result, "gpuCompute", firstParam(params, ["gpuCompute", "gpu-compute"]));
    assignStringParam(result, "gpuKernel", firstParam(params, ["gpuKernel", "gpuKernels", "gpu-kernel", "gpu-kernels"]));
    assignStringParam(result, "gpuFields", firstParam(params, ["gpuFields", "gpu-fields"]));
    assignNumberParam(result, "gpuValidateInterval", firstParam(params, ["gpuValidateInterval", "gpu-validate-interval"]));
    return result;
  }

  function firstParam(params, names) {
    for (const name of names) {
      const value = params.get(name);
      if (value !== null && value !== "") return value;
    }
    return null;
  }

  function assignStringParam(target, key, value) {
    if (value !== null) target[key] = value;
  }

  function assignNumberParam(target, key, value) {
    if (value === null || value === undefined || value === "") return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) target[key] = numeric;
  }

  function optionalNumber(value) {
    if (value === undefined || value === null || value === "") return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  function interactiveAutoFaceSize(topologyMode, productionTopologyMode, resolution) {
    if (topologyMode !== "cubed-sphere" && productionTopologyMode !== "cubed-sphere-adapter") return undefined;
    return 24;
  }


  // ---- src/main.js ----

  const elements = {
    canvas: document.querySelector("#mapCanvas"),
    seedText: document.querySelector("#seedText"),
    waterLevel: document.querySelector("#waterLevel"),
    waterLabel: document.querySelector("#waterLabel"),
    intensity: document.querySelector("#intensity"),
    intensityLabel: document.querySelector("#intensityLabel"),
    plateCount: document.querySelector("#plateCount"),
    platesLabel: document.querySelector("#platesLabel"),
    timeScale: document.querySelector("#timeScale"),
    resolution: document.querySelector("#resolution"),
    topologyMode: document.querySelector("#topologyMode"),
    projectionMode: document.querySelector("#projectionMode"),
    faceSize: document.querySelector("#faceSize"),
    faceSizeLabel: document.querySelector("#faceSizeLabel"),
    pipelineMode: document.querySelector("#pipelineMode"),
    showBoundaries: document.querySelector("#showBoundaries"),
    playPause: document.querySelector("#playPause"),
    stepOnce: document.querySelector("#stepOnce"),
    resetWorld: document.querySelector("#resetWorld"),
    randomSeed: document.querySelector("#randomSeed"),
    seedUint: document.querySelector("#seedUint"),
    stepCount: document.querySelector("#stepCount"),
    worldAge: document.querySelector("#worldAge"),
    landSea: document.querySelector("#landSea"),
    seaLevel: document.querySelector("#seaLevel"),
    plateDrift: document.querySelector("#plateDrift"),
    stepMs: document.querySelector("#stepMs"),
    causalityReport: document.querySelector("#causalityReport"),
  };

  bindControlLabels(elements);
  const gpuCapabilities = detectGpuCapabilities(globalThis);
  console.info("[gpu]", gpuCapabilities.recommendedMode, gpuCapabilities.reason);
  const gpuComputeValidator = createGpuComputeValidator(readGpuComputeOptions());
  if (gpuComputeValidator.enabled) {
    console.info("[gpu-compute]", gpuComputeValidator.mode, {
      kernels: gpuComputeValidator.kernels,
      fields: gpuComputeValidator.fields,
      interval: gpuComputeValidator.interval,
    });
  }
  const renderer = createMapRenderer(elements.canvas, {
    gpuCapabilities,
    experimentalGpuRender: readExperimentalGpuRenderFlag(),
  });
  console.info("[render]", renderer.kind, renderer.fallbackReason ?? "active");
  let world = createWorld(readParams(elements));
  world.gpuCapabilities = gpuCapabilities;
  let playing = false;
  let lastFrame = 0;
  let pendingProjectionRender = false;
  const projectionCamera = {
    lon: 0,
    lat: 0,
    zoom: 0.92,
  };
  let projectionDrag = null;
  const perfTracker = createBrowserPerfTracker(globalThis, {
    gpuComputeMode: gpuComputeValidator.mode,
  });

  bindProjectionCameraControls();
  renderAll();

  elements.playPause.addEventListener("click", () => {
    playing = !playing;
    elements.playPause.textContent = playing ? "暂停" : "播放";
    if (playing) requestAnimationFrame(loop);
  });

  elements.stepOnce.addEventListener("click", () => {
    updateWorldParams(world, readParams(elements));
    runSimulationStep();
    renderAll();
  });

  elements.resetWorld.addEventListener("click", rebuildWorld);
  elements.randomSeed.addEventListener("click", () => {
    elements.seedText.value = randomSeedText();
    rebuildWorld();
  });

  for (const element of [
    elements.seedText,
    elements.waterLevel,
    elements.intensity,
    elements.plateCount,
    elements.timeScale,
    elements.resolution,
    elements.topologyMode,
    elements.projectionMode,
    elements.faceSize,
    elements.pipelineMode,
  ]) {
    if (element) element.addEventListener("change", rebuildWorld);
  }

  elements.showBoundaries.addEventListener("change", () => {
    updateWorldParams(world, readParams(elements));
    renderAll();
  });

  function loop(now) {
    if (!playing) return;
    if (now - lastFrame > 32) {
      updateWorldParams(world, readParams(elements));
      runSimulationStep();
      renderAll();
      lastFrame = now;
    }
    requestAnimationFrame(loop);
  }

  function runSimulationStep() {
    const startedAt = performance.now();
    stepWorld(world);
    const measuredStepMs = Number.isFinite(world.lastStepMs)
      ? world.lastStepMs
      : performance.now() - startedAt;
    perfTracker.recordStep(measuredStepMs, world);
    trackGpuCompute(gpuComputeValidator.maybeValidate(world));
  }

  function trackGpuCompute(maybeResult) {
    Promise.resolve(maybeResult)
      .then((result) => {
        if (result) perfTracker.recordGpuCompute(result);
      })
      .catch((error) => {
        perfTracker.recordGpuError(error);
      });
  }

  function rebuildWorld() {
    const wasPlaying = playing;
    playing = false;
    elements.playPause.textContent = "播放";
    world = createWorld(readParams(elements));
    world.gpuCapabilities = gpuCapabilities;
    renderAll();
    if (wasPlaying) {
      playing = true;
      elements.playPause.textContent = "暂停";
      requestAnimationFrame(loop);
    }
  }

  function renderAll() {
    const startedAt = performance.now();
    applyProjectionCamera(world);
    updateProjectionCursor();
    renderer.render(world);
    perfTracker.recordRender(performance.now() - startedAt, world, {
      projection: usesInteractiveOrthographicProjection(),
    });
    updateStats(world);
  }

  function bindProjectionCameraControls() {
    const canvas = elements.canvas;
    if (!canvas) return;

    canvas.addEventListener("pointerdown", (event) => {
      if (!usesInteractiveOrthographicProjection()) return;
      projectionDrag = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      canvas.setPointerCapture?.(event.pointerId);
      updateProjectionCursor(true);
      event.preventDefault();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!projectionDrag || projectionDrag.pointerId !== event.pointerId) return;
      const dx = event.clientX - projectionDrag.lastX;
      const dy = event.clientY - projectionDrag.lastY;
      projectionDrag.lastX = event.clientX;
      projectionDrag.lastY = event.clientY;
      projectionCamera.lon = wrapLongitude(projectionCamera.lon - dx * 0.01);
      projectionCamera.lat = clamp(projectionCamera.lat + dy * 0.01, -1.45, 1.45);
      requestProjectionRender();
      event.preventDefault();
    });

    const stopDrag = (event) => {
      if (!projectionDrag || projectionDrag.pointerId !== event.pointerId) return;
      canvas.releasePointerCapture?.(event.pointerId);
      projectionDrag = null;
      updateProjectionCursor(false);
      renderAll();
    };
    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);
    canvas.addEventListener("lostpointercapture", () => {
      projectionDrag = null;
      updateProjectionCursor(false);
    });

    canvas.addEventListener("wheel", (event) => {
      if (!usesInteractiveOrthographicProjection()) return;
      projectionCamera.zoom = clamp(
        projectionCamera.zoom * Math.exp(-event.deltaY * 0.001),
        0.55,
        1.85,
      );
      requestProjectionRender();
      event.preventDefault();
    }, { passive: false });

    canvas.addEventListener("mouseenter", () => updateProjectionCursor(false));
    canvas.addEventListener("mouseleave", () => {
      if (!projectionDrag) updateProjectionCursor(false);
    });
  }

  function requestProjectionRender() {
    if (pendingProjectionRender) return;
    pendingProjectionRender = true;
    requestAnimationFrame(() => {
      pendingProjectionRender = false;
      renderAll();
    });
  }

  function applyProjectionCamera(currentWorld) {
    if (!currentWorld?.params) return;
    currentWorld.params.cameraLon = projectionCamera.lon;
    currentWorld.params.cameraLat = projectionCamera.lat;
    currentWorld.params.projectionZoom = projectionCamera.zoom;
  }

  function updateProjectionCursor(forceDragging = false) {
    const canvas = elements.canvas;
    if (!canvas) return;
    if (!usesInteractiveOrthographicProjection()) {
      canvas.style.cursor = "";
      return;
    }
    canvas.style.cursor = forceDragging || projectionDrag ? "grabbing" : "grab";
  }

  function usesInteractiveOrthographicProjection() {
    return world?.params?.projectionMode === "orthographic" && isGraphBackedGrid(world?.grid);
  }

  function isGraphBackedGrid(grid) {
    return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function wrapLongitude(value) {
    const tau = Math.PI * 2;
    return ((value + Math.PI) % tau + tau) % tau - Math.PI;
  }

  function createBrowserPerfTracker(globalObject, options = {}) {
    const sampleLimit = 180;
    const samples = {
      stepMs: [],
      renderMs: [],
      projectionRenderMs: [],
      gpuSetupMs: [],
      gpuUploadMs: [],
      gpuKernelMs: [],
      gpuDownloadMs: [],
      gpuTotalMs: [],
      gpuCandidateTotalMs: [],
    };
    const summary = {
      valid: true,
      gpuComputeMode: options.gpuComputeMode ?? "off",
      lastStep: 0,
      renderBackend: null,
      step: summarizeSamples(samples.stepMs),
      render: summarizeSamples(samples.renderMs),
      projectionRender: summarizeSamples(samples.projectionRenderMs),
      gpuCompute: {
        mode: options.gpuComputeMode ?? "off",
        valid: null,
        skipped: null,
        writebackApplied: false,
        fallbackReason: null,
        requestedFields: [],
        downloadedPacks: [],
        adapterInfo: null,
        deviceInfo: null,
        setup: summarizeSamples(samples.gpuSetupMs),
        upload: summarizeSamples(samples.gpuUploadMs),
        kernel: summarizeSamples(samples.gpuKernelMs),
        download: summarizeSamples(samples.gpuDownloadMs),
        total: summarizeSamples(samples.gpuTotalMs),
        candidateTotal: summarizeSamples(samples.gpuCandidateTotalMs),
      },
      longTask: {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: null,
      },
      updatedAt: 0,
    };

    installLongTaskObserver(globalObject, summary, publish);
    publish();

    return {
      recordStep(ms, currentWorld) {
        recordSample(samples.stepMs, ms, sampleLimit);
        summary.lastStep = currentWorld?.step ?? summary.lastStep;
        summary.step = summarizeSamples(samples.stepMs);
        publish();
      },
      recordRender(ms, currentWorld, renderOptions = {}) {
        recordSample(samples.renderMs, ms, sampleLimit);
        if (renderOptions.projection) recordSample(samples.projectionRenderMs, ms, sampleLimit);
        summary.renderBackend = currentWorld?.renderBackend ?? null;
        summary.render = summarizeSamples(samples.renderMs);
        summary.projectionRender = summarizeSamples(samples.projectionRenderMs);
        publish();
      },
      recordGpuCompute(result) {
        const timings = summarizeGpuTimings(result);
        if (Number.isFinite(timings.setupMs)) recordSample(samples.gpuSetupMs, timings.setupMs, sampleLimit);
        if (Number.isFinite(timings.uploadMs)) recordSample(samples.gpuUploadMs, timings.uploadMs, sampleLimit);
        if (Number.isFinite(timings.kernelMs)) recordSample(samples.gpuKernelMs, timings.kernelMs, sampleLimit);
        if (Number.isFinite(timings.downloadMs)) recordSample(samples.gpuDownloadMs, timings.downloadMs, sampleLimit);
        if (Number.isFinite(timings.totalGpuPathMs)) recordSample(samples.gpuTotalMs, timings.totalGpuPathMs, sampleLimit);
        if (Number.isFinite(timings.totalCandidateMs)) {
          recordSample(samples.gpuCandidateTotalMs, timings.totalCandidateMs, sampleLimit);
        }
        summary.gpuCompute = {
          mode: result.mode ?? summary.gpuCompute.mode,
          valid: result.valid ?? null,
          skipped: result.skipped ?? null,
          writebackApplied: result.writebackApplied ?? false,
          fallbackReason: result.fallbackReason ?? result.skippedReason ?? null,
          requestedFields: collectGpuCandidateMetadata(result, "requestedFields"),
          downloadedPacks: collectGpuCandidateMetadata(result, "downloadedPacks"),
          adapterInfo: collectFirstGpuCandidateMetadata(result, "adapterInfo"),
          deviceInfo: collectFirstGpuCandidateMetadata(result, "deviceInfo"),
          setup: summarizeSamples(samples.gpuSetupMs),
          upload: summarizeSamples(samples.gpuUploadMs),
          kernel: summarizeSamples(samples.gpuKernelMs),
          download: summarizeSamples(samples.gpuDownloadMs),
          total: summarizeSamples(samples.gpuTotalMs),
          candidateTotal: summarizeSamples(samples.gpuCandidateTotalMs),
        };
        publish();
      },
      recordGpuError(error) {
        summary.gpuCompute = {
          ...summary.gpuCompute,
          valid: false,
          fallbackReason: `GPU compute timing sample failed safely: ${error?.message ?? "unknown error"}`,
        };
        publish();
      },
    };

    function publish() {
      summary.updatedAt = performance.now();
      globalObject.__worldMapPerfSummary = summary;
    }
  }

  function installLongTaskObserver(globalObject, summary, publish) {
    try {
      const Observer = globalObject.PerformanceObserver;
      if (!Observer?.supportedEntryTypes?.includes("longtask")) return;
      const observer = new Observer((list) => {
        for (const entry of list.getEntries()) {
          const duration = Number(entry.duration);
          if (!Number.isFinite(duration)) continue;
          summary.longTask.count += 1;
          summary.longTask.totalMs += duration;
          summary.longTask.maxMs = Math.max(summary.longTask.maxMs, duration);
          summary.longTask.lastMs = duration;
        }
        publish();
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // Long Task API is optional; smoke tests still use step/render samples.
    }
  }

  function summarizeGpuTimings(result) {
    const totals = {
      setupMs: 0,
      uploadMs: 0,
      kernelMs: 0,
      downloadMs: 0,
      totalGpuPathMs: 0,
      totalCandidateMs: 0,
    };
    let count = 0;
    for (const candidate of result?.candidateResults ?? []) {
      const timings = candidate?.timings;
      if (!timings) continue;
      for (const key of Object.keys(totals)) {
        const value = Number(timings[key]);
        if (Number.isFinite(value)) totals[key] += value;
      }
      count += 1;
    }
    if (!count) {
      return {
        setupMs: null,
        uploadMs: null,
        kernelMs: null,
        downloadMs: null,
        totalGpuPathMs: null,
        totalCandidateMs: null,
      };
    }
    return totals;
  }

  function collectGpuCandidateMetadata(result, key) {
    const values = [];
    const seen = new Set();
    for (const candidate of result?.candidateResults ?? []) {
      for (const value of candidate?.[key] ?? []) {
        const id = String(value);
        if (seen.has(id)) continue;
        seen.add(id);
        values.push(value);
      }
    }
    return values;
  }

  function collectFirstGpuCandidateMetadata(result, key) {
    for (const candidate of result?.candidateResults ?? []) {
      if (candidate?.[key]) return candidate[key];
    }
    return null;
  }

  function recordSample(samplesList, value, limit) {
    if (!Number.isFinite(value)) return;
    samplesList.push(value);
    while (samplesList.length > limit) samplesList.shift();
  }

  function summarizeSamples(values) {
    if (!values.length) {
      return {
        count: 0,
        lastMs: null,
        averageMs: null,
        p95Ms: null,
        maxMs: null,
      };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      count: values.length,
      lastMs: roundPerf(values[values.length - 1]),
      averageMs: roundPerf(sum / values.length),
      p95Ms: roundPerf(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]),
      maxMs: roundPerf(sorted[sorted.length - 1]),
    };
  }

  function roundPerf(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  function updateStats(currentWorld) {
    const stats = currentWorld.stats;
    elements.seedUint.textContent = currentWorld.seedUint32.toString();
    elements.stepCount.textContent = currentWorld.step.toString();
    elements.worldAge.textContent = formatYears(currentWorld.ageYears);
    elements.landSea.textContent = `${Math.round(stats.landRatio * 100)}% 陆 / ${Math.round(stats.seaRatio * 100)}% 海`;
    elements.seaLevel.textContent = currentWorld.seaLevel.toFixed(3);
    elements.plateDrift.textContent = `${stats.avgPlateDrift.toFixed(1)} 格`;
    elements.stepMs.textContent = currentWorld.lastStepMs ? `${currentWorld.lastStepMs.toFixed(1)} ms` : "-";

    const mountainDelta = stats.avgMountainConvergent - stats.avgContinentalInterior;
    const sign = stats.causalityPass ? "通过" : "演化中";
    elements.causalityReport.textContent =
      `${sign}：陆块汇聚造山带均高 ${stats.avgMountainConvergent.toFixed(3)}，陆块内部均高 ${stats.avgContinentalInterior.toFixed(3)}，差值 ${mountainDelta.toFixed(3)}。` +
      ` 全部汇聚边界均值 ${stats.avgConvergent.toFixed(3)}，其中包含会降低均值的海沟。` +
      " 红色边界附近应逐步形成当前山带或海沟；蓝色离散边界在海洋抬升、陆内弱下陷；边界会随板块中心漂移。";
  }

  function formatYears(years) {
    if (years >= 100000000) return `${(years / 100000000).toFixed(2)} 亿年`;
    if (years >= 10000) return `${(years / 10000).toFixed(1)} 万年`;
    return `${years.toLocaleString("zh-CN")} 年`;
  }

  function readExperimentalGpuRenderFlag() {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? "");
      if (params.get("gpuRender") === "0" || params.get("renderBackend") === "cpu") return false;
      return true;
    } catch {
      return true;
    }
  }

  function readGpuComputeOptions() {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? "");
      return {
        mode: params.get("gpuCompute") ?? "off",
        kernels: params.get("gpuKernel") ?? params.get("gpuKernels") ?? "",
        fields: params.get("gpuFields") ?? "",
        interval: params.get("gpuValidateInterval") ?? 20,
        maxReports: params.get("gpuValidateReports") ?? 12,
        globalObject: globalThis,
      };
    } catch {
      return { mode: "off", globalObject: globalThis };
    }
  }


})();
