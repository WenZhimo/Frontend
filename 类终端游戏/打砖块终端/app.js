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
  const BRICK_COLS = 12;
  const BRICK_ROWS = 7;
  const BRICK_W = 7;
  const BRICK_H = 2;
  const BRICK_GAP = 1;
  const PADDLE_Y = FIELD.y + FIELD.h - 4;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0a0f16",
    panel: "#080c12",
    panel2: "#0d141d",
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
    brickA: "#ffcc66",
    brickB: "#ff8248",
    brickC: "#6ed5ec",
    brickD: "#f2ffff",
    paddle: "#f2ffff",
    paddleEdge: "#75f0a8",
    ball: "#ff4d5f",
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
    input: { left: false, right: false, pointerX: null },
    game: null,
    effects: [],
    trails: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
    status: "BOOT",
  };

  const difficultyConfig = {
    normal: { ball: 21, paddle: 42, rows: 6 },
    fast: { ball: 28, paddle: 48, rows: 7 },
    chaos: { ball: 32, paddle: 52, rows: 7 },
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

  function createBricks(rows) {
    const bricks = [];
    const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
    const startX = FIELD.x + Math.floor((FIELD.w - totalW) / 2);
    const startY = FIELD.y + 5;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < BRICK_COLS; x += 1) {
        const jitter = hash01(x, y, 12) < 0.22 ? 1 : 0;
        const hp = y < 2 ? 2 : 1;
        bricks.push({
          x: startX + x * (BRICK_W + BRICK_GAP),
          y: startY + y * (BRICK_H + 1),
          w: BRICK_W,
          h: BRICK_H,
          hp,
          maxHp: hp,
          hue: (x + y + jitter) % 4,
          alive: true,
        });
      }
    }
    return bricks;
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const config = difficultyConfig[state.difficulty];
    const angle = -Math.PI / 2 + (state.rng() - 0.5) * 0.62;
    state.game = {
      level: 1,
      score: 0,
      lives: 3,
      combo: 0,
      elapsed: 0,
      ballSpeed: config.ball,
      paddleSpeed: config.paddle,
      paddle: {
        x: FIELD.x + FIELD.w / 2 - 8,
        y: PADDLE_Y,
        w: 16,
        h: 1.5,
      },
      ball: {
        x: FIELD.x + FIELD.w / 2,
        y: PADDLE_Y - 4,
        vx: Math.cos(angle) * config.ball,
        vy: Math.sin(angle) * config.ball,
        r: 0.82,
      },
      bricks: createBricks(config.rows),
    };
    state.effects = [];
    state.trails = [];
    state.paused = false;
    state.status = reroll ? "REROLLED" : "READY";
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(`SEED ${state.seed.slice(0, 18)}...`, "info");
  }

  function relaunchBall() {
    const game = state.game;
    const angle = -Math.PI / 2 + (state.rng() - 0.5) * 0.68;
    game.ball.x = game.paddle.x + game.paddle.w / 2;
    game.ball.y = game.paddle.y - 4;
    game.ball.vx = Math.cos(angle) * game.ballSpeed;
    game.ball.vy = Math.sin(angle) * game.ballSpeed;
    game.combo = 0;
  }

  function addBurst(x, y, baseColor, count = 24, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.45;
      const speed = (8 + state.rng() * 20) * power;
      state.effects.push({
        type: "particle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7,
        start: now,
        duration: 520 + state.rng() * 340,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)],
      });
    }
    state.effects.push({
      type: "ring",
      x,
      y,
      start: now,
      duration: 520,
      color: baseColor,
      power,
    });
  }

  function addTrail(x, y) {
    state.trails.push({
      x,
      y,
      start: performance.now(),
      duration: 280,
      color: color.red,
    });
    state.trails = state.trails.slice(-32);
  }

  function brickColor(brick) {
    const colors = [color.brickA, color.brickB, color.brickC, color.brickD];
    const base = colors[brick.hue % colors.length];
    return brick.hp < brick.maxHp ? mixColor(base, color.red, 0.36) : base;
  }

  function reflectFromPaddle() {
    const game = state.game;
    const ball = game.ball;
    const paddle = game.paddle;
    const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const clampedHit = clamp(hit, -1, 1);
    const speed = Math.hypot(ball.vx, ball.vy) * 1.012;
    const angle = -Math.PI / 2 + clampedHit * 0.95;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.y = paddle.y - ball.r - 0.3;
    game.combo = 0;
    addBurst(ball.x, paddle.y, color.cyan, 14, 0.7);
    addLog("PADDLE DEFLECT", "info");
  }

  function advanceGame(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    const scaledDt = Math.min(0.032, dt) * state.speed;
    game.elapsed += scaledDt;

    if (state.mode === "demo") {
      const target = game.ball.x - game.paddle.w / 2 + game.ball.vx * 0.08;
      const delta = clamp(target - game.paddle.x, -game.paddleSpeed * scaledDt, game.paddleSpeed * scaledDt);
      game.paddle.x += delta;
    } else {
      const dir = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
      game.paddle.x += dir * game.paddleSpeed * scaledDt;
      if (state.input.pointerX !== null) {
        game.paddle.x = lerp(game.paddle.x, state.input.pointerX - game.paddle.w / 2, 0.32);
      }
    }
    game.paddle.x = clamp(game.paddle.x, FIELD.x + 2, FIELD.x + FIELD.w - game.paddle.w - 2);

    const substeps = Math.max(1, Math.ceil(Math.hypot(game.ball.vx, game.ball.vy) * scaledDt / 0.75));
    const stepDt = scaledDt / substeps;
    for (let i = 0; i < substeps; i += 1) {
      moveBall(stepDt);
    }
  }

  function moveBall(dt) {
    const game = state.game;
    const ball = game.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    addTrail(ball.x, ball.y);

    if (ball.x - ball.r <= FIELD.x + 1) {
      ball.x = FIELD.x + 1 + ball.r;
      ball.vx = Math.abs(ball.vx);
      addBurst(ball.x, ball.y, color.cyan, 8, 0.45);
    } else if (ball.x + ball.r >= FIELD.x + FIELD.w - 1) {
      ball.x = FIELD.x + FIELD.w - 1 - ball.r;
      ball.vx = -Math.abs(ball.vx);
      addBurst(ball.x, ball.y, color.cyan, 8, 0.45);
    }

    if (ball.y - ball.r <= FIELD.y + 1) {
      ball.y = FIELD.y + 1 + ball.r;
      ball.vy = Math.abs(ball.vy);
      addBurst(ball.x, ball.y, color.cyan, 8, 0.45);
    }

    const paddle = game.paddle;
    const paddleHit =
      ball.vy > 0 &&
      ball.x + ball.r >= paddle.x &&
      ball.x - ball.r <= paddle.x + paddle.w &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h;
    if (paddleHit) reflectFromPaddle();

    for (const brick of game.bricks) {
      if (!brick.alive) continue;
      const hit =
        ball.x + ball.r >= brick.x &&
        ball.x - ball.r <= brick.x + brick.w &&
        ball.y + ball.r >= brick.y &&
        ball.y - ball.r <= brick.y + brick.h;
      if (!hit) continue;
      brick.hp -= 1;
      game.combo += 1;
      game.score += 50 * game.combo;
      const cx = clamp(ball.x, brick.x, brick.x + brick.w);
      const cy = clamp(ball.y, brick.y, brick.y + brick.h);
      const overlapX = Math.min(Math.abs(ball.x - brick.x), Math.abs(ball.x - (brick.x + brick.w)));
      const overlapY = Math.min(Math.abs(ball.y - brick.y), Math.abs(ball.y - (brick.y + brick.h)));
      if (overlapX < overlapY) ball.vx *= -1;
      else ball.vy *= -1;
      const base = brickColor(brick);
      if (brick.hp <= 0) {
        brick.alive = false;
        game.ballSpeed *= 1.006;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 0) {
          ball.vx = (ball.vx / speed) * game.ballSpeed;
          ball.vy = (ball.vy / speed) * game.ballSpeed;
        }
        addBurst(brick.x + brick.w / 2, brick.y + brick.h / 2, base, 28, 1);
        addLog(`BRICK DOWN +${50 * game.combo}`, "hit");
      } else {
        addBurst(cx, cy, base, 12, 0.55);
        addLog("ARMOR CRACK", "info");
      }
      break;
    }

    if (ball.y - ball.r > FIELD.y + FIELD.h) {
      game.lives -= 1;
      addBurst(ball.x, FIELD.y + FIELD.h - 2, color.red, 40, 1.2);
      addLog(game.lives > 0 ? "BALL LOST" : "GAME OVER", "danger");
      if (game.lives <= 0) {
        initGame(state.seed);
      } else {
        relaunchBall();
      }
    }

    if (game.bricks.every((brick) => !brick.alive)) {
      addBurst(FIELD.x + FIELD.w / 2, FIELD.y + FIELD.h / 2, color.gold, 74, 1.6);
      addLog(`LEVEL ${game.level} CLEAR`, "ok");
      game.level += 1;
      game.ballSpeed *= 1.1;
      game.bricks = createBricks(difficultyConfig[state.difficulty].rows);
      relaunchBall();
    }
  }

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.dim;
      screen.bg[i] = color.ink;
    }
  }

  function put(x, y, ch, fg = color.text, bg = null) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
    const index = idx(ix, iy);
    screen.ch[index] = ch;
    screen.fg[index] = fg;
    if (bg) screen.bg[index] = bg;
  }

  function putText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) put(x + i, y, text[i], fg, bg);
  }

  function fillRect(x, y, w, h, bg, ch = " ", fg = color.dim) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) put(xx, yy, ch, fg, bg);
    }
  }

  function strokeRect(x, y, w, h, fg = color.line) {
    for (let xx = x; xx < x + w; xx += 1) {
      put(xx, y, xx === x || xx === x + w - 1 ? "+" : "-", fg);
      put(xx, y + h - 1, xx === x || xx === x + w - 1 ? "+" : "-", fg);
    }
    for (let yy = y + 1; yy < y + h - 1; yy += 1) {
      put(x, yy, "|", fg);
      put(x + w - 1, yy, "|", fg);
    }
  }

  function braille(mask) {
    return String.fromCharCode(0x2800 + (mask & 0xff));
  }

  function staticDotGlyph(x, y, density) {
    let mask = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      if (hash01(x * 13 + bit, y * 17 - bit, 38) < density) mask |= 1 << bit;
    }
    return mask ? braille(mask) : " ";
  }

  function powerGlyph(power) {
    if (power > 0.86) return "⣿";
    if (power > 0.7) return "⣾";
    if (power > 0.54) return "⣶";
    if (power > 0.38) return "⣤";
    if (power > 0.2) return "⠶";
    return "⠄";
  }

  function drawFrame(now) {
    fillRect(1, 1, 102, 55, color.ink);
    strokeRect(1, 1, 102, 55, color.line);
    putText(4, 3, "BREAKOUT :: CHARACTER TERMINAL", color.header);
    putText(4, 4, "BRICKS / PADDLE / BALL / IMPACT BUFFER", color.muted);

    fillRect(FIELD.x - 1, FIELD.y - 1, FIELD.w + 2, FIELD.h + 2, color.ink2);
    strokeRect(FIELD.x - 2, FIELD.y - 2, FIELD.w + 4, FIELD.h + 4, color.line);
    for (let y = FIELD.y; y < FIELD.y + FIELD.h; y += 1) {
      for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 1) {
        const density = 0.08 + ((x + y) % 5) * 0.008;
        put(x, y, staticDotGlyph(x, y, density), color.lineDim, (Math.floor((x - FIELD.x) / 8) + Math.floor((y - FIELD.y) / 4)) % 2 ? "#080f16" : "#09121a");
      }
    }
    for (let x = FIELD.x + 8; x < FIELD.x + FIELD.w; x += 8) {
      for (let y = FIELD.y; y < FIELD.y + FIELD.h; y += 1) put(x, y, "│", color.lineDim);
    }
    for (let y = FIELD.y + 4; y < FIELD.y + FIELD.h; y += 4) {
      for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 1) put(x, y, "─", color.lineDim);
    }

    putText(4, 52, "[1]0.5x [2]1x [3]2x [4]4x   [SPACE] pause   [R] restart   [B] hub key   [A/D or ARROWS] move", color.muted);
    putText(4, 54, state.paused ? "PAUSED" : `RUNNING ${state.speed.toFixed(1)}x`, state.paused ? color.gold : color.green);
    const sweep = Math.floor((now / 55) % FIELD.h);
    for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 1) {
      if (hash01(x, sweep, 81) < 0.09) put(x, FIELD.y + sweep, "⠂", color.line);
    }
  }

  function drawBricks() {
    const game = state.game;
    for (const brick of game.bricks) {
      if (!brick.alive) continue;
      const fg = brickColor(brick);
      const edge = mixColor(fg, color.ink, 0.38);
      for (let y = 0; y < brick.h; y += 1) {
        for (let x = 0; x < brick.w; x += 1) {
          const side = x === 0 || x === brick.w - 1 || y === 0 || y === brick.h - 1;
          const glyph = side ? (brick.hp > 1 ? "▓" : "▒") : (hash01(brick.x + x, brick.y + y, 22) < 0.45 ? "⣿" : "⣶");
          put(brick.x + x, brick.y + y, glyph, side ? edge : fg, color.panel2);
        }
      }
    }
  }

  function drawPaddle() {
    const paddle = state.game.paddle;
    const y = Math.round(paddle.y);
    for (let x = 0; x < Math.round(paddle.w); x += 1) {
      const px = Math.round(paddle.x + x);
      const cap = x === 0 || x === Math.round(paddle.w) - 1;
      put(px, y, cap ? "▐" : "▀", cap ? color.paddleEdge : color.paddle, color.ink2);
      put(px, y + 1, cap ? "▐" : "▄", cap ? color.paddleEdge : color.cyan2, color.ink2);
    }
  }

  function drawBall(now) {
    const ball = state.game.ball;
    const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(now / 55) * 0.25;
    const fg = mixColor(color.ball, color.gold, pulse);
    put(ball.x, ball.y, "⣿", fg);
    put(ball.x - 1, ball.y, "⣶", mixColor(fg, color.ink, 0.24));
    put(ball.x + 1, ball.y, "⣶", mixColor(fg, color.ink, 0.24));
    put(ball.x, ball.y - 1, "⠿", mixColor(fg, color.ink, 0.34));
    put(ball.x, ball.y + 1, "⠿", mixColor(fg, color.ink, 0.34));
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      const fg = mixColor(trail.color, color.ink, t);
      put(trail.x, trail.y, powerGlyph(1 - t), fg);
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((effect) => now - effect.start < effect.duration);
    for (const effect of state.effects) {
      const t = clamp((now - effect.start) / effect.duration, 0, 1);
      if (effect.type === "particle") {
        const age = (now - effect.start) / 1000;
        const x = effect.x + effect.vx * age;
        const y = effect.y + effect.vy * age + 14 * age * age;
        put(x, y, effect.glyph, mixColor(effect.color, color.ink, t));
      } else if (effect.type === "ring") {
        const radius = 1 + t * 14 * effect.power;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
          const x = effect.x + Math.cos(a) * radius * 1.75;
          const y = effect.y + Math.sin(a) * radius * 0.82;
          put(x, y, powerGlyph(1 - t), mixColor(effect.color, color.ink, t));
        }
      }
    }
  }

  function drawPanel() {
    const game = state.game;
    fillRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.panel);
    strokeRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    putText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 4, `MODE   ${state.mode.toUpperCase()}`, color.cyan);
    putText(RIGHT.x + 2, RIGHT.y + 6, `LEVEL  ${String(game.level).padStart(4, "0")}`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 8, `DIFF   ${state.difficulty.toUpperCase()}`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 11, "RUN", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 13, `SCORE  ${String(game.score).padStart(6, "0")}`, color.gold);
    putText(RIGHT.x + 2, RIGHT.y + 15, `LIVES  ${"●".repeat(game.lives).padEnd(3, "○")}`, game.lives > 1 ? color.green : color.red);
    putText(RIGHT.x + 2, RIGHT.y + 17, `COMBO  x${String(game.combo).padStart(2, "0")}`, color.orange);
    putText(RIGHT.x + 2, RIGHT.y + 19, `SPEED  ${state.speed.toFixed(1)}x`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 22, "BRICKS", color.header);
    const remaining = game.bricks.filter((brick) => brick.alive).length;
    const total = game.bricks.length;
    const fill = 1 - remaining / total;
    putText(RIGHT.x + 2, RIGHT.y + 24, `[${"=".repeat(Math.round(fill * 20)).padEnd(20, ".")}]`, color.cyan);
    putText(RIGHT.x + 2, RIGHT.y + 26, `${String(total - remaining).padStart(3, "0")} / ${String(total).padStart(3, "0")} CLEARED`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 30, "EVENTS", color.header);
    const visible = state.eventLog.slice(state.logOffset, state.logOffset + 15);
    visible.forEach((entry, i) => {
      const fg = entry.tone === "danger" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "hit" ? color.gold : color.muted;
      putText(RIGHT.x + 2, RIGHT.y + 32 + i, `${String(entry.time).padStart(4, "0")} ${entry.message}`.slice(0, 25), fg);
    });
  }

  function draw(now) {
    clearScreen();
    drawFrame(now);
    drawBricks();
    drawTrails(now);
    drawEffects(now);
    drawPaddle();
    drawBall(now);
    drawPanel();
    renderTerminal();
  }

  function renderTerminal() {
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    for (let y = 0; y < ROWS; y += 1) {
      let runBg = null;
      let runStart = 0;
      for (let x = 0; x <= COLS; x += 1) {
        const bg = x < COLS ? screen.bg[idx(x, y)] : null;
        if (bg !== runBg) {
          if (runBg) {
            ctx.fillStyle = runBg;
            ctx.fillRect(runStart * CELL_W, y * CELL_H, (x - runStart) * CELL_W, CELL_H);
          }
          runBg = bg;
          runStart = x;
        }
      }
    }
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = screen.ch[idx(x, y)];
        if (ch === " ") continue;
        ctx.fillStyle = screen.fg[idx(x, y)];
        ctx.fillText(ch, x * CELL_W, y * CELL_H);
      }
    }
  }

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(COLS * CELL_W * dpr);
    canvas.height = Math.round(ROWS * CELL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loop(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    advanceGame(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  function setSpeed(speed) {
    state.speed = speed;
    addLog(`SPEED ${speed.toFixed(1)}x`, "info");
  }

  function canvasPointerX(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * COLS;
    return clamp(x, FIELD.x + 2, FIELD.x + FIELD.w - 2);
  }

  resizeCanvas();
  initGame(randomSeed());
  requestAnimationFrame(loop);

  seedInput.addEventListener("input", updateSeedStatus);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value || randomSeed());
  });
  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    initGame(seedInput.value, { reroll: true });
  });
  seedCopyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sanitizeSeed(seedInput.value || state.seed));
      addLog("SEED COPIED", "ok");
    } catch {
      seedInput.select();
      addLog("COPY FALLBACK", "info");
    }
  });
  playModeSelect.addEventListener("change", () => {
    state.mode = playModeSelect.value;
    addLog(`MODE ${state.mode.toUpperCase()}`, "info");
  });
  difficultySelect.addEventListener("change", () => {
    initGame(state.seed);
  });
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("pointermove", (event) => {
    if (state.mode !== "human") return;
    state.input.pointerX = canvasPointerX(event);
  });
  canvas.addEventListener("pointerleave", () => {
    state.input.pointerX = null;
  });

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const speedMap = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (speedMap[key]) {
      event.preventDefault();
      setSpeed(speedMap[key]);
      return;
    }
    if (key === " " || key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSE" : "RESUME", "info");
      return;
    }
    if (key === "r") {
      event.preventDefault();
      initGame(state.seed, { reroll: true });
      return;
    }
    if (key === "b") {
      event.preventDefault();
      window.location.href = "../index.html";
      return;
    }
    if (key === "j") {
      event.preventDefault();
      state.logOffset = clamp(state.logOffset + 1, 0, Math.max(0, state.eventLog.length - 1));
      return;
    }
    if (key === "k") {
      event.preventDefault();
      state.logOffset = clamp(state.logOffset - 1, 0, Math.max(0, state.eventLog.length - 1));
      return;
    }
    if (key === "arrowleft" || key === "a") {
      state.input.left = true;
      event.preventDefault();
    }
    if (key === "arrowright" || key === "d") {
      state.input.right = true;
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") state.input.left = false;
    if (key === "arrowright" || key === "d") state.input.right = false;
  });
})();
