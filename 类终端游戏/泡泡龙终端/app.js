(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const form = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const playModeSelect = document.getElementById("play-mode");
  const difficultySelect = document.getElementById("difficulty");

  const COLS = 136;
  const ROWS = 58;
  const CELL_W = 11;
  const CELL_H = 19;
  const FONT_SIZE = 16;
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const FIELD = { x: 4, y: 5, w: 98, h: 46 };
  const BOARD = { x: 15, y: 8, w: 74, h: 34 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const BROWS = 13;
  const BCOLS = 12;
  const SX = 6;
  const SY = 3;
  const SHOOTER = { x: BOARD.x + 36, y: BOARD.y + 36 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const palette = [
    { id: 0, name: "CYAN", fg: "#6ed5ec", bg: "#092636", ch: "C" },
    { id: 1, name: "GOLD", fg: "#ffcc66", bg: "#32260b", ch: "G" },
    { id: 2, name: "RED", fg: "#ff4d5f", bg: "#331018", ch: "R" },
    { id: 3, name: "GREEN", fg: "#75f0a8", bg: "#0d2a1b", ch: "N" },
    { id: 4, name: "BLUE", fg: "#92a7ff", bg: "#111936", ch: "B" },
  ];

  const color = {
    ink: "#06080d",
    void: "#071018",
    void2: "#0a1420",
    line: "#2a3548",
    lineDim: "#172231",
    text: "#dffcff",
    header: "#f0f8ff",
    muted: "#7a8397",
    dim: "#465267",
    cyan: "#6ed5ec",
    cyan2: "#aaf6ff",
    green: "#75f0a8",
    gold: "#ffcc66",
    orange: "#ff9f45",
    red: "#ff4d5f",
    red2: "#ff7b6f",
    player: "#f2ffff",
  };

  const difficultyConfig = {
    normal: { speed: 42, aim: 2.2, startRows: 6, colors: 4, dropEvery: 7 },
    fast: { speed: 50, aim: 2.8, startRows: 7, colors: 5, dropEvery: 6 },
    chaos: { speed: 58, aim: 3.4, startRows: 8, colors: 5, dropEvery: 5 },
  };

  const screen = { ch: Array(COLS * ROWS), fg: Array(COLS * ROWS), bg: Array(COLS * ROWS) };
  const state = {
    seed: "",
    seedHash: 0,
    rng: null,
    mode: "demo",
    difficulty: "normal",
    speed: 1,
    paused: false,
    input: { left: false, right: false, fire: false },
    game: null,
    trails: [],
    effects: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
  };

  function idx(x, y) { return y * COLS + x; }
  function bidx(r, c) { return r * BCOLS + c; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mixColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    const rr = Math.round(lerp(ar, br, t)).toString(16).padStart(2, "0");
    const rg = Math.round(lerp(ag, bg, t)).toString(16).padStart(2, "0");
    const rb = Math.round(lerp(ab, bb, t)).toString(16).padStart(2, "0");
    return `#${rr}${rg}${rb}`;
  }

  function sanitizeSeed(value) {
    return Array.from(value || "")
      .map((char) => {
        const code = char.charCodeAt(0);
        return code >= ASCII_FIRST && code <= ASCII_LAST ? char : "?";
      })
      .join("")
      .slice(0, SEED_LENGTH)
      .padEnd(SEED_LENGTH, " ");
  }

  function randomSeed() {
    let seed = "";
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(SEED_LENGTH);
      window.crypto.getRandomValues(bytes);
      for (const byte of bytes) seed += RANDOM_SEED_CHARS[byte % RANDOM_SEED_CHARS.length];
      return seed;
    }
    for (let i = 0; i < SEED_LENGTH; i += 1) seed += RANDOM_SEED_CHARS[Math.floor(Math.random() * RANDOM_SEED_CHARS.length)];
    return seed;
  }

  function fnv1a(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash01(x, y, salt = 0) {
    let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519);
    h ^= state.seedHash + salt * 1597334677;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function updateSeedStatus() {
    seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`;
  }

  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 46);
  }

  function cellCenter(r, c) {
    return {
      x: BOARD.x + 3 + c * SX + (r % 2 ? SX / 2 : 0),
      y: BOARD.y + 2 + r * SY,
    };
  }

  function inBoard(r, c) { return r >= 0 && c >= 0 && r < BROWS && c < BCOLS; }
  function getCell(r, c) { return inBoard(r, c) ? state.game.board[bidx(r, c)] : null; }
  function setCellBoard(r, c, value) { if (inBoard(r, c)) state.game.board[bidx(r, c)] = value; }

  function neighbors(r, c) {
    const even = r % 2 === 0;
    return [
      [r, c - 1], [r, c + 1],
      [r - 1, c], [r + 1, c],
      [r - 1, c + (even ? -1 : 1)],
      [r + 1, c + (even ? -1 : 1)],
    ].filter(([rr, cc]) => inBoard(rr, cc));
  }

  function pickColor() {
    return Math.floor(state.rng() * difficultyConfig[state.difficulty].colors);
  }

  function makeBoard() {
    const board = new Array(BROWS * BCOLS).fill(null);
    const rows = difficultyConfig[state.difficulty].startRows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < BCOLS; c += 1) {
        if (r === rows - 1 && state.rng() > 0.78) continue;
        board[bidx(r, c)] = pickColor();
      }
    }
    return board;
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    state.game = {
      elapsed: 0,
      score: 0,
      chain: 0,
      shots: 0,
      status: "AIM",
      aim: -Math.PI / 2,
      board: makeBoard(),
      current: pickColor(),
      next: pickColor(),
      shot: null,
      falling: [],
      flash: 0,
    };
    state.trails = [];
    state.effects = [];
    state.eventLog = [];
    state.paused = false;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW BUBBLE SEED" : "BUBBLE GRID READY", "ok");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "info");
  }

  function setScreenCell(x, y, ch = " ", fg = color.text, bg = null) {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
    const p = idx(ix, iy);
    screen.ch[p] = ch;
    screen.fg[p] = fg;
    if (bg) screen.bg[p] = bg;
  }

  function drawText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) setScreenCell(x + i, y, text[i], fg, bg);
  }

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.text;
      screen.bg[i] = color.ink;
    }
  }

  function drawBox(x, y, w, h, fg = color.line, bg = null) {
    for (let ix = x + 1; ix < x + w - 1; ix += 1) {
      setScreenCell(ix, y, "─", fg, bg);
      setScreenCell(ix, y + h - 1, "─", fg, bg);
    }
    for (let iy = y + 1; iy < y + h - 1; iy += 1) {
      setScreenCell(x, iy, "│", fg, bg);
      setScreenCell(x + w - 1, iy, "│", fg, bg);
    }
    setScreenCell(x, y, "┌", fg, bg);
    setScreenCell(x + w - 1, y, "┐", fg, bg);
    setScreenCell(x, y + h - 1, "└", fg, bg);
    setScreenCell(x + w - 1, y + h - 1, "┘", fg, bg);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const n = hash01(x, y, 17);
        const bg = n > 0.91 ? "#09111a" : n > 0.82 ? "#070d14" : color.ink;
        screen.bg[idx(x, y)] = bg;
        if (n > 0.987) setScreenCell(x, y, "·", color.dim, bg);
      }
    }
  }

  function drawBubble(x, y, id, ghost = false) {
    const p = palette[id];
    const fg = ghost ? mixColor(p.fg, color.ink, 0.45) : p.fg;
    const bg = ghost ? null : p.bg;
    setScreenCell(x - 1, y - 1, "▗", fg, bg);
    setScreenCell(x, y - 1, "▄", fg, bg);
    setScreenCell(x + 1, y - 1, "▖", fg, bg);
    setScreenCell(x - 1, y, "▐", fg, bg);
    setScreenCell(x, y, p.ch, color.header, bg);
    setScreenCell(x + 1, y, "▌", fg, bg);
    setScreenCell(x - 1, y + 1, "▝", fg, bg);
    setScreenCell(x, y + 1, "▀", fg, bg);
    setScreenCell(x + 1, y + 1, "▘", fg, bg);
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    drawText(BOARD.x - 1, BOARD.y - 3, "PUZZLE BOBBLE VECTOR", color.header);
    drawText(BOARD.x + 47, BOARD.y - 3, "RICOCHET / SNAP / CHAIN", color.gold);
    for (let y = BOARD.y - 1; y < BOARD.y + BOARD.h + 3; y += 1) {
      for (let x = BOARD.x - 4; x < BOARD.x + BOARD.w + 3; x += 1) {
        const p = idx(x, y);
        const n = hash01(x, y, 61);
        screen.bg[p] = n > 0.84 ? color.void2 : color.void;
        if (n > 0.985) {
          screen.ch[p] = "·";
          screen.fg[p] = "#31516a";
        }
      }
    }
    drawText(BOARD.x - 4, BOARD.y + BOARD.h - 2, "──── DANGER LINE ─────────────────────────────────────────", color.red);
    drawBox(BOARD.x - 5, BOARD.y - 2, BOARD.w + 8, BOARD.h + 5, color.lineDim);
  }

  function drawBoard() {
    for (let r = 0; r < BROWS; r += 1) {
      for (let c = 0; c < BCOLS; c += 1) {
        const id = getCell(r, c);
        if (id === null) continue;
        const pt = cellCenter(r, c);
        drawBubble(pt.x, pt.y, id);
      }
    }
  }

  function drawAim() {
    const game = state.game;
    const dx = Math.cos(game.aim), dy = Math.sin(game.aim);
    for (let i = 4; i < 34; i += 4) {
      const x = SHOOTER.x + dx * i;
      const y = SHOOTER.y + dy * i;
      if (x < BOARD.x - 2 || x > BOARD.x + BOARD.w || y < BOARD.y - 2) break;
      setScreenCell(x, y, i % 8 ? "·" : "•", color.muted);
    }
    setScreenCell(SHOOTER.x, SHOOTER.y, "▲", color.player);
    setScreenCell(SHOOTER.x - 1, SHOOTER.y + 1, "▟", color.player);
    setScreenCell(SHOOTER.x, SHOOTER.y + 1, "█", color.player);
    setScreenCell(SHOOTER.x + 1, SHOOTER.y + 1, "▙", color.player);
    drawBubble(SHOOTER.x, SHOOTER.y - 3, game.current);
    drawText(SHOOTER.x + 6, SHOOTER.y - 2, "NEXT", color.muted);
    drawBubble(SHOOTER.x + 13, SHOOTER.y - 2, game.next, true);
  }

  function drawShot() {
    const shot = state.game.shot;
    if (!shot) return;
    drawBubble(shot.x, shot.y, shot.color);
  }

  function drawFalling() {
    for (const f of state.game.falling) drawBubble(f.x, f.y, f.color, true);
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      setScreenCell(trail.x, trail.y, t < 0.45 ? trail.ch : "·", mixColor(trail.fg, color.ink, t));
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      setScreenCell(fx.x + fx.vx * t, fx.y + fx.vy * t, t < 0.5 ? fx.ch : "·", mixColor(fx.fg, color.ink, t));
    }
  }

  function remainingBubbles() {
    return state.game.board.reduce((sum, item) => sum + (item !== null ? 1 : 0), 0);
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    drawText(RIGHT.x + 2, RIGHT.y + 2, "BUBBLES", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 4, `SCORE ${String(game.score).padStart(6, "0")}`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 5, `LEFT  ${String(remainingBubbles()).padStart(3, " ")}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 6, `CHAIN ${String(game.chain).padStart(3, " ")}`, game.chain ? color.gold : color.muted);
    drawText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 12, "QUEUE", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 14, `SHOT  ${palette[game.current].name}`, palette[game.current].fg);
    drawText(RIGHT.x + 2, RIGHT.y + 15, `NEXT  ${palette[game.next].name}`, palette[game.next].fg);
    drawText(RIGHT.x + 2, RIGHT.y + 17, `DROP  ${difficultyConfig[state.difficulty].dropEvery - (game.shots % difficultyConfig[state.difficulty].dropEvery)}`, color.orange);
    drawText(RIGHT.x + 2, RIGHT.y + 23, "LOG", color.header);
    for (let i = 0; i < 18; i += 1) {
      const entry = state.eventLog[i + state.logOffset];
      if (!entry) break;
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "gold" ? color.gold : color.muted;
      drawText(RIGHT.x + 2, RIGHT.y + 25 + i, `>${entry.message}`.slice(0, RIGHT.w - 4), fg);
    }
  }

  function drawFooter() {
    drawText(FIELD.x + 4, FIELD.y + FIELD.h + 1, "1 0.5X   2 1X   3 2X   4 4X    A/D OR ←/→ AIM   SPACE FIRE   P PAUSE   R REROLL   U HOME", color.muted);
  }

  function renderScreen() {
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const p = idx(x, y);
        if (screen.bg[p] !== color.ink) {
          ctx.fillStyle = screen.bg[p];
          ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        }
        const ch = screen.ch[p];
        if (ch && ch !== " ") {
          ctx.fillStyle = screen.fg[p];
          ctx.fillText(ch, x * CELL_W, y * CELL_H);
        }
      }
    }
  }

  function burst(x, y, fg, count = 18, power = 12, glyphs = ["░", "▒", "▓", "*", "·"]) {
    if (reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const angle = state.rng() * Math.PI * 2;
      const speed = 3 + state.rng() * power;
      state.effects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ch: glyphs[Math.floor(state.rng() * glyphs.length)], fg, start: performance.now(), duration: 360 + state.rng() * 520 });
    }
  }

  function trail(x, y, ch, fg, duration = 220) {
    if (reducedMotion) return;
    state.trails.push({ x, y, ch, fg, start: performance.now(), duration });
    state.trails = state.trails.slice(-260);
  }

  function clusterFrom(r, c, sameColor = true) {
    const startColor = getCell(r, c);
    if (startColor === null) return [];
    const seen = new Set([`${r},${c}`]);
    const out = [[r, c]];
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      for (const [nr, nc] of neighbors(cr, cc)) {
        const key = `${nr},${nc}`;
        if (seen.has(key)) continue;
        const value = getCell(nr, nc);
        if (value === null) continue;
        if (sameColor && value !== startColor) continue;
        seen.add(key);
        out.push([nr, nc]);
        stack.push([nr, nc]);
      }
    }
    return out;
  }

  function floatingCells() {
    const attached = new Set();
    const stack = [];
    for (let c = 0; c < BCOLS; c += 1) {
      if (getCell(0, c) !== null) {
        attached.add(`0,${c}`);
        stack.push([0, c]);
      }
    }
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [nr, nc] of neighbors(r, c)) {
        const key = `${nr},${nc}`;
        if (attached.has(key) || getCell(nr, nc) === null) continue;
        attached.add(key);
        stack.push([nr, nc]);
      }
    }
    const floating = [];
    for (let r = 0; r < BROWS; r += 1) {
      for (let c = 0; c < BCOLS; c += 1) {
        if (getCell(r, c) !== null && !attached.has(`${r},${c}`)) floating.push([r, c]);
      }
    }
    return floating;
  }

  function popCells(cells, reason = "POP") {
    for (const [r, c] of cells) {
      const id = getCell(r, c);
      const pt = cellCenter(r, c);
      setCellBoard(r, c, null);
      burst(pt.x, pt.y, palette[id].fg, 16, 12, ["▓", "▒", "░", "✦"]);
    }
    state.game.score += cells.length * 70 * Math.max(1, state.game.chain);
    addLog(`${reason} x${cells.length}`, "ok");
  }

  function dropFloating() {
    const cells = floatingCells();
    for (const [r, c] of cells) {
      const id = getCell(r, c);
      const pt = cellCenter(r, c);
      setCellBoard(r, c, null);
      state.game.falling.push({ x: pt.x, y: pt.y, vy: 8 + state.rng() * 10, color: id });
    }
    if (cells.length) {
      state.game.score += cells.length * 120;
      addLog(`DROP x${cells.length}`, "gold");
    }
  }

  function checkLoseWin() {
    if (remainingBubbles() === 0) {
      state.game.status = "CLEARED";
      addLog("GRID CLEARED", "ok");
      burst(SHOOTER.x, SHOOTER.y - 8, color.green, 70, 24, ["▓", "▒", "░", "✦"]);
      return;
    }
    for (let c = 0; c < BCOLS; c += 1) {
      if (getCell(BROWS - 1, c) !== null) {
        state.game.status = "LOST";
        addLog("DANGER LINE", "bad");
        burst(SHOOTER.x, SHOOTER.y, color.red, 44, 20);
        return;
      }
    }
  }

  function settleShot(r, c) {
    const game = state.game;
    setCellBoard(r, c, game.shot.color);
    const pt = cellCenter(r, c);
    burst(pt.x, pt.y, palette[game.shot.color].fg, 9, 7, ["░", "·"]);
    const cluster = clusterFrom(r, c, true);
    if (cluster.length >= 3) {
      game.chain += 1;
      popCells(cluster, "CHAIN");
      dropFloating();
    } else {
      game.chain = 0;
    }
    game.current = game.next;
    game.next = pickColor();
    game.shot = null;
    game.shots += 1;
    if (game.shots % difficultyConfig[state.difficulty].dropEvery === 0) pushDown();
    checkLoseWin();
  }

  function nearestOpenAround(r, c, x, y) {
    const candidates = [[r, c], ...neighbors(r, c)].filter(([rr, cc]) => getCell(rr, cc) === null);
    if (!candidates.length) {
      for (let rr = 0; rr < BROWS; rr += 1) {
        for (let cc = 0; cc < BCOLS; cc += 1) {
          if (getCell(rr, cc) === null) candidates.push([rr, cc]);
        }
      }
    }
    let best = candidates[0];
    let bestD = Infinity;
    for (const [rr, cc] of candidates) {
      const pt = cellCenter(rr, cc);
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD) {
        best = [rr, cc];
        bestD = d;
      }
    }
    return best;
  }

  function nearestGrid(x, y) {
    let best = [0, 0];
    let bestD = Infinity;
    for (let r = 0; r < BROWS; r += 1) {
      for (let c = 0; c < BCOLS; c += 1) {
        const pt = cellCenter(r, c);
        const d = Math.hypot(pt.x - x, pt.y - y);
        if (d < bestD) {
          best = [r, c];
          bestD = d;
        }
      }
    }
    return best;
  }

  function pushDown() {
    for (let r = BROWS - 1; r > 0; r -= 1) {
      for (let c = 0; c < BCOLS; c += 1) setCellBoard(r, c, getCell(r - 1, c));
    }
    for (let c = 0; c < BCOLS; c += 1) setCellBoard(0, c, state.rng() > 0.16 ? pickColor() : null);
    addLog("CEILING DROPS", "bad");
    burst(BOARD.x + BOARD.w / 2, BOARD.y, color.orange, 28, 16);
  }

  function fireShot() {
    const game = state.game;
    if (game.shot || game.status === "CLEARED" || game.status === "LOST") return;
    game.shot = {
      x: SHOOTER.x,
      y: SHOOTER.y - 4,
      vx: Math.cos(game.aim) * difficultyConfig[state.difficulty].speed,
      vy: Math.sin(game.aim) * difficultyConfig[state.difficulty].speed,
      color: game.current,
    };
    addLog(`FIRE ${palette[game.current].name}`, "info");
  }

  function updateAI(dt) {
    const game = state.game;
    if (game.shot) return;
    let target = null;
    for (let r = 0; r < BROWS && !target; r += 1) {
      for (let c = 0; c < BCOLS; c += 1) {
        if (getCell(r, c) !== game.current) continue;
        const open = neighbors(r, c).find(([rr, cc]) => getCell(rr, cc) === null);
        if (open) {
          target = cellCenter(open[0], open[1]);
          break;
        }
      }
    }
    if (!target) target = { x: BOARD.x + 8 + state.rng() * (BOARD.w - 16), y: BOARD.y + 7 + state.rng() * 12 };
    const desired = Math.atan2(target.y - (SHOOTER.y - 4), target.x - SHOOTER.x);
    game.aim = clamp(desired, -Math.PI + 0.18, -0.18);
    game.aiFire = (game.aiFire || 0) + dt;
    if (game.aiFire > 0.65) {
      game.aiFire = 0;
      fireShot();
    }
  }

  function updateShot(dt) {
    const game = state.game;
    const shot = game.shot;
    if (!shot) return;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    trail(shot.x, shot.y, "·", palette[shot.color].fg, 220);
    const left = BOARD.x - 2;
    const right = BOARD.x + BOARD.w - 4;
    if (shot.x <= left || shot.x >= right) {
      shot.x = clamp(shot.x, left, right);
      shot.vx *= -1;
      burst(shot.x, shot.y, palette[shot.color].fg, 6, 5, ["░", "·"]);
    }
    if (shot.y <= BOARD.y - 1) {
      const [r, c] = nearestGrid(shot.x, shot.y);
      settleShot(r, c);
      return;
    }
    for (let r = 0; r < BROWS; r += 1) {
      for (let c = 0; c < BCOLS; c += 1) {
        if (getCell(r, c) === null) continue;
        const pt = cellCenter(r, c);
        if (Math.hypot(pt.x - shot.x, pt.y - shot.y) < 3.1) {
          const [rr, cc] = nearestOpenAround(r, c, shot.x, shot.y);
          settleShot(rr, cc);
          return;
        }
      }
    }
  }

  function updateGame(dt) {
    const game = state.game;
    game.elapsed += dt;
    if (game.status === "CLEARED" || game.status === "LOST") return;
    if (state.mode === "demo") updateAI(dt);
    else {
      const cfg = difficultyConfig[state.difficulty];
      if (state.input.left) game.aim -= cfg.aim * dt;
      if (state.input.right) game.aim += cfg.aim * dt;
      game.aim = clamp(game.aim, -Math.PI + 0.18, -0.18);
      if (state.input.fire) fireShot();
    }
    updateShot(dt);
    for (const f of game.falling) f.y += f.vy * dt;
    game.falling = game.falling.filter((f) => f.y < FIELD.y + FIELD.h + 4);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    drawBoard();
    drawFalling();
    drawAim();
    drawShot();
    if (state.paused) drawText(FIELD.x + 41, FIELD.y + 2, " PAUSED ", color.gold);
    if (state.game.status === "CLEARED") drawText(BOARD.x + 20, BOARD.y + 20, " GRID CLEARED ", color.green);
    if (state.game.status === "LOST") drawText(BOARD.x + 22, BOARD.y + 20, " DANGER LINE ", color.red);
    drawHud();
    drawFooter();
    renderScreen();
  }

  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const dt = Math.min((now - state.lastFrame) / 1000, 0.05) * state.speed;
    state.lastFrame = now;
    if (!state.paused) updateGame(dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  function setSpeed(key) {
    const speeds = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (!Object.prototype.hasOwnProperty.call(speeds, key)) return false;
    state.speed = speeds[key];
    addLog(`SPEED ${state.speed}X`, "ok");
    return true;
  }

  function goHome() { window.location.href = "../index.html"; }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) { event.preventDefault(); return; }
    if (key === "u") { event.preventDefault(); goHome(); return; }
    if (key === "p") { event.preventDefault(); state.paused = !state.paused; addLog(state.paused ? "PAUSE" : "RESUME", "info"); return; }
    if (key === "r") { event.preventDefault(); initGame(randomSeed(), { reroll: true }); return; }
    if (key === "a" || event.key === "ArrowLeft") state.input.left = true;
    if (key === "d" || event.key === "ArrowRight") state.input.right = true;
    if (event.code === "Space") state.input.fire = true;
    if (["a", "d", "ArrowLeft", "ArrowRight", " "].includes(event.key) || event.code === "Space") event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (event.code === "Space") state.input.fire = false;
  });

  seedInput.addEventListener("input", updateSeedStatus);
  seedRandomButton.addEventListener("click", () => { seedInput.value = randomSeed(); updateSeedStatus(); });
  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed || randomSeed());
    seedInput.value = seed.trimEnd();
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED 100";
    } catch {
      seedStatus.value = "COPY FAILED";
    }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); initGame(seedInput.value || randomSeed()); });
  playModeSelect.addEventListener("change", () => initGame(state.seed || randomSeed()));
  difficultySelect.addEventListener("change", () => initGame(state.seed || randomSeed()));

  canvas.width = COLS * CELL_W;
  canvas.height = ROWS * CELL_H;
  ctx.imageSmoothingEnabled = false;
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
