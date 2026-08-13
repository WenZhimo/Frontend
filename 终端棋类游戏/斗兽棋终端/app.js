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
  const BOARD_W = 7;
  const BOARD_H = 9;
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const MAX_PLIES = 260;
  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ANIMALS = {
    RAT: { code: "R", rank: 1, name: "RAT" },
    CAT: { code: "C", rank: 2, name: "CAT" },
    DOG: { code: "D", rank: 3, name: "DOG" },
    WOLF: { code: "W", rank: 4, name: "WOLF" },
    LEOPARD: { code: "P", rank: 5, name: "LEOPARD" },
    TIGER: { code: "T", rank: 6, name: "TIGER" },
    LION: { code: "L", rank: 7, name: "LION" },
    ELEPHANT: { code: "E", rank: 8, name: "ELEPHANT" },
  };

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#111813",
    boardB: "#0c1110",
    land: "#142019",
    landDark: "#0d1411",
    river: "#071821",
    riverDim: "#102d37",
    trapRed: "#2a1117",
    trapBlue: "#0c1d24",
    den: "#201b0c",
    grid: "#75877f",
    gridDim: "#2e3a35",
    hint: "#49aebd",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    redStone: "#ff4e59",
    redAlt: "#ffb067",
    blueStone: "#f7ffff",
    blueAlt: "#6ed5ec",
    riverGlow: "#3db8d0",
    trapGlow: "#ff5d73",
    denGlow: "#fff08a",
    win: "#ff4e59",
  };

  const AI_ROSTER = [
    { name: "PREDATOR", capture: 2.6, den: 1.4, rank: 1.2, safety: 0.5, river: 0.6, noise: 0.55, source: "capture heuristic" },
    { name: "RAIDER", capture: 1.2, den: 2.8, rank: 0.6, safety: 0.45, river: 1.35, noise: 0.85, source: "den-rush heuristic" },
    { name: "AMBUSH", capture: 1.8, den: 1.3, rank: 0.7, safety: 1.8, river: 0.4, noise: 0.65, source: "trap heuristic" },
    { name: "TIDE", capture: 1.4, den: 1.6, rank: 0.8, safety: 0.7, river: 2.0, noise: 0.9, source: "river heuristic" },
    { name: "ALPHA", capture: 1.5, den: 1.5, rank: 2.0, safety: 0.8, river: 0.45, noise: 1.35, source: "volatile heuristic" },
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
    boardBox: { x: 10, y: 7, w: 68, h: 48 },
    board: { x: 20, y: 8, cellW: 7, cellH: 5 },
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
    winFocus: null,
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
    return Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(null));
  }

  function clonePiece(piece) {
    return piece ? { side: piece.side, type: piece.type } : null;
  }

  function cloneBoard(board) {
    return board.map((row) => row.map(clonePiece));
  }

  function place(board, x, y, side, type) {
    board[y][x] = { side, type };
  }

  function startGame(seed) {
    state.seed = normalizeSeed(seed || randomSeed());
    seedInput.value = state.seed.trimEnd();
    state.rng = makeRng(`${state.seed}|jungle-terminal`);
    state.board = blankBoard();

    place(state.board, 0, 0, 2, "LION");
    place(state.board, 6, 0, 2, "TIGER");
    place(state.board, 1, 1, 2, "DOG");
    place(state.board, 5, 1, 2, "CAT");
    place(state.board, 0, 2, 2, "RAT");
    place(state.board, 2, 2, 2, "LEOPARD");
    place(state.board, 4, 2, 2, "WOLF");
    place(state.board, 6, 2, 2, "ELEPHANT");

    place(state.board, 0, 6, 1, "ELEPHANT");
    place(state.board, 2, 6, 1, "WOLF");
    place(state.board, 4, 6, 1, "LEOPARD");
    place(state.board, 6, 6, 1, "RAT");
    place(state.board, 1, 7, 1, "CAT");
    place(state.board, 5, 7, 1, "DOG");
    place(state.board, 0, 8, 1, "TIGER");
    place(state.board, 6, 8, 1, "LION");

    state.players = { red: { ...pick(state.rng, AI_ROSTER) }, blue: { ...pick(state.rng, AI_ROSTER) } };
    state.toMove = 1;
    state.moves = [];
    state.moveLog = [];
    state.fragments = [];
    state.ripples = [];
    state.active = null;
    state.winFocus = null;
    state.winner = 0;
    state.result = "";
    state.paused = false;
    state.nextMoveAt = performance.now() + 520;
    state.lastFrame = 0;
    state.lastWinEmit = 0;
    state.speed = 1;
    seedStatus.value = "PLAYING";
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

  function sidePlayer(side) {
    return side === 1 ? state.players?.red : state.players?.blue;
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < BOARD_W && y < BOARD_H;
  }

  function denOwner(x, y) {
    if (x === 3 && y === 8) return 1;
    if (x === 3 && y === 0) return 2;
    return 0;
  }

  function trapOwner(x, y) {
    if ((x === 2 && y === 8) || (x === 4 && y === 8) || (x === 3 && y === 7)) return 1;
    if ((x === 2 && y === 0) || (x === 4 && y === 0) || (x === 3 && y === 1)) return 2;
    return 0;
  }

  function isRiver(x, y) {
    return y >= 3 && y <= 5 && (x === 1 || x === 2 || x === 4 || x === 5);
  }

  function isOwnDen(side, x, y) {
    return denOwner(x, y) === side;
  }

  function isOpponentDen(side, x, y) {
    return denOwner(x, y) === otherSide(side);
  }

  function pieceRank(piece, x, y) {
    if (!piece) return 0;
    const owner = trapOwner(x, y);
    if (owner && owner !== piece.side) return 0;
    return ANIMALS[piece.type].rank;
  }

  function boardCellCenter(x, y) {
    const b = layout.board;
    return {
      x: b.x + x * b.cellW + b.cellW / 2,
      y: b.y + y * b.cellH + b.cellH / 2,
    };
  }

  function coordinate(x, y) {
    return `${String.fromCharCode(65 + x)}${y + 1}`;
  }

  function pieceIds(board, side) {
    const out = [];
    for (let y = 0; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) {
        const piece = board[y][x];
        if (piece && (!side || piece.side === side)) out.push({ x, y, piece });
      }
    }
    return out;
  }

  function canCapture(board, attacker, ax, ay, tx, ty) {
    const target = board[ty][tx];
    if (!target || target.side === attacker.side) return false;
    if (isRiver(ax, ay) && !isRiver(tx, ty) && target.type !== "RAT") return false;
    if (attacker.type === "RAT" && target.type === "ELEPHANT") return true;
    if (attacker.type === "ELEPHANT" && target.type === "RAT") return false;
    return pieceRank(attacker, ax, ay) >= pieceRank(target, tx, ty);
  }

  function ratBlocksJump(board, x, y, dx, dy) {
    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(cx, cy) && isRiver(cx, cy)) {
      const piece = board[cy][cx];
      if (piece && piece.type === "RAT") return true;
      cx += dx;
      cy += dy;
    }
    return false;
  }

  function jumpLanding(board, x, y, dx, dy, piece) {
    if (piece.type !== "LION" && piece.type !== "TIGER") return null;
    let cx = x + dx;
    let cy = y + dy;
    if (!inBounds(cx, cy) || !isRiver(cx, cy) || ratBlocksJump(board, x, y, dx, dy)) return null;
    while (inBounds(cx, cy) && isRiver(cx, cy)) {
      cx += dx;
      cy += dy;
    }
    if (!inBounds(cx, cy)) return null;
    return { x: cx, y: cy };
  }

  function legalMovesForSide(board, side) {
    const moves = [];
    for (const item of pieceIds(board, side)) {
      const { x, y, piece } = item;
      for (const [dx, dy] of DIRS) {
        let nx = x + dx;
        let ny = y + dy;
        let kind = "MOVE";
        let jump = false;
        const landing = jumpLanding(board, x, y, dx, dy, piece);
        if (landing) {
          nx = landing.x;
          ny = landing.y;
          kind = "JUMP";
          jump = true;
        }
        if (!inBounds(nx, ny) || isOwnDen(side, nx, ny)) continue;
        if (!jump && isRiver(nx, ny) && piece.type !== "RAT") continue;
        const target = board[ny][nx];
        if (target && target.side === side) continue;
        if (target && !canCapture(board, piece, x, y, nx, ny)) continue;
        if (target) kind = "TAKE";
        if (isOpponentDen(side, nx, ny)) kind = "DEN";
        moves.push({
          from: { x, y },
          to: { x: nx, y: ny },
          side,
          piece: clonePiece(piece),
          capture: target ? clonePiece(target) : null,
          kind,
          jump,
        });
      }
    }
    return moves;
  }

  function legalMoves(board = state.board, side = state.toMove) {
    return legalMovesForSide(board, side);
  }

  function applyMove(board, move) {
    const next = cloneBoard(board);
    next[move.to.y][move.to.x] = clonePiece(move.piece);
    next[move.from.y][move.from.x] = null;
    return next;
  }

  function denDistance(x, y, side) {
    const target = side === 1 ? { x: 3, y: 0 } : { x: 3, y: 8 };
    return Math.abs(x - target.x) + Math.abs(y - target.y);
  }

  function dangerScore(board, x, y, piece) {
    let danger = 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const enemy = board[ny][nx];
      if (enemy && enemy.side !== piece.side && canCapture(board, enemy, nx, ny, x, y)) danger += 1.4;
    }
    if (trapOwner(x, y) === otherSide(piece.side)) danger += 2.2;
    return danger;
  }

  function material(board, side) {
    return pieceIds(board, side).reduce((sum, item) => sum + ANIMALS[item.piece.type].rank, 0);
  }

  function scoreMove(move, player) {
    if (move.kind === "DEN") return 100000 + state.rng() * 10;
    const beforeDist = denDistance(move.from.x, move.from.y, move.side);
    const afterDist = denDistance(move.to.x, move.to.y, move.side);
    const next = applyMove(state.board, move);
    const captureValue = move.capture ? ANIMALS[move.capture.type].rank : 0;
    const rankValue = ANIMALS[move.piece.type].rank;
    const riverBonus = isRiver(move.to.x, move.to.y) ? 1 : 0;
    const safety = -dangerScore(next, move.to.x, move.to.y, move.piece);
    const trapAttack = trapOwner(move.to.x, move.to.y) === otherSide(move.side) ? 1.6 : 0;
    const materialSwing = material(next, move.side) - material(next, otherSide(move.side));
    return (
      captureValue * player.capture +
      (beforeDist - afterDist) * player.den +
      rankValue * 0.12 * player.rank +
      riverBonus * player.river +
      safety * player.safety +
      trapAttack * player.safety +
      materialSwing * 0.08 +
      (move.jump ? 1.4 : 0) +
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
    const move = chooseAIMove();
    if (!move) {
      finishGame(otherSide(state.toMove), `${sideTitle(state.toMove)} STALLED`, null);
      return;
    }
    const dist = Math.abs(move.to.x - move.from.x) + Math.abs(move.to.y - move.from.y);
    state.active = {
      move,
      start: now,
      duration: (reducedMotion ? 130 : 210 + dist * 34) / state.speed,
      lastTrail: now,
    };
    rippleChar(boardCellCenter(move.from.x, move.from.y), move.side, move.jump ? 1.0 : 0.58, now);
  }

  function finishActiveMove(now) {
    const active = state.active;
    if (!active) return;
    const move = active.move;
    const target = move.capture ? boardCellCenter(move.to.x, move.to.y) : null;
    state.board = applyMove(state.board, move);
    if (target) {
      shockChar(target, otherSide(move.side), reducedMotion ? 10 : 42, 1.2, now, "slash");
    }
    const landed = boardCellCenter(move.to.x, move.to.y);
    rippleChar(landed, move.side, move.kind === "DEN" ? 1.8 : move.capture ? 1.0 : 0.7, now, move.kind === "DEN" ? 940 : 650);
    if (move.jump) drawJumpWake(move, now);
    shockChar(landed, move.side, reducedMotion ? 6 : move.kind === "DEN" ? 58 : 16, move.kind === "DEN" ? 1.7 : 0.72, now, move.kind === "DEN" ? "win" : "shock");

    state.moves.push(move);
    state.moveLog.push({
      ply: state.moves.length,
      side: move.side,
      coord: coordinate(move.to.x, move.to.y),
      piece: ANIMALS[move.piece.type].code,
      kind: move.kind,
    });

    if (isOpponentDen(move.side, move.to.x, move.to.y)) {
      finishGame(move.side, `${sideTitle(move.side)} ENTERS DEN`, { x: move.to.x, y: move.to.y, side: move.side, at: now });
      state.active = null;
      return;
    }
    if (!pieceIds(state.board, otherSide(move.side)).length) {
      finishGame(move.side, `${sideTitle(move.side)} DEVOURS ALL`, { x: move.to.x, y: move.to.y, side: move.side, at: now });
      state.active = null;
      return;
    }
    if (state.moves.length >= MAX_PLIES) {
      const red = material(state.board, 1);
      const blue = material(state.board, 2);
      if (red === blue) finishGame(0, "DRAW BY MATERIAL", { x: move.to.x, y: move.to.y, side: move.side, at: now });
      else finishGame(red > blue ? 1 : 2, `${red > blue ? "RED" : "BLUE"} BY MATERIAL`, { x: move.to.x, y: move.to.y, side: red > blue ? 1 : 2, at: now });
      state.active = null;
      return;
    }

    state.toMove = otherSide(move.side);
    state.nextMoveAt = now + (reducedMotion ? 260 : 430) / state.speed;
    state.active = null;
  }

  function finishGame(winner, result, focus) {
    state.winner = winner;
    state.result = result;
    state.winFocus = focus;
    seedStatus.value = "FINISHED";
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
    sx = Math.round(sx);
    sy = Math.round(sy);
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
    drawBox(layout.left, "JUNGLE TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE DOU SHOU QI / JUNGLE", color.header);
    writeText(4, 4, "RIVER JUMPS / TRAPS / DEN ENTRY", color.dim);
    writeText(4, 56, "1 0.5x  2 1x  3 2x  4 4x  SPACE pause  R reroll  P play", color.dim);
  }

  function terrainBg(x, y) {
    if (denOwner(x, y)) return color.den;
    if (trapOwner(x, y) === 1) return color.trapRed;
    if (trapOwner(x, y) === 2) return color.trapBlue;
    if (isRiver(x, y)) return color.river;
    return (x + y) % 2 ? color.land : color.landDark;
  }

  function drawBoardBackground(now) {
    const box = layout.boardBox;
    fillRect(box.x, box.y, box.w, box.h, color.boardA);
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const staticNoise = (x * 29 + y * 17 + x * y * 3) % 61;
        if (staticNoise <= 2) screen.bg[idx(x, y)] = color.boardB;
      }
    }

    for (let y = 0; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) drawTerrainCell(x, y, now);
    }
    drawCoordinates();
  }

  function drawTerrainCell(x, y, now) {
    const b = layout.board;
    const x0 = b.x + x * b.cellW;
    const y0 = b.y + y * b.cellH;
    fillRect(x0, y0, b.cellW, b.cellH, terrainBg(x, y));
    const fg = isRiver(x, y) ? color.riverGlow : denOwner(x, y) ? color.denGlow : trapOwner(x, y) ? color.trapGlow : color.gridDim;
    const sx0 = x0 * DOT_W;
    const sy0 = y0 * DOT_H;
    const sx1 = (x0 + b.cellW) * DOT_W;
    const sy1 = (y0 + b.cellH) * DOT_H;

    for (let sx = sx0; sx <= sx1; sx += 2) {
      putDotSub(sx, sy0, fg, 0.28);
      putDotSub(sx, sy1, fg, 0.28);
    }
    for (let sy = sy0; sy <= sy1; sy += 2) {
      putDotSub(sx0, sy, fg, 0.28);
      putDotSub(sx1, sy, fg, 0.28);
    }

    if (isRiver(x, y)) drawRiverFlow(x, y, now);
    else if (trapOwner(x, y)) drawTrapGlyph(x, y);
    else if (denOwner(x, y)) drawDenGlyph(x, y);
    else drawLandTexture(x, y);
  }

  function drawLandTexture(x, y) {
    const b = layout.board;
    const sx0 = (b.x + x * b.cellW) * DOT_W;
    const sy0 = (b.y + y * b.cellH) * DOT_H;
    for (let yy = 4; yy < b.cellH * DOT_H - 3; yy += 4) {
      for (let xx = 3; xx < b.cellW * DOT_W - 3; xx += 4) {
        if ((xx * 7 + yy * 11 + x * 13 + y * 17) % 6 < 2) putDotSub(sx0 + xx, sy0 + yy, color.gridDim, 0.13);
      }
    }
  }

  function drawRiverFlow(x, y, now) {
    const b = layout.board;
    const sx0 = (b.x + x * b.cellW) * DOT_W;
    const sy0 = (b.y + y * b.cellH) * DOT_H;
    const phase = Math.floor(now / 110) % 8;
    for (let yy = 3; yy < b.cellH * DOT_H - 2; yy += 3) {
      for (let xx = 2 + ((yy + phase) % 5); xx < b.cellW * DOT_W - 2; xx += 5) {
        putDotSub(sx0 + xx, sy0 + yy, color.riverGlow, 0.36);
        putDotSub(sx0 + xx + 1, sy0 + yy, color.riverGlow, 0.24);
      }
    }
  }

  function drawTrapGlyph(x, y) {
    const c = boardCellCenter(x, y);
    const sx = Math.round(c.x * DOT_W);
    const sy = Math.round(c.y * DOT_H);
    for (let i = -5; i <= 5; i += 2) {
      putDotSub(sx + i, sy - 5, color.trapGlow, 0.66);
      putDotSub(sx - 5, sy + i, color.trapGlow, 0.52);
      putDotSub(sx + 5, sy + i, color.trapGlow, 0.52);
    }
  }

  function drawDenGlyph(x, y) {
    const c = boardCellCenter(x, y);
    const sx = Math.round(c.x * DOT_W);
    const sy = Math.round(c.y * DOT_H);
    for (let i = -5; i <= 5; i += 2) {
      putDotSub(sx + i, sy - 5, color.denGlow, 0.8);
      putDotSub(sx + i, sy + 5, color.denGlow, 0.78);
      putDotSub(sx - 5, sy + i, color.denGlow, 0.7);
      putDotSub(sx + 5, sy + i, color.denGlow, 0.7);
    }
    putDotSub(sx, sy, color.denGlow, 0.96);
  }

  function drawCoordinates() {
    const b = layout.board;
    for (let x = 0; x < BOARD_W; x += 1) {
      writeText(b.x + x * b.cellW + Math.floor(b.cellW / 2), b.y + BOARD_H * b.cellH + 1, String.fromCharCode(65 + x), color.dim);
    }
    for (let y = 0; y < BOARD_H; y += 1) {
      writeText(Math.max(1, b.x - 4), b.y + y * b.cellH + 2, String(y + 1).padStart(2, " "), color.dim);
    }
  }

  function activePosition(t) {
    const active = state.active;
    const a = boardCellCenter(active.move.from.x, active.move.from.y);
    const b = boardCellCenter(active.move.to.x, active.move.to.y);
    const s = smooth(t);
    return {
      x: lerp(a.x, b.x, s),
      y: lerp(a.y, b.y, s) - (active.move.jump ? Math.sin(t * Math.PI) * 1.6 : 0),
    };
  }

  function drawPieces(now) {
    const movingFrom = state.active?.move.from;
    for (let y = 0; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) {
        const piece = state.board[y][x];
        if (!piece) continue;
        if (movingFrom && movingFrom.x === x && movingFrom.y === y) continue;
        drawAnimalBadge(boardCellCenter(x, y), piece, { scale: 1, fade: 1 });
      }
    }
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      drawAnimalBadge(activePosition(t), state.active.move.piece, { scale: 0.86 + Math.sin(t * Math.PI) * 0.18, fade: 1 });
    }
  }

  function drawAnimalBadge(pos, piece, options = {}) {
    const sx0 = Math.round(pos.x * DOT_W);
    const sy0 = Math.round(pos.y * DOT_H);
    const scale = options.scale ?? 1;
    const fade = options.fade ?? 1;
    const rx = 5.0 * scale;
    const ry = 5.8 * scale;
    const main = sideColor(piece.side);
    const alt = sideAltColor(piece.side);
    for (let sy = -Math.ceil(ry); sy <= Math.ceil(ry); sy += 1) {
      for (let sx = -Math.ceil(rx); sx <= Math.ceil(rx); sx += 1) {
        const nx = sx / rx;
        const ny = sy / ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1) continue;
        const rim = d > 0.72;
        const sparkle = hash(sx0 * 17 + sy0 * 19 + sx * 23 + sy * 29);
        if (!rim && sparkle > 0.92) continue;
        putDotSub(sx0 + sx, sy0 + sy, rim || sparkle > 0.63 ? alt : main, (rim ? 0.9 : 1.06) * fade);
      }
    }
  }

  function drawPieceLabels(now) {
    const movingFrom = state.active?.move.from;
    for (let y = 0; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) {
        const piece = state.board[y][x];
        if (!piece) continue;
        if (movingFrom && movingFrom.x === x && movingFrom.y === y) continue;
        drawPieceLabel(boardCellCenter(x, y), piece);
      }
    }
    if (state.active) drawPieceLabel(activePosition(clamp((now - state.active.start) / state.active.duration, 0, 1)), state.active.move.piece);
  }

  function drawPieceLabel(pos, piece) {
    const x = Math.round(pos.x) - 1;
    const y = Math.round(pos.y);
    const animal = ANIMALS[piece.type];
    const fg = color.page;
    const bg = sideColor(piece.side);
    writeText(x, y, `${animal.code}${animal.rank}`, fg, bg);
  }

  function drawLegalHints(now) {
    if (state.active || state.winner) return;
    const phase = reducedMotion ? 0.28 : 0.22 + Math.sin(now / 280) * 0.07;
    for (const move of legalMoves()) {
      const c = boardCellCenter(move.to.x, move.to.y);
      const sx = Math.round(c.x * DOT_W);
      const sy = Math.round(c.y * DOT_H);
      const fg = move.kind === "TAKE" ? color.trapGlow : move.kind === "DEN" ? color.denGlow : color.hint;
      putDotSub(sx, sy, fg, phase);
      putDotSub(sx + 1, sy, fg, phase);
      putDotSub(sx, sy + 1, fg, phase);
      putDotSub(sx + 1, sy + 1, fg, phase);
    }
  }

  function drawTerminalEffects(now) {
    for (const r of state.ripples) {
      const age = (now - r.born) / r.life;
      const radius = lerp(1.2, 9.0 * r.strength, smooth(age));
      const thickness = lerp(0.82, 0.24, age);
      const cx = r.x * DOT_W;
      const cy = r.y * DOT_H;
      const fg = r.side ? sideEffectColor(r.side) : color.denGlow;
      for (let sy = Math.floor(cy - radius * DOT_H * 0.62); sy <= Math.ceil(cy + radius * DOT_H * 0.62); sy += 1) {
        for (let sx = Math.floor(cx - radius * DOT_W); sx <= Math.ceil(cx + radius * DOT_W); sx += 1) {
          const dx = (sx - cx) / DOT_W;
          const dy = ((sy - cy) / DOT_H) / 0.62;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - radius) > thickness) continue;
          if (hash(sx * 7 + sy * 17 + Math.floor(age * 29)) > 0.72 - age * 0.34) continue;
          putEffectDot(sx, sy, fg, clamp((1 - age) * 0.78, 0.12, 0.92));
        }
      }
    }

    state.fragments.forEach((g, i) => {
      const age = (now - g.born) / g.life;
      const fg = g.kind === "win" ? color.denGlow : g.kind === "slash" ? color.trapGlow : sideEffectColor(g.side);
      const radius = g.kind === "trail" ? 3 : 1;
      const cx = Math.round(g.x * DOT_W);
      const cy = Math.round(g.y * DOT_H);
      for (let sy = -radius; sy <= radius; sy += 1) {
        for (let sx = -radius; sx <= radius; sx += 1) {
          const d = Math.sqrt(sx * sx + sy * sy);
          if (d > radius + 0.3) continue;
          if (hash(i * 31 + sx * 11 + sy * 19 + Math.floor(age * 23)) > 0.82 - age * 0.28) continue;
          putEffectDot(cx + sx, cy + sy, fg, clamp((1 - age) * (g.kind === "trail" ? 0.42 : 0.84), 0.1, 1.12));
        }
      }
    });

    if (state.winFocus) drawWinVault(now);
  }

  function drawWinVault(now) {
    const c = boardCellCenter(state.winFocus.x, state.winFocus.y);
    const side = state.winFocus.side || state.winner || 1;
    const cx = Math.round(c.x * DOT_W);
    const cy = Math.round(c.y * DOT_H);
    for (let ray = 0; ray < 18; ray += 1) {
      const a = (ray / 18) * Math.PI * 2 + now / 210;
      const len = 6 + (ray % 4) * 2 + Math.sin(now / 130 + ray) * 2;
      for (let i = 0; i < len; i += 1.4) {
        const sx = cx + Math.cos(a) * i;
        const sy = cy + Math.sin(a) * i * 0.72;
        if ((ray + Math.floor(i) + Math.floor(now / 80)) % 2 === 0) putEffectDot(sx, sy, ray % 3 ? sideEffectColor(side) : color.denGlow, 1.12);
      }
    }
  }

  function rippleChar(origin, side, strength, now = performance.now(), life = 650) {
    state.ripples.push({ x: origin.x, y: origin.y, side, strength, born: now, life });
  }

  function shockChar(origin, side, count, speed = 1, now = performance.now(), kind = "shock") {
    for (let i = 0; i < count; i += 1) {
      const a = hash(now + i * 17) * Math.PI * 2;
      const v = (0.25 + hash(i * 41 + now) * 1.0) * speed;
      state.fragments.push({
        x: origin.x + (hash(i) - 0.5) * 4,
        y: origin.y + (hash(i * 3) - 0.5) * 3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.7,
        born: now,
        life: 360 + hash(i * 9) * 520,
        side,
        kind,
      });
    }
  }

  function trailChar(origin, side, now = performance.now()) {
    for (let i = 0; i < 9; i += 1) {
      state.fragments.push({
        x: origin.x + (hash(i + now) - 0.5) * 5,
        y: origin.y + (hash(i * 5 + now) - 0.5) * 4,
        vx: (hash(i * 2 + now) - 0.5) * 0.3,
        vy: (hash(i * 7 + now) - 0.5) * 0.2,
        born: now,
        life: 240 + hash(i * 11) * 300,
        side,
        kind: "trail",
      });
    }
  }

  function drawJumpWake(move, now) {
    const a = boardCellCenter(move.from.x, move.from.y);
    const b = boardCellCenter(move.to.x, move.to.y);
    const steps = Math.max(1, Math.ceil((Math.abs(move.to.x - move.from.x) + Math.abs(move.to.y - move.from.y)) * 4));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      shockChar(p, move.side, reducedMotion ? 1 : 3, 0.45, now + i, "trail");
    }
  }

  function emitWinPulse(now, strong) {
    if (!state.winFocus) return;
    const c = boardCellCenter(state.winFocus.x, state.winFocus.y);
    shockChar(c, state.winFocus.side || state.winner, strong ? 44 : 12, strong ? 1.35 : 0.72, now, "win");
    rippleChar(c, state.winFocus.side || state.winner, strong ? 2.1 : 1.1, now, strong ? 1050 : 720);
  }

  function update(now, dt) {
    if (state.paused) return;
    const frameScale = dt / 16.67;
    if (!state.active && !state.winner && now >= state.nextMoveAt) beginAIMove(now);
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      const pos = activePosition(t);
      if (now - state.active.lastTrail > 44 && !reducedMotion) {
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
    if (state.winner && now - state.lastWinEmit > (reducedMotion ? 1100 : 620)) {
      emitWinPulse(now, false);
      state.lastWinEmit = now;
    }
  }

  function drawPanel(now) {
    const r = layout.right;
    const redName = state.players?.red.name || "SELECTING";
    const blueName = state.players?.blue.name || "SELECTING";
    const toMove = state.winner ? "DONE" : sideTitle(state.toMove);
    const redMaterial = material(state.board, 1);
    const blueMaterial = material(state.board, 2);
    const moves = state.winner ? [] : legalMoves();

    writeText(r.x + 3, r.y + 3, "RULESET", color.header);
    writeText(r.x + 3, r.y + 5, "DOU SHOU QI / JUNGLE", color.riverGlow);
    writeText(r.x + 3, r.y + 7, "RED", color.redStone);
    writeText(r.x + 12, r.y + 7, redName.padEnd(16).slice(0, 16), color.redAlt);
    writeText(r.x + 3, r.y + 8, "BLUE", color.blueAlt);
    writeText(r.x + 12, r.y + 8, blueName.padEnd(16).slice(0, 16), color.blueStone);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, state.toMove === 1 ? color.redStone : color.blueAlt);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "TERRAIN", color.header);
    writeText(r.x + 3, r.y + 17, "RIVER   rat only", color.riverGlow);
    writeText(r.x + 3, r.y + 18, "TRAP    rank -> 0", color.trapGlow);
    writeText(r.x + 3, r.y + 19, "DEN     instant win", color.denGlow);

    writeText(r.x + 3, r.y + 22, "MATERIAL", color.header);
    writeText(r.x + 3, r.y + 24, `RED  ${String(redMaterial).padStart(2, " ")}`, color.redStone);
    writeText(r.x + 15, r.y + 24, `BLUE ${String(blueMaterial).padStart(2, " ")}`, color.blueAlt);
    writeText(r.x + 3, r.y + 26, `${String(moves.length).padStart(2, " ")} legal moves`, color.muted);
    if (state.active) {
      writeText(r.x + 3, r.y + 27, `${ANIMALS[state.active.move.piece.type].code} ${state.active.move.kind} ${coordinate(state.active.move.to.x, state.active.move.to.y)}`.slice(0, 31), sideAltColor(state.active.move.side));
    }

    writeText(r.x + 3, r.y + 30, "MOVES", color.header);
    const recent = state.moveLog.slice(-15);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const fg = move.side === 1 ? color.redStone : color.blueAlt;
      writeText(r.x + 3, r.y + 32 + i, `${String(move.ply).padStart(3, "0")} ${sideTitle(move.side)[0]} ${move.piece} ${move.coord} ${move.kind}`.slice(0, 31), fg);
    }

    if (state.winner || state.result) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), state.winner ? color.denGlow : color.dim);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.win);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} stalking the riverbank`, color.dim);
    }
  }

  function draw(now) {
    clearScreen();
    drawStaticFrame();
    drawBoardBackground(now);
    drawLegalHints(now);
    drawTerminalEffects(now);
    drawPieces(now);
    flushDotLayer(layout.left);
    drawPieceLabels(now);
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
