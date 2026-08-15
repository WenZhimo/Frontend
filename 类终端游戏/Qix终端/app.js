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
  const GRID = { x: 9, y: 7, w: 86, h: 40 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const CLAIMED = 1;
  const TRAIL = 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    void: "#071018",
    void2: "#091320",
    claim: "#0b2a35",
    claim2: "#0f3a43",
    trail: "#ffcc66",
    qix: "#ff4d5f",
    sparx: "#ff9f45",
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
    player: "#f2ffff",
  };

  const difficultyConfig = {
    normal: { player: 22, qix: 12, sparx: 11, target: 68, qixCount: 1 },
    fast: { player: 26, qix: 15, sparx: 14, target: 72, qixCount: 1 },
    chaos: { player: 31, qix: 18, sparx: 17, target: 76, qixCount: 2 },
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
    input: { up: false, down: false, left: false, right: false, draw: false },
    game: null,
    trails: [],
    effects: [],
    eventLog: [],
    logOffset: 0,
    lastFrame: 0,
  };

  const totalCells = GRID.w * GRID.h;

  function idx(x, y) { return y * COLS + x; }
  function gidx(x, y) { return y * GRID.w + x; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mixColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
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

  function updateSeedStatus() { seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`; }

  function addLog(message, tone = "info") {
    state.eventLog.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.eventLog = state.eventLog.slice(0, 46);
  }

  function isInside(x, y) { return x >= 0 && y >= 0 && x < GRID.w && y < GRID.h; }
  function cell(x, y) { return isInside(x, y) ? state.game.grid[gidx(x, y)] : CLAIMED; }
  function setGrid(x, y, value) { if (isInside(x, y)) state.game.grid[gidx(x, y)] = value; }
  function claimedCount() { return state.game.grid.reduce((sum, c) => sum + (c === CLAIMED ? 1 : 0), 0); }

  function makeGrid() {
    const grid = new Array(totalCells).fill(0);
    for (let y = 0; y < GRID.h; y += 1) {
      for (let x = 0; x < GRID.w; x += 1) {
        if (x === 0 || y === 0 || x === GRID.w - 1 || y === GRID.h - 1) grid[gidx(x, y)] = CLAIMED;
      }
    }
    return grid;
  }

  function spawnQix() {
    const qix = [];
    const count = difficultyConfig[state.difficulty].qixCount;
    for (let i = 0; i < count; i += 1) {
      const a = state.rng() * Math.PI * 2;
      qix.push({
        x: GRID.w * (0.35 + state.rng() * 0.3),
        y: GRID.h * (0.33 + state.rng() * 0.3),
        vx: Math.cos(a) * difficultyConfig[state.difficulty].qix,
        vy: Math.sin(a) * difficultyConfig[state.difficulty].qix,
        phase: state.rng() * Math.PI * 2,
      });
    }
    return qix;
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
      lives: 3,
      status: "DRAW",
      grid: makeGrid(),
      player: { x: Math.floor(GRID.w / 2), y: GRID.h - 1, cooldown: 0, drawing: false, invuln: 1.3 },
      trail: [],
      qix: spawnQix(),
      sparx: [
        { x: 0, y: 0, dir: 1, edge: 0 },
        { x: GRID.w - 1, y: GRID.h - 1, dir: -1, edge: 2 },
      ],
      capture: 0,
      target: difficultyConfig[state.difficulty].target,
      flash: 0,
      aiPlan: [],
    };
    state.game.capture = claimedCount();
    state.trails = [];
    state.effects = [];
    state.eventLog = [];
    state.paused = false;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW GRID SEED" : "QIX FIELD READY", "ok");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "info");
  }

  function setCell(x, y, ch = " ", fg = color.text, bg = null) {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
    const p = idx(ix, iy);
    screen.ch[p] = ch;
    screen.fg[p] = fg;
    if (bg) screen.bg[p] = bg;
  }

  function drawText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) setCell(x + i, y, text[i], fg, bg);
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
      setCell(ix, y, "─", fg, bg);
      setCell(ix, y + h - 1, "─", fg, bg);
    }
    for (let iy = y + 1; iy < y + h - 1; iy += 1) {
      setCell(x, iy, "│", fg, bg);
      setCell(x + w - 1, iy, "│", fg, bg);
    }
    setCell(x, y, "┌", fg, bg);
    setCell(x + w - 1, y, "┐", fg, bg);
    setCell(x, y + h - 1, "└", fg, bg);
    setCell(x + w - 1, y + h - 1, "┘", fg, bg);
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const n = hash01(x, y, 17);
        const bg = n > 0.91 ? "#09111a" : n > 0.82 ? "#070d14" : color.ink;
        screen.bg[idx(x, y)] = bg;
        if (n > 0.987) setCell(x, y, "·", color.dim, bg);
      }
    }
  }

  function gx(x) { return GRID.x + x; }
  function gy(y) { return GRID.y + y; }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    drawText(GRID.x + 1, GRID.y - 2, "QIX TERRITORY VECTOR", color.header);
    drawText(GRID.x + 58, GRID.y - 2, "CUT / CLAIM / SURVIVE", color.gold);
    for (let y = 0; y < GRID.h; y += 1) {
      for (let x = 0; x < GRID.w; x += 1) {
        const c = cell(x, y);
        const p = idx(gx(x), gy(y));
        const n = hash01(x, y, 29);
        if (c === CLAIMED) {
          screen.bg[p] = n > 0.62 ? color.claim2 : color.claim;
          screen.ch[p] = n > 0.82 ? "▒" : n > 0.58 ? "░" : " ";
          screen.fg[p] = n > 0.72 ? color.cyan : "#356b76";
        } else if (c === TRAIL) {
          screen.bg[p] = "#2b2210";
          screen.ch[p] = n > 0.5 ? "▓" : "▒";
          screen.fg[p] = color.trail;
        } else {
          screen.bg[p] = n > 0.82 ? color.void2 : color.void;
          if (n > 0.985) {
            screen.ch[p] = "·";
            screen.fg[p] = "#31516a";
          }
        }
      }
    }
  }

  function drawQix(now) {
    for (const q of state.game.qix) {
      const cx = Math.round(q.x), cy = Math.round(q.y);
      const pulse = Math.floor(now / 90 + q.phase) % 4;
      const arms = pulse % 2 ? [[-2, 0, "╲"], [-1, -1, "╱"], [0, 0, "█"], [1, 1, "╱"], [2, 0, "╲"]] : [[-2, 0, "╱"], [-1, 1, "╲"], [0, 0, "█"], [1, -1, "╲"], [2, 0, "╱"]];
      for (const [dx, dy, ch] of arms) setCell(gx(cx + dx), gy(cy + dy), ch, color.qix);
    }
  }

  function drawSparx() {
    for (const sp of state.game.sparx) {
      setCell(gx(sp.x), gy(sp.y), "✣", color.sparx);
      setCell(gx(sp.x), gy(sp.y + 1), "·", color.orange);
    }
  }

  function drawPlayer() {
    const p = state.game.player;
    const fg = p.invuln > 0 && Math.floor(state.game.elapsed * 12) % 2 === 0 ? color.cyan2 : color.player;
    setCell(gx(p.x), gy(p.y), p.drawing ? "◆" : "◇", fg);
    if (p.drawing) setCell(gx(p.x), gy(p.y + 1), "·", color.trail);
  }

  function drawTrails(now) {
    state.trails = state.trails.filter((trail) => now - trail.start < trail.duration);
    for (const trail of state.trails) {
      const t = clamp((now - trail.start) / trail.duration, 0, 1);
      setCell(trail.x, trail.y, t < 0.45 ? trail.ch : "·", mixColor(trail.fg, color.ink, t));
    }
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      setCell(fx.x + fx.vx * t, fx.y + fx.vy * t, t < 0.5 ? fx.ch : "·", mixColor(fx.fg, color.ink, t));
    }
  }

  function drawHud() {
    const game = state.game;
    const pct = Math.floor((claimedCount() / totalCells) * 100);
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    drawText(RIGHT.x + 2, RIGHT.y + 2, "CAPTURE", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 4, `AREA  ${String(pct).padStart(3, " ")}%`, pct >= game.target ? color.green : color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 5, `TARGET${String(game.target).padStart(3, " ")}%`, color.gold);
    drawText(RIGHT.x + 2, RIGHT.y + 6, `LIVES ${"♥".repeat(Math.max(0, game.lives))}`, game.lives <= 1 ? color.red : color.red2);
    drawText(RIGHT.x + 2, RIGHT.y + 8, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 9, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    drawText(RIGHT.x + 2, RIGHT.y + 12, "RISK", color.header);
    drawText(RIGHT.x + 2, RIGHT.y + 14, `TRAIL ${String(game.trail.length).padStart(3, " ")}`, game.trail.length ? color.gold : color.muted);
    drawText(RIGHT.x + 2, RIGHT.y + 15, `QIX   ${String(game.qix.length).padStart(3, " ")}`, color.red);
    drawText(RIGHT.x + 2, RIGHT.y + 17, `[${"█".repeat(Math.round(pct / 5)).padEnd(20, " ")}]`, color.cyan);
    drawText(RIGHT.x + 2, RIGHT.y + 23, "LOG", color.header);
    for (let i = 0; i < 18; i += 1) {
      const entry = state.eventLog[i + state.logOffset];
      if (!entry) break;
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "gold" ? color.gold : color.muted;
      drawText(RIGHT.x + 2, RIGHT.y + 25 + i, `>${entry.message}`.slice(0, RIGHT.w - 4), fg);
    }
  }

  function drawFooter() {
    drawText(FIELD.x + 4, FIELD.y + FIELD.h + 1, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE   SPACE DRAW   P PAUSE   R REROLL   Q HOME", color.muted);
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

  function failTrail(reason) {
    const game = state.game;
    for (const t of game.trail) setGrid(t.x, t.y, 0);
    burst(gx(game.player.x), gy(game.player.y), color.red, 34, 18);
    game.trail = [];
    game.player.drawing = false;
    game.player.x = Math.floor(GRID.w / 2);
    game.player.y = GRID.h - 1;
    game.player.invuln = 1.7;
    game.lives -= 1;
    addLog(reason, "bad");
    if (game.lives <= 0) {
      game.status = "LOST";
      addLog("GRID LOST", "bad");
    }
  }

  function closeTrail() {
    const game = state.game;
    if (!game.trail.length) return;
    for (const t of game.trail) setGrid(t.x, t.y, CLAIMED);
    const qixCells = new Set(game.qix.map((q) => gidx(clamp(Math.round(q.x), 0, GRID.w - 1), clamp(Math.round(q.y), 0, GRID.h - 1))));
    const seen = new Uint8Array(totalCells);
    let gained = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let sy = 0; sy < GRID.h; sy += 1) {
      for (let sx = 0; sx < GRID.w; sx += 1) {
        const start = gidx(sx, sy);
        if (seen[start] || cell(sx, sy) === CLAIMED) continue;
        const stack = [[sx, sy]];
        const comp = [];
        let hasQix = false;
        seen[start] = 1;
        while (stack.length) {
          const [x, y] = stack.pop();
          const id = gidx(x, y);
          comp.push([x, y]);
          if (qixCells.has(id)) hasQix = true;
          for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (!isInside(nx, ny)) continue;
            const nid = gidx(nx, ny);
            if (seen[nid] || cell(nx, ny) === CLAIMED) continue;
            seen[nid] = 1;
            stack.push([nx, ny]);
          }
        }
        if (!hasQix) {
          gained += comp.length;
          for (const [x, y] of comp) setGrid(x, y, CLAIMED);
        }
      }
    }
    const oldCapture = game.capture;
    game.capture = claimedCount();
    const pct = Math.floor((game.capture / totalCells) * 100);
    game.score += Math.max(40, (game.capture - oldCapture) * 3);
    addLog(`CLAIM +${Math.max(0, game.capture - oldCapture)} / ${pct}%`, "ok");
    for (const t of game.trail) burst(gx(t.x), gy(t.y), color.cyan, 3, 4, ["░", "·"]);
    if (gained > 0) burst(gx(game.player.x), gy(game.player.y), color.green, 26, 15, ["▓", "▒", "░", "✦"]);
    game.trail = [];
    game.player.drawing = false;
    if (pct >= game.target) {
      game.status = "CLEARED";
      addLog("FIELD SECURED", "ok");
      burst(gx(game.player.x), gy(game.player.y), color.green, 70, 24, ["▓", "▒", "░", "✦"]);
    }
  }

  function desiredMove() {
    if (state.mode !== "demo") {
      return {
        dx: (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0),
        dy: (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0),
        draw: state.input.draw,
      };
    }
    const game = state.game;
    const p = game.player;
    if (!game.aiPlan.length) {
      const q = game.qix[0];
      const width = 6 + Math.floor(state.rng() * 10);
      const depth = 5 + Math.floor(state.rng() * 9);
      const dir = p.x < GRID.w / 2 ? 1 : -1;
      if (Math.abs(q.x - p.x) < 16) game.aiPlan = [[dir, 0], [dir, 0], [0, -1], [0, -1], [0, -1], [0, 1], [0, 1], [0, 1]];
      else game.aiPlan = [[0, -1], ...Array(depth).fill([0, -1]), ...Array(width).fill([dir, 0]), ...Array(depth + 1).fill([0, 1])];
    }
    const [dx, dy] = game.aiPlan.shift() || [0, 0];
    return { dx, dy, draw: true };
  }

  function updatePlayer(dt) {
    const game = state.game;
    const p = game.player;
    p.cooldown -= dt;
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.cooldown > 0) return;
    p.cooldown = 1 / difficultyConfig[state.difficulty].player;
    const move = desiredMove();
    if (!move.dx && !move.dy) return;
    const nx = clamp(p.x + Math.sign(move.dx), 0, GRID.w - 1);
    const ny = clamp(p.y + Math.sign(move.dy), 0, GRID.h - 1);
    const target = cell(nx, ny);
    if (!p.drawing && target !== CLAIMED && move.draw) {
      p.drawing = true;
      game.trail = [];
    }
    if (p.drawing) {
      if (target === TRAIL) {
        failTrail("SELF CUT");
        return;
      }
      p.x = nx;
      p.y = ny;
      if (target === CLAIMED) {
        closeTrail();
      } else {
        setGrid(nx, ny, TRAIL);
        game.trail.push({ x: nx, y: ny });
        trail(gx(nx), gy(ny), "▒", color.trail, 360);
      }
    } else if (target === CLAIMED) {
      p.x = nx;
      p.y = ny;
    }
  }

  function updateQix(dt) {
    const game = state.game;
    for (const q of game.qix) {
      q.phase += dt * 7;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const ix = clamp(Math.round(q.x), 1, GRID.w - 2);
      const iy = clamp(Math.round(q.y), 1, GRID.h - 2);
      if (cell(ix, iy) === CLAIMED || q.x < 1 || q.x > GRID.w - 2) {
        q.vx *= -1;
        q.x += q.vx * dt * 2;
      }
      if (cell(ix, iy) === CLAIMED || q.y < 1 || q.y > GRID.h - 2) {
        q.vy *= -1;
        q.y += q.vy * dt * 2;
      }
      if (cell(ix, iy) === TRAIL) failTrail("QIX HIT LINE");
      trail(gx(ix), gy(iy), "·", color.qix, 240);
    }
  }

  function updateSparx(dt) {
    const game = state.game;
    const speed = difficultyConfig[state.difficulty].sparx;
    for (const sp of game.sparx) {
      sp.t = (sp.t || 0) + dt * speed;
      while (sp.t >= 1) {
        sp.t -= 1;
        if (sp.edge === 0) sp.x += sp.dir;
        if (sp.edge === 1) sp.y += sp.dir;
        if (sp.edge === 2) sp.x -= sp.dir;
        if (sp.edge === 3) sp.y -= sp.dir;
        if (sp.x >= GRID.w - 1 && sp.edge === 0) { sp.edge = 1; sp.dir = 1; }
        if (sp.y >= GRID.h - 1 && sp.edge === 1) { sp.edge = 2; sp.dir = 1; }
        if (sp.x <= 0 && sp.edge === 2) { sp.edge = 3; sp.dir = 1; }
        if (sp.y <= 0 && sp.edge === 3) { sp.edge = 0; sp.dir = 1; }
      }
      if (Math.abs(sp.x - game.player.x) <= 1 && Math.abs(sp.y - game.player.y) <= 1 && game.player.invuln <= 0) failTrail("SPARX HIT");
    }
  }

  function updateGame(dt) {
    const game = state.game;
    game.elapsed += dt;
    if (game.status === "LOST" || game.status === "CLEARED") return;
    updatePlayer(dt);
    updateQix(dt);
    updateSparx(dt);
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawTrails(now);
    drawEffects(now);
    drawQix(now);
    drawSparx();
    drawPlayer();
    if (state.paused) drawText(FIELD.x + 41, FIELD.y + 2, " PAUSED ", color.gold);
    if (state.game.status === "CLEARED") drawText(GRID.x + 32, GRID.y + 19, " FIELD SECURED ", color.green);
    if (state.game.status === "LOST") drawText(GRID.x + 35, GRID.y + 19, " GRID LOST ", color.red);
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
    if (key === "q") { event.preventDefault(); goHome(); return; }
    if (key === "p") { event.preventDefault(); state.paused = !state.paused; addLog(state.paused ? "PAUSE" : "RESUME", "info"); return; }
    if (key === "r") { event.preventDefault(); initGame(randomSeed(), { reroll: true }); return; }
    if (key === "a" || event.key === "ArrowLeft") state.input.left = true;
    if (key === "d" || event.key === "ArrowRight") state.input.right = true;
    if (key === "w" || event.key === "ArrowUp") state.input.up = true;
    if (key === "s" || event.key === "ArrowDown") state.input.down = true;
    if (event.code === "Space") state.input.draw = true;
    if (["a", "d", "w", "s", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key) || event.code === "Space") event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") state.input.left = false;
    if (key === "d" || event.key === "ArrowRight") state.input.right = false;
    if (key === "w" || event.key === "ArrowUp") state.input.up = false;
    if (key === "s" || event.key === "ArrowDown") state.input.down = false;
    if (event.code === "Space") state.input.draw = false;
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
