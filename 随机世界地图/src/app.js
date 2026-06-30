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


  // ---- src/sim/grid.js ----

  function createGrid(width, height) {
    const size = width * height;
    return {
      width,
      height,
      size,
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
      ageSubsidence: new Float32Array(size),
      thicknessBuoyancy: new Float32Array(size),
      sedimentFill: new Float32Array(size),
      ridgeUplift: new Float32Array(size),
      trenchDepression: new Float32Array(size),
      oceanDepthTerms: new Float32Array(size),
      crustDensity: new Float32Array(size),
      weakness: new Float32Array(size),
      orogeny: new Float32Array(size),
      boundaryInfluence: new Float32Array(size),
      boundaryDistance: new Float32Array(size),
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
    return y * grid.width + wrapX(grid.width, x);
  }

  function forEachNeighbor4(grid, x, y, visit) {
    const { width, height } = grid;
    visit(wrapX(width, x - 1), y, -1, 0);
    visit(wrapX(width, x + 1), y, 1, 0);
    if (y > 0) visit(x, y - 1, 0, -1);
    if (y < height - 1) visit(x, y + 1, 0, 1);
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
    grid.orogeny.fill(0);
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
    grid.ageSubsidence.fill(0);
    grid.thicknessBuoyancy.fill(0);
    grid.sedimentFill.fill(0);
    grid.ridgeUplift.fill(0);
    grid.trenchDepression.fill(0);
    grid.oceanDepthTerms.fill(0);
    grid.rift.fill(0);
    grid.islandArc.fill(0);
    grid.basin.fill(0);
    world.continentNoise = createValueNoise3D(mixSeed(seedUint32, 0x51f15eed));
    world.textureNoise = createValueNoise3D(mixSeed(seedUint32, 0xa24baed1));
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

    const { width, height, size, pvx, pvy, crustType, crustThickness, crustAge, orogeny, sediment, scratch, scratch2, scratch3 } = grid;
    const drift = 0.1 * world.timeScaleFactor * Math.max(0, world.params.intensity) * resolutionScale(grid) * interval;
    if (drift <= 0) return;

    scratch.set(crustThickness);
    scratch2.set(crustAge);
    scratch3.set(orogeny);
    const sedimentSource = new Float32Array(sediment);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        const previousType = crustType[id];
        const sx = x - pvx[id] * drift;
        const sy = y - pvy[id] * drift;
        crustThickness[id] = sampleBilinear(grid, scratch, sx, sy);
        if (previousType !== CrustType.OCEANIC) crustAge[id] = sampleBilinear(grid, scratch2, sx, sy);
        orogeny[id] = sampleBilinear(grid, scratch3, sx, sy) * 0.992;
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
        visit(wrapX(grid.width, x + dx), ny, dx === 0 || dy === 0 ? 1 : 0.55);
      }
    }
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
          orogeny[i] = Math.min(1, orogeny[i] + active * s * 0.0035 * dt);
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
    const { width, height, size, plate, boundaryDistance, boundaryInfluence, weakness, activeBoundary } = grid;
    const radius = physicalRadius(grid, 4);
    const q = new Int32Array(size);
    let head = 0;
    let tail = 0;
    boundaryDistance.fill(9999);
    boundaryInfluence.fill(0);
    activeBoundary.fill(0);

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
      boundaryInfluence[i] = Math.min(1, distanceBand * weakPath * segmented);
    }
  }

  function classifyBoundaryKindV2(world) {
    const { grid } = world;
    const { width, height, size, plate, pvx, pvy, btype, boundaryKind, stress, activeBoundary } = grid;
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
        boundaryKind[id] = btype[id];
      }
    }

    for (let i = 0; i < size; i += 1) {
      if (boundaryKind[i] === BoundaryType.INTERIOR && grid.boundaryInfluence[i] > 0.01) {
        boundaryKind[i] = nearestBoundaryKind(grid, i);
      }
    }
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
    const { size, crustType, crustThickness, crustAge, boundaryKind, boundaryInfluence, stress, weakness, scratch, scratch2, scratch3 } = grid;
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
      const signal = active * s * weakGate * broken;
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
            if (options.segmented && weak < 0.38 && ((nid * 2654435761) & 15) < 5) continue;
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
    const { width, size } = grid;
    externalSeaMask.fill(0);
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
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

    if (largestStart < 0) return;
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

  function labelClosedBasins(grid, seaMask, externalSeaMask, closedBasinId) {
    const { width, size } = grid;
    closedBasinId.fill(0);
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
    const {
      width,
      height,
      size,
      crustType,
      crustThickness,
      crustAge,
      orogeny,
      sediment,
      ageSubsidence,
      thicknessBuoyancy,
      sedimentFill,
      ridgeUplift,
      trenchDepression,
      oceanDepthTerms,
      passiveMargin,
      continentalShelf,
      continentalSlope,
      continentalRise,
      abyssalPlain,
      sedimentWedge,
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

      let crustBase;
      if (continental) {
        ageSubsidence[i] = 0;
        thicknessBuoyancy[i] = (crustThickness[i] - 0.52) * 0.19;
        sedimentFill[i] = sediment[i] * 0.025;
        ridgeUplift[i] = 0;
        trenchDepression[i] = 0;
        oceanDepthTerms[i] = 0;
        crustBase = 0.083 + (crustThickness[i] - 0.52) * 0.19;
      } else if (transitional) {
        ageSubsidence[i] = -Math.pow(Math.max(0, Math.min(1, crustAge[i])), 0.65) * 0.018;
        thicknessBuoyancy[i] = (crustThickness[i] - 0.38) * 0.22;
        sedimentFill[i] = sediment[i] * 0.095;
        ridgeUplift[i] = ridge[i] * 0.018;
        trenchDepression[i] = -trench[i] * 0.026;
        oceanDepthTerms[i] = ageSubsidence[i] + thicknessBuoyancy[i] + sedimentFill[i] + ridgeUplift[i] + trenchDepression[i];
        crustBase = 0.046 + thicknessBuoyancy[i] + ageSubsidence[i] * 0.35;
      } else {
        const normalizedAge = Math.max(0, Math.min(1, crustAge[i]));
        ageSubsidence[i] = -Math.pow(normalizedAge, 0.58) * 0.112;
        thicknessBuoyancy[i] = (crustThickness[i] - 0.22) * 0.105;
        sedimentFill[i] = sediment[i] * 0.075;
        ridgeUplift[i] = ridge[i] * 0.06;
        trenchDepression[i] = -trench[i] * (0.075 + normalizedAge * 0.035);
        oceanDepthTerms[i] = ageSubsidence[i] + thicknessBuoyancy[i] + sedimentFill[i] + ridgeUplift[i] + trenchDepression[i];
        crustBase = -0.03 + ageSubsidence[i] + thicknessBuoyancy[i];
      }
      const longTerm = orogeny[i] * (continental ? 0.16 : 0.045) + sedimentFill[i] - basin[i] * (transitional ? 0.002 : 0.018);
      const activeFeature =
        mountainBelt[i] * 0.18 -
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
  }


  // ---- src/sim/geology/pipeline.js ----

  function runGeologyV2Step(world) {
    // The staged calls below define the geology-v2 pipeline contract.
    advectCrust(world);
    updatePlateBoundaries(world);
    updateCrustProperties(world);
    updateTransformMemory(world);
    buildTectonicFeatures(world);
    rebuildGeologyElevation(world);
    if (!world.geologyV2SeaInitialized) {
      initializeSeaLevel(world);
      world.geologyV2SeaInitialized = true;
    }
    updateRiftStages(world);
    rebuildGeologyElevation(world);
    applyGeologyV2SurfaceAging(world);
    rebuildGeologyElevation(world);
    updateSeaLevel(world);
    deriveOceanConnectivity(world);
    updatePassiveMargins(world);
    rebuildGeologyElevation(world);
    suppressInactiveFractureRelief(world);
    updateSeaLevel(world);
    deriveOceanConnectivity(world);
    updatePassiveMargins(world);
    suppressInactiveFractureRelief(world);
    updateSeaLevel(world);
    deriveOceanConnectivity(world);
  }

  function applyGeologyV2SurfaceAging(world) {
    const { grid } = world;
    const { size, crustType, crustAge, crustThickness, orogeny, sediment, mountainBelt, trench, ridge, rift, islandArc, basin, boundaryInfluence, isContinental } = grid;
    const dt = world.timeScaleFactor;
    for (let i = 0; i < size; i += 1) {
      const inactive = 1 - Math.min(1, boundaryInfluence[i]);
      const oceanic = crustType[i] === CrustType.OCEANIC;
      const transitional = crustType[i] === CrustType.TRANSITIONAL;
      const erosion = (isContinental[i] ? 0.0018 : transitional ? 0.0024 : 0.0032) * dt * (0.25 + inactive);
      const lostOrogeny = Math.min(orogeny[i], orogeny[i] * erosion);
      orogeny[i] -= lostOrogeny;
      const lowOrPassive = inactive * (transitional ? 1.45 : oceanic && crustAge[i] > 0.45 ? 0.75 : 0.35);
      sediment[i] = Math.min(1, sediment[i] + lostOrogeny * 0.45 + lowOrPassive * Math.max(0, 0.58 - crustThickness[i]) * 0.0022 * dt);
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
    const { width, height, orogeny, sediment, basin, boundaryInfluence, crustType, scratch, scratch2, scratch3 } = grid;
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
      activeTransform: base.activeTransform,
      transformMemory: base.transformMemory,
      fractureZoneMemory: base.fractureZoneMemory,
    };
  }

  function getClimateInputs(world) {
    const base = buildTerrainBase(world);
    const { grid } = world;
    const { size, width, height, mountainBelt, orogeny } = grid;
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
        mountainAxis[id] = Math.max(mountainBelt?.[id] ?? 0, orogeny?.[id] ?? 0);
        mountainHeight[id] = Math.max(0, rel) * (0.45 + Math.min(1, mountainAxis[id] * 2.2));
        orographicBarrier[id] = Math.max(0, rel) * Math.min(1, base.ruggedness[id] * 5.5 + mountainAxis[id] * 1.4);
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
    };
  }

  function getHydrologyInputs(world) {
    const base = buildTerrainBase(world);
    const { grid } = world;
    const { size, elev, crustType, sediment, basin } = grid;
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
      sedimentSink[i] = Math.max(0, Math.min(1, basinValue * 0.48 + sed * 0.32 + slopePenalty * (base.landMask[i] ? 0.16 : 0.28)));
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
      continentalRise: base.continentalRise,
    };
  }

  function getBiosphereInputs(world) {
    const base = buildTerrainBase(world);
    const { grid } = world;
    const { size, elev, crustType, sediment, boundaryInfluence, ridge, trench, rift, islandArc, mountainBelt } = grid;
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
      soilDepthPotential[i] = Math.max(0, Math.min(1, sed * 0.58 + (1 - Math.min(1, base.slope[i] * 5.5)) * 0.3 + Math.max(0, base.relativeElevation[i]) * 0.06));
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
    const { size, crustType, crustAge, crustThickness, orogeny, islandArc, riftStage, sediment, basin, ridge, weakness, boundaryInfluence } = grid;
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
      sedimentaryBasin[i] = Math.max(0, Math.min(1, (basin?.[i] ?? 0) * 0.62 + (sediment?.[i] ?? 0) * 0.48));
      metamorphicBelt[i] = orogeny?.[i] ?? 0;
      igneousProvince[i] = Math.max(ridge?.[i] ?? 0, islandArc?.[i] ?? 0, riftValue * 0.65);
      hydrothermalPotential[i] = Math.max(0, Math.min(1, (ridge?.[i] ?? 0) * 0.42 + volcanicArc[i] * 0.45 + riftValue * 0.18 + (weakness?.[i] ?? 0) * (boundaryInfluence?.[i] ?? 0) * 0.22));
      mineralProvince[i] = 0;
    }

    return {
      crustType,
      crustAge,
      crustThickness,
      orogeny,
      volcanicArc,
      riftStage,
      passiveMargin,
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
    const activeTransform = new Float32Array(grid.activeTransform);
    const transformMemory = new Float32Array(grid.transformMemory);
    const fractureZoneMemory = new Float32Array(grid.fractureZoneMemory);

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
      activeTransform,
      transformMemory,
      fractureZoneMemory,
    };
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
    computeBoundaryStress(world);
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
          const offset = i * 4;
          if (btype[i] === BoundaryType.CONVERGENT) {
            blendPixel(data, offset, [231, 86, 66], 0.55);
          } else if (btype[i] === BoundaryType.DIVERGENT) {
            blendPixel(data, offset, [77, 195, 215], 0.5);
          } else {
            blendPixel(data, offset, [236, 196, 83], 0.46);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    return { render };
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
      pipelineMode: elements.pipelineMode?.value ?? "legacy",
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
