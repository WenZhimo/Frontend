import { createCanvas, resizeCanvas } from "./utils.js";

export class BloomRenderer {
  constructor() {
    this.canvas = createCanvas();
    this.ctx = this.canvas.getContext("2d");
    this.smallCanvas = createCanvas();
    this.smallCtx = this.smallCanvas.getContext("2d");
  }

  render(emissionFrame, config) {
    resizeCanvas(this.canvas, emissionFrame.width, emissionFrame.height);
    const scale = config.quality === "high" ? 0.38 : config.quality === "low" ? 0.22 : 0.3;
    resizeCanvas(this.smallCanvas, emissionFrame.width * scale, emissionFrame.height * scale);
    const small = this.smallCtx;
    small.clearRect(0, 0, this.smallCanvas.width, this.smallCanvas.height);
    small.save();
    small.globalCompositeOperation = "lighter";
    small.imageSmoothingEnabled = true;
    small.globalAlpha = 1;
    small.drawImage(emissionFrame.canvas, 0, 0, this.smallCanvas.width, this.smallCanvas.height);
    small.filter = `blur(${Math.max(3, config.bloomRadius * scale)}px)`;
    small.globalAlpha = config.bloomStrength * 0.72;
    small.drawImage(this.smallCanvas, 0, 0);
    small.filter = `blur(${Math.max(6, config.bloomRadius * scale * 2.15)}px)`;
    small.globalAlpha = config.bloomStrength * 0.42;
    small.drawImage(this.smallCanvas, 0, 0);
    small.filter = "none";
    small.globalCompositeOperation = "source-atop";
    small.fillStyle = `rgba(${config.phosphorPalette.glow[0]}, ${config.phosphorPalette.glow[1]}, ${config.phosphorPalette.glow[2]}, 0.86)`;
    small.fillRect(0, 0, this.smallCanvas.width, this.smallCanvas.height);
    small.restore();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.smallCanvas, 0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = config.bloomStrength * 0.18;
    ctx.filter = `blur(${Math.max(1, config.bloomRadius * 0.22)}px)`;
    ctx.drawImage(emissionFrame.canvas, 0, 0);
    ctx.restore();
    ctx.filter = "none";
    return {
      canvas: this.canvas,
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }
}
