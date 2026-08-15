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
  const GRID = { x: 8, y: 7, w: 88, h: 40 };
  const PLAYER_ZONE = 8;
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    soil: "#071018",
    soil2: "#0a1420",
    zone: "#0d1621",
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
    player: "#f2ffff",
    mushroom: "#75f0a8",
    centi: "#ffcc66",
    centiHead: "#ff7b6f",
    spider: "#ff4d5f",
    flea: "#6ed5ec",
  };

  const difficultyConfig = {
    normal: { step: 0.13, player: 34, fire: 0.14, mushrooms: 58, flea: 8.5, spider: 12, length: 15 },
    fast: { step: 0.1, player: 40, fire: 0.12, mushrooms: 66, flea: 10, spider: 15, length: 17 },
    chaos: { step: 0.078, player: 46, fire: 0.09, mushrooms: 78, flea: 12, spider: 18, length: 20 },
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
    input: { up: false, down: false, left: false, right: false, fire: false },
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
    state.eventLog = state.eventLog.slice(0, 46);
  }

  function keyAt(x, y) {
    return `${Math.round(x)},${Math.round(y)}`;
  }

  function makeMushroom(x, y, hp = 3) {
    if (y < GRID.y + 2 || y > GRID.y + GRID.h - PLAYER_ZONE - 2) return;
    state.game.mushrooms.set(keyAt(x, y), { x: Math.round(x), y: Math.round(y), hp });
  }

  function hasMushroom(x, y) {
    return state.game.mushrooms.has(keyAt(x, y));
  }

  function spawnCentipede(length = difficultyConfig[state.difficulty].length) {
    const game = state.game;
    const startY = GRID.y + 1;
    const dir = state.rng() > 0.5 ? 1 : -1;
    const startX = dir > 0 ? GRID.x + 1 : GRID.x + GRID.w - 2;
    const id = game.nextChainId++;
    for (let i = 0; i < length; i += 1) {
      game.segments.push({
        id,
        index: i,
        x: startX - dir * i,
        y: startY,
        dir,
        step: state.rng() * difficultyConfig[state.difficulty].step,
        head: i === 0,
      });
    }
    addLog(`CENTIPEDE x${length}`, "gold");
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const cfg = difficultyConfig[state.difficulty];
    state.game = {
      elapsed: 0,
      score: 0,
      wave: 1,
      lives: 3,
      status: "ACTIVE",
      player: {
        x: GRID.x + Math.floor(GRID.w / 2),
        y: GRID.y + GRID.h - 3,
        cooldown: 0,
        invuln: 1.8,
      },
      bullets: [],
      segments: [],
      mushrooms: new Map(),
      fleas: [],
      spider: null,
      fleaTimer: 4 + state.rng() * 3,
      spiderTimer: 6 + state.rng() * 4,
      nextChainId: 1,
    };
    state.trails = [];
    state.effects = [];
    state.eventLog = [];
    state.paused = false;
    for (let i = 0; i < cfg.mushrooms; i += 1) {
      makeMushroom(GRID.x + 3 + Math.floor(state.rng() * (GRID.w - 6)), GRID.y + 3 + Math.floor(state.rng() * (GRID.h - PLAYER_ZONE - 6)), 1 + Math.floor(state.rng() * 3));
    }
    spawnCentipede(cfg.length);
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW HIVE SEED" : "HIVE READY", "ok");
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
        const n = hash01(x, y, 17);
        const bg = n > 0.91 ? "#09111a" : n > 0.82 ? "#070d14" : color.ink;
        screen.bg[idx(x, y)] = bg;
        if (n > 0.987) setCell(x, y, "·", color.dim, bg);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    drawText(GRID.x + 1, GRID.y - 2, "MYCELIUM DEFENSE GRID", color.header);
    drawText(GRID.x + 58, GRID.y - 2, "CENTIPEDE SWARM", color.gold);
    for (let y = GRID.y; y < GRID.y + GRID.h; y += 1) {
      for (let x = GRID.x; x < GRID.x + GRID.w; x += 1) {
        const p = idx(x, y);
        const playerZone = y >= GRID.y + GRID.h - PLAYER_ZONE;
        const stripe = Math.floor((x - GRID.x) / 7) % 2 === 0;
        screen.bg[p] = playerZone ? color.zone : stripe ? color.soil : color.soil2;
        const n = hash01(x, y, 33);
        if (n > 0.982) {
          screen.ch[p] = "·";
          screen.fg[p] = "#31516a";
        }
      }
    }
    drawText(GRID.x + 2, GRID.y + GRID.h - PLAYER_ZONE - 1, "──── PLAYER QUARANTINE ────", color.lineDim);
  }

  function drawMushrooms() {
    for (const mush of state.game.mushrooms.values()) {
      const fg = mush.hp >= 3 ? color.mushroom : mush.hp === 2 ? color.gold : color.orange;
      setCell(mush.x, mush.y - 1, "▄", fg);
      setCell(mush.x - 1, mush.y, "▟", fg);
      setCell(mush.x, mush.y, "█", fg);
      setCell(mush.x + 1, mush.y, "▙", fg);
    }
  }

  function drawSegments() {
    for (const seg of state.game.segments) {
      const fg = seg.head ? color.centiHead : color.centi;
      const glyph = seg.head ? (seg.dir > 0 ? "◖" : "◗") : seg.index % 2 ? "●" : "◎";
      setCell(seg.x, seg.y, glyph, fg);
      setCell(seg.x, seg.y + 1, "·", mixColor(fg, color.ink, 0.35));
    }
  }

  function drawPlayer() {
    const p = state.game.player;
    const fg = p.invuln > 0 && Math.floor(state.game.elapsed * 12) % 2 === 0 ? color.cyan2 : color.player;
    setCell(p.x, p.y - 1, "▲", fg);
    setCell(p.x - 1, p.y, "▟", fg);
    setCell(p.x, p.y, "█", fg);
    setCell(p.x + 1, p.y, "▙", fg);
  }

  function drawBullets() {
    for (const b of state.game.bullets) {
      setCell(b.x, b.y, "┃", color.cyan);
      setCell(b.x, b.y + 1, "·", color.cyan);
    }
  }

  function drawThreats() {
    for (const flea of state.game.fleas) {
      setCell(flea.x, flea.y, "♦", color.flea);
      setCell(flea.x, flea.y - 1, "·", color.cyan);
    }
    const spider = state.game.spider;
    if (spider) {
      setCell(spider.x, spider.y - 1, "╱", color.spider);
      setCell(spider.x, spider.y, "▓", color.spider);
      setCell(spider.x + 1, spider.y, "╲", color.spider);
      setCell(spider.x - 1, spider.y + 1, "╲", color.spider);
      setCell(spider.x + 2, spider.y + 1, "╱", color.spider);
    }
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      setCell(trail.x, trail.y, t < 0.45 ? trail.ch : "·", mixColor(trail.fg, color.ink, t));
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      setCell(fx.x + fx.vx * t, fx.y + fx.vy * t, t < 0.5 ? fx.ch : "·", mixColor(fx.fg, color.ink, t));
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    drawText(RIGHT.x + 2, RIGHT.y + 2, "COLONY", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 5, `WAVE  ${String(game.wave).padStart(2, "0")}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 6, `LIVES ${"♥".repeat(Math.max(0, game.lives))}`, game.lives <= 1 ? color.red : color.red2);
    drawText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 12, "SWARM", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 14, `SEG   ${String(game.segments.length).padStart(3, " ")}`, color.gold);
    drawText(RIGHT.x + 2, RIGHT.y + 15, `SHROOM${String(game.mushrooms.size).padStart(3, " ")}`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 16, `FLEA  ${String(game.fleas.length).padStart(3, " ")}`, color.flea);
    drawText(RIGHT.x + 2, RIGHT.y + 18, `[${"█".repeat(Math.min(20, game.segments.length)).padEnd(20, " ")}]`, color.gold);
    drawText(RIGHT.x + 2, RIGHT.y + 23, "LOG", color.header);
    for (let i = 0; i < 18; i += 1) {
      const entry = state.eventLog[i + state.logOffset];
      if (!entry) break;
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "gold" ? color.gold : color.muted;
      drawText(RIGHT.x + 2, RIGHT.y + 25 + i, `>${entry.message}`.slice(0, RIGHT.w - 4), fg);
    }
  }

  function drawFooter() {
    drawText(FIELD.x + 4, FIELD.y + FIELD.h + 1, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE   SPACE FIRE   P PAUSE   R REROLL   H HOME", color.muted);
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

  function burst(x, y, fg, count = 18, power = 12, glyphs = ["░", "▒", "▓", "*", "·"]) {
    if (reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const angle = state.rng() * Math.PI * 2;
      const speed = 3 + state.rng() * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ch: glyphs[Math.floor(state.rng() * glyphs.length)],
        fg,
        start: performance.now(),
        duration: 360 + state.rng() * 520,
      });
    }
  }

  function trail(x, y, ch, fg, duration = 220) {
    if (reducedMotion) return;
    state.trails.push({ x, y, ch, fg, start: performance.now(), duration });
    state.trails = state.trails.slice(-220);
  }

  function firePlayer() {
    const game = state.game;
    const p = game.player;
    if (p.cooldown > 0 || game.status === "DOWN" || game.status === "CLEARED") return;
    game.bullets.push({ x: p.x, y: p.y - 2, vy: -36 });
    p.cooldown = difficultyConfig[state.difficulty].fire;
    trail(p.x, p.y - 1, "┃", color.cyan, 120);
  }

  function hitPlayer(x, y) {
    const game = state.game;
    const p = game.player;
    if (p.invuln > 0 || game.status === "DOWN" || game.status === "CLEARED") return;
    if (Math.abs(x - p.x) <= 2 && Math.abs(y - p.y) <= 2) {
      game.lives -= 1;
      p.invuln = 2.2;
      burst(p.x, p.y, color.red, 34, 17);
      addLog(game.lives > 0 ? "CANNON HIT" : "COLONY LOST", "bad");
      if (game.lives <= 0) game.status = "DOWN";
    }
  }

  function updateAI() {
    const game = state.game;
    const p = game.player;
    let targetX = p.x;
    const closeSegments = game.segments.filter((seg) => seg.y > GRID.y + GRID.h - PLAYER_ZONE - 6);
    if (closeSegments.length) {
      const nearest = closeSegments.reduce((best, seg) => (Math.abs(seg.x - p.x) < Math.abs(best.x - p.x) ? seg : best), closeSegments[0]);
      targetX = nearest.x < p.x ? p.x + 8 : p.x - 8;
    } else if (game.spider && Math.abs(game.spider.y - p.y) < 9) {
      targetX = game.spider.x < p.x ? p.x + 12 : p.x - 12;
    } else {
      const targets = [...game.segments, ...game.fleas];
      if (game.spider) targets.push(game.spider);
      if (targets.length) {
        const target = targets.reduce((best, item) => (item.y > best.y ? item : best), targets[0]);
        targetX = target.x;
      }
    }
    state.input.left = targetX < p.x - 1.3;
    state.input.right = targetX > p.x + 1.3;
    state.input.up = false;
    state.input.down = false;
    state.input.fire = true;
  }

  function updatePlayer(dt) {
    const game = state.game;
    const p = game.player;
    if (state.mode === "demo") updateAI();
    const speed = difficultyConfig[state.difficulty].player;
    const dx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    const dy = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / len) * speed * dt, GRID.x + 2, GRID.x + GRID.w - 3);
    p.y = clamp(p.y + (dy / len) * speed * dt, GRID.y + GRID.h - PLAYER_ZONE + 1, GRID.y + GRID.h - 2);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (state.input.fire || state.mode === "demo") firePlayer();
  }

  function moveSegment(seg) {
    const nextX = seg.x + seg.dir;
    const wall = nextX <= GRID.x || nextX >= GRID.x + GRID.w - 1;
    const blocked = hasMushroom(nextX, seg.y);
    if (wall || blocked) {
      seg.dir *= -1;
      seg.y += 1;
      if (seg.y >= GRID.y + GRID.h - 1) seg.y = GRID.y + GRID.h - PLAYER_ZONE;
    } else {
      seg.x = nextX;
    }
    trail(seg.x, seg.y, seg.head ? "◦" : "·", seg.head ? color.centiHead : color.centi, 260);
  }

  function updateSegments(dt) {
    const game = state.game;
    const stepSize = difficultyConfig[state.difficulty].step * Math.max(0.45, 1 - game.wave * 0.045);
    for (const seg of game.segments) {
      seg.step += dt;
      while (seg.step >= stepSize) {
        seg.step -= stepSize;
        moveSegment(seg);
      }
      hitPlayer(seg.x, seg.y);
    }
  }

  function updateThreats(dt) {
    const game = state.game;
    const cfg = difficultyConfig[state.difficulty];
    game.fleaTimer -= dt;
    game.spiderTimer -= dt;
    if (game.fleaTimer <= 0) {
      game.fleas.push({ x: GRID.x + 4 + Math.floor(state.rng() * (GRID.w - 8)), y: GRID.y, vy: cfg.flea });
      game.fleaTimer = 5 + state.rng() * 5;
      addLog("FLEA DROP", "info");
    }
    if (game.spiderTimer <= 0 && !game.spider) {
      const fromLeft = state.rng() > 0.5;
      game.spider = {
        x: fromLeft ? GRID.x + 1 : GRID.x + GRID.w - 2,
        y: GRID.y + GRID.h - PLAYER_ZONE + 1 + state.rng() * (PLAYER_ZONE - 2),
        vx: (fromLeft ? 1 : -1) * cfg.spider,
        phase: state.rng() * Math.PI * 2,
      };
      game.spiderTimer = 8 + state.rng() * 6;
      addLog("SPIDER SWEEP", "bad");
    }
    for (const flea of game.fleas) {
      flea.y += flea.vy * dt;
      if (Math.floor(flea.y) % 4 === 0 && state.rng() > 0.86) makeMushroom(flea.x, flea.y, 2);
      hitPlayer(flea.x, flea.y);
    }
    game.fleas = game.fleas.filter((flea) => flea.y < GRID.y + GRID.h + 2);
    if (game.spider) {
      const sp = game.spider;
      sp.phase += dt * 5;
      sp.x += sp.vx * dt;
      sp.y += Math.sin(sp.phase) * dt * 8;
      hitPlayer(sp.x, sp.y);
      if (sp.x < GRID.x - 3 || sp.x > GRID.x + GRID.w + 3) game.spider = null;
    }
  }

  function damageMushroom(mush) {
    mush.hp -= 1;
    burst(mush.x, mush.y, color.green, 5, 5, ["░", "·"]);
    if (mush.hp <= 0) {
      state.game.mushrooms.delete(keyAt(mush.x, mush.y));
      state.game.score += 8;
      burst(mush.x, mush.y, color.green, 12, 8, ["▒", "░", "·"]);
    }
  }

  function updateBullets(dt) {
    const game = state.game;
    for (const b of game.bullets) {
      b.y += b.vy * dt;
      trail(b.x, b.y + 1, "·", color.cyan, 120);
      const mush = game.mushrooms.get(keyAt(b.x, b.y));
      if (mush) {
        b.dead = true;
        damageMushroom(mush);
        continue;
      }
      for (const seg of game.segments) {
        if (Math.abs(b.x - seg.x) <= 1 && Math.abs(b.y - seg.y) <= 1) {
          b.dead = true;
          seg.dead = true;
          makeMushroom(seg.x, seg.y, 3);
          game.score += seg.head ? 120 : 60;
          addLog(seg.head ? "HEAD SPLIT +120" : "SEGMENT +60", "ok");
          burst(seg.x, seg.y, seg.head ? color.centiHead : color.centi, seg.head ? 28 : 18, 14);
          break;
        }
      }
      for (const flea of game.fleas) {
        if (Math.abs(b.x - flea.x) <= 1 && Math.abs(b.y - flea.y) <= 1) {
          b.dead = true;
          flea.dead = true;
          game.score += 160;
          addLog("FLEA +160", "ok");
          burst(flea.x, flea.y, color.flea, 20, 13);
        }
      }
      if (game.spider && Math.abs(b.x - game.spider.x) <= 2 && Math.abs(b.y - game.spider.y) <= 2) {
        b.dead = true;
        game.score += 300;
        addLog("SPIDER +300", "ok");
        burst(game.spider.x, game.spider.y, color.spider, 34, 18);
        game.spider = null;
      }
    }
    game.segments = game.segments.filter((seg) => !seg.dead);
    game.fleas = game.fleas.filter((flea) => !flea.dead);
    game.bullets = game.bullets.filter((b) => !b.dead && b.y > GRID.y - 2);
    if (!game.segments.length && game.status === "ACTIVE") {
      game.wave += 1;
      addLog(`WAVE ${game.wave}`, "gold");
      spawnCentipede(difficultyConfig[state.difficulty].length + game.wave);
    }
  }

  function updateGame(dt) {
    const game = state.game;
    game.elapsed += dt;
    if (game.status === "DOWN" || game.status === "CLEARED") return;
    updatePlayer(dt);
    updateSegments(dt);
    updateThreats(dt);
    updateBullets(dt);
    if (game.wave >= 5 && game.segments.length === 0) {
      game.status = "CLEARED";
      addLog("COLONY SECURE", "ok");
      burst(game.player.x, game.player.y, color.green, 60, 23, ["▓", "▒", "░", "✦"]);
    }
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    drawMushrooms();
    drawThreats();
    drawBullets();
    drawSegments();
    drawPlayer();
    if (state.paused) drawText(FIELD.x + 41, FIELD.y + 2, " PAUSED ", color.gold);
    if (state.game.status === "DOWN") drawText(GRID.x + 33, GRID.y + 18, " COLONY OVERRUN ", color.red);
    if (state.game.status === "CLEARED") drawText(GRID.x + 34, GRID.y + 18, " COLONY SECURE ", color.green);
    drawHud();
    drawFooter();
    renderScreen();
  }

  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const dt = Math.min((now - state.lastFrame) / 1000, 0.05) * state.speed;
    state.lastFrame = now;
    if (!state.paused) updateGame(dt);
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
    if (key === "h") {
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
    if (key === "w" || event.key === "ArrowUp") state.input.up = true;
    if (key === "s" || event.key === "ArrowDown") state.input.down = true;
    if (event.code === "Space") state.input.fire = true;
    if (["a", "d", "w", "s", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (key === "w" || event.key === "ArrowUp") state.input.up = false;
    if (key === "s" || event.key === "ArrowDown") state.input.down = false;
    if (event.code === "Space") state.input.fire = false;
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
