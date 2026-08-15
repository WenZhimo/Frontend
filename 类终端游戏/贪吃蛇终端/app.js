import { DIRECTIONS } from "./vendor/snake-ai/core/engine.js";
import { createSnakeAIStrategy } from "./vendor/snake-ai/strategy/snakeai-nn.js";
import { createAStarSafeStrategy } from "./vendor/snake-ai/strategy/astar-safe.js";
import { createHamiltonianShortcutStrategy } from "./vendor/snake-ai/strategy/hamiltonian-shortcuts.js";
import { createBFSStrategy } from "./vendor/snake-ai/strategy/bfs.js";
import { createFloodFillStrategy } from "./vendor/snake-ai/strategy/flood-fill.js";
import { createDijkstraStrategy } from "./vendor/snake-ai/strategy/dijkstra.js";
import { createVoronoiStrategy } from "./vendor/snake-ai/strategy/voronoi.js";
import { createGreedyStrategy } from "./vendor/snake-ai/strategy/greedy.js";

const canvas = document.getElementById("terminal");
const ctx = canvas.getContext("2d", { alpha: false });
const form = document.querySelector(".seed-bar");
const seedInput = document.getElementById("seed-input");
const seedRandomButton = document.getElementById("seed-random");
const seedCopyButton = document.getElementById("seed-copy");
const seedStatus = document.getElementById("seed-status");
const playModeSelect = document.getElementById("play-mode");
const aiSelect = document.getElementById("ai-select");

const COLS = 136;
const ROWS = 58;
const CELL_W = 11;
const CELL_H = 19;
const FONT_SIZE = 16;
const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
const SEED_LENGTH = 100;
const ASCII_FIRST = 32;
const ASCII_LAST = 126;
const RANDOM_SEED_CHARS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const BOARD_COLUMNS = 32;
const BOARD_ROWS = 18;
const BOARD = { x: 4, y: 8, cellW: 3, cellH: 2 };
const RIGHT = { x: 105, y: 2, w: 30, h: 53 };
const TICK_BASE_MS = 124;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const color = {
  page: "#020306",
  ink: "#06080d",
  ink2: "#0a0f16",
  panel: "#080c12",
  panel2: "#0c1119",
  line: "#2a3548",
  lineDim: "#182231",
  text: "#dffcff",
  header: "#f0f8ff",
  muted: "#7a8397",
  dim: "#465267",
  cyan: "#6ed5ec",
  cyan2: "#aaf6ff",
  green: "#75f0a8",
  gold: "#ffcc66",
  orange: "#ff9f45",
  red: "#ff4d5f",
  red2: "#ff7b6f",
  boardA: "#0b1117",
  boardB: "#091019",
  snake: "#f2ffff",
  snake2: "#9df6ff",
  snakeHead: "#ffffff",
  food: "#ff4254",
  food2: "#ffd166",
};

const DIR_VECTORS = {
  [DIRECTIONS.NORTH]: { x: 0, y: -1 },
  [DIRECTIONS.EAST]: { x: 1, y: 0 },
  [DIRECTIONS.SOUTH]: { x: 0, y: 1 },
  [DIRECTIONS.WEST]: { x: -1, y: 0 },
};

const OPPOSITES = {
  [DIRECTIONS.NORTH]: DIRECTIONS.SOUTH,
  [DIRECTIONS.EAST]: DIRECTIONS.WEST,
  [DIRECTIONS.SOUTH]: DIRECTIONS.NORTH,
  [DIRECTIONS.WEST]: DIRECTIONS.EAST,
};

const AI_ROSTER = [
  {
    id: "snakeai-pc",
    label: "SNAKEAI PC",
    source: "trained neural model",
    factory: (engine) =>
      createSnakeAIStrategy(engine, {
        profileId: "pc",
        modelUrl: "./vendor/snake-ai/data/models/profiles/pc.json",
      }),
  },
  { id: "astar-safe", label: "A* SAFE", source: "path + tail safety", factory: createAStarSafeStrategy },
  { id: "hamiltonian", label: "HAMILTONIAN+", source: "cycle shortcuts", factory: createHamiltonianShortcutStrategy },
  { id: "bfs", label: "BFS", source: "safe breadth-first", factory: createBFSStrategy },
  { id: "flood-fill", label: "FLOOD FILL", source: "space control", factory: createFloodFillStrategy },
  { id: "dijkstra", label: "DIJKSTRA", source: "weighted pathing", factory: createDijkstraStrategy },
  { id: "voronoi", label: "VORONOI", source: "territory heuristic", factory: createVoronoiStrategy },
  { id: "greedy", label: "GREEDY", source: "local heuristic", factory: createGreedyStrategy },
];

const screen = {
  ch: Array(COLS * ROWS),
  fg: Array(COLS * ROWS),
  bg: Array(COLS * ROWS),
};

const state = {
  seed: "",
  seedHash: 0,
  rng: null,
  engine: null,
  strategy: null,
  aiId: "snakeai-pc",
  mode: "ai",
  speed: 1,
  paused: false,
  nextTickAt: 0,
  lastFrame: 0,
  tickCount: 0,
  runCount: 1,
  eventLog: [],
  logOffset: 0,
  effects: [],
  trails: [],
  motion: null,
  lastResult: "BOOT",
};

function idx(x, y) {
  return y * COLS + x;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sanitizeSeed(value) {
  return Array.from(value || "")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= ASCII_FIRST && code <= ASCII_LAST ? char : "?";
    })
    .join("")
    .slice(0, SEED_LENGTH)
    .padEnd(SEED_LENGTH, " ");
}

function randomSeed() {
  let seed = "";
  const cryptoObj = window.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(SEED_LENGTH);
    cryptoObj.getRandomValues(bytes);
    for (const byte of bytes) seed += RANDOM_SEED_CHARS[byte % RANDOM_SEED_CHARS.length];
    return seed;
  }
  for (let i = 0; i < SEED_LENGTH; i += 1) {
    seed += RANDOM_SEED_CHARS[Math.floor(Math.random() * RANDOM_SEED_CHARS.length)];
  }
  return seed;
}

function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(x, y, salt = 0) {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519);
  h ^= state.seedHash + salt * 1597334677;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

function cloneCell(cell) {
  return { x: cell.x, y: cell.y };
}

function createTerminalSnakeEngine({ columns, rows, rng }) {
  const local = {
    columns,
    rows,
    growthStep: 3,
    direction: DIRECTIONS.EAST,
    length: 5,
    score: 0,
    steps: 0,
    resets: 0,
    body: [],
    food: null,
    full: false,
  };

  function getHead(snapshot = local) {
    return snapshot.body[snapshot.body.length - 1] || null;
  }

  function isCellInside(cell, snapshot = local) {
    return cell.x >= 0 && cell.y >= 0 && cell.x < snapshot.columns && cell.y < snapshot.rows;
  }

  function isCellWalkable(cell, snapshot = local, { allowTail = true } = {}) {
    if (!isCellInside(cell, snapshot)) return false;
    const body = snapshot.body || [];
    const blocked = allowTail && body.length > 0 ? body.slice(1) : body;
    return !blocked.some((segment) => segment.x === cell.x && segment.y === cell.y);
  }

  function spawnFood(snapshot = local) {
    const occupied = new Set(snapshot.body.map(cellKey));
    const free = [];
    for (let y = 0; y < snapshot.rows; y += 1) {
      for (let x = 0; x < snapshot.columns; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (!free.length) {
      snapshot.food = null;
      snapshot.full = true;
      return null;
    }
    snapshot.food = cloneCell(free[Math.floor(rng() * free.length)]);
    snapshot.full = false;
    return snapshot.food;
  }

  function reset() {
    local.direction = DIRECTIONS.EAST;
    local.length = 5;
    local.score = 0;
    local.steps = 0;
    local.full = false;
    local.resets += 1;
    const cy = Math.floor(local.rows / 2);
    const startX = Math.floor(local.columns / 2) - 2;
    local.body = [
      { x: startX - 4, y: cy },
      { x: startX - 3, y: cy },
      { x: startX - 2, y: cy },
      { x: startX - 1, y: cy },
      { x: startX, y: cy },
    ];
    spawnFood(local);
  }

  function setDirection(direction) {
    if (!DIR_VECTORS[direction]) return false;
    if (local.direction && OPPOSITES[local.direction] === direction && local.body.length > 1) return false;
    local.direction = direction;
    return true;
  }

  function canMove(direction) {
    const head = getHead(local);
    const vector = DIR_VECTORS[direction];
    if (!head || !vector) return false;
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    return isCellWalkable(next, local, { allowTail: true });
  }

  function step() {
    const head = getHead(local);
    const vector = DIR_VECTORS[local.direction];
    if (!head || !vector) return false;
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    if (!isCellWalkable(next, local, { allowTail: true })) return false;

    local.body.push(next);
    local.steps += 1;
    if (local.food && next.x === local.food.x && next.y === local.food.y) {
      local.length += local.growthStep;
      local.score += 1;
      spawnFood(local);
    }
    if (local.body.length > local.length) {
      local.body = local.body.slice(local.body.length - local.length);
    }
    return true;
  }

  function cloneState() {
    return {
      columns: local.columns,
      rows: local.rows,
      growthStep: local.growthStep,
      direction: local.direction,
      length: local.length,
      score: local.score,
      steps: local.steps,
      resets: local.resets,
      full: local.full,
      body: local.body.map(cloneCell),
      food: local.food ? cloneCell(local.food) : null,
      head: getHead(local) ? cloneCell(getHead(local)) : null,
    };
  }

  function simulateStep(snapshot, direction) {
    const vector = DIR_VECTORS[direction];
    if (!vector) return { ok: false, snapshot };
    const nextSnapshot = {
      ...snapshot,
      body: snapshot.body.map(cloneCell),
      food: snapshot.food ? cloneCell(snapshot.food) : null,
    };
    const head = getHead(nextSnapshot);
    if (!head) return { ok: false, snapshot };
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    if (!isCellWalkable(next, nextSnapshot, { allowTail: true })) return { ok: false, snapshot };
    nextSnapshot.body.push(next);
    let grew = false;
    if (nextSnapshot.food && next.x === nextSnapshot.food.x && next.y === nextSnapshot.food.y) {
      nextSnapshot.length += nextSnapshot.growthStep;
      nextSnapshot.food = null;
      grew = true;
    }
    if (nextSnapshot.body.length > nextSnapshot.length) {
      nextSnapshot.body = nextSnapshot.body.slice(nextSnapshot.body.length - nextSnapshot.length);
    }
    nextSnapshot.direction = direction;
    return { ok: true, snapshot: nextSnapshot, grew };
  }

  reset();

  return {
    reset,
    getState: cloneState,
    cloneState,
    setDirection,
    canMove,
    step,
    spawnFood,
    getHead,
    isCellWalkable,
    simulateStep,
    getDirectionVector(direction) {
      return DIR_VECTORS[direction];
    },
  };
}

function populateControls() {
  aiSelect.innerHTML = "";
  for (const ai of AI_ROSTER) {
    const option = document.createElement("option");
    option.value = ai.id;
    option.textContent = ai.label;
    aiSelect.appendChild(option);
  }
  aiSelect.value = state.aiId;
}

function createStrategy(id, engine) {
  const meta = AI_ROSTER.find((item) => item.id === id) || AI_ROSTER[0];
  return {
    id: meta.id,
    label: meta.label,
    source: meta.source,
    runner: meta.factory(engine),
  };
}

function addLog(message, tone = "info") {
  state.eventLog.unshift({
    message,
    tone,
    tick: state.tickCount,
  });
  state.eventLog = state.eventLog.slice(0, 42);
}

function initMatch(seed = state.seed, { reroll = false } = {}) {
  state.seed = sanitizeSeed(seed || randomSeed());
  state.seedHash = fnv1a(state.seed);
  state.rng = mulberry32(state.seedHash || 1);
  state.engine = createTerminalSnakeEngine({
    columns: BOARD_COLUMNS,
    rows: BOARD_ROWS,
    rng: state.rng,
  });
  state.aiId = aiSelect.value || "snakeai-pc";
  state.mode = playModeSelect.value || "ai";
  state.strategy = createStrategy(state.aiId, state.engine);
  state.tickCount = 0;
  state.runCount = 1;
  state.nextTickAt = performance.now() + 320;
  state.effects = [];
  state.trails = [];
  state.motion = null;
  state.paused = false;
  state.lastResult = reroll ? "REROLLED" : "READY";
  seedInput.value = state.seed.trimEnd();
  updateSeedStatus();
  addLog(`RUN ${String(state.runCount).padStart(2, "0")} / ${state.strategy.label}`, "ok");
  addLog(`SEED ${state.seed.slice(0, 18)}...`, "info");
}

function updateSeedStatus() {
  const rawLen = seedInput.value.length;
  seedStatus.value = `LEN ${String(rawLen).padStart(3, "0")}/100`;
}

function clearScreen() {
  for (let i = 0; i < screen.ch.length; i += 1) {
    screen.ch[i] = " ";
    screen.fg[i] = color.dim;
    screen.bg[i] = color.ink;
  }
}

function put(x, y, ch, fg = color.text, bg = null) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
  const index = idx(ix, iy);
  screen.ch[index] = ch;
  screen.fg[index] = fg;
  if (bg) screen.bg[index] = bg;
}

function putText(x, y, text, fg = color.text, bg = null) {
  for (let i = 0; i < text.length; i += 1) {
    put(x + i, y, text[i], fg, bg);
  }
}

function fillRect(x, y, w, h, bg, ch = " ", fg = color.dim) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) put(xx, yy, ch, fg, bg);
  }
}

function strokeRect(x, y, w, h, fg = color.line) {
  for (let xx = x; xx < x + w; xx += 1) {
    put(xx, y, xx === x || xx === x + w - 1 ? "+" : "-", fg);
    put(xx, y + h - 1, xx === x || xx === x + w - 1 ? "+" : "-", fg);
  }
  for (let yy = y + 1; yy < y + h - 1; yy += 1) {
    put(x, yy, "|", fg);
    put(x + w - 1, yy, "|", fg);
  }
}

function braille(mask) {
  return String.fromCharCode(0x2800 + (mask & 0xff));
}

function staticDotGlyph(x, y, density) {
  let mask = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    if (hash01(x * 17 + bit, y * 19 - bit, 41) < density) mask |= 1 << bit;
  }
  return mask ? braille(mask) : " ";
}

function powerGlyph(power) {
  if (power > 0.82) return "⣿";
  if (power > 0.68) return "⣾";
  if (power > 0.52) return "⣶";
  if (power > 0.36) return "⣤";
  if (power > 0.2) return "⠶";
  return "⠄";
}

function cellAnchor(cellOrX, y = null) {
  const x = typeof cellOrX === "number" ? cellOrX : cellOrX.x;
  const yy = typeof cellOrX === "number" ? y : cellOrX.y;
  return {
    x: BOARD.x + x * BOARD.cellW,
    y: BOARD.y + yy * BOARD.cellH,
  };
}

function cellCenter(cellOrX, y = null) {
  const anchor = cellAnchor(cellOrX, y);
  return {
    x: anchor.x + 1,
    y: anchor.y + 0.6,
  };
}

function drawCellBlock(cell, fg, bg, head = false, alpha = 1) {
  const anchor = cellAnchor(cell);
  const glyphs = head ? ["⣿", "⣶", "⣿", "⠿", "⠶", "⠿"] : ["⣶", "⣶", "⣦", "⠿", "⠿", "⠤"];
  const finalFg = alpha < 0.96 ? mixColor(fg, color.ink, 1 - alpha) : fg;
  for (let yy = 0; yy < BOARD.cellH; yy += 1) {
    for (let xx = 0; xx < BOARD.cellW; xx += 1) {
      put(anchor.x + xx, anchor.y + yy, glyphs[yy * BOARD.cellW + xx], finalFg, bg);
    }
  }
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
  const rr = Math.round(lerp(ar, br, t)).toString(16).padStart(2, "0");
  const rg = Math.round(lerp(ag, bg, t)).toString(16).padStart(2, "0");
  const rb = Math.round(lerp(ab, bb, t)).toString(16).padStart(2, "0");
  return `#${rr}${rg}${rb}`;
}

function drawBoardBase() {
  fillRect(1, 1, 102, 55, color.ink);
  strokeRect(1, 1, 102, 55, color.line);
  putText(4, 3, "SNAKE_AI :: CHARACTER TERMINAL", color.header);
  putText(4, 4, "LOCAL STRATEGY RUNTIME / GLYPH BUFFER ONLY", color.muted);

  const boardW = BOARD_COLUMNS * BOARD.cellW;
  const boardH = BOARD_ROWS * BOARD.cellH;
  fillRect(BOARD.x - 1, BOARD.y - 1, boardW + 2, boardH + 2, color.ink2);
  strokeRect(BOARD.x - 2, BOARD.y - 2, boardW + 4, boardH + 4, color.line);

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const bg = (x + y) % 2 === 0 ? color.boardA : color.boardB;
      const density = 0.16 + (x % 4) * 0.012 + (y % 3) * 0.009;
      const anchor = cellAnchor({ x, y });
      for (let yy = 0; yy < BOARD.cellH; yy += 1) {
        for (let xx = 0; xx < BOARD.cellW; xx += 1) {
          const sx = anchor.x + xx;
          const sy = anchor.y + yy;
          const glyph = staticDotGlyph(sx, sy, density);
          put(sx, sy, glyph, color.lineDim, bg);
        }
      }
    }
  }

  for (let x = 0; x <= BOARD_COLUMNS; x += 4) {
    const sx = BOARD.x + x * BOARD.cellW;
    for (let y = BOARD.y - 1; y < BOARD.y + boardH + 1; y += 1) put(sx, y, "│", color.lineDim);
  }
  for (let y = 0; y <= BOARD_ROWS; y += 3) {
    const sy = BOARD.y + y * BOARD.cellH;
    for (let x = BOARD.x - 1; x < BOARD.x + boardW + 1; x += 1) put(x, sy, "─", color.lineDim);
  }

  putText(4, 46, "[1]0.5x [2]1x [3]2x [4]4x   [SPACE] pause   [R] reroll   [J/K] log   [WASD/ARROWS] steer", color.muted);
  putText(4, 48, state.paused ? "PAUSED" : `RUNNING ${state.speed.toFixed(1)}x`, state.paused ? color.gold : color.green);
  putText(4, 50, `SEED ${state.seed.slice(0, 62)}`, color.dim);
}

function drawFood(gameState, now) {
  if (!gameState.food) return;
  const anchor = cellAnchor(gameState.food);
  const pulse = reducedMotion ? 0.6 : 0.5 + Math.sin(now / 140) * 0.18;
  const fg = mixColor(color.food, color.food2, pulse);
  put(anchor.x, anchor.y, "⣴", fg, color.boardA);
  put(anchor.x + 1, anchor.y, "⣿", fg, color.boardA);
  put(anchor.x + 2, anchor.y, "⣦", fg, color.boardA);
  put(anchor.x, anchor.y + 1, "⠻", color.red2, color.boardA);
  put(anchor.x + 1, anchor.y + 1, "⠿", color.food2, color.boardA);
  put(anchor.x + 2, anchor.y + 1, "⠟", color.red2, color.boardA);
}

function drawSnake(gameState, now) {
  const moving = state.motion && now - state.motion.start < state.motion.duration;
  const body = gameState.body || [];
  const hiddenHeadIndex = moving ? body.length - 1 : -1;

  for (let i = 0; i < body.length; i += 1) {
    if (i === hiddenHeadIndex) continue;
    const segment = body[i];
    const age = body.length <= 1 ? 1 : i / (body.length - 1);
    const fg = i === body.length - 1 ? color.snakeHead : mixColor(color.snake2, color.snake, age * 0.72);
    drawCellBlock(segment, fg, (segment.x + segment.y) % 2 === 0 ? color.boardA : color.boardB, i === body.length - 1);
  }

  if (moving) {
    const t = clamp((now - state.motion.start) / state.motion.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const x = lerp(state.motion.from.x, state.motion.to.x, eased);
    const y = lerp(state.motion.from.y, state.motion.to.y, eased);
    drawCellBlock({ x, y }, color.snakeHead, color.boardA, true);
  }
}

function addMoveEffects(before, after, now) {
  const from = before.head;
  const to = after.head;
  if (!from || !to || (from.x === to.x && from.y === to.y)) return;
  state.motion = {
    from,
    to,
    start: now,
    duration: reducedMotion ? 1 : 92 / state.speed,
  };
  state.trails.push({
    from,
    to,
    start: now,
    duration: 360,
    color: color.cyan,
  });
}

function addEatEffects(food, now) {
  const center = cellCenter(food);
  state.effects.push({
    type: "eat",
    x: center.x,
    y: center.y,
    start: now,
    duration: 620,
    color: color.red,
  });
  state.effects.push({
    type: "burst",
    x: center.x,
    y: center.y,
    start: now,
    duration: 720,
    color: color.gold,
  });
}

function addCrashEffects(head, now) {
  if (!head) return;
  const center = cellCenter(head);
  state.effects.push({
    type: "crash",
    x: center.x,
    y: center.y,
    start: now,
    duration: 980,
    color: color.red,
  });
}

function drawTrails(now) {
  state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
  for (const trail of state.trails) {
    const t = clamp((now - trail.start) / trail.duration, 0, 1);
    const from = cellCenter(trail.from);
    const to = cellCenter(trail.to);
    const count = 5;
    for (let i = 0; i < count; i += 1) {
      const p = clamp(1 - t - i * 0.13, 0, 1);
      if (p <= 0) continue;
      const x = lerp(from.x, to.x, p);
      const y = lerp(from.y, to.y, p);
      put(x, y, powerGlyph(p), mixColor(trail.color, color.ink, t), null);
    }
  }
}

function drawEffects(now) {
  state.effects = state.effects.filter((effect) => now - effect.start < effect.duration);
  for (const effect of state.effects) {
    const t = clamp((now - effect.start) / effect.duration, 0, 1);
    if (effect.type === "eat") {
      const radius = 1 + t * 10;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
        const x = effect.x + Math.cos(a) * radius * 1.7;
        const y = effect.y + Math.sin(a) * radius * 0.78;
        const power = 1 - t;
        put(x, y, powerGlyph(power), mixColor(effect.color, color.ink, t * 0.8));
      }
    } else {
      const spokes = effect.type === "crash" ? 34 : 20;
      for (let i = 0; i < spokes; i += 1) {
        const angle = (i / spokes) * Math.PI * 2 + hash01(i, state.tickCount, 77) * 0.22;
        const dist = (effect.type === "crash" ? 16 : 10) * t + (i % 5);
        const x = effect.x + Math.cos(angle) * dist * 1.75;
        const y = effect.y + Math.sin(angle) * dist * 0.85;
        const power = clamp(1 - t + (i % 3) * 0.08, 0, 1);
        put(x, y, powerGlyph(power), mixColor(effect.color, color.ink, t));
      }
    }
  }
}

function drawPanel(gameState, now) {
  fillRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.panel);
  strokeRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
  putText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
  putText(RIGHT.x + 2, RIGHT.y + 4, `MODE   ${state.mode === "ai" ? "AI AUTOPILOT" : "HUMAN PILOT"}`, color.muted);
  putText(RIGHT.x + 2, RIGHT.y + 6, `AI     ${state.strategy?.label || "NONE"}`, color.cyan);
  putText(RIGHT.x + 2, RIGHT.y + 8, `SOURCE ${state.strategy?.source || "manual"}`.slice(0, 27), color.dim);
  const meta = state.strategy?.runner?.getMeta?.() || {};
  if (meta.loading) putText(RIGHT.x + 2, RIGHT.y + 10, "MODEL  LOADING", color.gold);
  else if (meta.error) putText(RIGHT.x + 2, RIGHT.y + 10, "MODEL  ERROR", color.red);
  else if (meta.loaded) putText(RIGHT.x + 2, RIGHT.y + 10, "MODEL  READY", color.green);
  else putText(RIGHT.x + 2, RIGHT.y + 10, "MODEL  N/A", color.dim);

  putText(RIGHT.x + 2, RIGHT.y + 13, "RUN", color.header);
  putText(RIGHT.x + 2, RIGHT.y + 15, `SCORE  ${String(gameState.score).padStart(4, "0")}`, color.gold);
  putText(RIGHT.x + 2, RIGHT.y + 17, `LENGTH ${String(gameState.body.length).padStart(4, "0")}`, color.cyan);
  putText(RIGHT.x + 2, RIGHT.y + 19, `STEPS  ${String(gameState.steps).padStart(4, "0")}`, color.muted);
  putText(RIGHT.x + 2, RIGHT.y + 21, `SPEED  ${state.speed.toFixed(1)}x`, color.green);

  const fill = clamp(gameState.body.length / (BOARD_COLUMNS * BOARD_ROWS), 0, 1);
  putText(RIGHT.x + 2, RIGHT.y + 24, "OCCUPANCY", color.header);
  putText(RIGHT.x + 2, RIGHT.y + 26, `[${"=".repeat(Math.round(fill * 20)).padEnd(20, ".")}]`, color.cyan);
  putText(RIGHT.x + 2, RIGHT.y + 28, `${(fill * 100).toFixed(1).padStart(5, " ")}% GRID`, color.muted);

  putText(RIGHT.x + 2, RIGHT.y + 32, "EVENTS", color.header);
  const visible = state.eventLog.slice(state.logOffset, state.logOffset + 13);
  visible.forEach((entry, i) => {
    const fg = entry.tone === "danger" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "eat" ? color.gold : color.muted;
    putText(RIGHT.x + 2, RIGHT.y + 34 + i, `${String(entry.tick).padStart(4, "0")} ${entry.message}`.slice(0, 26), fg);
  });

  const scan = Math.floor((now / 70) % (RIGHT.h - 2));
  for (let x = RIGHT.x + 1; x < RIGHT.x + RIGHT.w - 1; x += 1) {
    if (hash01(x, scan, 91) < 0.18) put(x, RIGHT.y + 1 + scan, "⠂", color.lineDim);
  }
}

function renderTerminal() {
  ctx.fillStyle = color.ink;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  ctx.font = `${FONT_SIZE}px ${FONT}`;

  for (let y = 0; y < ROWS; y += 1) {
    let runBg = null;
    let runStart = 0;
    for (let x = 0; x <= COLS; x += 1) {
      const bg = x < COLS ? screen.bg[idx(x, y)] : null;
      if (bg !== runBg) {
        if (runBg) {
          ctx.fillStyle = runBg;
          ctx.fillRect(runStart * CELL_W, y * CELL_H, (x - runStart) * CELL_W, CELL_H);
        }
        runBg = bg;
        runStart = x;
      }
    }
  }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const ch = screen.ch[idx(x, y)];
      if (ch === " ") continue;
      ctx.fillStyle = screen.fg[idx(x, y)];
      ctx.fillText(ch, x * CELL_W, y * CELL_H);
    }
  }
}

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(COLS * CELL_W * dpr);
  canvas.height = Math.round(ROWS * CELL_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function advance(now) {
  if (!state.engine || state.paused) return;
  const before = state.engine.getState();
  const beforeFood = before.food ? cloneCell(before.food) : null;
  let alive = true;

  if (state.mode === "ai") {
    try {
      state.strategy.runner.tick();
    } catch (error) {
      console.error("[SNAKE TERMINAL] strategy failed", error);
      addLog("AI ERROR / RESET", "danger");
      addCrashEffects(before.head, now);
      state.engine.reset();
    }
  } else {
    alive = state.engine.step();
    if (!alive) {
      addLog("HUMAN COLLISION", "danger");
      addCrashEffects(before.head, now);
      state.engine.reset();
    }
  }

  const after = state.engine.getState();
  if (after.resets > before.resets) {
    state.runCount += 1;
    addLog(`RESET / RUN ${String(state.runCount).padStart(2, "0")}`, "danger");
    addCrashEffects(before.head, now);
  } else {
    addMoveEffects(before, after, now);
    if (after.score > before.score && beforeFood) {
      addEatEffects(beforeFood, now);
      addLog(`APPLE +${after.score} @ ${beforeFood.x},${beforeFood.y}`, "eat");
    }
    if (after.full) {
      addLog("GRID CLEARED", "ok");
    }
  }

  state.tickCount += 1;
  state.nextTickAt = now + TICK_BASE_MS / state.speed;
}

function draw(now) {
  clearScreen();
  const gameState = state.engine?.getState();
  drawBoardBase();
  if (gameState) {
    drawFood(gameState, now);
    drawSnake(gameState, now);
    drawTrails(now);
    drawEffects(now);
    drawPanel(gameState, now);
  }
  renderTerminal();
}

function loop(now) {
  if (!state.lastFrame) state.lastFrame = now;
  if (now >= state.nextTickAt) advance(now);
  draw(now);
  requestAnimationFrame(loop);
}

function setSpeed(speed) {
  state.speed = speed;
  addLog(`SPEED ${speed.toFixed(1)}x`, "info");
}

function turn(direction) {
  if (!state.engine) return;
  state.engine.setDirection(direction);
}

populateControls();
resizeCanvas();
initMatch(randomSeed());
requestAnimationFrame(loop);

seedInput.addEventListener("input", updateSeedStatus);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  initMatch(seedInput.value || randomSeed());
});

seedRandomButton.addEventListener("click", () => {
  seedInput.value = randomSeed();
  updateSeedStatus();
  initMatch(seedInput.value, { reroll: true });
});

seedCopyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(sanitizeSeed(seedInput.value || state.seed));
    addLog("SEED COPIED", "ok");
  } catch {
    seedInput.select();
    addLog("COPY FALLBACK", "info");
  }
});

aiSelect.addEventListener("change", () => {
  initMatch(state.seed);
});

playModeSelect.addEventListener("change", () => {
  state.mode = playModeSelect.value;
  addLog(`MODE ${state.mode.toUpperCase()}`, "info");
});

window.addEventListener("resize", resizeCanvas);

window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  const speedMap = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
  if (speedMap[key]) {
    event.preventDefault();
    setSpeed(speedMap[key]);
    return;
  }
  if (key === " ") {
    event.preventDefault();
    state.paused = !state.paused;
    addLog(state.paused ? "PAUSE" : "RESUME", "info");
    return;
  }
  if (key === "r") {
    event.preventDefault();
    seedInput.value = randomSeed();
    initMatch(seedInput.value, { reroll: true });
    return;
  }
  if (key === "j") {
    event.preventDefault();
    state.logOffset = clamp(state.logOffset + 1, 0, Math.max(0, state.eventLog.length - 1));
    return;
  }
  if (key === "k") {
    event.preventDefault();
    state.logOffset = clamp(state.logOffset - 1, 0, Math.max(0, state.eventLog.length - 1));
    return;
  }

  const directionMap = {
    arrowup: DIRECTIONS.NORTH,
    w: DIRECTIONS.NORTH,
    arrowright: DIRECTIONS.EAST,
    d: DIRECTIONS.EAST,
    arrowdown: DIRECTIONS.SOUTH,
    s: DIRECTIONS.SOUTH,
    arrowleft: DIRECTIONS.WEST,
    a: DIRECTIONS.WEST,
  };
  if (directionMap[key]) {
    event.preventDefault();
    turn(directionMap[key]);
  }
});
