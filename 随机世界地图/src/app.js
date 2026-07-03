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

  function resolutionScale(grid) {
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
    return (x + 0.5) / grid.width;
  }

  function cellCenterV(grid, y) {
    return (y + 0.5) / grid.height;
  }

  function spherePointForCell(grid, x, y) {
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

    function xy(i) {
      return { x: i % width, y: Math.floor(i / width) };
    }

    function neighbors4(i) {
      const { x, y } = xy(i);
      const out = [];
      let id = index(x - 1, y);
      if (id >= 0) out.push(id);
      id = index(x + 1, y);
      if (id >= 0) out.push(id);
      id = index(x, y - 1);
      if (id >= 0) out.push(id);
      id = index(x, y + 1);
      if (id >= 0) out.push(id);
      return out;
    }

    function neighbors8(i) {
      const { x, y } = xy(i);
      const out = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (!inBoundsY(ny)) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const id = index(x + dx, ny);
          if (id >= 0) out.push(id);
        }
      }
      return out;
    }

    function neighborsRadius(i, radius) {
      const { x, y } = xy(i);
      const out = [];
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (!inBoundsY(ny)) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (Math.hypot(dx, dy) > radius + 0.01) continue;
          const id = index(x + dx, ny);
          if (id >= 0) out.push(id);
        }
      }
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
        for (const nid of neighbors4(id)) {
          if (visited[nid] || !passableFn(nid)) continue;
          visited[nid] = 1;
          queue[tail++] = nid;
        }
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
          for (const nid of neighbors4(id)) {
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
      neighbors4,
      neighbors8,
      neighborsRadius,
      distance,
      distanceXY,
      floodFill,
      connectedComponents,
      forEachCell,
      sampleWrapped,
    };
  }

  function topologyForGrid(grid) {
    if (!grid.topology) {
      grid.topology = createTopology(grid.width, grid.height, grid.topologyOptions);
    }
    return grid.topology;
  }

  function measureTopologyDiagnostics(world) {
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

  function indexOf(grid, x, y) {
    return topologyForGrid(grid).index(x, y);
  }

  function forEachNeighbor4(grid, x, y, visit) {
    const topology = topologyForGrid(grid);
    const id = topology.index(x, y);
    if (id < 0) return;
    for (const nid of topology.neighbors4(id)) {
      const nx = nid % grid.width;
      const ny = Math.floor(nid / grid.width);
      let dx = nx - x;
      if (dx > 1) dx = -1;
      if (dx < -1) dx = 1;
      visit(nx, ny, dx, ny - y);
    }
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
    const { width, height, crust } = grid;
    const threshold = -0.08 + (params.waterLevel / 100 - 0.5) * 0.78;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sphere = spherePointForCell(grid, x, y);
        const continentality = continentNoise(sphere.x * 1.45 + 17, sphere.y * 1.45 - 3, sphere.z * 1.45 + 9, 5, 2, 0.54);
        const ragged = textureNoise(sphere.x * 3.7 - 5, sphere.y * 3.7 + 13, sphere.z * 3.7 + 2, 3, 2, 0.45) * 0.18;
        crust[y * width + x] = continentality + ragged - threshold;
      }
    }
  }

  function initializeWeakness(world) {
    const { grid, textureNoise } = world;
    const { width, height, weakness, crust } = grid;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sphere = spherePointForCell(grid, x, y);
        const broad = textureNoise(sphere.x * 2.1 + 31, sphere.y * 2.1 - 17, sphere.z * 2.1 + 5, 4, 2, 0.52);
        const fine = textureNoise(sphere.x * 8.5 - 7, sphere.y * 8.5 + 3, sphere.z * 8.5 + 23, 3, 2.2, 0.45);
        const id = y * width + x;
        const coastWeakness = 1 - Math.min(1, Math.abs(crust[id]) * 2.8);
        weakness[id] = Math.max(0, Math.min(1, 0.5 + broad * 0.32 + fine * 0.16 + coastWeakness * 0.18));
      }
    }
  }

  function rebuildElevation(world) {
    const { grid, textureNoise } = world;
    const { width, height, size, crust, baseElev, relief, boundaryRelief, elev, isContinental, crustType } = grid;

    for (let i = 0; i < size; i += 1) {
      const x = i % width;
      const y = Math.floor(i / width);
      const sphere = spherePointForCell(grid, x, y);
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
    }
  }

  function initializeSeaLevel(world) {
    const seaFraction = Math.max(0.05, Math.min(0.95, world.params.waterLevel / 100));
    const initialSeaLevel = quantile(world.grid.elev, seaFraction);
    world.seaLevel = initialSeaLevel;
    world.waterVolume = measureWaterVolume(world.grid.elev, initialSeaLevel);
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
      const volume = measureWaterVolume(elev, mid);
      if (volume < world.waterVolume) lo = mid;
      else hi = mid;
    }
    world.seaLevel = (lo + hi) * 0.5;
  }

  function measureWaterVolume(elev, seaLevel) {
    let volume = 0;
    for (let i = 0; i < elev.length; i += 1) {
      if (elev[i] < seaLevel) volume += seaLevel - elev[i];
    }
    return volume;
  }

  function quantile(values, fraction) {
    const sorted = Array.from(values);
    sorted.sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * fraction)));
    return sorted[index];
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
    const { width, height, relief, boundaryInfluence, isContinental, scratch } = grid;
    const radius = physicalRadius(grid, 1);
    const scale = resolutionScale(grid);
    scratch.set(relief);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        if (inactive < 0.65 || Math.abs(scratch[id]) < 0.002) continue;
        let total = scratch[id] * 2;
        let count = 2;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx);
            const w = 1 / (1 + dist / scale);
            total += scratch[ny * width + nx] * w;
            count += w;
          }
        }
        const smooth = total / count;
        const lowRelief = Math.abs(scratch[id]) < 0.09 ? 1 : 0;
        const mix = isContinental[id] ? 0.24 + lowRelief * 0.16 : 0.52;
        relief[id] = scratch[id] * (1 - mix) + smooth * mix;
      }
    }
  }

  function healInactiveCrust(world) {
    const { grid } = world;
    const { width, height, size, crust, crustReference, boundaryInfluence, isContinental, scratch } = grid;
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
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        if (inactive < 0.6) continue;
        const coast = 1 - Math.min(1, Math.abs(scratch[id]) * 3.2);
        const oceanic = isContinental[id] ? 0 : 1;
        const mix = Math.min(0.38, inactive * (oceanic ? 0.26 : 0.06) + coast * 0.08);
        if (mix <= 0.01) continue;

        let total = scratch[id] * 3;
        let weightSum = 3;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx);
            const w = 1 / (1 + dist / scale);
            total += scratch[ny * width + nx] * w;
            weightSum += w;
          }
        }
        crust[id] = scratch[id] * (1 - mix) + (total / weightSum) * mix;
      }
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
    const { width, height } = grid;
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

  function driftPlates(world) {
    const { grid, plates, params } = world;
    if (!plates) return;
    const driftScale = plateDriftScale(world);

    for (let p = 0; p < plates.centersX.length; p += 1) {
      plates.centersX[p] = wrapX(grid.width, plates.centersX[p] + plates.vx[p] * driftScale);
      plates.centersY[p] = Math.max(0, Math.min(grid.height - 1, plates.centersY[p] + plates.vy[p] * driftScale));
      syncPlateCenterUv(grid, plates, p);
    }

    const interval = grid.size >= 131072 ? 3 : 2;
    if (world.step > 0 && world.step % interval !== 0) return;
    rasterizePlates(world);
  }

  function syncPlateCenterUv(grid, plates, p) {
    if (!plates.centersU || !plates.centersV) return;
    plates.centersU[p] = wrapX(grid.width, plates.centersX[p]) / grid.width;
    plates.centersV[p] = Math.max(0, Math.min(1, plates.centersY[p] / grid.height));
  }

  function plateDriftScale(world) {
    return 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(world.grid);
  }

  function rasterizePlates(world) {
    const { grid, plates } = world;
    const { width, height, size, plate, pvx, pvy, weakness, crust } = grid;
    const maxCost = size * 8;
    const cost = new Float32Array(size);
    const q = new Int32Array(size * 8);
    let head = 0;
    let tail = 0;
    plate.fill(-1);
    cost.fill(Infinity);

    for (let p = 0; p < plates.centersX.length; p += 1) {
      const x = Math.floor(wrapX(width, plates.centersX[p]));
      const y = Math.max(0, Math.min(height - 1, Math.floor(plates.centersY[p])));
      const id = y * width + x;
      plate[id] = p;
      cost[id] = 0;
      q[tail] = id;
      tail += 1;
    }

    while (head < tail) {
      const base = q[head];
      const p = plate[base];
      const x = base % width;
      const y = Math.floor(base / width);
      head += 1;
      forEachNeighbor8(grid, x, y, (nx, ny, weight) => {
        const nid = ny * width + nx;
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
    const { width, height, size, plate, boundaryDistance, boundaryInfluence, weakness } = grid;
    const bandRadius = physicalRadius(grid, 4);
    boundaryDistance.fill(9999);
    boundaryInfluence.fill(0);
    const q = new Int32Array(size);
    let head = 0;
    let tail = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        let edge = false;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          if (plate[ny * width + nx] !== plate[id]) edge = true;
        });
        if (edge) {
          boundaryDistance[id] = 0;
          q[tail++] = id;
        }
      }
    }

    while (head < tail) {
      const id = q[head++];
      const x = id % width;
      const y = Math.floor(id / width);
      const d = boundaryDistance[id] + 1;
      if (d > bandRadius) continue;
      forEachNeighbor4(grid, x, y, (nx, ny) => {
        const nid = ny * width + nx;
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
    const { width, height, plate, pvx, pvy, btype, stress, activeBoundary } = grid;
    btype.fill(BoundaryType.INTERIOR);
    stress.fill(0);
    activeBoundary.fill(0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const currentPlate = plate[id];
        let convergent = 0;
        let divergent = 0;
        let shear = 0;
        let touchesBoundary = false;

        inspectNeighbor(grid, x, y, x + 1, y, 1, 0, currentPlate, id, (dot, tangential) => {
          touchesBoundary = true;
          if (dot > 0.02) convergent += dot;
          else if (dot < -0.02) divergent += -dot;
          shear += Math.abs(tangential);
        });
        inspectNeighbor(grid, x, y, x, y + 1, 0, 1, currentPlate, id, (dot, tangential) => {
          touchesBoundary = true;
          if (dot > 0.02) convergent += dot;
          else if (dot < -0.02) divergent += -dot;
          shear += Math.abs(tangential);
        });

        if (!touchesBoundary) continue;
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
      }
    }
  }

  function inspectNeighbor(grid, x, y, nxRaw, ny, dx, dy, currentPlate, id, visit) {
    if (ny < 0 || ny >= grid.height) return;
    const nx = wrapX(grid.width, nxRaw);
    const nid = indexOf(grid, nx, ny);
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
    const { width, height, size, relief, boundaryRelief, crust, btype, stress, uplift, isContinental, boundaryInfluence, weakness } = grid;
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

    spreadBoundaryEffects(grid, width, height, strength);
    smoothPersistentUplift(grid, width, height);
    for (let i = 0; i < size; i += 1) {
      relief[i] = Math.max(-0.45, Math.min(1.25, relief[i] + uplift[i]));
      crust[i] = Math.max(-1.4, Math.min(1.4, crust[i]));
    }

    smoothCrustNearBoundaries(grid, width, height);
    smoothBoundaryRelief(grid, width, height);
    rebuildElevation(world);
  }

  function advectContinentalCrust(world) {
    const { grid } = world;
    const {
      width,
      height,
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

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
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
      }
    }
    rebuildElevation(world);
  }

  function sampleBilinear(grid, field, x, y) {
    const { width, height } = grid;
    const sx = wrapX(width, x);
    const sy = Math.max(0, Math.min(height - 1.001, y));
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = wrapX(width, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = sx - x0;
    const ty = sy - y0;
    const i00 = y0 * width + x0;
    const i10 = y0 * width + x1;
    const i01 = y1 * width + x0;
    const i11 = y1 * width + x1;
    const a = field[i00] * (1 - tx) + field[i10] * tx;
    const b = field[i01] * (1 - tx) + field[i11] * tx;
    return a * (1 - ty) + b * ty;
  }

  function spreadBoundaryEffects(grid, width, height, strength) {
    const { uplift, boundaryRelief, crust, btype, stress, isContinental, boundaryInfluence, weakness } = grid;
    const effectRadius = physicalRadius(grid, 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const type = btype[id];
        if (type === BoundaryType.INTERIOR) continue;
        const s = Math.min(stress[id], 2.5);
        forEachNeighborRadius(grid, x, y, effectRadius, (nx, ny, weight) => {
          const nid = ny * width + nx;
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
      }
    }
  }

  function smoothPersistentUplift(grid, width, height) {
    const { uplift, scratch, isContinental, boundaryInfluence, weakness } = grid;
    const upliftRadius = physicalRadius(grid, 3);
    scratch.set(uplift);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (!isContinental[id]) continue;
        if (boundaryInfluence[id] < 0.05 && Math.abs(scratch[id]) < 0.000001) continue;
        let total = scratch[id] * 2.8;
        let weightSum = 2.8;
        let signal = Math.abs(scratch[id]) * 2.8;
        forEachNeighborRadius(grid, x, y, upliftRadius, (nx, ny, weight) => {
          const nid = ny * width + nx;
          if (!isContinental[nid]) return;
          const belt = Math.max(0.15, boundaryInfluence[nid]);
          const rough = 0.78 + weakness[nid] * 0.44;
          const w = weight * belt * rough;
          const warped = warpedNeighborId(grid, nx, ny, weakness[nid]);
          total += scratch[warped] * w;
          weightSum += w;
          signal += Math.abs(scratch[warped]) * w;
        });
        if (signal < 0.000001) continue;
        uplift[id] = total / weightSum;
      }
    }
  }

  function forEachNeighbor8(grid, x, y, visit) {
    const { width, height } = grid;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrapX(width, x + dx);
        visit(nx, ny, dx === 0 || dy === 0 ? 1 : 0.55);
      }
    }
  }

  function forEachNeighborRadius(grid, x, y, radius, visit) {
    const { width, height } = grid;
    const scale = resolutionScale(grid);
    for (let dy = -radius; dy <= radius; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius + 0.01) continue;
        const nx = wrapX(width, x + dx);
        visit(nx, ny, 1 / (1 + (dist / scale) * 1.35));
      }
    }
  }

  function smoothCrustNearBoundaries(grid, width, height) {
    const { crust, boundaryInfluence, isContinental, scratch } = grid;
    scratch.set(crust);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const influence = boundaryInfluence[id];
        if (influence < 0.35) continue;
        let total = scratch[id] * 2;
        let count = 2;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          total += scratch[ny * width + nx];
          count += 1;
        });
        const mix = influence * (isContinental[id] ? 0.08 : 0.18);
        crust[id] = scratch[id] * (1 - mix) + (total / count) * mix;
      }
    }
  }

  function smoothBoundaryRelief(grid, width, height) {
    const { boundaryRelief, scratch, boundaryInfluence, weakness } = grid;
    const reliefRadius = physicalRadius(grid, 3);
    scratch.set(boundaryRelief);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (boundaryInfluence[id] < 0.05 && Math.abs(scratch[id]) < 0.0001) continue;
        let total = scratch[id] * 2.4;
        let weightSum = 2.4;
        let signal = Math.abs(scratch[id]) * 2.4;
        forEachNeighborRadius(grid, x, y, reliefRadius, (nx, ny, weight) => {
          const nid = ny * width + nx;
          const band = Math.max(0.08, boundaryInfluence[nid]);
          const rough = 0.7 + weakness[nid] * 0.5;
          const w = weight * band * rough;
          const warped = warpedNeighborId(grid, nx, ny, weakness[nid]);
          total += scratch[warped] * w;
          weightSum += w;
          signal += Math.abs(scratch[warped]) * w;
        });
        if (signal < 0.0001) continue;
        boundaryRelief[id] = total / weightSum;
      }
    }
  }

  function warpedNeighborId(grid, x, y, weak) {
    const bend = Math.round((weak - 0.5) * 2 * resolutionScale(grid));
    const nx = wrapX(grid.width, x + bend);
    const ny = Math.max(0, Math.min(grid.height - 1, y - bend));
    return ny * grid.width + nx;
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
    const drift = 0.1 * world.timeScaleFactor * Math.max(0, params.intensity) * resolutionScale(grid);
    for (let p = 0; p < plates.centersX.length; p += 1) {
      plates.centersX[p] = wrapX(grid.width, plates.centersX[p] + plates.vx[p] * drift);
      plates.centersY[p] = Math.max(0, Math.min(grid.height - 1, plates.centersY[p] + plates.vy[p] * drift));
      syncPlateCenterUv(grid, plates, p);
    }
  }

  function rasterizePlatesV2(world) {
    const { grid, plates } = world;
    if (!plates) return;
    const { width, height, size, plate, pvx, pvy, weakness, crustThickness } = grid;
    const cost = new Float32Array(size);
    const q = new Int32Array(size * 8);
    let head = 0;
    let tail = 0;
    plate.fill(-1);
    cost.fill(Infinity);

    for (let p = 0; p < plates.centersX.length; p += 1) {
      const x = Math.floor(wrapX(width, plates.centersX[p]));
      const y = Math.max(0, Math.min(height - 1, Math.floor(plates.centersY[p])));
      const id = y * width + x;
      plate[id] = p;
      cost[id] = 0;
      q[tail++] = id;
    }

    while (head < tail) {
      const id = q[head++];
      const p = plate[id];
      const x = id % width;
      const y = Math.floor(id / width);
      forEachNeighbor8Local(grid, x, y, (nx, ny, weight) => {
        const nid = ny * width + nx;
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

  function advectCrustByPlateMotion(world) {
    const { grid } = world;
    const interval = 4;
    if (world.step > 0 && world.step % interval !== 0) return;

    const {
      width,
      height,
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

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
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
      }
    }

    // Keep legacy compatibility fields coherent without making them the source of truth.
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
    const sx = wrapX(grid.width, x);
    const sy = Math.max(0, Math.min(grid.height - 1.001, y));
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = wrapX(grid.width, x0 + 1);
    const y1 = Math.min(grid.height - 1, y0 + 1);
    const tx = sx - x0;
    const ty = sy - y0;
    const a = field[y0 * grid.width + x0] * (1 - tx) + field[y0 * grid.width + x1] * tx;
    const b = field[y1 * grid.width + x0] * (1 - tx) + field[y1 * grid.width + x1] * tx;
    return a * (1 - ty) + b * ty;
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

  function forEachNeighbor8Local(grid, x, y, visit) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        visit(wrapX(grid.width, x + dx), ny, dx === 0 || dy === 0 ? 1 : Math.SQRT2);
      }
    }
  }

  function cleanupPlateCheckerboards(grid) {
    const { width, height, size, plate } = grid;
    const next = new Int32Array(plate);
    let maxPlate = 0;
    for (let i = 0; i < size; i += 1) if (plate[i] > maxPlate) maxPlate = plate[i];
    const counts = new Int16Array(maxPlate + 1);
    const touched = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const current = plate[id];
        touched.length = 0;
        let same = 0;
        let majorityPlate = current;
        let majorityCount = 0;
        forEachNeighbor8Local(grid, x, y, (nx, ny) => {
          const other = plate[ny * width + nx];
          if (other === current) same += 1;
          if (counts[other] === 0) touched.push(other);
          const count = counts[other] + 1;
          counts[other] = count;
          if (count > majorityCount) {
            majorityCount = count;
            majorityPlate = other;
          }
        });

        const checker = isCheckerboardCell(grid, x, y);
        if ((majorityCount >= 5 && same <= 2) || (checker && majorityCount >= 4 && same <= 3)) {
          next[id] = majorityPlate;
        }
        for (const p of touched) counts[p] = 0;
      }
    }
    plate.set(next);
  }

  function isCheckerboardCell(grid, x, y) {
    for (let dy = -1; dy <= 0; dy += 1) {
      const y0 = y + dy;
      const y1 = y0 + 1;
      if (y0 < 0 || y1 >= grid.height) continue;
      for (let dx = -1; dx <= 0; dx += 1) {
        const x0 = wrapX(grid.width, x + dx);
        const x1 = wrapX(grid.width, x + dx + 1);
        const a = grid.plate[y0 * grid.width + x0];
        const b = grid.plate[y0 * grid.width + x1];
        const c = grid.plate[y1 * grid.width + x0];
        const d = grid.plate[y1 * grid.width + x1];
        if (a === d && b === c && a !== b) return true;
      }
    }
    return false;
  }

  function syncPlateCenterUv(grid, plates, p) {
    if (!plates.centersU || !plates.centersV) return;
    plates.centersU[p] = wrapX(grid.width, plates.centersX[p]) / grid.width;
    plates.centersV[p] = Math.max(0, Math.min(1, plates.centersY[p] / grid.height));
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
      width,
      height,
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
      while (head < tail) {
        const id = queue[head++];
        const nextDistance = ridgeDistance[id] + 1;
        const x = id % width;
        const y = Math.floor(id / width);
        visitNeighbor4(grid, x, y, (nid) => {
          if (crustType[nid] !== CrustType.OCEANIC) return;
          if (nextDistance >= ridgeDistance[nid]) return;
          ridgeDistance[nid] = nextDistance;
          queue[tail++] = nid;
        });
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

    scratch2.set(crustAge);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (crustType[id] !== CrustType.OCEANIC || ridgeDistance[id] <= 1) continue;
        let total = scratch2[id] * 2.5;
        let weight = 2.5;
        visitNeighbor4(grid, x, y, (nid) => {
          if (crustType[nid] !== CrustType.OCEANIC || Math.abs(ridgeDistance[nid] - ridgeDistance[id]) > 3) return;
          total += scratch2[nid];
          weight += 1;
        });
        crustAge[id] = Math.min(1, total / weight);
      }
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

  function visitNeighbor4(grid, x, y, visit) {
    visit(y * grid.width + wrapX(grid.width, x - 1));
    visit(y * grid.width + wrapX(grid.width, x + 1));
    if (y > 0) visit((y - 1) * grid.width + x);
    if (y < grid.height - 1) visit((y + 1) * grid.width + x);
  }


  // ---- src/sim/geology/boundaries.js ----

  function updatePlateBoundaries(world) {
    updatePlateBoundariesV2(world);
    classifyBoundaryKindV2(world);
  }

  function updatePlateBoundariesV2(world) {
    const { grid } = world;
    const { width, height, size, plate, boundaryDistance, boundaryInfluence, weakness, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
    const radius = physicalRadius(grid, 4);
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

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        let edge = false;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          if (plate[ny * width + nx] !== plate[id]) edge = true;
        });
        if (edge) {
          boundaryDistance[id] = 0;
          activeBoundary[id] = 1;
          q[tail++] = id;
        }
      }
    }

    deriveBoundaryCoherence(grid);

    while (head < tail) {
      const id = q[head++];
      const x = id % width;
      const y = Math.floor(id / width);
      const nextDistance = boundaryDistance[id] + 1;
      if (nextDistance > radius) continue;
      forEachNeighbor4(grid, x, y, (nx, ny) => {
        const nid = ny * width + nx;
        if (nextDistance < boundaryDistance[nid]) {
          boundaryDistance[nid] = nextDistance;
          q[tail++] = nid;
        }
      });
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

  function classifyBoundaryKindV2(world) {
    const { grid } = world;
    const { width, height, size, plate, pvx, pvy, btype, boundaryKind, stress, activeBoundary, boundaryCoherence, noisyBoundaryPatch } = grid;
    btype.fill(BoundaryType.INTERIOR);
    boundaryKind.fill(BoundaryType.INTERIOR);
    stress.fill(0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const currentPlate = plate[id];
        let convergent = 0;
        let divergent = 0;
        let shear = 0;
        let touches = false;

        inspectBoundaryNeighbor(grid, x, y, wrapX(width, x + 1), y, 1, 0, currentPlate, id, (normal, tangent) => {
          touches = true;
          if (normal > 0.02) convergent += normal;
          else if (normal < -0.02) divergent += -normal;
          shear += Math.abs(tangent);
        });
        if (y < height - 1) {
          inspectBoundaryNeighbor(grid, x, y, x, y + 1, 0, 1, currentPlate, id, (normal, tangent) => {
            touches = true;
            if (normal > 0.02) convergent += normal;
            else if (normal < -0.02) divergent += -normal;
            shear += Math.abs(tangent);
          });
        }

        if (!touches) continue;
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
      }
    }

    for (let i = 0; i < size; i += 1) {
      if (boundaryKind[i] === BoundaryType.INTERIOR && grid.boundaryInfluence[i] > 0.01) {
        boundaryKind[i] = nearestBoundaryKind(grid, i);
      }
    }
  }

  function deriveBoundaryCoherence(grid) {
    const { width, height, plate, activeBoundary, boundaryDensity, boundaryCoherence, noisyBoundaryPatch, plateCheckerboard } = grid;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        let boundaryCount = 0;
        let cells = 0;
        let same = 0;
        let different = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
            cells += 1;
            if (activeBoundary[nid]) boundaryCount += 1;
            if (nid === id) continue;
            if (plate[nid] === plate[id]) same += 1;
            else different += 1;
          }
        }

        const density = cells ? boundaryCount / cells : 0;
        const checker = checkerboardRiskAt(grid, x, y);
        const islandNoise = same <= 2 && different >= 5 ? 1 : 0;
        const coherence = Math.max(0, Math.min(1, 1 - Math.max(0, density - 0.42) * 1.35 - checker * 0.75 - islandNoise * 0.55));
        boundaryDensity[id] = density;
        plateCheckerboard[id] = checker;
        boundaryCoherence[id] = coherence;
        if (density > 0.66 || checker > 0.4 || islandNoise) noisyBoundaryPatch[id] = 1;
      }
    }
  }

  function checkerboardRiskAt(grid, x, y) {
    let risk = 0;
    for (let dy = -1; dy <= 0; dy += 1) {
      const y0 = y + dy;
      const y1 = y0 + 1;
      if (y0 < 0 || y1 >= grid.height) continue;
      for (let dx = -1; dx <= 0; dx += 1) {
        const x0 = wrapX(grid.width, x + dx);
        const x1 = wrapX(grid.width, x + dx + 1);
        const a = grid.plate[y0 * grid.width + x0];
        const b = grid.plate[y0 * grid.width + x1];
        const c = grid.plate[y1 * grid.width + x0];
        const d = grid.plate[y1 * grid.width + x1];
        if (a === d && b === c && a !== b) risk = 1;
      }
    }
    return risk;
  }

  function inspectBoundaryNeighbor(grid, x, y, nx, ny, dx, dy, currentPlate, id, visit) {
    if (ny < 0 || ny >= grid.height) return;
    const nid = ny * grid.width + nx;
    if (grid.plate[nid] === currentPlate) return;
    const rvx = grid.pvx[id] - grid.pvx[nid];
    const rvy = grid.pvy[id] - grid.pvy[nid];
    visit(rvx * dx + rvy * dy, rvx * -dy + rvy * dx);
  }

  function nearestBoundaryKind(grid, id) {
    const x = id % grid.width;
    const y = Math.floor(id / grid.width);
    let best = BoundaryType.INTERIOR;
    forEachNeighbor4(grid, x, y, (nx, ny) => {
      const kind = grid.boundaryKind[ny * grid.width + nx];
      if (kind !== BoundaryType.INTERIOR) best = kind;
    });
    return best;
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

    for (let i = 0; i < size; i += 1) {
      const active = Math.min(1, boundaryInfluence[i]);
      const s = Math.min(2.5, stress[i]);
      if (active <= 0.012 || s <= 0.008) continue;
      const coherence = Math.max(0, Math.min(1, boundaryCoherence[i] ?? 1));
      const noisyGate = noisyBoundaryPatch[i] ? 0.06 : 1;
      const checkerGate = Math.max(0, 1 - (plateCheckerboard[i] ?? 0) * 2.4);
      const memoryPull = 0.55 + Math.min(0.45, oldOrogeny[i] * 0.8 + transformMemory[i] * 0.2 + fractureZoneMemory[i] * 0.12);
      const seedPower = active * s * (0.2 + coherence * 0.8) * noisyGate * checkerGate * memoryPull;
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

  function naturalizeAxis(grid, source, target, referenceRadius, gain, options = {}) {
    const { width, height, size, weakness, oldOrogeny, riftStage, transformMemory, fractureZoneMemory, crustType, noisyBoundaryPatch, plateCheckerboard } = grid;
    const radius = Math.max(1, Math.min(physicalRadius(grid, referenceRadius), physicalRadius(grid, 8)));
    const seedSource = new Float32Array(source);
    const spread = new Float32Array(size);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const seed = seedSource[id];
        if (seed <= 0.0001) continue;
        const pull = weakness[id] - 0.5 + oldOrogeny[id] * 0.18 + (riftStage[id] > 0 ? 0.12 : 0) + transformMemory[id] * 0.08 - fractureZoneMemory[id] * 0.04;
        const bendX = Math.round(pull * radius * 1.15 + (hash2(Math.floor(x / 13), Math.floor(y / 9)) - 0.5) * radius * 0.8);
        const bendY = Math.round((hash2(Math.floor((x + 5) / 17), Math.floor((y + 3) / 11)) - 0.5) * radius * 0.7);
        const segment = segmentMask(x, y, weakness[id], options.segmented);
        const arcShift = options.arcBend ? Math.max(1, Math.round(radius * 0.55)) : 0;

        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy + bendY + arcShift;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx + bendX);
            const nid = ny * width + nx;
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
      }
    }

    for (let i = 0; i < size; i += 1) {
      if (spread[i] > 0) target[i] = Math.min(1, Math.max(target[i], spread[i]));
    }
  }

  function rebuildCombinedAxis(grid) {
    const { size, tectonicAxis, mountainAxisSeed, ridgeAxis, trenchAxis, riftAxis } = grid;
    for (let i = 0; i < size; i += 1) {
      tectonicAxis[i] = Math.max(mountainAxisSeed[i], ridgeAxis[i] * 0.9, trenchAxis[i] * 0.95, riftAxis[i] * 0.82);
    }
  }

  function measureAxisDiagnostics(grid) {
    const { width, height, tectonicAxis, axisCurvature, axisContinuity, axisBoundaryDependency, axisSegmentId, boundaryInfluence, activeBoundary, scratch } = grid;
    scratch.fill(0);
    let nextSegment = 1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const v = tectonicAxis[id];
        if (v <= 0.035) {
          axisCurvature[id] = 0;
          axisContinuity[id] = 0;
          axisBoundaryDependency[id] = 0;
          axisSegmentId[id] = 0;
          continue;
        }

        const left = tectonicAxis[y * width + wrapX(width, x - 1)];
        const right = tectonicAxis[y * width + wrapX(width, x + 1)];
        const up = tectonicAxis[Math.max(0, y - 1) * width + x];
        const down = tectonicAxis[Math.min(height - 1, y + 1) * width + x];
        const dx = Math.abs(left - right);
        const dy = Math.abs(up - down);
        const localMax = Math.max(left, right, up, down);
        axisCurvature[id] = Math.min(1, Math.abs(dx - dy) * 4 + Math.min(dx + dy, 1) * 0.25);
        axisContinuity[id] = Math.min(1, (localMax + v) * 0.5);
        axisBoundaryDependency[id] = Math.min(1, v * 0.45 + boundaryInfluence[id] * 0.45 + (activeBoundary[id] ? 0.1 : 0));
      }
    }

    for (let i = 0; i < axisSegmentId.length; i += 1) axisSegmentId[i] = 0;
    const queue = new Int32Array(axisSegmentId.length);
    for (let start = 0; start < axisSegmentId.length; start += 1) {
      if (tectonicAxis[start] <= 0.06 || axisSegmentId[start]) continue;
      const segmentId = nextSegment++;
      let head = 0;
      let tail = 0;
      axisSegmentId[start] = segmentId;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        const x = id % width;
        const y = Math.floor(id / width);
        visitNeighbor4(grid, x, y, (nid) => {
          if (tectonicAxis[nid] <= 0.06 || axisSegmentId[nid]) return;
          axisSegmentId[nid] = segmentId;
          queue[tail++] = nid;
        });
      }
    }
  }

  function measureFieldBlockiness(grid, field, output) {
    const { width, height } = grid;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const v = field[id];
        if (v <= 0.0001) {
          output[id] = 0;
          continue;
        }
        const left = field[y * width + wrapX(width, x - 1)];
        const right = field[y * width + wrapX(width, x + 1)];
        const up = field[Math.max(0, y - 1) * width + x];
        const down = field[Math.min(height - 1, y + 1) * width + x];
        const cardinal = Math.abs(left - right) + Math.abs(up - down);
        const diagonal = Math.abs(sample(grid, field, x - 1, y - 1) - sample(grid, field, x + 1, y + 1))
          + Math.abs(sample(grid, field, x + 1, y - 1) - sample(grid, field, x - 1, y + 1));
        output[id] = Math.min(1, Math.abs(cardinal - diagonal) * 2.8);
      }
    }
  }

  function measureFieldContinuity(grid, field, output) {
    const { width, height } = grid;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const v = field[id];
        if (v <= 0.0001) {
          output[id] = 0;
          continue;
        }
        let neighbors = 0;
        visitNeighbor4(grid, x, y, (nid) => {
          if (field[nid] > v * 0.35) neighbors += 1;
        });
        output[id] = neighbors / 4;
      }
    }
  }

  function segmentMask(x, y, weakness, forceSegmented) {
    const coarse = hash2(Math.floor((x + 3) / 19), Math.floor((y + 5) / 13));
    const fine = hash2(Math.floor((x + 11) / 7), Math.floor((y + 2) / 7));
    const keep = forceSegmented ? 0.62 + weakness * 0.28 : 0.76 + weakness * 0.2;
    return coarse * 0.7 + fine * 0.3 <= keep ? 1 : 0.72;
  }

  function hash2(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function visitNeighbor4(grid, x, y, visit) {
    visit(y * grid.width + wrapX(grid.width, x - 1));
    visit(y * grid.width + wrapX(grid.width, x + 1));
    if (y > 0) visit((y - 1) * grid.width + x);
    if (y < grid.height - 1) visit((y + 1) * grid.width + x);
  }

  function sample(grid, field, x, y) {
    const sy = Math.max(0, Math.min(grid.height - 1, y));
    return field[sy * grid.width + wrapX(grid.width, x)];
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

    for (let i = 0; i < size; i += 1) {
      const active = Math.min(1, boundaryInfluence[i]);
      const s = Math.min(2.5, stress[i]);
      if (active <= 0.015 || s <= 0.01) continue;
      const weak = weakness[i];
      const weakGate = weak > 0.34 ? 1 : weak > 0.22 ? 0.45 : 0.12;
      const broken = weak < 0.3 && ((i * 1103515245 + 12345) & 7) < 3 ? 0.35 : 1;
      const coherenceFactor = noisyBoundaryPatch[i] ? 0.12 : 0.35 + (boundaryCoherence[i] ?? 1) * 0.65;
      const signal = active * s * weakGate * broken * coherenceFactor;
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
    const { width, height, size, crustType, weakness } = grid;
    const radius = Math.max(1, Math.min(physicalRadius(grid, referenceRadius), physicalRadius(grid, 8)));
    const spread = new Float32Array(size);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const seed = source[id];
        if (seed <= 0.0001) continue;
        const bend = Math.round((weakness[id] - 0.5) * radius * 0.9);
        const arcShift = options.arcOffset ? Math.max(1, Math.round(radius * 0.75)) : 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy + (options.arcOffset ? arcShift : 0);
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx + bend);
            const nid = ny * width + nx;
            if (options.continentalOnly && crustType[nid] !== CrustType.CONTINENTAL) continue;
            if (options.oceanicBias && crustType[nid] !== CrustType.OCEANIC && dist > radius * 0.45) continue;
            const weak = weakness[nid];
            if (weak < (options.minWeakness ?? 0) && dist > 1.5) continue;
            if (options.segmented && weak < 0.38 && segmentMask(nx, ny, weak) < 0.8) continue;
            const falloff = Math.max(0, 1 - dist / (radius + 0.5));
            const weakWeight = 0.45 + weak * 0.9;
            const addition = seed * gain * falloff * weakWeight;
            if (addition > spread[nid]) spread[nid] = addition;
          }
        }
      }
    }
    for (let i = 0; i < size; i += 1) {
      if (spread[i] > 0) target[i] = Math.min(1, target[i] + spread[i]);
    }
  }

  function segmentMask(x, y, weakness) {
    const sx = Math.floor((x + 5) / 11);
    const sy = Math.floor((y + 3) / 9);
    const n = hash2(sx, sy);
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
    const { width, height, oldOrogeny, orogeny, orogenyAge, weakness, crustType, boundaryInfluence, scratch, scratch2, scratch3 } = grid;
    const radius = Math.max(2, physicalRadius(grid, 5));
    scratch.set(oldOrogeny);
    scratch2.set(orogenyAge);
    scratch3.set(orogeny);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        const sourceMemory = Math.max(scratch[id], scratch3[id] * inactive * 0.85);
        if (sourceMemory < 0.0035) continue;
        const rootMemory = sourceMemory + Math.max(0, scratch2[id] - 0.35) * sourceMemory * 0.45;
        const bend = Math.round((weakness[id] - 0.5) * radius * 0.9);
        let total = rootMemory * 3.5;
        let ageTotal = scratch2[id] * 3.5;
        let weight = 3.5;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const dist = Math.hypot(dx, dy);
            if (dist < 0.01 || dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx + bend);
            const nid = ny * width + nx;
            if (crustType[nid] === CrustType.OCEANIC) continue;
            const falloff = (1 - dist / (radius + 0.5)) * (0.55 + weakness[nid] * 0.65);
            if (falloff <= 0) continue;
            const neighborInactive = 1 - Math.min(1, boundaryInfluence[nid]);
            const neighborSource = Math.max(scratch[nid], scratch3[nid] * neighborInactive * 0.85);
            const neighborMemory = neighborSource + Math.max(0, scratch2[nid] - 0.35) * neighborSource * 0.45;
            total += neighborMemory * falloff;
            ageTotal += scratch2[nid] * falloff;
            weight += falloff;
          }
        }
        const smooth = total / weight;
        const ageSmooth = ageTotal / weight;
        const segment = segmentMask(x, y, width, weakness[id]);
        const mix = Math.min(0.42, 0.1 + inactive * 0.26);
        oldOrogeny[id] = Math.min(1, Math.max(sourceMemory, scratch[id] * (1 - mix) + smooth * mix) * segment);
        orogenyAge[id] = Math.max(scratch2[id], ageSmooth * 0.98);
      }
    }
  }

  function updateForelandBasins(grid) {
    const { width, height, activeOrogeny, oldOrogeny, forelandBasin, crustType, elev, ridge, trench, basin, sediment, scratch } = grid;
    const radius = Math.max(1, physicalRadius(grid, 5));
    scratch.fill(0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const source = Math.max(activeOrogeny[id], oldOrogeny[id] * 0.55);
        if (source < 0.04) continue;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const dist = Math.hypot(dx, dy);
            if (dist < 1 || dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
            const continentalFamily = crustType[nid] === CrustType.CONTINENTAL || crustType[nid] === CrustType.TRANSITIONAL;
            if (!continentalFamily) continue;
            const lowRelief = Math.max(0, 1 - Math.max(0, elev[nid]) * 5.5);
            const activeMarginPenalty = Math.max(ridge[nid], trench[nid]) > 0.08 ? 0.25 : 1;
            const falloff = Math.max(0, 1 - dist / (radius + 0.5));
            const value = source * falloff * lowRelief * activeMarginPenalty * 0.32;
            if (value > scratch[nid]) scratch[nid] = value;
          }
        }
      }
    }

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

  function hash2(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function smoothAxisField(grid, source, target) {
    const { width, height, scratch2 } = grid;
    scratch2.set(source);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        let total = scratch2[id] * 2.2;
        let weight = 2.2;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
            const w = dx === 0 || dy === 0 ? 0.72 : 0.38;
            total += scratch2[nid] * w;
            weight += w;
          }
        }
        target[id] = Math.min(1, total / weight);
      }
    }
  }

  function smoothMountainHeightField(grid, source, target) {
    const { width, height, mountainAxis, scratch2 } = grid;
    scratch2.set(source);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (scratch2[id] <= 0.0001 && mountainAxis[id] <= 0.025) {
          target[id] = 0;
          continue;
        }
        let total = scratch2[id] * 2.8;
        let weight = 2.8;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
            const axisWeight = 0.3 + Math.min(1, Math.max(mountainAxis[id], mountainAxis[nid]) * 1.4);
            const w = (dx === 0 || dy === 0 ? 0.68 : 0.36) * axisWeight;
            total += scratch2[nid] * w;
            weight += w;
          }
        }
        target[id] = total / weight;
      }
    }
  }

  function smoothBarrierField(grid, source, target) {
    const { width, height, mountainAxis, scratch2 } = grid;
    scratch2.set(source);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (source[id] <= 0.0001 && mountainAxis[id] <= 0.03) {
          target[id] = 0;
          continue;
        }
        let total = source[id] * 2.4;
        let weight = 2.4;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
            const w = (dx === 0 || dy === 0 ? 0.8 : 0.45) * (0.35 + Math.min(1, mountainAxis[nid] * 1.2));
            total += scratch2[nid] * w;
            weight += w;
          }
        }
        target[id] = total / weight;
      }
    }
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
    let largestSize = 0;

    for (let id = 1; id < components.componentSizes.length; id += 1) {
      const componentSize = components.componentSizes[id] ?? 0;
      if (componentSize > largestSize) {
        largestSize = componentSize;
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

    const refreshDistance = !world.geologyV2MarginDistanceInitialized || world.step % 4 === 0;
    if (refreshDistance) {
      const landMask = new Uint8Array(size);
      const coastMask = new Uint8Array(size);
      for (let i = 0; i < size; i += 1) {
        if (elev[i] >= seaLevel) landMask[i] = 1;
      }

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const id = y * width + x;
          let coast = false;
          forEachNeighbor4(grid, x, y, (nx, ny) => {
            if (landMask[ny * width + nx] !== landMask[id]) coast = true;
          });
          if (coast) coastMask[id] = 1;
        }
      }

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
    const { width, size } = grid;
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
      const x = id % width;
      const y = Math.floor(id / width);
      const next = scratch[id] + 1;
      forEachNeighbor4(grid, x, y, (nx, ny) => {
        const nid = ny * width + nx;
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
    const { width, height, scratch } = grid;
    for (const field of fields) {
      scratch.set(field);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const id = y * width + x;
          let total = scratch[id] * 2.5;
          let weight = 2.5;
          forEachNeighbor4(grid, x, y, (nx, ny) => {
            total += scratch[ny * width + nx];
            weight += 1;
          });
          field[id] = Math.max(0, Math.min(1, total / weight));
        }
      }
    }
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
    for (let i = 0; i < size; i += 1) {
      const active = boundaryKind[i] === BoundaryType.TRANSFORM && boundaryInfluence[i] > activeThreshold
        ? Math.min(1, boundaryInfluence[i] * Math.min(2.5, stress[i]) * 0.9)
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

  function suppressInactiveFractureRelief(world) {
    const { grid, seaLevel } = world;
    const {
      width,
      height,
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

    scratch.set(elev);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (crustType[id] !== CrustType.OCEANIC) continue;
        if (boundaryInfluence[id] > 0.18 || ridge[id] > 0.08 || trench[id] > 0.08) continue;
        const memory = Math.max(transformMemory[id] * 0.55, fractureZoneMemory[id], inactiveBoundaryRelief[id]);
        if (memory <= 0.025) continue;

        let total = scratch[id] * 2;
        let weight = 2;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (crustType[nid] !== CrustType.OCEANIC || ridge[nid] > 0.08 || trench[nid] > 0.08) return;
          total += scratch[nid];
          weight += 1;
        });
        const smooth = total / weight;
        const oldPositiveRelief = Math.max(0, scratch[id] - smooth);
        const flatness = 0.35 + Math.min(1, abyssalPlain[id] + sediment[id] * 1.4 + sedimentWedge[id] * 0.8) * 0.65;
        const mix = Math.min(0.42, memory * flatness * 0.24);
        const depressed = scratch[id] - oldPositiveRelief * Math.min(0.65, memory * 0.5);
        elev[id] = depressed * (1 - mix) + smooth * mix;
        inactiveBoundaryRelief[id] = Math.max(0, inactiveBoundaryRelief[id] * (1 - mix * 0.45));
      }
    }

    for (let i = 0; i < grid.size; i += 1) {
      if (crustType[i] !== CrustType.OCEANIC) continue;
      oldBoundaryCorrelation[i] = Math.max(0, Math.min(1, oldBoundaryCorrelation[i] * 0.88 + Math.abs(elev[i] - scratch[i]) * 8));
    }
  }

  function diffuseFractureMemory(grid) {
    const { width, height, crustType, fractureZoneMemory, boundaryInfluence, ridge, trench, scratch } = grid;
    scratch.set(fractureZoneMemory);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (crustType[id] !== CrustType.OCEANIC || scratch[id] < 0.02) continue;
        if (boundaryInfluence[id] > 0.35 || ridge[id] > 0.2 || trench[id] > 0.2) continue;
        let total = scratch[id] * 3;
        let weight = 3;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (crustType[nid] !== CrustType.OCEANIC) return;
          total += scratch[nid] * 0.55;
          weight += 0.55;
        });
        fractureZoneMemory[id] = Math.min(1, total / weight);
      }
    }
  }

  function updateAgeBandRisk(grid) {
    const { width, height, crustType, crustAge, ridge, boundaryInfluence, fractureZoneMemory, ageBandStraightnessRisk } = grid;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (crustType[id] !== CrustType.OCEANIC) continue;
        const band = Math.floor(crustAge[id] * 10);
        const horizontal = sameAgeBandAt(grid, x - 1, y, band) + sameAgeBandAt(grid, x + 1, y, band);
        const vertical = sameAgeBandAt(grid, x, y - 1, band) + sameAgeBandAt(grid, x, y + 1, band);
        const diagA = sameAgeBandAt(grid, x - 1, y - 1, band) + sameAgeBandAt(grid, x + 1, y + 1, band);
        const diagB = sameAgeBandAt(grid, x + 1, y - 1, band) + sameAgeBandAt(grid, x - 1, y + 1, band);
        const aligned = Math.max(horizontal, vertical, diagA, diagB);
        if (aligned < 2) continue;
        const nearRidge = ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3;
        if (nearRidge) continue;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        ageBandStraightnessRisk[id] = Math.max(0, Math.min(1, inactive * (0.4 + fractureZoneMemory[id] * 0.8)));
      }
    }
  }

  function softenInactiveFractureSourceFields(grid, dt) {
    const {
      width,
      height,
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
    scratch.set(crustAge);
    scratch2.set(crustThickness);
    scratch3.set(sediment);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (crustType[id] !== CrustType.OCEANIC) continue;
        if (boundaryInfluence[id] > 0.16 || ridge[id] > 0.05 || trench[id] > 0.08) continue;
        if (ridgeDistance[id] >= 0 && ridgeDistance[id] <= 4) continue;

        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        const memory = Math.max(fractureZoneMemory[id], transformMemory[id] * 0.45);
        const risk = Math.max(ageBandStraightnessRisk[id], Math.max(0, memory - 0.04) * 0.75);
        if (risk <= 0.035) continue;

        let ageTotal = scratch[id] * 3.5;
        let thickTotal = scratch2[id] * 3.5;
        let sedTotal = scratch3[id] * 2.5;
        let ageWeight = 3.5;
        let sedWeight = 2.5;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (crustType[nid] !== CrustType.OCEANIC) return;
          if (ridge[nid] > 0.06 || trench[nid] > 0.09 || boundaryInfluence[nid] > 0.22) return;
          ageTotal += scratch[nid];
          thickTotal += scratch2[nid];
          sedTotal += scratch3[nid];
          ageWeight += 1;
          sedWeight += 1;
        });

        const ageSmooth = ageTotal / ageWeight;
        const thickSmooth = thickTotal / ageWeight;
        const sedSmooth = sedTotal / sedWeight;
        const mix = Math.min(0.18, risk * inactive * Math.min(1, dt / 2) * 0.13);
        crustAge[id] = Math.max(0, Math.min(1, scratch[id] * (1 - mix) + ageSmooth * mix));
        crustThickness[id] = Math.max(0.12, Math.min(0.42, scratch2[id] * (1 - mix * 0.6) + thickSmooth * mix * 0.6));
        sediment[id] = Math.max(0, Math.min(1, scratch3[id] * (1 - mix * 0.35) + sedSmooth * mix * 0.35));
      }
    }
  }

  function sameAgeBandAt(grid, x, y, band) {
    if (y < 0 || y >= grid.height) return 0;
    const nx = ((x % grid.width) + grid.width) % grid.width;
    const id = y * grid.width + nx;
    return grid.crustType[id] === CrustType.OCEANIC && Math.floor(grid.crustAge[id] * 10) === band ? 1 : 0;
  }

  function halfLifeDecay(dt, halfLifeMyr) {
    return Math.pow(0.5, dt / Math.max(1, halfLifeMyr));
  }


  // ---- src/sim/geology/elevation.js ----

  function rebuildGeologyElevation(world) {
    rebuildGeologyElevationV2(world);
  }

  function rebuildGeologyElevationV2(world) {
    const { grid, textureNoise } = world;
    updateIsostasy(world);
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
      const x = i % width;
      const y = Math.floor(i / width);
      const sphere = spherePointForCell(grid, x, y);
      const micro = textureNoise(sphere.x * 7.5 - 11, sphere.y * 7.5 + 19, sphere.z * 7.5 - 7, 3, 2.15, 0.42);
      const broad = textureNoise(sphere.x * 2.2 + 7, sphere.y * 2.2 - 5, sphere.z * 2.2 + 17, 3, 2, 0.48);
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
    let landCount = 0;
    let orographicPotential = 0;
    let seaSensitivityWeightSum = 0;

    const target = targetReliefForWorld(params, stats);
    const deficit =
      Math.max(0, target.hypsometricSpread - stats.hypsometricSpread) +
      Math.max(0, target.landReliefSpread - stats.landReliefSpread) +
      Math.max(0, target.globalElevationStd - stats.globalElevationStd);
    const normalizedDeficit = Math.min(1, deficit / 0.18);

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const i = y * grid.width + x;
        const relative = grid.elev[i] - seaLevel;
        const land = relative >= 0;
        const local = localRelief(grid, x, y, radius);
        const slope = localSlope(grid, x, y, seaLevel);
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

        flatLand += plain;
        largePlain += broadPlain;
        sensitive += seaSensitive;
        tectonicSum += tectonic;
        isostaticSum += isostatic;
        erosionSum += erosion;
        smoothingSum += smoothing;
        seaSensitivityWeightSum += grid.seaLevelSensitivity[i];
        if (land) {
          slopeLandSum += slope;
          landCount += 1;
        }
        if (grid.orographicBarrier[i] > orographicPotential) orographicPotential = grid.orographicBarrier[i];
      }
    }

    const flatLandShare = flatLand / grid.size;
    const largePlainShare = largePlain / grid.size;
    const seaLevelSensitivityShare = sensitive / grid.size;
    const inverseSpread = 1 - Math.min(1, stats.hypsometricSpread / 0.34);
    const coastInstabilityRisk = seaLevelSensitivityShare * (0.45 + inverseSpread * 0.55);
    world.reliefDiagnostics = {
      ...stats,
      flatLandShare,
      largePlainShare,
      seaLevelSensitivity: seaLevelSensitivityShare,
      seaLevelSensitivityMean: seaSensitivityWeightSum / grid.size,
      coastInstabilityRisk,
      reliefDeficit: deficit,
      normalizedReliefDeficit: normalizedDeficit,
      targetHypsometricSpread: target.hypsometricSpread,
      targetLandReliefSpread: target.landReliefSpread,
      targetGlobalElevationStd: target.globalElevationStd,
      tectonicReliefSupplyMean: tectonicSum / grid.size,
      isostaticReliefSupplyMean: isostaticSum / grid.size,
      erosionFlatteningPressureMean: erosionSum / grid.size,
      sedimentSmoothingPressureMean: smoothingSum / grid.size,
      drainageGradientPotential: landCount ? slopeLandSum / landCount * stats.landReliefSpread : 0,
      orographicReliefPotential: orographicPotential,
      flatWorldRisk: stats.globalElevationStd < target.globalElevationStd * 0.72 &&
        stats.hypsometricSpread < target.hypsometricSpread * 0.72 &&
        largePlainShare > 0.38,
    };
    return world.reliefDiagnostics;
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

  function localRelief(grid, x, y, radius) {
    let min = Infinity;
    let max = -Infinity;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.hypot(dx, dy) > radius + 0.01) continue;
        const h = grid.elev[ny * grid.width + wrapX(grid.width, x + dx)];
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    return max - min;
  }

  function localSlope(grid, x, y, seaLevel) {
    const left = grid.elev[y * grid.width + wrapX(grid.width, x - 1)] - seaLevel;
    const right = grid.elev[y * grid.width + wrapX(grid.width, x + 1)] - seaLevel;
    const up = grid.elev[Math.max(0, y - 1) * grid.width + x] - seaLevel;
    const down = grid.elev[Math.min(grid.height - 1, y + 1) * grid.width + x] - seaLevel;
    return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
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
      coastalSensitivityMean: average(world.grid.coastalSensitivity),
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

    for (let i = 0; i < grid.size; i += 1) {
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
        oceanicCount += 1;
        if (youngOcean) youngOceanCount += 1;
        if (oldOcean) oldOceanCount += 1;
        ridgeSum += ridgeSignal;
        oldCapacitySum += oldCapacity;
        trenchSum += trenchCapacity;
      }
      if (grid.elev[i] < baseSeaLevel || grid.continentalShelf[i] > 0.01 || grid.sedimentWedge[i] > 0.01) {
        sedimentSum += sedimentDisplacement;
      }
    }

    const invOceanic = oceanicCount ? 1 / oceanicCount : 0;
    const youngOceanShare = youngOceanCount * invOceanic;
    const oldOceanShare = oldOceanCount * invOceanic;
    const ridgeMean = ridgeSum * invOceanic;
    const oldCapacityMean = oldCapacitySum * invOceanic;
    const trenchMean = trenchSum * invOceanic;
    const sedimentMean = sedimentSum / grid.size;
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
    for (let i = 0; i < grid.size; i += 1) {
      const potential = clamp01((Math.abs(change) * 8 + baseBand - Math.abs(grid.elev[i] - seaLevel)) / baseBand);
      sum += grid.coastalSensitivity[i] * potential;
    }
    return sum / grid.size;
  }

  function localSlope(grid, id) {
    const x = id % grid.width;
    const y = Math.floor(id / grid.width);
    const left = grid.elev[y * grid.width + wrap(grid.width, x - 1)];
    const right = grid.elev[y * grid.width + wrap(grid.width, x + 1)];
    const up = grid.elev[Math.max(0, y - 1) * grid.width + x];
    const down = grid.elev[Math.min(grid.height - 1, y + 1) * grid.width + x];
    return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
  }

  function localRelief4(grid, id) {
    const x = id % grid.width;
    const y = Math.floor(id / grid.width);
    let min = grid.elev[id];
    let max = grid.elev[id];
    const visit = (nx, ny) => {
      const value = grid.elev[ny * grid.width + wrap(grid.width, nx)];
      if (value < min) min = value;
      if (value > max) max = value;
    };
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, Math.max(0, y - 1));
    visit(x, Math.min(grid.height - 1, y + 1));
    return max - min;
  }

  function shareLand(grid, seaLevel) {
    let land = 0;
    for (let i = 0; i < grid.size; i += 1) if (grid.elev[i] >= seaLevel) land += 1;
    return land / grid.size;
  }

  function average(field) {
    let sum = 0;
    for (let i = 0; i < field.length; i += 1) sum += field[i];
    return sum / field.length;
  }

  function normalizeCentered(value, baseline, scale) {
    return clamp((value - baseline) / Math.max(1e-6, scale), -1, 1);
  }

  function moveToward(current, target, maxStep) {
    return current + clamp(target - current, -maxStep, maxStep);
  }

  function wrap(width, x) {
    return ((x % width) + width) % width;
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }


  // ---- src/sim/geology/sediment.js ----

  const TRANSPORT_PASSES = 4;
  const CAPACITY_SMOOTH_PASSES = 2;

  function updateSedimentBudget(world) {
    if (world.sedimentBudgetStep === world.step) return world.sedimentBudgetDiagnostics;

    const { grid, seaLevel } = world;
    const {
      size,
      width,
      height,
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
    const massBefore = sumField(sediment);

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
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const rel = elev[id] - seaLevel;
        const land = rel >= -0.006;
        const slope = localSlope(grid, elev, x, y);
        const relief = localRelief(grid, elev, x, y);
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
      }
    }

    for (let i = 0; i < size; i += 1) {
      const x = i % width;
      const y = Math.floor(i / width);
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
      const broadBasin = localAverage8(grid, basin, x, y);
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
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const id = y * width + x;
          let remaining = scratch[id];
          if (remaining <= 0) continue;
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
          if (remaining <= 0) continue;

          const centerElev = elev[id];
          const deterministicJitter = 0.82 + (((id * 1103515245 + pass * 1013904223) >>> 0) % 997) / 997 * 0.18;
          let weightSum = 0;
          let fallback = -1;
          let fallbackScore = -Infinity;
          const candidates = [];
          visitNeighbor8(grid, x, y, (nid, diagonal) => {
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
        }
      }
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

    const massAfter = sumField(sediment);
    const massDelta = massAfter - massBefore;
    const residualFlux = sumField(scratch);
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
      produced: sumField(world.grid.erosionSource),
      deposited: sumField(world.grid.sedimentSink),
      dissipated: 0,
      compactionTotal: sumField(world.grid.sedimentCompaction),
      residualFlux: sumField(world.grid.sedimentFlux),
      massBefore: sumField(world.grid.sediment),
      massAfter: sumField(world.grid.sediment),
      massDelta: 0,
      budgetErrorValue: averageField(world.grid.sedimentBudgetError),
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
      const sink = sedimentSink[i];
      const mountainMask = Math.max(activeOrogeny[i], oldOrogeny[i], mountainBelt[i]);
      mountainErosion += erosionSource[i] * clamp01(mountainMask * 3.2);
      passiveMarginDeposition += sink * clamp01(passiveMargin[i] + continentalShelf[i] + continentalRise[i] + sedimentWedge[i]);
      basinDeposition += sink * clamp01(basin[i] + forelandBasin[i]);
      trenchForearcDeposition += sink * clamp01(trench[i] + trenchAxis[i]);
      inlandBasinDeposition += sink * (inlandWaterCandidate[i] ? 1 : 0);
      shelfDeposition += sink * clamp01(continentalShelf[i] + continentalRise[i] + sedimentWedge[i]);
      abyssalDeposition += sink * clamp01(abyssalPlain[i]);
      if (sediment[i] > maxSedimentForCell(grid, i, grid.elev[i] - world.seaLevel) * 0.92) overfilled += 1;
      if (grid.elev[i] < world.seaLevel && world.seaLevel - grid.elev[i] < 0.05) {
        shallowSea += 1;
        if (sediment[i] > 0.38) shallowSeaHighSediment += 1;
      }
    }

    return {
      erosionSourceMean: averageField(erosionSource),
      erosionSourceTotal: totals.produced,
      depositionTotal: totals.deposited,
      sedimentFluxMean: averageField(sedimentFlux),
      sedimentSinkMean: averageField(sedimentSink),
      sedimentCapacityMean: averageField(sedimentCapacity),
      sedimentCompactionMean: averageField(sedimentCompaction),
      sedimentLoadSubsidenceMean: averageField(sedimentLoadSubsidence),
      sedimentBudgetError: totals.budgetErrorValue,
      sedimentMassBefore: totals.massBefore,
      sedimentMassAfter: totals.massAfter,
      sedimentMassDelta: totals.massDelta,
      mountainErosionShare: totals.produced ? mountainErosion / totals.produced : 0,
      passiveMarginDepositionShare: totals.deposited ? passiveMarginDeposition / totals.deposited : 0,
      basinDepositionShare: totals.deposited ? basinDeposition / totals.deposited : 0,
      trenchForearcDepositionShare: totals.deposited ? trenchForearcDeposition / totals.deposited : 0,
      inlandBasinDepositionShare: totals.deposited ? inlandBasinDeposition / totals.deposited : 0,
      sedimentOverfillShare: overfilled / size,
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
    const { width, height, sedimentCapacity, scratch3 } = grid;
    for (let pass = 0; pass < CAPACITY_SMOOTH_PASSES; pass += 1) {
      scratch3.set(sedimentCapacity);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const id = y * width + x;
          let total = scratch3[id] * 1.8;
          let weight = 1.8;
          visitNeighbor8(grid, x, y, (nid, diagonal) => {
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
        }
      }
    }
  }

  function softDepositionalSink(grid, id) {
    const x = id % grid.width;
    const y = Math.floor(id / grid.width);
    const broadBasin = localAverage8(grid, grid.basin, x, y);
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
    const { width, height, sediment, scratch3 } = grid;
    scratch3.set(sediment);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const structuralLine = structuralLineMemory(grid, id);
        const naturalSink = softDepositionalSink(grid, id);
        const blend = clamp01(structuralLine * 0.085 + naturalSink * 0.035);
        if (blend <= 0.002) continue;
        let total = scratch3[id] * 1.9;
        let weight = 1.9;
        visitNeighbor8(grid, x, y, (nid, diagonal) => {
          const w = diagonal ? 0.28 : 0.58;
          total += scratch3[nid] * w;
          weight += w;
        });
        const maxSediment = maxSedimentForCell(grid, id, grid.elev[id] - seaLevel);
        sediment[id] = Math.min(maxSediment, mix(scratch3[id], total / weight, blend));
      }
    }
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

  function localSlope(grid, field, x, y) {
    const left = field[y * grid.width + wrapX(grid.width, x - 1)];
    const right = field[y * grid.width + wrapX(grid.width, x + 1)];
    const up = field[Math.max(0, y - 1) * grid.width + x];
    const down = field[Math.min(grid.height - 1, y + 1) * grid.width + x];
    return Math.hypot((right - left) * 0.5, (down - up) * 0.5);
  }

  function localRelief(grid, field, x, y) {
    const center = field[y * grid.width + x];
    let maxDelta = 0;
    forEachNeighbor4(grid, x, y, (nx, ny) => {
      maxDelta = Math.max(maxDelta, Math.abs(center - field[ny * grid.width + nx]));
    });
    return maxDelta;
  }

  function visitNeighbor8(grid, x, y, visit) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrapX(grid.width, x + dx);
        visit(ny * grid.width + nx, dx !== 0 && dy !== 0);
      }
    }
  }

  function measurePatchiness(grid, field) {
    let total = 0;
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const id = y * grid.width + x;
        total += localRelief(grid, field, x, y);
      }
    }
    return total / grid.size;
  }

  function measureSedimentStraightnessDiagnostics(grid, field) {
    let totalWeight = 0;
    let weightedRisk = 0;
    let structuralWeight = 0;
    let naturalWeight = 0;
    let axisWeight = 0;
    for (let y = 1; y < grid.height - 1; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const id = y * grid.width + x;
        if (field[id] < 0.05) continue;
        const contrast = localRelief(grid, field, x, y);
        if (contrast < 0.012) continue;

        const horizontal = bandScore(grid, field, x, y, 1, 0, 0, 1);
        const vertical = bandScore(grid, field, x, y, 0, 1, 1, 0);
        const diagA = bandScore(grid, field, x, y, 1, 1, 1, -1);
        const diagB = bandScore(grid, field, x, y, 1, -1, 1, 1);
        const directionalRisk = Math.max(horizontal, vertical, diagA, diagB);
        if (directionalRisk <= 0) continue;

        const naturalSink = clamp01(
          grid.passiveMargin[id] +
            grid.continentalShelf[id] +
            grid.continentalRise[id] +
            grid.sedimentWedge[id] +
            localAverage8(grid, grid.basin, x, y) * 0.28 +
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
      }
    }
    return {
      sedimentStraightnessRisk: totalWeight ? weightedRisk / totalWeight : 0,
      sedimentBoundaryCorrelation: totalWeight ? structuralWeight / totalWeight : 0,
      sedimentGridAlignment: totalWeight ? axisWeight / totalWeight : 0,
      sedimentNaturalSinkShare: totalWeight ? naturalWeight / totalWeight : 0,
    };
  }

  function bandScore(grid, field, x, y, alongDx, alongDy, perpDx, perpDy) {
    const value = field[y * grid.width + x];
    const along =
      similarity(grid, field, x + alongDx, y + alongDy, value) *
      similarity(grid, field, x - alongDx, y - alongDy, value);
    const cross =
      contrastAgainst(grid, field, x + perpDx, y + perpDy, value) *
      contrastAgainst(grid, field, x - perpDx, y - perpDy, value);
    return along * cross;
  }

  function similarity(grid, field, x, y, value) {
    if (y < 0 || y >= grid.height) return 0;
    const id = y * grid.width + wrapX(grid.width, x);
    return clamp01(1 - Math.abs(field[id] - value) / 0.018);
  }

  function contrastAgainst(grid, field, x, y, value) {
    if (y < 0 || y >= grid.height) return 0;
    const id = y * grid.width + wrapX(grid.width, x);
    return smoothstep(0.012, 0.045, Math.abs(field[id] - value));
  }

  function sumField(field) {
    let sum = 0;
    for (let i = 0; i < field.length; i += 1) sum += field[i];
    return sum;
  }

  function averageField(field) {
    return field.length ? sumField(field) / field.length : 0;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / Math.max(0.000001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function localAverage8(grid, field, x, y) {
    let total = field[y * grid.width + x] * 1.5;
    let weight = 1.5;
    visitNeighbor8(grid, x, y, (nid, diagonal) => {
      const w = diagonal ? 0.45 : 0.8;
      total += field[nid] * w;
      weight += w;
    });
    return weight ? total / weight : 0;
  }

  function structuralLineMemory(grid, id) {
    return clamp01(
      Math.max(0, grid.boundaryInfluence[id] - 0.12) * 1.25 +
        (grid.inactiveBoundaryRelief?.[id] ?? 0) * 2.2 +
        (grid.fractureZoneMemory?.[id] ?? 0) * 0.9 +
        (grid.transformMemory?.[id] ?? 0) * 0.55,
    );
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
    advectCrust(world);
    updatePlateBoundaries(world);
    updateCrustProperties(world);
    updateTransformMemory(world);
    updateTectonicAxes(world);
    buildTectonicFeatures(world);
    updateOrogenicLifecycle(world);
    updateSedimentBudget(world);
    rebuildGeologyElevation(world);
    if (!world.geologyV2SeaInitialized) {
      initializeSeaLevel(world);
      world.geologyV2SeaInitialized = true;
    }
    updateRiftStages(world);
    rebuildGeologyElevation(world);
    applyGeologyV2SurfaceAging(world);
    rebuildGeologyElevation(world);
    rebuildMountainInterfaceFields(world);
    updateSeaLevel(world);
    updateGeologicSeaLevel(world);
    deriveOceanConnectivity(world);
    updatePassiveMargins(world);
    rebuildGeologyElevation(world);
    rebuildMountainInterfaceFields(world);
    suppressInactiveFractureRelief(world);
    updateSeaLevel(world);
    updateGeologicSeaLevel(world);
    deriveOceanConnectivity(world);
    updatePassiveMargins(world);
    suppressInactiveFractureRelief(world);
    updateSeaLevel(world);
    updateGeologicSeaLevel(world);
    deriveOceanConnectivity(world);
    rebuildMountainInterfaceFields(world);
    updateSurfaceContinuityDiagnostics(world.grid);
    updateReliefBudgetDiagnostics(world);
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
    const { width, height, orogeny, oldOrogeny, sediment, basin, boundaryInfluence, crustType, scratch, scratch2, scratch3 } = grid;
    const radius = physicalRadius(grid, 2);
    scratch.set(orogeny);
    scratch2.set(sediment);
    scratch3.set(basin);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        if (inactive <= 0.35 && scratch[id] < 0.015 && scratch2[id] < 0.035 && scratch3[id] < 0.035) continue;

        let oroTotal = scratch[id] * 3;
        let sedTotal = scratch2[id] * 2.2;
        let basinTotal = scratch3[id] * 2.2;
        let oroWeight = 3;
        let sedWeight = 2.2;
        let basinWeight = 2.2;

        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
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
          }
        }

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
      }
    }
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
    const { width, height, crustType, crustAge, crustThickness, sediment, basin, boundaryInfluence, weakness, scratch, scratch2, scratch3 } = grid;
    scratch.set(crustAge);
    scratch2.set(crustThickness);
    scratch3.set(sediment);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        const passive = crustType[id] === CrustType.OCEANIC || crustType[id] === CrustType.TRANSITIONAL;
        if (!passive || crustType[id] === CrustType.OCEANIC || inactive < 0.55) continue;

        let ageTotal = scratch[id] * 2.5;
        let thickTotal = scratch2[id] * 2.5;
        let sedTotal = scratch3[id] * 2.5;
        let weightTotal = 2.5;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(width, x + dx);
            const nid = ny * width + nx;
            const sameFamily = crustType[nid] === CrustType.OCEANIC || crustType[nid] === CrustType.TRANSITIONAL;
            if (!sameFamily || boundaryInfluence[nid] > 0.55) continue;
            const w = dx === 0 || dy === 0 ? 1 : 0.55;
            ageTotal += scratch[nid] * w;
            thickTotal += scratch2[nid] * w;
            sedTotal += scratch3[nid] * w;
            weightTotal += w;
          }
        }

        const mix = Math.min(0.2, inactive * 0.12);
        crustAge[id] = scratch[id] * (1 - mix) + (ageTotal / weightTotal) * mix;
        crustThickness[id] = scratch2[id] * (1 - mix) + (thickTotal / weightTotal) * mix;
        sediment[id] = Math.min(1, scratch3[id] * (1 - mix) + (sedTotal / weightTotal) * mix);
      }
    }

    scratch.set(crustAge);
    scratch2.set(sediment);
    scratch3.set(basin);
    const radius = Math.max(1, physicalRadius(grid, 2));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const inactive = 1 - Math.min(1, boundaryInfluence[id]);
        const passive = crustType[id] === CrustType.OCEANIC || crustType[id] === CrustType.TRANSITIONAL;
        if (!passive || inactive < 0.62) continue;

        const bendX = Math.round((weakness[id] - 0.5) * radius);
        const bendY = Math.round((weakness[id] - 0.5) * radius * 0.45);
        let ageTotal = scratch[id] * 3;
        let sedTotal = scratch2[id] * 2;
        let basinTotal = scratch3[id] * 2;
        let ageWeight = 3;
        let fillWeight = 2;

        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy + bendY;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const dist = Math.hypot(dx, dy);
            if (dist < 0.01 || dist > radius + 0.01) continue;
            const nx = wrapX(width, x + dx + bendX);
            const nid = ny * width + nx;
            const samePassive = crustType[nid] === CrustType.OCEANIC || crustType[nid] === CrustType.TRANSITIONAL;
            if (!samePassive || boundaryInfluence[nid] > 0.52) continue;
            const falloff = 1 / (1 + dist);
            ageTotal += scratch[nid] * falloff;
            sedTotal += scratch2[nid] * falloff;
            basinTotal += scratch3[nid] * falloff;
            ageWeight += falloff;
            fillWeight += falloff;
          }
        }

        const ageSmooth = ageTotal / ageWeight;
        const sedSmooth = sedTotal / fillWeight;
        const basinSmooth = basinTotal / fillWeight;
        const ageMix = Math.min(0.16, inactive * 0.09);
        const fillMix = Math.min(0.22, inactive * 0.13);
        if (crustType[id] !== CrustType.OCEANIC) crustAge[id] = scratch[id] * (1 - ageMix) + ageSmooth * ageMix;
        sediment[id] = Math.min(1, scratch2[id] * (1 - fillMix) + sedSmooth * fillMix);
        basin[id] = Math.min(1, scratch3[id] * (1 - fillMix) + basinSmooth * fillMix);
      }
    }
  }


  // ---- src/sim/derived/terrain.js ----

  function getTerrainDerived(world) {
    const base = buildTerrainBase(world);
    return {
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
  }

  function getClimateInputs(world) {
    const base = buildTerrainBase(world);
    const { grid } = world;
    const {
      size,
      width,
      height,
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

    for (let y = 0; y < height; y += 1) {
      const lat = ((y + 0.5) / height - 0.5) * 180;
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const rel = base.relativeElevation[id];
        latitude[id] = lat;
        oceanDepth[id] = Math.max(0, -rel);
        mountainAxis[id] = Math.max(storedMountainAxis?.[id] ?? 0, mountainBelt?.[id] ?? 0, activeOrogeny?.[id] ?? 0, oldOrogeny?.[id] ?? 0, orogeny?.[id] ?? 0);
        mountainHeight[id] = Math.max(storedMountainHeight?.[id] ?? 0, Math.max(0, rel) * (0.45 + Math.min(1, mountainAxis[id] * 2.2)));
        orographicBarrier[id] = Math.max(storedOrographicBarrier?.[id] ?? 0, Math.max(0, rel) * Math.min(1, base.ruggedness[id] * 5.5 + mountainAxis[id] * 1.4));
      }
    }

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

  function getHydrologyInputs(world) {
    const base = buildTerrainBase(world);
    const { grid } = world;
    const { size, elev, crustType, sediment, basin, forelandBasin, orogenicSedimentSupply, sedimentSink: budgetSedimentSink, sedimentCapacity } = grid;
    const hydroElevation = smoothElevation(grid, elev, physicalRadius(grid, 1));
    const depressionMask = findLocalDepressions(grid, hydroElevation, base.seaMask);
    const oceanConnectivity = new Uint8Array(size);
    const erodibility = new Float32Array(size);
    const permeability = new Float32Array(size);
    const sedimentSink = new Float32Array(size);

    for (let i = 0; i < size; i += 1) {
      if (base.externalSeaMask[i]) oceanConnectivity[i] = 2;
      else if (base.seaMask[i]) oceanConnectivity[i] = 1;

      const sed = sediment?.[i] ?? 0;
      const basinValue = basin?.[i] ?? 0;
      const slopePenalty = 1 - Math.min(1, base.slope[i] * 4.5);
      const type = crustType?.[i] ?? (base.landMask[i] ? 1 : 0);
      erodibility[i] = Math.max(0, Math.min(1, 0.22 + sed * 0.42 + base.slope[i] * 2.2 + (type === 2 ? 0.12 : 0)));
      permeability[i] = Math.max(0, Math.min(1, 0.18 + sed * 0.48 + (type === 0 ? 0.08 : 0) - basinValue * 0.16));
      sedimentSink[i] = Math.max(budgetSedimentSink?.[i] ?? 0, Math.max(0, Math.min(1, basinValue * 0.34 + (sedimentCapacity?.[i] ?? 0) * 0.5 + (forelandBasin?.[i] ?? 0) * 0.28 + sed * 0.18 + (orogenicSedimentSupply?.[i] ?? 0) * 0.12 + slopePenalty * (base.landMask[i] ? 0.1 : 0.18))));
    }

    return {
      hydroElevation,
      externalSeaMask: base.externalSeaMask,
      oceanConnectivity: base.oceanConnectivity,
      inlandWaterCandidate: base.inlandWaterCandidate,
      closedBasinId: base.closedBasinId,
      depressionMask,
      slope: base.slope,
      erodibility,
      permeability,
      sedimentSink,
      sediment: new Float32Array(grid.sediment),
      sedimentCapacity: new Float32Array(grid.sedimentCapacity),
      basin: new Float32Array(grid.basin),
      drainageGradientPotential: base.reliefDiagnostics.drainageGradientPotential,
      flatLandMask: base.flatLandMask,
      largePlainMask: base.largePlainMask,
      seaLevel: world.seaLevel,
      baseSeaLevel: base.geologicSeaLevelDiagnostics.baseSeaLevel,
      geologicSeaLevelOffset: base.geologicSeaLevelDiagnostics.geologicSeaLevelOffset,
      coastalSensitivity: base.coastalSensitivity,
      forelandBasin: new Float32Array(grid.forelandBasin),
      orogenicSedimentSupply: new Float32Array(grid.orogenicSedimentSupply),
      continentalRise: base.continentalRise,
    };
  }

  function getBiosphereInputs(world) {
    const base = buildTerrainBase(world);
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
    const componentSizes = measureComponentSizes(base.landmassId);

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
      connectivityToLandmass[i] = landId ? Math.min(1, (componentSizes.get(landId) ?? 0) / (grid.size * 0.18)) : 0;
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
    const base = buildTerrainBase(world);
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
    const reliefDiagnostics = getReliefDiagnostics(world);
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
    const { width, height, size } = grid;
    const slope = new Float32Array(size);
    const aspect = new Float32Array(size);
    const ruggedness = new Float32Array(size);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const left = field[y * width + wrapX(width, x - 1)];
        const right = field[y * width + wrapX(width, x + 1)];
        const up = field[Math.max(0, y - 1) * width + x];
        const down = field[Math.min(height - 1, y + 1) * width + x];
        const dx = (right - left) * 0.5;
        const dy = (down - up) * 0.5;
        slope[id] = Math.hypot(dx, dy);
        aspect[id] = Math.atan2(dy, dx);

        let sum = 0;
        let count = 0;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          sum += Math.abs(field[id] - field[ny * width + nx]);
          count += 1;
        });
        ruggedness[id] = count ? sum / count : 0;
      }
    }

    return { slope, aspect, ruggedness };
  }

  function floodExternalSea(grid, seaMask) {
    const { width, size } = grid;
    const externalSeaMask = new Uint8Array(size);
    const queue = new Int32Array(size);
    const visited = new Uint8Array(size);
    let largestStart = -1;
    let largestSize = 0;

    for (let start = 0; start < size; start += 1) {
      if (!seaMask[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        const x = id % width;
        const y = Math.floor(id / width);
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (!seaMask[nid] || visited[nid]) return;
          visited[nid] = 1;
          queue[tail++] = nid;
        });
      }
      if (tail > largestSize) {
        largestSize = tail;
        largestStart = start;
      }
    }

    if (largestStart >= 0) {
      let head = 0;
      let tail = 0;
      externalSeaMask[largestStart] = 1;
      queue[tail++] = largestStart;
      while (head < tail) {
        const id = queue[head++];
        const x = id % width;
        const y = Math.floor(id / width);
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (!seaMask[nid] || externalSeaMask[nid]) return;
          externalSeaMask[nid] = 1;
          queue[tail++] = nid;
        });
      }
    }

    return externalSeaMask;
  }

  function distanceFromCoast(grid, landMask) {
    const coast = new Uint8Array(grid.size);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const id = y * grid.width + x;
        let nearOpposite = false;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          if (landMask[ny * grid.width + nx] !== landMask[id]) nearOpposite = true;
        });
        if (nearOpposite) coast[id] = 1;
      }
    }
    return distanceFromSources(grid, coast);
  }

  function distanceFromSources(grid, sourceMask) {
    const { width, size } = grid;
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
      const x = id % width;
      const y = Math.floor(id / width);
      forEachNeighbor4(grid, x, y, (nx, ny) => {
        const nid = ny * width + nx;
        if (nextDistance >= distance[nid]) return;
        distance[nid] = nextDistance;
        queue[tail++] = nid;
      });
    }

    return distance;
  }

  function labelLandmasses(grid, landMask) {
    const { width, size } = grid;
    const landmassId = new Int32Array(size);
    const islandId = new Int32Array(size);
    const queue = new Int32Array(size);
    let nextLandId = 1;
    let nextIslandId = 1;
    const islandLimit = Math.max(24, Math.floor(size * 0.018));

    for (let start = 0; start < size; start += 1) {
      if (!landMask[start] || landmassId[start]) continue;
      let head = 0;
      let tail = 0;
      landmassId[start] = nextLandId;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        const x = id % width;
        const y = Math.floor(id / width);
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (!landMask[nid] || landmassId[nid]) return;
          landmassId[nid] = nextLandId;
          queue[tail++] = nid;
        });
      }

      if (tail <= islandLimit) {
        for (let i = 0; i < tail; i += 1) islandId[queue[i]] = nextIslandId;
        nextIslandId += 1;
      }
      nextLandId += 1;
    }

    return { landmassId, islandId };
  }

  function labelClosedBasins(grid, seaMask, externalSeaMask) {
    const { width, size } = grid;
    const closedBasinId = new Int32Array(size);
    const queue = new Int32Array(size);
    let nextId = 1;

    for (let start = 0; start < size; start += 1) {
      if (!seaMask[start] || externalSeaMask[start] || closedBasinId[start]) continue;
      let head = 0;
      let tail = 0;
      closedBasinId[start] = nextId;
      queue[tail++] = start;
      while (head < tail) {
        const id = queue[head++];
        const x = id % width;
        const y = Math.floor(id / width);
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          const nid = ny * width + nx;
          if (!seaMask[nid] || externalSeaMask[nid] || closedBasinId[nid]) return;
          closedBasinId[nid] = nextId;
          queue[tail++] = nid;
        });
      }
      nextId += 1;
    }

    return closedBasinId;
  }

  function findLocalDepressions(grid, field, seaMask) {
    const depressionMask = new Uint8Array(grid.size);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const id = indexOf(grid, x, y);
        if (seaMask[id]) continue;
        let lowerThanAll = true;
        forEachNeighbor4(grid, x, y, (nx, ny) => {
          if (field[id] >= field[ny * grid.width + nx]) lowerThanAll = false;
        });
        if (lowerThanAll) depressionMask[id] = 1;
      }
    }
    return depressionMask;
  }

  function smoothElevation(grid, field, radius) {
    const { width, height } = grid;
    const output = new Float32Array(field.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = field[y * width + x] * 2;
        let weight = 2;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.01) continue;
            const w = 1 / (1 + dist);
            total += field[ny * width + wrapX(width, x + dx)] * w;
            weight += w;
          }
        }
        output[y * width + x] = total / weight;
      }
    }
    return output;
  }

  function measureComponentSizes(componentId) {
    const sizes = new Map();
    for (let i = 0; i < componentId.length; i += 1) {
      const id = componentId[i];
      if (!id) continue;
      sizes.set(id, (sizes.get(id) ?? 0) + 1);
    }
    return sizes;
  }


  // ---- src/sim/world.js ----

  const PipelineMode = {
    LEGACY: "legacy",
    GEOLOGY_V2: "geology-v2",
  };

  function createWorld(params) {
    const [width, height] = params.resolution.split("x").map(Number);
    const seedUint32 = hashSeed(params.seedText);
    const grid = createGrid(width, height);
    const world = {
      grid,
      params: normalizeParams(params),
      seedUint32,
      step: 0,
      ageYears: 0,
      timeScaleFactor: timeScaleFactor(params.timeScale),
      seaLevel: 0,
      waterVolume: 0,
      plates: null,
      continentNoise: null,
      textureNoise: null,
      initialPlateCentersX: null,
      initialPlateCentersY: null,
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
    return {
      ...params,
      pipelineMode: params.pipelineMode === PipelineMode.GEOLOGY_V2 ? PipelineMode.GEOLOGY_V2 : PipelineMode.LEGACY,
    };
  }

  function analyzeWorld(world) {
    const { grid } = world;
    const { size, elev, btype, isContinental } = grid;
    let land = 0;
    let convergentSum = 0;
    let convergentCount = 0;
    let mountainConvergentSum = 0;
    let mountainConvergentCount = 0;
    let divergentSum = 0;
    let divergentCount = 0;
    let interiorSum = 0;
    let interiorCount = 0;
    let continentalInteriorSum = 0;
    let continentalInteriorCount = 0;
    let maxElev = -Infinity;

    for (let i = 0; i < size; i += 1) {
      const h = elev[i];
      if (h >= world.seaLevel) land += 1;
      if (h > maxElev) maxElev = h;
      if (btype[i] === 1) {
        convergentSum += h;
        convergentCount += 1;
        if (isContinental[i]) {
          mountainConvergentSum += h;
          mountainConvergentCount += 1;
        }
      } else if (btype[i] === 2) {
        divergentSum += h;
        divergentCount += 1;
      } else if (btype[i] === 0) {
        interiorSum += h;
        interiorCount += 1;
        if (isContinental[i]) {
          continentalInteriorSum += h;
          continentalInteriorCount += 1;
        }
      }
    }

    const avgConvergent = convergentCount ? convergentSum / convergentCount : 0;
    const avgMountainConvergent = mountainConvergentCount ? mountainConvergentSum / mountainConvergentCount : avgConvergent;
    const avgDivergent = divergentCount ? divergentSum / divergentCount : 0;
    const avgInterior = interiorCount ? interiorSum / interiorCount : 0;
    const avgContinentalInterior = continentalInteriorCount ? continentalInteriorSum / continentalInteriorCount : avgInterior;
    const avgPlateDrift = measurePlateDrift(world);
    const mountainDelta = avgMountainConvergent - avgContinentalInterior;
    const broadDelta = avgMountainConvergent - avgInterior;
    return {
      landRatio: land / size,
      seaRatio: 1 - land / size,
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

  function measurePlateDrift(world) {
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
    world.stats = analyzeWorld(world);
    world.lastStepMs = performance.now() - t0;
    return world;
  }


  // ---- src/render/map2d.js ----

  function createMapRenderer(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    let imageData = null;

    function render(world) {
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

    return { render };
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


  // ---- src/ui/controls.js ----
  function readParams(elements) {
    return {
      seedText: elements.seedText.value,
      waterLevel: Number(elements.waterLevel.value),
      intensity: Number(elements.intensity.value),
      plateCount: Number(elements.plateCount.value),
      timeScale: Number(elements.timeScale.value),
      resolution: elements.resolution.value,
      showBoundaries: elements.showBoundaries.checked,
      pipelineMode: elements.pipelineMode?.value ?? "geology-v2",
    };
  }

  function bindControlLabels(elements) {
    const update = () => {
      elements.waterLabel.textContent = `${elements.waterLevel.value}%`;
      elements.intensityLabel.textContent = `${Number(elements.intensity.value).toFixed(2)}x`;
      elements.platesLabel.textContent = elements.plateCount.value;
    };
    elements.waterLevel.addEventListener("input", update);
    elements.intensity.addEventListener("input", update);
    elements.plateCount.addEventListener("input", update);
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
  const renderer = createMapRenderer(elements.canvas);
  let world = createWorld(readParams(elements));
  let playing = false;
  let lastFrame = 0;

  renderAll();

  elements.playPause.addEventListener("click", () => {
    playing = !playing;
    elements.playPause.textContent = playing ? "暂停" : "播放";
    if (playing) requestAnimationFrame(loop);
  });

  elements.stepOnce.addEventListener("click", () => {
    updateWorldParams(world, readParams(elements));
    stepWorld(world);
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
      stepWorld(world);
      renderAll();
      lastFrame = now;
    }
    requestAnimationFrame(loop);
  }

  function rebuildWorld() {
    const wasPlaying = playing;
    playing = false;
    elements.playPause.textContent = "播放";
    world = createWorld(readParams(elements));
    renderAll();
    if (wasPlaying) {
      playing = true;
      elements.playPause.textContent = "暂停";
      requestAnimationFrame(loop);
    }
  }

  function renderAll() {
    renderer.render(world);
    updateStats(world);
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


})();
