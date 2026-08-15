const canvas = document.getElementById("terminal");
const ctx = canvas.getContext("2d", { alpha: false });
const seedForm = document.querySelector(".seed-bar");
const seedInput = document.getElementById("seed-input");
const playModeInput = document.getElementById("play-mode");
const difficultyInput = document.getElementById("difficulty");
const seedRandomButton = document.getElementById("seed-random");
const seedCopyButton = document.getElementById("seed-copy");
const seedStatus = document.getElementById("seed-status");

const COLS = 136;
const ROWS = 76;
const CELL_W = 11;
const CELL_H = 16;
const SEED_LEN = 100;
const ASCII_MIN = 33;
const ASCII_MAX = 126;
const HOME_KEY = ",";
const MAP_W = 74;
const MAP_H = 52;
const MAP_X = 4;
const MAP_Y = 8;

canvas.width = COLS * CELL_W;
canvas.height = ROWS * CELL_H;
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = "top";
ctx.font = "700 15px Consolas, 'Cascadia Mono', 'Courier New', monospace";

const color = {
  page: "#020306",
  bg: "#05080e",
  bg2: "#07111a",
  soil: "#0a1722",
  grass: "#0b1c17",
  stone: "#172334",
  floor: "#08121c",
  line: "#2c425a",
  lineDim: "#142638",
  white: "#edf9ff",
  muted: "#8a96ab",
  blue: "#69d7f0",
  green: "#57ff9b",
  yellow: "#ffd15f",
  orange: "#ff9b3e",
  red: "#ff4e65",
  violet: "#b99cff",
};

let buffer = [];
let rng = mulberry32(1);
let activeSeed = "";
let playMode = "demo";
let difficulty = "normal";
let speed = 1;
let paused = false;
let lastTime = 0;
let accumulator = 0;
let game = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${rr.toString(16).padStart(2, "0")}${rg.toString(16).padStart(2, "0")}${rb
    .toString(16)
    .padStart(2, "0")}`;
}

function sanitizeSeed(value) {
  return [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("")
    .slice(0, SEED_LEN);
}

function padSeed(value) {
  return sanitizeSeed(value).padEnd(SEED_LEN, " ");
}

function randomSeed() {
  let out = "";
  for (let i = 0; i < SEED_LEN; i += 1) {
    out += String.fromCharCode(ASCII_MIN + Math.floor(Math.random() * (ASCII_MAX - ASCII_MIN + 1)));
  }
  return out;
}

function setStatus(text = null) {
  seedStatus.textContent = text || `LEN ${activeSeed.length}/${SEED_LEN}`;
}

function makeCell() {
  return { ch: " ", fg: color.muted, bg: color.bg };
}

function clearBuffer() {
  buffer = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, makeCell));
}

function setCell(x, y, ch, fg = color.white, bg = null) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) return;
  buffer[iy][ix].ch = ch;
  buffer[iy][ix].fg = fg;
  if (bg) buffer[iy][ix].bg = bg;
}

function writeText(x, y, text, fg = color.white, bg = null) {
  for (let i = 0; i < text.length; i += 1) setCell(x + i, y, text[i], fg, bg);
}

function fillRectChars(x, y, w, h, ch, fg, bg = null) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setCell(xx, yy, ch, fg, bg);
  }
}

function drawBox(x, y, w, h, fg = color.line) {
  for (let xx = x + 1; xx < x + w - 1; xx += 1) {
    setCell(xx, y, "─", fg);
    setCell(xx, y + h - 1, "─", fg);
  }
  for (let yy = y + 1; yy < y + h - 1; yy += 1) {
    setCell(x, yy, "│", fg);
    setCell(x + w - 1, yy, "│", fg);
  }
  setCell(x, y, "┌", fg);
  setCell(x + w - 1, y, "┐", fg);
  setCell(x, y + h - 1, "└", fg);
  setCell(x + w - 1, y + h - 1, "┘", fg);
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

function tileAt(x, y) {
  if (!inBounds(x, y)) return "#";
  return game.map[y][x];
}

function isWalkable(x, y) {
  const tile = tileAt(x, y);
  return tile !== "#" && tile !== "~";
}

function makeTerrain() {
  const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => "."));
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      if (x < 18) map[y][x] = rng() < 0.14 ? "T" : ",";
      else if (x < 27) map[y][x] = rng() < 0.08 ? "~" : ".";
      else map[y][x] = rng() < 0.1 ? "%" : "#";
    }
  }
  carveRoom(map, 25, 20, 17, 11);
  carveRoom(map, 43, 20, 13, 8);
  carveRoom(map, 31, 32, 16, 8);
  carveTunnel(map, 33, 25, 50, 24);
  carveTunnel(map, 33, 25, 10, 25);
  const stock = rect(27, 22, 6, 5, "S");
  const workshop = rect(45, 22, 5, 4, "W");
  const farm = rect(31, 34, 8, 4, "F");
  for (const cell of stock.concat(workshop, farm)) map[cell.y][cell.x] = cell.kind;
  return { map, structures: { stock, workshop, farm } };
}

function rect(x, y, w, h, kind) {
  const out = [];
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) out.push({ x: xx, y: yy, kind });
  return out;
}

function carveRoom(map, x, y, w, h) {
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) if (inMap(xx, yy)) map[yy][xx] = ".";
}

function carveTunnel(map, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  while (x !== x1) {
    if (inMap(x, y)) map[y][x] = ".";
    x += x < x1 ? 1 : -1;
  }
  while (y !== y1) {
    if (inMap(x, y)) map[y][x] = ".";
    y += y < y1 ? 1 : -1;
  }
  if (inMap(x, y)) map[y][x] = ".";
}

function inMap(x, y) {
  return x >= 1 && y >= 1 && x < MAP_W - 1 && y < MAP_H - 1;
}

function spawnBurst(x, y, fg, count = 10, force = 1) {
  const chars = [".", "·", ":", "*", "+", "x"];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const s = (0.45 + rng() * 1.35) * force;
    game.fx.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.65,
      life: 0.35 + rng() * 0.55,
      maxLife: 0.9,
      ch: chars[Math.floor(rng() * chars.length)],
      fg,
    });
  }
}

function logLine(text) {
  game.logs.unshift(text.slice(0, 42));
  game.logs = game.logs.slice(0, 11);
}

function initGame(seed) {
  activeSeed = padSeed(seed || randomSeed());
  seedInput.value = activeSeed.trimEnd();
  rng = mulberry32(hashSeed(activeSeed));
  playMode = playModeInput.value;
  difficulty = difficultyInput.value;
  paused = false;
  accumulator = 0;
  const terrain = makeTerrain();
  const names = ["Urist", "Domas", "Rigoth", "Avuz", "Mistem", "Zasit", "Vucar"];
  game = {
    ...terrain,
    dwarves: names.map((name, i) => ({
      name,
      x: 29 + (i % 3),
      y: 24 + Math.floor(i / 3),
      role: ["MINER", "HAULER", "WOOD", "FARM", "SMITH", "BREWER", "MASON"][i],
      task: null,
      carry: null,
      energy: 90 + Math.floor(rng() * 20),
      mood: 65 + Math.floor(rng() * 25),
      pulse: 0,
    })),
    resources: { food: 18, wood: 8, stone: 4, ore: 0, drink: 12, crafts: 0 },
    designations: [],
    fx: [],
    logs: [">STRIKE THE EARTH", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    cursor: { x: 31, y: 25 },
    season: "GRANITE",
    day: 1,
    ticks: 0,
    wealth: 0,
    alert: 0,
    message: "COLONY ONLINE",
    messagePulse: 1,
  };
  setStatus();
}

function nearestDwarfTarget(dwarf) {
  const wants = [];
  if (game.resources.wood < 18) wants.push("wood");
  if (game.resources.stone < 18) wants.push("stone");
  if (game.resources.ore < 8) wants.push("ore");
  if (game.resources.food < 35) wants.push("food");
  if (game.resources.drink < 20) wants.push("drink");
  if (game.resources.ore > 0 && game.resources.wood > 0) wants.push("craft");
  if (wants.length === 0) wants.push("haul");
  const preference = rolePreference(dwarf.role, wants);
  return findTargetFor(preference, dwarf) || findTargetFor(wants[0], dwarf) || idleTarget(dwarf);
}

function rolePreference(role, wants) {
  const table = {
    MINER: ["ore", "stone", "wood", "food", "drink", "craft"],
    WOOD: ["wood", "food", "stone", "drink", "craft"],
    FARM: ["food", "drink", "wood", "stone", "craft"],
    BREWER: ["drink", "food", "wood", "stone", "craft"],
    SMITH: ["craft", "ore", "stone", "wood", "food"],
    MASON: ["stone", "craft", "wood", "food", "drink"],
    HAULER: ["haul", "food", "wood", "stone", "ore", "drink", "craft"],
  };
  return (table[role] || wants).find((item) => wants.includes(item)) || wants[0];
}

function findTargetFor(kind, dwarf) {
  const candidates = [];
  for (let y = 1; y < MAP_H - 1; y += 1) {
    for (let x = 1; x < MAP_W - 1; x += 1) {
      const tile = game.map[y][x];
      if (kind === "wood" && tile === "T") candidates.push({ x, y, kind });
      if (kind === "food" && (tile === "," || tile === "F")) candidates.push({ x, y, kind });
      if (kind === "stone" && tile === "#" && adjacentWalkable(x, y)) candidates.push({ ...adjacentWalkable(x, y), actionX: x, actionY: y, kind });
      if (kind === "ore" && tile === "%" && adjacentWalkable(x, y)) candidates.push({ ...adjacentWalkable(x, y), actionX: x, actionY: y, kind });
      if ((kind === "drink" || kind === "craft") && tile === "W") candidates.push({ x, y, kind });
      if (kind === "haul" && tile === "S") candidates.push({ x, y, kind });
    }
  }
  candidates.sort((a, b) => dist(dwarf, a) - dist(dwarf, b));
  return candidates[0] || null;
}

function adjacentWalkable(x, y) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const dir of dirs) {
    const nx = x + dir[0];
    const ny = y + dir[1];
    if (isWalkable(nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

function idleTarget(dwarf) {
  return { x: 28 + Math.floor(rng() * 16), y: 22 + Math.floor(rng() * 12), kind: "idle" };
}

function dist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function stepToward(dwarf, target) {
  const dirs = [
    { dx: Math.sign(target.x - dwarf.x), dy: 0 },
    { dx: 0, dy: Math.sign(target.y - dwarf.y) },
    { dx: -Math.sign(target.x - dwarf.x), dy: 0 },
    { dx: 0, dy: -Math.sign(target.y - dwarf.y) },
  ];
  for (const dir of dirs) {
    if (!dir.dx && !dir.dy) continue;
    const nx = dwarf.x + dir.dx;
    const ny = dwarf.y + dir.dy;
    if (isWalkable(nx, ny) && !game.dwarves.some((other) => other !== dwarf && other.x === nx && other.y === ny)) {
      dwarf.x = nx;
      dwarf.y = ny;
      return;
    }
  }
}

function performTask(dwarf) {
  const task = dwarf.task;
  if (!task) return;
  dwarf.pulse = 0.6;
  if (task.kind === "wood") {
    game.map[task.y][task.x] = ",";
    game.resources.wood += 4;
    logLine(`>${dwarf.name} chops timber`);
    spawnBurst(MAP_X + task.x, MAP_Y + task.y, color.green, 14, 1);
  } else if (task.kind === "food") {
    game.resources.food += 5;
    game.map[task.y][task.x] = task.y >= 34 && task.y <= 37 ? "F" : ",";
    logLine(`>${dwarf.name} harvests plump helmets`);
    spawnBurst(MAP_X + task.x, MAP_Y + task.y, color.yellow, 12, 0.9);
  } else if (task.kind === "stone" || task.kind === "ore") {
    const ax = task.actionX;
    const ay = task.actionY;
    game.map[ay][ax] = ".";
    if (task.kind === "ore") game.resources.ore += 2;
    else game.resources.stone += 3;
    logLine(`>${dwarf.name} mines ${task.kind}`);
    spawnBurst(MAP_X + ax, MAP_Y + ay, task.kind === "ore" ? color.violet : color.line, 18, 1.2);
  } else if (task.kind === "drink") {
    if (game.resources.food > 0 && game.resources.wood > 0) {
      game.resources.food -= 1;
      game.resources.wood -= 1;
      game.resources.drink += 4;
      logLine(`>${dwarf.name} brews dwarven wine`);
      spawnBurst(MAP_X + task.x, MAP_Y + task.y, color.blue, 14, 1);
    }
  } else if (task.kind === "craft") {
    if (game.resources.ore > 0 && game.resources.wood > 0) {
      game.resources.ore -= 1;
      game.resources.wood -= 1;
      game.resources.crafts += 1;
      game.wealth += 25;
      logLine(`>${dwarf.name} finishes a craft`);
      spawnBurst(MAP_X + task.x, MAP_Y + task.y, color.orange, 18, 1.2);
    }
  } else if (task.kind === "haul") {
    game.wealth += 1;
  }
  dwarf.energy = Math.max(20, dwarf.energy - 4);
  dwarf.mood = clamp(dwarf.mood + (game.resources.drink > 0 ? 1 : -2), 0, 100);
  dwarf.task = null;
}

function updateDwarves(dt) {
  game.workTimer -= dt;
  if (game.workTimer > 0) return;
  game.workTimer = difficulty === "fast" ? 0.12 : difficulty === "chaos" ? 0.08 : 0.22;
  for (const dwarf of game.dwarves) {
    if (!dwarf.task) dwarf.task = nearestDwarfTarget(dwarf);
    if (dwarf.task && dwarf.x === dwarf.task.x && dwarf.y === dwarf.task.y) performTask(dwarf);
    else if (dwarf.task) stepToward(dwarf, dwarf.task);
    dwarf.energy = Math.min(100, dwarf.energy + 0.15);
    dwarf.pulse = Math.max(0, dwarf.pulse - 0.12);
  }
  game.ticks += 1;
  if (game.ticks % 25 === 0) {
    game.day += 1;
    game.resources.food = Math.max(0, game.resources.food - game.dwarves.length);
    game.resources.drink = Math.max(0, game.resources.drink - Math.ceil(game.dwarves.length / 2));
    logLine(`>day ${game.day}: stocks audited`);
  }
  if (game.resources.food < 6 || game.resources.drink < 4) game.alert = 1;
  else game.alert = Math.max(0, game.alert - 0.02);
}

function updateFx(dt) {
  for (const fx of game.fx) {
    fx.life -= dt;
    fx.x += fx.vx * dt * 10;
    fx.y += fx.vy * dt * 10;
    fx.vy += dt * 2.4;
  }
  game.fx = game.fx.filter((fx) => fx.life > 0);
  game.messagePulse = Math.max(0, game.messagePulse - dt);
}

function update(dt) {
  if (!game || paused) return;
  updateDwarves(dt);
  updateFx(dt);
}

function moveCursor(dx, dy) {
  game.cursor.x = clamp(game.cursor.x + dx, 1, MAP_W - 2);
  game.cursor.y = clamp(game.cursor.y + dy, 1, MAP_H - 2);
}

function designateCursor() {
  const tile = tileAt(game.cursor.x, game.cursor.y);
  if (tile === "#" || tile === "%" || tile === "T" || tile === "," || tile === "F") {
    game.designations.push({ x: game.cursor.x, y: game.cursor.y });
    game.message = `DESIGNATED ${tile}`;
    game.messagePulse = 0.8;
    spawnBurst(MAP_X + game.cursor.x, MAP_Y + game.cursor.y, color.white, 12, 0.7);
    logLine(`>overseer marks ${game.cursor.x},${game.cursor.y}`);
  }
}

function renderBackground() {
  const seedHash = hashSeed(activeSeed.slice(0, 12));
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const band = (x * 7 + y * 5) % 29 === 0;
      const speck = (x * 19 + y * 13 + seedHash) % 67 === 0;
      buffer[y][x].bg = band ? "#07101a" : color.bg;
      buffer[y][x].ch = speck ? "·" : " ";
      buffer[y][x].fg = speck ? "#18334a" : color.muted;
    }
  }
}

function tileStyle(tile) {
  if (tile === "#") return { ch: "▓", fg: color.lineDim, bg: color.stone };
  if (tile === "%") return { ch: "%", fg: color.violet, bg: color.stone };
  if (tile === "T") return { ch: "♣", fg: color.green, bg: color.grass };
  if (tile === ",") return { ch: ",", fg: color.green, bg: color.grass };
  if (tile === "~") return { ch: "~", fg: color.blue, bg: "#07121f" };
  if (tile === "S") return { ch: "□", fg: color.yellow, bg: "#17140b" };
  if (tile === "W") return { ch: "⚒", fg: color.orange, bg: "#20150b" };
  if (tile === "F") return { ch: "≋", fg: color.green, bg: "#0a2014" };
  return { ch: ".", fg: color.muted, bg: color.floor };
}

function renderMap() {
  drawBox(MAP_X - 1, MAP_Y - 1, MAP_W + 2, MAP_H + 2, color.line);
  writeText(MAP_X, MAP_Y - 3, "DWARF FORTRESS LITE :: STRIKE THE EARTH", color.white);
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const style = tileStyle(game.map[y][x]);
      setCell(MAP_X + x, MAP_Y + y, style.ch, style.fg, style.bg);
    }
  }
  for (const mark of game.designations.slice(-20)) setCell(MAP_X + mark.x, MAP_Y + mark.y, "!", color.white);
  for (const dwarf of game.dwarves) {
    const fg = dwarf.pulse > 0 ? mixColor(color.white, color.yellow, dwarf.pulse) : color.white;
    setCell(MAP_X + dwarf.x, MAP_Y + dwarf.y, "d", fg, color.floor);
  }
  drawBox(MAP_X + game.cursor.x - 1, MAP_Y + game.cursor.y - 1, 3, 3, color.white);
}

function renderFx() {
  for (const fx of game.fx) {
    const t = clamp(fx.life / fx.maxLife, 0, 1);
    setCell(fx.x, fx.y, fx.ch, mixColor(color.bg2, fx.fg, t));
  }
}

function renderHud() {
  const x = 84;
  const y = 8;
  drawBox(x, y, 44, 58, color.line);
  writeText(x + 2, y + 2, "DWARF FORTRESS", color.white);
  writeText(x + 2, y + 4, `DAY ${String(game.day).padStart(3, "0")}  ${game.season}`, color.yellow);
  writeText(x + 2, y + 5, `MODE ${playMode.toUpperCase()}  SPD ${speed.toFixed(1)}X`, color.blue);
  if (paused) writeText(x + 2, y + 7, "PAUSED", color.red);
  if (game.alert > 0) writeText(x + 2, y + 8, "LOW STOCK WARNING", color.red);

  writeText(x + 2, y + 11, "STOCKS", color.white);
  writeText(x + 2, y + 13, `FOOD  ${String(game.resources.food).padStart(3, "0")}`, color.green);
  writeText(x + 22, y + 13, `DRINK ${String(game.resources.drink).padStart(3, "0")}`, color.blue);
  writeText(x + 2, y + 15, `WOOD  ${String(game.resources.wood).padStart(3, "0")}`, color.yellow);
  writeText(x + 22, y + 15, `STONE ${String(game.resources.stone).padStart(3, "0")}`, color.muted);
  writeText(x + 2, y + 17, `ORE   ${String(game.resources.ore).padStart(3, "0")}`, color.violet);
  writeText(x + 22, y + 17, `CRAFT ${String(game.resources.crafts).padStart(3, "0")}`, color.orange);
  writeText(x + 2, y + 19, `WEALTH ${String(game.wealth).padStart(5, "0")}`, color.yellow);

  writeText(x + 2, y + 23, "DWARVES", color.white);
  for (let i = 0; i < game.dwarves.length; i += 1) {
    const dwarf = game.dwarves[i];
    const task = dwarf.task ? dwarf.task.kind.toUpperCase() : "IDLE";
    writeText(x + 2, y + 25 + i, `${dwarf.name.padEnd(6)} ${dwarf.role.padEnd(6)} ${task}`, dwarf.mood < 35 ? color.red : color.green);
  }

  writeText(x + 2, y + 35, "EVENTS", color.white);
  for (let i = 0; i < game.logs.length; i += 1) writeText(x + 2, y + 37 + i, game.logs[i], i === 0 ? color.green : color.muted);
  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS CURSOR    SPACE DESIGNATE    P PAUSE    R REROLL    , HOME", color.muted);
}

function composeScreen() {
  clearBuffer();
  renderBackground();
  renderMap();
  renderFx();
  renderHud();
}

function renderScreen() {
  ctx.fillStyle = color.page;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = buffer[y][x];
      ctx.fillStyle = cell.bg;
      ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
      if (cell.ch !== " ") {
        ctx.fillStyle = cell.fg;
        ctx.fillText(cell.ch, x * CELL_W, y * CELL_H + 1);
      }
    }
  }
}

function runFrame(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000 || 0);
  lastTime = now;
  accumulator += dt * speed;
  const step = 1 / 60;
  let guard = 0;
  while (accumulator >= step && guard < 8) {
    update(step);
    accumulator -= step;
    guard += 1;
  }
  composeScreen();
  renderScreen();
}

function frame(now) {
  runFrame(now);
  requestAnimationFrame(frame);
}

seedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  initGame(seedInput.value);
});

seedRandomButton.addEventListener("click", () => initGame(randomSeed()));

seedCopyButton.addEventListener("click", async () => {
  const text = padSeed(seedInput.value || activeSeed);
  seedInput.value = text.trimEnd();
  activeSeed = text;
  setStatus();
  try {
    await navigator.clipboard.writeText(text);
    setStatus("COPIED 100/100");
  } catch {
    setStatus("COPY BLOCKED");
  }
});

playModeInput.addEventListener("change", () => initGame(activeSeed));
difficultyInput.addEventListener("change", () => initGame(activeSeed));
seedInput.addEventListener("input", () => {
  seedInput.value = sanitizeSeed(seedInput.value);
  seedStatus.textContent = `LEN ${padSeed(seedInput.value).length}/${SEED_LEN}`;
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
  if (key === "1") speed = 0.5;
  if (key === "2") speed = 1;
  if (key === "3") speed = 2;
  if (key === "4") speed = 4;
  if (key === "p") paused = !paused;
  if (key === "r") initGame(randomSeed());
  if (key === HOME_KEY) window.location.href = "../index.html";
  if (playMode === "human") {
    if (key === "arrowleft" || key === "a") moveCursor(-1, 0);
    if (key === "arrowright" || key === "d") moveCursor(1, 0);
    if (key === "arrowup" || key === "w") moveCursor(0, -1);
    if (key === "arrowdown" || key === "s") moveCursor(0, 1);
    if (key === " " || key === "enter") designateCursor();
  }
});

initGame(randomSeed());
composeScreen();
renderScreen();
requestAnimationFrame(frame);
setInterval(() => {
  const now = performance.now();
  if (now - lastTime > 500) runFrame(now);
}, 250);
