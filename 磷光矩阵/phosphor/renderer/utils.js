export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function colorToCss(color, alpha = 1) {
  return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${alpha})`;
}

export function mixColor(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

export function parseCssColor(value) {
  if (!value || value === "transparent") return [0, 0, 0, 0];
  const rgba = value.match(/rgba?\(([^)]+)\)/i);
  if (!rgba) return [0, 0, 0, 0];
  const parts = rgba[1].split(",").map((part) => Number.parseFloat(part.trim()));
  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
    Number.isFinite(parts[3]) ? parts[3] : 1,
  ];
}

export function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createCanvas(width = 1, height = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function resizeCanvas(canvas, width, height) {
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}

export function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 &&
    rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}
