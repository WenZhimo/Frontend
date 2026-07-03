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

export function indexOf(grid, x, y) {
  return topologyForGrid(grid).index(x, y);
}

export function forEachNeighbor4(grid, x, y, visit) {
  const topology = topologyForGrid(grid);
  const id = topology.index(x, y);
  if (id < 0) return;
  for (const nid of topology.neighbors4(id)) {
    const nx = nid % grid.width;
    const ny = Math.floor(nid / grid.width);
    let dx = nx - x;
    if (dx > 1) dx = -1;
    if (dx < -1) dx = 1;
    visit(nx, ny, dx, ny - y);
  }
}
