import { forEachGridCell, forEachNeighbor4ById, physicalRadius } from "../grid.js";
import { topologyForGrid } from "../topology.js";
import { CrustType } from "./crust.js";

export function updatePassiveMargins(world) {
  const { grid, seaLevel } = world;
  const {
    width,
    height,
    size,
    elev,
    crustType,
    crustThickness,
    crustAge,
    sediment,
    basin,
    boundaryInfluence,
    ridge,
    trench,
    externalSeaMask,
    inlandWaterCandidate,
    passiveMargin,
    continentalShelf,
    continentalSlope,
    continentalRise,
    abyssalPlain,
    sedimentWedge,
    marginCoastDistance,
    marginContinentalDistance,
    marginOceanDistance,
    marginExternalSeaDistance,
    scratch,
    scratch2,
    scratch3,
  } = grid;

  const refreshDistance = !world.geologyV2MarginDistanceInitialized || world.step % 4 === 0;
  if (refreshDistance) {
    const landMask = new Uint8Array(size);
    const coastMask = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      if (elev[i] >= seaLevel) landMask[i] = 1;
    }

    forEachGridCell(grid, (id) => {
      let coast = false;
      forEachNeighbor4ById(grid, id, (nid) => {
        if (landMask[nid] !== landMask[id]) coast = true;
      });
      if (coast) coastMask[id] = 1;
    });

    marginCoastDistance.set(marginDistanceFromSources(grid, coastMask, scratch));
    marginContinentalDistance.set(marginDistanceFromCrust(grid, (type) => type === CrustType.CONTINENTAL, scratch2));
    marginOceanDistance.set(marginDistanceFromCrust(grid, (type) => type === CrustType.OCEANIC, scratch3));
    marginExternalSeaDistance.set(marginDistanceFromSources(grid, externalSeaMask, scratch));
    world.geologyV2MarginDistanceInitialized = true;
  }

  const coastDistance = marginCoastDistance;
  const continentalDistance = marginContinentalDistance;
  const oceanDistance = marginOceanDistance;
  const maxShelf = Math.max(3, physicalRadius(grid, 9));
  const maxRise = Math.max(6, physicalRadius(grid, 18));
  const externalSeaDistance = marginExternalSeaDistance;

  for (let i = 0; i < size; i += 1) {
    const externalSea = externalSeaMask[i] ? 1 : 0;
    const nearExternalSea = externalSeaDistance[i] <= maxRise * 1.15 ? 1 : 0;
    const land = elev[i] >= seaLevel ? 1 : 0;
    const externalOrCoastLand = externalSea || (land && nearExternalSea && coastDistance[i] <= maxShelf);
    const inactive = 1 - Math.min(1, boundaryInfluence[i]);
    const activeFeature = Math.max(ridge[i], trench[i], boundaryInfluence[i]);
    const passiveGate = Math.max(0, inactive) * Math.max(0, 1 - activeFeature * 1.6) * (inlandWaterCandidate[i] ? 0 : 1);
    const transition = crustType[i] === CrustType.TRANSITIONAL
      ? 1
      : crustType[i] === CrustType.OCEANIC && continentalDistance[i] <= maxRise
        ? Math.max(0, 1 - continentalDistance[i] / maxRise)
        : crustType[i] === CrustType.CONTINENTAL && oceanDistance[i] <= maxShelf
          ? Math.max(0, 1 - oceanDistance[i] / maxShelf) * 0.65
          : 0;
    const sedimentSupport = Math.min(1, sediment[i] * 2.6 + basin[i] * 0.55);
    const coastSupport = Math.max(0, 1 - Math.min(coastDistance[i], externalSeaDistance[i]) / Math.max(1, maxRise));
    const marginCore = Math.max(0, transition * 0.82 + sedimentSupport * 0.18 + coastSupport * 0.08 - 0.12);
    const rawPassiveMargin = passiveGate * externalOrCoastLand * marginCore * (0.78 + coastSupport * 0.22);
    passiveMargin[i] = Math.max(0, Math.min(1, Math.pow(rawPassiveMargin, 1.18)));

    const rel = elev[i] - seaLevel;
    const depth = Math.max(0, -rel);
    const shallow = externalSea && depth < 0.09 ? 1 - depth / 0.09 : 0;
    const nearCoast = Math.max(0, 1 - coastDistance[i] / Math.max(1, maxShelf));
    continentalShelf[i] = Math.max(0, Math.min(1, passiveMargin[i] * shallow * nearCoast * (0.55 + sedimentSupport * 0.45)));

    const slopeBand = externalSea && coastDistance[i] > maxShelf * 0.45 && coastDistance[i] <= maxRise * 0.85
      ? 1 - Math.abs(coastDistance[i] - maxShelf) / Math.max(1, maxRise * 0.55)
      : 0;
    const thicknessGradient = crustType[i] === CrustType.TRANSITIONAL ? 0.8 : Math.max(0, 1 - Math.abs(crustThickness[i] - 0.32) / 0.22);
    continentalSlope[i] = Math.max(0, Math.min(1, passiveMargin[i] * slopeBand * thicknessGradient));

    const riseBand = externalSea && coastDistance[i] > maxShelf && coastDistance[i] <= maxRise
      ? Math.max(0, 1 - Math.abs(coastDistance[i] - maxRise * 0.72) / Math.max(1, maxRise * 0.45))
      : 0;
    sedimentWedge[i] = Math.max(0, Math.min(1, passiveMargin[i] * (sedimentSupport * 0.72 + basin[i] * 0.22 + riseBand * 0.18)));
    continentalRise[i] = Math.max(0, Math.min(1, riseBand * sedimentWedge[i] * passiveGate));

    const oldOcean = crustType[i] === CrustType.OCEANIC && crustAge[i] > 0.35;
    const farFromActive = Math.max(ridge[i], trench[i], boundaryInfluence[i]) < 0.12;
    abyssalPlain[i] = oldOcean && externalSea && farFromActive
      ? Math.max(0, Math.min(1, (crustAge[i] - 0.25) * 1.1 + sediment[i] * 1.25 + basin[i] * 0.25))
      : 0;
  }

  smoothMarginFields(grid);
  clampMarginFields(grid);
}

function marginDistanceFromSources(grid, sourceMask, scratch) {
  const topology = topologyForGrid(grid);
  if (isGraphBackedGrid(grid, topology) && typeof topology.shortestDistanceSeeds === "function") {
    return topology.shortestDistanceSeeds(sourceMask);
  }

  const { size } = grid;
  scratch.fill(Number.POSITIVE_INFINITY);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i += 1) {
    if (!sourceMask[i]) continue;
    scratch[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const id = queue[head++];
    const next = scratch[id] + 1;
    forEachNeighbor4ById(grid, id, (nid) => {
      if (next >= scratch[nid]) return;
      scratch[nid] = next;
      queue[tail++] = nid;
    });
  }
  return new Float32Array(scratch);
}

function marginDistanceFromCrust(grid, predicate, scratch) {
  const source = new Uint8Array(grid.size);
  for (let i = 0; i < grid.size; i += 1) {
    if (predicate(grid.crustType[i])) source[i] = 1;
  }
  return marginDistanceFromSources(grid, source, scratch);
}

function smoothMarginFields(grid) {
  const fields = [
    grid.passiveMargin,
    grid.continentalShelf,
    grid.continentalSlope,
    grid.continentalRise,
    grid.sedimentWedge,
    grid.abyssalPlain,
  ];
  const { scratch } = grid;
  for (const field of fields) {
    scratch.set(field);
    forEachGridCell(grid, (id) => {
      let total = scratch[id] * 2.5;
      let weight = 2.5;
      forEachNeighbor4ById(grid, id, (nid) => {
        total += scratch[nid];
        weight += 1;
      });
      field[id] = Math.max(0, Math.min(1, total / weight));
    });
  }
}

function clampMarginFields(grid) {
  const {
    size,
    boundaryInfluence,
    ridge,
    trench,
    inlandWaterCandidate,
    externalSeaMask,
    passiveMargin,
    continentalShelf,
    continentalSlope,
    continentalRise,
    sedimentWedge,
    abyssalPlain,
  } = grid;
  for (let i = 0; i < size; i += 1) {
    const activeFeature = Math.max(boundaryInfluence[i], ridge[i], trench[i]);
    if (inlandWaterCandidate[i] || activeFeature > 0.46) {
      passiveMargin[i] = 0;
      continentalShelf[i] = 0;
      continentalSlope[i] = 0;
      continentalRise[i] = 0;
      sedimentWedge[i] = 0;
    }
    if (!externalSeaMask[i]) {
      continentalShelf[i] = 0;
      continentalSlope[i] = 0;
      continentalRise[i] = 0;
      abyssalPlain[i] = 0;
    }
  }
}

function isGraphBackedGrid(grid, topology = topologyForGrid(grid)) {
  return Boolean(
    grid.topologyOptions?.graphBacked ||
      topology?.topologyKind === "cubed-sphere" ||
      grid.topologyKind === "cubed-sphere",
  );
}
