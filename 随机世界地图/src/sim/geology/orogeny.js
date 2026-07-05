import { forEachGridCell, forEachNeighbor8ById, forEachNeighborRadiusById, indexOf, physicalRadius } from "../grid.js";
import { topologyForGrid } from "../topology.js";
import { BoundaryType } from "../tectonics.js";
import { CrustType } from "./crust.js";

export function updateOrogenicLifecycle(world) {
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

export function rebuildMountainInterfaceFields(world) {
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
    forEachNeighborRadiusById(grid, id, radius + bendDepth, (nid, depth) => {
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
    forEachNeighborRadiusById(grid, id, radius, (nid, depth) => {
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
