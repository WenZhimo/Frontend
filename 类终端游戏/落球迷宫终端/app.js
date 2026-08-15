const canvas = document.getElementById("terminal");
const ctx = canvas.getContext("2d", { alpha: false });
const seedForm = document.querySelector(".seed-bar");
const seedInput = document.getElementById("seed-input");
const playModeInput = document.getElementById("play-mode");
const difficultyInput = document.getElementById("difficulty");
const seedRandomButton = document.getElementById("seed-random");
const seedCopyButton = document.getElementById("seed-copy");
const seedStatus = document.getElementById("seed-status");

const COLS = 136;
const ROWS = 76;
const CELL_W = 11;
const CELL_H = 16;
const SEED_LEN = 100;
const ASCII_MIN = 33;
const ASCII_MAX = 126;
const HOME_KEY = ";";

canvas.width = COLS * CELL_W;
canvas.height = ROWS * CELL_H;
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = "top";
ctx.font = "700 15px Consolas, 'Cascadia Mono', 'Courier New', monospace";

const color = {
  page: "#020306",
  bg: "#05080e",
  bg2: "#07111a",
  grid: "#0b1a25",
  line: "#2c425a",
  lineDim: "#142638",
  white: "#edf9ff",
  muted: "#8a96ab",
  blue: "#69d7f0",
  green: "#57ff9b",
  yellow: "#ffd15f",
  orange: "#ff9b3e",
  red: "#ff4e65",
  violet: "#b99cff",
};

const glyph = {
  empty: " ",
  dot: "·",
  peg: "◆",
  pegHot: "✦",
  bumper: "▓",
  ball: "●",
  launcher: "▲",
  trail: "∙",
  spark: "*",
};

let buffer = [];
let rng = mulberry32(1);
let activeSeed = "";
let playMode = "demo";
let difficulty = "normal";
let speed = 1;
let paused = false;
let lastTime = 0;
let accumulator = 0;
let game = null;
let keys = new Set();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = (pb >> 16) & 255;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${rr.toString(16).padStart(2, "0")}${rg.toString(16).padStart(2, "0")}${rb
    .toString(16)
    .padStart(2, "0")}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sanitizeSeed(value) {
  return [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("")
    .slice(0, SEED_LEN);
}

function padSeed(value) {
  return sanitizeSeed(value).padEnd(SEED_LEN, " ");
}

function randomSeed() {
  let out = "";
  for (let i = 0; i < SEED_LEN; i += 1) {
    out += String.fromCharCode(ASCII_MIN + Math.floor(Math.random() * (ASCII_MAX - ASCII_MIN + 1)));
  }
  return out;
}

function setStatus() {
  seedStatus.textContent = `LEN ${activeSeed.length}/${SEED_LEN}`;
}

function makeCell() {
  return { ch: glyph.empty, fg: color.muted, bg: color.bg };
}

function clearBuffer() {
  buffer = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, makeCell));
}

function setCell(x, y, ch, fg = color.white, bg = null) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
  const cell = buffer[iy][ix];
  cell.ch = ch;
  cell.fg = fg;
  if (bg) cell.bg = bg;
}

function writeText(x, y, text, fg = color.white, bg = null) {
  for (let i = 0; i < text.length; i += 1) {
    setCell(x + i, y, text[i], fg, bg);
  }
}

function fillRectChars(x, y, w, h, ch, fg, bg = null) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setCell(xx, yy, ch, fg, bg);
  }
}

function drawBox(x, y, w, h, fg = color.line) {
  for (let xx = x + 1; xx < x + w - 1; xx += 1) {
    setCell(xx, y, "─", fg);
    setCell(xx, y + h - 1, "─", fg);
  }
  for (let yy = y + 1; yy < y + h - 1; yy += 1) {
    setCell(x, yy, "│", fg);
    setCell(x + w - 1, yy, "│", fg);
  }
  setCell(x, y, "┌", fg);
  setCell(x + w - 1, y, "┐", fg);
  setCell(x, y + h - 1, "└", fg);
  setCell(x + w - 1, y + h - 1, "┘", fg);
}

function drawLine(x0, y0, x1, y1, ch, fg) {
  let dx = Math.abs(Math.round(x1) - Math.round(x0));
  let dy = -Math.abs(Math.round(y1) - Math.round(y0));
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  for (let guard = 0; guard < 200; guard += 1) {
    setCell(x, y, ch, fg);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function makePeg(x, y, kind = "peg") {
  return {
    x,
    y,
    kind,
    lit: 0,
    value: kind === "bumper" ? 75 : 25,
    radius: kind === "bumper" ? 1.65 : 1.05,
  };
}

function initGame(seed) {
  activeSeed = padSeed(seed || randomSeed());
  seedInput.value = activeSeed.trimEnd();
  rng = mulberry32(hashSeed(activeSeed));
  playMode = playModeInput.value;
  difficulty = difficultyInput.value;
  paused = false;
  accumulator = 0;

  const pegs = [];
  const rows = difficulty === "chaos" ? 13 : 12;
  for (let row = 0; row < rows; row += 1) {
    const y = 12 + row * 4;
    const count = row % 2 === 0 ? 10 : 9;
    const spacing = 8;
    const start = row % 2 === 0 ? 13 : 17;
    for (let col = 0; col < count; col += 1) {
      const jitter = (rng() - 0.5) * 1.2;
      pegs.push(makePeg(start + col * spacing + jitter, y + (rng() - 0.5) * 0.5));
    }
  }
  for (let i = 0; i < 8; i += 1) {
    pegs.push(makePeg(16 + i * 10 + (rng() - 0.5) * 2, 18 + Math.floor(rng() * 34), "bumper"));
  }

  const binTemplates =
    difficulty === "chaos"
      ? [1, 2, 4, 8, 12, 8, 4, 2, 1]
      : [1, 2, 3, 5, 10, 5, 3, 2, 1];
  const bins = binTemplates.map((mult, i) => ({
    x0: 8 + i * 10,
    x1: 17 + i * 10,
    mult,
    pulse: 0,
  }));

  game = {
    board: { x: 4, y: 4, w: 96, h: 67 },
    hud: { x: 104, y: 6, w: 28, h: 61 },
    pegs,
    bins,
    balls: [],
    fx: [],
    logs: [">BOARD READY", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    score: 0,
    best: 0,
    shots: 0,
    ballsLeft: 12,
    combo: 0,
    launcherX: 52,
    launcherAngle: 0,
    launchCooldown: playMode === "demo" ? 1.1 : 0,
    message: "AIM FOR THE LIT SLOTS",
    messagePulse: 1,
    shake: 0,
  };
  setStatus();
}

function logLine(text) {
  game.logs.unshift(text.slice(0, 24));
  game.logs = game.logs.slice(0, 8);
}

function spawnBurst(x, y, fg, count = 14, force = 1) {
  const chars = [".", "·", ":", "*", "+", "✦"];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const s = (0.8 + rng() * 1.8) * force;
    game.fx.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.65,
      life: 0.45 + rng() * 0.45,
      maxLife: 0.9,
      ch: chars[Math.floor(rng() * chars.length)],
      fg,
    });
  }
}

function spawnBall() {
  if (game.ballsLeft <= 0 || game.balls.length > 0) return;
  const power = difficulty === "fast" ? 1.28 : difficulty === "chaos" ? 1.42 : 1.12;
  const angle = -Math.PI / 2 + game.launcherAngle;
  game.balls.push({
    x: game.launcherX,
    y: 7.2,
    vx: Math.cos(angle) * power,
    vy: Math.sin(angle) * power,
    trail: [],
    hot: 0,
  });
  game.ballsLeft -= 1;
  game.shots += 1;
  game.combo = 0;
  game.message = "BALL IN PLAY";
  game.messagePulse = 1;
  logLine(`>SHOT ${String(game.shots).padStart(2, "0")} RELEASE`);
  spawnBurst(game.launcherX, 7, color.blue, 10, 0.7);
}

function chooseAiTarget() {
  let best = game.bins[0];
  for (const bin of game.bins) {
    const noise = rng() * 2.6;
    if (bin.mult + noise > best.mult + rng()) best = bin;
  }
  const targetX = (best.x0 + best.x1) / 2 + (rng() - 0.5) * 4;
  const dx = targetX - game.launcherX;
  game.launcherAngle = clamp(dx / 70, -0.72, 0.72);
  game.launcherX = clamp(game.launcherX + dx * 0.035, 10, 92);
}

function updateInput(dt) {
  if (playMode === "demo") {
    chooseAiTarget();
    game.launchCooldown -= dt;
    if (game.launchCooldown <= 0 && game.balls.length === 0) {
      spawnBall();
      game.launchCooldown = difficulty === "fast" ? 1.1 : difficulty === "chaos" ? 0.8 : 1.45;
    }
    return;
  }

  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  if (left) game.launcherX = clamp(game.launcherX - 28 * dt, 10, 92);
  if (right) game.launcherX = clamp(game.launcherX + 28 * dt, 10, 92);
  const aim = (game.launcherX - 52) / 58;
  game.launcherAngle = clamp(aim, -0.75, 0.75);
}

function collidePeg(ball, peg) {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const distSq = dx * dx + dy * dy;
  const radius = peg.radius + 0.72;
  if (distSq > radius * radius || distSq < 0.01) return false;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx -= 1.85 * dot * nx;
  ball.vy -= 1.85 * dot * ny;
  ball.vx += nx * 0.08;
  ball.vy += ny * 0.05;
  ball.x = peg.x + nx * radius;
  ball.y = peg.y + ny * radius;
  ball.hot = 0.18;
  peg.lit = 0.7;
  game.combo += 1;
  const gained = peg.value * Math.max(1, Math.min(8, game.combo));
  game.score += gained;
  game.best = Math.max(game.best, game.score);
  spawnBurst(peg.x, peg.y, peg.kind === "bumper" ? color.violet : color.yellow, peg.kind === "bumper" ? 18 : 8, peg.kind === "bumper" ? 1.2 : 0.75);
  if (peg.kind === "bumper") {
    game.shake = Math.max(game.shake, 0.15);
    logLine(`>BUMPER +${gained}`);
  }
  return true;
}

function scoreBin(ball) {
  const bin = game.bins.find((item) => ball.x >= item.x0 && ball.x <= item.x1);
  if (!bin) return;
  const value = bin.mult * 120 + game.combo * 25;
  game.score += value;
  game.best = Math.max(game.best, game.score);
  bin.pulse = 1;
  game.message = `SLOT x${bin.mult}  +${value}`;
  game.messagePulse = 1.2;
  game.shake = Math.max(game.shake, bin.mult >= 8 ? 0.35 : 0.18);
  logLine(`>SLOT x${bin.mult} +${value}`);
  spawnBurst(ball.x, 66, bin.mult >= 8 ? color.red : color.green, 34 + bin.mult * 2, 1.45);
}

function updateBalls(dt) {
  const gravity = difficulty === "fast" ? 10.2 : difficulty === "chaos" ? 11.4 : 9.4;
  const board = game.board;
  for (const ball of game.balls) {
    ball.trail.unshift({ x: ball.x, y: ball.y, life: 0.45 });
    ball.trail = ball.trail.slice(0, 16);

    ball.vy += gravity * dt;
    ball.vx *= 0.997;
    ball.vy *= 0.999;
    ball.x += ball.vx * dt * 18;
    ball.y += ball.vy * dt * 18;
    ball.hot = Math.max(0, ball.hot - dt);

    if (ball.x < board.x + 3) {
      ball.x = board.x + 3;
      ball.vx = Math.abs(ball.vx) * 0.88;
      spawnBurst(ball.x, ball.y, color.blue, 6, 0.5);
    }
    if (ball.x > board.x + board.w - 4) {
      ball.x = board.x + board.w - 4;
      ball.vx = -Math.abs(ball.vx) * 0.88;
      spawnBurst(ball.x, ball.y, color.blue, 6, 0.5);
    }

    for (const peg of game.pegs) collidePeg(ball, peg);

    for (const item of ball.trail) item.life -= dt;
  }

  const survivors = [];
  for (const ball of game.balls) {
    if (ball.y >= board.y + board.h - 5) {
      scoreBin(ball);
      if (game.ballsLeft <= 0) {
        game.message = "TRAY EMPTY - R TO REROLL";
        logLine(">ROUND COMPLETE");
      }
    } else {
      survivors.push(ball);
    }
  }
  game.balls = survivors;
}

function updateFx(dt) {
  for (const peg of game.pegs) peg.lit = Math.max(0, peg.lit - dt * 1.5);
  for (const bin of game.bins) bin.pulse = Math.max(0, bin.pulse - dt * 1.5);
  for (const fx of game.fx) {
    fx.life -= dt;
    fx.x += fx.vx * dt * 10;
    fx.y += fx.vy * dt * 10;
    fx.vy += dt * 5;
  }
  game.fx = game.fx.filter((fx) => fx.life > 0);
  game.messagePulse = Math.max(0, game.messagePulse - dt);
  game.shake = Math.max(0, game.shake - dt);
}

function update(dt) {
  if (!game || paused) return;
  updateInput(dt);
  updateBalls(dt);
  updateFx(dt);
}

function renderBackground() {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const band = Math.floor((x * 3 + y * 7) % 19) === 0;
      const speck = Math.floor((x * 11 + y * 13 + hashSeed(activeSeed.slice(0, 12))) % 47) === 0;
      buffer[y][x].bg = band ? "#07101a" : color.bg;
      buffer[y][x].ch = speck ? glyph.dot : glyph.empty;
      buffer[y][x].fg = speck ? "#18334a" : color.muted;
    }
  }
}

function renderBoard() {
  const board = game.board;
  drawBox(board.x, board.y, board.w, board.h, color.line);
  fillRectChars(board.x + 1, board.y + 1, board.w - 2, board.h - 2, glyph.empty, color.muted, color.bg2);
  for (let y = board.y + 3; y < board.y + board.h - 4; y += 4) {
    for (let x = board.x + 4; x < board.x + board.w - 4; x += 6) {
      if ((x + y) % 3 === 0) setCell(x, y, glyph.dot, color.lineDim);
    }
  }
  writeText(board.x + 3, board.y + 2, "DROP GATE", color.white);
  writeText(board.x + board.w - 24, board.y + 2, "MULTIPLIER FIELD", color.yellow);

  const aimX = game.launcherX + Math.sin(game.launcherAngle) * 10;
  drawLine(game.launcherX, 7, aimX, 17, "╎", color.line);
  setCell(game.launcherX - 1, 6, "/", color.blue);
  setCell(game.launcherX, 6, glyph.launcher, color.white);
  setCell(game.launcherX + 1, 6, "\\", color.blue);

  for (const peg of game.pegs) {
    const fg = peg.lit > 0 ? mixColor(peg.kind === "bumper" ? color.violet : color.yellow, color.white, peg.lit) : peg.kind === "bumper" ? color.violet : color.orange;
    if (peg.kind === "bumper") {
      setCell(peg.x - 1, peg.y, "▟", fg);
      setCell(peg.x, peg.y, glyph.bumper, fg);
      setCell(peg.x + 1, peg.y, "▙", fg);
    } else {
      setCell(peg.x, peg.y, peg.lit > 0 ? glyph.pegHot : glyph.peg, fg);
    }
  }

  for (const bin of game.bins) {
    const fg = bin.pulse > 0 ? mixColor(color.green, color.white, bin.pulse) : bin.mult >= 8 ? color.red : bin.mult >= 5 ? color.yellow : color.blue;
    for (let x = bin.x0; x <= bin.x1; x += 1) setCell(x, 66, "▄", fg);
    writeText(bin.x0 + 1, 68, `x${bin.mult}`, fg);
    if (bin.pulse > 0) {
      writeText(bin.x0 + 1, 64, "^^^^", fg);
    }
  }
}

function renderBalls() {
  for (const ball of game.balls) {
    for (let i = ball.trail.length - 1; i >= 0; i -= 1) {
      const item = ball.trail[i];
      const t = clamp(item.life / 0.45, 0, 1);
      const fg = mixColor(color.lineDim, color.blue, t);
      setCell(item.x, item.y, i % 2 === 0 ? glyph.trail : "·", fg);
    }
    const fg = ball.hot > 0 ? color.red : color.white;
    setCell(ball.x, ball.y, glyph.ball, fg);
    setCell(ball.x + 1, ball.y, "◦", color.blue);
  }
}

function renderFx() {
  for (const fx of game.fx) {
    const t = clamp(fx.life / fx.maxLife, 0, 1);
    setCell(fx.x, fx.y, fx.ch, mixColor(color.bg2, fx.fg, t));
  }
}

function renderHud() {
  const hud = game.hud;
  drawBox(hud.x, hud.y, hud.w, hud.h, color.line);
  writeText(hud.x + 2, hud.y + 2, "PACHINKO", color.white);
  writeText(hud.x + 2, hud.y + 4, `SCORE ${String(game.score).padStart(7, "0")}`, color.green);
  writeText(hud.x + 2, hud.y + 5, `BEST  ${String(game.best).padStart(7, "0")}`, color.yellow);
  writeText(hud.x + 2, hud.y + 7, `BALLS ${String(game.ballsLeft).padStart(2, "0")}`, color.white);
  writeText(hud.x + 2, hud.y + 8, `SHOT  ${String(game.shots).padStart(2, "0")}`, color.muted);
  writeText(hud.x + 2, hud.y + 10, `MODE  ${playMode.toUpperCase()}`, color.blue);
  writeText(hud.x + 2, hud.y + 11, `SPD   ${speed.toFixed(1)}X`, color.green);
  if (paused) writeText(hud.x + 2, hud.y + 13, "PAUSED", color.red);

  writeText(hud.x + 2, hud.y + 16, "TARGET", color.white);
  const angle = Math.round((game.launcherAngle * 180) / Math.PI);
  writeText(hud.x + 2, hud.y + 18, `[${"=".repeat(Math.round((game.launcherX - 10) / 5)).padEnd(17, " ")}]`, color.blue);
  writeText(hud.x + 2, hud.y + 20, `ANGLE ${angle.toString().padStart(3, " ")} DEG`, color.muted);

  writeText(hud.x + 2, hud.y + 24, "EVENT", color.white);
  writeText(hud.x + 2, hud.y + 26, game.message.slice(0, 23), game.messagePulse > 0 ? color.red : color.muted);

  writeText(hud.x + 2, hud.y + 31, "LOG", color.white);
  for (let i = 0; i < game.logs.length; i += 1) {
    writeText(hud.x + 2, hud.y + 33 + i, game.logs[i], i === 0 ? color.green : color.muted);
  }

  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    A/D MOVE    SPACE DROP    P PAUSE    R REROLL    ; HOME", color.muted);
}

function composeScreen() {
  clearBuffer();
  renderBackground();
  renderBoard();
  renderBalls();
  renderFx();
  renderHud();
}

function renderScreen() {
  ctx.fillStyle = color.page;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = buffer[y][x];
      ctx.fillStyle = cell.bg;
      ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
      if (cell.ch !== glyph.empty) {
        ctx.fillStyle = cell.fg;
        ctx.fillText(cell.ch, x * CELL_W, y * CELL_H + 1);
      }
    }
  }
}

function frame(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000 || 0);
  lastTime = now;
  accumulator += dt * speed;
  const step = 1 / 60;
  let guard = 0;
  while (accumulator >= step && guard < 8) {
    update(step);
    accumulator -= step;
    guard += 1;
  }
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
}

seedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  initGame(seedInput.value);
});

seedRandomButton.addEventListener("click", () => {
  initGame(randomSeed());
});

seedCopyButton.addEventListener("click", async () => {
  const text = padSeed(seedInput.value || activeSeed);
  seedInput.value = text.trimEnd();
  activeSeed = text;
  setStatus();
  try {
    await navigator.clipboard.writeText(text);
    seedStatus.textContent = "COPIED 100/100";
  } catch {
    seedStatus.textContent = "COPY BLOCKED";
  }
});

playModeInput.addEventListener("change", () => initGame(activeSeed));
difficultyInput.addEventListener("change", () => initGame(activeSeed));
seedInput.addEventListener("input", () => {
  seedInput.value = sanitizeSeed(seedInput.value);
  seedStatus.textContent = `LEN ${padSeed(seedInput.value).length}/${SEED_LEN}`;
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (["arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (key === "1") speed = 0.5;
  if (key === "2") speed = 1;
  if (key === "3") speed = 2;
  if (key === "4") speed = 4;
  if (key === "p") paused = !paused;
  if (key === "r") initGame(randomSeed());
  if (key === HOME_KEY) window.location.href = "../index.html";
  if ((key === " " || key === "enter") && playMode === "human") spawnBall();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

initGame(randomSeed());
composeScreen();
renderScreen();
requestAnimationFrame(frame);
