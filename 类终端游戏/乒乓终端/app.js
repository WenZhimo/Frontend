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
  const TARGET_SCORE = 7;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
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
    ball: "#ff4d5f",
  };

  const difficultyConfig = {
    normal: { ball: 27, paddle: 43, ai: 0.84, curve: 0.78 },
    fast: { ball: 34, paddle: 50, ai: 0.9, curve: 0.9 },
    chaos: { ball: 39, paddle: 56, ai: 0.96, curve: 1.08 },
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
    input: { leftUp: false, leftDown: false, rightUp: false, rightDown: false, pointerY: null },
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

  function resetBall(serving = state.rng() < 0.5 ? -1 : 1) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    const angle = (state.rng() - 0.5) * 0.72;
    const speed = config.ball + game.rally * 0.42;
    game.ball.x = FIELD.x + FIELD.w / 2;
    game.ball.y = FIELD.y + FIELD.h / 2 + (state.rng() - 0.5) * 6;
    game.ball.vx = serving * Math.cos(angle) * speed;
    game.ball.vy = Math.sin(angle) * speed;
    game.rally = 0;
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
      round: 1,
      rally: 0,
      winner: "",
      score: { left: 0, right: 0 },
      left: { x: FIELD.x + 4, y: FIELD.y + FIELD.h / 2 - 4, w: 2, h: 8, vy: 0 },
      right: { x: FIELD.x + FIELD.w - 6, y: FIELD.y + FIELD.h / 2 - 4, w: 2, h: 8, vy: 0 },
      ball: { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2, vx: config.ball, vy: 0, r: 0.82 },
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    resetBall();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "MATCH READY", "info");
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.36;
      const speed = (9 + state.rng() * 22) * power;
      state.effects.push({
        type: "particle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        start: now,
        duration: 430 + state.rng() * 290,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)],
      });
    }
    state.effects.push({ type: "ring", x, y, start: now, duration: 430, color: baseColor, power });
  }

  function addTrail(x, y) {
    state.trails.push({ x, y, start: performance.now(), duration: 250, color: color.red });
    state.trails = state.trails.slice(-34);
  }

  function aiTarget(game, side) {
    const paddle = side === "left" ? game.left : game.right;
    const ball = game.ball;
    const movingToward = side === "left" ? ball.vx < 0 : ball.vx > 0;
    if (!movingToward) return FIELD.y + FIELD.h / 2 - paddle.h / 2;
    let x = ball.x;
    let y = ball.y;
    let vx = ball.vx;
    let vy = ball.vy;
    const targetX = side === "left" ? paddle.x + paddle.w + 1 : paddle.x - 1;
    for (let i = 0; i < 180; i += 1) {
      x += vx * 0.025;
      y += vy * 0.025;
      if (y < FIELD.y + 2 || y > FIELD.y + FIELD.h - 2) vy *= -1;
      if ((side === "left" && x <= targetX) || (side === "right" && x >= targetX)) break;
    }
    const wobble = (state.rng() - 0.5) * (state.difficulty === "chaos" ? 2.5 : 1.4);
    return y - paddle.h / 2 + wobble;
  }

  function movePaddle(paddle, target, dt) {
    const config = difficultyConfig[state.difficulty];
    const delta = clamp(target - paddle.y, -config.paddle * dt, config.paddle * dt);
    paddle.y += delta;
    paddle.vy = delta / Math.max(0.001, dt);
    paddle.y = clamp(paddle.y, FIELD.y + 2, FIELD.y + FIELD.h - paddle.h - 2);
  }

  function advancePaddles(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    if (state.mode === "demo") {
      movePaddle(game.left, aiTarget(game, "left"), dt * config.ai);
      movePaddle(game.right, aiTarget(game, "right"), dt * config.ai);
      return;
    }
    if (state.mode === "human-ai") {
      const dir = (state.input.leftDown ? 1 : 0) - (state.input.leftUp ? 1 : 0);
      game.left.y += dir * config.paddle * dt;
      if (state.input.pointerY !== null) game.left.y = lerp(game.left.y, state.input.pointerY - game.left.h / 2, 0.36);
      game.left.y = clamp(game.left.y, FIELD.y + 2, FIELD.y + FIELD.h - game.left.h - 2);
      movePaddle(game.right, aiTarget(game, "right"), dt * config.ai);
      return;
    }
    const leftDir = (state.input.leftDown ? 1 : 0) - (state.input.leftUp ? 1 : 0);
    const rightDir = (state.input.rightDown ? 1 : 0) - (state.input.rightUp ? 1 : 0);
    game.left.y = clamp(game.left.y + leftDir * config.paddle * dt, FIELD.y + 2, FIELD.y + FIELD.h - game.left.h - 2);
    game.right.y = clamp(game.right.y + rightDir * config.paddle * dt, FIELD.y + 2, FIELD.y + FIELD.h - game.right.h - 2);
  }

  function hitPaddle(paddle, side) {
    const game = state.game;
    const ball = game.ball;
    const hit =
      ball.x + ball.r >= paddle.x &&
      ball.x - ball.r <= paddle.x + paddle.w &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h;
    if (!hit) return false;
    const config = difficultyConfig[state.difficulty];
    const relative = clamp((ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2), -1, 1);
    const speed = Math.min(58, Math.hypot(ball.vx, ball.vy) * 1.035 + 0.38);
    const angle = relative * config.curve;
    const dir = side === "left" ? 1 : -1;
    ball.vx = Math.cos(angle) * speed * dir;
    ball.vy = Math.sin(angle) * speed + paddle.vy * 0.08;
    ball.x = side === "left" ? paddle.x + paddle.w + ball.r + 0.2 : paddle.x - ball.r - 0.2;
    game.rally += 1;
    addBurst(ball.x, ball.y, side === "left" ? color.cyan : color.gold, 18 + Math.min(20, game.rally), 0.72);
    addLog(`${side.toUpperCase()} RETURN ${game.rally}`, "hit");
    return true;
  }

  function scorePoint(side) {
    const game = state.game;
    game.score[side] += 1;
    addBurst(side === "left" ? FIELD.x + 8 : FIELD.x + FIELD.w - 8, FIELD.y + FIELD.h / 2, side === "left" ? color.cyan : color.gold, 58, 1.45);
    addLog(`${side.toUpperCase()} SCORE`, side === "left" ? "left" : "right");
    if (game.score[side] >= TARGET_SCORE) {
      game.winner = side;
      addLog(`${side.toUpperCase()} WINS ROUND`, "ok");
      game.round += 1;
      game.score.left = 0;
      game.score.right = 0;
    }
    resetBall(side === "left" ? -1 : 1);
  }

  function advanceGame(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    const scaledDt = Math.min(0.05, dt) * state.speed;
    game.elapsed += scaledDt;
    advancePaddles(scaledDt);

    const substeps = Math.max(1, Math.ceil(Math.hypot(game.ball.vx, game.ball.vy) * scaledDt / 0.65));
    const stepDt = scaledDt / substeps;
    for (let i = 0; i < substeps; i += 1) {
      const ball = game.ball;
      ball.x += ball.vx * stepDt;
      ball.y += ball.vy * stepDt;
      addTrail(ball.x, ball.y);
      if (ball.y - ball.r <= FIELD.y + 1) {
        ball.y = FIELD.y + 1 + ball.r;
        ball.vy = Math.abs(ball.vy);
        addBurst(ball.x, ball.y, color.cyan, 10, 0.45);
      } else if (ball.y + ball.r >= FIELD.y + FIELD.h - 1) {
        ball.y = FIELD.y + FIELD.h - 1 - ball.r;
        ball.vy = -Math.abs(ball.vy);
        addBurst(ball.x, ball.y, color.cyan, 10, 0.45);
      }
      if (ball.vx < 0) hitPaddle(game.left, "left");
      if (ball.vx > 0) hitPaddle(game.right, "right");
      if (ball.x < FIELD.x - 4) {
        scorePoint("right");
        break;
      }
      if (ball.x > FIELD.x + FIELD.w + 4) {
        scorePoint("left");
        break;
      }
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
      if (hash01(x * 11 + bit, y * 23 - bit, 44) < density) mask |= 1 << bit;
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

  const digit = {
    0: ["███", "█ █", "█ █", "█ █", "███"],
    1: [" ██", "  █", "  █", "  █", "  █"],
    2: ["███", "  █", "███", "█  ", "███"],
    3: ["███", "  █", "███", "  █", "███"],
    4: ["█ █", "█ █", "███", "  █", "  █"],
    5: ["███", "█  ", "███", "  █", "███"],
    6: ["███", "█  ", "███", "█ █", "███"],
    7: ["███", "  █", "  █", "  █", "  █"],
  };

  function drawBigDigit(x, y, value, fg) {
    const rows = digit[value] || digit[0];
    rows.forEach((row, yy) => {
      for (let xx = 0; xx < row.length; xx += 1) {
        if (row[xx] !== " ") put(x + xx, y + yy, "█", fg);
      }
    });
  }

  function drawFrame(now) {
    fillRect(1, 1, 102, 55, color.ink);
    strokeRect(1, 1, 102, 55, color.line);
    putText(4, 3, "PONG :: CHARACTER TERMINAL", color.header);
    putText(4, 4, "DUAL PADDLE / CENTER NET / IMPACT GLYPHS", color.muted);
    fillRect(FIELD.x - 1, FIELD.y - 1, FIELD.w + 2, FIELD.h + 2, color.ink2);
    strokeRect(FIELD.x - 2, FIELD.y - 2, FIELD.w + 4, FIELD.h + 4, color.line);
    for (let y = FIELD.y; y < FIELD.y + FIELD.h; y += 1) {
      for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 1) {
        const lane = x < FIELD.x + FIELD.w / 2 ? "#081018" : "#0a1015";
        put(x, y, staticDotGlyph(x, y, 0.1 + ((x + y) % 4) * 0.008), color.lineDim, lane);
      }
    }
    const mid = Math.round(FIELD.x + FIELD.w / 2);
    for (let y = FIELD.y + 2; y < FIELD.y + FIELD.h - 1; y += 2) {
      put(mid, y, "┃", color.line);
      if (hash01(mid, y, 64) < 0.45) put(mid + 1, y, "⠂", color.lineDim);
    }
    const sweep = Math.floor((now / 64) % FIELD.h);
    for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 1) {
      if (hash01(x, sweep, 78) < 0.075) put(x, FIELD.y + sweep, "⠂", color.line);
    }
    putText(4, 52, "[1]0.5x [2]1x [3]2x [4]4x   [SPACE] pause   [R] restart   [P] hub   [W/S] left   [UP/DOWN] right", color.muted);
    putText(4, 54, state.paused ? "PAUSED" : `RUNNING ${state.speed.toFixed(1)}x`, state.paused ? color.gold : color.green);
  }

  function drawPaddle(paddle, fg, edge) {
    const x = Math.round(paddle.x);
    for (let y = 0; y < Math.round(paddle.h); y += 1) {
      const py = Math.round(paddle.y + y);
      put(x, py, "▐", edge, color.ink2);
      put(x + 1, py, "█", fg, color.ink2);
      put(x + 2, py, "▌", edge, color.ink2);
    }
  }

  function drawBall(now) {
    const ball = state.game.ball;
    const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(now / 48) * 0.26;
    const fg = mixColor(color.ball, color.gold, pulse);
    put(ball.x, ball.y, "⣿", fg);
    put(ball.x - 1, ball.y, "⣶", mixColor(fg, color.ink, 0.28));
    put(ball.x + 1, ball.y, "⣶", mixColor(fg, color.ink, 0.28));
    put(ball.x, ball.y - 1, "⠿", mixColor(fg, color.ink, 0.36));
    put(ball.x, ball.y + 1, "⠿", mixColor(fg, color.ink, 0.36));
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      put(trail.x, trail.y, powerGlyph(1 - t), mixColor(trail.color, color.ink, t));
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((effect) => now - effect.start < effect.duration);
    for (const effect of state.effects) {
      const t = clamp((now - effect.start) / effect.duration, 0, 1);
      if (effect.type === "particle") {
        const age = (now - effect.start) / 1000;
        put(effect.x + effect.vx * age, effect.y + effect.vy * age, effect.glyph, mixColor(effect.color, color.ink, t));
      } else if (effect.type === "ring") {
        const radius = 1 + t * 13 * effect.power;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
          put(effect.x + Math.cos(a) * radius * 1.8, effect.y + Math.sin(a) * radius * 0.82, powerGlyph(1 - t), mixColor(effect.color, color.ink, t));
        }
      }
    }
  }

  function drawPanel() {
    const game = state.game;
    fillRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.panel);
    strokeRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    putText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 4, `MODE   ${state.mode.toUpperCase()}`.slice(0, 25), color.cyan);
    putText(RIGHT.x + 2, RIGHT.y + 6, `DIFF   ${state.difficulty.toUpperCase()}`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 8, `ROUND  ${String(game.round).padStart(4, "0")}`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 11, "SCORE", color.header);
    drawBigDigit(RIGHT.x + 4, RIGHT.y + 13, game.score.left, color.cyan2);
    putText(RIGHT.x + 10, RIGHT.y + 15, ":", color.line);
    drawBigDigit(RIGHT.x + 13, RIGHT.y + 13, game.score.right, color.gold);
    putText(RIGHT.x + 2, RIGHT.y + 21, `TARGET ${TARGET_SCORE}`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 24, "BALL", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 26, `SPEED  ${Math.hypot(game.ball.vx, game.ball.vy).toFixed(1)}`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 28, `RALLY  ${String(game.rally).padStart(4, "0")}`, color.orange);
    putText(RIGHT.x + 2, RIGHT.y + 31, "EVENTS", color.header);
    const visible = state.eventLog.slice(state.logOffset, state.logOffset + 16);
    visible.forEach((entry, i) => {
      const fg = entry.tone === "left" ? color.cyan : entry.tone === "right" ? color.gold : entry.tone === "ok" ? color.green : entry.tone === "hit" ? color.orange : color.muted;
      putText(RIGHT.x + 2, RIGHT.y + 33 + i, `${String(entry.time).padStart(4, "0")} ${entry.message}`.slice(0, 25), fg);
    });
  }

  function draw(now) {
    clearScreen();
    drawFrame(now);
    drawTrails(now);
    drawEffects(now);
    drawPaddle(state.game.left, color.left, color.cyan);
    drawPaddle(state.game.right, color.right, color.orange);
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

  function pointerY(event) {
    const rect = canvas.getBoundingClientRect();
    const y = ((event.clientY - rect.top) / rect.height) * ROWS;
    return clamp(y, FIELD.y + 2, FIELD.y + FIELD.h - 2);
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
  difficultySelect.addEventListener("change", () => initGame(state.seed));
  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("pointermove", (event) => {
    if (state.mode === "demo") return;
    state.input.pointerY = pointerY(event);
  });
  canvas.addEventListener("pointerleave", () => {
    state.input.pointerY = null;
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
    if (key === " ") {
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
    if (key === "p") {
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
    if (key === "w") {
      event.preventDefault();
      state.input.leftUp = true;
    }
    if (key === "s") {
      event.preventDefault();
      state.input.leftDown = true;
    }
    if (key === "arrowup") {
      event.preventDefault();
      state.input.rightUp = true;
    }
    if (key === "arrowdown") {
      event.preventDefault();
      state.input.rightDown = true;
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "w") state.input.leftUp = false;
    if (key === "s") state.input.leftDown = false;
    if (key === "arrowup") state.input.rightUp = false;
    if (key === "arrowdown") state.input.rightDown = false;
  });
})();
