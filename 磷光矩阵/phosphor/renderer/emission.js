import { colorToCss, createCanvas, mixColor, resizeCanvas } from "./utils.js";

export class EmissionRenderer {
  constructor() {
    this.canvas = createCanvas();
    this.ctx = this.canvas.getContext("2d");
  }

  render(cellField, config) {
    resizeCanvas(this.canvas, cellField.width, cellField.height);
    const ctx = this.ctx;
    const palette = config.phosphorPalette;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = "lighter";

    ctx.save();
    cellField.cells.forEach((cell) => {
      if (cell.value < 0.16) return;
      const glowSize = cell.size * (1.95 + cell.value * 1.45);
      const glowInset = (cell.pitch - glowSize) / 2;
      ctx.fillStyle = colorToCss(palette.glow, Math.min(0.5, cell.value * 0.4));
      ctx.fillRect(cell.x + glowInset, cell.y + glowInset, glowSize, glowSize);
    });
    ctx.restore();

    cellField.cells.forEach((cell) => {
      const hotness = Math.pow(cell.value, 1.55);
      const color = mixColor(palette.hot, palette.core, hotness);
      const alpha = Math.min(1, cell.value * config.coreIntensity);
      const inset = (cell.pitch - cell.size) / 2;
      const x = cell.x + inset;
      const y = cell.y + inset;

      ctx.fillStyle = colorToCss(color, alpha * 0.92);
      ctx.fillRect(x, y, cell.size, cell.size);

      if (cell.value > 0.38) {
        const coreSize = cell.size * 0.46;
        const coreInset = (cell.size - coreSize) / 2;
        ctx.fillStyle = colorToCss(palette.core, Math.min(1, (cell.value - 0.26) * 1.55));
        ctx.fillRect(x + coreInset, y + coreInset, coreSize, coreSize);
      }
    });

    ctx.globalCompositeOperation = "source-over";
    return {
      canvas: this.canvas,
      cellField,
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }
}
