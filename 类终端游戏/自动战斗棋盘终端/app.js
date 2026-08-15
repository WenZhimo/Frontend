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
  const BOARD_W = 12;
  const BOARD_H = 8;
  const TILE_W = 7;
  const TILE_H = 4;
  const BOARD_X = FIELD.x + 7;
  const BOARD_Y = FIELD.y + 7;

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
    pink: "#ff78d4",
    boardA: "#071017",
    boardB: "#08131b",
  };

  const configs = {
    normal: { enemyBonus: 1, roundDelay: 2.2, roster: 5 },
    fast: { enemyBonus: 1.16, roundDelay: 1.6, roster: 6 },
    chaos: { enemyBonus: 1.34, roundDelay: 1.0, roster: 7 },
  };

  const unitDefs = [
    { key: "G", name: "GUARD", hp: 165, atk: 15, range: 1.35, cd: 0.82, mana: 80, skill: "SHIELD BASH", color: color.cyan2 },
    { key: "R", name: "RANGER", hp: 92, atk: 18, range: 4.8, cd: 0.62, mana: 70, skill: "VOLLEY", color: color.green2 },
    { key: "M", name: "MAGE", hp: 78, atk: 11, range: 4.2, cd: 0.72, mana: 62, skill: "ARC NOVA", color: color.purple },
    { key: "H", name: "HEALER", hp: 86, atk: 9, range: 3.8, cd: 0.76, mana: 60, skill: "REPAIR WAVE", color: color.gold },
    { key: "S", name: "SHADE", hp: 104, atk: 23, range: 1.55, cd: 0.58, mana: 78, skill: "BLINK CUT", color: color.red2 },
  ];

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

  function addEffect(x, y, tone, kind = "burst", text = "") {
    if (state.effects.length > 300) state.effects.splice(0, state.effects.length - 300);
    state.effects.push({ x, y, tone, kind, text, age: 0, life: kind === "text" ? 0.78 : 0.54 });
  }

  function tileToChar(x, y) {
    return {
      x: BOARD_X + Math.round(x * TILE_W + TILE_W / 2),
      y: BOARD_Y + Math.round(y * TILE_H + TILE_H / 2),
    };
  }

  function makeUnit(team, defIndex, x, y, rank = 1) {
    const def = unitDefs[defIndex];
    const mult = 1 + (rank - 1) * 0.46 + (team === 1 ? (configs[state.difficulty].enemyBonus - 1) * 0.7 : 0);
    return {
      id: `${team}-${state.game?.nextId ?? 0}-${Math.floor(state.rng() * 9999)}`,
      team,
      defIndex,
      rank,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: def.hp * mult,
      maxHp: def.hp * mult,
      atk: def.atk * mult,
      cd: state.rng() * def.cd,
      mana: Math.floor(state.rng() * 20),
      shield: 0,
      alive: true,
      flash: 0,
    };
  }

  function addUnit(team, defIndex, x, y, rank = 1) {
    const unit = makeUnit(team, defIndex, x, y, rank);
    state.game.nextId += 1;
    state.game.units.push(unit);
    return unit;
  }

  function deployTeam(team, count, round) {
    const sideX = team === 0 ? [1, 2, 3, 4] : [BOARD_W - 2, BOARD_W - 3, BOARD_W - 4, BOARD_W - 5];
    const rows = [1, 3, 5, 6, 2, 4, 0, 7];
    for (let i = 0; i < count; i += 1) {
      const defIndex = Math.floor(state.rng() * unitDefs.length);
      const rank = 1 + (round > 3 && state.rng() > 0.66 ? 1 : 0) + (round > 7 && state.rng() > 0.84 ? 1 : 0);
      const x = sideX[i % sideX.length] + (state.rng() - 0.5) * 0.28;
      const y = rows[i % rows.length] + (state.rng() - 0.5) * 0.22;
      addUnit(team, defIndex, x, y, rank);
    }
  }

  function initGame(seed = state.seed) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash ^ 0xab071e55);
    state.mode = playModeSelect.value;
    state.difficulty = difficultySelect.value;
    state.speed = 1;
    state.paused = false;
    state.effects = [];
    state.logs = [];
    state.game = {
      units: [],
      projectiles: [],
      round: 1,
      phase: "BATTLE",
      phaseTimer: 0,
      nextId: 1,
      blueWins: 0,
      goldWins: 0,
      credits: 24,
      score: 0,
      elapsed: 0,
      lastWinner: -1,
    };
    deployTeam(0, configs[state.difficulty].roster, 1);
    deployTeam(1, configs[state.difficulty].roster, 1);
    seedInput.value = state.seed;
    updateSeedStatus();
    addLog("AUTO BATTLER ONLINE", "green");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "cyan");
  }

  function living(team = null) {
    return state.game.units.filter((unit) => unit.alive && (team === null || unit.team === team));
  }

  function nearestEnemy(unit) {
    let best = null;
    let bestD = Infinity;
    for (const other of state.game.units) {
      if (!other.alive || other.team === unit.team) continue;
      const d = Math.hypot(other.x - unit.x, other.y - unit.y);
      if (d < bestD) {
        best = other;
        bestD = d;
      }
    }
    return { target: best, distance: bestD };
  }

  function nearestAllyToHeal(unit) {
    let best = null;
    let missing = 0;
    for (const other of state.game.units) {
      if (!other.alive || other.team !== unit.team) continue;
      const d = Math.hypot(other.x - unit.x, other.y - unit.y);
      const hpMissing = other.maxHp - other.hp;
      if (d < 4.5 && hpMissing > missing) {
        best = other;
        missing = hpMissing;
      }
    }
    return best;
  }

  function damageUnit(target, amount, source, tone = color.red) {
    if (!target.alive) return;
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    target.hp -= amount - absorbed;
    target.flash = 0.2;
    const p = tileToChar(target.x, target.y);
    addEffect(p.x - BOARD_X, p.y - BOARD_Y, tone, "text", String(Math.round(amount)));
    if (target.hp <= 0) {
      target.alive = false;
      target.hp = 0;
      state.game.score += 20 + target.rank * 10;
      const killer = source ? unitDefs[source.defIndex].name : "UNKNOWN";
      addLog(`${killer} KO ${unitDefs[target.defIndex].name}`, source?.team === 0 ? "cyan" : "gold");
      addEffect(p.x - BOARD_X, p.y - BOARD_Y, tone, "burst");
    }
  }

  function healUnit(target, amount) {
    if (!target.alive) return;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const p = tileToChar(target.x, target.y);
    addEffect(p.x - BOARD_X, p.y - BOARD_Y, color.green2, "text", `+${Math.round(amount)}`);
  }

  function fireProjectile(source, target, amount, tone, char = "*") {
    const a = tileToChar(source.x, source.y);
    const b = tileToChar(target.x, target.y);
    state.game.projectiles.push({
      x1: a.x - BOARD_X,
      y1: a.y - BOARD_Y,
      x2: b.x - BOARD_X,
      y2: b.y - BOARD_Y,
      target,
      source,
      amount,
      tone,
      char,
      age: 0,
      life: 0.18,
    });
  }

  function castSkill(unit, target) {
    const def = unitDefs[unit.defIndex];
    unit.mana = 0;
    unit.flash = 0.32;
    const p = tileToChar(unit.x, unit.y);
    addEffect(p.x - BOARD_X, p.y - BOARD_Y, def.color, "burst");
    addLog(`${def.name} ${def.skill}`, unit.team === 0 ? "cyan" : "gold");

    if (def.name === "GUARD") {
      unit.shield += 60 + unit.rank * 22;
      if (target) damageUnit(target, unit.atk * 1.7, unit, def.color);
    } else if (def.name === "RANGER") {
      const enemies = living(1 - unit.team)
        .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))
        .slice(0, 3 + unit.rank);
      for (const enemy of enemies) fireProjectile(unit, enemy, unit.atk * 1.25, def.color, "+");
    } else if (def.name === "MAGE") {
      for (const enemy of living(1 - unit.team)) {
        const d = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
        if (d < 3.2 + unit.rank * 0.45) damageUnit(enemy, unit.atk * (2.1 + unit.rank * 0.25), unit, def.color);
      }
    } else if (def.name === "HEALER") {
      for (const ally of living(unit.team)) {
        const d = Math.hypot(ally.x - unit.x, ally.y - unit.y);
        if (d < 4.2) healUnit(ally, 28 + unit.rank * 16);
      }
    } else if (def.name === "SHADE" && target) {
      unit.x = clamp(target.x + (unit.team === 0 ? -0.9 : 0.9), 0, BOARD_W - 1);
      unit.y = clamp(target.y + (state.rng() - 0.5) * 1.2, 0, BOARD_H - 1);
      damageUnit(target, unit.atk * (2.4 + unit.rank * 0.35), unit, def.color);
    }
  }

  function updateUnit(unit, dt) {
    if (!unit.alive) return;
    const def = unitDefs[unit.defIndex];
    unit.flash = Math.max(0, unit.flash - dt);
    unit.shield = Math.max(0, unit.shield - dt * 4);
    unit.cd -= dt;
    unit.mana = Math.min(def.mana, unit.mana + dt * 12);
    const { target, distance } = nearestEnemy(unit);
    if (!target) return;

    if (unit.mana >= def.mana) {
      castSkill(unit, target);
      return;
    }

    const range = def.range + (unit.rank - 1) * 0.25;
    if (distance > range) {
      const dx = (target.x - unit.x) / Math.max(distance, 0.001);
      const dy = (target.y - unit.y) / Math.max(distance, 0.001);
      const speed = def.name === "SHADE" ? 1.9 : def.name === "GUARD" ? 1.1 : 1.35;
      unit.x = clamp(unit.x + dx * speed * dt, 0, BOARD_W - 1);
      unit.y = clamp(unit.y + dy * speed * dt, 0, BOARD_H - 1);
      return;
    }

    if (unit.cd <= 0) {
      if (def.name === "HEALER") {
        const ally = nearestAllyToHeal(unit);
        if (ally && ally.hp < ally.maxHp * 0.92) healUnit(ally, unit.atk * 1.9);
        else fireProjectile(unit, target, unit.atk, def.color, ".");
      } else if (range > 2) {
        fireProjectile(unit, target, unit.atk, def.color, def.name === "MAGE" ? "*" : "-");
      } else {
        damageUnit(target, unit.atk, unit, def.color);
        const p = tileToChar(target.x, target.y);
        addEffect(p.x - BOARD_X, p.y - BOARD_Y, def.color, "hit");
      }
      unit.mana = Math.min(def.mana, unit.mana + 16);
      unit.cd = Math.max(0.12, def.cd / (1 + (unit.rank - 1) * 0.12));
    }
  }

  function resolveProjectiles(dt) {
    const game = state.game;
    for (const shot of game.projectiles) {
      shot.age += dt;
      if (shot.age >= shot.life && shot.target.alive) damageUnit(shot.target, shot.amount, shot.source, shot.tone);
    }
    game.projectiles = game.projectiles.filter((shot) => shot.age < shot.life);
  }

  function restageRound() {
    const game = state.game;
    game.units = [];
    game.projectiles = [];
    game.round += 1;
    game.credits += 8 + game.round * 2;
    deployTeam(0, configs[state.difficulty].roster + Math.floor(game.round / 5), game.round);
    deployTeam(1, configs[state.difficulty].roster + Math.floor(game.round / 4), game.round + 1);
    if (state.mode === "human" && game.credits >= 14) {
      game.credits -= 14;
      const def = Math.floor(state.rng() * unitDefs.length);
      addUnit(0, def, 1 + state.rng() * 3, 1 + state.rng() * 6, 2);
      addLog("HUMAN BONUS UNIT", "green");
    }
    game.phase = "BATTLE";
    game.phaseTimer = 0;
    addLog(`ROUND ${String(game.round).padStart(2, "0")}`, "gold");
  }

  function updateBattle(dt) {
    const game = state.game;
    for (const unit of game.units) updateUnit(unit, dt);
    resolveProjectiles(dt);
    game.units = game.units.filter((unit) => unit.alive || unit.flash > 0);
    const blue = living(0).length;
    const gold = living(1).length;
    if (blue === 0 || gold === 0 || game.elapsed > game.round * 38 + 30) {
      const winner = blue >= gold ? 0 : 1;
      if (winner === 0) game.blueWins += 1;
      else game.goldWins += 1;
      game.lastWinner = winner;
      game.phase = "RESULT";
      game.phaseTimer = configs[state.difficulty].roundDelay;
      addLog(`${winner === 0 ? "BLUE" : "GOLD"} WINS ROUND`, winner === 0 ? "cyan" : "gold");
      const cx = winner === 0 ? 20 : 64;
      addEffect(cx, 16, winner === 0 ? color.cyan2 : color.gold, "burst");
      if (game.round >= 12 || game.blueWins >= 7 || game.goldWins >= 7) {
        game.phase = "MATCH_END";
        game.phaseTimer = 999;
        state.paused = true;
        addLog("MATCH COMPLETE", "gold");
      }
    }
  }

  function update(dt) {
    if (!state.game) return;
    for (const effect of state.effects) effect.age += dt;
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
    if (state.paused) return;
    const game = state.game;
    const scaled = dt * state.speed;
    game.elapsed += scaled;
    if (game.phase === "BATTLE") updateBattle(scaled);
    else if (game.phase === "RESULT") {
      game.phaseTimer -= scaled;
      if (game.phaseTimer <= 0) restageRound();
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

  function drawBoard() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line, color.panel);
    writeText(FIELD.x + 2, FIELD.y - 2, "AUTO BATTLER LITE", color.header);
    writeText(FIELD.x + FIELD.w - 28, FIELD.y - 2, "SEEK / SKILL / REPORT", color.green);
    const game = state.game;
    for (let y = 0; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) {
        const px = BOARD_X + x * TILE_W;
        const py = BOARD_Y + y * TILE_H;
        const bg = (x + y) % 2 ? color.boardA : color.boardB;
        fillRectChars(px, py, TILE_W, TILE_H, " ", color.dim, bg);
        for (let xx = 0; xx < TILE_W; xx += 1) put(px + xx, py, "-", color.lineDim, bg);
        for (let yy = 1; yy < TILE_H; yy += 1) put(px, py + yy, "|", color.lineDim, bg);
        if (x === 5) put(px + TILE_W - 1, py + 1, ":", color.line);
      }
    }
    writeText(BOARD_X + 4, BOARD_Y - 2, "BLUE ARRAY", color.cyan2);
    writeText(BOARD_X + BOARD_W * TILE_W - 20, BOARD_Y - 2, "GOLD ARRAY", color.gold);
    for (const shot of game.projectiles) {
      const t = clamp(shot.age / shot.life, 0, 1);
      const steps = Math.max(3, Math.round(Math.hypot(shot.x2 - shot.x1, shot.y2 - shot.y1)));
      for (let i = 0; i <= steps; i += 1) {
        const k = i / steps;
        const x = Math.round(lerp(shot.x1, shot.x2, k));
        const y = Math.round(lerp(shot.y1, shot.y2, k));
        if (i % 2 === 0 || t < 0.45) put(BOARD_X + x, BOARD_Y + y, shot.char, mixColor(shot.tone, color.dim, t));
      }
    }
    for (const unit of game.units) drawUnit(unit);
  }

  function drawUnit(unit) {
    const def = unitDefs[unit.defIndex];
    const p = tileToChar(unit.x, unit.y);
    const teamColor = unit.team === 0 ? color.cyan2 : color.gold;
    const fg = unit.flash > 0 ? color.header : def.color;
    const bg = unit.team === 0 ? "#081923" : "#211807";
    put(p.x - 1, p.y - 1, "/", teamColor, bg);
    put(p.x, p.y - 1, String(unit.rank), color.header, bg);
    put(p.x + 1, p.y - 1, "\\", teamColor, bg);
    put(p.x - 1, p.y, "[", teamColor, bg);
    put(p.x, p.y, def.key, fg, bg);
    put(p.x + 1, p.y, "]", teamColor, bg);
    const hp = clamp(unit.hp / unit.maxHp, 0, 1);
    put(p.x - 1, p.y + 1, hp > 0.66 ? glyph.full : hp > 0.33 ? glyph.mid : glyph.light, hp > 0.33 ? color.green : color.red);
    put(p.x, p.y + 1, unit.shield > 1 ? "*" : "-", unit.shield > 1 ? color.cyan : color.line);
    put(p.x + 1, p.y + 1, unit.mana > unitDefs[unit.defIndex].mana * 0.75 ? "+" : "-", color.blue);
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const t = effect.age / effect.life;
      const fg = mixColor(effect.tone, color.dim, t);
      if (effect.kind === "text") {
        writeText(BOARD_X + Math.round(effect.x), BOARD_Y + Math.round(effect.y) - Math.floor(t * 3), effect.text.slice(0, 4), fg);
        continue;
      }
      const r = 1 + t * 6;
      const rr = Math.ceil(r);
      for (let dy = -rr; dy <= rr; dy += 1) {
        for (let dx = -rr; dx <= rr; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - r) > 0.45) continue;
          if (hash01(Math.round(effect.x) + dx, Math.round(effect.y) + dy, Math.floor(effect.age * 31)) < 0.14) continue;
          put(BOARD_X + Math.round(effect.x) + dx, BOARD_Y + Math.round(effect.y) + dy, t < 0.5 ? "*" : ".", fg);
        }
      }
    }
  }

  function drawHud() {
    const game = state.game;
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line, color.panel);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "MATCH", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `ROUND   ${String(game.round).padStart(2, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `BLUE    ${String(game.blueWins).padStart(2, "0")}`, color.cyan2);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `GOLD    ${String(game.goldWins).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `CREDIT  ${String(game.credits).padStart(3, "0")}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SCORE   ${String(game.score).padStart(5, "0")}`, color.text);
    writeText(RIGHT.x + 2, RIGHT.y + 11, `MODE    ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 12, `SPD     ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 13, `PHASE   ${game.phase}`, game.phase === "BATTLE" ? color.green : color.gold);

    writeText(RIGHT.x + 2, RIGHT.y + 17, "ROSTER", color.header);
    for (let i = 0; i < unitDefs.length; i += 1) {
      const def = unitDefs[i];
      const y = RIGHT.y + 19 + i * 3;
      writeText(RIGHT.x + 2, y, `${def.key} ${def.name}`, def.color);
      writeText(RIGHT.x + 2, y + 1, `HP ${def.hp} ATK ${def.atk} MP ${def.mana}`, color.muted);
    }

    writeText(RIGHT.x + 2, RIGHT.y + 36, "BALANCE", color.header);
    drawBar(RIGHT.x + 2, RIGHT.y + 38, 10, living(0).length / Math.max(1, living(0).length + living(1).length), color.cyan2);
    drawBar(RIGHT.x + 15, RIGHT.y + 38, 10, living(1).length / Math.max(1, living(0).length + living(1).length), color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 41, "LOG", color.header);
    const tones = { red: color.red, green: color.green, cyan: color.cyan, gold: color.gold, info: color.muted };
    for (let i = 0; i < 10; i += 1) {
      const item = state.logs[i];
      if (!item) break;
      writeText(RIGHT.x + 2, RIGHT.y + 43 + i, `>${item.message}`.slice(0, RIGHT.w - 4), tones[item.tone] || color.muted);
    }
  }

  function drawFooter() {
    writeText(
      FIELD.x,
      ROWS - 4,
      "1 0.5X   2 1X   3 2X   4 4X     HUMAN: CLICK BLUE UNIT BOOST / EMPTY TILE RECRUIT     P PAUSE     R REROLL     H HOME",
      color.muted,
    );
  }

  function composeScreen() {
    drawBackground();
    drawBoard();
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

  function canvasToBoard(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const tx = ((event.clientX - rect.left) * sx) / CELL_W;
    const ty = ((event.clientY - rect.top) * sy) / CELL_H;
    const x = Math.floor((tx - BOARD_X) / TILE_W);
    const y = Math.floor((ty - BOARD_Y) / TILE_H);
    if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H) return null;
    return { x, y };
  }

  function handleHumanClick(cell) {
    const game = state.game;
    playModeSelect.value = "human";
    state.mode = "human";
    const friendly = living(0).find((unit) => Math.floor(unit.x) === cell.x && Math.floor(unit.y) === cell.y);
    if (friendly && game.credits >= 8) {
      game.credits -= 8;
      friendly.rank = Math.min(4, friendly.rank + 1);
      friendly.maxHp *= 1.18;
      friendly.hp = friendly.maxHp;
      friendly.atk *= 1.16;
      const p = tileToChar(friendly.x, friendly.y);
      addEffect(p.x - BOARD_X, p.y - BOARD_Y, color.green2, "burst");
      addLog(`BOOST ${unitDefs[friendly.defIndex].name}`, "green");
      return;
    }
    if (cell.x < 5 && game.credits >= 12 && !living().some((unit) => Math.floor(unit.x) === cell.x && Math.floor(unit.y) === cell.y)) {
      game.credits -= 12;
      const def = Math.floor(state.rng() * unitDefs.length);
      addUnit(0, def, cell.x + 0.2, cell.y + 0.2, 1);
      addLog(`RECRUIT ${unitDefs[def].name}`, "green");
    }
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
    } else if (key === "h") {
      window.location.href = "../index.html";
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    const cell = canvasToBoard(event);
    if (!cell) return;
    handleHumanClick(cell);
  });

  initGame(randomSeed());
  composeScreen();
  renderScreen();
  requestAnimationFrame(frame);
})();
