import { applyErosionAndDeposition, updateSeaLevel } from "./terrain.js";
import { tectonicStep } from "./tectonics.js";

export function runLegacyStep(world) {
  tectonicStep(world);
  applyErosionAndDeposition(world);
  updateSeaLevel(world);
}
