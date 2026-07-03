import { createCubedSphereGrid } from "./cubedSphere.js";
import {
  createSphericalDiagnosticNoiseFields,
  createSphericalDiagnosticTerrainFields,
} from "./sphericalWorld.js";
import {
  measureAreaStats,
  measureHemisphereAreaStats,
  finiteShare,
  maxFinite,
  weightedCategoryShares,
  weightedFieldSummary,
  weightedMean,
  weightedShare,
  weightedSum,
} from "./stats.js";
import { createSphericalTopology } from "./topology.js";
import {
  deriveSphericalOceanConnectivity,
  distanceFromGraphSources,
} from "./topologyGraph.js";

const FIELD_SPECS = [
  ["elev", Float32Array],
  ["baseElev", Float32Array],
  ["relief", Float32Array],
  ["boundaryRelief", Float32Array],
  ["geologyBroadNoise", Float32Array],
  ["geologyMicroNoise", Float32Array],
  ["scratch", Float32Array],
  ["scratch2", Float32Array],
  ["scratch3", Float32Array],
  ["crust", Float32Array],
  ["crustReference", Float32Array],
  ["crustType", Uint8Array],
  ["crustThickness", Float32Array],
  ["crustAge", Float32Array],
  ["crustDensity", Float32Array],
  ["weakness", Float32Array],
  ["plate", Int32Array],
  ["pvx", Float32Array],
  ["pvy", Float32Array],
  ["btype", Int8Array],
  ["boundaryKind", Int8Array],
  ["boundaryInfluence", Float32Array],
  ["boundaryDistance", Float32Array],
  ["boundaryDensity", Float32Array],
  ["boundaryCoherence", Float32Array],
  ["noisyBoundaryPatch", Uint8Array],
  ["plateCheckerboard", Float32Array],
  ["activeBoundary", Uint8Array],
  ["stress", Float32Array],
  ["uplift", Float32Array],
  ["riftStage", Uint8Array],
  ["riftAge", Float32Array],
  ["protoOceanCandidate", Uint8Array],
  ["externalSeaMask", Uint8Array],
  ["oceanConnectivity", Uint8Array],
  ["inlandWaterCandidate", Uint8Array],
  ["closedBasinId", Int32Array],
  ["passiveMargin", Float32Array],
  ["continentalShelf", Float32Array],
  ["continentalSlope", Float32Array],
  ["continentalRise", Float32Array],
  ["abyssalPlain", Float32Array],
  ["sedimentWedge", Float32Array],
  ["marginCoastDistance", Float32Array],
  ["marginContinentalDistance", Float32Array],
  ["marginOceanDistance", Float32Array],
  ["marginExternalSeaDistance", Float32Array],
  ["sediment", Float32Array],
  ["sedimentFlux", Float32Array],
  ["sedimentSink", Float32Array],
  ["sedimentCapacity", Float32Array],
  ["sedimentCompaction", Float32Array],
  ["sedimentLoadSubsidence", Float32Array],
  ["depositionRate", Float32Array],
  ["erosionRate", Float32Array],
  ["erosionSource", Float32Array],
  ["isostaticBase", Float32Array],
  ["crustBuoyancy", Float32Array],
  ["densitySubsidence", Float32Array],
  ["lithosphereCooling", Float32Array],
  ["isostaticResidual", Float32Array],
  ["ageSubsidence", Float32Array],
  ["thicknessBuoyancy", Float32Array],
  ["sedimentFill", Float32Array],
  ["ridgeUplift", Float32Array],
  ["trenchDepression", Float32Array],
  ["oceanDepthTerms", Float32Array],
  ["sedimentBudgetError", Float32Array],
  ["basin", Float32Array],
  ["orogeny", Float32Array],
  ["activeOrogeny", Float32Array],
  ["oldOrogeny", Float32Array],
  ["orogenyAge", Float32Array],
  ["orogenyErosion", Float32Array],
  ["forelandBasin", Float32Array],
  ["orogenicSedimentSupply", Float32Array],
  ["mountainBelt", Float32Array],
  ["mountainAxis", Float32Array],
  ["mountainAxisSeed", Float32Array],
  ["tectonicAxis", Float32Array],
  ["axisSegmentId", Int32Array],
  ["axisCurvature", Float32Array],
  ["axisContinuity", Float32Array],
  ["axisBoundaryDependency", Float32Array],
  ["mountainHeight", Float32Array],
  ["mountainHeightBlockiness", Float32Array],
  ["orographicBarrier", Float32Array],
  ["orographicBarrierContinuity", Float32Array],
  ["planetaryRelief", Float32Array],
  ["tectonicReliefSupply", Float32Array],
  ["isostaticReliefSupply", Float32Array],
  ["erosionFlatteningPressure", Float32Array],
  ["sedimentSmoothingPressure", Float32Array],
  ["reliefDeficit", Float32Array],
  ["seaLevelSensitivity", Float32Array],
  ["largePlainMask", Uint8Array],
  ["flatLandMask", Uint8Array],
  ["coastalSensitivity", Float32Array],
  ["ridgeVolumeSignal", Float32Array],
  ["oldOceanCapacitySignal", Float32Array],
  ["sedimentDisplacementSignal", Float32Array],
  ["trenchCapacitySignal", Float32Array],
  ["ridge", Float32Array],
  ["ridgeDistance", Float32Array],
  ["trench", Float32Array],
  ["rift", Float32Array],
  ["islandArc", Float32Array],
  ["ridgeAxis", Float32Array],
  ["trenchAxis", Float32Array],
  ["riftAxis", Float32Array],
  ["activeTransform", Float32Array],
  ["transformMemory", Float32Array],
  ["fractureZoneMemory", Float32Array],
  ["inactiveBoundaryRelief", Float32Array],
  ["oldBoundaryCorrelation", Float32Array],
  ["ageBandStraightnessRisk", Float32Array],
  ["isContinental", Uint8Array],
  ["isYoungOcean", Uint8Array],
  ["tectonicFeature", Int8Array],
  ["featureIntensity", Float32Array],
  ["diagnosticElevation", Float32Array],
  ["diagnosticSeaCandidate", Uint8Array],
  ["diagnosticRidgeCandidate", Float32Array],
  ["diagnosticTrenchCandidate", Float32Array],
];

export function createCubedSphereProductionGridAdapter({
  faceSize = 64,
  includeLegacyDimensions = false,
} = {}) {
  const sphericalGrid = createCubedSphereGrid(faceSize);
  const topology = createSphericalTopology(sphericalGrid);
  const grid = {
    kind: "cubed-sphere-production-grid-adapter",
    topologyKind: "cubed-sphere",
    size: sphericalGrid.size,
    cellCount: sphericalGrid.size,
    faceSize: sphericalGrid.faceSize,
    faceCount: sphericalGrid.faceCount,
    sphericalGrid,
    topology,
    topologyOptions: {
      kind: "cubed-sphere",
      graphBacked: true,
      wrapX: false,
      wrapY: false,
      rectangularIndexing: false,
    },
    positionX: sphericalGrid.positionX,
    positionY: sphericalGrid.positionY,
    positionZ: sphericalGrid.positionZ,
    lon: sphericalGrid.lon,
    lat: sphericalGrid.lat,
    area: sphericalGrid.area,
    face: sphericalGrid.face,
    faceU: sphericalGrid.faceU,
    faceV: sphericalGrid.faceV,
    neighborStart: sphericalGrid.neighborStart,
    neighborCount: sphericalGrid.neighborCount,
    neighbors: sphericalGrid.neighbors,
    edgeLength: sphericalGrid.edgeLength,
  };

  if (includeLegacyDimensions) {
    grid.width = sphericalGrid.faceSize;
    grid.height = sphericalGrid.faceCount * sphericalGrid.faceSize;
  }

  for (const [name, Type] of FIELD_SPECS) {
    grid[name] = new Type(sphericalGrid.size);
  }

  populateProductionAdapterDiagnosticTerrain(grid);
  return grid;
}

export function populateProductionAdapterDiagnosticTerrain(grid, { seedUint32 = 0 } = {}) {
  const diagnosticNoise = createSphericalDiagnosticNoiseFields(grid, seedUint32);
  const diagnosticBoundaries = createDiagnosticBoundaryProbe(grid);
  const diagnosticTerrain = createSphericalDiagnosticTerrainFields(
    grid,
    diagnosticNoise,
    diagnosticBoundaries,
  );
  grid.diagnosticNoise = diagnosticNoise;
  grid.diagnosticBoundaries = diagnosticBoundaries;
  grid.diagnosticTerrain = diagnosticTerrain;
  grid.diagnosticElevation.set(diagnosticTerrain.elevation);
  grid.diagnosticSeaCandidate.set(diagnosticTerrain.seaCandidate);
  grid.diagnosticRidgeCandidate.set(diagnosticTerrain.ridgeCandidate);
  grid.diagnosticTrenchCandidate.set(diagnosticTerrain.trenchCandidate);
  grid.baseElev.set(diagnosticTerrain.elevation);
  grid.elev.set(diagnosticTerrain.elevation);
  grid.relief.set(diagnosticNoise.combined);
  grid.isostaticBase.set(diagnosticTerrain.elevation);
  grid.ridge.set(diagnosticTerrain.ridgeCandidate);
  grid.ridgeAxis.set(diagnosticTerrain.ridgeCandidate);
  grid.ridgeUplift.set(diagnosticTerrain.ridgeCandidate);
  grid.trench.set(diagnosticTerrain.trenchCandidate);
  grid.trenchAxis.set(diagnosticTerrain.trenchCandidate);
  grid.trenchDepression.set(diagnosticTerrain.trenchCandidate);
  grid.tectonicAxis.set(diagnosticTerrain.ridgeCandidate);
  for (let id = 0; id < grid.size; id += 1) {
    const sea = diagnosticTerrain.seaCandidate[id] ? 1 : 0;
    const ridge = diagnosticTerrain.ridgeCandidate[id];
    const trench = diagnosticTerrain.trenchCandidate[id];
    grid.crustType[id] = sea ? 0 : 1;
    grid.crustThickness[id] = sea ? 0.28 : 0.64;
    grid.crustAge[id] = sea ? Math.max(0.02, Math.min(1, 0.45 + grid.positionY[id] * 0.22)) : 0;
    grid.crustDensity[id] = sea ? 0.62 : 0.32;
    grid.weakness[id] = Math.max(ridge, trench, Math.abs(diagnosticNoise.micro[id]) * 0.2);
    grid.boundaryInfluence[id] = Math.max(ridge, trench);
    grid.activeBoundary[id] = grid.boundaryInfluence[id] > 0 ? 1 : 0;
    grid.boundaryKind[id] = ridge > 0 ? 2 : trench > 0 ? 1 : 0;
    grid.stress[id] = Math.max(ridge, trench);
    grid.crustBuoyancy[id] = sea ? -0.08 : 0.08;
    grid.densitySubsidence[id] = sea ? -0.04 : 0.01;
    grid.lithosphereCooling[id] = sea ? -grid.crustAge[id] * 0.05 : 0;
    grid.ageSubsidence[id] = -grid.crustAge[id] * 0.05;
    grid.thicknessBuoyancy[id] = grid.crustThickness[id] * 0.12;
    grid.oceanDepthTerms[id] = sea ? grid.ageSubsidence[id] + grid.densitySubsidence[id] : 0;
    grid.isostaticResidual[id] = grid.elev[id] - grid.isostaticBase[id];
    grid.abyssalPlain[id] = sea && Math.abs(grid.elev[id] - diagnosticTerrain.seaLevel) > 0.16 ? 0.35 : 0;
    grid.continentalShelf[id] = sea && Math.abs(grid.elev[id] - diagnosticTerrain.seaLevel) < 0.08 ? 0.28 : 0;
    grid.continentalSlope[id] = sea && grid.continentalShelf[id] > 0 ? 0.12 : 0;
    grid.passiveMargin[id] = grid.continentalShelf[id] * 0.5;
    grid.sedimentCapacity[id] = sea ? 0.25 : 0.18;
    grid.sedimentSink[id] = Math.max(grid.continentalShelf[id], grid.abyssalPlain[id] * 0.2) * 0.1;
    grid.sediment[id] = grid.sedimentSink[id] * 0.4;
    grid.sedimentFill[id] = grid.sediment[id] * 0.08;
    grid.mountainHeight[id] = Math.max(0, grid.elev[id] - diagnosticTerrain.seaLevel);
    grid.orographicBarrier[id] = grid.mountainHeight[id] * 0.25;
    grid.planetaryRelief[id] = Math.abs(grid.relief[id]);
    grid.coastalSensitivity[id] = Math.max(0, 1 - Math.abs(grid.elev[id] - diagnosticTerrain.seaLevel) / 0.08);
  }
  grid.externalSeaMask.fill(0);
  grid.oceanConnectivity.fill(0);
  grid.inlandWaterCandidate.fill(0);
  grid.closedBasinId.fill(0);
  const connectivity = deriveSphericalOceanConnectivity(grid, grid.diagnosticSeaCandidate);
  grid.externalSeaMask.set(connectivity.externalSeaMask);
  grid.oceanConnectivity.set(connectivity.oceanConnectivity);
  grid.inlandWaterCandidate.set(connectivity.inlandWaterCandidate);
  grid.closedBasinId.set(connectivity.closedBasinId);
  grid.diagnosticConnectivity = connectivity;
  grid.diagnosticDistanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);
  return grid;
}

export function summarizeProductionGridAdapter(grid) {
  const areaTotal = sumField(grid.area);
  const synthetic = createStatsProbeFields(grid);
  const categoryShares = weightedCategoryShares(grid, synthetic.category, 3);
  const connectivity = createConnectivityProbe(grid, synthetic.seaMask);
  return {
    kind: grid.kind,
    topologyKind: grid.topologyKind,
    topologyApiKind: grid.topology?.topologyKind ?? null,
    size: grid.size,
    cellCount: grid.cellCount,
    faceSize: grid.faceSize,
    faceCount: grid.faceCount,
    hasLegacyDimensions: Object.hasOwn(grid, "width") && Object.hasOwn(grid, "height"),
    rectangularIndexing: Boolean(grid.topologyOptions?.rectangularIndexing),
    graphBacked: Boolean(grid.topologyOptions?.graphBacked),
    areaTotal,
    areaTotalError: Math.abs(areaTotal - 4 * Math.PI),
    areaStats: measureAreaStats(grid),
    hemisphereAreaStats: measureHemisphereAreaStats(grid),
    fieldCount: FIELD_SPECS.length,
    allFieldsMatchSize: FIELD_SPECS.every(([name]) => grid[name]?.length === grid.size),
    neighborSymmetryValid: measureNeighborSymmetry(grid),
    fieldSummaries: summarizeAdapterFields(grid),
    statsProbe: {
      weightedSum: weightedSum(grid, synthetic.scalar),
      weightedMean: weightedMean(grid, synthetic.scalar),
      northShare: weightedShare(grid, synthetic.northMask),
      categoryShares: Array.from(categoryShares.shares),
      categoryShareTotal: Array.from(categoryShares.shares).reduce((sum, value) => sum + value, 0),
      categoryTotalArea: categoryShares.totalArea,
    },
    connectivityProbe: connectivity,
    diagnosticTerrainProbe: createDiagnosticTerrainProbe(grid),
  };
}

export function productionAdapterFieldNames() {
  return FIELD_SPECS.map(([name]) => name);
}

export function summarizeAdapterFields(grid, names = productionAdapterFieldNames()) {
  const summaries = {};
  for (const name of names) {
    if (!grid[name] || grid[name].length !== grid.size) continue;
    summaries[name] = weightedFieldSummary(grid, grid[name]);
  }
  return summaries;
}

function measureNeighborSymmetry(grid) {
  let valid = true;
  for (let id = 0; id < grid.size && valid; id += 1) {
    const start = grid.neighborStart[id];
    for (let k = 0; k < grid.neighborCount[id]; k += 1) {
      const nid = grid.neighbors[start + k];
      if (!hasNeighbor(grid, nid, id)) {
        valid = false;
        break;
      }
    }
  }
  return valid;
}

function hasNeighbor(grid, id, target) {
  const start = grid.neighborStart[id];
  for (let k = 0; k < grid.neighborCount[id]; k += 1) {
    if (grid.neighbors[start + k] === target) return true;
  }
  return false;
}

function sumField(field) {
  let total = 0;
  for (let i = 0; i < field.length; i += 1) total += field[i];
  return total;
}

function createStatsProbeFields(grid) {
  const scalar = new Float32Array(grid.size);
  const northMask = new Uint8Array(grid.size);
  const category = new Int32Array(grid.size);
  const seaMask = new Uint8Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    scalar[id] = grid.positionY[id] * 0.5 + grid.positionZ[id] * 0.25;
    northMask[id] = grid.positionY[id] >= 0 ? 1 : 0;
    category[id] = grid.face[id] % 3;
    if (
      y < 0.26 ||
      (z > 0.25 && x < 0.2) ||
      (x > 0.34 && x < 0.62 && y > 0.38 && z > -0.18 && z < 0.28) ||
      (x < -0.42 && y > 0.18 && y < 0.56 && z < -0.18)
    ) {
      seaMask[id] = 1;
    }
  }
  return { scalar, northMask, category, seaMask };
}

function createConnectivityProbe(grid, seaMask) {
  const connectivity = deriveSphericalOceanConnectivity(grid, seaMask);
  const distanceToExternalSea = distanceFromGraphSources(grid, connectivity.externalSeaMask);
  return {
    seaShare: weightedShare(grid, seaMask),
    externalSeaShare: weightedShare(grid, connectivity.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, connectivity.inlandWaterCandidate),
    closedBasinCount: connectivity.closedBasinCount,
    componentCount: connectivity.componentCount,
    externalComponent: connectivity.externalComponent,
    externalArea: connectivity.externalArea,
    closedBasinIdMax: maxInt(connectivity.closedBasinId),
    distanceFiniteShare: finiteShare(distanceToExternalSea),
    distanceMaxFinite: maxFinite(distanceToExternalSea),
    largestComponentIsExternal: isLargestExternalComponent(connectivity),
  };
}

function createDiagnosticTerrainProbe(grid) {
  const terrain = grid.diagnosticTerrain;
  const connectivity = grid.diagnosticConnectivity;
  const distance = grid.diagnosticDistanceToExternalSea;
  return {
    hasDiagnosticTerrain: Boolean(terrain),
    seaLevel: terrain?.seaLevel ?? null,
    elevationMean: weightedMean(grid, grid.diagnosticElevation),
    seaCandidateShare: weightedShare(grid, grid.diagnosticSeaCandidate),
    externalSeaShare: weightedShare(grid, grid.externalSeaMask),
    inlandWaterCandidateShare: weightedShare(grid, grid.inlandWaterCandidate),
    closedBasinCount: connectivity?.closedBasinCount ?? 0,
    distanceFiniteShare: distance ? finiteShare(distance) : 0,
    ridgeCandidateMean: weightedMean(grid, grid.diagnosticRidgeCandidate),
    trenchCandidateMean: weightedMean(grid, grid.diagnosticTrenchCandidate),
    noiseCombinedMean: grid.diagnosticNoise ? weightedMean(grid, grid.diagnosticNoise.combined) : null,
  };
}

function createDiagnosticBoundaryProbe(grid) {
  const boundaryType = new Uint8Array(grid.size);
  const stress = new Float32Array(grid.size);
  for (let id = 0; id < grid.size; id += 1) {
    const x = grid.positionX[id];
    const y = grid.positionY[id];
    const z = grid.positionZ[id];
    const ridge = Math.abs(z + Math.sin(y * 3.1) * 0.18) < 0.035 && x > -0.75;
    const trench = Math.abs(x - Math.cos(z * 2.3) * 0.28) < 0.03 && y < 0.42;
    if (ridge) {
      boundaryType[id] = 2;
      stress[id] = 0.004 + Math.abs(y) * 0.002;
    } else if (trench) {
      boundaryType[id] = 1;
      stress[id] = 0.004 + Math.abs(z) * 0.002;
    }
  }
  return { boundaryType, stress };
}

function isLargestExternalComponent(connectivity) {
  for (let component = 1; component <= connectivity.componentCount; component += 1) {
    if (component === connectivity.externalComponent) continue;
    if ((connectivity.componentAreas[component] ?? 0) > connectivity.externalArea + 1e-8) return false;
  }
  return true;
}

function maxInt(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if (field[i] > max) max = field[i];
  return max;
}
