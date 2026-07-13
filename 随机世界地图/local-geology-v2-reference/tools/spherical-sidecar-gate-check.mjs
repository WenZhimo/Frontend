import { stepWorld } from "../src/sim/evolution.js";
import { createCheckWorld } from "./lib/world-runner.mjs";

const seedText = process.argv[2] ?? "龙骨海-纪元7";
const faceSize = Math.max(2, Math.trunc(Number(process.argv[3] ?? 24)));

const positive = runCase("valid-diagnostic-sidecar", () => null);
const authoritativeSpoof = runCase("authoritative-spoof-blocked", (world) => {
  world.sphericalWorld.authoritative = true;
});
const writerSpoof = runCase("production-writer-spoof-blocked", (world) => {
  world.sphericalWorld.writesProductionState = true;
});
const roleSpoof = runCase("role-spoof-blocked", (world) => {
  world.sphericalWorld.role = "production-core";
});

const checks = {
  validSidecarAdvanced: positive.advanced === true,
  authoritativeSpoofBlocked: authoritativeSpoof.advanced === false,
  writerSpoofBlocked: writerSpoof.advanced === false,
  roleSpoofBlocked: roleSpoof.advanced === false,
  productionAdvancedForAllCases: [positive, authoritativeSpoof, writerSpoof, roleSpoof].every((item) => item.worldStep === 1),
  productionStatsFiniteForAllCases: [positive, authoritativeSpoof, writerSpoof, roleSpoof].every((item) => item.productionStatsFinite),
};

const result = {
  valid: Object.values(checks).every(Boolean),
  seedText,
  faceSize,
  checks,
  cases: {
    positive,
    authoritativeSpoof,
    writerSpoof,
    roleSpoof,
  },
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function runCase(name, mutateSidecar) {
  const world = createCheckWorld({
    seedText,
    resolution: "256x128",
    pipelineMode: "geology-v2",
    topologyMode: "cubed-sphere",
    projectionMode: "equirectangular",
    faceSize,
  });
  const sidecar = world.sphericalWorld;
  mutateSidecar(world);
  const beforeStep = sidecar?.diagnosticStep ?? null;
  const beforeDrift = sidecar?.stats?.meanPlateDriftRadians ?? null;
  stepWorld(world);
  const afterStep = sidecar?.diagnosticStep ?? null;
  const afterDrift = sidecar?.stats?.meanPlateDriftRadians ?? null;
  return {
    name,
    role: sidecar?.role ?? null,
    authoritative: sidecar?.authoritative ?? null,
    writesProductionState: sidecar?.writesProductionState ?? null,
    beforeStep,
    afterStep,
    beforeDrift,
    afterDrift,
    advanced: Number(afterStep) > Number(beforeStep) && Number(afterDrift) > Number(beforeDrift),
    worldStep: world.step,
    productionStatsFinite: Number.isFinite(world.stats?.landRatio) && Number.isFinite(world.stats?.seaRatio),
  };
}
