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
  const SKY = { x: 8, y: 6, w: 88, h: 43 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    sky: "#071018",
    sky2: "#0a1420",
    lane: "#0c1a26",
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
    enemy: "#ff6b67",
    enemy2: "#ffcc66",
    bullet: "#6ed5ec",
    hostile: "#ff4d5f",
  };

  const difficultyConfig = {
    normal: { player: 34, fire: 0.16, enemy: 10, spawn: 0.95, bullet: 28, hostile: 19, bossHp: 76 },
    fast: { player: 39, fire: 0.13, enemy: 12, spawn: 0.78, bullet: 33, hostile: 23, bossHp: 92 },
    chaos: { player: 45, fire: 0.1, enemy: 15, spawn: 0.6, bullet: 38, hostile: 27, bossHp: 118 },
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

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = {
      elapsed: 0,
      scroll: 0,
      score: 0,
      wave: 1,
      lives: 3,
      status: "SORTIE",
      player: {
        x: SKY.x + Math.floor(SKY.w / 2),
        y: SKY.y + SKY.h - 5,
        cooldown: 0,
        invuln: 2.1,
        wingmen: 0,
      },
      enemies: [],
      boss: null,
      playerBullets: [],
      enemyBullets: [],
      pickups: [],
      spawnTimer: 0.45,
      bossTimer: 23,
      flash: 0,
    };
    state.trails = [];
    state.effects = [];
    state.eventLog = [];
    state.paused = false;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW SORTIE SEED" : "RUNWAY READY", "ok");
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
    drawText(SKY.x + 1, SKY.y - 2, "PACIFIC STRIKE VECTOR", color.header);
    drawText(SKY.x + 58, SKY.y - 2, "ENEMY FORMATION", color.gold);
    const scroll = Math.floor(state.game.scroll);
    for (let y = SKY.y; y < SKY.y + SKY.h; y += 1) {
      for (let x = SKY.x; x < SKY.x + SKY.w; x += 1) {
        const p = idx(x, y);
        const lane = Math.floor((x - SKY.x) / 11) % 2 === 0;
        screen.bg[p] = lane ? color.sky : color.sky2;
        const n = hash01(x, y + scroll, 44);
        if (n > 0.986) {
          screen.ch[p] = n > 0.994 ? "✦" : "·";
          screen.fg[p] = n > 0.994 ? color.cyan : "#31516a";
        }
      }
    }
    for (let y = SKY.y + ((scroll % 8) + 8) % 8; y < SKY.y + SKY.h; y += 8) {
      for (let x = SKY.x + 1; x < SKY.x + SKY.w - 1; x += 6) {
        if (hash01(x, y, 55) > 0.62) setCell(x, y, "·", color.lineDim);
      }
    }
  }

  function drawPlane(x, y, fg = color.player, invuln = 0) {
    if (invuln > 0 && Math.floor(state.game.elapsed * 12) % 2 === 0) fg = color.cyan2;
    setCell(x, y - 2, "▲", fg);
    setCell(x - 1, y - 1, "╱", fg);
    setCell(x, y - 1, "█", fg);
    setCell(x + 1, y - 1, "╲", fg);
    setCell(x - 2, y, "◢", fg);
    setCell(x - 1, y, "█", fg);
    setCell(x, y, "█", fg);
    setCell(x + 1, y, "█", fg);
    setCell(x + 2, y, "◣", fg);
    setCell(x - 1, y + 1, "╲", fg);
    setCell(x + 1, y + 1, "╱", fg);
  }

  function drawPlayer() {
    const p = state.game.player;
    drawPlane(Math.round(p.x), Math.round(p.y), color.player, p.invuln);
    for (let i = 0; i < p.wingmen; i += 1) {
      const side = i === 0 ? -5 : 5;
      drawPlane(Math.round(p.x + side), Math.round(p.y + 2), color.cyan, p.invuln);
    }
  }

  function drawEnemy(enemy) {
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y);
    const fg = enemy.type === "ace" ? color.red2 : enemy.type === "bomber" ? color.enemy2 : color.enemy;
    if (enemy.type === "bomber") {
      setCell(x, y - 1, "▄", fg);
      setCell(x - 2, y, "▟", fg);
      setCell(x - 1, y, "█", fg);
      setCell(x, y, "█", fg);
      setCell(x + 1, y, "█", fg);
      setCell(x + 2, y, "▙", fg);
      setCell(x - 1, y + 1, "▀", fg);
      setCell(x + 1, y + 1, "▀", fg);
      return;
    }
    setCell(x, y - 1, "▼", fg);
    setCell(x - 1, y, "▟", fg);
    setCell(x, y, "█", fg);
    setCell(x + 1, y, "▙", fg);
    setCell(x - 2, y + 1, "╲", fg);
    setCell(x + 2, y + 1, "╱", fg);
  }

  function drawBoss() {
    const boss = state.game.boss;
    if (!boss) return;
    const x = Math.round(boss.x);
    const y = Math.round(boss.y);
    const fg = boss.hp < boss.maxHp * 0.35 ? color.red : color.enemy2;
    const rows = [
      "   ▄████▄   ",
      " ▄██▓██▓██▄ ",
      "███▓████▓███",
      " ▀█▓████▓█▀ ",
      "  ▟▀ ▀▀ ▀▙  ",
    ];
    for (let ry = 0; ry < rows.length; ry += 1) {
      for (let rx = 0; rx < rows[ry].length; rx += 1) {
        const ch = rows[ry][rx];
        if (ch !== " ") setCell(x - 6 + rx, y - 2 + ry, ch, fg);
      }
    }
  }

  function drawBullets() {
    for (const b of state.game.playerBullets) {
      setCell(b.x, b.y, b.wing ? "║" : "┃", b.wing ? color.cyan : color.bullet);
      setCell(b.x, b.y + 1, "·", color.cyan);
    }
    for (const b of state.game.enemyBullets) {
      setCell(b.x, b.y, b.big ? "▓" : "┃", b.big ? color.orange : color.hostile);
      setCell(b.x, b.y - 1, "·", color.red);
    }
  }

  function drawPickups() {
    for (const p of state.game.pickups) {
      setCell(p.x, p.y - 1, "◦", color.green);
      setCell(p.x, p.y, p.kind === "wing" ? "W" : "+", p.kind === "wing" ? color.cyan : color.green);
      setCell(p.x, p.y + 1, "◦", color.green);
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
    drawText(RIGHT.x + 2, RIGHT.y + 2, "MISSION", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 5, `WAVE  ${String(game.wave).padStart(2, "0")}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 6, `LIVES ${"♥".repeat(Math.max(0, game.lives))}`, game.lives <= 1 ? color.red : color.red2);
    drawText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 12, "ARMAMENT", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 14, `WING  ${game.player.wingmen}`, game.player.wingmen ? color.cyan : color.muted);
    drawText(RIGHT.x + 2, RIGHT.y + 15, `ENEMY ${String(game.enemies.length).padStart(2, "0")}`, color.gold);
    if (game.boss) {
      const bars = Math.round((game.boss.hp / game.boss.maxHp) * 20);
      drawText(RIGHT.x + 2, RIGHT.y + 17, "BOSS", color.red2);
      drawText(RIGHT.x + 2, RIGHT.y + 18, `[${"█".repeat(bars).padEnd(20, " ")}]`, color.red2);
    } else {
      const next = Math.max(0, game.bossTimer - game.elapsed);
      drawText(RIGHT.x + 2, RIGHT.y + 17, `BOSS ${next.toFixed(0).padStart(3, " ")}s`, color.muted);
    }
    drawText(RIGHT.x + 2, RIGHT.y + 23, "LOG", color.header);
    for (let i = 0; i < 18; i += 1) {
      const entry = state.eventLog[i + state.logOffset];
      if (!entry) break;
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "gold" ? color.gold : color.muted;
      drawText(RIGHT.x + 2, RIGHT.y + 25 + i, `>${entry.message}`.slice(0, RIGHT.w - 4), fg);
    }
  }

  function drawFooter() {
    drawText(FIELD.x + 4, FIELD.y + FIELD.h + 1, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE   SPACE FIRE   P PAUSE   R REROLL   J HOME", color.muted);
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
      const speed = 4 + state.rng() * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ch: glyphs[Math.floor(state.rng() * glyphs.length)],
        fg,
        start: performance.now(),
        duration: 380 + state.rng() * 520,
      });
    }
  }

  function trail(x, y, ch, fg, duration = 240) {
    if (reducedMotion) return;
    state.trails.push({ x, y, ch, fg, start: performance.now(), duration });
    state.trails = state.trails.slice(-240);
  }

  function spawnEnemy() {
    const game = state.game;
    const roll = state.rng();
    const type = roll > 0.82 ? "bomber" : roll > 0.58 ? "ace" : "fighter";
    const hp = type === "bomber" ? 4 : type === "ace" ? 2 : 1;
    const x = SKY.x + 6 + state.rng() * (SKY.w - 12);
    const vx = (state.rng() - 0.5) * (type === "ace" ? 11 : 6);
    game.enemies.push({
      type,
      x,
      y: SKY.y - 2,
      vx,
      vy: difficultyConfig[state.difficulty].enemy * (type === "bomber" ? 0.62 : 1),
      hp,
      fire: 0.5 + state.rng() * 1.6,
      phase: state.rng() * Math.PI * 2,
      score: type === "bomber" ? 180 : type === "ace" ? 140 : 90,
    });
  }

  function spawnBoss() {
    const game = state.game;
    if (game.boss) return;
    const hp = difficultyConfig[state.difficulty].bossHp + game.wave * 7;
    game.boss = {
      x: SKY.x + SKY.w / 2,
      y: SKY.y + 5,
      vx: 10,
      hp,
      maxHp: hp,
      fire: 0.2,
      burst: 2.2,
    };
    game.status = "BOSS";
    addLog("BOSS INBOUND", "bad");
    burst(game.boss.x, game.boss.y, color.red, 28, 16);
  }

  function firePlayer() {
    const game = state.game;
    const p = game.player;
    if (p.cooldown > 0 || game.status === "DOWN" || game.status === "CLEARED") return;
    const cfg = difficultyConfig[state.difficulty];
    game.playerBullets.push({ x: p.x, y: p.y - 3, vy: -cfg.bullet, wing: false, damage: 1 });
    for (let i = 0; i < p.wingmen; i += 1) {
      const side = i === 0 ? -5 : 5;
      game.playerBullets.push({ x: p.x + side, y: p.y - 1, vy: -cfg.bullet * 0.92, wing: true, damage: 1 });
    }
    p.cooldown = cfg.fire;
    trail(p.x, p.y - 2, "│", color.cyan, 120);
  }

  function fireEnemy(x, y, vx = 0, big = false) {
    state.game.enemyBullets.push({
      x,
      y,
      vx,
      vy: difficultyConfig[state.difficulty].hostile * (big ? 0.86 : 1),
      big,
    });
  }

  function hitPlayer(x, y) {
    const game = state.game;
    const p = game.player;
    if (p.invuln > 0 || game.status === "DOWN" || game.status === "CLEARED") return;
    if (Math.abs(x - p.x) <= 2.5 && Math.abs(y - p.y) <= 2.5) {
      game.lives -= 1;
      p.invuln = 2.4;
      p.wingmen = Math.max(0, p.wingmen - 1);
      burst(p.x, p.y, color.red, 36, 18);
      addLog(game.lives > 0 ? "PLAYER HIT" : "AIRFRAME LOST", "bad");
      if (game.lives <= 0) {
        game.status = "DOWN";
        addLog("MISSION FAILED", "bad");
      }
    }
  }

  function enemyKilled(enemy) {
    const game = state.game;
    game.score += enemy.score;
    burst(enemy.x, enemy.y, enemy.type === "bomber" ? color.gold : color.red2, enemy.type === "bomber" ? 28 : 18, 14);
    addLog(`KILL +${enemy.score}`, "ok");
    if (state.rng() > 0.88) game.pickups.push({ x: enemy.x, y: enemy.y, vy: 8, kind: state.rng() > 0.35 ? "wing" : "life" });
  }

  function updateAI() {
    const game = state.game;
    const p = game.player;
    let targetX = p.x;
    const threats = game.enemyBullets.filter((b) => b.y < p.y && p.y - b.y < 14);
    if (threats.length) {
      const nearest = threats.reduce((best, b) => (Math.abs(b.x - p.x) < Math.abs(best.x - p.x) ? b : best), threats[0]);
      targetX = nearest.x < p.x ? p.x + 10 : p.x - 10;
    } else if (game.pickups.length) {
      const pickup = game.pickups.reduce((best, item) => (Math.abs(item.y - p.y) < Math.abs(best.y - p.y) ? item : best), game.pickups[0]);
      targetX = pickup.x;
    } else {
      const targets = [...game.enemies];
      if (game.boss) targets.push(game.boss);
      if (targets.length) {
        const target = targets.reduce((best, e) => (e.y > best.y ? e : best), targets[0]);
        targetX = target.x;
      }
    }
    state.input.left = targetX < p.x - 1.5;
    state.input.right = targetX > p.x + 1.5;
    state.input.up = false;
    state.input.down = false;
    state.input.fire = true;
  }

  function updatePlayer(dt) {
    const game = state.game;
    const p = game.player;
    if (state.mode === "demo") updateAI();
    const cfg = difficultyConfig[state.difficulty];
    const dx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    const dy = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / len) * cfg.player * dt, SKY.x + 4, SKY.x + SKY.w - 5);
    p.y = clamp(p.y + (dy / len) * cfg.player * dt, SKY.y + 12, SKY.y + SKY.h - 3);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (state.input.fire || state.mode === "demo") firePlayer();
    if (Math.floor(game.elapsed * 18) % 3 === 0) trail(p.x, p.y + 2, "░", color.cyan, 260);
  }

  function updateEnemies(dt) {
    const game = state.game;
    const cfg = difficultyConfig[state.difficulty];
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0 && !game.boss && game.status !== "DOWN" && game.status !== "CLEARED") {
      spawnEnemy();
      game.spawnTimer = Math.max(0.28, cfg.spawn - game.wave * 0.03 + state.rng() * 0.55);
    }
    for (const enemy of game.enemies) {
      enemy.phase += dt * 3.2;
      enemy.x += (enemy.vx + Math.sin(enemy.phase) * 5) * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.x < SKY.x + 4 || enemy.x > SKY.x + SKY.w - 5) enemy.vx *= -1;
      enemy.fire -= dt;
      if (enemy.fire <= 0 && enemy.y > SKY.y && enemy.y < SKY.y + SKY.h - 10) {
        fireEnemy(enemy.x, enemy.y + 2, enemy.type === "ace" ? (state.rng() - 0.5) * 6 : 0, enemy.type === "bomber");
        enemy.fire = enemy.type === "bomber" ? 1.1 + state.rng() * 1.4 : 1.4 + state.rng() * 1.8;
      }
      if (Math.floor((game.elapsed + enemy.phase) * 11) % 5 === 0) trail(enemy.x, enemy.y - 1, "·", color.red2, 220);
      hitPlayer(enemy.x, enemy.y);
    }
    game.enemies = game.enemies.filter((e) => e.y < SKY.y + SKY.h + 4 && e.hp > 0);
  }

  function updateBoss(dt) {
    const game = state.game;
    if (!game.boss && game.elapsed > game.bossTimer) spawnBoss();
    const boss = game.boss;
    if (!boss) return;
    boss.x += boss.vx * dt;
    if (boss.x < SKY.x + 9 || boss.x > SKY.x + SKY.w - 9) boss.vx *= -1;
    boss.fire -= dt;
    boss.burst -= dt;
    if (boss.fire <= 0) {
      fireEnemy(boss.x - 5, boss.y + 3, -3, true);
      fireEnemy(boss.x, boss.y + 4, 0, true);
      fireEnemy(boss.x + 5, boss.y + 3, 3, true);
      boss.fire = 0.55 + state.rng() * 0.4;
    }
    if (boss.burst <= 0) {
      for (let i = -2; i <= 2; i += 1) fireEnemy(boss.x + i * 4, boss.y + 4, i * 2.2, false);
      boss.burst = 2.4 + state.rng() * 1.2;
      addLog("BOSS VOLLEY", "bad");
    }
    if (boss.hp <= 0) {
      game.score += 2500 + game.wave * 200;
      burst(boss.x, boss.y, color.gold, 72, 26, ["▓", "▒", "░", "✦", "*"]);
      addLog("BOSS DOWN", "ok");
      game.boss = null;
      game.wave += 1;
      game.bossTimer = game.elapsed + 24;
      game.status = game.wave >= 4 ? "CLEARED" : "SORTIE";
      if (game.status === "CLEARED") addLog("AIRSPACE CLEAR", "ok");
    }
  }

  function updateBullets(dt) {
    const game = state.game;
    for (const b of game.playerBullets) {
      b.y += b.vy * dt;
      trail(b.x, b.y + 1, "·", b.wing ? color.cyan : color.bullet, 120);
    }
    for (const b of game.enemyBullets) {
      b.x += (b.vx || 0) * dt;
      b.y += b.vy * dt;
      trail(b.x, b.y - 1, "·", color.red, 150);
      hitPlayer(b.x, b.y);
    }
    for (const b of game.playerBullets) {
      for (const enemy of game.enemies) {
        const radius = enemy.type === "bomber" ? 3.2 : 2.3;
        if (Math.abs(b.x - enemy.x) <= radius && Math.abs(b.y - enemy.y) <= radius) {
          enemy.hp -= b.damage;
          b.dead = true;
          burst(b.x, b.y, color.cyan, 6, 5, ["·", "░"]);
          if (enemy.hp <= 0) enemyKilled(enemy);
          break;
        }
      }
      if (!b.dead && game.boss && Math.abs(b.x - game.boss.x) <= 8 && Math.abs(b.y - game.boss.y) <= 4) {
        game.boss.hp -= b.damage;
        b.dead = true;
        burst(b.x, b.y, color.gold, 7, 6, ["░", "·"]);
      }
    }
    game.playerBullets = game.playerBullets.filter((b) => !b.dead && b.y > SKY.y - 3);
    game.enemyBullets = game.enemyBullets.filter((b) => b.y < SKY.y + SKY.h + 4 && b.x > SKY.x - 4 && b.x < SKY.x + SKY.w + 4);
  }

  function updatePickups(dt) {
    const game = state.game;
    const p = game.player;
    for (const pickup of game.pickups) {
      pickup.y += pickup.vy * dt;
      if (Math.hypot(pickup.x - p.x, pickup.y - p.y) < 3.2) {
        pickup.dead = true;
        if (pickup.kind === "wing") {
          p.wingmen = Math.min(2, p.wingmen + 1);
          addLog("WINGMAN JOINED", "ok");
          burst(p.x, p.y, color.cyan, 24, 12);
        } else {
          game.lives += 1;
          addLog("EXTRA LIFE", "ok");
          burst(p.x, p.y, color.green, 24, 12);
        }
      }
    }
    game.pickups = game.pickups.filter((pck) => !pck.dead && pck.y < SKY.y + SKY.h + 3);
  }

  function updateGame(dt) {
    const game = state.game;
    game.elapsed += dt;
    game.scroll += dt * (difficultyConfig[state.difficulty].enemy + 10);
    if (game.status === "DOWN" || game.status === "CLEARED") {
      game.flash = Math.max(0, game.flash - dt);
      return;
    }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateBullets(dt);
    updatePickups(dt);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    drawPickups();
    drawBullets();
    for (const enemy of state.game.enemies) drawEnemy(enemy);
    drawBoss();
    drawPlayer();
    if (state.paused) drawText(FIELD.x + 41, FIELD.y + 2, " PAUSED ", color.gold);
    if (state.game.status === "CLEARED") drawText(SKY.x + 33, SKY.y + 19, " AIRSPACE CLEAR ", color.green);
    if (state.game.status === "DOWN") drawText(SKY.x + 34, SKY.y + 19, " MISSION FAILED ", color.red);
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
    if (key === "j") {
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
