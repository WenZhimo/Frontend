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
    simulationGridKind: cylindrical.grid.topology?.kind ?? cylindrical.grid.kind ?? "cylindrical",
    simulationSize: cylindrical.grid.size,
  },
  spherical: {
    topologyMode: spherical.params.topologyMode,
    projectionMode: spherical.params.projectionMode,
    hasSphericalGrid: Boolean(spherical.sphericalGrid),
    simulationGridKind: spherical.grid.topology?.kind ?? spherical.grid.kind ?? "cylindrical",
    simulationSize: spherical.grid.size,
    sphericalGridKind: spherical.sphericalGrid?.topologyKind ?? null,
    sphericalGridSize: spherical.sphericalGrid?.size ?? 0,
    sphericalFaceSize: spherical.sphericalGrid?.faceSize ?? 0,
  },
  notes: [
    "cubed-sphere is attached as an experimental diagnostic grid only",
    "main simulation grid remains cylindrical until geology modules migrate to topology graph APIs",
  ],
};

if (result.cylindrical.topologyMode !== "cylindrical") result.valid = false;
if (result.cylindrical.hasSphericalGrid) result.valid = false;
if (result.spherical.topologyMode !== "cubed-sphere") result.valid = false;
if (!result.spherical.hasSphericalGrid) result.valid = false;
if (result.spherical.sphericalGridKind !== "cubed-sphere") result.valid = false;
if (result.spherical.sphericalFaceSize !== Math.max(2, Math.trunc(faceSize))) result.valid = false;
if (result.spherical.simulationSize !== result.cylindrical.simulationSize) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
