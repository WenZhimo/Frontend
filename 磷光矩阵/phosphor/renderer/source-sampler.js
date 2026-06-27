import { clamp, createCanvas, isElementVisible, luminance, parseCssColor, resizeCanvas } from "./utils.js";

const TEXT_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "p",
  "a",
  "button",
  "label",
  "input",
  "textarea",
  "select",
  "th",
  "td",
  ".metric",
  ".eyebrow",
  ".chip",
  ".caption",
  ".status",
].join(",");

const SURFACE_SELECTOR = [
  ".heroCopy",
  ".panel",
  ".card",
  ".mediaBox",
  ".assetFrame",
  ".chartCard",
  ".tableWrap",
  ".colorBlock",
  "input",
  "select",
  "textarea",
  "button",
  "canvas",
  "img",
  "video",
].join(",");

export class SourceSampler {
  constructor() {
    this.canvas = createCanvas();
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  resize(width, height) {
    resizeCanvas(this.canvas, width, height);
  }

  sample(target, surface, config, time = 0) {
    this.resize(surface.width, surface.height);
    const ctx = this.ctx;
    const ratio = surface.dpr;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "rgb(3, 5, 11)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(ratio, ratio);
    this.paintPage(target, ctx, time);
    ctx.restore();
    return {
      canvas: this.canvas,
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  paintPage(target, ctx, time) {
    const pageRect = target.getBoundingClientRect();
    const rootStyle = window.getComputedStyle(target);
    const rootColor = parseCssColor(rootStyle.backgroundColor);
    const rootLight = luminance(rootColor[0], rootColor[1], rootColor[2]) * 0.06;
    ctx.fillStyle = `rgba(255, 255, 255, ${clamp(rootLight, 0.006, 0.032)})`;
    ctx.fillRect(Math.max(0, pageRect.left), Math.max(0, pageRect.top), pageRect.width, pageRect.height);

    target.querySelectorAll(SURFACE_SELECTOR).forEach((element) => {
      if (!isElementVisible(element) || element.dataset?.shaderMount !== undefined) return;
      this.paintSurfaceElement(element, ctx, time);
    });

    target.querySelectorAll(TEXT_SELECTOR).forEach((element) => {
      if (!isElementVisible(element)) return;
      this.paintTextElement(element, ctx);
    });
  }

  paintSurfaceElement(element, ctx, time) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const bg = parseCssColor(style.backgroundColor);
    const border = parseCssColor(style.borderTopColor);
    let level = luminance(bg[0], bg[1], bg[2]) * bg[3];

    if (element.matches(".colorBlock")) level = 0.38;
    if (element.matches("canvas")) level = 0.22;
    if (element.matches("img, video")) level = 0.26;
    if (element.matches("button, input, select, textarea")) level = Math.max(level, 0.32);

    if (level > 0.02) {
      ctx.fillStyle = `rgba(255, 255, 255, ${clamp(level * 0.075, 0.004, 0.052)})`;
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    }

    const borderLevel = luminance(border[0], border[1], border[2]) * border[3];
    if (borderLevel > 0.08 || element.matches(".panel, .card, .mediaBox, .chartCard, .assetFrame")) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${clamp(borderLevel * 0.34 + 0.08, 0.05, 0.2)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.left + 0.5, rect.top + 0.5, Math.max(1, rect.width - 1), Math.max(1, rect.height - 1));
    }

    if (element instanceof HTMLCanvasElement || element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
      this.paintMediaElement(element, ctx, rect, time);
    }
  }

  paintMediaElement(element, ctx, rect, time) {
    try {
      ctx.save();
      ctx.globalAlpha = element instanceof HTMLCanvasElement ? 0.72 : 0.5;
      ctx.filter = "grayscale(1) contrast(1.2)";
      ctx.drawImage(element, rect.left, rect.top, rect.width, rect.height);
      ctx.restore();
    } catch {
      const pulse = 0.12 + Math.sin(time * 0.003 + rect.left * 0.01) * 0.04;
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    }
  }

  paintTextElement(element, ctx) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const text = this.readElementText(element);
    if (!text) return;

    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const fontWeight = style.fontWeight || "400";
    const fontFamily = style.fontFamily || "sans-serif";
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.35;
    const color = parseCssColor(style.color);
    const isHeading = element.matches("h1, h2, h3, .metric, .eyebrow, button");
    const level = clamp(luminance(color[0], color[1], color[2]) * color[3] + (isHeading ? 0.26 : 0.12), 0.22, 1);

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = `rgba(255, 255, 255, ${level})`;
    const maxWidth = Math.max(20, rect.width);
    const x = rect.left;
    let y = rect.top;
    this.wrapText(ctx, text, maxWidth).slice(0, 8).forEach((line) => {
      if (y < window.innerHeight && y + lineHeight > 0) {
        ctx.fillText(line, x, y, maxWidth);
      }
      y += lineHeight;
    });
    ctx.restore();
  }

  readElementText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value || element.placeholder || "";
    }
    if (element instanceof HTMLSelectElement) {
      return element.selectedOptions[0]?.textContent?.trim() || "";
    }
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  wrapText(ctx, text, maxWidth) {
    if (text.length < 2) return [text];
    const chars = Array.from(text);
    const lines = [];
    let line = "";
    chars.forEach((char) => {
      const next = line + char;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = char.trimStart();
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
  }
}
