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
  const TABLE = { x: 13, y: 7, w: 62, h: 43 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    floor: "#081018",
    floor2: "#0a121b",
    rail: "#344154",
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
    ball: "#f2ffff",
    bumper: "#ffcc66",
    target: "#75f0a8",
  };

  const difficultyConfig = {
    normal: { gravity: 20, damping: 0.993, launch: 51, flipper: 52 },
    fast: { gravity: 23, damping: 0.994, launch: 58, flipper: 60 },
    chaos: { gravity: 26, damping: 0.996, launch: 66, flipper: 70 },
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

  function createBumpers() {
    const drift = (state.seedHash % 7) - 3;
    return [
      { x: TABLE.x + 21, y: TABLE.y + 10, r: 2.5, value: 500, lit: 0 },
      { x: TABLE.x + 39, y: TABLE.y + 11 + drift * 0.2, r: 2.5, value: 500, lit: 0 },
      { x: TABLE.x + 30, y: TABLE.y + 18, r: 3.0, value: 750, lit: 0 },
      { x: TABLE.x + 17, y: TABLE.y + 25, r: 2.2, value: 350, lit: 0 },
      { x: TABLE.x + 44, y: TABLE.y + 25, r: 2.2, value: 350, lit: 0 },
    ];
  }

  function createTargets() {
    return [
      { x: TABLE.x + 8, y: TABLE.y + 15, hit: false },
      { x: TABLE.x + 8, y: TABLE.y + 18, hit: false },
      { x: TABLE.x + 8, y: TABLE.y + 21, hit: false },
      { x: TABLE.x + TABLE.w - 9, y: TABLE.y + 15, hit: false },
      { x: TABLE.x + TABLE.w - 9, y: TABLE.y + 18, hit: false },
      { x: TABLE.x + TABLE.w - 9, y: TABLE.y + 21, hit: false },
    ];
  }

  function resetBall(served = false) {
    const game = state.game;
    game.ball.x = TABLE.x + TABLE.w - 5;
    game.ball.y = TABLE.y + TABLE.h - 6;
    game.ball.vx = served ? -12 - state.rng() * 12 : 0;
    game.ball.vy = served ? -difficultyConfig[state.difficulty].launch : 0;
    game.ball.live = served;
    game.launchCharge = 0;
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
      balls: 3,
      combo: 1,
      status: "READY",
      ball: { x: 0, y: 0, vx: 0, vy: 0, live: false },
      leftFlip: 0,
      rightFlip: 0,
      launchCharge: 0,
      bumpers: createBumpers(),
      targets: createTargets(),
      flash: 0,
    };
    state.effects = [];
    state.trails = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    resetBall(false);
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "TABLE ARMED", "info");
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
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.52;
      const speed = (8 + state.rng() * 26) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.74,
        start: now,
        duration: 420 + state.rng() * 320,
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

  function launchBall() {
    const game = state.game;
    if (game.ball.live || game.balls <= 0) return;
    resetBall(true);
    game.status = "LIVE";
    addLog("LAUNCH", "ok");
    addBurst(game.ball.x, game.ball.y, color.cyan, 18, 0.8);
  }

  function loseBall() {
    const game = state.game;
    game.balls -= 1;
    game.combo = 1;
    addLog("DRAIN", "hit");
    addBurst(game.ball.x, TABLE.y + TABLE.h - 2, color.red, 36, 1.25);
    if (game.balls <= 0) {
      game.status = "GAME OVER";
      game.ball.live = false;
      return;
    }
    game.status = "READY";
    resetBall(false);
  }

  function score(points, x, y, tone = color.gold) {
    const game = state.game;
    const gained = Math.round(points * game.combo);
    game.score += gained;
    game.combo = clamp(game.combo + 0.12, 1, 5);
    game.flash = 0.18;
    addLog(`+${gained}`, "ok");
    addBurst(x, y, tone, 18, 0.85);
  }

  function reflectBall(nx, ny, impulse = 1) {
    const ball = state.game.ball;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot >= 0) return;
    ball.vx = (ball.vx - 2 * dot * nx) * 0.98 + nx * impulse;
    ball.vy = (ball.vy - 2 * dot * ny) * 0.98 + ny * impulse;
  }

  function collideTable() {
    const ball = state.game.ball;
    if (ball.x < TABLE.x + 2) {
      ball.x = TABLE.x + 2;
      reflectBall(1, 0, 2);
      addBurst(ball.x, ball.y, color.cyan, 8, 0.45);
    }
    if (ball.x > TABLE.x + TABLE.w - 3) {
      ball.x = TABLE.x + TABLE.w - 3;
      reflectBall(-1, 0, 2);
      addBurst(ball.x, ball.y, color.cyan, 8, 0.45);
    }
    if (ball.y < TABLE.y + 2) {
      ball.y = TABLE.y + 2;
      reflectBall(0, 1, 3);
      addBurst(ball.x, ball.y, color.cyan, 10, 0.55);
    }
    const drainLeft = TABLE.x + 24;
    const drainRight = TABLE.x + TABLE.w - 24;
    if (ball.y > TABLE.y + TABLE.h - 3 && (ball.x < drainLeft || ball.x > drainRight)) {
      ball.y = TABLE.y + TABLE.h - 3;
      reflectBall(0, -1, 3);
    }
    if (ball.y > TABLE.y + TABLE.h) loseBall();
  }

  function collideBumpers() {
    const ball = state.game.ball;
    for (const bumper of state.game.bumpers) {
      bumper.lit = Math.max(0, bumper.lit - 0.04);
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const dist = Math.hypot(dx, dy);
      if (dist > bumper.r + 0.9 || dist === 0) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = bumper.x + nx * (bumper.r + 0.9);
      ball.y = bumper.y + ny * (bumper.r + 0.9);
      const power = 34 + state.rng() * 16;
      ball.vx = nx * power;
      ball.vy = ny * power - 5;
      bumper.lit = 1;
      score(bumper.value, bumper.x, bumper.y, color.bumper);
    }
  }

  function collideTargets() {
    const ball = state.game.ball;
    for (const target of state.game.targets) {
      if (target.hit || Math.abs(ball.x - target.x) > 1.3 || Math.abs(ball.y - target.y) > 1.1) continue;
      target.hit = true;
      reflectBall(target.x < TABLE.x + TABLE.w / 2 ? 1 : -1, -0.15, 4);
      score(250, target.x, target.y, color.target);
    }
    if (state.game.targets.every((target) => target.hit)) {
      state.game.targets.forEach((target) => (target.hit = false));
      score(2000, TABLE.x + TABLE.w / 2, TABLE.y + 8, color.green);
      addLog("BANK CLEAR", "ok");
    }
  }

  function lineDistance(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const c1 = vx * wx + vy * wy;
    const c2 = vx * vx + vy * vy;
    const t = clamp(c1 / c2, 0, 1);
    const x = ax + vx * t;
    const y = ay + vy * t;
    return { d: Math.hypot(px - x, py - y), x, y, t };
  }

  function flipperSegment(side) {
    const game = state.game;
    const active = side === "left" ? game.leftFlip : game.rightFlip;
    const baseY = TABLE.y + TABLE.h - 7;
    if (side === "left") {
      const ax = TABLE.x + 18;
      const ay = baseY;
      return { ax, ay, bx: ax + 12, by: ay - 1 - active * 4, active };
    }
    const ax = TABLE.x + TABLE.w - 18;
    const ay = baseY;
    return { ax, ay, bx: ax - 12, by: ay - 1 - active * 4, active };
  }

  function collideFlipper(side) {
    const ball = state.game.ball;
    const seg = flipperSegment(side);
    const hit = lineDistance(ball.x, ball.y, seg.ax, seg.ay, seg.bx, seg.by);
    if (hit.d > 1.1 || ball.vy < -12) return;
    const vx = seg.by - seg.ay;
    const vy = -(seg.bx - seg.ax);
    const len = Math.hypot(vx, vy) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const flipPower = difficultyConfig[state.difficulty].flipper * (0.45 + seg.active);
    ball.x += nx * (1.2 - hit.d);
    ball.y += ny * (1.2 - hit.d);
    reflectBall(nx, ny, flipPower);
    if (seg.active > 0.25) {
      ball.vx += side === "left" ? 10 : -10;
      ball.vy -= flipPower * 0.4;
      score(50, hit.x, hit.y, color.cyan);
    }
  }

  function updateInputs(dt) {
    const game = state.game;
    if (state.mode === "demo") {
      game.leftFlip = Math.max(game.leftFlip, game.ball.live && game.ball.y > TABLE.y + TABLE.h - 13 && game.ball.x < TABLE.x + TABLE.w / 2 ? 1 : 0);
      game.rightFlip = Math.max(game.rightFlip, game.ball.live && game.ball.y > TABLE.y + TABLE.h - 13 && game.ball.x >= TABLE.x + TABLE.w / 2 ? 1 : 0);
      if (!game.ball.live && game.status !== "GAME OVER") launchBall();
    }
    game.leftFlip = clamp(game.leftFlip - dt * 5, 0, 1);
    game.rightFlip = clamp(game.rightFlip - dt * 5, 0, 1);
  }

  function updateBall(dt) {
    const game = state.game;
    const ball = game.ball;
    if (!ball.live || game.status !== "LIVE") return;
    const config = difficultyConfig[state.difficulty];
    const oldX = ball.x;
    const oldY = ball.y;
    ball.vy += config.gravity * dt;
    ball.vx *= Math.pow(config.damping, dt * 60);
    ball.vy *= Math.pow(config.damping, dt * 60);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    collideTable();
    collideBumpers();
    collideTargets();
    collideFlipper("left");
    collideFlipper("right");
    if (Math.hypot(ball.x - oldX, ball.y - oldY) > 0.3) addTrail(oldX, oldY, "·", color.ball, 210);
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    game.elapsed += dt;
    game.flash = Math.max(0, game.flash - dt);
    updateInputs(dt);
    updateBall(dt);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 117);
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
    writeText(FIELD.x + 2, FIELD.y - 2, "PINBALL VECTOR TABLE", color.header);
    writeText(FIELD.x + 70, FIELD.y - 2, "GLYPH PHYSICS", color.gold);
  }

  function drawTable() {
    drawBox(TABLE.x, TABLE.y, TABLE.w, TABLE.h, color.rail);
    for (let y = TABLE.y + 1; y < TABLE.y + TABLE.h - 1; y += 1) {
      for (let x = TABLE.x + 1; x < TABLE.x + TABLE.w - 1; x += 1) {
        const bg = (x + y) % 3 === 0 ? color.floor2 : color.floor;
        screen.bg[idx(x, y)] = bg;
        if (hash01(x, y, 201) > 0.93) setCell(x, y, "·", color.dim, bg);
      }
    }
    for (let i = 0; i < 16; i += 1) {
      setCell(TABLE.x + 3 + i, TABLE.y + 4 + Math.floor(i * 0.45), "╲", color.line);
      setCell(TABLE.x + TABLE.w - 4 - i, TABLE.y + 4 + Math.floor(i * 0.45), "╱", color.line);
    }
    for (let y = TABLE.y + 5; y < TABLE.y + TABLE.h - 4; y += 1) {
      setCell(TABLE.x + TABLE.w - 6, y, "║", color.lineDim);
    }
    writeText(TABLE.x + TABLE.w - 10, TABLE.y + TABLE.h - 4, "LANE", color.muted);
  }

  function drawBumpers() {
    for (const bumper of state.game.bumpers) {
      const fg = bumper.lit > 0 ? color.cyan2 : color.bumper;
      const glyph = bumper.lit > 0 ? "◉" : "◎";
      setCell(bumper.x, bumper.y, glyph, fg, "#161109");
      setCell(bumper.x - 1, bumper.y, "(", color.orange);
      setCell(bumper.x + 1, bumper.y, ")", color.orange);
      setCell(bumper.x, bumper.y - 1, "╷", color.orange);
      setCell(bumper.x, bumper.y + 1, "╵", color.orange);
    }
  }

  function drawTargets() {
    for (const target of state.game.targets) {
      const fg = target.hit ? color.green : color.target;
      setCell(target.x, target.y - 1, "▌", fg);
      setCell(target.x, target.y, "▌", fg);
      setCell(target.x, target.y + 1, "▌", fg);
    }
  }

  function drawLine(ax, ay, bx, by, glyph, fg) {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      setCell(lerp(ax, bx, t), lerp(ay, by, t), glyph, fg);
    }
  }

  function drawFlippers() {
    const left = flipperSegment("left");
    const right = flipperSegment("right");
    drawLine(left.ax, left.ay, left.bx, left.by, left.active > 0.2 ? "█" : "▀", left.active > 0.2 ? color.cyan2 : color.cyan);
    drawLine(right.ax, right.ay, right.bx, right.by, right.active > 0.2 ? "█" : "▀", right.active > 0.2 ? color.cyan2 : color.cyan);
  }

  function drawBall() {
    const ball = state.game.ball;
    if (!ball.live && state.game.status === "GAME OVER") return;
    setCell(ball.x - 1, ball.y, "◖", color.ball);
    setCell(ball.x, ball.y, "●", color.cyan2);
    setCell(ball.x + 1, ball.y, "◗", color.ball);
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "PINBALL", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(7, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `BALLS ${"●".repeat(Math.max(0, game.balls)).padEnd(5, " ")}`, color.ball);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 11, "COMBO", color.header);
    const combo = Math.round(game.combo * 4);
    writeText(RIGHT.x + 2, RIGHT.y + 13, `[${"█".repeat(combo)}${" ".repeat(Math.max(0, 20 - combo))}]`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `${game.combo.toFixed(1)}X`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 18, "TARGETS", color.header);
    const hits = game.targets.filter((target) => target.hit).length;
    writeText(RIGHT.x + 2, RIGHT.y + 20, `[${"█".repeat(hits * 3)}${" ".repeat(18 - hits * 3)}]`, color.target);
    writeText(RIGHT.x + 2, RIGHT.y + 22, game.status, game.status === "GAME OVER" ? color.red : color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 26, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 18).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 28 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   A/← LEFT   D/→ RIGHT   SPACE LAUNCH   P PAUSE   R REROLL   E HOME", color.muted);
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
    drawTable();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawTargets();
      drawBumpers();
      drawFlippers();
      drawBall();
      if (state.paused) writeText(TABLE.x + 24, TABLE.y + 21, "PAUSED", color.green);
      if (state.game.status === "GAME OVER") writeText(TABLE.x + 21, TABLE.y + 21, "GAME OVER - R RESTART", color.red);
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
    if (key === "e" || event.key === "Home") {
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
    if (key === "a" || event.key === "ArrowLeft") {
      event.preventDefault();
      state.game.leftFlip = 1;
      return;
    }
    if (key === "d" || event.key === "ArrowRight") {
      event.preventDefault();
      state.game.rightFlip = 1;
      return;
    }
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      launchBall();
    }
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
