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
  const passButton = document.getElementById("pass-turn");
  const sizeButtons = Array.from(document.querySelectorAll("[data-size]"));

  const Goban = window["goban-engine"];
  const Engine = Goban && Goban.GobanEngine;

  const COLS = 132;
  const ROWS = 60;
  const CELL_W = 11;
  const CELL_H = 18;
  const FONT_SIZE = 16;
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const DOT_W = 2;
  const DOT_H = 4;
  const BRAILLE_BASE = 0x2800;
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#111914",
    boardB: "#0d1311",
    grid: "#7e8a81",
    gridDim: "#2f3935",
    star: "#b8c5b8",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    whiteStone: "#f7ffff",
    whiteAlt: "#aaf6ff",
    blackStone: "#f1a94f",
    blackAlt: "#ffd06f",
    blue: "#6ed5ec",
    red: "#ff4e59",
    territoryBlack: "#aa6b32",
    territoryWhite: "#7edce8",
  };

  const AI_ROSTER = [
    {
      name: "INFLUENCE",
      source: "seeded heuristic",
      center: 1.1,
      edge: -0.2,
      capture: 4.2,
      liberty: 1.0,
      connect: 1.2,
      settle: 0.6,
      noise: 1.1,
      pass: -1.6,
    },
    {
      name: "TERRITORY",
      source: "seeded heuristic",
      center: 0.45,
      edge: 0.35,
      capture: 2.4,
      liberty: 1.35,
      connect: 1.0,
      settle: 1.5,
      noise: 0.8,
      pass: -1.2,
    },
    {
      name: "ATARI",
      source: "seeded tactical",
      center: 0.35,
      edge: -0.1,
      capture: 6.4,
      liberty: 1.45,
      connect: 0.7,
      settle: 0.35,
      noise: 1.0,
      pass: -2.2,
    },
    {
      name: "SHADOW",
      source: "seeded moyo",
      center: 0.9,
      edge: 0.05,
      capture: 3.0,
      liberty: 0.9,
      connect: 1.65,
      settle: 1.15,
      noise: 1.35,
      pass: -1.4,
    },
    {
      name: "KOSUMI",
      source: "seeded shape",
      center: 0.7,
      edge: 0.1,
      capture: 3.2,
      liberty: 1.25,
      connect: 1.8,
      settle: 0.9,
      noise: 0.75,
      pass: -1.8,
    },
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
    boardBox: { x: 5, y: 7, w: 80, h: 45 },
  };

  const state = {
    seed: "",
    size: 19,
    speed: 1,
    paused: false,
    rng: null,
    engine: null,
    players: null,
    moves: [],
    moveLog: [],
    effects: [],
    lastMove: null,
    lastCaptures: [],
    nextMoveAt: 0,
    consecutivePasses: 0,
    ended: false,
    result: "",
    positionCounts: new Map(),
    bootError: "",
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
    let out = "";
    const random = crypto.getRandomValues(new Uint32Array(SEED_LENGTH));
    for (let i = 0; i < SEED_LENGTH; i += 1) {
      out += RANDOM_SEED_CHARS[random[i] % RANDOM_SEED_CHARS.length];
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
    return state.matchMode === "human-vs-human" || (state.matchMode === "human-vs-ai" && state.humanSide === side);
  }

  function isHumanTurn() {
    return state.engine ? isHumanSide(state.engine.colorToMove()) : false;
  }

  function updateSeedStatus() {
    if (state.ended) seedStatus.value = "FINISHED";
    else if (state.paused) seedStatus.value = "PAUSED";
    else seedStatus.value = isHumanTurn() ? "HUMAN TURN" : "PLAYING";
  }

  function scheduleNextTurn(now, delay) {
    state.nextMoveAt = isHumanTurn() ? Infinity : now + delay / state.speed;
    updateSeedStatus();
  }

  function createEngine(size) {
    return new Engine({
      width: size,
      height: size,
      rules: "chinese",
      komi: size === 19 ? 7.5 : 6.5,
      initial_player: "black",
      disable_analysis: true,
      time_control: { system: "none" },
      players: {
        black: { id: 1, username: "BLACK" },
        white: { id: 2, username: "WHITE" },
      },
    });
  }

  function startGame(seed) {
    if (!Engine) {
      state.bootError = "goban-engine failed to load";
      return;
    }
    state.seed = normalizeSeed(seed || randomSeed());
    seedInput.value = state.seed.trimEnd();
    state.rng = makeRng(`${state.seed}|${state.size}`);
    state.matchMode = playModeSelect?.value || "ai-vs-ai";
    state.humanSide = humanSideSelect?.value || "black";
    state.selectedAI = aiSelect?.value || AI_ROSTER[0].name;
    state.engine = createEngine(state.size);
    state.players = setupPlayers();
    state.moves = [];
    state.moveLog = [];
    state.effects = [];
    state.lastMove = null;
    state.lastCaptures = [];
    state.consecutivePasses = 0;
    state.ended = false;
    state.result = "";
    state.paused = false;
    state.positionCounts = new Map([[state.engine.currentPositionId(), 1]]);
    state.nextMoveAt = 0;
    scheduleNextTurn(performance.now(), 480);
    updateSizeButtons();
  }

  function updateSizeButtons() {
    for (const button of sizeButtons) {
      const active = Number(button.dataset.size) === state.size;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function boardLayout() {
    const size = state.size;
    const stepX = size === 19 ? 4 : size === 13 ? 5 : 7;
    const stepY = size === 19 ? 2 : size === 13 ? 3 : 4;
    const gridW = (size - 1) * stepX + 1;
    const gridH = (size - 1) * stepY + 1;
    const box = layout.boardBox;
    return {
      size,
      x: box.x + Math.floor((box.w - gridW) / 2),
      y: box.y + Math.floor((box.h - gridH) / 2),
      stepX,
      stepY,
      gridW,
      gridH,
      box,
    };
  }

  function pointToSub(point, b = boardLayout()) {
    return {
      sx: (b.x + point.x * b.stepX) * DOT_W,
      sy: (b.y + point.y * b.stepY) * DOT_H,
    };
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
        if (xx >= 0 && yy >= 0 && xx < COLS && yy < ROWS) {
          screen.bg[idx(xx, yy)] = bg;
        }
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
        const mask = dotLayer.mask[i];
        if (!mask) continue;
        screen.ch[i] = String.fromCharCode(BRAILLE_BASE + mask);
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
    drawBox(layout.left, "GO TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE GO / GOBAN-ENGINE", color.header);
    writeText(4, 4, `BOARD ${state.size}x${state.size} / RULES CHINESE`, color.dim);
    writeText(4, 56, "1 0.5x  2 1x  3 2x  4 4x  SPACE pause  R reroll  P play", color.dim);
  }

  function drawBoardBackground() {
    const b = boardLayout();
    fillRect(b.box.x, b.box.y, b.box.w, b.box.h, color.boardA);
    for (let y = b.box.y; y < b.box.y + b.box.h; y += 1) {
      for (let x = b.box.x; x < b.box.x + b.box.w; x += 1) {
        const staticNoise = (x * 37 + y * 19 + x * y * 5) % 47;
        if (staticNoise <= 2) screen.bg[idx(x, y)] = color.boardB;
      }
    }

    const start = pointToSub({ x: 0, y: 0 }, b);
    const end = pointToSub({ x: b.size - 1, y: b.size - 1 }, b);
    for (let row = 0; row < b.size; row += 1) {
      const sy = (b.y + row * b.stepY) * DOT_H;
      for (let sx = start.sx; sx <= end.sx; sx += 2) putDotSub(sx, sy, color.gridDim, 0.25);
    }
    for (let col = 0; col < b.size; col += 1) {
      const sx = (b.x + col * b.stepX) * DOT_W;
      for (let sy = start.sy; sy <= end.sy; sy += 2) putDotSub(sx, sy, color.gridDim, 0.25);
    }

    for (const star of starPoints(b.size)) {
      drawStar(star.x, star.y, b);
    }

    const files = "ABCDEFGHJKLMNOPQRST".slice(0, b.size);
    for (let i = 0; i < b.size; i += 1) {
      writeText(b.x + i * b.stepX, b.y + b.gridH + 1, files[i], color.dim);
      const rank = String(b.size - i).padStart(2, " ");
      writeText(Math.max(1, b.x - 4), b.y + i * b.stepY, rank, color.dim);
    }
  }

  function starPoints(size) {
    if (size === 19) return [3, 9, 15].flatMap((x) => [3, 9, 15].map((y) => ({ x, y })));
    if (size === 13) return [3, 6, 9].flatMap((x) => [3, 6, 9].map((y) => ({ x, y })));
    return [2, 4, 6].flatMap((x) => [2, 4, 6].map((y) => ({ x, y })));
  }

  function drawStar(x, y, b) {
    const { sx, sy } = pointToSub({ x, y }, b);
    for (let yy = -2; yy <= 2; yy += 1) {
      for (let xx = -2; xx <= 2; xx += 1) {
        if (Math.abs(xx) + Math.abs(yy) <= 2) putDotSub(sx + xx, sy + yy, color.star, 0.6);
      }
    }
  }

  function sideColor(side) {
    return side === "black" ? color.blackStone : color.whiteStone;
  }

  function sideAltColor(side) {
    return side === "black" ? color.blackAlt : color.whiteAlt;
  }

  function drawStone(point, side, b, options = {}) {
    const { sx, sy } = pointToSub(point, b);
    const baseRadius = Math.min(b.stepX * DOT_W, b.stepY * DOT_H) * 0.44;
    const radius = baseRadius * (options.scale ?? 1);
    const fade = options.fade ?? 1;
    const erode = options.erode ?? 0;
    const main = options.color || sideColor(side);
    const alt = options.alt || sideAltColor(side);
    const minX = Math.floor(sx - radius - 2);
    const maxX = Math.ceil(sx + radius + 2);
    const minY = Math.floor(sy - radius - 2);
    const maxY = Math.ceil(sy + radius + 2);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - sx;
        const dy = y - sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const hash = ((x * 17 + y * 31 + point.x * 11 + point.y * 7) & 7) / 7;
        if (erode > 0 && hash < erode * 0.85 && d > radius * 0.25) continue;
        const inner = d < radius * 0.56;
        const rim = d > radius * 0.78;
        const fg = inner ? alt : main;
        const power = (rim ? 0.85 : 1) * fade;
        putDotSub(x, y, fg, power);
      }
    }
  }

  function drawStones(now) {
    if (!state.engine) return;
    const b = boardLayout();
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const stone = state.engine.board[y][x];
        if (!stone) continue;
        const side = stone === 1 ? "black" : "white";
        const isLast = state.lastMove && state.lastMove.x === x && state.lastMove.y === y;
        let scale = 1;
        if (isLast) {
          const age = now - state.lastMove.at;
          scale = reducedMotion ? 1 : lerp(0.72, 1, clamp(age / 220, 0, 1));
        }
        drawStone({ x, y }, side, b, { scale });
      }
    }
  }

  function drawLibertyBreath(now) {
    if (!state.engine || state.ended) return;
    const b = boardLayout();
    const libs = state.engine.computeLibertyMap();
    const phase = reducedMotion ? 0.7 : 0.45 + Math.sin(now / 260) * 0.2;
    const marked = new Set();
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const stone = state.engine.board[y][x];
        if (!stone || libs[y][x] > 2) continue;
        const group = state.engine.getRawStoneString(x, y, true);
        const side = stone === 1 ? "black" : "white";
        for (const pt of group) marked.add(`${pt.x},${pt.y}`);
        for (const pt of group) {
          const neighbors = [
            { x: pt.x - 1, y: pt.y },
            { x: pt.x + 1, y: pt.y },
            { x: pt.x, y: pt.y - 1 },
            { x: pt.x, y: pt.y + 1 },
          ];
          for (const n of neighbors) {
            if (n.x < 0 || n.y < 0 || n.x >= state.size || n.y >= state.size) continue;
            if (state.engine.board[n.y][n.x] !== 0) continue;
            const { sx, sy } = pointToSub(n, b);
            const danger = libs[y][x] === 1;
            const fg = danger ? color.red : sideAltColor(side);
            const p = danger ? 0.8 : 0.42;
            putDotSub(sx, sy, fg, p * phase);
            putDotSub(sx + 1, sy, fg, p * phase);
            putDotSub(sx, sy + 1, fg, p * phase);
          }
        }
      }
    }
  }

  function drawDropEffect(effect, now) {
    const t = clamp((now - effect.at) / effect.duration, 0, 1);
    const b = boardLayout();
    const { sx, sy } = pointToSub(effect, b);
    const maxRadius = Math.min(18, Math.max(9, b.stepX * 4));
    const radius = lerp(2, maxRadius, t);
    const fade = 1 - t;
    for (let a = 0; a < 64; a += 1) {
      const angle = (a / 64) * Math.PI * 2;
      const r = radius + Math.sin(a * 2.41) * 0.8;
      const x = Math.round(sx + Math.cos(angle) * r);
      const y = Math.round(sy + Math.sin(angle) * r);
      if (a % 2 === 0 || fade > 0.55) putDotSub(x, y, effect.fg, fade);
    }
    const reach = Math.floor(lerp(1, b.stepX * 3, t));
    for (let i = -reach; i <= reach; i += 2) {
      putDotSub(sx + i, sy, effect.fg, fade * 0.45);
      putDotSub(sx, sy + i, effect.fg, fade * 0.45);
    }
  }

  function drawCaptureEffect(effect, now) {
    const t = clamp((now - effect.at) / effect.duration, 0, 1);
    const b = boardLayout();
    const side = effect.side;
    for (const stone of effect.stones) {
      drawStone(stone, side, b, { fade: 1 - t * 0.85, erode: t, scale: 1 - t * 0.15 });
      const { sx, sy } = pointToSub(stone, b);
      for (let i = 0; i < 18; i += 1) {
        const angle = ((i * 137.5 + stone.x * 17 + stone.y * 23) / 180) * Math.PI;
        const r = lerp(2, 15, t) + (i % 3);
        const x = Math.round(sx + Math.cos(angle) * r);
        const y = Math.round(sy + Math.sin(angle) * r);
        if ((i + Math.floor(t * 8)) % 3 !== 0) putDotSub(x, y, color.red, 1 - t);
      }
    }
  }

  function drawEndEffect(now) {
    if (!state.ended) return;
    const b = boardLayout();
    const t = (Math.sin(now / 400) + 1) / 2;
    const scoring = state.engine.computeScoringLocations(true);
    for (const pt of scoring.black.locations) {
      if (state.engine.board[pt.y][pt.x]) continue;
      const { sx, sy } = pointToSub(pt, b);
      if ((pt.x * 3 + pt.y * 5) % 4 === 0) putDotSub(sx, sy, color.territoryBlack, 0.25 + t * 0.2);
    }
    for (const pt of scoring.white.locations) {
      if (state.engine.board[pt.y][pt.x]) continue;
      const { sx, sy } = pointToSub(pt, b);
      if ((pt.x * 5 + pt.y * 3) % 4 === 0) putDotSub(sx, sy, color.territoryWhite, 0.25 + t * 0.2);
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((effect) => now - effect.at < effect.duration);
    for (const effect of state.effects) {
      if (effect.type === "drop") drawDropEffect(effect, now);
      if (effect.type === "capture") drawCaptureEffect(effect, now);
    }
  }

  function drawPanel(now) {
    const r = layout.right;
    const blackName = state.players?.black.name || "SELECTING";
    const whiteName = state.players?.white.name || "SELECTING";
    const toMove = state.engine && !state.ended ? state.engine.colorToMove().toUpperCase() : "DONE";
    const score = state.engine ? state.engine.computeScore() : null;
    const diff = score ? score.black.total - score.white.total : 0;
    const bar = score ? scoreBar(diff) : "----------";

    writeText(r.x + 3, r.y + 3, "RULE ENGINE", color.header);
    writeText(r.x + 3, r.y + 5, "goban-engine 8.3", color.blue);
    writeText(r.x + 3, r.y + 7, "BLACK", color.blackStone);
    writeText(r.x + 12, r.y + 7, blackName.padEnd(16).slice(0, 16), color.blackAlt);
    writeText(r.x + 3, r.y + 8, "WHITE", color.whiteStone);
    writeText(r.x + 12, r.y + 8, whiteName.padEnd(16).slice(0, 16), color.whiteAlt);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, toMove === "BLACK" ? color.blackStone : color.whiteStone);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "SCORE EST", color.header);
    writeText(r.x + 3, r.y + 17, `[${bar}]`, diff >= 0 ? color.blackStone : color.whiteStone);
    writeText(r.x + 3, r.y + 18, `${diff >= 0 ? "BLACK" : "WHITE"} +${Math.abs(diff).toFixed(1)}`, diff >= 0 ? color.blackStone : color.whiteStone);
    if (score) {
      writeText(r.x + 3, r.y + 20, `B ${score.black.total.toFixed(1).padStart(6, " ")}`, color.blackStone);
      writeText(r.x + 19, r.y + 20, `W ${score.white.total.toFixed(1).padStart(6, " ")}`, color.whiteStone);
    }

    writeText(r.x + 3, r.y + 23, "MOVES", color.header);
    const recent = state.moveLog.slice(-18);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const y = r.y + 25 + i;
      const fg = move.side === "black" ? color.blackStone : color.whiteStone;
      const marker = move.pass ? "--" : move.coord;
      const cap = move.captures ? ` x${move.captures}` : "";
      writeText(r.x + 3, y, `${String(move.ply).padStart(3, "0")} ${move.side[0].toUpperCase()} ${marker}${cap}`.slice(0, 31), fg);
    }

    if (state.ended) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), color.red);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.red);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} reading liberties`, color.dim);
    }
  }

  function scoreBar(diff) {
    const size = 20;
    const center = Math.floor(size / 2);
    const span = clamp(Math.round(diff / 8), -center, center);
    let out = "";
    for (let i = -center; i < center; i += 1) {
      if (i === 0) out += "|";
      else if (span > 0 && i > 0 && i <= span) out += "#";
      else if (span < 0 && i < 0 && i >= span) out += "#";
      else out += ".";
    }
    return out.slice(0, size);
  }

  function coordinate(x, y) {
    const files = "ABCDEFGHJKLMNOPQRST";
    return `${files[x] || "?"}${state.size - y}`;
  }

  function boardClone() {
    return state.engine.board.map((row) => row.slice());
  }

  function makeTestEngine() {
    return new Engine({
      width: state.size,
      height: state.size,
      board: boardClone(),
      removal: state.engine.removal.map((row) => row.slice()),
      player: state.engine.player,
      white_prisoners: state.engine.white_prisoners,
      black_prisoners: state.engine.black_prisoners,
      rules: "chinese",
      komi: state.size === 19 ? 7.5 : 6.5,
      disable_analysis: true,
      time_control: { system: "none" },
      players: {
        black: { id: 1, username: "BLACK" },
        white: { id: 2, username: "WHITE" },
      },
    });
  }

  function legalSimulation(x, y) {
    if (state.engine.board[y][x]) return null;
    try {
      const test = makeTestEngine();
      const removed = [];
      test.place(x, y, true, true, false, false, true, removed);
      return { test, removed };
    } catch (error) {
      return null;
    }
  }

  function neighbors(x, y) {
    return [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ].filter((pt) => pt.x >= 0 && pt.y >= 0 && pt.x < state.size && pt.y < state.size);
  }

  function evaluateMove(x, y, sim, persona, side) {
    const size = state.size;
    const board = state.engine.board;
    const beforeLibs = state.engine.computeLibertyMap();
    const afterLibs = sim.test.computeLibertyMap();
    const center = (size - 1) / 2;
    const distCenter = Math.hypot(x - center, y - center) / center;
    const edgeDist = Math.min(x, y, size - 1 - x, size - 1 - y);
    const sideValue = side === "black" ? 1 : 2;
    const oppValue = side === "black" ? 2 : 1;
    let ownAdj = 0;
    let oppAdj = 0;
    let pressure = 0;
    let escape = 0;
    for (const n of neighbors(x, y)) {
      if (board[n.y][n.x] === sideValue) {
        ownAdj += 1;
        if (beforeLibs[n.y][n.x] <= 2) escape += 2;
      }
      if (board[n.y][n.x] === oppValue) {
        oppAdj += 1;
        if (beforeLibs[n.y][n.x] <= 2) pressure += 2.5;
      }
    }
    const captures = sim.removed.length;
    const newLibs = afterLibs[y][x] || 0;
    const starBonus = starPoints(size).some((pt) => Math.abs(pt.x - x) + Math.abs(pt.y - y) <= 1) ? 1.25 : 0;
    const opening = state.moves.length < Math.min(12, size) ? starBonus * 2.2 : 0;
    const edgeShape = edgeDist <= 1 ? -1.8 : edgeDist <= 3 ? persona.edge : 0.4;
    const spreadPenalty = ownAdj >= 3 ? -1.7 : 0;
    const noise = (state.rng() - 0.5) * persona.noise;
    return (
      captures * persona.capture +
      pressure +
      escape +
      newLibs * persona.liberty * 0.25 +
      ownAdj * persona.connect +
      oppAdj * 0.35 +
      (1 - distCenter) * persona.center * 2 +
      edgeShape +
      opening +
      persona.settle * Math.min(edgeDist, 4) * 0.15 +
      spreadPenalty +
      noise
    );
  }

  function chooseMove() {
    const side = state.engine.colorToMove();
    const persona = state.players[side];
    const candidates = [];
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const sim = legalSimulation(x, y);
        if (!sim) continue;
        candidates.push({
          x,
          y,
          score: evaluateMove(x, y, sim, persona, side),
          captures: sim.removed.length,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, Math.min(8, candidates.length));
    if (!top.length) return { pass: true, reason: "no legal move" };
    const best = top[Math.floor(Math.pow(state.rng(), 1.8) * top.length)];
    const boardFill = state.moves.length / (state.size * state.size);
    if (state.moves.length > state.size * 2 && best.score < persona.pass + boardFill * 2.2 && state.rng() < 0.35) {
      return { pass: true, reason: "low value" };
    }
    return { pass: false, x: best.x, y: best.y, score: best.score };
  }

  function diffCaptured(before, after) {
    const out = [];
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        if (before[y][x] && !after[y][x]) out.push({ x, y, stone: before[y][x] });
      }
    }
    return out;
  }

  function playMove(move, now) {
    if (!state.engine || state.ended || state.paused) return;
    const side = state.engine.colorToMove();
    if (move.pass) {
      state.engine.place(-1, -1, true, true, false, false, true, []);
      state.moves.push({ pass: true, side });
      state.moveLog.push({ ply: state.moves.length, side, pass: true, coord: "--", captures: 0 });
      state.consecutivePasses += 1;
      state.lastMove = null;
      if (state.consecutivePasses >= 2) finishGame("double pass");
    } else {
      const before = boardClone();
      const removed = [];
      try {
        state.engine.place(move.x, move.y, true, true, false, false, true, removed);
      } catch (error) {
        state.engine.place(-1, -1, true, true, false, false, true, []);
        state.consecutivePasses += 1;
        state.moveLog.push({ ply: state.moves.length + 1, side, pass: true, coord: "--", captures: 0 });
        scheduleNextTurn(now, 720);
        return;
      }
      const captured = diffCaptured(before, state.engine.board);
      state.moves.push({ x: move.x, y: move.y, side });
      state.moveLog.push({
        ply: state.moves.length,
        side,
        pass: false,
        coord: coordinate(move.x, move.y),
        captures: captured.length,
      });
      state.consecutivePasses = 0;
      state.lastMove = { x: move.x, y: move.y, side, at: now };
      state.effects.push({ type: "drop", x: move.x, y: move.y, at: now, duration: reducedMotion ? 120 : 620, fg: sideAltColor(side) });
      if (captured.length) {
        const capturedSide = captured[0].stone === 1 ? "black" : "white";
        state.effects.push({ type: "capture", stones: captured, side: capturedSide, at: now, duration: reducedMotion ? 180 : 760 });
      }
      const pos = state.engine.currentPositionId();
      const count = (state.positionCounts.get(pos) || 0) + 1;
      state.positionCounts.set(pos, count);
      if (count >= 3) finishGame("triple position");
    }

    const maxPlies = Math.floor(state.size * state.size * 1.35);
    if (!state.ended && state.moves.length >= maxPlies) finishGame("move limit");
    if (!state.ended) scheduleNextTurn(now, 720);
  }

  function playAIMove(now) {
    if (!state.engine || state.ended || state.paused || isHumanTurn()) return;
    playMove(chooseMove(), now);
  }

  function finishGame(reason) {
    if (!state.engine) return;
    state.ended = true;
    const score = state.engine.computeScore();
    const diff = score.black.total - score.white.total;
    const winner = diff >= 0 ? "BLACK" : "WHITE";
    state.result = `${winner} +${Math.abs(diff).toFixed(1)} / ${reason}`;
    updateSeedStatus();
  }

  function cellFromPointer(event) {
    const b = boardLayout();
    const rect = canvas.getBoundingClientRect();
    const tx = ((event.clientX - rect.left) / rect.width) * COLS;
    const ty = ((event.clientY - rect.top) / rect.height) * ROWS;
    const x = Math.round((tx - b.x) / b.stepX);
    const y = Math.round((ty - b.y) / b.stepY);
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) return null;
    const c = { x: b.x + x * b.stepX, y: b.y + y * b.stepY };
    if (Math.abs(tx - c.x) > b.stepX * 0.5 || Math.abs(ty - c.y) > b.stepY * 0.65) return null;
    return { x, y };
  }

  function handleHumanClick(event) {
    if (!isHumanTurn() || state.paused || state.ended) return;
    const cell = cellFromPointer(event);
    if (!cell || !legalSimulation(cell.x, cell.y)) return;
    playMove({ pass: false, x: cell.x, y: cell.y }, performance.now());
  }

  function handleHumanPass() {
    if (!isHumanTurn() || state.paused || state.ended) return;
    playMove({ pass: true, reason: "human pass" }, performance.now());
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
    if (state.bootError) {
      writeText(6, 12, state.bootError, color.red);
      renderTerminal();
      return;
    }
    drawBoardBackground();
    drawLibertyBreath(now);
    drawEndEffect(now);
    drawEffects(now);
    drawStones(now);
    flushDotLayer(layout.left);
    drawPanel(now);
    renderTerminal();
  }

  function loop(now) {
    if (!state.paused && !state.ended && !isHumanTurn() && now >= state.nextMoveAt) playAIMove(now);
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
        if (!state.ended) updateSeedStatus();
      }, 900);
    } catch (error) {
      seedStatus.value = "COPY ERR";
    }
  });

  for (const button of sizeButtons) {
    button.addEventListener("click", () => {
      state.size = Number(button.dataset.size);
      startGame(seedInput.value || state.seed || randomSeed());
    });
  }

  for (const control of [playModeSelect, humanSideSelect, aiSelect]) {
    control?.addEventListener("change", () => {
      startGame(seedInput.value || state.seed || randomSeed());
    });
  }

  passButton?.addEventListener("click", handleHumanPass);

  canvas.addEventListener("click", handleHumanClick);

  canvas.addEventListener("mousemove", (event) => {
    const cell = cellFromPointer(event);
    canvas.style.cursor = isHumanTurn() && cell && legalSimulation(cell.x, cell.y) ? "pointer" : "default";
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
