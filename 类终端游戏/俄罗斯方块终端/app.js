(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const form = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const playModeSelect = document.getElementById("play-mode");
  const difficultySelect = document.getElementById("difficulty");

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

  const FIELD = { x: 4, y: 6, w: 98, h: 45 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const BOARD_W = 10;
  const BOARD_H = 22;
  const VISIBLE_TOP = 2;
  const VISIBLE_H = 20;
  const BLOCK_W = 5;
  const BLOCK_H = 2;
  const BOARD_X = FIELD.x + 21;
  const BOARD_Y = FIELD.y + 2;
  const NEXT_X = FIELD.x + 76;
  const NEXT_Y = FIELD.y + 9;
  const HOLD_X = FIELD.x + 7;
  const HOLD_Y = FIELD.y + 9;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const block = {
    full: String.fromCharCode(0x2588),
    dark: String.fromCharCode(0x2593),
    mid: String.fromCharCode(0x2592),
    light: String.fromCharCode(0x2591),
  };

  const color = {
    ink: "#06080d",
    ink2: "#0a0f16",
    panel: "#080c12",
    panel2: "#0d121a",
    line: "#2a3548",
    lineDim: "#172231",
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
    pink: "#ff78d4",
    blue: "#72a7ff",
    purple: "#b58cff",
    boardA: "#070b11",
    boardB: "#080d13",
  };

  const pieceDefs = {
    I: { color: color.cyan2, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    J: { color: color.blue, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { color: color.orange, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    O: { color: color.gold, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    S: { color: color.green, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    T: { color: color.purple, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    Z: { color: color.red2, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  };

  const difficultyConfig = {
    normal: { gravity: 0.78, lockDelay: 0.56, aiDelay: 0.11 },
    fast: { gravity: 0.42, lockDelay: 0.42, aiDelay: 0.08 },
    chaos: { gravity: 0.22, lockDelay: 0.32, aiDelay: 0.045 },
  };

  const screen = {
    ch: Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
    bg: Array(COLS * ROWS),
  };

  const state = {
    seed: "",
    seedHash: 0,
    rng: null,
    mode: "demo",
    difficulty: "normal",
    speed: 1,
    paused: false,
    game: null,
    bag: [],
    effects: [],
    trails: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
    input: { left: false, right: false, down: false },
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
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(SEED_LENGTH);
      window.crypto.getRandomValues(bytes);
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

  function updateSeedStatus() {
    seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`;
  }

  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 46);
  }

  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function makeBoard() {
    return Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(null));
  }

  function refillBag() {
    state.bag.push(...shuffle(Object.keys(pieceDefs)));
  }

  function nextKind() {
    if (state.bag.length < 7) refillBag();
    return state.bag.shift();
  }

  function createPiece(kind = nextKind()) {
    return {
      kind,
      x: kind === "I" ? 3 : 3,
      y: 1,
      rot: 0,
    };
  }

  function clonePiece(piece) {
    return { kind: piece.kind, x: piece.x, y: piece.y, rot: piece.rot };
  }

  function rotatedCells(kind, rot = 0) {
    if (kind === "O") return pieceDefs.O.cells.map(([x, y]) => [x, y]);
    let cells = pieceDefs[kind].cells.map(([x, y]) => [x, y]);
    const count = ((rot % 4) + 4) % 4;
    for (let r = 0; r < count; r += 1) {
      cells = cells.map(([x, y]) => [3 - y, x]);
    }
    let minX = Math.min(...cells.map(([x]) => x));
    let minY = Math.min(...cells.map(([, y]) => y));
    cells = cells.map(([x, y]) => [x - minX, y - minY]);
    minX = Math.min(...cells.map(([x]) => x));
    minY = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => [x - minX, y - minY]);
  }

  function pieceCells(piece) {
    return rotatedCells(piece.kind, piece.rot).map(([x, y]) => ({ x: piece.x + x, y: piece.y + y, kind: piece.kind }));
  }

  function valid(board, piece) {
    return pieceCells(piece).every((cell) => {
      if (cell.x < 0 || cell.x >= BOARD_W || cell.y >= BOARD_H) return false;
      if (cell.y < 0) return true;
      return !board[cell.y][cell.x];
    });
  }

  function ghostPiece(piece = state.game.active, board = state.game.board) {
    const ghost = clonePiece(piece);
    while (valid(board, { ...ghost, y: ghost.y + 1 })) ghost.y += 1;
    return ghost;
  }

  function clearLines(board) {
    const cleared = [];
    for (let y = BOARD_H - 1; y >= 0; y -= 1) {
      if (board[y].every(Boolean)) {
        cleared.push(y);
        board.splice(y, 1);
        board.unshift(Array(BOARD_W).fill(null));
        y += 1;
      }
    }
    return cleared;
  }

  function spawnPiece(kind = null) {
    const game = state.game;
    game.active = createPiece(kind || nextKind());
    game.canHold = true;
    game.lockTimer = 0;
    game.dropTimer = 0;
    game.aiPlan = null;
    game.aiClock = 0;
    if (!valid(game.board, game.active)) {
      game.status = "lose";
      game.statusText = "TOP OUT";
      addLog("TOP OUT", "danger");
      addBurst(boardToScreenX(5), BOARD_Y + 3, color.red, 60, 1.55);
    }
  }

  function initGame(seed = state.seed, { randomize = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed) || 1;
    state.rng = mulberry32(state.seedHash);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.bag = [];
    refillBag();
    state.game = {
      elapsed: 0,
      board: makeBoard(),
      active: null,
      hold: null,
      canHold: true,
      next: [],
      score: 0,
      level: 1,
      lines: 0,
      combo: 0,
      b2b: false,
      status: "running",
      statusText: "READY",
      dropTimer: 0,
      lockTimer: 0,
      aiPlan: null,
      aiClock: 0,
    };
    while (state.game.next.length < 5) state.game.next.push(nextKind());
    state.effects = [];
    state.trails = [];
    state.eventLog = [];
    state.logOffset = 0;
    state.paused = false;
    seedInput.value = state.seed;
    updateSeedStatus();
    spawnPiece(state.game.next.shift());
    state.game.next.push(nextKind());
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(randomize ? "NEW RANDOM BAG" : "MATRIX READY", "info");
  }

  function lockPiece() {
    const game = state.game;
    for (const cell of pieceCells(game.active)) {
      if (cell.y >= 0 && cell.y < BOARD_H) game.board[cell.y][cell.x] = cell.kind;
    }
    addLockSparks(game.active);
    const cleared = clearLines(game.board);
    if (cleared.length) {
      const base = [0, 100, 300, 500, 800][cleared.length] || 1200;
      game.combo += 1;
      game.lines += cleared.length;
      game.level = 1 + Math.floor(game.lines / 10);
      game.score += base * game.level + Math.max(0, game.combo - 1) * 50;
      game.statusText = cleared.length === 4 ? "TETRIS" : `${cleared.length} LINE`;
      addLog(`${cleared.length} LINE CLEAR`, cleared.length === 4 ? "tetris" : "ok");
      addLineClearEffects(cleared);
    } else {
      game.combo = 0;
      game.statusText = "LOCK";
    }
    spawnPiece(game.next.shift());
    game.next.push(nextKind());
  }

  function tryMove(dx, dy) {
    const game = state.game;
    const next = { ...game.active, x: game.active.x + dx, y: game.active.y + dy };
    if (!valid(game.board, next)) return false;
    game.active = next;
    if (dy === 0) game.lockTimer = 0;
    return true;
  }

  function tryRotate(amount) {
    const game = state.game;
    const base = { ...game.active, rot: game.active.rot + amount };
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      const next = { ...base, x: base.x + kick };
      if (valid(game.board, next)) {
        game.active = next;
        game.lockTimer = 0;
        addLog(amount > 0 ? "ROTATE CW" : "ROTATE CCW", "info");
        return true;
      }
    }
    return false;
  }

  function hardDrop() {
    const game = state.game;
    const before = game.active.y;
    const ghost = ghostPiece(game.active, game.board);
    game.active = ghost;
    const distance = Math.max(0, ghost.y - before);
    game.score += distance * 2;
    addDropTrail(game.active, distance);
    lockPiece();
  }

  function holdPiece() {
    const game = state.game;
    if (!game.canHold) return;
    const current = game.active.kind;
    if (game.hold) {
      const held = game.hold;
      game.hold = current;
      game.active = createPiece(held);
    } else {
      game.hold = current;
      game.active = createPiece(game.next.shift());
      game.next.push(nextKind());
    }
    game.canHold = false;
    game.lockTimer = 0;
    game.aiPlan = null;
    addLog(`HOLD ${game.hold}`, "info");
  }

  function boardStats(board) {
    const heights = Array(BOARD_W).fill(0);
    let holes = 0;
    let wells = 0;
    for (let x = 0; x < BOARD_W; x += 1) {
      let seen = false;
      for (let y = 0; y < BOARD_H; y += 1) {
        if (board[y][x]) {
          if (!seen) heights[x] = BOARD_H - y;
          seen = true;
        } else if (seen) {
          holes += 1;
        }
      }
    }
    for (let x = 0; x < BOARD_W; x += 1) {
      const left = x === 0 ? BOARD_H : heights[x - 1];
      const right = x === BOARD_W - 1 ? BOARD_H : heights[x + 1];
      if (left > heights[x] && right > heights[x]) wells += Math.min(left, right) - heights[x];
    }
    const aggregate = heights.reduce((sum, h) => sum + h, 0);
    let bumpiness = 0;
    for (let x = 0; x < BOARD_W - 1; x += 1) bumpiness += Math.abs(heights[x] - heights[x + 1]);
    return { heights, holes, wells, aggregate, bumpiness, maxHeight: Math.max(...heights) };
  }

  function simulatePlacement(board, piece) {
    const copy = board.map((row) => row.slice());
    const drop = ghostPiece(piece, copy);
    if (!valid(copy, drop)) return null;
    for (const cell of pieceCells(drop)) {
      if (cell.y >= 0 && cell.y < BOARD_H) copy[cell.y][cell.x] = cell.kind;
    }
    const lines = clearLines(copy).length;
    return { board: copy, piece: drop, lines };
  }

  function evaluateBoard(sim, kind) {
    const stats = boardStats(sim.board);
    const tetrisBonus = sim.lines === 4 ? 5.4 : 0;
    const lineScore = sim.lines * 2.6 + tetrisBonus;
    const survivalPenalty = stats.maxHeight > 16 ? (stats.maxHeight - 16) * 2.4 : 0;
    const wellBias = kind === "I" ? stats.wells * 0.16 : Math.min(stats.wells, 3) * 0.08;
    return (
      lineScore -
      stats.aggregate * 0.43 -
      stats.holes * 4.6 -
      stats.bumpiness * 0.76 -
      survivalPenalty +
      wellBias
    );
  }

  function bestPlanFor(kind, board = state.game.board) {
    let best = null;
    for (let rot = 0; rot < 4; rot += 1) {
      const cells = rotatedCells(kind, rot);
      const minX = Math.min(...cells.map(([x]) => x));
      const maxX = Math.max(...cells.map(([x]) => x));
      for (let x = -minX; x < BOARD_W - maxX; x += 1) {
        const piece = { kind, x, y: 0, rot };
        if (!valid(board, piece)) continue;
        const sim = simulatePlacement(board, piece);
        if (!sim) continue;
        const score = evaluateBoard(sim, kind);
        if (!best || score > best.score) {
          best = { score, targetX: x, targetRot: rot, targetY: sim.piece.y, lines: sim.lines };
        }
      }
    }
    return best || { score: -Infinity, targetX: 3, targetRot: 0, targetY: 0, lines: 0 };
  }

  function chooseAIMove() {
    const game = state.game;
    if (!game.aiPlan || game.aiPlan.kind !== game.active.kind) {
      const currentPlan = bestPlanFor(game.active.kind);
      let best = { ...currentPlan, hold: false, kind: game.active.kind };
      if (game.canHold) {
        const holdKind = game.hold || game.next[0];
        const holdPlan = bestPlanFor(holdKind);
        if (holdPlan.score > best.score + 1.2) best = { ...holdPlan, hold: true, kind: game.active.kind };
      }
      game.aiPlan = best;
    }
    const plan = game.aiPlan;
    if (plan.hold && game.canHold) return "hold";
    const targetRot = ((plan.targetRot % 4) + 4) % 4;
    const currentRot = ((game.active.rot % 4) + 4) % 4;
    if (currentRot !== targetRot) {
      const cw = (targetRot - currentRot + 4) % 4;
      return cw <= 2 ? "rotateCW" : "rotateCCW";
    }
    if (game.active.x < plan.targetX) return "right";
    if (game.active.x > plan.targetX) return "left";
    if (game.active.y < plan.targetY) return "down";
    return "hardDrop";
  }

  function applyAction(action) {
    if (!state.game || state.game.status !== "running") return;
    if (action === "left") tryMove(-1, 0);
    if (action === "right") tryMove(1, 0);
    if (action === "down") {
      if (tryMove(0, 1)) state.game.score += 1;
    }
    if (action === "rotateCW") tryRotate(1);
    if (action === "rotateCCW") tryRotate(-1);
    if (action === "hardDrop") hardDrop();
    if (action === "hold") holdPiece();
  }

  function gravitySeconds() {
    const config = difficultyConfig[state.difficulty] || difficultyConfig.normal;
    return Math.max(0.055, config.gravity * Math.pow(0.86, state.game.level - 1));
  }

  function advanceGame(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "running") return;
    const scaled = dt * state.speed;
    game.elapsed += scaled;
    game.dropTimer += scaled;
    const config = difficultyConfig[state.difficulty] || difficultyConfig.normal;

    if (state.mode === "demo") {
      game.aiClock += scaled;
      while (game.aiClock >= config.aiDelay && game.status === "running") {
        game.aiClock -= config.aiDelay;
        applyAction(chooseAIMove());
      }
    } else if (state.input.down) {
      game.dropTimer += scaled * 6;
    }

    while (game.dropTimer >= gravitySeconds() && game.status === "running") {
      game.dropTimer -= gravitySeconds();
      if (!tryMove(0, 1)) {
        game.lockTimer += gravitySeconds();
        if (game.lockTimer >= config.lockDelay) lockPiece();
      } else {
        game.lockTimer = 0;
      }
    }
    state.effects = state.effects.slice(-260);
    state.trails = state.trails.slice(-120);
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
    for (let i = 0; i < text.length; i += 1) put(x + i, y, text[i], fg, bg);
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
      if (hash01(x * 13 + bit, y * 17 - bit, 38) < density) mask |= 1 << bit;
    }
    return mask ? braille(mask) : " ";
  }

  function boardToScreenX(x) {
    return BOARD_X + x * BLOCK_W;
  }

  function boardToScreenY(y) {
    return BOARD_Y + (y - VISIBLE_TOP) * BLOCK_H;
  }

  function drawFrame(now) {
    fillRect(1, 1, 102, 55, color.ink);
    strokeRect(1, 1, 102, 55, color.line);
    putText(4, 3, "TETRIS :: CHARACTER TERMINAL", color.header);
    putText(4, 4, "SEEDED 7-BAG / HOLD / GHOST / LINE-CLEAR GLYPHS", color.muted);
    fillRect(FIELD.x - 1, FIELD.y - 1, FIELD.w + 2, FIELD.h + 2, color.ink2);
    strokeRect(FIELD.x - 2, FIELD.y - 2, FIELD.w + 4, FIELD.h + 4, color.line);

    const boardW = BOARD_W * BLOCK_W;
    const boardH = VISIBLE_H * BLOCK_H;
    fillRect(BOARD_X - 1, BOARD_Y - 1, boardW + 2, boardH + 2, color.boardA);
    strokeRect(BOARD_X - 2, BOARD_Y - 2, boardW + 4, boardH + 4, color.line);
    for (let y = 0; y < boardH; y += 1) {
      for (let x = 0; x < boardW; x += 1) {
        const bg = (Math.floor(x / BLOCK_W) + Math.floor(y / BLOCK_H)) % 2 ? color.boardA : color.boardB;
        put(BOARD_X + x, BOARD_Y + y, staticDotGlyph(BOARD_X + x, BOARD_Y + y, 0.04), color.lineDim, bg);
      }
    }
    putText(HOLD_X, HOLD_Y - 3, "HOLD", color.header);
    strokeRect(HOLD_X - 1, HOLD_Y - 1, 16, 10, color.line);
    putText(NEXT_X, NEXT_Y - 3, "NEXT", color.header);
    strokeRect(NEXT_X - 1, NEXT_Y - 1, 17, 27, color.line);
    putText(4, 52, "[1]0.5x [2]1x [3]2x [4]4x   [SPACE] hard drop   [Z/X] rotate   [H] hold   [R] restart   [T] hub", color.muted);
    putText(4, 54, state.paused ? "PAUSED" : `RUNNING ${state.speed.toFixed(1)}x`, state.paused ? color.gold : color.green);

    if (!reducedMotion) {
      const sweep = Math.floor((now / 64) % VISIBLE_H);
      for (let x = 0; x < boardW; x += 1) {
        if (hash01(x, sweep, 141) < 0.08) put(BOARD_X + x, BOARD_Y + sweep * BLOCK_H, ".", color.line);
      }
    }
  }

  function drawBlockCell(cx, cy, kind, alpha = 0, ghost = false) {
    const fgBase = pieceDefs[kind]?.color || color.cyan;
    const fg = ghost ? mixColor(fgBase, color.ink, 0.58) : mixColor(fgBase, color.header, alpha);
    const bg = ghost ? null : color.panel2;
    const glyphs = ghost ? [".", ":", ".", ":"] : [block.full, block.dark, block.full, block.mid];
    for (let yy = 0; yy < BLOCK_H; yy += 1) {
      for (let xx = 0; xx < BLOCK_W; xx += 1) {
        const edge = xx === 0 || xx === BLOCK_W - 1 || yy === 0 || yy === BLOCK_H - 1;
        const glyph = edge ? glyphs[0] : glyphs[(xx + yy) % glyphs.length];
        put(cx + xx, cy + yy, glyph, edge ? mixColor(fg, color.ink, 0.16) : fg, bg);
      }
    }
  }

  function drawPiece(piece, ghost = false) {
    for (const cell of pieceCells(piece)) {
      if (cell.y < VISIBLE_TOP || cell.y >= BOARD_H) continue;
      drawBlockCell(boardToScreenX(cell.x), boardToScreenY(cell.y), cell.kind, hash01(cell.x, cell.y, 20) * 0.24, ghost);
    }
  }

  function drawMiniPiece(kind, x, y) {
    const cells = rotatedCells(kind, 0);
    for (const [cx, cy] of cells) {
      const sx = x + cx * 3;
      const sy = y + cy * 2;
      const fg = pieceDefs[kind]?.color || color.cyan;
      put(sx, sy, block.full, fg, color.panel2);
      put(sx + 1, sy, block.dark, fg, color.panel2);
      put(sx, sy + 1, block.mid, fg, color.panel2);
      put(sx + 1, sy + 1, block.full, fg, color.panel2);
    }
    putText(x, y + 5, kind, pieceDefs[kind]?.color || color.text);
  }

  function drawBoard() {
    const game = state.game;
    for (let y = VISIBLE_TOP; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) {
        const kind = game.board[y][x];
        if (kind) drawBlockCell(boardToScreenX(x), boardToScreenY(y), kind, hash01(x, y, 11) * 0.18);
      }
    }
    if (game.status === "running") {
      drawPiece(ghostPiece(), true);
      drawPiece(game.active, false);
    }
    if (game.hold) drawMiniPiece(game.hold, HOLD_X + 3, HOLD_Y + 1);
    game.next.slice(0, 4).forEach((kind, i) => drawMiniPiece(kind, NEXT_X + 3, NEXT_Y + 1 + i * 6));
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    const glyphs = [".", ":", "*", "+", block.light, block.mid];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.48;
      const speed = (8 + state.rng() * 24) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7,
        glyph: glyphs[Math.floor(state.rng() * glyphs.length)],
        color: baseColor,
        start: now,
        duration: 360 + state.rng() * 380,
      });
    }
  }

  function addLineClearEffects(rows) {
    for (const row of rows) {
      const y = boardToScreenY(row) + 1;
      for (let x = 0; x < BOARD_W; x += 1) {
        addBurst(boardToScreenX(x) + 2, y, color.cyan2, 5, 1.1);
      }
    }
  }

  function addLockSparks(piece) {
    for (const cell of pieceCells(piece)) {
      if (cell.y < VISIBLE_TOP) continue;
      addBurst(boardToScreenX(cell.x) + 2, boardToScreenY(cell.y), pieceDefs[cell.kind].color, 5, 0.62);
    }
  }

  function addDropTrail(piece, distance) {
    for (const cell of pieceCells(piece)) {
      if (cell.y < VISIBLE_TOP) continue;
      for (let d = 1; d <= Math.min(distance, 10); d += 1) {
        state.trails.push({
          x: boardToScreenX(cell.x) + 2,
          y: boardToScreenY(cell.y - d) + 1,
          color: pieceDefs[cell.kind].color,
          start: performance.now(),
          duration: 180 + d * 18,
        });
      }
    }
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      put(trail.x, trail.y, ".", mixColor(trail.color, color.ink, t));
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((effect) => now - effect.start < effect.duration);
    for (const effect of state.effects) {
      const t = clamp((now - effect.start) / effect.duration, 0, 1);
      const age = (now - effect.start) / 1000;
      put(effect.x + effect.vx * age, effect.y + effect.vy * age, effect.glyph, mixColor(effect.color, color.ink, t));
    }
  }

  function drawPanel() {
    const game = state.game;
    fillRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.panel);
    strokeRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    putText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 4, `MODE   ${state.mode.toUpperCase()}`.slice(0, 25), color.cyan);
    putText(RIGHT.x + 2, RIGHT.y + 6, `DIFF   ${state.difficulty.toUpperCase()}`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 8, `STATE  ${game.statusText}`.slice(0, 25), game.status === "running" ? color.green : color.red);
    putText(RIGHT.x + 2, RIGHT.y + 11, "STACK", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 13, `SCORE  ${String(game.score).padStart(8, "0")}`, color.gold);
    putText(RIGHT.x + 2, RIGHT.y + 15, `LEVEL  ${String(game.level).padStart(4, "0")}`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 17, `LINES  ${String(game.lines).padStart(4, "0")}`, color.cyan2);
    putText(RIGHT.x + 2, RIGHT.y + 19, `COMBO  ${String(game.combo).padStart(4, "0")}`, color.orange);
    putText(RIGHT.x + 2, RIGHT.y + 21, `SPEED  ${state.speed.toFixed(1)}x`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 24, "ACTIVE", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 26, `PIECE  ${game.active?.kind || "-"}`, game.active ? pieceDefs[game.active.kind].color : color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 28, `HOLD   ${game.hold || "-"}`, game.hold ? pieceDefs[game.hold].color : color.muted);
    const plan = game.aiPlan;
    putText(RIGHT.x + 2, RIGHT.y + 30, `AIMOVE ${state.mode === "demo" && plan ? `${plan.targetX}/${plan.targetRot}` : "-"}`.slice(0, 25), color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 33, "EVENTS", color.header);
    const visible = state.eventLog.slice(state.logOffset, state.logOffset + 16);
    visible.forEach((entry, i) => {
      const fg =
        entry.tone === "danger"
          ? color.red
          : entry.tone === "ok"
            ? color.green
            : entry.tone === "tetris"
              ? color.gold
              : color.muted;
      putText(RIGHT.x + 2, RIGHT.y + 35 + i, `${String(entry.time).padStart(4, "0")} ${entry.message}`.slice(0, 25), fg);
    });
  }

  function draw(now) {
    clearScreen();
    drawFrame(now);
    drawTrails(now);
    drawBoard();
    drawEffects(now);
    if (state.game.status !== "running") {
      putText(BOARD_X + 9, BOARD_Y + 19, " GAME OVER :: R TO RESTART ", color.red, color.panel2);
    }
    drawPanel();
    renderTerminal();
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

  function loop(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    advanceGame(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  function setSpeed(speed) {
    state.speed = speed;
    addLog(`SPEED ${speed.toFixed(1)}x`, "info");
  }

  resizeCanvas();
  initGame(randomSeed(), { randomize: true });
  requestAnimationFrame(loop);

  seedInput.addEventListener("input", updateSeedStatus);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value || randomSeed());
  });
  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    initGame(seedInput.value, { randomize: true });
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
  playModeSelect.addEventListener("change", () => {
    state.mode = playModeSelect.value;
    addLog(`MODE ${state.mode.toUpperCase()}`, "info");
  });
  difficultySelect.addEventListener("change", () => initGame(state.seed));
  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const tagName = event.target?.tagName;
    if (tagName === "INPUT" || tagName === "SELECT" || tagName === "BUTTON") return;
    const speedMap = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (speedMap[key]) {
      event.preventDefault();
      setSpeed(speedMap[key]);
      return;
    }
    if (key === "r") {
      event.preventDefault();
      initGame(state.seed);
      return;
    }
    if (key === "t") {
      event.preventDefault();
      window.location.href = "../index.html";
      return;
    }
    if (key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSE" : "RESUME", "info");
      return;
    }
    if (key === " ") {
      event.preventDefault();
      applyAction("hardDrop");
      return;
    }
    if (key === "z") {
      event.preventDefault();
      applyAction("rotateCCW");
      return;
    }
    if (key === "x" || key === "arrowup" || key === "w") {
      event.preventDefault();
      applyAction("rotateCW");
      return;
    }
    if (key === "h" || key === "shift") {
      event.preventDefault();
      applyAction("hold");
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
    if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      applyAction("left");
    }
    if (key === "arrowright" || key === "d") {
      event.preventDefault();
      applyAction("right");
    }
    if (key === "arrowdown" || key === "s") {
      event.preventDefault();
      state.input.down = true;
      applyAction("down");
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowdown" || key === "s") state.input.down = false;
  });
})();
