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
const HOME_KEY = ".";
const SIZE = 8;
const CELL = 7;
const BOARD_X = 11;
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
  muted: "#8a96ab",
  blue: "#69d7f0",
  green: "#57ff9b",
  yellow: "#ffd15f",
  orange: "#ff9b3e",
  red: "#ff4e65",
  violet: "#b99cff",
};

const gems = [
  { ch: "◆", fg: color.blue, name: "CYAN" },
  { ch: "●", fg: color.yellow, name: "GOLD" },
  { ch: "▲", fg: color.red, name: "RUBY" },
  { ch: "■", fg: color.green, name: "JADE" },
  { ch: "✦", fg: color.violet, name: "STAR" },
  { ch: "◈", fg: color.orange, name: "AMBER" },
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
let keys = new Set();

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

function randomGem(excludeA = -1, excludeB = -1) {
  let value = Math.floor(rng() * gems.length);
  let guard = 0;
  while ((value === excludeA || value === excludeB) && guard < 8) {
    value = Math.floor(rng() * gems.length);
    guard += 1;
  }
  return value;
}

function createBoard() {
  const board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const leftA = x >= 2 && board[y][x - 1] === board[y][x - 2] ? board[y][x - 1] : -1;
      const upA = y >= 2 && board[y - 1][x] === board[y - 2][x] ? board[y - 1][x] : -1;
      board[y][x] = randomGem(leftA, upA);
    }
  }
  return board;
}

function findMatches(board) {
  const matched = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
  const groups = [];
  for (let y = 0; y < SIZE; y += 1) {
    let run = 1;
    for (let x = 1; x <= SIZE; x += 1) {
      if (x < SIZE && board[y][x] === board[y][x - 1]) run += 1;
      else {
        if (run >= 3) {
          const cells = [];
          for (let k = 0; k < run; k += 1) {
            matched[y][x - 1 - k] = true;
            cells.push({ x: x - 1 - k, y });
          }
          groups.push(cells);
        }
        run = 1;
      }
    }
  }
  for (let x = 0; x < SIZE; x += 1) {
    let run = 1;
    for (let y = 1; y <= SIZE; y += 1) {
      if (y < SIZE && board[y][x] === board[y - 1][x]) run += 1;
      else {
        if (run >= 3) {
          const cells = [];
          for (let k = 0; k < run; k += 1) {
            matched[y - 1 - k][x] = true;
            cells.push({ x, y: y - 1 - k });
          }
          groups.push(cells);
        }
        run = 1;
      }
    }
  }
  return { matched, groups };
}

function wouldMatchAfterSwap(board, a, b) {
  const copy = board.map((row) => row.slice());
  const temp = copy[a.y][a.x];
  copy[a.y][a.x] = copy[b.y][b.x];
  copy[b.y][b.x] = temp;
  const result = findMatches(copy);
  return { copy, count: result.groups.reduce((sum, group) => sum + group.length, 0), groups: result.groups.length };
}

function findBestMove() {
  let best = null;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pairs = [
        { x: x + 1, y },
        { x, y: y + 1 },
      ];
      for (const to of pairs) {
        if (to.x >= SIZE || to.y >= SIZE) continue;
        const result = wouldMatchAfterSwap(game.board, { x, y }, to);
        if (result.count > 0) {
          const score = result.count * 10 + result.groups * 7 + rng() * (difficulty === "chaos" ? 12 : 3);
          if (!best || score > best.score) best = { from: { x, y }, to, score, result };
        }
      }
    }
  }
  return best;
}

function cellCenter(x, y) {
  return {
    x: BOARD_X + x * CELL + 3,
    y: BOARD_Y + y * CELL + 3,
  };
}

function spawnBurst(cx, cy, fg, count = 12, force = 1) {
  const chars = [".", "·", ":", "*", "+", "✦", "×"];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const s = (0.5 + rng() * 1.5) * force;
    game.fx.push({
      x: cx,
      y: cy,
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
    board: createBoard(),
    selected: null,
    cursor: { x: 3, y: 3 },
    fx: [],
    pulses: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0)),
    logs: [">BOARD READY", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    score: 0,
    moves: 30,
    combo: 0,
    chain: 0,
    state: "idle",
    timer: playMode === "demo" ? 0.7 : 0,
    message: "MATCH THREE GLYPHS",
    messagePulse: 1,
    shake: 0,
  };
  setStatus();
}

function logLine(text) {
  game.logs.unshift(text.slice(0, 25));
  game.logs = game.logs.slice(0, 8);
}

function attemptSwap(a, b) {
  if (game.state !== "idle" || game.moves <= 0) return false;
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return false;
  const result = wouldMatchAfterSwap(game.board, a, b);
  if (result.count <= 0) {
    game.message = "NO MATCH";
    game.messagePulse = 0.6;
    game.shake = 0.08;
    spawnBurst(cellCenter(a.x, a.y).x, cellCenter(a.x, a.y).y, color.red, 8, 0.5);
    return false;
  }
  game.board = result.copy;
  game.moves -= 1;
  game.combo = 0;
  game.chain = 0;
  game.state = "clearing";
  game.timer = 0.12;
  game.message = "SWAP ACCEPTED";
  logLine(`>SWAP ${a.x},${a.y} -> ${b.x},${b.y}`);
  const ca = cellCenter(a.x, a.y);
  const cb = cellCenter(b.x, b.y);
  spawnBurst(ca.x, ca.y, color.blue, 10, 0.6);
  spawnBurst(cb.x, cb.y, color.blue, 10, 0.6);
  return true;
}

function clearMatches() {
  const result = findMatches(game.board);
  const cells = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (result.matched[y][x]) cells.push({ x, y, type: game.board[y][x] });
    }
  }
  if (cells.length === 0) {
    game.state = "idle";
    game.timer = playMode === "demo" ? (difficulty === "fast" ? 0.35 : 0.55) : 0;
    game.combo = 0;
    if (game.moves <= 0) {
      game.message = "BOARD EMPTY - R TO REROLL";
      logLine(">ROUND COMPLETE");
    }
    return;
  }
  game.chain += 1;
  game.combo += 1;
  const points = cells.length * 90 * game.combo;
  game.score += points;
  game.message = `CHAIN ${game.chain}  +${points}`;
  game.messagePulse = 1;
  game.shake = Math.min(0.35, 0.06 * game.chain + cells.length * 0.004);
  logLine(`>CLEAR ${cells.length} x${game.combo}`);
  for (const cell of cells) {
    const center = cellCenter(cell.x, cell.y);
    spawnBurst(center.x, center.y, gems[cell.type].fg, 14 + game.chain * 2, 1 + game.chain * 0.18);
    game.pulses[cell.y][cell.x] = 0.8;
    game.board[cell.y][cell.x] = -1;
  }
  game.state = "falling";
  game.timer = 0.18;
}

function collapseBoard() {
  for (let x = 0; x < SIZE; x += 1) {
    const kept = [];
    for (let y = SIZE - 1; y >= 0; y -= 1) {
      if (game.board[y][x] >= 0) kept.push(game.board[y][x]);
    }
    for (let y = SIZE - 1; y >= 0; y -= 1) {
      const next = kept[SIZE - 1 - y];
      game.board[y][x] = next === undefined ? randomGem() : next;
      if (next === undefined) game.pulses[y][x] = 0.6;
    }
  }
  game.state = "clearing";
  game.timer = 0.16;
}

function updateAI(dt) {
  if (playMode !== "demo" || game.state !== "idle" || game.moves <= 0) return;
  game.timer -= dt;
  if (game.timer > 0) return;
  const move = findBestMove();
  if (!move) {
    game.message = "RESHUFFLE";
    game.board = createBoard();
    game.timer = 0.6;
    logLine(">RESHUFFLE");
    return;
  }
  game.cursor = { ...move.from };
  attemptSwap(move.from, move.to);
}

function updateState(dt) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) game.pulses[y][x] = Math.max(0, game.pulses[y][x] - dt * 1.6);
  }
  for (const fx of game.fx) {
    fx.life -= dt;
    fx.x += fx.vx * dt * 10;
    fx.y += fx.vy * dt * 10;
    fx.vy += dt * 2.5;
  }
  game.fx = game.fx.filter((fx) => fx.life > 0);
  game.messagePulse = Math.max(0, game.messagePulse - dt);
  game.shake = Math.max(0, game.shake - dt);

  if (game.state === "clearing" || game.state === "falling") {
    game.timer -= dt;
    if (game.timer <= 0) {
      if (game.state === "clearing") clearMatches();
      else collapseBoard();
    }
  }
  updateAI(dt);
}

function update(dt) {
  if (!game || paused) return;
  updateState(dt);
}

function moveCursor(dx, dy) {
  if (game.state !== "idle") return;
  game.cursor.x = clamp(game.cursor.x + dx, 0, SIZE - 1);
  game.cursor.y = clamp(game.cursor.y + dy, 0, SIZE - 1);
}

function selectOrSwap() {
  if (game.state !== "idle") return;
  if (!game.selected) {
    game.selected = { ...game.cursor };
    game.message = "SELECT NEIGHBOR";
    game.messagePulse = 0.4;
    return;
  }
  const from = game.selected;
  const to = { ...game.cursor };
  if (from.x === to.x && from.y === to.y) {
    game.selected = null;
    game.message = "SELECT CLEARED";
    return;
  }
  attemptSwap(from, to);
  game.selected = null;
}

function renderBackground() {
  const seedHash = hashSeed(activeSeed.slice(0, 12));
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const band = (x * 5 + y * 3) % 23 === 0;
      const speck = (x * 17 + y * 11 + seedHash) % 61 === 0;
      buffer[y][x].bg = band ? "#07101a" : color.bg;
      buffer[y][x].ch = speck ? "·" : " ";
      buffer[y][x].fg = speck ? "#18334a" : color.muted;
    }
  }
}

function renderGem(x, y, type, selected, cursor, pulse) {
  const px = BOARD_X + x * CELL;
  const py = BOARD_Y + y * CELL;
  const bg = (x + y) % 2 === 0 ? color.cellA : color.cellB;
  const border = selected ? color.yellow : cursor ? color.white : color.grid;
  fillRectChars(px, py, CELL, CELL, " ", color.muted, bg);
  drawBox(px, py, CELL, CELL, border);
  if (type < 0) {
    writeText(px + 2, py + 3, "××", color.red);
    return;
  }
  const gem = gems[type];
  const fg = pulse > 0 ? mixColor(gem.fg, color.white, pulse) : gem.fg;
  setCell(px + 3, py + 2, gem.ch, fg);
  writeText(px + 2, py + 3, `${gem.ch}${gem.ch}${gem.ch}`, fg);
  setCell(px + 3, py + 4, gem.ch, fg);
}

function renderBoard() {
  const w = SIZE * CELL + 2;
  const h = SIZE * CELL + 2;
  drawBox(BOARD_X - 1, BOARD_Y - 1, w, h, color.line);
  writeText(BOARD_X, BOARD_Y - 3, "MATCH-3 GLYPH ARRAY", color.white);
  writeText(BOARD_X + 37, BOARD_Y - 3, "CHAIN REACTION FIELD", color.yellow);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const selected = game.selected && game.selected.x === x && game.selected.y === y;
      const cursor = game.cursor.x === x && game.cursor.y === y;
      renderGem(x, y, game.board[y][x], selected, cursor, game.pulses[y][x]);
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
  const x = 78;
  const y = 7;
  drawBox(x, y, 42, 58, color.line);
  writeText(x + 2, y + 2, "MATCH CORE", color.white);
  writeText(x + 2, y + 4, `SCORE ${String(game.score).padStart(8, "0")}`, color.green);
  writeText(x + 2, y + 5, `MOVES ${String(game.moves).padStart(2, "0")}`, color.yellow);
  writeText(x + 2, y + 7, `CHAIN ${String(game.chain).padStart(2, "0")}`, color.blue);
  writeText(x + 2, y + 8, `MODE  ${playMode.toUpperCase()}`, color.blue);
  writeText(x + 2, y + 9, `SPD   ${speed.toFixed(1)}X`, color.green);
  if (paused) writeText(x + 2, y + 11, "PAUSED", color.red);

  writeText(x + 2, y + 14, "GEMS", color.white);
  for (let i = 0; i < gems.length; i += 1) {
    const gx = x + 2 + (i % 2) * 18;
    const gy = y + 16 + Math.floor(i / 2) * 3;
    writeText(gx, gy, `${gems[i].ch} ${gems[i].name}`, gems[i].fg);
  }

  writeText(x + 2, y + 28, "EVENT", color.white);
  writeText(x + 2, y + 30, game.message.slice(0, 34), game.messagePulse > 0 ? color.red : color.muted);
  writeText(x + 2, y + 35, "LOG", color.white);
  for (let i = 0; i < game.logs.length; i += 1) {
    writeText(x + 2, y + 37 + i, game.logs[i], i === 0 ? color.green : color.muted);
  }

  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE    SPACE SELECT    P PAUSE    R REROLL    . HOME", color.muted);
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
  keys.add(key);
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
    if (key === " " || key === "enter") selectOrSwap();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

initGame(randomSeed());
composeScreen();
renderScreen();
requestAnimationFrame(frame);
