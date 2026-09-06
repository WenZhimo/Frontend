import { TAU, clamp } from './util.js';

const INK = '#161513';
const M = '#EC0A63';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

const STICK_R = 58;   // move stick: how far the thumb travels for full speed
const DEAD = 12;      // below this the stick reads as a tap, not a push

// Aiming and firing are the same thumb but not the same push. Under FIRE_AT you
// are only turning — which is how you look down a corridor without announcing
// yourself — and past it the gun goes off.
//
// FIRE_AT is also the whole of the aiming stick that matters: the angle comes
// from atan2, which does not care how far out you are, so the band between DEAD
// and FIRE_AT is all the room you get to turn in. Making it wider is what makes
// looking around easier — the same thumb movement covers a smaller angle. AIM_R
// is only where the outer ring is drawn, kept at roughly the same proportion so
// the trigger still reads as a threshold rather than the edge.
const AIM_R = 100;
const FIRE_AT = 62;

// ---------------------------------------------------------------------------
// Touch controls. Pointer Events handle multitouch on mobile perfectly well as
// long as touch-action is off — the hard parts here are aiming precision and
// keeping a thumb from covering the thing it is aiming at, not the plumbing.
// ---------------------------------------------------------------------------
export function createTouch(canvas, game, renderer) {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const enabled = coarse || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

  const t = {
    enabled,
    engaged: false,          // true once a real touch has happened
    move: null,              // { id, ox, oy, x, y }
    aim: null,
    buttons: [],
    aimAngle: 0,
    hasAim: false,
    firing: false,
    scale: 1,            // layout() retunes this; apply() can run before it has
  };

  function layout() {
    const W = renderer.W, H = renderer.H;
    const s = clamp(Math.min(W, H) / 780, 0.82, 1.25);
    // Tucked further into the corner and further apart than they were: the aim
    // stick now reaches wider, and a button is hit-tested generously, so the two
    // were competing for the same thumb. The bottom inset stays honest — a
    // phone's home indicator lives down there.
    const padX = 14 * s, padY = 20 * s;
    const R = 46 * s, r = 31 * s;
    t.buttons = [
      { id: 'dash',  label: '冲刺',  x: W - padX - R, y: H - padY - R,                  r: R, press: 0 },
      { id: 'throw', label: '投掷',  x: W - padX - R, y: H - padY - R * 2 - r - 24 * s, r,    press: 0 },
    ];
    t.scale = s;
  }

  function hitButton(x, y) {
    for (const b of t.buttons) {
      const rr = b.r * 1.28; // generous: fingers are not cursors
      if ((x - b.x) ** 2 + (y - b.y) ** 2 < rr * rr) return b;
    }
    return null;
  }

  function down(e) {
    if (e.pointerType !== 'touch') return;
    t.engaged = true;
    layout();
    const x = e.clientX, y = e.clientY;

    const b = hitButton(x, y);
    if (b) {
      b.press = 1;
      b.pid = e.pointerId;
      if (b.id === 'dash') game.input.dash = true;
      if (b.id === 'throw') game.input.throwIt = true;
      e.preventDefault();
      return;
    }

    // left of the split moves, right of it aims and attacks
    if (x < renderer.W * 0.46) {
      if (!t.move) t.move = { id: e.pointerId, ox: x, oy: y, x, y };
    } else if (!t.aim) {
      t.aim = { id: e.pointerId, ox: x, oy: y, x, y };
    }
    e.preventDefault();
  }

  function move(e) {
    if (e.pointerType !== 'touch') return;
    if (t.move && t.move.id === e.pointerId) { t.move.x = e.clientX; t.move.y = e.clientY; }
    if (t.aim && t.aim.id === e.pointerId) { t.aim.x = e.clientX; t.aim.y = e.clientY; }
    e.preventDefault();
  }

  function up(e) {
    if (e.pointerType !== 'touch') return;
    if (t.move && t.move.id === e.pointerId) t.move = null;
    if (t.aim && t.aim.id === e.pointerId) {
      if (t.firing) game.input.fireReleased = true;
      t.aim = null;
    }
    for (const b of t.buttons) if (b.pid === e.pointerId) { b.pid = -1; b.press = 0; }
    e.preventDefault();
  }

  canvas.addEventListener('pointerdown', down, { passive: false });
  canvas.addEventListener('pointermove', move, { passive: false });
  canvas.addEventListener('pointerup', up, { passive: false });
  canvas.addEventListener('pointercancel', up, { passive: false });
  window.addEventListener('resize', layout);
  layout();

  // called every frame, before the step
  t.apply = function (dt) {
    const inp = game.input;
    for (const b of t.buttons) if (b.press > 0 && !b.pid) b.press = Math.max(0, b.press - dt * 5);

    if (t.move) {
      let dx = t.move.x - t.move.ox, dy = t.move.y - t.move.oy;
      const len = Math.hypot(dx, dy);
      const R = STICK_R * t.scale;
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      const mag = Math.min(1, Math.hypot(dx, dy) / R);
      if (mag * R > DEAD * t.scale) {
        const a = Math.atan2(dy, dx);
        inp.analog = true;
        inp.axisX = Math.cos(a) * mag;
        inp.axisY = Math.sin(a) * mag;
      } else { inp.analog = true; inp.axisX = 0; inp.axisY = 0; }
    } else if (t.engaged) {
      inp.analog = true; inp.axisX = 0; inp.axisY = 0;
    }

    if (t.aim) {
      const dx = t.aim.x - t.aim.ox, dy = t.aim.y - t.aim.oy;
      const len = Math.hypot(dx, dy);
      if (len > DEAD * t.scale) { t.aimAngle = Math.atan2(dy, dx); t.hasAim = true; }
      t.firing = len > FIRE_AT * t.scale;
      inp.fire = t.firing;
      inp.aimAngle = t.aimAngle;
      inp.hasAim = t.hasAim;
    } else if (t.engaged) {
      t.firing = false;
      inp.fire = false;
      inp.aimAngle = t.aimAngle;
      inp.hasAim = t.hasAim;
    }
  };

  // ---- drawing -------------------------------------------------------------
  t.draw = function (ctx) {
    if (!t.engaged) return;
    layout();
    const s = t.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = 1.6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const b of t.buttons) {
      // a slip of paper under each one, same as the HUD cards, so they stay
      // legible over the wall hatch
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = '#EFECE3';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();

      ctx.globalCompositeOperation = 'multiply';
      if (b.press > 0) {
        ctx.globalAlpha = 0.55 * b.press;
        ctx.fillStyle = M;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = b.press > 0 ? 1 : 0.62;
      ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `600 ${Math.round(10 * s)}px ${MONO}`;
      ctx.fillText(b.label, b.x, b.y);
    }

    const stick = (st, col, trigger) => {
      if (!st) return;
      const R = (trigger ? AIM_R : STICK_R) * s;
      let dx = st.x - st.ox, dy = st.y - st.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, R, 0, TAU); ctx.stroke();
      // the aim stick draws its trigger line, so where the gun starts firing is
      // something you can see rather than something you find out
      if (trigger) {
        ctx.setLineDash([3, 5]);
        ctx.globalAlpha = t.firing ? 0.8 : 0.3;
        ctx.beginPath(); ctx.arc(st.ox, st.oy, FIRE_AT * s, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      const hot = trigger && t.firing;
      ctx.globalAlpha = hot ? 1 : 0.8;
      ctx.lineWidth = hot ? 2.6 : 1.6;
      ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 19, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = hot ? 0.6 : 0.25;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 19, 0, TAU); ctx.fill();
    };
    stick(t.move, INK, false);
    stick(t.aim, M, true);
    ctx.restore();
  };

  return t;
}
