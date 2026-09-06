(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // overprint/src/util.js
  function angDelta(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function makeRng(seed) {
    let a = seed >>> 0;
    const r = () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }
  function springTo(cur, vel, target, dt, response = 0.35, damping = 1) {
    const w = 2 * Math.PI / response;
    const a = -w * w * (cur - target) - 2 * damping * w * vel;
    const v = vel + a * Math.min(dt, 1 / 30);
    return [cur + v * Math.min(dt, 1 / 30), v];
  }
  function reseedSim(seed) {
    sim = makeRng(seed >>> 0);
  }
  var TAU, clamp, lerp, dist2, dist, approach, sim, rnd;
  var init_util = __esm({
    "overprint/src/util.js"() {
      TAU = Math.PI * 2;
      clamp = (v, a, b) => v < a ? a : v > b ? b : v;
      lerp = (a, b, t) => a + (b - a) * t;
      dist2 = (ax, ay, bx, by) => {
        const dx = bx - ax, dy = by - ay;
        return dx * dx + dy * dy;
      };
      dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
      approach = (v, target, rate, dt) => lerp(v, target, 1 - Math.exp(-rate * dt));
      sim = makeRng(1);
      rnd = () => sim();
    }
  });

  // overprint/src/level.js
  function makeLevel(seed, floorNum) {
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
      if (rng.chance(0.5)) {
        carveH(a.cx, b.cx, a.cy);
        carveV(a.cy, b.cy, b.cx);
      } else {
        carveV(a.cy, b.cy, a.cx);
        carveH(a.cx, b.cx, b.cy);
      }
    }
    if (rooms.length > 3) {
      const a = rooms[0], b = rooms[rooms.length - 1];
      carveH(a.cx, b.cx, b.cy);
      carveV(a.cy, b.cy, a.cx);
    }
    for (let x = 0; x < gw; x++) {
      tiles[at(x, 0)] = T_WALL;
      tiles[at(x, gh - 1)] = T_WALL;
    }
    for (let y = 0; y < gh; y++) {
      tiles[at(0, y)] = T_WALL;
      tiles[at(gw - 1, y)] = T_WALL;
    }
    const start = rooms[0];
    let exitRoom = rooms[rooms.length - 1];
    let best = -1;
    for (const r of rooms) {
      const d = dist(r.cx, r.cy, start.cx, start.cy);
      if (d > best) {
        best = d;
        exitRoom = r;
      }
    }
    for (const r of rooms) {
      const n = rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const cw = rng.int(1, 3), ch = rng.int(1, 2);
        const cx = rng.int(r.x + 1, r.x + r.w - cw - 1);
        const cy = rng.int(r.y + 1, r.y + r.h - ch - 1);
        for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) tiles[at(x, y)] = T_FURNITURE;
      }
    }
    tiles[at(start.cx, start.cy)] = T_FLOOR;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      tiles[at(exitRoom.cx + dx, exitRoom.cy + dy)] = T_FLOOR;
    }
    const floodFromSpawn = () => {
      const seen = new Uint8Array(gw * gh);
      const q2 = [at(start.cx, start.cy)];
      seen[q2[0]] = 1;
      for (let i = 0; i < q2.length; i++) {
        const c = q2[i], cx = c % gw, cy = c / gw | 0;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [ox, oy] of nb) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (seen[ni] || tiles[ni] !== T_FLOOR) continue;
          seen[ni] = 1;
          q2.push(ni);
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
        let best2 = start, bd = Infinity;
        for (const o of rooms) {
          if (o === r || !roomReached(o, seen)) continue;
          const d = dist(r.cx, r.cy, o.cx, o.cy);
          if (d < bd) {
            bd = d;
            best2 = o;
          }
        }
        carveH(r.cx, best2.cx, r.cy);
        carveV(r.cy, best2.cy, best2.cx);
      }
    }
    const toWorld = (gx, gy) => ({ x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE });
    const doors = [];
    const doorAt = /* @__PURE__ */ new Map();
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
    const windows = [];
    const windowAt = /* @__PURE__ */ new Map();
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
        if (openOut && openIn) {
          if (!wrun) wrun = { a: v, b: v };
          else wrun.b = v;
        } else flushWindow();
      }
      flushWindow();
    }
    for (const e of edges) {
      let run = null;
      const tileOf = (v) => e.vert ? { gx: e.fixed, gy: v } : { gx: v, gy: e.fixed };
      const flush = () => {
        if (!run) return;
        const len = run.b - run.a + 1;
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
        if (open) {
          if (!run) run = { a: v, b: v };
          else run.b = v;
        } else flush();
      }
      flush();
    }
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
        const gx = (a.x + dx * t) / TILE | 0;
        const gy = (a.y + dy * t) / TILE | 0;
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
        if (score > bestScore) {
          bestScore = score;
          bestP = p;
        }
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
      const roll = rng();
      let type = "thug";
      const gunnerP = Math.min(0.4, 0.1 + floorNum * 0.033);
      const houndP = Math.min(0.26, floorNum < 2 ? 0 : 0.06 + floorNum * 0.02);
      const shieldP = Math.min(0.2, floorNum < 2 ? 0 : 0.05 + floorNum * 0.02);
      const patrolP = Math.min(0.18, floorNum < 2 ? 0.04 : 0.06 + floorNum * 0.012);
      if (roll < gunnerP) type = "gunner";
      else if (roll < gunnerP + houndP) type = "hound";
      else if (roll < gunnerP + houndP + shieldP) type = "shield";
      else if (roll < gunnerP + houndP + shieldP + patrolP) type = "patroller";
      let weapon = "fists";
      if (type === "thug") weapon = rng.pick(["bat", "bat", "knife", "fists", "shield"]);
      else if (type === "shield") weapon = rng.pick(["shield", "shield", "bat", "pistol"]);
      else if (type === "patroller") {
        weapon = floorNum < 4 ? rng.pick(["bat", "knife", "pistol"]) : rng.pick(["knife", "pistol", "pistol", "smg", "shield"]);
      } else if (type === "gunner") {
        weapon = floorNum < 3 ? rng.pick(["pistol", "pistol", "smg", "shield"]) : rng.pick(["pistol", "smg", "smg", "ripper", "shotgun", "revolver", "shield"]);
      }
      let armour = 0;
      if (type === "shield") {
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
      const kinds = floorNum < 3 ? ["bat", "knife", "katana", "quixote", "pistol", "pistol", "smg", "grenade", "sentryPack", "molotov", "dart", "tameDart", "virus", "copySauce", "disguise", "shield", "shield", "shield"] : ["bat", "knife", "knife", "katana", "katana", "quixote", "pistol", "pistol", "revolver", "smg", "smg", "ripper", "shotgun", "grenade", "grenade", "frag", "flash", "sentryPack", "dronePack", "rocket", "molotov", "molotov", "dart", "tameDart", "virus", "copySauce", "disguise", "sniper", "laser", "butcher", "shield", "shield", "shield", "shield"];
      pickupSpawns.push({ x: p.x, y: p.y, kind: rng.pick(kinds) });
    }
    return {
      gw,
      gh,
      tiles,
      doors,
      doorAt,
      windows,
      windowAt,
      w: gw * TILE,
      h: gh * TILE,
      rooms,
      spawn: toWorld(start.cx, start.cy),
      exit: toWorld(exitRoom.cx, exitRoom.cy),
      enemySpawns,
      pickupSpawns,
      solidAt(x, y) {
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
        const t = tiles[gy * gw + gx];
        return t === T_WALL || t === T_FURNITURE || t === T_WINDOW;
      },
      doorAtPoint(x, y) {
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return null;
        const i = gy * gw + gx;
        if (tiles[i] !== T_DOOR) return null;
        return doorAt.get(i) || null;
      },
      // a pane still standing at this point, or null
      windowAtPoint(x, y) {
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return null;
        const i = gy * gw + gx;
        if (tiles[i] !== T_WINDOW) return null;
        return windowAt.get(i) || null;
      },
      breakWindow(win) {
        if (!win || win.broken) return false;
        win.broken = true;
        tiles[win.i] = T_FLOOR;
        return true;
      },
      resetWindows() {
        for (const w of windows) {
          w.broken = false;
          tiles[w.i] = T_WINDOW;
        }
      },
      walkableTile(gx, gy) {
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
        const t = tiles[gy * gw + gx];
        return t === T_FLOOR || t === T_DOOR;
      },
      sightBlockedAt(x, y) {
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
        const i = gy * gw + gx;
        const t = tiles[i];
        if (t === T_WALL) return true;
        if (t === T_DOOR) {
          const d = doorAt.get(i);
          return d ? d.open < 0.45 : false;
        }
        return false;
      },
      bulletBlockedAt(x, y) {
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
        const i = gy * gw + gx;
        const t = tiles[i];
        if (t === T_WALL) return true;
        if (t === T_DOOR) {
          const d = doorAt.get(i);
          return d ? d.open < 0.45 : false;
        }
        return false;
      }
    };
  }
  function makeStaticLevel(seed, kind = "arena", mode = "practice", enemyKind = "strawman") {
    const rng = makeRng(seed);
    const gw = mode === "defense" ? 46 : 34;
    const gh = mode === "defense" ? 32 : 24;
    const tiles = new Uint8Array(gw * gh).fill(T_FLOOR);
    const at = (x, y) => y * gw + x;
    const set = (x, y, t) => {
      if (x >= 0 && y >= 0 && x < gw && y < gh) tiles[at(x, y)] = t;
    };
    const toWorld = (gx, gy) => ({ x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE });
    let rooms = [];
    let roomIndex = null;
    let spawn = null;
    let exit = null;
    let spawnPoints = [];
    for (let x = 0; x < gw; x++) {
      set(x, 0, T_WALL);
      set(x, gh - 1, T_WALL);
    }
    for (let y = 0; y < gh; y++) {
      set(0, y, T_WALL);
      set(gw - 1, y, T_WALL);
    }
    if (mode === "defense") {
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
      const cx = gw / 2 | 0, cy = gh / 2 | 0;
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
        if (rng.chance(0.5)) {
          carveH(a.cx, b.cx, a.cy);
          carveV(a.cy, b.cy, b.cx);
        } else {
          carveV(a.cy, b.cy, a.cx);
          carveH(a.cx, b.cx, b.cy);
        }
      };
      const linked = [startRoom];
      const remaining = rooms.filter((r) => r !== startRoom);
      while (remaining.length) {
        let bestI = 0, bestFrom = linked[0], bd = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          for (const from of linked) {
            const d = dist(remaining[i].cx, remaining[i].cy, from.cx, from.cy);
            if (d < bd) {
              bd = d;
              bestI = i;
              bestFrom = from;
            }
          }
        }
        const next = remaining.splice(bestI, 1)[0];
        carveRoute(bestFrom, next);
        linked.push(next);
      }
      const loopBudget = Math.max(2, Math.floor(rooms.length * 0.22));
      const looped = /* @__PURE__ */ new Set();
      for (let n = 0; n < loopBudget; n++) {
        let best = null, bd = Infinity;
        for (let tries = 0; tries < 36; tries++) {
          const a = rng.pick(rooms), b = rng.pick(rooms);
          if (!a || !b || a === b || a.safe || b.safe) continue;
          const key2 = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          if (looped.has(key2)) continue;
          const d = dist(a.cx, a.cy, b.cx, b.cy);
          if (d < 8 || d > 25) continue;
          if (d < bd) {
            bd = d;
            best = { a, b, key: key2 };
          }
        }
        if (best) {
          looped.add(best.key);
          carveRoute(best.a, best.b);
        }
      }
      for (let tries = 0, opened = 0; tries < 220 && opened < 18; tries++) {
        const x = rng.int(2, gw - 3), y = rng.int(2, gh - 3);
        if (tiles[at(x, y)] !== T_WALL) continue;
        const lr = tiles[at(x - 1, y)] === T_FLOOR && tiles[at(x + 1, y)] === T_FLOOR;
        const ud = tiles[at(x, y - 1)] === T_FLOOR && tiles[at(x, y + 1)] === T_FLOOR;
        const openSides = (tiles[at(x - 1, y)] === T_FLOOR ? 1 : 0) + (tiles[at(x + 1, y)] === T_FLOOR ? 1 : 0) + (tiles[at(x, y - 1)] === T_FLOOR ? 1 : 0) + (tiles[at(x, y + 1)] === T_FLOOR ? 1 : 0);
        if ((lr || ud) && openSides <= 2 && rng.chance(0.34)) {
          carve(x, y);
          opened++;
        }
      }
      spawn = toWorld(startRoom.cx, startRoom.cy);
      exit = spawn;
      spawnPoints = rooms.filter((r) => !r.safe).map((r) => ({ ...toWorld(r.cx, r.cy), room: r.id }));
    } else if (kind === "lanes") {
      for (let x = 7; x < gw - 5; x += 7) {
        for (let y = 3; y < gh - 3; y++) if (y % 7 > 1) set(x, y, T_WALL);
      }
    } else if (kind === "cover") {
      const cx = gw / 2 | 0, cy = gh / 2 | 0;
      for (let x = 6; x < gw - 6; x++) if (Math.abs(x - cx) > 2) set(x, cy, T_WALL);
      for (let y = 5; y < gh - 5; y++) if (Math.abs(y - cy) > 2) set(cx, y, T_WALL);
      for (let i = 0; i < 10; i++) {
        const x = 4 + i * 9 % (gw - 8);
        const y = 4 + i * 5 % (gh - 8);
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
    if (!spawn) spawn = toWorld(gw / 2 | 0, gh / 2 | 0);
    if (!exit) exit = mode === "defense" ? spawn : toWorld(gw - 4, gh - 4);
    const enemySpawns = [];
    const pickupSpawns = [];
    if (!spawnPoints.length) {
      spawnPoints = [
        toWorld(3, 3),
        toWorld(gw - 4, 3),
        toWorld(3, gh - 4),
        toWorld(gw - 4, gh - 4),
        toWorld(gw / 2 | 0, 3),
        toWorld(gw / 2 | 0, gh - 4)
      ];
    }
    if (mode === "defense") {
      const inside = (x, y) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1;
      const clearTile = (x, y) => {
        if (inside(x, y)) tiles[at(x, y)] = T_FLOOR;
      };
      const clearPatch = (p, r = 1) => {
        const gx = p.x / TILE | 0, gy = p.y / TILE | 0;
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
      const sgx = spawn.x / TILE | 0, sgy = spawn.y / TILE | 0;
      const flood = () => {
        const seen = new Uint8Array(gw * gh);
        const q2 = new Int32Array(gw * gh);
        let lo = 0, hi = 0;
        const start = at(sgx, sgy);
        seen[start] = 1;
        q2[hi++] = start;
        while (lo < hi) {
          const c = q2[lo++], cx = c % gw, cy = c / gw | 0;
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [ox, oy] of nb) {
            const nx = cx + ox, ny = cy + oy;
            if (!inside(nx, ny) || tiles[at(nx, ny)] !== T_FLOOR) continue;
            const ni = at(nx, ny);
            if (seen[ni]) continue;
            seen[ni] = 1;
            q2[hi++] = ni;
          }
        }
        return seen;
      };
      const carveRoute = (tx, ty) => {
        let x = sgx, y = sgy;
        clearTile(x, y);
        const firstX = (tx * 73856093 + ty * 19349663 + seed & 1) === 0;
        const walkX = () => {
          while (x !== tx) {
            x += Math.sign(tx - x);
            clearTile(x, y);
          }
        };
        const walkY = () => {
          while (y !== ty) {
            y += Math.sign(ty - y);
            clearTile(x, y);
          }
        };
        if (firstX) {
          walkX();
          walkY();
        } else {
          walkY();
          walkX();
        }
      };
      for (let pass = 0; pass < 32; pass++) {
        const seen = flood();
        let target = null;
        for (let y = 1; y < gh - 1 && !target; y++) {
          for (let x = 1; x < gw - 1; x++) {
            const i = at(x, y);
            if (tiles[i] === T_FLOOR && !seen[i]) {
              target = { x, y };
              break;
            }
          }
        }
        if (!target) break;
        carveRoute(target.x, target.y);
      }
    }
    if (mode === "practice") {
      const kind0 = enemyKind || "strawman";
      const weapon = kind0 === "gunner" ? "pistol" : kind0 === "shield" ? "shield" : kind0 === "patroller" ? "pistol" : "fists";
      const n = kind0 === "strawman" ? 5 : kind0 === "hound" ? 4 : kind0 === "patroller" ? 5 : 6;
      for (let i = 0; i < n; i++) {
        const p = spawnPoints[i % spawnPoints.length];
        enemySpawns.push({ x: p.x, y: p.y, type: kind0, weapon, armour: kind0 === "shield" ? 4 : 0, angle: Math.atan2(spawn.y - p.y, spawn.x - p.x) });
      }
    }
    const doors = [];
    const doorAt = /* @__PURE__ */ new Map();
    const windows = [];
    const windowAt = /* @__PURE__ */ new Map();
    if (mode === "defense") {
      doors.length = 0;
      doorAt.clear();
      for (let i = 0; i < tiles.length; i++) if (tiles[i] === T_DOOR) tiles[i] = T_FLOOR;
    }
    const solidAt = (x, y) => {
      const gx = x / TILE | 0, gy = y / TILE | 0;
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
      const gx = x / TILE | 0, gy = y / TILE | 0;
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
      gw,
      gh,
      tiles,
      doors,
      doorAt,
      windows,
      windowAt,
      w: gw * TILE,
      h: gh * TILE,
      rooms,
      spawn,
      exit,
      enemySpawns,
      pickupSpawns,
      spawnPoints,
      solidAt,
      doorAtPoint(x, y) {
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return null;
        const i = gy * gw + gx;
        if (tiles[i] !== T_DOOR) return null;
        return doorAt.get(i) || null;
      },
      windowAtPoint() {
        return null;
      },
      breakWindow() {
        return false;
      },
      resetWindows() {
      },
      walkableTile,
      sightBlockedAt,
      bulletBlockedAt,
      roomAtPoint(x, y) {
        if (!roomIndex) return -1;
        const gx = x / TILE | 0, gy = y / TILE | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return -1;
        return roomIndex[at(gx, gy)];
      }
    };
  }
  function makePracticeLevel(seed, mapId = "arena", enemyKind = "strawman") {
    return makeStaticLevel(seed, mapId, "practice", enemyKind);
  }
  function makeDefenseLevel(seed) {
    return makeStaticLevel(seed, "maze", "defense");
  }
  function hasLineOfSight(level, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (level.sightBlockedAt(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }
  var TILE, T_FLOOR, T_WALL, T_FURNITURE, T_WINDOW, T_DOOR;
  var init_level = __esm({
    "overprint/src/level.js"() {
      init_util();
      TILE = 34;
      T_FLOOR = 0;
      T_WALL = 1;
      T_FURNITURE = 2;
      T_WINDOW = 4;
      T_DOOR = 3;
    }
  });

  // overprint/src/entities.js
  var entities_exports = {};
  __export(entities_exports, {
    DASH_CD: () => DASH_CD,
    ENEMY_DEF: () => ENEMY_DEF,
    MAX_BULLETS: () => MAX_BULLETS,
    MAX_CORPSES: () => MAX_CORPSES,
    MAX_DASH: () => MAX_DASH,
    MAX_DEPLOYS: () => MAX_DEPLOYS,
    MAX_DRONES: () => MAX_DRONES,
    MAX_ENEMIES: () => MAX_ENEMIES,
    MAX_PICKUPS: () => MAX_PICKUPS,
    MAX_THROWN: () => MAX_THROWN,
    SEGS_MAX: () => SEGS_MAX,
    SEG_SPAN: () => SEG_SPAN,
    S_CHASE: () => S_CHASE,
    S_DEAD: () => S_DEAD,
    S_DOWN: () => S_DOWN,
    S_IDLE: () => S_IDLE,
    S_SEARCH: () => S_SEARCH,
    WEAPONS: () => WEAPONS,
    alertEnemy: () => alertEnemy,
    armourArc: () => armourArc,
    armourLayout: () => armourLayout,
    columnDepth: () => columnDepth,
    makePools: () => makePools,
    moveCollide: () => moveCollide,
    outermostPlate: () => outermostPlate,
    plateBit: () => plateBit,
    shieldBlocks: () => shieldBlocks,
    shieldCount: () => shieldCount,
    shieldSegmentAt: () => shieldSegmentAt,
    spawnFrom: () => spawnFrom,
    updateEnemy: () => updateEnemy
  });
  function armourLayout(total) {
    const segs = total <= 1 ? 1 : total <= 3 ? 3 : SEGS_MAX;
    return { segs, layers: Math.ceil(total / segs) };
  }
  function armourArc(e) {
    if (!e.armour || !e.segs) return 0;
    return Math.min(Math.PI, e.segs * SEG_SPAN / 2);
  }
  function shieldSegmentAt(e, fromX, fromY) {
    if (!e.armour || !e.segs) return -1;
    const arc = armourArc(e);
    const rel = angDelta(e.angle, Math.atan2(fromY - e.y, fromX - e.x));
    if (Math.abs(rel) >= arc) return -1;
    const span = arc * 2 / e.segs;
    const i = Math.floor((rel + arc) / span);
    return i < 0 ? 0 : i >= e.segs ? e.segs - 1 : i;
  }
  function columnDepth(e, seg) {
    let n = 0;
    for (let L = 0; L < e.layers; L++) if (e.shieldSeg & plateBit(e, L, seg)) n++;
    return n;
  }
  function outermostPlate(e, seg) {
    for (let L = e.layers - 1; L >= 0; L--) {
      if (e.shieldSeg & plateBit(e, L, seg)) return L;
    }
    return -1;
  }
  function makePools() {
    const mk = (n, f) => Array.from({ length: n }, f);
    return {
      enemies: mk(MAX_ENEMIES, () => ({
        alive: false,
        type: "thug",
        weapon: "fists",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        state: S_IDLE,
        timer: 0,
        downTimer: 0,
        fireTimer: 0,
        attackTimer: 0,
        burst: 0,
        ammo: 0,
        lkx: 0,
        lky: 0,
        ptx: 0,
        pty: 0,
        searchT: 0,
        shoutCd: 0,
        strafe: 1,
        strafeT: 0,
        windup: 0,
        chargeT: 0,
        seen: 0,
        stuckT: 0,
        lastX: 0,
        lastY: 0,
        scanT: 0,
        reload: 0,
        madT: 0,
        burnT: 0,
        seeking: 0,
        skx: 0,
        sky: 0,
        blockFlash: 0,
        stagger: 0,
        look: 0,
        heldShieldHp: 0,
        armour: 0,
        segs: 0,
        layers: 0,
        shieldHp: 0,
        shieldSeg: 0,
        roomGoal: -1,
        roomSeq: 0,
        friendly: false,
        converted: false,
        contagious: false,
        infectT: 0,
        infectByPlayer: false
      })),
      corpses: mk(MAX_CORPSES, () => ({
        alive: false,
        type: "thug",
        weapon: "fists",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        state: S_DEAD,
        deadAngle: 0,
        t: 0,
        armour: 0,
        segs: 0,
        layers: 0,
        shieldHp: 0,
        shieldSeg: 0,
        friendly: false,
        contagious: false,
        wave: 0
      })),
      bullets: mk(MAX_BULLETS, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, friendly: false, pierce: 0, near: 0, weapon: null, statusEffect: null, projectile: null, explosive: false, ricochet: false, bounces: 0, throughWalls: false })),
      pickups: mk(MAX_PICKUPS, () => ({ alive: false, x: 0, y: 0, kind: "pistol", ammo: 0, angle: 0 })),
      thrown: mk(MAX_THROWN, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, kind: "pistol", ammo: 0, spin: 0, life: 0, maxLife: 0, targetX: NaN, targetY: NaN, friendly: true, charge: 0, power: 1, effectScale: 1, statusEffect: null, shrapnelEffect: null, noPickup: false })),
      deploys: mk(MAX_DEPLOYS, () => ({ alive: false, kind: "sentry", x: 0, y: 0, angle: 0, ammo: 0, fireTimer: 0, reload: 0, life: 0, friendly: true, spin: 0, target: null })),
      drones: mk(MAX_DRONES, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, angle: 0, ammo: 0, fireTimer: 0, life: 0, friendly: true, target: null, navX: 0, navY: 0, navT: 0, spin: 0, kamikaze: false, blastT: 0 }))
    };
  }
  function spawnFrom(pool) {
    for (let i = 0; i < pool.length; i++) if (!pool[i].alive) return pool[i];
    return null;
  }
  function moveCollide(level, e, dx, dy, r) {
    let hitX = false, hitY = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const nx = e.x + sx;
      if (!level.solidAt(nx + Math.sign(sx) * r, e.y - r * 0.7) && !level.solidAt(nx + Math.sign(sx) * r, e.y + r * 0.7)) e.x = nx;
      else hitX = true;
      const ny = e.y + sy;
      if (!level.solidAt(e.x - r * 0.7, ny + Math.sign(sy) * r) && !level.solidAt(e.x + r * 0.7, ny + Math.sign(sy) * r)) e.y = ny;
      else hitY = true;
    }
    return { hitX, hitY };
  }
  function shieldBlocks(e, fromX, fromY) {
    if (!e.armour || !e.shieldSeg) return false;
    if (e.state === S_DOWN || e.state === S_DEAD) return false;
    const i = shieldSegmentAt(e, fromX, fromY);
    if (i < 0) return false;
    return outermostPlate(e, i) >= 0;
  }
  function shieldCount(seg) {
    let n = 0;
    while (seg) {
      n += seg & 1;
      seg >>= 1;
    }
    return n;
  }
  function canSee(level, e, def, tx, ty) {
    const d = dist(e.x, e.y, tx, ty);
    if (d > def.range) return false;
    const a = Math.atan2(ty - e.y, tx - e.x);
    if (Math.abs(angDelta(e.angle, a)) > def.cone) return d < 46;
    return hasLineOfSight(level, e.x, e.y, tx, ty);
  }
  function alertEnemy(e, x, y, search = 7) {
    if (e.state === S_DOWN || e.state === S_DEAD) return;
    e.state = Math.max(e.state, S_SEARCH);
    e.lkx = x;
    e.lky = y;
    e.searchT = Math.max(e.searchT, search);
    e.timer = 0;
  }
  function updateEnemy(game2, e, dt) {
    const def = ENEMY_DEF[e.type];
    const level = game2.level;
    const w = WEAPONS[e.weapon] || WEAPONS.fists;
    if (e.state === S_DEAD) return;
    if (e.blockFlash > 0) e.blockFlash -= dt;
    if (e.stagger > 0) e.stagger -= dt;
    if (e.attackTimer > 0) e.attackTimer -= dt;
    if (def.passive) {
      e.vx = 0;
      e.vy = 0;
      return;
    }
    if (e.madT > 0) {
      e.madT = Math.max(0, e.madT - dt);
      if (e.madT > 0 && e.state !== S_DOWN) e.state = S_CHASE;
    }
    const mad = e.madT > 0;
    if (e.state === S_DOWN) {
      e.downTimer -= dt;
      e.vx = approach(e.vx, 0, 9, dt);
      e.vy = approach(e.vy, 0, 9, dt);
      moveCollide(level, e, e.vx * dt, e.vy * dt, def.r);
      if (e.downTimer <= 0) {
        e.state = S_CHASE;
        e.lkx = game2.alarmX;
        e.lky = game2.alarmY;
        e.searchT = 8;
        if (e.weapon === "fists" && !def.handless) game2.seekWeapon(e);
      }
      return;
    }
    e.shoutCd -= dt;
    e.scanT -= dt;
    let target = null, bestD = Infinity;
    const targets = mad && game2.frenzyTargets ? game2.frenzyTargets(e) : game2.enemyTargets ? game2.enemyTargets(e) : game2.targets;
    for (const t of targets) {
      if (!t.alive) continue;
      const d = dist(e.x, e.y, t.x, t.y);
      if (d < bestD && canSee(level, e, def, t.x, t.y)) {
        bestD = d;
        target = t;
      }
    }
    if (target) {
      e.seen += dt;
      if (e.state !== S_CHASE && e.seen > (w.melee ? 0.09 : 0.16)) {
        e.state = S_CHASE;
        if (!mad && !e.friendly) {
          game2.onSpotted(e);
          if (e.shoutCd <= 0) {
            e.shoutCd = 3.4;
            game2.shout(e, target.x, target.y);
          }
        }
      }
      e.lkx = target.x;
      e.lky = target.y;
      e.searchT = 7;
    } else {
      e.seen = Math.max(0, e.seen - dt * 2);
      if (e.state === S_CHASE && e.searchT < 5.4) e.state = S_SEARCH;
    }
    if (!e.friendly && e.state === S_IDLE && e.scanT <= 0) {
      e.scanT = 0.35;
      for (const o of game2.pools.corpses || []) {
        if (!o.alive) continue;
        if (game2.mode === "defense" && o.wave !== (game2.defense?.wave || 0)) continue;
        if (!!o.friendly !== !!e.friendly) continue;
        if (dist(e.x, e.y, o.x, o.y) > 230) continue;
        if (!canSee(level, e, def, o.x, o.y)) continue;
        alertEnemy(e, o.x, o.y, 8);
        game2.onSpotted(e);
        if (e.shoutCd <= 0) {
          e.shoutCd = 3.4;
          game2.shout(e, o.x, o.y);
        }
        break;
      }
    }
    e.searchT -= dt;
    let tx = e.x, ty = e.y, speed = 0;
    let strafeX = 0, strafeY = 0;
    if (e.seeking > 0) {
      e.seeking -= dt;
      const got = game2.tryTakePickup(e);
      if (got || e.seeking <= 0) e.seeking = 0;
      else {
        tx = e.skx;
        ty = e.sky;
        speed = def.speed * 0.95;
        if (dist(e.x, e.y, tx, ty) < 20) e.seeking = 0;
      }
    }
    if (e.seeking <= 0) {
      if (e.state === S_IDLE) {
        if (dist(e.x, e.y, e.ptx, e.pty) < 24 || e.timer <= 0) {
          let got = false;
          if (def.patrolAll && level.rooms && level.rooms.length) {
            const rooms = level.rooms;
            let idx = Number.isFinite(e.roomGoal) ? e.roomGoal : -1;
            for (let i = 0; i < rooms.length && !got; i++) {
              idx = (idx + 1) % rooms.length;
              const r0 = rooms[idx];
              const px = (r0.cx + 0.5) * TILE;
              const py = (r0.cy + 0.5) * TILE;
              if (level.solidAt(px, py)) continue;
              e.roomGoal = idx;
              e.roomSeq++;
              e.ptx = px;
              e.pty = py;
              got = true;
            }
          }
          if (!got) {
            for (let i = 0; i < 10 && !got; i++) {
              const a = rnd() * TAU, r = 70 + rnd() * 150;
              const px = clamp(e.x + Math.cos(a) * r, TILE, level.w - TILE);
              const py = clamp(e.y + Math.sin(a) * r, TILE, level.h - TILE);
              if (level.solidAt(px, py)) continue;
              if (!game2.walkClear(e.x, e.y, px, py, def.r)) continue;
              e.ptx = px;
              e.pty = py;
              got = true;
            }
          }
          if (!got) {
            e.ptx = e.x;
            e.pty = e.y;
          }
          e.timer = def.patrolAll ? 5 + rnd() * 2.5 : 2 + rnd() * 2.5;
          e.look = (rnd() - 0.5) * 1.6;
        }
        e.timer -= dt;
        tx = e.ptx;
        ty = e.pty;
        speed = def.patrol;
        if (dist(e.x, e.y, e.ptx, e.pty) < 26) speed = 0;
      } else {
        speed = def.speed;
        if (target) {
          tx = target.x;
          ty = target.y;
        } else {
          tx = e.lkx;
          ty = e.lky;
          if (dist(e.x, e.y, e.lkx, e.lky) < 34) {
            if (e.searchT > 0) {
              const a = rnd() * TAU, r = 60 + rnd() * 120;
              e.lkx = clamp(e.lkx + Math.cos(a) * r, TILE, level.w - TILE);
              e.lky = clamp(e.lky + Math.sin(a) * r, TILE, level.h - TILE);
            } else {
              e.state = S_IDLE;
              e.timer = 0;
            }
          }
          speed = def.speed * 0.8;
        }
        if (e.searchT <= 0 && !target) {
          e.state = S_IDLE;
          e.timer = 0;
        }
      }
      if (e.state === S_CHASE && !w.melee && !w.lobbed && !w.defense) {
        e.strafeT -= dt;
        if (e.strafeT <= 0) {
          e.strafeT = 0.7 + rnd() * 0.9;
          e.strafe = -e.strafe;
        }
        if (target) {
          const a = Math.atan2(target.y - e.y, target.x - e.x);
          strafeX = Math.cos(a + Math.PI / 2) * e.strafe;
          strafeY = Math.sin(a + Math.PI / 2) * e.strafe;
          const keep = def.keep || 200;
          if (bestD < keep * 0.85) {
            tx = e.x - (target.x - e.x);
            ty = e.y - (target.y - e.y);
            speed = def.speed;
          } else if (bestD < keep * 1.7) speed = def.speed * 0.2;
        }
        e.reload -= dt;
        e.fireTimer -= dt;
        if (target && bestD < def.range && e.fireTimer <= 0 && e.reload <= 0 && e.ammo > 0) {
          if (e.burst <= 0) {
            e.burst = w.eBurst;
            e.fireTimer = 0.18;
          } else {
            const flight = bestD / w.eSpeed;
            const ax2 = target.x + target.vx * flight * 0.85;
            const ay2 = target.y + target.vy * flight * 0.85;
            if (!mad && game2.friendlyInLine(e, ax2, ay2) && rnd() < 0.86) {
              e.fireTimer = 0.25;
              e.strafeT = 0;
            } else {
              game2.fireEnemyBullet(e, ax2, ay2);
              e.burst--;
              e.ammo--;
              if (e.burst > 0 && e.ammo > 0) e.fireTimer = w.cls === "rapid" ? 0.1 : 0.14;
              else {
                e.fireTimer = 0.5;
                e.reload = w.eRate + rnd() * 0.4;
                e.burst = 0;
              }
            }
          }
        }
        if (e.ammo <= 0 && !e.seeking) {
          game2.dropWeapon(e, true);
          game2.seekWeapon(e);
        }
      }
      if (e.state === S_CHASE && e.type === "hound") {
        e.chargeT -= dt;
        if (e.chargeT <= 0) {
          e.chargeT = 1.15;
          e.windup = 0.32;
        }
        if (e.windup > 0) {
          e.windup -= dt;
          speed = def.speed * 0.1;
        } else speed = def.speed * (e.chargeT > 0.35 ? 1.5 : 0.4);
      }
      if (e.state === S_CHASE && e.type === "thug" && bestD > 120 && bestD < 320) {
        const a = Math.atan2(ty - e.y, tx - e.x);
        const side = (e.lastX * 7919 + e.lastY * 104729 | 0) % 2 ? 1 : -1;
        strafeX = Math.cos(a + Math.PI / 2) * side * 0.55;
        strafeY = Math.sin(a + Math.PI / 2) * side * 0.55;
      }
    }
    const hunting = e.state !== S_IDLE;
    const nav = def.patrolAll && game2.pathDirToPoint ? game2.pathDirToPoint(e, tx, ty, def.r) : game2.pathDir(e, tx, ty, def.r, hunting);
    const ang = Math.atan2(nav.y, nav.x);
    let facing;
    if (target) facing = Math.atan2(target.y - e.y, target.x - e.x);
    else if (speed === 0) facing = e.angle + (e.look || 0) * dt * 2.2;
    else facing = ang;
    const turn = e.armour ? def.turn * Math.max(0.3, 1 - 0.075 * e.armour) : def.turn;
    e.angle += angDelta(e.angle, facing) * Math.min(1, turn * dt);
    if (e.stagger > 0) speed *= 0.15;
    if (e.armour) speed *= Math.max(0.55, 1 - 0.035 * e.armour);
    let ax = (nav.x + strafeX) * speed;
    let ay = (nav.y + strafeY) * speed;
    const probe = def.r + 9;
    if (level.solidAt(e.x + Math.sign(ax) * probe, e.y)) ax *= 0.15;
    if (level.solidAt(e.x, e.y + Math.sign(ay) * probe)) ay *= 0.15;
    e.vx = approach(e.vx, ax, 14, dt);
    e.vy = approach(e.vy, ay, 14, dt);
    for (const o of game2.pools.enemies) {
      if (o === e || !o.alive || o.state === S_DEAD) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      const dd = dx * dx + dy * dy;
      if (dd > 1 && dd < 26 * 26) {
        const l = Math.sqrt(dd);
        e.vx -= dx / l * 80;
        e.vy -= dy / l * 80;
      }
    }
    const hit = moveCollide(level, e, e.vx * dt, e.vy * dt, def.r);
    if (hit.hitX) e.vx *= -0.2;
    if (hit.hitY) e.vy *= -0.2;
    if (e.state !== S_IDLE) {
      if (dist(e.x, e.y, e.lastX, e.lastY) < 3) {
        e.stuckT += dt;
        if (e.stuckT > 0.7) {
          e.stuckT = 0;
          const step = game2.flowStep(e.x, e.y);
          if (step) {
            e.vx += step.x * 190;
            e.vy += step.y * 190;
          } else {
            e.lkx = e.x + (rnd() - 0.5) * 200;
            e.lky = e.y + (rnd() - 0.5) * 200;
          }
        }
      } else e.stuckT = 0;
    }
    e.lastX = e.x;
    e.lastY = e.y;
    const p = game2.player;
    const meleeCooldown = Math.max(0.24, (w.rate || 0.32) * (e.type === "hound" ? 1.35 : 1));
    const victim = target && target.enemy && target.enemy.alive && target.enemy.state !== S_DEAD ? target.enemy : null;
    if (victim && e.state === S_CHASE && w.melee && e.attackTimer <= 0) {
      const vd = ENEMY_DEF[victim.type];
      if (dist(e.x, e.y, victim.x, victim.y) < def.r + vd.r + 7) {
        e.attackTimer = meleeCooldown;
        const a = Math.atan2(victim.y - e.y, victim.x - e.x);
        if (game2.heldShieldBlocks?.(victim, e.x, e.y)) {
          game2.blockOnHeldShield?.(victim, e.x, e.y);
          e.fireTimer = 0.28;
        } else if (shieldBlocks(victim, e.x, e.y)) {
          game2.damageShield(victim, 1, false, e.x, e.y);
          e.fireTimer = 0.28;
        } else if (w.lethal || e.type === "hound" || victim.state === S_DOWN) {
          game2.killEnemy(victim, 1, Math.cos(a), Math.sin(a), true, e);
        } else {
          game2.knockdownEnemy(victim, Math.cos(a), Math.sin(a));
        }
      }
    } else if (!e.friendly && !game2.playerDisguised?.() && p.alive && e.state === S_CHASE && w.melee && e.attackTimer <= 0) {
      if (dist(e.x, e.y, p.x, p.y) < def.r + 11) {
        e.attackTimer = meleeCooldown;
        if (game2.heldShieldBlocks?.(p, e.x, e.y)) {
          game2.blockOnHeldShield?.(p, e.x, e.y);
          e.stagger = Math.max(e.stagger || 0, 0.25);
          e.vx *= -0.25;
          e.vy *= -0.25;
        } else game2.killPlayer(e);
      }
    } else if (!e.friendly && !game2.playerDisguised?.() && p.alive && e.state === S_CHASE && !mad && !w.defense && e.attackTimer <= 0 && dist(e.x, e.y, p.x, p.y) < 20) {
      e.attackTimer = meleeCooldown;
      if (game2.heldShieldBlocks?.(p, e.x, e.y)) {
        game2.blockOnHeldShield?.(p, e.x, e.y);
        e.stagger = Math.max(e.stagger || 0, 0.25);
      } else game2.killPlayer(e);
    }
  }
  var MAX_ENEMIES, MAX_CORPSES, MAX_BULLETS, MAX_PICKUPS, MAX_THROWN, MAX_DEPLOYS, MAX_DRONES, MAX_DASH, DASH_CD, S_IDLE, S_SEARCH, S_CHASE, S_DOWN, S_DEAD, WEAPONS, ENEMY_DEF, SEG_SPAN, SEGS_MAX, plateBit;
  var init_entities = __esm({
    "overprint/src/entities.js"() {
      init_util();
      init_level();
      MAX_ENEMIES = 40;
      MAX_CORPSES = 24;
      MAX_BULLETS = 240;
      MAX_PICKUPS = 76;
      MAX_THROWN = 28;
      MAX_DEPLOYS = 12;
      MAX_DRONES = 24;
      MAX_DASH = 2;
      DASH_CD = 1.05;
      S_IDLE = 0;
      S_SEARCH = 1;
      S_CHASE = 2;
      S_DOWN = 3;
      S_DEAD = 4;
      WEAPONS = {
        fists: { name: "\u8D64\u624B", feed: "none", tint: null, melee: true, reach: 36, rate: 0.28, ammo: 0, lethal: false, noise: 0, throwLethal: false },
        knife: { name: "\u5C0F\u5200", feed: "none", tint: "#12A3DA", melee: true, reach: 40, rate: 0.17, ammo: 0, lethal: true, noise: 40, throwLethal: true },
        bat: { name: "\u7403\u68D2", feed: "none", tint: "#F7CF16", melee: true, reach: 54, rate: 0.34, ammo: 0, lethal: true, noise: 60, throwLethal: false },
        katana: { name: "\u6B66\u58EB\u5200", feed: "none", tint: "#8A2BE2", melee: true, reach: 58, rate: 0.42, ammo: 0, lethal: true, noise: 68, throwLethal: false, katana: true, chargeMax: 1.15, dashDur: 0.24, dashReset: 0.24, dashSpeed: 1120, slashRadius: 23, blinkRange: 660, blinkRadius: 20 },
        quixote: { name: "\u5802\u5409\u67EF\u5FB7", feed: "none", tint: "#E40808", melee: true, reach: 64, rate: 0.46, ammo: 0, lethal: true, noise: 82, throwLethal: false, lance: true, chargeMax: 1.15, dashDur: 0.32, dashReset: 0.28, dashSpeed: 1060, slashRadius: 25, chargeExtend: 0.42, dashCap: 1.35 },
        pistol: { name: "\u624B\u67AA", feed: "stack", tint: "#00A651", melee: false, rate: 0.22, ammo: 7, pellets: 1, spread: 0.025, speed: 1150, noise: 360, kick: 4, shieldDmg: 1, eSpeed: 640, eRate: 1.05, eBurst: 2 },
        revolver: { name: "\u5DE6\u8F6E", feed: "drum", tint: "#E40808", melee: false, rate: 0.42, ammo: 6, pellets: 1, spread: 0.012, speed: 1320, noise: 470, kick: 9, pierce: 3, shieldDmg: 2, armourPierce: 1, throughDoors: true, eSpeed: 760, eRate: 1.5, eBurst: 1 },
        smg: { name: "\u51B2\u950B\u67AA", feed: "stagger", tint: "#4A44A0", melee: false, rate: 0.072, ammo: 28, pellets: 1, spread: 0.085, speed: 1080, noise: 320, kick: 2.4, shieldDmg: 1, eSpeed: 610, eRate: 0.85, eBurst: 4 },
        shotgun: { name: "\u9730\u5F39\u67AA", feed: "barrel", tint: "#EC0A63", melee: false, rate: 0.78, ammo: 2, pellets: 8, spread: 0.3, speed: 980, noise: 520, kick: 11, shieldDmg: 1, eSpeed: 520, eRate: 1.7, eBurst: 1 },
        ripper: { name: "\u6495\u88C2\u8005", feed: "stagger", tint: "#00A651", melee: false, rate: 0.078, ammo: 30, pellets: 1, spread: 0.075, speed: 1220, noise: 430, kick: 3.4, pierce: 2, shieldDmg: 1, throughWalls: true, eSpeed: 680, eRate: 1, eBurst: 5 },
        grenade: { name: "\u624B\u96F7", feed: "stack", tint: "#12A3DA", melee: false, rate: 0.42, ammo: 3, lobbed: true, fuse: 1.25, throwSpeed: 620, radius: 108, noise: 620, shieldDmg: 4, blastKill: 0.82, kick: 0, throwLethal: true },
        frag: { name: "\u7834\u7247\u624B\u96F7", feed: "stack", tint: "#F7CF16", melee: false, rate: 0.42, ammo: 3, lobbed: true, fuse: 1.1, throwSpeed: 660, radius: 82, noise: 700, shieldDmg: 2, blastKill: 0.62, shrapnel: 18, shrapnelSpeed: 900, kick: 0, throwLethal: true },
        flash: { name: "\u95EA\u5149\u5F39", feed: "stack", tint: "#F7CF16", melee: false, rate: 0.46, ammo: 3, lobbed: true, fuse: 0.82, throwSpeed: 690, radius: 168, noise: 520, flashbang: true, stun: 5.8, disarmChance: 0.34, panicChance: 0.18, shieldDmg: 1, kick: 0, throwLethal: false },
        sentryPack: { name: "\u54E8\u6212\u673A\u67AA\u90E8\u7F72\u5305", feed: "stack", tint: "#00A651", melee: false, rate: 0.48, ammo: 3, lobbed: true, fuse: 0.58, throwSpeed: 720, deploy: "sentry", deployRadius: 46, noise: 180, kick: 0, throwLethal: false },
        dronePack: { name: "\u6BD2\u8702\u65E0\u4EBA\u673A\u90E8\u7F72\u5305", feed: "stack", tint: "#F7CF16", melee: false, rate: 0.5, ammo: 3, lobbed: true, fuse: 0.58, throwSpeed: 720, deploy: "drones", deployRadius: 64, droneCount: 3, droneAmmo: 3, noise: 170, kick: 0, throwLethal: false },
        rocket: { name: "\u706B\u7BAD\u5F39", feed: "barrel", tint: "#EC0A63", melee: false, rate: 0.9, ammo: 3, pellets: 1, spread: 0.012, speed: 560, noise: 760, kick: 14, projectile: "rocket", radius: 132, shieldDmg: 5, armourPierce: 2, throughDoors: true, eSpeed: 420, eRate: 2.2, eBurst: 1, throwLethal: false },
        molotov: { name: "\u71C3\u70E7\u74F6", feed: "stack", tint: "#FF6A00", melee: false, rate: 0.48, ammo: 3, lobbed: true, fuse: 0.62, throwSpeed: 560, fire: true, fireRadius: 106, fireDur: 5.4, fireKill: 0.34, noise: 380, kick: 0, throwLethal: false },
        dart: { name: "\u75AF\u72C2\u6BD2\u9556", feed: "stack", tint: "#7AC943", melee: false, rate: 0.26, ammo: 8, pellets: 1, spread: 6e-3, speed: 1120, noise: 0, kick: 0, poison: true, statusEffect: "mad", mad: 7.2, silent: true, shieldDmg: 0, eSpeed: 690, eRate: 1, eBurst: 1 },
        tameDart: { name: "\u9A6F\u670D\u6BD2\u6807", feed: "stack", tint: "#8A2BE2", melee: false, rate: 0.3, ammo: 6, pellets: 1, spread: 6e-3, speed: 1100, noise: 0, kick: 0, tame: true, statusEffect: "tame", silent: true, shieldDmg: 0, eSpeed: 680, eRate: 1.05, eBurst: 1 },
        disguise: { name: "\u6697\u6740 \xB7 D", feed: "stack", tint: "#161513", melee: false, rate: 0.23, ammo: 9, pellets: 1, spread: 0.018, speed: 1160, noise: 240, kick: 3.2, disguise: true, shieldDmg: 1, eSpeed: 640, eRate: 1.05, eBurst: 2 },
        sniper: { name: "\u72D9\u51FB\u67AA", feed: "stack", tint: "#0047AB", melee: false, rate: 0.82, ammo: 5, pellets: 1, spread: 6e-4, speed: 7600, noise: 760, kick: 17, rail: true, pierce: 999, shieldDmg: 99, armourPierce: 99, throughDoors: true, life: 1.25, eSpeed: 3200, eRate: 2.4, eBurst: 1 },
        laser: { name: "\u5F39\u5F39\u6FC0\u5149\u67AA", feed: "stack", tint: "#00D6FF", melee: false, rate: 0.15, ammo: 18, pellets: 1, spread: 0.01, speed: 1320, noise: 300, kick: 2, ricochet: true, bounces: 6, shieldDmg: 1, life: 2.7, eSpeed: 900, eRate: 1.05, eBurst: 2 },
        butcher: { name: "\u5C60\u592B\u4E4B\u89E6", feed: "none", tint: "#E40808", melee: true, reach: 52, rate: 0.2, ammo: 0, lethal: true, noise: 88, throwLethal: true, sawLauncher: true, sawRate: 2.25 },
        sawblade: { name: "\u7535\u952F\u7247", feed: "none", tint: "#161513", melee: false, rate: 0, ammo: 0, throwSpeed: 980, noise: 150, kick: 0, throwLethal: true, blade: true, life: 14, noPickup: true },
        virus: { name: "\u4F20\u67D3\u75C5\u6BD2", feed: "stack", tint: "#7AC943", melee: false, rate: 0.42, ammo: 1, lobbed: true, fuse: 0.42, throwSpeed: 760, radius: 132, noise: 0, kick: 0, passive: true, statusEffect: "virus", virusCloud: true, silent: true, throwLethal: false, enemyUsable: false },
        copySauce: { name: "\u590D\u5236\u8638\u6599", feed: "stack", tint: "#00D6FF", melee: false, rate: 0.34, ammo: 1, noise: 0, kick: 0, copySauce: true, noThrow: true, silent: true, throwLethal: false, enemyUsable: false },
        madExtract: { name: "\u75AF\u72C2\u63D0\u53D6\u6DB2", feed: "stack", tint: "#7AC943", melee: false, rate: 0.34, ammo: 1, noise: 0, kick: 0, extract: true, extractEffect: "mad", noThrow: true, silent: true, throwLethal: false, enemyUsable: false },
        tameExtract: { name: "\u9A6F\u5316\u63D0\u53D6\u6DB2", feed: "stack", tint: "#8A2BE2", melee: false, rate: 0.34, ammo: 1, noise: 0, kick: 0, extract: true, extractEffect: "tame", noThrow: true, silent: true, throwLethal: false, enemyUsable: false },
        virusExtract: { name: "\u75C5\u6BD2\u63D0\u53D6\u6DB2", feed: "stack", tint: "#7AC943", melee: false, rate: 0.34, ammo: 1, noise: 0, kick: 0, extract: true, extractEffect: "virus", noThrow: true, silent: true, throwLethal: false, enemyUsable: false },
        shield: { name: "\u76FE\u724C", feed: "none", tint: "#12A3DA", melee: false, rate: 0, ammo: 0, noise: 0, kick: 0, defense: true, shieldArc: 1.34, durability: 5, throwSpeed: 760, throwLethal: false }
      };
      ENEMY_DEF = {
        strawman: { speed: 0, patrol: 0, cone: 0, range: 0, r: 11, turn: 0, keep: 0, passive: true, handless: true },
        thug: { speed: 158, patrol: 44, cone: 1.25, range: 340, r: 11, turn: 7, keep: 0 },
        gunner: { speed: 124, patrol: 36, cone: 1.05, range: 450, r: 11, turn: 6, keep: 230 },
        hound: { speed: 250, patrol: 62, cone: 1.6, range: 310, r: 9.5, turn: 12, keep: 0, handless: true },
        patroller: { speed: 150, patrol: 72, cone: 1.45, range: 620, r: 11, turn: 7.5, keep: 0, patrolAll: true },
        // the heavy body. armour is a separate property — see ARMOUR below.
        shield: { speed: 104, patrol: 30, cone: 1.15, range: 380, r: 14, turn: 3.6, keep: 0 }
      };
      SEG_SPAN = 0.42;
      SEGS_MAX = 5;
      plateBit = (e, layer, seg) => 1 << layer * e.segs + seg;
    }
  });

  // overprint/src/render.js
  init_util();
  init_level();

  // overprint/src/brand.js
  var PAPER = "#EFECE3";
  var INK = "#161513";
  var CYAN = "#12A3DA";
  var MAG = "#EC0A63";
  var YELLOW = "#F7CF16";
  var ink = (a) => `rgba(22, 21, 19, ${a})`;
  var WORDMARK = [
    [0, 0, 4, 14],
    [6.5, 0, 10, 3],
    [6.5, 3, 3, 3],
    [6.5, 6, 10, 3],
    [13.5, 9, 3, 2],
    [6.5, 11, 10, 3],
    [19, 0, 3, 14],
    [22, 5, 4, 4],
    [25, 0, 4, 6],
    [25, 8, 4, 6],
    [31.5, 0, 3, 14],
    [34.5, 0, 7, 3],
    [38.5, 3, 3, 3],
    [34.5, 6, 5, 3],
    [37.5, 9, 4, 5],
    [44, 0, 10, 3],
    [44, 3, 3, 11],
    [51, 3, 3, 11],
    [47, 7, 4, 3]
  ];
  var WORDMARK_RATIO = 54 / 14;
  function drawWordmark(g, x, y, height, color) {
    const k = height / 14;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    g.fillStyle = color;
    for (const [rx, ry, rw, rh] of WORDMARK) g.fillRect(rx, ry, rw, rh);
    g.restore();
  }
  var PLATES_MARK = [
    [0, 0, 128, 64, CYAN],
    [128, 0, 64, 64, PAPER],
    [192, 0, 128, 64, MAG],
    [128, 64, 64, 64, YELLOW],
    [192, 64, 64, 64, INK]
  ];
  var MARK_RATIO = 320 / 128;
  var LOCKUP_RATIO = 320 / 226;
  function drawLockup(g, x, y, width, color = INK) {
    const k = width / 320;
    drawPlateMark(g, x, y, width);
    drawWordmark(g, x + 40 * k, y + 164 * k, 14 * 4.4444 * k, color);
  }
  function drawPlateMark(g, x, y, width) {
    const k = width / 320;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    for (const [rx, ry, rw, rh, col] of PLATES_MARK) {
      g.fillStyle = col;
      g.fillRect(rx, ry, rw, rh);
    }
    g.restore();
  }

  // overprint/src/render.js
  init_entities();
  var ZOOM = 1.6;
  var PAPER2 = "#EFECE3";
  var INK2 = "#161513";
  var C = "#12A3DA";
  var M = "#EC0A63";
  var Y = "#F7CF16";
  var PLATES = [
    [C, 1, 0],
    [M, -0.5, 0.866],
    [Y, -0.5, -0.866]
  ];
  function grainTile() {
    const s = 180;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const img = g.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 190;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function createRenderer(canvas2) {
    const ctx2 = canvas2.getContext("2d");
    let W = 0, H = 0, dpr = 1;
    let levelCanvas = null, stainCanvas = null, stainCtx = null;
    let hatchDense = null, hatchMed = null;
    const grain = grainTile();
    let grainPat = null;
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas2.width = Math.floor(W * dpr);
      canvas2.height = Math.floor(H * dpr);
      canvas2.style.width = W + "px";
      canvas2.style.height = H + "px";
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      const minDim = Math.min(W, H);
      ZOOM = minDim / clamp(minDim * 0.62, 400, 570);
      grainPat = ctx2.createPattern(grain, "repeat");
    }
    resize();
    window.addEventListener("resize", resize);
    const STAIN_SS = 2;
    function bakeLevel(level) {
      levelCanvas = null;
      stainCanvas = document.createElement("canvas");
      stainCanvas.width = level.w * STAIN_SS;
      stainCanvas.height = level.h * STAIN_SS;
      stainCtx = stainCanvas.getContext("2d");
      stainCtx.setTransform(STAIN_SS, 0, 0, STAIN_SS, 0, 0);
      landed.length = 0;
    }
    function clearStains() {
      if (stainCtx) {
        stainCtx.save();
        stainCtx.setTransform(1, 0, 0, 1, 0, 0);
        stainCtx.clearRect(0, 0, stainCanvas.width, stainCanvas.height);
        stainCtx.restore();
      }
      landed.length = 0;
    }
    function shards(x, y, dx, dy) {
      if (!stainCtx) return;
      const g = stainCtx;
      g.fillStyle = INK2;
      for (let i = 0; i < 16; i++) {
        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.9;
        const d = 6 + Math.random() * 46;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        const r = 1 + Math.random() * 2.6;
        g.globalAlpha = 0.25 + Math.random() * 0.4;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a + 1.9) * r, py + Math.sin(a + 1.9) * r);
        g.lineTo(px + Math.cos(a - 1.2) * r * 1.7, py + Math.sin(a - 1.2) * r * 1.7);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
    }
    const landed = [];
    const MAX_LANDED = 160;
    function casing(x, y, ang) {
      landed.push({ x, y, ang });
      if (landed.length > MAX_LANDED) landed.shift();
    }
    function blob(g, cx, cy, r, jag) {
      const n = 10 + Math.floor(Math.random() * 6);
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = i / n * TAU;
        const rr = r * (1 - jag + Math.random() * jag * 2);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    }
    function splat(x, y, power, dx = 0, dy = 0, tint = M) {
      if (!stainCtx) return;
      const g = stainCtx;
      g.fillStyle = tint;
      g.strokeStyle = tint;
      let ux = dx, uy = dy;
      const l = Math.hypot(ux, uy);
      if (l < 0.01) {
        const a = Math.random() * TAU;
        ux = Math.cos(a);
        uy = Math.sin(a);
      } else {
        ux /= l;
        uy /= l;
      }
      const px = -uy, py = ux;
      g.globalAlpha = 0.82;
      blob(g, x, y, 4 + power * 6, 0.42);
      g.globalAlpha = 0.55;
      for (let i = 0; i < 3; i++) {
        const off = (Math.random() - 0.5) * power * 14;
        blob(
          g,
          x + px * off + ux * Math.random() * 8,
          y + py * off + uy * Math.random() * 8,
          (2.5 + Math.random() * 4) * (0.6 + power * 0.5),
          0.5
        );
      }
      const n = 7 + Math.floor(power * 11);
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        const spread = (Math.random() - 0.5) * 0.85;
        const d = 12 + t * power * 78;
        const cx = x + (ux + px * spread) * d;
        const cy = y + (uy + py * spread) * d;
        const r = (2.6 - t * 1.7) * (0.5 + power * 0.6) * (0.6 + Math.random() * 0.8);
        if (r < 0.35) continue;
        g.globalAlpha = 0.5 + (1 - t) * 0.3;
        blob(g, cx, cy, r, 0.55);
        if (r > 1.1) {
          g.lineWidth = r * 0.7;
          g.globalAlpha = 0.32;
          g.beginPath();
          g.moveTo(cx - ux * r * 2.6, cy - uy * r * 2.6);
          g.lineTo(cx, cy);
          g.stroke();
        }
      }
      g.globalAlpha = 0.4;
      for (let i = 0; i < 16 + power * 14; i++) {
        const a = Math.atan2(uy, ux) + (Math.random() - 0.5) * 2;
        const d = 8 + Math.random() * power * 92;
        const r = 0.4 + Math.random() * 0.9;
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    function plates(split, draw2) {
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const [col, ox, oy] of PLATES) {
        ctx2.save();
        ctx2.translate(ox * split, oy * split);
        ctx2.fillStyle = col;
        ctx2.strokeStyle = col;
        draw2(ctx2);
        ctx2.restore();
      }
      ctx2.restore();
    }
    function shapePlayer(g, p, aim) {
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, 15, 0, TAU);
      g.stroke();
      g.beginPath();
      g.arc(p.x, p.y, 9.5, 0, TAU);
      g.fill();
      g.save();
      g.translate(p.x, p.y);
      g.rotate(aim);
      g.beginPath();
      g.moveTo(6, -5.5);
      g.lineTo(20, 0);
      g.lineTo(6, 5.5);
      g.closePath();
      g.fill();
      g.restore();
    }
    function isDartWeapon(kind) {
      return kind === "dart" || kind === "tameDart" || kind === "virus";
    }
    function weaponSilhouette(g, kind) {
      switch (kind) {
        case "bat":
          g.fillRect(0, -1.6, 19, 3.2);
          g.fillRect(15, -3, 6, 6);
          break;
        case "knife":
          g.fillRect(-4, -1.6, 6, 3.2);
          g.beginPath();
          g.moveTo(2, -2.6);
          g.lineTo(16, 0);
          g.lineTo(2, 2.6);
          g.closePath();
          g.fill();
          break;
        case "katana":
          g.fillRect(-8, -1.7, 8, 3.4);
          g.fillRect(-12, -4.8, 3, 9.6);
          g.beginPath();
          g.moveTo(0, -2.4);
          g.lineTo(34, -1.1);
          g.lineTo(39, 0);
          g.lineTo(34, 1.1);
          g.lineTo(0, 2.4);
          g.closePath();
          g.fill();
          break;
        case "quixote":
          g.fillRect(-13, -2.1, 14, 4.2);
          g.beginPath();
          g.moveTo(0, -2.4);
          g.lineTo(42, 0);
          g.lineTo(0, 2.4);
          g.closePath();
          g.fill();
          g.fillRect(-17, -6.5, 4, 13);
          g.beginPath();
          g.moveTo(11, -2);
          g.lineTo(20, -11);
          g.lineTo(20, -2);
          g.closePath();
          g.fill();
          break;
        case "pistol":
          g.fillRect(0, -1.6, 11, 3.2);
          g.fillRect(1, 1, 3.4, 5);
          break;
        case "disguise":
          g.fillRect(0, -1.7, 12, 3.4);
          g.fillRect(1, 1, 3.5, 5);
          g.fillRect(8, -4.2, 2.2, 2.2);
          break;
        case "revolver":
          g.fillRect(0, -1.7, 15, 3.4);
          g.fillRect(1, 1, 3.4, 5);
          g.beginPath();
          g.arc(5, 0, 2.7, 0, TAU);
          g.fill();
          break;
        case "smg":
          g.fillRect(0, -1.8, 15, 3.6);
          g.fillRect(3, 1.2, 4, 7);
          g.fillRect(-4, -2.4, 5, 4.8);
          break;
        case "ripper":
          g.fillRect(-5, -2.1, 24, 4.2);
          g.fillRect(2, 1.5, 4.5, 8);
          g.fillRect(-9, -3, 6, 6);
          g.fillRect(18, -1, 10, 2);
          break;
        case "shotgun":
          g.fillRect(0, -2.1, 23, 4.2);
          g.fillRect(-4, -3, 6, 6);
          break;
        case "sniper":
          g.fillRect(-9, -2, 38, 4);
          g.fillRect(-13, -3.2, 8, 6.4);
          g.fillRect(28, -1.1, 13, 2.2);
          g.fillRect(2, -5.2, 11, 2.2);
          break;
        case "laser":
          g.fillRect(-4, -2.4, 22, 4.8);
          g.fillRect(0, 2.2, 5, 5.5);
          g.beginPath();
          g.moveTo(18, -4.5);
          g.lineTo(29, 0);
          g.lineTo(18, 4.5);
          g.closePath();
          g.fill();
          g.fillRect(7, -6, 5, 3);
          break;
        case "butcher":
          g.fillRect(-5, -2.5, 20, 5);
          g.fillRect(13, -4.5, 10, 9);
          g.lineWidth = 1.5;
          for (let i = 0; i < 5; i++) {
            g.beginPath();
            g.moveTo(15 + i * 1.7, -5);
            g.lineTo(16 + i * 1.7, -7);
            g.stroke();
            g.beginPath();
            g.moveTo(15 + i * 1.7, 5);
            g.lineTo(16 + i * 1.7, 7);
            g.stroke();
          }
          break;
        case "sawblade":
          g.lineWidth = 2;
          g.beginPath();
          g.arc(0, 0, 8, 0, TAU);
          g.stroke();
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8;
            g.beginPath();
            g.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
            g.lineTo(Math.cos(a + 0.16) * 12, Math.sin(a + 0.16) * 12);
            g.lineTo(Math.cos(a - 0.16) * 12, Math.sin(a - 0.16) * 12);
            g.closePath();
            g.fill();
          }
          break;
        case "shield":
          g.lineWidth = 2.4;
          g.beginPath();
          g.arc(7, 0, 13, -1.05, 1.05);
          g.stroke();
          g.fillRect(-4, -6, 6, 12);
          break;
        case "grenade":
          g.beginPath();
          g.arc(3, 0, 5.4, 0, TAU);
          g.fill();
          g.fillRect(-3, -6.8, 8, 2.4);
          g.fillRect(-6, -5.6, 3.2, 5.2);
          break;
        case "frag":
          g.fillRect(-3.5, -5.4, 10.8, 10.8);
          g.fillRect(-5, -7.3, 8, 2.4);
          g.fillRect(-7.5, -5.4, 3.3, 5.1);
          break;
        case "flash":
          g.fillRect(-5.2, -5.2, 11, 10.4);
          g.fillRect(-7.4, -7.2, 8, 2.4);
          g.lineWidth = 1.6;
          g.beginPath();
          g.arc(4, 0, 7.2, -0.95, 0.95);
          g.stroke();
          break;
        case "sentryPack":
          g.fillRect(-8, -6, 16, 12);
          g.fillRect(-4, -10, 8, 4);
          g.beginPath();
          g.arc(0, 0, 4.6, 0, TAU);
          g.stroke();
          g.fillRect(4, -1.4, 15, 2.8);
          break;
        case "dronePack":
          g.fillRect(-8, -5.4, 16, 10.8);
          g.beginPath();
          g.arc(-4, 0, 2, 0, TAU);
          g.arc(0, 0, 2, 0, TAU);
          g.arc(4, 0, 2, 0, TAU);
          g.fill();
          g.fillRect(-13, -1.5, 5, 3);
          g.fillRect(8, -1.5, 5, 3);
          break;
        case "rocket":
          g.fillRect(-6, -2.8, 23, 5.6);
          g.beginPath();
          g.moveTo(18, -5.2);
          g.lineTo(27, 0);
          g.lineTo(18, 5.2);
          g.closePath();
          g.fill();
          g.fillRect(-11, -5.2, 5, 10.4);
          break;
        case "molotov":
          g.fillRect(-5, -3.2, 14, 6.4);
          g.fillRect(7, -1.7, 9, 3.4);
          g.beginPath();
          g.moveTo(16, 0);
          g.lineTo(23, -5);
          g.lineTo(21, 0);
          g.lineTo(23, 5);
          g.closePath();
          g.fill();
          break;
        case "dart":
        case "tameDart":
          g.lineWidth = 2.2;
          g.beginPath();
          g.moveTo(-7, 0);
          g.lineTo(16, 0);
          g.stroke();
          g.beginPath();
          g.moveTo(18, 0);
          g.lineTo(10, -3.8);
          g.lineTo(10, 3.8);
          g.closePath();
          g.fill();
          g.fillRect(-8, -4.5, 3, 9);
          break;
        case "virus":
          g.lineWidth = 1.8;
          g.beginPath();
          g.arc(1, 0, 7, 0, TAU);
          g.stroke();
          g.beginPath();
          g.arc(-2, -2, 2, 0, TAU);
          g.arc(4, 3, 2.4, 0, TAU);
          g.fill();
          g.fillRect(0, -10, 2, 20);
          g.fillRect(-9, -1, 20, 2);
          break;
        case "copySauce":
        case "madExtract":
        case "tameExtract":
        case "virusExtract":
          g.lineWidth = 1.8;
          g.strokeRect(-5.5, -9, 11, 18);
          g.fillRect(-3.2, -13, 6.4, 4);
          if (kind === "copySauce") {
            g.beginPath();
            g.arc(0, 0, 4.8, 0.35, TAU * 0.82);
            g.stroke();
            g.beginPath();
            g.moveTo(5, -1);
            g.lineTo(8.5, -3.5);
            g.lineTo(7.2, 1.5);
            g.closePath();
            g.fill();
          } else {
            g.beginPath();
            g.arc(-2.2, -1, 2.1, 0, TAU);
            g.arc(2.8, 3, 1.8, 0, TAU);
            g.fill();
          }
          break;
        default:
          break;
      }
    }
    function drawFireZones(game2) {
      if (!game2.fireZones || !game2.fireZones.length) return;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const z of game2.fireZones) {
        const live = clamp(1 - z.t / z.dur, 0, 1);
        if (live <= 0) continue;
        const flicker = 0.86 + Math.sin(game2.time * 18 + z.x * 0.03 + z.y * 0.02) * 0.14;
        const r = z.r * (0.9 + 0.08 * flicker);
        ctx2.globalAlpha = 0.13 * live;
        ctx2.fillStyle = "#FF6A00";
        ctx2.beginPath();
        ctx2.arc(z.x, z.y, r, 0, TAU);
        ctx2.fill();
        ctx2.globalAlpha = 0.22 * live;
        ctx2.strokeStyle = "#FF6A00";
        ctx2.lineWidth = 2.4;
        ctx2.beginPath();
        ctx2.arc(z.x, z.y, r * 0.96, 0, TAU);
        ctx2.stroke();
        ctx2.globalAlpha = 0.32 * live;
        ctx2.fillStyle = Y;
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8 + Math.sin(game2.time * 4 + i) * 0.18;
          const rr = r * (0.18 + i * 37 % 61 / 100);
          const x = z.x + Math.cos(a) * rr;
          const y = z.y + Math.sin(a) * rr;
          ctx2.beginPath();
          ctx2.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
          ctx2.lineTo(x + Math.cos(a + 2.2) * 4, y + Math.sin(a + 2.2) * 4);
          ctx2.lineTo(x + Math.cos(a - 2.2) * 4, y + Math.sin(a - 2.2) * 4);
          ctx2.closePath();
          ctx2.fill();
        }
      }
      ctx2.restore();
    }
    function drawMadMarkers(game2) {
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.state === S_DOWN) continue;
        const def = ENEMY_DEF[e.type];
        const pulse = 1 + Math.sin(game2.time * 13 + e.x * 0.01) * 0.11;
        if (e.infectT > 0) {
          ctx2.globalAlpha = 0.58;
          ctx2.strokeStyle = WEAPONS.virus.tint;
          ctx2.lineWidth = 1.8;
          ctx2.beginPath();
          ctx2.arc(e.x, e.y, (def.r + 14) * pulse, 0, TAU);
          ctx2.stroke();
        }
        if (e.friendly) {
          ctx2.globalAlpha = 0.74;
          ctx2.strokeStyle = WEAPONS.tameDart.tint;
          ctx2.lineWidth = 2;
          ctx2.beginPath();
          ctx2.arc(e.x, e.y, (def.r + 9) * pulse, 0, TAU);
          ctx2.stroke();
          continue;
        }
        if (e.madT <= 0) continue;
        ctx2.globalAlpha = 0.78;
        ctx2.strokeStyle = "#7AC943";
        ctx2.lineWidth = 2.2;
        ctx2.beginPath();
        ctx2.arc(e.x, e.y, (def.r + 11) * pulse, 0, TAU);
        ctx2.stroke();
        ctx2.globalAlpha = 0.55;
        ctx2.strokeStyle = Y;
        ctx2.lineWidth = 1.4;
        ctx2.beginPath();
        ctx2.arc(e.x, e.y, def.r + 17, e.angle - 1.1, e.angle + 1.1);
        ctx2.stroke();
      }
      ctx2.restore();
    }
    function traceBulletPath(game2, x, y, angle, reach = 2600) {
      let endX = x + Math.cos(angle) * reach;
      let endY = y + Math.sin(angle) * reach;
      for (let st = 14; st < reach; st += 7) {
        const px = x + Math.cos(angle) * st;
        const py = y + Math.sin(angle) * st;
        if (game2.level.bulletBlockedAt(px, py)) {
          endX = px;
          endY = py;
          break;
        }
      }
      return { x: endX, y: endY };
    }
    function drawSniperLaser(game2) {
      const p = game2.player;
      if (!p.alive || game2.state !== "play" || p.weapon !== "sniper") return;
      const sx = p.x + Math.cos(p.aim) * 19;
      const sy = p.y + Math.sin(p.aim) * 19;
      const end = traceBulletPath(game2, sx, sy, p.aim, 3200);
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.strokeStyle = "#E40808";
      ctx2.lineCap = "square";
      ctx2.globalAlpha = 0.18 + 0.08 * Math.sin(game2.time * 14);
      ctx2.lineWidth = 5.5;
      ctx2.beginPath();
      ctx2.moveTo(sx, sy);
      ctx2.lineTo(end.x, end.y);
      ctx2.stroke();
      ctx2.globalAlpha = 0.76;
      ctx2.lineWidth = 1.2;
      ctx2.beginPath();
      ctx2.moveTo(sx, sy);
      ctx2.lineTo(end.x, end.y);
      ctx2.stroke();
      ctx2.globalAlpha = 0.85;
      ctx2.beginPath();
      ctx2.arc(end.x, end.y, 3.5, 0, TAU);
      ctx2.fillStyle = "#E40808";
      ctx2.fill();
      ctx2.restore();
    }
    function drawThrowPreview(game2) {
      const pv = game2.throwPreview;
      if (!pv || !pv.points || pv.points.length < 2 || game2.state !== "play") return;
      const tint = WEAPONS[pv.kind]?.tint || M;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.lineCap = "square";
      if (pv.rangeMode && pv.maxRange && pv.originX != null) {
        ctx2.globalAlpha = 0.11 + pv.charge * 0.08;
        ctx2.strokeStyle = tint;
        ctx2.lineWidth = 1.1;
        ctx2.setLineDash([7, 12]);
        ctx2.beginPath();
        ctx2.arc(pv.originX, pv.originY, pv.maxRange, 0, TAU);
        ctx2.stroke();
      }
      ctx2.setLineDash([10, 8]);
      ctx2.lineWidth = 1.7 + pv.charge * 1.1;
      ctx2.strokeStyle = tint;
      ctx2.globalAlpha = 0.42 + pv.charge * 0.25;
      ctx2.beginPath();
      ctx2.moveTo(pv.points[0].x, pv.points[0].y);
      for (let i = 1; i < pv.points.length; i++) ctx2.lineTo(pv.points[i].x, pv.points[i].y);
      ctx2.stroke();
      ctx2.setLineDash([]);
      if (pv.lotus) {
        const pulse = 1 + Math.sin(game2.time * 11) * 0.08;
        ctx2.globalAlpha = 0.78;
        ctx2.strokeStyle = tint;
        ctx2.lineWidth = 1.7;
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + game2.time * 0.45;
          ctx2.beginPath();
          ctx2.arc(pv.x + Math.cos(a) * 8 * pulse, pv.y + Math.sin(a) * 8 * pulse, 5.2, 0, TAU);
          ctx2.stroke();
        }
        ctx2.globalAlpha = 0.9;
        ctx2.fillStyle = tint;
        ctx2.beginPath();
        ctx2.arc(pv.x, pv.y, 3.8, 0, TAU);
        ctx2.fill();
        ctx2.globalAlpha = 0.62;
        ctx2.beginPath();
        ctx2.arc(pv.x, pv.y, pv.radius || 20, 0, TAU);
        ctx2.stroke();
        ctx2.restore();
        return;
      }
      ctx2.globalAlpha = 0.18 + pv.charge * 0.16;
      ctx2.fillStyle = tint;
      ctx2.beginPath();
      ctx2.arc(pv.x, pv.y, pv.radius, 0, TAU);
      ctx2.fill();
      ctx2.globalAlpha = 0.68;
      ctx2.strokeStyle = tint;
      ctx2.lineWidth = pv.explosive ? 2.2 : 1.5;
      ctx2.beginPath();
      ctx2.arc(pv.x, pv.y, pv.radius, 0, TAU);
      ctx2.stroke();
      ctx2.globalAlpha = 0.9;
      ctx2.beginPath();
      ctx2.moveTo(pv.x - 9, pv.y);
      ctx2.lineTo(pv.x + 9, pv.y);
      ctx2.moveTo(pv.x, pv.y - 9);
      ctx2.lineTo(pv.x, pv.y + 9);
      ctx2.stroke();
      ctx2.font = '600 9px "IBM Plex Mono", ui-monospace, monospace';
      ctx2.textAlign = "center";
      ctx2.fillStyle = tint;
      const label = WEAPONS[pv.kind]?.deploy ? "\u90E8\u7F72" : pv.rangeMode ? `\u8303\u56F4 ${Math.round(pv.charge * 100)}%` : "\u6295\u63B7";
      ctx2.fillText(label, pv.x, pv.y - pv.radius - 10);
      ctx2.restore();
    }
    function drawKatanaCharge(game2) {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      if (!p.alive || game2.state !== "play" || !w?.katana && !w?.lance || !game2.input.fire || p.katanaT > 0) return;
      const t = clamp(game2.throwCharge / (w.chargeMax || 1.15), 0, 1);
      if (t <= 0.01) return;
      const tint = w.tint || M;
      const bw = 52, bh = 5;
      const bx = p.x - bw / 2, by = p.y - 35;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.strokeStyle = tint;
      ctx2.fillStyle = tint;
      ctx2.globalAlpha = 0.26;
      ctx2.fillRect(bx, by, bw, bh);
      ctx2.globalAlpha = 0.86;
      ctx2.fillRect(bx, by, bw * t, bh);
      ctx2.globalAlpha = 0.72;
      ctx2.lineWidth = 1.2;
      ctx2.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, bw, bh);
      const n = 10 + Math.floor(t * 8);
      for (let i = 0; i < n; i++) {
        const phase = (game2.time * (0.7 + t * 0.9) + i * 0.071) % 1;
        const pull = clamp(t * 0.82 + phase * 0.28, 0, 1);
        const r = lerp(46, 12, pull) + Math.sin(game2.time * 8 + i) * 2.2;
        const a = i * TAU / n - game2.time * (1.7 + t * 2.2);
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        ctx2.globalAlpha = 0.2 + t * 0.58;
        ctx2.beginPath();
        ctx2.arc(x, y, 1.5 + t * 1.8, 0, TAU);
        ctx2.fill();
      }
      if (t >= 0.98) {
        ctx2.globalAlpha = 0.48 + 0.18 * Math.sin(game2.time * 16);
        ctx2.lineWidth = 2;
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, 24, 0, TAU);
        ctx2.stroke();
      }
      ctx2.restore();
    }
    function drawEnemyIndicators(game2) {
      const p = game2.player;
      if (!p.alive || game2.state !== "play") return;
      const binCount = 36;
      const bins = /* @__PURE__ */ new Set();
      const arrows = [];
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.friendly) continue;
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const bin = Math.round((a + TAU) / (TAU / binCount)) % binCount;
        if (bins.has(bin)) continue;
        bins.add(bin);
        arrows.push(a);
      }
      if (!arrows.length) return;
      const r = 68;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.fillStyle = M;
      ctx2.strokeStyle = M;
      ctx2.lineWidth = 1.4;
      for (const a of arrows) {
        const pulse = 1 + Math.sin(game2.time * 5 + a * 3) * 0.08;
        ctx2.save();
        ctx2.translate(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        ctx2.rotate(a);
        ctx2.scale(pulse, pulse);
        ctx2.globalAlpha = 0.78;
        ctx2.beginPath();
        ctx2.moveTo(11, 0);
        ctx2.lineTo(-4, -6);
        ctx2.lineTo(-1, 0);
        ctx2.lineTo(-4, 6);
        ctx2.closePath();
        ctx2.fill();
        ctx2.globalAlpha = 0.38;
        ctx2.beginPath();
        ctx2.moveTo(-9, -5);
        ctx2.lineTo(2, 0);
        ctx2.lineTo(-9, 5);
        ctx2.stroke();
        ctx2.restore();
      }
      ctx2.restore();
    }
    const CURSOR = [[15, 0], [-8, -8], [-4, 0], [-8, 8]];
    function cursorPath(g, scale = 1) {
      g.beginPath();
      for (let i = 0; i < CURSOR.length; i++) {
        const [x, y] = CURSOR[i];
        if (i) g.lineTo(x * scale, y * scale);
        else g.moveTo(x * scale, y * scale);
      }
      g.closePath();
    }
    function bodyShape(g, e) {
      if (e.type === "strawman") {
        g.lineWidth = 2;
        g.strokeRect(-9, -9, 18, 18);
        g.beginPath();
        g.moveTo(-13, 0);
        g.lineTo(13, 0);
        g.moveTo(0, -13);
        g.lineTo(0, 13);
        g.stroke();
      } else if (e.type === "gunner") {
        g.fillRect(-8.5, -8.5, 17, 17);
      } else if (e.type === "shield") {
        g.fillRect(-13, -13, 26, 26);
      } else if (e.type === "patroller") {
        g.beginPath();
        g.moveTo(0, -13);
        g.lineTo(12, -5);
        g.lineTo(12, 5);
        g.lineTo(0, 13);
        g.lineTo(-12, 5);
        g.lineTo(-12, -5);
        g.closePath();
        g.fill();
        g.fillRect(5, -2, 12, 4);
      } else if (e.type === "hound") {
        cursorPath(g, 1);
        g.fill();
      } else {
        g.fillRect(-9.5, -9.5, 19, 19);
      }
    }
    function shapeEnemy(g, e) {
      const def = ENEMY_DEF[e.type];
      g.save();
      g.translate(e.x, e.y);
      if (e.state === S_DEAD) {
        g.globalAlpha = 0.58;
        g.rotate(e.deadAngle || e.angle);
        bodyShape(g, e);
        g.restore();
        return;
      }
      if (e.state === S_DOWN) {
        g.globalAlpha = 0.46;
        g.rotate(e.angle);
        bodyShape(g, e);
        g.restore();
        return;
      }
      g.rotate(e.angle);
      bodyShape(g, e);
      if (e.type === "hound" && e.windup > 0) {
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, 18, -0.95, 0.95);
        g.stroke();
      }
      if (e.armour > 0 && e.shieldSeg) {
        const arc = armourArc(e);
        const span = arc * 2 / e.segs;
        g.lineWidth = e.blockFlash > 0 ? 3.4 : 2.6;
        for (let L = 0; L < e.layers; L++) {
          const rad = def.r + 6.5 + L * 4.6;
          for (let i = 0; i < e.segs; i++) {
            if (!(e.shieldSeg & 1 << L * e.segs + i)) continue;
            g.beginPath();
            g.arc(0, 0, rad, -arc + i * span + 0.055, -arc + (i + 1) * span - 0.055);
            g.stroke();
          }
        }
      }
      g.restore();
    }
    function drawWeapon(g, x, y, angle, kind, alpha = 1) {
      const w = WEAPONS[kind];
      if (!w || !w.tint) return;
      g.save();
      g.globalCompositeOperation = "multiply";
      g.globalAlpha = alpha;
      g.fillStyle = w.tint;
      g.strokeStyle = w.tint;
      g.translate(x, y);
      g.rotate(angle);
      weaponSilhouette(g, kind);
      g.restore();
    }
    function drawHeldWeapons(game2) {
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.state === S_DOWN) continue;
        if (!e.weapon || e.weapon === "fists") continue;
        const def = ENEMY_DEF[e.type];
        const off = e.type === "shield" ? 11 : 7;
        const hx = e.x + Math.cos(e.angle) * (def.r + 1) - Math.sin(e.angle) * off;
        const hy = e.y + Math.sin(e.angle) * (def.r + 1) + Math.cos(e.angle) * off;
        drawWeapon(ctx2, hx, hy, e.angle, e.weapon);
      }
      const p = game2.player;
      if (p.alive && p.weapon !== "fists") {
        const hx = p.x + Math.cos(p.aim) * 11 - Math.sin(p.aim) * 7;
        const hy = p.y + Math.sin(p.aim) * 11 + Math.cos(p.aim) * 7;
        drawWeapon(ctx2, hx, hy, p.aim, p.weapon);
      }
    }
    function drawDeployables(game2) {
      const smg = WEAPONS.smg;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const d of game2.pools.deploys || []) {
        if (!d.alive) continue;
        const pct = clamp(d.ammo / smg.ammo, 0, 1);
        ctx2.save();
        ctx2.translate(d.x, d.y);
        ctx2.rotate(d.angle || 0);
        ctx2.strokeStyle = WEAPONS.sentryPack.tint;
        ctx2.fillStyle = WEAPONS.sentryPack.tint;
        ctx2.globalAlpha = 0.9;
        ctx2.fillRect(-9, -7, 18, 14);
        ctx2.globalAlpha = 0.45;
        ctx2.beginPath();
        ctx2.arc(0, 0, 13, 0, TAU);
        ctx2.stroke();
        ctx2.globalAlpha = 1;
        ctx2.fillRect(1, -2.2, 25, 4.4);
        ctx2.fillRect(-4, -10, 8, 4);
        ctx2.globalAlpha = 0.72;
        ctx2.beginPath();
        ctx2.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
        ctx2.stroke();
        ctx2.restore();
      }
      for (const d of game2.pools.drones || []) {
        if (!d.alive) continue;
        const pct = clamp(d.ammo / (WEAPONS.dronePack.droneAmmo || 3), 0, 1);
        ctx2.save();
        ctx2.translate(d.x, d.y);
        ctx2.rotate(d.angle || 0);
        ctx2.strokeStyle = WEAPONS.dronePack.tint;
        ctx2.fillStyle = WEAPONS.dronePack.tint;
        ctx2.globalAlpha = 0.86;
        ctx2.beginPath();
        ctx2.moveTo(8, 0);
        ctx2.lineTo(0, -7);
        ctx2.lineTo(-8, 0);
        ctx2.lineTo(0, 7);
        ctx2.closePath();
        ctx2.fill();
        ctx2.globalAlpha = 0.42;
        ctx2.beginPath();
        ctx2.arc(-9, -7, 4, 0, TAU);
        ctx2.arc(-9, 7, 4, 0, TAU);
        ctx2.arc(9, -7, 4, 0, TAU);
        ctx2.arc(9, 7, 4, 0, TAU);
        ctx2.stroke();
        ctx2.globalAlpha = 0.9;
        ctx2.fillRect(5, -1.5, 11, 3);
        ctx2.globalAlpha = 0.66;
        ctx2.beginPath();
        ctx2.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
        ctx2.stroke();
        ctx2.restore();
      }
      ctx2.restore();
    }
    function drawPlayerShield(game2) {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      if (!p.alive || !w || !w.defense) return;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.strokeStyle = w.tint || C;
      ctx2.globalAlpha = p.blockFlash > 0 ? 0.95 : 0.58;
      ctx2.lineWidth = p.blockFlash > 0 ? 5 : 3;
      const arc = w.shieldArc || 1.28;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, 24, p.aim - arc, p.aim + arc);
      ctx2.stroke();
      ctx2.globalAlpha = 0.18;
      ctx2.fillStyle = w.tint || C;
      ctx2.beginPath();
      ctx2.moveTo(p.x, p.y);
      ctx2.arc(p.x, p.y, 31, p.aim - arc, p.aim + arc);
      ctx2.closePath();
      ctx2.fill();
      ctx2.restore();
    }
    function drawSleepers(game2) {
      const t = game2.time;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.fillStyle = INK2;
      ctx2.textAlign = "left";
      ctx2.textBaseline = "alphabetic";
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state !== S_DOWN) continue;
        const k = clamp(1 - e.downTimer / 1.7, 0, 1);
        const n = Math.min(3, 1 + Math.floor(k * 3));
        const bob = Math.sin(t * 2.2 + e.x * 0.02) * 1.6;
        for (let i = 0; i < n; i++) {
          const size = 9 + i * 3.5;
          const grown = i === n - 1 ? clamp(k * 3 % 1, 0, 1) : 1;
          ctx2.globalAlpha = i < n - 1 ? 0.72 : 0.3 + 0.42 * grown;
          ctx2.font = `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
          ctx2.save();
          ctx2.translate(e.x + 9 + i * 8.5, e.y - 16 - i * 9 + bob);
          ctx2.rotate(-0.18 - i * 0.06);
          ctx2.fillText("Z", 0, 0);
          ctx2.restore();
        }
      }
      ctx2.globalAlpha = 1;
      ctx2.restore();
    }
    function plateLines(path, angDeg, step, color, x0, y0, x1, y1, lw = 1) {
      const a = angDeg * Math.PI / 180;
      const dx = Math.cos(a), dy = Math.sin(a);
      const nx = -dy, ny = dx;
      const cs = [
        x0 * nx + y0 * ny,
        x1 * nx + y0 * ny,
        x0 * nx + y1 * ny,
        x1 * nx + y1 * ny
      ];
      const cMin = Math.min(...cs), cMax = Math.max(...cs);
      const L = Math.hypot(x1 - x0, y1 - y0) * 1.2;
      ctx2.save();
      ctx2.clip(path);
      ctx2.strokeStyle = color;
      ctx2.lineWidth = lw / ZOOM;
      ctx2.beginPath();
      for (let c = Math.floor(cMin / step) * step; c <= cMax; c += step) {
        const px = nx * c, py = ny * c;
        ctx2.moveTo(px - dx * L, py - dy * L);
        ctx2.lineTo(px + dx * L, py + dy * L);
      }
      ctx2.stroke();
      ctx2.restore();
    }
    function drawLevelLive(game2, cam) {
      const lv = game2.level;
      const halfW = W / (2 * ZOOM), halfH = H / (2 * ZOOM);
      const x0 = cam.x - halfW - TILE, y0 = cam.y - halfH - TILE;
      const x1 = cam.x + halfW + TILE, y1 = cam.y + halfH + TILE;
      const gx0 = Math.floor(x0 / TILE), gy0 = Math.floor(y0 / TILE);
      const gx1 = Math.ceil(x1 / TILE), gy1 = Math.ceil(y1 / TILE);
      const raw = (gx, gy) => gx < 0 || gy < 0 || gx >= lv.gw || gy >= lv.gh ? T_WALL : lv.tiles[gy * lv.gw + gx];
      const open = (gx, gy) => {
        const t = raw(gx, gy);
        return t === T_FLOOR || t === T_DOOR || t === T_WINDOW;
      };
      const wall = new Path2D(), furn = new Path2D();
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const t = raw(gx, gy);
          if (t === T_WALL) wall.rect(gx * TILE, gy * TILE, TILE, TILE);
          else if (t === T_FURNITURE) furn.rect(gx * TILE, gy * TILE, TILE, TILE);
        }
      }
      ctx2.fillStyle = ink(0.24);
      ctx2.fill(wall);
      const GRID = TILE * 5;
      ctx2.save();
      ctx2.clip(wall);
      ctx2.lineWidth = 1 / ZOOM;
      ctx2.strokeStyle = CYAN;
      ctx2.beginPath();
      for (let gxp = Math.floor(x0 / GRID) * GRID; gxp <= x1; gxp += GRID) {
        ctx2.moveTo(gxp, y0);
        ctx2.lineTo(gxp, y1);
      }
      ctx2.stroke();
      ctx2.strokeStyle = MAG;
      ctx2.beginPath();
      for (let gyp = Math.floor(y0 / GRID) * GRID; gyp <= y1; gyp += GRID) {
        ctx2.moveTo(x0, gyp);
        ctx2.lineTo(x1, gyp);
      }
      ctx2.stroke();
      ctx2.strokeStyle = YELLOW;
      ctx2.lineWidth = 1.4 / ZOOM;
      ctx2.beginPath();
      const arm = 7;
      for (let gxp = Math.floor(x0 / GRID) * GRID; gxp <= x1; gxp += GRID) {
        for (let gyp = Math.floor(y0 / GRID) * GRID; gyp <= y1; gyp += GRID) {
          ctx2.moveTo(gxp - arm, gyp);
          ctx2.lineTo(gxp + arm, gyp);
          ctx2.moveTo(gxp, gyp - arm);
          ctx2.lineTo(gxp, gyp + arm);
        }
      }
      ctx2.stroke();
      ctx2.restore();
      ctx2.fillStyle = ink(0.085);
      ctx2.fill(furn);
      ctx2.save();
      ctx2.strokeStyle = INK2;
      ctx2.lineWidth = 2.4 / ZOOM;
      ctx2.beginPath();
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const t = raw(gx, gy);
          if (t === T_FLOOR || t === T_DOOR || t === T_WINDOW) continue;
          const x = gx * TILE, y = gy * TILE;
          if (open(gx, gy - 1)) {
            ctx2.moveTo(x, y);
            ctx2.lineTo(x + TILE, y);
          }
          if (open(gx, gy + 1)) {
            ctx2.moveTo(x, y + TILE);
            ctx2.lineTo(x + TILE, y + TILE);
          }
          if (open(gx - 1, gy)) {
            ctx2.moveTo(x, y);
            ctx2.lineTo(x, y + TILE);
          }
          if (open(gx + 1, gy)) {
            ctx2.moveTo(x + TILE, y);
            ctx2.lineTo(x + TILE, y + TILE);
          }
          if (t === T_FURNITURE) {
            if (raw(gx, gy - 1) !== T_FURNITURE) {
              ctx2.moveTo(x, y);
              ctx2.lineTo(x + TILE, y);
            }
            if (raw(gx, gy + 1) !== T_FURNITURE) {
              ctx2.moveTo(x, y + TILE);
              ctx2.lineTo(x + TILE, y + TILE);
            }
            if (raw(gx - 1, gy) !== T_FURNITURE) {
              ctx2.moveTo(x, y);
              ctx2.lineTo(x, y + TILE);
            }
            if (raw(gx + 1, gy) !== T_FURNITURE) {
              ctx2.moveTo(x + TILE, y);
              ctx2.lineTo(x + TILE, y + TILE);
            }
          }
        }
      }
      ctx2.stroke();
      ctx2.strokeStyle = ink(0.3);
      ctx2.lineWidth = 1 / ZOOM;
      ctx2.beginPath();
      const IN = 4;
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (raw(gx, gy) !== T_FURNITURE) continue;
          const x = gx * TILE, y = gy * TILE;
          if (raw(gx, gy - 1) !== T_FURNITURE) {
            ctx2.moveTo(x, y + IN);
            ctx2.lineTo(x + TILE, y + IN);
          }
          if (raw(gx, gy + 1) !== T_FURNITURE) {
            ctx2.moveTo(x, y + TILE - IN);
            ctx2.lineTo(x + TILE, y + TILE - IN);
          }
          if (raw(gx - 1, gy) !== T_FURNITURE) {
            ctx2.moveTo(x + IN, y);
            ctx2.lineTo(x + IN, y + TILE);
          }
          if (raw(gx + 1, gy) !== T_FURNITURE) {
            ctx2.moveTo(x + TILE - IN, y);
            ctx2.lineTo(x + TILE - IN, y + TILE);
          }
        }
      }
      ctx2.stroke();
      ctx2.restore();
      ctx2.save();
      for (const r of lv.rooms) {
        const rx = r.x * TILE, ry = r.y * TILE, rw = r.w * TILE, rh = r.h * TILE;
        if (rx > x1 || ry > y1 || rx + rw < x0 || ry + rh < y0) continue;
        ctx2.save();
        ctx2.beginPath();
        ctx2.rect(rx, ry, rw, rh);
        ctx2.clip();
        ctx2.strokeStyle = ink(0.055);
        ctx2.lineWidth = 1 / ZOOM;
        ctx2.beginPath();
        for (let gx = r.x; gx <= r.x + r.w; gx += 2) {
          ctx2.moveTo(gx * TILE, ry);
          ctx2.lineTo(gx * TILE, ry + rh);
        }
        for (let gy = r.y; gy <= r.y + r.h; gy += 2) {
          ctx2.moveTo(rx, gy * TILE);
          ctx2.lineTo(rx + rw, gy * TILE);
        }
        ctx2.stroke();
        ctx2.restore();
        ctx2.strokeStyle = ink(0.13);
        ctx2.lineWidth = 1 / ZOOM;
        ctx2.strokeRect(rx + 5, ry + 5, rw - 10, rh - 10);
        ctx2.strokeStyle = ink(0.3);
        ctx2.beginPath();
        const T2 = 9;
        [[rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
          ctx2.moveTo(cx2 + sx * 3, cy2 + sy * 3);
          ctx2.lineTo(cx2 + sx * T2, cy2 + sy * 3);
          ctx2.moveTo(cx2 + sx * 3, cy2 + sy * 3);
          ctx2.lineTo(cx2 + sx * 3, cy2 + sy * T2);
        });
        ctx2.stroke();
        const mx = (r.x + r.w / 2) * TILE, my = (r.y + r.h / 2) * TILE;
        ctx2.strokeStyle = ink(0.22);
        ctx2.beginPath();
        ctx2.moveTo(mx - 10, my);
        ctx2.lineTo(mx - 3.5, my);
        ctx2.moveTo(mx + 3.5, my);
        ctx2.lineTo(mx + 10, my);
        ctx2.moveTo(mx, my - 10);
        ctx2.lineTo(mx, my - 3.5);
        ctx2.moveTo(mx, my + 3.5);
        ctx2.lineTo(mx, my + 10);
        ctx2.stroke();
        ctx2.beginPath();
        ctx2.arc(mx, my, 6, 0, TAU);
        ctx2.stroke();
      }
      ctx2.restore();
    }
    function draw(game2) {
      const cam = game2.camera;
      const split = game2.plateSplit;
      ctx2.fillStyle = PAPER2;
      ctx2.fillRect(0, 0, W, H);
      ctx2.save();
      let ox = W / 2 - cam.x * ZOOM;
      let oy = H / 2 - cam.y * ZOOM;
      ox = Math.round(ox * dpr) / dpr;
      oy = Math.round(oy * dpr) / dpr;
      ctx2.translate(ox, oy);
      ctx2.scale(ZOOM, ZOOM);
      drawLevelLive(game2, cam);
      if (stainCanvas) {
        ctx2.save();
        ctx2.globalCompositeOperation = "multiply";
        ctx2.globalAlpha = 0.85;
        ctx2.drawImage(stainCanvas, 0, 0, stainCanvas.width / STAIN_SS, stainCanvas.height / STAIN_SS);
        ctx2.restore();
      }
      drawFireZones(game2);
      if (game2.mode === "endless") {
        const ex = game2.level.exit;
        const open = game2.enemiesLeft === 0;
        ctx2.save();
        ctx2.globalCompositeOperation = "multiply";
        ctx2.strokeStyle = open ? M : ink(0.28);
        ctx2.lineWidth = open ? 3 : 1.6;
        const pulse = open ? 1 + Math.sin(game2.time * 4) * 0.09 : 1;
        ctx2.save();
        ctx2.translate(ex.x, ex.y);
        ctx2.scale(pulse, pulse);
        ctx2.strokeRect(-19, -19, 38, 38);
        ctx2.beginPath();
        ctx2.arc(0, 0, 11, 0, TAU);
        ctx2.stroke();
        ctx2.beginPath();
        ctx2.moveTo(-26, 0);
        ctx2.lineTo(26, 0);
        ctx2.moveTo(0, -26);
        ctx2.lineTo(0, 26);
        ctx2.stroke();
        ctx2.restore();
        if (open) {
          ctx2.fillStyle = M;
          ctx2.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
          ctx2.textAlign = "center";
          ctx2.fillText("\u51FA\u53E3", ex.x, ex.y + 36);
        }
        ctx2.restore();
      }
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      const rayReach = (e, a, reach) => {
        for (let st = 12; st < reach; st += 8) {
          if (game2.level.sightBlockedAt(e.x + Math.cos(a) * st, e.y + Math.sin(a) * st)) return st;
        }
        return reach;
      };
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DOWN || e.state === S_DEAD) continue;
        const def = ENEMY_DEF[e.type];
        const lines = e.state === S_CHASE ? 18 : e.state === S_SEARCH ? 14 : 10;
        const col = e.friendly ? WEAPONS.tameDart.tint : e.state === S_CHASE ? M : e.state === S_SEARCH ? "#4A44A0" : C;
        const pts = [];
        for (let i = 0; i <= lines; i++) {
          const a = e.angle - def.cone + i / lines * def.cone * 2;
          const r = rayReach(e, a, def.range);
          pts.push({ a, r, x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r });
        }
        ctx2.globalAlpha = e.state === S_CHASE ? 0.13 : 0.085;
        ctx2.fillStyle = col;
        ctx2.beginPath();
        ctx2.moveTo(e.x, e.y);
        for (const p of pts) ctx2.lineTo(p.x, p.y);
        ctx2.closePath();
        ctx2.fill();
        ctx2.globalAlpha = e.state === S_CHASE ? 0.72 : 0.48;
        ctx2.strokeStyle = col;
        ctx2.lineWidth = e.state === S_CHASE ? 1.35 : 1;
        ctx2.beginPath();
        for (const p of pts) {
          ctx2.moveTo(e.x + Math.cos(p.a) * 12, e.y + Math.sin(p.a) * 12);
          ctx2.lineTo(p.x, p.y);
        }
        ctx2.stroke();
        ctx2.globalAlpha = e.state === S_CHASE ? 0.46 : 0.28;
        ctx2.lineWidth = 0.9;
        ctx2.beginPath();
        ctx2.arc(e.x, e.y, 46, 0, TAU);
        ctx2.stroke();
      }
      ctx2.restore();
      drawSniperLaser(game2);
      drawThrowPreview(game2);
      drawKatanaCharge(game2);
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const n of game2.noiseRings) {
        ctx2.strokeStyle = n.col || C;
        ctx2.globalAlpha = clamp(1 - n.t / n.dur, 0, 1) * 0.7;
        ctx2.lineWidth = 2 * (1 - n.t / n.dur) + 0.5;
        ctx2.beginPath();
        ctx2.arc(n.x, n.y, n.r * (n.t / n.dur), 0, TAU);
        ctx2.stroke();
      }
      ctx2.restore();
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const win of game2.level.windows) {
        if (win.broken) continue;
        const x = win.gx * TILE, y = win.gy * TILE;
        ctx2.fillStyle = INK2;
        ctx2.strokeStyle = INK2;
        ctx2.lineWidth = 2.8;
        if (win.horiz) {
          ctx2.globalAlpha = 0.34;
          ctx2.fillRect(x, y + TILE / 2 - 1.5, TILE, 3);
          ctx2.globalAlpha = 1;
          ctx2.beginPath();
          ctx2.moveTo(x + 1.4, y + TILE / 2 - 5.5);
          ctx2.lineTo(x + 1.4, y + TILE / 2 + 5.5);
          ctx2.moveTo(x + TILE - 1.4, y + TILE / 2 - 5.5);
          ctx2.lineTo(x + TILE - 1.4, y + TILE / 2 + 5.5);
          ctx2.stroke();
        } else {
          ctx2.globalAlpha = 0.34;
          ctx2.fillRect(x + TILE / 2 - 1.5, y, 3, TILE);
          ctx2.globalAlpha = 1;
          ctx2.beginPath();
          ctx2.moveTo(x + TILE / 2 - 5.5, y + 1.4);
          ctx2.lineTo(x + TILE / 2 + 5.5, y + 1.4);
          ctx2.moveTo(x + TILE / 2 - 5.5, y + TILE - 1.4);
          ctx2.lineTo(x + TILE / 2 + 5.5, y + TILE - 1.4);
          ctx2.stroke();
        }
      }
      ctx2.globalAlpha = 1;
      ctx2.restore();
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const d of game2.level.doors) {
        const a = d.open * 1.32;
        const hinge = d.hinge || -1;
        const swing = d.swing || 1;
        ctx2.save();
        ctx2.translate(d.x, d.y);
        if (!d.horiz) ctx2.rotate(Math.PI / 2);
        ctx2.translate(hinge * TILE / 2, 0);
        ctx2.rotate(-hinge * a * swing);
        ctx2.fillStyle = INK2;
        ctx2.fillRect(hinge > 0 ? -TILE : 0, -3, TILE, 6);
        ctx2.restore();
        if (d.slam > 0) {
          ctx2.strokeStyle = M;
          ctx2.globalAlpha = d.slam * 0.8;
          ctx2.lineWidth = 3 * d.slam + 0.5;
          ctx2.beginPath();
          ctx2.arc(d.x, d.y, 58 * (1.2 - d.slam), 0, TAU);
          ctx2.stroke();
          ctx2.globalAlpha = 1;
        }
      }
      ctx2.restore();
      for (const e of game2.pools.corpses || []) {
        if (e.alive) plates(split * 0.4, (g) => shapeEnemy(g, e));
      }
      if (landed.length) {
        ctx2.save();
        ctx2.globalCompositeOperation = "multiply";
        for (const c of landed) {
          ctx2.save();
          ctx2.translate(c.x, c.y);
          ctx2.rotate(c.ang);
          ctx2.fillStyle = ink(0.42);
          ctx2.fillRect(-3, -1.1, 6, 2.2);
          ctx2.restore();
        }
        ctx2.restore();
      }
      drawMadMarkers(game2);
      for (const k of game2.pools.pickups) {
        if (!k.alive) continue;
        const w = WEAPONS[k.kind];
        const half = w && w.tint ? 9 : 0;
        drawWeapon(ctx2, k.x - Math.cos(k.angle) * half, k.y - Math.sin(k.angle) * half, k.angle, k.kind);
      }
      for (const t of game2.pools.thrown) {
        if (!t.alive) continue;
        drawWeapon(ctx2, t.x - Math.cos(t.spin) * 9, t.y - Math.sin(t.spin) * 9, t.spin, t.kind);
      }
      drawDeployables(game2);
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        plates(split, (g) => shapeEnemy(g, e));
      }
      drawHeldWeapons(game2);
      drawPlayerShield(game2);
      drawSleepers(game2);
      drawEnemyIndicators(game2);
      plates(split * 0.5, (g) => {
        g.lineWidth = 2;
        g.beginPath();
        for (const b of game2.pools.bullets) {
          if (!b.alive) continue;
          if (isDartWeapon(b.weapon)) continue;
          const l = b.projectile === "rocket" ? 42 : b.friendly ? 20 : 26;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          g.moveTo(b.x - b.vx / sp * l, b.y - b.vy / sp * l);
          g.lineTo(b.x, b.y);
        }
        g.stroke();
        for (const b of game2.pools.bullets) {
          if (!b.alive) continue;
          if (isDartWeapon(b.weapon)) continue;
          if (b.projectile === "rocket") {
            const a = Math.atan2(b.vy, b.vx);
            g.save();
            g.translate(b.x, b.y);
            g.rotate(a);
            g.scale(0.72, 0.72);
            weaponSilhouette(g, "rocket");
            g.restore();
          } else {
            const r = b.weapon === "laser" ? 3.2 : b.weapon === "sniper" ? 2.2 : 2.6;
            g.beginPath();
            g.arc(b.x, b.y, r, 0, TAU);
            g.fill();
          }
        }
      });
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.lineWidth = 1.7;
      for (const b of game2.pools.bullets) {
        if (!b.alive || !isDartWeapon(b.weapon)) continue;
        const tint = WEAPONS[b.weapon]?.tint || WEAPONS.dart.tint;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const ux = b.vx / sp, uy = b.vy / sp;
        const a = Math.atan2(b.vy, b.vx);
        ctx2.globalAlpha = 0.76;
        ctx2.strokeStyle = tint;
        ctx2.fillStyle = tint;
        ctx2.beginPath();
        ctx2.moveTo(b.x - ux * 18, b.y - uy * 18);
        ctx2.lineTo(b.x, b.y);
        ctx2.stroke();
        ctx2.save();
        ctx2.translate(b.x, b.y);
        ctx2.rotate(a);
        ctx2.globalAlpha = 0.92;
        ctx2.beginPath();
        ctx2.moveTo(5, 0);
        ctx2.lineTo(-3, -3);
        ctx2.lineTo(-3, 3);
        ctx2.closePath();
        ctx2.fill();
        ctx2.restore();
      }
      ctx2.restore();
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.blockFlash <= 0) continue;
        const def = ENEMY_DEF[e.type];
        const w = WEAPONS[e.weapon];
        const arc = w && w.defense ? w.shieldArc || 1.28 : def.shieldArc || 1;
        ctx2.strokeStyle = C;
        ctx2.globalAlpha = clamp(e.blockFlash / 0.25, 0, 1) * 0.9;
        ctx2.lineWidth = 3;
        ctx2.beginPath();
        ctx2.arc(e.x, e.y, 17 + (1 - e.blockFlash / 0.3) * 9, e.angle - arc, e.angle + arc);
        ctx2.stroke();
      }
      ctx2.restore();
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      for (const p of game2.particles) {
        ctx2.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx2.fillStyle = p.col;
        if (p.casing) {
          ctx2.save();
          ctx2.translate(p.x, p.y);
          ctx2.rotate(p.rot);
          ctx2.fillStyle = ink(0.5);
          ctx2.fillRect(-3, -1.1, 6, 2.2);
          ctx2.restore();
        } else {
          ctx2.save();
          ctx2.translate(p.x, p.y);
          ctx2.rotate(p.rot);
          ctx2.fillRect(-p.s / 2, -p.s * 0.34, p.s, p.s * 0.68);
          ctx2.restore();
        }
      }
      ctx2.restore();
      if (game2.flashes.length) {
        ctx2.save();
        ctx2.globalCompositeOperation = "multiply";
        for (const f of game2.flashes) {
          const k = 1 - clamp(f.t / f.dur, 0, 1);
          const L = (16 + 16 * f.size) * k, Wd = (5 + 4 * f.size) * k;
          ctx2.save();
          ctx2.translate(f.x, f.y);
          ctx2.rotate(f.a);
          ctx2.globalAlpha = 0.55 + 0.45 * k;
          ctx2.fillStyle = Y;
          ctx2.beginPath();
          ctx2.moveTo(L, 0);
          ctx2.lineTo(0, -Wd);
          ctx2.lineTo(-L * 0.34, 0);
          ctx2.lineTo(0, Wd);
          ctx2.closePath();
          ctx2.fill();
          ctx2.beginPath();
          ctx2.moveTo(0, -Wd * 1.9);
          ctx2.lineTo(L * 0.3, 0);
          ctx2.lineTo(0, Wd * 1.9);
          ctx2.lineTo(-L * 0.22, 0);
          ctx2.closePath();
          ctx2.fill();
          ctx2.restore();
        }
        ctx2.restore();
      }
      if (game2.player.swing > 0) {
        const p = game2.player;
        const w = WEAPONS[p.weapon];
        const t = 1 - game2.player.swing / 0.16;
        ctx2.save();
        ctx2.globalCompositeOperation = "multiply";
        ctx2.strokeStyle = M;
        ctx2.lineWidth = 3.5 * (1 - t) + 1;
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, (w.reach || 36) * (0.5 + t * 0.6), p.aim - 1.1 + t * 1.4, p.aim + 0.5 + t * 1.4);
        ctx2.stroke();
        ctx2.restore();
      }
      if (game2.player.alive || game2.state === "dying") plates(split, (g) => shapePlayer(g, game2.player, game2.player.aim));
      if (game2.player.trail.length > 1) {
        const dashWeapon = WEAPONS[game2.player.weapon] || WEAPONS.katana;
        ctx2.save();
        ctx2.globalCompositeOperation = "multiply";
        ctx2.strokeStyle = game2.player.katanaT > 0 ? dashWeapon.tint || M : C;
        ctx2.lineWidth = game2.player.katanaT > 0 ? 8 : 6;
        ctx2.globalAlpha = game2.player.katanaT > 0 ? 0.54 : 0.45;
        ctx2.beginPath();
        ctx2.moveTo(game2.player.trail[0].x, game2.player.trail[0].y);
        for (const t of game2.player.trail) ctx2.lineTo(t.x, t.y);
        ctx2.stroke();
        ctx2.restore();
      }
      if (game2.enemiesLeft === 0 && game2.player.alive && game2.state === "play") {
        const p = game2.player;
        const dx = game2.level.exit.x - p.x, dy = game2.level.exit.y - p.y;
        const dist3 = Math.hypot(dx, dy);
        const halfW = W / (2 * ZOOM), halfH = H / (2 * ZOOM);
        const onScreen = Math.abs(game2.level.exit.x - cam.x) < halfW - 60 && Math.abs(game2.level.exit.y - cam.y) < halfH - 60;
        const fade = clamp((dist3 - 90) / 120, 0, 1) * (onScreen ? 0.35 : 1);
        if (fade > 0.02 && dist3 > 40) {
          const a = Math.atan2(dy, dx);
          const r = 54 + Math.sin(game2.time * 4) * 3;
          ctx2.save();
          ctx2.globalCompositeOperation = "multiply";
          ctx2.globalAlpha = fade;
          ctx2.translate(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
          ctx2.rotate(a);
          ctx2.fillStyle = M;
          ctx2.beginPath();
          ctx2.moveTo(13, 0);
          ctx2.lineTo(-5, -8);
          ctx2.lineTo(-1, 0);
          ctx2.lineTo(-5, 8);
          ctx2.closePath();
          ctx2.fill();
          ctx2.globalAlpha = fade * 0.55;
          ctx2.beginPath();
          ctx2.moveTo(-8, -6);
          ctx2.lineTo(2, 0);
          ctx2.lineTo(-8, 6);
          ctx2.lineWidth = 1.6;
          ctx2.strokeStyle = M;
          ctx2.stroke();
          ctx2.restore();
          ctx2.save();
          ctx2.globalCompositeOperation = "multiply";
          ctx2.globalAlpha = fade * 0.8;
          ctx2.fillStyle = M;
          ctx2.font = '600 9px "IBM Plex Mono", ui-monospace, monospace';
          ctx2.textAlign = "center";
          ctx2.fillText(`\u51FA\u53E3 ${Math.round(dist3 / TILE)}`, p.x + Math.cos(a) * (r + 46), p.y + Math.sin(a) * (r + 46) + 3);
          ctx2.restore();
        }
      }
      ctx2.restore();
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.globalAlpha = 0.55;
      ctx2.fillStyle = grainPat;
      ctx2.translate(-(cam.x * ZOOM % 180), -(cam.y * ZOOM % 180));
      ctx2.fillRect(0, 0, W + 180, H + 180);
      ctx2.restore();
    }
    return { ctx: ctx2, resize, bakeLevel, clearStains, splat, shards, casing, draw, plates, get W() {
      return W;
    }, get H() {
      return H;
    } };
  }

  // overprint/src/dev.js
  var local = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  var num = (k, dflt) => {
    const v = parseFloat(q.get(k));
    return Number.isFinite(v) ? v : dflt;
  };
  var REC = {
    on: local,
    speed: local ? num("speed", 1 / 3) : 1,
    floor: local ? Math.max(0, Math.round(num("floor", 12))) : 0,
    // ?shot=N drops you into a run with N kills left instead of 204, so a take
    // opens mid-fight and ends on 200 OK a few seconds later rather than
    // twenty minutes later. 0 is off.
    shot: local ? Math.max(0, Math.round(num("shot", 0))) : 0,
    // A shot run is a re-enactment of the last few minutes of a run, so the clock
    // has to start where that run would be — otherwise the take ends on a time no
    // real run could produce, and the big readout says 00:04 through the whole
    // thing. ?clock=SECONDS to move it.
    clock: local ? Math.max(0, num("clock", 1020)) : 0,
    // Sound has to survive the edit. Footage taken at a third speed gets sped up
    // 3x afterwards, which pitches everything up an octave and a half and turns
    // gunfire into clicks — so in shot mode every sound is synthesised three
    // times as long and a third as high, and the speed-up lands it back where it
    // belongs. It sounds wrong while you record. That is correct.
    stretch: 1,
    // the status-code callout that floats up on 403, 402, 308 and the rest is
    // the one piece of chrome that keeps interrupting a capture — off while
    // recording, back with ?banner=1
    statusBanner: !local || q.get("banner") === "1"
  };
  if (REC.on && REC.shot) REC.stretch = 1 / REC.speed;
  if (REC.on) {
    console.log(`[overprint] recording rig: ${REC.speed.toFixed(2)}x time` + (REC.floor ? `, floor ${REC.floor} difficulty` : "") + (REC.statusBanner ? "" : ", no status banners") + (REC.shot ? `, SHOT MODE: ${REC.shot} kills left, audio pre-stretched ${REC.stretch.toFixed(1)}x` : ""));
  }

  // overprint/src/net.js
  var params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  var sameOrigin = typeof location !== "undefined" && /(^|\.)iskra\.graphics$/.test(location.hostname);
  var API = sameOrigin ? "" : params.get("api") || null;
  var online = API !== null;
  function playerId() {
    try {
      let id = localStorage.getItem("overprint.player");
      if (!id) {
        id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("overprint.player", id);
      }
      return id;
    } catch {
      return null;
    }
  }
  function playerName() {
    try {
      return localStorage.getItem("overprint.name") || "";
    } catch {
      return "";
    }
  }
  function setPlayerName(n) {
    try {
      localStorage.setItem("overprint.name", n);
    } catch {
    }
  }
  async function call(path, init) {
    if (!online) return null;
    try {
      const res = await fetch(API + path, { ...init, cache: "no-store" });
      const body = await res.json();
      return res.ok ? body : { error: body.error || `http ${res.status}` };
    } catch {
      return null;
    }
  }
  function fetchBoard(board, limit = 8) {
    return call(`/api/board?board=${encodeURIComponent(board)}&limit=${limit}`);
  }
  function submitRun(board, run, name) {
    const player = playerId();
    if (!player) return Promise.resolve(null);
    return call("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board, player, name, ...run })
    });
  }

  // overprint/src/game.js
  init_util();

  // overprint/src/board.js
  var DAY_KEY = "overprint.seedBase";
  var RUN_KEY = "overprint.runNo";
  function params2() {
    return new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  }
  function dayStamp(d = /* @__PURE__ */ new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function hashSeed(value) {
    const text = String(value || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h & 2147483647;
  }
  function seedBase() {
    const fromUrl = params2().get("seed");
    if (fromUrl && fromUrl.trim()) return fromUrl.trim();
    try {
      const saved = localStorage.getItem(DAY_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {
    }
    return dayStamp();
  }
  function customSeedBase() {
    const base = seedBase();
    return base === dayStamp() ? "" : base;
  }
  function setSeedBase(value) {
    const clean = String(value || "").trim();
    try {
      if (clean) localStorage.setItem(DAY_KEY, clean);
      else localStorage.removeItem(DAY_KEY);
    } catch {
    }
    return previewRunSeed();
  }
  function runNo() {
    try {
      return Math.max(0, Number(localStorage.getItem(RUN_KEY) || 0) | 0);
    } catch {
      return 0;
    }
  }
  function seedFor(nextRunNo) {
    const base = seedBase();
    return { base, runNo: nextRunNo, seed: hashSeed(`${base}:${nextRunNo}`) };
  }
  function previewRunSeed() {
    return seedFor(runNo() + 1);
  }
  function nextRunSeed() {
    const next = runNo() + 1;
    try {
      localStorage.setItem(RUN_KEY, String(next));
    } catch {
    }
    return seedFor(next);
  }
  var BOARDS = {
    endless: { id: "endless", label: "\u65E0\u9650\u6A21\u5F0F", seed: () => previewRunSeed().seed }
  };
  function currentBoard() {
    return BOARDS.endless;
  }
  function clock(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${String(m).padStart(2, "0")}:${r < 10 ? "0" : ""}${r.toFixed(2)}`;
  }
  function key(board) {
    return `overprint.pb.${board.id}`;
  }
  function loadBest(board) {
    try {
      return JSON.parse(localStorage.getItem(key(board)) || "null");
    } catch {
      return null;
    }
  }
  function saveBest(board, run) {
    const prev = loadBest(board);
    if (prev && prev.time <= run.time) return prev;
    const rec = { time: run.time, score: run.score, day: dayStamp() };
    try {
      localStorage.setItem(key(board), JSON.stringify(rec));
    } catch {
    }
    return rec;
  }

  // overprint/src/game.js
  init_level();
  init_entities();

  // overprint/src/audio.js
  var ctx = null;
  var master = null;
  var comp = null;
  var filter = null;
  var punch = null;
  var noiseBuf = null;
  var subGain = null;
  var enabled = true;
  var rnd2 = (a, b) => a + Math.random() * (b - a);
  function initAudio() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      enabled = false;
      return;
    }
    ctx = new AC();
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18e3 / REC.stretch;
    filter.Q.value = 0.4;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 5;
    comp.ratio.value = 3.5;
    comp.attack.value = 1e-3;
    comp.release.value = 0.1;
    master = ctx.createGain();
    master.gain.value = 0.78;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i / 512 - 1;
      curve[i] = Math.tanh(x * 3.2);
    }
    shaper.curve = curve;
    shaper.oversample = "4x";
    punch = ctx.createGain();
    punch.gain.value = 1.3;
    punch.connect(shaper);
    shaper.connect(filter);
    filter.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 47 / REC.stretch;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 70.5 / REC.stretch;
    subGain = ctx.createGain();
    subGain.gain.value = 0;
    o1.connect(subGain);
    o2.connect(subGain);
    subGain.connect(master);
    o1.start();
    o2.start();
  }
  function setTimeScale(ts) {
    if (!ctx) return;
    const t = ctx.currentTime;
    filter.frequency.setTargetAtTime((420 + Math.pow(ts, 0.7) * 17600) / REC.stretch, t, 0.05 * REC.stretch);
    subGain.gain.setTargetAtTime(Math.max(0, 1 - ts / 0.55) * 0.055, t, 0.09);
  }
  function setMuted(m) {
    enabled = !m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.78, ctx.currentTime, 0.02);
  }
  function isMuted() {
    return !enabled;
  }
  function nz(o) {
    if (!ctx || !enabled) return;
    const S = REC.stretch;
    const t = ctx.currentTime + (o.at || 0) * S;
    const dur = o.dur * S;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = (o.rate || 1) / S;
    const bq = ctx.createBiquadFilter();
    bq.type = o.type || "highpass";
    bq.frequency.setValueAtTime(o.freq / S, t);
    if (o.sweepTo) bq.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweepTo / S), t + dur);
    bq.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(bq);
    bq.connect(g);
    g.connect(o.clean ? filter : punch);
    src.start(t, Math.random() * 0.6);
    src.stop(t + dur + 0.02);
  }
  function osc(o) {
    if (!ctx || !enabled) return;
    const S = REC.stretch;
    const t = ctx.currentTime + (o.at || 0) * S;
    const dur = o.dur * S;
    const s = ctx.createOscillator();
    s.type = o.type || "sine";
    s.frequency.setValueAtTime(o.f0 / S, t);
    s.frequency.exponentialRampToValueAtTime(Math.max(6, o.f1 / S), t + dur * (o.bend || 0.7));
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(g);
    g.connect(o.clean ? filter : punch);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
  var tone = (f0, f1, dur, gain, type = "square") => osc({ f0, f1, dur, gain, type, bend: 0.9, clean: true });
  var sfx = {
    // Five layers, in the order the ear resolves them: a full-band snap you feel
    // before you hear, a bright crack, a body whose pitch collapses in ~40ms, a
    // sub that hits your chest, and a room tail. The fast body is the difference
    // between a gunshot and a beep.
    // `t` is rounds remaining, 0..1. A thinning magazine rides up in pitch, so a
    // burst tells you it is nearly out before the counter does.
    shot(t = 1) {
      const j = rnd2(0.94, 1.07) * (1 + (1 - t) ** 1.6 * 0.62);
      const body = 0.5 + 0.5 * t;
      nz({ dur: 6e-3, gain: 1.3, type: "highpass", freq: 200 });
      nz({ dur: 0.062, gain: 0.7, type: "highpass", freq: 2400 * j });
      osc({ type: "triangle", f0: 430 * j, f1: 48, dur: 0.045, gain: 0.9, bend: 1 });
      osc({ type: "sine", f0: 112 * j, f1: 34, dur: 0.13, gain: 0.55 * body });
      nz({ dur: 0.22, gain: 0.16, type: "lowpass", freq: 1200, sweepTo: 320 });
    },
    // same shot with the tail cut off, so a burst stays tight instead of smearing
    smg(t = 1) {
      const j = rnd2(0.9, 1.13) * (1 + (1 - t) ** 1.6 * 0.7);
      const body = 0.45 + 0.55 * t;
      nz({ dur: 5e-3, gain: 1, type: "highpass", freq: 300 });
      nz({ dur: 0.036, gain: 0.5, type: "highpass", freq: 3e3 * j });
      osc({ type: "square", f0: 490 * j, f1: 92, dur: 0.03, gain: 0.62, bend: 1 });
      osc({ type: "sine", f0: 132 * j, f1: 46, dur: 0.06, gain: 0.32 * body });
    },
    // the heaviest single round: more snap, deeper sub, a room that hangs
    revolver(t = 1) {
      const j = rnd2(0.96, 1.05) * (1 + (1 - t) ** 1.6 * 0.55);
      const body = 0.5 + 0.5 * t;
      nz({ dur: 8e-3, gain: 1.4, type: "highpass", freq: 150 });
      nz({ dur: 0.075, gain: 0.8, type: "highpass", freq: 1800 * j });
      osc({ type: "sawtooth", f0: 350 * j, f1: 38, dur: 0.07, gain: 1, bend: 1 });
      osc({ type: "sine", f0: 86 * j, f1: 26, dur: 0.3, gain: 0.7 * body });
      nz({ dur: 0.5, gain: 0.24, type: "lowpass", freq: 900, sweepTo: 220 });
    },
    // widest and lowest — the snap is broadband and the tail runs long
    shotgun(t = 1) {
      const j = rnd2(0.97, 1.03) * (1 + (1 - t) ** 1.6 * 0.5);
      const body = 0.5 + 0.5 * t;
      nz({ dur: 0.011, gain: 1.5, type: "highpass", freq: 120 });
      nz({ dur: 0.13, gain: 0.6, type: "bandpass", freq: 1600 * j, q: 0.4 });
      osc({ type: "sawtooth", f0: 265 * j, f1: 30, dur: 0.09, gain: 1, bend: 1 });
      osc({ type: "sine", f0: 66, f1: 22, dur: 0.42, gain: 0.8 * body });
      nz({ dur: 0.7, gain: 0.34, type: "lowpass", freq: 820, sweepTo: 180 });
    },
    // melee: air moving, no impact — the impact is whatever it lands on
    swing() {
      nz({ dur: 0.2, gain: 0.26, type: "bandpass", freq: 380, sweepTo: 2600, q: 1.4 });
    },
    // a body dropping: low thud, wet transient, no ring
    kill() {
      nz({ dur: 0.05, gain: 0.3, type: "highpass", freq: 1700 });
      nz({ dur: 0.24, gain: 0.36, type: "lowpass", freq: 430, sweepTo: 160 });
      osc({ type: "sine", f0: 155, f1: 32, dur: 0.3, gain: 0.55 });
      osc({ type: "triangle", f0: 92, f1: 26, dur: 0.22, gain: 0.3 });
    },
    knockdown() {
      nz({ dur: 0.16, gain: 0.26, type: "lowpass", freq: 600, sweepTo: 220 });
      osc({ type: "sine", f0: 118, f1: 44, dur: 0.17, gain: 0.34 });
    },
    execute() {
      nz({ dur: 0.28, gain: 0.34, type: "lowpass", freq: 320, sweepTo: 120 });
      osc({ type: "square", f0: 84, f1: 30, dur: 0.32, gain: 0.34 });
      osc({ type: "sine", f0: 52, f1: 22, dur: 0.42, gain: 0.4 });
    },
    dash() {
      nz({ dur: 0.19, gain: 0.24, type: "bandpass", freq: 600, sweepTo: 3e3, q: 1.1 });
      osc({ type: "sine", f0: 620, f1: 220, dur: 0.12, gain: 0.07 });
    },
    pickup() {
      osc({ type: "square", f0: 700, f1: 700, dur: 0.045, gain: 0.13, bend: 1, clean: true });
      osc({ type: "square", f0: 1150, f1: 1150, dur: 0.06, gain: 0.11, bend: 1, at: 0.05, clean: true });
    },
    throwIt() {
      nz({ dur: 0.16, gain: 0.2, type: "bandpass", freq: 900, sweepTo: 2400, q: 1.6 });
      osc({ type: "triangle", f0: 280, f1: 660, dur: 0.11, gain: 0.09 });
    },
    alert() {
      tone(860, 860, 0.05, 0.11);
      setTimeout(() => tone(1180, 1180, 0.055, 0.1), 70);
    },
    shout() {
      osc({ type: "sawtooth", f0: 250, f1: 330, dur: 0.12, gain: 0.15, bend: 0.9 });
      setTimeout(() => osc({ type: "sawtooth", f0: 210, f1: 155, dur: 0.15, gain: 0.11, bend: 0.9 }), 95);
    },
    // a door taking a shoulder: timber crack over a big low hit
    slam() {
      nz({ dur: 0.05, gain: 0.7, type: "highpass", freq: 1500 });
      nz({ dur: 0.4, gain: 0.34, type: "lowpass", freq: 520, sweepTo: 150 });
      osc({ type: "sawtooth", f0: 140, f1: 32, dur: 0.34, gain: 0.45 });
      osc({ type: "sine", f0: 58, f1: 24, dur: 0.44, gain: 0.42 });
    },
    block() {
      nz({ dur: 0.07, gain: 0.34, type: "highpass", freq: 3e3 });
      osc({ type: "square", f0: 1250, f1: 620, dur: 0.09, gain: 0.15 });
      osc({ type: "triangle", f0: 2400, f1: 1500, dur: 0.06, gain: 0.08 });
    },
    shieldBreak() {
      nz({ dur: 0.42, gain: 0.5, type: "highpass", freq: 1400, sweepTo: 4200 });
      osc({ type: "square", f0: 430, f1: 70, dur: 0.34, gain: 0.32 });
      osc({ type: "sine", f0: 96, f1: 30, dur: 0.4, gain: 0.36 });
    },
    glass() {
      nz({ dur: 0.36, gain: 0.36, type: "highpass", freq: 3600 });
      [2700, 3500, 2150, 4100].forEach((f, i) => setTimeout(() => osc({ type: "triangle", f0: f * rnd2(0.9, 1.1), f1: f * 0.55, dur: 0.1, gain: 0.08 }), i * 38));
    },
    splinter() {
      nz({ dur: 0.05, gain: 0.75, type: "highpass", freq: 900 });
      nz({ dur: 0.2, gain: 0.3, type: "bandpass", freq: 1400, q: 0.7 });
      osc({ type: "square", f0: 210, f1: 60, dur: 0.09, gain: 0.35, bend: 1 });
    },
    explosion() {
      nz({ dur: 0.016, gain: 1.35, type: "highpass", freq: 120 });
      nz({ dur: 0.45, gain: 0.5, type: "lowpass", freq: 760, sweepTo: 130 });
      osc({ type: "sawtooth", f0: 118, f1: 26, dur: 0.32, gain: 0.72 });
      osc({ type: "sine", f0: 48, f1: 18, dur: 0.58, gain: 0.62 });
    },
    empty() {
      osc({ type: "square", f0: 210, f1: 150, dur: 0.035, gain: 0.1 });
    },
    die() {
      nz({ dur: 0.55, gain: 0.5, type: "lowpass", freq: 700, sweepTo: 120 });
      osc({ type: "sawtooth", f0: 200, f1: 26, dur: 0.6, gain: 0.34 });
      osc({ type: "sine", f0: 70, f1: 20, dur: 0.7, gain: 0.4 });
    },
    clear() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => osc({ type: "triangle", f0: f, f1: f, dur: 0.24, gain: 0.13, bend: 1, clean: true }), i * 75));
    },
    status() {
      [880, 1320].forEach((f, i) => setTimeout(() => osc({ type: "square", f0: f, f1: f, dur: 0.09, gain: 0.1, bend: 1, clean: true }), i * 80));
    },
    focusIn() {
      osc({ type: "sine", f0: 300, f1: 120, dur: 0.3, gain: 0.1, clean: true });
    },
    focusOut() {
      osc({ type: "sine", f0: 120, f1: 320, dur: 0.16, gain: 0.07, clean: true });
    }
  };

  // overprint/src/game.js
  var WEAPON_KEYS = ["fists", "knife", "bat", "katana", "quixote", "pistol", "revolver", "smg", "shotgun", "ripper", "grenade", "frag", "flash", "sentryPack", "dronePack", "rocket", "molotov", "dart", "tameDart", "virus", "copySauce", "madExtract", "tameExtract", "virusExtract", "disguise", "sniper", "laser", "butcher", "shield"];
  var CODEX_WEAPON_KEYS = WEAPON_KEYS.filter((k) => k !== "fists");
  var ENEMY_KEYS = ["strawman", "thug", "gunner", "hound", "patroller", "shield"];
  var PRACTICE_MAPS = [
    { id: "arena", label: "\u8BAD\u7EC3\u5BA4" },
    { id: "cover", label: "\u63A9\u4F53\u623F" },
    { id: "lanes", label: "\u957F\u5ECA" }
  ];
  var PRACTICE_ENEMIES = ["strawman", "thug", "gunner", "hound", "patroller", "shield"];
  var PRACTICE_WEAPONS = ["pistol", "smg", "ripper", "shotgun", "grenade", "frag", "flash", "sentryPack", "dronePack", "rocket", "molotov", "dart", "tameDart", "virus", "copySauce", "madExtract", "tameExtract", "virusExtract", "disguise", "sniper", "laser", "butcher", "shield", "katana", "quixote", "knife", "bat"];
  var DEFENSE_SHOP_WEAPONS = ["pistol", "shield", "katana", "quixote", "smg", "ripper", "shotgun", "grenade", "frag", "flash", "sentryPack", "dronePack", "rocket", "virus", "copySauce", "shield", "molotov", "dart", "tameDart", "sniper", "laser", "butcher", "shield"];
  var CODEX_KEY = "overprint.codex";
  var SLOW = {
    dash: { dur: 0.17, scale: 0.34 },
    throw: { dur: 0.34, scale: 0.2 },
    explosion: { dur: 0.28, scale: 0.18 },
    nearMiss: { dur: 0.3, scale: 0.19 },
    slam: { dur: 0.3, scale: 0.24 },
    execute: { dur: 0.26, scale: 0.22 },
    katana: { dur: 0.58, scale: 0.08, free: true },
    lastKill: { dur: 0.95, scale: 0.14, free: true }
  };
  var PLAYER_SLOW_FLOOR = 0.62;
  var SLOW_LOCKOUT = 0.34;
  var TOTAL_TARGET = 404;
  var WIN_AT = 200;
  var THROW_CHARGE_MAX = 1.15;
  var LOB_RANGE_MIN = 280;
  var LOB_RANGE_MAX = 780;
  var DEFENSE_REST_SECONDS = 120;
  function loadoutFor(kind) {
    const w = WEAPONS[kind] || WEAPONS.fists;
    if (w.offhandOnly) {
      const paired = kind === "virus" ? "tameDart" : "fists";
      return { weapon: paired, ammo: WEAPONS[paired]?.ammo || 0, offhand: kind, offAmmo: 0 };
    }
    return { weapon: kind || "fists", ammo: w.melee ? 0 : w.ammo || 0 };
  }
  function freshCodex() {
    return { weapons: [], enemies: [] };
  }
  function loadCodex() {
    try {
      const raw = JSON.parse(localStorage.getItem(CODEX_KEY) || "null");
      if (!raw || !Array.isArray(raw.weapons) || !Array.isArray(raw.enemies)) return freshCodex();
      return {
        weapons: raw.weapons.filter((k) => CODEX_WEAPON_KEYS.includes(k)),
        enemies: raw.enemies.filter((k) => ENEMY_KEYS.includes(k))
      };
    } catch {
      return freshCodex();
    }
  }
  function saveCodex(codex) {
    try {
      localStorage.setItem(CODEX_KEY, JSON.stringify(codex));
    } catch {
    }
  }
  function defaultPlayerStats() {
    return { maxHp: 1, attackRate: 1, maxDash: MAX_DASH, dashCd: DASH_CD, slow: 1 };
  }
  function defensePlayerStats() {
    return { maxHp: 2, attackRate: 1, maxDash: MAX_DASH, dashCd: DASH_CD, slow: 1 };
  }
  function newDefenseState() {
    return {
      wave: 0,
      points: 0,
      between: false,
      nextWaveT: 0,
      shopIndex: 0,
      cleared: 0,
      shopOpen: false,
      pendingBuy: null
    };
  }
  var STATUS = {
    403: "\u7981\u6B62\u8BBF\u95EE",
    402: "\u9700\u8981\u4ED8\u6B3E",
    401: "\u672A\u6388\u6743",
    400: "\u8BF7\u6C42\u9519\u8BEF",
    418: "\u6211\u662F\u8336\u58F6",
    410: "\u5DF2\u6D88\u5931",
    408: "\u8BF7\u6C42\u8D85\u65F6",
    308: "\u6C38\u4E45\u91CD\u5B9A\u5411",
    307: "\u4E34\u65F6\u91CD\u5B9A\u5411",
    304: "\u672A\u4FEE\u6539",
    302: "\u5DF2\u627E\u5230",
    301: "\u6C38\u4E45\u79FB\u52A8",
    300: "\u591A\u91CD\u9009\u62E9",
    226: "\u5DF2\u4F7F\u7528",
    208: "\u5DF2\u62A5\u544A",
    206: "\u90E8\u5206\u5185\u5BB9",
    204: "\u65E0\u5185\u5BB9",
    202: "\u5DF2\u63A5\u53D7",
    201: "\u5DF2\u521B\u5EFA",
    200: "\u6B63\u5E38"
  };
  var LADDER = Object.keys(STATUS).map(Number).filter((k) => k <= 404).sort((a, b) => a - b);
  function statusFor(remaining) {
    for (const k of LADDER) if (k >= remaining) return STATUS[k];
    return "\u672A\u627E\u5230";
  }
  function createGame(renderer2) {
    const game2 = {
      renderer: renderer2,
      state: "title",
      paused: false,
      mode: localStorage.getItem("overprint.mode") || "endless",
      refillEnabled: localStorage.getItem("overprint.refill") === "1",
      time: 0,
      floor: 1,
      seed: 0,
      seedBase: "",
      customSeed: customSeedBase(),
      runNo: 0,
      board: currentBoard(),
      runT: 0,
      best: null,
      standings: null,
      claimed: false,
      claimError: null,
      claimRank: null,
      runResult: null,
      ticks: 0,
      score: 0,
      bestScore: Number(localStorage.getItem("overprint.best") || 0),
      bestFloor: Number(localStorage.getItem("overprint.floor") || 0),
      kills: 0,
      floorKills: 0,
      combo: 0,
      comboTimer: 0,
      bestCombo: 0,
      enemiesLeft: 0,
      remaining: TOTAL_TARGET,
      floorLoadout: null,
      playerStats: defaultPlayerStats(),
      practiceMaps: PRACTICE_MAPS,
      practiceWeapons: PRACTICE_WEAPONS,
      practiceEnemies: PRACTICE_ENEMIES,
      practice: { map: 0, weapon: "pistol", enemy: "strawman" },
      defense: newDefenseState(),
      codex: loadCodex(),
      codexOpen: false,
      codexScroll: 0,
      slowT: 0,
      slowScale: 1,
      slowCd: 0,
      nearMissCd: 0,
      deathT: 0,
      lastStatus: TOTAL_TARGET,
      alarmX: 0,
      alarmY: 0,
      won: false,
      infinite: true,
      level: null,
      pools: makePools(),
      corpseWrite: 0,
      pickupWrite: 0,
      particles: [],
      flashes: [],
      noiseRings: [],
      targets: [],
      madTargets: [],
      fireZones: [],
      camera: { x: 0, y: 0 },
      shake: 0,
      hitstop: 0,
      plateSplit: 0,
      worldScale: 1,
      flash: 0,
      banner: null,
      bannerT: 0,
      floorStartTime: 0,
      dashFlash: 0,
      throwCharge: 0,
      throwPreview: null,
      // what the HUD shows, chasing what the game knows. Springs, so a value that
      // changes while the last change is still settling is followed, not snapped.
      ui: {
        gauge: 0,
        gaugeV: 0,
        chain: 0,
        chainV: 0,
        code: 404,
        codeV: 0,
        chainPunch: 0,
        chainOpen: 0,
        chainOpenV: 0,
        tabs: [],
        options: [],
        pauseOptions: [],
        codexClose: null,
        codexPanel: null,
        codexScroll: null,
        defenseShopButton: null,
        defenseShopOptions: [],
        defenseRestButton: null,
        defenseShopPanel: null
      },
      reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
      tutorialT: 0,
      didMove: false,
      didAttack: false,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        fire: false,
        dash: false,
        fireReleased: false,
        throwIt: false,
        throwHeld: false,
        throwReleased: false,
        swap: false,
        mx: 0,
        my: 0,
        buy: null,
        analog: false,
        axisX: 0,
        axisY: 0,
        hasAim: false,
        aimAngle: 0
      },
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        aim: 0,
        alive: true,
        weapon: "fists",
        ammo: 0,
        offhandWeapon: "fists",
        offhandAmmo: 0,
        attackCd: 0,
        swing: 0,
        burnT: 0,
        infectT: 0,
        madT: 0,
        madDirT: 0,
        madDirA: 0,
        sawCd: 0,
        blockFlash: 0,
        swapCd: 0,
        hp: 1,
        maxHp: 1,
        iframes: 0,
        dashCharges: MAX_DASH,
        maxDash: MAX_DASH,
        dashCd: 0,
        dashCdMax: DASH_CD,
        dashT: 0,
        dashX: 0,
        dashY: 0,
        katanaT: 0,
        katanaMax: 0,
        katanaX: 0,
        katanaY: 0,
        trail: []
      },
      // pathfinding
      flow: null,
      flowT: 0,
      flowGw: 0,
      flowGh: 0,
      flowQueue: null
    };
    function particle(x, y, vx, vy, life, size, col, extra) {
      if (game2.particles.length > 360) game2.particles.shift();
      const p = { x, y, vx, vy, life, max: life, s: size, col, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 14 };
      if (extra) Object.assign(p, extra);
      game2.particles.push(p);
    }
    function ejectCasing(x, y, aim) {
      const side = aim + (Math.PI / 2 + (Math.random() - 0.5) * 1.1) * (Math.random() < 0.5 ? 1 : -1);
      const sp = 120 + Math.random() * 130;
      particle(
        x,
        y,
        Math.cos(side) * sp,
        Math.sin(side) * sp,
        0.42 + Math.random() * 0.22,
        2.6,
        "#161513",
        { casing: true }
      );
    }
    function burst(x, y, n, speed, col, size = 2.4, life = 0.5) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = speed * (0.3 + Math.random() * 0.9);
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random()), size * (0.6 + Math.random()), col);
      }
    }
    function noise(x, y, r, col = "#12A3DA") {
      if (r <= 0) return;
      game2.noiseRings.push({ x, y, r, t: 0, dur: 0.5, col });
      game2.raiseAlarm(x, y);
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DOWN || e.state === S_DEAD) continue;
        if (dist(e.x, e.y, x, y) < r) alertEnemy(e, x, y);
      }
    }
    function triggerSlow(kind) {
      const s = SLOW[kind];
      if (!s) return false;
      if (!s.free && (game2.slowT > 0 || game2.slowCd > 0)) return false;
      const dur = s.dur * (game2.playerStats?.slow || 1);
      game2.slowT = Math.max(game2.slowT, dur);
      game2.slowScale = game2.slowT > 0 ? Math.min(game2.slowScale, s.scale) : s.scale;
      game2.slowCd = dur + SLOW_LOCKOUT;
      sfx.focusIn();
      return true;
    }
    function shake(a) {
      game2.shake = Math.min(26, game2.shake + a);
    }
    function hitstop(t) {
      game2.hitstop = Math.max(game2.hitstop, t);
    }
    function throwStats(charge = 0) {
      const t = clamp(charge / THROW_CHARGE_MAX, 0, 1);
      return {
        charge: t,
        power: 1,
        effectScale: 1,
        range: LOB_RANGE_MIN + (LOB_RANGE_MAX - LOB_RANGE_MIN) * t
      };
    }
    function pointerWorldPoint() {
      return {
        x: (game2.input.mx - renderer2.W / 2) / ZOOM + game2.camera.x,
        y: (game2.input.my - renderer2.H / 2) / ZOOM + game2.camera.y
      };
    }
    function resolveLobTarget(actor, kind, charge = 0) {
      const st = throwStats(charge);
      const sx = actor.x + Math.cos(actor.aim) * 14;
      const sy = actor.y + Math.sin(actor.aim) * 14;
      let tx = actor.x + Math.cos(actor.aim) * st.range;
      let ty = actor.y + Math.sin(actor.aim) * st.range;
      if (actor === game2.player && !game2.input.hasAim) {
        const m = pointerWorldPoint();
        tx = m.x;
        ty = m.y;
      }
      const dx = tx - actor.x, dy = ty - actor.y;
      const d = Math.hypot(dx, dy);
      if (d > st.range) {
        tx = actor.x + dx / d * st.range;
        ty = actor.y + dy / d * st.range;
      }
      return {
        kind,
        startX: sx,
        startY: sy,
        x: tx,
        y: ty,
        originX: actor.x,
        originY: actor.y,
        charge: st.charge,
        power: 1,
        effectScale: 1,
        maxRange: st.range
      };
    }
    function effectRadius(kind, effectScale = 1) {
      const w = WEAPONS[kind] || WEAPONS.pistol;
      if (w.virusCloud) return (w.radius || 128) * effectScale;
      if (w.fire) return (w.fireRadius || 96) * effectScale;
      if (w.radius) return w.radius * effectScale;
      if (w.deploy) return (w.deployRadius || 42) * effectScale;
      return 24;
    }
    const EFFECT_WEAPON = { mad: "dart", tame: "tameDart", virus: "virus" };
    const EFFECT_EXTRACT = { mad: "madExtract", tame: "tameExtract", virus: "virusExtract" };
    const EFFECT_TINT = { mad: "#7AC943", tame: "#8A2BE2", virus: "#7AC943" };
    function weaponStatusEffect(kind) {
      const w = WEAPONS[kind];
      return w && w.statusEffect ? w.statusEffect : null;
    }
    function enemyCanUseWeapon(kind) {
      const w = WEAPONS[kind];
      return !!(w && kind !== "fists" && w.enemyUsable !== false && !w.lobbed && !w.offhandOnly && !w.passive && !w.extract && !w.copySauce);
    }
    function extractKeyForEffect(effect) {
      return EFFECT_EXTRACT[effect] || null;
    }
    function effectWeaponKey(effect) {
      return EFFECT_WEAPON[effect] || null;
    }
    function activeAttackEffect(actor, weaponKey, surface = "direct") {
      const base = weaponStatusEffect(weaponKey);
      if (actor === game2.player) {
        const off = WEAPONS[game2.player.offhandWeapon];
        if (off?.extract && off.extractEffect) return off.extractEffect;
        const side = weaponStatusEffect(game2.player.offhandWeapon);
        if (surface === "shrapnel" && weaponKey === "frag" && (side === "mad" || side === "tame")) return side;
      }
      return base;
    }
    function applyAttackEffectToEnemy(e, effect, x, y, source = game2.player) {
      if (!effect || !e.alive || e.state === S_DEAD) return false;
      if (effect === "tame") return convertEnemy(e, x, y);
      if (effect === "mad") return maddenEnemy(e, WEAPONS.dart.mad || 7.2, x, y);
      if (effect === "virus") return infectEnemy(e, 20, source === game2.player || !!source?.friendly);
      return false;
    }
    function infectEnemy(e, seconds = 20, byPlayer = true) {
      if (!e.alive || e.state === S_DEAD) return false;
      const fresh = !(e.infectT > 0);
      e.infectT = Math.max(e.infectT || 0, seconds);
      e.infectByPlayer = !!(e.infectByPlayer || byPlayer);
      e.stagger = Math.max(e.stagger || 0, fresh ? 0.18 : 0.08);
      if (fresh) burst(e.x, e.y, 12, 150, EFFECT_TINT.virus, 2.3, 0.55);
      return true;
    }
    function infectPlayer(seconds = 20) {
      const p = game2.player;
      if (!p.alive || game2.state !== "play") return false;
      const fresh = !(p.infectT > 0);
      p.infectT = Math.max(p.infectT || 0, seconds);
      if (fresh) {
        game2.banner = "\u611F\u67D3\uFF1A\u6E05\u7A7A\u654C\u4EBA\u53EF\u6CBB\u6108";
        game2.bannerT = 1.15;
        burst(p.x, p.y, 16, 170, EFFECT_TINT.virus, 2.5, 0.62);
        sfx.status();
      }
      return true;
    }
    function applyStatusEffectToPlayer(effect, seconds = 5.8) {
      const p = game2.player;
      if (!p.alive || game2.state !== "play") return false;
      if (effect === "virus") return infectPlayer(20);
      if (effect === "mad") {
        p.madT = Math.max(p.madT || 0, seconds);
        p.madDirT = 0;
        game2.banner = "\u75AF\u72C2\uFF1A\u6682\u65F6\u5931\u63A7";
        game2.bannerT = 0.9;
        burst(p.x, p.y, 14, 150, EFFECT_TINT.mad, 2.2, 0.46);
        sfx.status();
        return true;
      }
      if (effect === "tame") {
        game2.banner = "\u9A6F\u5316\u65E0\u6548\uFF1A\u4F60\u514D\u75AB";
        game2.bannerT = 0.8;
        sfx.status();
        return true;
      }
      return false;
    }
    function infectAt(x, y, weaponKey = "virus", byEnemy = false, effectScale = 1) {
      const w = WEAPONS[weaponKey] || WEAPONS.virus;
      const radius = (w.radius || 128) * effectScale;
      const tint = w.tint || EFFECT_TINT.virus;
      game2.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.16, size: 1.65 });
      burst(x, y, 28, 230, tint, 3.1, 0.62);
      burst(x, y, 14, 120, "#161513", 1.8, 0.55);
      shake(3);
      triggerSlow("throw");
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        const d = dist(x, y, e.x, e.y);
        if (d > radius || !blastClear(x, y, e.x, e.y)) continue;
        infectEnemy(e, 20, !byEnemy);
      }
      const p = game2.player;
      if (p.alive && game2.state === "play" && dist(x, y, p.x, p.y) <= radius * 0.72 && blastClear(x, y, p.x, p.y)) {
        infectPlayer(20);
      }
      game2.banner = "\u75C5\u6BD2\u6269\u6563";
      game2.bannerT = 0.85;
    }
    function estimateThrow(actor, kind, charge = 0) {
      const w = WEAPONS[kind] || WEAPONS.pistol;
      const lobbed = !!w.lobbed;
      const st = lobbed ? throwStats(charge) : { charge: 0, power: 1, effectScale: 1 };
      if (lobbed) {
        const target = resolveLobTarget(actor, kind, charge);
        const points2 = [];
        const dx = target.x - target.startX, dy = target.y - target.startY;
        const d = Math.hypot(dx, dy);
        const lift = clamp(d * 0.16, 18, 74);
        for (let i = 0; i <= 22; i++) {
          const t = i / 22;
          points2.push({
            x: target.startX + dx * t,
            y: target.startY + dy * t - Math.sin(t * Math.PI) * lift
          });
        }
        return {
          ...target,
          points: points2,
          radius: effectRadius(kind, 1),
          explosive: !!w.fire || !!w.radius || !!w.virusCloud,
          rangeMode: true
        };
      }
      const sp = (w.throwSpeed || 900) * st.power;
      let x = actor.x + Math.cos(actor.aim) * 14;
      let y = actor.y + Math.sin(actor.aim) * 14;
      let vx = Math.cos(actor.aim) * sp;
      let vy = Math.sin(actor.aim) * sp;
      let life = lobbed ? w.fuse || 1.2 : 1.6;
      const points = [{ x, y }];
      for (let i = 0; i < 80 && life > 0; i++) {
        const dt = Math.min(1 / 30, life);
        life -= dt;
        x += vx * dt;
        y += vy * dt;
        vx = approach(vx, 0, lobbed ? 7 : 4, dt);
        vy = approach(vy, 0, lobbed ? 7 : 4, dt);
        if (i % 2 === 0) points.push({ x, y });
        if (!lobbed && Math.hypot(vx, vy) < 30) break;
      }
      points.push({ x, y });
      return {
        kind,
        x,
        y,
        points,
        charge: st.charge,
        power: st.power,
        effectScale: st.effectScale,
        radius: effectRadius(kind, 1),
        explosive: false,
        rangeMode: false
      };
    }
    function katanaChargeRatio(w, charge) {
      return clamp(charge / (w.chargeMax || THROW_CHARGE_MAX), 0, 1);
    }
    function katanaPointClear(x, y, r = 9) {
      return !game2.level.solidAt(x, y) && !game2.level.solidAt(x + r, y) && !game2.level.solidAt(x - r, y) && !game2.level.solidAt(x, y + r) && !game2.level.solidAt(x, y - r);
    }
    function nearestKatanaLanding(tx, ty, fallback) {
      if (katanaPointClear(tx, ty, 9)) return { x: tx, y: ty };
      const maxR = 220;
      const step2 = 7;
      let best = null, bestD = Infinity;
      for (let oy = -maxR; oy <= maxR; oy += step2) {
        for (let ox = -maxR; ox <= maxR; ox += step2) {
          const d2 = ox * ox + oy * oy;
          if (d2 >= bestD || d2 > maxR * maxR) continue;
          const x = tx + ox, y = ty + oy;
          if (!katanaPointClear(x, y, 9)) continue;
          best = { x, y };
          bestD = d2;
        }
      }
      if (!best) return fallback || { x: tx, y: ty };
      let refined = best, refinedD = bestD;
      for (let oy = -8; oy <= 8; oy += 2) {
        for (let ox = -8; ox <= 8; ox += 2) {
          const x = best.x + ox, y = best.y + oy;
          const d2 = (x - tx) * (x - tx) + (y - ty) * (y - ty);
          if (d2 >= refinedD || !katanaPointClear(x, y, 9)) continue;
          refined = { x, y };
          refinedD = d2;
        }
      }
      return refined;
    }
    function resolveKatanaTarget(actor, tx, ty, range) {
      const dx = tx - actor.x, dy = ty - actor.y;
      const d = Math.hypot(dx, dy) || 1;
      const len = Math.min(d, range);
      const ux = dx / d, uy = dy / d;
      return nearestKatanaLanding(actor.x + ux * len, actor.y + uy * len, { x: actor.x, y: actor.y });
    }
    function estimateKatana(actor, charge = 0) {
      const w = WEAPONS[actor.weapon] || WEAPONS.katana;
      const range = w.blinkRange || 620;
      let tx = actor.x + Math.cos(actor.aim) * range;
      let ty = actor.y + Math.sin(actor.aim) * range;
      if (actor === game2.player && !game2.input.hasAim) {
        const m = pointerWorldPoint();
        tx = m.x;
        ty = m.y;
      }
      const target = resolveKatanaTarget(actor, tx, ty, range);
      return {
        kind: actor.weapon,
        katana: true,
        lotus: true,
        x: target.x,
        y: target.y,
        points: [{ x: actor.x, y: actor.y }, { x: target.x, y: target.y }],
        charge: katanaChargeRatio(w, charge),
        radius: w.blinkRadius || 20,
        explosive: false,
        rangeMode: true,
        maxRange: range,
        originX: actor.x,
        originY: actor.y
      };
    }
    game2.throwStats = throwStats;
    function recordList(list, key2, allowed) {
      if (!key2 || !allowed.includes(key2) || list.includes(key2)) return false;
      list.push(key2);
      list.sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b));
      saveCodex(game2.codex);
      return true;
    }
    game2.recordWeapon = function(kind) {
      return recordList(game2.codex.weapons, kind, CODEX_WEAPON_KEYS);
    };
    game2.recordEnemy = function(kind) {
      return recordList(game2.codex.enemies, kind, ENEMY_KEYS);
    };
    game2.codexCounts = function() {
      return {
        weapons: game2.codex.weapons.length,
        weaponTotal: CODEX_WEAPON_KEYS.length,
        enemies: game2.codex.enemies.length,
        enemyTotal: ENEMY_KEYS.length
      };
    };
    function smashWindow(win, dx = 0, dy = 0) {
      if (!win || !game2.level.breakWindow(win)) return false;
      renderer2.shards(win.x, win.y, dx, dy);
      burst(win.x, win.y, 14, 240, "#161513", 2.4, 0.5);
      noise(win.x, win.y, 300);
      sfx.glass();
      shake(4);
      game2.flowT = 0;
      return true;
    }
    game2.smashWindow = smashWindow;
    function blastClear(x, y, tx, ty) {
      return !game2.level || hasLineOfSight(game2.level, x, y, tx, ty);
    }
    function actorFacing(actor) {
      return actor === game2.player ? actor.aim : actor.angle;
    }
    function heldShieldBlocks(actor, fromX, fromY) {
      const w = WEAPONS[actor?.weapon];
      if (!actor || !actor.alive || !w || !w.defense) return false;
      if (actor.state === S_DOWN || actor.state === S_DEAD) return false;
      if (actor !== game2.player && (actor.heldShieldHp || 0) <= 0) return false;
      const a = Math.atan2(fromY - actor.y, fromX - actor.x);
      return Math.abs(angDelta(actorFacing(actor), a)) <= (w.shieldArc || 1.28);
    }
    function blockOnHeldShield(actor, fromX, fromY, hard = false) {
      const face = actorFacing(actor);
      const r = actor === game2.player ? 19 : (ENEMY_DEF[actor.type]?.r || 11) + 9;
      const sx = actor.x + Math.cos(face) * r;
      const sy = actor.y + Math.sin(face) * r;
      actor.blockFlash = Math.max(actor.blockFlash || 0, hard ? 0.38 : 0.3);
      if (actor !== game2.player) {
        const dmg = hard ? 2 : 1;
        actor.heldShieldHp = Math.max(0, (actor.heldShieldHp || WEAPONS.shield.durability || 5) - dmg);
        actor.stagger = Math.max(actor.stagger || 0, hard ? 0.3 : 0.12);
        if (actor.heldShieldHp <= 0) {
          actor.weapon = "fists";
          actor.ammo = 0;
          actor.stagger = Math.max(actor.stagger || 0, 0.72);
          burst(sx, sy, 14, 280, "#161513", 2.7, 0.48);
          sfx.shieldBreak();
        }
      }
      burst(sx, sy, hard ? 11 : 7, hard ? 250 : 170, WEAPONS.shield.tint, hard ? 2.6 : 2, 0.3);
      sfx.block();
      shake(hard ? 4.5 : 2.4);
      return true;
    }
    game2.heldShieldBlocks = heldShieldBlocks;
    game2.blockOnHeldShield = blockOnHeldShield;
    function sprayShrapnel(x, y, w, byEnemy, statusEffect = null) {
      const n = w.shrapnel || 0;
      if (!n) return;
      const step2 = TAU / n;
      for (let i = 0; i < n; i++) {
        const b = spawnFrom(game2.pools.bullets);
        if (!b) break;
        const a = i * step2 + (rnd() - 0.5) * step2 * 0.85;
        const sp = (w.shrapnelSpeed || 820) * (0.72 + rnd() * 0.42);
        b.alive = true;
        b.x = x + Math.cos(a) * 6;
        b.y = y + Math.sin(a) * 6;
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
        b.life = 0.45 + rnd() * 0.12;
        b.friendly = !byEnemy;
        b.pierce = 0;
        b.near = 1;
        b.shieldDmg = 1;
        b.armourPierce = 0;
        b.throughDoors = false;
        b.hitDoor = null;
        b.owner = null;
        b.throughWalls = false;
        b.wallPierced = 0;
        b.statusEffect = statusEffect || null;
        b.weapon = statusEffect ? effectWeaponKey(statusEffect) : null;
        b.projectile = null;
        b.explosive = false;
      }
    }
    function explodeAt(x, y, weaponKey, byEnemy = false, effectScale = 1, statusEffect = null, shrapnelEffect = statusEffect) {
      const w = WEAPONS[weaponKey] || WEAPONS.grenade;
      if (w.virusCloud && !statusEffect) {
        infectAt(x, y, weaponKey, byEnemy, effectScale);
        return;
      }
      const radius = (w.radius || 96) * effectScale;
      const tint = w.tint || "#EC0A63";
      game2.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.18, size: 2.7 });
      burst(x, y, 34, 390, tint, 4.2, 0.68);
      burst(x, y, 22, 250, "#161513", 3, 0.75);
      if (!w.silent) noise(x, y, w.noise ?? radius * 5, tint);
      shake(w.shake || 18);
      hitstop(0.075);
      triggerSlow("explosion");
      if (!w.silent) {
        if (sfx.explosion) sfx.explosion();
        else sfx.splinter();
      }
      for (const win of game2.level.windows) {
        if (win.broken || dist(x, y, win.x, win.y) > radius * 0.95) continue;
        if (!blastClear(x, y, win.x, win.y)) continue;
        if (game2.level.breakWindow(win)) {
          renderer2.shards(win.x, win.y, win.x - x, win.y - y);
          burst(win.x, win.y, 9, 210, "#161513", 2.1, 0.42);
          game2.flowT = 0;
        }
      }
      for (const d of game2.level.doors) {
        if (dist(x, y, d.x, d.y) > radius * 0.75) continue;
        d.open = Math.max(d.open, 1);
        d.slam = Math.max(d.slam, 1);
        d.swing = d.horiz ? y < d.y ? 1 : -1 : x > d.x ? 1 : -1;
        game2.flowT = 0;
      }
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        const d = dist(x, y, e.x, e.y);
        if (d > radius || !blastClear(x, y, e.x, e.y)) continue;
        const nx = (e.x - x) / (d || 1), ny = (e.y - y) / (d || 1);
        if (heldShieldBlocks(e, x, y)) {
          blockOnHeldShield(e, x, y, true);
          continue;
        }
        const blocked = shieldBlocks(e, x, y);
        if (blocked) {
          const falloff = clamp(1 - d / radius, 0.25, 1);
          damageShield(e, Math.max(1, Math.round((w.shieldDmg || 3) * falloff)), true, x, y);
          if (shieldBlocks(e, x, y)) continue;
        }
        if (statusEffect) {
          applyAttackEffectToEnemy(e, statusEffect, x, y, byEnemy ? null : game2.player);
          continue;
        }
        if (d <= radius * (w.blastKill || 0.75) || e.state === S_DOWN) {
          killEnemy(e, 1.35, nx, ny, byEnemy);
        } else {
          knockdown(e, nx, ny);
        }
      }
      const p = game2.player;
      if (p.alive && game2.state === "play") {
        const d = dist(x, y, p.x, p.y);
        if (d <= radius * 0.58 && blastClear(x, y, p.x, p.y)) {
          if (heldShieldBlocks(p, x, y)) blockOnHeldShield(p, x, y, true);
          else if (statusEffect) applyStatusEffectToPlayer(statusEffect);
          else game2.killPlayer();
        }
      }
      sprayShrapnel(x, y, w, byEnemy, shrapnelEffect);
    }
    function panicFire(e, chance) {
      const w = WEAPONS[e.weapon];
      if (!w || w.melee || w.lobbed || w.defense || e.ammo <= 0) return false;
      if (rnd() >= chance) return false;
      const shots = Math.min(e.ammo, 2 + Math.floor(rnd() * 4));
      for (let i = 0; i < shots; i++) {
        const a = rnd() * TAU;
        game2.fireEnemyBullet(e, e.x + Math.cos(a) * 260, e.y + Math.sin(a) * 260);
        e.ammo--;
      }
      e.fireTimer = Math.max(e.fireTimer || 0, 0.9);
      e.reload = Math.max(e.reload || 0, 1.15);
      return true;
    }
    function flashAt(x, y, weaponKey = "flash", byEnemy = false, effectScale = 1) {
      const w = WEAPONS[weaponKey] || WEAPONS.flash;
      const radius = (w.radius || 160) * effectScale;
      const tint = w.tint || "#EFECE3";
      game2.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.34, size: 3.4 });
      burst(x, y, 42, 460, tint, 4.6, 0.55);
      burst(x, y, 22, 260, "#F7CF16", 2.3, 0.38);
      noise(x, y, w.noise || 500, tint);
      shake(12);
      hitstop(0.055);
      triggerSlow("explosion");
      sfx.splinter();
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        const d = dist(x, y, e.x, e.y);
        if (d > radius || !blastClear(x, y, e.x, e.y)) continue;
        const falloff = clamp(1 - d / radius, 0.22, 1);
        if (heldShieldBlocks(e, x, y)) {
          blockOnHeldShield(e, x, y, true);
          continue;
        }
        if (shieldBlocks(e, x, y)) {
          damageShield(e, Math.max(1, Math.round((w.shieldDmg || 1) * falloff)), true, x, y);
          if (shieldBlocks(e, x, y)) continue;
        }
        panicFire(e, (w.panicChance || 0.16) * (0.55 + falloff));
        if (e.weapon !== "fists" && rnd() < (w.disarmChance || 0.3) * (0.55 + falloff)) {
          game2.dropWeapon(e, false);
        }
        const nx = (e.x - x) / (d || 1), ny = (e.y - y) / (d || 1);
        e.state = S_DOWN;
        e.downTimer = Math.max(e.downTimer || 0, (w.stun || 5.2) * (0.58 + falloff * 0.56));
        e.vx = nx * 150;
        e.vy = ny * 150;
        e.seeking = 0;
        e.madT = 0;
        e.stagger = Math.max(e.stagger || 0, 0.35);
        burst(e.x, e.y, 8, 160, tint, 2.1, 0.36);
      }
      const p = game2.player;
      if (p.alive && game2.state === "play") {
        const d = dist(x, y, p.x, p.y);
        if (d <= radius * 0.76 && blastClear(x, y, p.x, p.y)) {
          if (heldShieldBlocks(p, x, y)) blockOnHeldShield(p, x, y, true);
          else game2.flash = Math.max(game2.flash, 0.82);
        }
      }
    }
    function igniteAt(x, y, weaponKey = "molotov", byEnemy = false, effectScale = 1) {
      const w = WEAPONS[weaponKey] || WEAPONS.molotov;
      const r = (w.fireRadius || 96) * effectScale;
      const dur = w.fireDur || 5;
      game2.fireZones.push({ x, y, r, t: 0, dur, kill: w.fireKill || 0.35, byEnemy });
      if (game2.fireZones.length > 12) game2.fireZones.shift();
      game2.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.24, size: 2.1 });
      burst(x, y, 30, 310, "#FF6A00", 3.5, 0.62);
      burst(x, y, 16, 170, "#F7CF16", 2.2, 0.45);
      noise(x, y, w.noise || 320, w.tint || "#FF6A00");
      shake(8);
      hitstop(0.045);
      sfx.glass();
    }
    function finishLobbed(t, w) {
      t.alive = false;
      if (w.virusCloud && (!t.statusEffect || t.statusEffect === "virus")) {
        infectAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1);
        return;
      }
      if (w.deploy) deployAt(t.x, t.y, w.deploy, t.friendly !== false);
      else if (w.flashbang) flashAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1);
      else if (w.fire) igniteAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1);
      else explodeAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1, t.statusEffect || null, t.shrapnelEffect || t.statusEffect || null);
    }
    function supportPointClear(x, y, r = 8) {
      return !game2.level.solidAt(x, y) && !game2.level.solidAt(x + r, y) && !game2.level.solidAt(x - r, y) && !game2.level.solidAt(x, y + r) && !game2.level.solidAt(x, y - r);
    }
    function nearestSupportPoint(tx, ty, r = 8, fallback = null) {
      if (supportPointClear(tx, ty, r)) return { x: tx, y: ty };
      let best = fallback || { x: tx, y: ty };
      let bestD = Infinity;
      for (let rr = 8; rr <= 128; rr += 8) {
        for (let a = 0; a < TAU; a += TAU / 16) {
          const x = tx + Math.cos(a) * rr;
          const y = ty + Math.sin(a) * rr;
          const d2 = (x - tx) * (x - tx) + (y - ty) * (y - ty);
          if (d2 >= bestD || !supportPointClear(x, y, r)) continue;
          best = { x, y };
          bestD = d2;
        }
        if (bestD < Infinity) break;
      }
      return best;
    }
    function recycleSlot(pool) {
      const open = spawnFrom(pool);
      if (open) return open;
      let oldest = pool[0] || null;
      for (const item of pool) if ((item.life || 0) < (oldest.life || 0)) oldest = item;
      return oldest;
    }
    function pickupSlot() {
      const pool = game2.pools.pickups || [];
      const open = spawnFrom(pool);
      if (open) return open;
      if (!pool.length) return null;
      const slot = pool[game2.pickupWrite % pool.length];
      game2.pickupWrite = (game2.pickupWrite + 1) % pool.length;
      return slot;
    }
    function placePickup(x, y, kind, ammo = 0, angle = rnd() * TAU) {
      const k = pickupSlot();
      if (!k) return false;
      k.alive = true;
      k.x = x;
      k.y = y;
      k.kind = kind;
      k.ammo = ammo;
      k.angle = angle;
      return true;
    }
    function deployAt(x, y, deployKind, friendly = true) {
      const key2 = deployKind === "drones" ? "dronePack" : "sentryPack";
      const w = WEAPONS[key2] || WEAPONS.sentryPack;
      const center = nearestSupportPoint(x, y, 9, { x: game2.player.x, y: game2.player.y });
      if (deployKind === "drones") {
        const count = w.droneCount || 3;
        for (let i = 0; i < count; i++) {
          const slot = recycleSlot(game2.pools.drones || []);
          if (!slot) break;
          const a = i * TAU / count + rnd() * 0.28;
          const p0 = nearestSupportPoint(center.x + Math.cos(a) * 24, center.y + Math.sin(a) * 24, 6, center);
          slot.alive = true;
          slot.x = p0.x;
          slot.y = p0.y;
          slot.vx = Math.cos(a) * 24;
          slot.vy = Math.sin(a) * 24;
          slot.angle = a;
          slot.ammo = w.droneAmmo || 3;
          slot.fireTimer = 0.18 + i * 0.07;
          slot.life = 44;
          slot.friendly = friendly;
          slot.target = null;
          slot.navX = Math.cos(a);
          slot.navY = Math.sin(a);
          slot.navT = 0;
          slot.spin = rnd() * TAU;
          slot.kamikaze = false;
          slot.blastT = 0;
        }
        game2.banner = "\u6BD2\u8702\u65E0\u4EBA\u673A\u90E8\u7F72";
      } else {
        const slot = recycleSlot(game2.pools.deploys || []);
        if (!slot) return false;
        slot.alive = true;
        slot.kind = "sentry";
        slot.x = center.x;
        slot.y = center.y;
        slot.angle = rnd() * TAU;
        slot.ammo = WEAPONS.smg.ammo;
        slot.fireTimer = 0.22;
        slot.reload = 0;
        slot.life = 62;
        slot.friendly = friendly;
        slot.spin = 0;
        slot.target = null;
        game2.banner = "\u54E8\u6212\u673A\u67AA\u90E8\u7F72";
      }
      game2.bannerT = 0.65;
      burst(center.x, center.y, 16, 180, w.tint || "#00A651", 2.3, 0.42);
      noise(center.x, center.y, w.noise || 160, w.tint || "#00A651");
      sfx.pickup();
      return true;
    }
    game2.deployAt = deployAt;
    function damageShield(e, amount, hard, fromX, fromY) {
      const segs = e.segs || 1;
      const idx = shieldSegmentAt(e, fromX, fromY);
      e.blockFlash = 0.25;
      if (idx >= 0) {
        const order = [idx];
        for (let d = 1; d < segs; d++) {
          order.push(idx - d, idx + d);
        }
        let cleared = 0;
        for (const i of order) {
          if (cleared >= amount) break;
          if (i < 0 || i >= segs) continue;
          while (cleared < amount) {
            const L = outermostPlate(e, i);
            if (L < 0) break;
            e.shieldSeg &= ~plateBit(e, L, i);
            cleared++;
          }
        }
      }
      e.shieldHp = shieldCount(e.shieldSeg);
      e.stagger = Math.max(e.stagger, hard ? 0.7 : 0.22);
      sfx.block();
      shake(hard ? 7 : 3);
      const arc = armourArc(e);
      const ba = e.angle + (idx >= 0 ? -arc + (idx + 0.5) * (arc * 2 / segs) : 0);
      burst(e.x + Math.cos(ba) * 22, e.y + Math.sin(ba) * 22, 5, 190, "#161513", 2.2, 0.35);
      if (e.shieldHp <= 0) {
        e.shieldHp = 0;
        e.shieldSeg = 0;
        e.stagger = 0.85;
        hitstop(0.05);
        shake(11);
        sfx.shieldBreak();
        burst(e.x + Math.cos(e.angle) * 22, e.y + Math.sin(e.angle) * 22, 16, 320, "#161513", 3.2, 0.7);
        if (e.armour >= 3) {
          game2.banner = e.armour >= 8 ? "\u91CD\u7532\u5265\u79BB" : "\u76FE\u724C\u7834\u788E";
          game2.bannerT = 0.9;
        }
      }
    }
    game2.damageShield = damageShield;
    game2.dropWeapon = function(e, silent) {
      if (!e.weapon || e.weapon === "fists") return;
      placePickup(e.x + (rnd() - 0.5) * 18, e.y + (rnd() - 0.5) * 18, e.weapon, e.ammo, rnd() * TAU);
      e.weapon = "fists";
      e.ammo = 0;
      e.heldShieldHp = 0;
      if (!silent) burst(e.x, e.y, 3, 90, "#161513", 2, 0.3);
    };
    game2.seekWeapon = function(e) {
      if (ENEMY_DEF[e.type].handless) {
        e.seeking = 0;
        return;
      }
      let best = null, bd = 430 * 430;
      for (const k of game2.pools.pickups) {
        if (!k.alive) continue;
        if (!enemyCanUseWeapon(k.kind)) continue;
        const d = dist(e.x, e.y, k.x, k.y);
        if (d * d < bd) {
          bd = d * d;
          best = k;
        }
      }
      if (!best) {
        e.seeking = 0;
        return;
      }
      e.skx = best.x;
      e.sky = best.y;
      e.seeking = 6;
    };
    game2.tryTakePickup = function(e) {
      if (ENEMY_DEF[e.type].handless) return true;
      if (e.weapon !== "fists") return true;
      for (const k of game2.pools.pickups) {
        if (!k.alive) continue;
        if (!enemyCanUseWeapon(k.kind)) continue;
        const w = WEAPONS[k.kind];
        if (dist(e.x, e.y, k.x, k.y) > 22) continue;
        e.weapon = k.kind;
        e.ammo = k.ammo || WEAPONS[k.kind].ammo;
        e.heldShieldHp = w.defense ? w.durability || 5 : 0;
        k.alive = false;
        sfx.pickup();
        return true;
      }
      return false;
    };
    game2.friendlyInLine = function(e, tx, ty) {
      const dx = tx - e.x, dy = ty - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const p = game2.player;
      if (e.friendly && p.alive) {
        const px = p.x - e.x, py = p.y - e.y;
        const t = px * ux + py * uy;
        const perp = Math.abs(px * -uy + py * ux);
        if (t >= 20 && t <= len && perp < 14) return true;
      }
      for (const o of game2.pools.enemies) {
        if (o === e || !o.alive || o.state === S_DEAD) continue;
        if (!!o.friendly !== !!e.friendly) continue;
        const px = o.x - e.x, py = o.y - e.y;
        const t = px * ux + py * uy;
        if (t < 20 || t > len) continue;
        const perp = Math.abs(px * -uy + py * ux);
        if (perp < ENEMY_DEF[o.type].r + 5) return true;
      }
      return false;
    };
    function hostilesLeft() {
      return game2.pools.enemies.reduce((n, e) => n + (e.alive && e.state !== S_DEAD && !e.friendly ? 1 : 0), 0);
    }
    function startingLoadout() {
      if (game2.mode === "practice") return loadoutFor(game2.practice.weapon);
      if (game2.mode === "defense") return loadoutFor("pistol");
      return { weapon: "disguise", ammo: WEAPONS.disguise.ammo };
    }
    game2.raiseAlarm = function(x, y) {
      const moved = dist(game2.alarmX, game2.alarmY, x, y) > TILE;
      game2.alarmX = x;
      game2.alarmY = y;
      if (moved) game2.flowT = 0;
    };
    function computeFlow() {
      const lv = game2.level;
      const n = lv.gw * lv.gh;
      if (!game2.flow || game2.flow.length !== n) {
        game2.flow = new Int32Array(n);
        game2.flowQueue = new Int32Array(n);
      }
      const flow = game2.flow, q2 = game2.flowQueue;
      flow.fill(-1);
      let sx = clamp(game2.alarmX / TILE | 0, 0, lv.gw - 1);
      let sy = clamp(game2.alarmY / TILE | 0, 0, lv.gh - 1);
      if (!lv.walkableTile(sx, sy)) {
        let found = false;
        for (let r = 1; r <= 6 && !found; r++) {
          for (let oy = -r; oy <= r && !found; oy++) {
            for (let ox = -r; ox <= r && !found; ox++) {
              if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
              if (lv.walkableTile(sx + ox, sy + oy)) {
                sx += ox;
                sy += oy;
                found = true;
              }
            }
          }
        }
        if (!found) return;
      }
      let hi = 0, lo = 0;
      const start = sy * lv.gw + sx;
      flow[start] = 0;
      q2[hi++] = start;
      while (lo < hi) {
        const cur = q2[lo++];
        const cx = cur % lv.gw, cy = cur / lv.gw | 0;
        const d = flow[cur] + 1;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = cx + ox, ny = cy + oy;
            if (!lv.walkableTile(nx, ny)) continue;
            if (ox && oy && (!lv.walkableTile(cx + ox, cy) || !lv.walkableTile(cx, cy + oy))) continue;
            const ni = ny * lv.gw + nx;
            if (flow[ni] !== -1) continue;
            flow[ni] = d;
            q2[hi++] = ni;
          }
        }
      }
    }
    game2.flowStep = function(x, y) {
      const lv = game2.level, flow = game2.flow;
      if (!flow) return null;
      const gx = clamp(x / TILE | 0, 0, lv.gw - 1);
      const gy = clamp(y / TILE | 0, 0, lv.gh - 1);
      const here = flow[gy * lv.gw + gx];
      if (here < 0) return null;
      let ax = 0, ay = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = gx + ox, ny = gy + oy;
          if (!lv.walkableTile(nx, ny)) continue;
          if (ox && oy && (!lv.walkableTile(gx + ox, gy) || !lv.walkableTile(gx, gy + oy))) continue;
          const v = flow[ny * lv.gw + nx];
          if (v < 0 || v >= here) continue;
          const w = (here - v) / Math.hypot(ox, oy);
          ax += ox * w;
          ay += oy * w;
        }
      }
      const l = Math.hypot(ax, ay);
      if (l < 1e-4) return null;
      return { x: ax / l, y: ay / l };
    };
    game2.walkClear = function(ax, ay, bx, by, r) {
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1) return true;
      const ux = dx / len, uy = dy / len;
      const px = -uy * r, py = ux * r;
      const steps = Math.ceil(len / 10);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps * len;
        const cx = ax + ux * t, cy = ay + uy * t;
        if (game2.level.solidAt(cx + px, cy + py)) return false;
        if (game2.level.solidAt(cx - px, cy - py)) return false;
      }
      return true;
    };
    game2.pathDir = function(e, tx, ty, r, useField) {
      if (game2.walkClear(e.x, e.y, tx, ty, r * 0.85)) {
        const dx2 = tx - e.x, dy2 = ty - e.y;
        const l2 = Math.hypot(dx2, dy2) || 1;
        return { x: dx2 / l2, y: dy2 / l2, direct: true };
      }
      if (useField) {
        const step2 = game2.flowStep(e.x, e.y);
        if (step2) return { x: step2.x, y: step2.y, direct: false };
      }
      const dx = tx - e.x, dy = ty - e.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, direct: false };
    };
    game2.pathDirToPoint = function(e, tx, ty, r) {
      if (game2.walkClear(e.x, e.y, tx, ty, r * 0.85)) {
        const dx2 = tx - e.x, dy2 = ty - e.y;
        const l2 = Math.hypot(dx2, dy2) || 1;
        return { x: dx2 / l2, y: dy2 / l2, direct: true };
      }
      const lv = game2.level;
      const sx = clamp(e.x / TILE | 0, 0, lv.gw - 1);
      const sy = clamp(e.y / TILE | 0, 0, lv.gh - 1);
      const gx = clamp(tx / TILE | 0, 0, lv.gw - 1);
      const gy = clamp(ty / TILE | 0, 0, lv.gh - 1);
      const start = sy * lv.gw + sx;
      const goal = gy * lv.gw + gx;
      if (!lv.walkableTile(sx, sy) || !lv.walkableTile(gx, gy)) {
        const dx2 = tx - e.x, dy2 = ty - e.y;
        const l2 = Math.hypot(dx2, dy2) || 1;
        return { x: dx2 / l2, y: dy2 / l2, direct: false };
      }
      const n = lv.gw * lv.gh;
      const prev = new Int32Array(n);
      const q2 = new Int32Array(n);
      prev.fill(-2);
      prev[start] = -1;
      let lo = 0, hi = 0, best = start, bestD = Infinity;
      q2[hi++] = start;
      while (lo < hi) {
        const cur2 = q2[lo++];
        const cx2 = cur2 % lv.gw, cy2 = cur2 / lv.gw | 0;
        const d2 = (cx2 - gx) * (cx2 - gx) + (cy2 - gy) * (cy2 - gy);
        if (d2 < bestD) {
          bestD = d2;
          best = cur2;
        }
        if (cur2 === goal) {
          best = cur2;
          break;
        }
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = cx2 + ox, ny = cy2 + oy;
            if (!lv.walkableTile(nx, ny)) continue;
            if (ox && oy && (!lv.walkableTile(cx2 + ox, cy2) || !lv.walkableTile(cx2, cy2 + oy))) continue;
            const ni = ny * lv.gw + nx;
            if (prev[ni] !== -2) continue;
            prev[ni] = cur2;
            q2[hi++] = ni;
          }
        }
      }
      let cur = prev[goal] === -2 ? best : goal;
      if (cur === start) {
        const step2 = game2.flowStep(e.x, e.y);
        if (step2) return { x: step2.x, y: step2.y, direct: false };
        const dx2 = tx - e.x, dy2 = ty - e.y;
        const l2 = Math.hypot(dx2, dy2) || 1;
        return { x: dx2 / l2, y: dy2 / l2, direct: false };
      }
      while (prev[cur] !== start && prev[cur] >= 0) cur = prev[cur];
      const cx = (cur % lv.gw + 0.5) * TILE;
      const cy = ((cur / lv.gw | 0) + 0.5) * TILE;
      const dx = cx - e.x, dy = cy - e.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, direct: false };
    };
    game2.nearestTarget = function(x, y) {
      let best = null, bd = Infinity;
      for (const t of game2.targets) {
        if (!t.alive) continue;
        const d = dist(x, y, t.x, t.y);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return best;
    };
    game2.playerDisguised = function() {
      const w = WEAPONS[game2.player.weapon];
      return game2.state === "play" && game2.player.alive && !!(w && w.disguise);
    };
    game2.enemyTargets = function(e) {
      const out = game2.madTargets;
      out.length = 0;
      const p = game2.player;
      if (!e.friendly && p.alive && game2.state === "play" && !game2.playerDisguised()) {
        out.push({ alive: true, x: p.x, y: p.y, vx: p.vx, vy: p.vy, enemy: null });
      }
      for (const o of game2.pools.enemies) {
        if (o === e || !o.alive || o.state === S_DEAD) continue;
        if (!!o.friendly === !!e.friendly) continue;
        out.push({ alive: true, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, enemy: o });
      }
      return out;
    };
    game2.frenzyTargets = function(e) {
      const out = game2.madTargets;
      out.length = 0;
      const p = game2.player;
      if (p.alive && game2.state === "play") {
        out.push({ alive: true, x: p.x, y: p.y, vx: p.vx, vy: p.vy, enemy: null });
      }
      for (const o of game2.pools.enemies) {
        if (o === e || !o.alive || o.state === S_DEAD) continue;
        out.push({ alive: true, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, enemy: o });
      }
      return out;
    };
    game2.shout = function(e, x, y) {
      game2.raiseAlarm(x, y);
      game2.noiseRings.push({ x: e.x, y: e.y, r: 340, t: 0, dur: 0.55, col: "#EC0A63" });
      for (const o of game2.pools.enemies) {
        if (o === e || !o.alive || o.state === S_DOWN || o.state === S_DEAD) continue;
        if (!!o.friendly !== !!e.friendly) continue;
        if (dist(o.x, o.y, e.x, e.y) < 340) alertEnemy(o, x, y, 7);
      }
      sfx.shout();
    };
    function clearLiveInput() {
      const i = game2.input;
      i.up = false;
      i.down = false;
      i.left = false;
      i.right = false;
      i.fire = false;
      i.fireReleased = false;
      i.dash = false;
      i.throwIt = false;
      i.throwHeld = false;
      i.throwReleased = false;
      i.swap = false;
      i.buy = null;
      i.analog = false;
      i.axisX = 0;
      i.axisY = 0;
      game2.throwCharge = 0;
      game2.throwPreview = null;
    }
    function storedSlot(kind, ammo = 0) {
      const w = WEAPONS[kind];
      if (!w || kind === "fists") return { weapon: "fists", ammo: 0 };
      return {
        weapon: kind,
        ammo: w.melee ? 0 : clamp(Number(ammo) || 0, 0, w.ammo || 0)
      };
    }
    function setMainSlot(p, kind, ammo = 0) {
      const slot = storedSlot(kind, ammo);
      p.weapon = slot.weapon;
      p.ammo = slot.ammo;
      if (slot.weapon !== "fists") game2.recordWeapon(slot.weapon);
      return slot.weapon !== "fists";
    }
    function setOffhandSlot(p, kind, ammo = 0) {
      const slot = storedSlot(kind, ammo);
      p.offhandWeapon = slot.weapon;
      p.offhandAmmo = slot.ammo;
      if (slot.weapon !== "fists") game2.recordWeapon(slot.weapon);
      return slot.weapon !== "fists";
    }
    function playerHasOffhand(kind) {
      return game2.player.offhandWeapon === kind;
    }
    function givePlayerWeapon(p, kind, ammo = WEAPONS[kind]?.ammo || 0, replaceOffhand = false) {
      const w = WEAPONS[kind];
      if (!w || kind === "fists") return false;
      if (w.offhandOnly) {
        if (p.offhandWeapon !== "fists" && !replaceOffhand) return false;
        if (p.offhandWeapon !== "fists") placePickup(p.x, p.y, p.offhandWeapon, p.offhandAmmo, p.aim + Math.PI);
        return setOffhandSlot(p, kind, ammo);
      }
      if (p.weapon === "fists") return setMainSlot(p, kind, ammo);
      if (p.offhandWeapon === "fists") return setOffhandSlot(p, kind, ammo);
      if (!replaceOffhand) return false;
      placePickup(p.x, p.y, p.offhandWeapon, p.offhandAmmo, p.aim + Math.PI);
      return setOffhandSlot(p, kind, ammo);
    }
    function stashPlayerWeapon() {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      const ow = WEAPONS[p.offhandWeapon];
      if ((!w || p.weapon === "fists") && (!ow || p.offhandWeapon === "fists")) return null;
      return {
        weapon: w && p.weapon !== "fists" ? p.weapon : "fists",
        ammo: w && !w.melee ? clamp(p.ammo || 0, 0, w.ammo || 0) : 0,
        offhand: ow && p.offhandWeapon !== "fists" ? p.offhandWeapon : "fists",
        offAmmo: ow && !ow.melee ? clamp(p.offhandAmmo || 0, 0, ow.ammo || 0) : 0
      };
    }
    function equipPlayerWeapon(p, carried) {
      setMainSlot(p, "fists", 0);
      setOffhandSlot(p, "fists", 0);
      if (!carried) return;
      const main = carried.weapon || "fists";
      const offhand = carried.offhand || carried.sideWeapon || "fists";
      if (WEAPONS[main]?.offhandOnly) setOffhandSlot(p, main, carried.ammo);
      else setMainSlot(p, main, carried.ammo);
      if (offhand !== "fists") setOffhandSlot(p, offhand, carried.offAmmo ?? carried.sideAmmo);
    }
    function choosePreviewSeed() {
      const next = previewRunSeed();
      game2.seed = next.seed;
      game2.seedBase = next.base;
      game2.customSeed = customSeedBase();
      game2.runNo = next.runNo;
      return next;
    }
    game2.setSeedBase = function(value) {
      const next = setSeedBase(value);
      game2.seed = next.seed;
      game2.seedBase = next.base;
      game2.customSeed = customSeedBase();
      game2.runNo = next.runNo;
      if (game2.state === "title") {
        game2.floor = REC.floor || 1;
        game2.floorLoadout = startingLoadout();
        startFloor(false);
        game2.state = "title";
        game2.player.alive = false;
        game2.player.x = -99999;
        game2.player.y = -99999;
        game2.banner = null;
        game2.bannerT = 0;
      }
      return next;
    };
    function setPaused(paused) {
      if (game2.state !== "play") {
        game2.paused = false;
        return false;
      }
      const next = !!paused;
      if (game2.paused === next) return false;
      game2.paused = next;
      clearLiveInput();
      setTimeScale(next ? 0 : game2.worldScale || 1);
      game2.banner = next ? null : "\u7EE7\u7EED";
      game2.bannerT = next ? 0 : 0.45;
      return true;
    }
    game2.setPaused = setPaused;
    game2.togglePause = function() {
      return setPaused(!game2.paused);
    };
    game2.returnToMenu = function() {
      clearLiveInput();
      game2.paused = false;
      game2.codexOpen = false;
      game2.banner = null;
      game2.bannerT = 0;
      game2.showTitle();
      return true;
    };
    game2.toggleRefill = function() {
      game2.refillEnabled = !game2.refillEnabled;
      localStorage.setItem("overprint.refill", game2.refillEnabled ? "1" : "0");
      game2.banner = `R \u8865\u5F39 ${game2.refillEnabled ? "\u5F00\u542F" : "\u5173\u95ED"}`;
      game2.bannerT = 0.8;
      if (game2.state === "play") sfx.status();
      return game2.refillEnabled;
    };
    game2.refillAmmo = function() {
      if (game2.state !== "play" || game2.paused) return false;
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      if (!game2.refillEnabled) {
        game2.banner = "R \u8865\u5F39\u5DF2\u5173\u95ED";
        game2.bannerT = 0.65;
        sfx.empty();
        return false;
      }
      if (!p.alive || !w || w.melee || w.ammo <= 0) {
        game2.banner = "\u5F53\u524D\u6B66\u5668\u4E0D\u80FD\u8865\u5F39";
        game2.bannerT = 0.65;
        sfx.empty();
        return false;
      }
      if (p.ammo >= w.ammo) {
        game2.banner = `${w.name} \u5DF2\u6EE1\u5F39`;
        game2.bannerT = 0.55;
        sfx.empty();
        return false;
      }
      p.ammo = w.ammo;
      p.attackCd = Math.min(p.attackCd, 0.08);
      game2.floorLoadout = stashPlayerWeapon() || game2.floorLoadout;
      game2.banner = `${w.name} \u5DF2\u8865\u6EE1`;
      game2.bannerT = 0.65;
      sfx.pickup();
      return true;
    };
    function canRefillPlayerAmmo() {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      return !!(p.alive && w && !w.melee && w.ammo > 0 && p.ammo < w.ammo);
    }
    function addCorpse(e) {
      const pool = game2.pools.corpses || [];
      if (!pool.length) return null;
      const c = pool[game2.corpseWrite % pool.length];
      game2.corpseWrite = (game2.corpseWrite + 1) % pool.length;
      c.alive = true;
      c.type = e.type || "thug";
      c.weapon = e.weapon || "fists";
      c.x = e.x;
      c.y = e.y;
      c.vx = 0;
      c.vy = 0;
      c.angle = e.angle || 0;
      c.deadAngle = e.deadAngle || e.angle || 0;
      c.state = S_DEAD;
      c.t = game2.time;
      c.armour = e.armour || 0;
      c.segs = e.segs || 0;
      c.layers = e.layers || 0;
      c.shieldHp = e.shieldHp || 0;
      c.shieldSeg = e.shieldSeg || 0;
      c.friendly = !!e.friendly;
      c.contagious = !!e.contagious;
      c.wave = game2.mode === "defense" ? game2.defense.wave || 0 : game2.floor;
      return c;
    }
    function spawnEnemy(s) {
      const e = spawnFrom(game2.pools.enemies);
      if (!e) return null;
      e.alive = true;
      e.type = s.type || "thug";
      e.x = s.x;
      e.y = s.y;
      const weapon = s.weapon || "fists";
      e.weapon = weapon === "fists" || enemyCanUseWeapon(weapon) ? weapon : "fists";
      e.ammo = WEAPONS[e.weapon]?.ammo || 0;
      e.seeking = 0;
      e.blockFlash = 0;
      e.stagger = 0;
      e.heldShieldHp = WEAPONS[e.weapon]?.defense ? WEAPONS[e.weapon].durability || 5 : 0;
      e.armour = s.armour || 0;
      if (e.armour) {
        const lay = armourLayout(e.armour);
        e.segs = lay.segs;
        e.layers = lay.layers;
        e.shieldSeg = 0;
        let left = e.armour;
        for (let L = 0; L < e.layers && left > 0; L++) {
          for (let i = 0; i < e.segs && left > 0; i++) {
            e.shieldSeg |= plateBit(e, L, i);
            left--;
          }
        }
      } else {
        e.segs = 0;
        e.layers = 0;
        e.shieldSeg = 0;
      }
      e.shieldHp = e.armour;
      e.vx = e.vy = 0;
      e.angle = s.angle || 0;
      e.state = S_IDLE;
      e.timer = 0;
      e.downTimer = 0;
      e.fireTimer = 0;
      e.attackTimer = 0;
      e.burst = 0;
      e.searchT = 0;
      e.ptx = s.x;
      e.pty = s.y;
      e.seen = 0;
      e.chargeT = 0;
      e.windup = 0;
      e.shoutCd = 0;
      e.strafe = rnd() < 0.5 ? 1 : -1;
      e.strafeT = 0;
      e.stuckT = 0;
      e.lastX = s.x;
      e.lastY = s.y;
      e.scanT = rnd() * 0.4;
      e.reload = 0;
      e.madT = 0;
      e.burnT = 0;
      e.infectT = 0;
      e.infectByPlayer = false;
      e.roomGoal = -1;
      e.roomSeq = 0;
      e.friendly = false;
      e.converted = false;
      e.contagious = false;
      game2.recordEnemy(e.type);
      return e;
    }
    function populate(level, carried = null) {
      reseedSim(game2.seed + game2.floor * 104729);
      for (const e of game2.pools.enemies) e.alive = false;
      if (game2.pools.corpses) {
        for (const c of game2.pools.corpses) c.alive = false;
        game2.corpseWrite = 0;
      }
      for (const b of game2.pools.bullets) b.alive = false;
      for (const k of game2.pools.pickups) k.alive = false;
      game2.pickupWrite = 0;
      for (const t of game2.pools.thrown) t.alive = false;
      for (const d of game2.pools.deploys || []) d.alive = false;
      for (const d of game2.pools.drones || []) d.alive = false;
      game2.particles.length = 0;
      game2.flashes.length = 0;
      game2.noiseRings.length = 0;
      game2.fireZones.length = 0;
      game2.throwCharge = 0;
      game2.throwPreview = null;
      for (const d of level.doors) {
        d.open = 0;
        d.slam = 0;
        d.swing = 1;
      }
      level.resetWindows();
      for (const s of level.enemySpawns) {
        if (!spawnEnemy(s)) break;
      }
      for (const s of level.pickupSpawns) {
        const k = spawnFrom(game2.pools.pickups);
        if (!k) break;
        k.alive = true;
        k.x = s.x;
        k.y = s.y;
        k.kind = s.kind;
        k.ammo = WEAPONS[s.kind].ammo;
        k.angle = rnd() * TAU;
      }
      const p = game2.player;
      p.x = level.spawn.x;
      p.y = level.spawn.y;
      p.vx = p.vy = 0;
      p.alive = true;
      equipPlayerWeapon(p, carried);
      p.maxHp = game2.playerStats.maxHp || 1;
      p.hp = p.maxHp;
      p.iframes = 0;
      p.maxDash = game2.playerStats.maxDash || MAX_DASH;
      p.dashCdMax = game2.playerStats.dashCd || DASH_CD;
      p.attackCd = 0;
      p.swing = 0;
      p.burnT = 0;
      p.infectT = 0;
      p.madT = 0;
      p.madDirT = 0;
      p.sawCd = 0;
      p.blockFlash = 0;
      p.swapCd = 0;
      p.dashCharges = p.maxDash;
      p.dashCd = 0;
      p.dashT = 0;
      p.katanaT = 0;
      p.katanaMax = 0;
      p.katanaX = 0;
      p.katanaY = 0;
      p.trail.length = 0;
      game2.floorKills = 0;
      game2.combo = 0;
      game2.comboTimer = 0;
      game2.enemiesLeft = hostilesLeft();
      game2.state = "play";
      game2.alarmX = p.x;
      game2.alarmY = p.y;
      computeFlow();
    }
    function startFloor(nextFloor) {
      const carried = nextFloor ? stashPlayerWeapon() : game2.floorLoadout || startingLoadout();
      if (nextFloor) game2.floor++;
      game2.floorLoadout = carried;
      game2.paused = false;
      const diff = REC.floor ? Math.min(game2.floor, REC.floor) : game2.floor;
      let level;
      if (game2.mode === "practice") {
        const map = game2.practiceMaps[game2.practice.map] || game2.practiceMaps[0];
        level = makePracticeLevel(game2.seed + game2.floor * 7919, map.id, game2.practice.enemy);
      } else if (game2.mode === "defense") {
        level = makeDefenseLevel(game2.seed + game2.floor * 7919);
      } else {
        level = makeLevel(game2.seed + game2.floor * 7919, diff);
      }
      game2.level = level;
      renderer2.bakeLevel(level);
      renderer2.clearStains();
      populate(level, carried);
      game2.camera.x = game2.player.x;
      game2.camera.y = game2.player.y;
      game2.floorStartTime = game2.time;
      game2.banner = game2.mode === "practice" ? "\u7EC3\u4E60\u5F00\u59CB" : game2.mode === "defense" ? "\u9632\u5B88\u51C6\u5907" : `\u7B2C ${String(game2.floor).padStart(2, "0")} \u5C42`;
      game2.bannerT = 1.4;
    }
    function restartFloor() {
      renderer2.clearStains();
      game2.paused = false;
      const restartLoadout = game2.mode === "defense" ? stashPlayerWeapon() || game2.floorLoadout : game2.floorLoadout;
      if (game2.mode === "defense") {
        game2.score = 0;
        game2.kills = 0;
        game2.defense = newDefenseState();
        game2.playerStats = defensePlayerStats();
      } else {
        game2.score = Math.max(0, game2.score - game2.floorKills * 100);
        game2.kills -= game2.floorKills;
      }
      game2.floorLoadout = restartLoadout;
      populate(game2.level, restartLoadout);
      if (game2.mode === "defense") {
        game2.defense.between = true;
        game2.defense.nextWaveT = DEFENSE_REST_SECONDS;
        game2.defense.shopOpen = true;
      }
      game2.floorStartTime = game2.time;
      game2.banner = "\u91CD\u65B0\u5F00\u59CB\u672C\u5C42";
      game2.bannerT = 0.9;
    }
    function announceClear() {
      if (game2.enemiesLeft !== 0) return;
      if (game2.mode === "practice") {
        game2.banner = "\u7EC3\u4E60\u76EE\u6807\u6E05\u7A7A";
        game2.bannerT = 1.2;
        sfx.clear();
        return;
      }
      if (game2.mode === "defense") return;
      game2.banner = "\u672C\u5C42\u5DF2\u6E05\u7A7A \u2014 \u524D\u5F80\u51FA\u53E3";
      game2.bannerT = 2.2;
      sfx.clear();
      triggerSlow("lastKill");
    }
    function registerKill(x, y, power = 1, mult = 1, dx = 0, dy = 0, byEnemy = false) {
      if (!byEnemy) {
        game2.combo++;
        game2.comboTimer = 3.2;
        game2.bestCombo = Math.max(game2.bestCombo, game2.combo);
        if (game2.combo > 1) game2.ui.chainPunch = 1;
      }
      game2.kills++;
      game2.floorKills++;
      game2.score += byEnemy ? 40 : 100 * game2.combo * mult;
      if (game2.mode === "defense" && !byEnemy) game2.defense.points += Math.round(10 * mult + game2.combo * 2);
      game2.enemiesLeft = hostilesLeft();
      if (!byEnemy && game2.player.dashCharges < (game2.player.maxDash || MAX_DASH)) {
        game2.player.dashCharges++;
        game2.dashFlash = 0.3;
      }
      renderer2.splat(x, y, power, dx, dy);
      burst(x, y, 14, 260, "#EC0A63", 3, 0.55);
      burst(x, y, 6, 130, "#161513", 2.4, 0.7);
      hitstop(0.055);
      shake(7);
      sfx.kill();
      if (mult > 1) {
        sfx.execute();
        triggerSlow("execute");
      }
      announceClear();
    }
    function killEnemy(e, power = 1, dx = 0, dy = 0, byEnemy = false, source = null) {
      if (!e.alive || e.state === S_DEAD) return false;
      const x = e.x, y = e.y;
      const wasFriendly = !!e.friendly;
      const execution = e.state === S_DOWN;
      const infected = !wasFriendly && !!(source && source.friendly && source.contagious);
      if (infected) {
        e.friendly = true;
        e.converted = true;
        e.contagious = true;
        e.madT = 0;
        e.burnT = 0;
        e.infectT = 0;
        e.infectByPlayer = false;
        e.state = S_CHASE;
        e.seeking = 0;
        e.seen = 1;
        e.searchT = Math.max(e.searchT || 0, 7.5);
        e.lkx = source.x || x;
        e.lky = source.y || y;
        e.vx = dx * 160;
        e.vy = dy * 160;
        e.stagger = Math.max(e.stagger || 0, 0.22);
        registerKill(x, y, power, execution ? 2 : 1, dx, dy, true);
        burst(x, y, 18, 230, WEAPONS.virus.tint, 2.7, 0.55);
        burst(x, y, 8, 140, "#8A2BE2", 2.1, 0.42);
        game2.banner = "\u75C5\u6BD2\u6269\u6563";
        game2.bannerT = 0.65;
        return true;
      }
      e.state = S_DEAD;
      e.deadAngle = e.angle;
      addCorpse(e);
      e.madT = 0;
      e.burnT = 0;
      e.infectT = 0;
      e.infectByPlayer = false;
      e.friendly = false;
      e.converted = false;
      e.contagious = false;
      e.vx = e.vy = 0;
      game2.dropWeapon(e, true);
      e.alive = false;
      e.state = S_IDLE;
      if (wasFriendly) {
        game2.enemiesLeft = hostilesLeft();
        renderer2.splat(x, y, power, dx, dy, "#8A2BE2");
        burst(x, y, 10, 210, "#8A2BE2", 2.7, 0.5);
        burst(x, y, 5, 120, "#161513", 2.1, 0.6);
        hitstop(0.035);
        shake(4);
        sfx.kill();
      } else {
        registerKill(x, y, power, execution ? 2 : 1, dx, dy, byEnemy);
      }
      return true;
    }
    function knockdown(e, dirx, diry) {
      if (!e.alive || e.state === S_DOWN || e.state === S_DEAD) return;
      e.state = S_DOWN;
      e.downTimer = 1.7;
      e.vx = dirx * 320;
      e.vy = diry * 320;
      e.seeking = 0;
      game2.dropWeapon(e, false);
      renderer2.splat(e.x, e.y, 0.3, dirx, diry);
      burst(e.x, e.y, 5, 130, "#EC0A63", 2.2, 0.4);
      hitstop(0.035);
      shake(4);
      sfx.knockdown();
    }
    game2.killEnemy = killEnemy;
    game2.knockdownEnemy = knockdown;
    function pointSegmentInfo(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 1e-6 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
      const x = ax + dx * t, y = ay + dy * t;
      const ox = px - x, oy = py - y;
      return { x, y, t, d: Math.hypot(ox, oy) };
    }
    function slashKatanaPath(ax, ay, bx, by) {
      const p = game2.player;
      const w = WEAPONS[p.weapon] || WEAPONS.katana;
      const radius = w.slashRadius || 22;
      const dirx = p.katanaX || Math.cos(p.aim);
      const diry = p.katanaY || Math.sin(p.aim);
      let kills = 0;
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.friendly) continue;
        const def = ENEMY_DEF[e.type] || ENEMY_DEF.thug;
        const hit = pointSegmentInfo(e.x, e.y, ax, ay, bx, by);
        if (hit.d > radius + def.r) continue;
        if (game2.walkClear && !game2.walkClear(hit.x, hit.y, e.x, e.y, 3)) continue;
        if (killEnemy(e, 1.45, dirx, diry)) {
          kills++;
          p.katanaT = Math.max(p.katanaT || 0, p.katanaMax || w.dashReset || 0.22);
          triggerSlow("katana");
        }
      }
      return kills;
    }
    function startKatanaDash(charge = 0) {
      const p = game2.player;
      const w = WEAPONS[p.weapon] || WEAPONS.katana;
      const ratio = Math.max(0.22, katanaChargeRatio(w, charge));
      const dur = (w.dashDur || 0.22) * (0.68 + ratio * 0.5);
      p.katanaX = Math.cos(p.aim);
      p.katanaY = Math.sin(p.aim);
      p.katanaT = dur;
      p.katanaMax = dur;
      p.dashT = 0;
      p.trail.length = 0;
      burst(p.x, p.y, 8, 190, w.tint || "#8A2BE2", 2.5, 0.34);
      noise(p.x, p.y, w.noise || 60, w.tint || "#8A2BE2");
      sfx.dash();
      shake(3);
    }
    function blinkKatanaTo(target) {
      const p = game2.player;
      const w = WEAPONS[p.weapon] || WEAPONS.katana;
      const ox = p.x, oy = p.y;
      const dx = target.x - ox, dy = target.y - oy;
      const l = Math.hypot(dx, dy) || 1;
      p.katanaX = dx / l;
      p.katanaY = dy / l;
      p.katanaMax = w.dashReset || w.dashDur || 0.22;
      p.katanaT = p.katanaMax;
      p.trail.length = 0;
      p.trail.push({ x: ox, y: oy });
      slashKatanaPath(ox, oy, target.x, target.y);
      p.x = target.x;
      p.y = target.y;
      p.vx = p.katanaX * 360;
      p.vy = p.katanaY * 360;
      p.trail.push({ x: p.x, y: p.y });
      burst(p.x, p.y, 18, 260, w.tint || "#8A2BE2", 3.1, 0.5);
      noise(p.x, p.y, w.noise || 68, w.tint || "#8A2BE2");
      triggerSlow("katana");
      sfx.dash();
      shake(7);
    }
    function releaseKatanaCharge(charge = 0) {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      if (!w || !w.katana && !w.lance || p.katanaT > 0) return false;
      if (p.attackCd > 0) {
        sfx.empty();
        return false;
      }
      p.attackCd = w.rate * (game2.playerStats.attackRate || 1);
      p.swing = 0.16;
      const ratio = katanaChargeRatio(w, charge);
      if (w.katana && ratio >= 0.98) {
        blinkKatanaTo(estimateKatana(p, charge));
      } else {
        startKatanaDash(charge);
      }
      return true;
    }
    function updateKatanaDash(dt) {
      const p = game2.player;
      const w = WEAPONS[p.weapon] || WEAPONS.katana;
      const ax = p.x, ay = p.y;
      p.katanaX = Math.cos(p.aim);
      p.katanaY = Math.sin(p.aim);
      p.katanaT = Math.max(0, p.katanaT - dt);
      if (w.lance && game2.input.fire && p.katanaT > 0) {
        p.katanaT = Math.min(w.dashCap || 1.25, p.katanaT + dt * (w.chargeExtend || 0.36));
        p.katanaMax = Math.max(p.katanaMax || 0, p.katanaT);
      }
      const sp = w.dashSpeed || 1080;
      moveCollide(game2.level, p, p.katanaX * sp * dt, p.katanaY * sp * dt, 9);
      p.vx = p.katanaX * 360;
      p.vy = p.katanaY * 360;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 16) p.trail.shift();
      checkDoorSlam(p, p.katanaX, p.katanaY);
      const pane = game2.level.windowAtPoint(p.x + p.katanaX * 16, p.y + p.katanaY * 16);
      if (pane) smashWindow(pane, p.katanaX, p.katanaY);
      slashKatanaPath(ax, ay, p.x + p.katanaX * radiusFrom(w), p.y + p.katanaY * radiusFrom(w));
      if (p.katanaT <= 0) {
        p.vx = p.katanaX * 260;
        p.vy = p.katanaY * 260;
        p.katanaMax = 0;
      }
    }
    function radiusFrom(w) {
      return Math.max(20, (w.slashRadius || 22) + 6);
    }
    function katanaSwapSlash() {
      const p = game2.player;
      const w = WEAPONS.katana;
      const sx = p.x + Math.cos(p.aim) * 14;
      const sy = p.y + Math.sin(p.aim) * 14;
      const dx = Math.cos(p.aim);
      const dy = Math.sin(p.aim);
      const range = 430;
      let ex = sx + dx * range;
      let ey = sy + dy * range;
      for (let i = 1; i <= 32; i++) {
        const t = i / 32;
        const x = sx + dx * range * t;
        const y = sy + dy * range * t;
        if (game2.level.sightBlockedAt(x, y)) {
          ex = sx + dx * range * (i - 1) / 32;
          ey = sy + dy * range * (i - 1) / 32;
          break;
        }
      }
      p.katanaX = dx;
      p.katanaY = dy;
      let kills = 0;
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.friendly) continue;
        const def = ENEMY_DEF[e.type] || ENEMY_DEF.thug;
        const hit = pointSegmentInfo(e.x, e.y, sx, sy, ex, ey);
        if (hit.d > 23 + def.r) continue;
        if (!blastClear(sx, sy, e.x, e.y)) continue;
        if (killEnemy(e, 1.18, dx, dy)) kills++;
      }
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        const x = sx + (ex - sx) * t;
        const y = sy + (ey - sy) * t;
        particle(
          x,
          y,
          -dy * 70 + (rnd() - 0.5) * 55,
          dx * 70 + (rnd() - 0.5) * 55,
          0.22 + rnd() * 0.12,
          3.3,
          w.tint
        );
      }
      game2.flashes.push({ x: (sx + ex) / 2, y: (sy + ey) / 2, a: p.aim, t: 0, dur: 0.16, size: 1.45 });
      burst(sx, sy, 7, 190, w.tint, 2.5, 0.34);
      noise(p.x, p.y, 92, w.tint);
      shake(kills ? 6 : 3);
      triggerSlow(kills ? "katana" : "execute");
      sfx.swing();
      return kills;
    }
    function isSwapGun(kind) {
      const w = WEAPONS[kind];
      return !!(w && !w.melee && !w.lobbed && !w.projectile && !w.defense && !w.silent && !w.copySauce && !w.extract && !w.passive && w.pellets && w.ammo > 0);
    }
    function gunSwapBurst(kind) {
      const p = game2.player;
      const w = WEAPONS[kind];
      if (!w) return 0;
      const shots = Math.max(1, Math.ceil((w.ammo || 1) / 2));
      const statusEffect = activeAttackEffect(p, kind, "direct");
      const base = p.aim;
      for (let shot = 0; shot < shots; shot++) {
        const fan = shots > 1 ? (shot - (shots - 1) / 2) / (shots - 1) : 0;
        const shotAim = base + fan * Math.min(0.2, (w.spread || 0.025) * 2.8) + (rnd() - 0.5) * (w.spread || 0.025);
        for (let i = 0; i < (w.pellets || 1); i++) {
          const b = spawnFrom(game2.pools.bullets);
          if (!b) break;
          const a = shotAim + (rnd() - 0.5) * (w.pellets > 1 ? w.spread * 2 : w.spread || 0.02);
          b.alive = true;
          b.x = p.x + Math.cos(a) * 16;
          b.y = p.y + Math.sin(a) * 16;
          b.vx = Math.cos(a) * w.speed * (0.92 + rnd() * 0.16);
          b.vy = Math.sin(a) * w.speed * (0.92 + rnd() * 0.16);
          b.life = w.life || 1.6;
          b.friendly = true;
          b.pierce = w.pierce || (w.rail ? 999 : 0);
          b.shieldDmg = w.shieldDmg ?? 1;
          b.armourPierce = w.armourPierce || 0;
          b.throughDoors = !!w.throughDoors;
          b.hitDoor = null;
          b.throughWalls = !!w.throughWalls;
          b.wallPierced = 0;
          b.owner = null;
          b.near = 0;
          b.statusEffect = statusEffect || null;
          b.weapon = kind;
          b.projectile = null;
          b.explosive = false;
          b.ricochet = !!w.ricochet;
          b.bounces = w.bounces || 0;
        }
        if (shot < 5) ejectCasing(p.x, p.y, shotAim);
      }
      const mx = p.x + Math.cos(base) * 19, my = p.y + Math.sin(base) * 19;
      game2.flashes.push({ x: mx, y: my, a: base, t: 0, dur: 0.13, size: w.pellets > 1 ? 1.8 : 1.25 });
      burst(mx, my, 7, 220, "#F7CF16", 2.4, 0.18);
      noise(p.x, p.y, Math.round((w.noise || 280) * 0.82), w.tint);
      shake(Math.min(14, 3 + shots * 0.45 + (w.pellets > 1 ? 5 : 0)));
      const fill = clamp((p.ammo ?? w.ammo) / w.ammo, 0, 1);
      if (kind === "shotgun") sfx.shotgun(fill);
      else if (kind === "smg" || kind === "ripper") sfx.smg(fill);
      else if (kind === "revolver") sfx.revolver(fill);
      else sfx.shot(fill);
      game2.banner = `\u6362\u624B\u8FDE\u5C04 \xD7${shots}`;
      game2.bannerT = 0.7;
      p.attackCd = Math.max(p.attackCd, Math.min(0.38, (w.rate || 0.2) * Math.min(shots, 5) * 0.3));
      return shots;
    }
    function swapPlayerWeapon() {
      const p = game2.player;
      const incoming = WEAPONS[p.offhandWeapon];
      if (game2.state !== "play" || game2.paused || !p.alive) return false;
      if (p.swapCd > 0 || p.katanaT > 0 || p.dashT > 0) {
        sfx.empty();
        return false;
      }
      if (!incoming || p.offhandWeapon === "fists") {
        game2.banner = "\u526F\u624B\u4E3A\u7A7A";
        game2.bannerT = 0.55;
        sfx.empty();
        return false;
      }
      if (incoming.offhandOnly) {
        game2.banner = `${incoming.name} \u4E3A\u526F\u624B\u88AB\u52A8`;
        game2.bannerT = 0.65;
        sfx.empty();
        return false;
      }
      const main = storedSlot(p.weapon, p.ammo);
      const side = storedSlot(p.offhandWeapon, p.offhandAmmo);
      setMainSlot(p, side.weapon, side.ammo);
      setOffhandSlot(p, main.weapon, main.ammo);
      p.swapCd = 0.26;
      p.attackCd = Math.min(p.attackCd, 0.08);
      p.swing = 0;
      game2.throwCharge = 0;
      game2.throwPreview = null;
      game2.floorLoadout = stashPlayerWeapon() || game2.floorLoadout;
      game2.banner = `\u5207\u51FA ${WEAPONS[p.weapon].name}`;
      game2.bannerT = 0.58;
      if (p.weapon === "katana") katanaSwapSlash();
      else if (isSwapGun(p.weapon)) gunSwapBurst(p.weapon);
      else sfx.pickup();
      return true;
    }
    game2.swapPlayerWeapon = swapPlayerWeapon;
    function maddenEnemy(e, seconds, x, y) {
      if (!e.alive || e.state === S_DEAD) return false;
      e.madT = Math.max(e.madT || 0, seconds || 6.5);
      e.infectT = 0;
      e.infectByPlayer = false;
      e.state = S_CHASE;
      e.seeking = 0;
      e.seen = 1;
      e.searchT = Math.max(e.searchT || 0, e.madT);
      e.lkx = x || e.x;
      e.lky = y || e.y;
      e.stagger = Math.max(e.stagger || 0, 0.18);
      burst(e.x, e.y, 10, 150, "#7AC943", 2.4, 0.55);
      return true;
    }
    game2.maddenEnemy = maddenEnemy;
    function convertEnemy(e, x, y) {
      if (!e.alive || e.state === S_DEAD || e.friendly) return false;
      e.friendly = true;
      e.converted = true;
      e.contagious = playerHasOffhand("virus");
      e.madT = 0;
      e.infectT = 0;
      e.infectByPlayer = false;
      e.state = S_CHASE;
      e.seeking = 0;
      e.seen = 1;
      e.searchT = Math.max(e.searchT || 0, 7.5);
      e.lkx = x || e.x;
      e.lky = y || e.y;
      e.stagger = Math.max(e.stagger || 0, 0.15);
      game2.combo++;
      game2.comboTimer = 3.2;
      game2.bestCombo = Math.max(game2.bestCombo, game2.combo);
      if (game2.combo > 1) game2.ui.chainPunch = 1;
      game2.kills++;
      game2.floorKills++;
      game2.score += 80 * game2.combo;
      if (game2.mode === "defense") game2.defense.points += 8 + game2.combo;
      if (game2.player.dashCharges < (game2.player.maxDash || MAX_DASH)) {
        game2.player.dashCharges++;
        game2.dashFlash = 0.3;
      }
      game2.enemiesLeft = hostilesLeft();
      burst(e.x, e.y, 18, 210, "#8A2BE2", 2.8, 0.62);
      burst(e.x, e.y, 8, 120, "#F7CF16", 1.9, 0.4);
      game2.banner = e.contagious ? "\u5DF2\u9A6F\u670D \xB7 \u4F20\u67D3" : "\u5DF2\u9A6F\u670D";
      game2.bannerT = 0.65;
      sfx.status();
      announceClear();
      return true;
    }
    game2.convertEnemy = convertEnemy;
    function updateFireZones(dt) {
      let playerBurning = false;
      for (const z of game2.fireZones) {
        z.t += dt;
        const live = 1 - z.t / z.dur;
        if (live > 0 && rnd() < 0.38) {
          const a = rnd() * TAU, r = Math.sqrt(rnd()) * z.r;
          particle(
            z.x + Math.cos(a) * r,
            z.y + Math.sin(a) * r,
            Math.cos(a) * 22,
            Math.sin(a) * 22 - 48,
            0.28 + rnd() * 0.32,
            2.1 + rnd() * 2.4,
            rnd() < 0.5 ? "#FF6A00" : "#F7CF16"
          );
        }
        for (const e of game2.pools.enemies) {
          if (!e.alive || e.state === S_DEAD) continue;
          const d = dist(z.x, z.y, e.x, e.y);
          if (d > z.r) continue;
          if (!hasLineOfSight(game2.level, z.x, z.y, e.x, e.y)) continue;
          e.burnT = (e.burnT || 0) + dt * clamp(1.2 - d / z.r, 0.35, 1.2);
          e.stagger = Math.max(e.stagger || 0, 0.1);
          if (e.burnT >= z.kill) {
            const nx = (e.x - z.x) / (d || 1), ny = (e.y - z.y) / (d || 1);
            killEnemy(e, 0.95, nx, ny, z.byEnemy);
          }
        }
        const p2 = game2.player;
        if (p2.alive && game2.state === "play" && dist(z.x, z.y, p2.x, p2.y) <= z.r * 0.9 && hasLineOfSight(game2.level, z.x, z.y, p2.x, p2.y)) playerBurning = true;
      }
      game2.fireZones = game2.fireZones.filter((z) => z.t < z.dur);
      const p = game2.player;
      if (playerBurning) {
        p.burnT = (p.burnT || 0) + dt;
        if (p.burnT > 0.42) game2.killPlayer();
      } else {
        p.burnT = Math.max(0, (p.burnT || 0) - dt * 1.6);
      }
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        e.burnT = Math.max(0, (e.burnT || 0) - dt * 0.45);
      }
    }
    game2.igniteAt = igniteAt;
    function nearestHostile(x, y, range = Infinity, requireSight = false) {
      let best = null, bd = range;
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.friendly) continue;
        const d = dist(x, y, e.x, e.y);
        if (d >= bd) continue;
        if (requireSight && !hasLineOfSight(game2.level, x, y, e.x, e.y)) continue;
        bd = d;
        best = e;
      }
      return best;
    }
    function emitInfection(unit, dt) {
      if (rnd() > Math.min(0.9, dt * 11)) return;
      const a = rnd() * TAU;
      const r = 9 + rnd() * 16;
      particle(
        unit.x + Math.cos(a) * r,
        unit.y + Math.sin(a) * r,
        Math.cos(a) * 18,
        Math.sin(a) * 18 - 34,
        0.28 + rnd() * 0.24,
        1.8 + rnd() * 2.1,
        EFFECT_TINT.virus
      );
    }
    function spreadVirusFrom(unit, byPlayer) {
      for (const o of game2.pools.enemies) {
        if (o === unit || !o.alive || o.state === S_DEAD || o.infectT > 0) continue;
        const d = dist(unit.x, unit.y, o.x, o.y);
        if (d > 72 || !hasLineOfSight(game2.level, unit.x, unit.y, o.x, o.y)) continue;
        infectEnemy(o, 20, byPlayer);
      }
      const p = game2.player;
      if (unit !== p && p.alive && game2.state === "play" && p.infectT <= 0) {
        const d = dist(unit.x, unit.y, p.x, p.y);
        if (d <= 58 && hasLineOfSight(game2.level, unit.x, unit.y, p.x, p.y)) infectPlayer(20);
      }
    }
    function updateInfections(dt) {
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || !(e.infectT > 0)) continue;
        emitInfection(e, dt);
        spreadVirusFrom(e, !!e.infectByPlayer);
        e.infectT -= dt;
        e.stagger = Math.max(e.stagger || 0, 0.04);
        if (e.infectT <= 0) {
          const a = rnd() * TAU;
          killEnemy(e, 0.9, Math.cos(a), Math.sin(a), !e.infectByPlayer);
        }
      }
      const p = game2.player;
      if (!p.alive || !(p.infectT > 0)) return;
      if (hostilesLeft() === 0) {
        p.infectT = 0;
        game2.banner = "\u611F\u67D3\u5DF2\u6CBB\u6108";
        game2.bannerT = 0.9;
        burst(p.x, p.y, 18, 190, "#8A2BE2", 2.4, 0.52);
        sfx.status();
        return;
      }
      emitInfection(p, dt);
      spreadVirusFrom(p, true);
      p.infectT -= dt;
      if (p.infectT <= 0) {
        p.hp = 1;
        game2.killPlayer(null, true);
      }
    }
    game2.killPlayer = function(_source = null, force = false) {
      const p = game2.player;
      if (!p.alive || game2.state !== "play") return;
      if (!force && p.iframes > 0) return;
      if (!force && (p.hp || 1) > 1) {
        p.hp--;
        p.iframes = 0.9;
        p.blockFlash = 0.35;
        game2.flash = Math.max(game2.flash, 0.42);
        game2.banner = `\u53D7\u4F24 ${p.hp}/${p.maxHp}`;
        game2.bannerT = 0.65;
        burst(p.x, p.y, 14, 220, "#EC0A63", 2.8, 0.48);
        hitstop(0.06);
        shake(9);
        sfx.block();
        return;
      }
      p.alive = false;
      game2.state = "dying";
      game2.deathT = 0.42;
      clearLiveInput();
      renderer2.splat(p.x, p.y, 1.5);
      burst(p.x, p.y, 26, 320, "#EC0A63", 3.6, 0.8);
      hitstop(0.14);
      shake(20);
      game2.flash = 1;
      sfx.die();
    };
    game2.onSpotted = function(e) {
      game2.raiseAlarm(e.lkx, e.lky);
      sfx.alert();
    };
    function launchProjectile(actor, angle, weaponKey, friendly, statusEffect = null) {
      const w = WEAPONS[weaponKey];
      const b = spawnFrom(game2.pools.bullets);
      if (!b) return null;
      const sp = friendly ? w.speed : w.eSpeed || w.speed;
      b.alive = true;
      b.x = actor.x + Math.cos(angle) * 18;
      b.y = actor.y + Math.sin(angle) * 18;
      b.vx = Math.cos(angle) * sp;
      b.vy = Math.sin(angle) * sp;
      b.life = w.life || 2.6;
      b.friendly = friendly;
      b.pierce = w.pierce || (w.rail ? 999 : 0);
      b.near = 0;
      b.shieldDmg = w.shieldDmg ?? 1;
      b.armourPierce = w.armourPierce || 0;
      b.throughDoors = !!w.throughDoors;
      b.hitDoor = null;
      b.owner = actor === game2.player ? null : actor;
      b.throughWalls = !!w.throughWalls;
      b.wallPierced = 0;
      b.statusEffect = statusEffect || weaponStatusEffect(weaponKey);
      b.weapon = weaponKey;
      b.projectile = w.projectile || null;
      b.explosive = !!w.projectile;
      b.ricochet = !!w.ricochet;
      b.bounces = w.bounces || 0;
      return b;
    }
    game2.fireEnemyBullet = function(e, tx, ty) {
      const w = WEAPONS[e.weapon] || WEAPONS.pistol;
      const base = Math.atan2(ty - e.y, tx - e.x);
      if (w.projectile) {
        launchProjectile(e, base, e.weapon, !!e.friendly);
        const emx2 = e.x + Math.cos(base) * 19, emy2 = e.y + Math.sin(base) * 19;
        if (!w.silent) {
          game2.flashes.push({ x: emx2, y: emy2, a: base, t: 0, dur: 0.11, size: 1.25 });
          burst(emx2, emy2, 5, 170, "#F7CF16", 2.4, 0.18);
          noise(e.x, e.y, w.noise);
          shake(4);
          sfx.revolver(0.4);
        } else {
          burst(emx2, emy2, 2, 55, w.tint || "#7AC943", 1.2, 0.18);
        }
        return;
      }
      const n = w.pellets || 1;
      for (let i = 0; i < n; i++) {
        const b = spawnFrom(game2.pools.bullets);
        if (!b) break;
        const a = base + (rnd() - 0.5) * (n > 1 ? w.spread * 2 : 0.09);
        b.alive = true;
        b.x = e.x + Math.cos(a) * 16;
        b.y = e.y + Math.sin(a) * 16;
        b.vx = Math.cos(a) * w.eSpeed;
        b.vy = Math.sin(a) * w.eSpeed;
        b.life = w.life || 2.4;
        b.friendly = !!e.friendly;
        b.pierce = w.pierce || (w.rail ? 999 : 0);
        b.near = 0;
        b.shieldDmg = w.shieldDmg ?? 1;
        b.armourPierce = w.armourPierce || 0;
        b.throughDoors = !!w.throughDoors;
        b.hitDoor = null;
        b.throughWalls = !!w.throughWalls;
        b.wallPierced = 0;
        b.owner = e;
        b.statusEffect = weaponStatusEffect(e.weapon);
        b.weapon = e.weapon;
        b.projectile = null;
        b.explosive = false;
        b.ricochet = !!w.ricochet;
        b.bounces = w.bounces || 0;
      }
      const emx = e.x + Math.cos(base) * 19, emy = e.y + Math.sin(base) * 19;
      if (!w.silent) {
        game2.flashes.push({ x: emx, y: emy, a: base, t: 0, dur: 0.07, size: 0.85 });
        burst(emx, emy, 4, 140, "#F7CF16", 2, 0.14);
        ejectCasing(e.x, e.y, base);
        noise(e.x, e.y, w.noise);
        const et = clamp(e.ammo / w.ammo, 0, 1);
        if (e.weapon === "shotgun") sfx.shotgun(et);
        else if (e.weapon === "smg") sfx.smg(et);
        else if (e.weapon === "revolver") sfx.revolver(et);
        else sfx.shot(et);
      } else {
        burst(emx, emy, 2, 55, w.tint || "#7AC943", 1.2, 0.18);
      }
    };
    function supportTarget(unit, range = 560, requireSight = false) {
      let best = null, bestD = Infinity;
      const friendly = !!unit.friendly;
      if (!friendly && game2.player.alive && game2.state === "play" && !game2.playerDisguised()) {
        const d = dist(unit.x, unit.y, game2.player.x, game2.player.y);
        if (d < bestD && d <= range && (!requireSight || hasLineOfSight(game2.level, unit.x, unit.y, game2.player.x, game2.player.y))) {
          bestD = d;
          best = { alive: true, x: game2.player.x, y: game2.player.y, vx: game2.player.vx, vy: game2.player.vy, enemy: null };
        }
      }
      for (const e of game2.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        if (!!e.friendly === friendly) continue;
        const d = dist(unit.x, unit.y, e.x, e.y);
        if (d >= bestD || d > range) continue;
        if (requireSight && !hasLineOfSight(game2.level, unit.x, unit.y, e.x, e.y)) continue;
        bestD = d;
        best = { alive: true, x: e.x, y: e.y, vx: e.vx || 0, vy: e.vy || 0, enemy: e };
      }
      return best;
    }
    function fireSupportBullet(unit, target, quiet = false) {
      const smg = WEAPONS.smg;
      if (!target || unit.ammo <= 0) return false;
      const d = dist(unit.x, unit.y, target.x, target.y);
      const flight = d / (smg.speed || 1080);
      const tx = target.x + (target.vx || 0) * flight * 0.65;
      const ty = target.y + (target.vy || 0) * flight * 0.65;
      const base = Math.atan2(ty - unit.y, tx - unit.x);
      const a = base + (rnd() - 0.5) * (smg.spread || 0.08);
      unit.angle = base;
      const b = launchProjectile(unit, a, "smg", !!unit.friendly);
      if (!b) return false;
      b.owner = null;
      unit.ammo--;
      const mx = unit.x + Math.cos(a) * 17, my = unit.y + Math.sin(a) * 17;
      game2.flashes.push({ x: mx, y: my, a, t: 0, dur: quiet ? 0.045 : 0.065, size: quiet ? 0.48 : 0.72 });
      burst(mx, my, quiet ? 2 : 4, quiet ? 80 : 140, quiet ? "#F7CF16" : smg.tint, quiet ? 1.3 : 1.9, 0.14);
      if (!quiet) {
        ejectCasing(unit.x, unit.y, a);
        noise(unit.x, unit.y, Math.round((smg.noise || 320) * 0.68), smg.tint);
        sfx.smg(clamp(unit.ammo / smg.ammo, 0, 1));
      } else {
        sfx.shot(0.45);
      }
      return true;
    }
    function updateDeploys(dt) {
      const smg = WEAPONS.smg;
      for (const d of game2.pools.deploys || []) {
        if (!d.alive) continue;
        d.life -= dt;
        d.fireTimer -= dt;
        d.spin += dt;
        if (d.life <= 0 || d.ammo <= 0) {
          d.alive = false;
          burst(d.x, d.y, 8, 130, WEAPONS.sentryPack.tint, 2, 0.28);
          continue;
        }
        const target = supportTarget(d, 590, true);
        if (!target) {
          d.angle += dt * 0.75;
          continue;
        }
        d.target = target.enemy || null;
        const desired = Math.atan2(target.y - d.y, target.x - d.x);
        d.angle += angDelta(d.angle, desired) * Math.min(1, 16 * dt);
        if (Math.abs(angDelta(d.angle, desired)) < 0.32 && d.fireTimer <= 0) {
          if (fireSupportBullet(d, target, false)) d.fireTimer = smg.rate;
        }
      }
      function fizzleDrone(d) {
        d.alive = false;
        d.kamikaze = false;
        d.blastT = 0;
        burst(d.x, d.y, 7, 110, WEAPONS.dronePack.tint, 1.8, 0.25);
      }
      function armDroneSelfDestruct(d) {
        if (d.kamikaze) return;
        d.kamikaze = true;
        d.blastT = 0;
        d.fireTimer = 0;
        d.life = Math.max(d.life, 8);
        burst(d.x, d.y, 5, 130, WEAPONS.dronePack.tint, 1.8, 0.22);
      }
      function detonateDrone(d) {
        d.alive = false;
        d.kamikaze = false;
        d.blastT = 0;
        explodeAt(d.x, d.y, "grenade", d.friendly === false, 0.5);
      }
      for (const d of game2.pools.drones || []) {
        if (!d.alive) continue;
        d.life -= dt;
        d.fireTimer -= dt;
        d.navT -= dt;
        d.spin += dt * 4.8;
        if (d.life <= 0) {
          fizzleDrone(d);
          continue;
        }
        if (d.ammo <= 0) armDroneSelfDestruct(d);
        if (d.kamikaze) {
          const target2 = supportTarget(d, 1300, false);
          if (!target2) {
            d.vx = approach(d.vx, Math.cos(d.angle) * 58, 6, dt);
            d.vy = approach(d.vy, Math.sin(d.angle) * 58, 6, dt);
            d.angle += dt * 1.8;
            moveCollide(game2.level, d, d.vx * dt, d.vy * dt, 6);
            continue;
          }
          d.target = target2.enemy || null;
          const td2 = dist(d.x, d.y, target2.x, target2.y);
          const ta2 = Math.atan2(target2.y - d.y, target2.x - d.x);
          const visible2 = hasLineOfSight(game2.level, d.x, d.y, target2.x, target2.y);
          d.angle += angDelta(d.angle, ta2) * Math.min(1, 18 * dt);
          if (visible2 && td2 < 54 || td2 < 24) {
            d.blastT += dt;
            if (d.blastT > 0.08) {
              detonateDrone(d);
              continue;
            }
          } else {
            d.blastT = 0;
          }
          if (d.navT <= 0 || visible2) {
            if (visible2) {
              d.navX = Math.cos(ta2);
              d.navY = Math.sin(ta2);
            } else {
              const nav = game2.pathDirToPoint(d, target2.x, target2.y, 6);
              d.navX = nav.x;
              d.navY = nav.y;
            }
            d.navT = 0.12 + rnd() * 0.08;
          }
          const speed2 = visible2 ? 285 : 230;
          d.vx = approach(d.vx, d.navX * speed2, 12, dt);
          d.vy = approach(d.vy, d.navY * speed2, 12, dt);
          moveCollide(game2.level, d, d.vx * dt, d.vy * dt, 6);
          if (dist(d.x, d.y, target2.x, target2.y) < 44 && hasLineOfSight(game2.level, d.x, d.y, target2.x, target2.y)) {
            detonateDrone(d);
          }
          continue;
        }
        const target = supportTarget(d, 920, false);
        if (!target) {
          d.vx = approach(d.vx, Math.cos(d.angle) * 28, 4, dt);
          d.vy = approach(d.vy, Math.sin(d.angle) * 28, 4, dt);
          d.angle += dt * 0.8;
          moveCollide(game2.level, d, d.vx * dt, d.vy * dt, 6);
          continue;
        }
        const visible = hasLineOfSight(game2.level, d.x, d.y, target.x, target.y);
        const td = dist(d.x, d.y, target.x, target.y);
        const ta = Math.atan2(target.y - d.y, target.x - d.x);
        d.angle += angDelta(d.angle, ta) * Math.min(1, 12 * dt);
        let nx = 0, ny = 0, speed = 0;
        if (visible && td < 205) {
          const side = (d.spin * 1e3 | 0) % 2 ? 1 : -1;
          nx = Math.cos(ta + Math.PI / 2) * side;
          ny = Math.sin(ta + Math.PI / 2) * side;
          speed = 92;
          if (td < 132) {
            nx -= Math.cos(ta) * 0.75;
            ny -= Math.sin(ta) * 0.75;
          }
        } else {
          if (d.navT <= 0 || visible) {
            const nav = game2.pathDirToPoint(d, target.x, target.y, 6);
            d.navX = nav.x;
            d.navY = nav.y;
            d.navT = 0.18 + rnd() * 0.1;
          }
          nx = d.navX;
          ny = d.navY;
          speed = 184;
        }
        d.vx = approach(d.vx, nx * speed, 9, dt);
        d.vy = approach(d.vy, ny * speed, 9, dt);
        moveCollide(game2.level, d, d.vx * dt, d.vy * dt, 6);
        if (visible && td < 540 && d.fireTimer <= 0) {
          if (fireSupportBullet(d, target, true)) {
            d.fireTimer = Math.max(0.16, smg.rate * 1.9);
            if (d.ammo <= 0) armDroneSelfDestruct(d);
          }
        }
      }
    }
    game2.updateDeploys = updateDeploys;
    function doAttack(actor, weaponKey) {
      const w = WEAPONS[weaponKey];
      const statusEffect = activeAttackEffect(actor, weaponKey, "direct");
      if (w.melee) {
        sfx.swing();
        let hit = false;
        for (const e of game2.pools.enemies) {
          if (!e.alive || e.state === S_DEAD) continue;
          if (actor === game2.player && e.friendly) continue;
          const d = dist(actor.x, actor.y, e.x, e.y);
          if (d > w.reach + 10) continue;
          const a = Math.atan2(e.y - actor.y, e.x - actor.x);
          if (Math.abs(angDelta(actor.aim, a)) > 1) continue;
          if (heldShieldBlocks(e, actor.x, actor.y)) {
            blockOnHeldShield(e, actor.x, actor.y);
            continue;
          }
          if (shieldBlocks(e, actor.x, actor.y)) {
            damageShield(e, 1, false, actor.x, actor.y);
            continue;
          }
          hit = true;
          if (statusEffect) applyAttackEffectToEnemy(e, statusEffect, actor.x, actor.y, actor);
          else if (w.lethal || e.state === S_DOWN) killEnemy(e, 1, Math.cos(a), Math.sin(a));
          else knockdown(e, Math.cos(a), Math.sin(a));
        }
        for (const win of game2.level.windows) {
          if (win.broken) continue;
          const d = dist(actor.x, actor.y, win.x, win.y);
          if (d > w.reach + 20) continue;
          const a = Math.atan2(win.y - actor.y, win.x - actor.x);
          if (Math.abs(angDelta(actor.aim, a)) > 1) continue;
          smashWindow(win, Math.cos(a), Math.sin(a));
        }
        if (hit) noise(actor.x, actor.y, w.noise);
        return true;
      }
      if (w.projectile) {
        launchProjectile(actor, actor.aim, weaponKey, actor === game2.player, statusEffect);
        const mx2 = actor.x + Math.cos(actor.aim) * 19, my2 = actor.y + Math.sin(actor.aim) * 19;
        if (!w.silent) {
          game2.flashes.push({ x: mx2, y: my2, a: actor.aim, t: 0, dur: 0.11, size: 1.25 });
          burst(mx2, my2, 6, 180, "#F7CF16", 2.5, 0.18);
          shake(5);
          noise(actor.x, actor.y, w.noise);
          sfx.revolver(0.35);
        } else {
          burst(mx2, my2, 2, 55, w.tint || "#7AC943", 1.2, 0.18);
        }
        return true;
      }
      for (let i = 0; i < w.pellets; i++) {
        const b = spawnFrom(game2.pools.bullets);
        if (!b) break;
        const a = actor.aim + (rnd() - 0.5) * w.spread * (w.pellets > 1 ? 2 : 1);
        b.alive = true;
        b.x = actor.x + Math.cos(a) * 16;
        b.y = actor.y + Math.sin(a) * 16;
        b.vx = Math.cos(a) * w.speed * (0.9 + rnd() * 0.2);
        b.vy = Math.sin(a) * w.speed * (0.9 + rnd() * 0.2);
        b.life = w.life || 1.6;
        b.friendly = true;
        b.pierce = w.pierce || (w.rail ? 999 : 0);
        b.shieldDmg = w.shieldDmg ?? 1;
        b.armourPierce = w.armourPierce || 0;
        b.throughDoors = !!w.throughDoors;
        b.hitDoor = null;
        b.throughWalls = !!w.throughWalls;
        b.wallPierced = 0;
        b.owner = null;
        b.near = 0;
        b.statusEffect = statusEffect || null;
        b.weapon = weaponKey;
        b.projectile = null;
        b.explosive = false;
        b.ricochet = !!w.ricochet;
        b.bounces = w.bounces || 0;
      }
      const mx = actor.x + Math.cos(actor.aim) * 19, my = actor.y + Math.sin(actor.aim) * 19;
      if (!w.silent) {
        game2.flashes.push({ x: mx, y: my, a: actor.aim, t: 0, dur: w.pellets > 1 ? 0.1 : 0.07, size: w.pellets > 1 ? 1.5 : 1 });
        burst(mx, my, 5, 200, "#F7CF16", 2.2, 0.16);
        ejectCasing(actor.x, actor.y, actor.aim);
        shake(w.pellets > 1 ? 9 : 3.2);
        noise(actor.x, actor.y, w.noise);
        const t = clamp((actor.ammo ?? w.ammo) / w.ammo, 0, 1);
        if (weaponKey === "shotgun") sfx.shotgun(t);
        else if (weaponKey === "smg") sfx.smg(t);
        else if (weaponKey === "revolver") sfx.revolver(t);
        else sfx.shot(t);
      } else {
        burst(mx, my, 2, 55, w.tint || "#7AC943", 1.2, 0.18);
      }
      return true;
    }
    function useCopySauce() {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      const sideEffect = weaponStatusEffect(p.offhandWeapon);
      const extract = extractKeyForEffect(sideEffect);
      p.attackCd = (w.rate || 0.34) * (game2.playerStats.attackRate || 1);
      if (!extract) {
        game2.banner = "\u526F\u624B\u6CA1\u6709\u53EF\u590D\u5236\u6548\u679C";
        game2.bannerT = 0.75;
        sfx.empty();
        return false;
      }
      setMainSlot(p, extract, WEAPONS[extract].ammo || 1);
      game2.floorLoadout = stashPlayerWeapon() || game2.floorLoadout;
      game2.banner = `\u63D0\u53D6\uFF1A${WEAPONS[extract].name}`;
      game2.bannerT = 0.85;
      burst(p.x, p.y, 18, 160, WEAPONS[extract].tint || "#00D6FF", 2.4, 0.48);
      sfx.status();
      return true;
    }
    function useExtractOnPlayer() {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      const effect = w.extractEffect;
      p.attackCd = (w.rate || 0.34) * (game2.playerStats.attackRate || 1);
      p.ammo = Math.max(0, (p.ammo || 1) - 1);
      applyStatusEffectToPlayer(effect, 5.8);
      burst(p.x, p.y, 16, 160, w.tint || "#7AC943", 2.3, 0.5);
      sfx.status();
      if (p.ammo <= 0) setMainSlot(p, "fists", 0);
      if (game2.mode === "defense") game2.floorLoadout = stashPlayerWeapon();
      return true;
    }
    function playerAttack() {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      if (p.attackCd > 0) return;
      const rateScale = game2.playerStats.attackRate || 1;
      if (w.copySauce) {
        useCopySauce();
        return;
      }
      if (w.extract) {
        useExtractOnPlayer();
        return;
      }
      if (w.melee) {
        p.attackCd = w.rate * rateScale;
        p.swing = 0.16;
        doAttack(p, p.weapon);
        return;
      }
      if (w.lobbed) {
        throwLobbedFromHand(0);
        return;
      }
      if (p.ammo <= 0) {
        p.attackCd = 0.18;
        sfx.empty();
        return;
      }
      p.attackCd = w.rate * rateScale;
      p.ammo--;
      doAttack(p, p.weapon);
      if (game2.mode === "defense") game2.floorLoadout = stashPlayerWeapon();
      p.vx -= Math.cos(p.aim) * w.kick * 12;
      p.vy -= Math.sin(p.aim) * w.kick * 12;
    }
    function throwLobbedFromHand(charge = 0) {
      const p = game2.player;
      const w = WEAPONS[p.weapon];
      if (!w || !w.lobbed || p.attackCd > 0) return false;
      if (p.ammo <= 0) {
        p.attackCd = 0.18;
        sfx.empty();
        return false;
      }
      p.attackCd = w.rate * (game2.playerStats.attackRate || 1);
      p.ammo--;
      spawnThrown(p, p.weapon, p.ammo, charge);
      if (p.ammo <= 0 && !game2.refillEnabled) {
        p.weapon = "fists";
        p.ammo = 0;
      }
      if (game2.mode === "defense") game2.floorLoadout = stashPlayerWeapon();
      return true;
    }
    function spawnThrown(actor, kind, ammo, charge = 0) {
      const t = spawnFrom(game2.pools.thrown);
      if (!t) return;
      const w = WEAPONS[kind] || WEAPONS.pistol;
      const lobbed = !!w.lobbed;
      const st = lobbed ? throwStats(charge) : { charge: 0, power: 1, effectScale: 1 };
      const statusEffect = activeAttackEffect(actor, kind, lobbed ? "direct" : "thrown");
      const shrapnelEffect = lobbed && kind === "frag" ? activeAttackEffect(actor, kind, "shrapnel") : null;
      t.alive = true;
      t.kind = kind;
      t.ammo = ammo;
      t.spin = 0;
      if (lobbed) {
        const target = resolveLobTarget(actor, kind, charge);
        const dx = target.x - target.startX, dy = target.y - target.startY;
        const d = Math.hypot(dx, dy);
        const flight = clamp(0.22 + d / (w.throwSpeed || 640), 0.32, 1.55);
        t.x = target.startX;
        t.y = target.startY;
        t.vx = dx / flight;
        t.vy = dy / flight;
        t.life = flight;
        t.maxLife = flight;
        t.targetX = target.x;
        t.targetY = target.y;
      } else {
        const sp = w.throwSpeed || 900;
        t.x = actor.x + Math.cos(actor.aim) * 14;
        t.y = actor.y + Math.sin(actor.aim) * 14;
        t.vx = Math.cos(actor.aim) * sp;
        t.vy = Math.sin(actor.aim) * sp;
        t.life = w.blade ? w.life || 14 : 1.6;
        t.maxLife = t.life;
        t.targetX = NaN;
        t.targetY = NaN;
      }
      t.charge = st.charge;
      t.power = st.power;
      t.effectScale = 1;
      t.statusEffect = statusEffect || null;
      t.shrapnelEffect = shrapnelEffect || null;
      t.friendly = actor === game2.player;
      t.noPickup = !!w.noPickup;
      if (!w.silent) sfx.throwIt();
      shake(2);
      triggerSlow("throw");
    }
    function spawnSawBlade(actor) {
      const t = spawnFrom(game2.pools.thrown);
      if (!t) return false;
      const w = WEAPONS.sawblade;
      const sp = w.throwSpeed || 980;
      t.alive = true;
      t.x = actor.x + Math.cos(actor.aim) * 18;
      t.y = actor.y + Math.sin(actor.aim) * 18;
      t.vx = Math.cos(actor.aim) * sp;
      t.vy = Math.sin(actor.aim) * sp;
      t.kind = "sawblade";
      t.ammo = 0;
      t.spin = actor.aim;
      t.life = w.life || 14;
      t.maxLife = t.life;
      t.targetX = NaN;
      t.targetY = NaN;
      t.charge = 0;
      t.power = 1;
      t.effectScale = 1;
      t.statusEffect = null;
      t.shrapnelEffect = null;
      t.friendly = actor === game2.player;
      t.noPickup = true;
      burst(t.x, t.y, 6, 150, w.tint || "#161513", 1.8, 0.24);
      sfx.throwIt();
      return true;
    }
    function throwWeapon(charge = 0) {
      const p = game2.player;
      if (p.weapon === "fists") return;
      const w = WEAPONS[p.weapon];
      if ((w?.katana || w?.lance) && p.katanaT > 0) {
        sfx.empty();
        return;
      }
      if (!w || w.noThrow) {
        sfx.empty();
        return;
      }
      spawnThrown(p, p.weapon, p.ammo, charge);
      p.weapon = "fists";
      p.ammo = 0;
      if (game2.mode === "defense") game2.floorLoadout = stashPlayerWeapon();
    }
    function updateDoors(dt) {
      const doors = game2.level.doors;
      for (const d of doors) {
        let near = false, ox = 0, oy = 0;
        const p = game2.player;
        if (p.alive && Math.abs(p.x - d.x) < 40 && Math.abs(p.y - d.y) < 40) {
          near = true;
          ox = p.x;
          oy = p.y;
        }
        if (!near) {
          for (const e of game2.pools.enemies) {
            if (!e.alive || e.state === S_DEAD) continue;
            if (Math.abs(e.x - d.x) < 40 && Math.abs(e.y - d.y) < 40) {
              near = true;
              ox = e.x;
              oy = e.y;
              break;
            }
          }
        }
        if (near && d.open < 0.2) d.swing = d.horiz ? oy < d.y ? 1 : -1 : ox > d.x ? 1 : -1;
        d.open = approach(d.open, near ? 1 : 0, near ? 11 : 2.6, dt);
        if (d.slam > 0) d.slam = Math.max(0, d.slam - dt * 3.5);
      }
    }
    function checkDoorSlam(actor, dirx, diry) {
      for (const d of game2.level.doors) {
        if (d.open > 0.55) continue;
        if (dist(actor.x, actor.y, d.x, d.y) > 44) continue;
        const toDoor = Math.atan2(d.y - actor.y, d.x - actor.x);
        const moving = Math.atan2(diry, dirx);
        if (Math.abs(angDelta(moving, toDoor)) > 1.2) continue;
        d.open = 1;
        d.slam = 1;
        d.swing = d.horiz ? actor.y < d.y ? 1 : -1 : actor.x > d.x ? 1 : -1;
        noise(d.x, d.y, 380, "#EC0A63");
        shake(13);
        hitstop(0.05);
        sfx.slam();
        triggerSlow("slam");
        burst(d.x, d.y, 12, 300, "#161513", 3, 0.5);
        for (const e of game2.pools.enemies) {
          if (!e.alive || e.state === S_DEAD || e.state === S_DOWN) continue;
          if (dist(e.x, e.y, d.x, d.y) > 58) continue;
          const a = Math.atan2(e.y - d.y, e.x - d.x);
          knockdown(e, Math.cos(a), Math.sin(a));
        }
        return true;
      }
      return false;
    }
    function updatePlayer(dt) {
      const p = game2.player;
      const inp2 = game2.input;
      if (!p.alive) return;
      if (p.madT > 0) p.madT = Math.max(0, p.madT - dt);
      const playerMad = p.madT > 0;
      const madTarget = playerMad ? nearestHostile(p.x, p.y, 920, false) : null;
      if (playerMad) {
        if (madTarget) p.aim = Math.atan2(madTarget.y - p.y, madTarget.x - p.x);
        else {
          p.madDirT -= dt;
          if (p.madDirT <= 0) {
            p.madDirT = 0.45 + rnd() * 0.65;
            p.madDirA = rnd() * TAU;
          }
          p.aim += angDelta(p.aim, p.madDirA) * Math.min(1, 4.5 * dt);
        }
      } else if (inp2.hasAim) {
        let best = inp2.aimAngle, bd = 0.44;
        for (const e of game2.pools.enemies) {
          if (!e.alive || e.state === S_DEAD) continue;
          if (e.friendly) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d > 500) continue;
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          const off = Math.abs(angDelta(inp2.aimAngle, a));
          if (off < bd && hasLineOfSight(game2.level, p.x, p.y, e.x, e.y)) {
            bd = off;
            best = a;
          }
        }
        p.aim = best;
      } else {
        const wx = (inp2.mx - renderer2.W / 2) / ZOOM + game2.camera.x;
        const wy = (inp2.my - renderer2.H / 2) / ZOOM + game2.camera.y;
        p.aim = Math.atan2(wy - p.y, wx - p.x);
      }
      let ix, iy;
      if (playerMad) {
        if (madTarget) {
          const dx = madTarget.x - p.x, dy = madTarget.y - p.y;
          const l = Math.hypot(dx, dy) || 1;
          ix = dx / l;
          iy = dy / l;
        } else {
          ix = Math.cos(p.aim);
          iy = Math.sin(p.aim);
        }
      } else if (inp2.analog) {
        ix = inp2.axisX;
        iy = inp2.axisY;
      } else {
        ix = (inp2.right ? 1 : 0) - (inp2.left ? 1 : 0);
        iy = (inp2.down ? 1 : 0) - (inp2.up ? 1 : 0);
        const l = Math.hypot(ix, iy) || 1;
        ix /= l;
        iy /= l;
      }
      if (p.katanaT > 0) {
        updateKatanaDash(dt);
      } else if (p.dashT > 0) {
        p.dashT -= dt;
        const sp = 1e3 * (0.4 + p.dashT / 0.14);
        moveCollide(game2.level, p, p.dashX * sp * dt, p.dashY * sp * dt, 9);
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 12) p.trail.shift();
        checkDoorSlam(p, p.dashX, p.dashY);
        const pane = game2.level.windowAtPoint(p.x + p.dashX * 14, p.y + p.dashY * 14);
        if (pane) smashWindow(pane, p.dashX, p.dashY);
        for (const e of game2.pools.enemies) {
          if (!e.alive || e.state === S_DEAD) continue;
          if (e.friendly) continue;
          if (dist(p.x, p.y, e.x, e.y) > ENEMY_DEF[e.type].r + 13) continue;
          if (shieldBlocks(e, p.x, p.y)) {
            damageShield(e, 1, true, p.x, p.y);
            p.dashT = 0;
            p.vx = -p.dashX * 300;
            p.vy = -p.dashY * 300;
            moveCollide(game2.level, p, -p.dashX * 16, -p.dashY * 16, 9);
            hitstop(0.06);
            break;
          }
          if (killEnemy(e, 1.2, p.dashX, p.dashY)) p.dashT = Math.min(0.2, p.dashT + 0.055);
        }
        if (p.dashT <= 0) {
          p.vx = p.dashX * 320;
          p.vy = p.dashY * 320;
        }
      } else {
        if (p.trail.length) p.trail.shift();
        if (ix || iy) game2.didMove = true;
        p.vx = approach(p.vx, ix * 272, 18, dt);
        p.vy = approach(p.vy, iy * 272, 18, dt);
        moveCollide(game2.level, p, p.vx * dt, p.vy * dt, 9);
      }
      const maxDash = p.maxDash || MAX_DASH;
      const dashCdMax = p.dashCdMax || DASH_CD;
      if (p.dashCharges < maxDash) {
        p.dashCd -= dt;
        if (p.dashCd <= 0) {
          p.dashCharges++;
          p.dashCd = dashCdMax;
        }
      }
      if (p.swapCd > 0) p.swapCd = Math.max(0, p.swapCd - dt);
      if (playerMad) {
        inp2.swap = false;
        inp2.dash = false;
        inp2.throwHeld = false;
        inp2.throwReleased = false;
        inp2.throwIt = false;
        inp2.fireReleased = false;
      }
      if (!playerMad && inp2.swap) {
        inp2.swap = false;
        if (swapPlayerWeapon()) game2.didAttack = true;
      }
      if (!playerMad && inp2.dash && p.dashCharges > 0 && p.dashT <= 0 && p.katanaT <= 0) {
        inp2.dash = false;
        const dx = ix || Math.cos(p.aim), dy = iy || Math.sin(p.aim);
        const dl = Math.hypot(dx, dy) || 1;
        p.dashX = dx / dl;
        p.dashY = dy / dl;
        p.dashT = 0.14;
        p.dashCharges--;
        if (p.dashCd <= 0) p.dashCd = dashCdMax;
        p.trail.length = 0;
        burst(p.x, p.y, 6, 150, "#12A3DA", 2.4, 0.3);
        sfx.dash();
        shake(2);
        triggerSlow("dash");
      }
      p.attackCd -= dt;
      if (p.swing > 0) p.swing -= dt;
      if (p.iframes > 0) p.iframes -= dt;
      if (p.blockFlash > 0) p.blockFlash -= dt;
      const held = WEAPONS[p.weapon] || WEAPONS.fists;
      const manualFire = !playerMad && inp2.fire;
      const autoMadFire = playerMad && madTarget && hasLineOfSight(game2.level, p.x, p.y, madTarget.x, madTarget.y);
      const chargingLob = held.lobbed && manualFire;
      if (held.sawLauncher) {
        p.sawCd -= dt;
        if (p.sawCd <= 0) {
          spawnSawBlade(p);
          p.sawCd = held.sawRate || 2.25;
        }
      } else {
        p.sawCd = 0;
      }
      const chargingKatana = (held.katana || held.lance) && manualFire && p.katanaT <= 0;
      const chargingThrow = p.weapon !== "fists" && !held.noThrow && inp2.throwHeld;
      if (chargingKatana) {
        game2.throwCharge = Math.min(held.chargeMax || THROW_CHARGE_MAX, game2.throwCharge + dt);
        const ratio = katanaChargeRatio(held, game2.throwCharge);
        game2.throwPreview = held.katana && ratio >= 0.98 ? estimateKatana(p, game2.throwCharge) : null;
      } else if (chargingLob || chargingThrow) {
        game2.throwCharge = Math.min(THROW_CHARGE_MAX, game2.throwCharge + dt);
        game2.throwPreview = estimateThrow(p, p.weapon, game2.throwCharge);
      }
      if (inp2.fireReleased) {
        inp2.fireReleased = false;
        if (held.katana || held.lance) {
          if (releaseKatanaCharge(game2.throwCharge)) game2.didAttack = true;
          game2.throwCharge = 0;
          game2.throwPreview = null;
        } else if (held.lobbed) {
          if (throwLobbedFromHand(game2.throwCharge)) game2.didAttack = true;
          game2.throwCharge = 0;
          game2.throwPreview = null;
        }
      }
      if (inp2.throwReleased) {
        inp2.throwReleased = false;
        if (p.weapon !== "fists") {
          throwWeapon(game2.throwCharge);
          game2.didAttack = true;
        }
        game2.throwCharge = 0;
        game2.throwPreview = null;
      }
      if (inp2.throwIt) {
        inp2.throwIt = false;
        if (p.weapon !== "fists") {
          throwWeapon(game2.throwCharge);
          game2.didAttack = true;
        }
        game2.throwCharge = 0;
        game2.throwPreview = null;
      }
      if (!chargingKatana && !chargingLob && !chargingThrow && !inp2.fireReleased && !inp2.throwReleased && !inp2.throwIt) {
        game2.throwCharge = 0;
        game2.throwPreview = null;
      }
      const currentHeld = WEAPONS[p.weapon] || WEAPONS.fists;
      if ((manualFire || autoMadFire) && !currentHeld.lobbed && !currentHeld.katana && !currentHeld.lance && p.katanaT <= 0) {
        playerAttack();
        game2.didAttack = true;
      }
      for (const k of game2.pools.pickups) {
        if (!k.alive) continue;
        if (dist(p.x, p.y, k.x, k.y) < 20) {
          const took = givePlayerWeapon(p, k.kind, k.ammo, false);
          if (!took) continue;
          k.alive = false;
          if (game2.mode === "defense") game2.floorLoadout = stashPlayerWeapon();
          const got = WEAPONS[k.kind];
          game2.banner = got?.offhandOnly || p.offhandWeapon === k.kind ? `\u526F\u624B ${got.name}` : `\u62FE\u53D6 ${got?.name || k.kind}`;
          game2.bannerT = 0.55;
          sfx.pickup();
          break;
        }
      }
    }
    function detonateBullet(b) {
      if (!b.alive) return;
      const weaponKey = b.weapon || "rocket";
      const byEnemy = !b.friendly || !!(b.owner && b.owner.friendly);
      b.alive = false;
      explodeAt(b.x, b.y, weaponKey, byEnemy, 1, b.statusEffect || null);
    }
    function ricochetBullet(b, px, py, sx, sy) {
      if (!b.ricochet || b.bounces <= 0) return false;
      b.x = px;
      b.y = py;
      const hitX = game2.level.bulletBlockedAt(px + sx, py);
      const hitY = game2.level.bulletBlockedAt(px, py + sy);
      let vx = b.vx, vy = b.vy;
      if (hitX) vx = -vx;
      if (hitY) vy = -vy;
      if (!hitX && !hitY) {
        vx = -vx;
        vy = -vy;
      }
      const sp = Math.hypot(vx, vy) || 1;
      const a = Math.atan2(vy, vx) + (rnd() - 0.5) * 0.9;
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.bounces--;
      b.near = 1;
      burst(px, py, 5, 180, WEAPONS[b.weapon]?.tint || "#00D6FF", 1.8, 0.25);
      return true;
    }
    function playerShieldBlocksBullet(b, fromX = b.x, fromY = b.y) {
      const p = game2.player;
      const closing = b.vx * (p.x - fromX) + b.vy * (p.y - fromY);
      return closing > 0 && heldShieldBlocks(p, fromX, fromY);
    }
    function bulletPlayerContact(b, px, py) {
      const p = game2.player;
      const sx = b.x - px, sy = b.y - py;
      const l2 = sx * sx + sy * sy;
      const t = l2 > 1e-6 ? clamp(((p.x - px) * sx + (p.y - py) * sy) / l2, 0, 1) : 1;
      const x = px + sx * t, y = py + sy * t;
      const dp = dist(x, y, p.x, p.y);
      const pd = dist(px, py, p.x, p.y);
      const cd = dist(b.x, b.y, p.x, p.y);
      const fromPrev = pd >= cd;
      return { x, y, dp, fromX: fromPrev ? px : b.x, fromY: fromPrev ? py : b.y };
    }
    function blockBulletOnPlayerShield(b) {
      const p = game2.player;
      b.alive = false;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      blockOnHeldShield(p, b.x, b.y, !!b.explosive || WEAPONS[b.weapon]?.rail);
      p.vx += b.vx / sp * 70;
      p.vy += b.vy / sp * 70;
    }
    function updateBullets(dt) {
      for (const b of game2.pools.bullets) {
        if (!b.alive) continue;
        b.life -= dt;
        if (b.life <= 0) {
          if (b.explosive) detonateBullet(b);
          else b.alive = false;
          continue;
        }
        const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 7));
        const stepDt = dt / steps;
        for (let s = 0; s < steps; s++) {
          const sx = b.vx * stepDt, sy = b.vy * stepDt;
          const px = b.x, py = b.y;
          b.x += sx;
          b.y += sy;
          const pane = game2.level.windowAtPoint(b.x, b.y);
          if (pane) {
            const sp = Math.hypot(b.vx, b.vy) || 1;
            smashWindow(pane, b.vx / sp, b.vy / sp);
          }
          if (game2.level.bulletBlockedAt(b.x, b.y)) {
            if (b.explosive) {
              detonateBullet(b);
              break;
            }
            if (ricochetBullet(b, px, py, sx, sy)) continue;
            if (b.throughWalls && b.x >= 0 && b.y >= 0 && b.x <= game2.level.w && b.y <= game2.level.h) {
              if (!b.wallPierced) {
                b.wallPierced = 1;
                burst(b.x, b.y, 6, 150, WEAPONS[b.weapon]?.tint || "#161513", 1.8, 0.24);
                shake(1.2);
              }
              continue;
            }
            const door = b.throughDoors ? game2.level.doorAtPoint(b.x, b.y) : null;
            if (door) {
              if (b.hitDoor !== door) {
                b.hitDoor = door;
                door.slam = Math.max(door.slam, 0.5);
                renderer2.shards(b.x, b.y, b.vx, b.vy);
                burst(b.x, b.y, 9, 190, "#161513", 2.4, 0.4);
                noise(b.x, b.y, 260);
                sfx.splinter();
                shake(3);
              }
            } else {
              b.alive = false;
              burst(b.x, b.y, 5, 130, "#161513", 1.8, 0.26);
              break;
            }
          }
          let stop = false;
          for (const e of game2.pools.enemies) {
            if (!e.alive || e.state === S_DEAD) continue;
            if (b.owner === e) continue;
            if (b.friendly && e.friendly) continue;
            if (dist(b.x, b.y, e.x, e.y) > ENEMY_DEF[e.type].r + 3) continue;
            const bw = WEAPONS[b.weapon] || null;
            const statusEffect = b.statusEffect || weaponStatusEffect(b.weapon);
            const fx = b.x - b.vx * 0.02, fy = b.y - b.vy * 0.02;
            const sp = Math.hypot(b.vx, b.vy) || 1;
            const byOtherSide = !b.friendly || !!(b.owner && b.owner.friendly);
            if (heldShieldBlocks(e, fx, fy)) {
              blockOnHeldShield(e, fx, fy, !!b.explosive || !!(bw && bw.rail));
              if (b.explosive) {
                b.x = fx;
                b.y = fy;
                detonateBullet(b);
              } else b.alive = false;
              stop = true;
              break;
            }
            if (b.explosive && shieldBlocks(e, fx, fy)) {
              damageShield(e, b.shieldDmg ?? 2, true, fx, fy);
              b.x = fx;
              b.y = fy;
              detonateBullet(b);
              stop = true;
              break;
            }
            if (b.explosive) {
              detonateBullet(b);
              stop = true;
              break;
            }
            if (bw && bw.rail && !statusEffect) {
              killEnemy(e, 1.25, b.vx / sp, b.vy / sp, byOtherSide, b.owner);
              continue;
            }
            if (shieldBlocks(e, fx, fy)) {
              if (statusEffect) {
                burst(fx, fy, 3, 70, bw?.tint || EFFECT_TINT[statusEffect] || "#7AC943", 1.4, 0.22);
                b.alive = false;
                stop = true;
                break;
              }
              const col = shieldSegmentAt(e, fx, fy);
              const depth = col >= 0 ? columnDepth(e, col) : 0;
              const sp0 = Math.hypot(b.vx, b.vy) || 1;
              if (b.armourPierce && depth > 0 && depth <= b.armourPierce) {
                for (let L = 0; L < e.layers; L++) e.shieldSeg &= ~plateBit(e, L, col);
                e.shieldHp = shieldCount(e.shieldSeg);
                e.blockFlash = 0.25;
                burst(fx, fy, 8, 220, "#161513", 2.4, 0.35);
                sfx.splinter();
                killEnemy(e, 1.1, b.vx / sp0, b.vy / sp0, byOtherSide, b.owner);
              } else {
                damageShield(e, b.shieldDmg ?? 1, false, fx, fy);
              }
              b.alive = false;
              stop = true;
              break;
            }
            if (statusEffect) {
              applyAttackEffectToEnemy(e, statusEffect, b.x, b.y, b.owner || (b.friendly ? game2.player : null));
              b.alive = false;
              stop = true;
              break;
            }
            killEnemy(e, 0.9, b.vx / sp, b.vy / sp, byOtherSide, b.owner);
            if (b.pierce > 0) b.pierce--;
            else {
              b.alive = false;
              stop = true;
            }
            break;
          }
          if (stop) break;
          if (!b.friendly) {
            if (game2.player.alive) {
              const hit = bulletPlayerContact(b, px, py);
              if (b.explosive && hit.dp < 13) {
                if (playerShieldBlocksBullet(b, hit.fromX, hit.fromY)) {
                  b.x = hit.fromX;
                  b.y = hit.fromY;
                  blockBulletOnPlayerShield(b);
                  detonateBullet(b);
                } else detonateBullet(b);
                break;
              }
              if (hit.dp < 17 && playerShieldBlocksBullet(b, hit.fromX, hit.fromY)) {
                blockBulletOnPlayerShield(b);
                break;
              }
              if (hit.dp < 10) {
                b.alive = false;
                game2.killPlayer();
                break;
              }
              if (hit.dp < 34 && !b.near && game2.nearMissCd <= 0) {
                b.near = 1;
                game2.nearMissCd = 0.9;
                triggerSlow("nearMiss");
              }
            }
          }
        }
      }
    }
    function updateThrown(dt) {
      for (const t of game2.pools.thrown) {
        if (!t.alive) continue;
        const w = WEAPONS[t.kind] || WEAPONS.pistol;
        const lobbed = !!w.lobbed;
        const blade = !!w.blade;
        t.life -= dt;
        t.spin += dt * (blade ? 48 : lobbed ? 12 : 26);
        if (blade && t.life <= 0) {
          t.alive = false;
          continue;
        }
        if (lobbed && t.life <= 0) {
          if (Number.isFinite(t.targetX)) {
            t.x = t.targetX;
            t.y = t.targetY;
          }
          t.alive = false;
          finishLobbed(t, w);
          continue;
        }
        const lethal = !!w.throwLethal;
        const subSteps = blade ? 8 : 4;
        for (let s = 0; s < subSteps; s++) {
          t.x += t.vx * dt / subSteps;
          t.y += t.vy * dt / subSteps;
          const pane = game2.level.windowAtPoint(t.x, t.y);
          if (pane) {
            const l2 = Math.hypot(t.vx, t.vy) || 1;
            smashWindow(pane, t.vx / l2, t.vy / l2);
          }
          if (lobbed) {
            let bumped = false;
            for (const e of game2.pools.enemies) {
              if (!e.alive || e.state === S_DEAD) continue;
              if (dist(t.x, t.y, e.x, e.y) < ENEMY_DEF[e.type].r + 10) {
                if (heldShieldBlocks(e, t.x - t.vx * 0.02, t.y - t.vy * 0.02) && !w.fire) {
                  blockOnHeldShield(e, t.x - t.vx * 0.02, t.y - t.vy * 0.02, true);
                }
                if (Number.isFinite(t.targetX)) {
                  t.targetX = t.x;
                  t.targetY = t.y;
                }
                t.vx *= 0.12;
                t.vy *= 0.12;
                t.life = Math.min(t.life, 0.28);
                bumped = true;
                break;
              }
            }
            if (bumped) break;
            continue;
          }
          let hit = false;
          for (const e of game2.pools.enemies) {
            if (!e.alive || e.state === S_DEAD) continue;
            if (dist(t.x, t.y, e.x, e.y) < ENEMY_DEF[e.type].r + 8) {
              const fx = t.x - t.vx * 0.02, fy = t.y - t.vy * 0.02;
              if (!blade && heldShieldBlocks(e, fx, fy)) {
                blockOnHeldShield(e, fx, fy, true);
                t.vx = 0;
                t.vy = 0;
                hit = true;
                break;
              }
              if (!blade && shieldBlocks(e, fx, fy)) {
                damageShield(e, 2, true, fx, fy);
                t.vx = 0;
                t.vy = 0;
                hit = true;
                break;
              }
              const l = Math.hypot(t.vx, t.vy) || 1;
              if (t.statusEffect) applyAttackEffectToEnemy(e, t.statusEffect, t.x, t.y, t.friendly ? game2.player : null);
              else if (lethal) killEnemy(e, 1, t.vx / l, t.vy / l);
              else if (e.state !== S_DOWN) knockdown(e, t.vx / l, t.vy / l);
              else continue;
              if (blade) continue;
              hit = true;
              break;
            }
          }
          if (hit) {
            t.vx = 0;
            t.vy = 0;
            break;
          }
        }
        if (!lobbed || !Number.isFinite(t.targetX)) {
          t.vx = approach(t.vx, 0, blade ? 0.12 : lobbed ? 7 : 4, dt);
          t.vy = approach(t.vy, 0, blade ? 0.12 : lobbed ? 7 : 4, dt);
        }
        if (lobbed) {
          if (t.life <= 0) {
            if (Number.isFinite(t.targetX)) {
              t.x = t.targetX;
              t.y = t.targetY;
            }
            t.alive = false;
            finishLobbed(t, w);
          }
          continue;
        }
        if (blade) continue;
        if (t.life <= 0 || Math.hypot(t.vx, t.vy) < 30) {
          t.alive = false;
          if (t.noPickup) continue;
          placePickup(t.x, t.y, t.kind, t.ammo, t.spin);
        }
      }
    }
    function refreshTargets() {
      game2.targets.length = 0;
      const p = game2.player;
      if (!game2.playerDisguised()) game2.targets.push({ alive: p.alive, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
    }
    function defenseShopWeapon() {
      return DEFENSE_SHOP_WEAPONS[game2.defense.shopIndex % DEFENSE_SHOP_WEAPONS.length];
    }
    game2.defenseShop = function() {
      const wave = Math.max(1, game2.defense.wave || 1);
      const p = game2.player;
      const stats = game2.playerStats;
      return {
        weapon: defenseShopWeapon(),
        costs: {
          weapon: 22 + Math.floor(wave * 2),
          refresh: 9 + Math.floor(wave * 1.5),
          refill: 15 + Math.floor(wave * 2),
          heal: 18 + Math.max(0, (p.maxHp || stats.maxHp || 1) - (p.hp || 0)) * 7,
          hp: 34 + stats.maxHp * 8,
          attack: 42,
          dash: 38 + stats.maxDash * 5,
          recover: 36,
          slow: 40
        },
        can: {
          weapon: true,
          refresh: true,
          refill: canRefillPlayerAmmo(),
          heal: p.alive && p.hp < p.maxHp,
          hp: stats.maxHp < 8,
          attack: stats.attackRate > 0.5501,
          dash: stats.maxDash < 5,
          recover: stats.dashCd > 0.4501,
          slow: stats.slow < 1.899
        }
      };
    };
    function buyDefense(slot) {
      if (game2.mode !== "defense") return false;
      if (!game2.defense.between) {
        game2.banner = "\u6CE2\u6B21\u4E2D\u65E0\u6CD5\u8D2D\u7269";
        game2.bannerT = 0.65;
        sfx.empty();
        return false;
      }
      const shop = game2.defenseShop();
      const p = game2.player;
      const deny = (msg) => {
        game2.banner = msg;
        game2.bannerT = 0.7;
        sfx.empty();
        return false;
      };
      const spend = (cost) => {
        if (game2.defense.points < cost) {
          return deny(`\u79EF\u5206\u4E0D\u8DB3 ${game2.defense.points}/${cost}`);
        }
        game2.defense.points -= cost;
        sfx.pickup();
        return true;
      };
      if (slot === 1) {
        const kind = shop.weapon;
        if (!spend(shop.costs.weapon)) return false;
        givePlayerWeapon(p, kind, WEAPONS[kind].ammo || 0, true);
        game2.floorLoadout = stashPlayerWeapon();
        game2.defense.shopIndex++;
        game2.banner = WEAPONS[kind].offhandOnly || p.offhandWeapon === kind ? `\u8D2D\u4E70\u526F\u624B ${WEAPONS[kind].name}` : `\u8D2D\u4E70 ${WEAPONS[kind].name}`;
      } else if (slot === 2) {
        if (!spend(shop.costs.refresh)) return false;
        game2.defense.shopIndex += 1 + Math.floor(rnd() * 4);
        game2.banner = `\u5237\u65B0\uFF1A${WEAPONS[defenseShopWeapon()].name}`;
      } else if (slot === 3) {
        const w = WEAPONS[p.weapon];
        if (!shop.can.refill) return deny(w && !w.melee && w.ammo > 0 ? `${w.name} \u5DF2\u6EE1\u5F39` : "\u5F53\u524D\u6B66\u5668\u4E0D\u80FD\u8865\u5F39");
        if (!spend(shop.costs.refill)) return false;
        p.ammo = w.ammo;
        game2.floorLoadout = stashPlayerWeapon();
        game2.banner = `${w.name} \u5F39\u836F\u8865\u6EE1`;
      } else if (slot === 4) {
        if (!shop.can.heal) return deny("\u751F\u547D\u5DF2\u6EE1");
        if (!spend(shop.costs.heal)) return false;
        p.hp = p.maxHp;
        game2.banner = `\u751F\u547D\u6062\u590D ${p.hp}/${p.maxHp}`;
      } else if (slot === 5) {
        if (!shop.can.hp) return deny("\u6700\u5927\u751F\u547D\u5DF2\u6EE1");
        if (!spend(shop.costs.hp)) return false;
        game2.playerStats.maxHp = Math.min(8, game2.playerStats.maxHp + 1);
        p.maxHp = game2.playerStats.maxHp;
        p.hp = p.maxHp;
        game2.banner = `\u8840\u91CF ${p.maxHp}`;
      } else if (slot === 6) {
        if (!shop.can.attack) return deny("\u653B\u51FB\u901F\u5EA6\u5DF2\u6EE1");
        if (!spend(shop.costs.attack)) return false;
        game2.playerStats.attackRate = Math.max(0.55, game2.playerStats.attackRate - 0.08);
        game2.banner = `\u653B\u901F +${Math.round((1 / game2.playerStats.attackRate - 1) * 100)}%`;
      } else if (slot === 7) {
        if (!shop.can.dash) return deny("\u51B2\u523A\u69FD\u5DF2\u6EE1");
        if (!spend(shop.costs.dash)) return false;
        game2.playerStats.maxDash = Math.min(5, game2.playerStats.maxDash + 1);
        p.maxDash = game2.playerStats.maxDash;
        p.dashCharges = Math.min(p.maxDash, p.dashCharges + 1);
        game2.banner = `\u51B2\u523A\u69FD ${p.maxDash}`;
      } else if (slot === 8) {
        if (!shop.can.recover) return deny("\u51B2\u523A\u6062\u590D\u5DF2\u6EE1");
        if (!spend(shop.costs.recover)) return false;
        game2.playerStats.dashCd = Math.max(0.45, game2.playerStats.dashCd - 0.12);
        p.dashCdMax = game2.playerStats.dashCd;
        game2.banner = `\u6062\u590D ${game2.playerStats.dashCd.toFixed(2)}s`;
      } else if (slot === 9) {
        if (!shop.can.slow) return deny("\u5B50\u5F39\u65F6\u95F4\u5DF2\u6EE1");
        if (!spend(shop.costs.slow)) return false;
        game2.playerStats.slow = Math.min(1.9, game2.playerStats.slow + 0.15);
        game2.banner = `\u5B50\u5F39\u65F6\u95F4 ${game2.playerStats.slow.toFixed(2)}x`;
      } else {
        return false;
      }
      game2.bannerT = 0.85;
      return true;
    }
    game2.buyDefense = buyDefense;
    game2.toggleDefenseShop = function() {
      if (game2.mode !== "defense" || game2.state !== "play") return false;
      if (!game2.defense.between) {
        game2.banner = "\u6E05\u7A7A\u672C\u6CE2\u540E\u5F00\u653E\u5546\u5E97";
        game2.bannerT = 0.65;
        sfx.empty();
        return false;
      }
      game2.defense.shopOpen = !game2.defense.shopOpen;
      sfx.status();
      return true;
    };
    game2.endDefenseRest = function() {
      if (game2.mode !== "defense" || game2.state !== "play" || !game2.defense.between) return false;
      spawnDefenseWave();
      return true;
    };
    function spawnDefenseWave() {
      const d = game2.defense;
      d.wave++;
      d.between = false;
      d.nextWaveT = 0;
      d.shopOpen = false;
      const allPoints = game2.level.spawnPoints || [];
      const playerRoom = game2.level.roomAtPoint ? game2.level.roomAtPoint(game2.player.x, game2.player.y) : -1;
      const notSameRoom = allPoints.filter((p0) => p0.room == null || p0.room !== playerRoom);
      const farEnough = notSameRoom.filter((p0) => dist(p0.x, p0.y, game2.player.x, game2.player.y) > TILE * 7);
      const hidden = farEnough.filter((p0) => !hasLineOfSight(game2.level, game2.player.x, game2.player.y, p0.x, p0.y));
      const points = hidden.length >= 3 ? hidden : farEnough.length ? farEnough : notSameRoom.length ? notSameRoom : allPoints;
      const count = Math.min(MAX_ENEMIES - 2, 4 + Math.floor(d.wave * 1.7));
      for (let i = 0; i < count; i++) {
        const p0 = points[i % points.length] || game2.level.exit;
        let type = "thug";
        if (d.wave >= 2 && i % 5 === 2) type = "gunner";
        if (d.wave >= 3 && i % 6 === 3) type = "hound";
        if (d.wave >= 4 && i % 7 === 4) type = "shield";
        if (d.wave >= 5 && i % 8 === 5) type = "patroller";
        let weapon = "fists";
        if (type === "thug") weapon = d.wave > 2 ? i % 4 === 1 ? "shield" : i % 2 ? "bat" : "knife" : i % 5 === 1 ? "shield" : "bat";
        if (type === "gunner") weapon = d.wave > 5 ? i % 5 === 0 ? "shield" : i % 2 ? "ripper" : "smg" : i % 6 === 2 ? "shield" : "pistol";
        if (type === "patroller") weapon = d.wave > 6 ? i % 3 === 0 ? "smg" : "pistol" : "knife";
        if (type === "shield") weapon = d.wave > 6 ? i % 2 ? "shield" : "pistol" : "shield";
        const ox = (rnd() - 0.5) * TILE * 1.2;
        const oy = (rnd() - 0.5) * TILE * 1.2;
        spawnEnemy({
          x: clamp(p0.x + ox, TILE * 1.5, game2.level.w - TILE * 1.5),
          y: clamp(p0.y + oy, TILE * 1.5, game2.level.h - TILE * 1.5),
          type,
          weapon,
          armour: type === "shield" ? Math.min(10, 3 + Math.floor(d.wave / 2)) : 0,
          angle: Math.atan2(game2.player.y - p0.y, game2.player.x - p0.x)
        });
      }
      game2.enemiesLeft = hostilesLeft();
      game2.raiseAlarm(game2.player.x, game2.player.y);
      computeFlow();
      game2.banner = `\u7B2C ${d.wave} \u6CE2`;
      game2.bannerT = 1.1;
    }
    function updateDefense(dt) {
      if (game2.mode !== "defense" || game2.state !== "play") return;
      const buy = game2.input.buy;
      if (buy) {
        game2.input.buy = null;
        buyDefense(buy);
      }
      const d = game2.defense;
      if (!d.between && game2.enemiesLeft === 0) {
        d.between = true;
        d.nextWaveT = DEFENSE_REST_SECONDS;
        d.shopOpen = true;
        d.cleared = d.wave;
        const bonus = 18 + d.wave * 7;
        d.points += bonus;
        game2.banner = `\u7B2C ${d.wave} \u6CE2\u6E05\u7A7A +${bonus} \xB7 \u4F11\u606F`;
        game2.bannerT = 1.1;
        sfx.clear();
      }
      if (d.between) {
        d.nextWaveT -= dt;
        if (d.nextWaveT <= 0) spawnDefenseWave();
      }
    }
    function step(rdt) {
      if (game2.paused) {
        setTimeScale(0);
        return;
      }
      game2.ticks++;
      game2.time += rdt;
      if (game2.state === "play" || game2.state === "dying") game2.runT += rdt;
      if (game2.bannerT > 0) game2.bannerT -= rdt;
      if (game2.tutorialT > 0) {
        game2.tutorialT -= rdt;
        if (game2.didMove && game2.didAttack) game2.tutorialT = Math.min(game2.tutorialT, 1.2);
      }
      if (game2.flash > 0) game2.flash = Math.max(0, game2.flash - rdt * 3.2);
      if (game2.dashFlash > 0) game2.dashFlash = Math.max(0, game2.dashFlash - rdt * 3);
      const ui = game2.ui;
      const span0 = TOTAL_TARGET - WIN_AT;
      const gTarget = clamp((TOTAL_TARGET - game2.remaining) / span0, 0, 1);
      [ui.gauge, ui.gaugeV] = springTo(ui.gauge, ui.gaugeV, gTarget, rdt, 0.45);
      const cTarget = game2.combo > 1 ? clamp(game2.comboTimer / 3.2, 0, 1) : 0;
      [ui.chain, ui.chainV] = springTo(ui.chain, ui.chainV, cTarget, rdt, 0.25);
      if (ui.chainPunch > 0) ui.chainPunch = Math.max(0, ui.chainPunch - rdt * 4.2);
      [ui.chainOpen, ui.chainOpenV] = springTo(ui.chainOpen, ui.chainOpenV, game2.combo > 1 ? 1 : 0, rdt, 0.2, 0.72);
      [ui.code, ui.codeV] = springTo(ui.code, ui.codeV, game2.remaining, rdt, 0.4);
      if (game2.state === "dying") {
        game2.deathT -= rdt;
        game2.worldScale = 0.08;
        if (game2.deathT <= 0) restartFloor();
      }
      const p = game2.player;
      if (game2.nearMissCd > 0) game2.nearMissCd -= rdt;
      if (game2.slowCd > 0) game2.slowCd -= rdt;
      if (game2.slowT > 0) {
        game2.slowT -= rdt;
        if (game2.slowT <= 0) {
          game2.slowT = 0;
          game2.slowScale = 1;
          sfx.focusOut();
        }
      }
      const dilating = game2.slowT > 0;
      let ts = dilating ? game2.slowScale : 1;
      if (game2.state === "dying") ts = 0.08;
      const frozen = game2.hitstop > 0;
      if (frozen) {
        game2.hitstop -= rdt;
        ts = 0.03;
      }
      game2.worldScale = ts;
      setTimeScale(ts);
      const splitScale = game2.reducedMotion ? 0.35 : 1;
      game2.plateSplit = approach(game2.plateSplit, ((1 - ts) * 6.2 + (frozen ? 4 : 0)) * splitScale, 22, rdt);
      const wdt = Math.min(0.05, rdt * ts);
      const katanaDashing = game2.player.katanaT > 0;
      const playerScale = dilating && !frozen && !katanaDashing ? Math.max(ts, PLAYER_SLOW_FLOOR) : ts;
      const pdt = Math.min(0.05, rdt * playerScale);
      if (game2.state === "play") {
        updatePlayer(pdt);
        if (game2.comboTimer > 0) {
          game2.comboTimer -= wdt;
          if (game2.comboTimer <= 0) game2.combo = 0;
        }
      }
      refreshTargets();
      game2.flowT -= wdt;
      if (game2.flowT <= 0) {
        game2.flowT = 0.16;
        computeFlow();
      }
      for (const e of game2.pools.enemies) if (e.alive) updateEnemy(game2, e, wdt);
      updateDeploys(wdt);
      updateBullets(wdt);
      updateThrown(wdt);
      updateFireZones(wdt);
      updateInfections(wdt);
      updateDoors(wdt);
      updateDefense(wdt);
      for (const n of game2.noiseRings) n.t += wdt;
      game2.noiseRings = game2.noiseRings.filter((n) => n.t < n.dur);
      for (const pt of game2.particles) {
        pt.life -= wdt;
        pt.x += pt.vx * wdt;
        pt.y += pt.vy * wdt;
        pt.vx *= 1 - 4 * wdt;
        pt.vy *= 1 - 4 * wdt;
        pt.rot += pt.spin * wdt;
        if (pt.casing && pt.life <= 0) renderer2.casing(pt.x, pt.y, pt.rot);
      }
      if (game2.particles.length) game2.particles = game2.particles.filter((pt) => pt.life > 0);
      for (const f of game2.flashes) f.t += wdt;
      if (game2.flashes.length) game2.flashes = game2.flashes.filter((f) => f.t < f.dur);
      const prev = game2.remaining;
      game2.remaining = Math.max(0, TOTAL_TARGET - game2.kills);
      game2.statusLabel = statusFor(game2.remaining);
      if (game2.remaining < prev) {
        const label = STATUS[game2.remaining];
        if (label) {
          if (REC.statusBanner) {
            game2.banner = `${game2.remaining} ${label}`;
            game2.bannerT = 1.8;
          }
          sfx.status();
        }
        if (!game2.infinite && game2.remaining <= WIN_AT && !game2.won) {
          game2.won = true;
          game2.state = "won";
          game2.paused = false;
          game2.banner = null;
          triggerSlow("lastKill");
          sfx.clear();
          if (game2.score > game2.bestScore) {
            game2.bestScore = game2.score;
            localStorage.setItem("overprint.best", String(game2.score));
          }
          localStorage.setItem("overprint.won", "1");
          game2.runResult = { time: game2.runT, score: game2.score };
          game2.best = saveBest(game2.board, game2.runResult);
          return;
        }
      }
      if (game2.mode === "endless" && game2.state === "play" && game2.enemiesLeft === 0 && p.alive) {
        if (dist(p.x, p.y, game2.level.exit.x, game2.level.exit.y) < 26) {
          const timeTaken = game2.time - game2.floorStartTime;
          const bonus = Math.max(0, Math.round(1400 - timeTaken * 45)) + game2.floor * 250;
          game2.score = Math.max(0, game2.score + bonus);
          if (game2.score > game2.bestScore) {
            game2.bestScore = game2.score;
            localStorage.setItem("overprint.best", String(game2.score));
          }
          if (game2.floor > game2.bestFloor) {
            game2.bestFloor = game2.floor;
            localStorage.setItem("overprint.floor", String(game2.floor));
          }
          startFloor(true);
        }
      }
      if (game2.state === "title") {
        const a = game2.time * 0.11;
        const hw = renderer2.W / (2 * ZOOM), hh = renderer2.H / (2 * ZOOM);
        const cx = game2.level.w / 2, cy = game2.level.h / 2;
        game2.camera.x = clamp(cx + Math.cos(a) * game2.level.w * 0.26, hw, Math.max(hw, game2.level.w - hw));
        game2.camera.y = clamp(cy + Math.sin(a * 1.3) * game2.level.h * 0.24, hh, Math.max(hh, game2.level.h - hh));
        game2.plateSplit = approach(game2.plateSplit, 1.6 + Math.sin(game2.time * 0.7) * 1.2, 6, rdt);
        return;
      }
      const halfW = renderer2.W / (2 * ZOOM), halfH = renderer2.H / (2 * ZOOM);
      const lookX = game2.input.hasAim ? Math.cos(p.aim) * 120 : clamp((game2.input.mx - renderer2.W / 2) / ZOOM, -300, 300) * 0.28;
      const lookY = game2.input.hasAim ? Math.sin(p.aim) * 90 : clamp((game2.input.my - renderer2.H / 2) / ZOOM, -220, 220) * 0.28;
      const tx = clamp(p.x + lookX, halfW, Math.max(halfW, game2.level.w - halfW));
      const ty = clamp(p.y + lookY, halfH, Math.max(halfH, game2.level.h - halfH));
      game2.camera.x = lerp(game2.camera.x, tx, 1 - Math.exp(-9 * rdt));
      game2.camera.y = lerp(game2.camera.y, ty, 1 - Math.exp(-9 * rdt));
      if (game2.reducedMotion) game2.shake *= 0.25;
      if (game2.shake > 0.05) {
        game2.camera.x += (Math.random() - 0.5) * game2.shake;
        game2.camera.y += (Math.random() - 0.5) * game2.shake;
        game2.shake *= Math.exp(-9 * rdt);
      }
    }
    game2.step = step;
    game2.startFloor = startFloor;
    game2.restartFloor = restartFloor;
    function resetTitlePreview() {
      game2.floor = REC.floor || 1;
      choosePreviewSeed();
      game2.floorLoadout = startingLoadout();
      game2.paused = false;
      startFloor(false);
      game2.state = "title";
      game2.player.alive = false;
      game2.player.x = -99999;
      game2.player.y = -99999;
      game2.banner = null;
      game2.bannerT = 0;
    }
    game2.selectMode = function(id) {
      if (!["endless", "practice", "defense"].includes(id) || id === game2.mode) return false;
      game2.mode = id;
      localStorage.setItem("overprint.mode", id);
      game2.codexOpen = false;
      game2.playerStats = id === "defense" ? defensePlayerStats() : defaultPlayerStats();
      game2.defense = newDefenseState();
      game2.best = loadBest(game2.board);
      game2.standings = null;
      resetTitlePreview();
      return true;
    };
    game2.selectBoard = game2.selectMode;
    game2.cyclePracticeMap = function() {
      game2.practice.map = (game2.practice.map + 1) % game2.practiceMaps.length;
      resetTitlePreview();
    };
    game2.cyclePracticeWeapon = function() {
      const i = PRACTICE_WEAPONS.indexOf(game2.practice.weapon);
      game2.practice.weapon = PRACTICE_WEAPONS[(i + 1 + PRACTICE_WEAPONS.length) % PRACTICE_WEAPONS.length];
      resetTitlePreview();
    };
    game2.cyclePracticeEnemy = function() {
      const i = PRACTICE_ENEMIES.indexOf(game2.practice.enemy);
      game2.practice.enemy = PRACTICE_ENEMIES[(i + 1 + PRACTICE_ENEMIES.length) % PRACTICE_ENEMIES.length];
      resetTitlePreview();
    };
    game2.toggleCodex = function() {
      game2.codexOpen = !game2.codexOpen;
      if (game2.codexOpen) game2.codexScroll = 0;
      return game2.codexOpen;
    };
    game2.showTitle = function() {
      if (!["endless", "practice", "defense"].includes(game2.mode)) game2.mode = "endless";
      game2.playerStats = game2.mode === "defense" ? defensePlayerStats() : defaultPlayerStats();
      game2.defense = newDefenseState();
      game2.best = loadBest(game2.board);
      resetTitlePreview();
    };
    game2.begin = function() {
      initAudio();
      game2.paused = false;
      const next = nextRunSeed();
      game2.seed = next.seed;
      game2.seedBase = next.base;
      game2.customSeed = customSeedBase();
      game2.runNo = next.runNo;
      game2.best = loadBest(game2.board);
      game2.runT = 0;
      game2.floor = REC.floor || 1;
      game2.score = 0;
      game2.kills = 0;
      game2.combo = 0;
      game2.bestCombo = 0;
      game2.remaining = TOTAL_TARGET;
      game2.won = false;
      game2.statusLabel = "\u672A\u627E\u5230";
      game2.ui.gauge = 0;
      game2.ui.gaugeV = 0;
      game2.ui.chain = 0;
      game2.ui.chainV = 0;
      game2.ui.chainPunch = 0;
      game2.ui.chainOpen = 0;
      game2.ui.chainOpenV = 0;
      game2.ui.code = TOTAL_TARGET;
      game2.ui.codeV = 0;
      game2.tutorialT = 9;
      game2.didMove = false;
      game2.didAttack = false;
      game2.slowT = 0;
      game2.slowScale = 1;
      game2.slowCd = 0;
      game2.playerStats = game2.mode === "defense" ? defensePlayerStats() : defaultPlayerStats();
      game2.defense = newDefenseState();
      game2.floorLoadout = startingLoadout();
      startFloor(false);
      if (game2.mode === "practice") {
        const w = WEAPONS[game2.practice.weapon] || WEAPONS.pistol;
        game2.banner = `${w.name} \u7EC3\u4E60`;
        game2.bannerT = 1.2;
      }
      if (game2.mode === "defense") {
        game2.defense.between = true;
        game2.defense.nextWaveT = DEFENSE_REST_SECONDS;
        game2.defense.shopOpen = true;
        game2.banner = "\u9632\u5B88\u51C6\u5907 \xB7 T \u6253\u5F00\u5546\u5E97";
        game2.bannerT = 1.1;
      }
      if (REC.shot) {
        game2.kills = TOTAL_TARGET - WIN_AT - REC.shot;
        game2.floorKills = 0;
        game2.remaining = TOTAL_TARGET - game2.kills;
        game2.ui.code = game2.remaining;
        game2.ui.codeV = 0;
        game2.tutorialT = 0;
        game2.runT = REC.clock;
        game2.score = Math.round(game2.kills * 730);
        game2.bestCombo = 6;
        game2.player.weapon = "smg";
        game2.player.ammo = WEAPONS.smg.ammo;
        game2.floorLoadout = stashPlayerWeapon();
      }
    };
    game2.TOTAL_TARGET = TOTAL_TARGET;
    game2.WIN_AT = WIN_AT;
    return game2;
  }

  // overprint/src/hud.js
  init_util();
  init_entities();

  // overprint/src/micro.js
  var TAU2 = Math.PI * 2;
  function bar(g, x, y, w, h, fill = false) {
    if (fill) g.fillRect(x, y, w, h);
    else g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
  function gauge(g, x, y, w, h, t, trackColor, fillColor) {
    g.strokeStyle = trackColor;
    g.lineWidth = 1;
    bar(g, x, y, w, h);
    if (t > 1e-3) {
      g.fillStyle = fillColor;
      g.fillRect(x + 1.5, y + 1.5, Math.max(0, (w - 3) * t), h - 3);
    }
  }
  function bracket(g, x, y, sx, sy, len = 9) {
    g.beginPath();
    g.moveTo(x + sx * len, y);
    g.lineTo(x, y);
    g.lineTo(x, y + sy * len);
    g.stroke();
  }
  function magazine(g, x, y, w, h, feed, loaded, capacity, inkStrong, inkFaint) {
    g.lineWidth = 1;
    if (feed === "drum") {
      const R = h / 2 - 1;
      const cx = x + R + 1, cy2 = y + h / 2;
      datum(g, cx + R + 7, x + w, cy2, inkFaint);
      g.strokeStyle = inkFaint;
      g.beginPath();
      g.arc(cx, cy2, R, 0, TAU2);
      g.stroke();
      const cr = R * 0.26;
      for (let i = 0; i < capacity; i++) {
        const a = i / capacity * TAU2 - Math.PI / 2;
        round(
          g,
          cx + Math.cos(a) * R * 0.58,
          cy2 + Math.sin(a) * R * 0.58,
          cr,
          i < loaded,
          inkStrong,
          inkFaint
        );
      }
      g.strokeStyle = inkFaint;
      g.beginPath();
      g.arc(cx, cy2, R * 0.15, 0, TAU2);
      g.stroke();
      return;
    }
    if (feed === "barrel") {
      const R = h / 2 - 1;
      const cy2 = y + h / 2, step = R * 2.4;
      const x02 = x + R + 1;
      datum(g, x02 + (capacity - 1) * step + R + 7, x + w, cy2, inkFaint);
      for (let i = 0; i < capacity; i++) {
        round(g, x02 + i * step, cy2, R, i < loaded, inkStrong, inkFaint);
      }
      return;
    }
    const zig = feed === "stagger";
    const span = w - 8;
    let r, pitch, off;
    if (zig) {
      pitch = span / (capacity + 1);
      r = Math.min(pitch * 0.9, (h - 6) / 3.9);
      off = r * 0.95;
    } else {
      pitch = span / capacity;
      r = Math.min(pitch * 0.44, h / 2 - 3);
      off = 0;
    }
    const cy = y + h / 2;
    const bodyH = Math.round(r * 2 + off * 2 + 6);
    g.strokeStyle = inkFaint;
    const by = Math.round(cy - bodyH / 2) + 0.5;
    g.beginPath();
    g.moveTo(Math.round(x) + 0.5, by + 4);
    g.lineTo(Math.round(x) + 0.5, by);
    g.lineTo(Math.round(x + w) - 0.5, by);
    g.lineTo(Math.round(x + w) - 0.5, by + bodyH);
    g.lineTo(Math.round(x) + 0.5, by + bodyH);
    g.lineTo(Math.round(x) + 0.5, by + bodyH - 4);
    g.stroke();
    g.beginPath();
    g.moveTo(Math.round(x + w) - 4.5, by);
    g.lineTo(Math.round(x + w) - 4.5, by + bodyH);
    g.stroke();
    const x0 = x + 4 + (zig ? pitch : pitch / 2);
    for (let i = 0; i < capacity; i++) {
      round(
        g,
        x0 + i * pitch,
        cy + (zig ? i % 2 ? off : -off : 0),
        r,
        i >= capacity - loaded,
        inkStrong,
        inkFaint
      );
    }
  }
  function round(g, cx, cy, r, loaded, inkStrong, inkFaint) {
    if (!loaded) {
      g.strokeStyle = inkFaint;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU2);
      g.stroke();
      return;
    }
    const lw = Math.max(1.4, r * 0.42);
    g.strokeStyle = inkStrong;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, r - lw / 2, 0, TAU2);
    g.stroke();
    g.lineWidth = 1;
    g.fillStyle = inkStrong;
    g.beginPath();
    g.arc(cx, cy, Math.max(0.9, r * 0.3), 0, TAU2);
    g.fill();
  }
  function datum(g, x0, x1, y, inkFaint) {
    if (x1 - x0 < 12) return;
    g.strokeStyle = inkFaint;
    g.beginPath();
    g.moveTo(x0, Math.round(y) + 0.5);
    g.lineTo(x1, Math.round(y) + 0.5);
    g.stroke();
    g.beginPath();
    g.moveTo(Math.round(x1) - 0.5, y - 4);
    g.lineTo(Math.round(x1) - 0.5, y + 4);
    g.stroke();
  }

  // overprint/src/hud.js
  var INK3 = "#161513";
  var M2 = "#EC0A63";
  var C2 = "#12A3DA";
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  var PAPER3 = "#EFECE3";
  function card(g, x, y, w, h) {
    g.save();
    g.globalAlpha = 0.9;
    g.fillStyle = PAPER3;
    g.fillRect(x, y, w, h);
    g.restore();
  }
  function drawFurniture(g, W, H) {
    const m = 16;
    g.save();
    g.globalCompositeOperation = "multiply";
    g.strokeStyle = ink(0.36);
    g.lineWidth = 1;
    bracket(g, m, m, 1, 1, 11);
    bracket(g, W - m, m, -1, 1, 11);
    bracket(g, m, H - m, 1, -1, 11);
    bracket(g, W - m, H - m, -1, -1, 11);
    g.restore();
  }
  var T_CODE = 22;
  var T_LABEL = 10;
  var T_MICRO = 8;
  var CAN_TRACK = typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;
  function track(g, em) {
    if (CAN_TRACK) g.letterSpacing = `${em}em`;
  }
  var BAR = 7;
  var BAR_TALL = 13;
  var PAD = 14;
  var ENEMY_NAMES = {
    strawman: "\u7A3B\u8349\u4EBA",
    thug: "\u66B4\u5F92",
    gunner: "\u67AA\u624B",
    hound: "\u730E\u72AC",
    patroller: "\u5DE1\u903B\u8005",
    shield: "\u91CD\u76FE"
  };
  var CODEX_WEAPON_ORDER = [
    "knife",
    "bat",
    "katana",
    "quixote",
    "pistol",
    "revolver",
    "smg",
    "shotgun",
    "ripper",
    "grenade",
    "frag",
    "flash",
    "sentryPack",
    "dronePack",
    "rocket",
    "molotov",
    "dart",
    "tameDart",
    "virus",
    "copySauce",
    "madExtract",
    "tameExtract",
    "virusExtract",
    "disguise",
    "sniper",
    "laser",
    "butcher",
    "shield"
  ];
  var CODEX_ENEMY_ORDER = ["strawman", "thug", "gunner", "hound", "patroller", "shield"];
  var WEAPON_DESC = {
    knife: "\u9AD8\u901F\u8FD1\u6218\uFF0C\u547D\u4E2D\u76F4\u63A5\u5904\u51B3\u3002",
    bat: "\u957F\u8DDD\u79BB\u949D\u5668\uFF0C\u9002\u5408\u51FB\u5012\u548C\u51B2\u95E8\u3002",
    katana: "\u84C4\u529B\u5C45\u5408\uFF0C\u51B2\u523A\u8DEF\u5F84\u65A9\u6740\u5E76\u65E0\u89C6\u9632\u5FA1\u3002",
    quixote: "\u9A91\u67AA\u84C4\u529B\u51B2\u950B\uFF0C\u8DEF\u5F84\u65A9\u6740\uFF1B\u51B2\u950B\u4E2D\u6309\u4F4F\u53EF\u5EF6\u957F\u3002",
    pistol: "\u7A33\u5B9A\u624B\u67AA\uFF0C\u5F39\u5323\u5C0F\u4F46\u8282\u594F\u53EF\u9760\u3002",
    revolver: "\u91CD\u5F39\u5DE6\u8F6E\uFF0C\u53EF\u7A7F\u95E8\u5E76\u524A\u7532\u3002",
    smg: "\u9AD8\u5C04\u901F\u538B\u5236\uFF0C\u6563\u5E03\u660E\u663E\u3002",
    shotgun: "\u8FD1\u8DDD\u79BB\u591A\u5F39\u4E38\u7206\u53D1\u3002",
    ripper: "\u7C7B\u4F3C\u51B2\u950B\u67AA\uFF0C\u5B50\u5F39\u53EF\u7A7F\u5899\u3002",
    grenade: "\u84C4\u529B\u6295\u63B7\uFF0C\u8303\u56F4\u7206\u70B8\u3002",
    frag: "\u7206\u70B8\u540E\u91CA\u653E\u9AD8\u901F\u7834\u7247\u3002",
    flash: "\u84C4\u529B\u6295\u63B7\uFF0C\u957F\u65F6\u95F4\u762B\u75EA\uFF0C\u6982\u7387\u7F34\u68B0\u6216\u4E71\u5C04\u3002",
    sentryPack: "\u84C4\u529B\u6295\u63B7\uFF0C\u843D\u70B9\u90E8\u7F72\u4E00\u633A\u51B2\u950B\u67AA\u53C2\u6570\u7684\u54E8\u6212\u673A\u67AA\u3002",
    dronePack: "\u84C4\u529B\u6295\u63B7\uFF0C\u843D\u70B9\u91CA\u653E 3 \u67B6\u5404\u5E26 3 \u53D1\u5B50\u5F39\u7684\u6BD2\u8702\u65E0\u4EBA\u673A\u3002",
    rocket: "\u4E09\u53D1\u91CD\u578B\u706B\u7BAD\uFF0C\u53EF\u8865\u5F39\u3002",
    molotov: "\u843D\u5730\u71C3\u70E7\uFF0C\u7559\u4E0B\u6301\u7EED\u4F24\u5BB3\u533A\u57DF\u3002",
    dart: "\u65E0\u58F0\u75AF\u72C2\u6BD2\u9556\uFF0C\u4F7F\u654C\u4EBA\u65E0\u5DEE\u522B\u653B\u51FB\u3002",
    tameDart: "\u65E0\u58F0\u9A6F\u670D\u6BD2\u9556\uFF0C\u628A\u654C\u4EBA\u62C9\u5230\u4F60\u8FD9\u8FB9\u3002",
    virus: "\u65E0\u58F0\u6295\u63B7\u611F\u67D3\u4E91\uFF1B\u4E5F\u53EF\u5728\u526F\u624B\u8BA9\u9A6F\u670D\u53CB\u519B\u7EE7\u7EED\u4F20\u67D3\u3002",
    copySauce: "\u4E3B\u624B\u4F7F\u7528\u65F6\u590D\u5236\u526F\u624B\u72B6\u6001\u6B66\u5668\uFF0C\u8F6C\u5316\u4E3A\u5BF9\u5E94\u63D0\u53D6\u6DB2\u3002",
    madExtract: "\u526F\u624B\u6D82\u5C42\uFF1A\u4E3B\u624B\u653B\u51FB\u9644\u5E26\u75AF\u72C2\uFF1B\u4E3B\u624B\u4F7F\u7528\u4F1A\u8BA9\u81EA\u5DF1\u6682\u65F6\u5931\u63A7\u3002",
    tameExtract: "\u526F\u624B\u6D82\u5C42\uFF1A\u4E3B\u624B\u653B\u51FB\u9644\u5E26\u9A6F\u5316\uFF1B\u4E3B\u624B\u4F7F\u7528\u5BF9\u81EA\u5DF1\u65E0\u6548\u3002",
    virusExtract: "\u526F\u624B\u6D82\u5C42\uFF1A\u4E3B\u624B\u653B\u51FB\u9644\u5E26\u611F\u67D3\uFF1B\u4E3B\u624B\u4F7F\u7528\u4F1A\u611F\u67D3\u81EA\u5DF1\u3002",
    disguise: "\u6697\u6740\u7528\u67AA\uFF0C\u964D\u4F4E\u88AB\u8BC6\u7834\u7684\u538B\u529B\u3002",
    sniper: "\u8D85\u9AD8\u901F\u7A7F\u900F\u5F39\uFF0C\u7EA2\u5916\u7EBF\u6807\u51FA\u5F39\u9053\u3002",
    laser: "\u53EF\u53CD\u5F39\u80FD\u91CF\u5F39\uFF0C\u9002\u5408\u62D0\u89D2\u3002",
    butcher: "\u8FD1\u6218\u7535\u952F\uFF0C\u6BCF\u9694\u4E00\u6BB5\u65F6\u95F4\u7529\u51FA\u952F\u7247\u3002",
    shield: "\u683C\u6321\u6B63\u9762\u653B\u51FB\uFF0C\u71C3\u70E7\u4E0E\u952F\u7247\u9664\u5916\u3002"
  };
  var ENEMY_DESC = {
    strawman: "\u9759\u6B62\u9776\uFF0C\u4E0D\u5DE1\u903B\u3001\u4E0D\u8B66\u6212\u3002",
    thug: "\u666E\u901A\u8FD1\u6218\u654C\u4EBA\uFF0C\u4F1A\u8FFD\u9010\u5E76\u6325\u51FB\u3002",
    gunner: "\u6301\u67AA\u654C\u4EBA\uFF0C\u4FDD\u6301\u8DDD\u79BB\u5E76\u5F00\u706B\u3002",
    hound: "\u9AD8\u901F\u51B2\u523A\u654C\u4EBA\uFF0C\u8D34\u8EAB\u5A01\u80C1\u5F88\u5F3A\u3002",
    patroller: "\u8FDC\u611F\u77E5\u5DE1\u903B\u8005\uFF0C\u4F1A\u5C3D\u91CF\u904D\u5386\u6240\u6709\u623F\u95F4\u3002",
    shield: "\u91CD\u76FE\u654C\u4EBA\uFF0C\u6B63\u9762\u88C5\u7532\u4F1A\u5206\u7247\u7834\u635F\u3002"
  };
  var CHAIN_H = 44;
  var CHAIN_HOT = 5;
  function drawChain(g, game2, x, y, w) {
    const open = game2.ui.chainOpen;
    if (open < 4e-3) return;
    const n = game2.combo;
    const punch2 = game2.ui.chainPunch;
    const hot = n >= CHAIN_HOT;
    g.save();
    g.beginPath();
    g.rect(x - 4, y, w + 8, CHAIN_H * Math.min(1.05, open) + 2);
    g.clip();
    g.translate(-punch2 * 3, -(1 - Math.min(1, open)) * 7);
    g.globalAlpha = Math.min(1, open * 1.3);
    if (hot) {
      g.fillStyle = M2;
      g.fillRect(x, y, w, CHAIN_H);
    } else {
      g.globalAlpha *= 0.9;
      g.fillStyle = PAPER3;
      g.fillRect(x, y, w, CHAIN_H);
      g.globalAlpha = Math.min(1, open * 1.3);
      g.strokeStyle = M2;
      g.lineWidth = 1;
      g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, CHAIN_H - 1);
    }
    const fg = hot ? PAPER3 : M2;
    g.fillStyle = fg;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const size = Math.round(T_CODE * (1 + punch2 * 0.22));
    track(g, -0.04);
    g.font = `600 ${size}px ${MONO}`;
    g.fillText(`\xD7${n}`, x + 12, y + 28 + (size - T_CODE) * 0.5);
    track(g, 0.16);
    g.font = `600 ${T_MICRO}px ${MONO}`;
    const nw = g.measureText(`\xD7${n}`).width;
    g.fillText("\u8FDE\u51FB", x + 12 + Math.max(46, nw + 12), y + 26);
    gauge(
      g,
      x + 12,
      y + CHAIN_H - 14,
      w - 24,
      BAR,
      clamp(game2.ui.chain, 0, 1),
      hot ? "rgba(239,236,227,.34)" : ink(0.22),
      fg
    );
    g.fillStyle = fg;
    const ticks = Math.min(n, 12);
    for (let i = 0; i < ticks; i++) g.fillRect(x + w - 8 - i * 6, y + 6, 2, 7);
    track(g, 0);
    g.restore();
  }
  function drawDefenseHud(g, game2, W) {
    if (game2.mode !== "defense") return;
    const d = game2.defense;
    const p = game2.player;
    const shop = game2.defenseShop ? game2.defenseShop() : null;
    if (!shop) return;
    game2.ui.defenseShopButton = null;
    game2.ui.defenseShopOptions = [];
    game2.ui.defenseRestButton = null;
    game2.ui.defenseShopPanel = null;
    const opened = !!(d.between && d.shopOpen);
    const x = W - 326, y = 22, w = 304, h = opened ? 322 : 106;
    game2.ui.defenseShopPanel = { x, y, w, h };
    card(g, x, y, w, h);
    g.save();
    g.globalCompositeOperation = "multiply";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = INK3;
    g.font = `600 ${T_LABEL}px ${MONO}`;
    g.fillText(`\u9632\u5B88  \u6CE2 ${String(d.wave).padStart(2, "0")}  \u79EF\u5206 ${d.points}`, x + 14, y + 20);
    const shopBtn = { x: x + w - 78, y: y + 9, w: 62, h: 22 };
    game2.ui.defenseShopButton = shopBtn;
    g.strokeStyle = d.between ? M2 : ink(0.26);
    bar(g, shopBtn.x, shopBtn.y, shopBtn.w, shopBtn.h);
    g.fillStyle = d.between ? M2 : ink(0.34);
    g.textAlign = "center";
    g.font = `600 ${T_MICRO}px ${MONO}`;
    track(g, 0.12);
    g.fillText(opened ? "\u6536\u8D77" : "\u5546\u5E97", shopBtn.x + shopBtn.w / 2, shopBtn.y + 15);
    track(g, 0);
    g.textAlign = "left";
    g.fillStyle = ink(0.52);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    track(g, 0.08);
    g.fillText(`\u751F\u547D ${p.hp}/${p.maxHp}   \u653B\u901F ${Math.round(1 / (game2.playerStats.attackRate || 1) * 100)}%`, x + 14, y + 40);
    g.fillText(`\u51B2\u523A ${p.maxDash}\u683C / ${Number(game2.playerStats.dashCd || DASH_CD).toFixed(2)}s   \u5B50\u5F39\u65F6\u95F4 ${Number(game2.playerStats.slow || 1).toFixed(2)}x`, x + 14, y + 56);
    if (d.between) {
      const t = Math.ceil(Math.max(0, d.nextWaveT));
      const rest = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      g.fillStyle = C2;
      g.font = `600 ${T_MICRO}px ${MONO}`;
      g.fillText(`\u4F11\u606F ${rest}   T \u6253\u5F00\u5546\u5E97 \xB7 \u70B9\u51FB\u8D2D\u4E70`, x + 14, y + 76);
    } else {
      g.fillStyle = ink(0.48);
      g.font = `400 ${T_MICRO}px ${MONO}`;
      g.fillText("\u6E05\u7A7A\u672C\u6CE2\u540E\u5F00\u653E\u5546\u5E97\u4E0E\u5347\u7EA7\u3002", x + 14, y + 76);
    }
    if (!opened) {
      if (d.between) {
        const done2 = { x: x + 14, y: y + 83, w: 104, h: 18 };
        game2.ui.defenseRestButton = done2;
        g.strokeStyle = C2;
        bar(g, done2.x, done2.y, done2.w, done2.h);
        g.fillStyle = C2;
        g.font = `600 ${T_MICRO}px ${MONO}`;
        track(g, 0.1);
        g.textAlign = "center";
        g.fillText("\u7ED3\u675F\u4F11\u606F", done2.x + done2.w / 2, done2.y + 13);
        g.textAlign = "left";
        track(g, 0);
      }
      track(g, 0);
      g.restore();
      return;
    }
    const weapon = WEAPONS[shop.weapon]?.name || shop.weapon;
    const items = [
      { slot: 1, label: `\u6B66\u5668 ${weapon}`, cost: shop.costs.weapon, col: M2, can: shop.can.weapon },
      { slot: 2, label: "\u5237\u65B0\u7269\u54C1", cost: shop.costs.refresh, col: "#F7CF16", can: shop.can.refresh },
      { slot: 3, label: "\u8865\u5145\u5B50\u5F39", cost: shop.costs.refill, col: "#00A651", can: shop.can.refill },
      { slot: 4, label: "\u6062\u590D\u751F\u547D", cost: shop.costs.heal, col: "#E40808", can: shop.can.heal },
      { slot: 5, label: "\u6700\u5927\u751F\u547D", cost: shop.costs.hp, col: C2, can: shop.can.hp },
      { slot: 6, label: "\u653B\u51FB\u901F\u5EA6", cost: shop.costs.attack, col: "#4A44A0", can: shop.can.attack },
      { slot: 7, label: "\u51B2\u523A\u69FD", cost: shop.costs.dash, col: "#F7CF16", can: shop.can.dash },
      { slot: 8, label: "\u51B2\u523A\u6062\u590D", cost: shop.costs.recover, col: "#00A651", can: shop.can.recover },
      { slot: 9, label: "\u5B50\u5F39\u65F6\u95F4", cost: shop.costs.slow, col: INK3, can: shop.can.slow }
    ];
    const bx = x + 14, bw = w - 28, bh = 20;
    items.forEach((item, i) => {
      const by = y + 92 + i * 21;
      const hot = item.can && d.points >= item.cost;
      const hit = { slot: item.slot, x: bx, y: by - 13, w: bw, h: bh };
      game2.ui.defenseShopOptions.push(hit);
      g.strokeStyle = hot ? item.col : ink(0.22);
      bar(g, hit.x, hit.y, hit.w, hit.h);
      g.fillStyle = hot ? item.col : ink(0.36);
      g.font = `600 ${T_MICRO}px ${MONO}`;
      track(g, 0.08);
      g.fillText(`${item.slot} ${item.label}`, bx + 8, by);
      g.textAlign = "right";
      g.fillText(item.can ? String(item.cost) : "\u6EE1", bx + bw - 8, by);
      g.textAlign = "left";
      track(g, 0);
    });
    const done = { x: bx, y: y + h - 30, w: bw, h: 22 };
    game2.ui.defenseRestButton = done;
    g.strokeStyle = C2;
    bar(g, done.x, done.y, done.w, done.h);
    g.fillStyle = C2;
    g.font = `600 ${T_MICRO}px ${MONO}`;
    track(g, 0.1);
    g.textAlign = "center";
    g.fillText("\u7ED3\u675F\u4F11\u606F / ENTER", done.x + done.w / 2, done.y + 15);
    g.textAlign = "left";
    track(g, 0);
    g.fillStyle = ink(0.38);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    track(g, 0.08);
    g.fillText("\u6570\u5B57\u952E 1-9 \u540C\u6837\u53EF\u8D2D\u4E70\u3002", bx, y + h - 38);
    track(g, 0);
    g.restore();
  }
  function drawKatanaDash(g, game2, W) {
    const p = game2.player;
    if (!p.alive || !(p.katanaT > 0) || !(p.katanaMax > 0)) return;
    const w = 300, h = 30;
    const x = W / 2 - w / 2, y = 18;
    const pct = clamp(p.katanaT / p.katanaMax, 0, 1);
    card(g, x, y, w, h);
    g.save();
    g.globalCompositeOperation = "multiply";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = INK3;
    g.font = `600 ${T_MICRO}px ${MONO}`;
    track(g, 0.14);
    const def = WEAPONS[p.weapon] || WEAPONS.katana;
    g.fillText(def.lance ? "\u5802\u5409\u67EF\u5FB7\u51B2\u950B" : "\u6B66\u58EB\u5200\u51B2\u523A", x + 12, y + 13);
    track(g, 0);
    gauge(g, x + 12, y + 18, w - 24, BAR, pct, ink(0.24), def.tint || M2);
    g.restore();
  }
  function drawPlayerStatuses(g, game2, H) {
    const p = game2.player;
    const rows = [];
    if (p.infectT > 0) rows.push({ label: `\u611F\u67D3 ${Math.ceil(p.infectT)}s`, col: "#7AC943" });
    if (p.madT > 0) rows.push({ label: `\u75AF\u72C2 ${Math.ceil(p.madT)}s`, col: M2 });
    if (!rows.length) return;
    const x = 22 - PAD * 0.7, w = 208 + PAD;
    const h = 12 + rows.length * 16;
    const y = H - 126 - h;
    card(g, x, y, w, h);
    g.save();
    g.globalCompositeOperation = "multiply";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = `600 ${T_MICRO}px ${MONO}`;
    rows.forEach((row, i) => {
      const ry = y + 16 + i * 16;
      g.fillStyle = row.col;
      bar(g, x + 10, ry - 9, 12, BAR, true);
      g.fillText(row.label, x + 30, ry);
    });
    g.restore();
  }
  function drawHud(g, game2, W, H) {
    const p = game2.player;
    drawFurniture(g, W, H);
    const SX = 22, SY = 22, SW = 208;
    card(g, SX - PAD * 0.7, SY - 10, SW + PAD, 94);
    g.save();
    g.globalCompositeOperation = "multiply";
    g.lineWidth = 1;
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.fillStyle = INK3;
    track(g, -0.03);
    g.font = `600 ${T_CODE}px ${MONO}`;
    g.fillText(String(Math.round(game2.ui.code)), SX, SY + 18);
    track(g, 0);
    const label = game2.statusLabel || "\u672A\u627E\u5230";
    track(g, 0.09);
    g.font = `600 ${T_MICRO}px ${MONO}`;
    const lw = g.measureText(label).width + 18;
    g.strokeStyle = M2;
    bar(g, SX + SW - lw, SY + 4, lw, BAR_TALL);
    g.fillStyle = M2;
    g.textAlign = "center";
    g.fillText(label, SX + SW - lw / 2, SY + 13);
    gauge(g, SX, SY + 28, SW, BAR, game2.ui.gauge, ink(0.3), INK3);
    g.textAlign = "left";
    track(g, 0.07);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    g.fillStyle = ink(0.5);
    g.fillText(
      `\u5C42 ${String(game2.floor).padStart(2, "0")}   \u654C ${String(game2.enemiesLeft).padStart(2, "0")}`,
      SX,
      SY + 48
    );
    g.fillStyle = ink(0.82);
    track(g, -0.03);
    g.font = `600 ${T_CODE}px ${MONO}`;
    g.fillText(clock(game2.runT), SX, SY + 72);
    track(g, 0);
    g.textAlign = "right";
    g.font = `400 ${T_MICRO}px ${MONO}`;
    g.fillStyle = ink(0.38);
    track(g, 0.07);
    g.fillText(String(game2.score).padStart(6, "0"), SX + SW, SY + 72);
    track(g, 0);
    track(g, 0);
    g.textAlign = "left";
    g.restore();
    drawChain(g, game2, SX - PAD * 0.7, SY - 10 + 94 + 7, SW + PAD);
    drawDefenseHud(g, game2, W);
    drawKatanaDash(g, game2, W);
    drawPlayerStatuses(g, game2, H);
    const w = WEAPONS[p.weapon];
    const off = WEAPONS[p.offhandWeapon] || WEAPONS.fists;
    const WX = 22, WY = H - 110, WW = 208;
    card(g, WX - PAD * 0.7, WY - 12, WW + PAD, 96);
    g.save();
    g.globalCompositeOperation = "multiply";
    g.lineWidth = 1;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    if (w.tint) {
      g.fillStyle = w.tint;
      bar(g, WX, WY - 5, 14, BAR, true);
    }
    g.fillStyle = INK3;
    g.font = `600 ${T_LABEL}px ${MONO}`;
    g.fillText(w.name, WX + (w.tint ? 20 : 0), WY + 3);
    if (w.feed && w.feed !== "none") {
      g.fillStyle = ink(0.5);
      track(g, 0.07);
      g.font = `400 ${T_MICRO}px ${MONO}`;
      g.textAlign = "right";
      g.fillText(`${p.ammo} / ${w.ammo}`, WX + WW, WY + 3);
      g.textAlign = "left";
      track(g, 0);
    }
    g.fillStyle = off.tint || ink(0.42);
    track(g, 0.09);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    const offName = off === WEAPONS.fists ? "\u7A7A" : off.name;
    const offAmmo = off.feed && off.feed !== "none" ? ` ${p.offhandAmmo}/${off.ammo}` : "";
    g.fillText(`\u526F\u624B ${offName}${offAmmo}`, WX, WY + 19, WW - 58);
    g.textAlign = "right";
    g.fillStyle = p.offhandWeapon !== "fists" && !off.offhandOnly ? M2 : ink(0.36);
    const offAction = p.offhandWeapon === "fists" ? "\u7A7A" : off.extract ? "\u6D82\u5C42" : off.offhandOnly || off.passive ? "\u88AB\u52A8" : "E \u5207\u6362";
    g.fillText(offAction, WX + WW, WY + 19);
    g.textAlign = "left";
    track(g, 0);
    g.fillStyle = ink(0.42);
    track(g, 0.09);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    g.fillText("\u51B2\u523A", WX, WY + 35);
    track(g, 0);
    const maxDash = p.maxDash || MAX_DASH;
    const dashCdMax = p.dashCdMax || DASH_CD;
    const dw = Math.min(30, Math.floor((WW - 92) / Math.max(1, maxDash)));
    for (let i = 0; i < maxDash; i++) {
      const bx = WX + WW - (maxDash - i) * (dw + 5) + 5;
      if (i < p.dashCharges) {
        g.fillStyle = game2.dashFlash > 0 ? M2 : INK3;
        bar(g, bx, WY + 29, dw, BAR, true);
      } else if (i === p.dashCharges) {
        gauge(g, bx, WY + 29, dw, BAR, clamp(1 - p.dashCd / dashCdMax, 0, 1), ink(0.26), ink(0.55));
      } else {
        g.strokeStyle = ink(0.26);
        bar(g, bx, WY + 29, dw, BAR);
      }
    }
    const BY = WY + 43, BH = 30;
    if (w.feed && w.feed !== "none") {
      magazine(g, WX, BY, WW, BH, w.feed, p.ammo, w.ammo, INK3, ink(0.32));
    } else {
      g.strokeStyle = ink(0.28);
      bar(g, WX, BY + BH / 2 - BAR / 2, WW, BAR);
      g.fillStyle = ink(0.45);
      track(g, 0.09);
      g.font = `400 ${T_MICRO}px ${MONO}`;
      g.textAlign = "center";
      const tag = w.extract ? "\u81EA\u7528/\u6D82\u5C42" : w.copySauce ? "\u590D\u5236\u72B6\u6001" : w.defense ? "\u6B63\u9762\u683C\u6321" : w.katana ? "\u84C4\u529B\u5C45\u5408" : w.lance ? "\u84C4\u529B\u51B2\u950B" : w.deploy ? "\u90E8\u7F72\u5305" : w.sawLauncher ? "\u81EA\u52A8\u952F\u7247" : w.blade ? "\u957F\u5BFF\u547D\u6295\u63B7\u7269" : w.lethal ? "\u5229\u5203" : "\u5F92\u624B";
      g.fillText(tag, WX + WW / 2, BY + BH / 2 + 3);
      track(g, 0);
      g.textAlign = "left";
    }
    g.restore();
    if (game2.bannerT > 0 && game2.banner) {
      const a = clamp(game2.bannerT, 0, 1);
      g.save();
      g.font = `600 ${T_CODE}px ${MONO}`;
      g.textAlign = "center";
      const bw = g.measureText(game2.banner).width + 56;
      g.globalAlpha = a * 0.93;
      g.fillStyle = PAPER3;
      g.fillRect(W / 2 - bw / 2, H / 2 - 116, bw, 38);
      g.globalCompositeOperation = "multiply";
      g.globalAlpha = a;
      g.lineWidth = 1;
      g.strokeStyle = ink(0.35);
      bracket(g, W / 2 - bw / 2 + 5, H / 2 - 111, 1, 1, 7);
      bracket(g, W / 2 + bw / 2 - 5, H / 2 - 111, -1, 1, 7);
      bracket(g, W / 2 - bw / 2 + 5, H / 2 - 83, 1, -1, 7);
      bracket(g, W / 2 + bw / 2 - 5, H / 2 - 83, -1, -1, 7);
      g.fillStyle = INK3;
      g.fillText(game2.banner, W / 2, H / 2 - 90);
      g.restore();
    }
    if (game2.flash > 0) {
      g.save();
      g.globalCompositeOperation = "multiply";
      g.globalAlpha = game2.flash * 0.5;
      g.fillStyle = M2;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  }
  function drawTitleNote(g, cx, y, w, k, title, lines) {
    const x = cx - w / 2;
    const fs = Math.max(8, Math.round(9 * k));
    g.textAlign = "left";
    g.fillStyle = ink(0.5);
    g.font = `600 ${fs}px ${MONO}`;
    track(g, 0.16);
    g.fillText(title, x, y);
    track(g, 0);
    g.strokeStyle = ink(0.22);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, Math.round(y + 5) + 0.5);
    g.lineTo(x + w, Math.round(y + 5) + 0.5);
    g.stroke();
    g.fillStyle = ink(0.48);
    g.font = `400 ${fs}px ${MONO}`;
    track(g, 0.08);
    lines.slice(0, 5).forEach((line, i) => g.fillText(line, x, y + 24 + i * Math.round(14 * k), w));
    track(g, 0);
  }
  function codexWeaponShape(g, kind) {
    switch (kind) {
      case "bat":
        g.fillRect(-9, -2, 24, 4);
        g.fillRect(10, -4, 8, 8);
        break;
      case "knife":
        g.fillRect(-11, -2, 8, 4);
        g.beginPath();
        g.moveTo(-3, -4);
        g.lineTo(16, 0);
        g.lineTo(-3, 4);
        g.closePath();
        g.fill();
        break;
      case "katana":
        g.fillRect(-20, -2.2, 12, 4.4);
        g.fillRect(-25, -7, 5, 14);
        g.beginPath();
        g.moveTo(-8, -3);
        g.lineTo(27, -1.3);
        g.lineTo(34, 0);
        g.lineTo(27, 1.3);
        g.lineTo(-8, 3);
        g.closePath();
        g.fill();
        break;
      case "quixote":
        g.fillRect(-24, -3, 16, 6);
        g.fillRect(-29, -9, 5, 18);
        g.beginPath();
        g.moveTo(-8, -3.2);
        g.lineTo(39, 0);
        g.lineTo(-8, 3.2);
        g.closePath();
        g.fill();
        g.beginPath();
        g.moveTo(4, -3);
        g.lineTo(18, -16);
        g.lineTo(18, -3);
        g.closePath();
        g.fill();
        break;
      case "pistol":
        g.fillRect(-8, -2, 18, 4);
        g.fillRect(-5, 1, 5, 9);
        break;
      case "revolver":
        g.fillRect(-10, -2, 22, 4);
        g.fillRect(-7, 1, 5, 9);
        g.beginPath();
        g.arc(-1, 0, 4, 0, TAU);
        g.fill();
        break;
      case "smg":
        g.fillRect(-12, -2.3, 26, 4.6);
        g.fillRect(-5, 2, 6, 10);
        g.fillRect(-18, -3, 7, 6);
        break;
      case "ripper":
        g.fillRect(-18, -2.5, 34, 5);
        g.fillRect(-6, 2, 6, 11);
        g.fillRect(15, -1.2, 15, 2.4);
        break;
      case "shotgun":
        g.fillRect(-14, -2.6, 36, 5.2);
        g.fillRect(-22, -3.5, 9, 7);
        break;
      case "grenade":
        g.beginPath();
        g.arc(1, 2, 7, 0, TAU);
        g.fill();
        g.fillRect(-5, -8, 12, 3);
        g.fillRect(-11, -6, 5, 8);
        break;
      case "frag":
        g.fillRect(-7, -7, 14, 14);
        g.fillRect(-9, -11, 11, 4);
        g.fillRect(-13, -8, 5, 9);
        break;
      case "flash":
        g.fillRect(-7, -7, 14, 14);
        g.fillRect(-10, -11, 11, 4);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(2, 0, 11, -0.95, 0.95);
        g.stroke();
        break;
      case "sentryPack":
        g.fillRect(-13, -9, 26, 18);
        g.fillRect(-6, -15, 12, 6);
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(0, 0, 7, 0, TAU);
        g.stroke();
        g.fillRect(6, -2, 24, 4);
        break;
      case "dronePack":
        g.fillRect(-13, -8, 26, 16);
        g.beginPath();
        g.arc(-6, 0, 2.7, 0, TAU);
        g.arc(0, 0, 2.7, 0, TAU);
        g.arc(6, 0, 2.7, 0, TAU);
        g.fill();
        g.fillRect(-22, -2.2, 9, 4.4);
        g.fillRect(13, -2.2, 9, 4.4);
        break;
      case "rocket":
        g.fillRect(-17, -4, 30, 8);
        g.beginPath();
        g.moveTo(13, -7);
        g.lineTo(27, 0);
        g.lineTo(13, 7);
        g.closePath();
        g.fill();
        g.fillRect(-25, -7, 8, 14);
        break;
      case "molotov":
        g.fillRect(-15, -5, 20, 10);
        g.fillRect(4, -3, 13, 6);
        g.beginPath();
        g.moveTo(18, 0);
        g.lineTo(28, -8);
        g.lineTo(24, 0);
        g.lineTo(28, 8);
        g.closePath();
        g.fill();
        break;
      case "dart":
      case "tameDart":
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(-17, 0);
        g.lineTo(17, 0);
        g.stroke();
        g.beginPath();
        g.moveTo(20, 0);
        g.lineTo(8, -6);
        g.lineTo(8, 6);
        g.closePath();
        g.fill();
        g.fillRect(-19, -7, 5, 14);
        break;
      case "virus":
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(0, 0, 12, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(-4, -3, 3, 0, TAU);
        g.arc(4, 2, 3.4, 0, TAU);
        g.fill();
        g.fillRect(-1, -16, 2, 32);
        g.fillRect(-16, -1, 32, 2);
        break;
      case "copySauce":
      case "madExtract":
      case "tameExtract":
      case "virusExtract":
        g.lineWidth = 2.2;
        g.strokeRect(-8, -12, 16, 24);
        g.fillRect(-5, -18, 10, 6);
        g.beginPath();
        if (kind === "copySauce") {
          g.arc(0, 0, 7, 0.3, TAU * 0.82);
          g.stroke();
          g.beginPath();
          g.moveTo(7, -1);
          g.lineTo(12, -4);
          g.lineTo(10, 2);
          g.closePath();
          g.fill();
        } else {
          g.arc(-3, -1, 3.2, 0, TAU);
          g.arc(4, 4, 2.7, 0, TAU);
          g.fill();
        }
        break;
      case "disguise":
        g.fillRect(-10, -2.2, 20, 4.4);
        g.fillRect(-7, 1, 5, 9);
        g.fillRect(5, -8, 5, 5);
        break;
      case "sniper":
        g.fillRect(-24, -2.4, 48, 4.8);
        g.fillRect(-31, -4, 10, 8);
        g.fillRect(23, -1.2, 18, 2.4);
        g.fillRect(-5, -8, 16, 3);
        break;
      case "laser":
        g.fillRect(-17, -3, 30, 6);
        g.fillRect(-10, 2, 7, 10);
        g.beginPath();
        g.moveTo(13, -7);
        g.lineTo(29, 0);
        g.lineTo(13, 7);
        g.closePath();
        g.fill();
        break;
      case "butcher":
        g.fillRect(-19, -4, 28, 8);
        g.fillRect(8, -7, 14, 14);
        g.lineWidth = 1.6;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.moveTo(10 + i * 2, -8);
          g.lineTo(11 + i * 2, -12);
          g.stroke();
          g.beginPath();
          g.moveTo(10 + i * 2, 8);
          g.lineTo(11 + i * 2, 12);
          g.stroke();
        }
        break;
      case "shield":
        g.lineWidth = 3;
        g.beginPath();
        g.arc(2, 0, 18, -1.08, 1.08);
        g.stroke();
        g.fillRect(-13, -9, 8, 18);
        break;
      default:
        g.fillRect(-10, -3, 20, 6);
        break;
    }
  }
  function codexEnemyShape(g, kind) {
    g.lineWidth = 2;
    if (kind === "hound") {
      g.beginPath();
      g.moveTo(0, -13);
      g.lineTo(16, 0);
      g.lineTo(0, 13);
      g.lineTo(-16, 0);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(8, 0, 4, 0, TAU);
      g.fill();
      return;
    }
    if (kind === "strawman") {
      g.beginPath();
      g.arc(0, -9, 6, 0, TAU);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -3);
      g.lineTo(0, 15);
      g.moveTo(-13, 4);
      g.lineTo(13, 4);
      g.moveTo(-8, 24);
      g.lineTo(0, 15);
      g.lineTo(8, 24);
      g.stroke();
      return;
    }
    if (kind === "patroller") {
      g.beginPath();
      g.moveTo(0, -15);
      g.lineTo(14, -6);
      g.lineTo(14, 6);
      g.lineTo(0, 15);
      g.lineTo(-14, 6);
      g.lineTo(-14, -6);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 7, 0, TAU);
      g.fill();
      g.fillRect(7, -2, 20, 4);
      return;
    }
    g.beginPath();
    g.arc(0, 0, kind === "shield" ? 13 : 11, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, kind === "shield" ? 7 : 8, 0, TAU);
    g.fill();
    if (kind === "gunner") g.fillRect(8, -2, 19, 4);
    if (kind === "thug") g.fillRect(8, -1.8, 16, 3.6);
    if (kind === "shield") {
      g.beginPath();
      g.arc(10, 0, 17, -1.1, 1.1);
      g.stroke();
    }
  }
  function drawCodexEntry(g, x, y, w, kind, seen, enemy) {
    const tint = enemy ? kind === "hound" ? M2 : kind === "shield" ? C2 : INK3 : WEAPONS[kind]?.tint || INK3;
    g.save();
    g.globalAlpha = seen ? 1 : 0.34;
    g.strokeStyle = tint;
    g.fillStyle = tint;
    g.save();
    g.translate(x + 25, y + 21);
    g.scale(0.62, 0.62);
    if (enemy) codexEnemyShape(g, kind);
    else codexWeaponShape(g, kind);
    g.restore();
    g.textAlign = "left";
    g.fillStyle = seen ? INK3 : ink(0.38);
    g.font = `600 10px ${MONO}`;
    track(g, 0.08);
    const name = enemy ? ENEMY_NAMES[kind] || kind : WEAPONS[kind]?.name || kind;
    g.fillText(`${name}${seen ? "" : " \xB7 \u672A\u8BB0\u5F55"}`, x + 52, y + 15, w - 58);
    track(g, 0);
    g.fillStyle = seen ? ink(0.56) : ink(0.34);
    g.font = `400 8.5px ${MONO}`;
    g.fillText(enemy ? ENEMY_DESC[kind] : WEAPON_DESC[kind], x + 52, y + 31, w - 58);
    g.strokeStyle = ink(0.16);
    g.beginPath();
    g.moveTo(x, y + 39.5);
    g.lineTo(x + w, y + 39.5);
    g.stroke();
    g.restore();
  }
  function drawCodexPopup(g, game2, W, H) {
    if (!game2.codexOpen) return;
    const counts = game2.codexCounts ? game2.codexCounts() : { weapons: 0, weaponTotal: 0, enemies: 0, enemyTotal: 0 };
    const cx = W / 2, cy = H / 2;
    const cw = Math.min(960, W - 80);
    const ch = Math.min(590, H - 64);
    const x = cx - cw / 2, y = cy - ch / 2;
    const close = { x: x + cw - 88, y: y + 20, w: 62, h: 24 };
    game2.ui.codexPanel = { x, y, w: cw, h: ch };
    game2.ui.codexClose = close;
    g.save();
    g.globalAlpha = 0.28;
    g.fillStyle = INK3;
    g.fillRect(0, 0, W, H);
    g.restore();
    g.save();
    g.globalAlpha = 0.97;
    g.fillStyle = PAPER3;
    g.fillRect(x, y, cw, ch);
    g.restore();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.strokeStyle = ink(0.36);
    bracket(g, x + 12, y + 12, 1, 1, 12);
    bracket(g, x + cw - 12, y + 12, -1, 1, 12);
    bracket(g, x + 12, y + ch - 12, 1, -1, 12);
    bracket(g, x + cw - 12, y + ch - 12, -1, -1, 12);
    g.textAlign = "left";
    g.fillStyle = INK3;
    g.font = `600 24px ${MONO}`;
    track(g, 0.08);
    g.fillText("\u56FE\u9274", x + 34, y + 48);
    g.font = `400 10px ${MONO}`;
    g.fillStyle = ink(0.52);
    g.fillText(`\u6B66\u5668 ${counts.weapons}/${counts.weaponTotal}   \u654C\u4EBA ${counts.enemies}/${counts.enemyTotal}`, x + 118, y + 46);
    track(g, 0);
    g.strokeStyle = ink(0.34);
    bar(g, close.x, close.y, close.w, close.h);
    g.fillStyle = M2;
    g.textAlign = "center";
    g.font = `600 10px ${MONO}`;
    track(g, 0.12);
    g.fillText("\u5173\u95ED", close.x + close.w / 2, close.y + 16);
    track(g, 0);
    const top = y + 82;
    const viewH = Math.max(160, ch - (top - y) - 54);
    const weaponCols = 2;
    const weaponColW = Math.floor((cw * 0.64 - 60) / weaponCols);
    const enemyX = x + Math.floor(cw * 0.68);
    g.textAlign = "left";
    g.fillStyle = ink(0.55);
    g.font = `600 10px ${MONO}`;
    track(g, 0.14);
    g.fillText("\u6B66\u5668", x + 34, top - 18);
    g.fillText("\u654C\u4EBA", enemyX, top - 18);
    track(g, 0);
    const seenWeapons = game2.codex?.weapons || [];
    const seenEnemies = game2.codex?.enemies || [];
    const weaponRows = Math.ceil(CODEX_WEAPON_ORDER.length / weaponCols);
    const contentH = Math.max(weaponRows * 42, CODEX_ENEMY_ORDER.length * 50);
    const maxScroll = Math.max(0, contentH - viewH);
    const scroll = clamp(game2.codexScroll || 0, 0, maxScroll);
    game2.codexScroll = scroll;
    g.save();
    g.beginPath();
    g.rect(x + 28, top - 3, cw - 68, viewH + 5);
    g.clip();
    CODEX_WEAPON_ORDER.forEach((id, i) => {
      const col = Math.floor(i / weaponRows);
      const row = i % weaponRows;
      drawCodexEntry(g, x + 34 + col * (weaponColW + 20), top + row * 42 - scroll, weaponColW, id, seenWeapons.includes(id), false);
    });
    CODEX_ENEMY_ORDER.forEach((id, i) => {
      drawCodexEntry(g, enemyX, top + i * 50 - scroll, cw - (enemyX - x) - 52, id, seenEnemies.includes(id), true);
    });
    g.restore();
    const sx = x + cw - 28, sy = top, sw = 7, sh = viewH;
    const thumbH = maxScroll > 0 ? clamp(viewH / contentH * sh, 34, sh) : sh;
    const thumbY = sy + (maxScroll > 0 ? scroll / maxScroll * (sh - thumbH) : 0);
    game2.ui.codexScroll = { x: sx - 4, y: sy, w: sw + 8, h: sh, thumbY, thumbH, max: maxScroll };
    g.globalAlpha = maxScroll > 0 ? 1 : 0.34;
    g.strokeStyle = ink(0.2);
    bar(g, sx, sy, sw, sh);
    g.fillStyle = M2;
    bar(g, sx, thumbY, sw, thumbH, true);
    g.globalAlpha = 1;
    g.fillStyle = ink(0.38);
    g.font = `400 9px ${MONO}`;
    g.textAlign = "right";
    track(g, 0.08);
    g.fillText("\u6EDA\u8F6E\u6216\u62D6\u52A8\u53F3\u4FA7\u6EDA\u52A8\u6761 \xB7 ESC \u8FD4\u56DE", x + cw - 34, y + ch - 24);
    track(g, 0);
    g.restore();
  }
  function drawStandings(g, game2, cx, y, w, k) {
    const st = game2.standings;
    const x = cx - w / 2;
    const fs = Math.max(8, Math.round(9 * k));
    if (game2.mode === "practice") {
      const map = game2.practiceMaps[game2.practice.map] || game2.practiceMaps[0];
      const weapon = WEAPONS[game2.practice.weapon]?.name || game2.practice.weapon;
      const enemy = ENEMY_NAMES[game2.practice.enemy] || game2.practice.enemy;
      return drawTitleNote(g, cx, y, w, k, "\u7EC3\u4E60\u6A21\u5F0F", [
        `\u5730\u5F62\uFF1A${map.label}   \u6B66\u5668\uFF1A${weapon}`,
        `\u654C\u4EBA\uFF1A${enemy}   \u5305\u542B\u7A3B\u8349\u4EBA\u8BAD\u7EC3\u76EE\u6807`,
        "\u70B9\u51FB\u9009\u9879\u5FAA\u73AF\u914D\u7F6E\uFF0C\u5F00\u5C40\u540E\u4E0D\u8BA1\u6392\u884C\u699C\u3002"
      ]);
    }
    if (game2.mode === "defense") {
      return drawTitleNote(g, cx, y, w, k, "\u9632\u5B88\u6A21\u5F0F", [
        "\u5730\u7262\u4E2D\u62B5\u5FA1\u4E00\u6CE2\u6CE2\u654C\u4EBA\u3002",
        "\u6CE2\u95F4\u4F11\u606F 2 \u5206\u949F\uFF1BT \u6216\u70B9\u51FB\u6253\u5F00\u5546\u5E97\u3002",
        "\u70B9\u51FB\u8D2D\u4E70\u6B66\u5668/\u5347\u7EA7\uFF0C\u51C6\u5907\u597D\u540E\u7ED3\u675F\u4F11\u606F\u3002"
      ]);
    }
    g.textAlign = "left";
    g.fillStyle = ink(0.5);
    g.font = `600 ${fs}px ${MONO}`;
    track(g, 0.16);
    g.fillText("\u65E0\u9650\u6A21\u5F0F", x, y);
    g.textAlign = "right";
    g.fillText("\u65F6\u95F4", x + w, y);
    track(g, 0);
    g.strokeStyle = ink(0.22);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, Math.round(y + 5) + 0.5);
    g.lineTo(x + w, Math.round(y + 5) + 0.5);
    g.stroke();
    const note = (text) => {
      g.textAlign = "center";
      g.fillStyle = ink(0.34);
      g.font = `400 ${fs}px ${MONO}`;
      track(g, 0.1);
      g.fillText(text, cx, y + 24);
      track(g, 0);
      g.textAlign = "left";
    };
    if (!st) return note("\u8BFB\u53D6\u4E2D");
    if (st.offline) return note("\u672C\u5730\u9759\u6001\u6A21\u5F0F");
    if (!st.rows || !st.rows.length) {
      return note("\u8FD8\u6CA1\u6709\u8BB0\u5F55");
    }
    const me = playerId();
    const myName = playerName();
    const isMine = (r) => r.player === me || !!myName && r.name === myName.toUpperCase();
    const row = Math.round(15 * k);
    const shown = st.rows.slice(0, 5);
    const pb = game2.best;
    if (pb && !shown.some(isMine)) {
      g.fillStyle = ink(0.4);
      g.font = `400 ${fs}px ${MONO}`;
      g.textAlign = "left";
      g.fillText("\u4F60\u7684\u6700\u4F73", x, y + 20 + 5 * row + 4);
      g.textAlign = "right";
      g.fillText(clock(pb.time), x + w, y + 20 + 5 * row + 4);
    }
    shown.forEach((r, i) => {
      const ry = y + 20 + i * row;
      const mine = isMine(r);
      g.fillStyle = mine ? M2 : ink(0.62);
      g.font = `${mine ? 600 : 400} ${fs}px ${MONO}`;
      g.textAlign = "left";
      g.fillText(String(r.rank).padStart(2, "0"), x, ry);
      g.fillText(r.name, x + 22 * k, ry);
      g.textAlign = "right";
      g.fillText(clock(r.time), x + w, ry);
    });
    g.textAlign = "left";
  }
  var MODES = [
    { id: "endless", label: "\u65E0\u9650\u6A21\u5F0F", blurb: "\u6BCF\u5C40\u79CD\u5B50 = \u65E5\u671F\u6216\u81EA\u5B9A\u4E49\u79CD\u5B50 + \u5C40\u6570\u3002" },
    { id: "practice", label: "\u7EC3\u4E60\u6A21\u5F0F", blurb: "\u81EA\u9009\u5730\u5F62\u3001\u6B66\u5668\u548C\u654C\u4EBA\uFF0C\u542B\u7A3B\u8349\u4EBA\u3002" },
    { id: "defense", label: "\u9632\u5B88\u6A21\u5F0F", blurb: "\u8FF7\u5BAB\u6CE2\u6B21\u6218\uFF0C\u51FB\u6740\u5F97\u79EF\u5206\u8D2D\u4E70\u6B66\u5668\u548C\u5347\u7EA7\u3002" }
  ];
  function drawModes(g, game2, cx, y, k) {
    const fs = Math.max(8, Math.round(9 * k));
    const h = Math.round(17 * k);
    const pad = Math.round(11 * k);
    g.font = `600 ${fs}px ${MONO}`;
    track(g, 0.14);
    const widths = MODES.map((m) => Math.round(g.measureText(m.label).width) + pad * 2);
    const gap = Math.round(8 * k);
    let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (MODES.length - 1)) / 2;
    const hits = [];
    MODES.forEach((m, i) => {
      const on = game2.mode === m.id;
      const w = widths[i];
      g.textAlign = "center";
      if (on) {
        g.save();
        g.globalCompositeOperation = "source-over";
        g.fillStyle = INK3;
        bar(g, x, y, w, h, true);
        g.fillStyle = PAPER3;
        g.fillText(m.label, x + w / 2, y + h - Math.round(5.5 * k));
        g.restore();
      } else {
        g.strokeStyle = ink(0.3);
        bar(g, x, y, w, h);
        g.fillStyle = ink(0.42);
        g.fillText(m.label, x + w / 2, y + h - Math.round(5.5 * k));
      }
      hits.push({ id: m.id, x, y, w, h });
      x += w + gap;
    });
    game2.ui.tabs = hits;
    const picked = MODES.find((m) => m.id === game2.mode) || MODES[0];
    g.textAlign = "center";
    g.fillStyle = ink(0.45);
    g.font = `400 ${fs}px ${MONO}`;
    track(g, 0.09);
    g.fillText(picked.blurb, cx, y + h + Math.round(15 * k));
    track(g, 0);
  }
  function drawOptions(g, game2, cx, y, k) {
    const fs = Math.max(8, Math.round(9 * k));
    const h = Math.round(17 * k);
    const pad = Math.round(11 * k);
    const seedBase2 = String(game2.seedBase || "").slice(0, 18) || "\u4ECA\u5929";
    const counts = game2.codexCounts ? game2.codexCounts() : { weapons: 0, weaponTotal: 0, enemies: 0, enemyTotal: 0 };
    const chips = [
      { id: "refill", label: `R \u8865\u5F39 ${game2.refillEnabled ? "\u5F00" : "\u5173"}`, on: game2.refillEnabled, col: C2 }
    ];
    if (game2.mode === "endless") chips.push({ id: "seed", label: `\u79CD\u5B50 ${seedBase2}`, on: !!game2.customSeed, col: M2 });
    if (game2.mode === "practice") {
      const map = game2.practiceMaps[game2.practice.map] || game2.practiceMaps[0];
      chips.push(
        { id: "practiceMap", label: `\u5730\u5F62 ${map.label}`, on: false, col: C2 },
        { id: "practiceWeapon", label: `\u6B66\u5668 ${WEAPONS[game2.practice.weapon]?.name || game2.practice.weapon}`, on: false, col: M2 },
        { id: "practiceEnemy", label: `\u654C\u4EBA ${ENEMY_NAMES[game2.practice.enemy] || game2.practice.enemy}`, on: false, col: "#F7CF16" }
      );
    }
    chips.push({ id: "codex", label: `\u56FE\u9274 ${counts.weapons}/${counts.weaponTotal}\xB7${counts.enemies}/${counts.enemyTotal}`, on: game2.codexOpen, col: "#4A44A0" });
    g.font = `600 ${fs}px ${MONO}`;
    track(g, 0.14);
    const widths = chips.map((c) => Math.round(g.measureText(c.label).width) + pad * 2);
    const gap = Math.round(8 * k);
    let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)) / 2;
    const hits = [];
    chips.forEach((chip, i) => {
      const w = widths[i];
      if (chip.on) {
        g.save();
        g.globalCompositeOperation = "source-over";
        g.fillStyle = chip.col;
        bar(g, x, y, w, h, true);
        g.fillStyle = PAPER3;
        g.textAlign = "center";
        g.fillText(chip.label, x + w / 2, y + h - Math.round(5.5 * k));
        g.restore();
      } else {
        g.strokeStyle = ink(0.3);
        bar(g, x, y, w, h);
        g.fillStyle = ink(0.42);
        g.textAlign = "center";
        g.fillText(chip.label, x + w / 2, y + h - Math.round(5.5 * k));
      }
      hits.push({ id: chip.id, x, y, w, h });
      x += w + gap;
    });
    track(g, 0);
    game2.ui.options = hits;
  }
  function drawTitle(g, game2, W, H) {
    const k = clamp(Math.min(W / 900, H / 760), 0.58, 1);
    const touch2 = game2.touch && game2.touch.enabled;
    const cx = W / 2, cy = H / 2;
    const t = performance.now() / 1e3;
    const cw = Math.min(560 * k, W - 28);
    const ch = 580 * k;
    g.save();
    g.globalAlpha = 0.94;
    g.fillStyle = PAPER3;
    g.fillRect(cx - cw / 2, cy - 200 * k, cw, ch);
    g.restore();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.textAlign = "center";
    const markW = 88 * k;
    drawPlateMark(g, cx - markW / 2, cy - 166 * k, markW);
    const split = (3 + Math.sin(t * 0.9) * 2.6) * k;
    g.font = `600 ${Math.min(132 * k, W * 0.17)}px ${MONO}`;
    [[C2, 1, 0], [M2, -0.5, 0.866], ["#F7CF16", -0.5, -0.866]].forEach(([col, ox, oy]) => {
      g.fillStyle = col;
      g.fillText("404", cx + ox * split, cy + 30 * k + oy * split);
    });
    g.fillStyle = INK3;
    g.font = `600 ${13 * k}px ${MONO}`;
    g.fillText("\u9875\u9762\u672A\u627E\u5230", cx, cy + 62 * k);
    g.fillStyle = ink(0.55);
    g.font = `400 ${11.5 * k}px ${MONO}`;
    g.fillText("\u6709 404 \u4E2A\u969C\u788D\u6321\u5728\u8DEF\u4E0A\u3002\u6E05\u7406\u5B83\u4EEC\u3002", cx, cy + 82 * k);
    const help = touch2 ? ["\u5DE6\u6447\u6746\u79FB\u52A8 \xB7 \u53F3\u6447\u6746\u7784\u51C6/\u653B\u51FB", "\u6309\u94AE\uFF1A\u51B2\u523A \xB7 \u6295\u63B7", "ESC \u6682\u505C \xB7 \u5F00\u542F\u540E\u53EF\u6309 R \u8865\u5F39"] : ["WASD \u79FB\u52A8 \xB7 \u9F20\u6807\u7784\u51C6 \xB7 \u70B9\u51FB\u653B\u51FB", "Space \u51B2\u523A \xB7 E \u5207\u6362\u4E3B\u526F\u624B \xB7 \u957F\u6309 Q/\u53F3\u952E\u6295\u63B7\u6B66\u5668", "\u624B\u96F7\u7C7B\u957F\u6309\u653B\u51FB\u6269\u5927\u8303\u56F4\u5E76\u9009\u62E9\u843D\u70B9 \xB7 R \u8865\u5F39 \xB7 ESC \u6682\u505C"];
    g.font = `400 ${9 * k}px ${MONO}`;
    g.fillStyle = ink(0.5);
    track(g, 0.08);
    help.forEach((line, i) => g.fillText(line, cx, cy + (104 + i * 14) * k, cw - 48 * k));
    g.fillStyle = ink(0.38);
    g.fillText("\u6765\u6E90\uFF1AISKRA.GRAPHICS/404", cx, cy + 148 * k, cw - 48 * k);
    track(g, 0);
    drawModes(g, game2, cx, cy + 166 * k, k);
    drawOptions(g, game2, cx, cy + 208 * k, k);
    g.fillStyle = M2;
    g.font = `600 ${15 * k}px ${MONO}`;
    g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
    g.fillText(touch2 ? "\u8F7B\u89E6\u5F00\u59CB" : "\u70B9\u51FB\u5F00\u59CB", cx, cy + 236 * k);
    g.globalAlpha = 1;
    drawStandings(g, game2, cx, cy + 266 * k, Math.min(320 * k, cw - 40 * k), k);
    g.restore();
  }
  function drawLegend(g, game2, W, H) {
    if (!game2.tutorialT || game2.tutorialT <= 0) return;
    const a = clamp(game2.tutorialT / 1.2, 0, 1);
    const touch2 = game2.touch && game2.touch.enabled;
    const line = touch2 ? "\u5DE6\u6447\u6746\u79FB\u52A8   \xB7   \u53F3\u6447\u6746\u8F6C\u5411\uFF0C\u63A8\u5230\u5E95\u653B\u51FB" : game2.mode === "defense" ? "\u9632\u5B88\uFF1AT/\u70B9\u51FB\u5546\u5E97\uFF0C\u6570\u5B57\u952E\u8D2D\u4E70\uFF0CE \u5207\u6362\u4E3B\u526F\u624B\uFF0CENTER \u6216\u6309\u94AE\u7ED3\u675F\u4F11\u606F" : "WASD \u79FB\u52A8   \xB7   \u9F20\u6807\u7784\u51C6   \xB7   \u70B9\u51FB\u653B\u51FB   \xB7   E \u5207\u6362\u4E3B\u526F\u624B   \xB7   Space \u51B2\u523A   \xB7   \u957F\u6309 Q/\u53F3\u952E\u84C4\u529B\u6295\u63B7   \xB7   R \u8865\u5F39   \xB7   ESC \u6682\u505C";
    g.save();
    g.textAlign = "center";
    g.font = `400 11px ${MONO}`;
    const w = Math.min(g.measureText(line).width + 40, W - 42);
    g.globalAlpha = 0.92 * a;
    g.fillStyle = PAPER3;
    g.fillRect(W / 2 - w / 2, H - 88, w, 26);
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = a;
    g.fillStyle = ink(0.7);
    g.fillText(line, W / 2, H - 70, w - 24);
    g.restore();
  }
  function drawPause(g, game2, W, H) {
    const cx = W / 2, cy = H / 2;
    const cw = Math.min(360, W - 42), ch = 170;
    const x = cx - cw / 2, y = cy - ch / 2;
    g.save();
    g.globalAlpha = 0.94;
    g.fillStyle = PAPER3;
    g.fillRect(x, y, cw, ch);
    g.restore();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.textAlign = "center";
    g.strokeStyle = ink(0.32);
    g.lineWidth = 1;
    bracket(g, x + 9, y + 9, 1, 1, 9);
    bracket(g, x + cw - 9, y + 9, -1, 1, 9);
    bracket(g, x + 9, y + ch - 9, 1, -1, 9);
    bracket(g, x + cw - 9, y + ch - 9, -1, -1, 9);
    g.fillStyle = INK3;
    g.font = `600 ${T_CODE}px ${MONO}`;
    track(g, 0.08);
    g.fillText("\u5DF2\u6682\u505C", cx, y + 42);
    g.font = `400 ${T_LABEL}px ${MONO}`;
    g.fillStyle = ink(0.55);
    g.fillText(game2.refillEnabled ? "R \u8865\u5F39\u5DF2\u5F00\u542F" : "R \u8865\u5F39\u5DF2\u5173\u95ED", cx, y + 64);
    const bw = 132, bh = 26, gap = 14, by = y + 92;
    const buttons = [
      { id: "resume", label: "\u7EE7\u7EED\u6E38\u620F", x: cx - bw - gap / 2, y: by, w: bw, h: bh, col: C2 },
      { id: "menu", label: "\u8FD4\u56DE\u4E3B\u83DC\u5355", x: cx + gap / 2, y: by, w: bw, h: bh, col: M2 }
    ];
    game2.ui.pauseOptions = buttons;
    for (const b of buttons) {
      g.strokeStyle = b.col;
      bar(g, b.x, b.y, b.w, b.h);
      g.fillStyle = b.col;
      g.font = `600 10px ${MONO}`;
      track(g, 0.12);
      g.fillText(b.label, b.x + b.w / 2, b.y + 17);
    }
    g.fillStyle = ink(0.42);
    g.font = `400 9px ${MONO}`;
    track(g, 0.1);
    g.fillText("ESC \u7EE7\u7EED \xB7 \u70B9\u51FB\u6309\u94AE\u9009\u62E9", cx, y + 144);
    track(g, 0);
    g.restore();
  }
  function drawWin(g, game2, W, H) {
    const cx = W / 2, cy = H / 2;
    const t = performance.now() / 1e3;
    const split = 2 + Math.sin(t * 1.1) * 1.6;
    const cw = Math.min(720, W - 60);
    g.save();
    g.globalAlpha = 0.95;
    g.fillStyle = PAPER3;
    g.fillRect(cx - cw / 2, cy - 170, cw, 500);
    g.restore();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.textAlign = "center";
    g.font = `600 ${Math.min(150, W * 0.17)}px ${MONO}`;
    [["#12A3DA", 1, 0], ["#EC0A63", -0.5, 0.866], ["#F7CF16", -0.5, -0.866]].forEach(([col, ox, oy]) => {
      g.fillStyle = col;
      g.fillText("200", cx + ox * split, cy - 40 + oy * split);
    });
    g.fillStyle = INK3;
    g.font = `600 20px ${MONO}`;
    g.fillText("\u6B63\u5E38", cx, cy - 4);
    g.font = `400 12px ${MONO}`;
    g.fillStyle = "rgba(22,21,19,0.62)";
    g.fillText("\u9875\u9762\u5DF2\u6062\u590D\u3002204 \u4E2A\u969C\u788D\u5DF2\u6E05\u9664\u3002", cx, cy + 26);
    g.fillStyle = INK3;
    g.font = `600 14px ${MONO}`;
    g.fillText(`${clock(game2.runT)}   \xB7   \u5F97\u5206 ${game2.score}   \xB7   \u6700\u4F73\u8FDE\u51FB \xD7${game2.bestCombo}`, cx, cy + 58);
    const pb = game2.best;
    if (pb) {
      g.font = `400 11px ${MONO}`;
      g.fillStyle = ink(0.45);
      g.fillText(
        pb.time >= game2.runT ? `${game2.board.label} \u2014 \u65B0\u7EAA\u5F55` : `${game2.board.label} \u2014 \u6700\u4F73 ${clock(pb.time)}`,
        cx,
        cy + 78
      );
    }
    if (game2.claimError) {
      g.fillStyle = M2;
      g.font = `600 10px ${MONO}`;
      track(g, 0.12);
      g.fillText(String(game2.claimError).toUpperCase(), cx, cy + 134);
      track(g, 0);
    } else if (game2.claimOpen) {
      g.fillStyle = ink(0.4);
      g.font = `400 9px ${MONO}`;
      track(g, 0.1);
      g.fillText("\u672C\u5468\u6700\u4F73\u4F1A\u5199\u4E0A\u540D\u5B57", cx, cy + 134);
      track(g, 0);
    } else if (game2.claimed) {
      const r = game2.claimRank;
      g.fillStyle = INK3;
      g.font = `600 13px ${MONO}`;
      track(g, 0.1);
      g.fillText(
        r === 1 ? "\u6392\u884C\u699C\u7B2C\u4E00" : r ? `\u6392\u884C\u699C\u7B2C ${r}` : "\u5DF2\u4E0A\u699C",
        cx,
        cy + 104
      );
      track(g, 0);
    }
    g.fillStyle = ink(0.38);
    g.font = `400 10px ${MONO}`;
    track(g, 0.1);
    g.fillText("\u70B9\u51FB\u4EFB\u610F\u5904\u518D\u6765\u4E00\u5C40", cx, cy + 198);
    track(g, 0);
    g.restore();
    const lockW = 68;
    g.save();
    g.globalCompositeOperation = "multiply";
    drawLockup(g, cx - lockW / 2, cy + 216, lockW, ink(0.72));
    g.fillStyle = ink(0.42);
    g.font = `400 9px ${MONO}`;
    g.textAlign = "center";
    g.fillText("ISKRA.GRAPHICS / 404", cx, cy + 284);
    g.restore();
  }

  // overprint/src/touch.js
  init_util();
  var INK4 = "#161513";
  var M3 = "#EC0A63";
  var MONO2 = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  var STICK_R = 58;
  var DEAD = 12;
  var AIM_R = 100;
  var FIRE_AT = 62;
  function createTouch(canvas2, game2, renderer2) {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const enabled2 = coarse || "ontouchstart" in window && navigator.maxTouchPoints > 0;
    const t = {
      enabled: enabled2,
      engaged: false,
      // true once a real touch has happened
      move: null,
      // { id, ox, oy, x, y }
      aim: null,
      buttons: [],
      aimAngle: 0,
      hasAim: false,
      firing: false,
      scale: 1
      // layout() retunes this; apply() can run before it has
    };
    function layout() {
      const W = renderer2.W, H = renderer2.H;
      const s = clamp(Math.min(W, H) / 780, 0.82, 1.25);
      const padX = 14 * s, padY = 20 * s;
      const R = 46 * s, r = 31 * s;
      t.buttons = [
        { id: "dash", label: "\u51B2\u523A", x: W - padX - R, y: H - padY - R, r: R, press: 0 },
        { id: "throw", label: "\u6295\u63B7", x: W - padX - R, y: H - padY - R * 2 - r - 24 * s, r, press: 0 }
      ];
      t.scale = s;
    }
    function hitButton(x, y) {
      for (const b of t.buttons) {
        const rr = b.r * 1.28;
        if ((x - b.x) ** 2 + (y - b.y) ** 2 < rr * rr) return b;
      }
      return null;
    }
    function down(e) {
      if (e.pointerType !== "touch") return;
      t.engaged = true;
      layout();
      const x = e.clientX, y = e.clientY;
      const b = hitButton(x, y);
      if (b) {
        b.press = 1;
        b.pid = e.pointerId;
        if (b.id === "dash") game2.input.dash = true;
        if (b.id === "throw") game2.input.throwIt = true;
        e.preventDefault();
        return;
      }
      if (x < renderer2.W * 0.46) {
        if (!t.move) t.move = { id: e.pointerId, ox: x, oy: y, x, y };
      } else if (!t.aim) {
        t.aim = { id: e.pointerId, ox: x, oy: y, x, y };
      }
      e.preventDefault();
    }
    function move(e) {
      if (e.pointerType !== "touch") return;
      if (t.move && t.move.id === e.pointerId) {
        t.move.x = e.clientX;
        t.move.y = e.clientY;
      }
      if (t.aim && t.aim.id === e.pointerId) {
        t.aim.x = e.clientX;
        t.aim.y = e.clientY;
      }
      e.preventDefault();
    }
    function up(e) {
      if (e.pointerType !== "touch") return;
      if (t.move && t.move.id === e.pointerId) t.move = null;
      if (t.aim && t.aim.id === e.pointerId) {
        if (t.firing) game2.input.fireReleased = true;
        t.aim = null;
      }
      for (const b of t.buttons) if (b.pid === e.pointerId) {
        b.pid = -1;
        b.press = 0;
      }
      e.preventDefault();
    }
    canvas2.addEventListener("pointerdown", down, { passive: false });
    canvas2.addEventListener("pointermove", move, { passive: false });
    canvas2.addEventListener("pointerup", up, { passive: false });
    canvas2.addEventListener("pointercancel", up, { passive: false });
    window.addEventListener("resize", layout);
    layout();
    t.apply = function(dt) {
      const inp2 = game2.input;
      for (const b of t.buttons) if (b.press > 0 && !b.pid) b.press = Math.max(0, b.press - dt * 5);
      if (t.move) {
        let dx = t.move.x - t.move.ox, dy = t.move.y - t.move.oy;
        const len = Math.hypot(dx, dy);
        const R = STICK_R * t.scale;
        if (len > R) {
          dx = dx / len * R;
          dy = dy / len * R;
        }
        const mag = Math.min(1, Math.hypot(dx, dy) / R);
        if (mag * R > DEAD * t.scale) {
          const a = Math.atan2(dy, dx);
          inp2.analog = true;
          inp2.axisX = Math.cos(a) * mag;
          inp2.axisY = Math.sin(a) * mag;
        } else {
          inp2.analog = true;
          inp2.axisX = 0;
          inp2.axisY = 0;
        }
      } else if (t.engaged) {
        inp2.analog = true;
        inp2.axisX = 0;
        inp2.axisY = 0;
      }
      if (t.aim) {
        const dx = t.aim.x - t.aim.ox, dy = t.aim.y - t.aim.oy;
        const len = Math.hypot(dx, dy);
        if (len > DEAD * t.scale) {
          t.aimAngle = Math.atan2(dy, dx);
          t.hasAim = true;
        }
        t.firing = len > FIRE_AT * t.scale;
        inp2.fire = t.firing;
        inp2.aimAngle = t.aimAngle;
        inp2.hasAim = t.hasAim;
      } else if (t.engaged) {
        t.firing = false;
        inp2.fire = false;
        inp2.aimAngle = t.aimAngle;
        inp2.hasAim = t.hasAim;
      }
    };
    t.draw = function(ctx2) {
      if (!t.engaged) return;
      layout();
      const s = t.scale;
      ctx2.save();
      ctx2.globalCompositeOperation = "multiply";
      ctx2.lineWidth = 1.6;
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      for (const b of t.buttons) {
        ctx2.globalCompositeOperation = "source-over";
        ctx2.globalAlpha = 0.82;
        ctx2.fillStyle = "#EFECE3";
        ctx2.beginPath();
        ctx2.arc(b.x, b.y, b.r, 0, TAU);
        ctx2.fill();
        ctx2.globalCompositeOperation = "multiply";
        if (b.press > 0) {
          ctx2.globalAlpha = 0.55 * b.press;
          ctx2.fillStyle = M3;
          ctx2.beginPath();
          ctx2.arc(b.x, b.y, b.r, 0, TAU);
          ctx2.fill();
        }
        ctx2.globalAlpha = b.press > 0 ? 1 : 0.62;
        ctx2.strokeStyle = INK4;
        ctx2.beginPath();
        ctx2.arc(b.x, b.y, b.r, 0, TAU);
        ctx2.stroke();
        ctx2.fillStyle = INK4;
        ctx2.font = `600 ${Math.round(10 * s)}px ${MONO2}`;
        ctx2.fillText(b.label, b.x, b.y);
      }
      const stick = (st, col, trigger) => {
        if (!st) return;
        const R = (trigger ? AIM_R : STICK_R) * s;
        let dx = st.x - st.ox, dy = st.y - st.oy;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = dx / len * R;
          dy = dy / len * R;
        }
        ctx2.globalAlpha = 0.35;
        ctx2.strokeStyle = col;
        ctx2.beginPath();
        ctx2.arc(st.ox, st.oy, R, 0, TAU);
        ctx2.stroke();
        if (trigger) {
          ctx2.setLineDash([3, 5]);
          ctx2.globalAlpha = t.firing ? 0.8 : 0.3;
          ctx2.beginPath();
          ctx2.arc(st.ox, st.oy, FIRE_AT * s, 0, TAU);
          ctx2.stroke();
          ctx2.setLineDash([]);
        }
        const hot = trigger && t.firing;
        ctx2.globalAlpha = hot ? 1 : 0.8;
        ctx2.lineWidth = hot ? 2.6 : 1.6;
        ctx2.beginPath();
        ctx2.arc(st.ox + dx, st.oy + dy, 19, 0, TAU);
        ctx2.stroke();
        ctx2.lineWidth = 1.6;
        ctx2.globalAlpha = hot ? 0.6 : 0.25;
        ctx2.fillStyle = col;
        ctx2.beginPath();
        ctx2.arc(st.ox + dx, st.oy + dy, 19, 0, TAU);
        ctx2.fill();
      };
      stick(t.move, INK4, false);
      stick(t.aim, M3, true);
      ctx2.restore();
    };
    return t;
  }

  // overprint/src/main.js
  var BUILD_ID = "184173";
  console.log("[overprint] build", BUILD_ID);
  if (window.buildTitle) window.buildTitle("\u7248\u672C " + BUILD_ID);
  var canvas = document.getElementById("c");
  var renderer = createRenderer(canvas);
  var game = createGame(renderer);
  var touch = createTouch(canvas, game, renderer);
  game.touch = touch;
  game.showTitle();
  var inp = game.input;
  inp.mx = window.innerWidth / 2;
  inp.my = window.innerHeight / 2;
  var codexDrag = null;
  var KEYMAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right"
  };
  addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !e.repeat && game.codexOpen) {
      e.preventDefault();
      game.toggleCodex();
      return;
    }
    if (e.code === "Escape" && !e.repeat && game.state === "play") {
      e.preventDefault();
      game.togglePause();
      return;
    }
    if (e.code === "KeyR" && game.state === "play") {
      e.preventDefault();
      game.refillAmmo();
      return;
    }
    if (e.code === "KeyT" && !e.repeat && game.state === "play" && game.mode === "defense" && !game.paused) {
      e.preventDefault();
      game.toggleDefenseShop?.();
      return;
    }
    if (e.code === "Enter" && !e.repeat && game.state === "play" && game.mode === "defense" && game.defense.between && !game.paused) {
      e.preventDefault();
      game.endDefenseRest?.();
      return;
    }
    if (game.paused && e.code !== "KeyM") {
      e.preventDefault();
      return;
    }
    if (game.state === "play" && game.mode === "defense" && game.defense.shopOpen && /^Digit[1-9]$/.test(e.code)) {
      inp.buy = Number(e.code.slice(5));
      e.preventDefault();
      return;
    }
    if (KEYMAP[e.code]) {
      inp[KEYMAP[e.code]] = true;
      e.preventDefault();
    }
    if (e.code === "Space") {
      inp.dash = true;
      e.preventDefault();
    }
    if (e.code === "KeyE" && !e.repeat && game.state === "play") {
      inp.swap = true;
      e.preventDefault();
    }
    if (e.code === "KeyQ") {
      inp.throwHeld = true;
      e.preventDefault();
    }
    if (e.code === "Backspace" && game.state === "play") {
      e.preventDefault();
      game.restartFloor();
    }
    if (e.code === "KeyM") {
      initAudio();
      setMuted(!isMuted());
    }
    if (e.code === "Enter" && game.state === "title") game.begin();
  });
  addEventListener("keyup", (e) => {
    if (KEYMAP[e.code]) inp[KEYMAP[e.code]] = false;
    if (e.code === "KeyQ") {
      if (inp.throwHeld) inp.throwReleased = true;
      inp.throwHeld = false;
      e.preventDefault();
    }
  });
  addEventListener("mousemove", (e) => {
    inp.mx = e.clientX;
    inp.my = e.clientY;
    if (codexDrag) {
      dragCodexScroll(e.clientY);
      e.preventDefault();
    }
  });
  function grabFocus() {
    try {
      if (window.self !== window.top) window.focus();
    } catch {
    }
  }
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    grabFocus();
    if (touch.engaged) return;
    if (hitTab(e.clientX, e.clientY)) return;
    if (game.state === "title" || game.state === "won") {
      game.begin();
      return;
    }
    if (game.paused) return;
    if (e.button === 0) inp.fire = true;
    if (e.button === 2) inp.throwHeld = true;
  });
  addEventListener("mouseup", (e) => {
    codexDrag = null;
    if (e.button === 0) {
      if (inp.fire) inp.fireReleased = true;
      inp.fire = false;
    }
    if (e.button === 2) {
      if (inp.throwHeld) inp.throwReleased = true;
      inp.throwHeld = false;
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    grabFocus();
    if (e.pointerType !== "touch") return;
    if (hitTab(e.clientX, e.clientY)) {
      e.preventDefault();
      return;
    }
    if (game.state === "title" || game.state === "won") {
      e.preventDefault();
      game.begin();
    }
  }, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => {
    if (!game.codexOpen) return;
    scrollCodex(e.deltaY);
    e.preventDefault();
  }, { passive: false });
  addEventListener("blur", () => {
    codexDrag = null;
    inp.up = inp.down = inp.left = inp.right = false;
    inp.fire = false;
    inp.fireReleased = false;
    inp.throwHeld = false;
    inp.throwReleased = false;
    inp.throwIt = false;
    inp.swap = false;
  });
  var claimForm = document.getElementById("claim");
  var claimName = document.getElementById("claimname");
  var claimGo = document.getElementById("claimgo");
  var standingsAt = 0;
  async function loadStandings(force) {
    if (!online) {
      game.standings = { offline: true };
      return;
    }
    const now = performance.now();
    if (!force && now - standingsAt < 2e4) return;
    standingsAt = now;
    const res = await fetchBoard(game.board.id, 8);
    game.standings = res && res.rows ? res : { offline: true };
  }
  function placeClaim() {
    const show = game.state === "won" && online && !game.claimed;
    game.claimOpen = show;
    claimForm.hidden = !show;
    if (show) claimForm.style.top = `${Math.round(renderer.H / 2 + 84)}px`;
  }
  async function sendRun(name) {
    claimGo.disabled = true;
    claimGo.textContent = "\u63D0\u4EA4\u4E2D";
    const run = game.runResult || { time: game.runT, score: game.score };
    const res = await submitRun(game.board.id, {
      time: run.time,
      score: run.score,
      kills: game.kills,
      floor: game.floor,
      seed: game.seed
    }, name);
    claimGo.disabled = false;
    claimGo.textContent = "\u63D0\u4EA4\u8BB0\u5F55";
    if (!res || res.error) {
      game.claimError = res && res.error || "\u6392\u884C\u699C\u6682\u65E0\u54CD\u5E94";
      return;
    }
    game.standings = res;
    if (res.placed === false) {
      game.claimError = `${name} \u5DF2\u6709\u66F4\u5FEB\u8BB0\u5F55`;
      return;
    }
    setPlayerName(name);
    game.claimError = null;
    game.claimed = true;
    game.claimRank = res.rank || null;
    placeClaim();
  }
  claimForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = claimName.value.trim();
    if (name.length < 2) {
      game.claimError = "\u81F3\u5C11\u4E24\u4E2A\u5B57\u7B26";
      return;
    }
    sendRun(name);
  });
  claimForm.addEventListener("pointerdown", (e) => e.stopPropagation());
  claimForm.addEventListener("mousedown", (e) => e.stopPropagation());
  function clampCodexScroll(v) {
    const s = game.ui.codexScroll;
    return Math.max(0, Math.min(s?.max || 0, v));
  }
  function scrollCodex(delta) {
    if (!game.codexOpen) return false;
    game.codexScroll = clampCodexScroll((game.codexScroll || 0) + delta);
    return true;
  }
  function dragCodexScroll(y) {
    const s = game.ui.codexScroll;
    if (!s || !s.max) return false;
    const track2 = Math.max(1, s.h - s.thumbH);
    const local2 = y - s.y - codexDrag.offset;
    game.codexScroll = clampCodexScroll(local2 / track2 * s.max);
    return true;
  }
  function startCodexScrollDrag(y) {
    const s = game.ui.codexScroll;
    if (!s || !s.max) return false;
    const onThumb = y >= s.thumbY && y <= s.thumbY + s.thumbH;
    codexDrag = { offset: onThumb ? y - s.thumbY : s.thumbH / 2 };
    if (!onThumb) dragCodexScroll(y);
    return true;
  }
  function hitTab(x, y) {
    if (game.codexOpen) {
      const c = game.ui.codexClose;
      const p = game.ui.codexPanel;
      const s = game.ui.codexScroll;
      const inClose = c && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
      const inPanel = p && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
      const inScroll = s && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
      if (inScroll) {
        startCodexScrollDrag(y);
        return true;
      }
      if (inClose || !inPanel) game.toggleCodex();
      return true;
    }
    if (game.paused) {
      for (const p of game.ui.pauseOptions || []) {
        if (x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) continue;
        if (p.id === "resume") game.togglePause();
        if (p.id === "menu" && game.returnToMenu) {
          game.returnToMenu();
          loadStandings(true);
        }
        return true;
      }
      return false;
    }
    if (game.state === "play" && game.mode === "defense") {
      const d = game.defense || {};
      const toggle = game.ui.defenseShopButton;
      if (toggle && x >= toggle.x && x <= toggle.x + toggle.w && y >= toggle.y && y <= toggle.y + toggle.h) {
        game.toggleDefenseShop?.();
        return true;
      }
      const rest = game.ui.defenseRestButton;
      if (d.between && rest && x >= rest.x && x <= rest.x + rest.w && y >= rest.y && y <= rest.y + rest.h) {
        game.endDefenseRest?.();
        return true;
      }
      if (d.between && d.shopOpen) {
        for (const item of game.ui.defenseShopOptions || []) {
          if (x < item.x || x > item.x + item.w || y < item.y || y > item.y + item.h) continue;
          game.buyDefense?.(item.slot);
          return true;
        }
      }
      const panel = game.ui.defenseShopPanel;
      if (panel && x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h) return true;
    }
    if (game.state !== "title") return false;
    for (const t of game.ui.tabs || []) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        if (game.selectMode(t.id) && t.id === "endless") loadStandings(true);
        return true;
      }
    }
    for (const o of game.ui.options || []) {
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
        if (o.id === "refill") game.toggleRefill();
        if (o.id === "codex") game.toggleCodex();
        if (o.id === "practiceMap") game.cyclePracticeMap();
        if (o.id === "practiceWeapon") game.cyclePracticeWeapon();
        if (o.id === "practiceEnemy") game.cyclePracticeEnemy();
        if (o.id === "seed") {
          const current = game.customSeed || game.seedBase || "";
          const value = window.prompt("\u8F93\u5165\u81EA\u5B9A\u4E49\u79CD\u5B50\uFF1B\u7559\u7A7A\u6062\u590D\u4E3A\u5F53\u5929\u65E5\u671F", current);
          if (value !== null) {
            game.setSeedBase(value);
            loadStandings(true);
          }
        }
        return true;
      }
    }
    return false;
  }
  var wasState = null;
  function watchState() {
    if (game.state === wasState) return;
    const entered = game.state;
    wasState = entered;
    if (entered === "won") {
      game.claimed = false;
      game.claimError = null;
      claimName.value = playerName();
    } else if (entered === "title") {
      loadStandings(true);
    }
    placeClaim();
  }
  loadStandings(true);
  var FIXED = 1 / 120;
  var MAX_STEPS = 6;
  var acc = 0;
  var last = performance.now();
  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1e3) * REC.speed;
    last = now;
    if (!game.paused) {
      touch.apply(rdt);
      acc = Math.min(acc + rdt, FIXED * MAX_STEPS);
      while (acc >= FIXED) {
        game.step(FIXED);
        acc -= FIXED;
      }
    } else {
      acc = 0;
    }
    watchState();
    if (game.state === "title") loadStandings(false);
    renderer.draw(game);
    const g = renderer.ctx;
    if (game.state === "title") {
      drawFurniture(g, renderer.W, renderer.H);
      drawTitle(g, game, renderer.W, renderer.H);
    } else if (game.state === "won") {
      drawFurniture(g, renderer.W, renderer.H);
      drawWin(g, game, renderer.W, renderer.H);
    } else {
      drawHud(g, game, renderer.W, renderer.H);
      drawLegend(g, game, renderer.W, renderer.H);
      touch.draw(g);
      if (game.paused) drawPause(g, game, renderer.W, renderer.H);
    }
    if (game.codexOpen) drawCodexPopup(g, game, renderer.W, renderer.H);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__game = game;
  window.__renderer = renderer;
  Promise.resolve().then(() => (init_entities(), entities_exports)).then((m) => {
    window.__W = m.WEAPONS;
    window.__SB = m.shieldBlocks;
    window.__SS = m.shieldSegmentAt;
    window.__AA = m.armourArc;
    window.__AL = m.armourLayout;
    window.__CD = m.columnDepth;
  });
})();
