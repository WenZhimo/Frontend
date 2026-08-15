(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const form = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const playModeSelect = document.getElementById("play-mode");
  const pacAiSelect = document.getElementById("pac-ai");
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
  const MAZE_COLS = 31;
  const MAZE_ROWS = 21;
  const TILE_W = 3;
  const TILE_H = 2;
  const MAZE_X = FIELD.x + 2;
  const MAZE_Y = FIELD.y + 2;
  const TUNNEL_ROW = Math.floor(MAZE_ROWS / 2);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const directions = [
    { id: "up", dx: 0, dy: -1, key: "U" },
    { id: "right", dx: 1, dy: 0, key: "R" },
    { id: "down", dx: 0, dy: 1, key: "D" },
    { id: "left", dx: -1, dy: 0, key: "L" },
  ];
  const dirById = Object.fromEntries(directions.map((dir) => [dir.id, dir]));
  const reverse = { up: "down", right: "left", down: "up", left: "right" };

  const difficultyConfig = {
    normal: { playerStep: 0.126, ghostStep: 0.172, ghostNoise: 0.04, loopChance: 0.18 },
    fast: { playerStep: 0.106, ghostStep: 0.13, ghostNoise: 0.025, loopChance: 0.22 },
    chaos: { playerStep: 0.094, ghostStep: 0.106, ghostNoise: 0.01, loopChance: 0.28 },
  };

  const pacAiConfig = {
    classic: { label: "CLASSIC", depth: 1, beam: 4 },
    survival: { label: "SURVIVAL", depth: 12, beam: 28 },
    lookahead: { label: "LOOKAHEAD", depth: 16, beam: 38 },
  };

  const color = {
    ink: "#06080d",
    ink2: "#0a0f16",
    panel: "#080c12",
    panel2: "#0d121a",
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
    gold2: "#ffe69a",
    orange: "#ff9f45",
    red: "#ff4d5f",
    red2: "#ff7b6f",
    pink: "#ff78d4",
    blue: "#72a7ff",
    wall: "#4dc7ee",
    wall2: "#94f2ff",
    pathA: "#070b11",
    pathB: "#080d13",
    wallBg: "#07131d",
  };

  const ghostRoster = [
    { name: "BLINKY", color: color.red, scatter: { x: MAZE_COLS - 2, y: 1 } },
    { name: "INKY", color: color.cyan, scatter: { x: MAZE_COLS - 2, y: MAZE_ROWS - 2 } },
    { name: "CLYDE", color: color.orange, scatter: { x: 1, y: MAZE_ROWS - 2 } },
    { name: "PINKY", color: color.pink, scatter: { x: 1, y: 1 } },
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
    aiBrain: "survival",
    difficulty: "normal",
    speed: 1,
    paused: false,
    inputDir: "left",
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

  function keyOf(x, y) {
    return `${x},${y}`;
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

  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function updateSeedStatus() {
    seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`;
  }

  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 48);
  }

  function mazeCenterX(x) {
    return MAZE_X + x * TILE_W + 1;
  }

  function mazeCenterY(y) {
    return MAZE_Y + y * TILE_H + 1;
  }

  function isGhostHouse(x, y) {
    return x >= 13 && x <= 17 && y >= 8 && y <= 12;
  }

  function nearestOpen(grid, x, y) {
    const queue = [{ x, y }];
    const seen = new Set([keyOf(x, y)]);
    while (queue.length) {
      const cell = queue.shift();
      if (cell.x >= 0 && cell.y >= 0 && cell.x < MAZE_COLS && cell.y < MAZE_ROWS && grid[cell.y][cell.x] === 0) {
        return cell;
      }
      for (const dir of directions) {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const key = keyOf(nx, ny);
        if (nx < 0 || nx >= MAZE_COLS || ny < 0 || ny >= MAZE_ROWS || seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    return { x: 1, y: 1 };
  }

  function createMaze() {
    const config = difficultyConfig[state.difficulty] || difficultyConfig.normal;
    const grid = Array.from({ length: MAZE_ROWS }, () => Array(MAZE_COLS).fill(1));
    const stack = [{ x: 1, y: 1 }];
    grid[1][1] = 0;

    while (stack.length) {
      const cell = stack[stack.length - 1];
      const options = shuffle([
        { dx: 2, dy: 0 },
        { dx: -2, dy: 0 },
        { dx: 0, dy: 2 },
        { dx: 0, dy: -2 },
      ]).filter(({ dx, dy }) => {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        return nx > 0 && ny > 0 && nx < MAZE_COLS - 1 && ny < MAZE_ROWS - 1 && grid[ny][nx] === 1;
      });
      if (!options.length) {
        stack.pop();
        continue;
      }
      const next = options[0];
      grid[cell.y + next.dy / 2][cell.x + next.dx / 2] = 0;
      grid[cell.y + next.dy][cell.x + next.dx] = 0;
      stack.push({ x: cell.x + next.dx, y: cell.y + next.dy });
    }

    for (let y = 1; y < MAZE_ROWS - 1; y += 1) {
      for (let x = 1; x < MAZE_COLS - 1; x += 1) {
        if (grid[y][x] === 0) continue;
        const horizontal = grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
        const vertical = grid[y - 1][x] === 0 && grid[y + 1][x] === 0;
        if ((horizontal || vertical) && state.rng() < config.loopChance) grid[y][x] = 0;
      }
    }

    for (let y = 8; y <= 12; y += 1) {
      for (let x = 13; x <= 17; x += 1) grid[y][x] = 0;
    }
    for (let x = 0; x < MAZE_COLS; x += 1) grid[TUNNEL_ROW][x] = 0;

    const safeCells = [
      { x: 1, y: MAZE_ROWS - 2 },
      { x: 2, y: MAZE_ROWS - 2 },
      { x: 1, y: MAZE_ROWS - 3 },
      { x: MAZE_COLS - 2, y: 1 },
      { x: MAZE_COLS - 2, y: MAZE_ROWS - 2 },
      { x: 1, y: 1 },
    ];
    safeCells.forEach(({ x, y }) => {
      grid[y][x] = 0;
    });

    const powerPellets = new Set(
      [
        nearestOpen(grid, 1, 1),
        nearestOpen(grid, MAZE_COLS - 2, 1),
        nearestOpen(grid, 1, MAZE_ROWS - 2),
        nearestOpen(grid, MAZE_COLS - 2, MAZE_ROWS - 2),
      ].map((cell) => keyOf(cell.x, cell.y)),
    );

    const pellets = new Set();
    for (let y = 0; y < MAZE_ROWS; y += 1) {
      for (let x = 0; x < MAZE_COLS; x += 1) {
        if (grid[y][x] !== 0 || isGhostHouse(x, y)) continue;
        if (keyOf(x, y) === keyOf(1, MAZE_ROWS - 2)) continue;
        pellets.add(keyOf(x, y));
      }
    }

    return { grid, pellets, powerPellets, totalPellets: pellets.size };
  }

  function createEntity(x, y, dir = "left") {
    return {
      x,
      y,
      px: x,
      py: y,
      dir,
      nextDir: dir,
      moveStart: performance.now(),
      moveDuration: 140,
    };
  }

  function initGame(seed = state.seed, { randomize = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed) || 1;
    state.rng = mulberry32(state.seedHash);
    state.mode = playModeSelect.value || "demo";
    state.aiBrain = pacAiSelect?.value || "survival";
    state.difficulty = difficultySelect.value || "normal";
    const maze = createMaze();
    const home = { x: 15, y: 10 };
    state.game = {
      elapsed: 0,
      score: 0,
      lives: 3,
      level: 1,
      status: "running",
      statusText: "READY",
      playerStepClock: 0,
      ghostStepClock: 0,
      powerTimer: 0,
      eatenGhosts: 0,
      pelletsLeft: maze.pellets.size,
      maze,
      player: createEntity(1, MAZE_ROWS - 2, "right"),
      ghosts: ghostRoster.map((ghost, i) => ({
        ...createEntity(home.x + (i % 2 === 0 ? -1 : 1), home.y + (i < 2 ? -1 : 1), i % 2 ? "left" : "right"),
        name: ghost.name,
        color: ghost.color,
        scatter: ghost.scatter,
        home: { x: home.x + (i % 2 === 0 ? -1 : 1), y: home.y + (i < 2 ? -1 : 1) },
        eaten: false,
      })),
    };
    state.inputDir = "right";
    state.trails = [];
    state.effects = [];
    state.paused = false;
    state.logOffset = 0;
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${pacAiConfig[state.aiBrain]?.label || "SURVIVAL"}`, "ok");
    addLog(`DIFFICULTY ${state.difficulty.toUpperCase()}`, "info");
    addLog(randomize ? "NEW RANDOM MAZE" : "MAZE READY", "info");
  }

  function isOpen(x, y) {
    const game = state.game;
    if (!game) return false;
    if (y === TUNNEL_ROW && (x < 0 || x >= MAZE_COLS)) return true;
    if (x < 0 || y < 0 || x >= MAZE_COLS || y >= MAZE_ROWS) return false;
    return game.maze.grid[y][x] === 0;
  }

  function wrapCell(cell) {
    if (cell.y === TUNNEL_ROW && cell.x < 0) return { x: MAZE_COLS - 1, y: cell.y };
    if (cell.y === TUNNEL_ROW && cell.x >= MAZE_COLS) return { x: 0, y: cell.y };
    return cell;
  }

  function canMove(entity, dirId) {
    const dir = dirById[dirId];
    if (!dir) return false;
    return isOpen(entity.x + dir.dx, entity.y + dir.dy);
  }

  function legalDirections(entity, allowReverse = false) {
    const possible = directions.filter((dir) => canMove(entity, dir.id));
    if (allowReverse || possible.length <= 1) return possible;
    return possible.filter((dir) => dir.id !== reverse[entity.dir]);
  }

  function moveEntity(entity, dirId, duration) {
    const dir = dirById[dirId];
    const now = performance.now();
    entity.px = entity.x;
    entity.py = entity.y;
    entity.x += dir.dx;
    entity.y += dir.dy;
    const wrapped = wrapCell(entity);
    entity.x = wrapped.x;
    entity.y = wrapped.y;
    entity.dir = dirId;
    entity.moveStart = now;
    entity.moveDuration = Math.max(60, duration * 1000);
  }

  function visualPosition(entity, now) {
    const t = reducedMotion ? 1 : clamp((now - entity.moveStart) / entity.moveDuration, 0, 1);
    let sx0 = entity.px;
    let sx1 = entity.x;
    if (entity.py === TUNNEL_ROW && entity.y === TUNNEL_ROW && Math.abs(sx1 - sx0) > MAZE_COLS / 2) {
      if (sx1 < sx0) sx1 += MAZE_COLS;
      else sx0 += MAZE_COLS;
    }
    let x = lerp(sx0, sx1, t);
    if (x < 0) x += MAZE_COLS;
    if (x >= MAZE_COLS) x -= MAZE_COLS;
    return { x, y: lerp(entity.py, entity.y, t) };
  }

  function neighbors(cell) {
    return directions
      .map((dir) => wrapCell({ x: cell.x + dir.dx, y: cell.y + dir.dy, dir: dir.id }))
      .filter((next) => isOpen(next.x, next.y));
  }

  function bfsDistance(start, predicate, maxDepth = 999) {
    const queue = [{ x: start.x, y: start.y, depth: 0 }];
    const seen = new Set([keyOf(start.x, start.y)]);
    while (queue.length) {
      const cell = queue.shift();
      if (predicate(cell)) return cell.depth;
      if (cell.depth >= maxDepth) continue;
      for (const next of neighbors(cell)) {
        const key = keyOf(next.x, next.y);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: next.x, y: next.y, depth: cell.depth + 1 });
      }
    }
    return maxDepth + 1;
  }

  function manhattan(a, b) {
    const dx = Math.min(Math.abs(a.x - b.x), MAZE_COLS - Math.abs(a.x - b.x));
    return dx + Math.abs(a.y - b.y);
  }

  function mazeIndex(x, y) {
    return y * MAZE_COLS + x;
  }

  function legalDirectionsFrom(cell, currentDir, allowReverse = false) {
    const possible = directions.filter((dir) => isOpen(cell.x + dir.dx, cell.y + dir.dy));
    if (allowReverse || possible.length <= 1) return possible;
    return possible.filter((dir) => dir.id !== reverse[currentDir]);
  }

  function buildDistanceMap(starts, maxDepth = 999) {
    const dist = Array(MAZE_COLS * MAZE_ROWS).fill(Infinity);
    const queue = [];
    for (const start of starts) {
      const cell = wrapCell({ x: start.x, y: start.y });
      if (!isOpen(cell.x, cell.y)) continue;
      const index = mazeIndex(cell.x, cell.y);
      if (dist[index] === 0) continue;
      dist[index] = 0;
      queue.push(cell);
    }
    for (let head = 0; head < queue.length; head += 1) {
      const cell = queue[head];
      const depth = dist[mazeIndex(cell.x, cell.y)];
      if (depth >= maxDepth) continue;
      for (const dir of directions) {
        const raw = { x: cell.x + dir.dx, y: cell.y + dir.dy };
        if (!isOpen(raw.x, raw.y)) continue;
        const next = wrapCell(raw);
        const index = mazeIndex(next.x, next.y);
        if (dist[index] <= depth + 1) continue;
        dist[index] = depth + 1;
        queue.push(next);
      }
    }
    return dist;
  }

  function distanceFromMap(map, cell) {
    if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= MAZE_COLS || cell.y >= MAZE_ROWS) return Infinity;
    return map[mazeIndex(cell.x, cell.y)];
  }

  function pathDistance(start, target, maxDepth = 999) {
    return distanceFromMap(buildDistanceMap([target], maxDepth), start);
  }

  function projectedCell(entity, steps) {
    let x = entity.x;
    let y = entity.y;
    const dir = dirById[entity.dir] || dirById.right;
    for (let i = 0; i < steps; i += 1) {
      const raw = { x: x + dir.dx, y: y + dir.dy };
      if (!isOpen(raw.x, raw.y)) break;
      const next = wrapCell(raw);
      x = next.x;
      y = next.y;
    }
    return { x, y };
  }

  function openTarget(target) {
    const x = clamp(Math.round(target.x), 0, MAZE_COLS - 1);
    const y = clamp(Math.round(target.y), 0, MAZE_ROWS - 1);
    if (isOpen(x, y)) return { x, y };
    return nearestOpen(state.game.maze.grid, x, y);
  }

  function ghostMode(game, ghost, index) {
    if (ghost.eaten) return "EYES";
    if (game.powerTimer > 0) return "FLEE";
    const cycle = (game.elapsed + index * 0.9) % 54;
    return cycle < 7 || (cycle >= 27 && cycle < 34) ? "SCATTER" : "CHASE";
  }

  function ghostTarget(game, ghost, index) {
    const mode = ghostMode(game, ghost, index);
    if (mode === "EYES") return ghost.home;
    if (mode === "SCATTER") return ghost.scatter;
    const player = game.player;
    if (ghost.name === "BLINKY") return player;
    if (ghost.name === "PINKY") return projectedCell(player, 4);
    if (ghost.name === "INKY") {
      const blinky = game.ghosts.find((item) => item.name === "BLINKY") || ghost;
      const pivot = projectedCell(player, 2);
      return openTarget({ x: pivot.x + (pivot.x - blinky.x), y: pivot.y + (pivot.y - blinky.y) });
    }
    if (ghost.name === "CLYDE") return manhattan(ghost, player) > 8 ? player : ghost.scatter;
    return player;
  }

  function chooseClassicPlayerDirection() {
    const game = state.game;
    const player = game.player;
    const possible = legalDirections(player, true);
    if (!possible.length) return player.dir;
    const dangerous = game.ghosts.filter((ghost) => !ghost.eaten);
    let best = possible[0];
    let bestScore = Infinity;
    for (const dir of shuffle(possible)) {
      const next = wrapCell({ x: player.x + dir.dx, y: player.y + dir.dy });
      const pelletDistance = bfsDistance(next, (cell) => game.maze.pellets.has(keyOf(cell.x, cell.y)), 80);
      const ghostRisk = dangerous.reduce((risk, ghost) => {
        const dist = manhattan(next, ghost);
        return risk + (dist <= 1 ? 120 : dist <= 3 ? (4 - dist) * 18 : 0);
      }, 0);
      const chaseBonus =
        game.powerTimer > 0
          ? Math.min(...dangerous.map((ghost) => manhattan(next, ghost)).concat(12)) * -5
          : 0;
      const score = pelletDistance * 3 + ghostRisk + chaseBonus + state.rng() * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best.id;
  }

  function buildThreatMaps() {
    return state.game.ghosts
      .filter((ghost) => !ghost.eaten)
      .map((ghost) => ({
        ghost,
        map: buildDistanceMap([ghost], 70),
      }));
  }

  function threatDistance(threatMaps, cell) {
    let best = Infinity;
    for (const threat of threatMaps) best = Math.min(best, distanceFromMap(threat.map, cell));
    return best;
  }

  function nearestPelletDistance(cell, eaten) {
    return bfsDistance(
      cell,
      (candidate) => {
        const key = keyOf(candidate.x, candidate.y);
        return state.game.maze.pellets.has(key) && !eaten.has(key);
      },
      70,
    );
  }

  function countReachableSpace(start, threatMaps, depth, ghostSpeed, powerSteps) {
    const queue = [{ x: start.x, y: start.y, depth: 0 }];
    const seen = new Set([keyOf(start.x, start.y)]);
    let count = 0;
    for (let head = 0; head < queue.length && count < 48; head += 1) {
      const cell = queue[head];
      count += 1;
      if (cell.depth >= 8) continue;
      for (const next of neighbors(cell)) {
        const key = keyOf(next.x, next.y);
        if (seen.has(key)) continue;
        const dangerMargin = threatDistance(threatMaps, next) - (depth + cell.depth) * ghostSpeed;
        if (powerSteps <= cell.depth && dangerMargin < 0.9) continue;
        seen.add(key);
        queue.push({ x: next.x, y: next.y, depth: cell.depth + 1 });
      }
    }
    return count;
  }

  function scoreRisk(cell, depth, powerSteps, threatMaps, ghostSpeed) {
    const distance = threatDistance(threatMaps, cell);
    if (!Number.isFinite(distance)) return { score: 24, fatal: false };
    const margin = distance - depth * ghostSpeed;
    if (powerSteps > depth + 2) return { score: Math.max(0, 8 - distance) * 8, fatal: false };
    if (margin <= 0.35) return { score: -12000, fatal: true };
    if (margin <= 1.25) return { score: -850, fatal: false };
    if (margin <= 2.25) return { score: -260, fatal: false };
    if (margin <= 4) return { score: -70, fatal: false };
    return { score: Math.min(margin, 9) * 4, fatal: false };
  }

  function choosePlannedPlayerDirection() {
    const game = state.game;
    const player = game.player;
    const possible = legalDirections(player, true);
    if (!possible.length) return player.dir;

    const aiConfig = pacAiConfig[state.aiBrain] || pacAiConfig.survival;
    const timing = difficultyConfig[state.difficulty] || difficultyConfig.normal;
    const ghostSpeed = timing.playerStep / timing.ghostStep;
    const threatMaps = buildThreatMaps();
    const startPowerSteps = Math.floor(game.powerTimer / timing.playerStep);
    const startKey = keyOf(player.x, player.y);
    let states = [
      {
        x: player.x,
        y: player.y,
        dir: player.dir,
        first: null,
        score: 0,
        eaten: new Set(),
        visited: new Set([startKey]),
        powerSteps: startPowerSteps,
      },
    ];
    let best = null;

    for (let depth = 1; depth <= aiConfig.depth; depth += 1) {
      const expanded = [];
      for (const route of states) {
        const options = legalDirectionsFrom(route, route.dir, true).sort((a, b) => {
          const aRank = a.id === route.dir ? -2 : a.id === reverse[route.dir] ? 1 : 0;
          const bRank = b.id === route.dir ? -2 : b.id === reverse[route.dir] ? 1 : 0;
          return aRank - bRank;
        });
        for (const dir of options) {
          const next = wrapCell({ x: route.x + dir.dx, y: route.y + dir.dy });
          const key = keyOf(next.x, next.y);
          const eaten = new Set(route.eaten);
          const visited = new Set(route.visited);
          let powerSteps = Math.max(0, route.powerSteps - 1);
          let score = route.score + (dir.id === route.dir ? 1.4 : 0) - (dir.id === reverse[route.dir] ? 3.2 : 0);

          if (game.maze.pellets.has(key) && !eaten.has(key)) {
            const isPower = game.maze.powerPellets.has(key);
            eaten.add(key);
            score += isPower ? 125 : 28;
            if (isPower) powerSteps = Math.max(powerSteps, Math.ceil(8 / timing.playerStep));
          }

          const risk = scoreRisk(next, depth, powerSteps, threatMaps, ghostSpeed);
          score += risk.score;
          score += visited.has(key) ? -9 : 1.6;
          visited.add(key);

          const pelletDistance = nearestPelletDistance(next, eaten);
          score -= Math.min(pelletDistance, 34) * (depth < 4 ? 1.2 : 0.62);
          if (depth % 3 === 0 || depth === aiConfig.depth) {
            score += countReachableSpace(next, threatMaps, depth, ghostSpeed, powerSteps) * 0.85;
          }
          if (risk.fatal) score -= depth < 3 ? 6000 : 1400;

          expanded.push({
            x: next.x,
            y: next.y,
            dir: dir.id,
            first: route.first || dir.id,
            score,
            eaten,
            visited,
            powerSteps,
          });
        }
      }
      if (!expanded.length) break;
      expanded.sort((a, b) => b.score - a.score);
      states = expanded.slice(0, aiConfig.beam);
      if (!best || states[0].score > best.score) best = states[0];
    }

    if (best && best.score > -4000) return best.first;
    return chooseClassicPlayerDirection();
  }

  function choosePlayerAIDirection() {
    if (state.aiBrain === "classic") return chooseClassicPlayerDirection();
    return choosePlannedPlayerDirection();
  }

  function chooseGhostDirection(ghost, index) {
    const game = state.game;
    const possible = legalDirections(ghost, false);
    if (!possible.length) return ghost.dir;
    if (state.rng() < (difficultyConfig[state.difficulty]?.ghostNoise || 0.15)) {
      return shuffle(possible)[0].id;
    }

    const mode = ghostMode(game, ghost, index);
    const target = openTarget(ghostTarget(game, ghost, index));
    const targetMap = buildDistanceMap([target], 80);
    let best = possible[0];
    let bestScore = mode === "FLEE" ? -Infinity : Infinity;
    for (const dir of possible) {
      const next = wrapCell({ x: ghost.x + dir.dx, y: ghost.y + dir.dy });
      const distance = distanceFromMap(targetMap, next);
      const score = distance + (dir.id === ghost.dir ? -0.15 : 0);
      if ((mode !== "FLEE" && score < bestScore) || (mode === "FLEE" && score > bestScore)) {
        bestScore = score;
        best = dir;
      }
    }
    return best.id;
  }

  function addTrail(x, y, baseColor, glyph = ".") {
    state.trails.push({
      x,
      y,
      glyph,
      color: baseColor,
      start: performance.now(),
      duration: 260 + state.rng() * 220,
    });
    state.trails = state.trails.slice(-96);
  }

  function addBurst(x, y, baseColor, count = 18, power = 1, ring = true) {
    const now = performance.now();
    const glyphs = [".", ":", "*", "+", "░", "▒"];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.48;
      const speed = (8 + state.rng() * 23) * power;
      state.effects.push({
        type: "particle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        glyph: glyphs[Math.floor(state.rng() * glyphs.length)],
        color: baseColor,
        start: now,
        duration: 360 + state.rng() * 360,
      });
    }
    if (ring) {
      state.effects.push({
        type: "ring",
        x,
        y,
        color: baseColor,
        start: now,
        duration: 430,
        power,
      });
    }
  }

  function eatAtPlayer() {
    const game = state.game;
    const key = keyOf(game.player.x, game.player.y);
    if (!game.maze.pellets.has(key)) return;
    game.maze.pellets.delete(key);
    game.pelletsLeft = game.maze.pellets.size;
    const x = mazeCenterX(game.player.x);
    const y = mazeCenterY(game.player.y);
    if (game.maze.powerPellets.has(key)) {
      game.powerTimer = 8;
      game.eatenGhosts = 0;
      game.score += 50;
      addLog("POWER PELLET", "power");
      addBurst(x, y, color.gold2, 28, 1.2, true);
    } else {
      game.score += 10;
      addTrail(x, y, color.gold, ".");
      if (game.pelletsLeft % 20 === 0) addLog(`${game.pelletsLeft} DOTS LEFT`, "info");
    }
    if (game.pelletsLeft <= 0) {
      game.status = "win";
      game.statusText = "MAZE CLEAR";
      addLog("MAZE CLEAR", "ok");
      addBurst(mazeCenterX(game.player.x), mazeCenterY(game.player.y), color.green, 64, 1.8, true);
    }
  }

  function resetActors() {
    const game = state.game;
    game.player = createEntity(1, MAZE_ROWS - 2, "right");
    game.ghosts.forEach((ghost, i) => {
      ghost.x = ghost.home.x;
      ghost.y = ghost.home.y;
      ghost.px = ghost.x;
      ghost.py = ghost.y;
      ghost.dir = i % 2 ? "left" : "right";
      ghost.eaten = false;
      ghost.moveStart = performance.now();
    });
    game.powerTimer = 0;
    state.inputDir = "right";
  }

  function checkGhostCollisions() {
    const game = state.game;
    if (game.status !== "running") return;
    for (const ghost of game.ghosts) {
      if (ghost.x !== game.player.x || ghost.y !== game.player.y) continue;
      const px = mazeCenterX(game.player.x);
      const py = mazeCenterY(game.player.y);
      if (game.powerTimer > 0 && !ghost.eaten) {
        ghost.eaten = true;
        ghost.x = ghost.home.x;
        ghost.y = ghost.home.y;
        ghost.px = ghost.x;
        ghost.py = ghost.y;
        game.eatenGhosts += 1;
        game.score += 200 * game.eatenGhosts;
        addLog(`${ghost.name} EATEN`, "hit");
        addBurst(px, py, ghost.color, 34, 1.35, false);
      } else if (!ghost.eaten) {
        game.lives -= 1;
        addLog(game.lives > 0 ? "PAC HIT" : "GAME OVER", "danger");
        addBurst(px, py, color.red, 58, 1.7, true);
        if (game.lives <= 0) {
          game.status = "lose";
          game.statusText = "GAME OVER";
        } else {
          resetActors();
        }
      }
      return;
    }
  }

  function stepPlayer(stepSeconds) {
    const game = state.game;
    const player = game.player;
    const desired = state.mode === "demo" ? choosePlayerAIDirection() : state.inputDir;
    if (canMove(player, desired)) player.nextDir = desired;
    const moveDir = canMove(player, player.nextDir) ? player.nextDir : canMove(player, player.dir) ? player.dir : null;
    if (!moveDir) return;
    addTrail(mazeCenterX(player.x), mazeCenterY(player.y), color.gold, ".");
    moveEntity(player, moveDir, stepSeconds);
    eatAtPlayer();
    checkGhostCollisions();
  }

  function stepGhosts(stepSeconds) {
    const game = state.game;
    game.ghosts.forEach((ghost, index) => {
      if (ghost.eaten && ghost.x === ghost.home.x && ghost.y === ghost.home.y) ghost.eaten = false;
      const dir = chooseGhostDirection(ghost, index);
      if (canMove(ghost, dir)) {
        addTrail(mazeCenterX(ghost.x), mazeCenterY(ghost.y), game.powerTimer > 0 && !ghost.eaten ? color.blue : ghost.color, ".");
        moveEntity(ghost, dir, stepSeconds);
      }
    });
    checkGhostCollisions();
  }

  function advanceGame(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    game.elapsed += dt * state.speed;
    state.effects = state.effects.slice(-280);
    if (game.powerTimer > 0 && game.status === "running") game.powerTimer = Math.max(0, game.powerTimer - dt * state.speed);
    if (game.status !== "running") return;

    const config = difficultyConfig[state.difficulty] || difficultyConfig.normal;
    game.playerStepClock += dt * state.speed;
    game.ghostStepClock += dt * state.speed;

    let guard = 0;
    while (game.playerStepClock >= config.playerStep && guard < 4) {
      game.playerStepClock -= config.playerStep;
      stepPlayer(config.playerStep);
      guard += 1;
      if (game.status !== "running") return;
    }

    guard = 0;
    while (game.ghostStepClock >= config.ghostStep && guard < 4) {
      game.ghostStepClock -= config.ghostStep;
      stepGhosts(config.ghostStep);
      guard += 1;
      if (game.status !== "running") return;
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
    if (power > 0.86) return braille(0xff);
    if (power > 0.7) return braille(0xf6);
    if (power > 0.54) return braille(0x7c);
    if (power > 0.38) return "*";
    if (power > 0.2) return ".";
    return ".";
  }

  function wallGlyph(x, y, xx, yy) {
    const value = hash01(x * 7 + xx, y * 11 + yy, 91);
    if (value > 0.86) return String.fromCharCode(0x2588);
    if (value > 0.64) return String.fromCharCode(0x2593);
    if (value > 0.42) return String.fromCharCode(0x2592);
    return String.fromCharCode(0x2591);
  }

  function drawFrame(now) {
    fillRect(1, 1, 102, 55, color.ink);
    strokeRect(1, 1, 102, 55, color.line);
    putText(4, 3, "PAC MAZE :: CHARACTER TERMINAL", color.header);
    putText(4, 4, "SEEDED LABYRINTH / GLYPH GHOSTS / BRAILLE FRIGHT WAVE", color.muted);
    fillRect(FIELD.x - 1, FIELD.y - 1, FIELD.w + 2, FIELD.h + 2, color.ink2);
    strokeRect(FIELD.x - 2, FIELD.y - 2, FIELD.w + 4, FIELD.h + 4, color.line);
    putText(
      4,
      52,
      "[1]0.5x [2]1x [3]2x [4]4x   [SPACE] pause   [R] restart   [C] hub   [WASD/ARROWS] move",
      color.muted,
    );
    putText(4, 54, state.paused ? "PAUSED" : `RUNNING ${state.speed.toFixed(1)}x`, state.paused ? color.gold : color.green);
    if (!reducedMotion) {
      const sweep = Math.floor((now / 72) % FIELD.h);
      for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 1) {
        if (hash01(x, sweep, 117) < 0.055) put(x, FIELD.y + sweep, ".", color.line);
      }
    }
  }

  function drawMaze(now) {
    const game = state.game;
    const blink = reducedMotion ? 0.5 : 0.5 + Math.sin(now / 120) * 0.5;
    for (let y = 0; y < MAZE_ROWS; y += 1) {
      for (let x = 0; x < MAZE_COLS; x += 1) {
        const sx = MAZE_X + x * TILE_W;
        const sy = MAZE_Y + y * TILE_H;
        const wall = game.maze.grid[y][x] === 1;
        const bg = wall ? color.wallBg : (x + y) % 2 ? color.pathA : color.pathB;
        for (let yy = 0; yy < TILE_H; yy += 1) {
          for (let xx = 0; xx < TILE_W; xx += 1) {
            if (wall) {
              const fg = mixColor(color.wall, color.wall2, hash01(x + xx, y + yy, 24) * 0.55);
              put(sx + xx, sy + yy, wallGlyph(x, y, xx, yy), fg, bg);
            } else {
              put(sx + xx, sy + yy, staticDotGlyph(sx + xx, sy + yy, 0.05), color.lineDim, bg);
            }
          }
        }
        const key = keyOf(x, y);
        if (game.maze.pellets.has(key)) {
          const isPower = game.maze.powerPellets.has(key);
          const fg = isPower ? mixColor(color.gold, color.red2, blink * 0.35) : color.gold;
          put(mazeCenterX(x), mazeCenterY(y), isPower ? (blink > 0.45 ? "O" : "o") : ".", fg);
        }
      }
    }
    const gateX = mazeCenterX(15);
    putText(gateX - 3, mazeCenterY(8) - 1, "+---+", color.line);
    putText(gateX - 3, mazeCenterY(12), "+---+", color.line);
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      put(trail.x, trail.y, trail.glyph, mixColor(trail.color, color.ink, t));
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((effect) => now - effect.start < effect.duration);
    for (const effect of state.effects) {
      const t = clamp((now - effect.start) / effect.duration, 0, 1);
      if (effect.type === "particle") {
        const age = (now - effect.start) / 1000;
        const x = effect.x + effect.vx * age;
        const y = effect.y + effect.vy * age;
        put(x, y, effect.glyph, mixColor(effect.color, color.ink, t));
      } else if (effect.type === "ring") {
        const radius = 1 + t * 15 * effect.power;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
          const x = effect.x + Math.cos(a) * radius * 1.78;
          const y = effect.y + Math.sin(a) * radius * 0.82;
          put(x, y, powerGlyph(1 - t), mixColor(effect.color, color.ink, t));
        }
      }
    }
  }

  function putPattern(cx, cy, rows, fg, bg = null) {
    const y0 = Math.round(cy) - Math.floor(rows.length / 2);
    const width = Math.max(...rows.map((row) => row.length));
    const x0 = Math.round(cx) - Math.floor(width / 2);
    rows.forEach((row, yy) => {
      for (let xx = 0; xx < row.length; xx += 1) {
        const ch = row[xx];
        if (ch !== " ") put(x0 + xx, y0 + yy, ch, fg, bg);
      }
    });
  }

  function pacPattern(dir, open) {
    if (!open) return [" /O\\", "|OO|", " \\O/"];
    const patterns = {
      right: [" /O ", "|OO>", " \\O "],
      left: [" O\\ ", "<OO|", " O/ "],
      up: [" / \\", "|OO|", " \\O/"],
      down: [" /O\\", "|OO|", " \\ /"],
    };
    return patterns[dir] || patterns.right;
  }

  function drawPlayer(now) {
    const game = state.game;
    const pos = visualPosition(game.player, now);
    const open = reducedMotion ? true : Math.floor(now / 95) % 2 === 0;
    putPattern(mazeCenterX(pos.x), mazeCenterY(pos.y), pacPattern(game.player.dir, open), color.gold2, color.pathA);
  }

  function drawGhost(ghost, now) {
    const game = state.game;
    const pos = visualPosition(ghost, now);
    const frightened = game.powerTimer > 0 && !ghost.eaten;
    const fg = ghost.eaten ? color.dim : frightened ? mixColor(color.blue, color.cyan2, Math.sin(now / 90) * 0.25 + 0.5) : ghost.color;
    const rows = ghost.eaten ? [" .. ", " oo ", "    "] : ["/^^\\", "|@@|", "v--v"];
    putPattern(mazeCenterX(pos.x), mazeCenterY(pos.y), rows, fg, color.pathB);
    if (!ghost.eaten) {
      const cx = Math.round(mazeCenterX(pos.x));
      const cy = Math.round(mazeCenterY(pos.y));
      put(cx - 1, cy - 1, ".", color.header);
      put(cx + 1, cy - 1, ".", color.header);
    }
  }

  function drawPanel() {
    const game = state.game;
    fillRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.panel);
    strokeRect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    putText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 4, `MODE   ${state.mode.toUpperCase()}`.slice(0, 25), color.cyan);
    putText(RIGHT.x + 2, RIGHT.y + 6, `PACAI  ${pacAiConfig[state.aiBrain]?.label || "SURVIVAL"}`.slice(0, 25), color.green);
    putText(RIGHT.x + 2, RIGHT.y + 8, `DIFF   ${state.difficulty.toUpperCase()}`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 10, `STATE  ${game.statusText}`.slice(0, 25), game.status === "running" ? color.green : game.status === "win" ? color.gold : color.red);
    putText(RIGHT.x + 2, RIGHT.y + 13, "PAC", color.header);
    putText(RIGHT.x + 2, RIGHT.y + 15, `SCORE  ${String(game.score).padStart(7, "0")}`, color.gold);
    putText(RIGHT.x + 2, RIGHT.y + 17, `LIVES  ${"@".repeat(game.lives).padEnd(3, ".")}`, game.lives > 1 ? color.green : color.red);
    putText(RIGHT.x + 2, RIGHT.y + 19, `DOTS   ${String(game.pelletsLeft).padStart(4, "0")}/${String(game.maze.totalPellets).padStart(4, "0")}`, color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 21, `SPEED  ${state.speed.toFixed(1)}x`, color.green);
    putText(RIGHT.x + 2, RIGHT.y + 24, "POWER", color.header);
    const powerRatio = clamp(game.powerTimer / 8, 0, 1);
    putText(RIGHT.x + 2, RIGHT.y + 26, `[${"=".repeat(Math.round(powerRatio * 20)).padEnd(20, ".")}]`, powerRatio > 0 ? color.blue : color.dim);
    putText(RIGHT.x + 2, RIGHT.y + 28, `TIMER  ${game.powerTimer.toFixed(1).padStart(4, " ")}`, powerRatio > 0 ? color.cyan2 : color.muted);
    putText(RIGHT.x + 2, RIGHT.y + 31, "GHOSTS", color.header);
    game.ghosts.forEach((ghost, i) => {
      const status = ghostMode(game, ghost, i);
      putText(RIGHT.x + 2, RIGHT.y + 33 + i, `${ghost.name.padEnd(6, " ")} ${status}`, ghost.eaten ? color.dim : ghost.color);
    });
    putText(RIGHT.x + 2, RIGHT.y + 39, "EVENTS", color.header);
    const visible = state.eventLog.slice(state.logOffset, state.logOffset + 14);
    visible.forEach((entry, i) => {
      const fg =
        entry.tone === "danger"
          ? color.red
          : entry.tone === "ok"
            ? color.green
            : entry.tone === "hit"
              ? color.orange
              : entry.tone === "power"
                ? color.blue
                : color.muted;
      putText(RIGHT.x + 2, RIGHT.y + 41 + i, `${String(entry.time).padStart(4, "0")} ${entry.message}`.slice(0, 25), fg);
    });
  }

  function draw(now) {
    clearScreen();
    drawFrame(now);
    drawMaze(now);
    drawTrails(now);
    drawEffects(now);
    state.game.ghosts.forEach((ghost) => drawGhost(ghost, now));
    drawPlayer(now);
    if (state.game.status !== "running") {
      putText(38, 27, state.game.status === "win" ? "  MAZE CLEAR :: R TO RESTART  " : "  GAME OVER :: R TO RESTART  ", state.game.status === "win" ? color.gold : color.red, color.panel2);
    }
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

  function setHumanDirection(dir) {
    state.inputDir = dir;
    if (state.game?.player) state.game.player.nextDir = dir;
  }

  resizeCanvas();
  initGame(randomSeed(), { randomize: true });
  requestAnimationFrame(loop);

  seedInput.addEventListener("input", updateSeedStatus);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value || randomSeed());
  });
  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    initGame(seedInput.value, { randomize: true });
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
  pacAiSelect?.addEventListener("change", () => {
    state.aiBrain = pacAiSelect.value;
    addLog(`PAC AI ${pacAiConfig[state.aiBrain]?.label || "SURVIVAL"}`, "ok");
  });
  difficultySelect.addEventListener("change", () => initGame(state.seed));
  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const tagName = event.target?.tagName;
    if (tagName === "INPUT" || tagName === "SELECT" || tagName === "BUTTON") return;
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
      initGame(state.seed);
      return;
    }
    if (key === "c") {
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
    const dirMap = {
      w: "up",
      arrowup: "up",
      d: "right",
      arrowright: "right",
      s: "down",
      arrowdown: "down",
      a: "left",
      arrowleft: "left",
    };
    if (dirMap[key]) {
      event.preventDefault();
      setHumanDirection(dirMap[key]);
    }
  });
})();
