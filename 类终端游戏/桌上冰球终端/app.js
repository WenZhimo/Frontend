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
  const GOAL_TOP = FIELD.y + 15;
  const GOAL_BOTTOM = FIELD.y + FIELD.h - 15;
  const TARGET_SCORE = 7;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    ink2: "#0a0f16",
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
    gold: "#ffcc66",
    orange: "#ff9f45",
    red: "#ff4d5f",
    red2: "#ff7b6f",
    left: "#f2ffff",
    right: "#ffcc66",
    puck: "#ff4d5f",
  };

  const difficultyConfig = {
    normal: { puck: 28, mallet: 42, ai: 0.84, curve: 0.76 },
    fast: { puck: 35, mallet: 49, ai: 0.9, curve: 0.9 },
    chaos: { puck: 42, mallet: 56, ai: 0.96, curve: 1.1 },
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
    input: { leftUp: false, leftDown: false, rightUp: false, rightDown: false, pointer: null },
    game: null,
    trails: [],
    effects: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
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
    state.eventLog = state.eventLog.slice(0, 44);
  }

  function createMallet(side) {
    const x = side === "left" ? FIELD.x + 16 : FIELD.x + FIELD.w - 16;
    return {
      side,
      x,
      y: FIELD.y + FIELD.h / 2,
      vx: 0,
      vy: 0,
      r: 2.45,
      homeX: x,
      targetY: FIELD.y + FIELD.h / 2,
    };
  }

  function resetPuck(serving = state.rng() < 0.5 ? -1 : 1) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    const angle = (state.rng() - 0.5) * 0.64;
    const speed = config.puck + game.rally * 0.38;
    game.puck.x = FIELD.x + FIELD.w / 2;
    game.puck.y = FIELD.y + FIELD.h / 2 + (state.rng() - 0.5) * 7;
    game.puck.vx = serving * Math.cos(angle) * speed;
    game.puck.vy = Math.sin(angle) * speed;
    game.rally = 0;
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = {
      elapsed: 0,
      round: 1,
      rally: 0,
      winner: "",
      score: { left: 0, right: 0 },
      left: createMallet("left"),
      right: createMallet("right"),
      puck: { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2, vx: 0, vy: 0, r: 0.82 },
      flash: 0,
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    resetPuck();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "MATCH READY", "info");
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.42;
      const speed = (9 + state.rng() * 22) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.74,
        start: now,
        duration: 430 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)],
      });
    }
  }

  function addRing(x, y, baseColor, radius = 8) {
    const now = performance.now();
    state.effects.push({
      ring: true,
      x,
      y,
      start: now,
      duration: 380,
      radius,
      color: baseColor,
    });
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

  function clearScreen() {
    screen.ch.fill(" ");
    screen.fg.fill(color.text);
    screen.bg.fill(color.ink);
  }

  function setCell(x, y, ch, fg = color.text, bg = null) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) return;
    const id = idx(ix, iy);
    screen.ch[id] = ch;
    screen.fg[id] = fg;
    if (bg) screen.bg[id] = bg;
  }

  function writeText(x, y, text, fg = color.text, bg = null) {
    Array.from(text).forEach((ch, i) => setCell(x + i, y, ch, fg, bg));
  }

  function drawBox(x, y, w, h, fg = color.line, bg = null) {
    for (let ix = x + 1; ix < x + w - 1; ix += 1) {
      setCell(ix, y, "─", fg, bg);
      setCell(ix, y + h - 1, "─", fg, bg);
    }
    for (let iy = y + 1; iy < y + h - 1; iy += 1) {
      setCell(x, iy, "│", fg, bg);
      setCell(x + w - 1, iy, "│", fg, bg);
    }
    setCell(x, y, "┌", fg, bg);
    setCell(x + w - 1, y, "┐", fg, bg);
    setCell(x, y + h - 1, "└", fg, bg);
    setCell(x + w - 1, y + h - 1, "┘", fg, bg);
  }

  function fillRectChars(x, y, w, h, glyph, fg, bg = null) {
    for (let iy = y; iy < y + h; iy += 1) {
      for (let ix = x; ix < x + w; ix += 1) setCell(ix, iy, glyph, fg, bg);
    }
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 4);
        const bg = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        screen.bg[idx(x, y)] = bg;
        if (grain > 0.965) setCell(x, y, "·", color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        const dark = ((Math.floor((x - FIELD.x) / 8) + Math.floor((y - FIELD.y) / 5)) & 1) === 0;
        screen.bg[idx(x, y)] = dark ? "#071019" : "#0a111a";
        const d = hash01(x, y, 17);
        if (d > 0.82) setCell(x, y, d > 0.93 ? "⠂" : "·", "#213041");
      }
    }
    for (let y = GOAL_TOP; y <= GOAL_BOTTOM; y += 1) {
      setCell(FIELD.x, y, " ", color.line, "#10121a");
      setCell(FIELD.x + FIELD.w - 1, y, " ", color.line, "#10121a");
      if (y % 2 === 0) {
        setCell(FIELD.x - 1, y, "╞", color.red);
        setCell(FIELD.x + FIELD.w, y, "╡", color.red);
      }
    }
    const mid = FIELD.x + FIELD.w / 2;
    for (let y = FIELD.y + 3; y < FIELD.y + FIELD.h - 3; y += 2) setCell(mid, y, "┊", color.lineDim);
    for (let i = 0; i < 23; i += 1) {
      const a = (i / 23) * Math.PI * 2;
      setCell(mid + Math.cos(a) * 11, FIELD.y + FIELD.h / 2 + Math.sin(a) * 5, "·", color.line);
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "WHITE MALLET", color.left);
    writeText(FIELD.x + FIELD.w - 16, FIELD.y - 2, "GOLD MALLET", color.right);
  }

  function drawMallet(mallet, fg) {
    const cx = Math.round(mallet.x);
    const cy = Math.round(mallet.y);
    const pattern = [
      [" ", "▄", "█", "▄", " "],
      ["▄", "█", "█", "█", "▄"],
      ["█", "█", "▓", "█", "█"],
      ["▀", "█", "█", "█", "▀"],
      [" ", "▀", "█", "▀", " "],
    ];
    for (let py = 0; py < pattern.length; py += 1) {
      for (let px = 0; px < pattern[py].length; px += 1) {
        const ch = pattern[py][px];
        if (ch !== " ") setCell(cx + px - 2, cy + py - 2, ch, fg);
      }
    }
  }

  function drawPuck() {
    const puck = state.game.puck;
    setCell(puck.x - 1, puck.y, "◖", color.puck);
    setCell(puck.x, puck.y, "●", color.red2);
    setCell(puck.x + 1, puck.y, "◗", color.puck);
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      const fg = mixColor(trail.color, color.ink, t);
      setCell(trail.x, trail.y, trail.glyph, fg);
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      if (fx.ring) {
        const r = fx.radius * t;
        const count = Math.max(10, Math.floor(r * 7));
        const fg = mixColor(fx.color, color.ink, t);
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * Math.PI * 2;
          setCell(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r * 0.55, t < 0.45 ? "⠿" : "⠂", fg);
        }
        continue;
      }
      const x = fx.x + fx.vx * t * 0.04;
      const y = fx.y + fx.vy * t * 0.04;
      setCell(x, y, fx.glyph, mixColor(fx.color, color.ink, t));
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `WHITE ${String(game.score.left).padStart(2, "0")}`, color.left);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `GOLD  ${String(game.score.right).padStart(2, "0")}`, color.right);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `ROUND ${String(game.round).padStart(2, "0")}`, color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `RALLY ${String(game.rally).padStart(2, "0")}`, color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 10, `SPD   ${state.speed.toFixed(1)}X`, color.green);

    writeText(RIGHT.x + 2, RIGHT.y + 13, "PUCK", color.header);
    const v = Math.hypot(game.puck.vx, game.puck.vy);
    const bar = clamp(Math.round((v / 58) * 20), 1, 20);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `[${"█".repeat(bar)}${" ".repeat(20 - bar)}]`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 17, game.winner ? `${game.winner} WINS` : state.paused ? "PAUSED" : "LIVE", game.winner ? color.green : color.cyan);

    writeText(RIGHT.x + 2, RIGHT.y + 21, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 18).forEach((entry, i) => {
      const tone = entry.tone === "goal" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 23 + i, `>${entry.message.slice(0, 22)}`, tone);
    });

    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   W/S LEFT   ↑/↓ RIGHT   P PAUSE   R REROLL   A HOME", color.muted);
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

  function steerMallet(mallet, targetX, targetY, dt, skill = 1) {
    const config = difficultyConfig[state.difficulty];
    const maxSpeed = config.mallet * skill;
    const dx = targetX - mallet.x;
    const dy = targetY - mallet.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(maxSpeed * dt, dist);
    const oldX = mallet.x;
    const oldY = mallet.y;
    mallet.x += (dx / dist) * step;
    mallet.y += (dy / dist) * step;
    mallet.vx = (mallet.x - oldX) / Math.max(dt, 0.001);
    mallet.vy = (mallet.y - oldY) / Math.max(dt, 0.001);
    const minX = mallet.side === "left" ? FIELD.x + 4 : FIELD.x + FIELD.w / 2 + 4;
    const maxX = mallet.side === "left" ? FIELD.x + FIELD.w / 2 - 4 : FIELD.x + FIELD.w - 5;
    mallet.x = clamp(mallet.x, minX, maxX);
    mallet.y = clamp(mallet.y, FIELD.y + 4, FIELD.y + FIELD.h - 5);
  }

  function updateMallets(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    const puck = game.puck;
    const leftTarget = { x: game.left.x, y: game.left.y };
    const rightTarget = { x: game.right.x, y: game.right.y };

    if (state.mode === "demo") {
      leftTarget.x = game.left.homeX;
      leftTarget.y = FIELD.y + FIELD.h / 2;
      rightTarget.x = game.right.homeX;
      rightTarget.y = FIELD.y + FIELD.h / 2;
      if (puck.vx < 0 || puck.x < FIELD.x + FIELD.w / 2) {
        leftTarget.x = clamp(puck.x - 3, FIELD.x + 7, FIELD.x + FIELD.w / 2 - 5);
        leftTarget.y = clamp(puck.y + Math.sin(game.elapsed * 3.1) * 2, FIELD.y + 5, FIELD.y + FIELD.h - 5);
      }
      if (puck.vx > 0 || puck.x > FIELD.x + FIELD.w / 2) {
        rightTarget.x = clamp(puck.x + 3, FIELD.x + FIELD.w / 2 + 5, FIELD.x + FIELD.w - 8);
        rightTarget.y = clamp(puck.y + Math.cos(game.elapsed * 2.7) * 2, FIELD.y + 5, FIELD.y + FIELD.h - 5);
      }
    } else {
      const manualLeft = (state.input.leftDown ? 1 : 0) - (state.input.leftUp ? 1 : 0);
      const manualRight = (state.input.rightDown ? 1 : 0) - (state.input.rightUp ? 1 : 0);
      if (manualLeft) leftTarget.y = game.left.y + manualLeft * 7;
      if (manualRight) rightTarget.y = game.right.y + manualRight * 7;
      if (state.input.pointer) {
        const { x, y } = state.input.pointer;
        if (x < FIELD.x + FIELD.w / 2) {
          leftTarget.x = x;
          leftTarget.y = y;
        } else {
          rightTarget.x = x;
          rightTarget.y = y;
        }
      }
    }

    steerMallet(game.left, leftTarget.x, leftTarget.y, dt, state.mode === "demo" ? config.ai : 1);
    steerMallet(game.right, rightTarget.x, rightTarget.y, dt, state.mode === "demo" ? config.ai : 1);
  }

  function collideMallet(mallet, puck) {
    const dx = puck.x - mallet.x;
    const dy = puck.y - mallet.y;
    const dist = Math.hypot(dx, dy);
    const minDist = mallet.r + puck.r;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    puck.x = mallet.x + nx * minDist;
    puck.y = mallet.y + ny * minDist;
    const dot = puck.vx * nx + puck.vy * ny;
    const config = difficultyConfig[state.difficulty];
    puck.vx += -2 * dot * nx + mallet.vx * 0.18;
    puck.vy += -2 * dot * ny + mallet.vy * 0.18 + (state.rng() - 0.5) * config.curve * 6;
    const speed = clamp(Math.hypot(puck.vx, puck.vy) + 2.6, config.puck, 62);
    const angle = Math.atan2(puck.vy, puck.vx);
    puck.vx = Math.cos(angle) * speed;
    puck.vy = Math.sin(angle) * speed;
    gameRally();
    const fxColor = mallet.side === "left" ? color.cyan : color.red;
    addBurst(puck.x, puck.y, fxColor, 16, 0.85);
    addRing(puck.x, puck.y, fxColor, 10);
  }

  function gameRally() {
    state.game.rally += 1;
    if (state.game.rally % 5 === 0) addLog(`RALLY ${state.game.rally}`, "ok");
  }

  function score(side) {
    const game = state.game;
    game.score[side] += 1;
    game.round += 1;
    game.flash = 0.75;
    addLog(`${side.toUpperCase()} GOAL`, "goal");
    addBurst(side === "left" ? FIELD.x + 4 : FIELD.x + FIELD.w - 4, game.puck.y, side === "left" ? color.cyan : color.red, 46, 1.45);
    addRing(game.puck.x, game.puck.y, side === "left" ? color.cyan : color.red, 17);
    if (game.score[side] >= TARGET_SCORE) {
      game.winner = side.toUpperCase();
      addLog(`${game.winner} TAKES MATCH`, "ok");
      return;
    }
    resetPuck(side === "left" ? 1 : -1);
  }

  function updatePuck(dt) {
    const game = state.game;
    const puck = game.puck;
    const oldX = puck.x;
    const oldY = puck.y;
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    if (puck.y <= FIELD.y + 1 || puck.y >= FIELD.y + FIELD.h - 2) {
      puck.y = clamp(puck.y, FIELD.y + 1, FIELD.y + FIELD.h - 2);
      puck.vy *= -0.98;
      addBurst(puck.x, puck.y, color.puck, 10, 0.55);
    }

    const inGoal = puck.y >= GOAL_TOP && puck.y <= GOAL_BOTTOM;
    if (puck.x <= FIELD.x && inGoal) score("right");
    else if (puck.x >= FIELD.x + FIELD.w - 1 && inGoal) score("left");
    else if (puck.x <= FIELD.x + 1 || puck.x >= FIELD.x + FIELD.w - 2) {
      puck.x = clamp(puck.x, FIELD.x + 1, FIELD.x + FIELD.w - 2);
      puck.vx *= -0.98;
      addBurst(puck.x, puck.y, color.puck, 12, 0.62);
    }

    collideMallet(game.left, puck);
    collideMallet(game.right, puck);

    if (!reducedMotion) {
      const steps = Math.max(1, Math.floor(Math.hypot(puck.x - oldX, puck.y - oldY) / 1.2));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        state.trails.push({
          x: Math.round(lerp(oldX, puck.x, t)),
          y: Math.round(lerp(oldY, puck.y, t)),
          glyph: i % 2 ? "⠿" : "⠶",
          color: color.puck,
          start: performance.now(),
          duration: 260 + i * 14,
        });
      }
      state.trails = state.trails.slice(-150);
    }
  }

  function update(dt) {
    if (!state.game || state.paused) return;
    const game = state.game;
    if (game.winner) return;
    game.elapsed += dt;
    if (game.flash > 0) game.flash -= dt;
    updateMallets(dt);
    updatePuck(dt);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawMallet(state.game.left, color.left);
      drawMallet(state.game.right, color.right);
      drawPuck();
      if (state.game.flash > 0) {
        const fg = state.game.flash % 0.14 > 0.07 ? color.red : color.header;
        writeText(FIELD.x + 36, FIELD.y + FIELD.h / 2 - 1, "!!! GOAL !!!", fg);
      }
      if (state.game.winner) {
        writeText(FIELD.x + 33, FIELD.y + FIELD.h / 2 - 1, `${state.game.winner} WINS - R RESTART`, color.green);
      }
      drawHud();
    }
    renderScreen();
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

  function goHome() {
    window.location.href = "../index.html";
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) {
      event.preventDefault();
      return;
    }
    if (key === "a") {
      event.preventDefault();
      goHome();
      return;
    }
    if (key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSED" : "RESUMED", "info");
      return;
    }
    if (key === "r") {
      event.preventDefault();
      initGame(randomSeed(), { reroll: true });
      return;
    }
    if (key === "w") state.input.leftUp = true;
    if (key === "s") state.input.leftDown = true;
    if (event.key === "ArrowUp") state.input.rightUp = true;
    if (event.key === "ArrowDown") state.input.rightDown = true;
    if (["w", "s", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "w") state.input.leftUp = false;
    if (key === "s") state.input.leftDown = false;
    if (event.key === "ArrowUp") state.input.rightUp = false;
    if (event.key === "ArrowDown") state.input.rightDown = false;
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * COLS;
    const y = ((event.clientY - rect.top) / rect.height) * ROWS;
    state.input.pointer = { x, y };
  });

  canvas.addEventListener("pointerleave", () => {
    state.input.pointer = null;
  });

  seedInput.addEventListener("input", updateSeedStatus);

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed().trimEnd();
    updateSeedStatus();
  });

  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed);
    seedInput.value = seed.trimEnd();
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED";
    } catch {
      seedStatus.value = "COPY FAIL";
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value || randomSeed());
  });

  for (const control of [playModeSelect, difficultySelect]) {
    control?.addEventListener("change", () => initGame(seedInput.value || state.seed || randomSeed()));
  }

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
