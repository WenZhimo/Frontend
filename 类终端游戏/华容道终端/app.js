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
const HOME_KEY = "/";

const GRID_W = 4;
const GRID_H = 5;
const TILE_W = 16;
const TILE_H = 10;
const BOARD_X = 12;
const BOARD_Y = 10;

canvas.width = COLS * CELL_W;
canvas.height = ROWS * CELL_H;
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = "top";
ctx.font = "700 15px Consolas, 'Cascadia Mono', 'Courier New', monospace";

const color = {
  page: "#020306",
  bg: "#05080e",
  bg2: "#07111a",
  board: "#08121c",
  boardAlt: "#0a1722",
  grid: "#193044",
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

const pieces = [
  { id: "C", name: "CAO CAO", short: "CAO", w: 2, h: 2, fg: color.red, bg: "#31101a" },
  { id: "Z", name: "ZHAO", short: "ZHAO", w: 1, h: 2, fg: color.blue, bg: "#0b2331" },
  { id: "M", name: "MA", short: "MA", w: 1, h: 2, fg: color.blue, bg: "#0b2331" },
  { id: "H", name: "HUANG", short: "HUANG", w: 1, h: 2, fg: color.violet, bg: "#211a35" },
  { id: "T", name: "ZHANG", short: "ZHANG", w: 1, h: 2, fg: color.violet, bg: "#211a35" },
  { id: "G", name: "GUAN YU", short: "GUAN", w: 2, h: 1, fg: color.orange, bg: "#30200a" },
  { id: "1", name: "BING", short: "B1", w: 1, h: 1, fg: color.yellow, bg: "#2a240b" },
  { id: "2", name: "BING", short: "B2", w: 1, h: 1, fg: color.yellow, bg: "#2a240b" },
  { id: "3", name: "BING", short: "B3", w: 1, h: 1, fg: color.yellow, bg: "#2a240b" },
  { id: "4", name: "BING", short: "B4", w: 1, h: 1, fg: color.yellow, bg: "#2a240b" },
];

const initialState = [
  1, 0,
  0, 0,
  3, 0,
  0, 2,
  3, 2,
  1, 2,
  0, 4,
  1, 3,
  2, 3,
  3, 4,
];

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

function keyOf(state) {
  return state.join(",");
}

function getPos(state, index) {
  return { x: state[index * 2], y: state[index * 2 + 1] };
}

function setPos(state, index, x, y) {
  const next = state.slice();
  next[index * 2] = x;
  next[index * 2 + 1] = y;
  return next;
}

function buildGrid(state) {
  const grid = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => -1));
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    const pos = getPos(state, i);
    for (let yy = 0; yy < piece.h; yy += 1) {
      for (let xx = 0; xx < piece.w; xx += 1) grid[pos.y + yy][pos.x + xx] = i;
    }
  }
  return grid;
}

function canMove(state, index, dx, dy) {
  const piece = pieces[index];
  const pos = getPos(state, index);
  const nx = pos.x + dx;
  const ny = pos.y + dy;
  if (nx < 0 || ny < 0 || nx + piece.w > GRID_W || ny + piece.h > GRID_H) return false;
  const grid = buildGrid(state);
  for (let yy = 0; yy < piece.h; yy += 1) {
    for (let xx = 0; xx < piece.w; xx += 1) {
      const occupant = grid[ny + yy][nx + xx];
      if (occupant !== -1 && occupant !== index) return false;
    }
  }
  return true;
}

function moveState(state, index, dx, dy) {
  const pos = getPos(state, index);
  return setPos(state, index, pos.x + dx, pos.y + dy);
}

function isSolved(state) {
  const cao = getPos(state, 0);
  return cao.x === 1 && cao.y === 3;
}

function solve(start) {
  const dirs = [
    { dx: 0, dy: -1, name: "UP" },
    { dx: 1, dy: 0, name: "RIGHT" },
    { dx: 0, dy: 1, name: "DOWN" },
    { dx: -1, dy: 0, name: "LEFT" },
  ];
  const startKey = keyOf(start);
  const queue = [start.slice()];
  const seen = new Set([startKey]);
  const parent = new Map();
  let head = 0;
  while (head < queue.length) {
    const state = queue[head];
    head += 1;
    if (isSolved(state)) {
      const path = [];
      let key = keyOf(state);
      while (key !== startKey) {
        const node = parent.get(key);
        path.push(node.move);
        key = node.prev;
      }
      path.reverse();
      return path;
    }
    for (let i = 0; i < pieces.length; i += 1) {
      for (const dir of dirs) {
        if (!canMove(state, i, dir.dx, dir.dy)) continue;
        const next = moveState(state, i, dir.dx, dir.dy);
        const nextKey = keyOf(next);
        if (seen.has(nextKey)) continue;
        seen.add(nextKey);
        parent.set(nextKey, {
          prev: keyOf(state),
          move: { index: i, dx: dir.dx, dy: dir.dy, name: dir.name, piece: pieces[i].short },
        });
        queue.push(next);
      }
    }
  }
  return [];
}

function legalMoves(state) {
  const dirs = [
    { dx: 0, dy: -1, name: "UP" },
    { dx: 1, dy: 0, name: "RIGHT" },
    { dx: 0, dy: 1, name: "DOWN" },
    { dx: -1, dy: 0, name: "LEFT" },
  ];
  const moves = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (const dir of dirs) {
      if (canMove(state, i, dir.dx, dir.dy)) {
        moves.push({ index: i, dx: dir.dx, dy: dir.dy, name: dir.name, piece: pieces[i].short });
      }
    }
  }
  return moves;
}

function heuristicScore(state) {
  const cao = getPos(state, 0);
  let score = cao.y * 120 - Math.abs(cao.x - 1) * 35;
  const grid = buildGrid(state);
  for (let y = cao.y + 2; y < GRID_H; y += 1) {
    if (grid[y][1] === -1) score += 18;
    if (grid[y][2] === -1) score += 18;
  }
  if (cao.x === 1) score += 25;
  if (isSolved(state)) score += 10000;
  return score;
}

function chooseAiMove() {
  const moves = legalMoves(game.state);
  if (moves.length === 0) return null;
  let best = null;
  for (const move of moves) {
    const next = moveState(game.state, move.index, move.dx, move.dy);
    const seenPenalty = (game.visited.get(keyOf(next)) || 0) * 42;
    const caocaoBias = move.index === 0 ? 80 : 0;
    const soldierBias = pieces[move.index].w === 1 && pieces[move.index].h === 1 ? 8 : 0;
    const score = heuristicScore(next) + caocaoBias + soldierBias - seenPenalty + rng() * (difficulty === "chaos" ? 90 : 24);
    if (!best || score > best.score) best = { ...move, score, next };
  }
  return best;
}

function cellToScreen(x, y) {
  return { x: BOARD_X + x * TILE_W, y: BOARD_Y + y * TILE_H };
}

function pieceAtCell(x, y) {
  const grid = buildGrid(game.state);
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
  return grid[y][x];
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

function initGame(seed) {
  activeSeed = padSeed(seed || randomSeed());
  seedInput.value = activeSeed.trimEnd();
  rng = mulberry32(hashSeed(activeSeed));
  playMode = playModeInput.value;
  difficulty = difficultyInput.value;
  paused = false;
  accumulator = 0;

  game = {
    state: initialState.slice(),
    visited: new Map([[keyOf(initialState), 1]]),
    aiStep: 0,
    aiTimer: difficulty === "fast" ? 0.25 : difficulty === "chaos" ? 0.18 : 0.42,
    cursor: { x: 1, y: 0 },
    selected: null,
    moves: 0,
    fx: [],
    trails: [],
    pulses: Array.from({ length: pieces.length }, () => 0),
    logs: [">PUZZLE READY", ">HEURISTIC AI READY", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    message: "ESCAPE CAO CAO",
    messagePulse: 1,
    solved: false,
    shake: 0,
  };
  setStatus();
}

function logLine(text) {
  game.logs.unshift(text.slice(0, 25));
  game.logs = game.logs.slice(0, 8);
}

function applyMove(index, dx, dy, source = "MOVE") {
  if (!canMove(game.state, index, dx, dy) || game.solved) {
    game.message = "BLOCKED";
    game.messagePulse = 0.5;
    game.shake = 0.08;
    return false;
  }
  const before = getPos(game.state, index);
  game.state = moveState(game.state, index, dx, dy);
  game.visited.set(keyOf(game.state), (game.visited.get(keyOf(game.state)) || 0) + 1);
  const after = getPos(game.state, index);
  game.moves += 1;
  game.pulses[index] = 0.7;
  game.trails.push({ index, x: before.x, y: before.y, life: 0.5 });
  const piece = pieces[index];
  const center = cellToScreen(after.x + piece.w / 2, after.y + piece.h / 2);
  spawnBurst(center.x, center.y, piece.fg, index === 0 ? 18 : 8, index === 0 ? 1.1 : 0.55);
  game.message = `${piece.short} ${source}`;
  game.messagePulse = 0.6;
  logLine(`>${piece.short} ${dx ? (dx > 0 ? "RIGHT" : "LEFT") : dy > 0 ? "DOWN" : "UP"}`);
  if (isSolved(game.state)) {
    game.solved = true;
    game.message = "CAO CAO ESCAPED";
    game.messagePulse = 2;
    game.shake = 0.45;
    logLine(">EXIT OPEN");
    for (let i = 0; i < 72; i += 1) spawnBurst(BOARD_X + 32 + rng() * 14, BOARD_Y + 51 + rng() * 5, i % 2 ? color.red : color.yellow, 1, 1.8);
  }
  return true;
}

function updateAI(dt) {
  if (playMode !== "demo" || game.solved) return;
  game.aiTimer -= dt;
  if (game.aiTimer > 0) return;
  const move = chooseAiMove();
  if (!move) return;
  applyMove(move.index, move.dx, move.dy, "AI");
  game.cursor = getPos(game.state, move.index);
  game.selected = move.index;
  game.aiStep += 1;
  const base = difficulty === "fast" ? 0.18 : difficulty === "chaos" ? 0.12 : 0.32;
  game.aiTimer = base + rng() * base * 0.6;
}

function updateFx(dt) {
  for (let i = 0; i < game.pulses.length; i += 1) game.pulses[i] = Math.max(0, game.pulses[i] - dt * 1.8);
  for (const trail of game.trails) trail.life -= dt;
  game.trails = game.trails.filter((trail) => trail.life > 0);
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

function moveCursor(dx, dy) {
  if (game.selected !== null) {
    applyMove(game.selected, dx, dy, "PUSH");
    return;
  }
  game.cursor.x = clamp(game.cursor.x + dx, 0, GRID_W - 1);
  game.cursor.y = clamp(game.cursor.y + dy, 0, GRID_H - 1);
}

function toggleSelect() {
  const piece = pieceAtCell(game.cursor.x, game.cursor.y);
  if (piece < 0) {
    game.selected = null;
    game.message = "EMPTY CELL";
    game.messagePulse = 0.4;
    return;
  }
  game.selected = game.selected === piece ? null : piece;
  game.message = game.selected === null ? "SELECT CLEARED" : `SELECT ${pieces[piece].short}`;
  game.messagePulse = 0.5;
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

function renderBoardBase() {
  const sx = game.shake > 0 ? Math.round((rng() - 0.5) * 2) : 0;
  const sy = game.shake > 0 ? Math.round((rng() - 0.5) * 2) : 0;
  game.renderOffset = { x: sx, y: sy };
  const x = BOARD_X + sx;
  const y = BOARD_Y + sy;
  drawBox(x - 1, y - 1, GRID_W * TILE_W + 2, GRID_H * TILE_H + 2, color.line);
  fillRectChars(x, y, GRID_W * TILE_W, GRID_H * TILE_H, " ", color.muted, color.board);
  for (let gy = 0; gy < GRID_H; gy += 1) {
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const bg = (gx + gy) % 2 === 0 ? color.board : color.boardAlt;
      fillRectChars(x + gx * TILE_W, y + gy * TILE_H, TILE_W, TILE_H, " ", color.muted, bg);
      setCell(x + gx * TILE_W, y + gy * TILE_H, "·", color.lineDim);
    }
  }
  writeText(x, y - 3, "HUARONG DAO :: CLASSIC EXIT PUZZLE", color.white);
  writeText(x + 17, y + GRID_H * TILE_H + 1, "EXIT", game.solved ? color.green : color.red);
  for (let i = 0; i < 2; i += 1) {
    setCell(x + TILE_W + i * TILE_W + 2, y + GRID_H * TILE_H, "▼", game.solved ? color.green : color.red);
  }
}

function renderPiece(index, pos, ghost = false) {
  const piece = pieces[index];
  const offset = game.renderOffset || { x: 0, y: 0 };
  const x = BOARD_X + offset.x + pos.x * TILE_W;
  const y = BOARD_Y + offset.y + pos.y * TILE_H;
  const w = piece.w * TILE_W;
  const h = piece.h * TILE_H;
  const selected = game.selected === index;
  const pulse = game.pulses[index] || 0;
  const fg = ghost ? mixColor(color.bg2, piece.fg, 0.35) : pulse > 0 ? mixColor(piece.fg, color.white, pulse) : piece.fg;
  const bg = ghost ? "#07111a" : piece.bg;
  fillRectChars(x + 1, y + 1, w - 2, h - 2, " ", color.muted, bg);
  drawBox(x, y, w, h, selected ? color.white : fg);
  for (let yy = y + 2; yy < y + h - 2; yy += 2) {
    for (let xx = x + 2; xx < x + w - 2; xx += 4) {
      setCell(xx, yy, "░", mixColor(color.lineDim, fg, 0.55));
    }
  }
  const label = piece.name;
  const lx = x + Math.max(1, Math.floor((w - label.length) / 2));
  const ly = y + Math.max(1, Math.floor(h / 2) - 1);
  writeText(lx, ly, label, fg);
  if (index === 0) writeText(lx + 1, ly + 2, "ESCAPE", color.yellow);
}

function renderPieces() {
  for (const trail of game.trails) renderPiece(trail.index, { x: trail.x, y: trail.y }, true);
  for (let i = 0; i < pieces.length; i += 1) renderPiece(i, getPos(game.state, i));
  const offset = game.renderOffset || { x: 0, y: 0 };
  const cx = BOARD_X + offset.x + game.cursor.x * TILE_W;
  const cy = BOARD_Y + offset.y + game.cursor.y * TILE_H;
  drawBox(cx + 2, cy + 2, TILE_W - 4, TILE_H - 4, game.selected !== null ? color.yellow : color.white);
}

function renderFx() {
  for (const fx of game.fx) {
    const t = clamp(fx.life / fx.maxLife, 0, 1);
    setCell(fx.x, fx.y, fx.ch, mixColor(color.bg2, fx.fg, t));
  }
}

function renderHud() {
  const x = 88;
  const y = 8;
  drawBox(x, y, 34, 58, color.line);
  writeText(x + 2, y + 2, "HUARONG DAO", color.white);
  writeText(x + 2, y + 4, `MOVES ${String(game.moves).padStart(3, "0")}`, color.green);
  writeText(x + 2, y + 5, `AI    ${String(game.aiStep).padStart(3, "0")} AUTO`, color.yellow);
  writeText(x + 2, y + 7, `MODE  ${playMode.toUpperCase()}`, color.blue);
  writeText(x + 2, y + 8, `SPD   ${speed.toFixed(1)}X`, color.green);
  if (paused) writeText(x + 2, y + 10, "PAUSED", color.red);
  if (game.solved) writeText(x + 2, y + 12, "VICTORY / EXIT OPEN", color.green);

  writeText(x + 2, y + 16, "GOAL", color.white);
  writeText(x + 2, y + 18, "MOVE CAO CAO", color.red);
  writeText(x + 2, y + 19, "TO BOTTOM EXIT", color.yellow);

  writeText(x + 2, y + 24, "SELECT", color.white);
  const selected = game.selected === null ? "NONE" : pieces[game.selected].name;
  writeText(x + 2, y + 26, selected.slice(0, 22), game.selected === null ? color.muted : color.yellow);

  writeText(x + 2, y + 31, "EVENT", color.white);
  writeText(x + 2, y + 33, game.message.slice(0, 25), game.messagePulse > 0 ? color.red : color.muted);

  writeText(x + 2, y + 38, "LOG", color.white);
  for (let i = 0; i < game.logs.length; i += 1) {
    writeText(x + 2, y + 40 + i, game.logs[i], i === 0 ? color.green : color.muted);
  }

  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE    SPACE SELECT    P PAUSE    R REROLL    / HOME", color.muted);
}

function composeScreen() {
  clearBuffer();
  renderBackground();
  renderBoardBase();
  renderPieces();
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
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
  if (key === "1") speed = 0.5;
  if (key === "2") speed = 1;
  if (key === "3") speed = 2;
  if (key === "4") speed = 4;
  if (key === "p") paused = !paused;
  if (key === "r") initGame(randomSeed());
  if (key === HOME_KEY) window.location.href = "../index.html";
  if (playMode === "human") {
    if (key === "arrowleft" || key === "a") moveCursor(-1, 0);
    if (key === "arrowright" || key === "d") moveCursor(1, 0);
    if (key === "arrowup" || key === "w") moveCursor(0, -1);
    if (key === "arrowdown" || key === "s") moveCursor(0, 1);
    if (key === " " || key === "enter") toggleSelect();
  }
});

initGame(randomSeed());
composeScreen();
renderScreen();
requestAnimationFrame(frame);
