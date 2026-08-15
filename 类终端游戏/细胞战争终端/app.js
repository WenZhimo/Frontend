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
    pink: "#ff78d4",
    blue: "#72a7ff",
    purple: "#b58cff",
    boardA: "#071017",
    boardB: "#08131b",
  };

  const factions = [
    { name: "CYAN", color: color.cyan2, dim: "#16495a", char: "c", home: [8, 6] },
    { name: "GOLD", color: color.gold, dim: "#4a3510", char: "g", home: [GRID_W - 9, 6] },
    { name: "GREEN", color: color.green2, dim: "#164a28", char: "n", home: [8, GRID_H - 7] },
    { name: "RED", color: color.red2, dim: "#4b1820", char: "r", home: [GRID_W - 9, GRID_H - 7] },
  ];

  const configs = {
    normal: { ants: 18, food: 54, spawn: 0.38, speed: 7.5, hazard: 0.055 },
    fast: { ants: 24, food: 66, spawn: 0.52, speed: 10, hazard: 0.07 },
    chaos: { ants: 31, food: 84, spawn: 0.72, speed: 13, hazard: 0.09 },
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
    accumulator: 0,
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

  function addEffect(x, y, tone, kind = "burst") {
    if (state.effects.length > 260) state.effects.splice(0, state.effects.length - 260);
    state.effects.push({ x, y, tone, kind, age: 0, life: kind === "base" ? 0.95 : 0.52 });
  }

  function isBlocked(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return true;
    return state.game.terrain[cellIndex(x, y)] === 1;
  }

  function makeAnt(faction, x, y) {
    return {
      faction,
      x,
      y,
      tx: x,
      ty: y,
      cargo: 0,
      hp: 3,
      age: Math.floor(state.rng() * 120),
      wander: Math.floor(state.rng() * 8),
    };
  }

  function addAnt(faction, x, y) {
    const game = state.game;
    if (game.ants.length > 260) return;
    game.ants.push(makeAnt(faction, x, y));
    game.stats[faction].ants += 1;
  }

  function initGame(seed = state.seed) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash ^ 0x5abca117);
    state.mode = playModeSelect.value;
    state.difficulty = difficultySelect.value;
    state.speed = 1;
    state.paused = false;
    state.accumulator = 0;
    state.effects = [];
    state.logs = [];

    const terrain = new Uint8Array(GRID_W * GRID_H);
    const food = new Uint8Array(GRID_W * GRID_H);
    const pheromone = factions.map(() => new Float32Array(GRID_W * GRID_H));
    const basePressure = factions.map(() => new Float32Array(GRID_W * GRID_H));
    const stats = factions.map(() => ({ ants: 0, food: 0, kills: 0, base: 100 }));
    state.game = { terrain, food, pheromone, basePressure, ants: [], stats, tick: 0, winner: -1, userFood: 0 };

    const cfg = configs[state.difficulty];
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        if (hash01(x, y, 7) < cfg.hazard && Math.abs(x - GRID_W / 2) + Math.abs(y - GRID_H / 2) > 9) terrain[p] = 1;
      }
    }
    for (const [i, faction] of factions.entries()) {
      const [hx, hy] = faction.home;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          const x = hx + dx;
          const y = hy + dy;
          if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) terrain[cellIndex(x, y)] = 0;
        }
      }
      for (let n = 0; n < cfg.ants; n += 1) {
        addAnt(i, hx + Math.floor(state.rng() * 5) - 2, hy + Math.floor(state.rng() * 5) - 2);
      }
    }
    for (let i = 0; i < cfg.food; i += 1) spawnFood(1 + Math.floor(state.rng() * 4));
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog("SWARM WAR ONLINE", "green");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "cyan");
  }

  function spawnFood(amount = 1) {
    const game = state.game;
    for (let tries = 0; tries < 80; tries += 1) {
      const x = 2 + Math.floor(state.rng() * (GRID_W - 4));
      const y = 2 + Math.floor(state.rng() * (GRID_H - 4));
      const p = cellIndex(x, y);
      if (game.terrain[p] || game.food[p] > 7) continue;
      game.food[p] = Math.min(9, game.food[p] + amount);
      addEffect(x, y, color.green, "food");
      return true;
    }
    return false;
  }

  function scoreCell(ant, nx, ny) {
    const game = state.game;
    if (isBlocked(nx, ny)) return -999;
    const p = cellIndex(nx, ny);
    const faction = factions[ant.faction];
    const [hx, hy] = faction.home;
    let score = state.rng() * 0.16;
    if (ant.cargo) {
      score -= (Math.abs(nx - hx) + Math.abs(ny - hy)) * 0.06;
      score += game.pheromone[ant.faction][p] * 0.08;
    } else {
      score += game.food[p] * 3.2;
      score += game.pheromone[ant.faction][p] * 0.16;
      score += hash01(nx, ny, ant.wander) * 0.42;
    }
    for (const other of game.ants) {
      if (other === ant || other.hp <= 0) continue;
      if (other.x === nx && other.y === ny && other.faction !== ant.faction) score += ant.cargo ? -1.6 : 1.1;
    }
    for (const [i, otherFaction] of factions.entries()) {
      if (i === ant.faction) continue;
      const [ox, oy] = otherFaction.home;
      const d = Math.abs(nx - ox) + Math.abs(ny - oy);
      if (!ant.cargo && d < 7) score += (7 - d) * 0.1;
      if (ant.cargo && d < 6) score -= (6 - d) * 0.3;
    }
    return score;
  }

  function moveAnt(ant) {
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [0, 0],
    ];
    let best = [ant.x, ant.y];
    let bestScore = -999;
    for (const [dx, dy] of dirs) {
      const nx = ant.x + dx;
      const ny = ant.y + dy;
      const score = scoreCell(ant, nx, ny);
      if (score > bestScore) {
        bestScore = score;
        best = [nx, ny];
      }
    }
    ant.x = clamp(best[0], 0, GRID_W - 1);
    ant.y = clamp(best[1], 0, GRID_H - 1);
    ant.age += 1;
    if (ant.age % 18 === 0) ant.wander = Math.floor(state.rng() * 9999);
  }

  function resolveAnt(ant) {
    const game = state.game;
    const p = cellIndex(ant.x, ant.y);
    const faction = factions[ant.faction];
    const [hx, hy] = faction.home;
    const homeDist = Math.abs(ant.x - hx) + Math.abs(ant.y - hy);
    game.pheromone[ant.faction][p] = Math.min(10, game.pheromone[ant.faction][p] + (ant.cargo ? 1.4 : 0.55));
    game.basePressure[ant.faction][p] = Math.min(7, game.basePressure[ant.faction][p] + 0.28);
    if (!ant.cargo && game.food[p] > 0) {
      ant.cargo = 1;
      game.food[p] -= 1;
      addEffect(ant.x, ant.y, faction.color, "food");
    }
    if (ant.cargo && homeDist <= 3) {
      ant.cargo = 0;
      game.stats[ant.faction].food += 1;
      addEffect(ant.x, ant.y, faction.color, "base");
      if (game.stats[ant.faction].food % 4 === 0) addAnt(ant.faction, hx, hy);
    }
    for (const [i, otherFaction] of factions.entries()) {
      if (i === ant.faction) continue;
      const [ox, oy] = otherFaction.home;
      const d = Math.abs(ant.x - ox) + Math.abs(ant.y - oy);
      if (d <= 2) {
        game.stats[i].base = Math.max(0, game.stats[i].base - 0.08);
        addEffect(ox, oy, faction.color, "base");
      }
    }
  }

  function resolveCombat() {
    const game = state.game;
    const buckets = new Map();
    for (const ant of game.ants) {
      if (ant.hp <= 0) continue;
      const key = `${ant.x},${ant.y}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(ant);
    }
    for (const ants of buckets.values()) {
      const teams = new Set(ants.map((ant) => ant.faction));
      if (teams.size < 2) continue;
      for (const ant of ants) ant.hp -= 1 + Math.floor(state.rng() * 2);
      const survivor = ants.find((ant) => ant.hp > 0);
      for (const ant of ants) {
        if (ant.hp <= 0) {
          const killer = survivor && survivor.faction !== ant.faction ? survivor.faction : ants.find((a) => a.faction !== ant.faction)?.faction;
          if (killer !== undefined) game.stats[killer].kills += 1;
          addEffect(ant.x, ant.y, factions[ant.faction].color, "combat");
        }
      }
    }
    game.ants = game.ants.filter((ant) => ant.hp > 0 && ant.age < 900);
    const counts = factions.map(() => 0);
    for (const ant of game.ants) counts[ant.faction] += 1;
    for (const [i, count] of counts.entries()) game.stats[i].ants = count;
  }

  function stepSwarm() {
    const game = state.game;
    if (game.winner >= 0) return;
    game.tick += 1;
    const cfg = configs[state.difficulty];
    for (const pher of game.pheromone) {
      for (let i = 0; i < pher.length; i += 1) pher[i] *= 0.965;
    }
    for (const pressure of game.basePressure) {
      for (let i = 0; i < pressure.length; i += 1) pressure[i] *= 0.985;
    }
    for (const ant of game.ants) moveAnt(ant);
    for (const ant of game.ants) resolveAnt(ant);
    resolveCombat();
    if (state.rng() < cfg.spawn) spawnFood(1 + Math.floor(state.rng() * 3));
    if (state.mode === "human" && state.rng() < 0.15 && game.userFood < 20) spawnFood(2);

    if (game.tick % 90 === 0) {
      const leader = game.stats
        .map((stat, i) => ({ i, score: stat.food + stat.kills * 2 + stat.base * 0.5 }))
        .sort((a, b) => b.score - a.score)[0];
      addLog(`LEADER ${factions[leader.i].name}`, "gold");
    }
    const aliveFactions = game.stats.map((s, i) => (s.base > 0 && s.ants > 0 ? i : -1)).filter((i) => i >= 0);
    if (aliveFactions.length === 1 || game.tick > 3600) {
      game.winner = aliveFactions[0] ?? game.stats.map((s, i) => [i, s.food + s.kills]).sort((a, b) => b[1] - a[1])[0][0];
      addLog(`WINNER ${factions[game.winner].name}`, "gold");
      state.paused = true;
    }
  }

  function update(dt) {
    for (const effect of state.effects) effect.age += dt;
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
    if (state.paused) return;
    state.accumulator += dt * state.speed * configs[state.difficulty].speed;
    let guard = 0;
    while (state.accumulator >= 1 && guard < 9) {
      stepSwarm();
      state.accumulator -= 1;
      guard += 1;
    }
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
    writeText(FIELD.x + 2, FIELD.y - 2, "SWARM RESOURCE WAR", color.header);
    writeText(FIELD.x + FIELD.w - 28, FIELD.y - 2, "PHEROMONE FIELD ONLINE", color.green);
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const p = cellIndex(x, y);
        const px = GRID_X + x;
        const py = GRID_Y + y;
        const bg = (Math.floor(x / 5) + Math.floor(y / 4)) % 2 ? color.boardA : color.boardB;
        if (game.terrain[p]) {
          put(px, py, glyph.dark, color.line, "#05070b");
          continue;
        }
        let bestFaction = -1;
        let bestPher = 0;
        for (let i = 0; i < factions.length; i += 1) {
          if (game.pheromone[i][p] > bestPher) {
            bestPher = game.pheromone[i][p];
            bestFaction = i;
          }
        }
        if (game.food[p] > 0) {
          const amount = game.food[p];
          put(px, py, amount > 5 ? "$" : "+", mixColor(color.green2, color.gold, amount / 9), bg);
        } else if (bestPher > 0.18) {
          const faction = factions[bestFaction];
          const t = clamp(bestPher / 8, 0, 1);
          put(px, py, t > 0.55 ? ":" : glyph.dot, mixColor(color.lineDim, faction.color, t), bg);
        } else if (hash01(x, y, 5) < 0.07) {
          put(px, py, glyph.dot, color.lineDim, bg);
        } else {
          put(px, py, " ", color.dim, bg);
        }
      }
    }
    for (const [i, faction] of factions.entries()) {
      const [hx, hy] = faction.home;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const d = Math.abs(dx) + Math.abs(dy);
          const char = d < 2 ? glyph.full : glyph.mid;
          put(GRID_X + hx + dx, GRID_Y + hy + dy, char, faction.color, faction.dim);
        }
      }
      writeText(GRID_X + hx - 2, GRID_Y + hy, faction.name[0] + faction.name[1], color.ink, faction.color);
      const pressure = clamp(1 - game.stats[i].base / 100, 0, 1);
      if (pressure > 0.3) put(GRID_X + hx, GRID_Y + hy - 3, "!", color.red);
    }
    for (const ant of game.ants) {
      const faction = factions[ant.faction];
      const char = ant.cargo ? "@" : faction.char;
      put(GRID_X + ant.x, GRID_Y + ant.y, char, ant.cargo ? color.green2 : faction.color);
    }
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const t = effect.age / effect.life;
      const r = effect.kind === "base" ? 6 * t + 1 : 4 * t + 1;
      const char = effect.kind === "combat" ? "*" : effect.kind === "food" ? "+" : ".";
      const fg = mixColor(effect.tone, color.dim, t);
      const cx = GRID_X + effect.x;
      const cy = GRID_Y + effect.y;
      const rr = Math.ceil(r);
      for (let dy = -rr; dy <= rr; dy += 1) {
        for (let dx = -rr; dx <= rr; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - r) > 0.44) continue;
          if (hash01(effect.x + dx, effect.y + dy, Math.floor(effect.age * 31)) < 0.16) continue;
          put(cx + dx, cy + dy, char, fg);
        }
      }
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line, color.panel);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "COLONIES", color.header);
    let topScore = 0;
    for (const stat of game.stats) topScore = Math.max(topScore, stat.food + stat.kills * 2 + stat.base * 0.5);
    for (let i = 0; i < factions.length; i += 1) {
      const faction = factions[i];
      const stat = game.stats[i];
      const y = RIGHT.y + 5 + i * 6;
      const score = stat.food + stat.kills * 2 + stat.base * 0.5;
      writeText(RIGHT.x + 2, y, faction.name.padEnd(5, " "), faction.color);
      writeText(RIGHT.x + 9, y, `ANTS ${String(stat.ants).padStart(3, "0")}`, color.text);
      writeText(RIGHT.x + 2, y + 1, `FOOD ${String(stat.food).padStart(3, "0")}  KILL ${String(stat.kills).padStart(3, "0")}`, color.muted);
      writeText(RIGHT.x + 2, y + 2, `BASE ${Math.max(0, Math.round(stat.base)).toString().padStart(3, "0")}`, stat.base < 35 ? color.red : color.green);
      drawBar(RIGHT.x + 2, y + 3, 18, topScore ? score / topScore : 0, faction.color);
    }

    writeText(RIGHT.x + 2, RIGHT.y + 31, "SIM", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 33, `TICK  ${String(game.tick).padStart(5, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 34, `MODE  ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 35, `SPD   ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 36, state.paused ? "STATE PAUSED" : "STATE RUNNING", state.paused ? color.gold : color.green);
    if (game.winner >= 0) writeText(RIGHT.x + 2, RIGHT.y + 38, `WINNER ${factions[game.winner].name}`, color.gold);

    writeText(RIGHT.x + 2, RIGHT.y + 41, "LOG", color.header);
    const tones = { red: color.red, green: color.green, cyan: color.cyan, gold: color.gold, info: color.muted };
    for (let i = 0; i < 9; i += 1) {
      const item = state.logs[i];
      if (!item) break;
      writeText(RIGHT.x + 2, RIGHT.y + 43 + i, `>${item.message}`.slice(0, RIGHT.w - 4), tones[item.tone] || color.muted);
    }
  }

  function drawFooter() {
    writeText(
      FIELD.x,
      ROWS - 4,
      "1 0.5X   2 1X   3 2X   4 4X     HUMAN: CLICK TO DROP FOOD     P PAUSE     R REROLL     W HOME",
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
    } else if (key === "w") {
      window.location.href = "../index.html";
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    const cell = canvasToCell(event);
    if (!cell || !state.game) return;
    playModeSelect.value = "human";
    state.mode = "human";
    state.game.userFood += 1;
    const p = cellIndex(cell.x, cell.y);
    if (!state.game.terrain[p]) {
      state.game.food[p] = Math.min(9, state.game.food[p] + 5);
      addEffect(cell.x, cell.y, color.green, "food");
      addLog("USER FOOD DROP", "green");
    }
  });

  initGame(randomSeed());
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
})();
