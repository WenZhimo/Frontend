import { forEachGridCell, forEachNeighborRadiusById, indexOf, physicalRadius } from "../grid.js";
import { topologyForGrid } from "../topology.js";
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
    const broken = weak < 0.3 && ((i * 1103515245 + 12345) & 7) < 3 ? 0.35 : 1;
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
    diffuseFeatureRaster(grid, source, spread, radius, gain, options);
  }

  for (let i = 0; i < size; i += 1) {
    if (spread[i] > 0) target[i] = Math.min(1, target[i] + spread[i]);
  }
}

function diffuseFeatureRaster(grid, source, spread, radius, gain, options) {
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
        const nid = indexOf(grid, sx, sy);
        if (nid < 0) continue;
        if (options.continentalOnly && crustType[nid] !== CrustType.CONTINENTAL) continue;
        if (options.oceanicBias && crustType[nid] !== CrustType.OCEANIC && dist > radius * 0.45) continue;
        const weak = weakness[nid];
        if (weak < (options.minWeakness ?? 0) && dist > 1.5) continue;
        if (options.segmented && weak < 0.38 && segmentMask(sx, sy, weak) < 0.8) continue;
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
    forEachNeighborRadiusById(grid, id, radius + arcOffsetDepth, (nid, dx, _dy) => {
      const edgeDistance = Math.max(0, dx);
      if (edgeDistance > radiusLimit + arcOffsetDepth) return;
      const targetDistance = Math.max(0, edgeDistance - arcOffsetDepth);
      if (targetDistance > radiusLimit) return;
      if (options.continentalOnly && crustType[nid] !== CrustType.CONTINENTAL) return;
      if (options.oceanicBias && crustType[nid] !== CrustType.OCEANIC && targetDistance > radius * 0.45) return;
      const weak = weakness[nid];
      if (weak < (options.minWeakness ?? 0) && targetDistance > 1.5) return;
      if (options.segmented) {
        if (weak < 0.38 && graphSegmentMask(id, nid, weak) < 0.8) return;
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

function segmentMask(x, y, weakness) {
  const sx = Math.floor((x + 5) / 11);
  const sy = Math.floor((y + 3) / 9);
  const n = hash2(sx, sy);
  return n < 0.58 + weakness * 0.28 ? 1 : 0.65;
}

function graphSegmentMask(sourceId, targetId, weakness) {
  const coarse = hash2(Math.floor((targetId + 17) / 19), Math.floor((sourceId + 31) / 23));
  const fine = hash2(targetId + 11, sourceId + 7);
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
