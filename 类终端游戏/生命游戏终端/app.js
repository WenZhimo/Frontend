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
  const GRID_W = 88;
  const GRID_H = 41;
  const GRID_X = FIELD.x + 5;
  const GRID_Y = FIELD.y + 2;

  const glyph = {
    full: String.fromCharCode(0x2588),
    dark: String.fromCharCode(0x2593),
    mid: String.fromCharCode(0x2592),
    light: String.fromCharCode(0x2591),
    dot: String.fromCharCode(0x00b7),
    square: String.fromCharCode(0x25a1),
    cursor: String.fromCharCode(0x25a3),
  };

  const color = {
    ink: "#06080d",
    ink2: "#080d13",
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
    green2: "#baffc9",
    gold: "#ffcc66",
    orange: "#ff9f45",
    red: "#ff4d5f",
    pink: "#ff78d4",
    blue: "#72a7ff",
    purple: "#b58cff",
    boardA: "#071017",
    boardB: "#08131b",
  };

  const config = {
    normal: { interval: 0.18, density: 0.215, mutation: 0.0018, name: "NORMAL" },
    fast: { interval: 0.095, density: 0.245, mutation: 0.0026, name: "FAST" },
    chaos: { interval: 0.052, density: 0.285, mutation: 0.0045, name: "CHAOS" },
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
    effects: [],
    eventLog: [],
    lastFrame: 0,
    accumulator: 0,
    cursor: { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) },
    pointerDown: false,
  };

  function idx(x, y) {
    return y * COLS + x;
  }

  function cellIndex(x, y) {
    return y * GRID_W + x;
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
    state.eventLog.unshift({ message, tone });
    state.eventLog = state.eventLog.slice(0, 42);
  }

  function put(x, y, char = " ", fg = color.text, bg = null) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const pos = idx(x, y);
    screen.ch[pos] = char;
    screen.fg[pos] = fg;
    if (bg !== null) screen.bg[pos] = bg;
  }

  function writeText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) put(x + i, y, text[i], fg, bg);
  }

  function fillRectChars(x, y, w, h, char, fg, bg = null) {
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) put(x + xx, y + yy, char, fg, bg);
    }
  }

  function drawBox(x, y, w, h, fg = color.line, bg = color.panel) {
    fillRectChars(x, y, w, h, " ", fg, bg);
    for (let xx = x + 1; xx < x + w - 1; xx += 1) {
      put(xx, y, "-", fg, bg);
      put(xx, y + h - 1, "-", fg, bg);
    }
    for (let yy = y + 1; yy < y + h - 1; yy += 1) {
      put(x, yy, "|", fg, bg);
      put(x + w - 1, yy, "|", fg, bg);
    }
    put(x, y, "+", fg, bg);
    put(x + w - 1, y, "+", fg, bg);
    put(x, y + h - 1, "+", fg, bg);
    put(x + w - 1, y + h - 1, "+", fg, bg);
  }

  function drawBar(x, y, w, value, fg = color.green, label = "") {
    const filled = clamp(Math.round(w * value), 0, w);
    put(x - 1, y, "[", color.red);
    put(x + w, y, "]", color.red);
    for (let i = 0; i < w; i += 1) {
      const char = i < filled ? glyph.full : glyph.light;
      const tone = i < filled ? fg : color.lineDim;
      put(x + i, y, char, tone);
    }
    if (label) writeText(x + w + 2, y, label, color.muted);
  }

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.text;
      screen.bg[i] = color.ink;
    }
  }

  const patterns = [
    {
      name: "GLIDER",
      cells: [
        [1, 0],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    },
    {
      name: "R-PENTOMINO",
      cells: [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
    },
    {
      name: "PULSAR CORE",
      cells: [
        [2, 0],
        [3, 0],
        [4, 0],
        [0, 2],
        [5, 2],
        [0, 3],
        [5, 3],
        [0, 4],
        [5, 4],
        [2, 5],
        [3, 5],
        [4, 5],
      ],
    },
    {
      name: "LIGHTWEIGHT SHIP",
      cells: [
        [1, 0],
        [4, 0],
        [0, 1],
        [0, 2],
        [4, 2],
        [0, 3],
        [1, 3],
        [2, 3],
        [3, 3],
      ],
    },
  ];

  function stamp(grid, pattern, px, py) {
    for (const [dx, dy] of pattern.cells) {
      const x = px + dx;
      const y = py + dy;
      if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) grid[cellIndex(x, y)] = 1;
    }
  }

  function makeGrid() {
    return new Uint8Array(GRID_W * GRID_H);
  }

  function seedGrid() {
    const grid = makeGrid();
    const cfg = config[state.difficulty];
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const borderBias = x < 3 || y < 3 || x > GRID_W - 4 || y > GRID_H - 4 ? -0.08 : 0;
        if (hash01(x, y, 11) < cfg.density + borderBias) grid[cellIndex(x, y)] = 1;
      }
    }

    const patternCount = state.difficulty === "chaos" ? 11 : state.difficulty === "fast" ? 8 : 6;
    for (let i = 0; i < patternCount; i += 1) {
      const pattern = patterns[Math.floor(state.rng() * patterns.length)];
      const px = 4 + Math.floor(state.rng() * (GRID_W - 12));
      const py = 4 + Math.floor(state.rng() * (GRID_H - 12));
      stamp(grid, pattern, px, py);
      addLog(`INJECT ${pattern.name}`, i % 2 ? "cyan" : "green");
    }

    return grid;
  }

  function initGame(seed = state.seed) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash ^ 0xa51f1f3d);
    state.mode = playModeSelect.value;
    state.difficulty = difficultySelect.value;
    state.speed = 1;
    state.paused = state.mode === "human";
    state.accumulator = 0;
    state.effects = [];
    state.eventLog = [];
    const grid = seedGrid();
    state.game = {
      grid,
      next: makeGrid(),
      age: new Uint16Array(GRID_W * GRID_H),
      fade: new Float32Array(GRID_W * GRID_H),
      generation: 0,
      births: 0,
      deaths: 0,
      alive: 0,
      lastAlive: -1,
      stableTicks: 0,
      mutationClock: 0,
      hashHistory: [],
    };
    for (let i = 0; i < grid.length; i += 1) {
      if (grid[i]) {
        state.game.age[i] = 1;
        state.game.alive += 1;
      }
    }
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog(state.mode === "human" ? "HUMAN EDIT PAUSED" : "AUTO EVOLUTION");
    addLog(`${config[state.difficulty].name} / B3 S23`, "green");
  }

  function neighborCount(grid, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GRID_W || yy >= GRID_H) continue;
        count += grid[cellIndex(xx, yy)];
      }
    }
    return count;
  }

  function addEffect(x, y, kind, tone = "green") {
    if (state.effects.length > 220) state.effects.splice(0, state.effects.length - 220);
    state.effects.push({ x, y, kind, tone, age: 0, life: kind === "pulse" ? 0.9 : 0.52 });
  }

  function gridHash(grid) {
    let h = 2166136261;
    for (let i = 0; i < grid.length; i += 1) {
      if (!grid[i]) continue;
      h ^= i + 1;
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function injectPattern(reason = "MUTATION") {
    const pattern = patterns[Math.floor(state.rng() * patterns.length)];
    const px = 3 + Math.floor(state.rng() * (GRID_W - 10));
    const py = 3 + Math.floor(state.rng() * (GRID_H - 10));
    stamp(state.game.grid, pattern, px, py);
    for (const [dx, dy] of pattern.cells) addEffect(px + dx, py + dy, "pulse", "cyan");
    addLog(`${reason} ${pattern.name}`, "cyan");
  }

  function stepLife() {
    const game = state.game;
    const { grid, next, age, fade } = game;
    let alive = 0;
    let births = 0;
    let deaths = 0;

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        const n = neighborCount(grid, x, y);
        const wasAlive = grid[p] === 1;
        const isAlive = wasAlive ? n === 2 || n === 3 : n === 3;
        next[p] = isAlive ? 1 : 0;
        if (isAlive) {
          alive += 1;
          age[p] = wasAlive ? Math.min(age[p] + 1, 9999) : 1;
          fade[p] = 0;
          if (!wasAlive) {
            births += 1;
            if (births < 65) addEffect(x, y, "birth", "green");
          }
        } else {
          if (wasAlive) {
            deaths += 1;
            fade[p] = 1;
            age[p] = 0;
            if (deaths < 65) addEffect(x, y, "death", "red");
          } else {
            fade[p] *= 0.72;
          }
        }
      }
    }

    grid.set(next);
    next.fill(0);
    game.generation += 1;
    game.births = births;
    game.deaths = deaths;
    game.alive = alive;

    const hash = gridHash(grid);
    const repeated = game.hashHistory.includes(hash);
    game.hashHistory.push(hash);
    if (game.hashHistory.length > 36) game.hashHistory.shift();
    if (alive === game.lastAlive || births + deaths === 0 || repeated) {
      game.stableTicks += 1;
    } else {
      game.stableTicks = Math.max(0, game.stableTicks - 2);
    }
    game.lastAlive = alive;

    if (births + deaths > 80) addLog(`BURST +${births} / -${deaths}`, "green");
    if (births + deaths === 0) addLog("STATIC FIELD", "red");
    if (repeated && game.generation > 12) addLog("LOOP SIGNATURE", "gold");

    if (state.mode === "demo") {
      game.mutationClock += 1;
      const cfg = config[state.difficulty];
      if (game.stableTicks > 18 || alive < 90 || state.rng() < cfg.mutation) {
        injectPattern(game.stableTicks > 18 ? "RESEED" : "SPARK");
        game.stableTicks = 0;
      }
    }
  }

  function updateEffects(dt) {
    for (const effect of state.effects) effect.age += dt;
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
    if (!state.game) return;
    const fade = state.game.fade;
    for (let i = 0; i < fade.length; i += 1) {
      if (fade[i] > 0) fade[i] = Math.max(0, fade[i] - dt * 1.9);
    }
  }

  function toggleCell(x, y, force = null) {
    if (!state.game) return;
    x = clamp(x, 0, GRID_W - 1);
    y = clamp(y, 0, GRID_H - 1);
    const p = cellIndex(x, y);
    const next = force === null ? (state.game.grid[p] ? 0 : 1) : force ? 1 : 0;
    if (state.game.grid[p] === next) return;
    state.game.grid[p] = next;
    state.game.age[p] = next ? 1 : 0;
    state.game.fade[p] = next ? 0 : 1;
    addEffect(x, y, next ? "pulse" : "death", next ? "cyan" : "red");
    state.game.alive += next ? 1 : -1;
  }

  function drawBackground() {
    clearScreen();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const band = Math.floor(y / 5) % 2 === 0 ? color.ink : "#05090f";
        const bg = hash01(x, y, 99) > 0.92 ? color.ink2 : band;
        screen.bg[idx(x, y)] = bg;
        if (hash01(x, y, 21) > 0.985) {
          put(x, y, hash01(x, y, 22) > 0.65 ? glyph.dot : ":", color.lineDim, bg);
        }
      }
    }
  }

  function drawGrid() {
    const game = state.game;
    const cfg = config[state.difficulty];
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line, color.panel);
    writeText(FIELD.x + 2, FIELD.y - 2, "CONWAY LIFE LAB", color.header);
    writeText(FIELD.x + FIELD.w - 26, FIELD.y - 2, "BIRTH 3 / SURVIVE 2-3", color.green);

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        const px = GRID_X + x;
        const py = GRID_Y + y;
        const checker = (Math.floor(x / 4) + Math.floor(y / 3)) % 2 === 0;
        const bg = checker ? color.boardA : color.boardB;
        if (game.grid[p]) {
          const a = game.age[p];
          const heat = clamp(a / 32, 0, 1);
          const fg = a < 3 ? color.cyan2 : mixColor(color.green2, color.gold, heat * 0.75);
          const char = a < 2 ? glyph.mid : a < 8 ? glyph.dark : glyph.full;
          put(px, py, char, fg, bg);
        } else if (game.fade[p] > 0.04) {
          const t = clamp(game.fade[p], 0, 1);
          put(px, py, t > 0.5 ? glyph.light : glyph.dot, mixColor(color.dim, color.red, t), bg);
        } else if (hash01(x, y, 177) < 0.12 + cfg.density * 0.15) {
          put(px, py, glyph.dot, color.lineDim, bg);
        } else {
          put(px, py, " ", color.dim, bg);
        }
      }
    }

    for (let y = 0; y <= GRID_H; y += 5) {
      const gy = GRID_Y + y;
      if (gy < GRID_Y + GRID_H) writeText(GRID_X - 4, gy, String(y).padStart(2, "0"), color.dim);
    }
    for (let x = 0; x <= GRID_W; x += 11) {
      const gx = GRID_X + x;
      if (gx < GRID_X + GRID_W) writeText(gx - 1, GRID_Y + GRID_H + 1, String(x).padStart(2, "0"), color.dim);
    }

    if (state.mode === "human") {
      const cx = GRID_X + state.cursor.x;
      const cy = GRID_Y + state.cursor.y;
      put(cx, cy, state.game.grid[cellIndex(state.cursor.x, state.cursor.y)] ? glyph.cursor : glyph.square, color.gold, "#10202a");
    }
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const progress = effect.age / effect.life;
      const radius = effect.kind === "pulse" ? 1 + progress * 6 : 1 + progress * 3.5;
      const centerX = GRID_X + effect.x;
      const centerY = GRID_Y + effect.y;
      const fg =
        effect.tone === "red"
          ? mixColor(color.red, color.dim, progress)
          : effect.tone === "cyan"
            ? mixColor(color.cyan2, color.dim, progress)
            : mixColor(color.green2, color.dim, progress);
      const char = effect.kind === "death" ? "." : progress < 0.45 ? "*" : "+";
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - radius) > 0.48) continue;
          if (hash01(effect.x + dx, effect.y + dy, Math.floor(effect.age * 19)) < 0.18) continue;
          put(centerX + dx, centerY + dy, char, fg);
        }
      }
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line, color.panel);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "SIMULATION", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `GEN   ${String(game.generation).padStart(6, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `ALIVE ${String(game.alive).padStart(6, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `BIRTH ${String(game.births).padStart(6, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `DEATH ${String(game.deaths).padStart(6, "0")}`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 10, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 11, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 12, state.paused ? "STATE PAUSED" : "STATE RUNNING", state.paused ? color.gold : color.green);

    const density = game.alive / (GRID_W * GRID_H);
    writeText(RIGHT.x + 2, RIGHT.y + 16, "DENSITY", color.header);
    drawBar(RIGHT.x + 2, RIGHT.y + 18, 20, clamp(density / 0.5, 0, 1), color.green, `${Math.round(density * 100)}%`);
    writeText(RIGHT.x + 2, RIGHT.y + 21, "STABILITY", color.header);
    drawBar(RIGHT.x + 2, RIGHT.y + 23, 20, clamp(game.stableTicks / 24, 0, 1), game.stableTicks > 16 ? color.red : color.gold);

    writeText(RIGHT.x + 2, RIGHT.y + 27, "RULE", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 29, ">BIRTH IF NEIGHBORS = 3", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 30, ">SURVIVE IF 2 OR 3", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 31, ">OTHERWISE FADE OUT", color.muted);

    writeText(RIGHT.x + 2, RIGHT.y + 35, "LOG", color.header);
    const tones = { red: color.red, green: color.green, cyan: color.cyan, gold: color.gold, info: color.muted };
    for (let i = 0; i < 11; i += 1) {
      const item = state.eventLog[i];
      if (!item) break;
      writeText(RIGHT.x + 2, RIGHT.y + 37 + i, `>${item.message}`.slice(0, RIGHT.w - 4), tones[item.tone] || color.muted);
    }
  }

  function drawFooter() {
    writeText(
      FIELD.x,
      ROWS - 4,
      "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE    SPACE TOGGLE    N STEP    P PAUSE    R REROLL    Z HOME",
      color.muted,
    );
  }

  function composeScreen() {
    drawBackground();
    drawGrid();
    drawEffects();
    drawHud();
    drawFooter();
  }

  function renderScreen() {
    canvas.width = COLS * CELL_W;
    canvas.height = ROWS * CELL_H;
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = "top";
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const p = idx(x, y);
        const bg = screen.bg[p] || color.ink;
        ctx.fillStyle = bg;
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        const char = screen.ch[p] || " ";
        if (char !== " ") {
          ctx.fillStyle = screen.fg[p] || color.text;
          ctx.fillText(char, x * CELL_W, y * CELL_H + 1);
        }
      }
    }
  }

  function update(dt) {
    if (!state.game) return;
    updateEffects(dt);
    if (state.paused) return;
    state.accumulator += dt * state.speed;
    const interval = config[state.difficulty].interval;
    let guard = 0;
    while (state.accumulator >= interval && guard < 6) {
      stepLife();
      state.accumulator -= interval;
      guard += 1;
    }
  }

  function frame(now) {
    const dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 0.016;
    state.lastFrame = now;
    update(dt);
    composeScreen();
    renderScreen();
    requestAnimationFrame(frame);
  }

  function setSpeed(value) {
    state.speed = value;
    addLog(`SPEED ${value.toFixed(1)}X`, "cyan");
  }

  function moveCursor(dx, dy) {
    state.cursor.x = clamp(state.cursor.x + dx, 0, GRID_W - 1);
    state.cursor.y = clamp(state.cursor.y + dy, 0, GRID_H - 1);
  }

  function canvasToCell(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const tx = ((event.clientX - rect.left) * sx) / CELL_W;
    const ty = ((event.clientY - rect.top) * sy) / CELL_H;
    const x = Math.floor(tx - GRID_X);
    const y = Math.floor(ty - GRID_Y);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value);
  });

  seedInput.addEventListener("input", updateSeedStatus);

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    updateSeedStatus();
  });

  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed || randomSeed());
    seedInput.value = seed;
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED 100";
    } catch {
      seedStatus.value = "COPY FAILED";
    }
  });

  playModeSelect.addEventListener("change", () => {
    initGame(state.seed);
  });

  difficultySelect.addEventListener("change", () => {
    initGame(state.seed);
  });

  window.addEventListener("keydown", (event) => {
    if (event.target === seedInput) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "1") setSpeed(0.5);
    else if (key === "2") setSpeed(1);
    else if (key === "3") setSpeed(2);
    else if (key === "4") setSpeed(4);
    else if (key === "p") {
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSE" : "RESUME", state.paused ? "gold" : "green");
    } else if (key === "r") {
      seedInput.value = randomSeed();
      initGame(seedInput.value);
    } else if (key === "z") {
      window.location.href = "../index.html";
    } else if (key === "n") {
      stepLife();
      addLog("SINGLE STEP", "cyan");
    } else if (key === " " || key === "enter") {
      event.preventDefault();
      state.paused = true;
      state.mode = "human";
      playModeSelect.value = "human";
      toggleCell(state.cursor.x, state.cursor.y);
    } else if (key === "arrowleft" || key === "a") moveCursor(-1, 0);
    else if (key === "arrowright" || key === "d") moveCursor(1, 0);
    else if (key === "arrowup" || key === "w") moveCursor(0, -1);
    else if (key === "arrowdown" || key === "s") moveCursor(0, 1);
  });

  canvas.addEventListener("pointerdown", (event) => {
    const cell = canvasToCell(event);
    if (!cell) return;
    state.pointerDown = true;
    state.paused = true;
    state.mode = "human";
    playModeSelect.value = "human";
    state.cursor = cell;
    toggleCell(cell.x, cell.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.pointerDown) return;
    const cell = canvasToCell(event);
    if (!cell) return;
    state.cursor = cell;
    toggleCell(cell.x, cell.y, true);
  });

  window.addEventListener("pointerup", () => {
    state.pointerDown = false;
  });

  initGame(randomSeed());
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
})();
