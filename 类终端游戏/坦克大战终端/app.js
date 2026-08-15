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
  const MAP_W = 21;
  const MAP_H = 13;
  const TILE_W = 4;
  const TILE_H = 3;
  const BOARD_X = FIELD.x + 7;
  const BOARD_Y = FIELD.y + 5;
  const TILE = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, BASE: 4 };
  const DIRS = [
    { x: 0, y: -1, name: "UP", glyph: "▲" },
    { x: 1, y: 0, name: "RIGHT", glyph: "►" },
    { x: 0, y: 1, name: "DOWN", glyph: "▼" },
    { x: -1, y: 0, name: "LEFT", glyph: "◄" },
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
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
    brick: "#c8874a",
    steel: "#7a8397",
    water: "#2f89a3",
    base: "#f2ffff",
    player: "#f2ffff",
    enemy: "#ffcc66",
    enemy2: "#ff7b6f",
    shot: "#6ed5ec",
  };

  const difficultyConfig = {
    normal: { enemies: 12, active: 4, move: 0.22, enemyMove: 0.38, bullet: 8.8, fire: 0.48 },
    fast: { enemies: 16, active: 5, move: 0.18, enemyMove: 0.31, bullet: 10.2, fire: 0.38 },
    chaos: { enemies: 20, active: 6, move: 0.14, enemyMove: 0.25, bullet: 11.8, fire: 0.28 },
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

  function mapIdx(x, y) {
    return y * MAP_W + x;
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

  function tileToScreen(x, y) {
    return { x: BOARD_X + x * TILE_W, y: BOARD_Y + y * TILE_H };
  }

  function centerOfTile(x, y) {
    const p = tileToScreen(x, y);
    return { x: p.x + 1.5, y: p.y + 1 };
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }

  function createMap() {
    const map = Array(MAP_W * MAP_H).fill(TILE.EMPTY);
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) {
          map[mapIdx(x, y)] = TILE.STEEL;
        } else if (x % 2 === 0 && y % 2 === 0 && y < MAP_H - 3) {
          map[mapIdx(x, y)] = TILE.STEEL;
        } else if (hash01(x, y, 311) < 0.32 && y < MAP_H - 2) {
          map[mapIdx(x, y)] = TILE.BRICK;
        } else if (hash01(x, y, 317) < 0.06 && y > 2 && y < MAP_H - 4) {
          map[mapIdx(x, y)] = TILE.WATER;
        }
      }
    }
    const base = { x: Math.floor(MAP_W / 2), y: MAP_H - 2 };
    map[mapIdx(base.x, base.y)] = TILE.BASE;
    const clear = [
      [base.x, base.y - 1], [base.x - 1, base.y], [base.x + 1, base.y],
      [base.x - 1, base.y - 1], [base.x + 1, base.y - 1],
      [1, 1], [2, 1], [1, 2], [MAP_W - 2, 1], [MAP_W - 3, 1], [MAP_W - 2, 2],
      [Math.floor(MAP_W / 2), 1], [Math.floor(MAP_W / 2) - 1, 1], [Math.floor(MAP_W / 2) + 1, 1],
      [Math.floor(MAP_W / 2), 2],
      [base.x, MAP_H - 3],
    ];
    clear.forEach(([x, y]) => {
      if (inBounds(x, y) && map[mapIdx(x, y)] !== TILE.BASE) map[mapIdx(x, y)] = TILE.EMPTY;
    });
    for (const [x, y] of [[base.x - 1, base.y - 1], [base.x, base.y - 1], [base.x + 1, base.y - 1], [base.x - 1, base.y], [base.x + 1, base.y]]) {
      if (inBounds(x, y) && map[mapIdx(x, y)] === TILE.EMPTY) map[mapIdx(x, y)] = TILE.BRICK;
    }
    return { map, base };
  }

  function tileAt(x, y) {
    if (!inBounds(x, y)) return TILE.STEEL;
    return state.game.map[mapIdx(x, y)];
  }

  function occupied(x, y, except = null) {
    return state.game.tanks.some((tank) => tank.alive && tank !== except && Math.round(tank.x) === x && Math.round(tank.y) === y);
  }

  function passable(x, y, tank = null) {
    const tile = tileAt(x, y);
    return tile === TILE.EMPTY && !occupied(x, y, tank);
  }

  function createTank(id, team, x, y, dir, fg) {
    return {
      id,
      team,
      x,
      y,
      dir,
      fg,
      alive: true,
      hp: team === "player" ? 3 : 1,
      moveCd: 0,
      fireCd: 0,
      aiCd: 0,
      score: 0,
    };
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const generated = createMap();
    const base = generated.base;
    state.game = {
      elapsed: 0,
      wave: 1,
      score: 0,
      lives: 3,
      status: "LIVE",
      map: generated.map,
      base,
      tanks: [createTank(0, "player", base.x, MAP_H - 3, DIRS[0], color.player)],
      bullets: [],
      reserve: difficultyConfig[state.difficulty].enemies,
      spawnCd: 0,
      nextId: 1,
      baseAlive: true,
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "BASE ONLINE", "info");
    for (let i = 0; i < Math.min(3, difficultyConfig[state.difficulty].active); i += 1) spawnEnemy(true);
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

  function fillTile(tx, ty, rows, fg, bg = null) {
    const p = tileToScreen(tx, ty);
    for (let y = 0; y < TILE_H; y += 1) {
      for (let x = 0; x < TILE_W; x += 1) setCell(p.x + x, p.y + y, rows[y]?.[x] || " ", fg, bg);
    }
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.46;
      const speed = (8 + state.rng() * 25) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.76,
        start: now,
        duration: 420 + state.rng() * 330,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒", "░"][Math.floor(state.rng() * 7)],
      });
    }
  }

  function addTrail(x, y, glyph, baseColor, duration = 220) {
    if (reducedMotion) return;
    state.trails.push({ x, y, glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-260);
  }

  function spawnEnemy(force = false) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    const activeEnemies = game.tanks.filter((tank) => tank.alive && tank.team === "enemy").length;
    if (game.reserve <= 0 || activeEnemies >= config.active || (!force && game.spawnCd > 0)) return;
    const spawns = [
      { x: 1, y: 1 },
      { x: Math.floor(MAP_W / 2), y: 1 },
      { x: MAP_W - 2, y: 1 },
    ].filter((spot) => passable(spot.x, spot.y));
    if (!spawns.length) return;
    const spot = spawns[Math.floor(state.rng() * spawns.length)];
    const tank = createTank(game.nextId++, "enemy", spot.x, spot.y, DIRS[2], state.rng() > 0.72 ? color.enemy2 : color.enemy);
    tank.hp = tank.fg === color.enemy2 ? 2 : 1;
    game.tanks.push(tank);
    game.reserve -= 1;
    game.spawnCd = 0.8;
    const c = centerOfTile(tank.x, tank.y);
    addBurst(c.x, c.y, tank.fg, 16, 0.65);
    addLog("ENEMY DEPLOYED", "info");
  }

  function tryMove(tank, dir) {
    if (!tank.alive || tank.moveCd > 0) return false;
    tank.dir = dir;
    const nx = Math.round(tank.x) + dir.x;
    const ny = Math.round(tank.y) + dir.y;
    if (!passable(nx, ny, tank)) return false;
    const from = centerOfTile(tank.x, tank.y);
    tank.x = nx;
    tank.y = ny;
    tank.moveCd = tank.team === "player" ? difficultyConfig[state.difficulty].move : difficultyConfig[state.difficulty].enemyMove;
    addTrail(from.x, from.y, "░", tank.fg, 160);
    return true;
  }

  function fireTank(tank) {
    if (!tank.alive || tank.fireCd > 0) return false;
    const c = centerOfTile(tank.x, tank.y);
    const bullet = {
      x: tank.x + tank.dir.x * 0.55,
      y: tank.y + tank.dir.y * 0.55,
      dir: tank.dir,
      owner: tank.id,
      team: tank.team,
      bounces: 1,
    };
    state.game.bullets.push(bullet);
    tank.fireCd = tank.team === "player" ? difficultyConfig[state.difficulty].fire : difficultyConfig[state.difficulty].fire * 1.45;
    addTrail(c.x + tank.dir.x * 2, c.y + tank.dir.y, "╳", color.shot, 150);
    return true;
  }

  function nearestEnemy(tank) {
    return state.game.tanks
      .filter((other) => other.alive && other.team !== tank.team)
      .map((other) => ({ tank: other, dist: Math.abs(other.x - tank.x) + Math.abs(other.y - tank.y) }))
      .sort((a, b) => a.dist - b.dist)[0]?.tank;
  }

  function lineOfSight(tank, target) {
    if (!target) return false;
    if (tank.x !== target.x && tank.y !== target.y) return false;
    const dx = Math.sign(target.x - tank.x);
    const dy = Math.sign(target.y - tank.y);
    let x = tank.x + dx;
    let y = tank.y + dy;
    while (x !== target.x || y !== target.y) {
      if (![TILE.EMPTY, TILE.BASE].includes(tileAt(x, y))) return false;
      x += dx;
      y += dy;
    }
    return true;
  }

  function dirToward(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? DIRS[1] : DIRS[3];
    return dy > 0 ? DIRS[2] : DIRS[0];
  }

  function updatePlayerAI(tank) {
    const enemy = nearestEnemy(tank);
    if (!enemy) return;
    if (lineOfSight(tank, enemy)) {
      tank.dir = dirToward(tank, enemy);
      fireTank(tank);
      return;
    }
    const base = state.game.base;
    const threatening = state.game.tanks
      .filter((other) => other.alive && other.team === "enemy")
      .sort((a, b) => Math.abs(a.x - base.x) + Math.abs(a.y - base.y) - (Math.abs(b.x - base.x) + Math.abs(b.y - base.y)))[0];
    const target = threatening || enemy;
    const primary = dirToward(tank, target);
    const choices = [primary, ...DIRS].sort(() => state.rng() - 0.5);
    for (const dir of choices) {
      if (tryMove(tank, dir)) break;
    }
    if (state.rng() > 0.35) fireTank(tank);
  }

  function updateEnemyAI(tank) {
    const player = state.game.tanks.find((candidate) => candidate.alive && candidate.team === "player");
    const base = state.game.base;
    const target = lineOfSight(tank, player) ? player : base;
    if (lineOfSight(tank, target)) {
      tank.dir = dirToward(tank, target);
      fireTank(tank);
      return;
    }
    tank.aiCd -= 1;
    const primary = dirToward(tank, target);
    const choices = [primary, DIRS[2], DIRS[1], DIRS[3], DIRS[0]].sort((a, b) => {
      const jitter = () => state.rng() * 0.35;
      const score = (dir) => {
        const nx = tank.x + dir.x;
        const ny = tank.y + dir.y;
        return Math.abs(nx - target.x) + Math.abs(ny - target.y) + jitter();
      };
      return score(a) - score(b);
    });
    if (tank.aiCd <= 0 || !tryMove(tank, tank.dir)) {
      tank.aiCd = 3 + Math.floor(state.rng() * 6);
      for (const dir of choices) {
        if (tryMove(tank, dir)) break;
      }
    }
    if (state.rng() > 0.82) fireTank(tank);
  }

  function updateHuman(tank) {
    const manual =
      (state.input.up && DIRS[0]) ||
      (state.input.right && DIRS[1]) ||
      (state.input.down && DIRS[2]) ||
      (state.input.left && DIRS[3]) ||
      null;
    if (manual) tryMove(tank, manual);
    if (state.input.fire) fireTank(tank);
  }

  function hitTank(tank, bullet) {
    tank.hp -= 1;
    const c = centerOfTile(tank.x, tank.y);
    addBurst(c.x, c.y, tank.fg, 24, 0.9);
    if (tank.hp > 0) return;
    tank.alive = false;
    addBurst(c.x, c.y, tank.fg, 42, 1.2);
    if (bullet.team === "player") {
      state.game.score += 100;
      const player = state.game.tanks.find((candidate) => candidate.id === bullet.owner);
      if (player) player.score += 100;
      addLog("ENEMY DESTROYED", "ok");
    } else {
      state.game.lives -= 1;
      addLog("PLAYER HIT", "hit");
      if (state.game.lives > 0) {
        tank.alive = true;
        tank.hp = 3;
        tank.x = state.game.base.x;
        tank.y = MAP_H - 3;
        tank.dir = DIRS[0];
        tank.fireCd = 0.7;
      }
    }
  }

  function destroyBase() {
    if (!state.game.baseAlive) return;
    state.game.baseAlive = false;
    state.game.status = "BASE LOST";
    const c = centerOfTile(state.game.base.x, state.game.base.y);
    addBurst(c.x, c.y, color.red, 72, 1.45);
    addLog("BASE LOST", "hit");
  }

  function updateBullets(dt) {
    const game = state.game;
    const speed = difficultyConfig[state.difficulty].bullet;
    for (const bullet of game.bullets) {
      const old = centerOfTile(Math.round(bullet.x), Math.round(bullet.y));
      bullet.x += bullet.dir.x * speed * dt;
      bullet.y += bullet.dir.y * speed * dt;
      addTrail(old.x, old.y, bullet.dir.x ? "─" : "│", color.shot, 120);
      const tx = Math.round(bullet.x);
      const ty = Math.round(bullet.y);
      const tile = tileAt(tx, ty);
      if (tile === TILE.BRICK) {
        game.map[mapIdx(tx, ty)] = TILE.EMPTY;
        bullet.dead = true;
        const c = centerOfTile(tx, ty);
        addBurst(c.x, c.y, color.brick, 18, 0.75);
        addLog("BRICK BROKEN", "info");
      } else if (tile === TILE.BASE) {
        bullet.dead = true;
        destroyBase();
      } else if (tile === TILE.STEEL || !inBounds(tx, ty)) {
        const c = centerOfTile(clamp(tx, 0, MAP_W - 1), clamp(ty, 0, MAP_H - 1));
        addBurst(c.x, c.y, color.steel, 10, 0.48);
        if (bullet.bounces > 0) {
          bullet.bounces -= 1;
          bullet.dir = bullet.dir.x ? (bullet.dir.x > 0 ? DIRS[3] : DIRS[1]) : bullet.dir.y > 0 ? DIRS[0] : DIRS[2];
          addLog("RICHOCHET", "ok");
        } else {
          bullet.dead = true;
        }
      }
      for (const tank of game.tanks) {
        if (!tank.alive || tank.id === bullet.owner) continue;
        if (Math.round(tank.x) === tx && Math.round(tank.y) === ty) {
          bullet.dead = true;
          hitTank(tank, bullet);
          break;
        }
      }
    }
    game.bullets = game.bullets.filter((bullet) => !bullet.dead);
  }

  function updateTanks(dt) {
    const game = state.game;
    for (const tank of game.tanks) {
      tank.moveCd = Math.max(0, tank.moveCd - dt);
      tank.fireCd = Math.max(0, tank.fireCd - dt);
      if (!tank.alive) continue;
      if (tank.team === "player") {
        if (state.mode === "human") updateHuman(tank);
        else updatePlayerAI(tank);
      } else {
        updateEnemyAI(tank);
      }
    }
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    game.spawnCd = Math.max(0, game.spawnCd - dt);
    spawnEnemy();
    updateTanks(dt);
    updateBullets(dt);
    const enemiesAlive = game.tanks.some((tank) => tank.alive && tank.team === "enemy");
    if (game.reserve <= 0 && !enemiesAlive && game.status === "LIVE") {
      game.status = "BASE HELD";
      addLog("BASE HELD", "ok");
      const c = centerOfTile(game.base.x, game.base.y);
      addBurst(c.x, c.y, color.green, 60, 1.2);
    }
    if (game.lives <= 0 && game.status === "LIVE") {
      game.status = "TANK LOST";
      addLog("TANK LOST", "hit");
    }
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 401);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.972) setCell(x, y, "·", color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    writeText(FIELD.x + 2, FIELD.y - 2, "BASE DEFENSE GRID", color.header);
    writeText(FIELD.x + 69, FIELD.y - 2, "RICOCHET WAR", color.gold);
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        const tile = tileAt(x, y);
        if (tile === TILE.STEEL) fillTile(x, y, ["████", "█▓▓█", "████"], color.steel, "#080c12");
        else if (tile === TILE.BRICK) fillTile(x, y, ["▓▒▓▒", "▒▓▒▓", "▓▒▓▒"], color.brick, "#100b08");
        else if (tile === TILE.WATER) fillTile(x, y, ["≈≈≈≈", "≋≋≋≋", "≈≈≈≈"], color.water, "#06111a");
        else if (tile === TILE.BASE) fillTile(x, y, ["▟██▙", "█HQ█", "▜██▛"], state.game.baseAlive ? color.base : color.red, "#101112");
        else fillTile(x, y, ["    ", " ·· ", "    "], "#203044", "#071018");
      }
    }
  }

  function drawTank(tank) {
    const c = centerOfTile(tank.x, tank.y);
    if (!tank.alive) return;
    setCell(c.x, c.y, tank.dir.glyph, tank.fg);
    setCell(c.x - 1, c.y, "▟", tank.fg);
    setCell(c.x + 1, c.y, "▙", tank.fg);
    setCell(c.x, c.y - 1, tank.team === "player" ? "▄" : "▆", tank.fg);
    setCell(c.x + tank.dir.x * 2, c.y + tank.dir.y, tank.dir.x ? "━" : "┃", tank.team === "player" ? color.cyan2 : color.gold);
  }

  function drawBullets() {
    for (const bullet of state.game.bullets) {
      const c = centerOfTile(Math.round(bullet.x), Math.round(bullet.y));
      setCell(c.x, c.y, bullet.dir.x ? "━" : "┃", bullet.team === "player" ? color.shot : color.red2);
      setCell(c.x - bullet.dir.x, c.y - bullet.dir.y, "╳", color.cyan);
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
    const enemiesAlive = game.tanks.filter((tank) => tank.alive && tank.team === "enemy").length;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "BATTLE", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `LIVES ${"♥".repeat(Math.max(0, game.lives)).padEnd(5, " ")}`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `ENEMY ${String(game.reserve + enemiesAlive).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 11, game.status, game.status === "LIVE" ? color.cyan : color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 14, "BASE", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 16, state.game.baseAlive ? "[████████████████████]" : "[XXXXXXXXXXXXXXXXXXXX]", state.game.baseAlive ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 20, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 20).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 22 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   WASD/ARROWS MOVE   SPACE FIRE   P PAUSE   R REROLL   K HOME", color.muted);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawBullets();
    state.game.tanks.forEach(drawTank);
    drawEffects(now);
    if (state.paused) writeText(FIELD.x + 42, FIELD.y + 22, "PAUSED", color.green);
    if (state.game.status !== "LIVE") writeText(FIELD.x + 34, FIELD.y + 22, `${state.game.status} - R RESTART`, color.green);
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
    if (key === "k") {
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
      const player = state.game.tanks.find((tank) => tank.team === "player");
      if (player) fireTank(player);
      return;
    }
    if (key === "w" || event.key === "ArrowUp") state.input.up = true;
    if (key === "s" || event.key === "ArrowDown") state.input.down = true;
    if (key === "a" || event.key === "ArrowLeft") state.input.left = true;
    if (key === "d" || event.key === "ArrowRight") state.input.right = true;
    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "w" || event.key === "ArrowUp") state.input.up = false;
    if (key === "s" || event.key === "ArrowDown") state.input.down = false;
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (key === " " || event.code === "Space") state.input.fire = false;
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
