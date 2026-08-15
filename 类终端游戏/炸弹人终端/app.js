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
  const MAP_W = 17;
  const MAP_H = 13;
  const TILE_W = 5;
  const TILE_H = 3;
  const BOARD_X = FIELD.x + 6;
  const BOARD_Y = FIELD.y + 4;
  const TILE = { EMPTY: 0, HARD: 1, SOFT: 2 };
  const DIRS = [
    { x: 0, y: -1, name: "UP" },
    { x: 1, y: 0, name: "RIGHT" },
    { x: 0, y: 1, name: "DOWN" },
    { x: -1, y: 0, name: "LEFT" },
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
    wall: "#465267",
    soft: "#ffcc66",
    soft2: "#ff9f45",
    bomb: "#f2ffff",
    blast: "#ff4d5f",
  };

  const difficultyConfig = {
    normal: { density: 0.42, bots: 3, move: 0.17, bombTimer: 2.2, power: 3 },
    fast: { density: 0.47, bots: 4, move: 0.14, bombTimer: 1.85, power: 3 },
    chaos: { density: 0.51, bots: 4, move: 0.11, bombTimer: 1.45, power: 4 },
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
    input: { up: false, down: false, left: false, right: false, bomb: false },
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
    return {
      x: BOARD_X + x * TILE_W,
      y: BOARD_Y + y * TILE_H,
    };
  }

  function centerOfTile(x, y) {
    const p = tileToScreen(x, y);
    return { x: p.x + Math.floor(TILE_W / 2), y: p.y + 1 };
  }

  function protectedSpawn(x, y) {
    const safe = [
      [1, 1], [2, 1], [1, 2],
      [MAP_W - 2, MAP_H - 2], [MAP_W - 3, MAP_H - 2], [MAP_W - 2, MAP_H - 3],
      [MAP_W - 2, 1], [MAP_W - 3, 1], [MAP_W - 2, 2],
      [1, MAP_H - 2], [2, MAP_H - 2], [1, MAP_H - 3],
    ];
    return safe.some(([sx, sy]) => sx === x && sy === y);
  }

  function createMap() {
    const config = difficultyConfig[state.difficulty];
    const map = Array(MAP_W * MAP_H).fill(TILE.EMPTY);
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 || (x % 2 === 0 && y % 2 === 0)) {
          map[mapIdx(x, y)] = TILE.HARD;
        } else if (!protectedSpawn(x, y) && hash01(x, y, 141) < config.density) {
          map[mapIdx(x, y)] = TILE.SOFT;
        }
      }
    }
    return map;
  }

  function createActor(id, name, x, y, fg, human = false) {
    return {
      id,
      name,
      x,
      y,
      fg,
      human,
      alive: true,
      score: 0,
      moveCd: 0,
      bombCd: 0,
      dir: { x: 0, y: 1, name: "DOWN" },
      glyph: id === 0 ? "▲" : id === 1 ? "◆" : id === 2 ? "●" : "■",
      aiHold: 0,
    };
  }

  function createActors() {
    const actors = [
      createActor(0, "WHITE", 1, 1, "#f2ffff", true),
      createActor(1, "GOLD", MAP_W - 2, MAP_H - 2, color.gold),
      createActor(2, "CYAN", MAP_W - 2, 1, color.cyan),
      createActor(3, "RED", 1, MAP_H - 2, color.red),
    ];
    return actors.slice(0, difficultyConfig[state.difficulty].bots);
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = {
      elapsed: 0,
      round: 1,
      status: "LIVE",
      map: createMap(),
      actors: createActors(),
      bombs: [],
      explosions: [],
      chain: 0,
    };
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "BATTLE START", "info");
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
      for (let x = 0; x < TILE_W; x += 1) {
        const row = rows[y] || rows[rows.length - 1];
        setCell(p.x + x, p.y + y, row[x] || " ", fg, bg);
      }
    }
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.48;
      const speed = (8 + state.rng() * 24) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75,
        start: now,
        duration: 390 + state.rng() * 330,
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

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }

  function tileAt(x, y) {
    if (!inBounds(x, y)) return TILE.HARD;
    return state.game.map[mapIdx(x, y)];
  }

  function bombAt(x, y) {
    return state.game.bombs.find((bomb) => !bomb.exploded && bomb.x === x && bomb.y === y);
  }

  function passable(x, y) {
    return tileAt(x, y) === TILE.EMPTY && !bombAt(x, y);
  }

  function blastCells(bomb) {
    const cells = [{ x: bomb.x, y: bomb.y, center: true }];
    for (const dir of DIRS) {
      for (let step = 1; step <= bomb.power; step += 1) {
        const x = bomb.x + dir.x * step;
        const y = bomb.y + dir.y * step;
        const tile = tileAt(x, y);
        if (tile === TILE.HARD) break;
        cells.push({ x, y, dir: dir.name, tip: step === bomb.power || tile === TILE.SOFT });
        if (tile === TILE.SOFT) break;
      }
    }
    return cells;
  }

  function tileDanger(x, y) {
    for (const bomb of state.game.bombs) {
      if (blastCells(bomb).some((cell) => cell.x === x && cell.y === y)) {
        return 1 + Math.max(0, 2.4 - bomb.timer);
      }
    }
    for (const explosion of state.game.explosions) {
      if (explosion.cells.some((cell) => cell.x === x && cell.y === y)) return 9;
    }
    return 0;
  }

  function dropBomb(actor) {
    if (!actor.alive || actor.bombCd > 0 || bombAt(actor.x, actor.y)) return false;
    const config = difficultyConfig[state.difficulty];
    state.game.bombs.push({
      x: actor.x,
      y: actor.y,
      owner: actor.id,
      timer: config.bombTimer,
      power: config.power,
      exploded: false,
      serial: Math.floor(state.rng() * 9999),
    });
    actor.bombCd = 0.72;
    addLog(`${actor.name} BOMB`, "info");
    const c = centerOfTile(actor.x, actor.y);
    addBurst(c.x, c.y, actor.fg, 8, 0.42);
    return true;
  }

  function tryMove(actor, dir) {
    if (!actor.alive || actor.moveCd > 0) return false;
    const nx = actor.x + dir.x;
    const ny = actor.y + dir.y;
    actor.dir = dir;
    if (!passable(nx, ny)) return false;
    const from = centerOfTile(actor.x, actor.y);
    actor.x = nx;
    actor.y = ny;
    actor.moveCd = difficultyConfig[state.difficulty].move;
    addTrail(from.x, from.y, "░", actor.fg, 190);
    return true;
  }

  function nearbySoft(actor) {
    return DIRS.some((dir) => tileAt(actor.x + dir.x, actor.y + dir.y) === TILE.SOFT);
  }

  function lineOfSightTarget(actor) {
    return state.game.actors.find((other) => {
      if (!other.alive || other.id === actor.id) return false;
      if (other.x !== actor.x && other.y !== actor.y) return false;
      const dx = Math.sign(other.x - actor.x);
      const dy = Math.sign(other.y - actor.y);
      let x = actor.x + dx;
      let y = actor.y + dy;
      while (x !== other.x || y !== other.y) {
        if (tileAt(x, y) !== TILE.EMPTY) return false;
        x += dx;
        y += dy;
      }
      return true;
    });
  }

  function chooseSafeMove(actor) {
    const options = DIRS.filter((dir) => passable(actor.x + dir.x, actor.y + dir.y));
    options.push({ x: 0, y: 0, name: "STAY" });
    return options
      .map((dir) => {
        const x = actor.x + dir.x;
        const y = actor.y + dir.y;
        let score = -tileDanger(x, y) * 90 + state.rng() * 8;
        const nearestSoft = nearestTile(x, y, TILE.SOFT);
        if (nearestSoft) score -= Math.abs(nearestSoft.x - x) + Math.abs(nearestSoft.y - y);
        const nearestActor = state.game.actors
          .filter((other) => other.alive && other.id !== actor.id)
          .map((other) => Math.abs(other.x - x) + Math.abs(other.y - y))
          .sort((a, b) => a - b)[0];
        if (nearestActor != null) score += Math.max(0, 10 - nearestActor);
        return { dir, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.dir;
  }

  function nearestTile(x, y, tileType) {
    let best = null;
    for (let ty = 1; ty < MAP_H - 1; ty += 1) {
      for (let tx = 1; tx < MAP_W - 1; tx += 1) {
        if (tileAt(tx, ty) !== tileType) continue;
        const dist = Math.abs(tx - x) + Math.abs(ty - y);
        if (!best || dist < best.dist) best = { x: tx, y: ty, dist };
      }
    }
    return best;
  }

  function updateAI(actor) {
    if (!actor.alive) return;
    const danger = tileDanger(actor.x, actor.y);
    if (danger > 0) {
      const move = chooseSafeMove(actor);
      if (move) tryMove(actor, move);
      return;
    }
    const target = lineOfSightTarget(actor);
    if ((target || nearbySoft(actor)) && actor.bombCd <= 0 && state.rng() > 0.22) {
      dropBomb(actor);
      const move = chooseSafeMove(actor);
      if (move) tryMove(actor, move);
      return;
    }
    actor.aiHold -= 1;
    if (actor.aiHold <= 0 || !tryMove(actor, actor.dir)) {
      const move = chooseSafeMove(actor);
      if (move) {
        actor.aiHold = 2 + Math.floor(state.rng() * 5);
        tryMove(actor, move);
      }
    }
  }

  function updateHuman(actor) {
    if (!actor.alive) return;
    const manual =
      (state.input.up && DIRS[0]) ||
      (state.input.right && DIRS[1]) ||
      (state.input.down && DIRS[2]) ||
      (state.input.left && DIRS[3]) ||
      null;
    if (manual) tryMove(actor, manual);
    if (state.input.bomb) dropBomb(actor);
  }

  function explodeBomb(bomb) {
    if (bomb.exploded) return;
    bomb.exploded = true;
    const game = state.game;
    const cells = blastCells(bomb);
    game.chain += 1;
    game.explosions.push({ cells, start: performance.now(), duration: 470, owner: bomb.owner });
    addLog(`CHAIN ${game.chain}`, "hit");
    for (const cell of cells) {
      const c = centerOfTile(cell.x, cell.y);
      addBurst(c.x, c.y, cell.center ? color.red : color.orange, cell.center ? 18 : 8, cell.center ? 0.9 : 0.55);
      if (tileAt(cell.x, cell.y) === TILE.SOFT) {
        game.map[mapIdx(cell.x, cell.y)] = TILE.EMPTY;
        const owner = game.actors.find((actor) => actor.id === bomb.owner);
        if (owner) owner.score += 10;
      }
      const chained = bombAt(cell.x, cell.y);
      if (chained && chained !== bomb) chained.timer = Math.min(chained.timer, 0.02);
    }
  }

  function killActorsInExplosions() {
    for (const explosion of state.game.explosions) {
      for (const actor of state.game.actors) {
        if (!actor.alive) continue;
        if (!explosion.cells.some((cell) => cell.x === actor.x && cell.y === actor.y)) continue;
        actor.alive = false;
        const c = centerOfTile(actor.x, actor.y);
        addBurst(c.x, c.y, actor.fg, 36, 1.15);
        addLog(`${actor.name} OUT`, "hit");
        const owner = state.game.actors.find((candidate) => candidate.id === explosion.owner);
        if (owner && owner.id !== actor.id) owner.score += 100;
      }
    }
  }

  function updateBombs(dt) {
    const game = state.game;
    game.chain = Math.max(0, game.chain - dt * 0.45);
    for (const bomb of game.bombs) bomb.timer -= dt;
    let changed = true;
    while (changed) {
      changed = false;
      for (const bomb of game.bombs) {
        if (!bomb.exploded && bomb.timer <= 0) {
          explodeBomb(bomb);
          changed = true;
        }
      }
    }
    game.bombs = game.bombs.filter((bomb) => !bomb.exploded);
  }

  function updateExplosions() {
    const now = performance.now();
    state.game.explosions = state.game.explosions.filter((explosion) => now - explosion.start < explosion.duration);
    killActorsInExplosions();
  }

  function updateActors(dt) {
    const game = state.game;
    for (const actor of game.actors) {
      actor.moveCd = Math.max(0, actor.moveCd - dt);
      actor.bombCd = Math.max(0, actor.bombCd - dt);
      if (!actor.alive) continue;
      if (actor.human && state.mode === "human") updateHuman(actor);
      else updateAI(actor);
    }
    const alive = game.actors.filter((actor) => actor.alive);
    if (game.status === "LIVE" && alive.length <= 1) {
      game.status = alive[0] ? `${alive[0].name} WINS` : "DRAW";
      addLog(game.status, "ok");
    }
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    updateActors(dt);
    updateBombs(dt);
    updateExplosions();
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 211);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.972) setCell(x, y, "·", color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    writeText(FIELD.x + 2, FIELD.y - 2, "CHAIN BOMB GRID", color.header);
    writeText(FIELD.x + 71, FIELD.y - 2, "CROSS BLAST", color.gold);
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        const tile = tileAt(x, y);
        if (tile === TILE.HARD) {
          fillTile(x, y, ["█████", "█▓▓▓█", "█████"], color.wall, "#080c12");
        } else if (tile === TILE.SOFT) {
          const glow = hash01(x, y, 255) > 0.5 ? color.soft : color.soft2;
          fillTile(x, y, ["▒▓▒▓▒", "▓▒▓▒▓", "▒▓▒▓▒"], glow, "#100e09");
        } else {
          fillTile(x, y, ["     ", " · · ", "     "], "#233246", "#071018");
        }
      }
    }
  }

  function drawBombs() {
    for (const bomb of state.game.bombs) {
      const c = centerOfTile(bomb.x, bomb.y);
      const urgency = clamp(1 - bomb.timer / difficultyConfig[state.difficulty].bombTimer, 0, 1);
      const fg = urgency > 0.7 ? color.red : urgency > 0.42 ? color.orange : color.bomb;
      setCell(c.x - 1, c.y, "◖", fg);
      setCell(c.x, c.y, Math.max(1, Math.ceil(bomb.timer)).toString(), fg);
      setCell(c.x + 1, c.y, "◗", fg);
      if (urgency > 0.68 && Math.floor(performance.now() / 90) % 2 === 0) setCell(c.x, c.y - 1, "╳", color.red);
    }
  }

  function drawExplosions(now) {
    for (const explosion of state.game.explosions) {
      const t = clamp((now - explosion.start) / explosion.duration, 0, 1);
      const fg = mixColor(color.blast, color.gold, Math.sin(t * Math.PI) * 0.7);
      for (const cell of explosion.cells) {
        const c = centerOfTile(cell.x, cell.y);
        const glyph = cell.center ? "✹" : cell.dir === "LEFT" || cell.dir === "RIGHT" ? "═" : "║";
        setCell(c.x - 1, c.y, cell.center ? "✷" : glyph, fg);
        setCell(c.x, c.y, cell.tip ? "◆" : glyph, color.red2);
        setCell(c.x + 1, c.y, cell.center ? "✷" : glyph, fg);
        if (t < 0.55) {
          setCell(c.x, c.y - 1, "▓", color.orange);
          setCell(c.x, c.y + 1, "▒", color.red);
        }
      }
    }
  }

  function drawActors() {
    for (const actor of state.game.actors) {
      const c = centerOfTile(actor.x, actor.y);
      if (!actor.alive) {
        setCell(c.x, c.y, "×", color.dim);
        continue;
      }
      setCell(c.x - 1, c.y, "▟", actor.fg);
      setCell(c.x, c.y, actor.glyph, actor.fg);
      setCell(c.x + 1, c.y, "▙", actor.fg);
      setCell(c.x, c.y - 1, "▄", actor.fg);
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `BOMBS ${String(game.bombs.length).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `CHAIN ${String(Math.ceil(game.chain)).padStart(2, "0")}`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 9, game.status, game.status === "LIVE" ? color.cyan : color.green);

    writeText(RIGHT.x + 2, RIGHT.y + 12, "PLAYERS", color.header);
    game.actors.forEach((actor, i) => {
      const status = actor.alive ? "ON " : "OUT";
      writeText(RIGHT.x + 2, RIGHT.y + 14 + i, `${actor.name.padEnd(5)} ${status} ${String(actor.score).padStart(3, "0")}`, actor.alive ? actor.fg : color.dim);
    });

    writeText(RIGHT.x + 2, RIGHT.y + 21, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 18).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 23 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   WASD/ARROWS MOVE   SPACE BOMB   P PAUSE   R REROLL   M HOME", color.muted);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawBombs();
    drawExplosions(now);
    drawEffects(now);
    drawActors();
    if (state.paused) writeText(FIELD.x + 41, FIELD.y + 22, "PAUSED", color.green);
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
    if (key === "m") {
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
      state.input.bomb = true;
      dropBomb(state.game.actors[0]);
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
    if (key === " " || event.code === "Space") state.input.bomb = false;
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
