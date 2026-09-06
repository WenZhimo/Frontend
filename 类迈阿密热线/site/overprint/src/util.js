// ---------------------------------------------------------------------------
// small math / rng helpers
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// shortest signed delta between two angles
export function angDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// frame-rate independent approach toward a target
export const approach = (v, target, rate, dt) => lerp(v, target, 1 - Math.exp(-rate * dt));

// mulberry32 — deterministic so a floor seed reproduces exactly on restart
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// A damped spring integrator. Springs are used rather than fixed durations
// because they always start from the value that is currently on screen, so a
// target that changes mid-flight is followed smoothly instead of snapping.
//   response — seconds to reach the target; lower is snappier
//   damping  — 1.0 is critically damped (no overshoot)
export function springTo(cur, vel, target, dt, response = 0.35, damping = 1) {
  const w = (2 * Math.PI) / response;
  const a = -w * w * (cur - target) - 2 * damping * w * vel;
  const v = vel + a * Math.min(dt, 1 / 30);
  return [cur + v * Math.min(dt, 1 / 30), v];
}

// ---------------------------------------------------------------------------
// The simulation's own random stream, seeded per floor. Anything that changes
// what happens draws from here — where a body patrols, which way it strafes,
// where a shot scatters, where a dropped gun lands — so reprinting a floor
// gives the identical fight and a run is reproducible from its seed.
//
// Cosmetics deliberately stay on Math.random(). If sparks and shell casings
// drew from this stream, spawning a few more of them would shift every later
// draw, and the sim would depend on how much debris happened to be on screen.
// ---------------------------------------------------------------------------
let sim = makeRng(1);
export function reseedSim(seed) { sim = makeRng(seed >>> 0); }
export const rnd = () => sim();
