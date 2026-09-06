// ---------------------------------------------------------------------------
// ISKRA.GRAPHICS identity, transcribed from the brand kit so the game prints in
// the studio's own inks and marks rather than approximations of them.
//   Brand Kit → palette.svg, logo/iskra-wordmark.svg, logo/iskra-star.svg
// ---------------------------------------------------------------------------

export const PAPER  = '#EFECE3';
export const INK    = '#161513';
export const CYAN   = '#12A3DA';
export const MAG    = '#EC0A63';
export const YELLOW = '#F7CF16';
export const GREEN  = '#00A651';  // C + Y
export const VIOLET = '#4A44A0';  // C + M
export const RED    = '#E40808';  // M + Y, multiplied from the two plates

// ink at a given opacity, for hierarchy that stays inside the palette
export const ink = (a) => `rgba(22, 21, 19, ${a})`;

// --- stencil wordmark -------------------------------------------------------
// 10x14 rect grid, exactly as drawn in iskra-wordmark.svg (viewBox 0 0 54 14).
const WORDMARK = [
  [0, 0, 4, 14],
  [6.5, 0, 10, 3], [6.5, 3, 3, 3], [6.5, 6, 10, 3], [13.5, 9, 3, 2], [6.5, 11, 10, 3],
  [19, 0, 3, 14], [22, 5, 4, 4], [25, 0, 4, 6], [25, 8, 4, 6],
  [31.5, 0, 3, 14], [34.5, 0, 7, 3], [38.5, 3, 3, 3], [34.5, 6, 5, 3], [37.5, 9, 4, 5],
  [44, 0, 10, 3], [44, 3, 3, 11], [51, 3, 3, 11], [47, 7, 4, 3],
];
export const WORDMARK_RATIO = 54 / 14;

// x,y is the top-left of the wordmark; height drives the scale
export function drawWordmark(g, x, y, height, color) {
  const k = height / 14;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.fillStyle = color;
  for (const [rx, ry, rw, rh] of WORDMARK) g.fillRect(rx, ry, rw, rh);
  g.restore();
}

// --- plate-cluster logo mark ------------------------------------------------
// iskra-mark.svg: five process-ink plates in a 320x128 box. This is the logo.
const PLATES_MARK = [
  [0, 0, 128, 64, CYAN],
  [128, 0, 64, 64, PAPER],
  [192, 0, 128, 64, MAG],
  [128, 64, 64, 64, YELLOW],
  [192, 64, 64, 64, INK],
];
export const MARK_RATIO = 320 / 128;

// The lockup exactly as iskra-lockup-mark.svg draws it: the plate mark, then
// the wordmark centred beneath it. Laid out in the SVG's own 320x226 units so
// the gap and the wordmark's inset are the brand's numbers, not guesses.
export const LOCKUP_RATIO = 320 / 226;

export function drawLockup(g, x, y, width, color = INK) {
  const k = width / 320;
  drawPlateMark(g, x, y, width);
  drawWordmark(g, x + 40 * k, y + 164 * k, (14 * 4.4444) * k, color);
}

export function drawPlateMark(g, x, y, width) {
  const k = width / 320;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  for (const [rx, ry, rw, rh, col] of PLATES_MARK) {
    g.fillStyle = col;
    g.fillRect(rx, ry, rw, rh);
  }
  g.restore();
}

// --- four-point star --------------------------------------------------------
// astroid-family power curve, p = 5: needle points on the axes, pinched waist
export function starPath(g, cx, cy, r, rot = 0) {
  const N = 96;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const px = r * Math.sign(c) * Math.abs(c) ** 5;
    const py = r * Math.sign(s) * Math.abs(s) ** 5;
    const X = cx + px * Math.cos(rot) - py * Math.sin(rot);
    const Y = cy + px * Math.sin(rot) + py * Math.cos(rot);
    if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
  }
  g.closePath();
}

export function drawStar(g, cx, cy, r, color, rot = 0) {
  g.fillStyle = color;
  starPath(g, cx, cy, r, rot);
  g.fill();
}

// --- press furniture --------------------------------------------------------
// corner crop marks, as on the studio's nameplate banner
export function drawCropMark(g, x, y, sx, sy, len = 14, gap = 5, color = ink(0.35)) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + sx * gap, y);
  g.lineTo(x + sx * (gap + len), y);
  g.moveTo(x, y + sy * gap);
  g.lineTo(x, y + sy * (gap + len));
  g.stroke();
  g.restore();
}
