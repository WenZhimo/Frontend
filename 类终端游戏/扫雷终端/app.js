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
  const BOARD = { x: FIELD.x + 6, y: FIELD.y + 5, w: 24, h: 16, cw: 3, ch: 2 };
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
    hidden: "#41506a",
    open: "#9fb1c6",
    flag: "#ff4d5f",
  };

  const difficultyConfig = {
    normal: { mines: 64, aiDelay: 0.08 },
    fast: { mines: 76, aiDelay: 0.055 },
    chaos: { mines: 92, aiDelay: 0.035 },
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
    game: null,
    effects: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
  };

  function idx(x, y) { return y * COLS + x; }
  function cellIdx(x, y) { return y * BOARD.w + x; }
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
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < BOARD.w && y < BOARD.h; }
  function neighbors(x, y) {
    const out = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (inBounds(nx, ny)) out.push({ x: nx, y: ny });
      }
    }
    return out;
  }
  function boardToScreen(x, y) { return { x: BOARD.x + x * BOARD.cw, y: BOARD.y + y * BOARD.ch }; }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const cells = Array.from({ length: BOARD.w * BOARD.h }, (_, i) => ({
      x: i % BOARD.w,
      y: Math.floor(i / BOARD.w),
      mine: false,
      open: false,
      flag: false,
      mark: false,
      n: 0,
    }));
    const safe = new Set();
    const sx = Math.floor(BOARD.w / 2), sy = Math.floor(BOARD.h / 2);
    neighbors(sx, sy).concat([{ x: sx, y: sy }]).forEach((c) => safe.add(cellIdx(c.x, c.y)));
    let placed = 0;
    while (placed < difficultyConfig[state.difficulty].mines) {
      const i = Math.floor(state.rng() * cells.length);
      if (safe.has(i) || cells[i].mine) continue;
      cells[i].mine = true;
      placed += 1;
    }
    for (const cell of cells) cell.n = neighbors(cell.x, cell.y).filter((n) => cells[cellIdx(n.x, n.y)].mine).length;
    state.game = {
      elapsed: 0,
      status: "LIVE",
      cells,
      cursor: { x: sx, y: sy },
      aiCd: 0.25,
      opened: 0,
      flags: 0,
      moves: 0,
    };
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "GRID ARMED", "info");
    reveal(sx, sy);
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
  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.42;
      const speed = (8 + state.rng() * 24) * power;
      state.effects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.75, start: now, duration: 430 + state.rng() * 330, color: baseColor, glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒", "░"][Math.floor(state.rng() * 7)] });
    }
  }

  function reveal(x, y) {
    const game = state.game;
    if (!game || game.status !== "LIVE" || !inBounds(x, y)) return false;
    const cell = game.cells[cellIdx(x, y)];
    if (cell.open || cell.flag) return false;
    cell.open = true;
    cell.mark = false;
    game.opened += 1;
    game.moves += 1;
    const p = boardToScreen(x, y);
    if (cell.mine) {
      game.status = "MINE HIT";
      addLog("MINE HIT", "hit");
      addBurst(p.x + 1, p.y, color.red, 70, 1.35);
      for (const c of game.cells) if (c.mine) c.open = true;
      return true;
    }
    addBurst(p.x + 1, p.y, cell.n ? color.cyan : color.green, cell.n ? 5 : 10, 0.32);
    if (cell.n === 0) {
      for (const n of neighbors(x, y)) {
        const other = game.cells[cellIdx(n.x, n.y)];
        if (!other.open && !other.flag) reveal(n.x, n.y);
      }
    }
    checkWin();
    return true;
  }

  function toggleFlag(x, y) {
    const game = state.game;
    if (!game || game.status !== "LIVE") return;
    const cell = game.cells[cellIdx(x, y)];
    if (cell.open) return;
    cell.flag = !cell.flag;
    game.flags += cell.flag ? 1 : -1;
    game.moves += 1;
    const p = boardToScreen(x, y);
    addBurst(p.x + 1, p.y, cell.flag ? color.flag : color.dim, 8, 0.38);
  }

  function checkWin() {
    const game = state.game;
    if (game.status !== "LIVE") return;
    const safeCount = game.cells.length - difficultyConfig[state.difficulty].mines;
    if (game.opened >= safeCount) {
      game.status = "FIELD CLEAR";
      addLog("FIELD CLEAR", "ok");
      for (const c of game.cells) {
        const p = boardToScreen(c.x, c.y);
        if (!c.mine) addBurst(p.x + 1, p.y, color.green, 3, 0.18);
      }
    }
  }

  function aiStep() {
    const game = state.game;
    game.cells.forEach((c) => (c.mark = false));
    for (const cell of game.cells.filter((c) => c.open && c.n > 0)) {
      const ns = neighbors(cell.x, cell.y).map((n) => game.cells[cellIdx(n.x, n.y)]);
      const hidden = ns.filter((c) => !c.open && !c.flag);
      const flags = ns.filter((c) => c.flag).length;
      if (hidden.length && cell.n - flags === hidden.length) {
        hidden.forEach((c) => {
          c.mark = true;
          if (!c.flag) toggleFlag(c.x, c.y);
        });
        return;
      }
      if (hidden.length && flags === cell.n) {
        const pick = hidden.sort((a, b) => risk(a) - risk(b))[0];
        if (pick) {
          pick.mark = true;
          reveal(pick.x, pick.y);
          return;
        }
      }
    }
    const hidden = game.cells.filter((c) => !c.open && !c.flag);
    if (!hidden.length) return;
    const pick = hidden.sort((a, b) => risk(a) - risk(b) || state.rng() - 0.5)[0];
    if (pick) {
      pick.mark = true;
      reveal(pick.x, pick.y);
    }
  }

  function risk(cell) {
    const game = state.game;
    let score = 0.18 + state.rng() * 0.04;
    const openNs = neighbors(cell.x, cell.y).map((n) => game.cells[cellIdx(n.x, n.y)]).filter((c) => c.open && c.n > 0);
    for (const open of openNs) {
      const ns = neighbors(open.x, open.y).map((n) => game.cells[cellIdx(n.x, n.y)]);
      const hidden = ns.filter((c) => !c.open && !c.flag).length || 1;
      const flags = ns.filter((c) => c.flag).length;
      score = Math.max(score, (open.n - flags) / hidden);
    }
    return score;
  }

  function moveCursor(dx, dy) {
    const game = state.game;
    game.cursor.x = clamp(game.cursor.x + dx, 0, BOARD.w - 1);
    game.cursor.y = clamp(game.cursor.y + dy, 0, BOARD.h - 1);
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    if (state.mode === "demo") {
      game.aiCd -= dt;
      if (game.aiCd <= 0) {
        aiStep();
        game.aiCd = difficultyConfig[state.difficulty].aiDelay;
      }
    }
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 801);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.972) setCell(x, y, "·", color.dim);
      }
    }
  }
  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    writeText(FIELD.x + 2, FIELD.y - 2, "MINESWEEPER TERMINAL", color.header);
    writeText(FIELD.x + 70, FIELD.y - 2, "LOGIC GRID", color.gold);
    drawBox(BOARD.x - 2, BOARD.y - 1, BOARD.w * BOARD.cw + 4, BOARD.h * BOARD.ch + 2, color.line);
  }
  function numberColor(n) {
    return [color.open, color.cyan2, color.green, color.gold, color.orange, color.red2, color.purple || "#c084fc", color.red, color.header][n] || color.header;
  }
  function drawCells() {
    const game = state.game;
    for (const cell of game.cells) {
      const p = boardToScreen(cell.x, cell.y);
      const selected = game.cursor.x === cell.x && game.cursor.y === cell.y && state.mode === "human";
      const bg = selected ? "#142333" : cell.open ? "#071018" : "#0a111a";
      for (let yy = 0; yy < BOARD.ch; yy += 1) {
        for (let xx = 0; xx < BOARD.cw; xx += 1) setCell(p.x + xx, p.y + yy, " ", color.text, bg);
      }
      if (!cell.open) {
        const fg = cell.mark ? color.gold : cell.flag ? color.flag : color.hidden;
        writeText(p.x, p.y, cell.flag ? " F " : cell.mark ? " ? " : "░▓░", fg, bg);
        writeText(p.x, p.y + 1, selected ? "╳╳╳" : "▒▒▒", mixColor(fg, color.ink, 0.35), bg);
        continue;
      }
      if (cell.mine) {
        writeText(p.x, p.y, " * ", color.red, "#16080c");
        writeText(p.x, p.y + 1, "▓▓▓", color.red2, "#16080c");
      } else if (cell.n > 0) {
        writeText(p.x, p.y, ` ${cell.n} `, numberColor(cell.n), bg);
        writeText(p.x, p.y + 1, "···", color.dim, bg);
      } else {
        writeText(p.x, p.y, "   ", color.dim, bg);
        writeText(p.x, p.y + 1, " · ", color.dim, bg);
      }
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
    const mines = difficultyConfig[state.difficulty].mines;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "FIELD", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `MINES ${String(mines).padStart(3, "0")}`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `FLAGS ${String(game.flags).padStart(3, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `OPEN  ${String(game.opened).padStart(3, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 11, game.status, game.status === "LIVE" ? color.cyan : game.status === "FIELD CLEAR" ? color.green : color.red);
    const safeCount = game.cells.length - mines;
    const bar = Math.round((game.opened / safeCount) * 20);
    writeText(RIGHT.x + 2, RIGHT.y + 14, "PROGRESS", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 16, `[${"█".repeat(bar)}${" ".repeat(20 - bar)}]`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 20, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 20).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 22 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   WASD/ARROWS MOVE   SPACE OPEN   F FLAG   P PAUSE   R REROLL   N HOME", color.muted);
  }
  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawCells();
    drawEffects(now);
    if (state.paused) writeText(FIELD.x + 42, FIELD.y + 22, "PAUSED", color.green);
    if (state.game.status !== "LIVE") writeText(FIELD.x + 33, FIELD.y + 22, `${state.game.status} - R RESTART`, state.game.status === "FIELD CLEAR" ? color.green : color.red);
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
  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) { event.preventDefault(); return; }
    if (key === "n") { event.preventDefault(); goHome(); return; }
    if (key === "p") { event.preventDefault(); state.paused = !state.paused; addLog(state.paused ? "PAUSED" : "RESUMED", "info"); return; }
    if (key === "r") { event.preventDefault(); initGame(randomSeed(), { reroll: true }); return; }
    if (key === "f") { event.preventDefault(); toggleFlag(state.game.cursor.x, state.game.cursor.y); return; }
    if (key === " " || event.key === "Enter") { event.preventDefault(); reveal(state.game.cursor.x, state.game.cursor.y); return; }
    if (key === "w" || event.key === "ArrowUp") moveCursor(0, -1);
    if (key === "s" || event.key === "ArrowDown") moveCursor(0, 1);
    if (key === "a" || event.key === "ArrowLeft") moveCursor(-1, 0);
    if (key === "d" || event.key === "ArrowRight") moveCursor(1, 0);
    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  });
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((((event.clientX - rect.left) / rect.width) * COLS - BOARD.x) / BOARD.cw);
    const y = Math.floor((((event.clientY - rect.top) / rect.height) * ROWS - BOARD.y) / BOARD.ch);
    if (!inBounds(x, y)) return;
    state.game.cursor = { x, y };
    if (event.shiftKey || event.button === 2) toggleFlag(x, y);
    else reveal(x, y);
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
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
