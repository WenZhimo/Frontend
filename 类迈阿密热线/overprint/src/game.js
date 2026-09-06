import { TAU, clamp, lerp, approach, dist, angDelta, springTo, reseedSim, rnd } from './util.js';
import { REC } from './dev.js';
import { BOARDS, currentBoard, loadBest, saveBest, previewRunSeed, nextRunSeed, setSeedBase, customSeedBase } from './board.js';
import { makeLevel, makePracticeLevel, makeDefenseLevel, TILE, hasLineOfSight } from './level.js';
import {
  makePools, spawnFrom, moveCollide, updateEnemy, alertEnemy,
  shieldBlocks, shieldSegmentAt, shieldCount, armourArc, armourLayout,
  outermostPlate, plateBit, columnDepth,
  WEAPONS, ENEMY_DEF, MAX_ENEMIES, MAX_BULLETS, MAX_PICKUPS, MAX_THROWN,
  S_IDLE, S_SEARCH, S_CHASE, S_DOWN, S_DEAD, MAX_DASH, DASH_CD,
} from './entities.js';
import { initAudio, sfx, setTimeScale } from './audio.js';
import { YELLOW } from './brand.js';
import { ZOOM } from './render.js';

const WEAPON_KEYS = ['fists', 'knife', 'bat', 'katana', 'quixote', 'pistol', 'revolver', 'smg', 'shotgun', 'ripper', 'grenade', 'frag', 'flash', 'sentryPack', 'dronePack', 'rocket', 'molotov', 'dart', 'tameDart', 'virus', 'copySauce', 'madExtract', 'tameExtract', 'virusExtract', 'disguise', 'sniper', 'laser', 'butcher', 'shield'];
const CODEX_WEAPON_KEYS = WEAPON_KEYS.filter((k) => k !== 'fists');
const ENEMY_KEYS = ['strawman', 'thug', 'gunner', 'hound', 'patroller', 'shield'];
const PRACTICE_MAPS = [
  { id: 'arena', label: '训练室' },
  { id: 'cover', label: '掩体房' },
  { id: 'lanes', label: '长廊' },
];
const PRACTICE_ENEMIES = ['strawman', 'thug', 'gunner', 'hound', 'patroller', 'shield'];
const PRACTICE_WEAPONS = ['pistol', 'smg', 'ripper', 'shotgun', 'grenade', 'frag', 'flash', 'sentryPack', 'dronePack', 'rocket', 'molotov', 'dart', 'tameDart', 'virus', 'copySauce', 'madExtract', 'tameExtract', 'virusExtract', 'disguise', 'sniper', 'laser', 'butcher', 'shield', 'katana', 'quixote', 'knife', 'bat'];
const DEFENSE_SHOP_WEAPONS = ['pistol', 'shield', 'katana', 'quixote', 'smg', 'ripper', 'shotgun', 'grenade', 'frag', 'flash', 'sentryPack', 'dronePack', 'rocket', 'virus', 'copySauce', 'shield', 'molotov', 'dart', 'tameDart', 'sniper', 'laser', 'butcher', 'shield'];
const CODEX_KEY = 'overprint.codex';

// Slow motion is punctuation, not a stance. It fires on moments worth watching,
// and a lockout after each one keeps a busy fight from turning into a crawl.
const SLOW = {
  dash:     { dur: 0.17, scale: 0.34 },
  throw:    { dur: 0.34, scale: 0.20 },
  explosion:{ dur: 0.28, scale: 0.18 },
  nearMiss: { dur: 0.30, scale: 0.19 },
  slam:     { dur: 0.30, scale: 0.24 },
  execute:  { dur: 0.26, scale: 0.22 },
  katana:   { dur: 0.58, scale: 0.08, free: true },
  lastKill: { dur: 0.95, scale: 0.14, free: true },
};
const PLAYER_SLOW_FLOOR = 0.62; // you keep most of your speed inside a dilation
const SLOW_LOCKOUT = 0.34;      // gap after a dilation before another can start
const TOTAL_TARGET = 404;       // the error code IS the kill counter
const WIN_AT = 200;             // drive it down to 200 OK and the page is fixed
const THROW_CHARGE_MAX = 1.15;
const LOB_RANGE_MIN = 280;
const LOB_RANGE_MAX = 780;
const DEFENSE_REST_SECONDS = 120;

function loadoutFor(kind) {
  const w = WEAPONS[kind] || WEAPONS.fists;
  if (w.offhandOnly) {
    const paired = kind === 'virus' ? 'tameDart' : 'fists';
    return { weapon: paired, ammo: WEAPONS[paired]?.ammo || 0, offhand: kind, offAmmo: 0 };
  }
  return { weapon: kind || 'fists', ammo: w.melee ? 0 : (w.ammo || 0) };
}

function freshCodex() {
  return { weapons: [], enemies: [] };
}

function loadCodex() {
  try {
    const raw = JSON.parse(localStorage.getItem(CODEX_KEY) || 'null');
    if (!raw || !Array.isArray(raw.weapons) || !Array.isArray(raw.enemies)) return freshCodex();
    return {
      weapons: raw.weapons.filter((k) => CODEX_WEAPON_KEYS.includes(k)),
      enemies: raw.enemies.filter((k) => ENEMY_KEYS.includes(k)),
    };
  } catch {
    return freshCodex();
  }
}

function saveCodex(codex) {
  try { localStorage.setItem(CODEX_KEY, JSON.stringify(codex)); } catch { /* private mode */ }
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
    pendingBuy: null,
  };
}

// milestones on the way down. every one of these is a real HTTP status.
const STATUS = {
  403: '禁止访问', 402: '需要付款', 401: '未授权', 400: '请求错误',
  418: '我是茶壶', 410: '已消失', 408: '请求超时',
  308: '永久重定向', 307: '临时重定向', 304: '未修改',
  302: '已找到', 301: '永久移动', 300: '多重选择',
  226: '已使用', 208: '已报告', 206: '部分内容',
  204: '无内容', 202: '已接受', 201: '已创建', 200: '正常',
};

// The chip under the code names the last status the counter went past. It has
// to be derived from where the counter IS rather than remembered from when it
// moved, because dying hands kills back and walks the code up again — the label
// used to keep saying FORBIDDEN while the number climbed away from it.
const LADDER = Object.keys(STATUS).map(Number).filter((k) => k <= 404).sort((a, b) => a - b);
function statusFor(remaining) {
  for (const k of LADDER) if (k >= remaining) return STATUS[k];
  return '未找到';
}

export function createGame(renderer) {
  const game = {
    renderer,
    state: 'title',
    paused: false,
    mode: localStorage.getItem('overprint.mode') || 'endless',
    refillEnabled: localStorage.getItem('overprint.refill') === '1',
    time: 0,
    floor: 1,
    seed: 0, seedBase: '', customSeed: customSeedBase(), runNo: 0, board: currentBoard(), runT: 0, best: null,
    standings: null, claimed: false, claimError: null, claimRank: null, runResult: null,
    ticks: 0,
    score: 0,
    bestScore: Number(localStorage.getItem('overprint.best') || 0),
    bestFloor: Number(localStorage.getItem('overprint.floor') || 0),
    kills: 0, floorKills: 0,
    combo: 0, comboTimer: 0, bestCombo: 0,
    enemiesLeft: 0,
    remaining: TOTAL_TARGET,
    floorLoadout: null,
    playerStats: defaultPlayerStats(),
    practiceMaps: PRACTICE_MAPS,
    practiceWeapons: PRACTICE_WEAPONS,
    practiceEnemies: PRACTICE_ENEMIES,
    practice: { map: 0, weapon: 'pistol', enemy: 'strawman' },
    defense: newDefenseState(),
    codex: loadCodex(),
    codexOpen: false,
    codexScroll: 0,
    slowT: 0, slowScale: 1, slowCd: 0, nearMissCd: 0, deathT: 0, lastStatus: TOTAL_TARGET,
    alarmX: 0, alarmY: 0,
    won: false, infinite: true,
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
    shake: 0, hitstop: 0, plateSplit: 0, worldScale: 1, flash: 0,
    banner: null, bannerT: 0, floorStartTime: 0, dashFlash: 0,
    throwCharge: 0, throwPreview: null,
    // what the HUD shows, chasing what the game knows. Springs, so a value that
    // changes while the last change is still settling is followed, not snapped.
    ui: { gauge: 0, gaugeV: 0, chain: 0, chainV: 0, code: 404, codeV: 0,
          chainPunch: 0, chainOpen: 0, chainOpenV: 0, tabs: [], options: [],
          pauseOptions: [], codexClose: null, codexPanel: null, codexScroll: null,
          defenseShopButton: null, defenseShopOptions: [], defenseRestButton: null, defenseShopPanel: null },
    reducedMotion: typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches,
    tutorialT: 0, didMove: false, didAttack: false,
    input: {
      up: false, down: false, left: false, right: false,
      fire: false, dash: false,
      fireReleased: false, throwIt: false, throwHeld: false, throwReleased: false, swap: false, mx: 0, my: 0,
      buy: null,
      analog: false, axisX: 0, axisY: 0, hasAim: false, aimAngle: 0,
    },
    player: {
      x: 0, y: 0, vx: 0, vy: 0, aim: 0, alive: true,
      weapon: 'fists', ammo: 0, offhandWeapon: 'fists', offhandAmmo: 0,
      attackCd: 0, swing: 0, burnT: 0, infectT: 0, madT: 0, madDirT: 0, madDirA: 0,
      sawCd: 0, blockFlash: 0, swapCd: 0,
      hp: 1, maxHp: 1, iframes: 0,
      dashCharges: MAX_DASH, maxDash: MAX_DASH, dashCd: 0, dashCdMax: DASH_CD, dashT: 0, dashX: 0, dashY: 0,
      katanaT: 0, katanaMax: 0, katanaX: 0, katanaY: 0,
      trail: [],
    },
    // pathfinding
    flow: null, flowT: 0, flowGw: 0, flowGh: 0, flowQueue: null,
  };

  // -------------------------------------------------------------------------
  function particle(x, y, vx, vy, life, size, col, extra) {
    if (game.particles.length > 360) game.particles.shift();
    const p = { x, y, vx, vy, life, max: life, s: size, col, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 14 };
    if (extra) Object.assign(p, extra);
    game.particles.push(p);
  }

  // brass, thrown out of the side of the gun; it settles onto the sheet
  function ejectCasing(x, y, aim) {
    const side = aim + (Math.PI / 2 + (Math.random() - 0.5) * 1.1) * (Math.random() < 0.5 ? 1 : -1);
    const sp = 120 + Math.random() * 130;
    particle(x, y, Math.cos(side) * sp, Math.sin(side) * sp,
      0.42 + Math.random() * 0.22, 2.6, '#161513', { casing: true });
  }
  function burst(x, y, n, speed, col, size = 2.4, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.9);
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random()), size * (0.6 + Math.random()), col);
    }
  }
  function noise(x, y, r, col = '#12A3DA') {
    if (r <= 0) return;
    game.noiseRings.push({ x, y, r, t: 0, dur: 0.5, col });
    game.raiseAlarm(x, y);
    for (const e of game.pools.enemies) {
      if (!e.alive || e.state === S_DOWN || e.state === S_DEAD) continue;
      if (dist(e.x, e.y, x, y) < r) alertEnemy(e, x, y);
    }
  }
  // Dilations are free, but they cannot chain: once one ends there is a short
  // lockout before the next can start, so a busy fight never crawls.
  function triggerSlow(kind) {
    const s = SLOW[kind];
    if (!s) return false;
    if (!s.free && (game.slowT > 0 || game.slowCd > 0)) return false;
    const dur = s.dur * (game.playerStats?.slow || 1);
    game.slowT = Math.max(game.slowT, dur);
    game.slowScale = game.slowT > 0 ? Math.min(game.slowScale, s.scale) : s.scale;
    game.slowCd = dur + SLOW_LOCKOUT;
    sfx.focusIn();
    return true;
  }

  function shake(a) { game.shake = Math.min(26, game.shake + a); }
  function hitstop(t) { game.hitstop = Math.max(game.hitstop, t); }

  function throwStats(charge = 0) {
    const t = clamp(charge / THROW_CHARGE_MAX, 0, 1);
    return {
      charge: t,
      power: 1,
      effectScale: 1,
      range: LOB_RANGE_MIN + (LOB_RANGE_MAX - LOB_RANGE_MIN) * t,
    };
  }

  function pointerWorldPoint() {
    return {
      x: (game.input.mx - renderer.W / 2) / ZOOM + game.camera.x,
      y: (game.input.my - renderer.H / 2) / ZOOM + game.camera.y,
    };
  }

  function resolveLobTarget(actor, kind, charge = 0) {
    const st = throwStats(charge);
    const sx = actor.x + Math.cos(actor.aim) * 14;
    const sy = actor.y + Math.sin(actor.aim) * 14;
    let tx = actor.x + Math.cos(actor.aim) * st.range;
    let ty = actor.y + Math.sin(actor.aim) * st.range;
    if (actor === game.player && !game.input.hasAim) {
      const m = pointerWorldPoint();
      tx = m.x; ty = m.y;
    }
    const dx = tx - actor.x, dy = ty - actor.y;
    const d = Math.hypot(dx, dy);
    if (d > st.range) {
      tx = actor.x + (dx / d) * st.range;
      ty = actor.y + (dy / d) * st.range;
    }
    return {
      kind,
      startX: sx, startY: sy,
      x: tx, y: ty,
      originX: actor.x, originY: actor.y,
      charge: st.charge,
      power: 1,
      effectScale: 1,
      maxRange: st.range,
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

  const EFFECT_WEAPON = { mad: 'dart', tame: 'tameDart', virus: 'virus' };
  const EFFECT_EXTRACT = { mad: 'madExtract', tame: 'tameExtract', virus: 'virusExtract' };
  const EFFECT_TINT = { mad: '#7AC943', tame: '#8A2BE2', virus: '#7AC943' };

  function weaponStatusEffect(kind) {
    const w = WEAPONS[kind];
    return w && w.statusEffect ? w.statusEffect : null;
  }

  function enemyCanUseWeapon(kind) {
    const w = WEAPONS[kind];
    return !!(w && kind !== 'fists' && w.enemyUsable !== false
      && !w.lobbed && !w.offhandOnly && !w.passive && !w.extract && !w.copySauce);
  }

  function extractKeyForEffect(effect) {
    return EFFECT_EXTRACT[effect] || null;
  }

  function effectWeaponKey(effect) {
    return EFFECT_WEAPON[effect] || null;
  }

  function activeAttackEffect(actor, weaponKey, surface = 'direct') {
    const base = weaponStatusEffect(weaponKey);
    if (actor === game.player) {
      const off = WEAPONS[game.player.offhandWeapon];
      if (off?.extract && off.extractEffect) return off.extractEffect;
      const side = weaponStatusEffect(game.player.offhandWeapon);
      if (surface === 'shrapnel' && weaponKey === 'frag' && (side === 'mad' || side === 'tame')) return side;
    }
    return base;
  }

  function applyAttackEffectToEnemy(e, effect, x, y, source = game.player) {
    if (!effect || !e.alive || e.state === S_DEAD) return false;
    if (effect === 'tame') return convertEnemy(e, x, y, WEAPONS.tameDart.tameDur || 8.5);
    if (effect === 'mad') return maddenEnemy(e, WEAPONS.dart.mad || 7.2, x, y);
    if (effect === 'virus') return infectEnemy(e, 20, source === game.player || !!source?.friendly);
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
    const p = game.player;
    if (!p.alive || game.state !== 'play') return false;
    const fresh = !(p.infectT > 0);
    p.infectT = Math.max(p.infectT || 0, seconds);
    if (fresh) {
      game.banner = '感染：清空敌人可治愈';
      game.bannerT = 1.15;
      burst(p.x, p.y, 16, 170, EFFECT_TINT.virus, 2.5, 0.62);
      sfx.status();
    }
    return true;
  }

  function applyStatusEffectToPlayer(effect, seconds = 5.8) {
    const p = game.player;
    if (!p.alive || game.state !== 'play') return false;
    if (effect === 'virus') return infectPlayer(20);
    if (effect === 'mad') {
      p.madT = Math.max(p.madT || 0, seconds);
      p.madDirT = 0;
      game.banner = '疯狂：暂时失控';
      game.bannerT = 0.9;
      burst(p.x, p.y, 14, 150, EFFECT_TINT.mad, 2.2, 0.46);
      sfx.status();
      return true;
    }
    if (effect === 'tame') {
      game.banner = '驯化无效：你免疫';
      game.bannerT = 0.8;
      sfx.status();
      return true;
    }
    return false;
  }

  function infectAt(x, y, weaponKey = 'virus', byEnemy = false, effectScale = 1) {
    const w = WEAPONS[weaponKey] || WEAPONS.virus;
    const radius = (w.radius || 128) * effectScale;
    const tint = w.tint || EFFECT_TINT.virus;
    game.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.16, size: 1.65 });
    burst(x, y, 28, 230, tint, 3.1, 0.62);
    burst(x, y, 14, 120, '#161513', 1.8, 0.55);
    shake(3);
    triggerSlow('throw');
    for (const e of game.pools.enemies) {
      if (!e.alive || e.state === S_DEAD) continue;
      const d = dist(x, y, e.x, e.y);
      if (d > radius || !blastClear(x, y, e.x, e.y)) continue;
      infectEnemy(e, 20, !byEnemy);
    }
    const p = game.player;
    if (p.alive && game.state === 'play' && dist(x, y, p.x, p.y) <= radius * 0.72 && blastClear(x, y, p.x, p.y)) {
      infectPlayer(20);
    }
    game.banner = '病毒扩散';
    game.bannerT = 0.85;
  }

  function estimateThrow(actor, kind, charge = 0) {
    const w = WEAPONS[kind] || WEAPONS.pistol;
    const lobbed = !!w.lobbed;
    const st = lobbed ? throwStats(charge) : { charge: 0, power: 1, effectScale: 1 };
    if (lobbed) {
      const target = resolveLobTarget(actor, kind, charge);
      const points = [];
      const dx = target.x - target.startX, dy = target.y - target.startY;
      const d = Math.hypot(dx, dy);
      const lift = clamp(d * 0.16, 18, 74);
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        points.push({
          x: target.startX + dx * t,
          y: target.startY + dy * t - Math.sin(t * Math.PI) * lift,
        });
      }
      return {
        ...target,
        points,
        radius: effectRadius(kind, 1),
        explosive: !!w.fire || !!w.radius || !!w.virusCloud,
        rangeMode: true,
      };
    }
    const sp = (w.throwSpeed || 900) * st.power;
    let x = actor.x + Math.cos(actor.aim) * 14;
    let y = actor.y + Math.sin(actor.aim) * 14;
    let vx = Math.cos(actor.aim) * sp;
    let vy = Math.sin(actor.aim) * sp;
    let life = lobbed ? (w.fuse || 1.2) : 1.6;
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
      rangeMode: false,
    };
  }

  function katanaChargeRatio(w, charge) {
    return clamp(charge / (w.chargeMax || THROW_CHARGE_MAX), 0, 1);
  }

  function katanaPointClear(x, y, r = 9) {
    return !game.level.solidAt(x, y)
      && !game.level.solidAt(x + r, y)
      && !game.level.solidAt(x - r, y)
      && !game.level.solidAt(x, y + r)
      && !game.level.solidAt(x, y - r);
  }

  function nearestKatanaLanding(tx, ty, fallback) {
    if (katanaPointClear(tx, ty, 9)) return { x: tx, y: ty };
    const maxR = 220;
    const step = 7;
    let best = null, bestD = Infinity;
    for (let oy = -maxR; oy <= maxR; oy += step) {
      for (let ox = -maxR; ox <= maxR; ox += step) {
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
    if (actor === game.player && !game.input.hasAim) {
      const m = pointerWorldPoint();
      tx = m.x; ty = m.y;
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
      originY: actor.y,
    };
  }

  game.throwStats = throwStats;

  function recordList(list, key, allowed) {
    if (!key || !allowed.includes(key) || list.includes(key)) return false;
    list.push(key);
    list.sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b));
    saveCodex(game.codex);
    return true;
  }

  game.recordWeapon = function (kind) {
    return recordList(game.codex.weapons, kind, CODEX_WEAPON_KEYS);
  };

  game.recordEnemy = function (kind) {
    return recordList(game.codex.enemies, kind, ENEMY_KEYS);
  };

  game.codexCounts = function () {
    return {
      weapons: game.codex.weapons.length,
      weaponTotal: CODEX_WEAPON_KEYS.length,
      enemies: game.codex.enemies.length,
      enemyTotal: ENEMY_KEYS.length,
    };
  };

  // A pane is a sightline you can shoot through and, once you break it, a door
  // you made yourself. Everyone can use it afterwards, including them.
  function smashWindow(win, dx = 0, dy = 0) {
    if (!win || !game.level.breakWindow(win)) return false;
    renderer.shards(win.x, win.y, dx, dy);
    burst(win.x, win.y, 14, 240, '#161513', 2.4, 0.5);
    noise(win.x, win.y, 300);
    sfx.glass();
    shake(4);
    game.flowT = 0;      // the map just changed shape
    return true;
  }
  game.smashWindow = smashWindow;

  function blastClear(x, y, tx, ty) {
    return !game.level || hasLineOfSight(game.level, x, y, tx, ty);
  }

  function actorFacing(actor) {
    return actor === game.player ? actor.aim : actor.angle;
  }

  function heldShieldBlocks(actor, fromX, fromY) {
    const w = WEAPONS[actor?.weapon];
    if (!actor || !actor.alive || !w || !w.defense) return false;
    if (actor.state === S_DOWN || actor.state === S_DEAD) return false;
    if (actor !== game.player && (actor.heldShieldHp || 0) <= 0) return false;
    const a = Math.atan2(fromY - actor.y, fromX - actor.x);
    return Math.abs(angDelta(actorFacing(actor), a)) <= (w.shieldArc || 1.28);
  }

  function blockOnHeldShield(actor, fromX, fromY, hard = false) {
    const face = actorFacing(actor);
    const r = actor === game.player ? 19 : (ENEMY_DEF[actor.type]?.r || 11) + 9;
    const sx = actor.x + Math.cos(face) * r;
    const sy = actor.y + Math.sin(face) * r;
    actor.blockFlash = Math.max(actor.blockFlash || 0, hard ? 0.38 : 0.30);
    if (actor !== game.player) {
      const dmg = hard ? 2 : 1;
      actor.heldShieldHp = Math.max(0, (actor.heldShieldHp || WEAPONS.shield.durability || 5) - dmg);
      actor.stagger = Math.max(actor.stagger || 0, hard ? 0.3 : 0.12);
      if (actor.heldShieldHp <= 0) {
        actor.weapon = 'fists';
        actor.ammo = 0;
        actor.stagger = Math.max(actor.stagger || 0, 0.72);
        burst(sx, sy, 14, 280, '#161513', 2.7, 0.48);
        sfx.shieldBreak();
      }
    }
    burst(sx, sy, hard ? 11 : 7, hard ? 250 : 170, WEAPONS.shield.tint, hard ? 2.6 : 2.0, 0.3);
    sfx.block();
    shake(hard ? 4.5 : 2.4);
    return true;
  }
  game.heldShieldBlocks = heldShieldBlocks;
  game.blockOnHeldShield = blockOnHeldShield;

  function sprayShrapnel(x, y, w, byEnemy, statusEffect = null) {
    const n = w.shrapnel || 0;
    if (!n) return;
    const step = TAU / n;
    for (let i = 0; i < n; i++) {
      const b = spawnFrom(game.pools.bullets);
      if (!b) break;
      const a = i * step + (rnd() - 0.5) * step * 0.85;
      const sp = (w.shrapnelSpeed || 820) * (0.72 + rnd() * 0.42);
      b.alive = true;
      b.x = x + Math.cos(a) * 6; b.y = y + Math.sin(a) * 6;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      b.life = 0.45 + rnd() * 0.12;
      b.friendly = !byEnemy; b.pierce = 0; b.near = 1;
      b.shieldDmg = 1; b.armourPierce = 0;
      b.throughDoors = false; b.hitDoor = null; b.owner = null;
      b.throughWalls = false; b.wallPierced = 0;
      b.statusEffect = statusEffect || null;
      b.weapon = statusEffect ? effectWeaponKey(statusEffect) : null;
      b.projectile = null; b.explosive = false;
    }
  }

  function explodeAt(x, y, weaponKey, byEnemy = false, effectScale = 1, statusEffect = null, shrapnelEffect = statusEffect) {
    const w = WEAPONS[weaponKey] || WEAPONS.grenade;
    if (w.virusCloud && !statusEffect) {
      infectAt(x, y, weaponKey, byEnemy, effectScale);
      return;
    }
    const radius = (w.radius || 96) * effectScale;
    const tint = w.tint || '#EC0A63';
    game.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.18, size: 2.7 });
    burst(x, y, 34, 390, tint, 4.2, 0.68);
    burst(x, y, 22, 250, '#161513', 3, 0.75);
    if (!w.silent) noise(x, y, w.noise ?? radius * 5, tint);
    shake(w.shake || 18);
    hitstop(0.075);
    triggerSlow('explosion');
    if (!w.silent) {
      if (sfx.explosion) sfx.explosion();
      else sfx.splinter();
    }

    for (const win of game.level.windows) {
      if (win.broken || dist(x, y, win.x, win.y) > radius * 0.95) continue;
      if (!blastClear(x, y, win.x, win.y)) continue;
      if (game.level.breakWindow(win)) {
        renderer.shards(win.x, win.y, win.x - x, win.y - y);
        burst(win.x, win.y, 9, 210, '#161513', 2.1, 0.42);
        game.flowT = 0;
      }
    }

    for (const d of game.level.doors) {
      if (dist(x, y, d.x, d.y) > radius * 0.75) continue;
      d.open = Math.max(d.open, 1);
      d.slam = Math.max(d.slam, 1);
      d.swing = d.horiz ? (y < d.y ? 1 : -1) : (x > d.x ? 1 : -1);
      game.flowT = 0;
    }

    for (const e of game.pools.enemies) {
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
        applyAttackEffectToEnemy(e, statusEffect, x, y, byEnemy ? null : game.player);
        continue;
      }
      if (d <= radius * (w.blastKill || 0.75) || e.state === S_DOWN) {
        killEnemy(e, 1.35, nx, ny, byEnemy);
      } else {
        knockdown(e, nx, ny);
      }
    }

    const p = game.player;
    if (p.alive && game.state === 'play') {
      const d = dist(x, y, p.x, p.y);
      if (d <= radius * 0.58 && blastClear(x, y, p.x, p.y)) {
        if (heldShieldBlocks(p, x, y)) blockOnHeldShield(p, x, y, true);
        else if (statusEffect) applyStatusEffectToPlayer(statusEffect);
        else game.killPlayer();
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
      game.fireEnemyBullet(e, e.x + Math.cos(a) * 260, e.y + Math.sin(a) * 260);
      e.ammo--;
    }
    e.fireTimer = Math.max(e.fireTimer || 0, 0.9);
    e.reload = Math.max(e.reload || 0, 1.15);
    return true;
  }

  function flashAt(x, y, weaponKey = 'flash', byEnemy = false, effectScale = 1) {
    const w = WEAPONS[weaponKey] || WEAPONS.flash;
    const radius = (w.radius || 160) * effectScale;
    const tint = w.tint || '#EFECE3';
    game.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.34, size: 3.4 });
    burst(x, y, 42, 460, tint, 4.6, 0.55);
    burst(x, y, 22, 260, '#F7CF16', 2.3, 0.38);
    noise(x, y, w.noise || 500, tint);
    shake(12);
    hitstop(0.055);
    triggerSlow('explosion');
    sfx.splinter();

    for (const e of game.pools.enemies) {
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
      if (e.weapon !== 'fists' && rnd() < (w.disarmChance || 0.3) * (0.55 + falloff)) {
        game.dropWeapon(e, false);
      }
      const nx = (e.x - x) / (d || 1), ny = (e.y - y) / (d || 1);
      e.state = S_DOWN;
      e.downTimer = Math.max(e.downTimer || 0, (w.stun || 5.2) * (0.58 + falloff * 0.56));
      e.vx = nx * 150; e.vy = ny * 150;
      e.seeking = 0;
      e.madT = 0;
      e.stagger = Math.max(e.stagger || 0, 0.35);
      burst(e.x, e.y, 8, 160, tint, 2.1, 0.36);
    }

    const p = game.player;
    if (p.alive && game.state === 'play') {
      const d = dist(x, y, p.x, p.y);
      if (d <= radius * 0.76 && blastClear(x, y, p.x, p.y)) {
        if (heldShieldBlocks(p, x, y)) blockOnHeldShield(p, x, y, true);
        else game.flash = Math.max(game.flash, 0.82);
      }
    }
  }

  function igniteAt(x, y, weaponKey = 'molotov', byEnemy = false, effectScale = 1) {
    const w = WEAPONS[weaponKey] || WEAPONS.molotov;
    const r = (w.fireRadius || 96) * effectScale;
    const dur = w.fireDur || 5;
    game.fireZones.push({ x, y, r, t: 0, dur, kill: w.fireKill || 0.35, byEnemy });
    if (game.fireZones.length > 12) game.fireZones.shift();
    game.flashes.push({ x, y, a: rnd() * TAU, t: 0, dur: 0.24, size: 2.1 });
    burst(x, y, 30, 310, '#FF6A00', 3.5, 0.62);
    burst(x, y, 16, 170, '#F7CF16', 2.2, 0.45);
    noise(x, y, w.noise || 320, w.tint || '#FF6A00');
    shake(8);
    hitstop(0.045);
    sfx.glass();
  }

  function finishLobbed(t, w) {
    t.alive = false;
    if (w.virusCloud && (!t.statusEffect || t.statusEffect === 'virus')) {
      infectAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1);
      return;
    }
    if (w.deploy) deployAt(t.x, t.y, w.deploy, t.friendly !== false);
    else if (w.flashbang) flashAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1);
    else if (w.fire) igniteAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1);
    else explodeAt(t.x, t.y, t.kind, t.friendly === false, t.effectScale || 1, t.statusEffect || null, t.shrapnelEffect || t.statusEffect || null);
  }

  function supportPointClear(x, y, r = 8) {
    return !game.level.solidAt(x, y)
      && !game.level.solidAt(x + r, y)
      && !game.level.solidAt(x - r, y)
      && !game.level.solidAt(x, y + r)
      && !game.level.solidAt(x, y - r);
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
    const pool = game.pools.pickups || [];
    const open = spawnFrom(pool);
    if (open) return open;
    if (!pool.length) return null;
    const slot = pool[game.pickupWrite % pool.length];
    game.pickupWrite = (game.pickupWrite + 1) % pool.length;
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
    const key = deployKind === 'drones' ? 'dronePack' : 'sentryPack';
    const w = WEAPONS[key] || WEAPONS.sentryPack;
    const center = nearestSupportPoint(x, y, 9, { x: game.player.x, y: game.player.y });
    if (deployKind === 'drones') {
      const count = w.droneCount || 3;
      for (let i = 0; i < count; i++) {
        const slot = recycleSlot(game.pools.drones || []);
        if (!slot) break;
        const a = i * TAU / count + rnd() * 0.28;
        const p0 = nearestSupportPoint(center.x + Math.cos(a) * 24, center.y + Math.sin(a) * 24, 6, center);
        slot.alive = true;
        slot.x = p0.x; slot.y = p0.y;
        slot.vx = Math.cos(a) * 24; slot.vy = Math.sin(a) * 24;
        slot.angle = a;
        slot.ammo = w.droneAmmo || 3;
        slot.fireTimer = 0.18 + i * 0.07;
        slot.life = 44;
        slot.friendly = friendly;
        slot.target = null;
        slot.navX = Math.cos(a); slot.navY = Math.sin(a); slot.navT = 0;
        slot.spin = rnd() * TAU;
        slot.kamikaze = false;
        slot.blastT = 0;
      }
      game.banner = '毒蜂无人机部署';
    } else {
      const slot = recycleSlot(game.pools.deploys || []);
      if (!slot) return false;
      slot.alive = true;
      slot.kind = 'sentry';
      slot.x = center.x; slot.y = center.y;
      slot.angle = rnd() * TAU;
      slot.ammo = WEAPONS.smg.ammo;
      slot.fireTimer = 0.22;
      slot.reload = 0;
      slot.life = 62;
      slot.friendly = friendly;
      slot.spin = 0;
      slot.target = null;
      game.banner = '哨戒机枪部署';
    }
    game.bannerT = 0.65;
    burst(center.x, center.y, 16, 180, w.tint || '#00A651', 2.3, 0.42);
    noise(center.x, center.y, w.noise || 160, w.tint || '#00A651');
    sfx.pickup();
    return true;
  }
  game.deployAt = deployAt;

  // whatever they were holding hits the floor with them
  // Shields come apart plate by plate, and the plate that breaks is the one you
  // hit. Open a gap on one side and you can shoot straight through it — unless
  // they turn and put an intact plate back in the way.
  function damageShield(e, amount, hard, fromX, fromY) {
    const segs = e.segs || 1;
    const idx = shieldSegmentAt(e, fromX, fromY);
    e.blockFlash = 0.25;

    if (idx >= 0) {
      // eat down through the column you hit; only spill sideways once it's a hole
      const order = [idx];
      for (let d = 1; d < segs; d++) { order.push(idx - d, idx + d); }
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
    const ba = e.angle + (idx >= 0 ? -arc + (idx + 0.5) * ((arc * 2) / segs) : 0);
    burst(e.x + Math.cos(ba) * 22, e.y + Math.sin(ba) * 22, 5, 190, '#161513', 2.2, 0.35);
    if (e.shieldHp <= 0) {
      e.shieldHp = 0;
      e.shieldSeg = 0;
      e.stagger = 0.85;
      hitstop(0.05);
      shake(11);
      sfx.shieldBreak();
      burst(e.x + Math.cos(e.angle) * 22, e.y + Math.sin(e.angle) * 22, 16, 320, '#161513', 3.2, 0.7);
      if (e.armour >= 3) {
        game.banner = e.armour >= 8 ? '重甲剥离' : '盾牌破碎';
        game.bannerT = 0.9;
      }
    }
  }
  game.damageShield = damageShield;

  game.dropWeapon = function (e, silent) {
    if (!e.weapon || e.weapon === 'fists') return;
    placePickup(e.x + (rnd() - 0.5) * 18, e.y + (rnd() - 0.5) * 18, e.weapon, e.ammo, rnd() * TAU);
    e.weapon = 'fists'; e.ammo = 0; e.heldShieldHp = 0;
    if (!silent) burst(e.x, e.y, 3, 90, '#161513', 2, 0.3);
  };

  game.seekWeapon = function (e) {
    if (ENEMY_DEF[e.type].handless) { e.seeking = 0; return; }
    let best = null, bd = 430 * 430;
    for (const k of game.pools.pickups) {
      if (!k.alive) continue;
      if (!enemyCanUseWeapon(k.kind)) continue;
      const d = dist(e.x, e.y, k.x, k.y);
      if (d * d < bd) { bd = d * d; best = k; }
    }
    if (!best) { e.seeking = 0; return; }
    e.skx = best.x; e.sky = best.y; e.seeking = 6;
  };

  game.tryTakePickup = function (e) {
    if (ENEMY_DEF[e.type].handless) return true;
    if (e.weapon !== 'fists') return true;
    for (const k of game.pools.pickups) {
      if (!k.alive) continue;
      if (!enemyCanUseWeapon(k.kind)) continue;
      const w = WEAPONS[k.kind];
      if (dist(e.x, e.y, k.x, k.y) > 22) continue;
      e.weapon = k.kind; e.ammo = k.ammo || WEAPONS[k.kind].ammo;
      e.heldShieldHp = w.defense ? (w.durability || 5) : 0;
      k.alive = false;
      sfx.pickup();
      return true;
    }
    return false;
  };

  // is one of their own standing in the shot?
  game.friendlyInLine = function (e, tx, ty) {
    const dx = tx - e.x, dy = ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const p = game.player;
    if (e.friendly && p.alive) {
      const px = p.x - e.x, py = p.y - e.y;
      const t = px * ux + py * uy;
      const perp = Math.abs(px * -uy + py * ux);
      if (t >= 20 && t <= len && perp < 14) return true;
    }
    for (const o of game.pools.enemies) {
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
    return game.pools.enemies.reduce((n, e) => n + (e.alive && e.state !== S_DEAD && !e.friendly ? 1 : 0), 0);
  }
  game.refreshEnemyCount = function () {
    game.enemiesLeft = hostilesLeft();
    return game.enemiesLeft;
  };

  function startingLoadout() {
    if (game.mode === 'practice') return loadoutFor(game.practice.weapon);
    if (game.mode === 'defense') return loadoutFor('pistol');
    return { weapon: 'disguise', ammo: WEAPONS.disguise.ammo };
  }

  // -- pathfinding ----------------------------------------------------------
  // Everything that hunts you routes to this point, not to your live position.
  game.raiseAlarm = function (x, y) {
    const moved = dist(game.alarmX, game.alarmY, x, y) > TILE;
    game.alarmX = x; game.alarmY = y;
    if (moved) game.flowT = 0;
  };

  // 8-way flood from the alarm point. Uniform cost on diagonals keeps the
  // gradient smooth — a 4-way field makes hunters zigzag down staircase paths.
  function computeFlow() {
    const lv = game.level;
    const n = lv.gw * lv.gh;
    if (!game.flow || game.flow.length !== n) {
      game.flow = new Int32Array(n);
      game.flowQueue = new Int32Array(n);
    }
    const flow = game.flow, q = game.flowQueue;
    flow.fill(-1);
    let sx = clamp((game.alarmX / TILE) | 0, 0, lv.gw - 1);
    let sy = clamp((game.alarmY / TILE) | 0, 0, lv.gh - 1);
    if (!lv.walkableTile(sx, sy)) {
      let found = false;
      for (let r = 1; r <= 6 && !found; r++) {
        for (let oy = -r; oy <= r && !found; oy++) {
          for (let ox = -r; ox <= r && !found; ox++) {
            if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
            if (lv.walkableTile(sx + ox, sy + oy)) { sx += ox; sy += oy; found = true; }
          }
        }
      }
      if (!found) return;
    }
    let hi = 0, lo = 0;
    const start = sy * lv.gw + sx;
    flow[start] = 0;
    q[hi++] = start;
    while (lo < hi) {
      const cur = q[lo++];
      const cx = cur % lv.gw, cy = (cur / lv.gw) | 0;
      const d = flow[cur] + 1;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox, ny = cy + oy;
          if (!lv.walkableTile(nx, ny)) continue;
          // never squeeze through a diagonal gap between two corners
          if (ox && oy && (!lv.walkableTile(cx + ox, cy) || !lv.walkableTile(cx, cy + oy))) continue;
          const ni = ny * lv.gw + nx;
          if (flow[ni] !== -1) continue;
          flow[ni] = d;
          q[hi++] = ni;
        }
      }
    }
  }

  // smooth descent: a weighted blend of every downhill neighbour, rather than
  // snapping to whichever single tile happens to be lowest
  game.flowStep = function (x, y) {
    const lv = game.level, flow = game.flow;
    if (!flow) return null;
    const gx = clamp((x / TILE) | 0, 0, lv.gw - 1);
    const gy = clamp((y / TILE) | 0, 0, lv.gh - 1);
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
        ax += ox * w; ay += oy * w;
      }
    }
    const l = Math.hypot(ax, ay);
    if (l < 1e-4) return null;
    return { x: ax / l, y: ay / l };
  };

  // can a body of this radius walk the straight line between two points?
  game.walkClear = function (ax, ay, bx, by, r) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const ux = dx / len, uy = dy / len;
    const px = -uy * r, py = ux * r;
    const steps = Math.ceil(len / 10);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * len;
      const cx = ax + ux * t, cy = ay + uy * t;
      if (game.level.solidAt(cx + px, cy + py)) return false;
      if (game.level.solidAt(cx - px, cy - py)) return false;
    }
    return true;
  };

  // Steering: walk straight at it when the straight line is actually walkable,
  // otherwise ride the flow field around the geometry. This is what stops them
  // pressing themselves into a wall on the far side of a doorway.
  game.pathDir = function (e, tx, ty, r, useField) {
    if (game.walkClear(e.x, e.y, tx, ty, r * 0.85)) {
      const dx = tx - e.x, dy = ty - e.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, direct: true };
    }
    if (useField) {
      const step = game.flowStep(e.x, e.y);
      if (step) return { x: step.x, y: step.y, direct: false };
    }
    const dx = tx - e.x, dy = ty - e.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l, direct: false };
  };

  game.pathDirToPoint = function (e, tx, ty, r) {
    if (game.walkClear(e.x, e.y, tx, ty, r * 0.85)) {
      const dx = tx - e.x, dy = ty - e.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, direct: true };
    }
    const lv = game.level;
    const sx = clamp((e.x / TILE) | 0, 0, lv.gw - 1);
    const sy = clamp((e.y / TILE) | 0, 0, lv.gh - 1);
    const gx = clamp((tx / TILE) | 0, 0, lv.gw - 1);
    const gy = clamp((ty / TILE) | 0, 0, lv.gh - 1);
    const start = sy * lv.gw + sx;
    const goal = gy * lv.gw + gx;
    if (!lv.walkableTile(sx, sy) || !lv.walkableTile(gx, gy)) {
      const dx = tx - e.x, dy = ty - e.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, direct: false };
    }
    const n = lv.gw * lv.gh;
    const prev = new Int32Array(n);
    const q = new Int32Array(n);
    prev.fill(-2);
    prev[start] = -1;
    let lo = 0, hi = 0, best = start, bestD = Infinity;
    q[hi++] = start;
    while (lo < hi) {
      const cur = q[lo++];
      const cx = cur % lv.gw, cy = (cur / lv.gw) | 0;
      const d2 = (cx - gx) * (cx - gx) + (cy - gy) * (cy - gy);
      if (d2 < bestD) { bestD = d2; best = cur; }
      if (cur === goal) { best = cur; break; }
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox, ny = cy + oy;
          if (!lv.walkableTile(nx, ny)) continue;
          if (ox && oy && (!lv.walkableTile(cx + ox, cy) || !lv.walkableTile(cx, cy + oy))) continue;
          const ni = ny * lv.gw + nx;
          if (prev[ni] !== -2) continue;
          prev[ni] = cur;
          q[hi++] = ni;
        }
      }
    }
    let cur = prev[goal] === -2 ? best : goal;
    if (cur === start) {
      const step = game.flowStep(e.x, e.y);
      if (step) return { x: step.x, y: step.y, direct: false };
      const dx = tx - e.x, dy = ty - e.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, direct: false };
    }
    while (prev[cur] !== start && prev[cur] >= 0) cur = prev[cur];
    const cx = (cur % lv.gw + 0.5) * TILE;
    const cy = (((cur / lv.gw) | 0) + 0.5) * TILE;
    const dx = cx - e.x, dy = cy - e.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l, direct: false };
  };

  game.nearestTarget = function (x, y) {
    let best = null, bd = Infinity;
    for (const t of game.targets) {
      if (!t.alive) continue;
      const d = dist(x, y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  game.playerDisguised = function () {
    const w = WEAPONS[game.player.weapon];
    return game.state === 'play' && game.player.alive && !!(w && w.disguise);
  };

  game.enemyTargets = function (e) {
    const out = game.madTargets;
    out.length = 0;
    const p = game.player;
    if (!e.friendly && p.alive && game.state === 'play' && !game.playerDisguised()) {
      out.push({ alive: true, x: p.x, y: p.y, vx: p.vx, vy: p.vy, enemy: null });
    }
    for (const o of game.pools.enemies) {
      if (o === e || !o.alive || o.state === S_DEAD) continue;
      if (!!o.friendly === !!e.friendly) continue;
      out.push({ alive: true, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, enemy: o });
    }
    return out;
  };

  game.frenzyTargets = function (e) {
    const out = game.madTargets;
    out.length = 0;
    const p = game.player;
    if (p.alive && game.state === 'play') {
      out.push({ alive: true, x: p.x, y: p.y, vx: p.vx, vy: p.vy, enemy: null });
    }
    for (const o of game.pools.enemies) {
      if (o === e || !o.alive || o.state === S_DEAD) continue;
      out.push({ alive: true, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, enemy: o });
    }
    return out;
  };

  game.shout = function (e, x, y) {
    game.raiseAlarm(x, y);
    game.noiseRings.push({ x: e.x, y: e.y, r: 340, t: 0, dur: 0.55, col: '#EC0A63' });
    for (const o of game.pools.enemies) {
      if (o === e || !o.alive || o.state === S_DOWN || o.state === S_DEAD) continue;
      if (!!o.friendly !== !!e.friendly) continue;
      if (dist(o.x, o.y, e.x, e.y) < 340) alertEnemy(o, x, y, 7);
    }
    sfx.shout();
  };

  function clearLiveInput() {
    const i = game.input;
    i.up = false; i.down = false; i.left = false; i.right = false;
    i.fire = false; i.fireReleased = false; i.dash = false;
    i.throwIt = false; i.throwHeld = false; i.throwReleased = false; i.swap = false;
    i.buy = null;
    i.analog = false; i.axisX = 0; i.axisY = 0;
    game.throwCharge = 0; game.throwPreview = null;
  }

  function storedSlot(kind, ammo = 0) {
    const w = WEAPONS[kind];
    if (!w || kind === 'fists') return { weapon: 'fists', ammo: 0 };
    return {
      weapon: kind,
      ammo: w.melee ? 0 : clamp(Number(ammo) || 0, 0, w.ammo || 0),
    };
  }

  function setMainSlot(p, kind, ammo = 0) {
    const slot = storedSlot(kind, ammo);
    p.weapon = slot.weapon;
    p.ammo = slot.ammo;
    if (slot.weapon !== 'fists') game.recordWeapon(slot.weapon);
    return slot.weapon !== 'fists';
  }

  function setOffhandSlot(p, kind, ammo = 0) {
    const slot = storedSlot(kind, ammo);
    p.offhandWeapon = slot.weapon;
    p.offhandAmmo = slot.ammo;
    if (slot.weapon !== 'fists') game.recordWeapon(slot.weapon);
    return slot.weapon !== 'fists';
  }

  function playerHasOffhand(kind) {
    return game.player.offhandWeapon === kind;
  }

  function dropReplacedWeapon(p, kind, ammo, angle = p.aim + Math.PI) {
    const w = WEAPONS[kind];
    if (!w || kind === 'fists' || w.passive || w.extract || w.copySauce || w.offhandOnly) return false;
    return placePickup(p.x, p.y, kind, ammo, angle);
  }

  function givePlayerWeapon(p, kind, ammo = WEAPONS[kind]?.ammo || 0, replaceOffhand = false) {
    const w = WEAPONS[kind];
    if (!w || kind === 'fists') return false;
    if (w.offhandOnly) {
      if (p.offhandWeapon !== 'fists' && !replaceOffhand) return false;
      if (p.offhandWeapon === kind) return setOffhandSlot(p, kind, ammo);
      if (p.offhandWeapon !== 'fists') dropReplacedWeapon(p, p.offhandWeapon, p.offhandAmmo);
      return setOffhandSlot(p, kind, ammo);
    }
    if (p.weapon === 'fists') return setMainSlot(p, kind, ammo);
    if (p.offhandWeapon === 'fists') return setOffhandSlot(p, kind, ammo);
    if (!replaceOffhand) return false;
    if (p.offhandWeapon === kind) return setOffhandSlot(p, kind, ammo);
    dropReplacedWeapon(p, p.offhandWeapon, p.offhandAmmo);
    return setOffhandSlot(p, kind, ammo);
  }

  function stashPlayerWeapon() {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    const ow = WEAPONS[p.offhandWeapon];
    if ((!w || p.weapon === 'fists') && (!ow || p.offhandWeapon === 'fists')) return null;
    return {
      weapon: w && p.weapon !== 'fists' ? p.weapon : 'fists',
      ammo: w && !w.melee ? clamp(p.ammo || 0, 0, w.ammo || 0) : 0,
      offhand: ow && p.offhandWeapon !== 'fists' ? p.offhandWeapon : 'fists',
      offAmmo: ow && !ow.melee ? clamp(p.offhandAmmo || 0, 0, ow.ammo || 0) : 0,
    };
  }

  function equipPlayerWeapon(p, carried) {
    setMainSlot(p, 'fists', 0);
    setOffhandSlot(p, 'fists', 0);
    if (!carried) return;
    const main = carried.weapon || 'fists';
    const offhand = carried.offhand || carried.sideWeapon || 'fists';
    if (WEAPONS[main]?.offhandOnly) setOffhandSlot(p, main, carried.ammo);
    else setMainSlot(p, main, carried.ammo);
    if (offhand !== 'fists') setOffhandSlot(p, offhand, carried.offAmmo ?? carried.sideAmmo);
  }

  function choosePreviewSeed() {
    const next = previewRunSeed();
    game.seed = next.seed;
    game.seedBase = next.base;
    game.customSeed = customSeedBase();
    game.runNo = next.runNo;
    return next;
  }

  game.setSeedBase = function (value) {
    const next = setSeedBase(value);
    game.seed = next.seed;
    game.seedBase = next.base;
    game.customSeed = customSeedBase();
    game.runNo = next.runNo;
    if (game.state === 'title') {
      game.floor = REC.floor || 1;
      game.floorLoadout = startingLoadout();
      startFloor(false);
      game.state = 'title';
      game.player.alive = false;
      game.player.x = -99999; game.player.y = -99999;
      game.banner = null; game.bannerT = 0;
    }
    return next;
  };

  function setPaused(paused) {
    if (game.state !== 'play') {
      game.paused = false;
      return false;
    }
    const next = !!paused;
    if (game.paused === next) return false;
    game.paused = next;
    clearLiveInput();
    setTimeScale(next ? 0 : game.worldScale || 1);
    game.banner = next ? null : '继续';
    game.bannerT = next ? 0 : 0.45;
    return true;
  }

  game.setPaused = setPaused;
  game.togglePause = function () {
    return setPaused(!game.paused);
  };

  game.returnToMenu = function () {
    clearLiveInput();
    game.paused = false;
    game.codexOpen = false;
    game.banner = null;
    game.bannerT = 0;
    game.showTitle();
    return true;
  };

  game.toggleRefill = function () {
    game.refillEnabled = !game.refillEnabled;
    localStorage.setItem('overprint.refill', game.refillEnabled ? '1' : '0');
    game.banner = `R 补弹 ${game.refillEnabled ? '开启' : '关闭'}`;
    game.bannerT = 0.8;
    if (game.state === 'play') sfx.status();
    return game.refillEnabled;
  };

  game.refillAmmo = function () {
    if (game.state !== 'play' || game.paused) return false;
    const p = game.player;
    const w = WEAPONS[p.weapon];
    if (!game.refillEnabled) {
      game.banner = 'R 补弹已关闭';
      game.bannerT = 0.65;
      sfx.empty();
      return false;
    }
    if (!p.alive || !w || w.melee || w.ammo <= 0) {
      game.banner = '当前武器不能补弹';
      game.bannerT = 0.65;
      sfx.empty();
      return false;
    }
    if (p.ammo >= w.ammo) {
      game.banner = `${w.name} 已满弹`;
      game.bannerT = 0.55;
      sfx.empty();
      return false;
    }
    p.ammo = w.ammo;
    p.attackCd = Math.min(p.attackCd, 0.08);
    game.floorLoadout = stashPlayerWeapon() || game.floorLoadout;
    game.banner = `${w.name} 已补满`;
    game.bannerT = 0.65;
    sfx.pickup();
    return true;
  };

  function canRefillPlayerAmmo() {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    return !!(p.alive && w && !w.melee && w.ammo > 0 && p.ammo < w.ammo);
  }

  function addCorpse(e) {
    const pool = game.pools.corpses || [];
    if (!pool.length) return null;
    const c = pool[game.corpseWrite % pool.length];
    game.corpseWrite = (game.corpseWrite + 1) % pool.length;
    c.alive = true;
    c.type = e.type || 'thug';
    c.weapon = e.weapon || 'fists';
    c.x = e.x; c.y = e.y; c.vx = 0; c.vy = 0;
    c.angle = e.angle || 0;
    c.deadAngle = e.deadAngle || e.angle || 0;
    c.state = S_DEAD;
    c.t = game.time;
    c.armour = e.armour || 0;
    c.segs = e.segs || 0;
    c.layers = e.layers || 0;
    c.shieldHp = e.shieldHp || 0;
    c.shieldSeg = e.shieldSeg || 0;
    c.friendly = !!e.friendly;
    c.contagious = !!e.contagious;
    c.wave = game.mode === 'defense' ? (game.defense.wave || 0) : game.floor;
    return c;
  }

  // -- floors ---------------------------------------------------------------
  function spawnEnemy(s) {
    const e = spawnFrom(game.pools.enemies);
    if (!e) return null;
    e.alive = true; e.type = s.type || 'thug'; e.x = s.x; e.y = s.y;
    const weapon = s.weapon || 'fists';
    e.weapon = weapon === 'fists' || enemyCanUseWeapon(weapon) ? weapon : 'fists';
    e.ammo = WEAPONS[e.weapon]?.ammo || 0;
    e.seeking = 0; e.blockFlash = 0; e.stagger = 0;
    e.heldShieldHp = WEAPONS[e.weapon]?.defense ? (WEAPONS[e.weapon].durability || 5) : 0;
    e.armour = s.armour || 0;
    if (e.armour) {
      const lay = armourLayout(e.armour);
      e.segs = lay.segs; e.layers = lay.layers;
      e.shieldSeg = 0;
      let left = e.armour;
      for (let L = 0; L < e.layers && left > 0; L++) {
        for (let i = 0; i < e.segs && left > 0; i++) { e.shieldSeg |= plateBit(e, L, i); left--; }
      }
    } else { e.segs = 0; e.layers = 0; e.shieldSeg = 0; }
    e.shieldHp = e.armour;
    e.vx = e.vy = 0; e.angle = s.angle || 0; e.state = S_IDLE; e.timer = 0;
    e.downTimer = 0; e.fireTimer = 0; e.attackTimer = 0; e.burst = 0; e.searchT = 0;
    e.ptx = s.x; e.pty = s.y; e.seen = 0; e.chargeT = 0; e.windup = 0;
    e.shoutCd = 0; e.strafe = rnd() < 0.5 ? 1 : -1; e.strafeT = 0;
    e.stuckT = 0; e.lastX = s.x; e.lastY = s.y; e.scanT = rnd() * 0.4; e.reload = 0;
    e.madT = 0; e.tameT = 0; e.burnT = 0; e.infectT = 0; e.infectByPlayer = false;
    e.roomGoal = -1; e.roomSeq = 0;
    e.friendly = false; e.converted = false; e.contagious = false;
    game.recordEnemy(e.type);
    return e;
  }

  function populate(level, carried = null) {
    reseedSim(game.seed + game.floor * 104729);
    for (const e of game.pools.enemies) e.alive = false;
    if (game.pools.corpses) {
      for (const c of game.pools.corpses) c.alive = false;
      game.corpseWrite = 0;
    }
    for (const b of game.pools.bullets) b.alive = false;
    for (const k of game.pools.pickups) k.alive = false;
    game.pickupWrite = 0;
    for (const t of game.pools.thrown) t.alive = false;
    for (const d of game.pools.deploys || []) d.alive = false;
    for (const d of game.pools.drones || []) d.alive = false;
    game.particles.length = 0;
    game.flashes.length = 0;
    game.noiseRings.length = 0;
    game.fireZones.length = 0;
    game.throwCharge = 0; game.throwPreview = null;
    for (const d of level.doors) { d.open = 0; d.slam = 0; d.swing = 1; }
    level.resetWindows();

    for (const s of level.enemySpawns) {
      if (!spawnEnemy(s)) break;
    }
    for (const s of level.pickupSpawns) {
      const k = spawnFrom(game.pools.pickups);
      if (!k) break;
      k.alive = true; k.x = s.x; k.y = s.y; k.kind = s.kind;
      k.ammo = WEAPONS[s.kind].ammo; k.angle = rnd() * TAU;
    }
    const p = game.player;
    p.x = level.spawn.x; p.y = level.spawn.y;
    p.vx = p.vy = 0; p.alive = true;
    equipPlayerWeapon(p, carried);
    p.maxHp = game.playerStats.maxHp || 1;
    p.hp = p.maxHp;
    p.iframes = 0;
    p.maxDash = game.playerStats.maxDash || MAX_DASH;
    p.dashCdMax = game.playerStats.dashCd || DASH_CD;
    p.attackCd = 0; p.swing = 0; p.burnT = 0; p.infectT = 0; p.madT = 0; p.madDirT = 0;
    p.sawCd = 0; p.blockFlash = 0; p.swapCd = 0;
    p.dashCharges = p.maxDash; p.dashCd = 0; p.dashT = 0;
    p.katanaT = 0; p.katanaMax = 0; p.katanaX = 0; p.katanaY = 0;
    p.trail.length = 0;

    game.floorKills = 0;
    game.combo = 0; game.comboTimer = 0;
    game.enemiesLeft = hostilesLeft();
    game.state = 'play';
    game.alarmX = p.x; game.alarmY = p.y;
    computeFlow();
  }

  // The seed belongs to the RUN, not the floor: every floor is derived from it,
  // so one number decides the whole world and two people on the same board
  // fight the same fight. Only starting a run picks a new one.
  function startFloor(nextFloor) {
    const carried = nextFloor ? stashPlayerWeapon() : (game.floorLoadout || startingLoadout());
    if (nextFloor) game.floor++;
    game.floorLoadout = carried;
    game.paused = false;
    // the recording build pins difficulty to the hardest floor a run reaches
    const diff = REC.floor ? Math.min(game.floor, REC.floor) : game.floor;
    let level;
    if (game.mode === 'practice') {
      const map = game.practiceMaps[game.practice.map] || game.practiceMaps[0];
      level = makePracticeLevel(game.seed + game.floor * 7919, map.id, game.practice.enemy);
    } else if (game.mode === 'defense') {
      level = makeDefenseLevel(game.seed + game.floor * 7919);
    } else {
      level = makeLevel(game.seed + game.floor * 7919, diff);
    }
    game.level = level;
    renderer.bakeLevel(level);
    renderer.clearStains();
    populate(level, carried);
    game.camera.x = game.player.x; game.camera.y = game.player.y;
    game.floorStartTime = game.time;
    game.banner = game.mode === 'practice'
      ? '练习开始'
      : game.mode === 'defense'
        ? '防守准备'
        : `第 ${String(game.floor).padStart(2, '0')} 层`;
    game.bannerT = 1.4;
  }

  function restartFloor() {
    renderer.clearStains();
    game.paused = false;
    const restartLoadout = game.mode === 'defense'
      ? (stashPlayerWeapon() || game.floorLoadout)
      : game.floorLoadout;
    if (game.mode === 'defense') {
      game.score = 0;
      game.kills = 0;
      game.defense = newDefenseState();
      game.playerStats = defensePlayerStats();
    } else {
      game.score = Math.max(0, game.score - game.floorKills * 100);
      game.kills -= game.floorKills;
    }
    game.floorLoadout = restartLoadout;
    populate(game.level, restartLoadout);
    if (game.mode === 'defense') {
      game.defense.between = true;
      game.defense.nextWaveT = DEFENSE_REST_SECONDS;
      game.defense.shopOpen = true;
    }
    game.floorStartTime = game.time;
    game.banner = '重新开始本层';
    game.bannerT = 0.9;
  }

  // -- combat ---------------------------------------------------------------
  function announceClear() {
    if (game.enemiesLeft !== 0) return;
    if (game.mode === 'practice') {
      game.banner = '练习目标清空';
      game.bannerT = 1.2;
      sfx.clear();
      return;
    }
    if (game.mode === 'defense') return;
    game.banner = '本层已清空 — 前往出口';
    game.bannerT = 2.2;
    sfx.clear();
    triggerSlow('lastKill');
  }

  function registerKill(x, y, power = 1, mult = 1, dx = 0, dy = 0, byEnemy = false) {
    if (!byEnemy) {
      game.combo++;
      game.comboTimer = 3.2;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      if (game.combo > 1) game.ui.chainPunch = 1;   // the readout takes the hit
    }
    game.kills++;
    game.floorKills++;
    // crossfire still clears the page, it just doesn't pad your chain
    game.score += byEnemy ? 40 : 100 * game.combo * mult;
    if (game.mode === 'defense' && !byEnemy) game.defense.points += Math.round(10 * mult + game.combo * 2);
    game.enemiesLeft = hostilesLeft();
    if (!byEnemy && game.player.dashCharges < (game.player.maxDash || MAX_DASH)) {
      game.player.dashCharges++;
      game.dashFlash = 0.3;   // show the refund, or the meter looks like it lied
    }
    renderer.splat(x, y, power, dx, dy);
    burst(x, y, 14, 260, '#EC0A63', 3, 0.55);
    burst(x, y, 6, 130, '#161513', 2.4, 0.7);
    hitstop(0.055);
    shake(7);
    sfx.kill();
    if (mult > 1) { sfx.execute(); triggerSlow('execute'); }
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
      e.tameT = 0;
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
      burst(x, y, 8, 140, '#8A2BE2', 2.1, 0.42);
      game.banner = '病毒扩散';
      game.bannerT = 0.65;
      return true;
    }
    e.state = S_DEAD;
    e.deadAngle = e.angle;
    addCorpse(e);
    e.madT = 0;
    e.tameT = 0;
    e.burnT = 0;
    e.infectT = 0;
    e.infectByPlayer = false;
    e.friendly = false;
    e.converted = false;
    e.contagious = false;
    e.vx = e.vy = 0;
    game.dropWeapon(e, true);
    e.alive = false;
    e.state = S_IDLE;
    if (wasFriendly) {
      game.enemiesLeft = hostilesLeft();
      renderer.splat(x, y, power, dx, dy, '#8A2BE2');
      burst(x, y, 10, 210, '#8A2BE2', 2.7, 0.5);
      burst(x, y, 5, 120, '#161513', 2.1, 0.6);
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
    e.vx = dirx * 320; e.vy = diry * 320;
    e.seeking = 0;
    game.dropWeapon(e, false);
    renderer.splat(e.x, e.y, 0.3, dirx, diry);
    burst(e.x, e.y, 5, 130, '#EC0A63', 2.2, 0.4);
    hitstop(0.035);
    shake(4);
    sfx.knockdown();
  }
  game.killEnemy = killEnemy;
  game.knockdownEnemy = knockdown;

  function pointSegmentInfo(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 1e-6 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    const x = ax + dx * t, y = ay + dy * t;
    const ox = px - x, oy = py - y;
    return { x, y, t, d: Math.hypot(ox, oy) };
  }

  function slashKatanaPath(ax, ay, bx, by) {
    const p = game.player;
    const w = WEAPONS[p.weapon] || WEAPONS.katana;
    const radius = w.slashRadius || 22;
    const dirx = p.katanaX || Math.cos(p.aim);
    const diry = p.katanaY || Math.sin(p.aim);
    let kills = 0;
    for (const e of game.pools.enemies) {
      if (!e.alive || e.state === S_DEAD || e.friendly) continue;
      const def = ENEMY_DEF[e.type] || ENEMY_DEF.thug;
      const hit = pointSegmentInfo(e.x, e.y, ax, ay, bx, by);
      if (hit.d > radius + def.r) continue;
      if (game.walkClear && !game.walkClear(hit.x, hit.y, e.x, e.y, 3)) continue;
      if (killEnemy(e, 1.45, dirx, diry)) {
        kills++;
        p.katanaT = Math.max(p.katanaT || 0, p.katanaMax || w.dashReset || 0.22);
        triggerSlow('katana');
      }
    }
    return kills;
  }

  function startKatanaDash(charge = 0) {
    const p = game.player;
    const w = WEAPONS[p.weapon] || WEAPONS.katana;
    const ratio = Math.max(0.22, katanaChargeRatio(w, charge));
    const dur = (w.dashDur || 0.22) * (0.68 + ratio * 0.5);
    p.katanaX = Math.cos(p.aim);
    p.katanaY = Math.sin(p.aim);
    p.katanaT = dur;
    p.katanaMax = dur;
    p.dashT = 0;
    p.trail.length = 0;
    burst(p.x, p.y, 8, 190, w.tint || '#8A2BE2', 2.5, 0.34);
    noise(p.x, p.y, w.noise || 60, w.tint || '#8A2BE2');
    sfx.dash();
    shake(3);
  }

  function blinkKatanaTo(target) {
    const p = game.player;
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
    burst(p.x, p.y, 18, 260, w.tint || '#8A2BE2', 3.1, 0.5);
    noise(p.x, p.y, w.noise || 68, w.tint || '#8A2BE2');
    triggerSlow('katana');
    sfx.dash();
    shake(7);
  }

  function releaseKatanaCharge(charge = 0) {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    if (!w || (!w.katana && !w.lance) || p.katanaT > 0) return false;
    if (p.attackCd > 0) { sfx.empty(); return false; }
    p.attackCd = w.rate * (game.playerStats.attackRate || 1);
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
    const p = game.player;
    const w = WEAPONS[p.weapon] || WEAPONS.katana;
    const ax = p.x, ay = p.y;
    p.katanaX = Math.cos(p.aim);
    p.katanaY = Math.sin(p.aim);
    p.katanaT = Math.max(0, p.katanaT - dt);
    if (w.lance && game.input.fire && p.katanaT > 0) {
      p.katanaT = Math.min(w.dashCap || 1.25, p.katanaT + dt * (w.chargeExtend || 0.36));
      p.katanaMax = Math.max(p.katanaMax || 0, p.katanaT);
    }
    const sp = w.dashSpeed || 1080;
    moveCollide(game.level, p, p.katanaX * sp * dt, p.katanaY * sp * dt, 9);
    p.vx = p.katanaX * 360;
    p.vy = p.katanaY * 360;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 16) p.trail.shift();
    checkDoorSlam(p, p.katanaX, p.katanaY);
    const pane = game.level.windowAtPoint(p.x + p.katanaX * 16, p.y + p.katanaY * 16);
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
    const p = game.player;
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
      if (game.level.sightBlockedAt(x, y)) {
        ex = sx + dx * range * (i - 1) / 32;
        ey = sy + dy * range * (i - 1) / 32;
        break;
      }
    }
    p.katanaX = dx;
    p.katanaY = dy;
    let kills = 0;
    for (const e of game.pools.enemies) {
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
      particle(x, y, -dy * 70 + (rnd() - 0.5) * 55, dx * 70 + (rnd() - 0.5) * 55,
        0.22 + rnd() * 0.12, 3.3, w.tint);
    }
    game.flashes.push({ x: (sx + ex) / 2, y: (sy + ey) / 2, a: p.aim, t: 0, dur: 0.16, size: 1.45 });
    burst(sx, sy, 7, 190, w.tint, 2.5, 0.34);
    noise(p.x, p.y, 92, w.tint);
    shake(kills ? 6 : 3);
    triggerSlow(kills ? 'katana' : 'execute');
    sfx.swing();
    return kills;
  }

  function isSwapGun(kind) {
    const w = WEAPONS[kind];
    return !!(w && !w.melee && !w.lobbed && !w.projectile && !w.defense
      && !w.silent && !w.copySauce && !w.extract && !w.passive && w.pellets && w.ammo > 0);
  }

  function gunSwapBurst(kind) {
    const p = game.player;
    const w = WEAPONS[kind];
    if (!w) return 0;
    const shots = Math.max(1, Math.ceil((w.ammo || 1) / 2));
    const statusEffect = activeAttackEffect(p, kind, 'direct');
    const base = p.aim;
    for (let shot = 0; shot < shots; shot++) {
      const fan = shots > 1 ? (shot - (shots - 1) / 2) / (shots - 1) : 0;
      const shotAim = base + fan * Math.min(0.2, (w.spread || 0.025) * 2.8) + (rnd() - 0.5) * (w.spread || 0.025);
      for (let i = 0; i < (w.pellets || 1); i++) {
        const b = spawnFrom(game.pools.bullets);
        if (!b) break;
        const a = shotAim + (rnd() - 0.5) * (w.pellets > 1 ? w.spread * 2 : w.spread || 0.02);
        b.alive = true;
        b.x = p.x + Math.cos(a) * 16; b.y = p.y + Math.sin(a) * 16;
        b.vx = Math.cos(a) * w.speed * (0.92 + rnd() * 0.16);
        b.vy = Math.sin(a) * w.speed * (0.92 + rnd() * 0.16);
        b.life = w.life || 1.6; b.friendly = true; b.pierce = w.pierce || (w.rail ? 999 : 0);
        b.shieldDmg = w.shieldDmg ?? 1;
        b.armourPierce = w.armourPierce || 0;
        b.throughDoors = !!w.throughDoors; b.hitDoor = null;
        b.throughWalls = !!w.throughWalls; b.wallPierced = 0;
        b.owner = null; b.near = 0;
        b.statusEffect = statusEffect || null;
        b.weapon = kind; b.projectile = null; b.explosive = false;
        b.ricochet = !!w.ricochet; b.bounces = w.bounces || 0;
      }
      if (shot < 5) ejectCasing(p.x, p.y, shotAim);
    }
    const mx = p.x + Math.cos(base) * 19, my = p.y + Math.sin(base) * 19;
    game.flashes.push({ x: mx, y: my, a: base, t: 0, dur: 0.13, size: w.pellets > 1 ? 1.8 : 1.25 });
    burst(mx, my, 7, 220, '#F7CF16', 2.4, 0.18);
    noise(p.x, p.y, Math.round((w.noise || 280) * 0.82), w.tint);
    shake(Math.min(14, 3 + shots * 0.45 + (w.pellets > 1 ? 5 : 0)));
    const fill = clamp((p.ammo ?? w.ammo) / w.ammo, 0, 1);
    if (kind === 'shotgun') sfx.shotgun(fill);
    else if (kind === 'smg' || kind === 'ripper') sfx.smg(fill);
    else if (kind === 'revolver') sfx.revolver(fill);
    else sfx.shot(fill);
    game.banner = `换手连射 ×${shots}`;
    game.bannerT = 0.7;
    p.attackCd = Math.max(p.attackCd, Math.min(0.38, (w.rate || 0.2) * Math.min(shots, 5) * 0.3));
    return shots;
  }

  function shieldSwapCharge() {
    const p = game.player;
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    p.dashX = dx;
    p.dashY = dy;
    p.dashT = Math.max(p.dashT, 0.18);
    p.iframes = Math.max(p.iframes || 0, 3);
    p.blockFlash = Math.max(p.blockFlash || 0, 0.55);
    p.trail.length = 0;
    burst(p.x + dx * 14, p.y + dy * 14, 14, 210, WEAPONS.shield.tint, 2.8, 0.42);
    noise(p.x, p.y, 150, WEAPONS.shield.tint);
    shake(5);
    triggerSlow('dash');
    sfx.dash();
    game.banner = '盾牌冲锋 · 无敌 3s';
    game.bannerT = 0.85;
    return true;
  }

  function swapPlayerWeapon() {
    const p = game.player;
    const incoming = WEAPONS[p.offhandWeapon];
    if (game.state !== 'play' || game.paused || !p.alive) return false;
    if (p.swapCd > 0 || p.katanaT > 0 || p.dashT > 0) { sfx.empty(); return false; }
    if (!incoming || p.offhandWeapon === 'fists') {
      game.banner = '副手为空';
      game.bannerT = 0.55;
      sfx.empty();
      return false;
    }
    if (incoming.offhandOnly) {
      game.banner = `${incoming.name} 为副手被动`;
      game.bannerT = 0.65;
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
    game.throwCharge = 0;
    game.throwPreview = null;
    game.floorLoadout = stashPlayerWeapon() || game.floorLoadout;
    game.banner = `切出 ${WEAPONS[p.weapon].name}`;
    game.bannerT = 0.58;
    if (p.weapon === 'katana') katanaSwapSlash();
    else if (p.weapon === 'shield') shieldSwapCharge();
    else if (isSwapGun(p.weapon)) gunSwapBurst(p.weapon);
    else sfx.pickup();
    return true;
  }
  game.swapPlayerWeapon = swapPlayerWeapon;

  function maddenEnemy(e, seconds, x, y) {
    if (!e.alive || e.state === S_DEAD) return false;
    e.madT = Math.max(e.madT || 0, seconds || 6.5);
    e.tameT = 0;
    e.infectT = 0;
    e.infectByPlayer = false;
    e.friendly = false;
    e.converted = false;
    e.contagious = false;
    e.state = S_CHASE;
    e.seeking = 0;
    e.seen = 1;
    e.searchT = Math.max(e.searchT || 0, e.madT);
    e.lkx = x || e.x;
    e.lky = y || e.y;
    e.stagger = Math.max(e.stagger || 0, 0.18);
    game.enemiesLeft = hostilesLeft();
    burst(e.x, e.y, 10, 150, '#7AC943', 2.4, 0.55);
    return true;
  }
  game.maddenEnemy = maddenEnemy;

  function convertEnemy(e, x, y, seconds = WEAPONS.tameDart.tameDur || 8.5) {
    if (!e.alive || e.state === S_DEAD || e.friendly) return false;
    e.friendly = true;
    e.converted = true;
    e.contagious = playerHasOffhand('virus');
    e.madT = 0;
    e.tameT = Math.max(e.tameT || 0, seconds || 0);
    e.infectT = 0;
    e.infectByPlayer = false;
    e.state = S_CHASE;
    e.seeking = 0;
    e.seen = 1;
    e.searchT = Math.max(e.searchT || 0, 7.5);
    e.lkx = x || e.x;
    e.lky = y || e.y;
    e.stagger = Math.max(e.stagger || 0, 0.15);

    game.combo++;
    game.comboTimer = 3.2;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    if (game.combo > 1) game.ui.chainPunch = 1;
    game.kills++;
    game.floorKills++;
    game.score += 80 * game.combo;
    if (game.mode === 'defense') game.defense.points += 8 + game.combo;
    if (game.player.dashCharges < (game.player.maxDash || MAX_DASH)) {
      game.player.dashCharges++;
      game.dashFlash = 0.3;
    }
    game.enemiesLeft = hostilesLeft();
    burst(e.x, e.y, 18, 210, '#8A2BE2', 2.8, 0.62);
    burst(e.x, e.y, 8, 120, '#F7CF16', 1.9, 0.4);
    const tameLabel = e.tameT > 0 ? `${Math.ceil(e.tameT)}s` : '';
    game.banner = e.contagious ? `已驯服 ${tameLabel} · 传染` : `已驯服 ${tameLabel}`;
    game.bannerT = 0.65;
    sfx.status();
    announceClear();
    return true;
  }
  game.convertEnemy = convertEnemy;

  function updateFireZones(dt) {
    let playerBurning = false;
    for (const z of game.fireZones) {
      z.t += dt;
      const live = 1 - z.t / z.dur;
      if (live > 0 && rnd() < 0.38) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * z.r;
        particle(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r,
          Math.cos(a) * 22, Math.sin(a) * 22 - 48,
          0.28 + rnd() * 0.32, 2.1 + rnd() * 2.4, rnd() < 0.5 ? '#FF6A00' : '#F7CF16');
      }
      for (const e of game.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        const d = dist(z.x, z.y, e.x, e.y);
        if (d > z.r) continue;
        if (!hasLineOfSight(game.level, z.x, z.y, e.x, e.y)) continue;
        e.burnT = (e.burnT || 0) + dt * clamp(1.2 - d / z.r, 0.35, 1.2);
        e.stagger = Math.max(e.stagger || 0, 0.1);
        if (e.burnT >= z.kill) {
          const nx = (e.x - z.x) / (d || 1), ny = (e.y - z.y) / (d || 1);
          killEnemy(e, 0.95, nx, ny, z.byEnemy);
        }
      }
      const p = game.player;
      if (p.alive && game.state === 'play'
        && dist(z.x, z.y, p.x, p.y) <= z.r * 0.9
        && hasLineOfSight(game.level, z.x, z.y, p.x, p.y)) playerBurning = true;
    }
    game.fireZones = game.fireZones.filter((z) => z.t < z.dur);
    const p = game.player;
    if (playerBurning) {
      p.burnT = (p.burnT || 0) + dt;
      if (p.burnT > 0.42) game.killPlayer();
    } else {
      p.burnT = Math.max(0, (p.burnT || 0) - dt * 1.6);
    }
    for (const e of game.pools.enemies) {
      if (!e.alive || e.state === S_DEAD) continue;
      e.burnT = Math.max(0, (e.burnT || 0) - dt * 0.45);
    }
  }
  game.igniteAt = igniteAt;

  function nearestHostile(x, y, range = Infinity, requireSight = false) {
    let best = null, bd = range;
    for (const e of game.pools.enemies) {
      if (!e.alive || e.state === S_DEAD || e.friendly) continue;
      const d = dist(x, y, e.x, e.y);
      if (d >= bd) continue;
      if (requireSight && !hasLineOfSight(game.level, x, y, e.x, e.y)) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  function emitInfection(unit, dt) {
    if (rnd() > Math.min(0.9, dt * 11)) return;
    const a = rnd() * TAU;
    const r = 9 + rnd() * 16;
    particle(unit.x + Math.cos(a) * r, unit.y + Math.sin(a) * r,
      Math.cos(a) * 18, Math.sin(a) * 18 - 34,
      0.28 + rnd() * 0.24, 1.8 + rnd() * 2.1, EFFECT_TINT.virus);
  }

  function spreadVirusFrom(unit, byPlayer) {
    for (const o of game.pools.enemies) {
      if (o === unit || !o.alive || o.state === S_DEAD || o.infectT > 0) continue;
      const d = dist(unit.x, unit.y, o.x, o.y);
      if (d > 72 || !hasLineOfSight(game.level, unit.x, unit.y, o.x, o.y)) continue;
      infectEnemy(o, 20, byPlayer);
    }
    const p = game.player;
    if (unit !== p && p.alive && game.state === 'play' && p.infectT <= 0) {
      const d = dist(unit.x, unit.y, p.x, p.y);
      if (d <= 58 && hasLineOfSight(game.level, unit.x, unit.y, p.x, p.y)) infectPlayer(20);
    }
  }

  function updateInfections(dt) {
    for (const e of game.pools.enemies) {
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

    const p = game.player;
    if (!p.alive || !(p.infectT > 0)) return;
    if (hostilesLeft() === 0) {
      p.infectT = 0;
      game.banner = '感染已治愈';
      game.bannerT = 0.9;
      burst(p.x, p.y, 18, 190, '#8A2BE2', 2.4, 0.52);
      sfx.status();
      return;
    }
    emitInfection(p, dt);
    spreadVirusFrom(p, true);
    p.infectT -= dt;
    if (p.infectT <= 0) {
      p.hp = 1;
      game.killPlayer(null, true);
    }
  }

  game.killPlayer = function (_source = null, force = false) {
    const p = game.player;
    if (!p.alive || game.state !== 'play') return;
    if (!force && p.iframes > 0) return;
    if (!force && (p.hp || 1) > 1) {
      p.hp--;
      p.iframes = 0.9;
      p.blockFlash = 0.35;
      game.flash = Math.max(game.flash, 0.42);
      game.banner = `受伤 ${p.hp}/${p.maxHp}`;
      game.bannerT = 0.65;
      burst(p.x, p.y, 14, 220, '#EC0A63', 2.8, 0.48);
      hitstop(0.06);
      shake(9);
      sfx.block();
      return;
    }
    p.alive = false;
    game.state = 'dying';
    game.deathT = 0.42;
    clearLiveInput();
    renderer.splat(p.x, p.y, 1.5);
    burst(p.x, p.y, 26, 320, '#EC0A63', 3.6, 0.8);
    hitstop(0.14);
    shake(20);
    game.flash = 1;
    sfx.die();
  };

  game.onSpotted = function (e) {
    // a sighting is the freshest alarm there is
    game.raiseAlarm(e.lkx, e.lky);
    sfx.alert();
  };

  function launchProjectile(actor, angle, weaponKey, friendly, statusEffect = null) {
    const w = WEAPONS[weaponKey];
    const b = spawnFrom(game.pools.bullets);
    if (!b) return null;
    const sp = friendly ? w.speed : (w.eSpeed || w.speed);
    b.alive = true;
    b.x = actor.x + Math.cos(angle) * 18; b.y = actor.y + Math.sin(angle) * 18;
    b.vx = Math.cos(angle) * sp; b.vy = Math.sin(angle) * sp;
    b.life = w.life || 2.6; b.friendly = friendly; b.pierce = w.pierce || (w.rail ? 999 : 0); b.near = 0;
    b.shieldDmg = w.shieldDmg ?? 1;
    b.armourPierce = w.armourPierce || 0;
    b.throughDoors = !!w.throughDoors; b.hitDoor = null; b.owner = actor === game.player ? null : actor;
    b.throughWalls = !!w.throughWalls; b.wallPierced = 0;
    b.statusEffect = statusEffect || weaponStatusEffect(weaponKey);
    b.weapon = weaponKey; b.projectile = w.projectile || null; b.explosive = !!w.projectile;
    b.ricochet = !!w.ricochet; b.bounces = w.bounces || 0;
    return b;
  }

  game.fireEnemyBullet = function (e, tx, ty) {
    const w = WEAPONS[e.weapon] || WEAPONS.pistol;
    const base = Math.atan2(ty - e.y, tx - e.x);
    if (w.projectile) {
      launchProjectile(e, base, e.weapon, !!e.friendly);
      const emx = e.x + Math.cos(base) * 19, emy = e.y + Math.sin(base) * 19;
      if (!w.silent) {
        game.flashes.push({ x: emx, y: emy, a: base, t: 0, dur: 0.11, size: 1.25 });
        burst(emx, emy, 5, 170, '#F7CF16', 2.4, 0.18);
        noise(e.x, e.y, w.noise);
        shake(4);
        sfx.revolver(0.4);
      } else {
        burst(emx, emy, 2, 55, w.tint || '#7AC943', 1.2, 0.18);
      }
      return;
    }
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) {
      const b = spawnFrom(game.pools.bullets);
      if (!b) break;
      const a = base + (rnd() - 0.5) * (n > 1 ? w.spread * 2 : 0.09);
      b.alive = true;
      b.x = e.x + Math.cos(a) * 16; b.y = e.y + Math.sin(a) * 16;
      b.vx = Math.cos(a) * w.eSpeed; b.vy = Math.sin(a) * w.eSpeed;
      b.life = w.life || 2.4; b.friendly = !!e.friendly; b.pierce = w.pierce || (w.rail ? 999 : 0); b.near = 0;
      b.shieldDmg = w.shieldDmg ?? 1;
      b.armourPierce = w.armourPierce || 0;
      b.throughDoors = !!w.throughDoors; b.hitDoor = null;
      b.throughWalls = !!w.throughWalls; b.wallPierced = 0;
      b.owner = e;
      b.statusEffect = weaponStatusEffect(e.weapon);
      b.weapon = e.weapon; b.projectile = null; b.explosive = false;
      b.ricochet = !!w.ricochet; b.bounces = w.bounces || 0;
    }
    const emx = e.x + Math.cos(base) * 19, emy = e.y + Math.sin(base) * 19;
    if (!w.silent) {
      game.flashes.push({ x: emx, y: emy, a: base, t: 0, dur: 0.07, size: 0.85 });
      burst(emx, emy, 4, 140, '#F7CF16', 2, 0.14);
      ejectCasing(e.x, e.y, base);
      noise(e.x, e.y, w.noise);
      const et = clamp(e.ammo / w.ammo, 0, 1);
      if (e.weapon === 'shotgun') sfx.shotgun(et);
      else if (e.weapon === 'smg') sfx.smg(et);
      else if (e.weapon === 'revolver') sfx.revolver(et);
      else sfx.shot(et);
    } else {
      burst(emx, emy, 2, 55, w.tint || '#7AC943', 1.2, 0.18);
    }
  };

  function supportTarget(unit, range = 560, requireSight = false) {
    let best = null, bestD = Infinity;
    const friendly = !!unit.friendly;
    if (!friendly && game.player.alive && game.state === 'play' && !game.playerDisguised()) {
      const d = dist(unit.x, unit.y, game.player.x, game.player.y);
      if (d < bestD && d <= range && (!requireSight || hasLineOfSight(game.level, unit.x, unit.y, game.player.x, game.player.y))) {
        bestD = d;
        best = { alive: true, x: game.player.x, y: game.player.y, vx: game.player.vx, vy: game.player.vy, enemy: null };
      }
    }
    for (const e of game.pools.enemies) {
      if (!e.alive || e.state === S_DEAD) continue;
      if (!!e.friendly === friendly) continue;
      const d = dist(unit.x, unit.y, e.x, e.y);
      if (d >= bestD || d > range) continue;
      if (requireSight && !hasLineOfSight(game.level, unit.x, unit.y, e.x, e.y)) continue;
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
    const b = launchProjectile(unit, a, 'smg', !!unit.friendly);
    if (!b) return false;
    b.owner = null;
    unit.ammo--;
    const mx = unit.x + Math.cos(a) * 17, my = unit.y + Math.sin(a) * 17;
    game.flashes.push({ x: mx, y: my, a, t: 0, dur: quiet ? 0.045 : 0.065, size: quiet ? 0.48 : 0.72 });
    burst(mx, my, quiet ? 2 : 4, quiet ? 80 : 140, quiet ? '#F7CF16' : smg.tint, quiet ? 1.3 : 1.9, 0.14);
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
    for (const d of game.pools.deploys || []) {
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
      explodeAt(d.x, d.y, 'grenade', d.friendly === false, 0.5);
    }

    for (const d of game.pools.drones || []) {
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
        const target = supportTarget(d, 1300, false);
        if (!target) {
          d.vx = approach(d.vx, Math.cos(d.angle) * 58, 6, dt);
          d.vy = approach(d.vy, Math.sin(d.angle) * 58, 6, dt);
          d.angle += dt * 1.8;
          moveCollide(game.level, d, d.vx * dt, d.vy * dt, 6);
          continue;
        }
        d.target = target.enemy || null;
        const td = dist(d.x, d.y, target.x, target.y);
        const ta = Math.atan2(target.y - d.y, target.x - d.x);
        const visible = hasLineOfSight(game.level, d.x, d.y, target.x, target.y);
        d.angle += angDelta(d.angle, ta) * Math.min(1, 18 * dt);
        if ((visible && td < 54) || td < 24) {
          d.blastT += dt;
          if (d.blastT > 0.08) {
            detonateDrone(d);
            continue;
          }
        } else {
          d.blastT = 0;
        }
        if (d.navT <= 0 || visible) {
          if (visible) {
            d.navX = Math.cos(ta);
            d.navY = Math.sin(ta);
          } else {
            const nav = game.pathDirToPoint(d, target.x, target.y, 6);
            d.navX = nav.x;
            d.navY = nav.y;
          }
          d.navT = 0.12 + rnd() * 0.08;
        }
        const speed = visible ? 285 : 230;
        d.vx = approach(d.vx, d.navX * speed, 12, dt);
        d.vy = approach(d.vy, d.navY * speed, 12, dt);
        moveCollide(game.level, d, d.vx * dt, d.vy * dt, 6);
        if (dist(d.x, d.y, target.x, target.y) < 44 && hasLineOfSight(game.level, d.x, d.y, target.x, target.y)) {
          detonateDrone(d);
        }
        continue;
      }
      const target = supportTarget(d, 920, false);
      if (!target) {
        d.vx = approach(d.vx, Math.cos(d.angle) * 28, 4, dt);
        d.vy = approach(d.vy, Math.sin(d.angle) * 28, 4, dt);
        d.angle += dt * 0.8;
        moveCollide(game.level, d, d.vx * dt, d.vy * dt, 6);
        continue;
      }
      const visible = hasLineOfSight(game.level, d.x, d.y, target.x, target.y);
      const td = dist(d.x, d.y, target.x, target.y);
      const ta = Math.atan2(target.y - d.y, target.x - d.x);
      d.angle += angDelta(d.angle, ta) * Math.min(1, 12 * dt);

      let nx = 0, ny = 0, speed = 0;
      if (visible && td < 205) {
        const side = ((d.spin * 1000) | 0) % 2 ? 1 : -1;
        nx = Math.cos(ta + Math.PI / 2) * side;
        ny = Math.sin(ta + Math.PI / 2) * side;
        speed = 92;
        if (td < 132) { nx -= Math.cos(ta) * 0.75; ny -= Math.sin(ta) * 0.75; }
      } else {
        if (d.navT <= 0 || visible) {
          const nav = game.pathDirToPoint(d, target.x, target.y, 6);
          d.navX = nav.x; d.navY = nav.y;
          d.navT = 0.18 + rnd() * 0.1;
        }
        nx = d.navX; ny = d.navY;
        speed = 184;
      }
      d.vx = approach(d.vx, nx * speed, 9, dt);
      d.vy = approach(d.vy, ny * speed, 9, dt);
      moveCollide(game.level, d, d.vx * dt, d.vy * dt, 6);

      if (visible && td < 540 && d.fireTimer <= 0) {
        if (fireSupportBullet(d, target, true)) {
          d.fireTimer = Math.max(0.16, smg.rate * 1.9);
          if (d.ammo <= 0) armDroneSelfDestruct(d);
        }
      }
    }
  }
  game.updateDeploys = updateDeploys;

  // one attack routine for every armed thing on the board
  function doAttack(actor, weaponKey) {
    const w = WEAPONS[weaponKey];
    const statusEffect = activeAttackEffect(actor, weaponKey, 'direct');
    if (w.melee) {
      sfx.swing();
      let hit = false;
      for (const e of game.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        if (actor === game.player && e.friendly) continue;
        const d = dist(actor.x, actor.y, e.x, e.y);
        if (d > w.reach + 10) continue;
        const a = Math.atan2(e.y - actor.y, e.x - actor.x);
        if (Math.abs(angDelta(actor.aim, a)) > 1.0) continue;
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
      for (const win of game.level.windows) {
        if (win.broken) continue;
        const d = dist(actor.x, actor.y, win.x, win.y);
        if (d > w.reach + 20) continue;
        const a = Math.atan2(win.y - actor.y, win.x - actor.x);
        if (Math.abs(angDelta(actor.aim, a)) > 1.0) continue;
        smashWindow(win, Math.cos(a), Math.sin(a));
      }
      if (hit) noise(actor.x, actor.y, w.noise);
      return true;
    }
    if (w.projectile) {
      launchProjectile(actor, actor.aim, weaponKey, actor === game.player, statusEffect);
      const mx = actor.x + Math.cos(actor.aim) * 19, my = actor.y + Math.sin(actor.aim) * 19;
      if (!w.silent) {
        game.flashes.push({ x: mx, y: my, a: actor.aim, t: 0, dur: 0.11, size: 1.25 });
        burst(mx, my, 6, 180, '#F7CF16', 2.5, 0.18);
        shake(5);
        noise(actor.x, actor.y, w.noise);
        sfx.revolver(0.35);
      } else {
        burst(mx, my, 2, 55, w.tint || '#7AC943', 1.2, 0.18);
      }
      return true;
    }
    for (let i = 0; i < w.pellets; i++) {
      const b = spawnFrom(game.pools.bullets);
      if (!b) break;
      const a = actor.aim + (rnd() - 0.5) * w.spread * (w.pellets > 1 ? 2 : 1);
      b.alive = true;
      b.x = actor.x + Math.cos(a) * 16; b.y = actor.y + Math.sin(a) * 16;
      b.vx = Math.cos(a) * w.speed * (0.9 + rnd() * 0.2);
      b.vy = Math.sin(a) * w.speed * (0.9 + rnd() * 0.2);
      b.life = w.life || 1.6; b.friendly = true; b.pierce = w.pierce || (w.rail ? 999 : 0);
      b.shieldDmg = w.shieldDmg ?? 1;
      b.armourPierce = w.armourPierce || 0;
      b.throughDoors = !!w.throughDoors; b.hitDoor = null;
      b.throughWalls = !!w.throughWalls; b.wallPierced = 0;
      b.owner = null; b.near = 0;
      b.statusEffect = statusEffect || null;
      b.weapon = weaponKey; b.projectile = null; b.explosive = false;
      b.ricochet = !!w.ricochet; b.bounces = w.bounces || 0;
    }
    const mx = actor.x + Math.cos(actor.aim) * 19, my = actor.y + Math.sin(actor.aim) * 19;
    if (!w.silent) {
      game.flashes.push({ x: mx, y: my, a: actor.aim, t: 0, dur: w.pellets > 1 ? 0.1 : 0.07, size: w.pellets > 1 ? 1.5 : 1 });
      burst(mx, my, 5, 200, '#F7CF16', 2.2, 0.16);
      ejectCasing(actor.x, actor.y, actor.aim);
      shake(w.pellets > 1 ? 9 : 3.2);
      noise(actor.x, actor.y, w.noise);
      // how full the magazine still is, so the report can ride up as it empties
      const t = clamp((actor.ammo ?? w.ammo) / w.ammo, 0, 1);
      if (weaponKey === 'shotgun') sfx.shotgun(t);
      else if (weaponKey === 'smg') sfx.smg(t);
      else if (weaponKey === 'revolver') sfx.revolver(t);
      else sfx.shot(t);
    } else {
      burst(mx, my, 2, 55, w.tint || '#7AC943', 1.2, 0.18);
    }
    return true;
  }

  function useCopySauce() {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    const sideEffect = weaponStatusEffect(p.offhandWeapon);
    const extract = extractKeyForEffect(sideEffect);
    p.attackCd = (w.rate || 0.34) * (game.playerStats.attackRate || 1);
    if (!extract) {
      game.banner = '副手没有可复制效果';
      game.bannerT = 0.75;
      sfx.empty();
      return false;
    }
    setMainSlot(p, extract, WEAPONS[extract].ammo || 1);
    game.floorLoadout = stashPlayerWeapon() || game.floorLoadout;
    game.banner = `提取：${WEAPONS[extract].name}`;
    game.bannerT = 0.85;
    burst(p.x, p.y, 18, 160, WEAPONS[extract].tint || '#00D6FF', 2.4, 0.48);
    sfx.status();
    return true;
  }

  function useExtractOnPlayer() {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    const effect = w.extractEffect;
    p.attackCd = (w.rate || 0.34) * (game.playerStats.attackRate || 1);
    p.ammo = Math.max(0, (p.ammo || 1) - 1);
    applyStatusEffectToPlayer(effect, 5.8);
    burst(p.x, p.y, 16, 160, w.tint || '#7AC943', 2.3, 0.5);
    sfx.status();
    if (p.ammo <= 0) setMainSlot(p, 'fists', 0);
    if (game.mode === 'defense') game.floorLoadout = stashPlayerWeapon();
    return true;
  }

  function playerAttack() {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    if (p.attackCd > 0) return;
    const rateScale = game.playerStats.attackRate || 1;
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
    if (p.ammo <= 0) { p.attackCd = 0.18; sfx.empty(); return; }
    p.attackCd = w.rate * rateScale;
    p.ammo--;
    doAttack(p, p.weapon);
    if (game.mode === 'defense') game.floorLoadout = stashPlayerWeapon();
    p.vx -= Math.cos(p.aim) * w.kick * 12;
    p.vy -= Math.sin(p.aim) * w.kick * 12;
  }

  function throwLobbedFromHand(charge = 0) {
    const p = game.player;
    const w = WEAPONS[p.weapon];
    if (!w || !w.lobbed || p.attackCd > 0) return false;
    if (p.ammo <= 0) { p.attackCd = 0.18; sfx.empty(); return false; }
    p.attackCd = w.rate * (game.playerStats.attackRate || 1);
    p.ammo--;
    spawnThrown(p, p.weapon, p.ammo, charge);
    if (p.ammo <= 0 && !game.refillEnabled) { p.weapon = 'fists'; p.ammo = 0; }
    if (game.mode === 'defense') game.floorLoadout = stashPlayerWeapon();
    return true;
  }

  function spawnThrown(actor, kind, ammo, charge = 0) {
    const t = spawnFrom(game.pools.thrown);
    if (!t) return;
    const w = WEAPONS[kind] || WEAPONS.pistol;
    const lobbed = !!w.lobbed;
    const st = lobbed ? throwStats(charge) : { charge: 0, power: 1, effectScale: 1 };
    const statusEffect = activeAttackEffect(actor, kind, lobbed ? 'direct' : 'thrown');
    const shrapnelEffect = lobbed && kind === 'frag'
      ? activeAttackEffect(actor, kind, 'shrapnel')
      : null;
    t.alive = true;
    t.kind = kind; t.ammo = ammo; t.spin = 0;
    if (lobbed) {
      const target = resolveLobTarget(actor, kind, charge);
      const dx = target.x - target.startX, dy = target.y - target.startY;
      const d = Math.hypot(dx, dy);
      const flight = clamp(0.22 + d / (w.throwSpeed || 640), 0.32, 1.55);
      t.x = target.startX; t.y = target.startY;
      t.vx = dx / flight; t.vy = dy / flight;
      t.life = flight; t.maxLife = flight;
      t.targetX = target.x; t.targetY = target.y;
    } else {
      const sp = w.throwSpeed || 900;
      t.x = actor.x + Math.cos(actor.aim) * 14; t.y = actor.y + Math.sin(actor.aim) * 14;
      t.vx = Math.cos(actor.aim) * sp; t.vy = Math.sin(actor.aim) * sp;
      t.life = w.blade ? (w.life || 14) : 1.6; t.maxLife = t.life;
      t.targetX = NaN; t.targetY = NaN;
    }
    t.charge = st.charge; t.power = st.power; t.effectScale = 1;
    t.statusEffect = statusEffect || null;
    t.shrapnelEffect = shrapnelEffect || null;
    t.friendly = actor === game.player;
    t.noPickup = !!w.noPickup;
    if (!w.silent) sfx.throwIt();
    shake(2);
    triggerSlow('throw');
  }

  function spawnSawBlade(actor) {
    const t = spawnFrom(game.pools.thrown);
    if (!t) return false;
    const w = WEAPONS.sawblade;
    const sp = w.throwSpeed || 980;
    t.alive = true;
    t.x = actor.x + Math.cos(actor.aim) * 18; t.y = actor.y + Math.sin(actor.aim) * 18;
    t.vx = Math.cos(actor.aim) * sp; t.vy = Math.sin(actor.aim) * sp;
    t.kind = 'sawblade'; t.ammo = 0; t.spin = actor.aim; t.life = w.life || 14;
    t.maxLife = t.life; t.targetX = NaN; t.targetY = NaN;
    t.charge = 0; t.power = 1; t.effectScale = 1; t.statusEffect = null; t.shrapnelEffect = null; t.friendly = actor === game.player;
    t.noPickup = true;
    burst(t.x, t.y, 6, 150, w.tint || '#161513', 1.8, 0.24);
    sfx.throwIt();
    return true;
  }

  function throwWeapon(charge = 0) {
    const p = game.player;
    if (p.weapon === 'fists') return;
    const w = WEAPONS[p.weapon];
    if ((w?.katana || w?.lance) && p.katanaT > 0) { sfx.empty(); return; }
    if (!w || w.noThrow) { sfx.empty(); return; }
    spawnThrown(p, p.weapon, p.ammo, charge);
    p.weapon = 'fists'; p.ammo = 0;
    if (game.mode === 'defense') game.floorLoadout = stashPlayerWeapon();
  }

  // -- doors ----------------------------------------------------------------
  function updateDoors(dt) {
    const doors = game.level.doors;
    for (const d of doors) {
      let near = false, ox = 0, oy = 0;
      const p = game.player;
      if (p.alive && Math.abs(p.x - d.x) < 40 && Math.abs(p.y - d.y) < 40) { near = true; ox = p.x; oy = p.y; }
      if (!near) {
        for (const e of game.pools.enemies) {
          if (!e.alive || e.state === S_DEAD) continue;
          if (Math.abs(e.x - d.x) < 40 && Math.abs(e.y - d.y) < 40) { near = true; ox = e.x; oy = e.y; break; }
        }
      }
      // a door swings away from whoever is pushing it. lock the direction while
      // it is shut so it cannot flip halfway through opening.
      if (near && d.open < 0.2) d.swing = d.horiz ? (oy < d.y ? 1 : -1) : (ox > d.x ? 1 : -1);
      d.open = approach(d.open, near ? 1 : 0, near ? 11 : 2.6, dt);
      if (d.slam > 0) d.slam = Math.max(0, d.slam - dt * 3.5);
    }
  }

  // dashing into a shut door is the loudest, best opener on the floor
  function checkDoorSlam(actor, dirx, diry) {
    for (const d of game.level.doors) {
      if (d.open > 0.55) continue;
      if (dist(actor.x, actor.y, d.x, d.y) > 44) continue;
      const toDoor = Math.atan2(d.y - actor.y, d.x - actor.x);
      const moving = Math.atan2(diry, dirx);
      if (Math.abs(angDelta(moving, toDoor)) > 1.2) continue;
      d.open = 1; d.slam = 1;
      d.swing = d.horiz ? (actor.y < d.y ? 1 : -1) : (actor.x > d.x ? 1 : -1);
      noise(d.x, d.y, 380, '#EC0A63');
      shake(13);
      hitstop(0.05);
      sfx.slam();
      triggerSlow('slam');
      burst(d.x, d.y, 12, 300, '#161513', 3, 0.5);
      for (const e of game.pools.enemies) {
        if (!e.alive || e.state === S_DEAD || e.state === S_DOWN) continue;
        if (dist(e.x, e.y, d.x, d.y) > 58) continue;
        const a = Math.atan2(e.y - d.y, e.x - d.x);
        knockdown(e, Math.cos(a), Math.sin(a));
      }
      return true;
    }
    return false;
  }

  // -- per-frame ------------------------------------------------------------
  function updatePlayer(dt) {
    const p = game.player;
    const inp = game.input;
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
    } else if (inp.hasAim) {
      // Thumb aiming can't be precise, so it gets help: the stick picks a
      // direction and the game snaps it onto the nearest thing actually there.
      let best = inp.aimAngle, bd = 0.44;
      for (const e of game.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        if (e.friendly) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > 500) continue;
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const off = Math.abs(angDelta(inp.aimAngle, a));
        if (off < bd && hasLineOfSight(game.level, p.x, p.y, e.x, e.y)) { bd = off; best = a; }
      }
      p.aim = best;
    } else {
      const wx = (inp.mx - renderer.W / 2) / ZOOM + game.camera.x;
      const wy = (inp.my - renderer.H / 2) / ZOOM + game.camera.y;
      p.aim = Math.atan2(wy - p.y, wx - p.x);
    }

    let ix, iy;
    if (playerMad) {
      if (madTarget) {
        const dx = madTarget.x - p.x, dy = madTarget.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        ix = dx / l; iy = dy / l;
      } else {
        ix = Math.cos(p.aim); iy = Math.sin(p.aim);
      }
    } else if (inp.analog) {
      ix = inp.axisX; iy = inp.axisY;
    } else {
      ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const l = Math.hypot(ix, iy) || 1;
      ix /= l; iy /= l;
    }

    if (p.katanaT > 0) {
      updateKatanaDash(dt);
    } else if (p.dashT > 0) {
      p.dashT -= dt;
      const sp = 1000 * (0.4 + p.dashT / 0.14);
      moveCollide(game.level, p, p.dashX * sp * dt, p.dashY * sp * dt, 9);
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();
      checkDoorSlam(p, p.dashX, p.dashY);
      const pane = game.level.windowAtPoint(p.x + p.dashX * 14, p.y + p.dashY * 14);
      if (pane) smashWindow(pane, p.dashX, p.dashY);
      for (const e of game.pools.enemies) {
        if (!e.alive || e.state === S_DEAD) continue;
        if (e.friendly) continue;
        if (dist(p.x, p.y, e.x, e.y) > ENEMY_DEF[e.type].r + 13) continue;
        if (shieldBlocks(e, p.x, p.y)) {
          // ran into the shield. you bounce, but the shield takes it too.
          damageShield(e, 1, true, p.x, p.y);
          p.dashT = 0;
          p.vx = -p.dashX * 300; p.vy = -p.dashY * 300;
          moveCollide(game.level, p, -p.dashX * 16, -p.dashY * 16, 9);
          hitstop(0.06);
          break;
        }
        if (killEnemy(e, 1.2, p.dashX, p.dashY)) p.dashT = Math.min(0.2, p.dashT + 0.055);
      }
      if (p.dashT <= 0) { p.vx = p.dashX * 320; p.vy = p.dashY * 320; }
    } else {
      if (p.trail.length) p.trail.shift();
      if (ix || iy) game.didMove = true;
      p.vx = approach(p.vx, ix * 272, 18, dt);
      p.vy = approach(p.vy, iy * 272, 18, dt);
      moveCollide(game.level, p, p.vx * dt, p.vy * dt, 9);
    }

    const maxDash = p.maxDash || MAX_DASH;
    const dashCdMax = p.dashCdMax || DASH_CD;
    if (p.dashCharges < maxDash) {
      p.dashCd -= dt;
      if (p.dashCd <= 0) { p.dashCharges++; p.dashCd = dashCdMax; }
    }
    if (p.swapCd > 0) p.swapCd = Math.max(0, p.swapCd - dt);
    if (playerMad) {
      inp.swap = false;
      inp.dash = false;
      inp.throwHeld = false;
      inp.throwReleased = false;
      inp.throwIt = false;
      inp.fireReleased = false;
    }
    if (!playerMad && inp.swap) {
      inp.swap = false;
      if (swapPlayerWeapon()) game.didAttack = true;
    }
    if (!playerMad && inp.dash && p.dashCharges > 0 && p.dashT <= 0 && p.katanaT <= 0) {
      inp.dash = false;
      const dx = ix || Math.cos(p.aim), dy = iy || Math.sin(p.aim);
      const dl = Math.hypot(dx, dy) || 1;
      p.dashX = dx / dl; p.dashY = dy / dl;
      p.dashT = 0.14;
      p.dashCharges--;
      if (p.dashCd <= 0) p.dashCd = dashCdMax;
      p.trail.length = 0;
      burst(p.x, p.y, 6, 150, '#12A3DA', 2.4, 0.3);
      sfx.dash();
      shake(2);
      triggerSlow('dash');
    }

    p.attackCd -= dt;
    if (p.swing > 0) p.swing -= dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.blockFlash > 0) p.blockFlash -= dt;

    const held = WEAPONS[p.weapon] || WEAPONS.fists;
    const manualFire = !playerMad && inp.fire;
    const autoMadFire = playerMad && madTarget && hasLineOfSight(game.level, p.x, p.y, madTarget.x, madTarget.y);
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
    const chargingThrow = p.weapon !== 'fists' && !held.noThrow && inp.throwHeld;
    if (chargingKatana) {
      game.throwCharge = Math.min(held.chargeMax || THROW_CHARGE_MAX, game.throwCharge + dt);
      const ratio = katanaChargeRatio(held, game.throwCharge);
      game.throwPreview = held.katana && ratio >= 0.98 ? estimateKatana(p, game.throwCharge) : null;
    } else if (chargingLob || chargingThrow) {
      game.throwCharge = Math.min(THROW_CHARGE_MAX, game.throwCharge + dt);
      game.throwPreview = estimateThrow(p, p.weapon, game.throwCharge);
    }

    if (inp.fireReleased) {
      inp.fireReleased = false;
      if (held.katana || held.lance) {
        if (releaseKatanaCharge(game.throwCharge)) game.didAttack = true;
        game.throwCharge = 0; game.throwPreview = null;
      } else if (held.lobbed) {
        if (throwLobbedFromHand(game.throwCharge)) game.didAttack = true;
        game.throwCharge = 0; game.throwPreview = null;
      }
    }
    if (inp.throwReleased) {
      inp.throwReleased = false;
      if (p.weapon !== 'fists') {
        throwWeapon(game.throwCharge);
        game.didAttack = true;
      }
      game.throwCharge = 0; game.throwPreview = null;
    }
    if (inp.throwIt) {
      inp.throwIt = false;
      if (p.weapon !== 'fists') {
        throwWeapon(game.throwCharge);
        game.didAttack = true;
      }
      game.throwCharge = 0; game.throwPreview = null;
    }
    if (!chargingKatana && !chargingLob && !chargingThrow && !inp.fireReleased && !inp.throwReleased && !inp.throwIt) {
      game.throwCharge = 0;
      game.throwPreview = null;
    }

    const currentHeld = WEAPONS[p.weapon] || WEAPONS.fists;
    if ((manualFire || autoMadFire) && !currentHeld.lobbed && !currentHeld.katana && !currentHeld.lance && p.katanaT <= 0) { playerAttack(); game.didAttack = true; }
    for (const k of game.pools.pickups) {
      if (!k.alive) continue;
      if (dist(p.x, p.y, k.x, k.y) < 20) {
        const took = givePlayerWeapon(p, k.kind, k.ammo, false);
        if (!took) continue;
        k.alive = false;
        if (game.mode === 'defense') game.floorLoadout = stashPlayerWeapon();
        const got = WEAPONS[k.kind];
        game.banner = got?.offhandOnly || p.offhandWeapon === k.kind ? `副手 ${got.name}` : `拾取 ${got?.name || k.kind}`;
        game.bannerT = 0.55;
        sfx.pickup();
        break;
      }
    }
  }

  function detonateBullet(b) {
    if (!b.alive) return;
    const weaponKey = b.weapon || 'rocket';
    const byEnemy = !b.friendly || !!(b.owner && b.owner.friendly);
    b.alive = false;
    explodeAt(b.x, b.y, weaponKey, byEnemy, 1, b.statusEffect || null);
  }

  function ricochetBullet(b, px, py, sx, sy) {
    if (!b.ricochet || b.bounces <= 0) return false;
    b.x = px; b.y = py;
    const hitX = game.level.bulletBlockedAt(px + sx, py);
    const hitY = game.level.bulletBlockedAt(px, py + sy);
    let vx = b.vx, vy = b.vy;
    if (hitX) vx = -vx;
    if (hitY) vy = -vy;
    if (!hitX && !hitY) { vx = -vx; vy = -vy; }
    const sp = Math.hypot(vx, vy) || 1;
    const a = Math.atan2(vy, vx) + (rnd() - 0.5) * 0.9;
    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
    b.bounces--;
    b.near = 1;
    burst(px, py, 5, 180, WEAPONS[b.weapon]?.tint || '#00D6FF', 1.8, 0.25);
    return true;
  }

  function playerShieldBlocksBullet(b, fromX = b.x, fromY = b.y) {
    const p = game.player;
    const closing = b.vx * (p.x - fromX) + b.vy * (p.y - fromY);
    return closing > 0 && heldShieldBlocks(p, fromX, fromY);
  }

  function bulletPlayerContact(b, px, py) {
    const p = game.player;
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
    const p = game.player;
    b.alive = false;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    blockOnHeldShield(p, b.x, b.y, !!b.explosive || WEAPONS[b.weapon]?.rail);
    p.vx += (b.vx / sp) * 70;
    p.vy += (b.vy / sp) * 70;
  }

  function updateBullets(dt) {
    for (const b of game.pools.bullets) {
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
        b.x += sx; b.y += sy;
        const pane = game.level.windowAtPoint(b.x, b.y);
        if (pane) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          smashWindow(pane, b.vx / sp, b.vy / sp);
        }
        if (game.level.bulletBlockedAt(b.x, b.y)) {
          if (b.explosive) { detonateBullet(b); break; }
          if (ricochetBullet(b, px, py, sx, sy)) continue;
          if (b.throughWalls && b.x >= 0 && b.y >= 0 && b.x <= game.level.w && b.y <= game.level.h) {
            if (!b.wallPierced) {
              b.wallPierced = 1;
              burst(b.x, b.y, 6, 150, WEAPONS[b.weapon]?.tint || '#161513', 1.8, 0.24);
              shake(1.2);
            }
            continue;
          }
          // a heavy round goes through a shut door and keeps going
          // going through timber costs nothing — pierce is for bodies
          const door = b.throughDoors ? game.level.doorAtPoint(b.x, b.y) : null;
          if (door) {
            if (b.hitDoor !== door) {
              b.hitDoor = door;
              door.slam = Math.max(door.slam, 0.5);
              renderer.shards(b.x, b.y, b.vx, b.vy);
              burst(b.x, b.y, 9, 190, '#161513', 2.4, 0.4);
              noise(b.x, b.y, 260);
              sfx.splinter();
              shake(3);
            }
          } else {
            b.alive = false;
            burst(b.x, b.y, 5, 130, '#161513', 1.8, 0.26);
            break;
          }
        }
        // a bullet does not care who fired it
        let stop = false;
        for (const e of game.pools.enemies) {
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
            if (b.explosive) { b.x = fx; b.y = fy; detonateBullet(b); }
            else b.alive = false;
            stop = true;
            break;
          }
          if (b.explosive && shieldBlocks(e, fx, fy)) {
            damageShield(e, b.shieldDmg ?? 2, true, fx, fy);
            b.x = fx; b.y = fy;
            detonateBullet(b); stop = true; break;
          }
          if (b.explosive) { detonateBullet(b); stop = true; break; }
          if (bw && bw.rail && !statusEffect) {
            killEnemy(e, 1.25, b.vx / sp, b.vy / sp, byOtherSide, b.owner);
            continue;
          }
          if (shieldBlocks(e, fx, fy)) {
            if (statusEffect) {
              burst(fx, fy, 3, 70, bw?.tint || EFFECT_TINT[statusEffect] || '#7AC943', 1.4, 0.22);
              b.alive = false; stop = true; break;
            }
            const col = shieldSegmentAt(e, fx, fy);
            const depth = col >= 0 ? columnDepth(e, col) : 0;
            const sp0 = Math.hypot(b.vx, b.vy) || 1;

            // A heavy round beats armour it can get all the way through: one
            // layer deep and it strips the plate and carries on into the body.
            // Thicker than that and it only sheds plates and stops.
            if (b.armourPierce && depth > 0 && depth <= b.armourPierce) {
              for (let L = 0; L < e.layers; L++) e.shieldSeg &= ~plateBit(e, L, col);
              e.shieldHp = shieldCount(e.shieldSeg);
              e.blockFlash = 0.25;
              burst(fx, fy, 8, 220, '#161513', 2.4, 0.35);
              sfx.splinter();
              killEnemy(e, 1.1, b.vx / sp0, b.vy / sp0, byOtherSide, b.owner);
            } else {
              damageShield(e, b.shieldDmg ?? 1, false, fx, fy);
            }
            b.alive = false; stop = true;
            break;
          }
          if (statusEffect) {
            applyAttackEffectToEnemy(e, statusEffect, b.x, b.y, b.owner || (b.friendly ? game.player : null));
            b.alive = false; stop = true;
            break;
          }
          killEnemy(e, 0.9, b.vx / sp, b.vy / sp, byOtherSide, b.owner);
          if (b.pierce > 0) b.pierce--;
          else { b.alive = false; stop = true; }
          break;
        }
        if (stop) break;

        if (!b.friendly) {
          if (game.player.alive) {
            const hit = bulletPlayerContact(b, px, py);
            if (b.explosive && hit.dp < 13) {
              if (playerShieldBlocksBullet(b, hit.fromX, hit.fromY)) {
                b.x = hit.fromX; b.y = hit.fromY;
                blockBulletOnPlayerShield(b);
                detonateBullet(b);
              } else detonateBullet(b);
              break;
            }
            if (hit.dp < 17 && playerShieldBlocksBullet(b, hit.fromX, hit.fromY)) { blockBulletOnPlayerShield(b); break; }
            if (hit.dp < 10) { b.alive = false; game.killPlayer(); break; }
            // a round that nearly took your head off is worth slowing down for
            if (hit.dp < 34 && !b.near && game.nearMissCd <= 0) {
              b.near = 1;
              game.nearMissCd = 0.9;
              triggerSlow('nearMiss');
            }
          }
        }
      }
    }
  }

  function updateThrown(dt) {
    for (const t of game.pools.thrown) {
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
        if (Number.isFinite(t.targetX)) { t.x = t.targetX; t.y = t.targetY; }
        t.alive = false;
        finishLobbed(t, w);
        continue;
      }
      const lethal = !!w.throwLethal;
      const subSteps = blade ? 8 : 4;
      for (let s = 0; s < subSteps; s++) {
        t.x += t.vx * dt / subSteps; t.y += t.vy * dt / subSteps;
        const pane = game.level.windowAtPoint(t.x, t.y);
        if (pane) {
          const l2 = Math.hypot(t.vx, t.vy) || 1;
          smashWindow(pane, t.vx / l2, t.vy / l2);
        }
        if (lobbed) {
          let bumped = false;
          for (const e of game.pools.enemies) {
            if (!e.alive || e.state === S_DEAD) continue;
            if (dist(t.x, t.y, e.x, e.y) < ENEMY_DEF[e.type].r + 10) {
              if (heldShieldBlocks(e, t.x - t.vx * 0.02, t.y - t.vy * 0.02) && !w.fire) {
                blockOnHeldShield(e, t.x - t.vx * 0.02, t.y - t.vy * 0.02, true);
              }
              if (Number.isFinite(t.targetX)) { t.targetX = t.x; t.targetY = t.y; }
              t.vx *= 0.12; t.vy *= 0.12;
              t.life = Math.min(t.life, 0.28);
              bumped = true;
              break;
            }
          }
          if (bumped) break;
          continue;
        }
        let hit = false;
        for (const e of game.pools.enemies) {
          if (!e.alive || e.state === S_DEAD) continue;
          if (dist(t.x, t.y, e.x, e.y) < ENEMY_DEF[e.type].r + 8) {
            const fx = t.x - t.vx * 0.02, fy = t.y - t.vy * 0.02;
            if (!blade && heldShieldBlocks(e, fx, fy)) {
              blockOnHeldShield(e, fx, fy, true);
              t.vx = 0; t.vy = 0;
              hit = true; break;
            }
            if (!blade && shieldBlocks(e, fx, fy)) {
              // a thrown weapon rocks them hard: two of the four plates, and a
              // long stagger you can walk straight through
              damageShield(e, 2, true, fx, fy);
              t.vx = 0; t.vy = 0;
              hit = true; break;
            }
            const l = Math.hypot(t.vx, t.vy) || 1;
            if (t.statusEffect) applyAttackEffectToEnemy(e, t.statusEffect, t.x, t.y, t.friendly ? game.player : null);
            else if (lethal) killEnemy(e, 1, t.vx / l, t.vy / l);
            else if (e.state !== S_DOWN) knockdown(e, t.vx / l, t.vy / l);
            else continue;
            if (blade) continue;
            hit = true;
            break;
          }
        }
        if (hit) { t.vx = 0; t.vy = 0; break; }
      }
      if (!lobbed || !Number.isFinite(t.targetX)) {
        t.vx = approach(t.vx, 0, blade ? 0.12 : lobbed ? 7 : 4, dt);
        t.vy = approach(t.vy, 0, blade ? 0.12 : lobbed ? 7 : 4, dt);
      }
      if (lobbed) {
        if (t.life <= 0) {
          if (Number.isFinite(t.targetX)) { t.x = t.targetX; t.y = t.targetY; }
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
    game.targets.length = 0;
    const p = game.player;
    if (!game.playerDisguised()) game.targets.push({ alive: p.alive, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  }

  function defenseShopWeapon() {
    return DEFENSE_SHOP_WEAPONS[game.defense.shopIndex % DEFENSE_SHOP_WEAPONS.length];
  }

  game.defenseShop = function () {
    const wave = Math.max(1, game.defense.wave || 1);
    const p = game.player;
    const stats = game.playerStats;
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
        slow: 40,
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
        slow: stats.slow < 1.899,
      },
    };
  };

  function buyDefense(slot) {
    if (game.mode !== 'defense') return false;
    if (!game.defense.between) {
      game.banner = '波次中无法购物';
      game.bannerT = 0.65;
      sfx.empty();
      return false;
    }
    const shop = game.defenseShop();
    const p = game.player;
    const deny = (msg) => {
      game.banner = msg;
      game.bannerT = 0.7;
      sfx.empty();
      return false;
    };
    const spend = (cost) => {
      if (game.defense.points < cost) {
        return deny(`积分不足 ${game.defense.points}/${cost}`);
      }
      game.defense.points -= cost;
      sfx.pickup();
      return true;
    };
    if (slot === 1) {
      const kind = shop.weapon;
      if (!spend(shop.costs.weapon)) return false;
      givePlayerWeapon(p, kind, WEAPONS[kind].ammo || 0, true);
      game.floorLoadout = stashPlayerWeapon();
      game.defense.shopIndex++;
      game.banner = WEAPONS[kind].offhandOnly || p.offhandWeapon === kind
        ? `购买副手 ${WEAPONS[kind].name}`
        : `购买 ${WEAPONS[kind].name}`;
    } else if (slot === 2) {
      if (!spend(shop.costs.refresh)) return false;
      game.defense.shopIndex += 1 + Math.floor(rnd() * 4);
      game.banner = `刷新：${WEAPONS[defenseShopWeapon()].name}`;
    } else if (slot === 3) {
      const w = WEAPONS[p.weapon];
      if (!shop.can.refill) return deny(w && !w.melee && w.ammo > 0 ? `${w.name} 已满弹` : '当前武器不能补弹');
      if (!spend(shop.costs.refill)) return false;
      p.ammo = w.ammo;
      game.floorLoadout = stashPlayerWeapon();
      game.banner = `${w.name} 弹药补满`;
    } else if (slot === 4) {
      if (!shop.can.heal) return deny('生命已满');
      if (!spend(shop.costs.heal)) return false;
      p.hp = p.maxHp;
      game.banner = `生命恢复 ${p.hp}/${p.maxHp}`;
    } else if (slot === 5) {
      if (!shop.can.hp) return deny('最大生命已满');
      if (!spend(shop.costs.hp)) return false;
      game.playerStats.maxHp = Math.min(8, game.playerStats.maxHp + 1);
      p.maxHp = game.playerStats.maxHp; p.hp = p.maxHp;
      game.banner = `血量 ${p.maxHp}`;
    } else if (slot === 6) {
      if (!shop.can.attack) return deny('攻击速度已满');
      if (!spend(shop.costs.attack)) return false;
      game.playerStats.attackRate = Math.max(0.55, game.playerStats.attackRate - 0.08);
      game.banner = `攻速 +${Math.round((1 / game.playerStats.attackRate - 1) * 100)}%`;
    } else if (slot === 7) {
      if (!shop.can.dash) return deny('冲刺槽已满');
      if (!spend(shop.costs.dash)) return false;
      game.playerStats.maxDash = Math.min(5, game.playerStats.maxDash + 1);
      p.maxDash = game.playerStats.maxDash;
      p.dashCharges = Math.min(p.maxDash, p.dashCharges + 1);
      game.banner = `冲刺槽 ${p.maxDash}`;
    } else if (slot === 8) {
      if (!shop.can.recover) return deny('冲刺恢复已满');
      if (!spend(shop.costs.recover)) return false;
      game.playerStats.dashCd = Math.max(0.45, game.playerStats.dashCd - 0.12);
      p.dashCdMax = game.playerStats.dashCd;
      game.banner = `恢复 ${game.playerStats.dashCd.toFixed(2)}s`;
    } else if (slot === 9) {
      if (!shop.can.slow) return deny('子弹时间已满');
      if (!spend(shop.costs.slow)) return false;
      game.playerStats.slow = Math.min(1.9, game.playerStats.slow + 0.15);
      game.banner = `子弹时间 ${game.playerStats.slow.toFixed(2)}x`;
    } else {
      return false;
    }
    game.bannerT = 0.85;
    return true;
  }
  game.buyDefense = buyDefense;

  game.toggleDefenseShop = function () {
    if (game.mode !== 'defense' || game.state !== 'play') return false;
    if (!game.defense.between) {
      game.banner = '清空本波后开放商店';
      game.bannerT = 0.65;
      sfx.empty();
      return false;
    }
    game.defense.shopOpen = !game.defense.shopOpen;
    sfx.status();
    return true;
  };

  game.endDefenseRest = function () {
    if (game.mode !== 'defense' || game.state !== 'play' || !game.defense.between) return false;
    spawnDefenseWave();
    return true;
  };

  function spawnDefenseWave() {
    const d = game.defense;
    d.wave++;
    d.between = false;
    d.nextWaveT = 0;
    d.shopOpen = false;
    const allPoints = game.level.spawnPoints || [];
    const playerRoom = game.level.roomAtPoint ? game.level.roomAtPoint(game.player.x, game.player.y) : -1;
    const notSameRoom = allPoints.filter((p0) => p0.room == null || p0.room !== playerRoom);
    const farEnough = notSameRoom.filter((p0) => dist(p0.x, p0.y, game.player.x, game.player.y) > TILE * 7);
    const hidden = farEnough.filter((p0) => !hasLineOfSight(game.level, game.player.x, game.player.y, p0.x, p0.y));
    const points = (hidden.length >= 3 ? hidden : farEnough.length ? farEnough : notSameRoom.length ? notSameRoom : allPoints);
    const count = Math.min(MAX_ENEMIES - 2, 4 + Math.floor(d.wave * 1.7));
    for (let i = 0; i < count; i++) {
      const p0 = points[i % points.length] || game.level.exit;
      let type = 'thug';
      if (d.wave >= 2 && i % 5 === 2) type = 'gunner';
      if (d.wave >= 3 && i % 6 === 3) type = 'hound';
      if (d.wave >= 4 && i % 7 === 4) type = 'shield';
      if (d.wave >= 5 && i % 8 === 5) type = 'patroller';
      let weapon = 'fists';
      if (type === 'thug') weapon = d.wave > 2 ? (i % 4 === 1 ? 'shield' : (i % 2 ? 'bat' : 'knife')) : (i % 5 === 1 ? 'shield' : 'bat');
      if (type === 'gunner') weapon = d.wave > 5 ? (i % 5 === 0 ? 'shield' : (i % 2 ? 'ripper' : 'smg')) : (i % 6 === 2 ? 'shield' : 'pistol');
      if (type === 'patroller') weapon = d.wave > 6 ? (i % 3 === 0 ? 'smg' : 'pistol') : 'knife';
      if (type === 'shield') weapon = d.wave > 6 ? (i % 2 ? 'shield' : 'pistol') : 'shield';
      const ox = (rnd() - 0.5) * TILE * 1.2;
      const oy = (rnd() - 0.5) * TILE * 1.2;
      spawnEnemy({
        x: clamp(p0.x + ox, TILE * 1.5, game.level.w - TILE * 1.5),
        y: clamp(p0.y + oy, TILE * 1.5, game.level.h - TILE * 1.5),
        type,
        weapon,
        armour: type === 'shield' ? Math.min(10, 3 + Math.floor(d.wave / 2)) : 0,
        angle: Math.atan2(game.player.y - p0.y, game.player.x - p0.x),
      });
    }
    game.enemiesLeft = hostilesLeft();
    game.raiseAlarm(game.player.x, game.player.y);
    computeFlow();
    game.banner = `第 ${d.wave} 波`;
    game.bannerT = 1.1;
  }

  function updateDefense(dt) {
    if (game.mode !== 'defense' || game.state !== 'play') return;
    const buy = game.input.buy;
    if (buy) {
      game.input.buy = null;
      buyDefense(buy);
    }
    const d = game.defense;
    if (!d.between && game.enemiesLeft === 0) {
      d.between = true;
      d.nextWaveT = DEFENSE_REST_SECONDS;
      d.shopOpen = true;
      d.cleared = d.wave;
      const bonus = 18 + d.wave * 7;
      d.points += bonus;
      game.banner = `第 ${d.wave} 波清空 +${bonus} · 休息`;
      game.bannerT = 1.1;
      sfx.clear();
    }
    if (d.between) {
      d.nextWaveT -= dt;
      if (d.nextWaveT <= 0) spawnDefenseWave();
    }
  }

  // -------------------------------------------------------------------------
  function step(rdt) {
    if (game.paused) {
      setTimeScale(0);
      return;
    }
    game.ticks++;
    game.time += rdt;
    if (game.state === 'play' || game.state === 'dying') game.runT += rdt;
    if (game.bannerT > 0) game.bannerT -= rdt;
    if (game.tutorialT > 0) {
      game.tutorialT -= rdt;
      // once they have both moved and hit something, get out of the way
      if (game.didMove && game.didAttack) game.tutorialT = Math.min(game.tutorialT, 1.2);
    }
    if (game.flash > 0) game.flash = Math.max(0, game.flash - rdt * 3.2);
    if (game.dashFlash > 0) game.dashFlash = Math.max(0, game.dashFlash - rdt * 3);

    // HUD readouts settle toward the truth rather than jumping to it
    const ui = game.ui;
    const span0 = TOTAL_TARGET - WIN_AT;
    const gTarget = clamp((TOTAL_TARGET - game.remaining) / span0, 0, 1);
    [ui.gauge, ui.gaugeV] = springTo(ui.gauge, ui.gaugeV, gTarget, rdt, 0.45);
    const cTarget = game.combo > 1 ? clamp(game.comboTimer / 3.2, 0, 1) : 0;
    [ui.chain, ui.chainV] = springTo(ui.chain, ui.chainV, cTarget, rdt, 0.25);
    if (ui.chainPunch > 0) ui.chainPunch = Math.max(0, ui.chainPunch - rdt * 4.2);
    [ui.chainOpen, ui.chainOpenV] =
      springTo(ui.chainOpen, ui.chainOpenV, game.combo > 1 ? 1 : 0, rdt, 0.2, 0.72);
    [ui.code, ui.codeV] = springTo(ui.code, ui.codeV, game.remaining, rdt, 0.4);

    if (game.state === 'dying') {
      game.deathT -= rdt;
      game.worldScale = 0.08;
      if (game.deathT <= 0) restartFloor();
    }

    const p = game.player;
    if (game.nearMissCd > 0) game.nearMissCd -= rdt;
    if (game.slowCd > 0) game.slowCd -= rdt;

    if (game.slowT > 0) {
      game.slowT -= rdt;
      if (game.slowT <= 0) { game.slowT = 0; game.slowScale = 1; sfx.focusOut(); }
    }
    const dilating = game.slowT > 0;

    let ts = dilating ? game.slowScale : 1;
    if (game.state === 'dying') ts = 0.08;
    const frozen = game.hitstop > 0;
    if (frozen) { game.hitstop -= rdt; ts = 0.03; }
    game.worldScale = ts;
    setTimeScale(ts);
    const splitScale = game.reducedMotion ? 0.35 : 1;
    game.plateSplit = approach(game.plateSplit, ((1 - ts) * 6.2 + (frozen ? 4 : 0)) * splitScale, 22, rdt);

    const wdt = Math.min(0.05, rdt * ts);
    const katanaDashing = game.player.katanaT > 0;
    // inside ordinary dilations you keep most of your speed; katana dash time
    // itself obeys bullet time so the reset after a kill is visible and useful.
    const playerScale = dilating && !frozen && !katanaDashing ? Math.max(ts, PLAYER_SLOW_FLOOR) : ts;
    const pdt = Math.min(0.05, rdt * playerScale);

    if (game.state === 'play') {
      updatePlayer(pdt);
      if (game.comboTimer > 0) {
        game.comboTimer -= wdt;
        if (game.comboTimer <= 0) game.combo = 0;
      }
    }

    refreshTargets();

    game.flowT -= wdt;
    if (game.flowT <= 0) { game.flowT = 0.16; computeFlow(); }

    for (const e of game.pools.enemies) if (e.alive) updateEnemy(game, e, wdt);
    updateDeploys(wdt);
    updateBullets(wdt);
    updateThrown(wdt);
    updateFireZones(wdt);
    updateInfections(wdt);
    updateDoors(wdt);
    updateDefense(wdt);

    for (const n of game.noiseRings) n.t += wdt;
    game.noiseRings = game.noiseRings.filter((n) => n.t < n.dur);

    for (const pt of game.particles) {
      pt.life -= wdt;
      pt.x += pt.vx * wdt; pt.y += pt.vy * wdt;
      pt.vx *= 1 - 4 * wdt; pt.vy *= 1 - 4 * wdt;
      pt.rot += pt.spin * wdt;
      if (pt.casing && pt.life <= 0) renderer.casing(pt.x, pt.y, pt.rot);
    }
    if (game.particles.length) game.particles = game.particles.filter((pt) => pt.life > 0);

    for (const f of game.flashes) f.t += wdt;
    if (game.flashes.length) game.flashes = game.flashes.filter((f) => f.t < f.dur);

    // the counter is the page's status code, walked down one body at a time
    const prev = game.remaining;
    game.remaining = Math.max(0, TOTAL_TARGET - game.kills);
    game.statusLabel = statusFor(game.remaining);
    if (game.remaining < prev) {
      const label = STATUS[game.remaining];
      if (label) {
        if (REC.statusBanner) {
          game.banner = `${game.remaining} ${label}`;
          game.bannerT = 1.8;
        }
        sfx.status();
      }
      if (!game.infinite && game.remaining <= WIN_AT && !game.won) {
        game.won = true;
        game.state = 'won';
        game.paused = false;
        game.banner = null;
        triggerSlow('lastKill');
        sfx.clear();
        if (game.score > game.bestScore) {
          game.bestScore = game.score;
          localStorage.setItem('overprint.best', String(game.score));
        }
        localStorage.setItem('overprint.won', '1');
        // the run is over, so it finally has a time worth recording
        game.runResult = { time: game.runT, score: game.score };
        game.best = saveBest(game.board, game.runResult);
        return;
      }
    }

    if (game.mode === 'endless' && game.state === 'play' && game.enemiesLeft === 0 && p.alive) {
      if (dist(p.x, p.y, game.level.exit.x, game.level.exit.y) < 26) {
        const timeTaken = game.time - game.floorStartTime;
        const bonus = Math.max(0, Math.round(1400 - timeTaken * 45)) + game.floor * 250;
        game.score = Math.max(0, game.score + bonus);
        if (game.score > game.bestScore) {
          game.bestScore = game.score;
          localStorage.setItem('overprint.best', String(game.score));
        }
        if (game.floor > game.bestFloor) {
          game.bestFloor = game.floor;
          localStorage.setItem('overprint.floor', String(game.floor));
        }
        startFloor(true);
      }
    }

    if (game.state === 'title') {
      const a = game.time * 0.11;
      const hw = renderer.W / (2 * ZOOM), hh = renderer.H / (2 * ZOOM);
      const cx = game.level.w / 2, cy = game.level.h / 2;
      game.camera.x = clamp(cx + Math.cos(a) * game.level.w * 0.26, hw, Math.max(hw, game.level.w - hw));
      game.camera.y = clamp(cy + Math.sin(a * 1.3) * game.level.h * 0.24, hh, Math.max(hh, game.level.h - hh));
      game.plateSplit = approach(game.plateSplit, 1.6 + Math.sin(game.time * 0.7) * 1.2, 6, rdt);
      return;
    }

    const halfW = renderer.W / (2 * ZOOM), halfH = renderer.H / (2 * ZOOM);
    // on touch the camera leads the aim stick instead of a cursor
    const lookX = game.input.hasAim
      ? Math.cos(p.aim) * 120
      : clamp((game.input.mx - renderer.W / 2) / ZOOM, -300, 300) * 0.28;
    const lookY = game.input.hasAim
      ? Math.sin(p.aim) * 90
      : clamp((game.input.my - renderer.H / 2) / ZOOM, -220, 220) * 0.28;
    const tx = clamp(p.x + lookX, halfW, Math.max(halfW, game.level.w - halfW));
    const ty = clamp(p.y + lookY, halfH, Math.max(halfH, game.level.h - halfH));
    game.camera.x = lerp(game.camera.x, tx, 1 - Math.exp(-9 * rdt));
    game.camera.y = lerp(game.camera.y, ty, 1 - Math.exp(-9 * rdt));
    if (game.reducedMotion) game.shake *= 0.25;
    if (game.shake > 0.05) {
      game.camera.x += (Math.random() - 0.5) * game.shake;
      game.camera.y += (Math.random() - 0.5) * game.shake;
      game.shake *= Math.exp(-9 * rdt);
    }

  }

  game.step = step;
  game.startFloor = startFloor;
  game.restartFloor = restartFloor;
  function resetTitlePreview() {
    game.floor = REC.floor || 1;
    choosePreviewSeed();
    game.floorLoadout = startingLoadout();
    game.paused = false;
    startFloor(false);
    game.state = 'title';
    game.player.alive = false;
    game.player.x = -99999; game.player.y = -99999;
    game.banner = null; game.bannerT = 0;
  }

  game.selectMode = function (id) {
    if (!['endless', 'practice', 'defense'].includes(id) || id === game.mode) return false;
    game.mode = id;
    localStorage.setItem('overprint.mode', id);
    game.codexOpen = false;
    game.playerStats = id === 'defense' ? defensePlayerStats() : defaultPlayerStats();
    game.defense = newDefenseState();
    game.best = loadBest(game.board);
    game.standings = null;
    resetTitlePreview();
    return true;
  };

  game.selectBoard = game.selectMode;

  game.cyclePracticeMap = function () {
    game.practice.map = (game.practice.map + 1) % game.practiceMaps.length;
    resetTitlePreview();
  };

  game.cyclePracticeWeapon = function () {
    const i = PRACTICE_WEAPONS.indexOf(game.practice.weapon);
    game.practice.weapon = PRACTICE_WEAPONS[(i + 1 + PRACTICE_WEAPONS.length) % PRACTICE_WEAPONS.length];
    resetTitlePreview();
  };

  game.cyclePracticeEnemy = function () {
    const i = PRACTICE_ENEMIES.indexOf(game.practice.enemy);
    game.practice.enemy = PRACTICE_ENEMIES[(i + 1 + PRACTICE_ENEMIES.length) % PRACTICE_ENEMIES.length];
    resetTitlePreview();
  };

  game.toggleCodex = function () {
    game.codexOpen = !game.codexOpen;
    if (game.codexOpen) game.codexScroll = 0;
    return game.codexOpen;
  };

  game.showTitle = function () {
    if (!['endless', 'practice', 'defense'].includes(game.mode)) game.mode = 'endless';
    game.playerStats = game.mode === 'defense' ? defensePlayerStats() : defaultPlayerStats();
    game.defense = newDefenseState();
    // read the stored best here too, or it appears out of nowhere the first
    // time something else happens to load it
    game.best = loadBest(game.board);
    resetTitlePreview();
  };
  game.begin = function () {
    initAudio();
    game.paused = false;
    const next = nextRunSeed();
    game.seed = next.seed;
    game.seedBase = next.base;
    game.customSeed = customSeedBase();
    game.runNo = next.runNo;
    game.best = loadBest(game.board);
    game.runT = 0;
    game.floor = REC.floor || 1; game.score = 0; game.kills = 0;
    game.combo = 0; game.bestCombo = 0;
    game.remaining = TOTAL_TARGET; game.won = false; game.statusLabel = '未找到';
    game.ui.gauge = 0; game.ui.gaugeV = 0; game.ui.chain = 0; game.ui.chainV = 0;
    game.ui.chainPunch = 0; game.ui.chainOpen = 0; game.ui.chainOpenV = 0;
    game.ui.code = TOTAL_TARGET; game.ui.codeV = 0;
    game.tutorialT = 9; game.didMove = false; game.didAttack = false;
    game.slowT = 0; game.slowScale = 1; game.slowCd = 0;
    game.playerStats = game.mode === 'defense' ? defensePlayerStats() : defaultPlayerStats();
    game.defense = newDefenseState();
    game.floorLoadout = startingLoadout();
    startFloor(false);
    if (game.mode === 'practice') {
      const w = WEAPONS[game.practice.weapon] || WEAPONS.pistol;
      game.banner = `${w.name} 练习`;
      game.bannerT = 1.2;
    }
    if (game.mode === 'defense') {
      game.defense.between = true;
      game.defense.nextWaveT = DEFENSE_REST_SECONDS;
      game.defense.shopOpen = true;
      game.banner = '防守准备 · T 打开商店';
      game.bannerT = 1.1;
    }

    // Shot mode: begin the run already most of the way down the counter, so a
    // take opens mid-fight and reaches 200 OK in a few seconds. Everything
    // downstream reads from kills, so setting it is enough.
    if (REC.shot) {
      game.kills = TOTAL_TARGET - WIN_AT - REC.shot;
      game.floorKills = 0;
      game.remaining = TOTAL_TARGET - game.kills;
      game.ui.code = game.remaining; game.ui.codeV = 0;
      game.tutorialT = 0;
      game.runT = REC.clock;
      // the kills that are already banked would have scored, so bank that too
      // or the win screen ends on a score no real run could finish with
      game.score = Math.round(game.kills * 730);
      game.bestCombo = 6;
      game.player.weapon = 'smg';
      game.player.ammo = WEAPONS.smg.ammo;
      game.floorLoadout = stashPlayerWeapon();
    }
  };
  game.TOTAL_TARGET = TOTAL_TARGET;
  game.WIN_AT = WIN_AT;
  return game;
}
