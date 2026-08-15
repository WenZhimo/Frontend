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
  const BOARD = { x: 11, y: 8, cols: 38, rows: 13, tileW: 2, tileH: 3 };
  const GOALS = [3, 11, 19, 27, 35];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    floor: "#081018",
    floor2: "#0a121b",
    road: "#11131a",
    road2: "#151720",
    river: "#061623",
    river2: "#071c2b",
    grass: "#07170f",
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
    frog: "#75f0a8",
    car: "#ff7b6f",
    truck: "#ffcc66",
    log: "#c99155",
    turtle: "#6ed5ec",
  };

  const difficultyConfig = {
    normal: { speed: 1, aiDelay: 0.24, lives: 4 },
    fast: { speed: 1.25, aiDelay: 0.18, lives: 4 },
    chaos: { speed: 1.55, aiDelay: 0.13, lives: 3 },
  };

  const laneDefs = [
    { kind: "goal", dir: 0, speed: 0, count: 0, len: 0 },
    { kind: "river", dir: 1, speed: 3.4, count: 4, len: 5, glyph: "log" },
    { kind: "river", dir: -1, speed: 4.1, count: 5, len: 4, glyph: "turtle" },
    { kind: "river", dir: 1, speed: 5.0, count: 4, len: 6, glyph: "log" },
    { kind: "river", dir: -1, speed: 3.5, count: 4, len: 5, glyph: "log" },
    { kind: "safe", dir: 0, speed: 0, count: 0, len: 0 },
    { kind: "road", dir: -1, speed: 5.8, count: 4, len: 4, glyph: "car" },
    { kind: "road", dir: 1, speed: 4.7, count: 3, len: 6, glyph: "truck" },
    { kind: "road", dir: -1, speed: 6.7, count: 5, len: 3, glyph: "car" },
    { kind: "road", dir: 1, speed: 5.3, count: 4, len: 4, glyph: "car" },
    { kind: "road", dir: -1, speed: 4.2, count: 3, len: 7, glyph: "truck" },
    { kind: "safe", dir: 0, speed: 0, count: 0, len: 0 },
    { kind: "start", dir: 0, speed: 0, count: 0, len: 0 },
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
    state.eventLog = state.eventLog.slice(0, 44);
  }

  function boardToScreen(col, row) {
    return { x: BOARD.x + col * BOARD.tileW, y: BOARD.y + row * BOARD.tileH };
  }

  function createLanes() {
    const config = difficultyConfig[state.difficulty];
    return laneDefs.map((def, row) => {
      const objects = [];
      if (def.count) {
        const spacing = BOARD.cols / def.count;
        for (let i = 0; i < def.count; i += 1) {
          objects.push({
            x: (i * spacing + state.rng() * spacing) % BOARD.cols,
            len: def.len + Math.floor(state.rng() * 2),
          });
        }
      }
      return {
        ...def,
        row,
        speed: def.speed * def.dir * config.speed * (0.9 + state.rng() * 0.22),
        objects,
      };
    });
  }

  function resetFrog() {
    const game = state.game;
    game.frog.col = Math.floor(BOARD.cols / 2);
    game.frog.row = BOARD.rows - 1;
    game.frog.offset = 0;
    game.frog.safeTimer = 0;
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = {
      elapsed: 0,
      score: 0,
      crossings: 0,
      lives: difficultyConfig[state.difficulty].lives,
      status: "LIVE",
      frog: { col: Math.floor(BOARD.cols / 2), row: BOARD.rows - 1, offset: 0, safeTimer: 0 },
      lanes: createLanes(),
      goals: Array(GOALS.length).fill(false),
      flash: 0,
      bestRow: BOARD.rows - 1,
    };
    state.effects = [];
    state.trails = [];
    state.paused = false;
    state.aiTimer = 0;
    state.logOffset = 0;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "ok");
    addLog(reroll ? "REROLLED SEED" : "CROSSING READY", "info");
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
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.5;
      const speed = (8 + state.rng() * 25) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        start: now,
        duration: 420 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "*", "+", "·"][Math.floor(state.rng() * 7)],
      });
    }
  }

  function addBoardBurst(col, row, baseColor, count = 18, power = 1) {
    const pt = boardToScreen(col, row);
    addBurst(pt.x + 1, pt.y + 1, baseColor, count, power);
  }

  function addTrail(col, row, glyph, baseColor, duration = 260) {
    if (reducedMotion) return;
    const pt = boardToScreen(col, row);
    state.trails.push({ x: pt.x + 1, y: pt.y + 1, glyph, color: baseColor, start: performance.now(), duration });
    state.trails = state.trails.slice(-180);
  }

  function wrappedRangeHit(x, len, col) {
    const c = ((col % BOARD.cols) + BOARD.cols) % BOARD.cols;
    for (let i = 0; i < len; i += 1) {
      const p = ((Math.floor(x) + i) % BOARD.cols + BOARD.cols) % BOARD.cols;
      if (p === c) return true;
    }
    return false;
  }

  function laneSupport(lane, col) {
    if (lane.kind !== "river") return null;
    return lane.objects.find((object) => wrappedRangeHit(object.x, object.len, col));
  }

  function laneHazard(lane, col) {
    if (lane.kind !== "road") return false;
    return lane.objects.some((object) => wrappedRangeHit(object.x, object.len, col));
  }

  function die(reason) {
    const game = state.game;
    if (game.status !== "LIVE" || game.frog.safeTimer > 0) return;
    game.lives -= 1;
    addLog(reason, "hit");
    addBoardBurst(game.frog.col, game.frog.row, reason === "SPLASH" ? color.cyan : color.red, 36, 1.25);
    if (game.lives <= 0) {
      game.status = "GAME OVER";
      return;
    }
    resetFrog();
    game.frog.safeTimer = 0.55;
  }

  function scoreGoal() {
    const game = state.game;
    const goalIndex = GOALS.reduce((best, g, i) => {
      if (game.goals[i]) return best;
      const dist = Math.abs(g - game.frog.col);
      return best.index < 0 || dist < best.dist ? { index: i, dist } : best;
    }, { index: -1, dist: Infinity }).index;
    if (goalIndex < 0 || Math.abs(GOALS[goalIndex] - game.frog.col) > 2) {
      die("MISS GOAL");
      return;
    }
    game.goals[goalIndex] = true;
    game.score += 500 + Math.max(0, BOARD.rows - game.bestRow) * 20;
    game.crossings += 1;
    addLog(`GOAL ${goalIndex + 1}`, "ok");
    addBoardBurst(GOALS[goalIndex], 0, color.green, 42, 1.35);
    if (game.goals.every(Boolean)) {
      game.status = "CLEAR";
      addLog("BANK CLEAR", "ok");
      addBurst(BOARD.x + BOARD.cols, BOARD.y + 3, color.green, 80, 1.5);
      return;
    }
    resetFrog();
  }

  function moveFrog(dx, dy) {
    const game = state.game;
    if (game.status !== "LIVE") return false;
    const oldCol = game.frog.col;
    const oldRow = game.frog.row;
    const col = clamp(game.frog.col + dx, 0, BOARD.cols - 1);
    const row = clamp(game.frog.row + dy, 0, BOARD.rows - 1);
    if (col === oldCol && row === oldRow) return false;
    addTrail(oldCol, oldRow, "·", color.frog, 260);
    game.frog.col = col;
    game.frog.row = row;
    game.frog.offset = 0;
    game.score += dy < 0 && row < game.bestRow ? 10 : 0;
    game.bestRow = Math.min(game.bestRow, row);
    if (row === 0) scoreGoal();
    return true;
  }

  function updateLanes(dt) {
    for (const lane of state.game.lanes) {
      for (const object of lane.objects) {
        object.x += lane.speed * dt;
        if (object.x > BOARD.cols + 2) object.x -= BOARD.cols + object.len + 4;
        if (object.x < -object.len - 2) object.x += BOARD.cols + object.len + 4;
      }
    }
  }

  function updateFrog(dt) {
    const game = state.game;
    const lane = game.lanes[game.frog.row];
    game.frog.safeTimer = Math.max(0, game.frog.safeTimer - dt);
    if (lane.kind === "road" && laneHazard(lane, game.frog.col)) die("ROAD HIT");
    if (lane.kind === "river") {
      const support = laneSupport(lane, game.frog.col);
      if (!support) {
        die("SPLASH");
      } else {
        game.frog.offset += lane.speed * dt;
        if (Math.abs(game.frog.offset) >= 1) {
          const step = Math.trunc(game.frog.offset);
          game.frog.col += step;
          game.frog.offset -= step;
          if (game.frog.col < 0 || game.frog.col >= BOARD.cols) die("SWEPT AWAY");
        }
      }
    }
  }

  function cellSafe(col, row) {
    if (col < 0 || col >= BOARD.cols || row < 0 || row >= BOARD.rows) return false;
    const lane = state.game.lanes[row];
    if (lane.kind === "road") {
      const futureCol = col - Math.sign(lane.speed || 1);
      return !laneHazard(lane, col) && !laneHazard(lane, futureCol);
    }
    if (lane.kind === "river") return !!laneSupport(lane, col);
    if (lane.kind === "goal") return GOALS.some((goal, i) => !state.game.goals[i] && Math.abs(goal - col) <= 2);
    return true;
  }

  function chooseAIMove() {
    const game = state.game;
    const col = game.frog.col;
    const row = game.frog.row;
    const candidates = [
      { dx: 0, dy: -1, score: -8 },
      { dx: -1, dy: 0, score: 0 },
      { dx: 1, dy: 0, score: 0 },
      { dx: 0, dy: 0, score: 2 },
      { dx: 0, dy: 1, score: 7 },
    ];
    if (row <= 2) {
      const openGoal = GOALS.find((goal, i) => !game.goals[i]);
      if (openGoal !== undefined) {
        candidates.push({ dx: Math.sign(openGoal - col), dy: 0, score: -4 });
      }
    }
    let best = null;
    for (const candidate of candidates) {
      const nc = clamp(col + candidate.dx, 0, BOARD.cols - 1);
      const nr = clamp(row + candidate.dy, 0, BOARD.rows - 1);
      if (!cellSafe(nc, nr)) continue;
      const goalBias = row <= 3 ? Math.min(...GOALS.filter((g, i) => !game.goals[i]).map((g) => Math.abs(g - nc)).concat([0])) : 0;
      const score = candidate.score + goalBias * 0.15 + hash01(nc, nr, game.crossings + 401) * 0.4;
      if (!best || score < best.score) best = { ...candidate, score };
    }
    return best || { dx: 0, dy: 0 };
  }

  function updateAI(dt) {
    if (state.mode !== "demo" || state.game.status !== "LIVE") return;
    state.aiTimer -= dt;
    if (state.aiTimer > 0) return;
    const move = chooseAIMove();
    if (move.dx || move.dy) moveFrog(move.dx, move.dy);
    state.aiTimer = difficultyConfig[state.difficulty].aiDelay;
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused) return;
    game.elapsed += dt;
    game.flash = Math.max(0, game.flash - dt);
    updateLanes(dt);
    updateFrog(dt);
    updateAI(dt);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 71);
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
    writeText(FIELD.x + 2, FIELD.y - 2, "FROGGER TRAFFIC STREAM", color.header);
    writeText(FIELD.x + 69, FIELD.y - 2, "RIVER CARRIER AI", color.gold);
  }

  function laneBg(kind, row, y) {
    if (kind === "road") return (row + y) % 2 === 0 ? color.road : color.road2;
    if (kind === "river") return (row + y) % 2 === 0 ? color.river : color.river2;
    return color.grass;
  }

  function drawBoardBackground() {
    for (let row = 0; row < BOARD.rows; row += 1) {
      const lane = state.game.lanes[row];
      for (let yy = 0; yy < BOARD.tileH; yy += 1) {
        for (let col = 0; col < BOARD.cols; col += 1) {
          for (let xx = 0; xx < BOARD.tileW; xx += 1) {
            const pt = boardToScreen(col, row);
            const bg = laneBg(lane.kind, row, yy);
            const dot = hash01(col * 5 + xx, row * 7 + yy, 901);
            setCell(pt.x + xx, pt.y + yy, dot > 0.92 ? "·" : " ", lane.kind === "river" ? color.cyan : color.dim, bg);
          }
        }
      }
      if (lane.kind === "road") {
        for (let col = 1; col < BOARD.cols; col += 4) {
          const pt = boardToScreen(col, row);
          setCell(pt.x, pt.y + 1, "·", color.lineDim);
          setCell(pt.x + 1, pt.y + 1, "·", color.lineDim);
        }
      }
    }
    for (const [i, goal] of GOALS.entries()) {
      const pt = boardToScreen(goal, 0);
      const fg = state.game.goals[i] ? color.green : color.cyan;
      writeText(pt.x - 1, pt.y + 1, state.game.goals[i] ? "[F]" : "[ ]", fg, color.grass);
    }
  }

  function drawObject(object, lane) {
    const fg = lane.glyph === "truck" ? color.truck : lane.glyph === "turtle" ? color.turtle : lane.glyph === "log" ? color.log : color.car;
    const row = lane.row;
    for (let i = 0; i < object.len; i += 1) {
      const col = ((Math.floor(object.x) + i) % BOARD.cols + BOARD.cols) % BOARD.cols;
      const pt = boardToScreen(col, row);
      if (lane.kind === "road") {
        const glyph = lane.glyph === "truck" ? (i === 0 ? "▛▜" : i === object.len - 1 ? "▙▟" : "██") : i % 2 ? "▚▞" : "██";
        writeText(pt.x, pt.y + 1, glyph, fg, color.road2);
      } else {
        const glyph = lane.glyph === "turtle" ? (i % 2 ? "◖◗" : "◐◑") : i === 0 || i === object.len - 1 ? "▒▒" : "▓▓";
        writeText(pt.x, pt.y + 1, glyph, fg, color.river2);
      }
    }
  }

  function drawLanes() {
    for (const lane of state.game.lanes) {
      for (const object of lane.objects) drawObject(object, lane);
    }
  }

  function drawFrog() {
    const frog = state.game.frog;
    const pt = boardToScreen(clamp(frog.col, 0, BOARD.cols - 1), frog.row);
    setCell(pt.x, pt.y, "╭", color.green);
    setCell(pt.x + 1, pt.y, "╮", color.green);
    setCell(pt.x, pt.y + 1, "◉", color.frog, "#06180f");
    setCell(pt.x + 1, pt.y + 1, "◉", color.frog, "#06180f");
    setCell(pt.x, pt.y + 2, "╰", color.green);
    setCell(pt.x + 1, pt.y + 2, "╯", color.green);
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
    writeText(RIGHT.x + 2, RIGHT.y + 2, "FROGGER", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `LIVES ${"●".repeat(Math.max(0, game.lives)).padEnd(5, " ")}`, color.frog);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 11, "GOALS", color.header);
    const goals = game.goals.filter(Boolean).length;
    writeText(RIGHT.x + 2, RIGHT.y + 13, `[${"█".repeat(goals * 4)}${" ".repeat(20 - goals * 4)}]`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `${goals}/${GOALS.length} HOMES`, goals === GOALS.length ? color.green : color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 18, "LANE", color.header);
    const lane = game.lanes[game.frog.row];
    writeText(RIGHT.x + 2, RIGHT.y + 20, `${String(game.frog.row).padStart(2, "0")} ${lane.kind.toUpperCase()}`, lane.kind === "river" ? color.cyan : lane.kind === "road" ? color.red2 : color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 22, game.status, game.status === "LIVE" ? color.cyan : game.status === "CLEAR" ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 26, "LOG", color.header);
    state.eventLog.slice(state.logOffset, state.logOffset + 18).forEach((entry, i) => {
      const tone = entry.tone === "hit" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 28 + i, `>${entry.message.slice(0, 22)}`, tone);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   ARROWS/WASD HOP   SPACE WAIT   P PAUSE   R REROLL   F HOME", color.muted);
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
    drawBoardBackground();
    drawTrails(now);
    drawEffects(now);
    if (state.game) {
      drawLanes();
      drawFrog();
      if (state.paused) writeText(FIELD.x + 42, FIELD.y + 22, "PAUSED", color.green);
      if (state.game.status !== "LIVE") {
        const fg = state.game.status === "CLEAR" ? color.green : color.red;
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
    if (key === "w" || event.key === "ArrowUp") return { dx: 0, dy: -1 };
    if (key === "s" || event.key === "ArrowDown") return { dx: 0, dy: 1 };
    if (key === "a" || event.key === "ArrowLeft") return { dx: -1, dy: 0 };
    if (key === "d" || event.key === "ArrowRight") return { dx: 1, dy: 0 };
    return null;
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) {
      event.preventDefault();
      return;
    }
    if (key === "f" || event.key === "Home") {
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
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (state.mode === "human") addLog("WAIT", "info");
      return;
    }
    const move = keyToMove(event);
    if (move) {
      event.preventDefault();
      if (state.mode === "human") moveFrog(move.dx, move.dy);
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
