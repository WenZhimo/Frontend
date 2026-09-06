import { makeRng, dist } from './util.js';

export const TILE = 34;

export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_FURNITURE = 2; // mid-room: you see and shoot over it, you don't walk through
export const T_WINDOW = 4;    // set into a wall: see and shoot through, don't walk through
export const T_DOOR = 3;      // always walkable; blocks sight and bullets until it swings

// ---------------------------------------------------------------------------
// floor generation: scatter non-overlapping rooms, connect with L corridors,
// then drop cover, enemies and weapons into the rooms that aren't the entrance.
// ---------------------------------------------------------------------------

export function makeLevel(seed, floorNum) {
  const rng = makeRng(seed);

  const gw = Math.min(58, 36 + Math.floor(floorNum * 1.2));
  const gh = Math.min(44, 28 + Math.floor(floorNum * 0.9));
  const tiles = new Uint8Array(gw * gh).fill(T_WALL);

  const at = (x, y) => y * gw + x;
  const rooms = [];
  const targetRooms = Math.min(12, 6 + Math.floor(floorNum * 0.6));

  for (let tries = 0; tries < 900 && rooms.length < targetRooms; tries++) {
    const rw = rng.int(5, 11);
    const rh = rng.int(5, 9);
    const rx = rng.int(2, gw - rw - 3);
    const ry = rng.int(2, gh - rh - 3);
    const r = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };

    let clash = false;
    for (const o of rooms) {
      if (rx < o.x + o.w + 2 && rx + rw + 2 > o.x && ry < o.y + o.h + 2 && ry + rh + 2 > o.y) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) tiles[at(x, y)] = T_FLOOR;
    rooms.push(r);
  }

  // connect each room to the previous one, plus one extra loop so the map
  // isn't a pure tree — loops make flanking possible.
  const carveH = (x0, x1, y) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      tiles[at(x, y)] = T_FLOOR;
      tiles[at(x, y + 1)] = T_FLOOR;
    }
  };
  const carveV = (y0, y1, x) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      tiles[at(x, y)] = T_FLOOR;
      tiles[at(x + 1, y)] = T_FLOOR;
    }
  };

  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    if (rng.chance(0.5)) { carveH(a.cx, b.cx, a.cy); carveV(a.cy, b.cy, b.cx); }
    else { carveV(a.cy, b.cy, a.cx); carveH(a.cx, b.cx, b.cy); }
  }
  if (rooms.length > 3) {
    const a = rooms[0], b = rooms[rooms.length - 1];
    carveH(a.cx, b.cx, b.cy); carveV(a.cy, b.cy, a.cx);
  }

  // hard border
  for (let x = 0; x < gw; x++) { tiles[at(x, 0)] = T_WALL; tiles[at(x, gh - 1)] = T_WALL; }
  for (let y = 0; y < gh; y++) { tiles[at(0, y)] = T_WALL; tiles[at(gw - 1, y)] = T_WALL; }

  // entrance = first room, exit = the room furthest from it
  const start = rooms[0];
  let exitRoom = rooms[rooms.length - 1];
  let best = -1;
  for (const r of rooms) {
    const d = dist(r.cx, r.cy, start.cx, start.cy);
    if (d > best) { best = d; exitRoom = r; }
  }

  // furniture sits in the middle of rooms — it is something to shoot over and
  // break line of movement, never line of sight.
  for (const r of rooms) {
    const n = rng.int(0, 3);
    for (let i = 0; i < n; i++) {
      const cw = rng.int(1, 3), ch = rng.int(1, 2);
      const cx = rng.int(r.x + 1, r.x + r.w - cw - 1);
      const cy = rng.int(r.y + 1, r.y + r.h - ch - 1);
      for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) tiles[at(x, y)] = T_FURNITURE;
    }
  }
  // spawn and exit tiles must stay walkable — cover is placed after room choice
  tiles[at(start.cx, start.cy)] = T_FLOOR;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    tiles[at(exitRoom.cx + dx, exitRoom.cy + dy)] = T_FLOOR;
  }

  // ---- connectivity repair --------------------------------------------------
  // cover blocks can seal a room's only doorway, which used to strand the exit.
  // flood from the spawn and re-carve to anything the flood didn't reach.
  const floodFromSpawn = () => {
    const seen = new Uint8Array(gw * gh);
    const q = [at(start.cx, start.cy)];
    seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = c % gw, cy = (c / gw) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [ox, oy] of nb) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (seen[ni] || tiles[ni] !== T_FLOOR) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    return seen;
  };
  const roomReached = (r, seen) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) if (seen[y * gw + x]) return true;
    }
    return false;
  };
  for (let pass = 0; pass < 6; pass++) {
    const seen = floodFromSpawn();
    const stranded = rooms.filter((r) => !roomReached(r, seen));
    if (!stranded.length) break;
    for (const r of stranded) {
      let best = start, bd = Infinity;
      for (const o of rooms) {
        if (o === r || !roomReached(o, seen)) continue;
        const d = dist(r.cx, r.cy, o.cx, o.cy);
        if (d < bd) { bd = d; best = o; }
      }
      carveH(r.cx, best.cx, r.cy);
      carveV(r.cy, best.cy, best.cx);
    }
  }

  const toWorld = (gx, gy) => ({ x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE });

  // ---- doors ----------------------------------------------------------------
  // A door belongs on a threshold, not on every open tile of a room's wall ring.
  // A run of floor tiles in that ring qualifies only if it is a narrow pinch with
  // wall on both sides, and it opens onto somewhere on the far side. Otherwise it
  // is a corridor running alongside the room, and hallways should not be doors.
  const doors = [];
  const doorAt = new Map();
  const walkable = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
    const t = tiles[at(gx, gy)];
    return t === T_FLOOR || t === T_DOOR;
  };
  const addDoor = (gx, gy, horiz, hinge) => {
    const i = at(gx, gy);
    if (doorAt.has(i) || tiles[i] !== T_FLOOR) return;
    tiles[i] = T_DOOR;
    const p = toWorld(gx, gy);
    const d = { gx, gy, i, x: p.x, y: p.y, horiz, hinge, open: 0, slam: 0 };
    doors.push(d);
    doorAt.set(i, d);
  };

  const edges = [];
  for (const r of rooms) {
    edges.push({ fixed: r.y - 1, from: r.x, to: r.x + r.w - 1, vert: false, out: -1 });
    edges.push({ fixed: r.y + r.h, from: r.x, to: r.x + r.w - 1, vert: false, out: 1 });
    edges.push({ fixed: r.x - 1, from: r.y, to: r.y + r.h - 1, vert: true, out: -1 });
    edges.push({ fixed: r.x + r.w, from: r.y, to: r.y + r.h - 1, vert: true, out: 1 });
  }

  // windows: wall tiles in a room's ring that happen to back onto open ground,
  // which is exactly where a corridor hugs a room. glass in a wall, not in the
  // middle of the floor.
  const windows = [];
  const windowAt = new Map();
  let windowBudget = 4 + rng.int(0, 4);
  for (const e of edges) {
    const ox = e.vert ? e.out : 0, oy = e.vert ? 0 : e.out;
    let wrun = null;
    const flushWindow = () => {
      if (!wrun) return;
      const len = wrun.b - wrun.a + 1;
      if (len >= 1 && len <= 6 && windowBudget > 0 && rng.chance(0.85)) {
        windowBudget--;
        for (let v = wrun.a; v <= wrun.b; v++) {
          const gx = e.vert ? e.fixed : v, gy = e.vert ? v : e.fixed;
          const i = at(gx, gy);
          tiles[i] = T_WINDOW;
          const p = toWorld(gx, gy);
          const win = { gx, gy, i, x: p.x, y: p.y, horiz: !e.vert, broken: false };
          windows.push(win);
          windowAt.set(i, win);
        }
      }
      wrun = null;
    };
    for (let v = e.from; v <= e.to; v++) {
      const gx = e.vert ? e.fixed : v, gy = e.vert ? v : e.fixed;
      const inB = gx >= 0 && gy >= 0 && gx < gw && gy < gh;
      const isWall = inB && tiles[at(gx, gy)] === T_WALL;
      const openOut = isWall && walkable(gx + ox, gy + oy);
      const openIn = isWall && walkable(gx - ox, gy - oy);
      if (openOut && openIn) { if (!wrun) wrun = { a: v, b: v }; else wrun.b = v; }
      else flushWindow();
    }
    flushWindow();
  }

  for (const e of edges) {
    let run = null;
    const tileOf = (v) => (e.vert ? { gx: e.fixed, gy: v } : { gx: v, gy: e.fixed });
    const flush = () => {
      if (!run) return;
      const len = run.b - run.a + 1;
      // strictly inside the edge => wall on both sides along the ring: a real pinch
      const pinched = run.a > e.from && run.b < e.to;
      if (len <= 2 && pinched) {
        const ox = e.vert ? e.out : 0, oy = e.vert ? 0 : e.out;
        let leadsOut = false, leadsIn = false;
        for (let v = run.a; v <= run.b; v++) {
          const { gx, gy } = tileOf(v);
          if (walkable(gx + ox, gy + oy)) leadsOut = true;
          if (walkable(gx - ox, gy - oy)) leadsIn = true;
        }
        if (leadsOut && leadsIn) {
          for (let v = run.a; v <= run.b; v++) {
            const { gx, gy } = tileOf(v);
            // a pair hinges at its outer ends so the leaves part in the middle
            const hinge = len > 1 && v === run.b ? 1 : -1;
            addDoor(gx, gy, !e.vert, hinge);
          }
        }
      }
      run = null;
    };
    for (let v = e.from; v <= e.to; v++) {
      const { gx, gy } = tileOf(v);
      const open = gx >= 0 && gy >= 0 && gx < gw && gy < gh && tiles[at(gx, gy)] === T_FLOOR;
      if (open) { if (!run) run = { a: v, b: v }; else run.b = v; }
      else flush();
    }
    flush();
  }

  // ---- population -----------------------------------------------------------
  const enemySpawns = [];
  const pickupSpawns = [];
  const count = Math.min(30, 4 + Math.round(floorNum * 1.7));
  const pool = rooms.filter((r) => r !== start);
  if (pool.length === 0) pool.push(start);

  const freeSpot = (r) => {
    for (let i = 0; i < 30; i++) {
      const gx = rng.int(r.x, r.x + r.w - 1);
      const gy = rng.int(r.y, r.y + r.h - 1);
      if (tiles[at(gx, gy)] === T_FLOOR) return toWorld(gx, gy);
    }
    return toWorld(r.cx, r.cy);
  };

  const spawnPoint = toWorld(start.cx, start.cy);
  const sightClear = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const gx = ((a.x + dx * t) / TILE) | 0;
      const gy = ((a.y + dy * t) / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
      const tile = tiles[at(gx, gy)];
      if (tile === T_WALL || tile === T_DOOR) return false;
    }
    return true;
  };
  const safeFromSpawn = (p) => {
    const d = dist(p.x, p.y, spawnPoint.x, spawnPoint.y);
    if (d < 190) return false;
    return d > 460 || !sightClear(p, spawnPoint);
  };
  const enemySpot = (slot) => {
    let bestP = null, bestScore = -Infinity;
    for (let tries = 0; tries < 72; tries++) {
      const r = pool[(slot * 5 + tries + rng.int(0, Math.min(2, pool.length - 1))) % pool.length];
      const p = freeSpot(r);
      const clear = sightClear(p, spawnPoint);
      const d = dist(p.x, p.y, spawnPoint.x, spawnPoint.y);
      const score = d + (clear ? -260 : 160);
      if (score > bestScore) { bestScore = score; bestP = p; }
      if (safeFromSpawn(p)) return p;
    }
    return bestP || freeSpot(pool[slot % pool.length]);
  };
  const spawnSafeAngle = (p) => {
    const a = Math.atan2(p.y - spawnPoint.y, p.x - spawnPoint.x);
    return a + rng.range(-0.55, 0.55);
  };

  for (let i = 0; i < count; i++) {
    const p = enemySpot(i);
    // type mix drifts toward gunners, hounds and shields as floors climb
    const roll = rng();
    let type = 'thug';
    const gunnerP = Math.min(0.40, 0.1 + floorNum * 0.033);
    const houndP = Math.min(0.26, floorNum < 2 ? 0 : 0.06 + floorNum * 0.02);
    const shieldP = Math.min(0.20, floorNum < 2 ? 0 : 0.05 + floorNum * 0.02);
    const patrolP = Math.min(0.18, floorNum < 2 ? 0.04 : 0.06 + floorNum * 0.012);
    if (roll < gunnerP) type = 'gunner';
    else if (roll < gunnerP + houndP) type = 'hound';
    else if (roll < gunnerP + houndP + shieldP) type = 'shield';
    else if (roll < gunnerP + houndP + shieldP + patrolP) type = 'patroller';

    // weapon is fixed by the seed so a reprint is the same fight, not a new one
    let weapon = 'fists';
    if (type === 'thug') weapon = rng.pick(['bat', 'bat', 'knife', 'fists', 'shield']);
    else if (type === 'shield') weapon = rng.pick(['shield', 'shield', 'bat', 'pistol']);
    else if (type === 'patroller') {
      weapon = floorNum < 4
        ? rng.pick(['bat', 'knife', 'pistol'])
        : rng.pick(['knife', 'pistol', 'pistol', 'smg', 'shield']);
    }
    else if (type === 'gunner') {
      weapon = floorNum < 3
        ? rng.pick(['pistol', 'pistol', 'smg', 'shield'])
        : rng.pick(['pistol', 'smg', 'smg', 'ripper', 'shotgun', 'revolver', 'shield']);
    }
    // Armour plates: the difficulty dial. Ordinary bodies start picking up a
    // plate or two deeper in; shield types are the heavies and scale toward
    // boss-class rings on the last floors.
    let armour = 0;
    if (type === 'shield') {
      armour = Math.min(11, 3 + Math.floor(floorNum / 2.5) + rng.int(0, 1));
      if (floorNum >= 8 && rng.chance(0.12)) armour = Math.min(13, armour + rng.int(2, 4));
    } else if (floorNum >= 3 && rng.chance(Math.min(0.34, (floorNum - 2) * 0.055))) {
      armour = rng.int(1, 2);
    }
    const angle = sightClear(p, spawnPoint) ? spawnSafeAngle(p) : rng.range(0, Math.PI * 2);
    enemySpawns.push({ x: p.x, y: p.y, type, weapon, armour, angle });
  }

  const weaponCount = Math.max(2, Math.round(count * 0.45));
  for (let i = 0; i < weaponCount; i++) {
    const r = pool[(i * 3 + 1) % pool.length];
    const p = freeSpot(r);
    const kinds = floorNum < 3
      ? ['bat', 'knife', 'katana', 'quixote', 'pistol', 'pistol', 'smg', 'grenade', 'sentryPack', 'molotov', 'dart', 'tameDart', 'disguise', 'shield', 'shield', 'shield']
      : ['bat', 'knife', 'knife', 'katana', 'katana', 'quixote', 'pistol', 'pistol', 'revolver', 'smg', 'smg', 'ripper', 'shotgun', 'grenade', 'grenade', 'frag', 'flash', 'sentryPack', 'dronePack', 'rocket', 'molotov', 'molotov', 'dart', 'tameDart', 'disguise', 'sniper', 'laser', 'butcher', 'shield', 'shield', 'shield', 'shield'];
    pickupSpawns.push({ x: p.x, y: p.y, kind: rng.pick(kinds) });
  }

  return {
    gw, gh, tiles, doors, doorAt, windows, windowAt,
    w: gw * TILE, h: gh * TILE,
    rooms,
    spawn: toWorld(start.cx, start.cy),
    exit: toWorld(exitRoom.cx, exitRoom.cy),
    enemySpawns,
    pickupSpawns,
    solidAt(x, y) {
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
      const t = tiles[gy * gw + gx];
      return t === T_WALL || t === T_FURNITURE || t === T_WINDOW;
    },
    doorAtPoint(x, y) {
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return null;
      const i = gy * gw + gx;
      if (tiles[i] !== T_DOOR) return null;
      return doorAt.get(i) || null;
    },
    // a pane still standing at this point, or null
    windowAtPoint(x, y) {
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return null;
      const i = gy * gw + gx;
      if (tiles[i] !== T_WINDOW) return null;
      return windowAt.get(i) || null;
    },
    breakWindow(win) {
      if (!win || win.broken) return false;
      win.broken = true;
      tiles[win.i] = T_FLOOR;   // glass gone: everyone can walk it now
      return true;
    },
    resetWindows() {
      for (const w of windows) { w.broken = false; tiles[w.i] = T_WINDOW; }
    },
    walkableTile(gx, gy) {
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
      const t = tiles[gy * gw + gx];
      return t === T_FLOOR || t === T_DOOR;
    },
    sightBlockedAt(x, y) {
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
      const i = gy * gw + gx;
      const t = tiles[i];
      if (t === T_WALL) return true;
      if (t === T_DOOR) { const d = doorAt.get(i); return d ? d.open < 0.45 : false; }
      return false;
    },
    bulletBlockedAt(x, y) {
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
      const i = gy * gw + gx;
      const t = tiles[i];
      if (t === T_WALL) return true;
      if (t === T_DOOR) { const d = doorAt.get(i); return d ? d.open < 0.45 : false; }
      return false;
    },
  };
}

function makeStaticLevel(seed, kind = 'arena', mode = 'practice', enemyKind = 'strawman') {
  const rng = makeRng(seed);
  const gw = mode === 'defense' ? 46 : 34;
  const gh = mode === 'defense' ? 32 : 24;
  const tiles = new Uint8Array(gw * gh).fill(T_FLOOR);
  const at = (x, y) => y * gw + x;
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < gw && y < gh) tiles[at(x, y)] = t; };
  const toWorld = (gx, gy) => ({ x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE });
  let rooms = [];
  let roomIndex = null;
  let spawn = null;
  let exit = null;
  let spawnPoints = [];

  for (let x = 0; x < gw; x++) { set(x, 0, T_WALL); set(x, gh - 1, T_WALL); }
  for (let y = 0; y < gh; y++) { set(0, y, T_WALL); set(gw - 1, y, T_WALL); }

  if (mode === 'defense') {
    tiles.fill(T_WALL);
    roomIndex = new Int16Array(gw * gh);
    roomIndex.fill(-1);
    const inside = (x, y) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1;
    const carve = (x, y, room = -1) => {
      if (!inside(x, y)) return;
      tiles[at(x, y)] = T_FLOOR;
      if (room >= 0) roomIndex[at(x, y)] = room;
    };
    const canPlaceRoom = (r) => {
      if (r.x < 1 || r.y < 1 || r.x + r.w >= gw - 1 || r.y + r.h >= gh - 1) return false;
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          if (x < 0 || y < 0 || x >= gw || y >= gh) return false;
          if (tiles[at(x, y)] !== T_WALL) return false;
        }
      }
      return true;
    };
    const addRoom = (r, safe = false) => {
      r.id = rooms.length;
      r.cx = r.x + (r.w >> 1);
      r.cy = r.y + (r.h >> 1);
      r.safe = safe;
      rooms.push(r);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y, r.id);
      return r;
    };
    const cx = (gw / 2) | 0, cy = (gh / 2) | 0;
    const startRoom = addRoom({ x: cx - 3, y: cy - 3, w: 7, h: 7 }, true);
    const targetRooms = 15;
    for (let tries = 0; tries < 420 && rooms.length < targetRooms; tries++) {
      const rw = rng.int(5, 10);
      const rh = rng.int(5, 9);
      const rx = rng.int(1, gw - rw - 2);
      const ry = rng.int(1, gh - rh - 2);
      const r = { x: rx, y: ry, w: rw, h: rh };
      if (canPlaceRoom(r)) addRoom(r);
    }
    const carveH = (x0, x1, y) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) carve(x, y);
    };
    const carveV = (y0, y1, x) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) carve(x, y);
    };
    const carveRoute = (a, b) => {
      if (rng.chance(0.5)) { carveH(a.cx, b.cx, a.cy); carveV(a.cy, b.cy, b.cx); }
      else { carveV(a.cy, b.cy, a.cx); carveH(a.cx, b.cx, b.cy); }
    };
    const linked = [startRoom];
    const remaining = rooms.filter((r) => r !== startRoom);
    while (remaining.length) {
      let bestI = 0, bestFrom = linked[0], bd = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        for (const from of linked) {
          const d = dist(remaining[i].cx, remaining[i].cy, from.cx, from.cy);
          if (d < bd) { bd = d; bestI = i; bestFrom = from; }
        }
      }
      const next = remaining.splice(bestI, 1)[0];
      carveRoute(bestFrom, next);
      linked.push(next);
    }
    const loopBudget = Math.max(2, Math.floor(rooms.length * 0.22));
    const looped = new Set();
    for (let n = 0; n < loopBudget; n++) {
      let best = null, bd = Infinity;
      for (let tries = 0; tries < 36; tries++) {
        const a = rng.pick(rooms), b = rng.pick(rooms);
        if (!a || !b || a === b || a.safe || b.safe) continue;
        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (looped.has(key)) continue;
        const d = dist(a.cx, a.cy, b.cx, b.cy);
        if (d < 8 || d > 25) continue;
        if (d < bd) { bd = d; best = { a, b, key }; }
      }
      if (best) {
        looped.add(best.key);
        carveRoute(best.a, best.b);
      }
    }
    // A few connector punches borrow the "regional connector" idea from the
    // reference generator: enough alternate routes for combat, not an open grid.
    for (let tries = 0, opened = 0; tries < 220 && opened < 18; tries++) {
      const x = rng.int(2, gw - 3), y = rng.int(2, gh - 3);
      if (tiles[at(x, y)] !== T_WALL) continue;
      const lr = tiles[at(x - 1, y)] === T_FLOOR && tiles[at(x + 1, y)] === T_FLOOR;
      const ud = tiles[at(x, y - 1)] === T_FLOOR && tiles[at(x, y + 1)] === T_FLOOR;
      const openSides = (tiles[at(x - 1, y)] === T_FLOOR ? 1 : 0) + (tiles[at(x + 1, y)] === T_FLOOR ? 1 : 0)
        + (tiles[at(x, y - 1)] === T_FLOOR ? 1 : 0) + (tiles[at(x, y + 1)] === T_FLOOR ? 1 : 0);
      if ((lr || ud) && openSides <= 2 && rng.chance(0.34)) { carve(x, y); opened++; }
    }
    spawn = toWorld(startRoom.cx, startRoom.cy);
    exit = spawn;
    spawnPoints = rooms
      .filter((r) => !r.safe)
      .map((r) => ({ ...toWorld(r.cx, r.cy), room: r.id }));
  } else if (kind === 'lanes') {
    for (let x = 7; x < gw - 5; x += 7) {
      for (let y = 3; y < gh - 3; y++) if (y % 7 > 1) set(x, y, T_WALL);
    }
  } else if (kind === 'cover') {
    const cx = (gw / 2) | 0, cy = (gh / 2) | 0;
    for (let x = 6; x < gw - 6; x++) if (Math.abs(x - cx) > 2) set(x, cy, T_WALL);
    for (let y = 5; y < gh - 5; y++) if (Math.abs(y - cy) > 2) set(cx, y, T_WALL);
    for (let i = 0; i < 10; i++) {
      const x = 4 + (i * 9) % (gw - 8);
      const y = 4 + (i * 5) % (gh - 8);
      set(x, y, T_FURNITURE);
      set(x + 1, y, T_FURNITURE);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const x = rng.int(4, gw - 5), y = rng.int(4, gh - 5);
      if (Math.abs(x - gw / 2) < 4 && Math.abs(y - gh / 2) < 4) continue;
      set(x, y, T_FURNITURE);
      if (rng.chance(0.5)) set(x + 1, y, T_FURNITURE);
    }
  }

  if (!spawn) spawn = toWorld((gw / 2) | 0, (gh / 2) | 0);
  if (!exit) exit = mode === 'defense' ? spawn : toWorld(gw - 4, gh - 4);
  const enemySpawns = [];
  const pickupSpawns = [];
  if (!spawnPoints.length) {
    spawnPoints = [
      toWorld(3, 3), toWorld(gw - 4, 3), toWorld(3, gh - 4), toWorld(gw - 4, gh - 4),
      toWorld((gw / 2) | 0, 3), toWorld((gw / 2) | 0, gh - 4),
    ];
  }

  if (mode === 'defense') {
    const inside = (x, y) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1;
    const clearTile = (x, y) => { if (inside(x, y)) tiles[at(x, y)] = T_FLOOR; };
    const clearPatch = (p, r = 1) => {
      const gx = (p.x / TILE) | 0, gy = (p.y / TILE) | 0;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) clearTile(gx + ox, gy + oy);
    };
    clearPatch(spawn, 2);
    for (const p of spawnPoints) clearPatch(p, 1);

    for (const r of rooms) {
      if (r.safe || r.w < 6 || r.h < 6) continue;
      const n = rng.int(0, 2);
      for (let i = 0; i < n; i++) {
        const x = rng.int(r.x + 1, r.x + r.w - 2);
        const y = rng.int(r.y + 1, r.y + r.h - 2);
        if (Math.abs(x - r.cx) <= 1 && Math.abs(y - r.cy) <= 1) continue;
        if (tiles[at(x, y)] === T_FLOOR) tiles[at(x, y)] = T_FURNITURE;
        if (rng.chance(0.45) && x + 1 < r.x + r.w - 1 && tiles[at(x + 1, y)] === T_FLOOR) tiles[at(x + 1, y)] = T_FURNITURE;
      }
    }

    const sgx = (spawn.x / TILE) | 0, sgy = (spawn.y / TILE) | 0;
    const flood = () => {
      const seen = new Uint8Array(gw * gh);
      const q = new Int32Array(gw * gh);
      let lo = 0, hi = 0;
      const start = at(sgx, sgy);
      seen[start] = 1; q[hi++] = start;
      while (lo < hi) {
        const c = q[lo++], cx = c % gw, cy = (c / gw) | 0;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [ox, oy] of nb) {
          const nx = cx + ox, ny = cy + oy;
          if (!inside(nx, ny) || tiles[at(nx, ny)] !== T_FLOOR) continue;
          const ni = at(nx, ny);
          if (seen[ni]) continue;
          seen[ni] = 1; q[hi++] = ni;
        }
      }
      return seen;
    };
    const carveRoute = (tx, ty) => {
      let x = sgx, y = sgy;
      clearTile(x, y);
      const firstX = ((tx * 73856093 + ty * 19349663 + seed) & 1) === 0;
      const walkX = () => { while (x !== tx) { x += Math.sign(tx - x); clearTile(x, y); } };
      const walkY = () => { while (y !== ty) { y += Math.sign(ty - y); clearTile(x, y); } };
      if (firstX) { walkX(); walkY(); } else { walkY(); walkX(); }
    };
    for (let pass = 0; pass < 32; pass++) {
      const seen = flood();
      let target = null;
      for (let y = 1; y < gh - 1 && !target; y++) {
        for (let x = 1; x < gw - 1; x++) {
          const i = at(x, y);
          if (tiles[i] === T_FLOOR && !seen[i]) { target = { x, y }; break; }
        }
      }
      if (!target) break;
      carveRoute(target.x, target.y);
    }
  }

  if (mode === 'practice') {
    const kind0 = enemyKind || 'strawman';
    const weapon = kind0 === 'gunner' ? 'pistol' : kind0 === 'shield' ? 'shield' : kind0 === 'patroller' ? 'pistol' : 'fists';
    const n = kind0 === 'strawman' ? 5 : kind0 === 'hound' ? 4 : kind0 === 'patroller' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const p = spawnPoints[i % spawnPoints.length];
      enemySpawns.push({ x: p.x, y: p.y, type: kind0, weapon, armour: kind0 === 'shield' ? 4 : 0, angle: Math.atan2(spawn.y - p.y, spawn.x - p.x) });
    }
  }

  const doors = [];
  const doorAt = new Map();
  const windows = [];
  const windowAt = new Map();
  const addDoor = (gx, gy, horiz, hinge) => {
    if (gx <= 0 || gy <= 0 || gx >= gw - 1 || gy >= gh - 1) return false;
    const i = at(gx, gy);
    if (doorAt.has(i) || tiles[i] !== T_FLOOR) return false;
    const p = toWorld(gx, gy);
    tiles[i] = T_DOOR;
    const d = { gx, gy, i, x: p.x, y: p.y, horiz, hinge, open: 0, slam: 0, swing: 1 };
    doors.push(d);
    doorAt.set(i, d);
    return true;
  };

  if (mode === 'defense' && roomIndex) {
    const outsideRoom = (gx, gy, id) => gx >= 0 && gy >= 0 && gx < gw && gy < gh && roomIndex[at(gx, gy)] !== id;
    const maybeDoorRun = (cells, horiz) => {
      if (!cells.length) return;
      const c = cells[(cells.length / 2) | 0];
      addDoor(c.gx, c.gy, horiz, rng.chance(0.5) ? 1 : -1);
    };
    for (const r of rooms) {
      for (const side of [
        { horiz: true,  dx: 0, dy: -1, cells: Array.from({ length: r.w }, (_, i) => ({ gx: r.x + i, gy: r.y })) },
        { horiz: true,  dx: 0, dy: 1,  cells: Array.from({ length: r.w }, (_, i) => ({ gx: r.x + i, gy: r.y + r.h - 1 })) },
        { horiz: false, dx: -1, dy: 0, cells: Array.from({ length: r.h }, (_, i) => ({ gx: r.x, gy: r.y + i })) },
        { horiz: false, dx: 1,  dy: 0, cells: Array.from({ length: r.h }, (_, i) => ({ gx: r.x + r.w - 1, gy: r.y + i })) },
      ]) {
        let run = [];
        for (const c of side.cells) {
          const outX = c.gx + side.dx, outY = c.gy + side.dy;
          const qualifies = tiles[at(c.gx, c.gy)] === T_FLOOR
            && roomIndex[at(c.gx, c.gy)] === r.id
            && outsideRoom(outX, outY, r.id)
            && tiles[at(outX, outY)] === T_FLOOR;
          if (qualifies) run.push(c);
          else { maybeDoorRun(run, side.horiz); run = []; }
        }
        maybeDoorRun(run, side.horiz);
      }
    }
  }

  const solidAt = (x, y) => {
    const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const t = tiles[gy * gw + gx];
    return t === T_WALL || t === T_FURNITURE || t === T_WINDOW;
  };
  const walkableTile = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
    const t = tiles[gy * gw + gx];
    return t === T_FLOOR || t === T_DOOR;
  };
  const sightBlockedAt = (x, y) => {
    const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const i = gy * gw + gx;
    if (tiles[i] === T_DOOR) {
      const d = doorAt.get(i);
      return d ? d.open < 0.45 : true;
    }
    return tiles[i] === T_WALL;
  };
  const bulletBlockedAt = sightBlockedAt;

  return {
    gw, gh, tiles, doors, doorAt, windows, windowAt,
    w: gw * TILE, h: gh * TILE,
    rooms,
    spawn, exit, enemySpawns, pickupSpawns, spawnPoints,
    solidAt,
    doorAtPoint(x, y) {
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return null;
      const i = gy * gw + gx;
      if (tiles[i] !== T_DOOR) return null;
      return doorAt.get(i) || null;
    },
    windowAtPoint() { return null; },
    breakWindow() { return false; },
    resetWindows() {},
    walkableTile,
    sightBlockedAt,
    bulletBlockedAt,
    roomAtPoint(x, y) {
      if (!roomIndex) return -1;
      const gx = (x / TILE) | 0, gy = (y / TILE) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return -1;
      return roomIndex[at(gx, gy)];
    },
  };
}

export function makePracticeLevel(seed, mapId = 'arena', enemyKind = 'strawman') {
  return makeStaticLevel(seed, mapId, 'practice', enemyKind);
}

export function makeDefenseLevel(seed) {
  return makeStaticLevel(seed, 'maze', 'defense');
}

// coarse but cheap line-of-sight: step along the ray at half-tile increments
export function hasLineOfSight(level, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const steps = Math.ceil(len / (TILE * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (level.sightBlockedAt(ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}
