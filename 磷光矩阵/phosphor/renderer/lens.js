export class LensDiffusion {
  compose(ctx, emissionFrame, bloomFrame, config, time = 0) {
    const { width, height } = emissionFrame;
    const palette = config.phosphorPalette;
    const flicker = 1 + Math.sin(time * 0.013) * config.flickerAmount;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${palette.black[0]}, ${palette.black[1]}, ${palette.black[2]})`;
    ctx.fillRect(0, 0, width, height);

    const haze = ctx.createRadialGradient(width * 0.52, height * 0.42, 0, width * 0.52, height * 0.42, Math.max(width, height) * 0.72);
    haze.addColorStop(0, "rgba(34, 42, 112, 0.42)");
    haze.addColorStop(0.48, "rgba(12, 17, 46, 0.24)");
    haze.addColorStop(1, "rgba(0, 0, 0, 0.70)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1.2, config.opacity * flicker * 1.12);
    ctx.drawImage(bloomFrame.canvas, 0, 0);

    ctx.globalAlpha = config.diffusionStrength * 0.28;
    ctx.filter = `blur(${Math.max(0.5, config.diffusionStrength * 6)}px)`;
    ctx.drawImage(emissionFrame.canvas, 0, 0);

    ctx.globalAlpha = config.opacity;
    ctx.filter = "none";
    ctx.drawImage(emissionFrame.canvas, 0, 0);
    ctx.restore();
  }
}
