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
  const GRID_W = 92;
  const GRID_H = 39;
  const GRID_X = FIELD.x + 3;
  const GRID_Y = FIELD.y + 3;

  const glyph = {
    full: String.fromCharCode(0x2588),
    dark: String.fromCharCode(0x2593),
    mid: String.fromCharCode(0x2592),
    light: String.fromCharCode(0x2591),
    dot: String.fromCharCode(0x00b7),
  };

  const color = {
    ink: "#06080d",
    ink2: "#080d13",
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
    green2: "#baffc9",
    gold: "#ffcc66",
    orange: "#ff9f45",
    red: "#ff4d5f",
    red2: "#ff7b6f",
    blue: "#72a7ff",
    purple: "#b58cff",
    boardA: "#071017",
    boardB: "#08131b",
    path: "#111924",
  };

  const configs = {
    normal: { enemy: 4.8, spawn: 0.82, budget: 190, bounty: 18, waveDelay: 3.2 },
    fast: { enemy: 6.5, spawn: 0.62, budget: 215, bounty: 17, waveDelay: 2.5 },
    chaos: { enemy: 8.6, spawn: 0.43, budget: 245, bounty: 16, waveDelay: 1.8 },
  };

  const towerTypes = [
    { key: "C", name: "CANNON", cost: 55, range: 10, damage: 18, rate: 0.72, color: color.gold, shot: "*" },
    { key: "L", name: "LASER", cost: 70, range: 13, damage: 10, rate: 0.34, color: color.cyan2, shot: "+" },
    { key: "S", name: "SPLASH", cost: 85, range: 8, damage: 27, rate: 1.1, color: color.red2, shot: "#" },
  ];

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
    logs: [],
    lastFrame: 0,
    cursorType: 0,
  };

  function idx(x, y) {
    return y * COLS + x;
  }

  function cellIndex(x, y) {
    return y * GRID_W + x;
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

  function put(x, y, char = " ", fg = color.text, bg = null) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const p = idx(x, y);
    screen.ch[p] = char;
    screen.fg[p] = fg;
    if (bg !== null) screen.bg[p] = bg;
  }

  function writeText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) put(x + i, y, text[i], fg, bg);
  }

  function fillRectChars(x, y, w, h, char, fg, bg = null) {
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) put(x + xx, y + yy, char, fg, bg);
    }
  }

  function drawBox(x, y, w, h, fg = color.line, bg = color.panel) {
    fillRectChars(x, y, w, h, " ", fg, bg);
    for (let xx = x + 1; xx < x + w - 1; xx += 1) {
      put(xx, y, "-", fg, bg);
      put(xx, y + h - 1, "-", fg, bg);
    }
    for (let yy = y + 1; yy < y + h - 1; yy += 1) {
      put(x, yy, "|", fg, bg);
      put(x + w - 1, yy, "|", fg, bg);
    }
    put(x, y, "+", fg, bg);
    put(x + w - 1, y, "+", fg, bg);
    put(x, y + h - 1, "+", fg, bg);
    put(x + w - 1, y + h - 1, "+", fg, bg);
  }

  function drawBar(x, y, w, value, fg) {
    const filled = clamp(Math.round(w * value), 0, w);
    put(x - 1, y, "[", color.red);
    put(x + w, y, "]", color.red);
    for (let i = 0; i < w; i += 1) put(x + i, y, i < filled ? glyph.full : glyph.light, i < filled ? fg : color.lineDim);
  }

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.text;
      screen.bg[i] = color.ink;
    }
  }

  function addLog(message, tone = "info") {
    state.logs.unshift({ message, tone });
    state.logs = state.logs.slice(0, 48);
  }

  function addEffect(x, y, tone, kind = "burst", text = "") {
    if (state.effects.length > 280) state.effects.splice(0, state.effects.length - 280);
    state.effects.push({ x, y, tone, kind, text, age: 0, life: kind === "damage" ? 0.65 : 0.48 });
  }

  function makePath() {
    const path = [];
    let x = 0;
    let y = 6 + Math.floor(state.rng() * (GRID_H - 12));
    path.push({ x, y });
    while (x < GRID_W - 1) {
      const run = 4 + Math.floor(state.rng() * 9);
      for (let i = 0; i < run && x < GRID_W - 1; i += 1) path.push({ x: ++x, y });
      const bend = Math.floor(state.rng() * 13) - 6;
      const targetY = clamp(y + bend, 3, GRID_H - 4);
      while (y !== targetY) {
        y += Math.sign(targetY - y);
        path.push({ x, y });
      }
    }
    return path;
  }

  function makeEnemy(wave) {
    const game = state.game;
    const hp = 38 + wave * 13 + Math.floor(state.rng() * (wave * 5 + 10));
    const kindRoll = state.rng();
    const kind = kindRoll > 0.88 ? "BOSS" : kindRoll > 0.68 ? "FAST" : "DRONE";
    return {
      pos: 0,
      hp: kind === "BOSS" ? hp * 2.7 : hp,
      maxHp: kind === "BOSS" ? hp * 2.7 : hp,
      speed: kind === "FAST" ? 1.65 : kind === "BOSS" ? 0.62 : 1,
      kind,
      slow: 0,
      alive: true,
    };
  }

  function initGame(seed = state.seed) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash ^ 0x70def113);
    state.mode = playModeSelect.value;
    state.difficulty = difficultySelect.value;
    state.speed = 1;
    state.paused = false;
    state.effects = [];
    state.logs = [];
    const path = makePath();
    const pathMask = new Uint8Array(GRID_W * GRID_H);
    for (const p of path) pathMask[cellIndex(p.x, p.y)] = 1;
    const cfg = configs[state.difficulty];
    state.game = {
      path,
      pathMask,
      towers: [],
      enemies: [],
      shots: [],
      wave: 0,
      waveTimer: 1.2,
      spawnLeft: 0,
      spawnTimer: 0,
      lives: 20,
      credits: cfg.budget,
      score: 0,
      kills: 0,
      elapsed: 0,
      selectedType: 0,
      status: "RUNNING",
    };
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog("DEFENSE GRID ONLINE", "green");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "cyan");
    if (state.mode === "demo") {
      for (let i = 0; i < 4; i += 1) autoBuildTower();
    }
  }

  function gridBlocked(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return true;
    const game = state.game;
    if (game.pathMask[cellIndex(x, y)]) return true;
    return game.towers.some((tower) => tower.x === x && tower.y === y);
  }

  function nearestPathDistance(x, y) {
    let best = Infinity;
    for (const p of state.game.path) {
      const d = Math.abs(p.x - x) + Math.abs(p.y - y);
      if (d < best) best = d;
    }
    return best;
  }

  function towerAt(x, y) {
    return state.game.towers.find((tower) => tower.x === x && tower.y === y);
  }

  function buildTower(x, y, typeIndex = state.game.selectedType) {
    const game = state.game;
    const existing = towerAt(x, y);
    if (existing) {
      const cost = 45 + existing.level * 35;
      if (game.credits < cost || existing.level >= 4) return false;
      game.credits -= cost;
      existing.level += 1;
      existing.cooldown = 0;
      addEffect(x, y, towerTypes[existing.type].color, "burst");
      addLog(`UPGRADE ${towerTypes[existing.type].key}${existing.level}`, "gold");
      return true;
    }
    if (gridBlocked(x, y)) return false;
    const type = towerTypes[typeIndex % towerTypes.length];
    if (game.credits < type.cost) return false;
    game.credits -= type.cost;
    game.towers.push({ x, y, type: typeIndex % towerTypes.length, level: 1, cooldown: state.rng() * type.rate });
    addEffect(x, y, type.color, "burst");
    addLog(`BUILD ${type.name}`, "green");
    return true;
  }

  function autoBuildTower() {
    const game = state.game;
    let best = null;
    for (let tries = 0; tries < 180; tries += 1) {
      const x = 3 + Math.floor(state.rng() * (GRID_W - 6));
      const y = 3 + Math.floor(state.rng() * (GRID_H - 6));
      if (gridBlocked(x, y)) continue;
      const dist = nearestPathDistance(x, y);
      if (dist < 2 || dist > 8) continue;
      const centerBias = 1 - Math.abs(x - GRID_W * 0.52) / GRID_W;
      const score = centerBias * 5 + (8 - dist) + hash01(x, y, game.wave) * 1.5;
      if (!best || score > best.score) best = { x, y, score };
    }
    if (!best) return false;
    const type = game.wave % 4 === 0 ? 2 : game.wave % 3 === 0 ? 1 : 0;
    return buildTower(best.x, best.y, type);
  }

  function startWave() {
    const game = state.game;
    game.wave += 1;
    game.spawnLeft = 8 + game.wave * 3 + (state.difficulty === "chaos" ? 5 : 0);
    game.spawnTimer = 0;
    addLog(`WAVE ${String(game.wave).padStart(2, "0")} INBOUND`, "gold");
    if (state.mode === "demo") {
      const builds = game.wave % 3 === 0 ? 2 : 1;
      for (let i = 0; i < builds; i += 1) autoBuildTower();
    }
  }

  function enemyPosition(enemy) {
    const path = state.game.path;
    const i = clamp(Math.floor(enemy.pos), 0, path.length - 1);
    const j = clamp(i + 1, 0, path.length - 1);
    const t = enemy.pos - i;
    return {
      x: lerp(path[i].x, path[j].x, t),
      y: lerp(path[i].y, path[j].y, t),
    };
  }

  function updateWaves(dt) {
    const game = state.game;
    const cfg = configs[state.difficulty];
    if (game.status !== "RUNNING") return;
    if (game.spawnLeft <= 0 && game.enemies.length === 0) {
      game.waveTimer -= dt;
      if (game.waveTimer <= 0) startWave();
      return;
    }
    if (game.spawnLeft > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        game.enemies.push(makeEnemy(game.wave));
        game.spawnLeft -= 1;
        game.spawnTimer = cfg.spawn;
      }
    }
  }

  function updateEnemies(dt) {
    const game = state.game;
    const cfg = configs[state.difficulty];
    for (const enemy of game.enemies) {
      const slowFactor = enemy.slow > 0 ? 0.55 : 1;
      enemy.pos += dt * cfg.enemy * enemy.speed * slowFactor;
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (enemy.pos >= game.path.length - 1) {
        enemy.alive = false;
        game.lives -= enemy.kind === "BOSS" ? 3 : 1;
        addEffect(GRID_W - 1, game.path[game.path.length - 1].y, color.red, "burst");
        addLog("BASE BREACH", "red");
      }
    }
    game.enemies = game.enemies.filter((enemy) => enemy.alive);
    if (game.lives <= 0) {
      game.lives = 0;
      game.status = "FAILED";
      state.paused = true;
      addLog("GRID FAILED", "red");
    }
  }

  function findTarget(tower) {
    const type = towerTypes[tower.type];
    const range = type.range + tower.level * 1.3;
    let best = null;
    let bestPos = -1;
    for (const enemy of state.game.enemies) {
      const pos = enemyPosition(enemy);
      const d = Math.hypot(pos.x - tower.x, pos.y - tower.y);
      if (d <= range && enemy.pos > bestPos) {
        best = enemy;
        bestPos = enemy.pos;
      }
    }
    return best;
  }

  function fireTower(tower, enemy) {
    const game = state.game;
    const type = towerTypes[tower.type];
    const pos = enemyPosition(enemy);
    const damage = type.damage * (1 + (tower.level - 1) * 0.45);
    enemy.hp -= damage;
    if (tower.type === 2) {
      for (const other of game.enemies) {
        const op = enemyPosition(other);
        if (Math.hypot(op.x - pos.x, op.y - pos.y) < 2.4) other.hp -= damage * 0.38;
      }
    }
    if (tower.type === 1) enemy.slow = 0.85;
    game.shots.push({ x1: tower.x, y1: tower.y, x2: pos.x, y2: pos.y, tone: type.color, age: 0, life: 0.18, char: type.shot });
    addEffect(pos.x, pos.y, type.color, "damage", String(Math.round(damage)));
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      const bounty = configs[state.difficulty].bounty + Math.floor(enemy.maxHp / 20);
      game.credits += bounty;
      game.score += Math.round(enemy.maxHp) + game.wave * 7;
      game.kills += 1;
      addEffect(pos.x, pos.y, enemy.kind === "BOSS" ? color.red2 : color.gold, "burst");
      if (enemy.kind === "BOSS") addLog("BOSS DOWN", "gold");
    }
  }

  function updateTowers(dt) {
    const game = state.game;
    for (const tower of game.towers) {
      const type = towerTypes[tower.type];
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const target = findTarget(tower);
      if (!target) continue;
      fireTower(tower, target);
      tower.cooldown = Math.max(0.06, type.rate / (1 + (tower.level - 1) * 0.22));
    }
    game.enemies = game.enemies.filter((enemy) => enemy.alive);
    for (const shot of game.shots) shot.age += dt;
    game.shots = game.shots.filter((shot) => shot.age < shot.life);
  }

  function updateEffects(dt) {
    for (const effect of state.effects) effect.age += dt;
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
  }

  function update(dt) {
    if (!state.game) return;
    updateEffects(dt);
    if (state.paused) return;
    const scaled = dt * state.speed;
    const game = state.game;
    game.elapsed += scaled;
    updateWaves(scaled);
    updateEnemies(scaled);
    updateTowers(scaled);
    if (game.status === "RUNNING" && game.wave >= 16 && game.spawnLeft <= 0 && game.enemies.length === 0) {
      game.status = "VICTORY";
      state.paused = true;
      addLog("DEFENSE COMPLETE", "gold");
    }
    if (state.mode === "demo" && game.credits > 140 && state.rng() < scaled * 0.42) autoBuildTower();
  }

  function drawBackground() {
    clearScreen();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const band = Math.floor(y / 5) % 2 === 0 ? color.ink : "#05090f";
        const bg = hash01(x, y, 99) > 0.92 ? color.ink2 : band;
        screen.bg[idx(x, y)] = bg;
        if (hash01(x, y, 21) > 0.985) put(x, y, hash01(x, y, 22) > 0.65 ? glyph.dot : ":", color.lineDim, bg);
      }
    }
  }

  function drawField() {
    const game = state.game;
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line, color.panel);
    writeText(FIELD.x + 2, FIELD.y - 2, "TOWER DEFENSE GRID", color.header);
    writeText(FIELD.x + FIELD.w - 28, FIELD.y - 2, "PATH / TURRET / BURST", color.green);

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        const bg = (Math.floor(x / 5) + Math.floor(y / 4)) % 2 ? color.boardA : color.boardB;
        if (game.pathMask[p]) {
          const edge = hash01(x, y, 14) > 0.72 ? glyph.light : "=";
          put(GRID_X + x, GRID_Y + y, edge, color.line, color.path);
        } else if (hash01(x, y, 5) < 0.08) {
          put(GRID_X + x, GRID_Y + y, glyph.dot, color.lineDim, bg);
        } else {
          put(GRID_X + x, GRID_Y + y, " ", color.dim, bg);
        }
      }
    }

    const start = game.path[0];
    const end = game.path[game.path.length - 1];
    writeText(GRID_X + start.x, GRID_Y + start.y - 1, "IN", color.green);
    writeText(GRID_X + end.x - 2, GRID_Y + end.y + 1, "CORE", color.red);

    for (const shot of game.shots) {
      const steps = Math.max(3, Math.ceil(Math.hypot(shot.x2 - shot.x1, shot.y2 - shot.y1)));
      const fade = 1 - shot.age / shot.life;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const x = Math.round(lerp(shot.x1, shot.x2, t));
        const y = Math.round(lerp(shot.y1, shot.y2, t));
        if (i % 2 === 0 || fade > 0.65) put(GRID_X + x, GRID_Y + y, shot.char, mixColor(color.dim, shot.tone, fade));
      }
    }

    for (const tower of game.towers) {
      const type = towerTypes[tower.type];
      const x = GRID_X + tower.x;
      const y = GRID_Y + tower.y;
      put(x, y, type.key, type.color, "#101722");
      put(x - 1, y, "[", color.line);
      put(x + 1, y, "]", color.line);
      if (tower.level > 1) put(x, y - 1, String(tower.level), color.gold);
    }

    for (const enemy of game.enemies) {
      const pos = enemyPosition(enemy);
      const x = Math.round(GRID_X + pos.x);
      const y = Math.round(GRID_Y + pos.y);
      const hpRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);
      const fg = enemy.kind === "BOSS" ? color.red2 : enemy.kind === "FAST" ? color.orange : color.cyan2;
      put(x, y, enemy.kind === "BOSS" ? "B" : enemy.kind === "FAST" ? "f" : "e", fg);
      if (hpRatio < 0.55) put(x, y - 1, hpRatio < 0.25 ? "!" : "-", color.red);
    }
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const t = effect.age / effect.life;
      const fg = mixColor(effect.tone, color.dim, t);
      if (effect.kind === "damage" && effect.text) {
        writeText(GRID_X + Math.round(effect.x), GRID_Y + Math.round(effect.y) - Math.floor(t * 3), effect.text.slice(0, 3), fg);
        continue;
      }
      const r = 1 + t * 5;
      const rr = Math.ceil(r);
      for (let dy = -rr; dy <= rr; dy += 1) {
        for (let dx = -rr; dx <= rr; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - r) > 0.45) continue;
          if (hash01(Math.round(effect.x) + dx, Math.round(effect.y) + dy, Math.floor(effect.age * 27)) < 0.14) continue;
          put(GRID_X + Math.round(effect.x) + dx, GRID_Y + Math.round(effect.y) + dy, t < 0.5 ? "*" : ".", fg);
        }
      }
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line, color.panel);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "DEFENSE", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `WAVE    ${String(game.wave).padStart(3, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `LIVES   ${String(game.lives).padStart(3, "0")}`, game.lives < 6 ? color.red : color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `CREDIT  ${String(Math.floor(game.credits)).padStart(4, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `KILLS   ${String(game.kills).padStart(4, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SCORE   ${String(game.score).padStart(6, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 11, `MODE    ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 12, `SPD     ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 13, `STATE   ${game.status}`, game.status === "RUNNING" ? color.green : game.status === "VICTORY" ? color.gold : color.red);

    writeText(RIGHT.x + 2, RIGHT.y + 17, "TOWERS", color.header);
    for (let i = 0; i < towerTypes.length; i += 1) {
      const type = towerTypes[i];
      const y = RIGHT.y + 19 + i * 3;
      writeText(RIGHT.x + 2, y, `${type.key} ${type.name}`, type.color);
      writeText(RIGHT.x + 2, y + 1, `COST ${type.cost} RNG ${type.range}`, color.muted);
    }
    const selected = towerTypes[state.game.selectedType];
    writeText(RIGHT.x + 2, RIGHT.y + 29, `SELECT ${selected.key} ${selected.name}`, selected.color);

    writeText(RIGHT.x + 2, RIGHT.y + 33, "CORE", color.header);
    drawBar(RIGHT.x + 2, RIGHT.y + 35, 20, game.lives / 20, game.lives < 6 ? color.red : color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 38, "LOG", color.header);
    const tones = { red: color.red, green: color.green, cyan: color.cyan, gold: color.gold, info: color.muted };
    for (let i = 0; i < 12; i += 1) {
      const item = state.logs[i];
      if (!item) break;
      writeText(RIGHT.x + 2, RIGHT.y + 40 + i, `>${item.message}`.slice(0, RIGHT.w - 4), tones[item.tone] || color.muted);
    }
  }

  function drawFooter() {
    writeText(
      FIELD.x,
      ROWS - 4,
      "1 0.5X   2 1X   3 2X   4 4X     HUMAN: CLICK BUILD/UPGRADE     TAB TOWER TYPE     P PAUSE     R REROLL     O HOME",
      color.muted,
    );
  }

  function composeScreen() {
    drawBackground();
    drawField();
    drawEffects();
    drawHud();
    drawFooter();
  }

  function renderScreen() {
    canvas.width = COLS * CELL_W;
    canvas.height = ROWS * CELL_H;
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = "top";
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const p = idx(x, y);
        ctx.fillStyle = screen.bg[p] || color.ink;
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        const char = screen.ch[p] || " ";
        if (char !== " ") {
          ctx.fillStyle = screen.fg[p] || color.text;
          ctx.fillText(char, x * CELL_W, y * CELL_H + 1);
        }
      }
    }
  }

  function frame(now) {
    const dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 0.016;
    state.lastFrame = now;
    update(dt);
    composeScreen();
    renderScreen();
    requestAnimationFrame(frame);
  }

  function setSpeed(value) {
    state.speed = value;
    addLog(`SPEED ${value.toFixed(1)}X`, "cyan");
  }

  function canvasToCell(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const tx = ((event.clientX - rect.left) * sx) / CELL_W;
    const ty = ((event.clientY - rect.top) * sy) / CELL_H;
    const x = Math.floor(tx - GRID_X);
    const y = Math.floor(ty - GRID_Y);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value);
  });

  seedInput.addEventListener("input", updateSeedStatus);

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    updateSeedStatus();
  });

  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed || randomSeed());
    seedInput.value = seed;
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED 100";
    } catch {
      seedStatus.value = "COPY FAILED";
    }
  });

  playModeSelect.addEventListener("change", () => initGame(state.seed));
  difficultySelect.addEventListener("change", () => initGame(state.seed));

  window.addEventListener("keydown", (event) => {
    if (event.target === seedInput) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "1") setSpeed(0.5);
    else if (key === "2") setSpeed(1);
    else if (key === "3") setSpeed(2);
    else if (key === "4") setSpeed(4);
    else if (key === "p") {
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSE" : "RESUME", state.paused ? "gold" : "green");
    } else if (key === "r") {
      seedInput.value = randomSeed();
      initGame(seedInput.value);
    } else if (key === "o") {
      window.location.href = "../index.html";
    } else if (key === "tab") {
      event.preventDefault();
      state.game.selectedType = (state.game.selectedType + 1) % towerTypes.length;
      addLog(`SELECT ${towerTypes[state.game.selectedType].name}`, "cyan");
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    const cell = canvasToCell(event);
    if (!cell) return;
    playModeSelect.value = "human";
    state.mode = "human";
    if (buildTower(cell.x, cell.y, state.game.selectedType)) {
      state.paused = false;
    } else {
      addLog("BUILD DENIED", "red");
    }
  });

  initGame(randomSeed());
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
})();
