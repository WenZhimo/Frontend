import { forEachGridCell, forEachNeighbor4ById, indexOf } from "../grid.js";
import { BoundaryType } from "../tectonics.js";
import { CrustType } from "./crust.js";

export function updateTransformMemory(world) {
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

export function suppressInactiveFractureRelief(world) {
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

  scratch.set(elev);
  forEachGridCell(grid, (id) => {
    if (crustType[id] !== CrustType.OCEANIC) return;
    if (boundaryInfluence[id] > 0.18 || ridge[id] > 0.08 || trench[id] > 0.08) return;
    const memory = Math.max(transformMemory[id] * 0.55, fractureZoneMemory[id], inactiveBoundaryRelief[id]);
    if (memory <= 0.025) return;

    let total = scratch[id] * 2;
    let weight = 2;
    forEachNeighbor4ById(grid, id, (nid) => {
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
  });

  for (let i = 0; i < grid.size; i += 1) {
    if (crustType[i] !== CrustType.OCEANIC) continue;
    oldBoundaryCorrelation[i] = Math.max(0, Math.min(1, oldBoundaryCorrelation[i] * 0.88 + Math.abs(elev[i] - scratch[i]) * 8));
  }
}

function diffuseFractureMemory(grid) {
  const { crustType, fractureZoneMemory, boundaryInfluence, ridge, trench, scratch } = grid;
  scratch.set(fractureZoneMemory);
  forEachGridCell(grid, (id) => {
    if (crustType[id] !== CrustType.OCEANIC || scratch[id] < 0.02) return;
    if (boundaryInfluence[id] > 0.35 || ridge[id] > 0.2 || trench[id] > 0.2) return;
    let total = scratch[id] * 3;
    let weight = 3;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (crustType[nid] !== CrustType.OCEANIC) return;
      total += scratch[nid] * 0.55;
      weight += 0.55;
    });
    fractureZoneMemory[id] = Math.min(1, total / weight);
  });
}

function updateAgeBandRisk(grid) {
  const { crustType, crustAge, ridge, boundaryInfluence, fractureZoneMemory, ageBandStraightnessRisk } = grid;
  forEachGridCell(grid, (id, x, y) => {
    if (crustType[id] !== CrustType.OCEANIC) return;
    const band = Math.floor(crustAge[id] * 10);
    const horizontal = sameAgeBandAt(grid, x - 1, y, band) + sameAgeBandAt(grid, x + 1, y, band);
    const vertical = sameAgeBandAt(grid, x, y - 1, band) + sameAgeBandAt(grid, x, y + 1, band);
    const diagA = sameAgeBandAt(grid, x - 1, y - 1, band) + sameAgeBandAt(grid, x + 1, y + 1, band);
    const diagB = sameAgeBandAt(grid, x + 1, y - 1, band) + sameAgeBandAt(grid, x - 1, y + 1, band);
    const aligned = Math.max(horizontal, vertical, diagA, diagB);
    if (aligned < 2) return;
    const nearRidge = ridge[id] > 0.05 || grid.ridgeDistance[id] <= 3;
    if (nearRidge) return;
    const inactive = 1 - Math.min(1, boundaryInfluence[id]);
    ageBandStraightnessRisk[id] = Math.max(0, Math.min(1, inactive * (0.4 + fractureZoneMemory[id] * 0.8)));
  });
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
    forEachNeighbor4ById(grid, id, (nid) => {
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
  });
}

function sameAgeBandAt(grid, x, y, band) {
  const id = indexOf(grid, x, y);
  if (id < 0) return 0;
  return grid.crustType[id] === CrustType.OCEANIC && Math.floor(grid.crustAge[id] * 10) === band ? 1 : 0;
}

function halfLifeDecay(dt, halfLifeMyr) {
  return Math.pow(0.5, dt / Math.max(1, halfLifeMyr));
}
