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
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const SPEEDS = [0.5, 1, 2, 4];
  const ROW_LENGTHS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
  const MAX_PLIES = 360;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#06080d",
    ink2: "#0b1017",
    panel: "#080c12",
    boardA: "#101713",
    boardB: "#0d1210",
    grid: "#75877f",
    gridDim: "#2d3a36",
    hole: "#6a7974",
    dim: "#586472",
    muted: "#7a8397",
    header: "#b8c0ca",
    northStone: "#f7ffff",
    northAlt: "#aaf6ff",
    southStone: "#f0a245",
    southAlt: "#ffd06f",
    blue: "#6ed5ec",
    red: "#ff4e59",
    win: "#ff4e59",
  };

  const AI_ROSTER = [
    { name: "LADDER", attack: 1.2, jump: 1.35, center: 0.5, noise: 0.55, source: "jump heuristic" },
    { name: "NEBULA", attack: 0.9, jump: 1.05, center: 1.35, noise: 1.2, source: "center heuristic" },
    { name: "ARROW", attack: 1.55, jump: 0.85, center: 0.35, noise: 0.65, source: "race heuristic" },
    { name: "ANCHOR", attack: 0.82, jump: 1.1, center: 0.9, noise: 0.35, source: "stable heuristic" },
    { name: "COMET", attack: 1.28, jump: 1.6, center: 0.2, noise: 1.55, source: "volatile heuristic" },
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
    board: { cx: 45, y: 8.3, gapX: 3.7, gapY: 2.62 },
  };

  const holes = buildHoles();
  const holeById = new Map(holes.map((hole) => [hole.id, hole]));
  const northHome = new Set(holes.filter((hole) => hole.row <= 3).map((hole) => hole.id));
  const southHome = new Set(holes.filter((hole) => hole.row >= 13).map((hole) => hole.id));
  const neighborMap = buildNeighbors();

  const state = {
    seed: "",
    rng: null,
    pieces: new Map(),
    players: null,
    toMove: 1,
    moves: [],
    moveLog: [],
    fragments: [],
    ripples: [],
    active: null,
    winner: 0,
    result: "",
    nextMoveAt: 0,
    lastFrame: 0,
    speed: 1,
    paused: false,
    lastMove: null,
    selected: null,
    matchMode: "ai-vs-ai",
    humanSide: "north",
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
        '<option value="north">HUMAN NORTH</option>',
        '<option value="south">HUMAN SOUTH</option>',
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
    const north = { ...pick(state.rng, AI_ROSTER) };
    const south = { ...pick(state.rng, AI_ROSTER) };
    if (state.matchMode === "human-vs-human") {
      return { north: { name: "HUMAN", source: "local" }, south: { name: "HUMAN", source: "local" } };
    }
    if (state.matchMode === "human-vs-ai") {
      const ai = selectedAIPlayer();
      return state.humanSide === "north"
        ? { north: { name: "HUMAN", source: "local" }, south: ai }
        : { north: ai, south: { name: "HUMAN", source: "local" } };
    }
    return { north, south };
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
    else if (state.selected !== null) seedStatus.value = "SELECT TO";
    else seedStatus.value = isHumanTurn() ? "HUMAN TURN" : "PLAYING";
  }

  function scheduleNextTurn(now, delay) {
    state.selected = null;
    state.nextMoveAt = isHumanTurn() ? Infinity : now + delay / state.speed;
    updateSeedStatus();
  }

  function buildHoles() {
    const out = [];
    let id = 0;
    for (let row = 0; row < ROW_LENGTHS.length; row += 1) {
      const len = ROW_LENGTHS[row];
      for (let col = 0; col < len; col += 1) {
        out.push({
          id,
          row,
          col,
          x: layout.board.cx + (col - (len - 1) / 2) * layout.board.gapX,
          y: layout.board.y + row * layout.board.gapY,
        });
        id += 1;
      }
    }
    return out;
  }

  function buildNeighbors() {
    const map = new Map(holes.map((hole) => [hole.id, []]));
    for (let i = 0; i < holes.length; i += 1) {
      for (let j = i + 1; j < holes.length; j += 1) {
        const a = holes[i];
        const b = holes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 2.9 && d < 4.15) {
          map.get(a.id).push(b.id);
          map.get(b.id).push(a.id);
        }
      }
    }
    return map;
  }

  function findHoleAt(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const hole of holes) {
      const dx = hole.x - x;
      const dy = hole.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = hole;
      }
    }
    return bestDist < 0.28 ? best : null;
  }

  function landingAfter(fromId, midId) {
    const from = holeById.get(fromId);
    const mid = holeById.get(midId);
    return findHoleAt(mid.x + (mid.x - from.x), mid.y + (mid.y - from.y));
  }

  function startGame(seed) {
    state.seed = normalizeSeed(seed || randomSeed());
    seedInput.value = state.seed.trimEnd();
    state.rng = makeRng(`${state.seed}|chinese-checkers`);
    state.matchMode = playModeSelect?.value || "ai-vs-ai";
    state.humanSide = humanSideSelect?.value || "north";
    state.selectedAI = aiSelect?.value || AI_ROSTER[0].name;
    state.pieces = new Map();
    state.players = setupPlayers();
    for (const id of northHome) state.pieces.set(id, 1);
    for (const id of southHome) state.pieces.set(id, 2);
    state.toMove = 1;
    state.moves = [];
    state.moveLog = [];
    state.fragments = [];
    state.ripples = [];
    state.active = null;
    state.winner = 0;
    state.result = "";
    state.paused = false;
    state.lastMove = null;
    state.selected = null;
    state.nextMoveAt = 0;
    state.lastFrame = 0;
    scheduleNextTurn(performance.now(), 480);
  }

  function sideName(side) {
    return side === 1 ? "north" : "south";
  }

  function sideTitle(side) {
    return sideName(side).toUpperCase();
  }

  function sideColor(side) {
    return side === 1 ? color.northStone : color.southStone;
  }

  function sideAltColor(side) {
    return side === 1 ? color.northAlt : color.southAlt;
  }

  function sideEffectColor(side) {
    return side === 1 ? color.blue : color.red;
  }

  function sidePlayer(side) {
    return side === 1 ? state.players?.north : state.players?.south;
  }

  function homeSet(side) {
    return side === 1 ? northHome : southHome;
  }

  function targetSet(side) {
    return side === 1 ? southHome : northHome;
  }

  function targetCenter(side) {
    const ids = [...targetSet(side)];
    const sum = ids.reduce(
      (acc, id) => {
        const h = holeById.get(id);
        acc.x += h.x;
        acc.y += h.y;
        return acc;
      },
      { x: 0, y: 0 },
    );
    return { x: sum.x / ids.length, y: sum.y / ids.length };
  }

  function distanceToTarget(side, hole) {
    const t = targetCenter(side);
    return Math.sqrt((hole.x - t.x) ** 2 + (hole.y - t.y) ** 2);
  }

  function pieceIds(side) {
    return [...state.pieces.entries()].filter((entry) => entry[1] === side).map((entry) => entry[0]);
  }

  function occupied(id, fromId = null) {
    return state.pieces.has(id) && id !== fromId;
  }

  function legalMoves(side) {
    const moves = [];
    for (const fromId of pieceIds(side)) {
      for (const toId of neighborMap.get(fromId)) {
        if (!state.pieces.has(toId)) moves.push({ side, from: fromId, to: toId, path: [fromId, toId], kind: "STEP" });
      }
      moves.push(...jumpMovesFrom(fromId, side));
    }
    return moves;
  }

  function jumpMovesFrom(fromId, side) {
    const moves = [];
    const queue = [{ id: fromId, path: [fromId] }];
    const visited = new Set([fromId]);
    while (queue.length) {
      const current = queue.shift();
      for (const midId of neighborMap.get(current.id)) {
        if (!occupied(midId, fromId)) continue;
        const landing = landingAfter(current.id, midId);
        if (!landing || visited.has(landing.id) || occupied(landing.id, fromId)) continue;
        const path = [...current.path, landing.id];
        visited.add(landing.id);
        moves.push({ side, from: fromId, to: landing.id, path, kind: "JUMP" });
        queue.push({ id: landing.id, path });
      }
    }
    return moves;
  }

  function scoreMove(move) {
    const player = sidePlayer(move.side);
    const from = holeById.get(move.from);
    const to = holeById.get(move.to);
    const before = distanceToTarget(move.side, from);
    const after = distanceToTarget(move.side, to);
    const progress = before - after;
    const target = targetSet(move.side);
    const home = homeSet(move.side);
    let score = progress * 14 * player.attack;
    score += (move.path.length - 2) * 5.8 * player.jump;
    score += move.kind === "JUMP" ? 2.3 * player.jump : 0;
    score += target.has(move.to) && !target.has(move.from) ? 15 : 0;
    score -= target.has(move.from) && !target.has(move.to) ? 22 : 0;
    score -= home.has(move.to) && !home.has(move.from) ? 7 : 0;
    score -= Math.abs(to.x - layout.board.cx) * 0.08 * player.center;
    score += state.rng() * 3.2 * player.noise;
    return score;
  }

  function chooseMove() {
    const moves = legalMoves(state.toMove);
    if (!moves.length) return null;
    const scored = moves.map((move) => ({ ...move, score: scoreMove(move) })).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(7, scored.length));
    return top[Math.floor(Math.pow(state.rng(), 1.7) * top.length)];
  }

  function coordinate(id) {
    const h = holeById.get(id);
    return `${String.fromCharCode(65 + h.row)}${String(h.col + 1).padStart(2, "0")}`;
  }

  function beginAIMove(now) {
    if (state.paused || state.active || state.winner || isHumanTurn()) return;
    beginMove(chooseMove(), now);
  }

  function beginMove(move, now) {
    if (!move) {
      finishGame(state.toMove === 1 ? 2 : 1, `${sideTitle(state.toMove)} STALLED`);
      return;
    }
    state.active = {
      move,
      side: state.toMove,
      start: now,
      duration: (reducedMotion ? 130 : 250) * Math.max(1, move.path.length - 1) / state.speed,
      lastTrail: now,
    };
    rippleChar(holeChar(move.from), move.side, 0.75, now);
  }

  function finishActiveMove(now) {
    const active = state.active;
    if (!active) return;
    const move = active.move;
    state.pieces.delete(move.from);
    state.pieces.set(move.to, move.side);
    for (let i = 1; i < move.path.length; i += 1) {
      const p = holeChar(move.path[i]);
      rippleChar(p, move.side, move.kind === "JUMP" ? 0.9 : 0.65, now);
      if (move.kind === "JUMP") shatterChar(p, move.side, reducedMotion ? 4 : 14, 0.78, now);
    }
    state.moves.push(move);
    state.lastMove = { ...move, at: now };
    state.moveLog.push({
      ply: state.moves.length,
      side: move.side,
      coord: coordinate(move.to),
      kind: move.kind === "JUMP" ? `JUMP x${move.path.length - 1}` : "STEP",
    });

    if (hasWon(move.side)) {
      finishGame(move.side, `${sideTitle(move.side)} HOME`);
      emitWinBurst(move.side, now, true);
      state.active = null;
      return;
    }
    if (state.moves.length >= MAX_PLIES) {
      finishGame(0, "DRAW / move limit");
      state.active = null;
      return;
    }

    state.toMove = move.side === 1 ? 2 : 1;
    state.active = null;
    scheduleNextTurn(now, 260);
  }

  function hasWon(side) {
    const target = targetSet(side);
    return pieceIds(side).every((id) => target.has(id));
  }

  function finishGame(winner, result) {
    state.winner = winner;
    state.result = result;
    updateSeedStatus();
  }

  function holeChar(id) {
    const h = holeById.get(id);
    return { x: h.x, y: h.y };
  }

  function holeFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const tx = ((event.clientX - rect.left) / rect.width) * COLS;
    const ty = ((event.clientY - rect.top) / rect.height) * ROWS;
    let best = null;
    let bestDist = Infinity;
    for (const hole of holes) {
      const dist = (hole.x - tx) ** 2 + ((hole.y - ty) / 0.82) ** 2;
      if (dist < bestDist) {
        best = hole;
        bestDist = dist;
      }
    }
    return bestDist <= 4.2 ? best : null;
  }

  function handleHumanClick(event) {
    if (!isHumanTurn() || state.paused || state.active || state.winner) return;
    const hole = holeFromPointer(event);
    if (!hole) return;
    const owner = state.pieces.get(hole.id);
    if (owner === state.toMove) {
      state.selected = hole.id;
      updateSeedStatus();
      return;
    }
    if (state.selected === null) return;
    const move = legalMoves(state.toMove).find((candidate) => candidate.from === state.selected && candidate.to === hole.id);
    if (move) {
      state.selected = null;
      beginMove(move, performance.now());
    }
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
    drawBox(layout.left, "CHINESE CHECKERS TERMINAL");
    drawBox(layout.right, "MATCH");
    writeText(4, 3, "BRAILLE CHINESE CHECKERS / 2 PLAYER RACE", color.header);
    writeText(4, 4, "SINGLE STEPS + CHAINED JUMPS / REACH THE OPPOSITE CAMP", color.dim);
    writeText(4, 56, "1 0.5x  2 1x  3 2x  4 4x  SPACE pause  R reroll  P play", color.dim);
  }

  function drawBoardBackground() {
    const box = layout.boardBox;
    fillRect(box.x, box.y, box.w, box.h, color.boardA);
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const staticNoise = (x * 29 + y * 17 + x * y * 3) % 59;
        if (staticNoise <= 2) screen.bg[idx(x, y)] = color.boardB;
      }
    }

    const seen = new Set();
    for (const hole of holes) {
      for (const nId of neighborMap.get(hole.id)) {
        const key = hole.id < nId ? `${hole.id}:${nId}` : `${nId}:${hole.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const other = holeById.get(nId);
        drawDottedLine(hole, other, color.gridDim, 0.18);
      }
    }

    for (const hole of holes) drawHole(hole);
    writeText(Math.round(layout.board.cx - 6), 6, "NORTH CAMP", color.northAlt);
    writeText(Math.round(layout.board.cx - 6), 52, "SOUTH CAMP", color.southAlt);
  }

  function drawDottedLine(a, b, fg, power) {
    const ax = Math.round(a.x * DOT_W);
    const ay = Math.round(a.y * DOT_H);
    const bx = Math.round(b.x * DOT_W);
    const by = Math.round(b.y * DOT_H);
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= steps; i += 3) {
      const t = steps ? i / steps : 0;
      putDotSub(Math.round(lerp(ax, bx, t)), Math.round(lerp(ay, by, t)), fg, power);
    }
  }

  function drawHole(hole) {
    const sx = Math.round(hole.x * DOT_W);
    const sy = Math.round(hole.y * DOT_H);
    const inNorth = northHome.has(hole.id);
    const inSouth = southHome.has(hole.id);
    const fg = inNorth ? color.northAlt : inSouth ? color.southAlt : color.hole;
    const power = inNorth || inSouth ? 0.52 : 0.35;
    putDotSub(sx, sy, fg, power);
    putDotSub(sx + 1, sy, fg, power);
    putDotSub(sx, sy + 1, fg, power * 0.8);
    putDotSub(sx + 1, sy + 1, fg, power * 0.8);
  }

  function drawPieces(now) {
    const movingFrom = state.active?.move.from ?? null;
    for (const [id, side] of state.pieces.entries()) {
      if (id === movingFrom) continue;
      const h = holeById.get(id);
      const fresh = state.lastMove?.to === id ? clamp((now - state.lastMove.at) / 220, 0, 1) : 1;
      const selected = id === state.selected;
      const pos = { x: h.x, y: h.y };
      if (selected) drawSelectedPieceHalo(pos, side, now);
      drawPieceAt(pos, side, selected ? 1.1 : lerp(0.84, 1, fresh));
    }
    if (state.active) {
      const pos = activePosition(clamp((now - state.active.start) / state.active.duration, 0, 1));
      drawPieceAt(pos, state.active.side, 0.98 + Math.sin((now - state.active.start) / 80) * 0.06);
    }
  }

  function drawSelectedPieceHalo(pos, side, now) {
    const sx = Math.round(pos.x * DOT_W);
    const sy = Math.round(pos.y * DOT_H);
    const fg = sideEffectColor(side);
    const pulse = reducedMotion ? 0.76 : 0.68 + Math.sin(now / 150) * 0.14;
    const rx = 6.4;
    const ry = 7.4;
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y += 1) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x += 1) {
        const d = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2);
        if (d < 0.9 || d > 1.08) continue;
        if (Math.abs(x * 3 + y * 5) % 2) continue;
        putEffectDot(sx + x, sy + y, fg, pulse);
      }
    }
  }

  function drawPieceAt(pos, side, scale = 1) {
    const sx = Math.round(pos.x * DOT_W);
    const sy = Math.round(pos.y * DOT_H);
    const rx = 4.4 * scale;
    const ry = 5.2 * scale;
    const main = sideColor(side);
    const alt = sideAltColor(side);
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y += 1) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x += 1) {
        const nx = x / rx;
        const ny = y / ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1) continue;
        const rim = d > 0.68;
        const sparkle = hash(sx * 13 + sy * 17 + x * 19 + y * 31);
        if (!rim && sparkle > 0.88) continue;
        putDotSub(sx + x, sy + y, rim || sparkle > 0.58 ? alt : main, rim ? 0.86 : 1);
      }
    }
  }

  function activePosition(t) {
    const path = state.active.move.path;
    const segments = Math.max(1, path.length - 1);
    const raw = clamp(t, 0, 1) * segments;
    const index = Math.min(segments - 1, Math.floor(raw));
    const local = smooth(raw - index);
    const a = holeById.get(path[index]);
    const b = holeById.get(path[index + 1]);
    return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
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
    const target = [...targetSet(side)].map((id) => holeChar(id));
    target.forEach((point, index) => {
      if (!strong && index % 2 !== Math.floor(now / 680) % 2) return;
      shatterChar(point, side, strong ? 18 : 7, strong ? 1.05 : 0.62, now);
    });
  }

  function update(now, dt) {
    if (state.paused) return;
    const frameScale = dt / 16.67;
    if (!state.active && !state.winner && !isHumanTurn() && now >= state.nextMoveAt) beginAIMove(now);
    if (state.active) {
      const t = clamp((now - state.active.start) / state.active.duration, 0, 1);
      const pos = activePosition(t);
      if (now - state.active.lastTrail > 42 && !reducedMotion) {
        trailChar(pos, state.active.side, now);
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
    if (state.winner && now - (state.lastWinEmit || 0) > (reducedMotion ? 1100 : 720)) {
      emitWinBurst(state.winner, now, false);
      state.lastWinEmit = now;
    }
  }

  function progressBar(side) {
    const ids = pieceIds(side);
    const start = [...homeSet(side)].reduce((sum, id) => sum + distanceToTarget(side, holeById.get(id)), 0) / ids.length;
    const now = ids.reduce((sum, id) => sum + distanceToTarget(side, holeById.get(id)), 0) / ids.length;
    const pct = clamp(1 - now / start, 0, 1);
    const filled = Math.round(pct * 18);
    return `${"#".repeat(filled)}${".".repeat(18 - filled)}`;
  }

  function drawPanel(now) {
    const r = layout.right;
    const northName = state.players?.north.name || "SELECTING";
    const southName = state.players?.south.name || "SELECTING";
    const toMove = state.winner ? "DONE" : sideTitle(state.toMove);
    const northProgress = progressBar(1);
    const southProgress = progressBar(2);

    writeText(r.x + 3, r.y + 3, "RULESET", color.header);
    writeText(r.x + 3, r.y + 5, "CHINESE CHECKERS", color.blue);
    writeText(r.x + 3, r.y + 7, "NORTH", color.northStone);
    writeText(r.x + 12, r.y + 7, northName.padEnd(16).slice(0, 16), color.northAlt);
    writeText(r.x + 3, r.y + 8, "SOUTH", color.southStone);
    writeText(r.x + 12, r.y + 8, southName.padEnd(16).slice(0, 16), color.southAlt);
    writeText(r.x + 3, r.y + 10, `TO MOVE  ${toMove}`, state.toMove === 1 ? color.northStone : color.southStone);
    writeText(r.x + 3, r.y + 11, `PLY      ${String(state.moves.length).padStart(3, " ")}`, color.muted);
    writeText(r.x + 3, r.y + 12, `SPEED    ${state.speed}x`, color.muted);

    writeText(r.x + 3, r.y + 15, "RACE", color.header);
    writeText(r.x + 3, r.y + 17, `[${northProgress}]`, color.northAlt);
    writeText(r.x + 3, r.y + 18, "NORTH TO SOUTH", color.northStone);
    writeText(r.x + 3, r.y + 20, `[${southProgress}]`, color.southAlt);
    writeText(r.x + 3, r.y + 21, "SOUTH TO NORTH", color.southStone);

    const legal = state.winner ? 0 : legalMoves(state.toMove).length;
    writeText(r.x + 3, r.y + 24, "MOBILITY", color.header);
    writeText(r.x + 3, r.y + 26, `${String(legal).padStart(3, " ")} legal moves`, color.muted);
    writeText(r.x + 3, r.y + 27, state.active ? `${state.active.move.kind} ${coordinate(state.active.move.from)}>${coordinate(state.active.move.to)}`.slice(0, 31) : "reading lanes", color.dim);

    writeText(r.x + 3, r.y + 30, "MOVES", color.header);
    const recent = state.moveLog.slice(-16);
    for (let i = 0; i < recent.length; i += 1) {
      const move = recent[i];
      const fg = move.side === 1 ? color.northStone : color.southStone;
      writeText(r.x + 3, r.y + 32 + i, `${String(move.ply).padStart(3, "0")} ${sideTitle(move.side)[0]} ${move.coord} ${move.kind}`.slice(0, 31), fg);
    }

    if (state.winner || state.result) {
      writeText(r.x + 3, r.y + 52, "RESULT", color.header);
      writeText(r.x + 3, r.y + 54, state.result.slice(0, 31), state.winner ? color.red : color.dim);
    } else if (state.paused) {
      writeText(r.x + 3, r.y + 54, "PAUSED", color.red);
    } else {
      const pulse = Math.floor(now / 500) % 2 ? ">" : " ";
      writeText(r.x + 3, r.y + 54, `${pulse} reading jumps`, color.dim);
    }
  }

  function draw(now) {
    clearScreen();
    drawStaticFrame();
    drawBoardBackground();
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
    const hole = holeFromPointer(event);
    const canSelect = hole && state.pieces.get(hole.id) === state.toMove;
    const canMove = hole && state.selected !== null && legalMoves(state.toMove).some((move) => move.from === state.selected && move.to === hole.id);
    canvas.style.cursor = isHumanTurn() && (canSelect || canMove) ? "pointer" : "default";
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
