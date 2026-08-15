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
  const SKY = { x: 9, y: 7, w: 86, h: 42 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    floor: "#081018",
    floor2: "#0a121b",
    terrain: "#3d4658",
    terrain2: "#202b3b",
    pad: "#75f0a8",
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
    flame: "#ffcc66",
  };

  const difficultyConfig = {
    normal: { gravity: 5.3, thrust: 12.8, side: 7.2, fuel: 100, safeVy: 5.2, safeVx: 3.8 },
    fast: { gravity: 6.1, thrust: 13.6, side: 8.0, fuel: 92, safeVy: 5.4, safeVx: 3.6 },
    chaos: { gravity: 7.0, thrust: 15.0, side: 9.0, fuel: 82, safeVy: 5.7, safeVx: 3.4 },
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
    trails: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
    input: { thrust: false, left: false, right: false },
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

  function updateSeedStatus() {
    seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`;
  }

  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 44);
  }

  function generateTerrain() {
    const heights = [];
    let y = SKY.y + SKY.h - 6 - Math.floor(state.rng() * 4);
    const padW = 10;
    const padStart = SKY.x + 18 + Math.floor(state.rng() * (SKY.w - 40));
    for (let x = SKY.x; x < SKY.x + SKY.w; x += 1) {
      if (x >= padStart && x < padStart + padW) {
        heights.push(SKY.y + SKY.h - 7);
      } else {
        y += Math.floor(state.rng() * 3) - 1;
        y = clamp(y, SKY.y + SKY.h - 13, SKY.y + SKY.h - 3);
        heights.push(y);
      }
    }
    return { heights, padStart, padEnd: padStart + padW - 1, padY: SKY.y + SKY.h - 7 };
  }

  function terrainY(x) {
    const game = state.game;
    const ix = clamp(Math.round(x) - SKY.x, 0, game.terrain.heights.length - 1);
    return game.terrain.heights[ix];
  }

  function resetShip() {
    const game = state.game;
    game.ship.x = SKY.x + 8 + state.rng() * (SKY.w - 16);
    game.ship.y = SKY.y + 4;
    game.ship.vx = (state.rng() - 0.5) * 5;
    game.ship.vy = 0;
    game.ship.angle = 0;
    game.ship.fuel = difficultyConfig[state.difficulty].fuel;
    game.ship.main = false;
    game.ship.left = false;
    game.ship.right = false;
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = {
      elapsed: 0,
      score: 0,
      attempts: 1,
      status: "DESCENT",
      terrain: generateTerrain(),
      ship: { x: 0, y: 0, vx: 0, vy: 0, angle: 0, fuel: 0, main: false, left: false, right: false },
      flash: 0,
    };
    state.effects = [];
    state.trails = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    resetShip();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "DESCENT WINDOW", "info");
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

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.54;
      const speed = (8 + state.rng() * 25) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        start: now,
        duration: 450 + state.rng() * 350,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "*", "+", "·"][Math.floor(state.rng() * 7)],
      });
    }
  }

  function addTrail(x, y, glyph, baseColor, duration = 260) {
    if (reducedMotion) return;
    state.trails.push({ x: Math.round(x), y: Math.round(y), glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-180);
  }

  function updateAI() {
    const game = state.game;
    const ship = game.ship;
    const config = difficultyConfig[state.difficulty];
    const targetX = (game.terrain.padStart + game.terrain.padEnd) / 2;
    const terrain = terrainY(ship.x);
    const altitude = terrain - ship.y;
    ship.left = false;
    ship.right = false;
    ship.main = false;
    if (ship.x < targetX - 1.2 || ship.vx < -1.3) ship.right = true;
    if (ship.x > targetX + 1.2 || ship.vx > 1.3) ship.left = true;
    const desiredVy = altitude > 22 ? 6.5 : altitude > 11 ? 4.3 : 2.1;
    if (ship.vy > desiredVy || altitude < 8) ship.main = true;
    if (ship.vy > config.safeVy - 0.5) ship.main = true;
  }

  function updateInputs() {
    const ship = state.game.ship;
    if (state.mode === "demo") updateAI();
    else {
      ship.main = state.input.thrust;
      ship.left = state.input.left;
      ship.right = state.input.right;
    }
    if (ship.fuel <= 0) {
      ship.main = false;
      ship.left = false;
      ship.right = false;
    }
  }

  function consumeFuel(amount) {
    const ship = state.game.ship;
    ship.fuel = Math.max(0, ship.fuel - amount);
  }

  function updateShip(dt) {
    const game = state.game;
    const ship = game.ship;
    const config = difficultyConfig[state.difficulty];
    if (game.status !== "DESCENT") return;
    updateInputs();
    let ax = 0;
    let ay = config.gravity;
    if (ship.main) {
      ay -= config.thrust;
      consumeFuel(12 * dt);
      addTrail(ship.x, ship.y + 2, state.rng() > 0.5 ? "╵" : "·", color.flame, 250);
      if (state.rng() > 0.55) addBurst(ship.x, ship.y + 3, color.flame, 2, 0.25);
    }
    if (ship.left) {
      ax -= config.side;
      ship.angle = lerp(ship.angle, -0.45, 0.16);
      consumeFuel(5 * dt);
      addTrail(ship.x + 2, ship.y, "·", color.cyan, 180);
    } else if (ship.right) {
      ax += config.side;
      ship.angle = lerp(ship.angle, 0.45, 0.16);
      consumeFuel(5 * dt);
      addTrail(ship.x - 2, ship.y, "·", color.cyan, 180);
    } else {
      ship.angle = lerp(ship.angle, 0, 0.08);
    }
    ship.vx += ax * dt;
    ship.vy += ay * dt;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    if (ship.x < SKY.x + 2) {
      ship.x = SKY.x + 2;
      ship.vx *= -0.35;
    }
    if (ship.x > SKY.x + SKY.w - 2) {
      ship.x = SKY.x + SKY.w - 2;
      ship.vx *= -0.35;
    }
    if (ship.y < SKY.y + 1) {
      ship.y = SKY.y + 1;
      ship.vy = Math.max(0, ship.vy);
    }
    const ground = terrainY(ship.x);
    if (ship.y + 2 >= ground) resolveLanding(ground);
  }

  function resolveLanding(ground) {
    const game = state.game;
    const ship = game.ship;
    const config = difficultyConfig[state.difficulty];
    const onPad = ship.x >= game.terrain.padStart + 1 && ship.x <= game.terrain.padEnd - 1;
    const stable = Math.abs(ship.vx) <= config.safeVx && Math.abs(ship.vy) <= config.safeVy && Math.abs(ship.angle) < 0.38;
    ship.y = ground - 2;
    if (onPad && stable) {
      game.status = "LANDED";
      game.score += Math.round(ship.fuel * 10 + 1000);
      addLog("TOUCHDOWN", "ok");
      addBurst(ship.x, ground, color.green, 50, 1.2);
    } else {
      game.status = "CRASH";
      addLog(onPad ? "HARD LANDING" : "TERRAIN CRASH", "hit");
      addBurst(ship.x, ground, color.red, 70, 1.6);
    }
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    game.elapsed += dt;
    game.flash = Math.max(0, game.flash - dt);
    updateShip(dt);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 190);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.968) setCell(x, y, "·", color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        screen.bg[idx(x, y)] = y % 4 === 0 ? "#07101a" : color.floor;
      }
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "LUNAR DESCENT VECTOR", color.header);
    writeText(FIELD.x + 70, FIELD.y - 2, "FUEL / GRAVITY", color.gold);
  }

  function drawSky() {
    drawBox(SKY.x, SKY.y, SKY.w, SKY.h, color.line);
    for (let y = SKY.y + 1; y < SKY.y + SKY.h - 1; y += 1) {
      for (let x = SKY.x + 1; x < SKY.x + SKY.w - 1; x += 1) {
        const bg = y % 5 === 0 ? color.floor2 : color.floor;
        screen.bg[idx(x, y)] = bg;
        const star = hash01(x, y, 203);
        if (star > 0.968) setCell(x, y, star > 0.99 ? "✦" : "·", star > 0.99 ? color.cyan : color.dim, bg);
      }
    }
  }

  function drawTerrain() {
    const terrain = state.game.terrain;
    for (let i = 0; i < terrain.heights.length; i += 1) {
      const x = SKY.x + i;
      const h = terrain.heights[i];
      const isPad = x >= terrain.padStart && x <= terrain.padEnd;
      setCell(x, h, isPad ? "═" : "▄", isPad ? color.pad : color.terrain);
      for (let y = h + 1; y < SKY.y + SKY.h - 1; y += 1) {
        setCell(x, y, hash01(x, y, 301) > 0.48 ? "▓" : "▒", isPad ? color.pad : color.terrain2, "#090d12");
      }
    }
    writeText(terrain.padStart + 1, terrain.padY - 1, "PAD", color.pad);
  }

  function drawShip() {
    const ship = state.game.ship;
    if (state.game.status === "CRASH") return;
    const x = Math.round(ship.x);
    const y = Math.round(ship.y);
    const tilt = ship.angle < -0.2 ? -1 : ship.angle > 0.2 ? 1 : 0;
    if (tilt < 0) {
      setCell(x - 1, y, "╱", color.ship);
      setCell(x, y, "█", color.ship);
      setCell(x + 1, y + 1, "╲", color.ship);
    } else if (tilt > 0) {
      setCell(x - 1, y + 1, "╱", color.ship);
      setCell(x, y, "█", color.ship);
      setCell(x + 1, y, "╲", color.ship);
    } else {
      setCell(x - 1, y, "▟", color.ship);
      setCell(x, y, "█", color.cyan2);
      setCell(x + 1, y, "▙", color.ship);
      setCell(x - 1, y + 1, "╱", color.ship);
      setCell(x + 1, y + 1, "╲", color.ship);
    }
    if (ship.main) {
      setCell(x, y + 2, "╵", color.flame);
      setCell(x, y + 3, state.rng() > 0.5 ? "⠿" : "·", color.orange);
    }
    if (ship.left) setCell(x + 2, y, "╴", color.cyan);
    if (ship.right) setCell(x - 2, y, "╶", color.cyan);
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
    const ship = game.ship;
    const config = difficultyConfig[state.difficulty];
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "LANDER", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 10, "FUEL", color.header);
    const fuelBar = Math.round((ship.fuel / config.fuel) * 20);
    writeText(RIGHT.x + 2, RIGHT.y + 12, `[${"█".repeat(fuelBar)}${" ".repeat(20 - fuelBar)}]`, ship.fuel > 20 ? color.gold : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 14, `ALT   ${String(Math.max(0, Math.round(terrainY(ship.x) - ship.y))).padStart(3, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `VX    ${ship.vx.toFixed(1).padStart(5, " ")}`, Math.abs(ship.vx) <= config.safeVx ? color.green : color.red2);
    writeText(RIGHT.x + 2, RIGHT.y + 16, `VY    ${ship.vy.toFixed(1).padStart(5, " ")}`, Math.abs(ship.vy) <= config.safeVy ? color.green : color.red2);
    writeText(RIGHT.x + 2, RIGHT.y + 18, `ANGLE ${ship.angle.toFixed(2).padStart(5, " ")}`, Math.abs(ship.angle) < 0.38 ? color.green : color.red2);
    writeText(RIGHT.x + 2, RIGHT.y + 21, game.status, game.status === "LANDED" ? color.green : game.status === "CRASH" ? color.red : color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 25, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 18).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 27 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   W/↑/SPACE THRUST   A/← LEFT   D/→ RIGHT   P PAUSE   R REROLL   Y HOME", color.muted);
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

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawSky();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawTerrain();
      drawShip();
      if (state.paused) writeText(SKY.x + 38, SKY.y + 20, "PAUSED", color.green);
      if (state.game.status !== "DESCENT") {
        const fg = state.game.status === "LANDED" ? color.green : color.red;
        writeText(SKY.x + 30, SKY.y + 21, `${state.game.status} - R RESTART`, fg);
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
    if (key === "y" || event.key === "Home") {
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
    if (key === "w" || event.key === "ArrowUp" || event.key === " " || event.code === "Space") {
      event.preventDefault();
      state.input.thrust = true;
    }
    if (key === "a" || event.key === "ArrowLeft") {
      event.preventDefault();
      state.input.left = true;
    }
    if (key === "d" || event.key === "ArrowRight") {
      event.preventDefault();
      state.input.right = true;
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "w" || event.key === "ArrowUp" || event.key === " " || event.code === "Space") state.input.thrust = false;
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
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

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
