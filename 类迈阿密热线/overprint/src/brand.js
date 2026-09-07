// ---------------------------------------------------------------------------
// ISKRA.GRAPHICS identity, transcribed from the brand kit so the game prints in
// the studio's own inks and marks rather than approximations of them.
//   Brand Kit → palette.svg, logo/iskra-wordmark.svg, logo/iskra-star.svg
// ---------------------------------------------------------------------------

export const THEME_STORAGE_KEY = 'overprint.theme';
export const THEMES = {};
export const THEME_ORDER = [];

const REQUIRED_THEME_FIELDS = ['id', 'label', 'paper', 'ink', 'cyan', 'mag', 'yellow', 'green', 'violet', 'red'];

export function registerTheme(theme) {
  const next = { ...theme };
  for (const key of REQUIRED_THEME_FIELDS) {
    if (!next[key]) throw new Error(`theme missing required field: ${key}`);
  }
  const known = !!THEMES[next.id];
  THEMES[next.id] = next;
  if (!known) THEME_ORDER.push(next.id);
  return next;
}

registerTheme({
  id: 'light',
  label: '纸面',
  colorScheme: 'light',
  paper: '#EFECE3',
  ink: '#161513',
  cyan: '#12A3DA',
  mag: '#EC0A63',
  yellow: '#F7CF16',
  green: '#00A651',  // C + Y
  violet: '#4A44A0', // C + M
  red: '#E40808',    // M + Y, multiplied from the two plates
  panel: 'rgba(255, 255, 255, 0.55)',
  grainAlpha: 0.55,
  printBlend: 'multiply',
});

registerTheme({
  id: 'dark',
  label: '暗黑',
  colorScheme: 'dark',
  paper: '#101116',
  ink: '#EFECE3',
  cyan: '#32C8FF',
  mag: '#FF3B82',
  yellow: '#FFE45C',
  green: '#39D98A',
  violet: '#9A7CFF',
  red: '#FF5148',
  panel: 'rgba(255, 255, 255, 0.08)',
  grainAlpha: 0.38,
  printBlend: 'screen',
});

function readStoredThemeId() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // storage can be disabled in embedded contexts
  }
  if (typeof document !== 'undefined') return document.documentElement?.dataset?.theme;
  return null;
}

function pickThemeId(id) {
  return THEMES[id] ? id : 'light';
}

let activeThemeId = pickThemeId(readStoredThemeId());

export let PAPER  = THEMES[activeThemeId].paper;
export let INK    = THEMES[activeThemeId].ink;
export let CYAN   = THEMES[activeThemeId].cyan;
export let MAG    = THEMES[activeThemeId].mag;
export let YELLOW = THEMES[activeThemeId].yellow;
export let GREEN  = THEMES[activeThemeId].green;
export let VIOLET = THEMES[activeThemeId].violet;
export let RED    = THEMES[activeThemeId].red;

function syncThemeBindings(t) {
  PAPER = t.paper;
  INK = t.ink;
  CYAN = t.cyan;
  MAG = t.mag;
  YELLOW = t.yellow;
  GREEN = t.green;
  VIOLET = t.violet;
  RED = t.red;
}

function hexToRgb(hex) {
  const value = String(hex || '').trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [r, g, b] = short[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const full = /^#([0-9a-f]{6})$/i.exec(value);
  if (full) {
    const n = parseInt(full[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return { r: 22, g: 21, b: 19 };
}

function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function currentThemeId() {
  return activeThemeId;
}

export function currentTheme() {
  return THEMES[activeThemeId] || THEMES.light;
}

export function themeColor(name) {
  return currentTheme()[name] || currentTheme().ink;
}

export function printMode() {
  return currentTheme().printBlend || 'multiply';
}

// ink/paper at a given opacity, for hierarchy that stays inside the palette
export const ink = (a) => alpha(INK, a);
export const paper = (a) => alpha(PAPER, a);

export function applyThemeToDocument() {
  if (typeof document === 'undefined') return currentTheme();
  const t = currentTheme();
  const root = document.documentElement;
  root.dataset.theme = t.id;
  root.style.colorScheme = t.colorScheme || 'light';
  const vars = {
    paper: t.paper,
    ink: t.ink,
    cyan: t.cyan,
    mag: t.mag,
    yellow: t.yellow,
    green: t.green,
    violet: t.violet,
    red: t.red,
    panel: t.panel || paper(0.55),
    'ink-35': ink(0.35),
    'ink-45': ink(0.45),
    'ink-72': ink(0.72),
  };
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(`--${key}`, value);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.paper);
  return t;
}

export function setTheme(id, opts = {}) {
  const nextId = pickThemeId(id);
  activeThemeId = nextId;
  const t = currentTheme();
  syncThemeBindings(t);
  if (opts.persist !== false) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, nextId);
    } catch {
      // theme still changes for this session
    }
  }
  applyThemeToDocument();
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('overprint:themechange', { detail: t }));
  }
  return t;
}

export function cycleTheme() {
  const idx = THEME_ORDER.indexOf(activeThemeId);
  return setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length] || 'light');
}

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
  [0, 0, 128, 64, 'cyan'],
  [128, 0, 64, 64, 'paper'],
  [192, 0, 128, 64, 'mag'],
  [128, 64, 64, 64, 'yellow'],
  [192, 64, 64, 64, 'ink'],
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
    g.fillStyle = themeColor(col);
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
