import { TAU, clamp } from './util.js';
import { WEAPONS, MAX_DASH, DASH_CD } from './entities.js';
import { drawPlateMark, drawLockup, ink, CYAN } from './brand.js';
import { clock } from './board.js';
import { playerId, playerName } from './net.js';
import { bar, gauge, tickScale, starMark, ring, dashRing, registerMark, bracket, rule, magazine } from './micro.js';

const INK = '#161513';
const M = '#EC0A63';
const C = '#12A3DA';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

const PAPER = '#EFECE3';

// HUD sits on a clean slip of paper so it never fights the hatch underneath
function card(g, x, y, w, h) {
  g.save();
  g.globalAlpha = 0.9;
  g.fillStyle = PAPER;
  g.fillRect(x, y, w, h);
  g.restore();
}

// The frame the instrument hangs in: brackets at the corners, register mark
// bottom-right, in the drawing's own hairline weight.
export function drawFurniture(g, W, H) {
  const m = 16;
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = ink(0.36);
  g.lineWidth = 1;
  bracket(g, m, m, 1, 1, 11);
  bracket(g, W - m, m, -1, 1, 11);
  bracket(g, m, H - m, 1, -1, 11);
  bracket(g, W - m, H - m, -1, -1, 11);
  g.restore();
}

// ---------------------------------------------------------------------------
// One shape: the bar. Every quantity on screen — rounds, dashes, progress, the
// chain — is the same square-ended bar at one of two heights, so the eye learns
// it once, and it matches a world built entirely from rectangles and hairlines.
// Three type sizes only: 22 code, 10 label, 8 micro. Ink carries structure and
// quantity; magenta means "now"; the only other colour is the chip identifying
// the weapon you're holding, which is the same rule the world already uses.
// ---------------------------------------------------------------------------
const T_CODE = 22, T_LABEL = 10, T_MICRO = 8;
// Tracking belongs to the size, not the family: large type reads too loose as
// it grows, small type too tight. Canvas letterSpacing is recent, so guard it.
const CAN_TRACK = typeof CanvasRenderingContext2D !== 'undefined'
  && 'letterSpacing' in CanvasRenderingContext2D.prototype;
function track(g, em) { if (CAN_TRACK) g.letterSpacing = `${em}em`; }
const BAR = 7, BAR_TALL = 13;
const PAD = 14;
const ENEMY_NAMES = {
  strawman: '稻草人',
  thug: '暴徒',
  gunner: '枪手',
  hound: '猎犬',
  patroller: '巡逻者',
  shield: '重盾',
};

const CODEX_WEAPON_ORDER = [
  'knife', 'bat', 'katana', 'quixote', 'pistol', 'revolver', 'smg', 'shotgun', 'ripper', 'grenade', 'frag',
  'flash', 'sentryPack', 'dronePack', 'rocket', 'molotov', 'dart', 'tameDart', 'disguise', 'sniper', 'laser', 'butcher', 'shield',
];
const CODEX_ENEMY_ORDER = ['strawman', 'thug', 'gunner', 'hound', 'patroller', 'shield'];
const WEAPON_DESC = {
  knife: '高速近战，命中直接处决。',
  bat: '长距离钝器，适合击倒和冲门。',
  katana: '蓄力居合，冲刺路径斩杀并无视防御。',
  quixote: '骑枪蓄力冲锋，路径斩杀；冲锋中按住可延长。',
  pistol: '稳定手枪，弹匣小但节奏可靠。',
  revolver: '重弹左轮，可穿门并削甲。',
  smg: '高射速压制，散布明显。',
  shotgun: '近距离多弹丸爆发。',
  ripper: '类似冲锋枪，子弹可穿墙。',
  grenade: '蓄力投掷，范围爆炸。',
  frag: '爆炸后释放高速破片。',
  flash: '蓄力投掷，长时间瘫痪，概率缴械或乱射。',
  sentryPack: '蓄力投掷，落点部署一挺冲锋枪参数的哨戒机枪。',
  dronePack: '蓄力投掷，落点释放 3 架各带 3 发子弹的毒蜂无人机。',
  rocket: '三发重型火箭，可补弹。',
  molotov: '落地燃烧，留下持续伤害区域。',
  dart: '无声疯狂毒镖，使敌人无差别攻击。',
  tameDart: '无声驯服毒镖，把敌人拉到你这边。',
  disguise: '暗杀用枪，降低被识破的压力。',
  sniper: '超高速穿透弹，红外线标出弹道。',
  laser: '可反弹能量弹，适合拐角。',
  butcher: '近战电锯，每隔一段时间甩出锯片。',
  shield: '格挡正面攻击，燃烧与锯片除外。',
};
const ENEMY_DESC = {
  strawman: '静止靶，不巡逻、不警戒。',
  thug: '普通近战敌人，会追逐并挥击。',
  gunner: '持枪敌人，保持距离并开火。',
  hound: '高速冲刺敌人，贴身威胁很强。',
  patroller: '远感知巡逻者，会尽量遍历所有房间。',
  shield: '重盾敌人，正面装甲会分片破损。',
};

// ---------------------------------------------------------------------------
// The chain. It is the only thing on the page that arrives, so it gets to be
// loud: a slab that unrolls out from under the status card, takes a hit on
// every kill, and turns solid magenta once the run is worth protecting.
// ---------------------------------------------------------------------------
const CHAIN_H = 44, CHAIN_HOT = 5;

function drawChain(g, game, x, y, w) {
  const open = game.ui.chainOpen;
  if (open < 0.004) return;
  const n = game.combo;
  const punch = game.ui.chainPunch;
  const hot = n >= CHAIN_HOT;

  g.save();
  // it unrolls downward, and the punch shoves the whole slab a little left
  g.beginPath();
  g.rect(x - 4, y, w + 8, CHAIN_H * Math.min(1.05, open) + 2);
  g.clip();
  g.translate(-punch * 3, -(1 - Math.min(1, open)) * 7);
  g.globalAlpha = Math.min(1, open * 1.3);

  // ground: paper while it is building, solid magenta once it is worth losing
  if (hot) {
    g.fillStyle = M; g.fillRect(x, y, w, CHAIN_H);
  } else {
    g.globalAlpha *= 0.9;
    g.fillStyle = PAPER; g.fillRect(x, y, w, CHAIN_H);
    g.globalAlpha = Math.min(1, open * 1.3);
    g.strokeStyle = M; g.lineWidth = 1;
    g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, CHAIN_H - 1);
  }
  const fg = hot ? PAPER : M;

  // the count, thrown a size larger on the frame the kill lands
  g.fillStyle = fg;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const size = Math.round(T_CODE * (1 + punch * 0.22));
  track(g, -0.04);
  g.font = `600 ${size}px ${MONO}`;
  g.fillText(`\u00d7${n}`, x + 12, y + 28 + (size - T_CODE) * 0.5);
  track(g, 0.16);
  g.font = `600 ${T_MICRO}px ${MONO}`;
  const nw = g.measureText(`\u00d7${n}`).width;
  g.fillText('连击', x + 12 + Math.max(46, nw + 12), y + 26);

  // and the clock you are racing, on the slab's own bottom edge
  gauge(g, x + 12, y + CHAIN_H - 14, w - 24, BAR,
        clamp(game.ui.chain, 0, 1), hot ? 'rgba(239,236,227,.34)' : ink(0.22), fg);

  // every kill also strikes a tick off the top edge, so the block reads as
  // being hit rather than merely counting
  g.fillStyle = fg;
  const ticks = Math.min(n, 12);
  for (let i = 0; i < ticks; i++) g.fillRect(x + w - 8 - i * 6, y + 6, 2, 7);

  track(g, 0);
  g.restore();
}

function drawDefenseHud(g, game, W) {
  if (game.mode !== 'defense') return;
  const d = game.defense;
  const p = game.player;
  const shop = game.defenseShop ? game.defenseShop() : null;
  if (!shop) return;
  game.ui.defenseShopButton = null;
  game.ui.defenseShopOptions = [];
  game.ui.defenseRestButton = null;
  game.ui.defenseShopPanel = null;
  const opened = !!(d.between && d.shopOpen);
  const x = W - 326, y = 22, w = 304, h = opened ? 322 : 106;
  game.ui.defenseShopPanel = { x, y, w, h };
  card(g, x, y, w, h);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  g.font = `600 ${T_LABEL}px ${MONO}`;
  g.fillText(`防守  波 ${String(d.wave).padStart(2, '0')}  积分 ${d.points}`, x + 14, y + 20);

  const shopBtn = { x: x + w - 78, y: y + 9, w: 62, h: 22 };
  game.ui.defenseShopButton = shopBtn;
  g.strokeStyle = d.between ? M : ink(0.26);
  bar(g, shopBtn.x, shopBtn.y, shopBtn.w, shopBtn.h);
  g.fillStyle = d.between ? M : ink(0.34);
  g.textAlign = 'center';
  g.font = `600 ${T_MICRO}px ${MONO}`;
  track(g, 0.12);
  g.fillText(opened ? '收起' : '商店', shopBtn.x + shopBtn.w / 2, shopBtn.y + 15);
  track(g, 0);
  g.textAlign = 'left';

  g.fillStyle = ink(0.52);
  g.font = `400 ${T_MICRO}px ${MONO}`;
  track(g, 0.08);
  g.fillText(`生命 ${p.hp}/${p.maxHp}   攻速 ${Math.round((1 / (game.playerStats.attackRate || 1)) * 100)}%`, x + 14, y + 40);
  g.fillText(`冲刺 ${p.maxDash}格 / ${Number(game.playerStats.dashCd || DASH_CD).toFixed(2)}s   子弹时间 ${Number(game.playerStats.slow || 1).toFixed(2)}x`, x + 14, y + 56);
  if (d.between) {
    const t = Math.ceil(Math.max(0, d.nextWaveT));
    const rest = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    g.fillStyle = C;
    g.font = `600 ${T_MICRO}px ${MONO}`;
    g.fillText(`休息 ${rest}   T 打开商店 · 点击购买`, x + 14, y + 76);
  } else {
    g.fillStyle = ink(0.48);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    g.fillText('清空本波后开放商店与升级。', x + 14, y + 76);
  }

  if (!opened) {
    if (d.between) {
      const done = { x: x + 14, y: y + 83, w: 104, h: 18 };
      game.ui.defenseRestButton = done;
      g.strokeStyle = C;
      bar(g, done.x, done.y, done.w, done.h);
      g.fillStyle = C;
      g.font = `600 ${T_MICRO}px ${MONO}`;
      track(g, 0.1);
      g.textAlign = 'center';
      g.fillText('结束休息', done.x + done.w / 2, done.y + 13);
      g.textAlign = 'left';
      track(g, 0);
    }
    track(g, 0);
    g.restore();
    return;
  }

  const weapon = WEAPONS[shop.weapon]?.name || shop.weapon;
  const items = [
    { slot: 1, label: `武器 ${weapon}`, cost: shop.costs.weapon, col: M, can: shop.can.weapon },
    { slot: 2, label: '刷新物品', cost: shop.costs.refresh, col: '#F7CF16', can: shop.can.refresh },
    { slot: 3, label: '补充子弹', cost: shop.costs.refill, col: '#00A651', can: shop.can.refill },
    { slot: 4, label: '恢复生命', cost: shop.costs.heal, col: '#E40808', can: shop.can.heal },
    { slot: 5, label: '最大生命', cost: shop.costs.hp, col: C, can: shop.can.hp },
    { slot: 6, label: '攻击速度', cost: shop.costs.attack, col: '#4A44A0', can: shop.can.attack },
    { slot: 7, label: '冲刺槽', cost: shop.costs.dash, col: '#F7CF16', can: shop.can.dash },
    { slot: 8, label: '冲刺恢复', cost: shop.costs.recover, col: '#00A651', can: shop.can.recover },
    { slot: 9, label: '子弹时间', cost: shop.costs.slow, col: INK, can: shop.can.slow },
  ];
  const bx = x + 14, bw = w - 28, bh = 20;
  items.forEach((item, i) => {
    const by = y + 92 + i * 21;
    const hot = item.can && d.points >= item.cost;
    const hit = { slot: item.slot, x: bx, y: by - 13, w: bw, h: bh };
    game.ui.defenseShopOptions.push(hit);
    g.strokeStyle = hot ? item.col : ink(0.22);
    bar(g, hit.x, hit.y, hit.w, hit.h);
    g.fillStyle = hot ? item.col : ink(0.36);
    g.font = `600 ${T_MICRO}px ${MONO}`;
    track(g, 0.08);
    g.fillText(`${item.slot} ${item.label}`, bx + 8, by);
    g.textAlign = 'right';
    g.fillText(item.can ? String(item.cost) : '满', bx + bw - 8, by);
    g.textAlign = 'left';
    track(g, 0);
  });

  const done = { x: bx, y: y + h - 30, w: bw, h: 22 };
  game.ui.defenseRestButton = done;
  g.strokeStyle = C;
  bar(g, done.x, done.y, done.w, done.h);
  g.fillStyle = C;
  g.font = `600 ${T_MICRO}px ${MONO}`;
  track(g, 0.1);
  g.textAlign = 'center';
  g.fillText('结束休息 / ENTER', done.x + done.w / 2, done.y + 15);
  g.textAlign = 'left';
  track(g, 0);

  g.fillStyle = ink(0.38);
  g.font = `400 ${T_MICRO}px ${MONO}`;
  track(g, 0.08);
  g.fillText('数字键 1-9 同样可购买。', bx, y + h - 38);
  track(g, 0);
  g.restore();
}

function drawKatanaDash(g, game, W) {
  const p = game.player;
  if (!p.alive || !(p.katanaT > 0) || !(p.katanaMax > 0)) return;
  const w = 300, h = 30;
  const x = W / 2 - w / 2, y = 18;
  const pct = clamp(p.katanaT / p.katanaMax, 0, 1);
  card(g, x, y, w, h);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  g.font = `600 ${T_MICRO}px ${MONO}`;
  track(g, 0.14);
  const def = WEAPONS[p.weapon] || WEAPONS.katana;
  g.fillText(def.lance ? '堂吉柯德冲锋' : '武士刀冲刺', x + 12, y + 13);
  track(g, 0);
  gauge(g, x + 12, y + 18, w - 24, BAR, pct, ink(0.24), def.tint || M);
  g.restore();
}

export function drawHud(g, game, W, H) {
  const p = game.player;
  drawFurniture(g, W, H);

  // ---- status: what the page says, and how close it is to being fixed -----
  const SX = 22, SY = 22, SW = 208;
  card(g, SX - PAD * 0.7, SY - 10, SW + PAD, 94);

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.lineWidth = 1;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';

  g.fillStyle = INK;
  track(g, -0.03);
  g.font = `600 ${T_CODE}px ${MONO}`;
  g.fillText(String(Math.round(game.ui.code)), SX, SY + 18);
  track(g, 0);

  const label = game.statusLabel || '未找到';
  track(g, 0.09);
  g.font = `600 ${T_MICRO}px ${MONO}`;
  const lw = g.measureText(label).width + 18;
  g.strokeStyle = M;
  bar(g, SX + SW - lw, SY + 4, lw, BAR_TALL);
  g.fillStyle = M;
  g.textAlign = 'center';
  g.fillText(label, SX + SW - lw / 2, SY + 13);

  gauge(g, SX, SY + 28, SW, BAR, game.ui.gauge, ink(0.3), INK);

  g.textAlign = 'left';
  track(g, 0.07);
  g.font = `400 ${T_MICRO}px ${MONO}`;
  g.fillStyle = ink(0.5);
  g.fillText(
    `层 ${String(game.floor).padStart(2, '0')}   敌 ${String(game.enemiesLeft).padStart(2, '0')}`,
    SX, SY + 48);

  // The clock gets the code's own size — it is the number a board is decided
  // on, so it reads at a glance and the hundredths keep moving. The 404 still
  // leads by sitting on top in full ink; the clock takes a step back in weight
  // rather than in size, so the card keeps its three sizes.
  g.fillStyle = ink(0.82);
  track(g, -0.03);
  g.font = `600 ${T_CODE}px ${MONO}`;
  g.fillText(clock(game.runT), SX, SY + 72);
  track(g, 0);

  g.textAlign = 'right';
  g.font = `400 ${T_MICRO}px ${MONO}`;
  g.fillStyle = ink(0.38);
  track(g, 0.07);
  g.fillText(String(game.score).padStart(6, '0'), SX + SW, SY + 72);
  track(g, 0);

  track(g, 0);
  g.textAlign = 'left';
  g.restore();

  drawChain(g, game, SX - PAD * 0.7, SY - 10 + 94 + 7, SW + PAD);
  drawDefenseHud(g, game, W);
  drawKatanaDash(g, game, W);

  // ---- weapon ------------------------------------------------------------
  // Two rows of text over one full-width band. The band always holds the same
  // thing — the device the rounds sit in, drawn from behind and centred in it
  // — so the panel keeps its shape while the device inside it changes.
  const w = WEAPONS[p.weapon];
  const WX = 22, WY = H - 92, WW = 208;
  card(g, WX - PAD * 0.7, WY - 12, WW + PAD, 78);

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.lineWidth = 1;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';

  // row one: what you are holding, and how much of it is left
  if (w.tint) { g.fillStyle = w.tint; bar(g, WX, WY - 5, 14, BAR, true); }
  g.fillStyle = INK;
  g.font = `600 ${T_LABEL}px ${MONO}`;
  g.fillText(w.name, WX + (w.tint ? 20 : 0), WY + 3);

  if (w.feed && w.feed !== 'none') {
    g.fillStyle = ink(0.5);
    track(g, 0.07);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    g.textAlign = 'right';
    g.fillText(`${p.ammo} / ${w.ammo}`, WX + WW, WY + 3);
    g.textAlign = 'left';
    track(g, 0);
  }

  // row two: the dash meter, labelled at the left and read from the right
  g.fillStyle = ink(0.42);
  track(g, 0.09);
  g.font = `400 ${T_MICRO}px ${MONO}`;
  g.fillText('冲刺', WX, WY + 19);
  track(g, 0);
  const maxDash = p.maxDash || MAX_DASH;
  const dashCdMax = p.dashCdMax || DASH_CD;
  const dw = Math.min(30, Math.floor((WW - 92) / Math.max(1, maxDash)));
  for (let i = 0; i < maxDash; i++) {
    const bx = WX + WW - (maxDash - i) * (dw + 5) + 5;
    if (i < p.dashCharges) {
      g.fillStyle = game.dashFlash > 0 ? M : INK;
      bar(g, bx, WY + 13, dw, BAR, true);
    } else if (i === p.dashCharges) {
      gauge(g, bx, WY + 13, dw, BAR, clamp(1 - p.dashCd / dashCdMax, 0, 1), ink(0.26), ink(0.55));
    } else {
      g.strokeStyle = ink(0.26);
      bar(g, bx, WY + 13, dw, BAR);
    }
  }

  // the band
  const BY = WY + 27, BH = 30;
  if (w.feed && w.feed !== 'none') {
    magazine(g, WX, BY, WW, BH, w.feed, p.ammo, w.ammo, INK, ink(0.32));
  } else {
    g.strokeStyle = ink(0.28);
    bar(g, WX, BY + BH / 2 - BAR / 2, WW, BAR);
    g.fillStyle = ink(0.45);
    track(g, 0.09);
    g.font = `400 ${T_MICRO}px ${MONO}`;
    g.textAlign = 'center';
    const tag = w.defense ? '正面格挡' : w.katana ? '蓄力居合' : w.lance ? '蓄力冲锋' : w.deploy ? '部署包' : w.sawLauncher ? '自动锯片' : w.blade ? '长寿命投掷物' : w.lethal ? '利刃' : '徒手';
    g.fillText(tag, WX + WW / 2, BY + BH / 2 + 3);
    track(g, 0);
    g.textAlign = 'left';
  }
  g.restore();

  // ---- banner -------------------------------------------------------------
  if (game.bannerT > 0 && game.banner) {
    const a = clamp(game.bannerT, 0, 1);
    g.save();
    g.font = `600 ${T_CODE}px ${MONO}`;
    g.textAlign = 'center';
    const bw = g.measureText(game.banner).width + 56;
    g.globalAlpha = a * 0.93;
    g.fillStyle = PAPER;
    g.fillRect(W / 2 - bw / 2, H / 2 - 116, bw, 38);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = a;
    g.lineWidth = 1;
    g.strokeStyle = ink(0.35);
    bracket(g, W / 2 - bw / 2 + 5, H / 2 - 111, 1, 1, 7);
    bracket(g, W / 2 + bw / 2 - 5, H / 2 - 111, -1, 1, 7);
    bracket(g, W / 2 - bw / 2 + 5, H / 2 - 83, 1, -1, 7);
    bracket(g, W / 2 + bw / 2 - 5, H / 2 - 83, -1, -1, 7);
    g.fillStyle = INK;
    g.fillText(game.banner, W / 2, H / 2 - 90);
    g.restore();
  }

  if (game.flash > 0) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = game.flash * 0.5;
    g.fillStyle = M;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// The board itself: rank, name, time. It is the same card, the same three type
// sizes and the same magenta-means-you rule as the rest of the instrument, and
// it draws whatever state it is in — loading, empty, offline — rather than
// disappearing, so the screen does not jump around when the fetch lands.
// ---------------------------------------------------------------------------
function drawTitleNote(g, cx, y, w, k, title, lines) {
  const x = cx - w / 2;
  const fs = Math.max(8, Math.round(9 * k));
  g.textAlign = 'left';
  g.fillStyle = ink(0.5);
  g.font = `600 ${fs}px ${MONO}`;
  track(g, 0.16);
  g.fillText(title, x, y);
  track(g, 0);
  g.strokeStyle = ink(0.22);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, Math.round(y + 5) + 0.5); g.lineTo(x + w, Math.round(y + 5) + 0.5);
  g.stroke();
  g.fillStyle = ink(0.48);
  g.font = `400 ${fs}px ${MONO}`;
  track(g, 0.08);
  lines.slice(0, 5).forEach((line, i) => g.fillText(line, x, y + 24 + i * Math.round(14 * k), w));
  track(g, 0);
}

function codexWeaponShape(g, kind) {
  switch (kind) {
    case 'bat': g.fillRect(-9, -2, 24, 4); g.fillRect(10, -4, 8, 8); break;
    case 'knife':
      g.fillRect(-11, -2, 8, 4);
      g.beginPath(); g.moveTo(-3, -4); g.lineTo(16, 0); g.lineTo(-3, 4); g.closePath(); g.fill();
      break;
    case 'katana':
      g.fillRect(-20, -2.2, 12, 4.4);
      g.fillRect(-25, -7, 5, 14);
      g.beginPath(); g.moveTo(-8, -3); g.lineTo(27, -1.3); g.lineTo(34, 0); g.lineTo(27, 1.3); g.lineTo(-8, 3); g.closePath(); g.fill();
      break;
    case 'quixote':
      g.fillRect(-24, -3, 16, 6);
      g.fillRect(-29, -9, 5, 18);
      g.beginPath(); g.moveTo(-8, -3.2); g.lineTo(39, 0); g.lineTo(-8, 3.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(4, -3); g.lineTo(18, -16); g.lineTo(18, -3); g.closePath(); g.fill();
      break;
    case 'pistol': g.fillRect(-8, -2, 18, 4); g.fillRect(-5, 1, 5, 9); break;
    case 'revolver':
      g.fillRect(-10, -2, 22, 4); g.fillRect(-7, 1, 5, 9);
      g.beginPath(); g.arc(-1, 0, 4, 0, TAU); g.fill();
      break;
    case 'smg':
      g.fillRect(-12, -2.3, 26, 4.6); g.fillRect(-5, 2, 6, 10); g.fillRect(-18, -3, 7, 6);
      break;
    case 'ripper':
      g.fillRect(-18, -2.5, 34, 5); g.fillRect(-6, 2, 6, 11); g.fillRect(15, -1.2, 15, 2.4);
      break;
    case 'shotgun': g.fillRect(-14, -2.6, 36, 5.2); g.fillRect(-22, -3.5, 9, 7); break;
    case 'grenade':
      g.beginPath(); g.arc(1, 2, 7, 0, TAU); g.fill(); g.fillRect(-5, -8, 12, 3); g.fillRect(-11, -6, 5, 8);
      break;
    case 'frag': g.fillRect(-7, -7, 14, 14); g.fillRect(-9, -11, 11, 4); g.fillRect(-13, -8, 5, 9); break;
    case 'flash':
      g.fillRect(-7, -7, 14, 14);
      g.fillRect(-10, -11, 11, 4);
      g.lineWidth = 2;
      g.beginPath(); g.arc(2, 0, 11, -0.95, 0.95); g.stroke();
      break;
    case 'sentryPack':
      g.fillRect(-13, -9, 26, 18);
      g.fillRect(-6, -15, 12, 6);
      g.lineWidth = 2.2;
      g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.stroke();
      g.fillRect(6, -2, 24, 4);
      break;
    case 'dronePack':
      g.fillRect(-13, -8, 26, 16);
      g.beginPath(); g.arc(-6, 0, 2.7, 0, TAU); g.arc(0, 0, 2.7, 0, TAU); g.arc(6, 0, 2.7, 0, TAU); g.fill();
      g.fillRect(-22, -2.2, 9, 4.4);
      g.fillRect(13, -2.2, 9, 4.4);
      break;
    case 'rocket':
      g.fillRect(-17, -4, 30, 8);
      g.beginPath(); g.moveTo(13, -7); g.lineTo(27, 0); g.lineTo(13, 7); g.closePath(); g.fill();
      g.fillRect(-25, -7, 8, 14);
      break;
    case 'molotov':
      g.fillRect(-15, -5, 20, 10); g.fillRect(4, -3, 13, 6);
      g.beginPath(); g.moveTo(18, 0); g.lineTo(28, -8); g.lineTo(24, 0); g.lineTo(28, 8); g.closePath(); g.fill();
      break;
    case 'dart':
    case 'tameDart':
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(-17, 0); g.lineTo(17, 0); g.stroke();
      g.beginPath(); g.moveTo(20, 0); g.lineTo(8, -6); g.lineTo(8, 6); g.closePath(); g.fill();
      g.fillRect(-19, -7, 5, 14);
      break;
    case 'disguise':
      g.fillRect(-10, -2.2, 20, 4.4); g.fillRect(-7, 1, 5, 9); g.fillRect(5, -8, 5, 5);
      break;
    case 'sniper':
      g.fillRect(-24, -2.4, 48, 4.8); g.fillRect(-31, -4, 10, 8); g.fillRect(23, -1.2, 18, 2.4); g.fillRect(-5, -8, 16, 3);
      break;
    case 'laser':
      g.fillRect(-17, -3, 30, 6); g.fillRect(-10, 2, 7, 10);
      g.beginPath(); g.moveTo(13, -7); g.lineTo(29, 0); g.lineTo(13, 7); g.closePath(); g.fill();
      break;
    case 'butcher':
      g.fillRect(-19, -4, 28, 8); g.fillRect(8, -7, 14, 14);
      g.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        g.beginPath(); g.moveTo(10 + i * 2, -8); g.lineTo(11 + i * 2, -12); g.stroke();
        g.beginPath(); g.moveTo(10 + i * 2, 8); g.lineTo(11 + i * 2, 12); g.stroke();
      }
      break;
    case 'shield':
      g.lineWidth = 3;
      g.beginPath(); g.arc(2, 0, 18, -1.08, 1.08); g.stroke();
      g.fillRect(-13, -9, 8, 18);
      break;
    default: g.fillRect(-10, -3, 20, 6); break;
  }
}

function codexEnemyShape(g, kind) {
  g.lineWidth = 2;
  if (kind === 'hound') {
    g.beginPath(); g.moveTo(0, -13); g.lineTo(16, 0); g.lineTo(0, 13); g.lineTo(-16, 0); g.closePath(); g.stroke();
    g.beginPath(); g.arc(8, 0, 4, 0, TAU); g.fill();
    return;
  }
  if (kind === 'strawman') {
    g.beginPath(); g.arc(0, -9, 6, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(0, -3); g.lineTo(0, 15); g.moveTo(-13, 4); g.lineTo(13, 4); g.moveTo(-8, 24); g.lineTo(0, 15); g.lineTo(8, 24); g.stroke();
    return;
  }
  if (kind === 'patroller') {
    g.beginPath();
    g.moveTo(0, -15); g.lineTo(14, -6); g.lineTo(14, 6); g.lineTo(0, 15); g.lineTo(-14, 6); g.lineTo(-14, -6);
    g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
    g.fillRect(7, -2, 20, 4);
    return;
  }
  g.beginPath(); g.arc(0, 0, kind === 'shield' ? 13 : 11, 0, TAU); g.stroke();
  g.beginPath(); g.arc(0, 0, kind === 'shield' ? 7 : 8, 0, TAU); g.fill();
  if (kind === 'gunner') g.fillRect(8, -2, 19, 4);
  if (kind === 'thug') g.fillRect(8, -1.8, 16, 3.6);
  if (kind === 'shield') {
    g.beginPath(); g.arc(10, 0, 17, -1.1, 1.1); g.stroke();
  }
}

function drawCodexEntry(g, x, y, w, kind, seen, enemy) {
  const tint = enemy ? (kind === 'hound' ? M : kind === 'shield' ? C : INK) : (WEAPONS[kind]?.tint || INK);
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

  g.textAlign = 'left';
  g.fillStyle = seen ? INK : ink(0.38);
  g.font = `600 10px ${MONO}`;
  track(g, 0.08);
  const name = enemy ? (ENEMY_NAMES[kind] || kind) : (WEAPONS[kind]?.name || kind);
  g.fillText(`${name}${seen ? '' : ' · 未记录'}`, x + 52, y + 15, w - 58);
  track(g, 0);
  g.fillStyle = seen ? ink(0.56) : ink(0.34);
  g.font = `400 8.5px ${MONO}`;
  g.fillText(enemy ? ENEMY_DESC[kind] : WEAPON_DESC[kind], x + 52, y + 31, w - 58);
  g.strokeStyle = ink(0.16);
  g.beginPath();
  g.moveTo(x, y + 39.5); g.lineTo(x + w, y + 39.5);
  g.stroke();
  g.restore();
}

export function drawCodexPopup(g, game, W, H) {
  if (!game.codexOpen) return;
  const counts = game.codexCounts ? game.codexCounts() : { weapons: 0, weaponTotal: 0, enemies: 0, enemyTotal: 0 };
  const cx = W / 2, cy = H / 2;
  const cw = Math.min(960, W - 80);
  const ch = Math.min(590, H - 64);
  const x = cx - cw / 2, y = cy - ch / 2;
  const close = { x: x + cw - 88, y: y + 20, w: 62, h: 24 };
  game.ui.codexPanel = { x, y, w: cw, h: ch };
  game.ui.codexClose = close;

  g.save();
  g.globalAlpha = 0.28;
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  g.restore();

  g.save();
  g.globalAlpha = 0.97;
  g.fillStyle = PAPER;
  g.fillRect(x, y, cw, ch);
  g.restore();

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = ink(0.36);
  bracket(g, x + 12, y + 12, 1, 1, 12);
  bracket(g, x + cw - 12, y + 12, -1, 1, 12);
  bracket(g, x + 12, y + ch - 12, 1, -1, 12);
  bracket(g, x + cw - 12, y + ch - 12, -1, -1, 12);

  g.textAlign = 'left';
  g.fillStyle = INK;
  g.font = `600 24px ${MONO}`;
  track(g, 0.08);
  g.fillText('图鉴', x + 34, y + 48);
  g.font = `400 10px ${MONO}`;
  g.fillStyle = ink(0.52);
  g.fillText(`武器 ${counts.weapons}/${counts.weaponTotal}   敌人 ${counts.enemies}/${counts.enemyTotal}`, x + 118, y + 46);
  track(g, 0);

  g.strokeStyle = ink(0.34);
  bar(g, close.x, close.y, close.w, close.h);
  g.fillStyle = M;
  g.textAlign = 'center';
  g.font = `600 10px ${MONO}`;
  track(g, 0.12);
  g.fillText('关闭', close.x + close.w / 2, close.y + 16);
  track(g, 0);

  const top = y + 82;
  const viewH = Math.max(160, ch - (top - y) - 54);
  const weaponCols = 2;
  const weaponColW = Math.floor((cw * 0.64 - 60) / weaponCols);
  const enemyX = x + Math.floor(cw * 0.68);
  g.textAlign = 'left';
  g.fillStyle = ink(0.55);
  g.font = `600 10px ${MONO}`;
  track(g, 0.14);
  g.fillText('武器', x + 34, top - 18);
  g.fillText('敌人', enemyX, top - 18);
  track(g, 0);

  const seenWeapons = game.codex?.weapons || [];
  const seenEnemies = game.codex?.enemies || [];
  const weaponRows = Math.ceil(CODEX_WEAPON_ORDER.length / weaponCols);
  const contentH = Math.max(weaponRows * 42, CODEX_ENEMY_ORDER.length * 50);
  const maxScroll = Math.max(0, contentH - viewH);
  const scroll = clamp(game.codexScroll || 0, 0, maxScroll);
  game.codexScroll = scroll;
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
  const thumbH = maxScroll > 0 ? clamp((viewH / contentH) * sh, 34, sh) : sh;
  const thumbY = sy + (maxScroll > 0 ? (scroll / maxScroll) * (sh - thumbH) : 0);
  game.ui.codexScroll = { x: sx - 4, y: sy, w: sw + 8, h: sh, thumbY, thumbH, max: maxScroll };
  g.globalAlpha = maxScroll > 0 ? 1 : 0.34;
  g.strokeStyle = ink(0.20);
  bar(g, sx, sy, sw, sh);
  g.fillStyle = M;
  bar(g, sx, thumbY, sw, thumbH, true);
  g.globalAlpha = 1;

  g.fillStyle = ink(0.38);
  g.font = `400 9px ${MONO}`;
  g.textAlign = 'right';
  track(g, 0.08);
  g.fillText('滚轮或拖动右侧滚动条 · ESC 返回', x + cw - 34, y + ch - 24);
  track(g, 0);
  g.restore();
}

function drawCodex(g, game, cx, y, w, k) {
  const counts = game.codexCounts ? game.codexCounts() : { weapons: 0, weaponTotal: 0, enemies: 0, enemyTotal: 0 };
  const weapons = (game.codex.weapons || []).map((id) => WEAPONS[id]?.name || id).join(' · ') || '未记录';
  const enemies = (game.codex.enemies || []).map((id) => ENEMY_NAMES[id] || id).join(' · ') || '未记录';
  drawTitleNote(g, cx, y, w, k, `图鉴  武器 ${counts.weapons}/${counts.weaponTotal}  敌人 ${counts.enemies}/${counts.enemyTotal}`, [
    `武器：${weapons}`,
    `敌人：${enemies}`,
    '获得武器或遇到敌人后会自动记录。',
  ]);
}

function drawStandings(g, game, cx, y, w, k) {
  const st = game.standings;
  const x = cx - w / 2;
  const fs = Math.max(8, Math.round(9 * k));

  if (game.mode === 'practice') {
    const map = game.practiceMaps[game.practice.map] || game.practiceMaps[0];
    const weapon = WEAPONS[game.practice.weapon]?.name || game.practice.weapon;
    const enemy = ENEMY_NAMES[game.practice.enemy] || game.practice.enemy;
    return drawTitleNote(g, cx, y, w, k, '练习模式', [
      `地形：${map.label}   武器：${weapon}`,
      `敌人：${enemy}   包含稻草人训练目标`,
      '点击选项循环配置，开局后不计排行榜。',
    ]);
  }
  if (game.mode === 'defense') {
    return drawTitleNote(g, cx, y, w, k, '防守模式', [
      '地牢中抵御一波波敌人。',
      '波间休息 2 分钟；T 或点击打开商店。',
      '点击购买武器/升级，准备好后结束休息。',
    ]);
  }

  // A caption naming the board you are looking at, which is the board for the
  // mode chosen above. The choosing happens up there; this only reports.
  g.textAlign = 'left';
  g.fillStyle = ink(0.5);
  g.font = `600 ${fs}px ${MONO}`;
  track(g, 0.16);
  g.fillText('无限模式', x, y);
  g.textAlign = 'right';
  g.fillText('时间', x + w, y);
  track(g, 0);
  g.strokeStyle = ink(0.22);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, Math.round(y + 5) + 0.5); g.lineTo(x + w, Math.round(y + 5) + 0.5);
  g.stroke();

  const note = (text) => {
    g.textAlign = 'center';
    g.fillStyle = ink(0.34);
    g.font = `400 ${fs}px ${MONO}`;
    track(g, 0.1);
    g.fillText(text, cx, y + 24);
    track(g, 0);
    g.textAlign = 'left';
  };
  if (!st) return note('读取中');
  if (st.offline) return note('本地静态模式');
  if (!st.rows || !st.rows.length) {
    return note('还没有记录');
  }

  // A row is yours if this browser set it, or if it carries the name you play
  // under — the line belongs to the name, so a time you set on another machine
  // is still yours to recognise.
  const me = playerId();
  const myName = playerName();
  const isMine = (r) => r.player === me || (!!myName && r.name === myName.toUpperCase());
  const row = Math.round(15 * k);
  const shown = st.rows.slice(0, 5);
  const pb = game.best;
  // your own best only exists once you have finished a run, and it only needs
  // printing when it is not already on screen
  if (pb && !shown.some(isMine)) {
    g.fillStyle = ink(0.4);
    g.font = `400 ${fs}px ${MONO}`;
    g.textAlign = 'left';
    g.fillText('你的最佳', x, y + 20 + 5 * row + 4);
    g.textAlign = 'right';
    g.fillText(clock(pb.time), x + w, y + 20 + 5 * row + 4);
  }
  shown.forEach((r, i) => {
    const ry = y + 20 + i * row;
    const mine = isMine(r);
    g.fillStyle = mine ? M : ink(0.62);
    g.font = `${mine ? 600 : 400} ${fs}px ${MONO}`;
    g.textAlign = 'left';
    g.fillText(String(r.rank).padStart(2, '0'), x, ry);
    g.fillText(r.name, x + 22 * k, ry);
    g.textAlign = 'right';
    g.fillText(clock(r.time), x + w, ry);
  });
  g.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Which floor you are about to fight. This is a choice about the RUN — the
// board below follows from it — so it is stated as two chips above the call to
// play with a line saying what the chosen one means, not as tabs on a table
// where it would read as changing the view.
// ---------------------------------------------------------------------------
const MODES = [
  { id: 'endless', label: '无限模式', blurb: '每局种子 = 日期或自定义种子 + 局数。' },
  { id: 'practice', label: '练习模式', blurb: '自选地形、武器和敌人，含稻草人。' },
  { id: 'defense', label: '防守模式', blurb: '迷宫波次战，击杀得积分购买武器和升级。' },
];

function drawModes(g, game, cx, y, k) {
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
    const on = game.mode === m.id;
    const w = widths[i];
    g.textAlign = 'center';
    if (on) {
      // the chosen chip prints white out of solid ink, and paper does not
      // survive a multiply — this is the one mark on the title that stops
      // multiplying to draw itself
      g.save();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = INK;
      bar(g, x, y, w, h, true);
      g.fillStyle = PAPER;
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
  game.ui.tabs = hits;

  const picked = MODES.find((m) => m.id === game.mode) || MODES[0];
  g.textAlign = 'center';
  g.fillStyle = ink(0.45);
  g.font = `400 ${fs}px ${MONO}`;
  track(g, 0.09);
  g.fillText(picked.blurb, cx, y + h + Math.round(15 * k));
  track(g, 0);
}

function drawOptions(g, game, cx, y, k) {
  const fs = Math.max(8, Math.round(9 * k));
  const h = Math.round(17 * k);
  const pad = Math.round(11 * k);
  const seedBase = String(game.seedBase || '').slice(0, 18) || '今天';
  const counts = game.codexCounts ? game.codexCounts() : { weapons: 0, weaponTotal: 0, enemies: 0, enemyTotal: 0 };
  const chips = [
    { id: 'refill', label: `R 补弹 ${game.refillEnabled ? '开' : '关'}`, on: game.refillEnabled, col: C },
  ];
  if (game.mode === 'endless') chips.push({ id: 'seed', label: `种子 ${seedBase}`, on: !!game.customSeed, col: M });
  if (game.mode === 'practice') {
    const map = game.practiceMaps[game.practice.map] || game.practiceMaps[0];
    chips.push(
      { id: 'practiceMap', label: `地形 ${map.label}`, on: false, col: C },
      { id: 'practiceWeapon', label: `武器 ${WEAPONS[game.practice.weapon]?.name || game.practice.weapon}`, on: false, col: M },
      { id: 'practiceEnemy', label: `敌人 ${ENEMY_NAMES[game.practice.enemy] || game.practice.enemy}`, on: false, col: '#F7CF16' },
    );
  }
  chips.push({ id: 'codex', label: `图鉴 ${counts.weapons}/${counts.weaponTotal}·${counts.enemies}/${counts.enemyTotal}`, on: game.codexOpen, col: '#4A44A0' });
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
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = chip.col;
      bar(g, x, y, w, h, true);
      g.fillStyle = PAPER;
      g.textAlign = 'center';
      g.fillText(chip.label, x + w / 2, y + h - Math.round(5.5 * k));
      g.restore();
    } else {
      g.strokeStyle = ink(0.3);
      bar(g, x, y, w, h);
      g.fillStyle = ink(0.42);
      g.textAlign = 'center';
      g.fillText(chip.label, x + w / 2, y + h - Math.round(5.5 * k));
    }
    hits.push({ id: chip.id, x, y, w, h });
    x += w + gap;
  });
  track(g, 0);
  game.ui.options = hits;
}

export function drawTitle(g, game, W, H) {
  // A 404 first, a game second. Nothing here but the error, one line of why,
  // and the way in — the controls wait until you've said you want to play.
  const k = clamp(Math.min(W / 900, H / 760), 0.58, 1);
  const touch = game.touch && game.touch.enabled;
  const cx = W / 2, cy = H / 2;
  const t = performance.now() / 1000;
  const cw = Math.min(560 * k, W - 28);
  const ch = 580 * k;

  g.save();
  g.globalAlpha = 0.94;
  g.fillStyle = PAPER;
  g.fillRect(cx - cw / 2, cy - 200 * k, cw, ch);
  g.restore();

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.textAlign = 'center';

  const markW = 88 * k;
  drawPlateMark(g, cx - markW / 2, cy - 166 * k, markW);

  const split = (3 + Math.sin(t * 0.9) * 2.6) * k;
  g.font = `600 ${Math.min(132 * k, W * 0.17)}px ${MONO}`;
  [[C, 1, 0], [M, -0.5, 0.866], ['#F7CF16', -0.5, -0.866]].forEach(([col, ox, oy]) => {
    g.fillStyle = col;
    g.fillText('404', cx + ox * split, cy + 30 * k + oy * split);
  });

  g.fillStyle = INK;
  g.font = `600 ${13 * k}px ${MONO}`;
  g.fillText('页面未找到', cx, cy + 62 * k);
  g.fillStyle = ink(0.55);
  g.font = `400 ${11.5 * k}px ${MONO}`;
  g.fillText('有 404 个障碍挡在路上。清理它们。', cx, cy + 82 * k);

  const help = touch
    ? ['左摇杆移动 · 右摇杆瞄准/攻击', '按钮：冲刺 · 投掷', 'ESC 暂停 · 开启后可按 R 补弹']
    : ['WASD 移动 · 鼠标瞄准 · 点击攻击', 'Space 冲刺 · 长按 Q/右键投掷武器', '手雷类长按攻击扩大范围并选择落点 · R 补弹 · ESC 暂停'];
  g.font = `400 ${9 * k}px ${MONO}`;
  g.fillStyle = ink(0.5);
  track(g, 0.08);
  help.forEach((line, i) => g.fillText(line, cx, cy + (104 + i * 14) * k, cw - 48 * k));
  g.fillStyle = ink(0.38);
  g.fillText('来源：ISKRA.GRAPHICS/404', cx, cy + 148 * k, cw - 48 * k);
  track(g, 0);

  drawModes(g, game, cx, cy + 166 * k, k);
  drawOptions(g, game, cx, cy + 208 * k, k);

  g.fillStyle = M;
  g.font = `600 ${15 * k}px ${MONO}`;
  g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
  g.fillText(touch ? '轻触开始' : '点击开始', cx, cy + 236 * k);
  g.globalAlpha = 1;

  drawStandings(g, game, cx, cy + 266 * k, Math.min(320 * k, cw - 40 * k), k);
  g.restore();
}

// A single line of controls, shown only at the start of a run and only until
// you have actually moved and swung at something.
export function drawLegend(g, game, W, H) {
  if (!game.tutorialT || game.tutorialT <= 0) return;
  const a = clamp(game.tutorialT / 1.2, 0, 1);
  const touch = game.touch && game.touch.enabled;
  const line = touch
    ? '左摇杆移动   ·   右摇杆转向，推到底攻击'
    : game.mode === 'defense'
      ? '防守：波间按 T/点击商店，数字键购买，ENTER 或按钮结束休息'
      : 'WASD 移动   ·   鼠标瞄准   ·   点击攻击   ·   Space 冲刺   ·   长按 Q/右键蓄力投掷   ·   R 补弹   ·   ESC 暂停';
  g.save();
  g.textAlign = 'center';
  g.font = `400 11px ${MONO}`;
  const w = Math.min(g.measureText(line).width + 40, W - 42);
  g.globalAlpha = 0.92 * a;
  g.fillStyle = PAPER;
  g.fillRect(W / 2 - w / 2, H - 88, w, 26);
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = a;
  g.fillStyle = ink(0.7);
  g.fillText(line, W / 2, H - 70, w - 24);
  g.restore();
}

export function drawPause(g, game, W, H) {
  const cx = W / 2, cy = H / 2;
  const cw = Math.min(360, W - 42), ch = 170;
  const x = cx - cw / 2, y = cy - ch / 2;
  g.save();
  g.globalAlpha = 0.94;
  g.fillStyle = PAPER;
  g.fillRect(x, y, cw, ch);
  g.restore();

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.textAlign = 'center';
  g.strokeStyle = ink(0.32);
  g.lineWidth = 1;
  bracket(g, x + 9, y + 9, 1, 1, 9);
  bracket(g, x + cw - 9, y + 9, -1, 1, 9);
  bracket(g, x + 9, y + ch - 9, 1, -1, 9);
  bracket(g, x + cw - 9, y + ch - 9, -1, -1, 9);
  g.fillStyle = INK;
  g.font = `600 ${T_CODE}px ${MONO}`;
  track(g, 0.08);
  g.fillText('已暂停', cx, y + 42);
  g.font = `400 ${T_LABEL}px ${MONO}`;
  g.fillStyle = ink(0.55);
  g.fillText(game.refillEnabled ? 'R 补弹已开启' : 'R 补弹已关闭', cx, y + 64);

  const bw = 132, bh = 26, gap = 14, by = y + 92;
  const buttons = [
    { id: 'resume', label: '继续游戏', x: cx - bw - gap / 2, y: by, w: bw, h: bh, col: C },
    { id: 'menu', label: '返回主菜单', x: cx + gap / 2, y: by, w: bw, h: bh, col: M },
  ];
  game.ui.pauseOptions = buttons;
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
  g.fillText('ESC 继续 · 点击按钮选择', cx, y + 144);
  track(g, 0);
  g.restore();
}

export function drawWin(g, game, W, H) {
  const cx = W / 2, cy = H / 2;
  const t = performance.now() / 1000;
  const split = 2 + Math.sin(t * 1.1) * 1.6;
  const cw = Math.min(720, W - 60);
  g.save();
  g.globalAlpha = 0.95;
  g.fillStyle = PAPER;
  g.fillRect(cx - cw / 2, cy - 170, cw, 500);
  g.restore();

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.textAlign = 'center';
  g.font = `600 ${Math.min(150, W * 0.17)}px ${MONO}`;
  [['#12A3DA', 1, 0], ['#EC0A63', -0.5, 0.866], ['#F7CF16', -0.5, -0.866]].forEach(([col, ox, oy]) => {
    g.fillStyle = col;
    g.fillText('200', cx + ox * split, cy - 40 + oy * split);
  });
  g.fillStyle = INK;
  g.font = `600 20px ${MONO}`;
  g.fillText('正常', cx, cy - 4);
  g.font = `400 12px ${MONO}`;
  g.fillStyle = 'rgba(22,21,19,0.62)';
  g.fillText('页面已恢复。204 个障碍已清除。', cx, cy + 26);
  g.fillStyle = INK;
  g.font = `600 14px ${MONO}`;
  g.fillText(`${clock(game.runT)}   ·   得分 ${game.score}   ·   最佳连击 \u00d7${game.bestCombo}`, cx, cy + 58);
  const pb = game.best;
  if (pb) {
    g.font = `400 11px ${MONO}`;
    g.fillStyle = ink(0.45);
    g.fillText(
      pb.time >= game.runT ? `${game.board.label} — 新纪录`
                           : `${game.board.label} — 最佳 ${clock(pb.time)}`,
      cx, cy + 78);
  }
  // cy+84..cy+124 is the claim zone. It holds the name form, or what came back
  // from sending it, or nothing at all when there is no board to send to — and
  // it is reserved either way, so the screen never rearranges itself under a
  // cursor that is on its way to a button.
  if (game.claimError) {
    g.fillStyle = M;
    g.font = `600 10px ${MONO}`;
    track(g, 0.12);
    g.fillText(String(game.claimError).toUpperCase(), cx, cy + 134);
    track(g, 0);
  } else if (game.claimOpen) {
    // why it wants a handle rather than a name
    g.fillStyle = ink(0.4);
    g.font = `400 9px ${MONO}`;
    track(g, 0.1);
    g.fillText('本周最佳会写上名字', cx, cy + 134);
    track(g, 0);
  } else if (game.claimed) {
    const r = game.claimRank;
    g.fillStyle = INK;
    g.font = `600 13px ${MONO}`;
    track(g, 0.1);
    g.fillText(r === 1 ? '排行榜第一' : r ? `排行榜第 ${r}` : '已上榜',
               cx, cy + 104);
    track(g, 0);
  }

  // The way out. You just restored the page, so the thing to do next is go and
  // look at it; running it again is the quiet option. The link itself is a real
  // anchor, placed by placeHome().
  g.fillStyle = ink(0.38);
  g.font = `400 10px ${MONO}`;
  track(g, 0.1);
  g.fillText('点击任意处再来一局', cx, cy + 198);
  track(g, 0);
  g.restore();

  // the real lockup — plate mark over wordmark, the way the brand kit draws it
  const lockW = 68;
  g.save();
  g.globalCompositeOperation = 'multiply';
  drawLockup(g, cx - lockW / 2, cy + 216, lockW, ink(0.72));
  g.fillStyle = ink(0.42);
  g.font = `400 9px ${MONO}`;
  g.textAlign = 'center';
  g.fillText('ISKRA.GRAPHICS / 404', cx, cy + 284);
  g.restore();
}
