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
const HOME_KEY = "-";
const SIZE = 9;
const CELL = 6;
const BOARD_X = 10;
const BOARD_Y = 8;

canvas.width = COLS * CELL_W;
canvas.height = ROWS * CELL_H;
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = "top";
ctx.font = "700 15px Consolas, 'Cascadia Mono', 'Courier New', monospace";

const color = {
  page: "#020306",
  bg: "#05080e",
  bg2: "#07111a",
  cellA: "#08121c",
  cellB: "#0a1722",
  grid: "#193044",
  line: "#2c425a",
  lineDim: "#142638",
  white: "#edf9ff",
  clue: "#ffd15f",
  fill: "#69d7f0",
  green: "#57ff9b",
  red: "#ff4e65",
  violet: "#b99cff",
  muted: "#8a96ab",
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

function shuffle(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pattern(row, col) {
  return (row * 3 + Math.floor(row / 3) + col) % 9;
}

function makeSolution() {
  const rows = [];
  const cols = [];
  for (const band of shuffle([0, 1, 2])) {
    for (const row of shuffle([0, 1, 2])) rows.push(band * 3 + row);
  }
  for (const stack of shuffle([0, 1, 2])) {
    for (const col of shuffle([0, 1, 2])) cols.push(stack * 3 + col);
  }
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  return rows.map((row) => cols.map((col) => nums[pattern(row, col)]));
}

function makePuzzle(solution) {
  const clues = difficulty === "chaos" ? 24 : difficulty === "fast" ? 40 : 32;
  const puzzle = solution.map((row) => row.slice());
  const fixed = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => true));
  const cells = shuffle(Array.from({ length: 81 }, (_, i) => i));
  for (let i = 0; i < 81 - clues; i += 1) {
    const index = cells[i];
    const y = Math.floor(index / 9);
    const x = index % 9;
    puzzle[y][x] = 0;
    fixed[y][x] = false;
  }
  return { puzzle, fixed };
}

function candidatesAt(board, x, y) {
  if (board[y][x] !== 0) return [];
  const used = new Set();
  for (let i = 0; i < 9; i += 1) {
    if (board[y][i]) used.add(board[y][i]);
    if (board[i][x]) used.add(board[i][x]);
  }
  const bx = Math.floor(x / 3) * 3;
  const by = Math.floor(y / 3) * 3;
  for (let yy = by; yy < by + 3; yy += 1) {
    for (let xx = bx; xx < bx + 3; xx += 1) {
      if (board[yy][xx]) used.add(board[yy][xx]);
    }
  }
  const out = [];
  for (let n = 1; n <= 9; n += 1) if (!used.has(n)) out.push(n);
  return out;
}

function conflictCells(board) {
  const conflicts = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
  const mark = (cells) => {
    const seen = new Map();
    for (const cell of cells) {
      const value = board[cell.y][cell.x];
      if (!value) continue;
      if (!seen.has(value)) seen.set(value, []);
      seen.get(value).push(cell);
    }
    for (const group of seen.values()) {
      if (group.length > 1) for (const cell of group) conflicts[cell.y][cell.x] = true;
    }
  };
  for (let i = 0; i < 9; i += 1) {
    mark(Array.from({ length: 9 }, (_, x) => ({ x, y: i })));
    mark(Array.from({ length: 9 }, (_, y) => ({ x: i, y })));
  }
  for (let by = 0; by < 9; by += 3) {
    for (let bx = 0; bx < 9; bx += 3) {
      const cells = [];
      for (let y = by; y < by + 3; y += 1) for (let x = bx; x < bx + 3; x += 1) cells.push({ x, y });
      mark(cells);
    }
  }
  return conflicts;
}

function isComplete() {
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) if (game.board[y][x] !== game.solution[y][x]) return false;
  return true;
}

function cellCenter(x, y) {
  return { x: BOARD_X + x * CELL + 3, y: BOARD_Y + y * CELL + 3 };
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
  const solution = makeSolution();
  const { puzzle, fixed } = makePuzzle(solution);
  game = {
    solution,
    board: puzzle,
    fixed,
    cursor: { x: 0, y: 0 },
    digit: 1,
    fx: [],
    pulses: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0)),
    logs: [">PUZZLE READY", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    fills: 0,
    mistakes: 0,
    aiTimer: difficulty === "fast" ? 0.2 : difficulty === "chaos" ? 0.13 : 0.38,
    message: "FIND THE SINGLETONS",
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

function fillCell(x, y, value, source = "FILL") {
  if (game.fixed[y][x] || game.solved) return false;
  game.board[y][x] = value;
  game.pulses[y][x] = 0.8;
  game.fills += 1;
  const center = cellCenter(x, y);
  const correct = value === game.solution[y][x];
  if (!correct) game.mistakes += 1;
  spawnBurst(center.x, center.y, correct ? color.green : color.red, correct ? 12 : 20, correct ? 0.8 : 1.2);
  game.message = correct ? `${source} ${value} OK` : `${source} ${value} CONFLICT`;
  game.messagePulse = 0.7;
  logLine(`>${source} R${y + 1}C${x + 1}=${value}`);
  if (isComplete()) {
    game.solved = true;
    game.message = "SUDOKU COMPLETE";
    game.messagePulse = 2;
    for (let i = 0; i < 120; i += 1) spawnBurst(BOARD_X + rng() * 54, BOARD_Y + rng() * 54, i % 2 ? color.green : color.blue, 1, 1.8);
    logLine(">GRID SOLVED");
  }
  return true;
}

function chooseAiCell() {
  let best = null;
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (game.board[y][x] !== 0) continue;
      const cand = candidatesAt(game.board, x, y);
      const score = cand.length + rng() * 0.15;
      if (!best || score < best.score) best = { x, y, cand, score };
    }
  }
  return best;
}

function updateAI(dt) {
  if (playMode !== "demo" || game.solved) return;
  game.aiTimer -= dt;
  if (game.aiTimer > 0) return;
  const cell = chooseAiCell();
  if (!cell) return;
  const value = cell.cand.includes(game.solution[cell.y][cell.x]) ? game.solution[cell.y][cell.x] : cell.cand[0] || game.solution[cell.y][cell.x];
  game.cursor = { x: cell.x, y: cell.y };
  game.digit = value;
  fillCell(cell.x, cell.y, value, "AI");
  const base = difficulty === "fast" ? 0.18 : difficulty === "chaos" ? 0.1 : 0.32;
  game.aiTimer = base + rng() * base;
}

function updateFx(dt) {
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) game.pulses[y][x] = Math.max(0, game.pulses[y][x] - dt * 1.8);
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
  game.cursor.x = clamp(game.cursor.x + dx, 0, 8);
  game.cursor.y = clamp(game.cursor.y + dy, 0, 8);
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

function renderCell(x, y, conflicts) {
  const px = BOARD_X + x * CELL;
  const py = BOARD_Y + y * CELL;
  const bg = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0 ? color.cellA : color.cellB;
  const cursor = game.cursor.x === x && game.cursor.y === y;
  const pulse = game.pulses[y][x];
  fillRectChars(px, py, CELL, CELL, " ", color.muted, bg);
  drawBox(px, py, CELL, CELL, cursor ? color.white : x % 3 === 0 || y % 3 === 0 ? color.line : color.grid);
  const value = game.board[y][x];
  if (value) {
    const fg = conflicts[y][x] ? color.red : game.fixed[y][x] ? color.clue : pulse > 0 ? mixColor(color.fill, color.white, pulse) : color.fill;
    writeText(px + 2, py + 2, String(value), fg);
    if (game.fixed[y][x]) setCell(px + 4, py + 1, "•", color.clue);
    return;
  }
  const cand = candidatesAt(game.board, x, y);
  for (let i = 0; i < cand.length; i += 1) {
    const n = cand[i];
    const cx = px + ((n - 1) % 3) * 2 + 1;
    const cy = py + Math.floor((n - 1) / 3) * 2 + 1;
    setCell(cx, cy, String(n), color.lineDim);
  }
}

function renderBoard() {
  const conflicts = conflictCells(game.board);
  drawBox(BOARD_X - 1, BOARD_Y - 1, SIZE * CELL + 2, SIZE * CELL + 2, color.line);
  writeText(BOARD_X, BOARD_Y - 3, "SUDOKU TERMINAL :: CANDIDATE MATRIX", color.white);
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) renderCell(x, y, conflicts);
  for (let i = 0; i <= 9; i += 3) {
    for (let k = 0; k < SIZE * CELL + 1; k += 1) {
      setCell(BOARD_X + k, BOARD_Y + i * CELL, "═", color.line);
      setCell(BOARD_X + i * CELL, BOARD_Y + k, "║", color.line);
    }
  }
}

function renderFx() {
  for (const fx of game.fx) {
    const t = clamp(fx.life / fx.maxLife, 0, 1);
    setCell(fx.x, fx.y, fx.ch, mixColor(color.bg2, fx.fg, t));
  }
}

function renderHud() {
  const x = 76;
  const y = 8;
  drawBox(x, y, 42, 58, color.line);
  writeText(x + 2, y + 2, "SUDOKU CORE", color.white);
  writeText(x + 2, y + 4, `FILLS ${String(game.fills).padStart(3, "0")}`, color.green);
  writeText(x + 2, y + 5, `MISS  ${String(game.mistakes).padStart(3, "0")}`, game.mistakes ? color.red : color.muted);
  writeText(x + 2, y + 7, `MODE  ${playMode.toUpperCase()}`, color.blue);
  writeText(x + 2, y + 8, `SPD   ${speed.toFixed(1)}X`, color.green);
  if (paused) writeText(x + 2, y + 10, "PAUSED", color.red);
  if (game.solved) writeText(x + 2, y + 12, "COMPLETE", color.green);

  writeText(x + 2, y + 16, "CURSOR", color.white);
  writeText(x + 2, y + 18, `R${game.cursor.y + 1} C${game.cursor.x + 1}  DIGIT ${game.digit}`, color.yellow);
  const cand = candidatesAt(game.board, game.cursor.x, game.cursor.y);
  writeText(x + 2, y + 20, `CAND  ${cand.join("") || "--"}`, color.blue);

  writeText(x + 2, y + 25, "EVENT", color.white);
  writeText(x + 2, y + 27, game.message.slice(0, 34), game.messagePulse > 0 ? color.red : color.muted);
  writeText(x + 2, y + 32, "LOG", color.white);
  for (let i = 0; i < game.logs.length; i += 1) writeText(x + 2, y + 34 + i, game.logs[i], i === 0 ? color.green : color.muted);

  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE    Q/E DIGIT    SPACE FILL    DEL CLEAR    P PAUSE    R REROLL    - HOME", color.muted);
}

function composeScreen() {
  clearBuffer();
  renderBackground();
  renderBoard();
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
    if (key === "q") game.digit = game.digit === 1 ? 9 : game.digit - 1;
    if (key === "e") game.digit = game.digit === 9 ? 1 : game.digit + 1;
    if (key === " " || key === "enter") fillCell(game.cursor.x, game.cursor.y, game.digit, "USER");
    if (key === "backspace" || key === "delete") {
      if (!game.fixed[game.cursor.y][game.cursor.x]) game.board[game.cursor.y][game.cursor.x] = 0;
    }
  }
});

initGame(randomSeed());
composeScreen();
renderScreen();
requestAnimationFrame(frame);
