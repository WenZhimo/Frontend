import { createRenderer } from './render.js';
import { REC } from './dev.js';
import { online, fetchBoard, submitRun, playerName, setPlayerName } from './net.js';
import { createGame } from './game.js';
import { drawHud, drawTitle, drawWin, drawFurniture, drawLegend, drawPause, drawCodexPopup } from './hud.js';
import { createTouch } from './touch.js';
import { initAudio, setMuted, isMuted } from './audio.js';

// Bumped on every edit and printed in the corner. If the number on screen is
// not the number the server reports, you are looking at a cached page.
export const BUILD_ID = '184172';
console.log('[overprint] build', BUILD_ID);
if (window.buildTitle) window.buildTitle('版本 ' + BUILD_ID);

const canvas = document.getElementById('c');
const renderer = createRenderer(canvas);
const game = createGame(renderer);
const touch = createTouch(canvas, game, renderer);
game.touch = touch;
game.showTitle();

const inp = game.input;
inp.mx = window.innerWidth / 2;
inp.my = window.innerHeight / 2;
let codexDrag = null;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !e.repeat && game.codexOpen) {
    e.preventDefault();
    game.toggleCodex();
    return;
  }
  if (e.code === 'Escape' && !e.repeat && game.state === 'play') {
    e.preventDefault();
    game.togglePause();
    return;
  }
  if (e.code === 'KeyR' && game.state === 'play') {
    e.preventDefault();
    game.refillAmmo();
    return;
  }
  if (e.code === 'KeyT' && !e.repeat && game.state === 'play' && game.mode === 'defense' && !game.paused) {
    e.preventDefault();
    game.toggleDefenseShop?.();
    return;
  }
  if (e.code === 'Enter' && !e.repeat && game.state === 'play' && game.mode === 'defense' && game.defense.between && !game.paused) {
    e.preventDefault();
    game.endDefenseRest?.();
    return;
  }
  if (game.paused && e.code !== 'KeyM') {
    e.preventDefault();
    return;
  }
  if (game.state === 'play' && game.mode === 'defense' && game.defense.shopOpen && /^Digit[1-9]$/.test(e.code)) {
    inp.buy = Number(e.code.slice(5));
    e.preventDefault();
    return;
  }
  if (KEYMAP[e.code]) { inp[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { inp.dash = true; e.preventDefault(); }
  if (e.code === 'KeyE' && !e.repeat && game.state === 'play') { inp.swap = true; e.preventDefault(); }
  if (e.code === 'KeyQ') { inp.throwHeld = true; e.preventDefault(); }
  if (e.code === 'Backspace' && game.state === 'play') { e.preventDefault(); game.restartFloor(); }
  if (e.code === 'KeyM') { initAudio(); setMuted(!isMuted()); }
  if (e.code === 'Enter' && game.state === 'title') game.begin();
});

addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) inp[KEYMAP[e.code]] = false;
  if (e.code === 'KeyQ') {
    if (inp.throwHeld) inp.throwReleased = true;
    inp.throwHeld = false;
    e.preventDefault();
  }
});

addEventListener('mousemove', (e) => {
  inp.mx = e.clientX; inp.my = e.clientY;
  if (codexDrag) {
    dragCodexScroll(e.clientY);
    e.preventDefault();
  }
});

// Embedded, the keyboard goes nowhere until this window has focus, and a click
// inside a cross-origin frame does not reliably give it. So take it: without
// this, WASD silently does nothing on anyone else's page while the mouse works
// fine, which reads as a broken game rather than a focus problem.
function grabFocus() {
  try { if (window.self !== window.top) window.focus(); } catch { /* opaque parent */ }
}

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  grabFocus();
  if (touch.engaged) return;
  if (hitTab(e.clientX, e.clientY)) return;
  if (game.state === 'title' || game.state === 'won') { game.begin(); return; }
  if (game.paused) return;
  if (e.button === 0) inp.fire = true;
  if (e.button === 2) inp.throwHeld = true;
});
addEventListener('mouseup', (e) => {
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
canvas.addEventListener('pointerdown', (e) => {
  grabFocus();
  if (e.pointerType !== 'touch') return;
  if (hitTab(e.clientX, e.clientY)) { e.preventDefault(); return; }
  if (game.state === 'title' || game.state === 'won') { e.preventDefault(); game.begin(); }
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  if (!game.codexOpen) return;
  scrollCodex(e.deltaY);
  e.preventDefault();
}, { passive: false });

// keep the player from sprinting off when the tab loses focus
addEventListener('blur', () => {
  codexDrag = null;
  inp.up = inp.down = inp.left = inp.right = false;
  inp.fire = false; inp.fireReleased = false;
  inp.throwHeld = false; inp.throwReleased = false; inp.throwIt = false; inp.swap = false;
});

// ---------------------------------------------------------------------------
// The board. Two jobs: keep today's standings on the title screen fresh, and
// let a finished run claim a place on it. Both fail soft — this is a 404 page
// before it is a leaderboard, so nothing here can stop anyone playing.
// ---------------------------------------------------------------------------
const claimForm = document.getElementById('claim');
const claimName = document.getElementById('claimname');
const claimGo = document.getElementById('claimgo');
let standingsAt = 0;

async function loadStandings(force) {
  if (!online) { game.standings = { offline: true }; return; }
  const now = performance.now();
  if (!force && now - standingsAt < 20000) return;
  standingsAt = now;
  const res = await fetchBoard(game.board.id, 8);
  game.standings = res && res.rows ? res : { offline: true };
}

function placeClaim() {
  const show = game.state === 'won' && online && !game.claimed;
  game.claimOpen = show;
  claimForm.hidden = !show;
  if (show) claimForm.style.top = `${Math.round(renderer.H / 2 + 84)}px`;
}

async function sendRun(name) {
  claimGo.disabled = true;
  claimGo.textContent = '提交中';
  const run = game.runResult || { time: game.runT, score: game.score };
  const res = await submitRun(game.board.id, {
    time: run.time, score: run.score,
    kills: game.kills, floor: game.floor, seed: game.seed,
  }, name);
  claimGo.disabled = false;
  claimGo.textContent = '提交记录';
  if (!res || res.error) {
    game.claimError = (res && res.error) || '排行榜暂无响应';
    return;
  }
  game.standings = res;
  if (res.placed === false) {
    // the name already holds a better time, so the line stays where it is —
    // leave the form open, because picking another name is the way forward
    game.claimError = `${name} 已有更快记录`;
    return;
  }
  setPlayerName(name);
  game.claimError = null;
  game.claimed = true;
  game.claimRank = res.rank || null;
  placeClaim();
}

claimForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = claimName.value.trim();
  if (name.length < 2) { game.claimError = '至少两个字符'; return; }
  sendRun(name);
});
// the canvas restarts the run on any click, so keep the form's own clicks in it
claimForm.addEventListener('pointerdown', (e) => e.stopPropagation());
claimForm.addEventListener('mousedown', (e) => e.stopPropagation());

// The mode chips are the one thing on the title canvas you can click that is
// not "start". They have to be tested before the start, or the mode could never
// be changed without a query string.
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
  const track = Math.max(1, s.h - s.thumbH);
  const local = y - s.y - codexDrag.offset;
  game.codexScroll = clampCodexScroll((local / track) * s.max);
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
      if (p.id === 'resume') game.togglePause();
      if (p.id === 'menu' && game.returnToMenu) {
        game.returnToMenu();
        loadStandings(true);
      }
      return true;
    }
    return false;
  }
  if (game.state === 'play' && game.mode === 'defense') {
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
  if (game.state !== 'title') return false;
  for (const t of game.ui.tabs || []) {
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
      if (game.selectMode(t.id) && t.id === 'endless') loadStandings(true);
      return true;
    }
  }
  for (const o of game.ui.options || []) {
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
      if (o.id === 'refill') game.toggleRefill();
      if (o.id === 'codex') game.toggleCodex();
      if (o.id === 'practiceMap') game.cyclePracticeMap();
      if (o.id === 'practiceWeapon') game.cyclePracticeWeapon();
      if (o.id === 'practiceEnemy') game.cyclePracticeEnemy();
      if (o.id === 'seed') {
        const current = game.customSeed || game.seedBase || '';
        const value = window.prompt('输入自定义种子；留空恢复为当天日期', current);
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

let wasState = null;
function watchState() {
  if (game.state === wasState) return;
  const entered = game.state;
  wasState = entered;
  if (entered === 'won') {
    game.claimed = false;
    game.claimError = null;
    claimName.value = playerName();
  } else if (entered === 'title') {
    loadStandings(true);
  }
  placeClaim();
}

loadStandings(true);

// The simulation runs on a fixed step, not on the frame. A speedrunner learning
// a floor needs the bodies to be in the same place ten seconds in, not just at
// the spawn — and with a variable step they never are, because the number of
// updates and the length of each one depend on the machine and the moment. One
// step is always the same length, so the same inputs produce the same fight,
// and the same code will replay a submitted run when the board needs verifying.
const FIXED = 1 / 120;
const MAX_STEPS = 6;        // after a stall, drop the backlog rather than spiral
let acc = 0;

let last = performance.now();
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000) * REC.speed;
  last = now;
  if (!game.paused) {
    touch.apply(rdt);
    acc = Math.min(acc + rdt, FIXED * MAX_STEPS);
    while (acc >= FIXED) { game.step(FIXED); acc -= FIXED; }
  } else {
    acc = 0;
  }
  watchState();
  if (game.state === 'title') loadStandings(false);
  renderer.draw(game);
  const g = renderer.ctx;
  if (game.state === 'title') { drawFurniture(g, renderer.W, renderer.H); drawTitle(g, game, renderer.W, renderer.H); }
  else if (game.state === 'won') { drawFurniture(g, renderer.W, renderer.H); drawWin(g, game, renderer.W, renderer.H); }
  else {
    drawHud(g, game, renderer.W, renderer.H);
    drawLegend(g, game, renderer.W, renderer.H);
    touch.draw(g);
    if (game.paused) drawPause(g, game, renderer.W, renderer.H);
  }
  if (game.codexOpen) drawCodexPopup(g, game, renderer.W, renderer.H);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// exposed for tuning / automated smoke tests
window.__game = game;
window.__renderer = renderer;
import('./entities.js').then((m)=>{ window.__W=m.WEAPONS; window.__SB=m.shieldBlocks; window.__SS=m.shieldSegmentAt; window.__AA=m.armourArc; window.__AL=m.armourLayout; window.__CD=m.columnDepth; });
