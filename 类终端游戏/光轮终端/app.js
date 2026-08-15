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
  const FIELD = { x: 4, y: 5, w: 98, h: 46 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const GRID_W = 43;
  const GRID_H = 27;
  const GRID_X = FIELD.x + 3;
  const GRID_Y = FIELD.y + 7;
  const CELL_X = 2;
  const CELL_Y = 1;
  const DIRS = [
    { x: 0, y: -1, name: "UP", glyph: "▲" },
    { x: 1, y: 0, name: "RIGHT", glyph: "►" },
    { x: 0, y: 1, name: "DOWN", glyph: "▼" },
    { x: -1, y: 0, name: "LEFT", glyph: "◄" },
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    line: "#2a3548",
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
    white: "#f2ffff",
    purple: "#c084fc",
  };

  const difficultyConfig = {
    normal: { tick: 0.085, bikes: 4, turnBias: 0.18 },
    fast: { tick: 0.082, bikes: 4, turnBias: 0.22 },
    chaos: { tick: 0.064, bikes: 5, turnBias: 0.28 },
  };

  const screen = { ch: Array(COLS * ROWS), fg: Array(COLS * ROWS), bg: Array(COLS * ROWS) };
  const state = {
    seed: "",
    seedHash: 0,
    rng: null,
    mode: "demo",
    difficulty: "normal",
    speed: 1,
    paused: false,
    inputDir: null,
    game: null,
    trails: [],
    effects: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
  };

  function idx(x, y) { return y * COLS + x; }
  function gridIdx(x, y) { return y * GRID_W + x; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    return `#${Math.round(lerp(ar, br, t)).toString(16).padStart(2, "0")}${Math.round(lerp(ag, bg, t)).toString(16).padStart(2, "0")}${Math.round(lerp(ab, bb, t)).toString(16).padStart(2, "0")}`;
  }
  function sanitizeSeed(value) {
    return Array.from(value || "").map((char) => {
      const code = char.charCodeAt(0);
      return code >= ASCII_FIRST && code <= ASCII_LAST ? char : "?";
    }).join("").slice(0, SEED_LENGTH).padEnd(SEED_LENGTH, " ");
  }
  function randomSeed() {
    let seed = "";
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(SEED_LENGTH);
      window.crypto.getRandomValues(bytes);
      for (const byte of bytes) seed += RANDOM_SEED_CHARS[byte % RANDOM_SEED_CHARS.length];
      return seed;
    }
    for (let i = 0; i < SEED_LENGTH; i += 1) seed += RANDOM_SEED_CHARS[Math.floor(Math.random() * RANDOM_SEED_CHARS.length)];
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
  function updateSeedStatus() { seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`; }
  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 44);
  }

  function screenOf(x, y) {
    return { x: GRID_X + x * CELL_X, y: GRID_Y + y * CELL_Y };
  }
  function inGrid(x, y) {
    return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  }
  function occupied(x, y) {
    if (!inGrid(x, y)) return true;
    return state.game.grid[gridIdx(x, y)] !== null;
  }
  function leftOf(dir) { return DIRS[(DIRS.indexOf(dir) + 3) % 4]; }
  function rightOf(dir) { return DIRS[(DIRS.indexOf(dir) + 1) % 4]; }
  function opposite(a, b) { return a.x + b.x === 0 && a.y + b.y === 0; }

  function createBike(id, name, x, y, dir, fg, glyph) {
    return { id, name, x, y, dir, fg, glyph, alive: true, score: 0, distance: 0 };
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const bikes = [
      createBike(0, "WHITE", 12, Math.floor(GRID_H / 2), DIRS[1], color.white, "◈"),
      createBike(1, "CYAN", GRID_W - 13, Math.floor(GRID_H / 2), DIRS[3], color.cyan, "◆"),
      createBike(2, "GOLD", Math.floor(GRID_W / 2), 8, DIRS[2], color.gold, "●"),
      createBike(3, "RED", Math.floor(GRID_W / 2), GRID_H - 9, DIRS[0], color.red, "■"),
      createBike(4, "VIOLET", 9, 7, DIRS[1], color.purple, "▲"),
    ].slice(0, difficultyConfig[state.difficulty].bikes);
    state.game = {
      elapsed: 0,
      tick: 0,
      round: 1,
      status: "LIVE",
      grid: Array(GRID_W * GRID_H).fill(null),
      bikes,
    };
    for (const bike of bikes) state.game.grid[gridIdx(bike.x, bike.y)] = bike.id;
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    state.inputDir = null;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "LIGHT CYCLES ARMED", "info");
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(COLS * CELL_W * dpr);
    canvas.height = Math.floor(ROWS * CELL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.imageSmoothingEnabled = false;
  }
  function clearScreen() { screen.ch.fill(" "); screen.fg.fill(color.text); screen.bg.fill(color.ink); }
  function setCell(x, y, ch, fg = color.text, bg = null) {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) return;
    const id = idx(ix, iy);
    screen.ch[id] = ch;
    screen.fg[id] = fg;
    if (bg) screen.bg[id] = bg;
  }
  function writeText(x, y, text, fg = color.text, bg = null) { Array.from(text).forEach((ch, i) => setCell(x + i, y, ch, fg, bg)); }
  function drawBox(x, y, w, h, fg = color.line) {
    for (let ix = x + 1; ix < x + w - 1; ix += 1) { setCell(ix, y, "─", fg); setCell(ix, y + h - 1, "─", fg); }
    for (let iy = y + 1; iy < y + h - 1; iy += 1) { setCell(x, iy, "│", fg); setCell(x + w - 1, iy, "│", fg); }
    setCell(x, y, "┌", fg); setCell(x + w - 1, y, "┐", fg); setCell(x, y + h - 1, "└", fg); setCell(x + w - 1, y + h - 1, "┘", fg);
  }
  function addBurst(x, y, baseColor, count = 20, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.5;
      const speed = (8 + state.rng() * 25) * power;
      state.effects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.75, start: now, duration: 420 + state.rng() * 350, color: baseColor, glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)] });
    }
  }
  function addTrail(x, y, glyph, baseColor, duration = 260) {
    if (reducedMotion) return;
    state.trails.push({ x, y, glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-420);
  }

  function clearance(x, y, dir, limit = 18) {
    let score = 0;
    let cx = x;
    let cy = y;
    for (let i = 0; i < limit; i += 1) {
      cx += dir.x;
      cy += dir.y;
      if (occupied(cx, cy)) break;
      score += 1;
      const left = leftOf(dir);
      const right = rightOf(dir);
      if (!occupied(cx + left.x, cy + left.y)) score += 0.28;
      if (!occupied(cx + right.x, cy + right.y)) score += 0.28;
    }
    return score;
  }

  function chooseDir(bike) {
    if (bike.id === 0 && state.mode === "human" && state.inputDir && !opposite(bike.dir, state.inputDir)) {
      return state.inputDir;
    }
    const choices = [bike.dir, leftOf(bike.dir), rightOf(bike.dir)];
    return choices
      .map((dir) => {
        const nx = bike.x + dir.x;
        const ny = bike.y + dir.y;
        let score = occupied(nx, ny) ? -999 : clearance(bike.x, bike.y, dir);
        const nearest = state.game.bikes
          .filter((other) => other.alive && other.id !== bike.id)
          .map((other) => Math.abs(other.x - nx) + Math.abs(other.y - ny))
          .sort((a, b) => a - b)[0];
        if (nearest != null) score += nearest < 5 ? 5 - nearest : 0;
        score += (state.rng() - 0.5) * difficultyConfig[state.difficulty].turnBias * 12;
        return { dir, score };
      })
      .sort((a, b) => b.score - a.score)[0].dir;
  }

  function crash(bike) {
    if (!bike.alive) return;
    bike.alive = false;
    const p = screenOf(bike.x, bike.y);
    addBurst(p.x, p.y, bike.fg, 48, 1.2);
    addLog(`${bike.name} CRASH`, "hit");
  }

  function stepGame() {
    const game = state.game;
    const moves = [];
    for (const bike of game.bikes) {
      if (!bike.alive) continue;
      bike.dir = chooseDir(bike);
      moves.push({ bike, x: bike.x + bike.dir.x, y: bike.y + bike.dir.y });
    }
    const targetCounts = new Map();
    for (const move of moves) {
      const key = `${move.x},${move.y}`;
      targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
    }
    for (const move of moves) {
      const bike = move.bike;
      const key = `${move.x},${move.y}`;
      if (occupied(move.x, move.y) || targetCounts.get(key) > 1) {
        crash(bike);
        continue;
      }
      const old = screenOf(bike.x, bike.y);
      bike.x = move.x;
      bike.y = move.y;
      bike.distance += 1;
      game.grid[gridIdx(bike.x, bike.y)] = bike.id;
      addTrail(old.x, old.y, bike.dir.x ? "═" : "║", bike.fg, 320);
    }
    const alive = game.bikes.filter((bike) => bike.alive);
    if (alive.length <= 1 && game.status === "LIVE") {
      if (alive[0]) {
        alive[0].score += 1;
        game.status = `${alive[0].name} WINS`;
        addLog(game.status, "ok");
      } else {
        game.status = "GRID DRAW";
        addLog("GRID DRAW", "hit");
      }
    }
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    game.tick += dt;
    const tickTime = difficultyConfig[state.difficulty].tick;
    while (game.tick >= tickTime && game.status === "LIVE") {
      game.tick -= tickTime;
      stepGame();
    }
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 601);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.972) setCell(x, y, "·", color.dim);
      }
    }
  }
  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    writeText(FIELD.x + 2, FIELD.y - 2, "LIGHT CYCLE GRID", color.header);
    writeText(FIELD.x + 70, FIELD.y - 2, "NEON WALLS", color.gold);
    drawBox(GRID_X - 2, GRID_Y - 1, GRID_W * CELL_X + 4, GRID_H + 2, color.line);
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = screenOf(x, y);
        screen.bg[idx(p.x, p.y)] = "#071018";
        screen.bg[idx(p.x + 1, p.y)] = "#071018";
        if (hash01(x, y, 617) > 0.82) {
          setCell(p.x, p.y, "·", "#203044");
          setCell(p.x + 1, p.y, "·", "#15283a");
        }
      }
    }
  }
  function drawGrid() {
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const id = state.game.grid[gridIdx(x, y)];
        if (id == null) continue;
        const bike = state.game.bikes[id];
        const p = screenOf(x, y);
        setCell(p.x, p.y, "█", bike.fg);
        setCell(p.x + 1, p.y, "█", mixColor(bike.fg, color.ink, 0.08));
        if (y > 0 && hash01(x, y, 701 + id) > 0.6) setCell(p.x, p.y - 1, "▀", mixColor(bike.fg, color.ink, 0.36));
        if (y < GRID_H - 1 && hash01(x, y, 719 + id) > 0.6) setCell(p.x, p.y + 1, "▄", mixColor(bike.fg, color.ink, 0.42));
      }
    }
    for (const bike of state.game.bikes) {
      const p = screenOf(bike.x, bike.y);
      if (!bike.alive) {
        setCell(p.x, p.y, "×", color.red);
        continue;
      }
      setCell(p.x - bike.dir.x, p.y - bike.dir.y, "▓", mixColor(bike.fg, color.ink, 0.22));
      setCell(p.x, p.y, bike.dir.glyph, bike.fg);
      setCell(p.x + 1, p.y, bike.glyph, bike.fg);
      setCell(p.x + bike.dir.x + 1, p.y + bike.dir.y, "⠿", mixColor(bike.fg, color.ink, 0.1));
    }
  }
  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      setCell(trail.x, trail.y, trail.glyph, mixColor(trail.color, color.ink, t));
    }
  }
  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      setCell(fx.x + fx.vx * t * 0.04, fx.y + fx.vy * t * 0.04, fx.glyph, mixColor(fx.color, color.ink, t));
    }
  }
  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "GRID", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `ROUND ${String(game.round).padStart(2, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `LIVE  ${String(game.bikes.filter((b) => b.alive).length).padStart(2, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 9, game.status, game.status === "LIVE" ? color.cyan : color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 12, "RIDERS", color.header);
    game.bikes.forEach((bike, i) => {
      writeText(RIGHT.x + 2, RIGHT.y + 14 + i, `${bike.name.padEnd(6)} ${bike.alive ? "ON " : "OUT"} ${String(bike.distance).padStart(3, "0")}`, bike.alive ? bike.fg : color.dim);
    });
    writeText(RIGHT.x + 2, RIGHT.y + 21, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 20).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 23 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   WASD/ARROWS TURN   P PAUSE   R REROLL   L HOME", color.muted);
  }
  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawGrid();
    drawEffects(now);
    if (state.paused) writeText(FIELD.x + 42, FIELD.y + 22, "PAUSED", color.green);
    if (state.game.status !== "LIVE") writeText(FIELD.x + 34, FIELD.y + 22, `${state.game.status} - R RESTART`, color.gold);
    drawHud();
    renderScreen();
  }
  function renderScreen() {
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const id = idx(x, y);
        ctx.fillStyle = screen.bg[id] || color.ink;
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        const ch = screen.ch[id];
        if (ch && ch !== " ") {
          ctx.fillStyle = screen.fg[id] || color.text;
          ctx.fillText(ch, x * CELL_W, y * CELL_H + 1);
        }
      }
    }
  }
  function frame(now) {
    const dt = clamp((now - (state.lastFrame || now)) / 1000, 0, 0.05) * state.speed;
    state.lastFrame = now;
    update(dt);
    draw(now);
    requestAnimationFrame(frame);
  }
  function setSpeed(key) {
    const speeds = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (!speeds[key]) return false;
    state.speed = speeds[key];
    addLog(`SPEED ${state.speed}X`, "ok");
    return true;
  }
  function goHome() { window.location.href = "../index.html"; }
  function setInputDir(dir) {
    const bike = state.game?.bikes[0];
    if (!bike || opposite(bike.dir, dir)) return;
    state.inputDir = dir;
  }
  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) { event.preventDefault(); return; }
    if (key === "l") { event.preventDefault(); goHome(); return; }
    if (key === "p") { event.preventDefault(); state.paused = !state.paused; addLog(state.paused ? "PAUSED" : "RESUMED", "info"); return; }
    if (key === "r") { event.preventDefault(); initGame(randomSeed(), { reroll: true }); return; }
    if (key === "w" || event.key === "ArrowUp") setInputDir(DIRS[0]);
    if (key === "d" || event.key === "ArrowRight") setInputDir(DIRS[1]);
    if (key === "s" || event.key === "ArrowDown") setInputDir(DIRS[2]);
    if (key === "a" || event.key === "ArrowLeft") setInputDir(DIRS[3]);
    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  });
  seedInput.addEventListener("input", updateSeedStatus);
  seedRandomButton.addEventListener("click", () => { seedInput.value = randomSeed().trimEnd(); updateSeedStatus(); });
  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed);
    seedInput.value = seed.trimEnd();
    updateSeedStatus();
    try { await navigator.clipboard.writeText(seed); seedStatus.value = "COPIED"; } catch { seedStatus.value = "COPY FAIL"; }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); initGame(seedInput.value || randomSeed()); });
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
