import { physicalRadius, wrapX } from "../grid.js";
import { BoundaryType } from "../tectonics.js";
import { CrustType } from "./crust.js";

export const TectonicFeature = {
  NONE: 0,
  MOUNTAIN_BELT: 1,
  TRENCH: 2,
  RIDGE: 3,
  RIFT: 4,
  ISLAND_ARC: 5,
  BASIN: 6,
};

export function buildTectonicFeatures(world) {
  buildTectonicFeaturesV2(world);
}

export function buildTectonicFeaturesV2(world) {
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
