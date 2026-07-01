import { spherePointForCell } from "../scale.js";
import { CrustType } from "./crust.js";

export function rebuildGeologyElevation(world) {
  rebuildGeologyElevationV2(world);
}

export function rebuildGeologyElevationV2(world) {
  const { grid, textureNoise } = world;
  const {
    width,
    height,
    size,
    crustType,
    crustThickness,
    crustAge,
    orogeny,
    activeOrogeny,
    oldOrogeny,
    orogenyAge,
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
    const ageReduction = 0.35 + Math.max(0, Math.min(1, orogenyAge?.[i] ?? 0)) * 0.55;
    const oldOrogenRelief = (oldOrogeny?.[i] ?? 0) * (continental ? 0.075 : transitional ? 0.035 : 0.004) * (1 - ageReduction * 0.62);
    const rootRelief = orogeny[i] * (continental ? 0.105 : transitional ? 0.032 : 0.004);
    const forelandSubsidence = (forelandBasin?.[i] ?? 0) * (continental ? 0.026 : transitional ? 0.018 : 0.002);
    const longTerm = rootRelief + oldOrogenRelief + sedimentFill[i] - basin[i] * (transitional ? 0.002 : 0.018) - forelandSubsidence;
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
}
