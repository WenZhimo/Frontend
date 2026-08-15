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
  const CAVE = { x: 8, y: 7, w: 88, h: 41 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    cave: "#081018",
    cave2: "#0a121b",
    rock: "#293244",
    rock2: "#161f2c",
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
    ship: "#f2ffff",
    core: "#ffcc66",
    tether: "#75f0a8",
  };

  const difficultyConfig = {
    normal: { thrust: 19, turn: 4.5, drag: 0.988, fuel: 100, wall: 1.65, maxSpeed: 18 },
    fast: { thrust: 22, turn: 5.1, drag: 0.99, fuel: 92, wall: 1.55, maxSpeed: 21 },
    chaos: { thrust: 25, turn: 5.8, drag: 0.992, fuel: 84, wall: 1.45, maxSpeed: 24 },
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
    input: { left: false, right: false, thrust: false },
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
    state.eventLog = state.eventLog.slice(0, 46);
  }

  function generateCave() {
    const upper = [];
    const lower = [];
    let center = CAVE.y + Math.floor(CAVE.h * (0.47 + state.rng() * 0.08));
    let half = 11 + Math.floor(state.rng() * 4);
    const coreX = CAVE.x + Math.floor(CAVE.w * (0.54 + state.rng() * 0.14));
    for (let i = 0; i < CAVE.w; i += 1) {
      const wave = Math.sin((i + state.seedHash % 31) * 0.19) * 0.7 + Math.sin(i * 0.071) * 0.9;
      center += (state.rng() - 0.5) * 1.45 + wave * 0.24;
      half += (state.rng() - 0.5) * 0.85;
      half = clamp(half, 7.5, 13.5);
      if (i < 9 || i > CAVE.w - 10) half = Math.max(half, 13);
      center = clamp(center, CAVE.y + half + 2, CAVE.y + CAVE.h - half - 3);
      upper.push(Math.round(center - half));
      lower.push(Math.round(center + half));
    }
    const coreIndex = clamp(coreX - CAVE.x, 0, CAVE.w - 1);
    const coreY = Math.round((upper[coreIndex] + lower[coreIndex]) / 2 + (state.rng() - 0.5) * 6);
    const exitIndex = CAVE.w - 2;
    return {
      upper,
      lower,
      coreStart: { x: coreX, y: clamp(coreY, upper[coreIndex] + 4, lower[coreIndex] - 4) },
      exit: {
        x: CAVE.x + CAVE.w - 1,
        y: Math.round((upper[exitIndex] + lower[exitIndex]) / 2),
        upper: upper[exitIndex] + 2,
        lower: lower[exitIndex] - 2,
      },
    };
  }

  function caveIndex(x) {
    return clamp(Math.round(x) - CAVE.x, 0, CAVE.w - 1);
  }

  function caveBoundsAt(x) {
    const i = caveIndex(x);
    return { upper: state.game.cave.upper[i], lower: state.game.cave.lower[i] };
  }

  function resetShip() {
    const game = state.game;
    const start = caveBoundsAt(CAVE.x + 2);
    game.ship.x = CAVE.x + 5;
    game.ship.y = Math.round((start.upper + start.lower) / 2);
    game.ship.vx = 4.4;
    game.ship.vy = 0;
    game.ship.angle = 0;
    game.ship.fuel = difficultyConfig[state.difficulty].fuel;
    game.ship.thrusting = false;
    game.ship.left = false;
    game.ship.right = false;
    game.core.x = game.cave.coreStart.x;
    game.core.y = game.cave.coreStart.y;
    game.core.vx = 0;
    game.core.vy = 0;
    game.core.carried = false;
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const cave = generateCave();
    state.game = {
      elapsed: 0,
      attempts: 1,
      score: 0,
      status: "INFILTRATE",
      statusUntil: 0,
      cave,
      ship: { x: 0, y: 0, vx: 0, vy: 0, angle: 0, fuel: 0, thrusting: false, left: false, right: false },
      core: { x: cave.coreStart.x, y: cave.coreStart.y, vx: 0, vy: 0, carried: false },
      flash: 0,
    };
    state.trails = [];
    state.effects = [];
    state.eventLog = [];
    state.paused = false;
    resetShip();
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW CAVE SEED" : "CAVE READY", "ok");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "info");
  }

  function setCell(x, y, ch = " ", fg = color.text, bg = null) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
    const p = idx(ix, iy);
    screen.ch[p] = ch;
    screen.fg[p] = fg;
    if (bg) screen.bg[p] = bg;
  }

  function drawText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) setCell(x + i, y, text[i], fg, bg);
  }

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.text;
      screen.bg[i] = color.ink;
    }
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

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const n = hash01(x, y, 11);
        const bg = n > 0.91 ? "#09111a" : n > 0.82 ? "#070d14" : color.ink;
        screen.bg[idx(x, y)] = bg;
        if (n > 0.985) setCell(x, y, "·", color.dim, bg);
      }
    }
  }

  function drawCave() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    drawText(CAVE.x + 1, CAVE.y - 2, "CAVE THRUST VECTOR", color.header);
    drawText(CAVE.x + 55, CAVE.y - 2, "ENERGY CORE EXTRACTION", color.gold);
    for (let x = CAVE.x; x < CAVE.x + CAVE.w; x += 1) {
      const bounds = caveBoundsAt(x);
      for (let y = CAVE.y; y < CAVE.y + CAVE.h; y += 1) {
        const p = idx(x, y);
        if (y <= bounds.upper || y >= bounds.lower) {
          const n = hash01(x, y, 31);
          screen.bg[p] = n > 0.56 ? color.rock : color.rock2;
          screen.ch[p] = n > 0.72 ? "▓" : n > 0.42 ? "▒" : "░";
          screen.fg[p] = n > 0.66 ? "#465168" : "#30394e";
        } else {
          const n = hash01(x, y, 47);
          screen.bg[p] = n > 0.86 ? color.cave2 : color.cave;
          if (n > 0.975) {
            screen.ch[p] = n > 0.991 ? "✦" : "·";
            screen.fg[p] = n > 0.991 ? color.cyan : "#355069";
          }
        }
      }
      setCell(x, bounds.upper + 1, hash01(x, bounds.upper, 61) > 0.5 ? "▀" : "▔", "#5a6680", color.cave);
      setCell(x, bounds.lower - 1, hash01(x, bounds.lower, 67) > 0.5 ? "▄" : "▁", "#5a6680", color.cave);
    }
    const exit = state.game.cave.exit;
    for (let y = exit.upper; y <= exit.lower; y += 1) {
      setCell(exit.x, y, ">", color.green, y % 2 ? "#0a1b15" : "#08140f");
      setCell(exit.x - 1, y, ":", color.green, color.cave);
    }
    drawText(exit.x - 7, exit.upper - 2, "EXIT", color.green);
  }

  function drawLine(x0, y0, x1, y1, glyph, fg) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (i % 2 === 0) setCell(Math.round(lerp(x0, x1, t)), Math.round(lerp(y0, y1, t)), glyph, fg);
    }
  }

  function drawCore(now) {
    const core = state.game.core;
    const pulse = Math.floor(now / 120) % 4;
    const halo = pulse === 0 ? "░" : pulse === 1 ? "▒" : pulse === 2 ? "▓" : "▒";
    if (core.carried) drawLine(state.game.ship.x, state.game.ship.y, core.x, core.y, "·", color.tether);
    setCell(core.x - 1, core.y, halo, color.gold);
    setCell(core.x + 1, core.y, halo, color.gold);
    setCell(core.x, core.y - 1, halo, color.gold);
    setCell(core.x, core.y + 1, halo, color.gold);
    setCell(core.x, core.y, "◉", color.core);
  }

  function drawShip() {
    const ship = state.game.ship;
    const x = Math.round(ship.x);
    const y = Math.round(ship.y);
    const dir = ((Math.round(ship.angle / (Math.PI / 2)) % 4) + 4) % 4;
    const shapes = [
      [
        [1, 0, "▶"],
        [0, -1, "╱"],
        [0, 0, "█"],
        [0, 1, "╲"],
        [-1, 0, "▪"],
      ],
      [
        [0, 1, "▼"],
        [-1, 0, "╲"],
        [0, 0, "█"],
        [1, 0, "╱"],
        [0, -1, "▪"],
      ],
      [
        [-1, 0, "◀"],
        [0, -1, "╲"],
        [0, 0, "█"],
        [0, 1, "╱"],
        [1, 0, "▪"],
      ],
      [
        [0, -1, "▲"],
        [-1, 0, "╱"],
        [0, 0, "█"],
        [1, 0, "╲"],
        [0, 1, "▪"],
      ],
    ];
    for (const [dx, dy, ch] of shapes[dir]) setCell(x + dx, y + dy, ch, color.ship);
    if (ship.thrusting) {
      const backX = x - Math.round(Math.cos(ship.angle) * 2);
      const backY = y - Math.round(Math.sin(ship.angle) * 2);
      setCell(backX, backY, "▓", color.orange);
      setCell(backX - Math.round(Math.cos(ship.angle)), backY - Math.round(Math.sin(ship.angle)), "░", color.gold);
    }
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      const fg = mixColor(trail.fg, color.ink, t);
      setCell(trail.x, trail.y, t < 0.45 ? trail.ch : "·", fg);
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      const x = fx.x + fx.vx * t;
      const y = fx.y + fx.vy * t;
      const fg = mixColor(fx.fg, color.ink, t);
      setCell(x, y, t < 0.5 ? fx.ch : "·", fg);
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    drawText(RIGHT.x + 2, RIGHT.y + 2, "MISSION", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 4, `STATE ${game.status.padEnd(10, " ")}`, statusColor(game.status));
    drawText(RIGHT.x + 2, RIGHT.y + 5, `TRY   ${String(game.attempts).padStart(2, "0")}`, color.text);
    drawText(RIGHT.x + 2, RIGHT.y + 6, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);

    drawText(RIGHT.x + 2, RIGHT.y + 12, "SHIP", color.header);
    const speed = Math.hypot(game.ship.vx, game.ship.vy);
    drawText(RIGHT.x + 2, RIGHT.y + 14, `VEL  ${speed.toFixed(1).padStart(5, " ")}`, speed > 14 ? color.red : color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 15, `FUEL ${game.ship.fuel.toFixed(0).padStart(5, " ")}`, game.ship.fuel < 18 ? color.red : color.gold);
    drawText(RIGHT.x + 2, RIGHT.y + 16, `CORE ${game.core.carried ? "TETHERED" : "SEARCH  "}`, game.core.carried ? color.green : color.gold);
    const fuelBars = Math.round(clamp(game.ship.fuel, 0, difficultyConfig[state.difficulty].fuel) / difficultyConfig[state.difficulty].fuel * 20);
    drawText(RIGHT.x + 2, RIGHT.y + 18, `[${"█".repeat(fuelBars).padEnd(20, " ")}]`, color.gold);

    drawText(RIGHT.x + 2, RIGHT.y + 23, "LOG", color.header);
    for (let i = 0; i < 18; i += 1) {
      const entry = state.eventLog[i + state.logOffset];
      if (!entry) break;
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "gold" ? color.gold : color.muted;
      drawText(RIGHT.x + 2, RIGHT.y + 25 + i, `>${entry.message}`.slice(0, RIGHT.w - 4), fg);
    }
  }

  function statusColor(status) {
    if (status === "CLEARED") return color.green;
    if (status === "CRASH" || status === "DRIFT") return color.red;
    if (status === "TETHER") return color.gold;
    return color.cyan;
  }

  function drawFooter() {
    drawText(FIELD.x + 4, FIELD.y + FIELD.h + 1, "1 0.5X   2 1X   3 2X   4 4X    A/D ROTATE   W/SPACE THRUST   P PAUSE   R REROLL   V HOME", color.muted);
  }

  function renderScreen() {
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const p = idx(x, y);
        if (screen.bg[p] !== color.ink) {
          ctx.fillStyle = screen.bg[p];
          ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        }
        const ch = screen.ch[p];
        if (ch && ch !== " ") {
          ctx.fillStyle = screen.fg[p];
          ctx.fillText(ch, x * CELL_W, y * CELL_H);
        }
      }
    }
  }

  function burst(x, y, fg, count = 18, power = 12, glyphs = ["░", "▒", "▓", "·"]) {
    if (reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const angle = state.rng() * Math.PI * 2;
      const speed = (4 + state.rng() * power);
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ch: glyphs[Math.floor(state.rng() * glyphs.length)],
        fg,
        start: performance.now(),
        duration: 420 + state.rng() * 440,
      });
    }
  }

  function trail(x, y, ch, fg, duration = 260) {
    if (reducedMotion) return;
    state.trails.push({ x, y, ch, fg, start: performance.now(), duration });
    state.trails = state.trails.slice(-180);
  }

  function normalizeAngle(angle) {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function updateAI() {
    const game = state.game;
    const ship = game.ship;
    let target = game.core.carried ? game.cave.exit : game.core;
    const bounds = caveBoundsAt(ship.x + Math.cos(ship.angle) * 5);
    const center = (bounds.upper + bounds.lower) / 2;
    const marginTop = ship.y - bounds.upper;
    const marginBottom = bounds.lower - ship.y;
    if (marginTop < 5 || marginBottom < 5) {
      target = { x: ship.x + 9, y: center };
    }
    const desired = Math.atan2(target.y - ship.y, target.x - ship.x);
    const diff = normalizeAngle(desired - ship.angle);
    ship.left = diff < -0.08;
    ship.right = diff > 0.08;
    const speed = Math.hypot(ship.vx, ship.vy);
    const toward = Math.cos(diff);
    ship.thrusting = toward > 0.35 && speed < difficultyConfig[state.difficulty].maxSpeed * 0.86;
    if (marginTop < 3 || marginBottom < 3) ship.thrusting = toward > 0.65;
  }

  function updateControls() {
    const ship = state.game.ship;
    if (state.mode === "demo") {
      updateAI();
    } else {
      ship.left = state.input.left;
      ship.right = state.input.right;
      ship.thrusting = state.input.thrust;
    }
    if (ship.fuel <= 0) ship.thrusting = false;
  }

  function crash(now) {
    const game = state.game;
    game.status = "CRASH";
    game.statusUntil = game.elapsed + 1.2;
    game.flash = 1;
    addLog("HULL BREACH", "bad");
    burst(game.ship.x, game.ship.y, color.red, 34, 20, ["▓", "▒", "░", "*"]);
  }

  function updateCore(dt, now) {
    const game = state.game;
    const ship = game.ship;
    const core = game.core;
    if (!core.carried) {
      if (Math.hypot(core.x - ship.x, core.y - ship.y) < 3.5) {
        core.carried = true;
        game.status = "TETHER";
        game.score += 400;
        addLog("CORE TETHERED", "gold");
        burst(core.x, core.y, color.gold, 26, 12, ["░", "▒", "◦", "·"]);
      }
      return;
    }
    const targetX = ship.x - Math.cos(ship.angle) * 5;
    const targetY = ship.y - Math.sin(ship.angle) * 3;
    core.vx += (targetX - core.x) * 3.3 * dt;
    core.vy += (targetY - core.y) * 3.3 * dt;
    core.vx *= Math.pow(0.82, dt * 8);
    core.vy *= Math.pow(0.82, dt * 8);
    core.x += core.vx * dt;
    core.y += core.vy * dt;
    const bounds = caveBoundsAt(core.x);
    if (core.y <= bounds.upper + 1 || core.y >= bounds.lower - 1) {
      burst(core.x, core.y, color.gold, 8, 7, ["░", "·"]);
      core.y = clamp(core.y, bounds.upper + 2, bounds.lower - 2);
      core.vy *= -0.35;
    }
    if (Math.floor(now / 120) % 4 === 0) trail(core.x, core.y, "·", color.gold, 360);
  }

  function updateGame(dt, now) {
    const game = state.game;
    game.elapsed += dt;
    if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 2);

    if (game.status === "CRASH") {
      if (game.elapsed >= game.statusUntil) {
        game.attempts += 1;
        game.status = "INFILTRATE";
        resetShip();
        addLog("REDEPLOY", "info");
      }
      return;
    }
    if (game.status === "CLEARED") return;

    updateControls();
    const config = difficultyConfig[state.difficulty];
    const ship = game.ship;
    if (ship.left) ship.angle -= config.turn * dt;
    if (ship.right) ship.angle += config.turn * dt;
    ship.angle = normalizeAngle(ship.angle);
    if (ship.thrusting && ship.fuel > 0) {
      ship.vx += Math.cos(ship.angle) * config.thrust * dt;
      ship.vy += Math.sin(ship.angle) * config.thrust * dt;
      ship.fuel = Math.max(0, ship.fuel - 18 * dt);
      const bx = ship.x - Math.cos(ship.angle) * 2;
      const by = ship.y - Math.sin(ship.angle) * 2;
      trail(bx, by, state.rng() > 0.5 ? "▒" : "░", color.orange, 340);
    }
    ship.vx *= Math.pow(config.drag, dt * 60);
    ship.vy *= Math.pow(config.drag, dt * 60);
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > config.maxSpeed) {
      ship.vx = (ship.vx / speed) * config.maxSpeed;
      ship.vy = (ship.vy / speed) * config.maxSpeed;
    }
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    if (ship.fuel <= 0 && game.status !== "DRIFT" && !game.core.carried) {
      game.status = "DRIFT";
      addLog("FUEL EMPTY", "bad");
    }
    if (game.core.carried && game.status !== "TETHER") game.status = "TETHER";

    updateCore(dt, now);

    const bounds = caveBoundsAt(ship.x);
    if (ship.x < CAVE.x + 1 || ship.x > CAVE.x + CAVE.w - 1 || ship.y <= bounds.upper + config.wall || ship.y >= bounds.lower - config.wall) {
      crash(now);
      return;
    }

    const exit = game.cave.exit;
    if (game.core.carried && ship.x >= exit.x - 1 && ship.y >= exit.upper && ship.y <= exit.lower) {
      game.status = "CLEARED";
      game.score += Math.max(100, Math.round(1800 + ship.fuel * 18 - game.elapsed * 9));
      addLog("CORE EXTRACTED", "ok");
      addLog("CAVE CLEARED", "ok");
      burst(exit.x - 2, ship.y, color.green, 46, 22, ["▓", "▒", "░", "✦"]);
    }
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawCave();
    drawTrails(now);
    drawEffects(now);
    drawCore(now);
    drawShip();
    if (state.paused) drawText(FIELD.x + 39, FIELD.y + 2, " PAUSED ", color.gold);
    if (state.game.status === "CLEARED") drawText(CAVE.x + 30, CAVE.y + 19, " EXTRACTION COMPLETE ", color.green);
    if (state.game.status === "CRASH") drawText(CAVE.x + 36, CAVE.y + 19, " IMPACT / REDEPLOY ", color.red);
    drawHud();
    drawFooter();
    renderScreen();
  }

  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const dt = Math.min((now - state.lastFrame) / 1000, 0.05) * state.speed;
    state.lastFrame = now;
    if (!state.paused) updateGame(dt, now);
    draw(now);
    requestAnimationFrame(frame);
  }

  function setSpeed(key) {
    const speeds = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (!Object.prototype.hasOwnProperty.call(speeds, key)) return false;
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
    if (key === "v") {
      event.preventDefault();
      goHome();
      return;
    }
    if (key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSE" : "RESUME", "info");
      return;
    }
    if (key === "r") {
      event.preventDefault();
      initGame(randomSeed(), { reroll: true });
      return;
    }
    if (key === "a" || event.key === "ArrowLeft") state.input.left = true;
    if (key === "d" || event.key === "ArrowRight") state.input.right = true;
    if (key === "w" || event.key === "ArrowUp" || event.code === "Space") state.input.thrust = true;
    if (["a", "d", "w", "ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key) || event.code === "Space") event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (key === "w" || event.key === "ArrowUp" || event.code === "Space") state.input.thrust = false;
  });

  seedInput.addEventListener("input", updateSeedStatus);
  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    updateSeedStatus();
  });
  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed || randomSeed());
    seedInput.value = seed.trimEnd();
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED 100";
    } catch {
      seedStatus.value = "COPY FAILED";
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value || randomSeed());
  });
  playModeSelect.addEventListener("change", () => initGame(state.seed || randomSeed()));
  difficultySelect.addEventListener("change", () => initGame(state.seed || randomSeed()));

  canvas.width = COLS * CELL_W;
  canvas.height = ROWS * CELL_H;
  ctx.imageSmoothingEnabled = false;
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
