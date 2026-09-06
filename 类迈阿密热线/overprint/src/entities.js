import { TAU, clamp, angDelta, approach, dist, rnd } from './util.js';
import { TILE, hasLineOfSight } from './level.js';

export const MAX_ENEMIES = 40;
export const MAX_CORPSES = 24;
export const MAX_BULLETS = 240;
export const MAX_PICKUPS = 76;
export const MAX_THROWN = 28;
export const MAX_DEPLOYS = 12;
export const MAX_DRONES = 24;

export const MAX_DASH = 2;    // charges; a kill hands one straight back
export const DASH_CD = 1.05;  // seconds to earn one back on your own

export const S_IDLE = 0, S_SEARCH = 1, S_CHASE = 2, S_DOWN = 3, S_DEAD = 4;

// Each weapon is printed in its own process ink — single plates and the real
// two-plate overprints between them. The colour is on the WEAPON, so the same
// gun looks the same lying on the floor as it does in someone's hand.
//   C #12A3DA · Y #F7CF16 · M #EC0A63 · C+Y green · M+Y red · C+M deep blue
export const WEAPONS = {
  fists:    { name: '赤手',      feed: 'none',   tint: null,      melee: true,  reach: 36, rate: 0.28, ammo: 0, lethal: false, noise: 0,  throwLethal: false },
  knife:    { name: '小刀',      feed: 'none',   tint: '#12A3DA', melee: true,  reach: 40, rate: 0.17, ammo: 0, lethal: true,  noise: 40, throwLethal: true },
  bat:      { name: '球棒',      feed: 'none',   tint: '#F7CF16', melee: true,  reach: 54, rate: 0.34, ammo: 0, lethal: true,  noise: 60, throwLethal: false },
  katana:   { name: '武士刀',    feed: 'none',   tint: '#8A2BE2', melee: true,  reach: 58, rate: 0.42, ammo: 0, lethal: true,  noise: 68, throwLethal: false, katana: true, chargeMax: 1.15, dashDur: 0.24, dashReset: 0.24, dashSpeed: 1120, slashRadius: 23, blinkRange: 660, blinkRadius: 20 },
  quixote:  { name: '堂吉柯德',  feed: 'none',   tint: '#E40808', melee: true,  reach: 64, rate: 0.46, ammo: 0, lethal: true,  noise: 82, throwLethal: false, lance: true, chargeMax: 1.15, dashDur: 0.32, dashReset: 0.28, dashSpeed: 1060, slashRadius: 25, chargeExtend: 0.42, dashCap: 1.35 },
  pistol:   { name: '手枪',      feed: 'stack',  tint: '#00A651', melee: false, rate: 0.22, ammo: 7,  pellets: 1, spread: 0.025, speed: 1150, noise: 360, kick: 4,  shieldDmg: 1, eSpeed: 640, eRate: 1.05, eBurst: 2 },
  revolver: { name: '左轮',      feed: 'drum',   tint: '#E40808', melee: false, rate: 0.42, ammo: 6,  pellets: 1, spread: 0.012, speed: 1320, noise: 470, kick: 9, pierce: 3, shieldDmg: 2, armourPierce: 1, throughDoors: true, eSpeed: 760, eRate: 1.5, eBurst: 1 },
  smg:      { name: '冲锋枪',    feed: 'stagger', tint: '#4A44A0', melee: false, rate: 0.072, ammo: 28, pellets: 1, spread: 0.085, speed: 1080, noise: 320, kick: 2.4, shieldDmg: 1, eSpeed: 610, eRate: 0.85, eBurst: 4 },
  shotgun:  { name: '霰弹枪',    feed: 'barrel', tint: '#EC0A63', melee: false, rate: 0.78, ammo: 2,  pellets: 8, spread: 0.3,   speed: 980,  noise: 520, kick: 11, shieldDmg: 1, eSpeed: 520, eRate: 1.7, eBurst: 1 },
  ripper:   { name: '撕裂者',    feed: 'stagger', tint: '#00A651', melee: false, rate: 0.078, ammo: 30, pellets: 1, spread: 0.075, speed: 1220, noise: 430, kick: 3.4, pierce: 2, shieldDmg: 1, throughWalls: true, eSpeed: 680, eRate: 1.0, eBurst: 5 },
  grenade:  { name: '手雷',      feed: 'stack',  tint: '#12A3DA', melee: false, rate: 0.42, ammo: 3,  lobbed: true, fuse: 1.25, throwSpeed: 620, radius: 108, noise: 620, shieldDmg: 4, blastKill: 0.82, kick: 0, throwLethal: true },
  frag:     { name: '破片手雷',  feed: 'stack',  tint: '#F7CF16', melee: false, rate: 0.42, ammo: 3,  lobbed: true, fuse: 1.1,  throwSpeed: 660, radius: 82,  noise: 700, shieldDmg: 2, blastKill: 0.62, shrapnel: 18, shrapnelSpeed: 900, kick: 0, throwLethal: true },
  flash:    { name: '闪光弹',    feed: 'stack',  tint: '#F7CF16', melee: false, rate: 0.46, ammo: 3,  lobbed: true, fuse: 0.82, throwSpeed: 690, radius: 168, noise: 520, flashbang: true, stun: 5.8, disarmChance: 0.34, panicChance: 0.18, shieldDmg: 1, kick: 0, throwLethal: false },
  sentryPack:{ name: '哨戒机枪部署包', feed: 'stack', tint: '#00A651', melee: false, rate: 0.48, ammo: 3, lobbed: true, fuse: 0.58, throwSpeed: 720, deploy: 'sentry', deployRadius: 46, noise: 180, kick: 0, throwLethal: false },
  dronePack:{ name: '毒蜂无人机部署包', feed: 'stack', tint: '#F7CF16', melee: false, rate: 0.5, ammo: 3, lobbed: true, fuse: 0.58, throwSpeed: 720, deploy: 'drones', deployRadius: 64, droneCount: 3, droneAmmo: 3, noise: 170, kick: 0, throwLethal: false },
  rocket:   { name: '火箭弹',    feed: 'barrel', tint: '#EC0A63', melee: false, rate: 0.9,  ammo: 3,  pellets: 1, spread: 0.012, speed: 560, noise: 760, kick: 14, projectile: 'rocket', radius: 132, shieldDmg: 5, armourPierce: 2, throughDoors: true, eSpeed: 420, eRate: 2.2, eBurst: 1, throwLethal: false },
  molotov:  { name: '燃烧瓶',    feed: 'stack',  tint: '#FF6A00', melee: false, rate: 0.48, ammo: 3,  lobbed: true, fuse: 0.62, throwSpeed: 560, fire: true, fireRadius: 106, fireDur: 5.4, fireKill: 0.34, noise: 380, kick: 0, throwLethal: false },
  dart:     { name: '疯狂毒镖',  feed: 'stack',  tint: '#7AC943', melee: false, rate: 0.26, ammo: 8,  pellets: 1, spread: 0.006, speed: 1120, noise: 0, kick: 0, poison: true, mad: 7.2, silent: true, shieldDmg: 0, eSpeed: 690, eRate: 1.0, eBurst: 1 },
  tameDart: { name: '驯服毒标',  feed: 'stack',  tint: '#8A2BE2', melee: false, rate: 0.3,  ammo: 6,  pellets: 1, spread: 0.006, speed: 1100, noise: 0, kick: 0, tame: true, silent: true, shieldDmg: 0, eSpeed: 680, eRate: 1.05, eBurst: 1 },
  disguise: { name: '暗杀 · D',  feed: 'stack',  tint: '#161513', melee: false, rate: 0.23, ammo: 9,  pellets: 1, spread: 0.018, speed: 1160, noise: 240, kick: 3.2, disguise: true, shieldDmg: 1, eSpeed: 640, eRate: 1.05, eBurst: 2 },
  sniper:   { name: '狙击枪',    feed: 'stack',  tint: '#0047AB', melee: false, rate: 0.82, ammo: 5,  pellets: 1, spread: 0.0006, speed: 7600, noise: 760, kick: 17, rail: true, pierce: 999, shieldDmg: 99, armourPierce: 99, throughDoors: true, life: 1.25, eSpeed: 3200, eRate: 2.4, eBurst: 1 },
  laser:    { name: '弹弹激光枪', feed: 'stack', tint: '#00D6FF', melee: false, rate: 0.15, ammo: 18, pellets: 1, spread: 0.01, speed: 1320, noise: 300, kick: 2, ricochet: true, bounces: 6, shieldDmg: 1, life: 2.7, eSpeed: 900, eRate: 1.05, eBurst: 2 },
  butcher:  { name: '屠夫之触',  feed: 'none',   tint: '#E40808', melee: true,  reach: 52, rate: 0.2, ammo: 0, lethal: true, noise: 88, throwLethal: true, sawLauncher: true, sawRate: 2.25 },
  sawblade: { name: '电锯片',    feed: 'none',   tint: '#161513', melee: false, rate: 0, ammo: 0, throwSpeed: 980, noise: 150, kick: 0, throwLethal: true, blade: true, life: 14, noPickup: true },
  shield:   { name: '盾牌',      feed: 'none',   tint: '#12A3DA', melee: false, rate: 0, ammo: 0, noise: 0, kick: 0, defense: true, shieldArc: 1.34, durability: 5, noThrow: true, throwLethal: false },
};

export const ENEMY_DEF = {
  strawman:{ speed: 0,   patrol: 0,  cone: 0,    range: 0,   r: 11,  turn: 0,  keep: 0, passive: true, handless: true },
  thug:   { speed: 158, patrol: 44, cone: 1.25, range: 340, r: 11,  turn: 7,  keep: 0 },
  gunner: { speed: 124, patrol: 36, cone: 1.05, range: 450, r: 11,  turn: 6,  keep: 230 },
  hound:  { speed: 250, patrol: 62, cone: 1.6,  range: 310, r: 9.5, turn: 12, keep: 0, handless: true },
  patroller:{ speed: 150, patrol: 72, cone: 1.45, range: 620, r: 11,  turn: 7.5, keep: 0, patrolAll: true },
  // the heavy body. armour is a separate property — see ARMOUR below.
  shield: { speed: 104, patrol: 30, cone: 1.15, range: 380, r: 14,  turn: 3.6, keep: 0 },
};

// ---------------------------------------------------------------------------
// ARMOUR
// Plates are arranged in concentric LAYERS, each layer cut into angular
// segments. A hit takes the outermost surviving plate in the column it lands
// in; punch through every layer of one column and that column is a hole you can
// shoot through. Total plate count is the difficulty dial — 1 plate is light
// armour on an ordinary body, one full layer is a shieldman, three layers deep
// is boss class. Width tops out at SEGS_MAX; everything past that adds depth,
// so a boss is thick rather than un-flankable.
export const SEG_SPAN = 0.42;   // radians of arc per segment
export const SEGS_MAX = 5;      // widest a single layer gets

// Segment counts are always ODD. With an even count the arc's centre line falls
// exactly on the seam between two plates, so shots aimed at centre mass
// alternate between neighbouring columns and never drill through anything.
export function armourLayout(total) {
  const segs = total <= 1 ? 1 : total <= 3 ? 3 : SEGS_MAX;
  return { segs, layers: Math.ceil(total / segs) };
}

export function armourArc(e) {
  if (!e.armour || !e.segs) return 0;
  return Math.min(Math.PI, (e.segs * SEG_SPAN) / 2);
}

// which angular column a hit from this direction lands in, or -1 for a miss
export function shieldSegmentAt(e, fromX, fromY) {
  if (!e.armour || !e.segs) return -1;
  const arc = armourArc(e);
  const rel = angDelta(e.angle, Math.atan2(fromY - e.y, fromX - e.x));
  if (Math.abs(rel) >= arc) return -1;
  const span = (arc * 2) / e.segs;
  const i = Math.floor((rel + arc) / span);
  return i < 0 ? 0 : i >= e.segs ? e.segs - 1 : i;
}

export const plateBit = (e, layer, seg) => 1 << (layer * e.segs + seg);

// how many plates are stacked in this column — the depth a round has to beat
export function columnDepth(e, seg) {
  let n = 0;
  for (let L = 0; L < e.layers; L++) if (e.shieldSeg & plateBit(e, L, seg)) n++;
  return n;
}

// the outermost plate still standing in a column, or -1 if it is a hole
export function outermostPlate(e, seg) {
  for (let L = e.layers - 1; L >= 0; L--) {
    if (e.shieldSeg & plateBit(e, L, seg)) return L;
  }
  return -1;
}

export function makePools() {
  const mk = (n, f) => Array.from({ length: n }, f);
  return {
    enemies: mk(MAX_ENEMIES, () => ({
      alive: false, type: 'thug', weapon: 'fists', x: 0, y: 0, vx: 0, vy: 0, angle: 0,
      state: S_IDLE, timer: 0, downTimer: 0, fireTimer: 0, burst: 0, ammo: 0,
      lkx: 0, lky: 0, ptx: 0, pty: 0, searchT: 0, shoutCd: 0,
      strafe: 1, strafeT: 0, windup: 0, chargeT: 0, seen: 0,
      stuckT: 0, lastX: 0, lastY: 0, scanT: 0, reload: 0, madT: 0, burnT: 0,
      seeking: 0, skx: 0, sky: 0, blockFlash: 0, stagger: 0, look: 0, heldShieldHp: 0,
      armour: 0, segs: 0, layers: 0, shieldHp: 0, shieldSeg: 0,
      roomGoal: -1, roomSeq: 0,
      friendly: false, converted: false,
    })),
    corpses: mk(MAX_CORPSES, () => ({
      alive: false, type: 'thug', weapon: 'fists', x: 0, y: 0, vx: 0, vy: 0, angle: 0,
      state: S_DEAD, deadAngle: 0, t: 0, armour: 0, segs: 0, layers: 0, shieldHp: 0,
      shieldSeg: 0, friendly: false,
    })),
    bullets: mk(MAX_BULLETS, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, friendly: false, pierce: 0, near: 0, weapon: null, projectile: null, explosive: false, ricochet: false, bounces: 0, throughWalls: false })),
    pickups: mk(MAX_PICKUPS, () => ({ alive: false, x: 0, y: 0, kind: 'pistol', ammo: 0, angle: 0 })),
    thrown: mk(MAX_THROWN, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'pistol', ammo: 0, spin: 0, life: 0, maxLife: 0, targetX: NaN, targetY: NaN, friendly: true, charge: 0, power: 1, effectScale: 1, noPickup: false })),
    deploys: mk(MAX_DEPLOYS, () => ({ alive: false, kind: 'sentry', x: 0, y: 0, angle: 0, ammo: 0, fireTimer: 0, reload: 0, life: 0, friendly: true, spin: 0, target: null })),
    drones: mk(MAX_DRONES, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, angle: 0, ammo: 0, fireTimer: 0, life: 0, friendly: true, target: null, navX: 0, navY: 0, navT: 0, spin: 0, kamikaze: false, blastT: 0 })),
  };
}

export function spawnFrom(pool) {
  for (let i = 0; i < pool.length; i++) if (!pool[i].alive) return pool[i];
  return null;
}

export function moveCollide(level, e, dx, dy, r) {
  let hitX = false, hitY = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    const nx = e.x + sx;
    if (!level.solidAt(nx + Math.sign(sx) * r, e.y - r * 0.7) &&
        !level.solidAt(nx + Math.sign(sx) * r, e.y + r * 0.7)) e.x = nx;
    else hitX = true;
    const ny = e.y + sy;
    if (!level.solidAt(e.x - r * 0.7, ny + Math.sign(sy) * r) &&
        !level.solidAt(e.x + r * 0.7, ny + Math.sign(sy) * r)) e.y = ny;
    else hitY = true;
  }
  return { hitX, hitY };
}

// A shield is four separate plates across the arc it faces, and each one is
// knocked off where it was hit. A gap you have opened is a gap you can shoot
// through — so the segments you can see missing are genuinely missing.
export function shieldBlocks(e, fromX, fromY) {
  if (!e.armour || !e.shieldSeg) return false;
  if (e.state === S_DOWN || e.state === S_DEAD) return false;
  const i = shieldSegmentAt(e, fromX, fromY);
  if (i < 0) return false;
  return outermostPlate(e, i) >= 0;
}

export function shieldCount(seg) {
  let n = 0;
  while (seg) { n += seg & 1; seg >>= 1; }
  return n;
}

function canSee(level, e, def, tx, ty) {
  const d = dist(e.x, e.y, tx, ty);
  if (d > def.range) return false;
  const a = Math.atan2(ty - e.y, tx - e.x);
  if (Math.abs(angDelta(e.angle, a)) > def.cone) return d < 46;
  return hasLineOfSight(level, e.x, e.y, tx, ty);
}

export function alertEnemy(e, x, y, search = 7) {
  if (e.state === S_DOWN || e.state === S_DEAD) return;
  e.state = Math.max(e.state, S_SEARCH);
  e.lkx = x; e.lky = y;
  e.searchT = Math.max(e.searchT, search);
  e.timer = 0;
}

// ---------------------------------------------------------------------------
export function updateEnemy(game, e, dt) {
  const def = ENEMY_DEF[e.type];
  const level = game.level;
  const w = WEAPONS[e.weapon] || WEAPONS.fists;

  if (e.state === S_DEAD) return;
  if (e.blockFlash > 0) e.blockFlash -= dt;
  if (e.stagger > 0) e.stagger -= dt;
  if (def.passive) {
    e.vx = 0; e.vy = 0;
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
      // they wake up knowing where the noise was, not where you are now
      e.lkx = game.alarmX; e.lky = game.alarmY;
      e.searchT = 8;
      // they got up empty-handed. first thing they want is something to hit with.
      if (e.weapon === 'fists' && !def.handless) game.seekWeapon(e);
    }
    return;
  }

  e.shoutCd -= dt;
  e.scanT -= dt;

  let target = null, bestD = Infinity;
  const targets = mad && game.frenzyTargets
    ? game.frenzyTargets(e)
    : game.enemyTargets
      ? game.enemyTargets(e)
      : game.targets;
  for (const t of targets) {
    if (!t.alive) continue;
    const d = dist(e.x, e.y, t.x, t.y);
    if (d < bestD && canSee(level, e, def, t.x, t.y)) { bestD = d; target = t; }
  }

  if (target) {
    e.seen += dt;
    if (e.state !== S_CHASE && e.seen > (w.melee ? 0.09 : 0.16)) {
      e.state = S_CHASE;
      if (!mad && !e.friendly) {
        game.onSpotted(e);
        if (e.shoutCd <= 0) { e.shoutCd = 3.4; game.shout(e, target.x, target.y); }
      }
    }
    e.lkx = target.x; e.lky = target.y;
    e.searchT = 7;
  } else {
    e.seen = Math.max(0, e.seen - dt * 2);
    if (e.state === S_CHASE && e.searchT < 5.4) e.state = S_SEARCH;
  }

  if (!e.friendly && e.state === S_IDLE && e.scanT <= 0) {
    e.scanT = 0.35;
    for (const o of game.pools.corpses || []) {
      if (!o.alive) continue;
      if (!!o.friendly !== !!e.friendly) continue;
      if (dist(e.x, e.y, o.x, o.y) > 230) continue;
      if (!canSee(level, e, def, o.x, o.y)) continue;
      alertEnemy(e, o.x, o.y, 8);
      game.onSpotted(e);
      if (e.shoutCd <= 0) { e.shoutCd = 3.4; game.shout(e, o.x, o.y); }
      break;
    }
  }

  e.searchT -= dt;

  let tx = e.x, ty = e.y, speed = 0;
  let strafeX = 0, strafeY = 0;

  // ---- fetching a weapon overrides everything short of dying ---------------
  if (e.seeking > 0) {
    e.seeking -= dt;
    const got = game.tryTakePickup(e);
    if (got || e.seeking <= 0) e.seeking = 0;
    else {
      tx = e.skx; ty = e.sky;
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
            e.ptx = px; e.pty = py; got = true;
          }
        }
        if (!got) {
          // a patrol point you cannot reach is why they end up nose-first
          // against a wall: keep drawing until one is open and walkable.
          for (let i = 0; i < 10 && !got; i++) {
            const a = rnd() * TAU, r = 70 + rnd() * 150;
            const px = clamp(e.x + Math.cos(a) * r, TILE, level.w - TILE);
            const py = clamp(e.y + Math.sin(a) * r, TILE, level.h - TILE);
            if (level.solidAt(px, py)) continue;
            if (!game.walkClear(e.x, e.y, px, py, def.r)) continue;
            e.ptx = px; e.pty = py; got = true;
          }
        }
        if (!got) { e.ptx = e.x; e.pty = e.y; }
        e.timer = def.patrolAll ? 5 + rnd() * 2.5 : 2 + rnd() * 2.5;
        e.look = (rnd() - 0.5) * 1.6;
      }
      e.timer -= dt;
      tx = e.ptx; ty = e.pty; speed = def.patrol;
      if (dist(e.x, e.y, e.ptx, e.pty) < 26) speed = 0;
    } else {
      speed = def.speed;
      if (target) { tx = target.x; ty = target.y; }
      else {
        // the flow field runs to the alarm point — the last place anyone actually
        // saw or heard you — so losing them means losing them.
        tx = e.lkx; ty = e.lky;
        if (dist(e.x, e.y, e.lkx, e.lky) < 34) {
          if (e.searchT > 0) {
            const a = rnd() * TAU, r = 60 + rnd() * 120;
            e.lkx = clamp(e.lkx + Math.cos(a) * r, TILE, level.w - TILE);
            e.lky = clamp(e.lky + Math.sin(a) * r, TILE, level.h - TILE);
          } else { e.state = S_IDLE; e.timer = 0; }
        }
        speed = def.speed * 0.8;
      }
      if (e.searchT <= 0 && !target) { e.state = S_IDLE; e.timer = 0; }
    }

    // ---- armed behaviour --------------------------------------------------
    if (e.state === S_CHASE && !w.melee && !w.lobbed && !w.defense) {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = 0.7 + rnd() * 0.9; e.strafe = -e.strafe; }
      if (target) {
        const a = Math.atan2(target.y - e.y, target.x - e.x);
        strafeX = Math.cos(a + Math.PI / 2) * e.strafe;
        strafeY = Math.sin(a + Math.PI / 2) * e.strafe;
        const keep = def.keep || 200;
        if (bestD < keep * 0.85) { tx = e.x - (target.x - e.x); ty = e.y - (target.y - e.y); speed = def.speed; }
        else if (bestD < keep * 1.7) speed = def.speed * 0.2;
      }

      e.reload -= dt;
      e.fireTimer -= dt;
      if (target && bestD < def.range && e.fireTimer <= 0 && e.reload <= 0 && e.ammo > 0) {
        if (e.burst <= 0) { e.burst = w.eBurst; e.fireTimer = 0.18; }
        else {
          const flight = bestD / w.eSpeed;
          const ax = target.x + target.vx * flight * 0.85;
          const ay = target.y + target.vy * flight * 0.85;
          // they mostly avoid shooting through their own people. mostly.
          if (!mad && game.friendlyInLine(e, ax, ay) && rnd() < 0.86) {
            e.fireTimer = 0.25;
            e.strafeT = 0;
          } else {
            game.fireEnemyBullet(e, ax, ay);
            e.burst--;
            e.ammo--;
            if (e.burst > 0 && e.ammo > 0) e.fireTimer = w.cls === 'rapid' ? 0.1 : 0.14;
            else { e.fireTimer = 0.5; e.reload = w.eRate + rnd() * 0.4; e.burst = 0; }
          }
        }
      }
      if (e.ammo <= 0 && !e.seeking) {
        // dry. drop it and go find something else.
        game.dropWeapon(e, true);
        game.seekWeapon(e);
      }
    }

    if (e.state === S_CHASE && e.type === 'hound') {
      e.chargeT -= dt;
      if (e.chargeT <= 0) { e.chargeT = 1.15; e.windup = 0.32; }
      if (e.windup > 0) { e.windup -= dt; speed = def.speed * 0.1; }
      else speed = def.speed * (e.chargeT > 0.35 ? 1.5 : 0.4);
    }

    if (e.state === S_CHASE && e.type === 'thug' && bestD > 120 && bestD < 320) {
      const a = Math.atan2(ty - e.y, tx - e.x);
      const side = ((e.lastX * 7919 + e.lastY * 104729) | 0) % 2 ? 1 : -1;
      strafeX = Math.cos(a + Math.PI / 2) * side * 0.55;
      strafeY = Math.sin(a + Math.PI / 2) * side * 0.55;
    }
  }

  const hunting = e.state !== S_IDLE;
  const nav = def.patrolAll && game.pathDirToPoint
    ? game.pathDirToPoint(e, tx, ty, def.r)
    : game.pathDir(e, tx, ty, def.r, hunting);
  const ang = Math.atan2(nav.y, nav.x);
  // standing still on patrol? sweep the head instead of staring at the wall
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

  // slide off wall faces instead of pressing into them
  const probe = def.r + 9;
  if (level.solidAt(e.x + Math.sign(ax) * probe, e.y)) ax *= 0.15;
  if (level.solidAt(e.x, e.y + Math.sign(ay) * probe)) ay *= 0.15;

  e.vx = approach(e.vx, ax, 14, dt);
  e.vy = approach(e.vy, ay, 14, dt);

  for (const o of game.pools.enemies) {
    if (o === e || !o.alive || o.state === S_DEAD) continue;
    const dx = o.x - e.x, dy = o.y - e.y;
    const dd = dx * dx + dy * dy;
    if (dd > 1 && dd < 26 * 26) {
      const l = Math.sqrt(dd);
      e.vx -= (dx / l) * 80; e.vy -= (dy / l) * 80;
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
        const step = game.flowStep(e.x, e.y);
        if (step) {
          // nudge along the field rather than teleporting the goal somewhere odd
          e.vx += step.x * 190;
          e.vy += step.y * 190;
        } else {
          e.lkx = e.x + (rnd() - 0.5) * 200;
          e.lky = e.y + (rnd() - 0.5) * 200;
        }
      }
    } else e.stuckT = 0;
  }
  e.lastX = e.x; e.lastY = e.y;

  const p = game.player;
  const victim = target && target.enemy && target.enemy.alive && target.enemy.state !== S_DEAD
    ? target.enemy
    : null;
  if (victim && e.state === S_CHASE && w.melee) {
    const vd = ENEMY_DEF[victim.type];
    if (dist(e.x, e.y, victim.x, victim.y) < def.r + vd.r + 7) {
      const a = Math.atan2(victim.y - e.y, victim.x - e.x);
      if (game.heldShieldBlocks?.(victim, e.x, e.y)) {
        game.blockOnHeldShield?.(victim, e.x, e.y);
        e.fireTimer = 0.28;
      } else if (shieldBlocks(victim, e.x, e.y)) {
        game.damageShield(victim, 1, false, e.x, e.y);
        e.fireTimer = 0.28;
      } else if (w.lethal || e.type === 'hound' || victim.state === S_DOWN) {
        game.killEnemy(victim, 1, Math.cos(a), Math.sin(a), true);
      } else {
        game.knockdownEnemy(victim, Math.cos(a), Math.sin(a));
      }
    }
  } else if (!e.friendly && !game.playerDisguised?.() && p.alive && e.state === S_CHASE && w.melee) {
    if (dist(e.x, e.y, p.x, p.y) < def.r + 11) {
      if (game.heldShieldBlocks?.(p, e.x, e.y)) {
        game.blockOnHeldShield?.(p, e.x, e.y);
        e.stagger = Math.max(e.stagger || 0, 0.25);
        e.vx *= -0.25; e.vy *= -0.25;
      } else game.killPlayer(e);
    }
  } else if (!e.friendly && !game.playerDisguised?.() && p.alive && e.state === S_CHASE && !mad && !w.defense && dist(e.x, e.y, p.x, p.y) < 20) {
    if (game.heldShieldBlocks?.(p, e.x, e.y)) {
      game.blockOnHeldShield?.(p, e.x, e.y);
      e.stagger = Math.max(e.stagger || 0, 0.25);
    } else game.killPlayer(e);
  }
}
