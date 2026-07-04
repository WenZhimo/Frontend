import { cellsFromReference, referenceCellsFromGridDistance, resolutionScale } from "./scale.js";
import { createTopology, topologyForGrid } from "./topology.js";

export function createGrid(width, height) {
  const size = width * height;
  return {
    width,
    height,
    size,
    topology: createTopology(width, height),
    topologyOptions: { kind: "cylindrical", wrapX: true, wrapY: false },
    elev: new Float32Array(size),
    baseElev: new Float32Array(size),
    relief: new Float32Array(size),
    boundaryRelief: new Float32Array(size),
    geologyBroadNoise: new Float32Array(size),
    geologyMicroNoise: new Float32Array(size),
    scratch: new Float32Array(size),
    scratch2: new Float32Array(size),
    scratch3: new Float32Array(size),
    crust: new Float32Array(size),
    crustReference: new Float32Array(size),
    crustType: new Uint8Array(size),
    crustThickness: new Float32Array(size),
    crustAge: new Float32Array(size),
    ridgeDistance: new Float32Array(size),
    isostaticBase: new Float32Array(size),
    crustBuoyancy: new Float32Array(size),
    densitySubsidence: new Float32Array(size),
    lithosphereCooling: new Float32Array(size),
    isostaticResidual: new Float32Array(size),
    ageSubsidence: new Float32Array(size),
    thicknessBuoyancy: new Float32Array(size),
    sedimentFill: new Float32Array(size),
    erosionSource: new Float32Array(size),
    sedimentFlux: new Float32Array(size),
    sedimentSink: new Float32Array(size),
    sedimentCapacity: new Float32Array(size),
    sedimentCompaction: new Float32Array(size),
    sedimentLoadSubsidence: new Float32Array(size),
    depositionRate: new Float32Array(size),
    erosionRate: new Float32Array(size),
    sedimentBudgetError: new Float32Array(size),
    ridgeUplift: new Float32Array(size),
    trenchDepression: new Float32Array(size),
    oceanDepthTerms: new Float32Array(size),
    crustDensity: new Float32Array(size),
    weakness: new Float32Array(size),
    orogeny: new Float32Array(size),
    activeOrogeny: new Float32Array(size),
    oldOrogeny: new Float32Array(size),
    orogenyAge: new Float32Array(size),
    orogenyErosion: new Float32Array(size),
    forelandBasin: new Float32Array(size),
    mountainAxis: new Float32Array(size),
    mountainHeight: new Float32Array(size),
    orographicBarrier: new Float32Array(size),
    orogenicSedimentSupply: new Float32Array(size),
    tectonicAxis: new Float32Array(size),
    mountainAxisSeed: new Float32Array(size),
    ridgeAxis: new Float32Array(size),
    trenchAxis: new Float32Array(size),
    riftAxis: new Float32Array(size),
    axisSegmentId: new Int32Array(size),
    axisCurvature: new Float32Array(size),
    axisContinuity: new Float32Array(size),
    axisBoundaryDependency: new Float32Array(size),
    mountainHeightBlockiness: new Float32Array(size),
    orographicBarrierContinuity: new Float32Array(size),
    planetaryRelief: new Float32Array(size),
    tectonicReliefSupply: new Float32Array(size),
    isostaticReliefSupply: new Float32Array(size),
    erosionFlatteningPressure: new Float32Array(size),
    sedimentSmoothingPressure: new Float32Array(size),
    reliefDeficit: new Float32Array(size),
    seaLevelSensitivity: new Float32Array(size),
    largePlainMask: new Uint8Array(size),
    flatLandMask: new Uint8Array(size),
    ridgeVolumeSignal: new Float32Array(size),
    oldOceanCapacitySignal: new Float32Array(size),
    sedimentDisplacementSignal: new Float32Array(size),
    trenchCapacitySignal: new Float32Array(size),
    coastalSensitivity: new Float32Array(size),
    isYoungOcean: new Uint8Array(size),
    boundaryInfluence: new Float32Array(size),
    boundaryDistance: new Float32Array(size),
    boundaryDensity: new Float32Array(size),
    boundaryCoherence: new Float32Array(size),
    noisyBoundaryPatch: new Uint8Array(size),
    plateCheckerboard: new Float32Array(size),
    boundaryKind: new Int8Array(size),
    plate: new Int32Array(size),
    pvx: new Float32Array(size),
    pvy: new Float32Array(size),
    pvz: new Float32Array(size),
    btype: new Int8Array(size),
    stress: new Float32Array(size),
    uplift: new Float32Array(size),
    sediment: new Float32Array(size),
    tectonicFeature: new Int8Array(size),
    featureIntensity: new Float32Array(size),
    mountainBelt: new Float32Array(size),
    trench: new Float32Array(size),
    ridge: new Float32Array(size),
    rift: new Float32Array(size),
    riftStage: new Uint8Array(size),
    riftAge: new Float32Array(size),
    protoOceanCandidate: new Uint8Array(size),
    inlandWaterCandidate: new Uint8Array(size),
    externalSeaMask: new Uint8Array(size),
    oceanConnectivity: new Uint8Array(size),
    closedBasinId: new Int32Array(size),
    passiveMargin: new Float32Array(size),
    continentalShelf: new Float32Array(size),
    continentalSlope: new Float32Array(size),
    continentalRise: new Float32Array(size),
    abyssalPlain: new Float32Array(size),
    sedimentWedge: new Float32Array(size),
    marginCoastDistance: new Float32Array(size),
    marginContinentalDistance: new Float32Array(size),
    marginOceanDistance: new Float32Array(size),
    marginExternalSeaDistance: new Float32Array(size),
    activeTransform: new Float32Array(size),
    transformMemory: new Float32Array(size),
    fractureZoneMemory: new Float32Array(size),
    inactiveBoundaryRelief: new Float32Array(size),
    oldBoundaryCorrelation: new Float32Array(size),
    ageBandStraightnessRisk: new Float32Array(size),
    islandArc: new Float32Array(size),
    basin: new Float32Array(size),
    isContinental: new Uint8Array(size),
    activeBoundary: new Uint8Array(size),
  };
}

export { cellsFromReference, referenceCellsFromGridDistance, resolutionScale };

export function physicalRadius(grid, referenceCells) {
  return cellsFromReference(grid, referenceCells);
}

export function wrapX(width, x) {
  return ((x % width) + width) % width;
}

export function gridParamWidth(grid) {
  return topologyForGrid(grid).width;
}

export function gridParamHeight(grid) {
  return topologyForGrid(grid).height;
}

export function wrapGridParamX(grid, x) {
  const topology = topologyForGrid(grid);
  if (typeof topology.wrapX === "function") return topology.wrapX(x);
  const width = gridParamWidth(grid);
  return width ? wrapX(width, x) : 0;
}

export function clampGridParamY(grid, y) {
  const topology = topologyForGrid(grid);
  const height = gridParamHeight(grid);
  return Math.max(0, Math.min(height - 1, y));
}

export function gridParamToU(grid, x) {
  const width = gridParamWidth(grid);
  return width ? wrapGridParamX(grid, x) / width : 0;
}

export function gridParamToV(grid, y) {
  const height = gridParamHeight(grid);
  return height ? Math.max(0, Math.min(1, y / height)) : 0;
}

export function indexOf(grid, x, y) {
  const topology = topologyForGrid(grid);
  if (typeof topology.index === "function") return topology.index(x, y);
  const width = gridParamWidth(grid);
  const height = gridParamHeight(grid);
  if (!width || !height) return -1;
  const sx = wrapGridParamX(grid, Math.floor(x));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const id = sy * width + sx;
  return id >= 0 && id < grid.size ? id : -1;
}

export function xyOf(grid, id) {
  const topology = topologyForGrid(grid);
  if (typeof topology.xy === "function") return topology.xy(id);
  const width = gridParamWidth(grid);
  return width ? { x: id % width, y: Math.floor(id / width) } : { x: id, y: 0 };
}

export function sampleGrid(grid, field, x, y) {
  const topology = topologyForGrid(grid);
  if (typeof topology.sample === "function") return topology.sample(field, x, y);
  const id = indexOf(grid, x, y);
  return id >= 0 ? field[id] : undefined;
}

export function sampleGridWrapped(grid, field, x, y) {
  const topology = topologyForGrid(grid);
  if (typeof topology.sampleWrapped === "function") return topology.sampleWrapped(field, x, y);
  const id = indexOf(grid, x, y);
  return id >= 0 ? field[id] : undefined;
}

export function sampleGridBilinear(grid, field, x, y, fallback = 0) {
  const height = gridParamHeight(grid);
  if (!height) return fallback;
  const sx = wrapGridParamX(grid, x);
  const sy = Math.max(0, Math.min(height - 1.001, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = wrapGridParamX(grid, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const i00 = indexOf(grid, x0, y0);
  const i10 = indexOf(grid, x1, y0);
  const i01 = indexOf(grid, x0, y1);
  const i11 = indexOf(grid, x1, y1);
  if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) {
    const nearest = sampleGridWrapped(grid, field, Math.round(x), Math.round(y));
    return Number.isFinite(nearest) ? nearest : fallback;
  }
  const a = field[i00] * (1 - tx) + field[i10] * tx;
  const b = field[i01] * (1 - tx) + field[i11] * tx;
  return a * (1 - ty) + b * ty;
}

export function forEachGridCell(grid, visit) {
  topologyForGrid(grid).forEachCell(visit);
}

export function forEachNeighbor4(grid, x, y, visit) {
  const topology = topologyForGrid(grid);
  if (typeof topology.index !== "function" || typeof topology.forEachNeighbor4 !== "function") return;
  const id = topology.index(x, y);
  if (id < 0) return;
  topology.forEachNeighbor4(id, (nid, dx, dy) => {
    const xy = typeof topology.xy === "function"
      ? topology.xy(nid)
      : { x: nid % grid.width, y: Math.floor(nid / grid.width) };
    visit(xy.x, xy.y, dx, dy);
  });
}

export function forEachNeighbor4ById(grid, id, visit) {
  const topology = topologyForGrid(grid);
  if (topology.forEachNeighbor4) {
    topology.forEachNeighbor4(id, (nid, dx, dy) => {
      visit(nid, dx, dy);
    });
    return;
  }
  topology.forEachNeighbor(id, (nid, slot, edgeLength) => {
    visit(nid, 0, 0, edgeLength, slot);
  });
}

export function forEachNeighbor8ById(grid, id, visit) {
  const topology = topologyForGrid(grid);
  if (topology.forEachNeighbor8) {
    topology.forEachNeighbor8(id, (nid, dx, dy) => {
      visit(nid, dx, dy);
    });
    return;
  }
  topology.forEachNeighbor(id, (nid, slot, edgeLength) => {
    visit(nid, 0, 0, edgeLength, slot);
  });
}

export function forEachNeighborRadiusById(grid, id, radius, visit) {
  const topology = topologyForGrid(grid);
  if (topology.forEachNeighborRadius) {
    topology.forEachNeighborRadius(id, radius, (nid, dx, dy) => {
      visit(nid, dx, dy);
    });
    return;
  }
  topology.forEachNeighborRing(id, radius, (nid, depth) => {
    visit(nid, depth, 0);
  });
}
