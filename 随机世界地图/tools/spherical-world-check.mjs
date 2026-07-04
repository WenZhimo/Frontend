import { createCheckWorld } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const resolution = process.argv[3] ?? "512x256";
const faceSize = Number(process.argv[4] ?? 64);

const cylindrical = createCheckWorld({
  seedText,
  resolution,
  pipelineMode: "geology-v2",
  topologyMode: "cylindrical",
});

const spherical = createCheckWorld({
  seedText,
  resolution,
  pipelineMode: "geology-v2",
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize,
});

const result = {
  valid: true,
  seedText,
  resolution,
  requestedFaceSize: faceSize,
  cylindrical: {
    topologyMode: cylindrical.params.topologyMode,
    projectionMode: cylindrical.params.projectionMode,
    hasSphericalGrid: Boolean(cylindrical.sphericalGrid),
    hasSphericalWorld: Boolean(cylindrical.sphericalWorld),
    simulationGridKind: cylindrical.grid.topology?.kind ?? cylindrical.grid.kind ?? "cylindrical",
    simulationSize: cylindrical.grid.size,
  },
  spherical: {
    topologyMode: spherical.params.topologyMode,
    projectionMode: spherical.params.projectionMode,
    hasSphericalGrid: Boolean(spherical.sphericalGrid),
    hasSphericalWorld: Boolean(spherical.sphericalWorld),
    hasSphericalTopology: Boolean(spherical.sphericalWorld?.topology),
    simulationGridKind: spherical.grid.topology?.kind ?? spherical.grid.kind ?? "cylindrical",
    simulationTopologyKind: spherical.grid.topologyKind ?? spherical.grid.topologyOptions?.kind ?? null,
    simulationGraphBacked: spherical.grid.topologyOptions?.graphBacked === true,
    simulationSize: spherical.grid.size,
    sphericalGridKind: spherical.sphericalGrid?.topologyKind ?? null,
    sphericalGridSize: spherical.sphericalGrid?.size ?? 0,
    sphericalFaceSize: spherical.sphericalGrid?.faceSize ?? 0,
    sphericalWorldKind: spherical.sphericalWorld?.kind ?? null,
    sphericalWorldRole: spherical.sphericalWorld?.role ?? null,
    sphericalWorldAuthoritative: spherical.sphericalWorld?.authoritative ?? null,
    sphericalWorldWritesProductionState: spherical.sphericalWorld?.writesProductionState ?? null,
    sphericalWorldTopologyKind: spherical.sphericalWorld?.topology?.topologyKind ?? null,
    sphericalWorldCellCount: spherical.sphericalWorld?.stats?.cellCount ?? 0,
    sphericalWorldActiveBoundaryShare: spherical.sphericalWorld?.stats?.activeBoundaryShare ?? 0,
  },
  notes: [
    "world.grid is the authoritative cubed-sphere production grid",
    "sphericalWorld remains a non-authoritative diagnostic sidecar for legacy probes only",
  ],
};

if (result.cylindrical.topologyMode !== "cylindrical") result.valid = false;
if (result.cylindrical.hasSphericalGrid) result.valid = false;
if (result.cylindrical.hasSphericalWorld) result.valid = false;
if (result.spherical.topologyMode !== "cubed-sphere") result.valid = false;
if (!result.spherical.hasSphericalGrid) result.valid = false;
if (!result.spherical.hasSphericalWorld) result.valid = false;
if (result.spherical.simulationTopologyKind !== "cubed-sphere") result.valid = false;
if (!result.spherical.simulationGraphBacked) result.valid = false;
if (result.spherical.simulationSize !== result.spherical.sphericalGridSize) result.valid = false;
if (result.spherical.sphericalGridKind !== "cubed-sphere") result.valid = false;
if (result.spherical.sphericalFaceSize !== Math.max(2, Math.trunc(faceSize))) result.valid = false;
if (result.spherical.sphericalWorldKind !== "spherical-experimental-world") result.valid = false;
if (result.spherical.sphericalWorldRole !== "diagnostic-sidecar") result.valid = false;
if (result.spherical.sphericalWorldAuthoritative !== false) result.valid = false;
if (result.spherical.sphericalWorldWritesProductionState !== false) result.valid = false;
if (!result.spherical.hasSphericalTopology) result.valid = false;
if (result.spherical.sphericalWorldTopologyKind !== "cubed-sphere") result.valid = false;
if (result.spherical.sphericalWorldCellCount !== result.spherical.sphericalGridSize) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
