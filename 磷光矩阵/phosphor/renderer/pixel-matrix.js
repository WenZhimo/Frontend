import { clamp, luminance } from "./utils.js";

export class PixelMatrix {
  build(sourceFrame, config) {
    const ctx = sourceFrame.canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, sourceFrame.width, sourceFrame.height);
    const pitch = Math.max(3, Math.round(config.matrixPitch * (window.devicePixelRatio || 1)));
    const fill = clamp(config.cellFillRatio, 0.2, 0.82);
    const cells = [];
    const sampleRadius = Math.max(1, Math.floor(pitch * 0.22));

    for (let y = 0; y < sourceFrame.height; y += pitch) {
      for (let x = 0; x < sourceFrame.width; x += pitch) {
        const value = this.sampleCell(image.data, sourceFrame.width, sourceFrame.height, x, y, sampleRadius);
        const contrasted = Math.pow(clamp((value - config.threshold) * config.contrast, 0, 1), 0.86) * config.brightness;
        if (contrasted > 0.01) {
          cells.push({
            x,
            y,
            pitch,
            size: Math.max(1, pitch * fill),
            value: clamp(contrasted, 0, 1),
          });
        }
      }
    }

    return {
      cells,
      pitch,
      width: sourceFrame.width,
      height: sourceFrame.height,
    };
  }

  sampleCell(data, width, height, x, y, radius) {
    let total = 0;
    let count = 0;
    const centerX = Math.min(width - 1, Math.round(x + radius));
    const centerY = Math.min(height - 1, Math.round(y + radius));
    for (let sy = centerY - radius; sy <= centerY + radius; sy += 1) {
      if (sy < 0 || sy >= height) continue;
      for (let sx = centerX - radius; sx <= centerX + radius; sx += 1) {
        if (sx < 0 || sx >= width) continue;
        const index = (sy * width + sx) * 4;
        total += luminance(data[index], data[index + 1], data[index + 2]) * (data[index + 3] / 255);
        count += 1;
      }
    }
    return count ? total / count : 0;
  }
}
