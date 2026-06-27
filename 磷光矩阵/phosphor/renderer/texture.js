export class DisplayTexture {
  constructor() {
    this.noiseCanvas = document.createElement("canvas");
    this.noiseCtx = this.noiseCanvas.getContext("2d");
  }

  apply(ctx, width, height, config, time = 0) {
    this.applyGridMemory(ctx, width, height, config);
    this.applyNoise(ctx, width, height, config, time);
    this.applyVignette(ctx, width, height, config);
  }

  applyGridMemory(ctx, width, height, config) {
    const pitch = Math.max(4, Math.round(config.matrixPitch * Math.min(window.devicePixelRatio || 1, config.maxDpr)));
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = "rgba(75, 92, 160, 0.55)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += pitch) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += pitch) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  applyNoise(ctx, width, height, config, time) {
    const amount = config.noiseAmount;
    if (amount <= 0) return;
    const noiseWidth = 180;
    const noiseHeight = 120;
    if (this.noiseCanvas.width !== noiseWidth || this.noiseCanvas.height !== noiseHeight) {
      this.noiseCanvas.width = noiseWidth;
      this.noiseCanvas.height = noiseHeight;
    }
    const image = this.noiseCtx.createImageData(noiseWidth, noiseHeight);
    let seed = Math.floor(time * 0.04) % 2147483647;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const value = 18 + (seed % 42);
      image.data[i] = value;
      image.data[i + 1] = value + 6;
      image.data[i + 2] = value + 18;
      image.data[i + 3] = Math.round(255 * amount);
    }
    this.noiseCtx.putImageData(image, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.noiseCanvas, 0, 0, width, height);
    ctx.restore();
  }

  applyVignette(ctx, width, height, config) {
    const strength = config.vignetteStrength;
    if (strength <= 0) return;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.12, width / 2, height / 2, Math.max(width, height) * 0.72);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.68, `rgba(0, 0, 0, ${strength * 0.25})`);
    gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
