import { createValueNoise3D } from "./noise.js";
import { mixSeed } from "./prng.js";
import { physicalRadius, resolutionScale, wrapX } from "./grid.js";
import { spherePointForCell } from "./scale.js";

export function initializeBaseTerrain(world) {
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

export function initializeCrustState(grid) {
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

export function rebuildElevation(world) {
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

export function initializeSeaLevel(world) {
  const seaFraction = Math.max(0.05, Math.min(0.95, world.params.waterLevel / 100));
  const initialSeaLevel = quantile(world.grid.elev, seaFraction);
  world.seaLevel = initialSeaLevel;
  world.waterVolume = measureWaterVolume(world.grid.elev, initialSeaLevel);
}

export function updateSeaLevel(world) {
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

export function applyErosionAndDeposition(world) {
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
