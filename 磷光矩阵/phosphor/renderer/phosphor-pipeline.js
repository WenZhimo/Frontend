import { BloomRenderer } from "./bloom.js";
import { EmissionRenderer } from "./emission.js";
import { LensDiffusion } from "./lens.js";
import { PixelMatrix } from "./pixel-matrix.js";
import { SourceSampler } from "./source-sampler.js";
import { DisplayTexture } from "./texture.js";

export class PhosphorPipeline {
  constructor() {
    this.sourceSampler = new SourceSampler();
    this.pixelMatrix = new PixelMatrix();
    this.emission = new EmissionRenderer();
    this.bloom = new BloomRenderer();
    this.lens = new LensDiffusion();
    this.texture = new DisplayTexture();
    this.ctx = null;
    this.lastTrace = null;
    this.cachedStages = null;
    this.lastStageTime = -Infinity;
    this.lastStageSize = "";
  }

  invalidate() {
    this.cachedStages = null;
    this.lastStageTime = -Infinity;
    this.lastStageSize = "";
  }

  render(_ctx, target, surface, config, time) {
    const ctx = this.ctx || surface.canvas.getContext("2d", { alpha: true });
    this.ctx = ctx;
    const stageSize = `${surface.width}x${surface.height}`;
    const shouldRebuild = !this.cachedStages ||
      this.lastStageSize !== stageSize ||
      time - this.lastStageTime >= config.sourceFrameInterval;

    if (shouldRebuild) {
      const sourceFrame = this.sourceSampler.sample(target, surface, config, time);
      const cellField = this.pixelMatrix.build(sourceFrame, config);
      const emissionFrame = this.emission.render(cellField, config);
      const bloomFrame = this.bloom.render(emissionFrame, config);
      this.cachedStages = { sourceFrame, cellField, emissionFrame, bloomFrame };
      this.lastStageTime = time;
      this.lastStageSize = stageSize;
    }

    const { sourceFrame, cellField, emissionFrame, bloomFrame } = this.cachedStages;
    this.lens.compose(ctx, emissionFrame, bloomFrame, config, time);
    this.texture.apply(ctx, emissionFrame.width, emissionFrame.height, config, time);
    this.lastTrace = {
      sourceFrame,
      cellField,
      emissionFrame,
      bloomFrame,
      modules: [
        "SourceSampler",
        "PixelMatrix",
        "EmissionRenderer",
        "BloomRenderer",
        "LensDiffusion",
        "DisplayTexture",
      ],
    };
    return this.lastTrace;
  }
}
