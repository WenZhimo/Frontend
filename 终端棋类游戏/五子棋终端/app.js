(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const seedForm = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const playModeSelect = document.getElementById("play-mode");
  const humanSideSelect = document.getElementById("human-side");
  const aiSelect = document.getElementById("ai-select");

  const COLS = 132;
  const ROWS = 60;
  const CELL_W = 11;
  const CELL_H = 18;
  const FONT_SIZE = 16;
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const DOT_W = 2;
  const DOT_H = 4;
  const BRAILLE_BASE = 0x2800;
  const SIZE = 15;
  const WIN_COUNT = 5;
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const DIRS = [
    { x: 1, y: 0, name: "H" },
    { x: 0, y: 1, name: "V" },
    { x: 1, y: 1, name: "D" },
    { x: 1, y: -1, name: "A" },
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#121914",
    boardB: "#0d1311",
    grid: "#7e8a81",
    gridDim: "#2e3a35",
    star: "#b8c5b8",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    blackStone: "#f1a94f",
    blackAlt: "#ffd06f",
    whiteStone: "#f7ffff",
    whiteAlt: "#aaf6ff",
    blue: "#6ed5ec",
    red: "#ff4e59",
    win: "#ff4e59",
  };

  const AI_ROSTER = [
    { name: "SENTINEL", attack: 0.95, defense: 1.35, center: 0.7, noise: 0.7, source: "line heuristic" },
    { name: "CUTTER", attack: 1.3, defense: 1.0, center: 0.55, noise: 1.0, source: "line heuristic" },
    { name: "STARFALL", attack: 1.08, defense: 1.1, center: 1.15, noise: 1.25, source: "shape heuristic" },
    { name: "OBSIDIAN", attack: 1.18, defense: 1.18, center: 0.85, noise: 0.55, source: "balanced heuristic" },
    { name: "FUSE", attack: 1.45, defense: 0.82, center: 0.35, noise: 1.45, source: "volatile heuristic" },
  ];

  const screen = {
    ch: Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
    bg: Array(COLS * ROWS),
  };

  const dotLayer = {
    mask: new Uint8Array(COLS * ROWS),
    power: new Float32Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
  };

  const layout = {
    left: { x: 1, y: 1, w: 88, h: 58 },
    right: { x: 92, y: 1, w: 39, h: 58 },
    boardBox: { x: 7, y: 7, w: 76, h: 45 },
    board: { x: 10, y: 8, stepX: 5, stepY: 3 },
  };
  layout.board.gridW = (SIZE - 1) * layout.board.stepX + 1;
  layout.board.gridH = (SIZE - 1) * layout.board.stepY + 1;

  const state = {
    seed: "",
    rng: null,
    board: [],
    players: null,
    toMove: 1,
    moves: [],
    moveLog: [],
    effects: [],
    fragments: [],
    ripples: [],
    threatLines: [],
    lastMove: null,
    winner: 0,
    winLine: [],
    result: "",
    nextMoveAt: 0,
    lastFrame: 0,
    speed: 1,
    paused: false,
    matchMode: "ai-vs-ai",
    humanSide: "black",
    selectedAI: "",
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

  function hashString(input) {
    let h1 = 0xdeadbeef ^ input.length;
    let h2 = 0x41c6ce57 ^ input.length;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return [(h1 ^ h2) >>> 0, h1 >>> 0, h2 >>> 0, (h1 + h2) >>> 0];
  }

  function makeRng(seed) {
    let [a, b, c, d] = hashString(seed);
    return () => {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      const t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      const out = (t + d) | 0;
      c = (c + out) | 0;
      return (out >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    const values = crypto.getRandomValues(new Uint32Array(SEED_LENGTH));
    let out = "";
    for (let i = 0; i < values.length; i += 1) {
      out += RANDOM_SEED_CHARS[values[i] % RANDOM_SEED_CHARS.length];
    }
    return out;
  }

  function normalizeSeed(value) {
    let out = "";
    for (let i = 0; i < value.length && out.length < SEED_LENGTH; i += 1) {
      const code = value.charCodeAt(i);
      out += code >= ASCII_FIRST && code <= ASCII_LAST ? value[i] : " ";
    }
    return out.padEnd(SEED_LENGTH, " ");
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length) % list.length];
  }

  function populateMatchControls() {
    if (humanSideSelect && !humanSideSelect.options.length) {
      humanSideSelect.innerHTML = [
        '<option value="black">HUMAN BLACK</option>',
        '<option value="white">HUMAN WHITE</option>',
      ].join("");
    }
    if (aiSelect && !aiSelect.options.length) {
      aiSelect.innerHTML = AI_ROSTER.map((ai) => `<option value="${ai.name}">${ai.name}</option>`).join("");
    }
  }

  function selectedAIPlayer() {
    const name = aiSelect?.value || AI_ROSTER[0].name;
    return { ...(AI_ROSTER.find((ai) => ai.name === name) || AI_ROSTER[0]) };
  }

  function setupPlayers() {
    const black = { ...pick(state.rng, AI_ROSTER) };
    const white = { ...pick(state.rng, AI_ROSTER) };
    if (state.matchMode === "human-vs-human") {
      return { black: { name: "HUMAN", source: "local" }, white: { name: "HUMAN", source: "local" } };
    }
    if (state.matchMode === "human-vs-ai") {
      const ai = selectedAIPlayer();
      return state.humanSide === "black"
        ? { black: { name: "HUMAN", source: "local" }, white: ai }
        : { black: ai, white: { name: "HUMAN", source: "local" } };
    }
    return { black, white };
  }

  function isHumanSide(side) {
    const name = sideName(side);
    return state.matchMode === "human-vs-human" || (state.matchMode === "human-vs-ai" && state.humanSide === name);
  }

  function isHumanTurn() {
    return isHumanSide(state.toMove);
  }

  function updateSeedStatus() {
    if (state.winner || state.result) seedStatus.value = "FINISHED";
    else if (state.paused) seedStatus.value = "PAUSED";
    else seedStatus.value = isHumanTurn() ? "HUMAN TURN" : "PLAYING";
  }

  function scheduleNextTurn(now, delay) {
    state.nextMoveAt = isHumanTurn() ? Infinity : now + delay / state.speed;
    updateSeedStatus();
  }

  function blankBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function startGame(seed) {
    state.seed = normalizeSeed(seed || randomSeed());
    seedInput.value = state.seed.trimEnd();
    state.rng = makeRng(`${state.seed}|gomoku`);
    state.matchMode = playModeSelect?.value || "ai-vs-ai";
    state.humanSide = humanSideSelect?.value || "black";
    state.selectedAI = aiSelect?.value || AI_ROSTER[0].name;
    state.board = blankBoard();
    state.players = setupPlayers();
    state.toMove = 1;
    state.moves = [];
    state.moveLog = [];
    state.effects = [];
    state.fragments = [];
    state.ripples = [];
    state.threatLines = [];
    state.lastMove = null;
    state.winner = 0;
    state.winLine = [];
    state.result = "";
    state.paused = false;
    state.nextMoveAt = 0;
    state.lastFrame = 0;
    scheduleNextTurn(performance.now(), 420);
  }

  function sideName(side) {
    return side === 1 ? "black" : "white";
  }

  function sideColor(side) {
    return side === 1 ? color.blackStone : color.whiteStone;
  }

  function sideAltColor(side) {
    return side === 1 ? color.blackAlt : color.whiteAlt;
  }

  function sideEffectColor(side) {
    return side === 1 ? color.red : color.whiteAlt;
  }

  function hash(n) {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  }

  function isEmpty(x, y) {
    return inBounds(x, y) && state.board[y][x] === 0;
  }

  function boardHasStones() {
    return state.moves.length > 0;
  }

  function candidateCells() {
    if (!boardHasStones()) {
      const center = Math.floor(SIZE / 2);
      return [{ x: center, y: center }];
    }
    const map = new Map();
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (!state.board[y][x]) continue;
        for (let yy = y - 2; yy <= y + 2; yy += 1) {
          for (let xx = x - 2; xx <= x + 2; xx += 1) {
            if (isEmpty(xx, yy)) map.set(`${xx},${yy}`, { x: xx, y: yy });
          }
        }
      }
    }
    return Array.from(map.values());
  }

  function scanLine(x, y, side, dir) {
    const points = [{ x, y }];
    let a = 0;
    let nx = x - dir.x;
    let ny = y - dir.y;
    while (inBounds(nx, ny) && state.board[ny][nx] === side) {
      points.unshift({ x: nx, y: ny });
      a += 1;
      nx -= dir.x;
      ny -= dir.y;
    }
    const openA = inBounds(nx, ny) && state.board[ny][nx] === 0;
    let b = 0;
    nx = x + dir.x;
    ny = y + dir.y;
    while (inBounds(nx, ny) && state.board[ny][nx] === side) {
      points.push({ x: nx, y: ny });
      b += 1;
      nx += dir.x;
      ny += dir.y;
    }
    const openB = inBounds(nx, ny) && state.board[ny][nx] === 0;
    return { len: a + b + 1, open: Number(openA) + Number(openB), points, dir };
  }

  function patternScore(len, open) {
    if (len >= 5) return 100000000;
    if (len === 4 && open === 2) return 8000000;
    if (len === 4 && open === 1) return 1200000;
    if (len === 3 && open === 2) return 280000;
    if (len === 3 && open === 1) return 42000;
    if (len === 2 && open === 2) return 9000;
    if (len === 2 && open === 1) return 1200;
    if (len === 1 && open === 2) return 160;
    return 20;
  }

  function evaluateSideAt(x, y, side) {
    state.board[y][x] = side;
    let best = { score: 0, line: [], kind: "QUIET", dir: DIRS[0] };
    let sum = 0;
    for (const dir of DIRS) {
      const scan = scanLine(x, y, side, dir);
      const score = patternScore(scan.len, scan.open);
      sum += score * 0.12;
      if (score > best.score) {
        best = { score, line: scan.points, kind: patternKind(scan.len, scan.open), dir };
      }
    }
    state.board[y][x] = 0;
    return { score: best.score + sum, best };
  }

  function patternKind(len, open) {
    if (len >= 5) return "FIVE";
    if (len === 4 && open === 2) return "OPEN-FOUR";
    if (len === 4) return "FOUR";
    if (len === 3 && open === 2) return "OPEN-THREE";
    if (len === 3) return "THREE";
    if (len === 2 && open === 2) return "OPEN-TWO";
    return "BUILD";
  }

  function scoreCandidate(x, y, side, persona) {
    const opponent = side === 1 ? 2 : 1;
    const attack = evaluateSideAt(x, y, side);
    const block = evaluateSideAt(x, y, opponent);
    const center = Math.floor(SIZE / 2);
    const dist = Math.hypot(x - center, y - center) / center;
    const noise = (state.rng() - 0.5) * persona.noise * 3200;
    return {
      x,
      y,
      attack,
      block,
      score: attack.score * persona.attack + block.score * persona.defense + (1 - dist) * persona.center * 9000 + noise,
    };
  }

  function chooseMove() {
    const side = state.toMove;
    const persona = state.players[sideName(side)];
    const candidates = candidateCells().map((pt) => scoreCandidate(pt.x, pt.y, side, persona));
    candidates.sort((a, b) => b.score - a.score);
    state.threatLines = candidates
      .slice(0, 6)
      .filter((candidate) => Math.max(candidate.attack.best.score, candidate.block.best.score) >= 42000)
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        side,
        kind: candidate.attack.best.score >= candidate.block.best.score ? candidate.attack.best.kind : `BLOCK-${candidate.block.best.kind}`,
        line: candidate.attack.best.score >= candidate.block.best.score ? candidate.attack.best.line : candidate.block.best.line,
        score: Math.max(candidate.attack.best.score, candidate.block.best.score),
      }));
    if (!candidates.length) return null;
    const urgent = candidates.find((candidate) => candidate.score > 1000000);
    if (urgent) return urgent;
    const top = candidates.slice(0, Math.min(5, candidates.length));
    return top[Math.floor(Math.pow(state.rng(), 1.7) * top.length)];
  }

  function winningLineFrom(x, y, side) {
    for (const dir of DIRS) {
      const line = scanLine(x, y, side, dir).points;
      if (line.length >= WIN_COUNT) return line;
    }
    return [];
  }

  function coordinate(x, y) {
    return `${"ABCDEFGHIJKLMNO"[x]}${SIZE - y}`;
  }

  function playMove(move, now) {
    if (state.paused || state.winner) return;
    if (!move) {
      finishGame(0, "DRAW / board full");
      return;
    }
    const side = state.toMove;
    const opponent = side === 1 ? 2 : 1;
    const attack = move.attack || evaluateSideAt(move.x, move.y, side);
    const block = move.block || evaluateSideAt(move.x, move.y, opponent);
    state.board[move.y][move.x] = side;
    state.moves.push({ x: move.x, y: move.y, side });
    state.lastMove = { x: move.x, y: move.y, side, at: now };
    state.moveLog.push({
      ply: state.moves.length,
      side,
      coord: coordinate(move.x, move.y),
      kind: attack.best.score >= block.best.score ? attack.best.kind : `BLOCK ${block.best.kind}`,
    });
    state.effects.push({
      type: "drop",
      x: move.x,
      y: move.y,
      side,
      at: now,
      duration: reducedMotion ? 120 : 360,
    });
    ripple(move, side, 1, now);
    shatter(move, side, reducedMotion ? 6 : 22, 0.75, now);
    const line = winningLineFrom(move.x, move.y, side);
    if (line.length >= WIN_COUNT) {
      state.winLine = line;
      finishGame(side, `${sideName(side).toUpperCase()} FIVE`);
      state.effects.push({ type: "win", side, line, at: now, lastEmit: now });
      emitWinLine(line, side, now, true);
      return;
    }
    if (state.moves.length >= SIZE * SIZE) {
      finishGame(0, "DRAW / board full");
      return;
    }
    state.toMove = side === 1 ? 2 : 1;
    scheduleNextTurn(now, 600);
  }

  function playAIMove(now) {
    if (state.paused || state.winner || isHumanTurn()) return;
    playMove(chooseMove(), now);
  }

  function finishGame(winner, result) {
    state.winner = winner;
    state.result = result;
    updateSeedStatus();
  }

  function cellFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const tx = ((event.clientX - rect.left) / rect.width) * COLS;
    const ty = ((event.clientY - rect.top) / rect.height) * ROWS;
    const x = Math.round((tx - layout.board.x) / layout.board.stepX);
    const y = Math.round((ty - layout.board.y) / layout.board.stepY);
    if (!inBounds(x, y)) return null;
    const c = pointToChar({ x, y });
    if (Math.abs(tx - c.x) > layout.board.stepX * 0.5 || Math.abs(ty - c.y) > layout.board.stepY * 0.6) return null;
    return { x, y };
  }

  function handleHumanClick(event) {
    if (!isHumanTurn() || state.paused || state.winner) return;
    const cell = cellFromPointer(event);
    if (!cell || !isEmpty(cell.x, cell.y)) return;
    playMove({ x: cell.x, y: cell.y }, performance.now());
  }

  function clearScreen() {
    for (let i = 0; i < COLS * ROWS; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.muted;
      screen.bg[i] = color.ink;
    }
    dotLayer.mask.fill(0);
    dotLayer.power.fill(0);
    dotLayer.fg.fill(null);
  }

  function setCell(x, y, ch, fg = color.muted, bg) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const i = idx(x, y);
    screen.ch[i] = ch;
    screen.fg[i] = fg;
    if (bg) screen.bg[i] = bg;
  }

  function writeText(x, y, text, fg = color.muted, bg) {
    for (let i = 0; i < text.length; i += 1) {
      setCell(x + i, y, text[i], fg, bg);
    }
  }

  function fillRect(x, y, w, h, bg) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (xx >= 0 && yy >= 0 && xx < COLS && yy < ROWS) screen.bg[idx(xx, yy)] = bg;
      }
    }
  }

  function drawBox(rect, title) {
    const { x, y, w, h } = rect;
    for (let xx = x; xx < x + w; xx += 1) {
      setCell(xx, y, xx === x ? "+" : xx === x + w - 1 ? "+" : "-", color.gridDim, color.ink2);
      setCell(xx, y + h - 1, xx === x ? "+" : xx === x + w - 1 ? "+" : "-", color.gridDim, color.ink2);
    }
    for (let yy = y + 1; yy < y + h - 1; yy += 1) {
      setCell(x, yy, "|", color.gridDim, color.ink2);
      setCell(x + w - 1, yy, "|", color.gridDim, color.ink2);
    }
    if (title) writeText(x + 2, y, ` ${title} `, color.header, color.ink2);
  }

  function brailleBit(sx, sy) {
    const x = ((sx % DOT_W) + DOT_W) % DOT_W;
    const y = ((sy % DOT_H) + DOT_H) % DOT_H;
    if (x === 0 && y === 0) return 1;
    if (x === 0 && y === 1) return 2;
    if (x === 0 && y === 2) return 4;
    if (x === 0 && y === 3) return 64;
    if (x === 1 && y === 0) return 8;
    if (x === 1 && y === 1) return 16;
    if (x === 1 && y === 2) return 32;
    return 128;
  }

  function putDotSub(sx, sy, fg, power = 1) {
    const cx = Math.floor(sx / DOT_W);
    const cy = Math.floor(sy / DOT_H);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    const i = idx(cx, cy);
    dotLayer.mask[i] |= brailleBit(sx, sy);
    if (power >= dotLayer.power[i]) {
      dotLayer.power[i] = power;
      dotLayer.fg[i] = fg;
    }
  }

  function flushDotLayer(bounds) {
    const x0 = bounds ? bounds.x : 0;
    const y0 = bounds ? bounds.y : 0;
    const x1 = bounds ? bounds.x + bounds.w : COLS;
    const y1 = bounds ? bounds.y + bounds.h : ROWS;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = idx(x, y);
        if (!dotLayer.mask[i]) continue;
        screen.ch[i] = String.fromCharCode(BRAILLE_BASE + dotLayer.mask[i]);
        screen.fg[i] = dotLayer.fg[i] || color.grid;
      }
    }
    dotLayer.mask.fill(0);
    dotLayer.power.fill(0);
    dotLayer.fg.fill(null);
  }

  function pointToSub(point) {
    return {
      sx: (layout.board.x + point.x * layout.board.stepX) * DOT_W,
      sy: (layout.board.y + point.y * layout.board.stepY) * DOT_H,
    };
  }

  function pointToChar(point) {
    return {
      x: layout.board.x + point.x * layout.board.stepX,
      y: layout.board.y + point.y * layout.board.stepY,
    };
  }

  function drawStaticFrame() {
    fillRect(0, 0, COLS, ROWS, color.ink);
    fillRect(layout.left.x, layout.left.y, layout.left.w, layout.left.h, color.ink2);
    fillRect(layout.right.x, layout.right.y, layout.right.w, layout.right.h, color.panel);
    drawBox(layout.left, "GOMOKU TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE GOMOKU / FREESTYLE 15x15", color.header);
    writeText(4, 4, "FIVE IN A ROW / SEE THE LINES", color.dim);
    writeText(4, 56, "1 0.5x  2 1x  3 2x  4 4x  SPACE pause  R reroll  P play", color.dim);
  }

  function drawBoardBackground() {
    const box = layout.boardBox;
    fillRect(box.x, box.y, box.w, box.h, color.boardA);
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const staticNoise = (x * 29 + y * 17 + x * y * 3) % 53;
        if (staticNoise <= 2) screen.bg[idx(x, y)] = color.boardB;
      }
    }

    const start = pointToSub({ x: 0, y: 0 });
    const end = pointToSub({ x: SIZE - 1, y: SIZE - 1 });
    for (let row = 0; row < SIZE; row += 1) {
      const sy = (layout.board.y + row * layout.board.stepY) * DOT_H;
      for (let sx = start.sx; sx <= end.sx; sx += 2) putDotSub(sx, sy, color.gridDim, 0.25);
    }
    for (let col = 0; col < SIZE; col += 1) {
      const sx = (layout.board.x + col * layout.board.stepX) * DOT_W;
      for (let sy = start.sy; sy <= end.sy; sy += 2) putDotSub(sx, sy, color.gridDim, 0.25);
    }

    for (const star of starPoints()) drawStar(star.x, star.y);

    const files = "ABCDEFGHIJKLMNO";
    for (let i = 0; i < SIZE; i += 1) {
      writeText(layout.board.x + i * layout.board.stepX, layout.board.y + layout.board.gridH + 1, files[i], color.dim);
      writeText(Math.max(1, layout.board.x - 4), layout.board.y + i * layout.board.stepY, String(SIZE - i).padStart(2, " "), color.dim);
    }
  }

  function starPoints() {
    return [3, 7, 11].flatMap((x) => [3, 7, 11].map((y) => ({ x, y })));
  }

  function drawStar(x, y) {
    const { sx, sy } = pointToSub({ x, y });
    for (let yy = -2; yy <= 2; yy += 1) {
      for (let xx = -2; xx <= 2; xx += 1) {
        if (Math.abs(xx) + Math.abs(yy) <= 2) putDotSub(sx + xx, sy + yy, color.star, 0.55);
      }
    }
  }

  function drawStone(point, side, options = {}) {
    const { sx, sy } = pointToSub(point);
    const radius = 5.1 * (options.scale ?? 1);
    const fade = options.fade ?? 1;
    const main = options.color || sideColor(side);
    const alt = options.alt || sideAltColor(side);
    for (let y = Math.floor(sy - radius - 1); y <= Math.ceil(sy + radius + 1); y += 1) {
      for (let x = Math.floor(sx - radius - 1); x <= Math.ceil(sx + radius + 1); x += 1) {
        const dx = x - sx;
        const dy = y - sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const inner = d < radius * 0.55;
        const rim = d > radius * 0.78;
        putDotSub(x, y, inner ? alt : main, (rim ? 0.82 : 1) * fade);
      }
    }
  }

  function drawStones(now) {
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const side = state.board[y][x];
        if (!side) continue;
        let scale = 1;
        if (state.lastMove && state.lastMove.x === x && state.lastMove.y === y) {
          scale = lerp(0.72, 1, clamp((now - state.lastMove.at) / 220, 0, 1));
        }
        drawStone({ x, y }, side, { scale });
      }
    }
  }

  function drawThreatLines(now) {
    if (state.winner) return;
    const phase = reducedMotion ? 0.5 : 0.45 + Math.sin(now / 260) * 0.18;
    for (const threat of state.threatLines) {
      const fg = threat.kind.startsWith("BLOCK") ? color.red : sideAltColor(threat.side);
      for (const pt of threat.line) {
        const { sx, sy } = pointToSub(pt);
        putDotSub(sx, sy, fg, phase);
        putDotSub(sx + 1, sy, fg, phase);
      }
      const p = pointToSub(threat);
      putDotSub(p.sx, p.sy, fg, 0.75);
      putDotSub(p.sx + 1, p.sy, fg, 0.75);
      putDotSub(p.sx, p.sy + 1, fg, 0.75);
      putDotSub(p.sx + 1, p.sy + 1, fg, 0.75);
    }
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function inEffectBounds(sx, sy) {
    const box = layout.boardBox;
    return sx >= (box.x - 1) * DOT_W && sy >= (box.y - 1) * DOT_H && sx < (box.x + box.w + 1) * DOT_W && sy < (box.y + box.h + 1) * DOT_H;
  }

  function putEffectDot(sx, sy, fg, power = 1) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    if (!inEffectBounds(sx, sy)) return;
    putDotSub(sx, sy, fg, power);
  }

  function drawDropEffect() {
    // The visible drop response comes from the copied chess ripple/fragment layer.
  }

  function drawWinEffect() {
    // Victory emissions are intentionally limited to outward shatter particles.
  }

  function drawTerminalEffects(now) {
    for (const r of state.ripples) {
      const age = (now - r.born) / r.life;
      const radius = lerp(1.4, 10 * r.strength, smooth(age));
      const thickness = lerp(0.7, 0.22, age);
      const cx = r.x * DOT_W;
      const cy = r.y * DOT_H;
      const fg = sideEffectColor(r.side);
      const minX = Math.floor((r.x - radius - 2) * DOT_W);
      const maxX = Math.ceil((r.x + radius + 2) * DOT_W);
      const minY = Math.floor((r.y - radius * 0.62 - 2) * DOT_H);
      const maxY = Math.ceil((r.y + radius * 0.62 + 2) * DOT_H);

      for (let sy = minY; sy <= maxY; sy += 1) {
        for (let sx = minX; sx <= maxX; sx += 1) {
          const dx = (sx - cx) / DOT_W;
          const dy = ((sy - cy) / DOT_H) / 0.62;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - radius) > thickness) continue;
          if (hash(sx * 7 + sy * 17 + Math.floor(age * 29)) > 0.72 - age * 0.38) continue;
          putEffectDot(sx, sy, fg, clamp((1 - age) * 0.72, 0.12, 0.78));
        }
      }
    }

    state.fragments.forEach((g, i) => {
      const age = (now - g.born) / g.life;
      const fg = sideEffectColor(g.side);
      const radius = g.kind === "trail" ? 3 : 1;
      const cx = Math.round(g.x * DOT_W);
      const cy = Math.round(g.y * DOT_H);
      for (let sy = -radius; sy <= radius; sy += 1) {
        for (let sx = -radius; sx <= radius; sx += 1) {
          const d = Math.sqrt(sx * sx + sy * sy);
          if (d > radius + 0.3) continue;
          if (hash(i * 31 + sx * 11 + sy * 19 + Math.floor(age * 23)) > 0.84 - age * 0.32) continue;
          putEffectDot(cx + sx, cy + sy, fg, clamp((1 - age) * (g.kind === "trail" ? 0.45 : 0.7), 0.1, 0.78));
        }
      }
    });
  }

  function drawPolyline(points, fg, power) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = pointToSub(points[i]);
      const b = pointToSub(points[i + 1]);
      const steps = Math.max(Math.abs(b.sx - a.sx), Math.abs(b.sy - a.sy));
      for (let s = 0; s <= steps; s += 1) {
        const t = steps ? s / steps : 0;
        putDotSub(Math.round(lerp(a.sx, b.sx, t)), Math.round(lerp(a.sy, b.sy, t)), fg, power);
      }
    }
  }

  function drawEffects(now) {
    drawTerminalEffects(now);
    state.effects = state.effects.filter((effect) => now - effect.at < effect.duration || effect.type === "win");
    for (const effect of state.effects) {
      if (effect.type === "drop") drawDropEffect(effect, now);
      if (effect.type === "win") drawWinEffect(effect, now);
    }
  }

  function updateEffects(now, dt) {
    if (state.paused) return;
    const frameScale = dt / 16.67;
    state.fragments = state.fragments.filter((g) => {
      g.x += g.vx * frameScale;
      g.y += g.vy * frameScale;
      g.vx *= 0.945;
      g.vy *= 0.945;
      return now - g.born < g.life;
    });
    state.ripples = state.ripples.filter((r) => now - r.born < r.life);

    for (const effect of state.effects) {
      if (effect.type !== "win") continue;
      const interval = reducedMotion ? 1000 : 680;
      if (now - effect.lastEmit < interval) continue;
      emitWinLine(effect.line, effect.side, now, false);
      effect.lastEmit = now;
    }
  }

  function shatter(point, side, count, speed = 1, now = performance.now()) {
    const origin = pointToChar(point);
    for (let i = 0; i < count; i += 1) {
      const a = hash(now + i * 17) * Math.PI * 2;
      const v = (0.35 + hash(i * 41 + now) * 1.05) * speed;
      state.fragments.push({
        x: origin.x + (hash(i) - 0.5) * 5,
        y: origin.y + (hash(i * 3) - 0.5) * 4,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.72,
        born: now,
        life: 420 + hash(i * 9) * 540,
        side,
        kind: "shatter",
      });
    }
  }

  function trail(point, side, now = performance.now(), count = 10) {
    const origin = pointToChar(point);
    for (let i = 0; i < count; i += 1) {
      state.fragments.push({
        x: origin.x + (hash(i + now) - 0.5) * 7,
        y: origin.y + (hash(i * 5 + now) - 0.5) * 5,
        vx: (hash(i * 2 + now) - 0.5) * 0.28,
        vy: (hash(i * 7 + now) - 0.5) * 0.18,
        born: now,
        life: 260 + hash(i * 11) * 300,
        side,
        kind: "trail",
      });
    }
  }

  function ripple(point, side, strength, now = performance.now(), life = 660) {
    const origin = pointToChar(point);
    state.ripples.push({
      x: origin.x,
      y: origin.y,
      side,
      strength,
      born: now,
      life,
    });
  }

  function emitWinLine(line, side, now, strong) {
    line.forEach((point) => {
      shatter(point, side, strong ? 18 : 7, strong ? 1.05 : 0.68, now);
    });
  }

  function scoreBar() {
    const black = state.players ? boardEvaluation(1) : 0;
    const white = state.players ? boardEvaluation(2) : 0;
    const diff = black - white;
    const span = clamp(Math.round(diff / 250000), -10, 10);
    let out = "";
    for (let i = -10; i < 10; i += 1) {
      if (i === 0) out += "|";
      else if (span > 0 && i > 0 && i <= span) out += "#";
      else if (span < 0 && i < 0 && i >= span) out += "#";
      else out += ".";
    }
    return { bar: out.slice(0, 20), diff };
  }

  function boardEvaluation(side) {
    let total = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (state.board[y][x]) continue;
        total += evaluateSideAt(x, y, side).score * 0.02;
      }
    }
    return total;
  }

  function drawPanel(now) {
    const r = layout.right;
    const blackName = state.players?.black.name || "SELECTING";
    const whiteName = state.players?.white.name || "SELECTING";
    const toMove = state.winner ? "DONE" : sideName(state.toMove).toUpperCase();
    const score = scoreBar();
    const topThreat = state.threatLines[0];

    writeText(r.x + 3, r.y + 3, "RULESET", color.header);
    writeText(r.x + 3, r.y + 5, "FREESTYLE GOMOKU", color.blue);
    writeText(r.x + 3, r.y + 7, "BLACK", color.blackStone);
    writeText(r.x + 12, r.y + 7, blackName.padEnd(16).slice(0, 16), color.blackAlt);
    writeText(r.x + 3, r.y + 8, "WHITE", color.whiteStone);
    writeText(r.x + 12, r.y + 8, whiteName.padEnd(16).slice(0, 16), color.whiteAlt);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, state.toMove === 1 ? color.blackStone : color.whiteStone);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "LINE PRESSURE", color.header);
    writeText(r.x + 3, r.y + 17, `[${score.bar}]`, score.diff >= 0 ? color.blackStone : color.whiteStone);
    writeText(r.x + 3, r.y + 18, score.diff >= 0 ? "BLACK EDGE" : "WHITE EDGE", score.diff >= 0 ? color.blackStone : color.whiteStone);

    writeText(r.x + 3, r.y + 21, "THREAT", color.header);
    if (topThreat) {
      writeText(r.x + 3, r.y + 23, `${topThreat.kind}`.slice(0, 26), topThreat.kind.startsWith("BLOCK") ? color.red : sideColor(topThreat.side));
      writeText(r.x + 3, r.y + 24, `${coordinate(topThreat.x, topThreat.y)}  ${Math.round(topThreat.score)}`, color.muted);
    } else {
      writeText(r.x + 3, r.y + 23, "QUIET BUILD", color.dim);
    }

    writeText(r.x + 3, r.y + 27, "MOVES", color.header);
    const recent = state.moveLog.slice(-17);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const fg = move.side === 1 ? color.blackStone : color.whiteStone;
      writeText(r.x + 3, r.y + 29 + i, `${String(move.ply).padStart(3, "0")} ${sideName(move.side)[0].toUpperCase()} ${move.coord} ${move.kind}`.slice(0, 31), fg);
    }

    if (state.winner || state.result) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), color.red);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.red);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} reading lines`, color.dim);
    }
  }

  function renderTerminal() {
    const dpr = window.devicePixelRatio || 1;
    const width = COLS * CELL_W;
    const height = ROWS * CELL_H;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    ctx.fillStyle = color.page;
    ctx.fillRect(0, 0, width, height);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        ctx.fillStyle = screen.bg[idx(x, y)];
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
      }
    }
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = screen.ch[idx(x, y)];
        if (ch === " ") continue;
        ctx.fillStyle = screen.fg[idx(x, y)];
        ctx.fillText(ch, x * CELL_W, y * CELL_H + 1);
      }
    }
  }

  function draw(now) {
    clearScreen();
    drawStaticFrame();
    drawBoardBackground();
    drawThreatLines(now);
    drawEffects(now);
    drawStones(now);
    flushDotLayer(layout.left);
    drawPanel(now);
    renderTerminal();
  }

  function loop(now) {
    const dt = state.lastFrame ? Math.min(66, now - state.lastFrame) : 16.67;
    state.lastFrame = now;
    updateEffects(now, dt);
    if (!state.paused && !state.winner && now >= state.nextMoveAt) playAIMove(now);
    draw(now);
    requestAnimationFrame(loop);
  }

  seedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startGame(seedInput.value);
  });

  seedRandomButton.addEventListener("click", () => {
    startGame(randomSeed());
  });

  seedCopyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.seed);
      seedStatus.value = "COPIED";
      setTimeout(() => {
        if (!state.winner) updateSeedStatus();
      }, 900);
    } catch (error) {
      seedStatus.value = "COPY ERR";
    }
  });

  for (const control of [playModeSelect, humanSideSelect, aiSelect]) {
    control?.addEventListener("change", () => {
      startGame(seedInput.value || state.seed || randomSeed());
    });
  }

  canvas.addEventListener("click", handleHumanClick);

  canvas.addEventListener("mousemove", (event) => {
    const cell = cellFromPointer(event);
    canvas.style.cursor = isHumanTurn() && cell && isEmpty(cell.x, cell.y) ? "pointer" : "default";
  });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
  });

  window.addEventListener("keydown", (event) => {
    if (seedForm.contains(event.target)) return;
    if (event.key === " ") {
      event.preventDefault();
      state.paused = !state.paused;
      updateSeedStatus();
    } else if (event.key.toLowerCase() === "r") {
      startGame(randomSeed());
    } else if (event.key.toLowerCase() === "p") {
      startGame(seedInput.value || state.seed || randomSeed());
    } else if (["1", "2", "3", "4"].includes(event.key)) {
      state.speed = SPEEDS[Number(event.key) - 1];
    }
  });

  populateMatchControls();
  startGame(randomSeed());
  requestAnimationFrame(loop);
})();
