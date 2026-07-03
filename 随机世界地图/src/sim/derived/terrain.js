import { forEachGridCell, forEachNeighbor4, forEachNeighbor4ById, forEachNeighborRadiusById, physicalRadius, sampleGridWrapped, wrapX } from "../grid.js";
import { updateReliefBudgetDiagnostics } from "../geology/reliefBudget.js";
import { deriveOceanConnectivity } from "../geology/rift.js";
import { getGeologicSeaLevelDiagnostics } from "../geology/seaLevel.js";
import { getSedimentBudgetDiagnostics } from "../geology/sediment.js";
import { getIsostasyDiagnostics } from "../geology/isostasy.js";
import { deriveHydrology } from "../hydrology.js";
import { measureTopologyDiagnostics } from "../topology.js";

const TERRAIN_BASE_CACHE = Symbol("terrainBaseCache");
const TERRAIN_DERIVED_CACHE = Symbol("terrainDerivedCache");
const HYDROLOGY_CACHE = Symbol("hydrologyInputsCache");

export function getTerrainDerived(world) {
  const cached = getStepCache(world, TERRAIN_DERIVED_CACHE);
  if (cached) return cached.value;

  const base = getTerrainBase(world);
  const value = {
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
    erosionSource: base.erosionSource,
    sedimentFlux: base.sedimentFlux,
    sedimentSink: base.sedimentSink,
    sedimentCapacity: base.sedimentCapacity,
    sedimentCompaction: base.sedimentCompaction,
    sedimentLoadSubsidence: base.sedimentLoadSubsidence,
    isostaticBase: base.isostaticBase,
    crustBuoyancy: base.crustBuoyancy,
    densitySubsidence: base.densitySubsidence,
    lithosphereCooling: base.lithosphereCooling,
    isostaticResidual: base.isostaticResidual,
    sedimentBudgetError: base.sedimentBudgetError,
    depositionRate: base.depositionRate,
    erosionRate: base.erosionRate,
    sedimentBudgetDiagnostics: base.sedimentBudgetDiagnostics,
    isostasyDiagnostics: base.isostasyDiagnostics,
    topologyDiagnostics: measureTopologyDiagnostics(world),
    forelandBasin: base.forelandBasin,
    orogenicSedimentSupply: base.orogenicSedimentSupply,
    activeTransform: base.activeTransform,
    transformMemory: base.transformMemory,
    fractureZoneMemory: base.fractureZoneMemory,
    tectonicAxis: base.tectonicAxis,
    axisCurvature: base.axisCurvature,
    axisContinuity: base.axisContinuity,
    axisBoundaryDependency: base.axisBoundaryDependency,
    mountainHeightBlockiness: base.mountainHeightBlockiness,
    orographicBarrierContinuity: base.orographicBarrierContinuity,
    planetaryRelief: base.planetaryRelief,
    reliefDeficit: base.reliefDeficit,
    seaLevelSensitivity: base.seaLevelSensitivity,
    largePlainMask: base.largePlainMask,
    flatLandMask: base.flatLandMask,
    baseSeaLevel: base.geologicSeaLevelDiagnostics.baseSeaLevel,
    geologicSeaLevelOffset: base.geologicSeaLevelDiagnostics.geologicSeaLevelOffset,
    coastalSensitivity: base.coastalSensitivity,
    ridgeVolumeSignal: base.ridgeVolumeSignal,
    oldOceanCapacitySignal: base.oldOceanCapacitySignal,
    sedimentDisplacementSignal: base.sedimentDisplacementSignal,
    trenchCapacitySignal: base.trenchCapacitySignal,
  };
  setStepCache(world, TERRAIN_DERIVED_CACHE, value);
  return value;
}

export function getClimateInputs(world) {
  const base = getTerrainBase(world);
  const { grid } = world;
  const {
    size,
    width,
    height,
    mountainBelt,
    activeOrogeny,
    oldOrogeny,
    orogeny,
    mountainAxis: storedMountainAxis,
    mountainHeight: storedMountainHeight,
    orographicBarrier: storedOrographicBarrier,
  } = grid;
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
      mountainAxis[id] = Math.max(storedMountainAxis?.[id] ?? 0, mountainBelt?.[id] ?? 0, activeOrogeny?.[id] ?? 0, oldOrogeny?.[id] ?? 0, orogeny?.[id] ?? 0);
      mountainHeight[id] = Math.max(storedMountainHeight?.[id] ?? 0, Math.max(0, rel) * (0.45 + Math.min(1, mountainAxis[id] * 2.2)));
      orographicBarrier[id] = Math.max(storedOrographicBarrier?.[id] ?? 0, Math.max(0, rel) * Math.min(1, base.ruggedness[id] * 5.5 + mountainAxis[id] * 1.4));
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
    hypsometricSpread: base.reliefDiagnostics.hypsometricSpread,
    landReliefSpread: base.reliefDiagnostics.landReliefSpread,
    orographicReliefPotential: base.reliefDiagnostics.orographicReliefPotential,
    seaLevel: world.seaLevel,
    baseSeaLevel: base.geologicSeaLevelDiagnostics.baseSeaLevel,
    geologicSeaLevelOffset: base.geologicSeaLevelDiagnostics.geologicSeaLevelOffset,
    coastalSensitivity: base.coastalSensitivity,
  };
}

export function getHydrologyInputs(world, options = {}) {
  const diagnostics = options.diagnostics ?? "basic";
  const level = diagnosticsLevel(diagnostics);
  const cached = getStepCache(world, HYDROLOGY_CACHE);
  if (cached && cached.level >= level && !options.profile) return cached.value;

  const base = getTerrainBase(world);
  const value = deriveHydrology(world, base, options);
  if (!options.profile) setStepCache(world, HYDROLOGY_CACHE, value, { level });
  return value;
}

export function getBiosphereInputs(world) {
  const base = getTerrainBase(world);
  const { grid } = world;
  const { size, elev, crustType, sediment, boundaryInfluence, ridge, trench, rift, islandArc, mountainBelt, activeOrogeny, oldOrogeny, forelandBasin, orogenicSedimentSupply } = grid;
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
    soilDepthPotential[i] = Math.max(0, Math.min(1, sed * 0.52 + (orogenicSedimentSupply?.[i] ?? 0) * 0.24 + (forelandBasin?.[i] ?? 0) * 0.18 + (1 - Math.min(1, base.slope[i] * 5.5)) * 0.3 + Math.max(0, base.relativeElevation[i]) * 0.06));
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
      activeOrogeny?.[i] ?? 0,
      (oldOrogeny?.[i] ?? 0) * 0.35,
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

export function getResourceInputs(world) {
  const base = getTerrainBase(world);
  const { grid } = world;
  const { size, crustType, crustAge, crustThickness, crustBuoyancy, isostaticResidual, orogeny, activeOrogeny, oldOrogeny, forelandBasin, islandArc, riftStage, sediment, sedimentSink, basin, ridge, weakness, boundaryInfluence } = grid;
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
    sedimentaryBasin[i] = Math.max(0, Math.min(1, (basin?.[i] ?? 0) * 0.52 + (forelandBasin?.[i] ?? 0) * 0.38 + (sediment?.[i] ?? 0) * 0.42));
    metamorphicBelt[i] = Math.max(orogeny?.[i] ?? 0, oldOrogeny?.[i] ?? 0);
    igneousProvince[i] = Math.max(ridge?.[i] ?? 0, islandArc?.[i] ?? 0, riftValue * 0.65);
    hydrothermalPotential[i] = Math.max(0, Math.min(1, (ridge?.[i] ?? 0) * 0.42 + volcanicArc[i] * 0.45 + riftValue * 0.18 + (weakness?.[i] ?? 0) * (boundaryInfluence?.[i] ?? 0) * 0.22));
    mineralProvince[i] = 0;
  }

  return {
    crustType,
    crustAge,
    crustThickness,
    crustBuoyancy: new Float32Array(crustBuoyancy),
    isostaticResidual: new Float32Array(isostaticResidual),
    orogeny,
    orogenicBelt: maxFields(activeOrogeny, oldOrogeny, orogeny),
    tectonicAxis: new Float32Array(grid.tectonicAxis),
    activeOrogeny,
    oldOrogeny,
    forelandBasin,
    volcanicArc,
    riftStage,
    passiveMargin,
    sediment: new Float32Array(sediment),
    sedimentSink: new Float32Array(sedimentSink),
    basin,
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

function getTerrainBase(world) {
  const cached = getStepCache(world, TERRAIN_BASE_CACHE);
  if (cached) return cached.value;
  const value = buildTerrainBase(world);
  setStepCache(world, TERRAIN_BASE_CACHE, value);
  return value;
}

function getStepCache(world, key) {
  const cached = world[key];
  if (!cached || cached.step !== world.step || cached.ageYears !== world.ageYears) return null;
  return cached;
}

function setStepCache(world, key, value, extra = {}) {
  world[key] = {
    step: world.step,
    ageYears: world.ageYears,
    value,
    ...extra,
  };
}

function diagnosticsLevel(diagnostics) {
  if (diagnostics === "full") return 2;
  if (diagnostics === "none") return 0;
  return 1;
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
  const erosionSource = new Float32Array(grid.erosionSource);
  const sedimentFlux = new Float32Array(grid.sedimentFlux);
  const sedimentSink = new Float32Array(grid.sedimentSink);
  const sedimentCapacity = new Float32Array(grid.sedimentCapacity);
  const sedimentCompaction = new Float32Array(grid.sedimentCompaction);
  const sedimentLoadSubsidence = new Float32Array(grid.sedimentLoadSubsidence);
  const isostaticBase = new Float32Array(grid.isostaticBase);
  const crustBuoyancy = new Float32Array(grid.crustBuoyancy);
  const densitySubsidence = new Float32Array(grid.densitySubsidence);
  const lithosphereCooling = new Float32Array(grid.lithosphereCooling);
  const isostaticResidual = new Float32Array(grid.isostaticResidual);
  const sedimentBudgetError = new Float32Array(grid.sedimentBudgetError);
  const depositionRate = new Float32Array(grid.depositionRate);
  const erosionRate = new Float32Array(grid.erosionRate);
  const sedimentBudgetDiagnostics = getSedimentBudgetDiagnostics(world);
  const isostasyDiagnostics = getIsostasyDiagnostics(world);
  const activeTransform = new Float32Array(grid.activeTransform);
  const transformMemory = new Float32Array(grid.transformMemory);
  const fractureZoneMemory = new Float32Array(grid.fractureZoneMemory);
  const forelandBasin = new Float32Array(grid.forelandBasin);
  const orogenicSedimentSupply = new Float32Array(grid.orogenicSedimentSupply);
  const tectonicAxis = new Float32Array(grid.tectonicAxis);
  const axisCurvature = new Float32Array(grid.axisCurvature);
  const axisContinuity = new Float32Array(grid.axisContinuity);
  const axisBoundaryDependency = new Float32Array(grid.axisBoundaryDependency);
  const mountainHeightBlockiness = new Float32Array(grid.mountainHeightBlockiness);
  const orographicBarrierContinuity = new Float32Array(grid.orographicBarrierContinuity);
  const planetaryRelief = new Float32Array(grid.planetaryRelief);
  const reliefDeficit = new Float32Array(grid.reliefDeficit);
  const seaLevelSensitivity = new Float32Array(grid.seaLevelSensitivity);
  const largePlainMask = new Uint8Array(grid.largePlainMask);
  const flatLandMask = new Uint8Array(grid.flatLandMask);
  const reliefDiagnostics = updateReliefBudgetDiagnostics(world);
  const geologicSeaLevelDiagnostics = getGeologicSeaLevelDiagnostics(world);
  const coastalSensitivity = new Float32Array(grid.coastalSensitivity);
  const ridgeVolumeSignal = new Float32Array(grid.ridgeVolumeSignal);
  const oldOceanCapacitySignal = new Float32Array(grid.oldOceanCapacitySignal);
  const sedimentDisplacementSignal = new Float32Array(grid.sedimentDisplacementSignal);
  const trenchCapacitySignal = new Float32Array(grid.trenchCapacitySignal);

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
    erosionSource,
    sedimentFlux,
    sedimentSink,
    sedimentCapacity,
    sedimentCompaction,
    sedimentLoadSubsidence,
    isostaticBase,
    crustBuoyancy,
    densitySubsidence,
    lithosphereCooling,
    isostaticResidual,
    sedimentBudgetError,
    depositionRate,
    erosionRate,
    sedimentBudgetDiagnostics,
    isostasyDiagnostics,
    forelandBasin,
    orogenicSedimentSupply,
    activeTransform,
    transformMemory,
    fractureZoneMemory,
    tectonicAxis,
    axisCurvature,
    axisContinuity,
    axisBoundaryDependency,
    mountainHeightBlockiness,
    orographicBarrierContinuity,
    planetaryRelief,
    reliefDeficit,
    seaLevelSensitivity,
    largePlainMask,
    flatLandMask,
    reliefDiagnostics,
    geologicSeaLevelDiagnostics,
    coastalSensitivity,
    ridgeVolumeSignal,
    oldOceanCapacitySignal,
    sedimentDisplacementSignal,
    trenchCapacitySignal,
  };
}

function maxFields(...fields) {
  const size = fields.find(Boolean)?.length ?? 0;
  const output = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    let value = 0;
    for (const field of fields) if (field?.[i] > value) value = field[i];
    output[i] = value;
  }
  return output;
}

function measureTerrainShape(grid, field) {
  const { width, height, size } = grid;
  const slope = new Float32Array(size);
  const aspect = new Float32Array(size);
  const ruggedness = new Float32Array(size);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      const center = field[id];
      const left = finiteSample(grid, field, x - 1, y, center);
      const right = finiteSample(grid, field, x + 1, y, center);
      const up = finiteSample(grid, field, x, y - 1, center);
      const down = finiteSample(grid, field, x, y + 1, center);
      const dx = (right - left) * 0.5;
      const dy = (down - up) * 0.5;
      slope[id] = Math.hypot(dx, dy);
      aspect[id] = Math.atan2(dy, dx);

      let sum = 0;
      let count = 0;
      forEachNeighbor4ById(grid, id, (nid) => {
        sum += Math.abs(field[id] - field[nid]);
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
  forEachGridCell(grid, (id) => {
    let nearOpposite = false;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (landMask[nid] !== landMask[id]) nearOpposite = true;
    });
    if (nearOpposite) coast[id] = 1;
  });
  return distanceFromSources(grid, coast);
}

function distanceFromSources(grid, sourceMask) {
  const { size } = grid;
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
    forEachNeighbor4ById(grid, id, (nid) => {
      if (nextDistance >= distance[nid]) return;
      distance[nid] = nextDistance;
      queue[tail++] = nid;
    });
  }

  return distance;
}

function labelLandmasses(grid, landMask) {
  const { size } = grid;
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
      forEachNeighbor4ById(grid, id, (nid) => {
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
  const { size } = grid;
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
      forEachNeighbor4ById(grid, id, (nid) => {
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
  forEachGridCell(grid, (id) => {
    if (seaMask[id]) return;
    let lowerThanAll = true;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (field[id] >= field[nid]) lowerThanAll = false;
    });
    if (lowerThanAll) depressionMask[id] = 1;
  });
  return depressionMask;
}

function smoothElevation(grid, field, radius) {
  const { size } = grid;
  const output = new Float32Array(field.length);
  for (let id = 0; id < size; id += 1) {
    let total = field[id] * 2;
    let weight = 2;
    forEachNeighborRadiusById(grid, id, radius, (nid, dx, dy) => {
      const dist = Math.hypot(dx, dy);
      const w = 1 / (1 + dist);
      total += field[nid] * w;
      weight += w;
    });
    output[id] = total / weight;
  }
  return output;
}

function finiteSample(grid, field, x, y, fallback) {
  const value = sampleGridWrapped(grid, field, x, y);
  return Number.isFinite(value) ? value : fallback;
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
