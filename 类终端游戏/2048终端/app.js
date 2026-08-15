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
  const BOARD_SIZE = 4;
  const TILE_W = 18;
  const TILE_H = 8;
  const GAP = 2;
  const BOARD_X = FIELD.x + 10;
  const BOARD_Y = FIELD.y + 6;
  const MOVE_TIME = 0.18;

  const glyph = {
    full: String.fromCharCode(0x2588),
    dark: String.fromCharCode(0x2593),
    mid: String.fromCharCode(0x2592),
    light: String.fromCharCode(0x2591),
    dot: String.fromCharCode(0x00b7),
  };

  const color = {
    ink: "#06080d",
    ink2: "#080d13",
    panel: "#080c12",
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
    red2: "#ff7b6f",
    blue: "#72a7ff",
    purple: "#b58cff",
    pink: "#ff78d4",
    boardA: "#071017",
    boardB: "#08131b",
  };

  const configs = {
    normal: { aiDelay: 0.42, greedy: 0.78, spawn4: 0.1 },
    fast: { aiDelay: 0.24, greedy: 0.84, spawn4: 0.12 },
    chaos: { aiDelay: 0.14, greedy: 0.66, spawn4: 0.18 },
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
    logs: [],
    lastFrame: 0,
  };

  const dirs = {
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
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

  function put(x, y, char = " ", fg = color.text, bg = null) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const p = idx(x, y);
    screen.ch[p] = char;
    screen.fg[p] = fg;
    if (bg !== null) screen.bg[p] = bg;
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

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.text;
      screen.bg[i] = color.ink;
    }
  }

  function addLog(message, tone = "info") {
    state.logs.unshift({ message, tone });
    state.logs = state.logs.slice(0, 48);
  }

  function addEffect(x, y, tone, kind = "burst", text = "") {
    if (state.effects.length > 180) state.effects.splice(0, state.effects.length - 180);
    state.effects.push({ x, y, tone, kind, text, age: 0, life: kind === "text" ? 0.78 : 0.48 });
  }

  function emptyCells(cells = state.game.cells) {
    const out = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (!cells[y][x]) out.push({ x, y });
      }
    }
    return out;
  }

  function tileCenter(x, y) {
    return {
      x: BOARD_X + x * (TILE_W + GAP) + Math.floor(TILE_W / 2),
      y: BOARD_Y + y * (TILE_H + GAP) + Math.floor(TILE_H / 2),
    };
  }

  function makeTile(value, x, y) {
    return {
      id: state.game.nextId++,
      value,
      x,
      y,
      fromX: x,
      fromY: y,
      moveAge: MOVE_TIME,
      spawnAge: 0,
      mergeAge: 0,
      alive: true,
    };
  }

  function addRandomTile() {
    const game = state.game;
    const free = emptyCells(game.cells);
    if (!free.length) return false;
    const pick = free[Math.floor(state.rng() * free.length)];
    const value = state.rng() < configs[state.difficulty].spawn4 ? 4 : 2;
    const tile = makeTile(value, pick.x, pick.y);
    game.tiles.push(tile);
    game.cells[pick.y][pick.x] = tile;
    const center = tileCenter(pick.x, pick.y);
    addEffect(center.x, center.y, color.green2, "spawn", String(value));
    return true;
  }

  function makeCells() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }

  function initGame(seed = state.seed) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash ^ 0x20482048);
    state.mode = playModeSelect.value;
    state.difficulty = difficultySelect.value;
    state.speed = 1;
    state.paused = false;
    state.effects = [];
    state.logs = [];
    state.game = {
      cells: makeCells(),
      tiles: [],
      nextId: 1,
      score: 0,
      best: 0,
      moves: 0,
      merges: 0,
      maxTile: 0,
      status: "RUNNING",
      aiTimer: 0.25,
      lastMove: "NONE",
    };
    addRandomTile();
    addRandomTile();
    updateStats();
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog("2048 GRID ONLINE", "green");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "cyan");
  }

  function traversal(direction) {
    const lines = [];
    if (direction === "left" || direction === "right") {
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        const line = [];
        const xs = direction === "left" ? [0, 1, 2, 3] : [3, 2, 1, 0];
        for (const x of xs) line.push({ x, y });
        lines.push(line);
      }
    } else {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const line = [];
        const ys = direction === "up" ? [0, 1, 2, 3] : [3, 2, 1, 0];
        for (const y of ys) line.push({ x, y });
        lines.push(line);
      }
    }
    return lines;
  }

  function updateStats() {
    const game = state.game;
    game.maxTile = 0;
    for (const tile of game.tiles) {
      if (tile.alive) game.maxTile = Math.max(game.maxTile, tile.value);
    }
    game.best = Math.max(game.best, game.score);
  }

  function move(direction, dryRun = false, sourceCells = null) {
    const cells = sourceCells ? sourceCells.map((row) => row.slice()) : state.game.cells;
    const lines = traversal(direction);
    let changed = false;
    let gained = 0;
    let merges = 0;
    const newCells = makeCells();
    const dead = [];
    for (const line of lines) {
      const tiles = line.map((pos) => cells[pos.y][pos.x]).filter(Boolean);
      const out = [];
      for (const tile of tiles) {
        const last = out[out.length - 1];
        if (last && last.value === tile.value && !last.justMerged) {
          last.justMerged = true;
          if (!dryRun) {
            tile.fromX = tile.x;
            tile.fromY = tile.y;
            tile.x = last.x;
            tile.y = last.y;
            tile.alive = false;
            dead.push(tile);
            last.value *= 2;
            last.mergeAge = 0;
            gained += last.value;
            merges += 1;
            const center = tileCenter(last.x, last.y);
            addEffect(center.x, center.y, tileTone(last.value), "merge", String(last.value));
          } else {
            last.value *= 2;
            gained += last.value;
            merges += 1;
          }
          changed = true;
        } else {
          const target = line[out.length];
          if (!dryRun) {
            tile.fromX = tile.x;
            tile.fromY = tile.y;
            tile.x = target.x;
            tile.y = target.y;
            tile.moveAge = 0;
            tile.justMerged = false;
          } else {
            tile.x = target.x;
            tile.y = target.y;
          }
          if (tile.fromX !== target.x || tile.fromY !== target.y) changed = true;
          out.push(tile);
        }
      }
      for (const tile of out) {
        newCells[tile.y][tile.x] = tile;
        tile.justMerged = false;
      }
    }
    if (dryRun) return { changed, gained, merges, cells: newCells };
    if (!changed) return false;
    state.game.cells = newCells;
    state.game.tiles = state.game.tiles.filter((tile) => tile.alive && !dead.includes(tile));
    state.game.score += gained;
    state.game.moves += 1;
    state.game.merges += merges;
    state.game.lastMove = direction.toUpperCase();
    if (gained) addLog(`${direction.toUpperCase()} +${gained}`, "gold");
    else addLog(direction.toUpperCase(), "cyan");
    addRandomTile();
    updateStats();
    if (state.game.maxTile >= 2048 && state.game.status === "RUNNING") {
      state.game.status = "2048";
      addLog("2048 REACHED", "gold");
    }
    if (!canMove()) {
      state.game.status = "LOCKED";
      state.paused = true;
      addLog("NO MOVES", "red");
    }
    return true;
  }

  function cloneNumericCells() {
    return state.game.cells.map((row) => row.map((tile) => (tile ? { value: tile.value, x: tile.x, y: tile.y } : null)));
  }

  function numericMove(direction, values) {
    const fake = values.map((row, y) => row.map((value, x) => (value ? { value, x, y, fromX: x, fromY: y } : null)));
    const result = move(direction, true, fake);
    return {
      changed: result.changed,
      gained: result.gained,
      merges: result.merges,
      values: result.cells.map((row) => row.map((tile) => (tile ? tile.value : 0))),
    };
  }

  function currentValues() {
    return state.game.cells.map((row) => row.map((tile) => (tile ? tile.value : 0)));
  }

  function canMove() {
    const values = currentValues();
    if (values.some((row) => row.some((value) => value === 0))) return true;
    for (const dir of Object.keys(dirs)) {
      if (numericMove(dir, values).changed) return true;
    }
    return false;
  }

  function evaluateGrid(values, gained = 0, merges = 0) {
    let empty = 0;
    let max = 0;
    let smooth = 0;
    let corner = 0;
    const weights = [
      [65536, 32768, 16384, 8192],
      [512, 1024, 2048, 4096],
      [256, 128, 64, 32],
      [2, 4, 8, 16],
    ];
    let weighted = 0;
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const v = values[y][x];
        if (!v) {
          empty += 1;
          continue;
        }
        max = Math.max(max, v);
        weighted += Math.log2(v) * weights[y][x];
        if ((x === 0 && y === 0) || (x === 3 && y === 3)) corner = Math.max(corner, v);
        if (x < 3 && values[y][x + 1]) smooth -= Math.abs(Math.log2(v) - Math.log2(values[y][x + 1]));
        if (y < 3 && values[y + 1][x]) smooth -= Math.abs(Math.log2(v) - Math.log2(values[y + 1][x]));
      }
    }
    return gained * 2.5 + merges * 80 + empty * 520 + weighted * 0.003 + corner * 0.8 + max * 0.4 + smooth * 35;
  }

  function chooseAIMove() {
    const values = currentValues();
    const options = Object.keys(dirs)
      .map((dir) => {
        const result = numericMove(dir, values);
        const score = result.changed ? evaluateGrid(result.values, result.gained, result.merges) : -Infinity;
        return { dir, score };
      })
      .filter((item) => item.score > -Infinity)
      .sort((a, b) => b.score - a.score);
    if (!options.length) return null;
    if (state.rng() > configs[state.difficulty].greedy && options[1]) return options[1].dir;
    return options[0].dir;
  }

  function update(dt) {
    const game = state.game;
    for (const tile of game.tiles) {
      tile.moveAge = Math.min(MOVE_TIME, tile.moveAge + dt * state.speed);
      tile.spawnAge = Math.min(0.4, tile.spawnAge + dt * state.speed);
      tile.mergeAge = Math.min(0.5, tile.mergeAge + dt * state.speed);
    }
    for (const effect of state.effects) effect.age += dt * state.speed;
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
    if (state.paused || game.status === "LOCKED") return;
    if (state.mode === "demo") {
      game.aiTimer -= dt * state.speed;
      if (game.aiTimer <= 0) {
        const dir = chooseAIMove();
        if (dir) move(dir);
        game.aiTimer = configs[state.difficulty].aiDelay;
      }
    }
  }

  function tileTone(value) {
    const tones = {
      2: color.cyan,
      4: color.cyan2,
      8: color.green,
      16: color.green2,
      32: color.gold,
      64: color.orange,
      128: color.red2,
      256: color.pink,
      512: color.purple,
      1024: color.blue,
      2048: color.header,
    };
    return tones[value] || color.header;
  }

  function drawBackground() {
    clearScreen();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const band = Math.floor(y / 5) % 2 === 0 ? color.ink : "#05090f";
        const bg = hash01(x, y, 99) > 0.92 ? color.ink2 : band;
        screen.bg[idx(x, y)] = bg;
        if (hash01(x, y, 21) > 0.985) put(x, y, hash01(x, y, 22) > 0.65 ? glyph.dot : ":", color.lineDim, bg);
      }
    }
  }

  function drawBoard() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line, color.panel);
    writeText(FIELD.x + 2, FIELD.y - 2, "2048 MERGE TERMINAL", color.header);
    writeText(FIELD.x + FIELD.w - 26, FIELD.y - 2, "SLIDE / MERGE / FLASH", color.green);
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const px = BOARD_X + x * (TILE_W + GAP);
        const py = BOARD_Y + y * (TILE_H + GAP);
        const bg = (x + y) % 2 ? color.boardA : color.boardB;
        fillRectChars(px, py, TILE_W, TILE_H, glyph.dot, color.lineDim, bg);
        drawMiniBox(px, py, TILE_W, TILE_H, color.lineDim, bg);
      }
    }
    for (const tile of state.game.tiles) drawTile(tile);
  }

  function drawMiniBox(x, y, w, h, fg, bg) {
    for (let xx = x; xx < x + w; xx += 1) {
      put(xx, y, "-", fg, bg);
      put(xx, y + h - 1, "-", fg, bg);
    }
    for (let yy = y; yy < y + h; yy += 1) {
      put(x, yy, "|", fg, bg);
      put(x + w - 1, yy, "|", fg, bg);
    }
    put(x, y, "+", fg, bg);
    put(x + w - 1, y, "+", fg, bg);
    put(x, y + h - 1, "+", fg, bg);
    put(x + w - 1, y + h - 1, "+", fg, bg);
  }

  function drawTile(tile) {
    const moveT = clamp(tile.moveAge / MOVE_TIME, 0, 1);
    const sx = lerp(tile.fromX, tile.x, moveT);
    const sy = lerp(tile.fromY, tile.y, moveT);
    const px = Math.round(BOARD_X + sx * (TILE_W + GAP));
    const py = Math.round(BOARD_Y + sy * (TILE_H + GAP));
    const tone = tileTone(tile.value);
    const merge = tile.mergeAge < 0.32 ? 1 - tile.mergeAge / 0.32 : 0;
    const spawn = tile.spawnAge < 0.25 ? 1 - tile.spawnAge / 0.25 : 0;
    const bg = mixColor("#0d121a", tone, clamp(0.18 + Math.log2(tile.value) * 0.028, 0.18, 0.55));
    const fg = merge > 0 ? color.header : tone;
    const fill = tile.value >= 128 ? glyph.full : tile.value >= 16 ? glyph.dark : glyph.mid;
    fillRectChars(px, py, TILE_W, TILE_H, fill, mixColor(color.line, fg, 0.6), bg);
    drawMiniBox(px, py, TILE_W, TILE_H, merge > 0 ? color.header : fg, bg);
    if (spawn > 0) {
      put(px + 1, py + 1, "*", color.green2);
      put(px + TILE_W - 2, py + TILE_H - 2, "*", color.green2);
    }
    const text = String(tile.value);
    const tx = px + Math.floor((TILE_W - text.length) / 2);
    const ty = py + Math.floor(TILE_H / 2);
    writeText(tx, ty, text, color.ink, fg);
    if (tile.value >= 1024) {
      writeText(px + 2, py + 1, "POWER", color.header);
    }
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const t = effect.age / effect.life;
      const fg = mixColor(effect.tone, color.dim, t);
      if (effect.kind === "text") {
        writeText(Math.round(effect.x), Math.round(effect.y - t * 4), effect.text.slice(0, 6), fg);
        continue;
      }
      const r = 1 + t * 6;
      const rr = Math.ceil(r);
      for (let dy = -rr; dy <= rr; dy += 1) {
        for (let dx = -rr; dx <= rr; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - r) > 0.45) continue;
          if (hash01(Math.round(effect.x) + dx, Math.round(effect.y) + dy, Math.floor(effect.age * 29)) < 0.16) continue;
          put(Math.round(effect.x) + dx, Math.round(effect.y) + dy, t < 0.5 ? "*" : ".", fg);
        }
      }
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line, color.panel);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "SESSION", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `SCORE   ${String(game.score).padStart(7, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `BEST    ${String(game.best).padStart(7, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `MAX     ${String(game.maxTile).padStart(7, "0")}`, tileTone(game.maxTile));
    writeText(RIGHT.x + 2, RIGHT.y + 8, `MOVES   ${String(game.moves).padStart(7, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `MERGES  ${String(game.merges).padStart(7, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 11, `MODE    ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 12, `SPD     ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 13, `STATE   ${game.status}`, game.status === "RUNNING" ? color.green : game.status === "2048" ? color.gold : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `LAST    ${game.lastMove}`, color.muted);

    writeText(RIGHT.x + 2, RIGHT.y + 19, "TILES", color.header);
    const counts = {};
    for (const tile of game.tiles) counts[tile.value] = (counts[tile.value] || 0) + 1;
    Object.keys(counts)
      .map(Number)
      .sort((a, b) => b - a)
      .slice(0, 8)
      .forEach((value, i) => {
        writeText(RIGHT.x + 2, RIGHT.y + 21 + i, `${String(value).padStart(5, " ")} x ${counts[value]}`, tileTone(value));
      });

    writeText(RIGHT.x + 2, RIGHT.y + 32, "AI", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 34, ">HEURISTIC: EMPTY+CORNER", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 35, ">MERGE VALUE PRIORITY", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 36, ">SEEDED SPAWN STREAM", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 40, "LOG", color.header);
    const tones = { red: color.red, green: color.green, cyan: color.cyan, gold: color.gold, info: color.muted };
    for (let i = 0; i < 11; i += 1) {
      const item = state.logs[i];
      if (!item) break;
      writeText(RIGHT.x + 2, RIGHT.y + 42 + i, `>${item.message}`.slice(0, RIGHT.w - 4), tones[item.tone] || color.muted);
    }
  }

  function drawFooter() {
    writeText(
      FIELD.x,
      ROWS - 4,
      "1 0.5X   2 1X   3 2X   4 4X     WASD/ARROWS SLIDE     P PAUSE     R REROLL     ] HOME",
      color.muted,
    );
  }

  function composeScreen() {
    drawBackground();
    drawBoard();
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
        ctx.fillStyle = screen.bg[p] || color.ink;
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        const char = screen.ch[p] || " ";
        if (char !== " ") {
          ctx.fillStyle = screen.fg[p] || color.text;
          ctx.fillText(char, x * CELL_W, y * CELL_H + 1);
        }
      }
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

  function handleMove(dir) {
    if (state.game.status === "LOCKED") return;
    playModeSelect.value = "human";
    state.mode = "human";
    move(dir);
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

  playModeSelect.addEventListener("change", () => initGame(state.seed));
  difficultySelect.addEventListener("change", () => initGame(state.seed));

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
    } else if (key === "]") {
      window.location.href = "../index.html";
    } else if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      handleMove("left");
    } else if (key === "arrowright" || key === "d") {
      event.preventDefault();
      handleMove("right");
    } else if (key === "arrowup" || key === "w") {
      event.preventDefault();
      handleMove("up");
    } else if (key === "arrowdown" || key === "s") {
      event.preventDefault();
      handleMove("down");
    }
  });

  initGame(randomSeed());
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
})();
