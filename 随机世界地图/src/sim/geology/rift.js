import { forEachNeighbor4, wrapX } from "../grid.js";
import { BoundaryType } from "../tectonics.js";
import { CrustType } from "./crust.js";

export const RiftStage = {
  NONE: 0,
  INCIPIENT_RIFT: 1,
  RIFT_BASIN: 2,
  TRANSITIONAL_RIFT: 3,
  PROTO_OCEAN_CANDIDATE: 4,
  CONNECTED_YOUNG_OCEAN: 5,
};

export function updateRiftStages(world) {
  const connectivity = deriveOceanConnectivity(world);
  const { grid } = world;
  const {
    size,
    crustType,
    crustThickness,
    crustAge,
    weakness,
    boundaryKind,
    boundaryInfluence,
    stress,
    rift,
    basin,
    sediment,
    riftStage,
    riftAge,
    protoOceanCandidate,
  } = grid;
  const dt = world.timeScaleFactor;
  const rel = connectivity.relativeElevation;
  protoOceanCandidate.fill(0);

  for (let i = 0; i < size; i += 1) {
    const divergent = boundaryKind[i] === BoundaryType.DIVERGENT ? 1 : 0;
    const riftPower = Math.max(divergent * Math.min(1, boundaryInfluence[i]) * Math.min(2.5, stress[i]) * (0.45 + weakness[i]), rift[i] * (0.55 + weakness[i]));
    const activeRift = riftPower > 0.09;
    const belowSea = rel[i] < 0;
    const nearSea = rel[i] < 0.045;
    let stage = riftStage[i];

    if (activeRift) {
      riftAge[i] = Math.min(1, riftAge[i] + dt / 80);
    } else {
      riftAge[i] = Math.max(0, riftAge[i] - dt / 260);
    }

    if (stage === RiftStage.NONE) {
      if (crustType[i] === CrustType.CONTINENTAL && riftPower > 0.14 && weakness[i] > 0.48) stage = RiftStage.INCIPIENT_RIFT;
    } else if (stage === RiftStage.INCIPIENT_RIFT) {
      if (activeRift && (riftAge[i] > 0.05 || crustThickness[i] < 0.54)) stage = RiftStage.RIFT_BASIN;
      else if (!activeRift && riftAge[i] <= 0.01) stage = RiftStage.NONE;
    } else if (stage === RiftStage.RIFT_BASIN) {
      if (activeRift && crustThickness[i] < 0.49 && weakness[i] > 0.56 && riftAge[i] > 0.11) stage = RiftStage.TRANSITIONAL_RIFT;
      else if (!activeRift && riftAge[i] <= 0.02) stage = RiftStage.INCIPIENT_RIFT;
    } else if (stage === RiftStage.TRANSITIONAL_RIFT) {
      if (activeRift && crustThickness[i] < 0.36 && nearSea && riftAge[i] > 0.18) stage = RiftStage.PROTO_OCEAN_CANDIDATE;
      else if (!activeRift && riftAge[i] <= 0.03) stage = RiftStage.RIFT_BASIN;
    } else if (stage === RiftStage.PROTO_OCEAN_CANDIDATE) {
      if (activeRift && belowSea && connectivity.externalSeaMask[i]) stage = RiftStage.CONNECTED_YOUNG_OCEAN;
      else if (!activeRift && (!belowSea || riftAge[i] <= 0.06)) stage = RiftStage.TRANSITIONAL_RIFT;
    } else if (stage === RiftStage.CONNECTED_YOUNG_OCEAN) {
      if (!connectivity.externalSeaMask[i] && !activeRift) stage = RiftStage.PROTO_OCEAN_CANDIDATE;
    }

    if (stage >= RiftStage.RIFT_BASIN) {
      basin[i] = Math.min(1, basin[i] + (0.0012 + riftPower * 0.0018) * dt);
      sediment[i] = Math.min(1, sediment[i] + (0.00025 + basin[i] * 0.00045) * dt);
    }
    if (stage >= RiftStage.TRANSITIONAL_RIFT && crustType[i] === CrustType.CONTINENTAL) {
      crustType[i] = CrustType.TRANSITIONAL;
      crustAge[i] = Math.min(crustAge[i], 0.22);
    }
    if (stage === RiftStage.PROTO_OCEAN_CANDIDATE) {
      protoOceanCandidate[i] = 1;
      crustType[i] = CrustType.TRANSITIONAL;
      crustAge[i] = Math.min(crustAge[i], 0.16);
      crustThickness[i] = Math.max(0.29, Math.min(crustThickness[i], 0.38));
    }
    if (stage === RiftStage.CONNECTED_YOUNG_OCEAN) {
      crustType[i] = CrustType.OCEANIC;
      crustAge[i] = Math.min(crustAge[i], 0.025);
      crustThickness[i] = Math.max(0.18, Math.min(crustThickness[i], 0.28));
      protoOceanCandidate[i] = 0;
    }

    if (activeRift && crustType[i] !== CrustType.OCEANIC) {
      const thinning = (stage >= RiftStage.RIFT_BASIN ? 0.00018 : 0.00008) * Math.sqrt(dt) * (0.5 + riftPower);
      crustThickness[i] = Math.max(stage >= RiftStage.TRANSITIONAL_RIFT ? 0.29 : 0.36, crustThickness[i] - thinning);
    }

    riftStage[i] = stage;
  }
}

export function deriveOceanConnectivity(world) {
  const { grid, seaLevel } = world;
  const { size, elev, externalSeaMask, inlandWaterCandidate, oceanConnectivity, closedBasinId } = grid;
  const relativeElevation = new Float32Array(size);
  const seaMask = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const rel = elev[i] - seaLevel;
    relativeElevation[i] = rel;
    if (rel < 0) seaMask[i] = 1;
  }

  fillExternalSea(grid, seaMask, externalSeaMask);
  labelClosedBasins(grid, seaMask, externalSeaMask, closedBasinId);

  for (let i = 0; i < size; i += 1) {
    inlandWaterCandidate[i] = seaMask[i] && !externalSeaMask[i] ? 1 : 0;
    oceanConnectivity[i] = externalSeaMask[i] ? 2 : inlandWaterCandidate[i] ? 1 : 0;
    if (grid.riftStage[i] === RiftStage.PROTO_OCEAN_CANDIDATE && externalSeaMask[i]) {
      grid.riftStage[i] = RiftStage.CONNECTED_YOUNG_OCEAN;
      grid.protoOceanCandidate[i] = 0;
    }
  }

  return { relativeElevation, seaMask, externalSeaMask, inlandWaterCandidate, oceanConnectivity, closedBasinId };
}

function fillExternalSea(grid, seaMask, externalSeaMask) {
  const { width, size } = grid;
  externalSeaMask.fill(0);
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
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

  if (largestStart < 0) return;
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

function labelClosedBasins(grid, seaMask, externalSeaMask, closedBasinId) {
  const { width, size } = grid;
  closedBasinId.fill(0);
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
      const x = id % width;
      const y = Math.floor(id / width);
      forEachNeighbor4(grid, x, y, (nx, ny) => {
        const nid = ny * width + nx;
        if (!seaMask[nid] || externalSeaMask[nid] || closedBasinId[nid]) return;
        closedBasinId[nid] = nextId;
        queue[tail++] = nid;
      });
    }
    nextId += 1;
  }
}
