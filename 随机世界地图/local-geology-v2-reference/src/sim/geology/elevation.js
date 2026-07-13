import { spherePointForCell } from "../scale.js";
import { forEachGridCell } from "../grid.js";
import { CrustType } from "./crust.js";
import { refreshIsostaticResidual, updateIsostasy } from "./isostasy.js";

export function rebuildGeologyElevation(world) {
  rebuildGeologyElevationV2(world);
}

export function rebuildGeologyElevationV2(world) {
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
