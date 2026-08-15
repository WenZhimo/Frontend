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
const HOME_KEY = "'";
const MAP_W = 72;
const MAP_H = 50;
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
  floor: "#08121c",
  wall: "#172334",
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

const monsterTypes = [
  { ch: "g", name: "goblin", hp: 5, atk: 2, fg: color.green },
  { ch: "o", name: "orc", hp: 8, atk: 3, fg: color.orange },
  { ch: "b", name: "bat", hp: 4, atk: 2, fg: color.violet },
  { ch: "T", name: "troll", hp: 13, atk: 4, fg: color.red },
];

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

function isWalkable(x, y) {
  return inBounds(x, y) && game.map[y][x] !== "#";
}

function entityAt(x, y) {
  return game.monsters.find((monster) => monster.hp > 0 && monster.x === x && monster.y === y);
}

function itemAt(x, y) {
  return game.items.findIndex((item) => item.x === x && item.y === y);
}

function spawnBurst(x, y, fg, count = 10, force = 1) {
  const chars = [".", "·", ":", "*", "+", "✦", "×"];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const s = (0.45 + rng() * 1.4) * force;
    game.fx.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.7,
      life: 0.35 + rng() * 0.55,
      maxLife: 0.9,
      ch: chars[Math.floor(rng() * chars.length)],
      fg,
    });
  }
}

function logLine(text) {
  game.logs.unshift(text.slice(0, 40));
  game.logs = game.logs.slice(0, 10);
}

function carveRoom(map, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) map[y][x] = ".";
  }
}

function carveCorridor(map, a, b) {
  let x = a.x;
  let y = a.y;
  while (x !== b.x) {
    map[y][x] = ".";
    x += x < b.x ? 1 : -1;
  }
  while (y !== b.y) {
    map[y][x] = ".";
    y += y < b.y ? 1 : -1;
  }
  map[y][x] = ".";
}

function roomsOverlap(a, b) {
  return a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;
}

function randomFloor(rooms) {
  const room = rooms[Math.floor(rng() * rooms.length)];
  return {
    x: room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2)),
    y: room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2)),
  };
}

function generateDungeon() {
  const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => "#"));
  const rooms = [];
  const targetRooms = difficulty === "chaos" ? 12 : 10;
  for (let tries = 0; tries < 200 && rooms.length < targetRooms; tries += 1) {
    const room = {
      w: 7 + Math.floor(rng() * 10),
      h: 5 + Math.floor(rng() * 7),
      x: 2 + Math.floor(rng() * (MAP_W - 20)),
      y: 2 + Math.floor(rng() * (MAP_H - 14)),
    };
    if (rooms.some((other) => roomsOverlap(room, other))) continue;
    carveRoom(map, room);
    if (rooms.length > 0) carveCorridor(map, centerOf(rooms[rooms.length - 1]), centerOf(room));
    rooms.push(room);
  }
  return { map, rooms };
}

function centerOf(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

function initGame(seed) {
  activeSeed = padSeed(seed || randomSeed());
  seedInput.value = activeSeed.trimEnd();
  rng = mulberry32(hashSeed(activeSeed));
  playMode = playModeInput.value;
  difficulty = difficultyInput.value;
  paused = false;
  accumulator = 0;
  const dungeon = generateDungeon();
  const start = centerOf(dungeon.rooms[0]);
  const stair = centerOf(dungeon.rooms[dungeon.rooms.length - 1]);
  dungeon.map[stair.y][stair.x] = ">";
  const monsterCount = difficulty === "chaos" ? 20 : difficulty === "fast" ? 10 : 14;
  const itemCount = difficulty === "chaos" ? 12 : 9;
  game = {
    ...dungeon,
    player: { x: start.x, y: start.y, hp: 30, maxHp: 30, atk: 5, level: 1, xp: 0, gold: 0 },
    stair,
    monsters: [],
    items: [],
    visible: Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => false)),
    explored: Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => false)),
    fx: [],
    logs: [">WELCOME TO TERMINAL NETHACK", `>${playMode.toUpperCase()} / ${difficulty.toUpperCase()}`],
    turns: 0,
    aiTimer: difficulty === "fast" ? 0.18 : difficulty === "chaos" ? 0.11 : 0.32,
    message: "FIND THE STAIRS",
    messagePulse: 1,
    done: false,
    shake: 0,
  };
  for (let i = 0; i < monsterCount; i += 1) {
    const pos = randomFloor(dungeon.rooms.slice(1));
    if (Math.abs(pos.x - start.x) + Math.abs(pos.y - start.y) < 10 || entityAt(pos.x, pos.y)) continue;
    const type = monsterTypes[Math.floor(rng() * monsterTypes.length)];
    game.monsters.push({ ...type, x: pos.x, y: pos.y, hp: type.hp, maxHp: type.hp });
  }
  for (let i = 0; i < itemCount; i += 1) {
    const pos = randomFloor(dungeon.rooms);
    if (entityAt(pos.x, pos.y) || itemAt(pos.x, pos.y) >= 0) continue;
    const roll = rng();
    game.items.push({ x: pos.x, y: pos.y, ch: roll < 0.45 ? "!" : roll < 0.75 ? "$" : "?", name: roll < 0.45 ? "potion" : roll < 0.75 ? "gold" : "scroll" });
  }
  updateFov();
  setStatus();
}

function lineClear(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 120; guard += 1) {
    if (x === x1 && y === y1) return true;
    if ((x !== x0 || y !== y0) && game.map[y][x] === "#") return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return false;
}

function updateFov() {
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) game.visible[y][x] = false;
  const radius = 9;
  for (let y = game.player.y - radius; y <= game.player.y + radius; y += 1) {
    for (let x = game.player.x - radius; x <= game.player.x + radius; x += 1) {
      if (!inBounds(x, y)) continue;
      const d = Math.hypot(x - game.player.x, y - game.player.y);
      if (d <= radius && lineClear(game.player.x, game.player.y, x, y)) {
        game.visible[y][x] = true;
        game.explored[y][x] = true;
      }
    }
  }
}

function attackMonster(monster) {
  const dmg = 2 + Math.floor(rng() * game.player.atk);
  monster.hp -= dmg;
  game.turns += 1;
  game.message = `YOU HIT ${monster.name.toUpperCase()} -${dmg}`;
  game.messagePulse = 0.6;
  spawnBurst(monster.x + MAP_X, monster.y + MAP_Y, color.red, 16, 1.1);
  logLine(`>@ hits ${monster.name} for ${dmg}`);
  if (monster.hp <= 0) {
    game.player.xp += monster.maxHp;
    logLine(`>${monster.name} dies`);
    if (game.player.xp >= game.player.level * 18) {
      game.player.level += 1;
      game.player.maxHp += 5;
      game.player.hp = game.player.maxHp;
      game.player.atk += 1;
      logLine(">you feel more experienced");
    }
  } else {
    monstersTurn();
  }
}

function pickItem() {
  const index = itemAt(game.player.x, game.player.y);
  if (index < 0) return;
  const item = game.items.splice(index, 1)[0];
  if (item.ch === "!") {
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 10);
    logLine(">you drink a potion");
  } else if (item.ch === "$") {
    const gold = 12 + Math.floor(rng() * 40);
    game.player.gold += gold;
    logLine(`>you collect ${gold} gold`);
  } else {
    game.player.atk += 1;
    logLine(">scroll sharpens your weapon");
  }
  spawnBurst(game.player.x + MAP_X, game.player.y + MAP_Y, color.green, 18, 1.1);
}

function tryMove(dx, dy, source = "MOVE") {
  if (game.done) return;
  const nx = game.player.x + dx;
  const ny = game.player.y + dy;
  const monster = entityAt(nx, ny);
  if (monster) {
    attackMonster(monster);
    updateFov();
    return;
  }
  if (!isWalkable(nx, ny)) {
    game.message = "BUMP";
    game.messagePulse = 0.4;
    game.shake = 0.06;
    return;
  }
  game.player.x = nx;
  game.player.y = ny;
  game.turns += 1;
  game.message = source;
  game.messagePulse = 0.35;
  spawnBurst(nx + MAP_X, ny + MAP_Y, color.blue, 4, 0.35);
  pickItem();
  if (game.map[ny][nx] === ">") {
    game.done = true;
    game.message = "YOU DESCEND";
    game.messagePulse = 2;
    logLine(">you find the next dungeon");
    spawnBurst(nx + MAP_X, ny + MAP_Y, color.violet, 80, 1.8);
  } else {
    monstersTurn();
  }
  updateFov();
}

function moveMonster(monster, dx, dy) {
  const nx = monster.x + dx;
  const ny = monster.y + dy;
  if (nx === game.player.x && ny === game.player.y) {
    const dmg = 1 + Math.floor(rng() * monster.atk);
    game.player.hp -= dmg;
    game.shake = 0.12;
    game.message = `${monster.name.toUpperCase()} HITS -${dmg}`;
    game.messagePulse = 0.6;
    logLine(`>${monster.name} hits you for ${dmg}`);
    spawnBurst(game.player.x + MAP_X, game.player.y + MAP_Y, color.red, 14, 1);
    if (game.player.hp <= 0) {
      game.player.hp = 0;
      game.done = true;
      game.message = "YOU DIED";
      logLine(">you die...");
    }
    return;
  }
  if (isWalkable(nx, ny) && !entityAt(nx, ny)) {
    monster.x = nx;
    monster.y = ny;
  }
}

function monstersTurn() {
  for (const monster of game.monsters) {
    if (monster.hp <= 0) continue;
    const dist = Math.abs(monster.x - game.player.x) + Math.abs(monster.y - game.player.y);
    if (dist <= 1) {
      moveMonster(monster, Math.sign(game.player.x - monster.x), Math.sign(game.player.y - monster.y));
    } else if (dist < 9 && rng() < 0.75) {
      const dx = Math.sign(game.player.x - monster.x);
      const dy = Math.sign(game.player.y - monster.y);
      if (Math.abs(game.player.x - monster.x) > Math.abs(game.player.y - monster.y)) moveMonster(monster, dx, 0);
      else moveMonster(monster, 0, dy);
    } else if (rng() < 0.25) {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const dir = dirs[Math.floor(rng() * dirs.length)];
      moveMonster(monster, dir[0], dir[1]);
    }
  }
  game.monsters = game.monsters.filter((monster) => monster.hp > 0);
}

function bfsTarget(predicate) {
  const startKey = `${game.player.x},${game.player.y}`;
  const queue = [{ x: game.player.x, y: game.player.y, first: null }];
  const seen = new Set([startKey]);
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  let head = 0;
  while (head < queue.length && head < 2500) {
    const node = queue[head++];
    if (predicate(node.x, node.y) && node.first) return node.first;
    for (const dir of dirs) {
      const nx = node.x + dir.dx;
      const ny = node.y + dir.dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !isWalkable(nx, ny) || entityAt(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny, first: node.first || dir });
    }
  }
  return null;
}

function chooseAiMove() {
  const adjacent = game.monsters.find((monster) => monster.hp > 0 && Math.abs(monster.x - game.player.x) + Math.abs(monster.y - game.player.y) === 1);
  if (adjacent) return { dx: Math.sign(adjacent.x - game.player.x), dy: Math.sign(adjacent.y - game.player.y) };
  const visibleItem = bfsTarget((x, y) => itemAt(x, y) >= 0 && game.visible[y][x]);
  if (visibleItem) return visibleItem;
  const visibleMonster = bfsTarget((x, y) => entityAt(x, y) && game.visible[y][x]);
  if (visibleMonster) return visibleMonster;
  const unexplored = bfsTarget((x, y) => !game.explored[y][x]);
  if (unexplored) return unexplored;
  return bfsTarget((x, y) => game.map[y][x] === ">") || { dx: 0, dy: 0 };
}

function updateAI(dt) {
  if (playMode !== "demo" || game.done) return;
  game.aiTimer -= dt;
  if (game.aiTimer > 0) return;
  const move = chooseAiMove();
  if (move && (move.dx || move.dy)) tryMove(move.dx, move.dy, "AUTO EXPLORE");
  game.aiTimer = (difficulty === "fast" ? 0.12 : difficulty === "chaos" ? 0.08 : 0.22) + rng() * 0.08;
}

function updateFx(dt) {
  for (const fx of game.fx) {
    fx.life -= dt;
    fx.x += fx.vx * dt * 10;
    fx.y += fx.vy * dt * 10;
    fx.vy += dt * 2.5;
  }
  game.fx = game.fx.filter((fx) => fx.life > 0);
  game.messagePulse = Math.max(0, game.messagePulse - dt);
  game.shake = Math.max(0, game.shake - dt);
}

function update(dt) {
  if (!game || paused) return;
  updateAI(dt);
  updateFx(dt);
}

function directionForKey(key) {
  if (key === "arrowleft" || key === "a") return { dx: -1, dy: 0 };
  if (key === "arrowright" || key === "d") return { dx: 1, dy: 0 };
  if (key === "arrowup" || key === "w") return { dx: 0, dy: -1 };
  if (key === "arrowdown" || key === "s") return { dx: 0, dy: 1 };
  return null;
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

function renderMap() {
  drawBox(MAP_X - 1, MAP_Y - 1, MAP_W + 2, MAP_H + 2, color.line);
  writeText(MAP_X, MAP_Y - 3, "NETHACK LITE :: DUNGEON LEVEL 01", color.white);
  const ox = game.shake > 0 ? Math.round((rng() - 0.5) * 2) : 0;
  const oy = game.shake > 0 ? Math.round((rng() - 0.5) * 2) : 0;
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      if (!game.explored[y][x]) continue;
      const visible = game.visible[y][x];
      const tile = game.map[y][x];
      const fg = visible ? (tile === "#" ? color.lineDim : tile === ">" ? color.violet : color.muted) : color.lineDim;
      const bg = visible ? (tile === "#" ? color.wall : color.floor) : color.bg2;
      setCell(MAP_X + x + ox, MAP_Y + y + oy, tile === "#" ? "▓" : tile, fg, bg);
    }
  }
  for (const item of game.items) {
    if (game.visible[item.y][item.x]) {
      const fg = item.ch === "!" ? color.green : item.ch === "$" ? color.yellow : color.blue;
      setCell(MAP_X + item.x + ox, MAP_Y + item.y + oy, item.ch, fg, color.floor);
    }
  }
  for (const monster of game.monsters) {
    if (game.visible[monster.y][monster.x]) setCell(MAP_X + monster.x + ox, MAP_Y + monster.y + oy, monster.ch, monster.fg, color.floor);
  }
  setCell(MAP_X + game.player.x + ox, MAP_Y + game.player.y + oy, "@", color.white, color.floor);
}

function renderFx() {
  for (const fx of game.fx) {
    const t = clamp(fx.life / fx.maxLife, 0, 1);
    setCell(fx.x, fx.y, fx.ch, mixColor(color.bg2, fx.fg, t));
  }
}

function renderHud() {
  const x = 82;
  const y = 8;
  drawBox(x, y, 46, 58, color.line);
  writeText(x + 2, y + 2, "NETHACK LITE", color.white);
  writeText(x + 2, y + 4, `HP ${String(game.player.hp).padStart(2, "0")}/${String(game.player.maxHp).padStart(2, "0")}`, game.player.hp < 10 ? color.red : color.green);
  writeText(x + 17, y + 4, `LV ${game.player.level}`, color.yellow);
  writeText(x + 25, y + 4, `ATK ${game.player.atk}`, color.blue);
  writeText(x + 2, y + 6, `XP ${String(game.player.xp).padStart(3, "0")}  GOLD ${String(game.player.gold).padStart(3, "0")}`, color.yellow);
  writeText(x + 2, y + 8, `TURN ${String(game.turns).padStart(4, "0")}`, color.muted);
  writeText(x + 2, y + 9, `MODE ${playMode.toUpperCase()}  SPD ${speed.toFixed(1)}X`, color.blue);
  if (paused) writeText(x + 2, y + 11, "PAUSED", color.red);
  if (game.done) writeText(x + 2, y + 12, game.player.hp <= 0 ? "DEAD" : "STAIRS FOUND", game.player.hp <= 0 ? color.red : color.green);

  writeText(x + 2, y + 16, "VISIBLE", color.white);
  const visibleMonsters = game.monsters.filter((monster) => game.visible[monster.y][monster.x]).slice(0, 5);
  for (let i = 0; i < visibleMonsters.length; i += 1) {
    const monster = visibleMonsters[i];
    writeText(x + 2, y + 18 + i, `${monster.ch} ${monster.name.toUpperCase()} ${monster.hp}/${monster.maxHp}`, monster.fg);
  }

  writeText(x + 2, y + 26, "EVENT", color.white);
  writeText(x + 2, y + 28, game.message.slice(0, 38), game.messagePulse > 0 ? color.red : color.muted);
  writeText(x + 2, y + 33, "LOG", color.white);
  for (let i = 0; i < game.logs.length; i += 1) writeText(x + 2, y + 35 + i, game.logs[i], i === 0 ? color.green : color.muted);

  writeText(4, 73, "1 0.5X   2 1X   3 2X   4 4X    WASD/ARROWS MOVE/ATTACK    P PAUSE    R REROLL    ' HOME", color.muted);
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
  if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) event.preventDefault();
  if (key === "1") speed = 0.5;
  if (key === "2") speed = 1;
  if (key === "3") speed = 2;
  if (key === "4") speed = 4;
  if (key === "p") paused = !paused;
  if (key === "r") initGame(randomSeed());
  if (key === HOME_KEY) window.location.href = "../index.html";
  if (playMode === "human") {
    const dir = directionForKey(key);
    if (dir) tryMove(dir.dx, dir.dy, "MOVE");
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
