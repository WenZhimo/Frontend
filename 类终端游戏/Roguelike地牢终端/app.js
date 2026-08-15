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
  const MAP = { x: FIELD.x + 3, y: FIELD.y + 8, w: 46, h: 30 };
  const FOV = 8;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    floor: "#081018",
    floor2: "#0a121b",
    wall: "#344154",
    wallDim: "#1c2737",
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
    enemy: "#ff7b6f",
    item: "#75f0a8",
    exit: "#aaf6ff",
  };

  const difficultyConfig = {
    normal: { enemies: 8, items: 9, aiDelay: 0.22, enemyDamage: 1 },
    fast: { enemies: 11, items: 8, aiDelay: 0.15, enemyDamage: 2 },
    chaos: { enemies: 15, items: 7, aiDelay: 0.1, enemyDamage: 2 },
  };

  const dirs = [
    { name: "U", dx: 0, dy: -1 },
    { name: "D", dx: 0, dy: 1 },
    { name: "L", dx: -1, dy: 0 },
    { name: "R", dx: 1, dy: 0 },
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
    trails: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
    aiTimer: 0,
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
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.turn || 0) });
    state.eventLog = state.eventLog.slice(0, 46);
  }

  function key(x, y) {
    return `${x},${y}`;
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
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.58;
      const speed = (8 + state.rng() * 22) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75,
        start: now,
        duration: 420 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "*", "+", "·"][Math.floor(state.rng() * 7)],
      });
    }
  }

  function mapToScreen(x, y) {
    return { x: MAP.x + x * 2, y: MAP.y + y };
  }

  function burstAtMap(x, y, baseColor, count = 18, power = 1) {
    const pt = mapToScreen(x, y);
    addBurst(pt.x + 1, pt.y, baseColor, count, power);
  }

  function trailAtMap(x, y, glyph, baseColor, duration = 260) {
    if (reducedMotion) return;
    const pt = mapToScreen(x, y);
    state.trails.push({ x: pt.x + 1, y: pt.y, glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-160);
  }

  function rectsOverlap(a, b) {
    return a.x <= b.x + b.w + 1 && a.x + a.w + 1 >= b.x && a.y <= b.y + b.h + 1 && a.y + a.h + 1 >= b.y;
  }

  function carveRoom(map, room) {
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) map[y][x] = ".";
    }
  }

  function carveCorridor(map, a, b) {
    let x = a.x;
    let y = a.y;
    while (x !== b.x) {
      map[y][x] = ".";
      x += Math.sign(b.x - x);
    }
    while (y !== b.y) {
      map[y][x] = ".";
      y += Math.sign(b.y - y);
    }
    map[y][x] = ".";
  }

  function randomFloor(map, avoid = new Set()) {
    for (let i = 0; i < 5000; i += 1) {
      const x = 1 + Math.floor(state.rng() * (MAP.w - 2));
      const y = 1 + Math.floor(state.rng() * (MAP.h - 2));
      if (map[y][x] === "." && !avoid.has(key(x, y))) return { x, y };
    }
    return { x: 2, y: 2 };
  }

  function generateDungeon() {
    const map = Array.from({ length: MAP.h }, () => Array.from({ length: MAP.w }, () => "#"));
    const rooms = [];
    const attempts = 90;
    for (let i = 0; i < attempts && rooms.length < 10; i += 1) {
      const w = 5 + Math.floor(state.rng() * 8);
      const h = 4 + Math.floor(state.rng() * 5);
      const x = 1 + Math.floor(state.rng() * (MAP.w - w - 2));
      const y = 1 + Math.floor(state.rng() * (MAP.h - h - 2));
      const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
      if (rooms.some((other) => rectsOverlap(room, other))) continue;
      rooms.push(room);
      carveRoom(map, room);
      if (rooms.length > 1) carveCorridor(map, rooms[rooms.length - 2], room);
    }
    if (rooms.length < 3) return generateDungeon();
    return { map, rooms };
  }

  function entityAt(x, y) {
    return state.game.enemies.find((enemy) => enemy.hp > 0 && enemy.x === x && enemy.y === y);
  }

  function itemAt(x, y) {
    return state.game.items.find((item) => !item.taken && item.x === x && item.y === y);
  }

  function isPassable(x, y, ignoreEnemies = false) {
    const game = state.game;
    if (x < 0 || y < 0 || x >= MAP.w || y >= MAP.h || game.map[y][x] === "#") return false;
    return ignoreEnemies || !entityAt(x, y);
  }

  function buildGame() {
    const config = difficultyConfig[state.difficulty];
    const dungeon = generateDungeon();
    const map = dungeon.map;
    const start = { x: dungeon.rooms[0].cx, y: dungeon.rooms[0].cy };
    const exit = { x: dungeon.rooms[dungeon.rooms.length - 1].cx, y: dungeon.rooms[dungeon.rooms.length - 1].cy };
    const avoid = new Set([key(start.x, start.y), key(exit.x, exit.y)]);
    const enemies = [];
    for (let i = 0; i < config.enemies; i += 1) {
      const pos = randomFloor(map, avoid);
      avoid.add(key(pos.x, pos.y));
      enemies.push({ id: i + 1, x: pos.x, y: pos.y, hp: 2 + Math.floor(state.rng() * 3), awake: false });
    }
    const items = [];
    for (let i = 0; i < config.items; i += 1) {
      const pos = randomFloor(map, avoid);
      avoid.add(key(pos.x, pos.y));
      items.push({ id: i + 1, x: pos.x, y: pos.y, type: state.rng() < 0.35 ? "potion" : "gold", taken: false });
    }
    return {
      map,
      rooms: dungeon.rooms,
      player: { x: start.x, y: start.y, hp: 12, maxHp: 12, gold: 0 },
      exit,
      enemies,
      items,
      seen: new Set(),
      visible: new Set(),
      turn: 0,
      floor: 1 + (state.seedHash % 9),
      status: "LIVE",
      kills: 0,
      pulse: 0,
    };
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = buildGame();
    state.effects = [];
    state.trails = [];
    state.paused = false;
    state.aiTimer = 0;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    updateFov();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : `FLOOR ${state.game.floor}`, "info");
  }

  function updateFov() {
    const game = state.game;
    game.visible.clear();
    for (let y = game.player.y - FOV; y <= game.player.y + FOV; y += 1) {
      for (let x = game.player.x - FOV; x <= game.player.x + FOV; x += 1) {
        if (x < 0 || y < 0 || x >= MAP.w || y >= MAP.h) continue;
        const d = Math.hypot(x - game.player.x, y - game.player.y);
        if (d > FOV + hash01(x, y, 13) * 1.2) continue;
        const k = key(x, y);
        game.visible.add(k);
        game.seen.add(k);
      }
    }
  }

  function damageEnemy(enemy, amount = 1) {
    enemy.hp -= amount;
    burstAtMap(enemy.x, enemy.y, color.red, 16, 0.82);
    addLog(`HIT E${enemy.id}`, "hit");
    if (enemy.hp <= 0) {
      state.game.kills += 1;
      state.game.player.gold += 2 + Math.floor(state.rng() * 4);
      addLog(`E${enemy.id} DOWN`, "ok");
      burstAtMap(enemy.x, enemy.y, color.gold, 30, 1.1);
    }
  }

  function pickupItem(item) {
    item.taken = true;
    if (item.type === "potion") {
      const before = state.game.player.hp;
      state.game.player.hp = clamp(state.game.player.hp + 4, 0, state.game.player.maxHp);
      addLog(`POTION +${state.game.player.hp - before}`, "ok");
      burstAtMap(item.x, item.y, color.green, 18, 0.75);
    } else {
      state.game.player.gold += 5;
      addLog("GOLD +5", "ok");
      burstAtMap(item.x, item.y, color.gold, 18, 0.8);
    }
  }

  function tryMovePlayer(dx, dy) {
    const game = state.game;
    if (!game || game.status !== "LIVE") return false;
    const nx = game.player.x + dx;
    const ny = game.player.y + dy;
    const enemy = entityAt(nx, ny);
    if (enemy) {
      damageEnemy(enemy, 1 + (game.player.gold > 18 ? 1 : 0));
      game.turn += 1;
      enemyTurn();
      updateFov();
      return true;
    }
    if (!isPassable(nx, ny)) {
      burstAtMap(game.player.x, game.player.y, color.wall, 6, 0.35);
      return false;
    }
    trailAtMap(game.player.x, game.player.y, "·", color.cyan, 220);
    game.player.x = nx;
    game.player.y = ny;
    const item = itemAt(nx, ny);
    if (item) pickupItem(item);
    if (nx === game.exit.x && ny === game.exit.y) {
      game.status = "ESCAPED";
      addLog("EXIT REACHED", "ok");
      burstAtMap(nx, ny, color.exit, 48, 1.35);
    }
    game.turn += 1;
    enemyTurn();
    updateFov();
    return true;
  }

  function waitTurn() {
    if (state.game?.status !== "LIVE") return;
    addLog("WAIT", "info");
    state.game.turn += 1;
    enemyTurn();
    updateFov();
  }

  function moveEnemy(enemy) {
    const game = state.game;
    if (enemy.hp <= 0) return;
    const dist = Math.abs(enemy.x - game.player.x) + Math.abs(enemy.y - game.player.y);
    if (dist === 1) {
      game.player.hp -= difficultyConfig[state.difficulty].enemyDamage;
      addLog(`E${enemy.id} STRIKE`, "hit");
      burstAtMap(game.player.x, game.player.y, color.red, 14, 0.8);
      if (game.player.hp <= 0) {
        game.status = "DOWN";
        addLog("PLAYER DOWN", "hit");
      }
      return;
    }
    enemy.awake = enemy.awake || dist < 7 || game.visible.has(key(enemy.x, enemy.y));
    if (!enemy.awake) return;
    const path = findPath({ x: enemy.x, y: enemy.y }, { x: game.player.x, y: game.player.y }, true);
    const step = path[0];
    if (!step) return;
    if (entityAt(step.x, step.y) || (step.x === game.player.x && step.y === game.player.y)) return;
    trailAtMap(enemy.x, enemy.y, "·", color.red2, 180);
    enemy.x = step.x;
    enemy.y = step.y;
  }

  function enemyTurn() {
    const enemies = state.game.enemies.slice().sort((a, b) => Math.abs(a.x - state.game.player.x) - Math.abs(b.x - state.game.player.x));
    for (const enemy of enemies) moveEnemy(enemy);
  }

  function findPath(start, target, ignoreEnemies = false) {
    const queue = [start];
    const seen = new Set([key(start.x, start.y)]);
    const prev = new Map();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor];
      if (cell.x === target.x && cell.y === target.y) {
        const path = [];
        let k = key(cell.x, cell.y);
        while (k !== key(start.x, start.y)) {
          const step = prev.get(k);
          path.push({ x: step.x, y: step.y });
          k = step.prev;
        }
        return path.reverse();
      }
      for (const dir of dirs) {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const k = key(nx, ny);
        if (seen.has(k) || !isPassable(nx, ny, ignoreEnemies)) continue;
        seen.add(k);
        prev.set(k, { prev: key(cell.x, cell.y), x: nx, y: ny });
        queue.push({ x: nx, y: ny });
      }
    }
    return [];
  }

  function chooseAIMove() {
    const game = state.game;
    const adjacent = game.enemies.find((enemy) => enemy.hp > 0 && Math.abs(enemy.x - game.player.x) + Math.abs(enemy.y - game.player.y) === 1);
    if (adjacent) return { dx: Math.sign(adjacent.x - game.player.x), dy: Math.sign(adjacent.y - game.player.y) };
    const targets = [];
    for (const item of game.items) {
      if (!item.taken && (item.type !== "potion" || game.player.hp <= game.player.maxHp - 3)) targets.push({ x: item.x, y: item.y, score: item.type === "potion" ? -5 : 0 });
    }
    for (const enemy of game.enemies) {
      if (enemy.hp > 0 && game.player.hp > 4) targets.push({ x: enemy.x, y: enemy.y, score: 3 });
    }
    targets.push({ x: game.exit.x, y: game.exit.y, score: game.items.some((item) => !item.taken && item.type === "gold") ? 8 : -1 });
    let best = null;
    for (const target of targets) {
      const path = findPath(game.player, target, true);
      if (!path.length) continue;
      const score = path.length + target.score;
      if (!best || score < best.score) best = { score, step: path[0] };
    }
    if (!best) return dirs[Math.floor(state.rng() * dirs.length)];
    return { dx: Math.sign(best.step.x - game.player.x), dy: Math.sign(best.step.y - game.player.y) };
  }

  function updateAI(dt) {
    const game = state.game;
    if (state.mode !== "demo" || game.status !== "LIVE") return;
    state.aiTimer -= dt;
    if (state.aiTimer > 0) return;
    const move = chooseAIMove();
    tryMovePlayer(move.dx, move.dy);
    state.aiTimer = difficultyConfig[state.difficulty].aiDelay;
  }

  function update(dt) {
    if (!state.game || state.paused) return;
    state.game.pulse += dt * 5;
    updateAI(dt);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 37);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.969) setCell(x, y, "·", color.dim);
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
    writeText(FIELD.x + 2, FIELD.y - 2, "DUNGEON MEMORY MAP", color.header);
    writeText(FIELD.x + 70, FIELD.y - 2, "ROGUELIKE CORE", color.gold);
  }

  function drawMapCell(x, y) {
    const game = state.game;
    const visible = game.visible.has(key(x, y));
    const seen = game.seen.has(key(x, y));
    if (!seen) return;
    const pt = mapToScreen(x, y);
    const bg = visible ? ((x + y) % 2 === 0 ? color.floor : color.floor2) : "#050910";
    const fg = visible ? color.dim : "#182131";
    const wallFg = visible ? color.wall : color.wallDim;
    if (game.map[y][x] === "#") {
      setCell(pt.x, pt.y, "▓", wallFg, "#0b111a");
      setCell(pt.x + 1, pt.y, hash01(x, y, 71) > 0.45 ? "▒" : "▓", wallFg, "#0b111a");
    } else {
      const dot = hash01(x, y, 83) > 0.45 ? "·" : " ";
      setCell(pt.x, pt.y, dot, fg, bg);
      setCell(pt.x + 1, pt.y, hash01(x, y, 84) > 0.78 ? "·" : " ", fg, bg);
    }
  }

  function drawEntity(x, y, glyph, fg, bg = null) {
    if (!state.game.visible.has(key(x, y))) return;
    const pt = mapToScreen(x, y);
    setCell(pt.x, pt.y, glyph[0] || glyph, fg, bg);
    setCell(pt.x + 1, pt.y, glyph[1] || glyph[0] || glyph, fg, bg);
  }

  function drawDungeon() {
    const game = state.game;
    for (let y = 0; y < MAP.h; y += 1) {
      for (let x = 0; x < MAP.w; x += 1) drawMapCell(x, y);
    }
    drawEntity(game.exit.x, game.exit.y, "⇳⇳", color.exit, "#06141b");
    for (const item of game.items) {
      if (!item.taken) drawEntity(item.x, item.y, item.type === "potion" ? "!!" : "$$", item.type === "potion" ? color.green : color.gold);
    }
    for (const enemy of game.enemies) {
      if (enemy.hp > 0) drawEntity(enemy.x, enemy.y, "EE", enemy.awake ? color.red : color.red2);
    }
    drawEntity(game.player.x, game.player.y, "@@", color.player, "#07141a");
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "DUNGEON", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `FLOOR ${String(game.floor).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `TURN  ${String(game.turn).padStart(4, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 10, "VITAL", color.header);
    const hpBar = Math.max(0, Math.round((game.player.hp / game.player.maxHp) * 18));
    writeText(RIGHT.x + 2, RIGHT.y + 12, `[${"█".repeat(hpBar)}${" ".repeat(18 - hpBar)}]`, game.player.hp > 4 ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 13, `HP ${String(game.player.hp).padStart(2, "0")}/${game.player.maxHp}`, game.player.hp > 4 ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `GOLD  ${String(game.player.gold).padStart(3, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 16, `KILLS ${String(game.kills).padStart(3, "0")}`, color.red2);
    const alive = game.enemies.filter((enemy) => enemy.hp > 0).length;
    writeText(RIGHT.x + 2, RIGHT.y + 19, "THREATS", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 21, `[${"█".repeat(Math.min(18, alive))}${" ".repeat(Math.max(0, 18 - alive))}]`, color.red2);
    writeText(RIGHT.x + 2, RIGHT.y + 23, game.status, game.status === "LIVE" ? color.cyan : game.status === "ESCAPED" ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 27, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 18).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 29 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   ARROWS/WASD MOVE   SPACE WAIT   P PAUSE   R REROLL   G HOME", color.muted);
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
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawDungeon();
      if (state.paused) writeText(FIELD.x + 43, FIELD.y + 22, "PAUSED", color.green);
      if (state.game.status !== "LIVE") {
        const fg = state.game.status === "ESCAPED" ? color.green : color.red;
        writeText(FIELD.x + 35, FIELD.y + FIELD.h - 4, `${state.game.status} - R RESTART`, fg);
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

  function setSpeed(keyName) {
    const speeds = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (!speeds[keyName]) return false;
    state.speed = speeds[keyName];
    addLog(`SPEED ${state.speed}X`, "ok");
    return true;
  }

  function goHome() {
    window.location.href = "../index.html";
  }

  function keyToDelta(event) {
    const keyName = event.key.toLowerCase();
    if (keyName === "w" || event.key === "ArrowUp") return { dx: 0, dy: -1 };
    if (keyName === "s" || event.key === "ArrowDown") return { dx: 0, dy: 1 };
    if (keyName === "a" || event.key === "ArrowLeft") return { dx: -1, dy: 0 };
    if (keyName === "d" || event.key === "ArrowRight") return { dx: 1, dy: 0 };
    return null;
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keyName = event.key.toLowerCase();
    if (setSpeed(keyName)) {
      event.preventDefault();
      return;
    }
    if (keyName === "g" || event.key === "Home") {
      event.preventDefault();
      goHome();
      return;
    }
    if (keyName === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSED" : "RESUMED", "info");
      return;
    }
    if (keyName === "r") {
      event.preventDefault();
      initGame(randomSeed(), { reroll: true });
      return;
    }
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (state.mode === "human") waitTurn();
      return;
    }
    const delta = keyToDelta(event);
    if (delta) {
      event.preventDefault();
      if (state.mode === "human") tryMovePlayer(delta.dx, delta.dy);
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
