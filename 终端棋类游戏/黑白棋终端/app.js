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
  const SIZE = 8;
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const MAX_PLIES = 120;
  const DIRS = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#111b17",
    boardB: "#0d1512",
    grid: "#75877f",
    gridDim: "#2e3a35",
    hint: "#49aebd",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    blackStone: "#f0a245",
    blackAlt: "#ffd06f",
    whiteStone: "#f7ffff",
    whiteAlt: "#aaf6ff",
    blue: "#6ed5ec",
    red: "#ff4e59",
    win: "#ff4e59",
  };

  const AI_ROSTER = [
    { name: "CORNERS", corners: 1.55, mobility: 0.75, flips: 0.72, parity: 0.5, noise: 0.55, source: "positional heuristic" },
    { name: "MOBILITY", corners: 0.95, mobility: 1.55, flips: 0.55, parity: 0.7, noise: 0.85, source: "mobility heuristic" },
    { name: "SWEEPER", corners: 0.8, mobility: 0.8, flips: 1.42, parity: 0.35, noise: 1.1, source: "flip heuristic" },
    { name: "ANCHOR", corners: 1.25, mobility: 1.05, flips: 0.85, parity: 0.8, noise: 0.35, source: "balanced heuristic" },
    { name: "ECLIPSE", corners: 1.1, mobility: 1.15, flips: 1.05, parity: 1.1, noise: 1.45, source: "volatile heuristic" },
  ];

  const WEIGHT = [
    [120, -24, 18, 8, 8, 18, -24, 120],
    [-24, -42, -8, -6, -6, -8, -42, -24],
    [18, -8, 15, 4, 4, 15, -8, 18],
    [8, -6, 4, 2, 2, 4, -6, 8],
    [8, -6, 4, 2, 2, 4, -6, 8],
    [18, -8, 15, 4, 4, 15, -8, 18],
    [-24, -42, -8, -6, -6, -8, -42, -24],
    [120, -24, 18, 8, 8, 18, -24, 120],
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
    boardBox: { x: 9, y: 7, w: 72, h: 45 },
    board: { x: 13, y: 8, cellW: 8, cellH: 5 },
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
    flipMarks: [],
    winner: 0,
    result: "",
    nextMoveAt: 0,
    lastFrame: 0,
    lastWinEmit: 0,
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
    const noLegalMove = state.board.length && !legalMoves(state.board, state.toMove).length;
    state.nextMoveAt = isHumanTurn() && !noLegalMove ? Infinity : now + delay / state.speed;
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
    state.rng = makeRng(`${state.seed}|reversi`);
    state.matchMode = playModeSelect?.value || "ai-vs-ai";
    state.humanSide = humanSideSelect?.value || "black";
    state.selectedAI = aiSelect?.value || AI_ROSTER[0].name;
    state.board = blankBoard();
    state.board[3][3] = 2;
    state.board[4][4] = 2;
    state.board[3][4] = 1;
    state.board[4][3] = 1;
    state.players = setupPlayers();
    state.toMove = 1;
    state.moves = [];
    state.moveLog = [];
    state.fragments = [];
    state.ripples = [];
    state.active = null;
    state.flipMarks = [];
    state.winner = 0;
    state.result = "";
    state.paused = false;
    state.nextMoveAt = 0;
    state.lastFrame = 0;
    state.lastWinEmit = 0;
    state.speed = 1;
    scheduleNextTurn(performance.now(), 520);
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  }

  function sideName(side) {
    return side === 1 ? "black" : "white";
  }

  function sideTitle(side) {
    return sideName(side).toUpperCase();
  }

  function otherSide(side) {
    return side === 1 ? 2 : 1;
  }

  function sideColor(side) {
    return side === 1 ? color.blackStone : color.whiteStone;
  }

  function sideAltColor(side) {
    return side === 1 ? color.blackAlt : color.whiteAlt;
  }

  function sideEffectColor(side) {
    return side === 1 ? color.red : color.blue;
  }

  function sidePlayer(side) {
    return side === 1 ? state.players?.black : state.players?.white;
  }

  function centerOfCell(x, y) {
    return {
      x: layout.board.x + x * layout.board.cellW + layout.board.cellW / 2,
      y: layout.board.y + y * layout.board.cellH + layout.board.cellH / 2,
    };
  }

  function flipsForMove(board, x, y, side) {
    if (!inBounds(x, y) || board[y][x]) return [];
    const opponent = otherSide(side);
    const flips = [];
    for (const [dx, dy] of DIRS) {
      const line = [];
      let cx = x + dx;
      let cy = y + dy;
      while (inBounds(cx, cy) && board[cy][cx] === opponent) {
        line.push({ x: cx, y: cy });
        cx += dx;
        cy += dy;
      }
      if (line.length && inBounds(cx, cy) && board[cy][cx] === side) flips.push(...line);
    }
    return flips;
  }

  function legalMoves(board, side) {
    const moves = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const flips = flipsForMove(board, x, y, side);
        if (flips.length) moves.push({ x, y, side, flips });
      }
    }
    return moves;
  }

  function applyMove(board, move) {
    const next = cloneBoard(board);
    next[move.y][move.x] = move.side;
    for (const flip of move.flips) next[flip.y][flip.x] = move.side;
    return next;
  }

  function countPieces(board = state.board) {
    let black = 0;
    let white = 0;
    let empty = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === 1) black += 1;
        else if (cell === 2) white += 1;
        else empty += 1;
      }
    }
    return { black, white, empty };
  }

  function positionalScore(board, side) {
    let total = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (board[y][x] === side) total += WEIGHT[y][x];
        else if (board[y][x] === otherSide(side)) total -= WEIGHT[y][x];
      }
    }
    return total;
  }

  function scoreMove(move) {
    const player = sidePlayer(move.side);
    const next = applyMove(state.board, move);
    const opponent = otherSide(move.side);
    const myMobility = legalMoves(next, move.side).length;
    const oppMobility = legalMoves(next, opponent).length;
    const counts = countPieces(next);
    const myPieces = move.side === 1 ? counts.black : counts.white;
    const oppPieces = move.side === 1 ? counts.white : counts.black;
    const corners = [
      next[0][0],
      next[0][7],
      next[7][0],
      next[7][7],
    ].reduce((sum, cell) => sum + (cell === move.side ? 1 : cell === opponent ? -1 : 0), 0);
    let score = positionalScore(next, move.side);
    score += move.flips.length * 8 * player.flips;
    score += (myMobility - oppMobility) * 12 * player.mobility;
    score += corners * 65 * player.corners;
    score += (myPieces - oppPieces) * player.parity * (counts.empty < 18 ? 3.8 : 0.8);
    score += state.rng() * 7 * player.noise;
    return score;
  }

  function chooseMove() {
    const moves = legalMoves(state.board, state.toMove);
    if (!moves.length) return null;
    const scored = moves.map((move) => ({ ...move, score: scoreMove(move) })).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(6, scored.length));
    return top[Math.floor(Math.pow(state.rng(), 1.6) * top.length)];
  }

  function coordinate(x, y) {
    return `${"ABCDEFGH"[x]}${8 - y}`;
  }

  function beginAIMove(now) {
    if (state.paused || state.active || state.winner || isHumanTurn()) return;
    beginMove(chooseMove(), now);
  }

  function beginMove(move, now) {
    if (!move) {
      handlePass(now);
      return;
    }
    state.active = {
      move,
      start: now,
      duration: reducedMotion ? 130 : 420 / state.speed,
      lastTrail: now,
    };
    rippleChar(centerOfCell(move.x, move.y), move.side, 0.9, now);
  }

  function handlePass(now) {
    const side = state.toMove;
    const opponent = otherSide(side);
    if (!legalMoves(state.board, opponent).length) {
      finishByScore();
      return;
    }
    state.moveLog.push({ ply: state.moves.length + 1, side, coord: "--", kind: "PASS" });
    state.moves.push({ side, pass: true });
    state.toMove = opponent;
    scheduleNextTurn(now, 420);
  }

  function finishActiveMove(now) {
    const active = state.active;
    if (!active) return;
    const move = active.move;
    state.board[move.y][move.x] = move.side;
    for (const flip of move.flips) state.board[flip.y][flip.x] = move.side;
    state.flipMarks.push(...move.flips.map((flip) => ({ ...flip, side: move.side, at: now })));
    state.moves.push(move);
    state.moveLog.push({
      ply: state.moves.length,
      side: move.side,
      coord: coordinate(move.x, move.y),
      kind: `FLIP x${move.flips.length}`,
    });
    rippleChar(centerOfCell(move.x, move.y), move.side, 1.05, now);
    shatterChar(centerOfCell(move.x, move.y), move.side, reducedMotion ? 6 : 24, 0.82, now);
    for (const flip of move.flips) {
      const p = centerOfCell(flip.x, flip.y);
      shatterChar(p, move.side, reducedMotion ? 2 : 7, 0.45, now);
      if (!reducedMotion && move.flips.length <= 12) trailChar(p, move.side, now);
    }
    state.toMove = otherSide(move.side);
    state.active = null;
    if (countPieces().empty === 0 || (!legalMoves(state.board, 1).length && !legalMoves(state.board, 2).length) || state.moves.length >= MAX_PLIES) {
      finishByScore();
    } else {
      scheduleNextTurn(now, 520);
    }
  }

  function finishByScore() {
    const counts = countPieces();
    if (counts.black > counts.white) finishGame(1, `BLACK ${counts.black}-${counts.white}`);
    else if (counts.white > counts.black) finishGame(2, `WHITE ${counts.white}-${counts.black}`);
    else finishGame(0, `DRAW ${counts.black}-${counts.white}`);
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
    const b = layout.board;
    const x = Math.floor((tx - b.x) / b.cellW);
    const y = Math.floor((ty - b.y) / b.cellH);
    return inBounds(x, y) ? { x, y } : null;
  }

  function handleHumanClick(event) {
    if (!isHumanTurn() || state.paused || state.active || state.winner) return;
    const moves = legalMoves(state.board, state.toMove);
    if (!moves.length) {
      handlePass(performance.now());
      return;
    }
    const cell = cellFromPointer(event);
    if (!cell) return;
    const move = moves.find((candidate) => candidate.x === cell.x && candidate.y === cell.y);
    if (move) beginMove(move, performance.now());
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
    drawBox(layout.left, "REVERSI TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE REVERSI / 8x8 DISC CONTROL", color.header);
    writeText(4, 4, "PLACE A DISC / FLIP LINES / SCORE THE BOARD", color.dim);
    writeText(4, 56, "1 0.5x  2 1x  3 2x  4 4x  SPACE pause  R reroll  P play", color.dim);
  }

  function drawBoardBackground() {
    const box = layout.boardBox;
    fillRect(box.x, box.y, box.w, box.h, color.boardA);
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const staticNoise = (x * 29 + y * 17 + x * y * 3) % 61;
        if (staticNoise <= 2) screen.bg[idx(x, y)] = color.boardB;
      }
    }

    const b = layout.board;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const bg = (x + y) % 2 === 0 ? "#111c17" : "#0d1713";
        fillRect(b.x + x * b.cellW, b.y + y * b.cellH, b.cellW, b.cellH, bg);
        drawCellTexture(x, y);
      }
    }

    for (let x = 0; x <= SIZE; x += 1) {
      const sx = (b.x + x * b.cellW) * DOT_W;
      for (let sy = b.y * DOT_H; sy <= (b.y + SIZE * b.cellH) * DOT_H; sy += 2) putDotSub(sx, sy, color.gridDim, 0.22);
    }
    for (let y = 0; y <= SIZE; y += 1) {
      const sy = (b.y + y * b.cellH) * DOT_H;
      for (let sx = b.x * DOT_W; sx <= (b.x + SIZE * b.cellW) * DOT_W; sx += 2) putDotSub(sx, sy, color.gridDim, 0.22);
    }

    const files = "ABCDEFGH";
    for (let i = 0; i < SIZE; i += 1) {
      writeText(b.x + i * b.cellW + Math.floor(b.cellW / 2), b.y + SIZE * b.cellH + 1, files[i], color.dim);
      writeText(Math.max(1, b.x - 4), b.y + i * b.cellH + 2, String(8 - i).padStart(2, " "), color.dim);
    }
  }

  function drawCellTexture(x, y) {
    const b = layout.board;
    const x0 = (b.x + x * b.cellW) * DOT_W;
    const y0 = (b.y + y * b.cellH) * DOT_H;
    for (let yy = 3; yy < b.cellH * DOT_H - 2; yy += 4) {
      for (let xx = 2; xx < b.cellW * DOT_W - 2; xx += 4) {
        if ((xx * 7 + yy * 11 + x * 13 + y * 17) % 5 < 2) putDotSub(x0 + xx, y0 + yy, color.gridDim, 0.12);
      }
    }
  }

  function drawLegalHints(now) {
    if (state.active || state.winner) return;
    const moves = legalMoves(state.board, state.toMove);
    const phase = reducedMotion ? 0.34 : 0.28 + Math.sin(now / 280) * 0.08;
    for (const move of moves) {
      const c = centerOfCell(move.x, move.y);
      const sx = Math.round(c.x * DOT_W);
      const sy = Math.round(c.y * DOT_H);
      putDotSub(sx, sy, color.hint, phase);
      putDotSub(sx + 1, sy, color.hint, phase);
      putDotSub(sx, sy + 1, color.hint, phase);
      putDotSub(sx + 1, sy + 1, color.hint, phase);
    }
  }

  function drawDiscs(now) {
    const activeMove = state.active?.move || null;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const side = state.board[y][x];
        if (!side) continue;
        const flip = latestFlipMark(x, y, now);
        const squeeze = flip ? 0.22 + 0.78 * Math.abs(2 * flip - 1) : 1;
        drawDisc(centerOfCell(x, y), side, { squeeze });
      }
    }
    if (activeMove) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      drawDisc(centerOfCell(activeMove.x, activeMove.y), activeMove.side, {
        scale: lerp(0.42, 1.02, smooth(t)),
        fade: 0.72 + Math.sin(t * Math.PI) * 0.28,
      });
    }
  }

  function latestFlipMark(x, y, now) {
    for (let i = state.flipMarks.length - 1; i >= 0; i -= 1) {
      const mark = state.flipMarks[i];
      if (mark.x === x && mark.y === y) return clamp((now - mark.at) / 520, 0, 1);
    }
    return 0;
  }

  function drawDisc(pos, side, options = {}) {
    const sx = Math.round(pos.x * DOT_W);
    const sy = Math.round(pos.y * DOT_H);
    const scale = options.scale ?? 1;
    const squeeze = options.squeeze ?? 1;
    const fade = options.fade ?? 1;
    const rx = 5.8 * scale * squeeze;
    const ry = 6.7 * scale;
    const main = sideColor(side);
    const alt = sideAltColor(side);
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y += 1) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x += 1) {
        const nx = x / Math.max(0.8, rx);
        const ny = y / Math.max(0.8, ry);
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1) continue;
        const rim = d > 0.68;
        const sparkle = hash(sx * 13 + sy * 17 + x * 19 + y * 31);
        if (!rim && sparkle > 0.9) continue;
        putDotSub(sx + x, sy + y, rim || sparkle > 0.58 ? alt : main, (rim ? 0.84 : 1) * fade);
      }
    }
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

  function rippleChar(origin, side, strength, now = performance.now(), life = 660) {
    state.ripples.push({ x: origin.x, y: origin.y, side, strength, born: now, life });
  }

  function shatterChar(origin, side, count, speed = 1, now = performance.now()) {
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

  function trailChar(origin, side, now = performance.now()) {
    for (let i = 0; i < 10; i += 1) {
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

  function emitWinBurst(side, now, strong) {
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (state.board[y][x] !== side) continue;
        if (!strong && (x + y + Math.floor(now / 720)) % 4 !== 0) continue;
        shatterChar(centerOfCell(x, y), side, strong ? 8 : 3, strong ? 0.82 : 0.5, now);
      }
    }
  }

  function update(now, dt) {
    if (state.paused) return;
    const frameScale = dt / 16.67;
    if (!state.active && !state.winner && isHumanTurn() && now >= state.nextMoveAt && !legalMoves(state.board, state.toMove).length) handlePass(now);
    if (!state.active && !state.winner && !isHumanTurn() && now >= state.nextMoveAt) beginAIMove(now);
    if (state.active) {
      const move = state.active.move;
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      if (now - state.active.lastTrail > 42 && !reducedMotion) {
        trailChar(centerOfCell(move.x, move.y), move.side, now);
        state.active.lastTrail = now;
      }
      if (t >= 1) finishActiveMove(now);
    }
    state.fragments = state.fragments.filter((g) => {
      g.x += g.vx * frameScale;
      g.y += g.vy * frameScale;
      g.vx *= 0.945;
      g.vy *= 0.945;
      return now - g.born < g.life;
    });
    state.ripples = state.ripples.filter((r) => now - r.born < r.life);
    state.flipMarks = state.flipMarks.filter((mark) => now - mark.at < 560);
    if (state.winner && now - state.lastWinEmit > (reducedMotion ? 1100 : 760)) {
      emitWinBurst(state.winner, now, false);
      state.lastWinEmit = now;
    }
  }

  function discBar() {
    const counts = countPieces();
    const total = Math.max(1, counts.black + counts.white);
    const black = Math.round((counts.black / total) * 18);
    return `${"#".repeat(black)}${".".repeat(18 - black)}`;
  }

  function drawPanel(now) {
    const r = layout.right;
    const blackName = state.players?.black.name || "SELECTING";
    const whiteName = state.players?.white.name || "SELECTING";
    const toMove = state.winner ? "DONE" : sideTitle(state.toMove);
    const counts = countPieces();
    const legal = state.winner ? 0 : legalMoves(state.board, state.toMove).length;

    writeText(r.x + 3, r.y + 3, "RULESET", color.header);
    writeText(r.x + 3, r.y + 5, "REVERSI / OTHELLO", color.blue);
    writeText(r.x + 3, r.y + 7, "BLACK", color.blackStone);
    writeText(r.x + 12, r.y + 7, blackName.padEnd(16).slice(0, 16), color.blackAlt);
    writeText(r.x + 3, r.y + 8, "WHITE", color.whiteStone);
    writeText(r.x + 12, r.y + 8, whiteName.padEnd(16).slice(0, 16), color.whiteAlt);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, state.toMove === 1 ? color.blackStone : color.whiteStone);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "MATERIAL", color.header);
    writeText(r.x + 3, r.y + 17, `[${discBar()}]`, counts.black >= counts.white ? color.blackStone : color.whiteStone);
    writeText(r.x + 3, r.y + 18, `BLACK ${String(counts.black).padStart(2, " ")}  WHITE ${String(counts.white).padStart(2, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 21, "MOBILITY", color.header);
    writeText(r.x + 3, r.y + 23, `${String(legal).padStart(2, " ")} legal moves`, color.muted);
    if (state.active) writeText(r.x + 3, r.y + 24, `${state.active.move.flips.length} flips at ${coordinate(state.active.move.x, state.active.move.y)}`, sideAltColor(state.active.move.side));
    else writeText(r.x + 3, r.y + 24, "reading lines", color.dim);

    writeText(r.x + 3, r.y + 27, "MOVES", color.header);
    const recent = state.moveLog.slice(-17);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const fg = move.side === 1 ? color.blackStone : color.whiteStone;
      writeText(r.x + 3, r.y + 29 + i, `${String(move.ply).padStart(3, "0")} ${sideTitle(move.side)[0]} ${move.coord} ${move.kind}`.slice(0, 31), fg);
    }

    if (state.winner || state.result) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), state.winner ? color.red : color.dim);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.red);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} reading lines`, color.dim);
    }
  }

  function draw(now) {
    clearScreen();
    drawStaticFrame();
    drawBoardBackground();
    drawLegalHints(now);
    drawTerminalEffects(now);
    drawDiscs(now);
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
    const moves = !state.winner && isHumanTurn() ? legalMoves(state.board, state.toMove) : [];
    canvas.style.cursor = cell && moves.some((move) => move.x === cell.x && move.y === cell.y) ? "pointer" : "default";
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
