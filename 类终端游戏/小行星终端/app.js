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
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    ink2: "#0a0f16",
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
    asteroid: "#ffcc66",
    asteroid2: "#ff9f45",
    shot: "#6ed5ec",
    thrust: "#ff4d5f",
  };

  const difficultyConfig = {
    normal: { asteroids: 7, asteroidSpeed: 9.5, turn: 4.6, thrust: 31, fire: 0.24 },
    fast: { asteroids: 9, asteroidSpeed: 12, turn: 5.2, thrust: 36, fire: 0.2 },
    chaos: { asteroids: 11, asteroidSpeed: 14.2, turn: 5.8, thrust: 42, fire: 0.16 },
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
    input: { left: false, right: false, thrust: false, fire: false, pointer: null },
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

  function wrapAngle(angle) {
    while (angle <= -Math.PI) angle += Math.PI * 2;
    while (angle > Math.PI) angle -= Math.PI * 2;
    return angle;
  }

  function updateSeedStatus() {
    seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`;
  }

  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 44);
  }

  function wrapEntity(entity) {
    const minX = FIELD.x + 1;
    const maxX = FIELD.x + FIELD.w - 2;
    const minY = FIELD.y + 1;
    const maxY = FIELD.y + FIELD.h - 2;
    if (entity.x < minX) entity.x = maxX;
    if (entity.x > maxX) entity.x = minX;
    if (entity.y < minY) entity.y = maxY;
    if (entity.y > maxY) entity.y = minY;
  }

  function createShip() {
    return {
      x: FIELD.x + FIELD.w / 2,
      y: FIELD.y + FIELD.h / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      cooldown: 0,
      invuln: 1.5,
      thrusting: false,
    };
  }

  function createAsteroid(size, x = null, y = null) {
    const r = size === 3 ? 4.2 : size === 2 ? 2.9 : 1.8;
    let ax = x ?? FIELD.x + 5 + state.rng() * (FIELD.w - 10);
    let ay = y ?? FIELD.y + 5 + state.rng() * (FIELD.h - 10);
    const cx = FIELD.x + FIELD.w / 2;
    const cy = FIELD.y + FIELD.h / 2;
    if (Math.hypot(ax - cx, ay - cy) < 15) {
      ax += ax < cx ? -17 : 17;
      ay += ay < cy ? -9 : 9;
    }
    const speed = difficultyConfig[state.difficulty].asteroidSpeed * (0.62 + state.rng() * 0.75) / Math.sqrt(size);
    const angle = state.rng() * Math.PI * 2;
    const rough = Array.from({ length: 14 }, () => 0.78 + state.rng() * 0.5);
    return {
      x: clamp(ax, FIELD.x + 4, FIELD.x + FIELD.w - 5),
      y: clamp(ay, FIELD.y + 4, FIELD.y + FIELD.h - 5),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.72,
      rot: state.rng() * Math.PI * 2,
      spin: (state.rng() - 0.5) * 1.4,
      size,
      r,
      rough,
    };
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const config = difficultyConfig[state.difficulty];
    state.game = {
      elapsed: 0,
      wave: 1,
      score: 0,
      lives: 3,
      status: "LIVE",
      ship: createShip(),
      asteroids: Array.from({ length: config.asteroids }, () => createAsteroid(3)),
      bullets: [],
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "ASTEROID FIELD", "info");
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.48;
      const speed = (8 + state.rng() * 25) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        start: now,
        duration: 430 + state.rng() * 360,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒", "░"][Math.floor(state.rng() * 7)],
      });
    }
  }

  function addTrail(x, y, glyph, baseColor, duration = 230) {
    if (reducedMotion) return;
    state.trails.push({
      x: Math.round(x),
      y: Math.round(y),
      glyph,
      color: baseColor,
      start: performance.now(),
      duration,
    });
    state.trails = state.trails.slice(-220);
  }

  function fireBullet() {
    const game = state.game;
    const ship = game.ship;
    if (ship.cooldown > 0 || game.status !== "LIVE") return;
    const speed = 58;
    const nx = Math.cos(ship.angle);
    const ny = Math.sin(ship.angle);
    game.bullets.push({
      x: ship.x + nx * 2.8,
      y: ship.y + ny * 2.8,
      vx: ship.vx + nx * speed,
      vy: ship.vy + ny * speed * 0.78,
      age: 0,
      life: 1.25,
    });
    ship.cooldown = difficultyConfig[state.difficulty].fire;
    addTrail(ship.x + nx * 2.4, ship.y + ny * 2.4, "╳", color.shot, 170);
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

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 77);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.968) setCell(x, y, grain > 0.99 ? "✦" : "·", grain > 0.99 ? color.cyan : color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        screen.bg[idx(x, y)] = y % 4 === 0 ? "#070d14" : "#081018";
        const star = hash01(x, y, 93);
        if (star > 0.957) setCell(x, y, star > 0.987 ? "✦" : "·", star > 0.987 ? color.cyan2 : color.dim);
      }
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "VECTOR ASTEROID FIELD", color.header);
    writeText(FIELD.x + 73, FIELD.y - 2, "WRAPSPACE", color.gold);
  }

  function asteroidPoint(asteroid, i, total) {
    const a = asteroid.rot + (i / total) * Math.PI * 2;
    const rough = asteroid.rough[i % asteroid.rough.length];
    return {
      x: asteroid.x + Math.cos(a) * asteroid.r * rough,
      y: asteroid.y + Math.sin(a) * asteroid.r * rough * 0.62,
    };
  }

  function drawAsteroid(asteroid) {
    const points = asteroid.size === 3 ? 18 : asteroid.size === 2 ? 14 : 10;
    const fg = asteroid.size === 3 ? color.asteroid : asteroid.size === 2 ? color.orange : color.red2;
    for (let i = 0; i < points; i += 1) {
      const p = asteroidPoint(asteroid, i, points);
      const ch = ["⣀", "⣤", "⡆", "⠿", "⢀", "▓"][i % 6];
      setCell(p.x, p.y, ch, fg);
    }
    if (asteroid.size >= 2) {
      setCell(asteroid.x, asteroid.y, asteroid.size === 3 ? "▒" : "░", mixColor(fg, color.ink, 0.25));
      setCell(asteroid.x + 1, asteroid.y, "·", mixColor(fg, color.ink, 0.15));
    }
  }

  function drawShip(now) {
    const ship = state.game.ship;
    const blink = ship.invuln > 0 && Math.floor(now / 90) % 2 === 0;
    if (blink) return;
    const dirs = [
      { glyph: "►", nose: [2, 0], left: [-1, -1], right: [-1, 1] },
      { glyph: "◢", nose: [2, 1], left: [0, -1], right: [-1, 1] },
      { glyph: "▼", nose: [0, 2], left: [-1, -1], right: [1, -1] },
      { glyph: "◣", nose: [-2, 1], left: [1, -1], right: [0, 1] },
      { glyph: "◄", nose: [-2, 0], left: [1, -1], right: [1, 1] },
      { glyph: "◤", nose: [-2, -1], left: [0, 1], right: [1, -1] },
      { glyph: "▲", nose: [0, -2], left: [-1, 1], right: [1, 1] },
      { glyph: "◥", nose: [2, -1], left: [-1, -1], right: [0, 1] },
    ];
    const sector = Math.round((((ship.angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 8) % 8;
    const d = dirs[sector];
    setCell(ship.x, ship.y, d.glyph, color.ship);
    setCell(ship.x + d.nose[0], ship.y + d.nose[1], "⠿", color.cyan2);
    setCell(ship.x + d.left[0], ship.y + d.left[1], "▟", color.ship);
    setCell(ship.x + d.right[0], ship.y + d.right[1], "▙", color.ship);
    if (ship.thrusting) {
      const backX = ship.x - Math.cos(ship.angle) * 2.2;
      const backY = ship.y - Math.sin(ship.angle) * 2.2;
      setCell(backX, backY, "▓", color.thrust);
      setCell(backX - Math.cos(ship.angle), backY - Math.sin(ship.angle), "▒", color.orange);
    }
  }

  function drawBullets() {
    for (const bullet of state.game.bullets) {
      setCell(bullet.x, bullet.y, "◆", color.shot);
      setCell(bullet.x - bullet.vx * 0.015, bullet.y - bullet.vy * 0.015, "╳", color.cyan);
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "MISSION", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `WAVE  ${String(game.wave).padStart(2, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `LIVES ${"♥".repeat(game.lives).padEnd(5, " ")}`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);

    writeText(RIGHT.x + 2, RIGHT.y + 12, "FIELD", color.header);
    const totalMass = game.asteroids.reduce((sum, asteroid) => sum + asteroid.size, 0);
    const bar = clamp(Math.round((totalMass / (difficultyConfig[state.difficulty].asteroids * 3)) * 20), 0, 20);
    writeText(RIGHT.x + 2, RIGHT.y + 14, `[${"█".repeat(bar)}${" ".repeat(20 - bar)}]`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 16, game.status, game.status === "LIVE" ? color.cyan : color.red);

    writeText(RIGHT.x + 2, RIGHT.y + 20, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 19).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 22 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   ←/→ ROTATE   ↑ THRUST   SPACE FIRE   P PAUSE   R REROLL   X HOME", color.muted);
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

  function nearestAsteroid() {
    const ship = state.game.ship;
    return state.game.asteroids
      .map((asteroid) => ({ asteroid, dist: Math.hypot(asteroid.x - ship.x, asteroid.y - ship.y) }))
      .sort((a, b) => a.dist - b.dist)[0]?.asteroid;
  }

  function driveAI(dt) {
    const game = state.game;
    const ship = game.ship;
    const target = nearestAsteroid();
    if (!target) return;
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const dist = Math.hypot(dx, dy);
    let desired = Math.atan2(dy, dx);
    const danger = game.asteroids.find((asteroid) => Math.hypot(asteroid.x - ship.x, asteroid.y - ship.y) < asteroid.r + 8);
    let thrusting = false;
    if (danger) {
      desired = Math.atan2(ship.y - danger.y, ship.x - danger.x);
      thrusting = true;
    } else if (dist > 22 || Math.hypot(ship.vx, ship.vy) < 4) {
      thrusting = true;
    }
    const delta = wrapAngle(desired - ship.angle);
    const turn = difficultyConfig[state.difficulty].turn * dt;
    ship.angle = wrapAngle(ship.angle + clamp(delta, -turn, turn));
    ship.thrusting = thrusting;
    if (Math.abs(delta) < 0.22 && dist < 46) fireBullet();
  }

  function applyHuman(dt) {
    const ship = state.game.ship;
    const config = difficultyConfig[state.difficulty];
    const turnDir = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    ship.angle = wrapAngle(ship.angle + turnDir * config.turn * dt);
    ship.thrusting = state.input.thrust;
    if (state.input.fire) fireBullet();
  }

  function updateShip(dt) {
    const game = state.game;
    const ship = game.ship;
    if (state.mode === "demo") driveAI(dt);
    else applyHuman(dt);
    if (ship.thrusting) {
      const config = difficultyConfig[state.difficulty];
      ship.vx += Math.cos(ship.angle) * config.thrust * dt;
      ship.vy += Math.sin(ship.angle) * config.thrust * dt * 0.78;
      addTrail(ship.x - Math.cos(ship.angle) * 2.2, ship.y - Math.sin(ship.angle) * 2.2, "▓", color.thrust, 210);
      addTrail(ship.x - Math.cos(ship.angle) * 3.2, ship.y - Math.sin(ship.angle) * 3.2, "▒", color.orange, 250);
    }
    ship.vx *= Math.pow(0.988, dt * 60);
    ship.vy *= Math.pow(0.988, dt * 60);
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 36) {
      ship.vx = (ship.vx / speed) * 36;
      ship.vy = (ship.vy / speed) * 36;
    }
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrapEntity(ship);
    ship.cooldown = Math.max(0, ship.cooldown - dt);
    ship.invuln = Math.max(0, ship.invuln - dt);
  }

  function splitAsteroid(asteroid) {
    const game = state.game;
    const baseScore = asteroid.size === 3 ? 40 : asteroid.size === 2 ? 90 : 160;
    game.score += baseScore;
    addLog(`ROCK SPLIT +${baseScore}`, "ok");
    addBurst(asteroid.x, asteroid.y, asteroid.size === 1 ? color.red : color.gold, 16 + asteroid.size * 12, 0.8 + asteroid.size * 0.2);
    if (asteroid.size <= 1) return;
    for (let i = 0; i < 2; i += 1) {
      const child = createAsteroid(asteroid.size - 1, asteroid.x + (state.rng() - 0.5) * 3, asteroid.y + (state.rng() - 0.5) * 3);
      child.vx += asteroid.vx * 0.35 + (state.rng() - 0.5) * 11;
      child.vy += asteroid.vy * 0.35 + (state.rng() - 0.5) * 8;
      game.asteroids.push(child);
    }
  }

  function loseLife() {
    const game = state.game;
    const ship = game.ship;
    game.lives -= 1;
    addLog("HULL BREACH", "hit");
    addBurst(ship.x, ship.y, color.red, 58, 1.35);
    game.bullets = [];
    if (game.lives <= 0) {
      game.status = "SHIP LOST";
      addLog("SHIP LOST", "hit");
      return;
    }
    game.ship = createShip();
    game.ship.invuln = 2.1;
  }

  function nextWave() {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    game.wave += 1;
    const count = config.asteroids + Math.min(5, game.wave - 1);
    game.asteroids = Array.from({ length: count }, () => createAsteroid(3));
    game.bullets = [];
    game.ship.invuln = 1.7;
    addLog(`WAVE ${game.wave}`, "ok");
    addBurst(FIELD.x + FIELD.w / 2, FIELD.y + FIELD.h / 2, color.cyan, 42, 1.1);
  }

  function updateBullets(dt) {
    const game = state.game;
    for (const bullet of game.bullets) {
      const oldX = bullet.x;
      const oldY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.age += dt;
      wrapEntity(bullet);
      addTrail(oldX, oldY, "╳", color.shot, 210);
    }
    game.bullets = game.bullets.filter((bullet) => bullet.age < bullet.life);
  }

  function updateAsteroids(dt) {
    for (const asteroid of state.game.asteroids) {
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.rot += asteroid.spin * dt;
      wrapEntity(asteroid);
      if (!reducedMotion && state.rng() > 0.94) addTrail(asteroid.x, asteroid.y, "░", color.asteroid, 180);
    }
  }

  function updateCollisions() {
    const game = state.game;
    const ship = game.ship;
    const removed = new Set();
    const deadBullets = new Set();
    for (let b = 0; b < game.bullets.length; b += 1) {
      const bullet = game.bullets[b];
      for (let a = 0; a < game.asteroids.length; a += 1) {
        if (removed.has(a)) continue;
        const asteroid = game.asteroids[a];
        if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) <= asteroid.r + 0.8) {
          removed.add(a);
          deadBullets.add(b);
          splitAsteroid(asteroid);
          break;
        }
      }
    }
    game.bullets = game.bullets.filter((_, i) => !deadBullets.has(i));
    game.asteroids = game.asteroids.filter((_, i) => !removed.has(i));
    if (ship.invuln <= 0) {
      const hit = game.asteroids.some((asteroid) => Math.hypot(ship.x - asteroid.x, ship.y - asteroid.y) <= asteroid.r + 1.6);
      if (hit) loseLife();
    }
    if (game.status === "LIVE" && game.asteroids.length === 0) nextWave();
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    updateShip(dt);
    updateBullets(dt);
    updateAsteroids(dt);
    updateCollisions();
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      state.game.asteroids.forEach(drawAsteroid);
      drawBullets();
      drawShip(now);
      if (state.paused) writeText(FIELD.x + 42, FIELD.y + 23, "PAUSED", color.green);
      if (state.game.status !== "LIVE") writeText(FIELD.x + 33, FIELD.y + 23, `${state.game.status} - R RESTART`, color.red);
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
    if (key === "x") {
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
    if (key === " " || event.code === "Space") {
      event.preventDefault();
      state.input.fire = true;
      fireBullet();
      return;
    }
    if (key === "a" || event.key === "ArrowLeft") state.input.left = true;
    if (key === "d" || event.key === "ArrowRight") state.input.right = true;
    if (key === "w" || event.key === "ArrowUp") state.input.thrust = true;
    if (["a", "d", "w", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (key === "w" || event.key === "ArrowUp") state.input.thrust = false;
    if (key === " " || event.code === "Space") state.input.fire = false;
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * COLS;
    const y = ((event.clientY - rect.top) / rect.height) * ROWS;
    const ship = state.game?.ship;
    if (ship && state.mode === "human") {
      ship.angle = Math.atan2(y - ship.y, x - ship.x);
      state.input.pointer = { x, y };
    }
  });

  canvas.addEventListener("pointerdown", () => {
    state.input.thrust = true;
    fireBullet();
  });

  canvas.addEventListener("pointerup", () => {
    state.input.thrust = false;
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
