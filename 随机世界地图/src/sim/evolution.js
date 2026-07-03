import { applyErosionAndDeposition, updateSeaLevel } from "./terrain.js";
import { runGeologyV2Step } from "./geology/pipeline.js";
import { runLegacyStep } from "./legacyPipeline.js";
import { stepSphericalExperimentalWorld } from "./sphere/sphericalWorld.js";
import { analyzeWorld } from "./world.js";

export function stepWorld(world) {
  const t0 = performance.now();
  if (world.params.pipelineMode === "geology-v2") {
    runGeologyV2Step(world);
  } else {
    runLegacyStep(world);
  }

  // Future phases plug in here: climateStep, hydrologyStep, biomeStep, resourceStep, impactStep.
  world.step += 1;
  world.ageYears += Number(world.params.timeScale);
  if (world.params.topologyMode === "cubed-sphere" && world.sphericalWorld) {
    stepSphericalExperimentalWorld(world.sphericalWorld, 1);
  }
  world.stats = analyzeWorld(world);
  world.lastStepMs = performance.now() - t0;
  return world;
}
