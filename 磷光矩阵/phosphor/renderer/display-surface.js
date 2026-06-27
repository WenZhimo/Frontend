import { resizeCanvas } from "./utils.js";

export class DisplaySurface {
  constructor(config) {
    this.config = config;
    this.canvas = config.mount;
    this.resize = this.resize.bind(this);
    this.resize();
    window.addEventListener("resize", this.resize, { passive: true });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxDpr);
    this.dpr = dpr;
    this.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.height = Math.max(1, Math.round(window.innerHeight * dpr));
    this.cssWidth = window.innerWidth;
    this.cssHeight = window.innerHeight;
    resizeCanvas(this.canvas, this.width, this.height);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
  }

  show() {
    this.canvas.style.display = "block";
    this.canvas.style.pointerEvents = "none";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.dataset.phosphorRenderer = "on";
  }

  hide() {
    delete document.body.dataset.phosphorRenderer;
    this.canvas.style.display = "";
    this.clear();
  }

  clear() {
    const ctx = this.canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, this.width, this.height);
  }

  destroy() {
    window.removeEventListener("resize", this.resize);
    this.hide();
  }
}
