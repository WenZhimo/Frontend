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
  const PLAYER_Y = FIELD.y + FIELD.h - 4;
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
    player: "#f2ffff",
    enemy: "#ffcc66",
    enemy2: "#ff9f45",
    shot: "#ff4d5f",
    shield: "#75f0a8",
  };

  const difficultyConfig = {
    normal: { enemy: 4.8, bullet: 31, player: 39, fire: 0.58, rows: 5 },
    fast: { enemy: 6.2, bullet: 37, player: 45, fire: 0.76, rows: 5 },
    chaos: { enemy: 7.4, bullet: 43, player: 52, fire: 0.95, rows: 6 },
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
    input: { left: false, right: false, fire: false, pointerX: null },
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

  function createInvaders(rows) {
    const invaders = [];
    const cols = 11;
    const startX = FIELD.x + 12;
    const startY = FIELD.y + 6;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        invaders.push({
          col,
          row,
          x: startX + col * 7,
          y: startY + row * 4,
          alive: true,
          type: row < 1 ? 2 : row < 3 ? 1 : 0,
          wobble: state.rng() * Math.PI * 2,
        });
      }
    }
    return invaders;
  }

  function createShields() {
    const shields = [];
    for (let s = 0; s < 4; s += 1) {
      const baseX = FIELD.x + 14 + s * 21;
      const baseY = FIELD.y + FIELD.h - 13;
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 9; x += 1) {
          const notch = y === 3 && x >= 3 && x <= 5;
          const shoulder = y === 0 && (x === 0 || x === 8);
          if (!notch && !shoulder) shields.push({ x: baseX + x, y: baseY + y, hp: 3, maxHp: 3 });
        }
      }
    }
    return shields;
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
      combo: 0,
      status: "LIVE",
      playerX: FIELD.x + FIELD.w / 2,
      playerCooldown: 0,
      enemyCooldown: 0.35,
      enemyDir: 1,
      enemyStep: 0,
      ufo: {
        active: false,
        x: FIELD.x - 10,
        y: FIELD.y + 3,
        vx: 0,
        next: 4.5 + state.rng() * 7.5,
      },
      invaders: createInvaders(config.rows),
      shields: createShields(),
      playerBullets: [],
      enemyBullets: [],
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "FLEET DETECTED", "info");
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.52;
      const speed = (8 + state.rng() * 24) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.78,
        start: now,
        duration: 430 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)],
      });
    }
  }

  function addTrail(x, y, glyph, baseColor, duration = 230) {
    if (reducedMotion) return;
    state.trails.push({ x: Math.round(x), y: Math.round(y), glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-180);
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
        const grain = hash01(x, y, 28);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.968) setCell(x, y, "·", color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        screen.bg[idx(x, y)] = y % 3 === 0 ? "#070d14" : "#081018";
        const star = hash01(x, y, 43);
        if (star > 0.965) setCell(x, y, star > 0.988 ? "✦" : "·", star > 0.988 ? color.cyan : color.dim);
      }
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "ORBITAL TERMINAL DEFENSE", color.header);
    writeText(FIELD.x + 67, FIELD.y - 2, "ALIEN FLEET", color.enemy);
    for (let x = FIELD.x + 2; x < FIELD.x + FIELD.w - 2; x += 2) {
      setCell(x, PLAYER_Y + 2, "▁", color.lineDim);
    }
  }

  function drawInvader(invader, frame) {
    if (!invader.alive) return;
    const x = Math.round(invader.x);
    const y = Math.round(invader.y + Math.sin(frame * 0.005 + invader.wobble) * 0.18);
    const fg = invader.type === 2 ? color.red2 : invader.type === 1 ? color.enemy : color.orange;
    const pattern = invader.type === 2 ? ["▗▄▖", "▟█▙", "▘▝▘"] : invader.type === 1 ? ["▖█▗", "▟▓▙", "▝ ▘"] : ["▟▙", "▓▓", "▜▛"];
    pattern.forEach((row, py) => Array.from(row).forEach((ch, px) => ch !== " " && setCell(x + px, y + py, ch, fg)));
  }

  function drawUfo(frame) {
    const ufo = state.game.ufo;
    if (!ufo.active) return;
    const x = Math.round(ufo.x);
    const y = Math.round(ufo.y + Math.sin(frame * 0.009) * 0.2);
    const pattern = ["▗▄▄▖", "▟██▙", "▀▚▞▀"];
    pattern.forEach((row, py) => {
      Array.from(row).forEach((ch, px) => {
        if (ch !== " ") setCell(x + px, y + py, ch, py === 1 ? color.cyan2 : color.red2);
      });
    });
  }

  function drawPlayer() {
    const x = Math.round(state.game.playerX);
    const y = PLAYER_Y;
    const pattern = [" ▄█▄ ", "▟███▙", "▀▜█▛▀"];
    pattern.forEach((row, py) => Array.from(row).forEach((ch, px) => ch !== " " && setCell(x + px - 2, y + py, ch, color.player)));
  }

  function drawShields() {
    for (const block of state.game.shields) {
      if (block.hp <= 0) continue;
      const glyph = block.hp === 3 ? "▓" : block.hp === 2 ? "▒" : "░";
      const fg = block.hp === 3 ? color.shield : block.hp === 2 ? color.green : color.gold;
      setCell(block.x, block.y, glyph, fg, "#07130f");
    }
  }

  function drawBullets() {
    for (const b of state.game.playerBullets) {
      setCell(b.x, b.y, "┃", color.cyan2);
      setCell(b.x, b.y + 1, "╹", color.cyan);
    }
    for (const b of state.game.enemyBullets) {
      setCell(b.x, b.y, "╿", color.red2);
      setCell(b.x, b.y - 1, "╻", color.red);
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
    const alive = game.invaders.filter((alien) => alien.alive).length;
    writeText(RIGHT.x + 2, RIGHT.y + 12, "FLEET", color.header);
    const bar = Math.round((alive / game.invaders.length) * 20);
    writeText(RIGHT.x + 2, RIGHT.y + 14, `[${"█".repeat(bar)}${" ".repeat(20 - bar)}]`, color.enemy);
    writeText(RIGHT.x + 2, RIGHT.y + 16, game.status, game.status === "LIVE" ? color.cyan : color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 17, `UFO   ${game.ufo.active ? "SIGNAL" : String(Math.ceil(game.ufo.next)).padStart(2, "0") + "s"}`, game.ufo.active ? color.red2 : color.muted);

    writeText(RIGHT.x + 2, RIGHT.y + 20, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 19).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 22 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   ←/→ MOVE   SPACE FIRE   P PAUSE   R REROLL   I HOME", color.muted);
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

  function firePlayer() {
    const game = state.game;
    if (game.playerCooldown > 0 || game.status !== "LIVE") return;
    game.playerBullets.push({ x: game.playerX, y: PLAYER_Y - 1, vy: -56 });
    game.playerCooldown = state.difficulty === "chaos" ? 0.18 : 0.24;
    addTrail(game.playerX, PLAYER_Y - 1, "╹", color.cyan, 180);
  }

  function fireEnemy() {
    const game = state.game;
    const alive = game.invaders.filter((alien) => alien.alive);
    if (!alive.length) return;
    const columns = alive.filter((alien) => {
      return !alive.some((other) => other.col === alien.col && other.row > alien.row);
    });
    const nearPlayer = columns
      .map((alien) => ({ alien, score: Math.abs(alien.x - game.playerX) + state.rng() * 18 }))
      .sort((a, b) => a.score - b.score)[0].alien;
    game.enemyBullets.push({ x: nearPlayer.x + 1, y: nearPlayer.y + 3, vy: difficultyConfig[state.difficulty].bullet });
    addTrail(nearPlayer.x + 1, nearPlayer.y + 3, "╻", color.red, 180);
  }

  function nextWave() {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    game.wave += 1;
    game.invaders = createInvaders(config.rows);
    game.enemyDir = 1;
    game.enemyStep = 0;
    game.ufo.active = false;
    game.ufo.next = 3.2 + state.rng() * 6.8;
    game.playerBullets = [];
    game.enemyBullets = [];
    addLog(`WAVE ${game.wave}`, "ok");
    addBurst(FIELD.x + FIELD.w / 2, FIELD.y + 12, color.cyan, 36, 1.1);
  }

  function launchUfo() {
    const game = state.game;
    const dir = state.rng() < 0.5 ? 1 : -1;
    game.ufo.active = true;
    game.ufo.x = dir > 0 ? FIELD.x - 8 : FIELD.x + FIELD.w + 4;
    game.ufo.y = FIELD.y + 3 + Math.floor(state.rng() * 2);
    game.ufo.vx = dir * (13 + game.wave * 0.55 + state.rng() * 4);
    addLog("UFO SIGNAL", "hit");
  }

  function updateUfo(dt) {
    const game = state.game;
    const ufo = game.ufo;
    if (!ufo.active) {
      ufo.next -= dt;
      if (ufo.next <= 0) launchUfo();
      return;
    }
    const oldX = ufo.x;
    ufo.x += ufo.vx * dt;
    if (Math.abs(Math.round(oldX) - Math.round(ufo.x)) > 0) addTrail(ufo.x, ufo.y + 1, "·", color.red2, 220);
    if (ufo.x < FIELD.x - 12 || ufo.x > FIELD.x + FIELD.w + 8) {
      ufo.active = false;
      ufo.next = 6 + state.rng() * 9;
    }
  }

  function damageShield(x, y, amount = 1) {
    const hit = state.game.shields.find((block) => block.hp > 0 && Math.abs(block.x - x) <= 0.7 && Math.abs(block.y - y) <= 0.7);
    if (!hit) return false;
    hit.hp -= amount;
    addBurst(hit.x, hit.y, color.shield, 5, 0.42);
    return true;
  }

  function hitPlayer() {
    const game = state.game;
    game.lives -= 1;
    addLog("DEFENSE HIT", "hit");
    addBurst(game.playerX, PLAYER_Y, color.red, 42, 1.35);
    game.enemyBullets = [];
    game.playerBullets = [];
    if (game.lives <= 0) {
      game.status = "MISSION FAILED";
      addLog("MISSION FAILED", "hit");
    }
  }

  function updatePlayer(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    let target = game.playerX;
    if (state.mode === "demo") {
      const danger = game.enemyBullets
        .filter((bullet) => bullet.y > FIELD.y + FIELD.h - 18)
        .sort((a, b) => Math.abs(a.x - game.playerX) - Math.abs(b.x - game.playerX))[0];
      if (danger && Math.abs(danger.x - game.playerX) < 5) {
        target = game.playerX + (danger.x < game.playerX ? 12 : -12);
      } else {
        const alive = game.invaders.filter((alien) => alien.alive);
        const choice = alive.sort((a, b) => Math.abs(a.x - game.playerX) - Math.abs(b.x - game.playerX))[0];
        if (choice) target = choice.x + 1;
      }
      if (Math.abs(target - game.playerX) < 1.2 && game.playerCooldown <= 0) firePlayer();
    } else {
      const dir = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
      target = state.input.pointerX ?? game.playerX + dir * 11;
      if (state.input.fire) firePlayer();
    }
    const dx = clamp(target - game.playerX, -config.player * dt, config.player * dt);
    game.playerX = clamp(game.playerX + dx, FIELD.x + 4, FIELD.x + FIELD.w - 5);
    game.playerCooldown = Math.max(0, game.playerCooldown - dt);
  }

  function updateInvaders(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    const alive = game.invaders.filter((alien) => alien.alive);
    if (!alive.length) {
      nextWave();
      return;
    }
    const minX = Math.min(...alive.map((alien) => alien.x));
    const maxX = Math.max(...alive.map((alien) => alien.x + 3));
    if (maxX >= FIELD.x + FIELD.w - 3 && game.enemyDir > 0) {
      game.enemyDir = -1;
      alive.forEach((alien) => (alien.y += 2));
      addLog("FLEET DESCENDS", "info");
    } else if (minX <= FIELD.x + 3 && game.enemyDir < 0) {
      game.enemyDir = 1;
      alive.forEach((alien) => (alien.y += 2));
      addLog("FLEET DESCENDS", "info");
    }
    const pace = config.enemy + game.wave * 0.42 + (game.invaders.length - alive.length) * 0.035;
    alive.forEach((alien) => {
      alien.x += game.enemyDir * pace * dt;
    });
    if (Math.max(...alive.map((alien) => alien.y)) > PLAYER_Y - 5) {
      game.status = "BASE OVERRUN";
      addLog("BASE OVERRUN", "hit");
      addBurst(FIELD.x + FIELD.w / 2, PLAYER_Y, color.red, 60, 1.4);
    }
    game.enemyCooldown -= dt;
    if (game.enemyCooldown <= 0) {
      fireEnemy();
      game.enemyCooldown = clamp(1.15 - game.wave * 0.05 - config.fire * state.rng() * 0.45, 0.25, 1.25);
    }
    updateUfo(dt);
  }

  function updateBullets(dt) {
    const game = state.game;
    for (const bullet of game.playerBullets) {
      bullet.y += bullet.vy * dt;
      addTrail(bullet.x, bullet.y + 1, "╵", color.cyan, 160);
    }
    for (const bullet of game.enemyBullets) {
      bullet.y += bullet.vy * dt;
      addTrail(bullet.x, bullet.y - 1, "╷", color.red, 170);
    }

    for (const bullet of game.playerBullets) {
      if (bullet.dead) continue;
      if (damageShield(bullet.x, bullet.y, 2)) {
        bullet.dead = true;
        continue;
      }
      if (
        game.ufo.active &&
        bullet.x >= game.ufo.x - 1 &&
        bullet.x <= game.ufo.x + 5 &&
        bullet.y >= game.ufo.y - 1 &&
        bullet.y <= game.ufo.y + 3
      ) {
        bullet.dead = true;
        game.ufo.active = false;
        game.ufo.next = 7 + state.rng() * 9;
        game.score += 500 + game.wave * 25;
        addLog("UFO +500", "ok");
        addBurst(game.ufo.x + 2, game.ufo.y + 1, color.red2, 38, 1.25);
        continue;
      }
      const hit = game.invaders.find((alien) => {
        return alien.alive && bullet.x >= alien.x - 1 && bullet.x <= alien.x + 4 && bullet.y >= alien.y - 1 && bullet.y <= alien.y + 3;
      });
      if (hit) {
        hit.alive = false;
        bullet.dead = true;
        game.combo += 1;
        game.score += 100 + hit.type * 40 + game.combo * 5;
        addLog(`KILL +${100 + hit.type * 40}`, "ok");
        addBurst(hit.x + 1, hit.y + 1, hit.type === 2 ? color.red : color.enemy, 26, 1.1);
      }
    }

    for (const bullet of game.enemyBullets) {
      if (bullet.dead) continue;
      if (damageShield(bullet.x, bullet.y, 1)) {
        bullet.dead = true;
        continue;
      }
      if (bullet.y >= PLAYER_Y - 1 && Math.abs(bullet.x - game.playerX) <= 3) {
        bullet.dead = true;
        hitPlayer();
      }
    }

    game.playerBullets = game.playerBullets.filter((bullet) => !bullet.dead && bullet.y > FIELD.y + 1);
    game.enemyBullets = game.enemyBullets.filter((bullet) => !bullet.dead && bullet.y < FIELD.y + FIELD.h - 1);
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    updatePlayer(dt);
    updateInvaders(dt);
    updateBullets(dt);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawUfo(now);
      state.game.invaders.forEach((alien) => drawInvader(alien, now));
      drawShields();
      drawBullets();
      drawPlayer();
      if (state.paused) writeText(FIELD.x + 40, FIELD.y + 24, "PAUSED", color.green);
      if (state.game.status !== "LIVE") {
        writeText(FIELD.x + 34, FIELD.y + 24, `${state.game.status} - R RESTART`, color.red);
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
    if (key === "i") {
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
      firePlayer();
      return;
    }
    if (key === "a" || event.key === "ArrowLeft") state.input.left = true;
    if (key === "d" || event.key === "ArrowRight") state.input.right = true;
    if (["a", "d", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (key === " " || event.code === "Space") state.input.fire = false;
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    state.input.pointerX = ((event.clientX - rect.left) / rect.width) * COLS;
  });

  canvas.addEventListener("pointerleave", () => {
    state.input.pointerX = null;
  });

  canvas.addEventListener("pointerdown", () => {
    state.input.fire = true;
    firePlayer();
  });

  canvas.addEventListener("pointerup", () => {
    state.input.fire = false;
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
