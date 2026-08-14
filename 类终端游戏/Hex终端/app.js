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
  const SIZE = 11;
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const MAX_PLIES = SIZE * SIZE;
  const HEX_DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#101915",
    boardB: "#0b1110",
    cell: "#253730",
    cellDim: "#1a2925",
    grid: "#7b9188",
    gridDim: "#30433c",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    redStone: "#ff4e59",
    redAlt: "#ffb067",
    blueStone: "#f7ffff",
    blueAlt: "#6ed5ec",
    redRail: "#a93540",
    blueRail: "#2d8394",
    electric: "#fff08a",
    win: "#ff4e59",
  };

  const AI_ROSTER = [
    { name: "BRIDGE", connect: 18, block: 9, cluster: 2.4, center: 1.0, edge: 0.6, noise: 0.45, source: "connection heuristic" },
    { name: "CURRENT", connect: 13, block: 15, cluster: 1.5, center: 0.8, edge: 0.7, noise: 0.8, source: "blocking heuristic" },
    { name: "LATTICE", connect: 12, block: 10, cluster: 3.2, center: 1.25, edge: 0.3, noise: 0.65, source: "shape heuristic" },
    { name: "ANCHOR", connect: 15, block: 8, cluster: 1.2, center: 0.4, edge: 2.2, noise: 0.55, source: "edge heuristic" },
    { name: "STATIC", connect: 11, block: 11, cluster: 1.0, center: 1.8, edge: 0.5, noise: 1.45, source: "volatile heuristic" },
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
    boardBox: { x: 4, y: 7, w: 82, h: 49 },
    hex: { x: 11.2, y: 12.4, dx: 4.7, skew: 2.38, dy: 3.25, rx: 5.2, ry: 6.0 },
  };

  const state = {
    seed: "",
    rng: null,
    board: [],
    players: null,
    toMove: 1,
    moves: [],
    moveLog: [],
    fragments: [],
    ripples: [],
    active: null,
    winPath: null,
    winner: 0,
    result: "",
    nextMoveAt: 0,
    lastFrame: 0,
    lastWinEmit: 0,
    speed: 1,
    paused: false,
    matchMode: "ai-vs-ai",
    humanSide: "red",
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

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function hash(n) {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
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
        '<option value="red">HUMAN RED</option>',
        '<option value="blue">HUMAN BLUE</option>',
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
    const red = { ...pick(state.rng, AI_ROSTER) };
    const blue = { ...pick(state.rng, AI_ROSTER) };
    if (state.matchMode === "human-vs-human") {
      return { red: { name: "HUMAN", source: "local" }, blue: { name: "HUMAN", source: "local" } };
    }
    if (state.matchMode === "human-vs-ai") {
      const ai = selectedAIPlayer();
      return state.humanSide === "red"
        ? { red: { name: "HUMAN", source: "local" }, blue: ai }
        : { red: ai, blue: { name: "HUMAN", source: "local" } };
    }
    return { red, blue };
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

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function startGame(seed) {
    state.seed = normalizeSeed(seed || randomSeed());
    seedInput.value = state.seed.trimEnd();
    state.rng = makeRng(`${state.seed}|hex-terminal`);
    state.matchMode = playModeSelect?.value || "ai-vs-ai";
    state.humanSide = humanSideSelect?.value || "red";
    state.selectedAI = aiSelect?.value || AI_ROSTER[0].name;
    state.board = blankBoard();
    state.players = setupPlayers();
    state.toMove = 1;
    state.moves = [];
    state.moveLog = [];
    state.fragments = [];
    state.ripples = [];
    state.active = null;
    state.winPath = null;
    state.winner = 0;
    state.result = "";
    state.paused = false;
    state.nextMoveAt = 0;
    state.lastFrame = 0;
    state.lastWinEmit = 0;
    state.speed = 1;
    scheduleNextTurn(performance.now(), 520);
  }

  function sideName(side) {
    return side === 1 ? "red" : "blue";
  }

  function sideTitle(side) {
    return sideName(side).toUpperCase();
  }

  function otherSide(side) {
    return side === 1 ? 2 : 1;
  }

  function sideColor(side) {
    return side === 1 ? color.redStone : color.blueStone;
  }

  function sideAltColor(side) {
    return side === 1 ? color.redAlt : color.blueAlt;
  }

  function sideEffectColor(side) {
    return side === 1 ? color.redStone : color.blueAlt;
  }

  function sideRailColor(side) {
    return side === 1 ? color.redRail : color.blueRail;
  }

  function sidePlayer(side) {
    return side === 1 ? state.players?.red : state.players?.blue;
  }

  function inBounds(q, r) {
    return q >= 0 && r >= 0 && q < SIZE && r < SIZE;
  }

  function hexCenter(q, r) {
    const h = layout.hex;
    return {
      x: h.x + q * h.dx + r * h.skew,
      y: h.y + r * h.dy,
    };
  }

  function coordinate(q, r) {
    return `${String.fromCharCode(65 + q)}${r + 1}`;
  }

  function legalMoves(board = state.board) {
    const moves = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let q = 0; q < SIZE; q += 1) {
        if (!board[r][q]) moves.push({ q, r, side: state.toMove });
      }
    }
    return moves;
  }

  function pieceCounts(board = state.board) {
    let red = 0;
    let blue = 0;
    for (let r = 0; r < SIZE; r += 1) {
      for (let q = 0; q < SIZE; q += 1) {
        if (board[r][q] === 1) red += 1;
        if (board[r][q] === 2) blue += 1;
      }
    }
    return { red, blue };
  }

  function connectionDistance(board, side) {
    const dist = Array.from({ length: SIZE }, () => Array(SIZE).fill(Infinity));
    const open = [];
    const push = (q, r, value) => {
      if (value >= dist[r][q]) return;
      dist[r][q] = value;
      open.push({ q, r, value });
    };
    const cellCost = (q, r) => {
      const cell = board[r][q];
      if (cell === side) return 0;
      if (!cell) return 1;
      return 7;
    };

    for (let i = 0; i < SIZE; i += 1) {
      if (side === 1) push(0, i, cellCost(0, i));
      else push(i, 0, cellCost(i, 0));
    }

    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (open[i].value < open[bestIndex].value) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      if (current.value !== dist[current.r][current.q]) continue;
      if ((side === 1 && current.q === SIZE - 1) || (side === 2 && current.r === SIZE - 1)) return current.value;
      for (const [dq, dr] of HEX_DIRS) {
        const nq = current.q + dq;
        const nr = current.r + dr;
        if (inBounds(nq, nr)) push(nq, nr, current.value + cellCost(nq, nr));
      }
    }
    return 99;
  }

  function winningPath(board, side) {
    const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const parent = new Map();
    const queue = [];
    const key = (q, r) => `${q},${r}`;

    for (let i = 0; i < SIZE; i += 1) {
      const q = side === 1 ? 0 : i;
      const r = side === 1 ? i : 0;
      if (board[r][q] !== side) continue;
      visited[r][q] = true;
      parent.set(key(q, r), null);
      queue.push({ q, r });
    }

    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if ((side === 1 && current.q === SIZE - 1) || (side === 2 && current.r === SIZE - 1)) {
        const path = [];
        let cursor = current;
        while (cursor) {
          path.push(cursor);
          cursor = parent.get(key(cursor.q, cursor.r));
        }
        return path.reverse();
      }
      for (const [dq, dr] of HEX_DIRS) {
        const nq = current.q + dq;
        const nr = current.r + dr;
        if (!inBounds(nq, nr) || visited[nr][nq] || board[nr][nq] !== side) continue;
        visited[nr][nq] = true;
        parent.set(key(nq, nr), current);
        queue.push({ q: nq, r: nr });
      }
    }
    return null;
  }

  function neighborBalance(board, q, r, side) {
    let own = 0;
    let opp = 0;
    for (const [dq, dr] of HEX_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (!inBounds(nq, nr)) continue;
      if (board[nr][nq] === side) own += 1;
      if (board[nr][nq] === otherSide(side)) opp += 1;
    }
    return own - opp * 0.45;
  }

  function centerScore(q, r) {
    const mid = (SIZE - 1) / 2;
    return SIZE - Math.sqrt((q - mid) * (q - mid) + (r - mid) * (r - mid));
  }

  function edgeScore(q, r, side) {
    if (side === 1) return (q === 0 || q === SIZE - 1 ? 2.8 : 0) + (Math.abs(r - (SIZE - 1) / 2) < 3 ? 0.6 : 0);
    return (r === 0 || r === SIZE - 1 ? 2.8 : 0) + (Math.abs(q - (SIZE - 1) / 2) < 3 ? 0.6 : 0);
  }

  function scoreMove(move, player) {
    const side = move.side;
    const board = cloneBoard(state.board);
    board[move.r][move.q] = side;
    if (winningPath(board, side)) return 100000 + state.rng() * 10;

    const ownBefore = connectionDistance(state.board, side);
    const oppBefore = connectionDistance(state.board, otherSide(side));
    const ownAfter = connectionDistance(board, side);
    const oppAfter = connectionDistance(board, otherSide(side));
    const connectGain = ownBefore - ownAfter;
    const blockGain = oppAfter - oppBefore;
    return (
      connectGain * player.connect +
      blockGain * player.block +
      neighborBalance(board, move.q, move.r, side) * player.cluster +
      centerScore(move.q, move.r) * player.center +
      edgeScore(move.q, move.r, side) * player.edge +
      state.rng() * player.noise
    );
  }

  function chooseAIMove() {
    const player = sidePlayer(state.toMove);
    const moves = legalMoves().map((move) => ({ ...move, score: scoreMove(move, player) }));
    moves.sort((a, b) => b.score - a.score);
    return moves[0] || null;
  }

  function beginAIMove(now) {
    if (state.paused || state.active || state.winner || isHumanTurn()) return;
    beginMove(chooseAIMove(), now);
  }

  function beginMove(move, now) {
    if (!move) {
      finishGame(0, "DRAW FULL BOARD");
      return;
    }
    state.active = {
      move,
      start: now,
      duration: (reducedMotion ? 110 : 250) / state.speed,
      lastTrail: now,
    };
    rippleChar(hexCenter(move.q, move.r), move.side, 0.62, now, 520);
  }

  function finishActiveMove(now) {
    const active = state.active;
    if (!active) return;
    const move = active.move;
    state.board[move.r][move.q] = move.side;
    const origin = hexCenter(move.q, move.r);
    shockChar(origin, move.side, reducedMotion ? 12 : 38, reducedMotion ? 0.75 : 1.15, now);
    rippleChar(origin, move.side, 0.9, now, reducedMotion ? 460 : 720);
    state.moves.push(move);
    state.moveLog.push({
      ply: state.moves.length,
      side: move.side,
      coord: coordinate(move.q, move.r),
      dist: connectionDistance(state.board, move.side),
    });

    const path = winningPath(state.board, move.side);
    if (path) {
      state.winPath = path;
      finishGame(move.side, `${sideTitle(move.side)} CONNECTS`);
      emitWinCurrent(now, true);
      state.active = null;
      return;
    }

    if (state.moves.length >= MAX_PLIES) {
      finishGame(0, "DRAW FULL BOARD");
      state.active = null;
      return;
    }

    state.toMove = otherSide(move.side);
    state.active = null;
    scheduleNextTurn(now, reducedMotion ? 260 : 420);
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
    let best = null;
    let bestDist = Infinity;
    for (let r = 0; r < SIZE; r += 1) {
      for (let q = 0; q < SIZE; q += 1) {
        const c = hexCenter(q, r);
        const dist = (tx - c.x) ** 2 + ((ty - c.y) / 0.72) ** 2;
        if (dist < bestDist) {
          best = { q, r };
          bestDist = dist;
        }
      }
    }
    return bestDist <= 16 ? best : null;
  }

  function handleHumanClick(event) {
    if (!isHumanTurn() || state.paused || state.active || state.winner) return;
    const cell = cellFromPointer(event);
    if (!cell || state.board[cell.r][cell.q]) return;
    beginMove({ q: cell.q, r: cell.r, side: state.toMove }, performance.now());
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
    for (let i = 0; i < text.length; i += 1) setCell(x + i, y, text[i], fg, bg);
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
      setCell(xx, y, "-", color.gridDim, color.ink2);
      setCell(xx, y + h - 1, "-", color.gridDim, color.ink2);
    }
    for (let yy = y; yy < y + h; yy += 1) {
      setCell(x, yy, "|", color.gridDim, color.ink2);
      setCell(x + w - 1, yy, "|", color.gridDim, color.ink2);
    }
    setCell(x, y, "+", color.gridDim, color.ink2);
    setCell(x + w - 1, y, "+", color.gridDim, color.ink2);
    setCell(x, y + h - 1, "+", color.gridDim, color.ink2);
    setCell(x + w - 1, y + h - 1, "+", color.gridDim, color.ink2);
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
    dotLayer.mask[i] |= brailleBit(Math.round(sx), Math.round(sy));
    if (power >= dotLayer.power[i]) {
      dotLayer.power[i] = power;
      dotLayer.fg[i] = fg;
    }
  }

  function putEffectDot(sx, sy, fg, power = 1) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    const box = layout.boardBox;
    if (sx < (box.x - 1) * DOT_W || sy < (box.y - 1) * DOT_H) return;
    if (sx >= (box.x + box.w + 1) * DOT_W || sy >= (box.y + box.h + 1) * DOT_H) return;
    putDotSub(sx, sy, fg, power);
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

  function drawStaticFrame() {
    fillRect(0, 0, COLS, ROWS, color.ink);
    fillRect(layout.left.x, layout.left.y, layout.left.w, layout.left.h, color.ink2);
    fillRect(layout.right.x, layout.right.y, layout.right.w, layout.right.h, color.panel);
    drawBox(layout.left, "HEX TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE HEX / 11x11 CONNECTION", color.header);
    writeText(4, 4, "RED WEST-EAST / BLUE NORTH-SOUTH / NO DRAWS", color.dim);
    writeText(4, 56, "1 0.5x  2 1x  3 2x  4 4x  SPACE pause  R reroll  P play", color.dim);
  }

  function drawBoardBackground() {
    const box = layout.boardBox;
    fillRect(box.x, box.y, box.w, box.h, color.boardA);
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const staticNoise = (x * 23 + y * 31 + x * y * 5) % 67;
        if (staticNoise <= 2) screen.bg[idx(x, y)] = color.boardB;
      }
    }
    drawConnectionRails();
    for (let r = 0; r < SIZE; r += 1) {
      for (let q = 0; q < SIZE; q += 1) drawHexCell(q, r);
    }
    drawCoordinates();
  }

  function drawCoordinates() {
    for (let i = 0; i < SIZE; i += 1) {
      const top = hexCenter(i, 0);
      const left = hexCenter(0, i);
      const bottom = hexCenter(i, SIZE - 1);
      writeText(Math.round(top.x), Math.max(6, Math.round(top.y - 4)), String.fromCharCode(65 + i), color.dim);
      writeText(Math.round(bottom.x), Math.min(54, Math.round(bottom.y + 3)), String.fromCharCode(65 + i), color.dim);
      writeText(Math.max(2, Math.round(left.x - 5)), Math.round(left.y), String(i + 1).padStart(2, " "), color.dim);
    }
  }

  function drawConnectionRails() {
    const redTop = hexCenter(0, 0);
    const redBottom = hexCenter(0, SIZE - 1);
    const redTopRight = hexCenter(SIZE - 1, 0);
    const redBottomRight = hexCenter(SIZE - 1, SIZE - 1);
    const blueTopLeft = hexCenter(0, 0);
    const blueTopRight = hexCenter(SIZE - 1, 0);
    const blueBottomLeft = hexCenter(0, SIZE - 1);
    const blueBottomRight = hexCenter(SIZE - 1, SIZE - 1);

    drawDotLine(redTop.x - 3, redTop.y, redBottom.x - 3, redBottom.y, color.redRail, 0.34, 2);
    drawDotLine(redTopRight.x + 3, redTopRight.y, redBottomRight.x + 3, redBottomRight.y, color.redRail, 0.34, 2);
    drawDotLine(blueTopLeft.x, blueTopLeft.y - 2.4, blueTopRight.x, blueTopRight.y - 2.4, color.blueRail, 0.34, 2);
    drawDotLine(blueBottomLeft.x, blueBottomLeft.y + 2.4, blueBottomRight.x, blueBottomRight.y + 2.4, color.blueRail, 0.34, 2);
  }

  function hexVertices(pos, rx = layout.hex.rx, ry = layout.hex.ry) {
    const cx = pos.x * DOT_W;
    const cy = pos.y * DOT_H;
    return [
      { x: cx - rx * 0.52, y: cy - ry },
      { x: cx + rx * 0.52, y: cy - ry },
      { x: cx + rx, y: cy },
      { x: cx + rx * 0.52, y: cy + ry },
      { x: cx - rx * 0.52, y: cy + ry },
      { x: cx - rx, y: cy },
    ];
  }

  function drawDotLine(x1, y1, x2, y2, fg, power = 1, step = 1) {
    const sx1 = x1 * DOT_W;
    const sy1 = y1 * DOT_H;
    const sx2 = x2 * DOT_W;
    const sy2 = y2 * DOT_H;
    const len = Math.max(Math.abs(sx2 - sx1), Math.abs(sy2 - sy1));
    const count = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      putDotSub(lerp(sx1, sx2, t), lerp(sy1, sy2, t), fg, power);
    }
  }

  function drawSubLine(a, b, fg, power = 1, step = 1) {
    const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    const count = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      putDotSub(lerp(a.x, b.x, t), lerp(a.y, b.y, t), fg, power);
    }
  }

  function insideHex(dx, dy, rx, ry) {
    const ny = Math.abs(dy / ry);
    if (ny > 1) return false;
    const half = rx * (1 - 0.48 * ny);
    return Math.abs(dx) <= half;
  }

  function drawHexCell(q, r) {
    const pos = hexCenter(q, r);
    const cx = Math.round(pos.x * DOT_W);
    const cy = Math.round(pos.y * DOT_H);
    const h = layout.hex;
    const edge = q === 0 || q === SIZE - 1 ? 1 : r === 0 || r === SIZE - 1 ? 2 : 0;
    const edgeColor = edge ? sideRailColor(edge) : color.gridDim;
    for (let sy = -Math.ceil(h.ry); sy <= Math.ceil(h.ry); sy += 1) {
      for (let sx = -Math.ceil(h.rx); sx <= Math.ceil(h.rx); sx += 1) {
        if (!insideHex(sx, sy, h.rx - 0.6, h.ry - 0.6)) continue;
        const density = (sx * 7 + sy * 11 + q * 13 + r * 17) % 11;
        if (density < (edge ? 4 : 3)) putDotSub(cx + sx, cy + sy, edge ? edgeColor : color.gridDim, edge ? 0.22 : 0.16);
      }
    }
    const vertices = hexVertices(pos);
    for (let i = 0; i < vertices.length; i += 1) {
      drawSubLine(vertices[i], vertices[(i + 1) % vertices.length], edgeColor, edge ? 0.64 : 0.32, 1.15);
    }
  }

  function drawPieces(now) {
    for (let r = 0; r < SIZE; r += 1) {
      for (let q = 0; q < SIZE; q += 1) {
        const side = state.board[r][q];
        if (side) drawStone(hexCenter(q, r), side, { scale: 1, fade: 1 });
      }
    }
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      const pulse = 0.58 + smooth(t) * 0.42 + Math.sin(t * Math.PI) * 0.1;
      drawStone(hexCenter(state.active.move.q, state.active.move.r), state.active.move.side, { scale: pulse, fade: 0.65 + t * 0.35 });
    }
  }

  function drawStone(pos, side, options = {}) {
    const sx0 = Math.round(pos.x * DOT_W);
    const sy0 = Math.round(pos.y * DOT_H);
    const scale = options.scale ?? 1;
    const fade = options.fade ?? 1;
    const rx = 4.3 * scale;
    const ry = 4.9 * scale;
    const main = sideColor(side);
    const alt = sideAltColor(side);
    for (let sy = -Math.ceil(ry); sy <= Math.ceil(ry); sy += 1) {
      for (let sx = -Math.ceil(rx); sx <= Math.ceil(rx); sx += 1) {
        if (!insideHex(sx, sy, rx, ry)) continue;
        const d = Math.max(Math.abs(sx) / rx, Math.abs(sy) / ry);
        const sparkle = hash(sx0 * 17 + sy0 * 19 + sx * 23 + sy * 29);
        if (d < 0.72 && sparkle > 0.92) continue;
        const rim = d > 0.7;
        putDotSub(sx0 + sx, sy0 + sy, rim || sparkle > 0.62 ? alt : main, (rim ? 0.92 : 1.08) * fade);
      }
    }
  }

  function drawLegalHints(now) {
    if (state.active || state.winner) return;
    const phase = reducedMotion ? 0.24 : 0.2 + Math.sin(now / 320) * 0.07;
    const moves = legalMoves();
    for (const move of moves) {
      const pos = hexCenter(move.q, move.r);
      const sx = Math.round(pos.x * DOT_W);
      const sy = Math.round(pos.y * DOT_H);
      if ((move.q + move.r + Math.floor(now / 700)) % 6 !== 0) continue;
      putDotSub(sx, sy, color.grid, phase);
      putDotSub(sx + 1, sy, color.grid, phase);
    }
  }

  function drawTerminalEffects(now) {
    for (const r of state.ripples) {
      const age = (now - r.born) / r.life;
      const radius = lerp(1.2, 8.8 * r.strength, smooth(age));
      const thickness = lerp(0.8, 0.24, age);
      const cx = r.x * DOT_W;
      const cy = r.y * DOT_H;
      const fg = sideEffectColor(r.side);
      for (let sy = Math.floor(cy - radius * DOT_H * 0.6); sy <= Math.ceil(cy + radius * DOT_H * 0.6); sy += 1) {
        for (let sx = Math.floor(cx - radius * DOT_W); sx <= Math.ceil(cx + radius * DOT_W); sx += 1) {
          const dx = (sx - cx) / DOT_W;
          const dy = ((sy - cy) / DOT_H) / 0.6;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - radius) > thickness) continue;
          if (hash(sx * 7 + sy * 17 + Math.floor(age * 29)) > 0.74 - age * 0.34) continue;
          putEffectDot(sx, sy, fg, clamp((1 - age) * 0.74, 0.12, 0.86));
        }
      }
    }

    state.fragments.forEach((g, i) => {
      const age = (now - g.born) / g.life;
      const fg = g.kind === "win" ? color.electric : sideEffectColor(g.side);
      const radius = g.kind === "trail" ? 3 : 1;
      const cx = Math.round(g.x * DOT_W);
      const cy = Math.round(g.y * DOT_H);
      for (let sy = -radius; sy <= radius; sy += 1) {
        for (let sx = -radius; sx <= radius; sx += 1) {
          const d = Math.sqrt(sx * sx + sy * sy);
          if (d > radius + 0.2) continue;
          if (hash(i * 31 + sx * 11 + sy * 19 + Math.floor(age * 23)) > 0.82 - age * 0.26) continue;
          putEffectDot(cx + sx, cy + sy, fg, clamp((1 - age) * (g.kind === "trail" ? 0.42 : 0.82), 0.1, 1.05));
        }
      }
    });

    if (state.winPath) drawWinCurrent(now);
  }

  function drawWinCurrent(now) {
    const path = state.winPath;
    const side = state.winner || state.winPathSide || 1;
    const fg = side === 1 ? color.redStone : color.blueAlt;
    const pulse = reducedMotion ? 0.6 : 0.52 + Math.sin(now / 90) * 0.25;
    const points = path.map((p) => hexCenter(p.q, p.r));
    for (let i = 0; i < points.length - 1; i += 1) {
      drawCurrentSegment(points[i], points[i + 1], fg, pulse, now + i * 47);
      drawCurrentSegment(points[i], points[i + 1], color.electric, pulse * 0.72, now + i * 59, 2.4);
    }
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const sx = Math.round(p.x * DOT_W);
      const sy = Math.round(p.y * DOT_H);
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2 + now / 180;
        const radius = 4 + Math.sin(now / 110 + i) * 1.4;
        if ((k + i + Math.floor(now / 80)) % 2 === 0) putEffectDot(sx + Math.cos(a) * radius, sy + Math.sin(a) * radius * 0.72, color.electric, 1.18);
      }
    }
  }

  function drawCurrentSegment(a, b, fg, power, now, jitter = 1.2) {
    const sx1 = a.x * DOT_W;
    const sy1 = a.y * DOT_H;
    const sx2 = b.x * DOT_W;
    const sy2 = b.y * DOT_H;
    const len = Math.max(Math.abs(sx2 - sx1), Math.abs(sy2 - sy1));
    const steps = Math.max(1, Math.ceil(len / 0.8));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if ((i + Math.floor(now / 24)) % 3 === 0) continue;
      const dx = (hash(i * 17 + now) - 0.5) * jitter;
      const dy = (hash(i * 29 + now) - 0.5) * jitter;
      putEffectDot(lerp(sx1, sx2, t) + dx, lerp(sy1, sy2, t) + dy, fg, power + hash(i + now) * 0.45);
    }
  }

  function rippleChar(origin, side, strength, now = performance.now(), life = 620) {
    state.ripples.push({ x: origin.x, y: origin.y, side, strength, born: now, life });
  }

  function shockChar(origin, side, count, speed = 1, now = performance.now(), kind = "shock") {
    for (let i = 0; i < count; i += 1) {
      const a = hash(now + i * 17) * Math.PI * 2;
      const v = (0.24 + hash(i * 41 + now) * 0.92) * speed;
      state.fragments.push({
        x: origin.x + (hash(i) - 0.5) * 3.5,
        y: origin.y + (hash(i * 3) - 0.5) * 2.8,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.68,
        born: now,
        life: 380 + hash(i * 9) * 500,
        side,
        kind,
      });
    }
  }

  function trailChar(origin, side, now = performance.now()) {
    for (let i = 0; i < 9; i += 1) {
      state.fragments.push({
        x: origin.x + (hash(i + now) - 0.5) * 5,
        y: origin.y + (hash(i * 5 + now) - 0.5) * 3.5,
        vx: (hash(i * 2 + now) - 0.5) * 0.26,
        vy: (hash(i * 7 + now) - 0.5) * 0.18,
        born: now,
        life: 220 + hash(i * 11) * 260,
        side,
        kind: "trail",
      });
    }
  }

  function emitWinCurrent(now, strong) {
    if (!state.winPath) return;
    for (const p of state.winPath) {
      if (!strong && (p.q + p.r + Math.floor(now / 500)) % 3 !== 0) continue;
      shockChar(hexCenter(p.q, p.r), state.winner, strong ? 16 : 5, strong ? 1.15 : 0.58, now, "win");
    }
  }

  function update(now, dt) {
    if (state.paused) return;
    const frameScale = dt / 16.67;
    if (!state.active && !state.winner && !isHumanTurn() && now >= state.nextMoveAt) beginAIMove(now);
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      const pos = hexCenter(state.active.move.q, state.active.move.r);
      if (now - state.active.lastTrail > 48 && !reducedMotion) {
        trailChar(pos, state.active.move.side, now);
        state.active.lastTrail = now;
      }
      if (t >= 1) finishActiveMove(now);
    }
    state.fragments = state.fragments.filter((g) => {
      g.x += g.vx * frameScale;
      g.y += g.vy * frameScale;
      g.vx *= 0.946;
      g.vy *= 0.946;
      return now - g.born < g.life;
    });
    state.ripples = state.ripples.filter((r) => now - r.born < r.life);
    if (state.winner && now - state.lastWinEmit > (reducedMotion ? 1100 : 560)) {
      emitWinCurrent(now, false);
      state.lastWinEmit = now;
    }
  }

  function drawPanel(now) {
    const r = layout.right;
    const redName = state.players?.red.name || "SELECTING";
    const blueName = state.players?.blue.name || "SELECTING";
    const toMove = state.winner ? "DONE" : sideTitle(state.toMove);
    const counts = pieceCounts();
    const redDist = connectionDistance(state.board, 1);
    const blueDist = connectionDistance(state.board, 2);

    writeText(r.x + 3, r.y + 3, "RULESET", color.header);
    writeText(r.x + 3, r.y + 5, "HEX CONNECTION", color.blueAlt);
    writeText(r.x + 3, r.y + 7, "RED", color.redStone);
    writeText(r.x + 12, r.y + 7, redName.padEnd(16).slice(0, 16), color.redAlt);
    writeText(r.x + 3, r.y + 8, "BLUE", color.blueAlt);
    writeText(r.x + 12, r.y + 8, blueName.padEnd(16).slice(0, 16), color.blueStone);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, state.toMove === 1 ? color.redStone : color.blueAlt);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "CONNECTION", color.header);
    writeText(r.x + 3, r.y + 17, `RED  W-E  dist ${String(redDist).padStart(2, " ")}`, color.redStone);
    writeText(r.x + 3, r.y + 18, `BLUE N-S  dist ${String(blueDist).padStart(2, " ")}`, color.blueAlt);
    writeText(r.x + 3, r.y + 20, `stones R${String(counts.red).padStart(2, " ")} / B${String(counts.blue).padStart(2, " ")}`, color.muted);

    writeText(r.x + 3, r.y + 23, "TACTICS", color.header);
    writeText(r.x + 3, r.y + 25, `${String(legalMoves().length).padStart(3, " ")} open cells`, color.muted);
    if (state.active) {
      writeText(r.x + 3, r.y + 26, `${state.active.move.side === 1 ? "RED " : "BLUE"}${coordinate(state.active.move.q, state.active.move.r)}`.slice(0, 31), sideAltColor(state.active.move.side));
    } else {
      writeText(r.x + 3, r.y + 26, state.winner ? "current locked" : "mapping shortest path", state.winner ? color.electric : color.dim);
    }

    writeText(r.x + 3, r.y + 29, "MOVES", color.header);
    const recent = state.moveLog.slice(-15);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const fg = move.side === 1 ? color.redStone : color.blueAlt;
      writeText(r.x + 3, r.y + 31 + i, `${String(move.ply).padStart(3, "0")} ${sideTitle(move.side)[0]} ${move.coord} D${move.dist}`.slice(0, 31), fg);
    }

    if (state.winner || state.result) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), state.winner ? color.electric : color.dim);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.win);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} tracing virtual bridges`, color.dim);
    }
  }

  function draw(now) {
    clearScreen();
    drawStaticFrame();
    drawBoardBackground();
    drawLegalHints(now);
    drawTerminalEffects(now);
    drawPieces(now);
    flushDotLayer(layout.left);
    drawPanel(now);
    renderTerminal();
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

  function loop(now) {
    const dt = state.lastFrame ? Math.min(66, now - state.lastFrame) : 16.67;
    state.lastFrame = now;
    update(now, dt);
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
    canvas.style.cursor = isHumanTurn() && cell && !state.board[cell.r][cell.q] ? "pointer" : "default";
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
