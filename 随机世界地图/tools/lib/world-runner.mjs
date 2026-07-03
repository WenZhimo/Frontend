import { createWorld } from "../../src/sim/world.js";
import { stepWorld } from "../../src/sim/evolution.js";

export function createCheckWorld({
  seedText = "龙骨海-纪元7",
  pipelineMode = "geology-v2",
  resolution = "512x256",
  topologyMode = "cylindrical",
  projectionMode = "equirectangular",
  faceSize,
  waterLevel = 50,
  intensity = 1,
  plateCount = 14,
  timeScale = 1_000_000,
} = {}) {
  return createWorld({
    seedText,
    waterLevel,
    intensity,
    plateCount,
    timeScale,
    resolution,
    pipelineMode,
    topologyMode,
    projectionMode,
    faceSize,
    showBoundaries: false,
  });
}

export function runToCheckpoints(world, checkpoints, onCheckpoint) {
  const sorted = [...new Set(checkpoints.map(Number).filter((v) => Number.isFinite(v) && v >= 0))]
    .sort((a, b) => a - b);
  const results = [];
  let totalMs = 0;
  let checkpointIndex = 0;

  while (checkpointIndex < sorted.length && sorted[checkpointIndex] === 0) {
    results.push(onCheckpoint(world, { totalMs, averageStepMs: 0, checkpoint: 0 }));
    checkpointIndex += 1;
  }

  const maxStep = sorted[sorted.length - 1] ?? 0;
  while (world.step < maxStep) {
    stepWorld(world);
    totalMs += world.lastStepMs ?? 0;
    while (checkpointIndex < sorted.length && world.step >= sorted[checkpointIndex]) {
      results.push(onCheckpoint(world, {
        totalMs,
        averageStepMs: totalMs / Math.max(1, world.step),
        checkpoint: sorted[checkpointIndex],
      }));
      checkpointIndex += 1;
    }
  }
  return { results, totalMs, averageStepMs: totalMs / Math.max(1, maxStep) };
}
