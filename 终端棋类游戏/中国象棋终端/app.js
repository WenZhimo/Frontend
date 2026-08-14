(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const seedForm = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  const playModeSelect = document.getElementById("play-mode");
  const humanSideSelect = document.getElementById("human-side");
  const aiSelect = document.getElementById("ai-select");

  const COLS = 126;
  const ROWS = 60;
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const CJK_FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", SimHei, sans-serif';
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#080b11",
    ink2: "#0b0f17",
    cellA: "#202735",
    cellB: "#151b25",
    boardParticle: "#7f858d",
    grid: "#9aa2b2",
    gridDim: "#3d4658",
    dim: "#626b7e",
    muted: "#7a8397",
    header: "#b3b8c8",
    redSide: "#eef7ff",
    redSideAlt: "#9bf6ff",
    whitePiece: "#f8ffff",
    whitePieceAlt: "#ffffff",
    blackSide: "#f6a33b",
    blackSideAlt: "#ffd269",
    blue: "#6ed5ec",
    redFx: "#ff4e59",
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
  const board = {
    x: 9,
    y: 6,
    sw: 8,
    sh: 5,
    files: 9,
    ranks: 10,
    bgX: 6,
    bgY: 4,
    bgW: 70,
    bgH: 51,
  };
  board.gridW = (board.files - 1) * board.sw + 1;
  board.gridH = (board.ranks - 1) * board.sh + 1;

  const DOT_W = 2;
  const DOT_H = 4;
  const BRAILLE_BASE = 0x2800;
  const BRAILLE_FULL = String.fromCharCode(BRAILLE_BASE + 0xff);
  const BRAILLE_DUST = String.fromCharCode(BRAILLE_BASE + 0x09);
  const FILES = "abcdefghi";
  const PLAYBACK_SPEEDS = [0.5, 1, 2, 4];
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const AI_MOVE_TIMEOUT_MS = 10000;
  const DRAW_MOVE_LIMIT = 120;
  const MAX_PLIES = 240;
  const START_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
  const MATCH_MODES = {
    deterministic: { label: "REPLAY", detail: "deterministic replay" },
    live: { label: "LIVE", detail: "full engine live" },
  };
  const DEFAULT_MATCH_MODE = "deterministic";

  const TYPE_NAME = {
    king: "GEN",
    advisor: "ADV",
    elephant: "ELE",
    horse: "HOR",
    rook: "CHA",
    cannon: "CAN",
    soldier: "SOL",
  };
  const TAG = {
    king: "G",
    advisor: "A",
    elephant: "E",
    horse: "H",
    rook: "R",
    cannon: "C",
    soldier: "S",
  };
  const PIECE_CHARS = {
    red: {
      king: "帅",
      advisor: "仕",
      elephant: "相",
      horse: "马",
      rook: "车",
      cannon: "炮",
      soldier: "兵",
    },
    black: {
      king: "将",
      advisor: "士",
      elephant: "象",
      horse: "马",
      rook: "车",
      cannon: "炮",
      soldier: "卒",
    },
  };
  const VALUE = {
    king: 0,
    advisor: 2,
    elephant: 2,
    horse: 4,
    rook: 9,
    cannon: 4.5,
    soldier: 1,
  };
  const SYMBOL_TO_TYPE = {
    k: "king",
    a: "advisor",
    b: "elephant",
    e: "elephant",
    n: "horse",
    h: "horse",
    r: "rook",
    c: "cannon",
    p: "soldier",
    s: "soldier",
  };

  const AI_ROSTER = [
    { name: "LEGALIST", source: "local rules", kind: "heuristic", style: "engine" },
    { name: "SHARP", source: "local rules", kind: "heuristic", style: "sharp" },
    { name: "RIVER", source: "local heuristic", kind: "heuristic", style: "river" },
    { name: "CANNON", source: "local heuristic", kind: "heuristic", style: "cannon" },
    { name: "CENTER", source: "local heuristic", kind: "heuristic", style: "center" },
    { name: "TRADER", source: "local heuristic", kind: "heuristic", style: "trader" },
    { name: "HUNTER", source: "local heuristic", kind: "heuristic", style: "hunter" },
    { name: "LOTUS", source: "local heuristic", kind: "heuristic", style: "quiet" },
  ];

  const pieceMasks = buildPieceMasks({
    soldier: [
      "      ##      ",
      "     ####     ",
      "    ######    ",
      "      ##      ",
      "   ########   ",
      "   ########   ",
      "     ####     ",
      "    ######    ",
      "   ########   ",
      "              ",
    ],
    cannon: [
      "    ######    ",
      "  ##########  ",
      "  ####  ####  ",
      "  ###    ###  ",
      "  ####  ####  ",
      "  ##########  ",
      "    ######    ",
      "  ##########  ",
      "  ##########  ",
      "              ",
    ],
    rook: [
      "  ###  ## ### ",
      " ############ ",
      " ############ ",
      "   ########   ",
      "   ########   ",
      "   ########   ",
      " ############ ",
      " ############ ",
      " ############ ",
      "              ",
    ],
    horse: [
      "     #######  ",
      "   #########  ",
      "  ##########  ",
      "  ####   ###  ",
      "  ###   ####  ",
      "       ####   ",
      "    #######   ",
      "  ##########  ",
      "  ##########  ",
      "              ",
    ],
    elephant: [
      "      ##      ",
      "     ####     ",
      "    ######    ",
      "   ########   ",
      "  ####  ####  ",
      "   ########   ",
      "    ######    ",
      "  ##########  ",
      "  ##########  ",
      "              ",
    ],
    advisor: [
      "      ##      ",
      "    ######    ",
      "   ########   ",
      "  ### ## ###  ",
      "      ##      ",
      "    ######    ",
      "   ########   ",
      "  ##########  ",
      "  ##########  ",
      "              ",
    ],
    king: [
      "   ##    ##   ",
      "    ######    ",
      "      ##      ",
      "  ##########  ",
      "   ########   ",
      "    ######    ",
      "   ########   ",
      "  ##########  ",
      "  ##########  ",
      "              ",
    ],
  });

  let dpr = 1;
  let cw = 1;
  let ch = 1;
  let fontSize = 16;
  let pieces = [];
  let pieceLabels = [];
  let fragments = [];
  let ripples = [];
  let active = null;
  let moveLog = [];
  let moveScroll = 0;
  let ply = 0;
  let nextMoveAt = 0;
  let aiThinking = false;
  let selectingPlayers = true;
  let matchPlayers = { red: null, black: null };
  let matchResult = "";
  let matchEndReason = "";
  let winnerSide = null;
  let timeoutSide = null;
  let matchSeedText = "".padEnd(SEED_LENGTH, " ");
  let matchMode = DEFAULT_MATCH_MODE;
  let matchRng = () => 0.5;
  let playMode = "ai-vs-ai";
  let humanSide = "red";
  let selectedAIName = "";
  let selectedSquare = null;
  let paused = false;
  let playbackSpeedIndex = 1;
  let lastFrame = 0;
  let replayButton = null;
  let seedStatusTimer = null;
  let selectionToken = 0;
  let aiMoveToken = 0;
  let positionCounts = new Map();
  let currentAiWorker = null;
  let currentFen = START_FEN;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const playbackSpeed = () => PLAYBACK_SPEEDS[playbackSpeedIndex] || 1;
  const playbackDelay = (ms, min = 16) => Math.max(min, ms / playbackSpeed());
  const sideColor = (side) => (side === "red" ? color.redSide : color.blackSide);
  const sideAltColor = (side) => (side === "red" ? color.redSideAlt : color.blackSideAlt);
  const pieceColor = (side) => (side === "red" ? color.whitePiece : color.blackSide);
  const pieceAltColor = (side) => (side === "red" ? color.whitePieceAlt : color.blackSideAlt);
  const effectColor = (side) => (side === "black" ? color.redFx : color.blue);

  function hash(n) {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function hashUint32(value, salt = 0) {
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
  }

  function createRng(seed, stream) {
    let state = hashUint32(`${seed}|${stream}`, 0x9e3779b9) || 0x6d2b79f5;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededUnit(...parts) {
    return hashUint32(`${matchSeedText}|${parts.join("|")}`, 0x7f4a7c15) / 4294967296;
  }

  function modeRandom(...parts) {
    return isReplayMode() ? seededUnit("mode-rng", ...parts) : Math.random();
  }

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
    return isReplayMode() ? color.blue : color.redFx;
  }

  function syncModeButtons() {
    modeButtons.forEach((button) => {
      const activeButton = button.dataset.mode === matchMode;
      button.classList.toggle("is-active", activeButton);
      button.setAttribute("aria-pressed", String(activeButton));
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
      masks[name] = { width, height: rows.length, rows };
    });
    return masks;
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

  function text(x, y, value, fg = color.muted, bg = null) {
    let col = x;
    Array.from(String(value)).forEach((char) => {
      put(col, y, char, fg, bg);
      col += 1;
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

  function box(area, bg) {
    const { x, y, w, h } = area;
    fillArea(x, y, w, h, bg, color.dim, " ");
    for (let col = x; col < x + w; col += 1) {
      put(col, y, "-", color.gridDim, bg);
      put(col, y + h - 1, "-", color.gridDim, bg);
    }
    for (let row = y; row < y + h; row += 1) {
      put(x, row, "|", color.gridDim, bg);
      put(x + w - 1, row, "|", color.gridDim, bg);
    }
    put(x, y, "+", color.grid, bg);
    put(x + w - 1, y, "+", color.grid, bg);
    put(x, y + h - 1, "+", color.grid, bg);
    put(x + w - 1, y + h - 1, "+", color.grid, bg);
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

  function braille(mask) {
    return String.fromCharCode(BRAILLE_BASE + (mask & 0xff));
  }

  function brailleBit(sx, sy) {
    const col = ((sx % DOT_W) + DOT_W) % DOT_W;
    const row = ((sy % DOT_H) + DOT_H) % DOT_H;
    if (col === 0) return [0x01, 0x02, 0x04, 0x40][row];
    return [0x08, 0x10, 0x20, 0x80][row];
  }

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
  const boardDensity = [0.025, 0.04, 0.058, 0.08, 0.105];
  const boardDensityLevels = buildBoardDensityLevels();

  function densityIndex(file, rank) {
    return rank * 8 + file;
  }

  function buildBoardDensityLevels() {
    const levels = Array(8 * 9).fill(2);
    for (let rank = 0; rank < 9; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const light = (file + rank) % 2 === 0;
        const random = hash(file * 73 + rank * 137);
        const drift = Math.floor((file + rank) / 6);
        levels[densityIndex(file, rank)] = clamp(1 + drift + (random > 0.66 ? 1 : 0) + (light ? 1 : 0), 1, 5);
      }
    }

    for (let pass = 0; pass < 12; pass += 1) {
      for (let rank = 0; rank < 9; rank += 1) {
        for (let file = 0; file < 8; file += 1) {
          if ((file + rank) % 2 !== 0) continue;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nf = file + dx;
            const nr = rank + dy;
            if (nf < 0 || nf >= 8 || nr < 0 || nr >= 9) return;
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

  function boardDotMask(cellFile, cellRank, xx, yy) {
    const density = boardDensity[boardDensityLevels[densityIndex(cellFile, cellRank)] - 1];
    const limit = Math.round(density * 64);
    let mask = 0;
    for (let row = 0; row < DOT_H; row += 1) {
      for (let col = 0; col < DOT_W; col += 1) {
        const sx = cellFile * board.sw * DOT_W + xx * DOT_W + col;
        const sy = cellRank * board.sh * DOT_H + yy * DOT_H + row;
        if (boardDither[sy & 7][sx & 7] < limit) mask |= brailleBit(col, row);
      }
    }
    return mask;
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
    return sanitizeSeedValue(value).padEnd(SEED_LENGTH, " ").slice(0, SEED_LENGTH);
  }

  function randomSeed() {
    let seed = "";
    for (let i = 0; i < SEED_LENGTH; i += 1) {
      seed += RANDOM_SEED_CHARS[Math.floor(Math.random() * RANDOM_SEED_CHARS.length)];
    }
    return seed;
  }

  function seedDigest(seed = matchSeedText) {
    return hashUint32(`${seed}|digest`, 0xb5297a4d).toString(16).padStart(8, "0").toUpperCase();
  }

  function setSeedStatus(message, timeout = 0) {
    if (!seedStatus) return;
    window.clearTimeout(seedStatusTimer);
    seedStatus.textContent = message;
    if (timeout) {
      seedStatusTimer = window.setTimeout(() => {
        seedStatus.textContent = `SEED ${seedDigest()}`;
      }, timeout);
    }
  }

  function updateSeedInputStatus() {
    if (!seedInput) return;
    const clean = sanitizeSeedValue(seedInput.value);
    if (clean !== seedInput.value) seedInput.value = clean;
    setSeedStatus(`${clean.length}/${SEED_LENGTH}`);
  }

  function prepareMatchSeed(forceRandom = false, seedOverride = null) {
    const hasOverride = typeof seedOverride === "string";
    const typed = sanitizeSeedValue(hasOverride ? seedOverride : seedInput?.value || "");
    const autoSeed = forceRandom || !typed.trim().length;
    matchSeedText = normalizeSeed(autoSeed ? randomSeed() : typed);
    matchRng = createRng(matchSeedText, "match");
    if (seedInput) seedInput.value = matchSeedText;
    setSeedStatus(`${autoSeed ? "AUTO" : "SEED"} ${seedDigest()}`);
  }

  function fallbackCopySeed(seed) {
    const proxy = document.createElement("textarea");
    proxy.value = seed;
    proxy.setAttribute("readonly", "");
    proxy.style.position = "fixed";
    proxy.style.opacity = "0";
    document.body.appendChild(proxy);
    proxy.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    proxy.remove();
    return copied;
  }

  function copySeed() {
    const draft = sanitizeSeedValue(seedInput?.value || "");
    const seed = draft.trim().length ? normalizeSeed(draft) : matchSeedText;
    const markCopied = () => setSeedStatus("COPIED", 900);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(seed).then(markCopied).catch(() => {
        if (fallbackCopySeed(seed)) markCopied();
      });
    } else if (fallbackCopySeed(seed)) {
      markCopied();
    }
  }

  function sideFromEngine() {
    return currentFen.split(" ")[1] === "b" ? "black" : "red";
  }

  function otherSide(side) {
    return side === "red" ? "black" : "red";
  }

  function playerName(side) {
    return matchPlayers[side]?.name || side.toUpperCase();
  }

  function playerLabel(side, width = 14) {
    return playerName(side).padEnd(width).slice(0, width);
  }

  function squareFromNotation(square) {
    return {
      file: FILES.indexOf(square[0]),
      rank: Number(square[1]),
    };
  }

  function squareName(file, rank) {
    return `${FILES[file]}${rank}`;
  }

  function boardPos(file, rank) {
    return {
      x: board.x + file * board.sw,
      y: board.y + (9 - rank) * board.sh,
    };
  }

  function parseFenPieces(fen) {
    const rows = String(fen).split(" ")[0].split("/");
    const parsed = [];
    rows.forEach((row, rowIndex) => {
      let file = 0;
      const rank = 9 - rowIndex;
      Array.from(row).forEach((char) => {
        if (/\d/.test(char)) {
          file += Number(char);
          return;
        }
        const lower = char.toLowerCase();
        const side = char === lower ? "black" : "red";
        const type = SYMBOL_TO_TYPE[lower] || "soldier";
        parsed.push(piece(`${side}-${type}-${file}-${rank}`, side, type, file, rank));
        file += 1;
      });
    });
    return parsed;
  }

  function piece(id, side, type, file, rank) {
    return {
      id,
      side,
      type,
      file,
      rank,
      seed: hashUint32(`${id}|${side}|${type}|${file}|${rank}`, 0x43d17a1f),
    };
  }

  function syncPiecesFromFen() {
    pieces = parseFenPieces(currentFen);
  }

  function findPiece(file, rank, except = null) {
    return pieces.find((p) => p !== except && p.file === file && p.rank === rank) || null;
  }

  function materialDiff() {
    return pieces.reduce((sum, p) => sum + (p.side === "red" ? 1 : -1) * (VALUE[p.type] || 0), 0);
  }

  function positionKey() {
    const parts = currentFen.split(" ");
    return `${parts[0]} ${parts[1] || "w"}`;
  }

  function recordPosition() {
    const key = positionKey();
    const count = (positionCounts.get(key) || 0) + 1;
    positionCounts.set(key, count);
    return count;
  }

  function currentPositionCount() {
    return positionCounts.get(positionKey()) || 0;
  }

  function selectableRoster() {
    return AI_ROSTER.slice();
  }

  function populatePlayControls() {
    if (humanSideSelect && !humanSideSelect.options.length) {
      humanSideSelect.innerHTML = [
        '<option value="red">HUMAN RED</option>',
        '<option value="black">HUMAN BLACK</option>',
      ].join("");
    }
    if (aiSelect && !aiSelect.options.length) {
      aiSelect.innerHTML = selectableRoster().map((ai) => `<option value="${ai.name}">${ai.name}</option>`).join("");
    }
    selectedAIName = aiSelect?.value || selectableRoster()[0]?.name || "";
  }

  function readPlayControls() {
    playMode = playModeSelect?.value || "ai-vs-ai";
    humanSide = humanSideSelect?.value || "red";
    selectedAIName = aiSelect?.value || selectableRoster()[0]?.name || "";
  }

  function localHumanPlayer() {
    return { name: "HUMAN", source: "local", kind: "human" };
  }

  function selectedAIPlayer() {
    return { ...(selectableRoster().find((ai) => ai.name === selectedAIName) || selectableRoster()[0]) };
  }

  function playModePlayers() {
    if (playMode === "human-vs-human") {
      return { red: localHumanPlayer(), black: localHumanPlayer() };
    }
    if (playMode === "human-vs-ai") {
      const ai = selectedAIPlayer();
      return humanSide === "red"
        ? { red: localHumanPlayer(), black: ai }
        : { red: ai, black: localHumanPlayer() };
    }
    return null;
  }

  function isHumanSide(side) {
    return matchPlayers?.[side]?.kind === "human";
  }

  function isHumanTurn() {
    return isHumanSide(sideFromEngine());
  }

  function scheduleNextMove(now, delay) {
    selectedSquare = null;
    nextMoveAt = isHumanTurn() ? Number.POSITIVE_INFINITY : now + playbackDelay(delay);
  }

  function choosePlayersNow() {
    const localPlayers = playModePlayers();
    if (localPlayers) {
      matchPlayers = localPlayers;
      selectingPlayers = false;
      scheduleNextMove(performance.now(), 360);
      return;
    }
    const roster = selectableRoster();
    const pick = (stream) => {
      const roll = isReplayMode() ? matchRng() : Math.random();
      const index = clamp(Math.floor(roll * roster.length), 0, roster.length - 1);
      return { ...roster[index], stream };
    };
    matchPlayers = {
      red: pick("red"),
      black: pick("black"),
    };
    selectingPlayers = false;
    scheduleNextMove(performance.now(), 360);
  }

  function reset(now = performance.now(), options = {}) {
    clearAiWorker();
    paused = false;
    active = null;
    fragments = [];
    ripples = [];
    moveLog = [];
    moveScroll = 0;
    ply = 0;
    aiThinking = false;
    matchResult = "";
    matchEndReason = "";
    winnerSide = null;
    timeoutSide = null;
    positionCounts = new Map();
    selectedSquare = null;
    selectionToken += 1;
    aiMoveToken += 1;
    readPlayControls();
    matchMode = normalizeMatchMode(options.mode || matchMode);
    prepareMatchSeed(Boolean(options.forceRandom), options.seedOverride ?? null);
    syncModeButtons();
    currentFen = START_FEN;
    syncPiecesFromFen();
    recordPosition();
    matchPlayers = { red: null, black: null };
    selectingPlayers = !options.immediatePlayers;
    if (options.players) {
      matchPlayers = { red: options.players.red, black: options.players.black };
      selectingPlayers = false;
    } else {
      const localPlayers = playModePlayers();
      if (localPlayers) {
        matchPlayers = localPlayers;
        selectingPlayers = false;
      }
    }
    nextMoveAt = now + playbackDelay(selectingPlayers ? 650 : 320);
    if (selectingPlayers) {
      const token = selectionToken;
      window.setTimeout(() => {
        if (token !== selectionToken || matchResult) return;
        choosePlayersNow();
      }, 620);
    } else if (matchPlayers.red && matchPlayers.black) {
      scheduleNextMove(now, 320);
    } else if (!matchPlayers.red || !matchPlayers.black) {
      choosePlayersNow();
    }
  }

  function chooseAIMoveTimed(player, side, timeoutMs = AI_MOVE_TIMEOUT_MS) {
    if (window.Worker) return chooseAIMoveInWorker(player, side, timeoutMs);
    return Promise.resolve({ choice: null, error: new Error("Web Worker is required for AI"), elapsedMs: 0, timedOut: false });
  }

  function choiceFromWorker(choice) {
    const moveText = String(choice.text || "");
    if (!/^[a-i][0-9][a-i][0-9]$/.test(moveText) || !choice.nextFen) return null;
    return {
      text: moveText,
      from: squareFromNotation(moveText.slice(0, 2)),
      to: squareFromNotation(moveText.slice(2, 4)),
      score: choice.score || 0,
      nextFen: choice.nextFen,
      check: Boolean(choice.check),
    };
  }

  function clearAiWorker() {
    if (currentAiWorker) {
      currentAiWorker.terminate();
      currentAiWorker = null;
    }
  }

  function chooseAIMoveInWorker(player, side, timeoutMs = AI_MOVE_TIMEOUT_MS) {
    const startedAt = performance.now();
    clearAiWorker();
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker("ai-worker.js");
      currentAiWorker = worker;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (currentAiWorker === worker) currentAiWorker = null;
        worker.terminate();
        resolve({
          choice: payload.choice || null,
          error: payload.error || null,
          elapsedMs: performance.now() - startedAt,
          timedOut: Boolean(payload.timedOut),
        });
      };
      const timer = window.setTimeout(() => finish({ timedOut: true }), timeoutMs);
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (!data.ok) {
          finish({ error: new Error(data.error || "AI worker failed") });
          return;
        }
        if (data.terminal) {
          if (data.terminal.type === "checkmate") markWin(data.terminal.winner, "checkmate");
          else markDraw(data.terminal.type || "no-legal-moves", data.terminal.message || "draw - no legal moves");
          finish({ choice: null });
          return;
        }
        const choice = data.choice ? choiceFromWorker(data.choice) : null;
        finish({ choice });
      };
      worker.onerror = (event) => finish({ error: new Error(event.message || "AI worker error") });
      worker.postMessage({
        fen: currentFen,
        player,
        side,
        seed: matchSeedText,
        mode: matchMode,
        ply,
      });
    });
  }

  function chooseRequestedMoveTimed(moveText, side, timeoutMs = AI_MOVE_TIMEOUT_MS) {
    const startedAt = performance.now();
    clearAiWorker();
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker("ai-worker.js");
      currentAiWorker = worker;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (currentAiWorker === worker) currentAiWorker = null;
        worker.terminate();
        resolve({
          choice: payload.choice || null,
          error: payload.error || null,
          elapsedMs: performance.now() - startedAt,
          timedOut: Boolean(payload.timedOut),
          illegal: Boolean(payload.illegal),
        });
      };
      const timer = window.setTimeout(() => finish({ timedOut: true }), timeoutMs);
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (!data.ok) {
          finish({ error: new Error(data.error || "move validation failed") });
          return;
        }
        finish({ choice: data.choice ? choiceFromWorker(data.choice) : null, illegal: data.illegal });
      };
      worker.onerror = (event) => finish({ error: new Error(event.message || "move validation error") });
      worker.postMessage({
        fen: currentFen,
        player: matchPlayers[side] || localHumanPlayer(),
        side,
        seed: matchSeedText,
        mode: matchMode,
        ply,
        requestedMove: moveText,
      });
    });
  }
  function markTimeoutLoss(side, elapsedMs = AI_MOVE_TIMEOUT_MS) {
    if (matchResult) return;
    aiThinking = false;
    active = null;
    clearAiWorker();
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
    clearAiWorker();
    nextMoveAt = Number.POSITIVE_INFINITY;
  }

  function markWin(side, reason = "checkmate") {
    if (matchResult) return;
    aiThinking = false;
    active = null;
    clearAiWorker();
    winnerSide = side;
    timeoutSide = null;
    matchEndReason = reason;
    matchResult = `${reason} - ${playerName(side)} wins`;
    nextMoveAt = Number.POSITIVE_INFINITY;
  }

  function markDraw(reason, message) {
    if (matchResult) return;
    aiThinking = false;
    active = null;
    clearAiWorker();
    winnerSide = null;
    timeoutSide = null;
    matchEndReason = reason;
    matchResult = message;
    nextMoveAt = Number.POSITIVE_INFINITY;
  }

  function settleResult() {
    if (matchResult) return;
    if (currentPositionCount() >= 3) {
      markDraw("threefold-repetition", "draw - threefold repetition");
      return;
    }
    if (ply >= MAX_PLIES) {
      markDraw("move-limit", "draw - move limit");
    }
  }

  function buildMoveRecord(choice, side, player) {
    const moving = findPiece(choice.from.file, choice.from.rank);
    const target = findPiece(choice.to.file, choice.to.rank);
    return {
      raw: choice.raw,
      text: choice.text,
      nextFen: choice.nextFen,
      check: choice.check,
      side,
      from: squareName(choice.from.file, choice.from.rank),
      to: squareName(choice.to.file, choice.to.rank),
      fromPos: choice.from,
      toPos: choice.to,
      type: moving?.type || "soldier",
      capturedType: target?.type || null,
      flag: target ? "x" : "-",
      ai: player?.name || side.toUpperCase(),
      source: player?.source || "unknown",
      score: choice.score || 0,
    };
  }

  function startMove(now) {
    if (paused || active || aiThinking || selectingPlayers || matchResult) return;
    if (isHumanTurn()) return;
    aiThinking = true;
    const token = ++aiMoveToken;
    window.setTimeout(async () => {
      if (token !== aiMoveToken || paused || active || matchResult) {
        aiThinking = false;
        return;
      }
      const side = sideFromEngine();
      const player = matchPlayers[side];
      const { choice, error, elapsedMs, timedOut } = await chooseAIMoveTimed(player, side, AI_MOVE_TIMEOUT_MS);
      if (token !== aiMoveToken || matchResult) return;
      aiThinking = false;
      if (timedOut) {
        markTimeoutLoss(side, elapsedMs);
        return;
      }
      if (error) {
        markEngineError(`engine error: ${playerName(side)} move failed`);
        return;
      }
      if (!choice) {
        settleResult();
        if (!matchResult) markDraw("no-move", "draw - no move");
        return;
      }
      const move = buildMoveRecord(choice, side, player);
      primeActiveMove(performance.now(), move, choice.from, choice.to);
    }, playbackDelay(35, 0));
  }

  function primeActiveMove(now, move, from, to) {
    let moving = findPiece(from.file, from.rank);
    if (!moving) {
      moving = piece(`ghost-${ply}`, move.side, move.type || "soldier", from.file, from.rank);
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
      duration: playbackDelay(reducedMotion ? 120 : 260),
      lastTrail: now,
    };
    ripple(boardPos(from.file, from.rank), move.side, 0.75);
    if (target) ripple(boardPos(to.file, to.rank), target.side, 1.05);
  }

  function finishMove(now) {
    const { move, target, to } = active;
    if (!move.nextFen) {
      markEngineError(`engine error: ${move.text}`);
      active = null;
      return;
    }
    currentFen = move.nextFen;
    if (target) shatter(boardPos(to.file, to.rank), target.side, 42, 1.25);
    syncPiecesFromFen();
    moveLog.push(move);
    moveScroll = clamp(moveScroll, 0, maxMoveScroll());
    ply += 1;
    recordPosition();
    if (move.check) {
      move.flag += "+";
      ripple(boardPos(to.file, to.rank), move.side, 1.2);
    }
    settleResult();
    active = null;
    scheduleNextMove(now, 165);
  }

  function applyInstantMove(choice, side) {
    const player = matchPlayers[side];
    const move = buildMoveRecord(choice, side, player);
    if (!move.nextFen) {
      markEngineError(`engine error: ${move.text}`);
      return false;
    }
    currentFen = move.nextFen;
    syncPiecesFromFen();
    moveLog.push(move);
    ply += 1;
    recordPosition();
    settleResult();
    return true;
  }

  function update(now, dt) {
    if (paused) return;
    if (!isHumanTurn() && now >= nextMoveAt) startMove(now);
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

  function setSubPx(sx, sy, fg, power = 1) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    const minX = board.bgX * DOT_W;
    const minY = board.bgY * DOT_H;
    const maxX = (board.bgX + board.bgW) * DOT_W;
    const maxY = (board.bgY + board.bgH) * DOT_H;
    if (sx < minX || sy < minY || sx >= maxX || sy >= maxY) return;
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

  function drawSubLine(a, b, fg = color.grid, power = 0.88) {
    const ax = a.x * DOT_W;
    const ay = a.y * DOT_H;
    const bx = b.x * DOT_W;
    const by = b.y * DOT_H;
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= steps; i += 1) {
      const t = steps ? i / steps : 0;
      setSubPx(lerp(ax, bx, t), lerp(ay, by, t), fg, power);
    }
  }

  function drawBoard() {
    for (let y = 0; y < board.bgH; y += 1) {
      for (let x = 0; x < board.bgW; x += 1) {
        const gx = board.bgX + x;
        const gy = board.bgY + y;
        const relX = clamp(gx - board.x, 0, board.gridW - 1);
        const relY = clamp(gy - board.y, 0, board.gridH - 1);
        const cellFile = clamp(Math.floor(relX / board.sw), 0, 7);
        const cellRank = clamp(Math.floor(relY / board.sh), 0, 8);
        const light = (cellFile + cellRank) % 2 === 0;
        const bg = light ? color.cellA : color.cellB;
        const mask = boardDotMask(cellFile, cellRank, x, y);
        put(gx, gy, braille(mask), color.boardParticle, bg);
      }
    }

    for (let rank = 0; rank < board.ranks; rank += 1) {
      drawSubLine(boardPos(0, rank), boardPos(8, rank), rank === 4 || rank === 5 ? color.blue : color.grid, 0.82);
    }
    for (let file = 0; file < board.files; file += 1) {
      if (file === 0 || file === 8) {
        drawSubLine(boardPos(file, 0), boardPos(file, 9), color.grid, 0.82);
      } else {
        drawSubLine(boardPos(file, 0), boardPos(file, 4), color.grid, 0.82);
        drawSubLine(boardPos(file, 5), boardPos(file, 9), color.grid, 0.82);
      }
    }
    drawSubLine(boardPos(3, 9), boardPos(5, 7), color.gridDim, 0.74);
    drawSubLine(boardPos(5, 9), boardPos(3, 7), color.gridDim, 0.74);
    drawSubLine(boardPos(3, 0), boardPos(5, 2), color.gridDim, 0.74);
    drawSubLine(boardPos(5, 0), boardPos(3, 2), color.gridDim, 0.74);
  }

  function drawBoardText() {
    const side = active?.move.side || sideFromEngine();
    if (selectingPlayers) {
      text(board.x + 2, board.y - 3, "SELECTING PLAYERS", color.header);
    } else {
      text(board.x + 2, board.y - 3, `${side === "red" ? ">  " : "   "}${playerLabel("red", 14)}`, side === "red" ? color.redSideAlt : color.dim);
      text(board.x + 26, board.y - 3, `${side === "black" ? ">  " : "   "}${playerLabel("black", 14)}`, side === "black" ? color.blackSideAlt : color.dim);
    }

    for (let rank = 9; rank >= 0; rank -= 1) {
      const pos = boardPos(0, rank);
      text(board.x - 5, pos.y, String(rank), color.dim);
    }
    for (let file = 0; file < board.files; file += 1) {
      text(board.x + file * board.sw, board.y + board.gridH + 2, FILES[file], color.dim);
    }

    if (selectingPlayers) {
      text(board.x, board.y + board.gridH + 4, "selecting AI players", color.header);
    } else if (matchResult) {
      text(board.x, board.y + board.gridH + 4, matchResult.toUpperCase().slice(0, 72), winnerSide ? color.redFx : color.dim);
    } else if (aiThinking) {
      text(board.x, board.y + board.gridH + 4, `${playerName(side)} thinking`, sideColor(side));
    } else {
      text(board.x, board.y + board.gridH + 4, `${playerName(side)} to move`, sideColor(side));
    }
  }

  function drawRiverText() {
    text(board.x + 26, board.y + 23, "R I V E R", color.dim);
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
    const fg = pieceColor(p.side);
    const alt = pieceAltColor(p.side);
    const cx = Math.round(pos.x * DOT_W);
    const cy = Math.round(pos.y * DOT_H);
    const rx = 7.1;
    const ry = 8.6;

    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y += 1) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x += 1) {
        const nx = x / rx;
        const ny = y / ry;
        const dist = Math.sqrt(nx * nx + ny * ny);
        if (dist > 1) continue;

        const labelWindow = Math.abs(x) <= 3 && Math.abs(y) <= 4;
        if (labelWindow) continue;

        const ring = dist > 0.68;
        const sparkle = hash(p.seed + x * 19 + y * 31);
        const innerKeep = 0.58 + alpha * 0.32;
        if (!ring && sparkle > innerKeep) continue;

        const rimTone = ring || sparkle > 0.62 ? alt : fg;
        const power = clamp(alpha * (ring ? 0.98 : 0.66), 0.2, 1);
        setSubPx(cx + x, cy + y, rimTone, power);
      }
    }

    pieceLabels.push({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      char: PIECE_CHARS[p.side]?.[p.type] || "?",
      fg: pieceAltColor(p.side),
      bg: p.side === "red" ? "#132833" : "#2b1d0e",
      alpha,
    });
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
      const fg = effectColor(r.side);
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
      const fg = effectColor(g.side);
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

  function flushDotLayer() {
    for (let y = board.bgY; y < board.bgY + board.bgH; y += 1) {
      for (let x = board.bgX; x < board.bgX + board.bgW; x += 1) {
        const i = idx(x, y);
        const mask = dotLayer.mask[i];
        if (!mask) continue;
        put(x, y, glyphForMask(mask, dotLayer.power[i]), dotLayer.fg[i] || color.redSide);
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
    const side = active?.move.side || sideFromEngine();
    const diff = materialDiff();
    replayButton = null;

    text(x, 3, "v MATCH", color.header);
    if (selectingPlayers) {
      text(x, 6, "CHOOSING PLAYERS", color.header);
      text(x, 9, modeDetail(), modeTone());
      text(x, 12, `seed ${seedDigest()}`, color.dim);
      drawPanelRail();
      text(x, 56, speedLegend(), color.dim);
      text(x, 57, "jk scroll   r reroll", color.dim);
      return;
    }

    text(x, 6, `${side === "red" && !gameDone ? "> " : "  "}${playerLabel("red", 18)}`, color.redSide);
    text(x + 25, 6, winnerSide === "red" ? "1" : "0", color.redSide);
    text(x + 28, 6, "won", color.dim);
    text(x, 8, `${side === "black" && !gameDone ? "> " : "  "}${playerLabel("black", 18)}`, color.blackSide);
    text(x + 25, 8, winnerSide === "black" ? "1" : "0", color.blackSide);
    text(x + 28, 8, "won", color.dim);
    text(x, 11, `mode ${modeLabel()}`, modeTone());
    text(x, 13, "ply", color.dim);
    text(x + 6, 13, String(ply), color.redSide);
    text(x + 15, 13, "move", color.dim);
    text(x + 22, 13, String(ply ? Math.ceil(ply / 2) : 0), color.redSide);
    const statusText = gameDone ? matchResult : aiThinking ? `${playerName(side)} thinking` : `${playerName(side)} to move`;
    text(x, 15, statusText.slice(0, 34), gameDone ? color.redFx : sideColor(side));
    if (!gameDone) text(x, 17, `seed ${seedDigest()}`, color.dim);
    if (gameDone) {
      replayButton = { x, y: 17, w: 16, h: 1 };
      text(x, 17, "[ PLAY AGAIN ]", color.redSide);
      text(x, 19, "click replay   r reroll", color.dim);
    }

    text(x, 21, "v MATERIAL", color.header);
    if (Math.abs(diff) < 0.01) {
      text(x, 24, `level   ${BRAILLE_DUST.repeat(16)}`, color.dim);
    } else {
      const leading = diff > 0 ? playerLabel("red", 12) : playerLabel("black", 12);
      const bar = clamp(Math.round(Math.abs(diff)), 2, 16);
      text(x, 24, `${leading.trim()} +${Math.abs(diff).toFixed(diff % 1 ? 1 : 0)}`, diff > 0 ? color.redSide : color.blackSide);
      text(x, 26, BRAILLE_FULL.repeat(bar) + BRAILLE_DUST.repeat(16 - bar), color.blue);
      text(x, 28, `ahead by ${Math.abs(diff).toFixed(1)} pts`, color.dim);
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
        const action = m.flag.includes("x") ? "x" : "->";
        text(x + 1, row, `${moveNo}.`, color.dim);
        text(x + 6, row, String(m.ai || playerName(m.side)).padEnd(10).slice(0, 10), sideColor(m.side));
        text(x + 18, row, TAG[m.type] || "S", color.redSide);
        text(x + 22, row, `${m.from}${action}${m.to}`, color.dim);
        text(x + 34, row, m.flag, m.flag.includes("+") ? color.redFx : color.redSide);
      });
    }

    drawPanelRail();
    text(x, 56, speedLegend(), color.dim);
    text(x, 57, "jk scroll   r reroll", color.dim);
  }

  function drawPanelRail() {
    for (let y = 2; y < 42; y += 1) put(right.x + right.w - 2, y, BRAILLE_FULL, color.blue, "#003852");
    for (let y = 42; y < right.y + right.h - 2; y += 1) put(right.x + right.w - 2, y, BRAILLE_DUST, "#13222a", color.black);
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

  function draw(now) {
    clearScreen();
    pieceLabels = [];
    drawBoard(now);
    drawRiverText();
    drawTerminalEffects(now);
    flushDotLayer();
    clearDotLayer();
    drawPieces(now);
    flushDotLayer();
    drawPieceLabels();
    drawBoardText(now);
    drawPanel();
    render();
  }

  function drawPieceLabels() {
    pieceLabels.forEach((label) => {
      put(label.x, label.y, label.char, label.fg, label.bg);
    });
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
        if (isCjkChar(c)) {
          ctx.save();
          ctx.textAlign = "center";
          ctx.font = `900 ${Math.min(ch * 1.34, cw * 2.28)}px ${CJK_FONT}`;
          ctx.lineWidth = Math.max(1, Math.min(cw, ch) * 0.055);
          ctx.strokeStyle = screen.bg[i] || color.ink;
          ctx.strokeText(c, x * cw + cw * 0.5, y * ch + ch * 0.54);
          ctx.fillText(c, x * cw + cw * 0.5, y * ch + ch * 0.55);
          ctx.restore();
        } else {
          ctx.fillText(c, x * cw + cw * 0.02, y * ch + ch * 0.55);
        }
      }
    }
  }

  function isCjkChar(char) {
    return /[\u3400-\u9fff]/.test(char);
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

  function boardSquareFromPointer(event) {
    const cell = cellFromPointer(event);
    const file = Math.round((cell.x - board.x) / board.sw);
    const rank = 9 - Math.round((cell.y - board.y) / board.sh);
    if (file < 0 || rank < 0 || file >= board.files || rank >= board.ranks) return null;
    const pos = boardPos(file, rank);
    if (Math.abs(cell.x - pos.x) > board.sw * 0.48 || Math.abs(cell.y - pos.y) > board.sh * 0.55) return null;
    return { file, rank };
  }

  async function handleHumanBoardClick(event) {
    if (!isHumanTurn() || paused || active || aiThinking || selectingPlayers || matchResult) return false;
    const square = boardSquareFromPointer(event);
    if (!square) return false;
    const clicked = findPiece(square.file, square.rank);
    const side = sideFromEngine();
    if (clicked?.side === side) {
      selectedSquare = square;
      return true;
    }
    if (!selectedSquare) return true;
    const moveText = `${squareName(selectedSquare.file, selectedSquare.rank)}${squareName(square.file, square.rank)}`;
    const token = ++aiMoveToken;
    aiThinking = true;
    const { choice, error, elapsedMs, timedOut, illegal } = await chooseRequestedMoveTimed(moveText, side, AI_MOVE_TIMEOUT_MS);
    if (token !== aiMoveToken || matchResult) return true;
    aiThinking = false;
    if (timedOut) {
      markTimeoutLoss(side, elapsedMs);
      return true;
    }
    if (error) {
      markEngineError(`engine error: ${playerName(side)} move failed`);
      return true;
    }
    if (!choice || illegal) return true;
    const move = buildMoveRecord(choice, side, matchPlayers[side]);
    selectedSquare = null;
    primeActiveMove(performance.now(), move, choice.from, choice.to);
    return true;
  }
  async function runHeadlessMatch(seed, options = {}) {
    const oldPaused = paused;
    reset(performance.now(), { seedOverride: seed, immediatePlayers: true, players: options.players, mode: options.mode || "deterministic" });
    paused = true;
    while (!matchResult && ply < (options.maxPlies || MAX_PLIES)) {
      settleResult();
      if (matchResult) break;
      const side = sideFromEngine();
      const player = matchPlayers[side];
      const { choice, elapsedMs, timedOut, error } = await chooseAIMoveTimed(player, side, options.moveTimeoutMs || AI_MOVE_TIMEOUT_MS);
      if (timedOut) {
        markTimeoutLoss(side, elapsedMs);
        break;
      }
      if (error || !choice || !applyInstantMove(choice, side)) break;
    }
    const result = publicState();
    paused = oldPaused;
    return result;
  }

  function publicState() {
    return {
      seed: matchSeedText,
      seedDigest: seedDigest(),
      mode: matchMode,
      players: { red: matchPlayers.red?.name || "", black: matchPlayers.black?.name || "" },
      ply,
      result: matchResult,
      reason: matchEndReason,
      fen: currentFen,
      moves: moveLog.map((m) => m.text),
      signature: `${matchSeedText}|${matchMode}|${matchPlayers.red?.name}|${matchPlayers.black?.name}|${moveLog.map((m) => m.text).join(",")}|${matchResult}`,
    };
  }

  seedForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    reset(performance.now());
  });
  seedInput?.addEventListener("input", updateSeedInputStatus);
  seedRandomButton?.addEventListener("click", () => reset(performance.now(), { forceRandom: true }));
  seedCopyButton?.addEventListener("click", copySeed);
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMatchMode(button.dataset.mode, true));
  });
  for (const control of [playModeSelect, humanSideSelect, aiSelect]) {
    control?.addEventListener("change", () => reset(performance.now()));
  }
  canvas.addEventListener("click", (event) => {
    const cell = cellFromPointer(event);
    if (hitsReplayButton(cell)) reset(performance.now());
    else handleHumanBoardClick(event);
  });
  canvas.addEventListener("mousemove", (event) => {
    const square = boardSquareFromPointer(event);
    const clicked = square ? findPiece(square.file, square.rank) : null;
    const canSelect = clicked?.side === sideFromEngine();
    canvas.style.cursor = hitsReplayButton(cellFromPointer(event)) || (isHumanTurn() && (canSelect || selectedSquare)) ? "pointer" : "default";
  });
  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
  });
  window.addEventListener("keydown", (event) => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && seedForm?.contains(activeElement)) {
      if (event.key === "Escape") activeElement.blur();
      return;
    }
    if (setPlaybackSpeedFromKey(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === "j") {
      event.preventDefault();
      scrollMoves(1);
    } else if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      scrollMoves(-1);
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      reset(performance.now(), { forceRandom: true });
    } else if (event.key === " ") {
      event.preventDefault();
      paused = !paused;
    }
  });

  window.XiangqiTerminal = {
    reset,
    runHeadlessMatch,
    publicState,
  };

  populatePlayControls();
  syncModeButtons();
  reset(performance.now(), { forceRandom: true });
  requestAnimationFrame(frame);
})();
