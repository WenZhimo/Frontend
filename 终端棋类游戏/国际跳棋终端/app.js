(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const seedForm = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");

  const COLS = 132;
  const ROWS = 60;
  const CELL_W = 11;
  const CELL_H = 18;
  const FONT_SIZE = 16;
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const DOT_W = 2;
  const DOT_H = 4;
  const BRAILLE_BASE = 0x2800;
  const SIZE = 10;
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const MAX_PLIES = 220;
  const DIAGS = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#111813",
    boardB: "#0c1110",
    darkCell: "#142019",
    lightCell: "#080d0c",
    grid: "#75877f",
    gridDim: "#2e3a35",
    hint: "#49aebd",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    whiteStone: "#ffffff",
    whiteAlt: "#e7e9e4",
    blackStone: "#f0a245",
    blackAlt: "#ffd06f",
    whiteCrown: "#fff08a",
    blackCrown: "#fff9e8",
    blue: "#6ed5ec",
    red: "#ff4e59",
    win: "#ff4e59",
  };

  const AI_ROSTER = [
    { name: "CHAIN", capture: 1.65, king: 0.85, advance: 1.05, center: 0.55, noise: 0.65, source: "capture heuristic" },
    { name: "CROWN", capture: 1.1, king: 1.7, advance: 1.25, center: 0.45, noise: 0.75, source: "promotion heuristic" },
    { name: "EDGE", capture: 1.25, king: 1.0, advance: 0.75, center: -0.65, noise: 0.55, source: "edge heuristic" },
    { name: "TEMPO", capture: 1.0, king: 0.9, advance: 1.5, center: 1.0, noise: 1.05, source: "race heuristic" },
    { name: "WILD", capture: 1.35, king: 1.2, advance: 1.0, center: 0.25, noise: 1.8, source: "volatile heuristic" },
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
    boardBox: { x: 8, y: 7, w: 74, h: 45 },
    board: { x: 10, y: 7, cellW: 7, cellH: 4 },
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
    capturedMarks: [],
    crownMarks: [],
    boardShake: null,
    winner: 0,
    result: "",
    nextMoveAt: 0,
    lastFrame: 0,
    lastWinEmit: 0,
    speed: 1,
    paused: false,
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

  function blankBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function clonePiece(piece) {
    return piece ? { side: piece.side, king: piece.king } : null;
  }

  function cloneBoard(board) {
    return board.map((row) => row.map(clonePiece));
  }

  function startGame(seed) {
    state.seed = normalizeSeed(seed || randomSeed());
    seedInput.value = state.seed.trimEnd();
    state.rng = makeRng(`${state.seed}|international-draughts`);
    state.board = blankBoard();
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (!playable(x, y)) continue;
        if (y <= 3) state.board[y][x] = { side: 2, king: false };
        if (y >= 6) state.board[y][x] = { side: 1, king: false };
      }
    }
    state.players = { white: { ...pick(state.rng, AI_ROSTER) }, black: { ...pick(state.rng, AI_ROSTER) } };
    state.toMove = 1;
    state.moves = [];
    state.moveLog = [];
    state.fragments = [];
    state.ripples = [];
    state.active = null;
    state.capturedMarks = [];
    state.crownMarks = [];
    state.boardShake = null;
    state.winner = 0;
    state.result = "";
    state.paused = false;
    state.nextMoveAt = performance.now() + 520;
    state.lastFrame = 0;
    state.lastWinEmit = 0;
    state.speed = 1;
    seedStatus.value = "PLAYING";
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  }

  function playable(x, y) {
    return inBounds(x, y) && (x + y) % 2 === 1;
  }

  function sideName(side) {
    return side === 1 ? "white" : "black";
  }

  function sideTitle(side) {
    return sideName(side).toUpperCase();
  }

  function otherSide(side) {
    return side === 1 ? 2 : 1;
  }

  function sideColor(side) {
    return side === 1 ? color.whiteStone : color.blackStone;
  }

  function sideAltColor(side) {
    return side === 1 ? color.whiteAlt : color.blackAlt;
  }

  function sideEffectColor(side) {
    return side === 1 ? color.blue : color.red;
  }

  function sideCrownColor(side) {
    return side === 1 ? color.whiteCrown : color.blackCrown;
  }

  function sidePlayer(side) {
    return side === 1 ? state.players?.white : state.players?.black;
  }

  function centerOfCell(x, y) {
    return {
      x: layout.board.x + x * layout.board.cellW + layout.board.cellW / 2,
      y: layout.board.y + y * layout.board.cellH + layout.board.cellH / 2,
    };
  }

  function promotionRow(side) {
    return side === 1 ? 0 : SIZE - 1;
  }

  function pieceIds(board, side) {
    const out = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const piece = board[y][x];
        if (piece?.side === side) out.push({ x, y, piece });
      }
    }
    return out;
  }

  function legalMoves(board, side) {
    const captures = [];
    for (const p of pieceIds(board, side)) captures.push(...captureMovesFrom(board, p.x, p.y, p.piece));
    if (captures.length) {
      const max = Math.max(...captures.map((move) => move.captures.length));
      return captures.filter((move) => move.captures.length === max);
    }
    const moves = [];
    for (const p of pieceIds(board, side)) moves.push(...quietMovesFrom(board, p.x, p.y, p.piece));
    return moves;
  }

  function quietMovesFrom(board, x, y, piece) {
    const moves = [];
    if (piece.king) {
      for (const [dx, dy] of DIAGS) {
        let cx = x + dx;
        let cy = y + dy;
        while (playable(cx, cy) && !board[cy][cx]) {
          moves.push({ side: piece.side, from: { x, y }, to: { x: cx, y: cy }, path: [{ x, y }, { x: cx, y: cy }], captures: [], piece: clonePiece(piece), kind: "KING" });
          cx += dx;
          cy += dy;
        }
      }
      return moves;
    }
    const dy = piece.side === 1 ? -1 : 1;
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      const ny = y + dy;
      if (playable(nx, ny) && !board[ny][nx]) {
        moves.push({ side: piece.side, from: { x, y }, to: { x: nx, y: ny }, path: [{ x, y }, { x: nx, y: ny }], captures: [], piece: clonePiece(piece), kind: "MOVE" });
      }
    }
    return moves;
  }

  function captureMovesFrom(board, x, y, piece) {
    const results = [];
    const start = { x, y };
    const recur = (currentBoard, cx, cy, currentPiece, path, captures) => {
      const nextSteps = currentPiece.king
        ? kingCaptureSteps(currentBoard, cx, cy, currentPiece)
        : manCaptureSteps(currentBoard, cx, cy, currentPiece);
      if (!nextSteps.length) {
        if (captures.length) {
          results.push({
            side: piece.side,
            from: start,
            to: { x: cx, y: cy },
            path,
            captures,
            piece: clonePiece(piece),
            kind: captures.length > 1 ? "CHAIN" : "CAPTURE",
          });
        }
        return;
      }
      for (const step of nextSteps) {
        const nextBoard = cloneBoard(currentBoard);
        nextBoard[cy][cx] = null;
        nextBoard[step.capture.y][step.capture.x] = null;
        nextBoard[step.to.y][step.to.x] = clonePiece(currentPiece);
        recur(nextBoard, step.to.x, step.to.y, currentPiece, [...path, step.to], [...captures, step.capture]);
      }
    };
    recur(board, x, y, piece, [start], []);
    return results;
  }

  function manCaptureSteps(board, x, y, piece) {
    const out = [];
    for (const [dx, dy] of DIAGS) {
      const mx = x + dx;
      const my = y + dy;
      const lx = x + dx * 2;
      const ly = y + dy * 2;
      if (!playable(lx, ly) || board[ly][lx]) continue;
      const target = playable(mx, my) ? board[my][mx] : null;
      if (target && target.side !== piece.side) out.push({ to: { x: lx, y: ly }, capture: { x: mx, y: my } });
    }
    return out;
  }

  function kingCaptureSteps(board, x, y, piece) {
    const out = [];
    for (const [dx, dy] of DIAGS) {
      let cx = x + dx;
      let cy = y + dy;
      let target = null;
      while (playable(cx, cy)) {
        const cell = board[cy][cx];
        if (!target) {
          if (!cell) {
            cx += dx;
            cy += dy;
            continue;
          }
          if (cell.side === piece.side) break;
          target = { x: cx, y: cy };
          cx += dx;
          cy += dy;
          continue;
        }
        if (cell) break;
        out.push({ to: { x: cx, y: cy }, capture: target });
        cx += dx;
        cy += dy;
      }
    }
    return out;
  }

  function applyMove(board, move) {
    const next = cloneBoard(board);
    const piece = clonePiece(move.piece);
    next[move.from.y][move.from.x] = null;
    for (const capture of move.captures) next[capture.y][capture.x] = null;
    if (!piece.king && move.to.y === promotionRow(piece.side)) piece.king = true;
    next[move.to.y][move.to.x] = piece;
    return next;
  }

  function scoreMove(move) {
    const player = sidePlayer(move.side);
    const next = applyMove(state.board, move);
    const piece = next[move.to.y][move.to.x];
    const forward = move.side === 1 ? move.from.y - move.to.y : move.to.y - move.from.y;
    const center = 1 - Math.abs(move.to.x - 4.5) / 4.5;
    const myPieces = pieceIds(next, move.side).length;
    const oppPieces = pieceIds(next, otherSide(move.side)).length;
    let score = move.captures.length * 160 * player.capture;
    score += forward * 12 * player.advance;
    score += center * 18 * player.center;
    score += piece.king ? 42 * player.king : 0;
    score += (!move.piece.king && move.to.y === promotionRow(move.side)) ? 90 * player.king : 0;
    score += (myPieces - oppPieces) * 12;
    score += move.path.length * 2.5;
    score += state.rng() * 12 * player.noise;
    return score;
  }

  function chooseMove() {
    const moves = legalMoves(state.board, state.toMove);
    if (!moves.length) return null;
    const scored = moves.map((move) => ({ ...move, score: scoreMove(move) })).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(6, scored.length));
    return top[Math.floor(Math.pow(state.rng(), 1.6) * top.length)];
  }

  function coordinate(point) {
    return `${"ABCDEFGHIJ"[point.x]}${10 - point.y}`;
  }

  function beginAIMove(now) {
    if (state.paused || state.active || state.winner) return;
    const move = chooseMove();
    if (!move) {
      finishGame(otherSide(state.toMove), `${sideTitle(state.toMove)} STALLED`);
      return;
    }
    state.active = {
      move,
      start: now,
      duration: (reducedMotion ? 130 : 240) * Math.max(1, move.path.length - 1) / state.speed,
      lastTrail: now,
    };
    rippleChar(centerOfCell(move.from.x, move.from.y), move.side, 0.75, now);
  }

  function finishActiveMove(now) {
    const active = state.active;
    if (!active) return;
    const move = active.move;
    const promoted = !move.piece.king && move.to.y === promotionRow(move.side);
    state.board = applyMove(state.board, move);
    state.capturedMarks.push(...move.captures.map((capture) => ({ ...capture, side: otherSide(move.side), at: now })));
    for (const capture of move.captures) shatterChar(centerOfCell(capture.x, capture.y), otherSide(move.side), reducedMotion ? 5 : 20, 0.86, now);
    for (const point of move.path.slice(1)) rippleChar(centerOfCell(point.x, point.y), move.side, move.captures.length ? 0.95 : 0.65, now);
    if (promoted) {
      const crownOrigin = centerOfCell(move.to.x, move.to.y);
      state.crownMarks.push({ x: move.to.x, y: move.to.y, side: move.side, at: now, life: reducedMotion ? 620 : 1240 });
      rippleChar(crownOrigin, move.side, reducedMotion ? 0.9 : 1.9, now, reducedMotion ? 520 : 940);
      shatterChar(crownOrigin, move.side, reducedMotion ? 14 : 92, reducedMotion ? 1.05 : 1.95, now);
      triggerBoardShake(now, 1.45, 460);
    }
    state.moves.push(move);
    state.moveLog.push({
      ply: state.moves.length,
      side: move.side,
      coord: coordinate(move.to),
      kind: promoted ? "CROWN" : move.captures.length ? `TAKE x${move.captures.length}` : "MOVE",
    });

    const opponent = otherSide(move.side);
    if (!pieceIds(state.board, opponent).length || !legalMoves(state.board, opponent).length) {
      finishGame(move.side, `${sideTitle(move.side)} WINS`);
      state.active = null;
      return;
    }
    if (state.moves.length >= MAX_PLIES) {
      finishByMaterial();
      state.active = null;
      return;
    }
    state.toMove = opponent;
    state.nextMoveAt = now + 320 / state.speed;
    state.active = null;
  }

  function finishByMaterial() {
    const white = material(1);
    const black = material(2);
    if (white > black) finishGame(1, `WHITE ${white}-${black}`);
    else if (black > white) finishGame(2, `BLACK ${black}-${white}`);
    else finishGame(0, `DRAW ${white}-${black}`);
  }

  function finishGame(winner, result) {
    state.winner = winner;
    state.result = result;
    seedStatus.value = "FINISHED";
  }

  function material(side) {
    return pieceIds(state.board, side).reduce((sum, p) => sum + (p.piece.king ? 2 : 1), 0);
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
    drawBox(layout.left, "DRAUGHTS TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE INTERNATIONAL DRAUGHTS / 10x10", color.header);
    writeText(4, 4, "MANDATORY CAPTURE / LONGEST CHAIN / FLYING KINGS", color.dim);
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
        const bg = playable(x, y) ? color.darkCell : color.lightCell;
        fillRect(b.x + x * b.cellW, b.y + y * b.cellH, b.cellW, b.cellH, bg);
        if (playable(x, y)) drawCellTexture(x, y);
      }
    }

    for (let x = 0; x <= SIZE; x += 1) {
      const sx = (b.x + x * b.cellW) * DOT_W;
      for (let sy = b.y * DOT_H; sy <= (b.y + SIZE * b.cellH) * DOT_H; sy += 2) putDotSub(sx, sy, color.gridDim, 0.18);
    }
    for (let y = 0; y <= SIZE; y += 1) {
      const sy = (b.y + y * b.cellH) * DOT_H;
      for (let sx = b.x * DOT_W; sx <= (b.x + SIZE * b.cellW) * DOT_W; sx += 2) putDotSub(sx, sy, color.gridDim, 0.18);
    }

    const files = "ABCDEFGHIJ";
    for (let i = 0; i < SIZE; i += 1) {
      writeText(b.x + i * b.cellW + Math.floor(b.cellW / 2), b.y + SIZE * b.cellH + 1, files[i], color.dim);
      writeText(Math.max(1, b.x - 4), b.y + i * b.cellH + 1, String(10 - i).padStart(2, " "), color.dim);
    }
  }

  function drawCellTexture(x, y) {
    const b = layout.board;
    const x0 = (b.x + x * b.cellW) * DOT_W;
    const y0 = (b.y + y * b.cellH) * DOT_H;
    for (let yy = 2; yy < b.cellH * DOT_H - 2; yy += 3) {
      for (let xx = 2; xx < b.cellW * DOT_W - 2; xx += 3) {
        if ((xx * 7 + yy * 11 + x * 13 + y * 17) % 5 < 2) putDotSub(x0 + xx, y0 + yy, color.gridDim, 0.14);
      }
    }
  }

  function drawLegalHints(now) {
    if (state.active || state.winner) return;
    const moves = legalMoves(state.board, state.toMove);
    const phase = reducedMotion ? 0.34 : 0.28 + Math.sin(now / 280) * 0.08;
    for (const move of moves) {
      const c = centerOfCell(move.to.x, move.to.y);
      const sx = Math.round(c.x * DOT_W);
      const sy = Math.round(c.y * DOT_H);
      const fg = move.captures.length ? color.red : color.hint;
      putDotSub(sx, sy, fg, phase);
      putDotSub(sx + 1, sy, fg, phase);
      putDotSub(sx, sy + 1, fg, phase);
      putDotSub(sx + 1, sy + 1, fg, phase);
    }
  }

  function drawPieces(now) {
    const movingFrom = state.active?.move.from;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const piece = state.board[y][x];
        if (!piece) continue;
        if (movingFrom && movingFrom.x === x && movingFrom.y === y) continue;
        const captured = latestCapturedMark(x, y, now);
        drawPiece(centerOfCell(x, y), piece, { fade: captured ? 1 - captured * 0.85 : 1, scale: captured ? 1 - captured * 0.12 : 1 });
      }
    }
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      const pos = activePosition(t);
      drawPiece(pos, state.active.move.piece, { scale: 0.9 + Math.sin(t * Math.PI) * 0.16 });
    }
  }

  function latestCapturedMark(x, y, now) {
    for (let i = state.capturedMarks.length - 1; i >= 0; i -= 1) {
      const mark = state.capturedMarks[i];
      if (mark.x === x && mark.y === y) return clamp((now - mark.at) / 520, 0, 1);
    }
    return 0;
  }

  function drawPiece(pos, piece, options = {}) {
    const sx = Math.round(pos.x * DOT_W);
    const sy = Math.round(pos.y * DOT_H);
    const fade = options.fade ?? 1;
    const scale = options.scale ?? 1;
    const rx = 4.8 * scale;
    const ry = 5.6 * scale;
    const main = sideColor(piece.side);
    const alt = sideAltColor(piece.side);
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y += 1) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x += 1) {
        const nx = x / rx;
        const ny = y / ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1) continue;
        const rim = d > 0.68;
        const sparkle = hash(sx * 13 + sy * 17 + x * 19 + y * 31);
        if (!rim && sparkle > 0.9) continue;
        putDotSub(sx + x, sy + y, rim || sparkle > 0.58 ? alt : main, (rim ? 0.84 : 1) * fade);
      }
    }
    if (piece.king) drawCrown(pos, piece.side, fade);
  }

  function drawCrown(pos, side, fade) {
    const sx = Math.round(pos.x * DOT_W);
    const sy = Math.round(pos.y * DOT_H);
    const fg = sideCrownColor(side);
    const dots = [
      [-4, -4, 0.9],
      [0, -5, 1],
      [4, -4, 0.9],
      [-3, -2, 1],
      [-1, -2, 0.92],
      [1, -2, 0.92],
      [3, -2, 1],
      [-4, 0, 0.96],
      [-2, 0, 0.88],
      [0, 0, 1],
      [2, 0, 0.88],
      [4, 0, 0.96],
      [-2, 2, 0.9],
      [0, 2, 0.98],
      [2, 2, 0.9],
    ];
    for (const [dx, dy, power] of dots) {
      putDotSub(sx + dx, sy + dy, fg, (1.22 + power * 0.16) * fade);
      putDotSub(sx + dx + 1, sy + dy, fg, (1.08 + power * 0.12) * fade);
    }
  }

  function activePosition(t) {
    const path = state.active.move.path;
    const segments = Math.max(1, path.length - 1);
    const raw = clamp(t, 0, 1) * segments;
    const index = Math.min(segments - 1, Math.floor(raw));
    const local = smooth(raw - index);
    const a = centerOfCell(path[index].x, path[index].y);
    const b = centerOfCell(path[index + 1].x, path[index + 1].y);
    return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
  }

  function drawTerminalEffects(now) {
    for (const mark of state.crownMarks) drawPromotionBeam(mark, now);

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

  function drawPromotionBeam(mark, now) {
    const age = clamp((now - mark.at) / (mark.life || 1240), 0, 1);
    const origin = centerOfCell(mark.x, mark.y);
    const cx = Math.round(origin.x * DOT_W);
    const cy = Math.round(origin.y * DOT_H);
    const beamTop = (layout.board.y - 1) * DOT_H;
    const beamBottom = Math.round(lerp(beamTop, cy + 8, smooth(clamp(age / 0.34, 0, 1))));
    const beamFade = 1 - smooth(clamp((age - 0.68) / 0.32, 0, 1));
    const beamWidth = lerp(2.2, 6.2, Math.sin(Math.min(age, 0.5) * Math.PI));
    const crownFg = sideCrownColor(mark.side);
    const burstFg = sideEffectColor(mark.side);

    for (let sy = beamTop; sy <= beamBottom; sy += 1) {
      for (let sx = Math.floor(cx - beamWidth); sx <= Math.ceil(cx + beamWidth); sx += 1) {
        const dx = Math.abs(sx - cx);
        const core = 1 - dx / Math.max(1, beamWidth);
        if (core <= 0) continue;
        if ((sx + sy + Math.floor(age * 18)) % (core > 0.52 ? 2 : 3) !== 0) continue;
        putEffectDot(sx, sy, crownFg, (1.18 + core * 0.55) * beamFade);
      }
    }

    if (age < 0.16) return;
    const burstAge = clamp((age - 0.16) / 0.78, 0, 1);
    const radius = lerp(2, 22, smooth(burstAge));
    const thickness = lerp(2.3, 0.55, burstAge);
    const minX = Math.floor(cx - radius * DOT_W - 4);
    const maxX = Math.ceil(cx + radius * DOT_W + 4);
    const minY = Math.floor(cy - radius * DOT_H * 0.56 - 4);
    const maxY = Math.ceil(cy + radius * DOT_H * 0.56 + 4);
    const fade = 1 - smooth(burstAge);

    for (let sy = minY; sy <= maxY; sy += 1) {
      for (let sx = minX; sx <= maxX; sx += 1) {
        const dx = (sx - cx) / DOT_W;
        const dy = ((sy - cy) / DOT_H) / 0.56;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const onRing = Math.abs(dist - radius) <= thickness;
        const inRay = Math.abs(Math.sin(Math.atan2(dy, dx) * 6)) < 0.13 && dist < radius && dist > 2;
        if (!onRing && !inRay) continue;
        if ((sx * 3 + sy * 5 + Math.floor(burstAge * 12)) % (onRing ? 3 : 5) === 0) {
          putEffectDot(sx, sy, onRing ? burstFg : crownFg, clamp(0.2 + fade * (onRing ? 0.95 : 0.72), 0.14, 1.22));
        }
      }
    }
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
    for (const p of pieceIds(state.board, side)) {
      if (!strong && (p.x + p.y + Math.floor(now / 720)) % 3 !== 0) continue;
      shatterChar(centerOfCell(p.x, p.y), side, strong ? 10 : 4, strong ? 0.9 : 0.55, now);
    }
  }

  function triggerBoardShake(now, strength, life) {
    if (reducedMotion) return;
    state.boardShake = { at: now, strength, life };
  }

  function boardShakeOffset(now) {
    const shake = state.boardShake;
    if (!shake || reducedMotion) return { x: 0, y: 0 };
    const age = (now - shake.at) / shake.life;
    if (age >= 1) return { x: 0, y: 0 };
    const amp = shake.strength * 3.2 * (1 - smooth(age));
    return {
      x: Math.round(Math.sin(age * 54) * amp),
      y: Math.round(Math.cos(age * 47) * amp * 0.58),
    };
  }

  function shakesBoardCell(x, y) {
    const box = layout.boardBox;
    return x >= box.x - 3 && x < box.x + box.w + 3 && y >= box.y - 2 && y < box.y + box.h + 5;
  }

  function cellShake(shake, x, y) {
    return shakesBoardCell(x, y) ? shake : { x: 0, y: 0 };
  }

  function update(now, dt) {
    if (state.paused) return;
    const frameScale = dt / 16.67;
    if (!state.active && !state.winner && now >= state.nextMoveAt) beginAIMove(now);
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      const pos = activePosition(t);
      if (now - state.active.lastTrail > 42 && !reducedMotion) {
        trailChar(pos, state.active.move.side, now);
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
    state.capturedMarks = state.capturedMarks.filter((mark) => now - mark.at < 560);
    state.crownMarks = state.crownMarks.filter((mark) => now - mark.at < (mark.life || 1240));
    if (state.boardShake && now - state.boardShake.at >= state.boardShake.life) state.boardShake = null;
    if (state.winner && now - state.lastWinEmit > (reducedMotion ? 1100 : 760)) {
      emitWinBurst(state.winner, now, false);
      state.lastWinEmit = now;
    }
  }

  function materialBar() {
    const white = material(1);
    const black = material(2);
    const total = Math.max(1, white + black);
    const filled = Math.round((white / total) * 18);
    return `${"#".repeat(filled)}${".".repeat(18 - filled)}`;
  }

  function drawPanel(now) {
    const r = layout.right;
    const whiteName = state.players?.white.name || "SELECTING";
    const blackName = state.players?.black.name || "SELECTING";
    const toMove = state.winner ? "DONE" : sideTitle(state.toMove);
    const moves = state.winner ? [] : legalMoves(state.board, state.toMove);
    const captures = moves.filter((move) => move.captures.length);

    writeText(r.x + 3, r.y + 3, "RULESET", color.header);
    writeText(r.x + 3, r.y + 5, "INTERNATIONAL DRAUGHTS", color.blue);
    writeText(r.x + 3, r.y + 7, "WHITE", color.whiteStone);
    writeText(r.x + 12, r.y + 7, whiteName.padEnd(16).slice(0, 16), color.whiteAlt);
    writeText(r.x + 3, r.y + 8, "BLACK", color.blackStone);
    writeText(r.x + 12, r.y + 8, blackName.padEnd(16).slice(0, 16), color.blackAlt);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, state.toMove === 1 ? color.whiteStone : color.blackStone);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "MATERIAL", color.header);
    writeText(r.x + 3, r.y + 17, `[${materialBar()}]`, material(1) >= material(2) ? color.whiteStone : color.blackStone);
    writeText(r.x + 3, r.y + 18, `WHITE ${String(material(1)).padStart(2, " ")}  BLACK ${String(material(2)).padStart(2, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 21, "TACTICS", color.header);
    writeText(r.x + 3, r.y + 23, `${String(moves.length).padStart(2, " ")} legal moves`, color.muted);
    writeText(r.x + 3, r.y + 24, captures.length ? `forced capture x${captures[0].captures.length}` : "quiet diagonal play", captures.length ? color.red : color.dim);
    if (state.active) {
      writeText(r.x + 3, r.y + 25, `${state.active.move.kind} ${coordinate(state.active.move.from)}>${coordinate(state.active.move.to)}`.slice(0, 31), sideAltColor(state.active.move.side));
    }

    writeText(r.x + 3, r.y + 28, "MOVES", color.header);
    const recent = state.moveLog.slice(-16);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const fg = move.side === 1 ? color.whiteStone : color.blackStone;
      writeText(r.x + 3, r.y + 30 + i, `${String(move.ply).padStart(3, "0")} ${sideTitle(move.side)[0]} ${move.coord} ${move.kind}`.slice(0, 31), fg);
    }

    if (state.winner || state.result) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), state.winner ? color.red : color.dim);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.red);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} reading diagonals`, color.dim);
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
    renderTerminal(now);
  }

  function renderTerminal(now) {
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
    const shake = boardShakeOffset(now);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const offset = cellShake(shake, x, y);
        ctx.fillStyle = screen.bg[idx(x, y)];
        ctx.fillRect(x * CELL_W + offset.x, y * CELL_H + offset.y, CELL_W, CELL_H);
      }
    }
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = screen.ch[idx(x, y)];
        if (ch === " ") continue;
        const offset = cellShake(shake, x, y);
        ctx.fillStyle = screen.fg[idx(x, y)];
        ctx.fillText(ch, x * CELL_W + offset.x, y * CELL_H + 1 + offset.y);
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
        if (!state.winner) seedStatus.value = state.paused ? "PAUSED" : "PLAYING";
      }, 900);
    } catch (error) {
      seedStatus.value = "COPY ERR";
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.target === seedInput) return;
    if (event.key === " ") {
      event.preventDefault();
      state.paused = !state.paused;
      seedStatus.value = state.paused ? "PAUSED" : state.winner ? "FINISHED" : "PLAYING";
    } else if (event.key.toLowerCase() === "r") {
      startGame(randomSeed());
    } else if (event.key.toLowerCase() === "p") {
      startGame(seedInput.value || state.seed || randomSeed());
    } else if (["1", "2", "3", "4"].includes(event.key)) {
      state.speed = SPEEDS[Number(event.key) - 1];
    }
  });

  startGame(randomSeed());
  requestAnimationFrame(loop);
})();
