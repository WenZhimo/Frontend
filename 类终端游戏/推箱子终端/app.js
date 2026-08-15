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
  const TILE_W = 5;
  const TILE_H = 3;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    ink2: "#0a0f16",
    floor: "#081018",
    floor2: "#0a121b",
    wallBg: "#101925",
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
    box: "#ffcc66",
    box2: "#ff9f45",
    player: "#f2ffff",
    target: "#75f0a8",
  };

  const difficultyConfig = {
    normal: { aiDelay: 0.28, animation: 180 },
    fast: { aiDelay: 0.18, animation: 145 },
    chaos: { aiDelay: 0.11, animation: 115 },
  };

  const levelBank = [
    [
      "#########",
      "#       #",
      "# @ $ . #",
      "#   $ . #",
      "#       #",
      "#########",
    ],
    [
      "############",
      "#          #",
      "# @  $  .  #",
      "#    $  .  #",
      "#    $  .  #",
      "#          #",
      "############",
    ],
    [
      "#############",
      "#           #",
      "# @  $   .  #",
      "#  #        #",
      "#    $   .  #",
      "#    $   .  #",
      "#           #",
      "#############",
    ],
    [
      "#############",
      "#           #",
      "# @ $    .  #",
      "#   $    .  #",
      "#     $  .  #",
      "#           #",
      "#############",
    ],
    [
      "##############",
      "#            #",
      "# @  $    .  #",
      "#    $    .  #",
      "#      $  .  #",
      "#      $  .  #",
      "#            #",
      "##############",
    ],
  ];

  const dirs = [
    { name: "U", dx: 0, dy: -1, glyph: "↑" },
    { name: "D", dx: 0, dy: 1, glyph: "↓" },
    { name: "L", dx: -1, dy: 0, glyph: "←" },
    { name: "R", dx: 1, dy: 0, glyph: "→" },
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
    state.eventLog.unshift({ message, tone, time: state.game?.steps || 0 });
    state.eventLog = state.eventLog.slice(0, 44);
  }

  function normalizeLevel(rows) {
    const width = Math.max(...rows.map((row) => row.length));
    return rows.map((row) => row.padEnd(width, " "));
  }

  function mirrorRows(rows) {
    return rows.map((row) => Array.from(row).reverse().join(""));
  }

  function parseLevel(rows) {
    const normalized = normalizeLevel(rows);
    const map = normalized.map((row) => Array.from(row));
    const boxes = [];
    const targets = [];
    let player = { x: 1, y: 1 };
    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < map[y].length; x += 1) {
        const ch = map[y][x];
        if (ch === "@" || ch === "+") {
          player = { x, y };
          map[y][x] = ch === "+" ? "." : " ";
        } else if (ch === "$" || ch === "*") {
          boxes.push({ x, y });
          map[y][x] = ch === "*" ? "." : " ";
        }
        if (map[y][x] === ".") targets.push(`${x},${y}`);
      }
    }
    return {
      map,
      width: map[0].length,
      height: map.length,
      boxes,
      targets: new Set(targets),
      player,
    };
  }

  function makeLevel() {
    const levelIndex = state.seedHash % levelBank.length;
    const mirrored = (state.seedHash >>> 3) & 1;
    const rows = mirrored ? mirrorRows(levelBank[levelIndex]) : levelBank[levelIndex];
    return parseLevel(rows);
  }

  function boxKey(box) {
    return `${box.x},${box.y}`;
  }

  function sortBoxes(boxes) {
    return boxes
      .map((box) => ({ x: box.x, y: box.y }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function serialize(player, boxes) {
    return `${player.x},${player.y}|${sortBoxes(boxes).map(boxKey).join(";")}`;
  }

  function isWall(level, x, y) {
    return y < 0 || y >= level.height || x < 0 || x >= level.width || level.map[y][x] === "#";
  }

  function boxAt(boxes, x, y) {
    return boxes.findIndex((box) => box.x === x && box.y === y);
  }

  function isSolved(level, boxes) {
    return boxes.every((box) => level.targets.has(boxKey(box)));
  }

  function isCornerDeadlock(level, box) {
    if (level.targets.has(boxKey(box))) return false;
    const up = isWall(level, box.x, box.y - 1);
    const down = isWall(level, box.x, box.y + 1);
    const left = isWall(level, box.x - 1, box.y);
    const right = isWall(level, box.x + 1, box.y);
    return (up || down) && (left || right);
  }

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function reachableCells(level, player, boxes) {
    const occupied = new Set(boxes.map(boxKey));
    const start = cellKey(player.x, player.y);
    const queue = [{ x: player.x, y: player.y }];
    const seen = new Set([start]);
    const previous = new Map();

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor];
      for (const dir of dirs) {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const key = cellKey(nx, ny);
        if (seen.has(key) || occupied.has(key) || isWall(level, nx, ny)) continue;
        seen.add(key);
        previous.set(key, { prev: cellKey(cell.x, cell.y), dir: dir.name });
        queue.push({ x: nx, y: ny });
      }
    }

    function pathTo(x, y) {
      const dest = cellKey(x, y);
      if (!seen.has(dest)) return null;
      const path = [];
      let key = dest;
      while (key !== start) {
        const step = previous.get(key);
        if (!step) return null;
        path.push(step.dir);
        key = step.prev;
      }
      return path.reverse();
    }

    return { seen, pathTo };
  }

  function solveLevel(level) {
    const start = { player: { ...level.player }, boxes: sortBoxes(level.boxes) };
    const startKey = serialize(start.player, start.boxes);
    const queue = [start];
    const visited = new Set([startKey]);
    const prev = new Map();
    const maxStates = state.difficulty === "chaos" ? 45000 : 30000;

    for (let cursor = 0; cursor < queue.length && cursor < maxStates; cursor += 1) {
      const current = queue[cursor];
      if (isSolved(level, current.boxes)) {
        const chunks = [];
        let key = serialize(current.player, current.boxes);
        while (key !== startKey) {
          const step = prev.get(key);
          chunks.push(step.moves);
          key = step.prev;
        }
        return chunks.reverse().flat();
      }

      const occupied = new Set(current.boxes.map(boxKey));
      const reachable = reachableCells(level, current.player, current.boxes);
      for (let hit = 0; hit < current.boxes.length; hit += 1) {
        const box = current.boxes[hit];
        for (const dir of dirs) {
          const stand = { x: box.x - dir.dx, y: box.y - dir.dy };
          const dest = { x: box.x + dir.dx, y: box.y + dir.dy };
          if (isWall(level, dest.x, dest.y) || occupied.has(cellKey(dest.x, dest.y))) continue;
          const path = reachable.pathTo(stand.x, stand.y);
          if (!path) continue;

          const nextBoxes = current.boxes.map((item) => ({ ...item }));
          nextBoxes[hit] = dest;
          if (isCornerDeadlock(level, nextBoxes[hit])) continue;
          const next = { player: { x: box.x, y: box.y }, boxes: sortBoxes(nextBoxes) };
          const key = serialize(next.player, next.boxes);
          if (visited.has(key)) continue;
          visited.add(key);
          prev.set(key, { prev: serialize(current.player, current.boxes), moves: path.concat(dir.name) });
          queue.push(next);
        }
      }
    }
    return [];
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const level = makeLevel();
    const solution = solveLevel(level);
    state.game = {
      elapsed: 0,
      steps: 0,
      pushes: 0,
      level,
      player: { ...level.player },
      boxes: sortBoxes(level.boxes),
      history: [],
      solution,
      solutionIndex: 0,
      completed: false,
      failedSolver: solution.length === 0,
      anim: null,
      pulse: 0,
    };
    state.effects = [];
    state.trails = [];
    state.paused = false;
    state.aiTimer = 0;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : `LEVEL ${state.seedHash % levelBank.length + 1}`, "info");
    addLog(solution.length ? `SOLVER ${solution.length} STEPS` : "SOLVER SEARCH FAIL", solution.length ? "ok" : "hit");
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

  function fillRectChars(x, y, w, h, glyph, fg, bg = null) {
    for (let iy = y; iy < y + h; iy += 1) {
      for (let ix = x; ix < x + w; ix += 1) setCell(ix, iy, glyph, fg, bg);
    }
  }

  function boardOrigin() {
    const level = state.game.level;
    return {
      x: FIELD.x + Math.floor((FIELD.w - level.width * TILE_W) / 2),
      y: FIELD.y + Math.floor((FIELD.h - level.height * TILE_H) / 2),
    };
  }

  function cellToScreen(x, y) {
    const origin = boardOrigin();
    return { x: origin.x + x * TILE_W, y: origin.y + y * TILE_H };
  }

  function addBurst(x, y, baseColor, count = 18, power = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.56;
      const speed = (8 + state.rng() * 22) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        start: now,
        duration: 430 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒", "░"][Math.floor(state.rng() * 7)],
      });
    }
  }

  function addCellBurst(cx, cy, baseColor, count = 18, power = 1) {
    const pt = cellToScreen(cx, cy);
    addBurst(pt.x + 2, pt.y + 1, baseColor, count, power);
  }

  function addTrail(cx, cy, glyph, baseColor, duration = 260) {
    if (reducedMotion) return;
    const pt = cellToScreen(cx, cy);
    state.trails.push({ x: pt.x + 2, y: pt.y + 1, glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-160);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 71);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.966) setCell(x, y, "·", color.dim);
      }
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        screen.bg[idx(x, y)] = y % 4 === 0 ? "#07101a" : color.floor;
        const dot = hash01(x, y, 91);
        if (dot > 0.94) setCell(x, y, dot > 0.985 ? "✦" : "·", dot > 0.985 ? color.cyan : color.dim);
      }
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "WAREHOUSE PUSH ROUTE", color.header);
    writeText(FIELD.x + 66, FIELD.y - 2, "SOKOBAN SOLVER", color.gold);
  }

  function drawFloorTile(cx, cy, isTarget) {
    const pt = cellToScreen(cx, cy);
    const bg = (cx + cy) % 2 === 0 ? color.floor : color.floor2;
    for (let y = 0; y < TILE_H; y += 1) {
      for (let x = 0; x < TILE_W; x += 1) {
        const g = hash01(cx * 11 + x, cy * 13 + y, 123);
        setCell(pt.x + x, pt.y + y, g > 0.78 ? "·" : " ", g > 0.94 ? color.line : color.dim, bg);
      }
    }
    if (isTarget) {
      setCell(pt.x + 2, pt.y, "╷", color.target, bg);
      setCell(pt.x + 1, pt.y + 1, "╶", color.target, bg);
      setCell(pt.x + 2, pt.y + 1, "◇", color.green, bg);
      setCell(pt.x + 3, pt.y + 1, "╴", color.target, bg);
      setCell(pt.x + 2, pt.y + 2, "╵", color.target, bg);
    }
  }

  function drawWallTile(cx, cy) {
    const pt = cellToScreen(cx, cy);
    const glyphs = ["▓", "▓", "▒", "▚", "▞"];
    for (let y = 0; y < TILE_H; y += 1) {
      for (let x = 0; x < TILE_W; x += 1) {
        const g = glyphs[Math.floor(hash01(cx * 17 + x, cy * 19 + y, 231) * glyphs.length)];
        setCell(pt.x + x, pt.y + y, g, y === 1 ? color.line : color.dim, color.wallBg);
      }
    }
  }

  function drawBoxEntity(cx, cy, onTarget, override = null) {
    const pt = override || cellToScreen(cx, cy);
    const fg = onTarget ? color.green : color.box;
    const edge = onTarget ? color.cyan : color.box2;
    const bg = onTarget ? "#071812" : "#17110a";
    const pattern = ["▗▄▄▖", "▐██▌", "▝▀▀▘"];
    pattern.forEach((row, y) => {
      Array.from(row).forEach((ch, x) => {
        if (ch !== " ") setCell(pt.x + x, pt.y + y, ch, y === 1 ? fg : edge, bg);
      });
    });
    if (onTarget) setCell(pt.x + 2, pt.y + 1, "◆", color.cyan2, bg);
  }

  function drawPlayerEntity(cx, cy, override = null) {
    const pt = override || cellToScreen(cx, cy);
    const pattern = [" ▄█ ", "▟██▙", " ▀▀ "];
    pattern.forEach((row, y) => {
      Array.from(row).forEach((ch, x) => {
        if (ch !== " ") setCell(pt.x + x, pt.y + y, ch, y === 1 ? color.player : color.cyan2);
      });
    });
  }

  function currentAnim(now) {
    const anim = state.game.anim;
    if (!anim) return null;
    const t = clamp((now - anim.start) / anim.duration, 0, 1);
    if (t >= 1) {
      state.game.anim = null;
      return null;
    }
    return { ...anim, t };
  }

  function lerpCell(from, to, t) {
    const a = cellToScreen(from.x, from.y);
    const b = cellToScreen(to.x, to.y);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return { x: lerp(a.x, b.x, ease), y: lerp(a.y, b.y, ease) };
  }

  function drawLevel(now) {
    const game = state.game;
    const level = game.level;
    const anim = currentAnim(now);
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        if (level.map[y][x] === "#") drawWallTile(x, y);
        else drawFloorTile(x, y, level.targets.has(`${x},${y}`));
      }
    }
    for (const box of game.boxes) {
      if (anim?.boxTo && box.x === anim.boxTo.x && box.y === anim.boxTo.y) continue;
      drawBoxEntity(box.x, box.y, level.targets.has(boxKey(box)));
    }
    if (anim?.boxFrom && anim.boxTo) {
      drawBoxEntity(anim.boxTo.x, anim.boxTo.y, level.targets.has(boxKey(anim.boxTo)), lerpCell(anim.boxFrom, anim.boxTo, anim.t));
    }
    if (anim) drawPlayerEntity(anim.playerTo.x, anim.playerTo.y, lerpCell(anim.playerFrom, anim.playerTo, anim.t));
    else drawPlayerEntity(game.player.x, game.player.y);
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "SOKOBAN", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `LEVEL ${String(state.seedHash % levelBank.length + 1).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `STEPS ${String(game.steps).padStart(4, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `PUSH  ${String(game.pushes).padStart(4, "0")}`, color.box);
    const filled = game.boxes.filter((box) => game.level.targets.has(boxKey(box))).length;
    writeText(RIGHT.x + 2, RIGHT.y + 12, "TARGETS", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 14, `[${"█".repeat(filled * 5)}${" ".repeat(game.boxes.length * 5 - filled * 5)}]`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 16, `${filled}/${game.boxes.length} LOCKED`, filled === game.boxes.length ? color.green : color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 18, game.completed ? "COMPLETE" : state.paused ? "PAUSED" : "LIVE", game.completed ? color.green : color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 21, "SOLVER", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 23, game.failedSolver ? "NO ROUTE" : `${game.solutionIndex}/${game.solution.length}`, game.failedSolver ? color.red : color.cyan);
    const next = game.solution.slice(game.solutionIndex, game.solutionIndex + 14).join("");
    writeText(RIGHT.x + 2, RIGHT.y + 24, next || "----", color.muted);

    writeText(RIGHT.x + 2, RIGHT.y + 28, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 16).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 30 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   ARROWS/WASD MOVE   U UNDO   P PAUSE   R REROLL   O HOME", color.muted);
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

  function snapshot() {
    const game = state.game;
    return {
      player: { ...game.player },
      boxes: game.boxes.map((box) => ({ ...box })),
      steps: game.steps,
      pushes: game.pushes,
      solutionIndex: game.solutionIndex,
      completed: game.completed,
    };
  }

  function restore(snap) {
    const game = state.game;
    game.player = { ...snap.player };
    game.boxes = snap.boxes.map((box) => ({ ...box }));
    game.steps = snap.steps;
    game.pushes = snap.pushes;
    game.solutionIndex = snap.solutionIndex;
    game.completed = snap.completed;
    game.anim = null;
  }

  function tryMove(dirName, fromAI = false) {
    const game = state.game;
    if (!game || game.completed || game.anim) return false;
    const dir = dirs.find((item) => item.name === dirName);
    if (!dir) return false;
    const nx = game.player.x + dir.dx;
    const ny = game.player.y + dir.dy;
    if (isWall(game.level, nx, ny)) {
      addCellBurst(game.player.x, game.player.y, color.line, 6, 0.35);
      return false;
    }
    const hit = boxAt(game.boxes, nx, ny);
    let pushed = false;
    let boxFrom = null;
    let boxTo = null;
    const before = snapshot();
    if (hit >= 0) {
      const bx = nx + dir.dx;
      const by = ny + dir.dy;
      if (isWall(game.level, bx, by) || boxAt(game.boxes, bx, by) >= 0) {
        addCellBurst(nx, ny, color.red, 10, 0.5);
        return false;
      }
      pushed = true;
      boxFrom = { ...game.boxes[hit] };
      game.boxes[hit] = { x: bx, y: by };
      game.boxes = sortBoxes(game.boxes);
      boxTo = { x: bx, y: by };
      game.pushes += 1;
      addCellBurst(bx, by, game.level.targets.has(`${bx},${by}`) ? color.green : color.box, 16, 0.78);
      addTrail(boxFrom.x, boxFrom.y, "▓", color.box, 320);
    }
    game.history.push(before);
    game.history = game.history.slice(-120);
    const playerFrom = { ...game.player };
    game.player = { x: nx, y: ny };
    game.steps += 1;
    if (fromAI) game.solutionIndex += 1;
    game.anim = {
      playerFrom,
      playerTo: { ...game.player },
      boxFrom,
      boxTo,
      start: performance.now(),
      duration: difficultyConfig[state.difficulty].animation,
      pushed,
    };
    addTrail(playerFrom.x, playerFrom.y, dir.glyph, color.cyan, 280);
    if (isSolved(game.level, game.boxes)) {
      game.completed = true;
      addLog("WAREHOUSE CLEAR", "ok");
      for (const box of game.boxes) addCellBurst(box.x, box.y, color.green, 28, 1.15);
    } else if (pushed && game.level.targets.has(boxKey(boxTo))) {
      addLog("BOX LOCKED", "ok");
    }
    return true;
  }

  function undo() {
    const game = state.game;
    if (!game || !game.history.length || game.anim) return;
    restore(game.history.pop());
    addLog("UNDO", "info");
    addCellBurst(game.player.x, game.player.y, color.cyan, 8, 0.5);
  }

  function updateAI(dt) {
    const game = state.game;
    if (state.mode !== "demo" || game.completed || game.anim || game.failedSolver) return;
    state.aiTimer -= dt;
    if (state.aiTimer > 0) return;
    const move = game.solution[game.solutionIndex];
    if (!move) return;
    if (tryMove(move, true)) {
      state.aiTimer = difficultyConfig[state.difficulty].aiDelay;
    } else {
      game.failedSolver = true;
      addLog("SOLVER DESYNC", "hit");
    }
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    game.elapsed += dt;
    game.pulse += dt * 5;
    updateAI(dt);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawLevel(now);
      if (state.paused) writeText(FIELD.x + 43, FIELD.y + 22, "PAUSED", color.green);
      if (state.game.completed) {
        const pulse = Math.sin(state.game.pulse) > 0 ? color.green : color.cyan2;
        writeText(FIELD.x + 34, FIELD.y + FIELD.h - 4, "WAREHOUSE CLEAR - R RESTART", pulse);
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

  function keyToMove(event) {
    const key = event.key.toLowerCase();
    if (key === "w" || event.key === "ArrowUp") return "U";
    if (key === "s" || event.key === "ArrowDown") return "D";
    if (key === "a" || event.key === "ArrowLeft") return "L";
    if (key === "d" || event.key === "ArrowRight") return "R";
    return "";
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) {
      event.preventDefault();
      return;
    }
    if (key === "o" || event.key === "Home") {
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
    if (key === "u") {
      event.preventDefault();
      undo();
      return;
    }
    const move = keyToMove(event);
    if (move) {
      event.preventDefault();
      if (state.mode === "human") tryMove(move, false);
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
