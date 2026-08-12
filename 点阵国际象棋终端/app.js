(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const seedForm = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));

  const COLS = 126;
  const ROWS = 60;
  const FILES = "abcdefgh";
  const TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  const VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
  const TAG = { pawn: "P", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" };
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const Chess = window.ChessJS?.Chess;
  const jceEngine = window.JSChessEngine;

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
    whiteSide: "#9bf6ff",
    whiteSideAlt: "#dffcff",
    blackSide: "#f6a33b",
    blackSideAlt: "#ffd269",
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
  const FIFTY_MOVE_HALF_MOVES = 100;
  const AI_MOVE_TIMEOUT_MS = 10000;
  const PLAYBACK_SPEEDS = [0.5, 1, 2, 4];
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SYMBOL_TO_TYPE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const TYPE_TO_SYMBOL = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };
  const STOCKFISH_JS = "vendor/stockfish-18-lite-single.js";
  const STOCKFISH_WASM = "stockfish-18-lite-single.wasm";
  const MATCH_MODES = {
    deterministic: { label: "REPLAY", detail: "deterministic replay" },
    live: { label: "LIVE", detail: "full engine live" },
  };
  const DEFAULT_MATCH_MODE = "deterministic";
  const AI_ROSTER = [
    { name: "JCE-SPARK", source: "js-chess-engine", kind: "engine", level: 1, liveRandomness: 90 },
    { name: "JCE-SEARCH", source: "js-chess-engine", kind: "engine", level: 2, liveRandomness: 60 },
    { name: "JCE-DEEP", source: "js-chess-engine", kind: "engine", level: 3, liveRandomness: 25 },
    { name: "JCE-ELITE", source: "js-chess-engine", kind: "engine", level: 4, liveRandomness: 8 },
    { name: "TACTIC", source: "local heuristic", kind: "tactic" },
    { name: "MOBILITY", source: "local heuristic", kind: "mobility" },
    { name: "GAMBIT", source: "local heuristic", kind: "gambit" },
    { name: "CENTER", source: "local heuristic", kind: "center" },
    { name: "TRADER", source: "local heuristic", kind: "trader" },
    { name: "HUNTER", source: "local heuristic", kind: "hunter" },
    { name: "SENTINEL", source: "local heuristic", kind: "sentinel" },
    { name: "CHAOS", source: "local heuristic", kind: "chaos" },
    { name: "STOCKFISH-DEPTH3", source: "stockfish.js", kind: "stockfish", depth: 3, liveMovetime: 120, liveSkill: 2 },
    { name: "STOCKFISH-DEPTH5", source: "stockfish.js", kind: "stockfish", depth: 5, liveMovetime: 240, liveSkill: 6 },
    { name: "STOCKFISH-DEPTH7", source: "stockfish.js", kind: "stockfish", depth: 7, liveMovetime: 420, liveSkill: 10 },
    { name: "STOCKFISH-DEPTH9", source: "stockfish.js", kind: "stockfish", depth: 9, liveMovetime: 700, liveSkill: 14 },
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
  let matchPlayers = { white: null, black: null };
  let moveLog = [];
  let moveScroll = 0;
  let aiThinking = false;
  let selectingPlayers = true;
  let selectionToken = 0;
  let matchResult = "";
  let matchEndReason = "";
  let winnerSide = null;
  let timeoutSide = null;
  let matchSeedText = "".padEnd(SEED_LENGTH, " ");
  let matchSeedCode = 1;
  let matchRng = () => 0.5;
  let matchMode = DEFAULT_MATCH_MODE;
  let positionCounts = new Map();
  let aiMoveTimer = null;
  let aiMoveToken = 0;
  let paused = false;
  let playbackSpeedIndex = 1;
  let lastFrame = 0;
  let replayButton = null;
  let seedStatusTimer = null;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const playbackSpeed = () => PLAYBACK_SPEEDS[playbackSpeedIndex] || 1;
  const playbackDelay = (ms, min = 16) => Math.max(min, ms / playbackSpeed());
  const hash = (n) => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const hashUint32 = (value, salt = 0) => {
    const textValue = String(value);
    let h = (0x811c9dc5 ^ salt) >>> 0;
    for (let i = 0; i < textValue.length; i += 1) {
      h ^= textValue.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const createRng = (seed, stream) => {
    let state = hashUint32(`${seed}|${stream}`, 0x9e3779b9) || 0x6d2b79f5;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const seededUnit = (...parts) => hashUint32(`${matchSeedText}|${parts.join("|")}`, 0x7f4a7c15) / 4294967296;

  function normalizeMatchMode(mode) {
    return MATCH_MODES[mode] ? mode : DEFAULT_MATCH_MODE;
  }

  function isReplayMode() {
    return matchMode === "deterministic";
  }

  function modeLabel(mode = matchMode) {
    return MATCH_MODES[normalizeMatchMode(mode)].label;
  }

  function modeDetail(mode = matchMode) {
    return MATCH_MODES[normalizeMatchMode(mode)].detail;
  }

  function modeTone() {
    return isReplayMode() ? color.blue : color.red;
  }

  function modeRandom(...parts) {
    return isReplayMode() ? seededUnit("mode-rng", ...parts) : Math.random();
  }

  function withSeededMathRandom(stream, fn) {
    if (!isReplayMode()) return fn();
    const originalRandom = Math.random;
    Math.random = createRng(matchSeedText, stream);
    try {
      return fn();
    } finally {
      Math.random = originalRandom;
    }
  }

  function syncModeButtons() {
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === matchMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setMatchMode(mode, restart = false) {
    const nextMode = normalizeMatchMode(mode);
    if (nextMode === matchMode && !restart) return;
    matchMode = nextMode;
    syncModeButtons();
    if (restart) reset(performance.now());
  }

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

  function sanitizeSeedValue(value) {
    const source = String(value);
    let clean = "";
    for (let i = 0; i < source.length && clean.length < SEED_LENGTH; i += 1) {
      const char = source[i];
      const code = char.charCodeAt(0);
      if (code >= ASCII_FIRST && code <= ASCII_LAST) clean += char;
    }
    return clean;
  }

  function normalizeSeed(value) {
    return sanitizeSeedValue(value).slice(0, SEED_LENGTH).padEnd(SEED_LENGTH, " ");
  }

  function generateAsciiSeed() {
    const bytes = new Uint8Array(SEED_LENGTH);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (byte) => RANDOM_SEED_CHARS[byte % RANDOM_SEED_CHARS.length]).join("");
  }

  function seedDigest(seed = matchSeedText) {
    return hashUint32(`${seed}|digest`, 0xb5297a4d).toString(16).padStart(8, "0").toUpperCase();
  }

  function setSeedStatus(message, temporary = false) {
    if (!seedStatus) return;
    window.clearTimeout(seedStatusTimer);
    seedStatus.textContent = message;
    if (temporary) {
      seedStatusTimer = window.setTimeout(() => {
        seedStatus.textContent = `SEED ${seedDigest()}`;
      }, 900);
    }
  }

  function updateSeedInputStatus() {
    if (!seedInput) return;
    const clean = sanitizeSeedValue(seedInput.value);
    if (clean !== seedInput.value) seedInput.value = clean;
    setSeedStatus(`LEN ${String(clean.length).padStart(3, "0")}/100`);
  }

  function prepareMatchSeed(forceRandom = false, seedOverride = null) {
    const hasOverride = typeof seedOverride === "string";
    const typed = sanitizeSeedValue(hasOverride ? seedOverride : seedInput?.value || "");
    const autoSeed = !hasOverride && (forceRandom || typed.trim().length === 0);
    const base = autoSeed ? generateAsciiSeed() : typed;
    matchSeedText = normalizeSeed(base);
    matchSeedCode = hashUint32(`${matchSeedText}|pieces`, 0x68e31da4) || 1;
    matchRng = createRng(matchSeedText, "match");
    if (seedInput) seedInput.value = matchSeedText;
    setSeedStatus(`${autoSeed ? "AUTO" : "SEED"} ${seedDigest()}`);
  }

  function fallbackCopySeed(seed) {
    const proxy = document.createElement("textarea");
    proxy.value = seed;
    proxy.setAttribute("readonly", "");
    proxy.style.position = "fixed";
    proxy.style.left = "-9999px";
    proxy.style.opacity = "0";
    document.body.appendChild(proxy);
    proxy.focus();
    proxy.select();
    const copied = document.execCommand("copy");
    proxy.remove();
    return copied;
  }

  function copyCurrentSeed() {
    const draft = sanitizeSeedValue(seedInput?.value || "");
    const seed = draft.trim().length ? normalizeSeed(draft) : matchSeedText;
    const markCopied = () => setSeedStatus("COPIED 100 CHARS", true);
    const markFailed = () => setSeedStatus("COPY FAILED", true);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(seed).then(markCopied).catch(() => {
        try {
          if (fallbackCopySeed(seed)) markCopied();
          else markFailed();
        } catch (error) {
          markFailed();
        }
      });
      return;
    }

    try {
      if (fallbackCopySeed(seed)) markCopied();
      else markFailed();
    } catch (error) {
      markFailed();
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

  function symbolFromChessPiece(piece) {
    if (!piece) return null;
    return piece.color === "w" ? piece.type.toUpperCase() : piece.type.toLowerCase();
  }

  function boardConfigFromGame(game = engineGame) {
    if (!game) return null;
    const fenParts = game.fen().split(" ");
    const castling = fenParts[2] || "-";
    const pieces = {};
    game.board().flat().forEach((piece) => {
      if (piece) pieces[piece.square.toUpperCase()] = symbolFromChessPiece(piece);
    });
    return {
      pieces,
      turn: game.turn() === "b" ? "black" : "white",
      isFinished: game.isCheckmate() || game.isStalemate() || game.isDrawByFiftyMoves() || game.isThreefoldRepetition(),
      check: game.isCheck(),
      checkMate: game.isCheckmate(),
      staleMate: game.isStalemate(),
      castling: {
        whiteShort: castling.includes("K"),
        whiteLong: castling.includes("Q"),
        blackShort: castling.includes("k"),
        blackLong: castling.includes("q"),
      },
      enPassant: fenParts[3] && fenParts[3] !== "-" ? fenParts[3].toUpperCase() : null,
      halfMove: Number(fenParts[4]) || 0,
      fullMove: Number(fenParts[5]) || 1,
      fen: game.fen(),
    };
  }

  function currentSide() {
    return boardState?.turn === "black" ? "black" : "white";
  }

  function otherSide(side) {
    return side === "white" ? "black" : "white";
  }

  function halfMoveClock(config = boardState) {
    const value = config?.halfMove ?? config?.halfMoveClock ?? 0;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function sortedObjectSignature(value) {
    if (!value || typeof value !== "object") return "";
    return Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}:${item}`)
      .join(",");
  }

  function positionKey(config = boardState) {
    if (!config) return "";
    return [
      config.turn || "white",
      sortedObjectSignature(config.pieces),
      sortedObjectSignature(config.castling),
      config.enPassant || "-",
    ].join("|");
  }

  function recordPosition(config = boardState) {
    const key = positionKey(config);
    if (!key) return 0;
    const count = (positionCounts.get(key) || 0) + 1;
    positionCounts.set(key, count);
    return count;
  }

  function currentPositionCount(config = boardState) {
    const key = positionKey(config);
    return key ? positionCounts.get(key) || 0 : 0;
  }

  function hasRuleDraw(config = boardState) {
    if (engineGame) return engineGame.isDrawByFiftyMoves() || engineGame.isThreefoldRepetition();
    return halfMoveClock(config) >= FIFTY_MOVE_HALF_MOVES || currentPositionCount(config) >= 3;
  }

  function clearAiMoveTimer() {
    if (aiMoveTimer) window.clearTimeout(aiMoveTimer);
    aiMoveTimer = null;
  }

  function markTimeoutLoss(side, elapsedMs = AI_MOVE_TIMEOUT_MS) {
    if (matchResult) return;
    clearAiMoveTimer();
    aiThinking = false;
    active = null;
    nextMoveAt = Number.POSITIVE_INFINITY;
    timeoutSide = side;
    winnerSide = otherSide(side);
    matchEndReason = "timeout";
    matchResult = `timeout - ${playerName(side)} forfeits after ${Math.ceil(elapsedMs / 1000)}s`;
  }

  function markEngineError(message) {
    matchEndReason = "engine-error";
    matchResult = message;
    winnerSide = null;
    timeoutSide = null;
    aiThinking = false;
    active = null;
    nextMoveAt = Number.POSITIVE_INFINITY;
  }

  function markCheckmateWin(side) {
    if (matchResult) return;
    clearAiMoveTimer();
    aiThinking = false;
    active = null;
    timeoutSide = null;
    winnerSide = side;
    matchEndReason = "checkmate";
    matchResult = `checkmate - ${playerName(side)} wins`;
    nextMoveAt = Number.POSITIVE_INFINITY;
  }

  function markDraw(reason, message) {
    if (matchResult) return;
    clearAiMoveTimer();
    aiThinking = false;
    active = null;
    timeoutSide = null;
    winnerSide = null;
    matchEndReason = reason;
    matchResult = message;
    nextMoveAt = Number.POSITIVE_INFINITY;
  }

  function markStalemateDraw() {
    markDraw("stalemate", "stalemate - draw");
  }

  function settleNoLegalMoves() {
    if (!engineGame || !boardState || matchResult) return false;
    let moves = [];
    try {
      moves = legalMoves();
    } catch (error) {
      markEngineError(`engine error: ${playerName(currentSide())} legal move scan failed`);
      return true;
    }
    if (moves.length > 0) return false;
    if (boardState.check) markCheckmateWin(otherSide(currentSide()));
    else markStalemateDraw();
    return true;
  }

  function playerName(side) {
    return matchPlayers?.[side]?.name || "SELECTING";
  }

  function playerLabel(side, width = 12) {
    return playerName(side).padEnd(width).slice(0, width);
  }

  function sideTone(side) {
    return side === "white" ? color.whiteSide : color.blackSide;
  }

  function effectTone(side) {
    return side === "white" ? color.whiteSide : color.red;
  }

  function activePlayerPhrase(side, suffix) {
    return `${playerName(side)} ${suffix}`.slice(0, 34);
  }

  function canUseStockfish() {
    return typeof Worker === "function" && location.protocol !== "file:";
  }

  function availableAI() {
    return AI_ROSTER.filter((ai) => {
      if (ai.kind === "engine") return Boolean(jceEngine);
      if (ai.kind === "stockfish") return canUseStockfish();
      return true;
    });
  }

  function findAI(name) {
    return AI_ROSTER.find((ai) => ai.name === name) || null;
  }

  function resolveForcedPlayer(player) {
    if (!player) return null;
    if (typeof player === "string") return findAI(player);
    if (player.name) return findAI(player.name) || player;
    return null;
  }

  function pickPlayers(forcedPlayers = null) {
    return {
      white: resolveForcedPlayer(forcedPlayers?.white) || pickAI(),
      black: resolveForcedPlayer(forcedPlayers?.black) || pickAI(),
    };
  }

  function pickAI() {
    const roster = availableAI();
    return roster[Math.floor(matchRng() * roster.length)];
  }

  function pieceTypeFromSymbol(symbol) {
    return SYMBOL_TO_TYPE[String(symbol).toLowerCase()] || "pawn";
  }

  function sideFromSymbol(symbol) {
    return symbol === symbol.toUpperCase() ? "white" : "black";
  }

  function pieceAt(config, squareId) {
    return config?.pieces?.[squareId.toUpperCase()] || config?.pieces?.[squareId.toLowerCase()] || null;
  }

  function normalizeMove(move) {
    if (!move) return null;
    return {
      from: String(move.from).toLowerCase(),
      to: String(move.to).toLowerCase(),
      piece: move.piece || null,
      captured: move.captured || null,
      promotion: move.promotion || null,
      flags: move.flags || "",
      san: move.san || "",
      after: move.after || null,
      score: move.score ?? null,
      nodes: move.nodes ?? null,
    };
  }

  function flattenMoves(movesSource) {
    if (Array.isArray(movesSource)) return movesSource.map(normalizeMove).filter(Boolean);
    return Object.entries(movesSource || {}).flatMap(([from, tos]) => tos.map((to) => normalizeMove({ from, to })));
  }

  function legalMoves() {
    return flattenMoves(engineGame?.moves({ verbose: true }) || []);
  }

  function materialDiff(config = boardState) {
    if (!config?.pieces) return 0;
    return Object.values(config.pieces).reduce((sum, symbol) => {
      const type = pieceTypeFromSymbol(symbol);
      const sign = sideFromSymbol(symbol) === "white" ? 1 : -1;
      return sum + sign * VALUE[type];
    }, 0);
  }

  function materialScoreFor(config, side) {
    const diff = materialDiff(config);
    return side === "white" ? diff : -diff;
  }

  function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
  }

  function moveJitter(move, salt = 0) {
    return modeRandom("jitter", ply, move.from, move.to, salt);
  }

  function configAfterMove(move) {
    if (move.after) return boardConfigFromGame(new Chess(move.after));
    const trial = new Chess(engineGame.fen());
    trial.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    return boardConfigFromGame(trial);
  }

  function scoreMove(move, side, style) {
    const target = pieceAt(boardState, move.to);
    const captured = move.captured || target;
    let score = captured ? VALUE[pieceTypeFromSymbol(captured)] * 120 : 0;
    const from = squareFromEngine(move.from);
    const to = squareFromEngine(move.to);
    const center = 7 - Math.abs(to.file - 3.5) - Math.abs(to.rank - 3.5);
    const distance = Math.abs(to.file - from.file) + Math.abs(to.rank - from.rank);
    score += center * (style === "center" ? 16 : style === "gambit" ? 8 : 5);
    score += (style === "mobility" || style === "hunter" ? 3 : 0) * distance;

    let next = null;
    try {
      next = configAfterMove(move);
      const nextGame = new Chess(next.fen);
      const nextMobility = nextGame.moves().length;
      score += materialScoreFor(next, side) * (style === "tactic" || style === "trader" ? 24 : 12);
      if (next.checkMate) score += 10000;
      if (next.check) score += 90;
      if (style === "mobility") score += nextMobility * 2;
      if (style === "sentinel") score -= nextMobility * 1.5;
    } catch (error) {
      return -999999;
    }

    if (style === "gambit" && !captured) score += moveJitter(move, 301) * 180;
    if (style === "hunter" && captured) score += 160;
    if (style === "chaos") score += moveJitter(move, 901) * 320;
    return score + moveJitter(move, 701) * 18;
  }

  function chooseHeuristicMove(player, side) {
    const moves = legalMoves();
    if (!moves.length) return null;
    const scored = moves
      .map((move) => ({ ...move, score: scoreMove(move, side, player.kind) }))
      .sort((a, b) => b.score - a.score);
    const width = player.kind === "gambit" || player.kind === "chaos" ? 5 : 3;
    const pool = scored.slice(0, Math.min(width, scored.length));
    return pool[Math.floor(modeRandom("pool", ply, player.name, side, pool.length) * pool.length)];
  }

  function chooseEngineMove(player) {
    if (!jceEngine) return null;
    const jceGame = new jceEngine.Game(cloneConfig(boardState));
    const options = {
      level: player.level,
      play: false,
      analysis: true,
      randomness: isReplayMode() ? 0 : player.liveRandomness || 0,
      ttSizeMB: 0.5,
    };
    const result = withSeededMathRandom(`jce|${ply}|${player.name}|${engineGame.fen()}`, () => jceGame.ai(options));
    const move = result?.move ? Object.entries(result.move)[0] : null;
    if (!move) return null;
    return {
      from: move[0],
      to: move[1],
      score: result.bestScore ?? null,
      nodes: result.nodesSearched ?? null,
    };
  }

  function stockfishWorkerPath() {
    return `${STOCKFISH_JS}#${STOCKFISH_WASM}`;
  }

  function moveFromUci(uci) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    return normalizeMove({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || null,
    });
  }

  function selectStockfishMove(bestUci, multiPvMoves, player) {
    if (isReplayMode()) {
      const width = Math.min(player.replayMultiPV || 1, multiPvMoves.size);
      if (width > 1) {
        const choices = Array.from(multiPvMoves.entries())
          .sort(([a], [b]) => a - b)
          .slice(0, width)
          .map(([, uci]) => uci);
        const index = Math.floor(seededUnit("stockfish-multipv", ply, player.name, engineGame.fen(), choices.length) * choices.length);
        return moveFromUci(choices[index]) || moveFromUci(bestUci);
      }
    }
    return moveFromUci(bestUci);
  }

  function chooseStockfishMove(player, timeoutMs = AI_MOVE_TIMEOUT_MS) {
    if (!canUseStockfish()) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      let worker = null;
      let finished = false;
      const multiPvMoves = new Map();
      const finish = (move, error = null) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        try {
          worker?.terminate();
        } catch {}
        if (error) reject(error);
        else resolve(move);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      try {
        worker = new Worker(stockfishWorkerPath());
      } catch (error) {
        finish(null, error);
        return;
      }
      worker.onerror = (event) => finish(null, new Error(event.message || "stockfish worker failed"));
      worker.onmessage = (event) => {
        const line = String(event.data || "");
        if (line === "uciok") {
          if (isReplayMode()) {
            worker.postMessage("setoption name Threads value 1");
            worker.postMessage("setoption name Hash value 16");
            worker.postMessage(`setoption name MultiPV value ${player.replayMultiPV || 1}`);
          } else {
            worker.postMessage(`setoption name Skill Level value ${player.liveSkill ?? 8}`);
            worker.postMessage("setoption name MultiPV value 1");
          }
          worker.postMessage("ucinewgame");
          worker.postMessage("isready");
        } else if (line === "readyok") {
          worker.postMessage(`position fen ${engineGame.fen()}`);
          if (isReplayMode()) worker.postMessage(`go depth ${player.depth || 5}`);
          else worker.postMessage(`go movetime ${player.liveMovetime || player.movetime || 250}`);
        } else if (line.startsWith("info ")) {
          const match = line.match(/\bmultipv\s+(\d+)\b.*\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
          if (match) multiPvMoves.set(Number(match[1]), match[2]);
        } else if (line.startsWith("bestmove")) {
          const uci = line.split(/\s+/)[1];
          finish(selectStockfishMove(uci, multiPvMoves, player));
        }
      };
      worker.postMessage("uci");
    });
  }

  function chooseAIMove(player, side, timeoutMs = AI_MOVE_TIMEOUT_MS) {
    if (!engineGame) return null;
    if (player.kind === "engine") return chooseEngineMove(player);
    if (player.kind === "stockfish") return chooseStockfishMove(player, timeoutMs);
    return chooseHeuristicMove(player, side);
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

      if (!visual) visual = piece(`${side}-${type}-${squareId}-${matchSeedCode}`, side, type, sq.file, sq.rank);
      visual.side = side;
      visual.type = type;
      visual.file = sq.file;
      visual.rank = sq.rank;
      used.add(visual);
      next.push(visual);
    });
    pieces = next;
  }

  function reset(now = performance.now(), options = {}) {
    if (options.mode) matchMode = normalizeMatchMode(options.mode);
    syncModeButtons();
    clearAiMoveTimer();
    aiMoveToken += 1;
    pieces = [];
    fragments = [];
    ripples = [];
    active = null;
    aiThinking = false;
    selectingPlayers = true;
    matchResult = "";
    matchEndReason = "";
    winnerSide = null;
    timeoutSide = null;
    moveLog = [];
    moveScroll = 0;
    moveCursor = 0;
    ply = 0;
    prepareMatchSeed(Boolean(options.forceRandom), options.seedOverride ?? null);
    matchPlayers = { white: null, black: null };
    engineGame = new Chess();
    boardState = boardConfigFromGame(engineGame);
    positionCounts = new Map();
    if (boardState) recordPosition(boardState);
    if (boardState) syncPiecesFromBoard(boardState);
    nextMoveAt = Number.POSITIVE_INFINITY;

    const token = ++selectionToken;
    if (options.immediatePlayers) {
      matchPlayers = pickPlayers(options.players);
      selectingPlayers = false;
      nextMoveAt = Number.POSITIVE_INFINITY;
      return;
    }

    window.setTimeout(() => {
      if (token !== selectionToken) return;
      matchPlayers = pickPlayers(options.players);
      selectingPlayers = false;
      nextMoveAt = performance.now() + playbackDelay(520);
    }, playbackDelay(760));
  }

  function findPiece(file, rank, skip = null) {
    return pieces.find((p) => p !== skip && p.file === file && p.rank === rank);
  }

  function buildMoveRecord(choice, side, player) {
    const capturedSymbol = choice.captured || pieceAt(boardState, choice.to);
    const movedSymbol = choice.piece || pieceAt(boardState, choice.from);
    const promotion = choice.promotion || null;
    const promotionFlag = promotion ? `=${TAG[pieceTypeFromSymbol(promotion)] || promotion.toUpperCase()}` : "";
    return {
      side,
      from: choice.from.toLowerCase(),
      to: choice.to.toLowerCase(),
      flag: `${capturedSymbol || choice.flags?.includes("c") || choice.flags?.includes("e") ? "x" : ""}${promotionFlag}`,
      type: pieceTypeFromSymbol(movedSymbol),
      capturedType: capturedSymbol ? pieceTypeFromSymbol(capturedSymbol) : null,
      promotion: promotion ? pieceTypeFromSymbol(promotion) : null,
      ai: player.name,
      source: player.source,
      score: choice.score,
      nodes: choice.nodes,
    };
  }

  function isKingCapture(move) {
    return move.capturedType === "king";
  }

  function recordTerminalKingCapture(move) {
    move.flag = "#";
    moveLog.push(move);
    moveScroll = clamp(moveScroll, 0, maxMoveScroll());
    moveCursor += 1;
    ply += 1;
    markCheckmateWin(move.side);
  }

  async function chooseAIMoveTimed(player, side, timeoutMs = AI_MOVE_TIMEOUT_MS) {
    const startedAt = performance.now();
    let choice = null;
    let error = null;
    try {
      choice = await chooseAIMove(player, side, timeoutMs);
    } catch (caught) {
      error = caught;
    }
    const elapsedMs = performance.now() - startedAt;
    return { choice, error, elapsedMs, timedOut: elapsedMs >= timeoutMs };
  }

  function startMove(now) {
    if (paused || active || aiThinking || selectingPlayers || !engineGame || !boardState || matchResult) return;
    if (boardState.checkMate || boardState.staleMate || hasRuleDraw()) {
      settleResult();
      return;
    }
    if (settleNoLegalMoves()) return;

    aiThinking = true;
    const token = ++aiMoveToken;
    clearAiMoveTimer();
    window.setTimeout(async () => {
      if (token !== aiMoveToken || paused || active || matchResult) {
        aiThinking = false;
        return;
      }

      const side = currentSide();
      const player = matchPlayers[side];
      aiMoveTimer = window.setTimeout(() => {
        if (token !== aiMoveToken || !aiThinking || active || matchResult) return;
        markTimeoutLoss(side, AI_MOVE_TIMEOUT_MS);
      }, AI_MOVE_TIMEOUT_MS);

      const { choice, error, elapsedMs, timedOut } = await chooseAIMoveTimed(player, side, AI_MOVE_TIMEOUT_MS);
      clearAiMoveTimer();
      if (token !== aiMoveToken || matchResult) return;
      if (timedOut) {
        markTimeoutLoss(side, elapsedMs);
        return;
      }
      aiThinking = false;
      if (error) {
        markEngineError(`engine error: ${playerName(side)} move failed`);
        return;
      }
      if (!choice) {
        settleResult();
        if (!matchResult) settleNoLegalMoves();
        if (!matchResult) {
          aiThinking = true;
          aiMoveTimer = window.setTimeout(() => {
            if (token !== aiMoveToken || matchResult) return;
            markTimeoutLoss(side, AI_MOVE_TIMEOUT_MS);
          }, Math.max(0, AI_MOVE_TIMEOUT_MS - elapsedMs));
        }
        return;
      }

      const from = squareFromEngine(choice.from);
      const to = squareFromEngine(choice.to);
      const move = buildMoveRecord(choice, side, player);
      if (isKingCapture(move)) {
        recordTerminalKingCapture(move);
        ripple(boardPos(to.file, to.rank), side, 1.2);
        return;
      }

      primeActiveMove(now, move, from, to);
    }, playbackDelay(30, 0));
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
      duration: playbackDelay(reducedMotion ? 120 : 240),
      lastTrail: now,
    };
    ripple(boardPos(from.file, from.rank), move.side, 0.75);
    if (target) ripple(boardPos(to.file, to.rank), target.side, 1.05);
  }

  function finishMove(now) {
    const { move, moving, target, to } = active;
    if (isKingCapture(move)) {
      recordTerminalKingCapture(move);
      shatter(boardPos(to.file, to.rank), move.side, 62, 1.35);
      active = null;
      return;
    }
    if (target) {
      pieces = pieces.filter((p) => p !== target);
      shatter(boardPos(to.file, to.rank), target.side, 36, 1.2);
    }
    try {
      engineGame.move({ from: move.from, to: move.to, promotion: TYPE_TO_SYMBOL[move.promotion] || "q" });
    } catch (error) {
      markEngineError(`engine error: ${move.from}-${move.to}`);
      active = null;
      return;
    }
    boardState = boardConfigFromGame(engineGame);
    moving.file = to.file;
    moving.rank = to.rank;
    syncPiecesFromBoard(boardState, moving, move.to);
    if (boardState.checkMate) move.flag += "#";
    else if (boardState.check) move.flag += "+";
    move.type = moving.type;
    moveLog.push(move);
    moveScroll = clamp(moveScroll, 0, maxMoveScroll());
    moveCursor += 1;
    ply += 1;
    recordPosition(boardState);
    if (move.flag.includes("#")) shatter(boardPos(to.file, to.rank), moving.side, 62, 1.35);
    settleResult();
    active = null;
    nextMoveAt = now + playbackDelay(165);
  }

  function settleResult() {
    if (!boardState || matchResult) return;
    if (boardState.checkMate) {
      const winner = boardState.turn === "white" ? "black" : "white";
      winnerSide = winner;
      matchEndReason = "checkmate";
      matchResult = `checkmate - ${playerName(winner)} wins`;
    } else if (boardState.staleMate) {
      markStalemateDraw();
    } else if (halfMoveClock() >= FIFTY_MOVE_HALF_MOVES) {
      markDraw("50-move-rule", "draw - 50 move rule");
    } else if (currentPositionCount() >= 3) {
      markDraw("threefold-repetition", "draw - threefold repetition");
    }
  }


  function applyInstantMove(choice, side) {
    const player = matchPlayers[side];
    const move = buildMoveRecord(choice, side, player);
    if (isKingCapture(move)) {
      recordTerminalKingCapture(move);
      return true;
    }
    try {
      engineGame.move({ from: move.from, to: move.to, promotion: TYPE_TO_SYMBOL[move.promotion] || "q" });
    } catch (error) {
      markEngineError(`engine error: ${move.from}-${move.to}`);
      return false;
    }
    boardState = boardConfigFromGame(engineGame);
    if (boardState.checkMate) move.flag += "#";
    else if (boardState.check) move.flag += "+";
    moveLog.push(move);
    moveScroll = clamp(moveScroll, 0, maxMoveScroll());
    moveCursor += 1;
    ply += 1;
    recordPosition(boardState);
    syncPiecesFromBoard(boardState);
    settleResult();
    return true;
  }

  function moveSignature(move) {
    return {
      side: move.side,
      ai: move.ai,
      source: move.source,
      type: move.type,
      from: move.from,
      to: move.to,
      flag: move.flag,
      capturedType: move.capturedType,
      promotion: move.promotion,
    };
  }

  function publicState() {
    return {
      seed: matchSeedText,
      seedLength: matchSeedText.length,
      seedDigest: seedDigest(),
      mode: matchMode,
      modeLabel: modeLabel(),
      selectingPlayers,
      players: {
        white: matchPlayers.white?.name || null,
        black: matchPlayers.black?.name || null,
      },
      ply,
      moves: moveLog.map((move) => `${move.ai}:${move.from}${move.flag.includes("x") ? "x" : "-"}${move.to}${move.flag}`),
      moveRecords: moveLog.map(moveSignature),
      moveScroll,
      maxMoveScroll: maxMoveScroll(),
      halfMoveClock: halfMoveClock(),
      positionRepeats: currentPositionCount(),
      playbackSpeed: playbackSpeed(),
      playbackSpeedIndex,
      result: matchResult,
      resultReason: matchEndReason,
      winnerSide,
      timeoutSide,
    };
  }

  function matchSignature() {
    const snapshot = publicState();
    return JSON.stringify({
      seed: snapshot.seed,
      mode: snapshot.mode,
      players: snapshot.players,
      result: snapshot.result,
      resultReason: snapshot.resultReason,
      winnerSide: snapshot.winnerSide,
      timeoutSide: snapshot.timeoutSide,
      moves: snapshot.moveRecords,
    });
  }

  async function runHeadlessMatch(seed, options = {}) {
    const moveTimeoutMs = Math.max(1, Number(options.moveTimeoutMs) || AI_MOVE_TIMEOUT_MS);
    const startedAt = performance.now();
    paused = true;
    reset(performance.now(), { seedOverride: seed, immediatePlayers: true, players: options.players, mode: options.mode });
    paused = true;

    while (!matchResult && engineGame && boardState) {
      if (boardState.checkMate || boardState.staleMate || hasRuleDraw()) {
        settleResult();
        break;
      }
      if (settleNoLegalMoves()) break;

      const side = currentSide();
      const player = matchPlayers[side];
      const { choice, error, elapsedMs, timedOut } = await chooseAIMoveTimed(player, side, moveTimeoutMs);
      if (timedOut) {
        markTimeoutLoss(side, elapsedMs);
        break;
      }
      if (error) {
        markEngineError(`engine error: ${playerName(side)} move failed`);
        break;
      }
      if (!choice) {
        settleResult();
        if (!matchResult) settleNoLegalMoves();
        if (!matchResult) markTimeoutLoss(side, moveTimeoutMs);
        break;
      }
      if (!applyInstantMove(choice, side)) break;
    }

    const snapshot = publicState();
    return {
      ...snapshot,
      signature: matchSignature(),
      durationMs: Math.round(performance.now() - startedAt),
      moveTimeoutMs,
    };
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
      text(board.x + 2, board.y - 2, `${side === "white" ? ">  " : "   "}${playerLabel("white", 14)}`, side === "white" ? color.whiteSideAlt : color.dim);
      text(board.x + 24, board.y - 2, `${side === "black" ? ">  " : "   "}${playerLabel("black", 14)}`, side === "black" ? color.blackSideAlt : color.dim);
    }

    for (let rank = 0; rank < 8; rank += 1) text(board.x - 3, board.y + rank * board.sh + 1, String(8 - rank), color.dim);
    for (let file = 0; file < 8; file += 1) text(board.x + file * board.sw + 4, board.y + board.h + 1, FILES[file], color.dim);

    if (selectingPlayers) {
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
    const fg = p.side === "white" ? color.white : color.blackSide;
    const alt = p.side === "white" ? color.whiteSideAlt : color.blackSideAlt;
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
      const fg = effectTone(r.side);
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
      const fg = effectTone(g.side);
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
    const whiteWon = winnerSide === "white" ? 1 : 0;
    const blackWon = winnerSide === "black" ? 1 : 0;

    text(x, 3, "v MATCH", color.header);
    if (selectingPlayers) {
      text(x, 6, "CHOOSING PLAYERS", color.header);
      text(x, 9, modeDetail(), modeTone());
      text(x, 12, `seed ${seedDigest()}`, color.dim);
      for (let y = 2; y < 42; y += 1) put(right.x + right.w - 2, y, BRAILLE_FULL, color.blue, "#003852");
      for (let y = 42; y < right.y + right.h - 2; y += 1) put(right.x + right.w - 2, y, BRAILLE_DUST, "#13222a", color.black);
      text(x, 56, speedLegend(), color.dim);
      text(x, 57, "jk scroll   r reroll", color.dim);
      return;
    }

    text(x, 6, `${side === "white" && !gameDone ? "> " : "  "}${playerLabel("white", 18)}`, color.whiteSide);
    text(x + 25, 6, String(whiteWon), color.white);
    text(x + 28, 6, "won", color.dim);
    text(x, 8, `${side === "black" && !gameDone ? "> " : "  "}${playerLabel("black", 18)}`, color.blackSide);
    text(x + 25, 8, String(blackWon), color.white);
    text(x + 28, 8, "won", color.dim);
    text(x, 11, `mode ${modeLabel()}`, modeTone());
    text(x, 13, "ply", color.dim);
    text(x + 6, 13, String(ply), color.white);
    text(x + 15, 13, "move", color.dim);
    text(x + 22, 13, String(ply ? Math.ceil(ply / 2) : 0), color.white);
    const statusText = gameDone ? matchResult : aiThinking ? activePlayerPhrase(side, "thinking") : activePlayerPhrase(side, "to move");
    text(x, 15, statusText.slice(0, 34), gameDone ? color.red : sideTone(side));
    if (!gameDone) text(x, 17, `seed ${seedDigest()}`, color.dim);
    if (gameDone) {
      replayButton = { x, y: 17, w: 16, h: 1 };
      text(x, 17, "[ PLAY AGAIN ]", color.white);
      text(x, 19, "click replay   r reroll", color.dim);
    }

    text(x, 21, "v MATERIAL", color.header);
    if (diff === 0) {
      text(x, 24, `level   ${BRAILLE_DUST.repeat(16)}`, color.dim);
    } else {
      const leading = diff > 0 ? playerLabel("white", 12) : playerLabel("black", 12);
      const bar = clamp(Math.round(Math.abs(diff)), 2, 16);
      text(x, 24, `${leading.trim()} +${Math.abs(diff)}`, diff > 0 ? color.whiteSide : color.blackSide);
      text(x, 26, BRAILLE_FULL.repeat(bar) + BRAILLE_DUST.repeat(16 - bar), color.blue);
      text(x, 28, `ahead by ${Math.abs(diff)} points`, color.dim);
    }

    text(x, 34, "v MOVES", color.header);
    if (!moveLog.length) {
      text(x, 37, "no moves yet", color.dim);
    } else {
      const maxScroll = maxMoveScroll();
      moveScroll = clamp(moveScroll, 0, maxScroll);
      if (maxScroll > 0) text(x + 22, 34, `scroll ${moveScroll}/${maxScroll}`.slice(0, 16), color.dim);
      const visible = moveLog.map((m, i) => ({ ...m, ply: i + 1 })).reverse().slice(moveScroll, moveScroll + 10);
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
    text(x, 56, speedLegend(), color.dim);
    text(x, 57, "jk scroll   r reroll", color.dim);
  }

  function movedTypeFor(move) {
    return move.type || "pawn";
  }

  function maxMoveScroll() {
    return Math.max(0, moveLog.length - 10);
  }

  function scrollMoves(delta) {
    const nextScroll = clamp(moveScroll + delta, 0, maxMoveScroll());
    const changed = nextScroll !== moveScroll;
    moveScroll = nextScroll;
    return changed;
  }

  function speedLegend() {
    return PLAYBACK_SPEEDS.map((speed, i) => `${i + 1}=${speed}x`).join(" ");
  }

  function setPlaybackSpeedFromKey(key) {
    if (!/^\d$/.test(key)) return false;
    const index = Number(key) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= PLAYBACK_SPEEDS.length) return false;
    playbackSpeedIndex = index;
    return true;
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

  function releaseControlFocus() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && seedForm?.contains(activeElement)) activeElement.blur();
  }

  if (seedInput) seedInput.addEventListener("input", updateSeedInputStatus);
  if (seedForm) seedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    reset(performance.now());
    releaseControlFocus();
  });
  if (seedRandomButton) seedRandomButton.addEventListener("click", () => {
    reset(performance.now(), { forceRandom: true });
    releaseControlFocus();
  });
  if (seedCopyButton) seedCopyButton.addEventListener("click", () => {
    copyCurrentSeed();
    releaseControlFocus();
  });
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMatchMode(button.dataset.mode, true);
      releaseControlFocus();
    });
  });

  function shouldLetControlHandleKey(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
    return target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter");
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (shouldLetControlHandleKey(event)) return;
    if (setPlaybackSpeedFromKey(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === " ") paused = !paused;
    if (event.key.toLowerCase() === "r") reset(performance.now(), { forceRandom: true });
    if (event.key.toLowerCase() === "j") {
      event.preventDefault();
      scrollMoves(1);
    }
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      scrollMoves(-1);
    }
  });
  canvas.addEventListener("click", (event) => {
    releaseControlFocus();
    if (hitsReplayButton(cellFromPointer(event))) reset(performance.now());
  });
  canvas.addEventListener("mousemove", (event) => {
    canvas.style.cursor = hitsReplayButton(cellFromPointer(event)) ? "pointer" : "default";
  });
  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
  });

  syncModeButtons();
  reset(performance.now());
  window.__dotChessState = publicState;
  window.__dotChessTest = {
    seedLength: SEED_LENGTH,
    defaultMoveTimeoutMs: AI_MOVE_TIMEOUT_MS,
    normalizeSeed,
    generateAsciiSeed,
    mode: () => matchMode,
    setMode: (mode) => setMatchMode(mode),
    matchModes: () => Object.keys(MATCH_MODES),
    availableAI: () => availableAI().map(({ name, source, kind, level, liveRandomness, depth, replayMultiPV, liveMovetime, liveSkill }) => ({
      name,
      source,
      kind,
      level,
      liveRandomness,
      depth,
      replayMultiPV,
      liveMovetime,
      liveSkill,
    })),
    runMatch: runHeadlessMatch,
  };
  requestAnimationFrame(frame);
})();

