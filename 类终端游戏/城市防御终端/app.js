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

  const FIELD = { x: 4, y: 6, w: 98, h: 45 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const GRID_W = 92;
  const GRID_H = 39;
  const GRID_X = FIELD.x + 3;
  const GRID_Y = FIELD.y + 3;

  const glyph = {
    full: String.fromCharCode(0x2588),
    dark: String.fromCharCode(0x2593),
    mid: String.fromCharCode(0x2592),
    light: String.fromCharCode(0x2591),
    dot: String.fromCharCode(0x00b7),
  };

  const color = {
    ink: "#06080d",
    ink2: "#080d13",
    panel: "#080c12",
    line: "#2a3548",
    lineDim: "#172231",
    text: "#dffcff",
    header: "#f0f8ff",
    muted: "#7a8397",
    dim: "#465267",
    cyan: "#6ed5ec",
    cyan2: "#aaf6ff",
    green: "#75f0a8",
    green2: "#baffc9",
    gold: "#ffcc66",
    orange: "#ff9f45",
    red: "#ff4d5f",
    red2: "#ff7b6f",
    blue: "#72a7ff",
    purple: "#b58cff",
    waterA: "#07111a",
    waterB: "#081621",
    land: "#10170f",
    city: "#151209",
  };

  const configs = {
    normal: { ships: 7, fire: 2.6, repair: 7.5, budget: 26 },
    fast: { ships: 9, fire: 2.1, repair: 6.2, budget: 30 },
    chaos: { ships: 12, fire: 1.55, repair: 5.0, budget: 35 },
  };

  const screen = {
    ch: Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
    bg: Array(COLS * ROWS),
  };

  const state = {
    seed: "",
    seedHash: 0,
    rng: null,
    mode: "demo",
    difficulty: "normal",
    speed: 1,
    paused: false,
    game: null,
    effects: [],
    logs: [],
    lastFrame: 0,
  };

  function idx(x, y) {
    return y * COLS + x;
  }

  function cellIndex(x, y) {
    return y * GRID_W + x;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mixColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255;
    const ag = (pa >> 8) & 255;
    const ab = pa & 255;
    const br = (pb >> 16) & 255;
    const bg = (pb >> 8) & 255;
    const bb = pb & 255;
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
    for (let i = 0; i < SEED_LENGTH; i += 1) {
      seed += RANDOM_SEED_CHARS[Math.floor(Math.random() * RANDOM_SEED_CHARS.length)];
    }
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

  function put(x, y, char = " ", fg = color.text, bg = null) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const p = idx(x, y);
    screen.ch[p] = char;
    screen.fg[p] = fg;
    if (bg !== null) screen.bg[p] = bg;
  }

  function writeText(x, y, text, fg = color.text, bg = null) {
    for (let i = 0; i < text.length; i += 1) put(x + i, y, text[i], fg, bg);
  }

  function fillRectChars(x, y, w, h, char, fg, bg = null) {
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) put(x + xx, y + yy, char, fg, bg);
    }
  }

  function drawBox(x, y, w, h, fg = color.line, bg = color.panel) {
    fillRectChars(x, y, w, h, " ", fg, bg);
    for (let xx = x + 1; xx < x + w - 1; xx += 1) {
      put(xx, y, "-", fg, bg);
      put(xx, y + h - 1, "-", fg, bg);
    }
    for (let yy = y + 1; yy < y + h - 1; yy += 1) {
      put(x, yy, "|", fg, bg);
      put(x + w - 1, yy, "|", fg, bg);
    }
    put(x, y, "+", fg, bg);
    put(x + w - 1, y, "+", fg, bg);
    put(x, y + h - 1, "+", fg, bg);
    put(x + w - 1, y + h - 1, "+", fg, bg);
  }

  function drawBar(x, y, w, value, fg) {
    const filled = clamp(Math.round(w * value), 0, w);
    put(x - 1, y, "[", color.red);
    put(x + w, y, "]", color.red);
    for (let i = 0; i < w; i += 1) put(x + i, y, i < filled ? glyph.full : glyph.light, i < filled ? fg : color.lineDim);
  }

  function clearScreen() {
    for (let i = 0; i < screen.ch.length; i += 1) {
      screen.ch[i] = " ";
      screen.fg[i] = color.text;
      screen.bg[i] = color.ink;
    }
  }

  function addLog(message, tone = "info") {
    state.logs.unshift({ message, tone });
    state.logs = state.logs.slice(0, 48);
  }

  function addEffect(x, y, tone, kind = "blast", text = "") {
    if (state.effects.length > 280) state.effects.splice(0, state.effects.length - 280);
    state.effects.push({ x, y, tone, kind, text, age: 0, life: kind === "text" ? 0.7 : 0.56 });
  }

  function inCity(x, y) {
    const cx = GRID_W / 2;
    const cy = GRID_H / 2;
    return Math.abs(x - cx) / 23 + Math.abs(y - cy) / 12 < 1;
  }

  function makeMap() {
    const terrain = new Uint8Array(GRID_W * GRID_H);
    const wall = new Uint8Array(GRID_W * GRID_H);
    const cannon = new Uint8Array(GRID_W * GRID_H);
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        if (inCity(x, y)) terrain[p] = 1;
      }
    }
    const cx = Math.floor(GRID_W / 2);
    const cy = Math.floor(GRID_H / 2);
    for (let y = 4; y < GRID_H - 4; y += 1) {
      for (let x = 12; x < GRID_W - 12; x += 1) {
        const d = Math.abs(x - cx) / 26 + Math.abs(y - cy) / 14;
        const inner = Math.abs(x - cx) / 19 + Math.abs(y - cy) / 9;
        if (d < 1 && inner > 0.9) wall[cellIndex(x, y)] = 2;
      }
    }
    const cannonSpots = [
      [cx - 13, cy - 6],
      [cx + 13, cy - 6],
      [cx - 14, cy + 6],
      [cx + 14, cy + 6],
      [cx, cy - 9],
      [cx, cy + 9],
    ];
    for (const [x, y] of cannonSpots) cannon[cellIndex(x, y)] = 1;
    return { terrain, wall, cannon };
  }

  function initGame(seed = state.seed) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash ^ 0x4ca7defe);
    state.mode = playModeSelect.value;
    state.difficulty = difficultySelect.value;
    state.speed = 1;
    state.paused = false;
    state.effects = [];
    state.logs = [];
    const map = makeMap();
    state.game = {
      ...map,
      ships: [],
      shells: [],
      wave: 0,
      phase: "REPAIR",
      phaseTimer: configs[state.difficulty].repair,
      core: 100,
      wallsBuilt: 0,
      shipsSunk: 0,
      score: 0,
      budget: configs[state.difficulty].budget,
      nextVolley: 0,
      elapsed: 0,
      status: "RUNNING",
    };
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog("RAMPART GRID ONLINE", "green");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "cyan");
    if (state.mode === "demo") autoRepair(true);
  }

  function edgeSpawn() {
    const side = Math.floor(state.rng() * 4);
    if (side === 0) return { x: 2 + state.rng() * (GRID_W - 4), y: 1, vx: 0, vy: 0.22, side };
    if (side === 1) return { x: GRID_W - 2, y: 2 + state.rng() * (GRID_H - 4), vx: -0.22, vy: 0, side };
    if (side === 2) return { x: 2 + state.rng() * (GRID_W - 4), y: GRID_H - 2, vx: 0, vy: -0.22, side };
    return { x: 1, y: 2 + state.rng() * (GRID_H - 4), vx: 0.22, vy: 0, side };
  }

  function startWave() {
    const game = state.game;
    const cfg = configs[state.difficulty];
    game.wave += 1;
    game.phase = "BATTLE";
    game.phaseTimer = 30 + game.wave * 2;
    game.nextVolley = 1.2;
    const count = cfg.ships + Math.floor(game.wave * 1.6);
    for (let i = 0; i < count; i += 1) {
      const s = edgeSpawn();
      game.ships.push({
        ...s,
        hp: 42 + game.wave * 11 + Math.floor(state.rng() * 25),
        maxHp: 42 + game.wave * 11 + 25,
        reload: state.rng() * cfg.fire,
        alive: true,
        drift: state.rng() * 99,
      });
    }
    addLog(`FLEET WAVE ${String(game.wave).padStart(2, "0")}`, "gold");
  }

  function nearestTarget(x, y) {
    const game = state.game;
    let best = { x: GRID_W / 2, y: GRID_H / 2, type: "CORE", d: Infinity };
    for (let yy = 0; yy < GRID_H; yy += 1) {
      for (let xx = 0; xx < GRID_W; xx += 1) {
        const p = cellIndex(xx, yy);
        if (!game.wall[p] && !game.cannon[p]) continue;
        const d = Math.hypot(xx - x, yy - y);
        if (d < best.d) best = { x: xx, y: yy, type: game.cannon[p] ? "CANNON" : "WALL", d };
      }
    }
    return best;
  }

  function fireShell(x1, y1, x2, y2, team, power = 1) {
    state.game.shells.push({
      x1,
      y1,
      x2,
      y2,
      x: x1,
      y: y1,
      team,
      power,
      age: 0,
      life: team === "city" ? 0.56 : 0.82,
    });
  }

  function updateShips(dt) {
    const game = state.game;
    const cfg = configs[state.difficulty];
    for (const ship of game.ships) {
      if (!ship.alive) continue;
      const cx = GRID_W / 2;
      const cy = GRID_H / 2;
      const d = Math.hypot(ship.x - cx, ship.y - cy);
      if (d > 25) {
        ship.x += ship.vx * dt * 18;
        ship.y += ship.vy * dt * 18;
      } else {
        ship.x += Math.sin(game.elapsed + ship.drift) * dt * 0.5;
        ship.y += Math.cos(game.elapsed * 0.8 + ship.drift) * dt * 0.5;
      }
      ship.reload -= dt;
      if (ship.reload <= 0) {
        const target = nearestTarget(ship.x, ship.y);
        fireShell(ship.x, ship.y, target.x, target.y, "fleet", ship.maxHp > 90 ? 2 : 1);
        ship.reload = cfg.fire * (0.75 + state.rng() * 0.65);
      }
    }
  }

  function updateCannons(dt) {
    const game = state.game;
    game.nextVolley -= dt;
    if (game.nextVolley > 0) return;
    game.nextVolley = Math.max(0.42, 1.4 - game.wave * 0.035);
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const level = game.cannon[cellIndex(x, y)];
        if (!level) continue;
        let best = null;
        let bestD = Infinity;
        for (const ship of game.ships) {
          if (!ship.alive) continue;
          const d = Math.hypot(ship.x - x, ship.y - y);
          if (d < bestD && d < 22 + level * 3) {
            best = ship;
            bestD = d;
          }
        }
        if (best) fireShell(x, y, best.x, best.y, "city", level);
      }
    }
  }

  function applyBlast(x, y, team, power) {
    const game = state.game;
    const gx = clamp(Math.round(x), 0, GRID_W - 1);
    const gy = clamp(Math.round(y), 0, GRID_H - 1);
    const p = cellIndex(gx, gy);
    addEffect(gx, gy, team === "city" ? color.gold : color.red2, "blast");
    if (team === "city") {
      for (const ship of game.ships) {
        if (!ship.alive) continue;
        const d = Math.hypot(ship.x - gx, ship.y - gy);
        if (d < 3.2 + power * 0.7) {
          ship.hp -= 34 * power * (1.1 - d / 6);
          addEffect(ship.x, ship.y, color.gold, "text", String(Math.round(34 * power)));
          if (ship.hp <= 0) {
            ship.alive = false;
            game.shipsSunk += 1;
            game.score += 120 + game.wave * 30;
            addLog("SHIP SUNK", "gold");
          }
        }
      }
    } else if (game.cannon[p]) {
      game.cannon[p] = Math.max(0, game.cannon[p] - power);
      addLog("CANNON HIT", "red");
    } else if (game.wall[p]) {
      game.wall[p] = Math.max(0, game.wall[p] - power);
      addLog("WALL BREACH", "red");
    } else if (game.terrain[p]) {
      game.core = Math.max(0, game.core - 2.8 * power);
      addLog("CITY HIT", "red");
    }
  }

  function updateShells(dt) {
    const game = state.game;
    for (const shell of game.shells) {
      shell.age += dt;
      const t = clamp(shell.age / shell.life, 0, 1);
      shell.x = lerp(shell.x1, shell.x2, t);
      shell.y = lerp(shell.y1, shell.y2, t);
      if (t >= 1) applyBlast(shell.x2, shell.y2, shell.team, shell.power);
    }
    game.shells = game.shells.filter((shell) => shell.age < shell.life);
    game.ships = game.ships.filter((ship) => ship.alive);
  }

  function buildAt(x, y) {
    const game = state.game;
    const p = cellIndex(x, y);
    if (!game.terrain[p] || game.budget <= 0) return false;
    if (game.cannon[p]) {
      if (game.budget < 4 || game.cannon[p] >= 3) return false;
      game.budget -= 4;
      game.cannon[p] += 1;
      addLog("CANNON UPGRADE", "green");
    } else if (game.wall[p] >= 2) {
      if (game.budget < 6) return false;
      game.budget -= 6;
      game.cannon[p] = 1;
      addLog("CANNON PLACED", "green");
    } else {
      game.budget -= 1;
      game.wall[p] = Math.min(2, game.wall[p] + 1);
      game.wallsBuilt += 1;
      addLog("WALL PATCH", "cyan");
    }
    addEffect(x, y, color.green2, "repair");
    return true;
  }

  function autoRepair(force = false) {
    const game = state.game;
    let attempts = force ? 80 : 24;
    while (game.budget > 0 && attempts-- > 0) {
      const cx = GRID_W / 2;
      const cy = GRID_H / 2;
      const angle = state.rng() * Math.PI * 2;
      const rx = Math.round(cx + Math.cos(angle) * (16 + state.rng() * 11));
      const ry = Math.round(cy + Math.sin(angle) * (7 + state.rng() * 8));
      const x = clamp(rx, 1, GRID_W - 2);
      const y = clamp(ry, 1, GRID_H - 2);
      const p = cellIndex(x, y);
      if (!game.terrain[p]) continue;
      if (game.wall[p] < 2 || (game.budget > 10 && state.rng() > 0.78)) buildAt(x, y);
    }
  }

  function updatePhase(dt) {
    const game = state.game;
    if (game.status !== "RUNNING") return;
    game.phaseTimer -= dt;
    if (game.phase === "REPAIR") {
      if (state.mode === "demo") autoRepair();
      if (game.phaseTimer <= 0) startWave();
    } else if (game.phase === "BATTLE") {
      updateShips(dt);
      updateCannons(dt);
      if ((game.ships.length === 0 && game.wave > 0) || game.phaseTimer <= 0) {
        game.phase = "REPAIR";
        game.phaseTimer = configs[state.difficulty].repair;
        game.budget += 14 + Math.floor(game.wave * 2.5);
        addLog("REPAIR WINDOW", "cyan");
      }
    }
    if (game.core <= 0) {
      game.status = "FALLEN";
      game.core = 0;
      state.paused = true;
      addLog("CITY FALLEN", "red");
    } else if (game.wave >= 12 && game.ships.length === 0 && game.phase === "REPAIR") {
      game.status = "SECURED";
      state.paused = true;
      addLog("COAST SECURED", "gold");
    }
  }

  function update(dt) {
    if (!state.game) return;
    for (const effect of state.effects) effect.age += dt;
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
    if (state.paused) return;
    const scaled = dt * state.speed;
    state.game.elapsed += scaled;
    updateShells(scaled);
    updatePhase(scaled);
  }

  function drawBackground() {
    clearScreen();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const band = Math.floor(y / 5) % 2 === 0 ? color.ink : "#05090f";
        const bg = hash01(x, y, 99) > 0.92 ? color.ink2 : band;
        screen.bg[idx(x, y)] = bg;
        if (hash01(x, y, 21) > 0.985) put(x, y, hash01(x, y, 22) > 0.65 ? glyph.dot : ":", color.lineDim, bg);
      }
    }
  }

  function drawField() {
    const game = state.game;
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line, color.panel);
    writeText(FIELD.x + 2, FIELD.y - 2, "RAMPART CITY DEFENSE", color.header);
    writeText(FIELD.x + FIELD.w - 30, FIELD.y - 2, "REPAIR / CANNON / FLEET", color.green);
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        const bg = game.terrain[p] ? color.land : ((Math.floor(x / 5) + Math.floor(y / 4)) % 2 ? color.waterA : color.waterB);
        if (!game.terrain[p]) {
          const wave = hash01(x, y, Math.floor(game.elapsed * 2)) > 0.88 ? "~" : glyph.dot;
          put(GRID_X + x, GRID_Y + y, wave, color.lineDim, bg);
        } else if (game.cannon[p]) {
          put(GRID_X + x, GRID_Y + y, game.cannon[p] > 1 ? "A" : "^", color.gold, color.city);
        } else if (game.wall[p]) {
          put(GRID_X + x, GRID_Y + y, game.wall[p] > 1 ? glyph.full : glyph.mid, color.cyan2, "#0b1820");
        } else if (hash01(x, y, 13) < 0.13) {
          put(GRID_X + x, GRID_Y + y, "+", color.green, bg);
        } else {
          put(GRID_X + x, GRID_Y + y, " ", color.dim, bg);
        }
      }
    }
    writeText(GRID_X + Math.floor(GRID_W / 2) - 4, GRID_Y + Math.floor(GRID_H / 2), "CITADEL", color.gold, color.city);
    for (const ship of game.ships) {
      const x = Math.round(GRID_X + ship.x);
      const y = Math.round(GRID_Y + ship.y);
      const hp = clamp(ship.hp / ship.maxHp, 0, 1);
      put(x - 1, y, "<", color.red2);
      put(x, y, hp < 0.45 ? "s" : "S", hp < 0.45 ? color.orange : color.red2);
      put(x + 1, y, ">", color.red2);
    }
    for (const shell of game.shells) {
      const x = Math.round(GRID_X + shell.x);
      const y = Math.round(GRID_Y + shell.y);
      put(x, y, shell.team === "city" ? "*" : "o", shell.team === "city" ? color.gold : color.red2);
      put(x - 1, y, ".", color.dim);
    }
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const t = effect.age / effect.life;
      const fg = mixColor(effect.tone, color.dim, t);
      if (effect.kind === "text") {
        writeText(GRID_X + Math.round(effect.x), GRID_Y + Math.round(effect.y) - Math.floor(t * 3), effect.text.slice(0, 4), fg);
        continue;
      }
      const r = 1 + t * (effect.kind === "repair" ? 3 : 6);
      const rr = Math.ceil(r);
      for (let dy = -rr; dy <= rr; dy += 1) {
        for (let dx = -rr; dx <= rr; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - r) > 0.45) continue;
          if (hash01(Math.round(effect.x) + dx, Math.round(effect.y) + dy, Math.floor(effect.age * 31)) < 0.14) continue;
          put(GRID_X + Math.round(effect.x) + dx, GRID_Y + Math.round(effect.y) + dy, effect.kind === "repair" ? "+" : "*", fg);
        }
      }
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line, color.panel);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "CITY", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `WAVE    ${String(game.wave).padStart(3, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `PHASE   ${game.phase}`, game.phase === "REPAIR" ? color.cyan : color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `BUDGET  ${String(game.budget).padStart(3, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `SUNK    ${String(game.shipsSunk).padStart(3, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SCORE   ${String(game.score).padStart(5, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 11, `MODE    ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 12, `SPD     ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 13, `STATE   ${game.status}`, game.status === "RUNNING" ? color.green : game.status === "SECURED" ? color.gold : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 17, "CORE", color.header);
    drawBar(RIGHT.x + 2, RIGHT.y + 19, 20, game.core / 100, game.core < 35 ? color.red : color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 23, "FLEET", color.header);
    drawBar(RIGHT.x + 2, RIGHT.y + 25, 20, clamp(game.ships.length / Math.max(1, configs[state.difficulty].ships + game.wave * 2), 0, 1), color.red2);
    writeText(RIGHT.x + 2, RIGHT.y + 29, "ORDERS", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 31, ">CLICK LAND: PATCH WALL", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 32, ">CLICK WALL: PLACE CANNON", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 33, ">CANNONS AUTO FIRE", color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 37, "LOG", color.header);
    const tones = { red: color.red, green: color.green, cyan: color.cyan, gold: color.gold, info: color.muted };
    for (let i = 0; i < 13; i += 1) {
      const item = state.logs[i];
      if (!item) break;
      writeText(RIGHT.x + 2, RIGHT.y + 39 + i, `>${item.message}`.slice(0, RIGHT.w - 4), tones[item.tone] || color.muted);
    }
  }

  function drawFooter() {
    writeText(
      FIELD.x,
      ROWS - 4,
      "1 0.5X   2 1X   3 2X   4 4X     HUMAN: CLICK LAND PATCH / WALL CANNON     P PAUSE     R REROLL     [ HOME",
      color.muted,
    );
  }

  function composeScreen() {
    drawBackground();
    drawField();
    drawEffects();
    drawHud();
    drawFooter();
  }

  function renderScreen() {
    canvas.width = COLS * CELL_W;
    canvas.height = ROWS * CELL_H;
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = "top";
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const p = idx(x, y);
        ctx.fillStyle = screen.bg[p] || color.ink;
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        const char = screen.ch[p] || " ";
        if (char !== " ") {
          ctx.fillStyle = screen.fg[p] || color.text;
          ctx.fillText(char, x * CELL_W, y * CELL_H + 1);
        }
      }
    }
  }

  function frame(now) {
    const dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 0.016;
    state.lastFrame = now;
    update(dt);
    composeScreen();
    renderScreen();
    requestAnimationFrame(frame);
  }

  function setSpeed(value) {
    state.speed = value;
    addLog(`SPEED ${value.toFixed(1)}X`, "cyan");
  }

  function canvasToCell(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const tx = ((event.clientX - rect.left) * sx) / CELL_W;
    const ty = ((event.clientY - rect.top) * sy) / CELL_H;
    const x = Math.floor(tx - GRID_X);
    const y = Math.floor(ty - GRID_Y);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value);
  });

  seedInput.addEventListener("input", updateSeedStatus);

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed();
    updateSeedStatus();
  });

  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed || randomSeed());
    seedInput.value = seed;
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED 100";
    } catch {
      seedStatus.value = "COPY FAILED";
    }
  });

  playModeSelect.addEventListener("change", () => initGame(state.seed));
  difficultySelect.addEventListener("change", () => initGame(state.seed));

  window.addEventListener("keydown", (event) => {
    if (event.target === seedInput) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "1") setSpeed(0.5);
    else if (key === "2") setSpeed(1);
    else if (key === "3") setSpeed(2);
    else if (key === "4") setSpeed(4);
    else if (key === "p") {
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSE" : "RESUME", state.paused ? "gold" : "green");
    } else if (key === "r") {
      seedInput.value = randomSeed();
      initGame(seedInput.value);
    } else if (key === "[") {
      window.location.href = "../index.html";
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    const cell = canvasToCell(event);
    if (!cell) return;
    playModeSelect.value = "human";
    state.mode = "human";
    if (!buildAt(cell.x, cell.y)) addLog("BUILD DENIED", "red");
  });

  initGame(randomSeed());
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
})();
