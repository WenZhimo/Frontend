(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });

  const COLS = 126;
  const ROWS = 60;
  const FILES = "abcdefgh";
  const TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  const VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
  const TAG = { pawn: "P", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" };
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chessEngine = window.JSChessEngine;

  const color = {
    page: "#020306",
    ink: "#080b11",
    ink2: "#0b0f17",
    cellA: "#202735",
    cellB: "#151b25",
    boardParticle: "#7f858d",
    grid: "#111722",
    line: "#747b8c",
    dim: "#626b7e",
    muted: "#7a8397",
    header: "#b3b8c8",
    white: "#eef7ff",
    codex: "#9bf6ff",
    codexAlt: "#dffcff",
    kimi: "#f6a33b",
    kimiAlt: "#ffd269",
    warmDim: "#956d44",
    coolDim: "#5aafc7",
    blue: "#6ed5ec",
    red: "#ff4e59",
    black: "#020306",
  };

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

  const left = { x: 1, y: 1, w: 81, h: 58 };
  const right = { x: 84, y: 1, w: 41, h: 58 };
  const board = { x: 9, y: 5, sw: 9, sh: 6, w: 72, h: 48 };
  const DOT_W = 2;
  const DOT_H = 4;
  const BRAILLE_BASE = 0x2800;
  const BRAILLE_FULL = String.fromCharCode(BRAILLE_BASE + 0xff);
  const BRAILLE_DUST = String.fromCharCode(BRAILLE_BASE + 0x09);
  const MAX_PLIES = 160;
  const SYMBOL_TO_TYPE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const AI_ROSTER = [
    { name: "JCE-SEARCH", source: "js-chess-engine", kind: "engine", level: 2, randomness: 60 },
    { name: "JCE-DEEP", source: "js-chess-engine", kind: "engine", level: 3, randomness: 25 },
    { name: "TACTIC", source: "local heuristic", kind: "tactic" },
    { name: "MOBILITY", source: "local heuristic", kind: "mobility" },
    { name: "GAMBIT", source: "local heuristic", kind: "gambit" },
  ];

  const pieceMasks = buildPieceMasks({
    pawn: [
      "      ####      ",
      "     ######     ",
      "     ######     ",
      "      ####      ",
      "     ######     ",
      "    ########    ",
      "    ########    ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      "                ",
    ],
    rook: [
      "  ###  ##  ###  ",
      " ############## ",
      " ############## ",
      "   ##########   ",
      "   ##########   ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      " ############## ",
      " ############## ",
      "                ",
    ],
    knight: [
      "      #######   ",
      "    ##########  ",
      "   ###########  ",
      "  #######  ###  ",
      "  ####     ###  ",
      "  ###    ####   ",
      "       #####    ",
      "      #####     ",
      "    ##########  ",
      "  ############  ",
      "  ############  ",
      "                ",
    ],
    bishop: [
      "       ##       ",
      "      ####      ",
      "     ######     ",
      "    ########    ",
      "      ####      ",
      "     ####       ",
      "    ########    ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      "                ",
    ],
    queen: [
      "  ##   ##   ##  ",
      " #### #### #### ",
      " ############## ",
      "  ############  ",
      "   ##########   ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      " ############## ",
      " ############## ",
      "                ",
    ],
    king: [
      "       ##       ",
      "     ######     ",
      "       ##       ",
      "    ########    ",
      "   ##########   ",
      "    ########    ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      " ############## ",
      " ############## ",
      "                ",
    ],
  });

  let dpr = 1;
  let cw = 1;
  let ch = 1;
  let fontSize = 16;
  let pieces = [];
  let fragments = [];
  let ripples = [];
  let active = null;
  let moveCursor = 0;
  let ply = 0;
  let nextMoveAt = 0;
  let engineGame = null;
  let boardState = null;
  let matchPlayers = { codex: null, kimi: null };
  let moveLog = [];
  let aiThinking = false;
  let selectingPlayers = true;
  let selectionToken = 0;
  let matchResult = "";
  let winnerSide = null;
  let matchSeed = 1;
  let paused = false;
  let lastFrame = 0;
  let replayButton = null;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const hash = (n) => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  function buildPieceMasks(source) {
    const masks = {};
    Object.entries(source).forEach(([name, lines]) => {
      const width = Math.max(...lines.map((line) => line.length));
      const rows = [];
      lines.forEach((line) => {
        const padded = line.padEnd(width, " ");
        rows.push(padded, padded);
      });
      masks[name] = {
        width,
        height: rows.length,
        rows,
      };
    });
    return masks;
  }

  function braille(mask) {
    return String.fromCharCode(BRAILLE_BASE + (mask & 0xff));
  }

  function brailleBit(sx, sy) {
    const col = ((sx % DOT_W) + DOT_W) % DOT_W;
    const row = ((sy % DOT_H) + DOT_H) % DOT_H;
    if (col === 0) return [0x01, 0x02, 0x04, 0x40][row];
    return [0x08, 0x10, 0x20, 0x80][row];
  }

  const boardDensity = [0.04, 0.065, 0.095, 0.13, 0.17];
  const boardDither = [
    [0, 48, 12, 60, 3, 51, 15, 63],
    [32, 16, 44, 28, 35, 19, 47, 31],
    [8, 56, 4, 52, 11, 59, 7, 55],
    [40, 24, 36, 20, 43, 27, 39, 23],
    [2, 50, 14, 62, 1, 49, 13, 61],
    [34, 18, 46, 30, 33, 17, 45, 29],
    [10, 58, 6, 54, 9, 57, 5, 53],
    [42, 26, 38, 22, 41, 25, 37, 21],
  ];

  const boardDensityLevels = buildBoardDensityLevels();

  function densityIndex(file, rank) {
    return rank * 8 + file;
  }

  function buildBoardDensityLevels() {
    const levels = Array(64).fill(2);
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const light = (file + rank) % 2 === 0;
        const random = hash(file * 73 + rank * 137);
        const drift = Math.floor((file + rank) / 5);
        levels[densityIndex(file, rank)] = clamp(1 + drift + (random > 0.62 ? 1 : 0) + (light ? 1 : 0), 1, 5);
      }
    }

    for (let pass = 0; pass < 12; pass += 1) {
      for (let rank = 0; rank < 8; rank += 1) {
        for (let file = 0; file < 8; file += 1) {
          if ((file + rank) % 2 !== 0) continue;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nf = file + dx;
            const nr = rank + dy;
            if (nf < 0 || nf >= 8 || nr < 0 || nr >= 8) return;
            const lightIndex = densityIndex(file, rank);
            const darkIndex = densityIndex(nf, nr);
            if (levels[lightIndex] > levels[darkIndex]) return;
            if (levels[darkIndex] < 5) {
              levels[lightIndex] = levels[darkIndex] + 1;
            } else {
              levels[darkIndex] = 4;
              levels[lightIndex] = 5;
            }
          });
        }
      }
    }

    return levels;
  }

  function boardDotMask(file, rank, xx, yy) {
    const density = boardDensity[boardDensityLevels[densityIndex(file, rank)] - 1];
    const limit = Math.round(density * 64);
    let mask = 0;

    for (let row = 0; row < DOT_H; row += 1) {
      for (let col = 0; col < DOT_W; col += 1) {
        const sx = file * board.sw * DOT_W + xx * DOT_W + col;
        const sy = rank * board.sh * DOT_H + yy * DOT_H + row;
        if (boardDither[sy & 7][sx & 7] < limit) mask |= brailleBit(col, row);
      }
    }

    return mask;
  }

  function boardCellStyle(file, rank) {
    return {
      bg: (file + rank) % 2 === 0 ? color.cellA : color.cellB,
      fg: color.boardParticle,
    };
  }

  function idx(x, y) {
    return y * COLS + x;
  }

  function put(x, y, c, fg = color.muted, bg = null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const i = idx(x, y);
    screen.ch[i] = c;
    screen.fg[i] = fg;
    if (bg) screen.bg[i] = bg;
  }

  function cellSpan(char) {
    return 1;
  }

  function text(x, y, value, fg = color.muted, bg = null) {
    let col = x;
    Array.from(String(value)).forEach((char) => {
      put(col, y, char, fg, bg);
      col += cellSpan(char);
    });
  }

  function fillArea(x, y, w, h, bg, fg = color.muted, c = " ") {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        const i = idx(col, row);
        screen.ch[i] = c;
        screen.fg[i] = fg;
        screen.bg[i] = bg;
      }
    }
  }

  function box({ x, y, w, h }, bg) {
    fillArea(x, y, w, h, bg);
    for (let col = x; col < x + w; col += 1) {
      put(col, y, "-", color.line, bg);
      put(col, y + h - 1, "-", color.line, bg);
    }
    for (let row = y; row < y + h; row += 1) {
      put(x, row, "|", color.line, bg);
      put(x + w - 1, row, "|", color.line, bg);
    }
    put(x, y, "+", color.line, bg);
    put(x + w - 1, y, "+", color.line, bg);
    put(x, y + h - 1, "+", color.line, bg);
    put(x + w - 1, y + h - 1, "+", color.line, bg);
  }

  function clearDotLayer() {
    dotLayer.mask.fill(0);
    dotLayer.power.fill(0);
    dotLayer.fg.fill(null);
  }

  function clearScreen() {
    fillArea(0, 0, COLS, ROWS, color.page, color.muted, " ");
    box(left, color.ink);
    box(right, color.ink2);
    clearDotLayer();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * nextDpr) || canvas.height !== Math.round(rect.height * nextDpr)) {
      dpr = nextDpr;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    cw = rect.width / COLS;
    ch = rect.height / ROWS;
    fontSize = Math.min(ch * 0.9, cw * 1.42);
    ctx.font = `700 ${fontSize}px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = false;
  }

  function square(name) {
    return { file: FILES.indexOf(name[0]), rank: 8 - Number(name[1]) };
  }

  function squareName(file, rank) {
    return `${FILES[file]}${8 - rank}`;
  }

  function squareFromEngine(name) {
    return square(name.toLowerCase());
  }

  function currentSide() {
    return boardState?.turn === "black" ? "kimi" : "codex";
  }

  function playerName(side) {
    return matchPlayers?.[side]?.name || "SELECTING";
  }

  function playerLabel(side, width = 12) {
    return playerName(side).padEnd(width).slice(0, width);
  }

  function sideTone(side) {
    return side === "codex" ? color.codex : color.kimi;
  }

  function activePlayerPhrase(side, suffix) {
    return `${playerName(side)} ${suffix}`.slice(0, 34);
  }

  function pickAI() {
    return AI_ROSTER[Math.floor(Math.random() * AI_ROSTER.length)];
  }

  function pieceTypeFromSymbol(symbol) {
    return SYMBOL_TO_TYPE[String(symbol).toLowerCase()] || "pawn";
  }

  function sideFromSymbol(symbol) {
    return symbol === symbol.toUpperCase() ? "codex" : "kimi";
  }

  function pieceAt(config, squareId) {
    return config?.pieces?.[squareId.toUpperCase()] || null;
  }

  function flattenMoves(movesMap) {
    return Object.entries(movesMap || {}).flatMap(([from, tos]) => tos.map((to) => ({ from, to })));
  }

  function materialDiff(config = boardState) {
    if (!config?.pieces) return 0;
    return Object.values(config.pieces).reduce((sum, symbol) => {
      const type = pieceTypeFromSymbol(symbol);
      const sign = sideFromSymbol(symbol) === "codex" ? 1 : -1;
      return sum + sign * VALUE[type];
    }, 0);
  }

  function materialScoreFor(config, side) {
    const diff = materialDiff(config);
    return side === "codex" ? diff : -diff;
  }

  function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
  }

  function seededJitter(move, salt = 0) {
    return hash(matchSeed + ply * 131 + move.from.charCodeAt(0) * 17 + move.to.charCodeAt(1) * 31 + salt);
  }

  function scoreMove(move, side, style) {
    const target = pieceAt(boardState, move.to);
    let score = target ? VALUE[pieceTypeFromSymbol(target)] * 120 : 0;
    const from = squareFromEngine(move.from);
    const to = squareFromEngine(move.to);
    const center = 7 - Math.abs(to.file - 3.5) - Math.abs(to.rank - 3.5);
    score += center * (style === "gambit" ? 8 : 5);
    score += (style === "mobility" ? 2 : 0) * (Math.abs(to.file - from.file) + Math.abs(to.rank - from.rank));

    let next = null;
    try {
      next = chessEngine.move(cloneConfig(boardState), move.from, move.to);
      score += materialScoreFor(next, side) * (style === "tactic" ? 24 : 12);
      if (next.checkMate) score += 10000;
      if (next.check) score += 90;
      if (style === "mobility") score += flattenMoves(chessEngine.moves(next)).length * 2;
    } catch (error) {
      return -999999;
    }

    if (style === "gambit" && !target) score += seededJitter(move, 301) * 180;
    return score + seededJitter(move, 701) * 18;
  }

  function chooseHeuristicMove(player, side) {
    const moves = flattenMoves(engineGame.moves());
    if (!moves.length) return null;
    const scored = moves
      .map((move) => ({ ...move, score: scoreMove(move, side, player.kind) }))
      .sort((a, b) => b.score - a.score);
    const width = player.kind === "gambit" ? 5 : 3;
    const pool = scored.slice(0, Math.min(width, scored.length));
    return pool[Math.floor(hash(matchSeed + ply * 47 + pool.length * 11) * pool.length)];
  }

  function chooseEngineMove(player) {
    const result = engineGame.ai({
      level: player.level,
      play: false,
      analysis: true,
      randomness: player.randomness,
      ttSizeMB: 0.5,
    });
    const move = result?.move ? Object.entries(result.move)[0] : null;
    if (!move) return null;
    return {
      from: move[0],
      to: move[1],
      score: result.bestScore ?? null,
      nodes: result.nodesSearched ?? null,
    };
  }

  function chooseAIMove(player, side) {
    if (!chessEngine || !engineGame) return null;
    return player.kind === "engine" ? chooseEngineMove(player) : chooseHeuristicMove(player, side);
  }

  function boardPos(file, rank) {
    return {
      x: board.x + file * board.sw + Math.floor(board.sw / 2),
      y: board.y + rank * board.sh + Math.floor(board.sh / 2),
    };
  }

  function piece(id, side, type, file, rank) {
    return { id, side, type, file, rank, seed: id.length * 67 + file * 11 + rank * 29 };
  }

  function syncPiecesFromBoard(config, movingPiece = null, movingTo = null) {
    const next = [];
    const used = new Set();
    Object.entries(config?.pieces || {}).forEach(([squareId, symbol]) => {
      const side = sideFromSymbol(symbol);
      const type = pieceTypeFromSymbol(symbol);
      const sq = squareFromEngine(squareId);
      let visual = null;

      if (movingPiece && movingTo && squareId.toLowerCase() === movingTo.toLowerCase()) {
        visual = movingPiece;
      } else {
        visual = pieces.find((p) => !used.has(p) && p.side === side && p.type === type && p.file === sq.file && p.rank === sq.rank);
      }

      if (!visual) visual = piece(`${side}-${type}-${squareId}-${matchSeed}`, side, type, sq.file, sq.rank);
      visual.side = side;
      visual.type = type;
      visual.file = sq.file;
      visual.rank = sq.rank;
      used.add(visual);
      next.push(visual);
    });
    pieces = next;
  }

  function reset(now = performance.now()) {
    pieces = [];
    fragments = [];
    ripples = [];
    active = null;
    aiThinking = false;
    selectingPlayers = true;
    matchResult = "";
    winnerSide = null;
    moveLog = [];
    moveCursor = 0;
    ply = 0;
    matchSeed = Math.floor(Math.random() * 1000000) + 1;
    matchPlayers = { codex: null, kimi: null };
    engineGame = null;
    boardState = null;
    nextMoveAt = Number.POSITIVE_INFINITY;

    const token = ++selectionToken;
    window.setTimeout(() => {
      if (token !== selectionToken) return;
      if (!chessEngine) {
        selectingPlayers = false;
        matchResult = "engine missing";
        winnerSide = null;
        return;
      }
      matchPlayers = { codex: pickAI(), kimi: pickAI() };
      engineGame = new chessEngine.Game();
      boardState = engineGame.exportJson();
      syncPiecesFromBoard(boardState);
      selectingPlayers = false;
      nextMoveAt = performance.now() + 520;
    }, 760);
  }

  function findPiece(file, rank, skip = null) {
    return pieces.find((p) => p !== skip && p.file === file && p.rank === rank);
  }

  function startMove(now) {
    if (paused || active || aiThinking || !engineGame || !boardState || matchResult) return;
    if (boardState.isFinished || boardState.checkMate || boardState.staleMate || ply >= MAX_PLIES || boardState.halfMove >= 100) {
      settleResult();
      return;
    }

    aiThinking = true;
    window.setTimeout(() => {
      if (paused || active || matchResult) {
        aiThinking = false;
        return;
      }

      const side = currentSide();
      const player = matchPlayers[side];
      const choice = chooseAIMove(player, side);
      aiThinking = false;
      if (!choice) {
        settleResult();
        return;
      }

      const from = squareFromEngine(choice.from);
      const to = squareFromEngine(choice.to);
      const targetSymbol = pieceAt(boardState, choice.to);
      const move = {
        side,
        from: choice.from.toLowerCase(),
        to: choice.to.toLowerCase(),
        flag: targetSymbol ? "x" : "",
        type: pieceTypeFromSymbol(pieceAt(boardState, choice.from)),
        ai: player.name,
        source: player.source,
        score: choice.score,
        nodes: choice.nodes,
      };

      primeActiveMove(now, move, from, to);
    }, 30);
  }

  function primeActiveMove(now, move, from, to) {
    let moving = findPiece(from.file, from.rank);
    if (!moving) {
      moving = piece(`ghost-${moveCursor}`, move.side, move.type || "pawn", from.file, from.rank);
      pieces.push(moving);
    }
    const target = findPiece(to.file, to.rank, moving);
    active = {
      move,
      moving,
      target,
      from,
      to,
      start: now,
      duration: reducedMotion ? 120 : 240,
      lastTrail: now,
    };
    ripple(boardPos(from.file, from.rank), move.side, 0.75);
    if (target) ripple(boardPos(to.file, to.rank), target.side, 1.05);
  }

  function finishMove(now) {
    const { move, moving, target, to } = active;
    let nextBoard = null;
    if (target) {
      pieces = pieces.filter((p) => p !== target);
      shatter(boardPos(to.file, to.rank), target.side, 36, 1.2);
    }
    try {
      nextBoard = engineGame.move(move.from, move.to);
    } catch (error) {
      matchResult = `engine error: ${move.from}-${move.to}`;
      winnerSide = null;
      active = null;
      return;
    }
    boardState = nextBoard || engineGame.exportJson();
    moving.file = to.file;
    moving.rank = to.rank;
    syncPiecesFromBoard(boardState, moving, move.to);
    if (boardState.checkMate) move.flag += "#";
    else if (boardState.check) move.flag += "+";
    move.type = moving.type;
    moveLog.push(move);
    moveCursor += 1;
    ply += 1;
    if (move.flag.includes("#")) shatter(boardPos(to.file, to.rank), moving.side, 62, 1.35);
    settleResult();
    active = null;
    nextMoveAt = now + 165;
  }

  function settleResult() {
    if (!boardState || matchResult) return;
    if (boardState.checkMate) {
      const winner = boardState.turn === "white" ? "kimi" : "codex";
      winnerSide = winner;
      matchResult = `checkmate - ${playerName(winner)} wins`;
    } else if (boardState.staleMate) {
      winnerSide = null;
      matchResult = "stalemate - draw";
    } else if (boardState.halfMove >= 100) {
      winnerSide = null;
      matchResult = "draw - 50 move rule";
    } else if (ply >= MAX_PLIES) {
      winnerSide = null;
      matchResult = "draw - move cap";
    }
  }

  function update(now, dt) {
    if (!paused) {
      if (now >= nextMoveAt) startMove(now);
      if (active) {
        const t = clamp((now - active.start) / active.duration, 0, 1);
        const pos = activeCharPosition(smooth(t));
        if (now - active.lastTrail > 42 && !reducedMotion) {
          trail(pos, active.move.side);
          active.lastTrail = now;
        }
        if (t >= 1) finishMove(now);
      }
      fragments = fragments.filter((g) => {
        g.x += (g.vx * dt) / 16.67;
        g.y += (g.vy * dt) / 16.67;
        g.vx *= 0.945;
        g.vy *= 0.945;
        return now - g.born < g.life;
      });
      ripples = ripples.filter((r) => now - r.born < r.life);
    }
  }

  function activeCharPosition(t) {
    const from = boardPos(active.from.file, active.from.rank);
    const to = boardPos(active.to.file, active.to.rank);
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
  }

  function shatter(origin, side, count, speed = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const a = hash(now + i * 17) * Math.PI * 2;
      const v = (0.35 + hash(i * 41 + now) * 1.05) * speed;
      fragments.push({
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

  function trail(origin, side) {
    const now = performance.now();
    for (let i = 0; i < 10; i += 1) {
      fragments.push({
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

  function ripple(origin, side, strength) {
    ripples.push({ x: origin.x, y: origin.y, side, strength, born: performance.now(), life: 660 });
  }

  function draw(now) {
    clearScreen();
    drawBoard(now);
    drawTerminalEffects(now);
    drawPieces(now);
    flushDotLayer();
    drawPanel();
    render();
  }

  function drawBoard(now) {
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const x0 = board.x + file * board.sw;
        const y0 = board.y + rank * board.sh;
        for (let yy = 0; yy < board.sh; yy += 1) {
          for (let xx = 0; xx < board.sw; xx += 1) {
            const style = boardCellStyle(file, rank);
            put(x0 + xx, y0 + yy, braille(boardDotMask(file, rank, xx, yy)), style.fg, style.bg);
          }
        }
      }
    }

    const side = active?.move.side || currentSide();
    if (selectingPlayers) {
      text(board.x + 2, board.y - 2, "SELECTING PLAYERS", color.header);
    } else {
      text(board.x + 2, board.y - 2, `${side === "codex" ? ">  " : "   "}${playerLabel("codex", 14)}`, side === "codex" ? color.codexAlt : color.dim);
      text(board.x + 24, board.y - 2, `${side === "kimi" ? ">  " : "   "}${playerLabel("kimi", 14)}`, side === "kimi" ? color.kimiAlt : color.dim);
    }

    for (let rank = 0; rank < 8; rank += 1) text(board.x - 3, board.y + rank * board.sh + 1, String(8 - rank), color.dim);
    for (let file = 0; file < 8; file += 1) text(board.x + file * board.sw + 4, board.y + board.h + 1, FILES[file], color.dim);

    if (!chessEngine) {
      text(board.x, board.y + board.h + 3, "ENGINE MISSING", color.red);
    } else if (selectingPlayers) {
      text(board.x, board.y + board.h + 3, "selecting AI players", color.header);
    } else if (matchResult) {
      text(board.x, board.y + board.h + 3, matchResult.toUpperCase(), matchResult.includes("wins") ? color.red : color.dim);
    } else if (aiThinking) {
      text(board.x, board.y + board.h + 3, activePlayerPhrase(side, "thinking"), sideTone(side));
    } else {
      text(board.x, board.y + board.h + 3, activePlayerPhrase(side, "to move"), sideTone(side));
    }
  }

  function drawPieces(now) {
    const moving = active?.moving || null;
    pieces.forEach((p) => {
      if (p !== moving) drawPieceAt(p, boardPos(p.file, p.rank), now, 1);
    });
    if (active) {
      const t = clamp((now - active.start) / active.duration, 0, 1);
      if (active.target && t < 0.7) {
        drawPieceAt(active.target, boardPos(active.to.file, active.to.rank), now, 1 - clamp((t - 0.22) / 0.48, 0, 1));
      }
      drawPieceAt(active.moving, activeCharPosition(smooth(t)), now, 0.78 + Math.sin(t * Math.PI) * 0.22);
    }
  }

  function drawPieceAt(p, pos, now, alpha = 1) {
    const mask = pieceMasks[p.type] || pieceMasks.pawn;
    const fg = p.side === "codex" ? color.white : color.kimi;
    const alt = p.side === "codex" ? color.codexAlt : color.kimiAlt;
    const x0 = Math.round(pos.x * DOT_W - mask.width / 2 + 1);
    const y0 = Math.round(pos.y * DOT_H - mask.height / 2);

    for (let y = 0; y < mask.height; y += 1) {
      const row = mask.rows[y];
      for (let x = 0; x < mask.width; x += 1) {
        if (row[x] === " ") continue;
        const noise = hash(x * 13 + y * 29 + p.seed);
        const keep = alpha * (0.88 + hash(p.seed + x * 5 + y * 7) * 0.1);
        if (noise > keep) continue;
        const edge = isMaskEdge(mask, x, y);
        const power = clamp(alpha * (edge ? 0.76 : 0.98), 0.2, 1);
        setSubPx(x0 + x, y0 + y, noise > 0.56 ? alt : fg, power);
      }
    }
  }

  function isMaskEdge(mask, x, y) {
    const at = (xx, yy) => yy >= 0 && yy < mask.height && xx >= 0 && xx < mask.width && mask.rows[yy][xx] !== " ";
    return !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
  }

  function drawTerminalEffects(now) {
    ripples.forEach((r) => {
      const age = (now - r.born) / r.life;
      const radius = lerp(1.4, 10 * r.strength, smooth(age));
      const thickness = lerp(0.7, 0.22, age);
      const cx = r.x * DOT_W;
      const cy = r.y * DOT_H;
      const fg = r.side === "codex" ? color.codex : color.kimiAlt;
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
          setSubPx(sx, sy, fg, clamp((1 - age) * 0.72, 0.12, 0.78));
        }
      }
    });

    fragments.forEach((g, i) => {
      const age = (now - g.born) / g.life;
      const fg = g.side === "codex" ? color.codex : color.kimiAlt;
      const radius = g.kind === "trail" ? 3 : 1;
      const cx = Math.round(g.x * DOT_W);
      const cy = Math.round(g.y * DOT_H);
      for (let sy = -radius; sy <= radius; sy += 1) {
        for (let sx = -radius; sx <= radius; sx += 1) {
          const d = Math.sqrt(sx * sx + sy * sy);
          if (d > radius + 0.3) continue;
          if (hash(i * 31 + sx * 11 + sy * 19 + Math.floor(age * 23)) > 0.84 - age * 0.32) continue;
          setSubPx(cx + sx, cy + sy, fg, clamp((1 - age) * (g.kind === "trail" ? 0.45 : 0.7), 0.1, 0.78));
        }
      }
    });
  }

  function setSubPx(sx, sy, fg, power = 1) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    if (sx < board.x * DOT_W || sy < board.y * DOT_H || sx >= (board.x + board.w) * DOT_W || sy >= (board.y + board.h) * DOT_H) return;
    const x = Math.floor(sx / DOT_W);
    const y = Math.floor(sy / DOT_H);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const bit = brailleBit(sx, sy);
    const i = idx(x, y);
    dotLayer.mask[i] |= bit;
    if (power >= dotLayer.power[i]) {
      dotLayer.power[i] = power;
      dotLayer.fg[i] = fg;
    }
  }

  function flushDotLayer() {
    for (let y = board.y; y < board.y + board.h; y += 1) {
      for (let x = board.x; x < board.x + board.w; x += 1) {
        const i = idx(x, y);
        const mask = dotLayer.mask[i];
        if (!mask) continue;
        put(x, y, glyphForMask(mask, dotLayer.power[i]), dotLayer.fg[i] || color.white);
      }
    }
  }

  function glyphForMask(mask, power) {
    if (power < 0.28 && mask !== 0xff) {
      mask &= 0x49;
      if (!mask) mask = 0x01;
    }
    return braille(mask);
  }

  function drawPanel() {
    const x = right.x + 3;
    const gameDone = Boolean(matchResult);
    const side = active?.move.side || currentSide();
    const diff = materialDiff();
    replayButton = null;
    const codexWon = winnerSide === "codex" ? 1 : 0;
    const kimiWon = winnerSide === "kimi" ? 1 : 0;

    text(x, 3, "v MATCH", color.header);
    if (selectingPlayers) {
      text(x, 6, "正在选择对棋双方", color.header);
      text(x, 9, "sampling local AI roster", color.dim);
      for (let y = 2; y < 42; y += 1) put(right.x + right.w - 2, y, BRAILLE_FULL, color.blue, "#003852");
      for (let y = 42; y < right.y + right.h - 2; y += 1) put(right.x + right.w - 2, y, BRAILLE_DUST, "#13222a", color.black);
      text(x, 57, "1 2 3 fold   jk scroll   r reload", color.dim);
      return;
    }

    text(x, 6, `${side === "codex" && !gameDone ? "> " : "  "}${playerLabel("codex", 18)}`, color.codex);
    text(x + 25, 6, String(codexWon), color.white);
    text(x + 28, 6, "won", color.dim);
    text(x, 8, `${side === "kimi" && !gameDone ? "> " : "  "}${playerLabel("kimi", 18)}`, color.kimi);
    text(x + 25, 8, String(kimiWon), color.white);
    text(x + 28, 8, "won", color.dim);
    text(x, 13, "ply", color.dim);
    text(x + 6, 13, String(ply), color.white);
    text(x + 15, 13, "move", color.dim);
    text(x + 22, 13, String(ply ? Math.ceil(ply / 2) : 0), color.white);
    const statusText = !chessEngine ? "engine missing" : gameDone ? matchResult : aiThinking ? activePlayerPhrase(side, "thinking") : activePlayerPhrase(side, "to move");
    text(x, 15, statusText.slice(0, 34), gameDone || !chessEngine ? color.red : sideTone(side));
    if (gameDone) {
      replayButton = { x, y: 17, w: 16, h: 1 };
      text(x, 17, "[ PLAY AGAIN ]", color.white);
      text(x, 19, "click or press r", color.dim);
    }

    text(x, 21, "v MATERIAL", color.header);
    if (diff === 0) {
      text(x, 24, `level   ${BRAILLE_DUST.repeat(16)}`, color.dim);
    } else {
      const leading = diff > 0 ? playerLabel("codex", 12) : playerLabel("kimi", 12);
      const bar = clamp(Math.round(Math.abs(diff)), 2, 16);
      text(x, 24, `${leading.trim()} +${Math.abs(diff)}`, diff > 0 ? color.codex : color.kimi);
      text(x, 26, BRAILLE_FULL.repeat(bar) + BRAILLE_DUST.repeat(16 - bar), color.blue);
      text(x, 28, `ahead by ${Math.abs(diff)} points`, color.dim);
    }

    text(x, 34, "v MOVES", color.header);
    if (!moveLog.length) {
      text(x, 37, "no moves yet", color.dim);
    } else {
      const visible = moveLog.map((m, i) => ({ ...m, ply: i + 1 })).reverse().slice(0, 10);
      visible.forEach((m, i) => {
        const row = 37 + i * 2;
        const moveNo = Math.ceil(m.ply / 2);
        const type = movedTypeFor(m);
        const action = m.flag.includes("x") ? "x" : "->";
        text(x + 1, row, `${moveNo}.`, color.dim);
        text(x + 6, row, String(m.ai || playerName(m.side)).padEnd(10).slice(0, 10), sideTone(m.side));
        text(x + 18, row, TAG[type] || "P", color.white);
        text(x + 22, row, `${m.from}${action}${m.to}`, color.dim);
        text(x + 36, row, m.flag, m.flag.includes("#") ? color.red : color.white);
      });
    }

    for (let y = 2; y < 42; y += 1) put(right.x + right.w - 2, y, BRAILLE_FULL, color.blue, "#003852");
    for (let y = 42; y < right.y + right.h - 2; y += 1) put(right.x + right.w - 2, y, BRAILLE_DUST, "#13222a", color.black);
    text(x, 57, "1 2 3 fold   jk scroll   r reload", color.dim);
  }

  function movedTypeFor(move) {
    return move.type || "pawn";
  }

  function render() {
    ctx.fillStyle = color.page;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.font = `700 ${fontSize}px ${FONT}`;
    ctx.textBaseline = "middle";

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = idx(x, y);
        ctx.fillStyle = screen.bg[i] || color.ink;
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
      }
    }

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = idx(x, y);
        const c = screen.ch[i];
        if (!c || c === " ") continue;
        ctx.fillStyle = screen.fg[i] || color.muted;
        ctx.fillText(c, x * cw + cw * 0.02, y * ch + ch * 0.55);
      }
    }
  }

  function frame(now) {
    resize();
    const dt = Math.min(50, lastFrame ? now - lastFrame : 16);
    lastFrame = now;
    update(now, dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  function cellFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * COLS),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * ROWS),
    };
  }

  function hitsReplayButton(cell) {
    return Boolean(
      replayButton &&
      cell.x >= replayButton.x &&
      cell.x < replayButton.x + replayButton.w &&
      cell.y >= replayButton.y &&
      cell.y < replayButton.y + replayButton.h
    );
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (event.key === " ") paused = !paused;
    if (event.key.toLowerCase() === "r") reset(performance.now());
  });
  canvas.addEventListener("click", (event) => {
    if (hitsReplayButton(cellFromPointer(event))) reset(performance.now());
  });
  canvas.addEventListener("mousemove", (event) => {
    canvas.style.cursor = hitsReplayButton(cellFromPointer(event)) ? "pointer" : "default";
  });
  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
  });

  reset(performance.now());
  requestAnimationFrame(frame);
})();

