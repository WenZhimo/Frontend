import { initializeSeaLevel, updateSeaLevel } from "../terrain.js";
import { forEachGridCell, forEachNeighbor8ById, forEachNeighborRadiusById, indexOf, physicalRadius } from "../grid.js";
import { topologyForGrid } from "../topology.js";
import { updateSurfaceContinuityDiagnostics, updateTectonicAxes } from "./axes.js";
import { updatePlateBoundaries } from "./boundaries.js";
import { CrustType } from "./crust.js";
import { updateCrustProperties } from "./crust.js";
import { rebuildGeologyElevation } from "./elevation.js";
import { buildTectonicFeatures } from "./features.js";
import { updatePassiveMargins } from "./margins.js";
import { rebuildMountainInterfaceFields, updateOrogenicLifecycle } from "./orogeny.js";
import { advectCrust } from "./plates.js";
import { updateReliefBudgetDiagnostics } from "./reliefBudget.js";
import { deriveOceanConnectivity, updateRiftStages } from "./rift.js";
import { updateGeologicSeaLevel } from "./seaLevel.js";
import { updateSedimentBudget } from "./sediment.js";
import { suppressInactiveFractureRelief, updateTransformMemory } from "./transforms.js";

export function runGeologyV2Step(world) {
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
    forEachNeighborRadiusById(grid, id, radius, (nid, depth) => {
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
    forEachNeighborRadiusById(grid, id, radius + bendDepth, (nid, depth) => {
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
