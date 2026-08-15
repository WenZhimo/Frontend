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
  const GROUND_Y = FIELD.y + FIELD.h - 4;
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
    city: "#f2ffff",
    interceptor: "#6ed5ec",
    missile: "#ff4d5f",
    blast: "#ffcc66",
  };

  const difficultyConfig = {
    normal: { spawn: 1.1, speed: 10.5, salvo: 22, split: 0.08 },
    fast: { spawn: 0.82, speed: 13.5, salvo: 20, split: 0.14 },
    chaos: { spawn: 0.58, speed: 16.5, salvo: 18, split: 0.22 },
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
    pointer: { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 },
    game: null,
    trails: [],
    effects: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
  };

  function idx(x, y) { return y * COLS + x; }
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

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const cityXs = [FIELD.x + 10, FIELD.x + 23, FIELD.x + 36, FIELD.x + 62, FIELD.x + 75, FIELD.x + 88];
    state.game = {
      elapsed: 0,
      wave: 1,
      score: 0,
      ammo: difficultyConfig[state.difficulty].salvo,
      status: "LIVE",
      spawnCd: 0.25,
      missiles: [],
      interceptors: [],
      blasts: [],
      cities: cityXs.map((x, i) => ({ x, y: GROUND_Y, alive: true, id: i })),
      batteries: [
        { x: FIELD.x + 4, y: GROUND_Y, ammo: 8 },
        { x: FIELD.x + FIELD.w / 2, y: GROUND_Y, ammo: 8 },
        { x: FIELD.x + FIELD.w - 5, y: GROUND_Y, ammo: 8 },
      ],
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "CITIES ARMED", "info");
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
  function addTrail(x, y, glyph, baseColor, duration = 220) {
    if (reducedMotion) return;
    state.trails.push({ x, y, glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-360);
  }
  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.42;
      const speed = (8 + state.rng() * 24) * power;
      state.effects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.75, start: now, duration: 430 + state.rng() * 330, color: baseColor, glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒", "░"][Math.floor(state.rng() * 7)] });
    }
  }

  function spawnMissile() {
    const game = state.game;
    const aliveTargets = game.cities.filter((city) => city.alive).concat(game.batteries);
    if (!aliveTargets.length) return;
    const target = aliveTargets[Math.floor(state.rng() * aliveTargets.length)];
    const sx = FIELD.x + 3 + state.rng() * (FIELD.w - 6);
    const sy = FIELD.y + 1;
    const dx = target.x - sx;
    const dy = target.y - sy;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = difficultyConfig[state.difficulty].speed * (0.78 + state.rng() * 0.45);
    game.missiles.push({ x: sx, y: sy, sx, sy, tx: target.x, ty: target.y, vx: (dx / dist) * speed, vy: (dy / dist) * speed, split: state.rng() < difficultyConfig[state.difficulty].split, age: 0 });
  }

  function launchInterceptor(targetX, targetY) {
    const game = state.game;
    if (game.ammo <= 0 || game.status !== "LIVE") return false;
    const battery = game.batteries.filter((b) => b.ammo > 0).sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
    if (!battery) return false;
    const dx = targetX - battery.x;
    const dy = targetY - battery.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 36;
    game.interceptors.push({ x: battery.x, y: battery.y - 1, tx: targetX, ty: targetY, vx: (dx / dist) * speed, vy: (dy / dist) * speed, age: 0 });
    battery.ammo -= 1;
    game.ammo -= 1;
    addLog("INTERCEPTOR", "info");
    return true;
  }

  function autoFire() {
    const game = state.game;
    const target = game.missiles
      .filter((m) => m.y > FIELD.y + 4)
      .sort((a, b) => b.y - a.y || Math.abs(a.x - FIELD.x - FIELD.w / 2) - Math.abs(b.x - FIELD.x - FIELD.w / 2))[0];
    if (!target) return;
    const already = game.interceptors.some((i) => Math.hypot(i.tx - target.x, i.ty - target.y) < 9);
    if (!already) launchInterceptor(target.x + target.vx * 0.28, target.y + target.vy * 0.28);
  }

  function makeBlast(x, y, friendly = true) {
    state.game.blasts.push({ x, y, r: 0, max: friendly ? 8.4 : 6.2, grow: friendly ? 20 : 17, start: performance.now(), friendly });
    addBurst(x, y, friendly ? color.cyan : color.red, friendly ? 24 : 36, friendly ? 0.85 : 1.1);
  }

  function hitGround(missile) {
    const game = state.game;
    const city = game.cities.find((c) => c.alive && Math.abs(c.x - missile.x) < 4 && Math.abs(c.y - missile.y) < 4);
    if (city) {
      city.alive = false;
      addLog("CITY LOST", "hit");
    } else {
      const battery = game.batteries.find((b) => Math.abs(b.x - missile.x) < 4);
      if (battery) {
        battery.ammo = 0;
        addLog("BATTERY HIT", "hit");
      }
    }
    makeBlast(missile.x, missile.y, false);
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    game.spawnCd -= dt;
    if (game.spawnCd <= 0) {
      spawnMissile();
      game.spawnCd = Math.max(0.16, difficultyConfig[state.difficulty].spawn - game.wave * 0.025 + state.rng() * 0.45);
    }
    if (state.mode === "demo" && state.rng() > 0.88) autoFire();
    for (const missile of game.missiles) {
      missile.x += missile.vx * dt;
      missile.y += missile.vy * dt;
      missile.age += dt;
      addTrail(missile.x - missile.vx * 0.025, missile.y - missile.vy * 0.025, "╲", color.red, 260);
      if (missile.split && missile.age > 1.1) {
        missile.split = false;
        const target = game.cities.filter((city) => city.alive).sort(() => state.rng() - 0.5)[0];
        if (target) {
          const dx = target.x - missile.x, dy = target.y - missile.y, dist = Math.hypot(dx, dy) || 1;
          game.missiles.push({ x: missile.x, y: missile.y, sx: missile.x, sy: missile.y, tx: target.x, ty: target.y, vx: (dx / dist) * difficultyConfig[state.difficulty].speed, vy: (dy / dist) * difficultyConfig[state.difficulty].speed, split: false, age: 0 });
          addLog("MIRV SPLIT", "hit");
        }
      }
      if (missile.y >= GROUND_Y || Math.hypot(missile.x - missile.tx, missile.y - missile.ty) < 1.3) missile.dead = true;
    }
    for (const interceptor of game.interceptors) {
      interceptor.x += interceptor.vx * dt;
      interceptor.y += interceptor.vy * dt;
      interceptor.age += dt;
      addTrail(interceptor.x - interceptor.vx * 0.02, interceptor.y - interceptor.vy * 0.02, "╱", color.cyan, 220);
      if (Math.hypot(interceptor.x - interceptor.tx, interceptor.y - interceptor.ty) < 1.5 || interceptor.age > 1.9) {
        interceptor.dead = true;
        makeBlast(interceptor.tx, interceptor.ty, true);
      }
    }
    for (const blast of game.blasts) {
      blast.r = Math.min(blast.max, blast.r + blast.grow * dt);
      blast.age = (blast.age || 0) + dt;
      if (blast.age > 0.62) blast.dead = true;
    }
    for (const missile of game.missiles) {
      if (missile.dead && missile.y >= GROUND_Y - 1) hitGround(missile);
      for (const blast of game.blasts) {
        if (blast.friendly && Math.hypot(missile.x - blast.x, missile.y - blast.y) < blast.r) {
          missile.dead = true;
          game.score += 25;
          addLog("MISSILE DOWN", "ok");
          addBurst(missile.x, missile.y, color.gold, 14, 0.6);
        }
      }
    }
    game.missiles = game.missiles.filter((m) => !m.dead);
    game.interceptors = game.interceptors.filter((i) => !i.dead);
    game.blasts = game.blasts.filter((b) => !b.dead);
    if (!game.cities.some((city) => city.alive)) {
      game.status = "CITIES LOST";
      addLog("CITIES LOST", "hit");
    }
    if (game.ammo <= 0 && game.missiles.length === 0 && game.interceptors.length === 0) {
      game.wave += 1;
      game.ammo = difficultyConfig[state.difficulty].salvo + Math.max(0, game.cities.filter((c) => c.alive).length - 2);
      game.batteries.forEach((b) => { b.ammo = Math.ceil(game.ammo / 3); });
      addLog(`WAVE ${game.wave}`, "ok");
    }
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 501);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.965) setCell(x, y, grain > 0.99 ? "✦" : "·", grain > 0.99 ? color.cyan2 : color.dim);
      }
    }
  }
  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    writeText(FIELD.x + 2, FIELD.y - 2, "MISSILE COMMAND", color.header);
    writeText(FIELD.x + 70, FIELD.y - 2, "CITY SHIELD", color.gold);
    for (let x = FIELD.x + 2; x < FIELD.x + FIELD.w - 2; x += 1) setCell(x, GROUND_Y + 2, "▁", color.line);
  }
  function drawCities() {
    for (const city of state.game.cities) {
      if (!city.alive) {
        writeText(city.x - 2, city.y, "░×░", color.dim);
        continue;
      }
      writeText(city.x - 2, city.y - 1, "▟█▙", color.city);
      writeText(city.x - 2, city.y, "███", color.city);
      writeText(city.x - 2, city.y + 1, "▔▔▔", color.green);
    }
    for (const battery of state.game.batteries) {
      const fg = battery.ammo > 0 ? color.cyan : color.dim;
      writeText(battery.x - 2, battery.y - 1, "▄▲▄", fg);
      writeText(battery.x - 2, battery.y, ` ${Math.min(9, battery.ammo)} `, fg);
    }
  }
  function drawMissiles() {
    for (const m of state.game.missiles) {
      setCell(m.x, m.y, "◆", color.missile);
      setCell(m.x - m.vx * 0.04, m.y - m.vy * 0.04, "╲", color.red2);
    }
    for (const i of state.game.interceptors) {
      setCell(i.x, i.y, "◇", color.interceptor);
      setCell(i.x - i.vx * 0.04, i.y - i.vy * 0.04, "╱", color.cyan2);
    }
  }
  function drawBlasts() {
    for (const blast of state.game.blasts) {
      const fg = blast.friendly ? color.cyan : color.red;
      const count = Math.max(10, Math.floor(blast.r * 7));
      for (let n = 0; n < count; n += 1) {
        const a = (n / count) * Math.PI * 2;
        setCell(blast.x + Math.cos(a) * blast.r, blast.y + Math.sin(a) * blast.r * 0.58, n % 2 ? "⠿" : "▓", fg);
      }
      setCell(blast.x, blast.y, "✹", blast.friendly ? color.cyan2 : color.gold);
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "COMMAND", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `WAVE  ${String(game.wave).padStart(2, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `AMMO  ${String(game.ammo).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 11, game.status, game.status === "LIVE" ? color.cyan : color.red);
    const cities = game.cities.filter((c) => c.alive).length;
    writeText(RIGHT.x + 2, RIGHT.y + 14, "CITIES", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 16, `[${"█".repeat(cities * 3)}${" ".repeat(18 - cities * 3)}]`, cities ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 20, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 20).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 22 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   POINTER AIM   SPACE/CLICK FIRE   P PAUSE   R REROLL   D HOME", color.muted);
  }
  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawMissiles();
    drawBlasts();
    drawEffects(now);
    drawCities();
    if (state.mode === "human") {
      setCell(state.pointer.x, state.pointer.y, "╳", color.cyan2);
      setCell(state.pointer.x + 1, state.pointer.y, "─", color.cyan);
      setCell(state.pointer.x - 1, state.pointer.y, "─", color.cyan);
    }
    if (state.paused) writeText(FIELD.x + 42, FIELD.y + 22, "PAUSED", color.green);
    if (state.game.status !== "LIVE") writeText(FIELD.x + 32, FIELD.y + 22, `${state.game.status} - R RESTART`, color.red);
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
    if (key === "d") { event.preventDefault(); goHome(); return; }
    if (key === "p") { event.preventDefault(); state.paused = !state.paused; addLog(state.paused ? "PAUSED" : "RESUMED", "info"); return; }
    if (key === "r") { event.preventDefault(); initGame(randomSeed(), { reroll: true }); return; }
    if (key === " " || event.code === "Space") { event.preventDefault(); launchInterceptor(state.pointer.x, state.pointer.y); }
  });
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    state.pointer.x = clamp(((event.clientX - rect.left) / rect.width) * COLS, FIELD.x + 2, FIELD.x + FIELD.w - 3);
    state.pointer.y = clamp(((event.clientY - rect.top) / rect.height) * ROWS, FIELD.y + 2, GROUND_Y - 2);
  });
  canvas.addEventListener("pointerdown", () => launchInterceptor(state.pointer.x, state.pointer.y));
  seedInput.addEventListener("input", updateSeedStatus);
  seedRandomButton.addEventListener("click", () => { seedInput.value = randomSeed().trimEnd(); updateSeedStatus(); });
  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed);
    seedInput.value = seed.trimEnd();
    updateSeedStatus();
    try { await navigator.clipboard.writeText(seed); seedStatus.value = "COPIED"; } catch { seedStatus.value = "COPY FAIL"; }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); initGame(seedInput.value || randomSeed()); });
  for (const control of [playModeSelect, difficultySelect]) {
    control?.addEventListener("change", () => initGame(seedInput.value || state.seed || randomSeed()));
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
