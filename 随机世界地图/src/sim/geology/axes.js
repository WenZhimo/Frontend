import { forEachNeighbor4ById, physicalRadius, sampleGridWrapped, wrapX } from "../grid.js";
import { BoundaryType } from "../tectonics.js";
import { CrustType } from "./crust.js";

export function updateTectonicAxes(world) {
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

export function updateSurfaceContinuityDiagnostics(grid) {
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

      const left = sample(grid, tectonicAxis, x - 1, y);
      const right = sample(grid, tectonicAxis, x + 1, y);
      const up = sample(grid, tectonicAxis, x, y - 1);
      const down = sample(grid, tectonicAxis, x, y + 1);
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
      forEachNeighbor4ById(grid, id, (nid) => {
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
      const left = sample(grid, field, x - 1, y);
      const right = sample(grid, field, x + 1, y);
      const up = sample(grid, field, x, y - 1);
      const down = sample(grid, field, x, y + 1);
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
      forEachNeighbor4ById(grid, id, (nid) => {
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

function sample(grid, field, x, y) {
  const sy = Math.max(0, Math.min(grid.height - 1, y));
  return sampleGridWrapped(grid, field, x, sy);
}
