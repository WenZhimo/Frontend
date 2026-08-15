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
const HOME_KEY = "=";
const TILE = 5;
const MAP_X = 8;
const MAP_Y = 10;

const levelRows = [
  "#############",
  "#...........#",
  "#.....P.....#",
  "#E....B....R#",
  "#...B.......#",
  "#.....G.....#",
  "#...G.......#",
  "#...........#",
  "#############",
];

const aiScript = ["s", "s", "a", "w", "a", "s", "s"];

canvas.width = COLS * CELL_W;
canvas.height = ROWS * CELL_H;
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = "top";
ctx.font = "700 15px Consolas, 'Cascadia Mono', 'Courier New', monospace";

const color = {
  page: "#020306",
  bg: "#05080e",
  bg2: "#07111a",
  floor: "#08121c",
  floorAlt: "#0a1722",
  wall: "#192536",
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function setStatus(text = null) {
  seedStatus.textContent = text || `LEN ${activeSeed.length}/${SEED_LEN}`;
}

function makeCell() {
  return { ch: " ", fg: color.muted, bg: color.bg };
}

function clearBuffer() {
  buffer = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, makeCell));
}

function setCell(x, y, ch, fg = color.white, bg = null) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
  buffer[iy][ix].ch = ch;
  buffer[iy][ix].fg = fg;
  if (bg) buffer[iy][ix].bg = bg;
}

function writeText(x, y, text, fg = color.white, bg = null) {
  for (let i = 0; i < text.length; i += 1) setCell(x + i, y, text[i], fg, bg);
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

function parseLevel() {
  const map = levelRows.map((row) => row.split(""));
  const boxes = [];
  const goals = [];
  let player = { x: 1, y: 1 };
  let emitter = { x: 1, y: 3, dx: 1, dy: 0 };
  let receiver = { x: 11, y: 3 };
  for (let y = 0; y < map.length; y += 1) {
    for (let x = 0; x < map[y].length; x += 1) {
      const ch = map[y][x];
      if (ch === "P") {
        player = { x, y };
        map[y][x] = ".";
      }
      if (ch === "B") {
        boxes.push({ x, y, pulse: 0 });
        map[y][x] = ".";
      }
      if (ch === "G") {
        goals.push({ x, y, pulse: 0 });
        map[y][x] = ".";
      }
      if (ch === "E") {
        emitter = { x, y, dx: 1, dy: 0 };
        map[y][x] = ".";
      }
      if (ch === "R") {
        receiver = { x, y };
        map[y][x] = ".";
      }
    }
  }
  return { map, boxes, goals, player, emitter, receiver };
}

function boxAt(x, y) {
  return game.boxes.findIndex((box) => box.x === x && box.y === y);
}

function isWall(x, y) {
  return !game.map[y] || game.map[y][x] === "#";
}

function isGoal(x, y) {
  return game.goals.some((goal) => goal.x === x && goal.y === y);
}

function canOccupy(x, y) {
  return !isWall(x, y) && boxAt(x, y) < 0;
}

function spawnBurst(x, y, fg, count = 12, force = 1) {
  const chars = [".", "·", ":", "*", "+", "✦", "×"];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const s = (0.5 + rng() * 1.5) * force;
    game.fx.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.7,
      life: 0.45 + rng() * 0.55,
      maxLife: 1,
      ch: chars[Math.floor(rng() * chars.length)],
      fg,
    });
  }
}

function mapCenter(x, y) {
  return { x: MAP_X + x * TILE + 2, y: MAP_Y + y * TILE + 2 };
}

function logLine(text) {
  game.logs.unshift(text.slice(0, 25));
  game.logs = game.logs.slice(0, 8);
}

function calculateBeam() {
  const beam = [];
  let x = game.emitter.x + game.emitter.dx;
  let y = game.emitter.y + game.emitter.dy;
  let lit = false;
  let blocked = null;
  for (let guard = 0; guard < 40; guard += 1) {
    if (isWall(x, y)) {
      blocked = { x, y, reason: "WALL" };
      break;
    }
    const boxIndex = boxAt(x, y);
    if (boxIndex >= 0) {
      blocked = { x, y, reason: "CRATE" };
      break;
    }
    beam.push({ x, y });
    if (x === game.receiver.x && y === game.receiver.y) {
      lit = true;
      break;
    }
    x += game.emitter.dx;
    y += game.emitter.dy;
  }
  game.beam = beam;
  game.receiverLit = lit;
  game.beamBlocked = blocked;
}

function checkSolved() {
  const goalsCovered = game.goals.every((goal) => boxAt(goal.x, goal.y) >= 0);
  if (goalsCovered && game.receiverLit && !game.solved) {
    game.solved = true;
    game.message = "LASER CIRCUIT COMPLETE";
    game.messagePulse = 2;
    game.shake = 0.45;
    logLine(">ALL CIRCUITS GREEN");
    for (let i = 0; i < 90; i += 1) {
      const p = mapCenter(game.receiver.x, game.receiver.y);
      spawnBurst(p.x, p.y, i % 2 ? color.green : color.blue, 1, 1.8);
    }
  }
}

function tryMove(dx, dy, source = "MOVE") {
  if (game.solved) return;
  const tx = game.player.x + dx;
  const ty = game.player.y + dy;
  if (isWall(tx, ty)) {
    game.message = "WALL BLOCK";
    game.messagePulse = 0.4;
    game.shake = 0.06;
    return;
  }
  const boxIndex = boxAt(tx, ty);
  if (boxIndex >= 0) {
    const bx = tx + dx;
    const by = ty + dy;
    if (!canOccupy(bx, by)) {
      game.message = "CRATE LOCKED";
      game.messagePulse = 0.5;
      game.shake = 0.08;
      return;
    }
    game.boxes[boxIndex].x = bx;
    game.boxes[boxIndex].y = by;
    game.boxes[boxIndex].pulse = 0.9;
    const p = mapCenter(bx, by);
    spawnBurst(p.x, p.y, isGoal(bx, by) ? color.green : color.orange, 16, 0.9);
    logLine(`>${source} PUSH ${dx ? (dx > 0 ? "RIGHT" : "LEFT") : dy > 0 ? "DOWN" : "UP"}`);
  } else if (!canOccupy(tx, ty)) {
    return;
  }
  game.player.x = tx;
  game.player.y = ty;
  game.steps += 1;
  const p = mapCenter(tx, ty);
  spawnBurst(p.x, p.y, color.blue, 4, 0.35);
  game.message = source;
  game.messagePulse = 0.35;
  calculateBeam();
  checkSolved();
}

function initGame(seed) {
  activeSeed = padSeed(seed || randomSeed());
  seedInput.value = activeSeed.trimEnd();
  rng = mulberry32(hashSeed(activeSeed));
  playMode = playModeInput.value;
  difficulty = difficultyInput.value;
  paused = false;
  accumulator = 0;
  const level = parseLevel();
  game = {
    ...level,
    beam: [],
    beamBlocked: null,
    receiverLit: false,
    fx: [],
    logs: [">PUZZLE READY", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    scriptIndex: 0,
    aiTimer: difficulty === "fast" ? 0.24 : difficulty === "chaos" ? 0.15 : 0.42,
    steps: 0,
    solved: false,
    message: "ROUTE THE LASER",
    messagePulse: 1,
    shake: 0,
  };
  calculateBeam();
  setStatus();
}

function updateAI(dt) {
  if (playMode !== "demo" || game.solved) return;
  game.aiTimer -= dt;
  if (game.aiTimer > 0) return;
  const key = aiScript[game.scriptIndex];
  if (key) {
    const dir = directionForKey(key);
    tryMove(dir.dx, dir.dy, "AI");
    game.scriptIndex += 1;
  }
  const base = difficulty === "fast" ? 0.22 : difficulty === "chaos" ? 0.14 : 0.38;
  game.aiTimer = base + rng() * base * 0.5;
}

function updateFx(dt) {
  for (const box of game.boxes) box.pulse = Math.max(0, box.pulse - dt * 1.8);
  for (const goal of game.goals) goal.pulse = Math.max(0, goal.pulse - dt * 1.2);
  for (const fx of game.fx) {
    fx.life -= dt;
    fx.x += fx.vx * dt * 10;
    fx.y += fx.vy * dt * 10;
    fx.vy += dt * 2.8;
  }
  game.fx = game.fx.filter((fx) => fx.life > 0);
  game.messagePulse = Math.max(0, game.messagePulse - dt);
  game.shake = Math.max(0, game.shake - dt);
}

function update(dt) {
  if (!game || paused) return;
  updateAI(dt);
  updateFx(dt);
}

function directionForKey(key) {
  if (key === "arrowleft" || key === "a") return { dx: -1, dy: 0 };
  if (key === "arrowright" || key === "d") return { dx: 1, dy: 0 };
  if (key === "arrowup" || key === "w") return { dx: 0, dy: -1 };
  if (key === "arrowdown" || key === "s") return { dx: 0, dy: 1 };
  return null;
}

function renderBackground() {
  const seedHash = hashSeed(activeSeed.slice(0, 12));
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const band = (x * 7 + y * 5) % 29 === 0;
      const speck = (x * 19 + y * 13 + seedHash) % 67 === 0;
      buffer[y][x].bg = band ? "#07101a" : color.bg;
      buffer[y][x].ch = speck ? "·" : " ";
      buffer[y][x].fg = speck ? "#18334a" : color.muted;
    }
  }
}

function drawTile(x, y, ch, fg, bg, label = "") {
  const px = MAP_X + x * TILE + (game.shake > 0 ? Math.round((rng() - 0.5) * 2) : 0);
  const py = MAP_Y + y * TILE + (game.shake > 0 ? Math.round((rng() - 0.5) * 2) : 0);
  fillRectChars(px, py, TILE, TILE, " ", fg, bg);
  if (ch === "#") {
    fillRectChars(px, py, TILE, TILE, "▓", fg, bg);
    return;
  }
  drawBox(px, py, TILE, TILE, fg);
  setCell(px + 2, py + 2, ch, fg);
  if (label) writeText(px + 1, py + 3, label.slice(0, 3), fg);
}

function renderMap() {
  const boardW = levelRows[0].length * TILE + 2;
  const boardH = levelRows.length * TILE + 2;
  drawBox(MAP_X - 1, MAP_Y - 1, boardW, boardH, color.line);
  writeText(MAP_X, MAP_Y - 3, "LASER SOKOBAN :: CRATE ROUTING FIELD", color.white);
  for (let y = 0; y < game.map.length; y += 1) {
    for (let x = 0; x < game.map[y].length; x += 1) {
      const wall = game.map[y][x] === "#";
      const bg = (x + y) % 2 === 0 ? color.floor : color.floorAlt;
      drawTile(x, y, wall ? "#" : "·", wall ? color.lineDim : color.grid, wall ? color.wall : bg);
    }
  }
  for (const goal of game.goals) {
    const covered = boxAt(goal.x, goal.y) >= 0;
    drawTile(goal.x, goal.y, "◇", covered ? color.green : color.yellow, color.floorAlt, "GO");
  }
  drawTile(game.emitter.x, game.emitter.y, "▶", color.red, "#1b0c12", "LAS");
  drawTile(game.receiver.x, game.receiver.y, game.receiverLit ? "●" : "○", game.receiverLit ? color.green : color.violet, "#111827", "RX");
  for (const cell of game.beam) {
    const px = MAP_X + cell.x * TILE;
    const py = MAP_Y + cell.y * TILE;
    writeText(px, py + 2, "═════", game.receiverLit ? color.green : color.red);
    setCell(px + 2, py + 1, "✦", game.receiverLit ? color.green : color.red);
  }
  if (game.beamBlocked) {
    const p = mapCenter(game.beamBlocked.x, game.beamBlocked.y);
    setCell(p.x, p.y - 1, "×", color.red);
    setCell(p.x, p.y + 1, "×", color.red);
  }
  for (const box of game.boxes) {
    const onGoal = isGoal(box.x, box.y);
    const fg = box.pulse > 0 ? mixColor(onGoal ? color.green : color.orange, color.white, box.pulse) : onGoal ? color.green : color.orange;
    drawTile(box.x, box.y, "▣", fg, "#24180d", "BOX");
  }
  drawTile(game.player.x, game.player.y, "@", color.white, "#0c1d2a", "YOU");
}

function renderFx() {
  for (const fx of game.fx) {
    const t = clamp(fx.life / fx.maxLife, 0, 1);
    setCell(fx.x, fx.y, fx.ch, mixColor(color.bg2, fx.fg, t));
  }
}

function renderHud() {
  const x = 84;
  const y = 8;
  drawBox(x, y, 42, 58, color.line);
  writeText(x + 2, y + 2, "LASER SOKOBAN", color.white);
  writeText(x + 2, y + 4, `STEPS ${String(game.steps).padStart(3, "0")}`, color.green);
  writeText(x + 2, y + 5, `SCRIPT ${String(game.scriptIndex).padStart(2, "0")}/${String(aiScript.length).padStart(2, "0")}`, color.yellow);
  writeText(x + 2, y + 7, `MODE   ${playMode.toUpperCase()}`, color.blue);
  writeText(x + 2, y + 8, `SPD    ${speed.toFixed(1)}X`, color.green);
  if (paused) writeText(x + 2, y + 10, "PAUSED", color.red);
  if (game.solved) writeText(x + 2, y + 12, "CIRCUIT COMPLETE", color.green);

  writeText(x + 2, y + 16, "LASER", color.white);
  writeText(x + 2, y + 18, `BEAM ${game.receiverLit ? "ONLINE " : "BLOCKED"}`, game.receiverLit ? color.green : color.red);
  writeText(x + 2, y + 19, `HITS ${game.beamBlocked ? game.beamBlocked.reason : "RECEIVER"}`, game.beamBlocked ? color.orange : color.green);

  writeText(x + 2, y + 24, "OBJECTIVES", color.white);
  for (let i = 0; i < game.goals.length; i += 1) {
    const goal = game.goals[i];
    writeText(x + 2, y + 26 + i, `GOAL ${i + 1} ${boxAt(goal.x, goal.y) >= 0 ? "LOCKED" : "OPEN"}`, boxAt(goal.x, goal.y) >= 0 ? color.green : color.muted);
  }

  writeText(x + 2, y + 32, "EVENT", color.white);
  writeText(x + 2, y + 34, game.message.slice(0, 34), game.messagePulse > 0 ? color.red : color.muted);
  writeText(x + 2, y + 39, "LOG", color.white);
  for (let i = 0; i < game.logs.length; i += 1) writeText(x + 2, y + 41 + i, game.logs[i], i === 0 ? color.green : color.muted);

  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE/PUSH    P PAUSE    R REROLL    = HOME", color.muted);
}

function composeScreen() {
  clearBuffer();
  renderBackground();
  renderMap();
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
      if (cell.ch !== " ") {
        ctx.fillStyle = cell.fg;
        ctx.fillText(cell.ch, x * CELL_W, y * CELL_H + 1);
      }
    }
  }
}

function runFrame(now) {
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
}

function frame(now) {
  runFrame(now);
  requestAnimationFrame(frame);
}

seedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  initGame(seedInput.value);
});

seedRandomButton.addEventListener("click", () => initGame(randomSeed()));

seedCopyButton.addEventListener("click", async () => {
  const text = padSeed(seedInput.value || activeSeed);
  seedInput.value = text.trimEnd();
  activeSeed = text;
  setStatus();
  try {
    await navigator.clipboard.writeText(text);
    setStatus("COPIED 100/100");
  } catch {
    setStatus("COPY BLOCKED");
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
  if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) event.preventDefault();
  if (key === "1") speed = 0.5;
  if (key === "2") speed = 1;
  if (key === "3") speed = 2;
  if (key === "4") speed = 4;
  if (key === "p") paused = !paused;
  if (key === "r") initGame(randomSeed());
  if (key === HOME_KEY) window.location.href = "../index.html";
  if (playMode === "human") {
    const dir = directionForKey(key);
    if (dir) tryMove(dir.dx, dir.dy, "USER");
  }
});

initGame(randomSeed());
composeScreen();
renderScreen();
requestAnimationFrame(frame);
setInterval(() => {
  const now = performance.now();
  if (now - lastTime > 500) runFrame(now);
}, 250);
