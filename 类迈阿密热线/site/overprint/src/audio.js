import { REC } from './dev.js';
// ---------------------------------------------------------------------------
// Tiny WebAudio synth. Nothing is loaded — every sound is built from noise and
// oscillators at the moment it fires.
//
// Guns are layered the way a real one reads: a transient crack you hear first,
// a pitched body that gives it weight, and a tail that decays after. One-layer
// blips sound like a menu; three layers through a compressor sound like a shot.
//
// The whole bus runs through one lowpass whose cutoff follows the time scale,
// so a dilation sounds submerged rather than merely slow.
// ---------------------------------------------------------------------------

let ctx = null;
let master = null;
let comp = null;
let filter = null;
let punch = null;      // saturated bus — everything percussive goes through it
let noiseBuf = null;
let subGain = null;
let enabled = true;

const rnd = (a, b) => a + Math.random() * (b - a);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { enabled = false; return; }
  ctx = new AC();

  filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 18000 / REC.stretch;
  filter.Q.value = 0.4;

  // glue and punch: without this the layers just add up and clip
  comp = ctx.createDynamicsCompressor();
  // measured: this leaves the transient intact and lands a shotgun at ~0.65
  // peak with no clipping, where the earlier settings capped it around 0.24
  comp.threshold.value = -8;
  comp.knee.value = 5;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.001;
  comp.release.value = 0.10;

  // Level set by measuring the live bus, not by modelling it: at 1.0 every gun
  // peaked past 1.0 and clipped at the destination, which reads as crackle
  // rather than punch. 0.78 lands the loudest shot around 0.8.
  master = ctx.createGain();
  master.gain.value = 0.78;

  // A real gunshot clips. Soft-clipping the percussive bus adds the harmonics
  // that read as loudness and grit — it is most of what "satisfying" means here.
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 512) - 1;
    curve[i] = Math.tanh(x * 3.2);
  }
  shaper.curve = curve;
  shaper.oversample = '4x';

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

  // silent at full speed; this only exists while time is dilated
  const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 47 / REC.stretch;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 70.5 / REC.stretch;
  subGain = ctx.createGain(); subGain.gain.value = 0;
  o1.connect(subGain); o2.connect(subGain); subGain.connect(master);
  o1.start(); o2.start();
}

export function setTimeScale(ts) {
  if (!ctx) return;
  const t = ctx.currentTime;
  filter.frequency.setTargetAtTime((420 + Math.pow(ts, 0.7) * 17600) / REC.stretch, t, 0.05 * REC.stretch);
  subGain.gain.setTargetAtTime(Math.max(0, 1 - ts / 0.55) * 0.055, t, 0.09);
}

export function setMuted(m) {
  enabled = !m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.78, ctx.currentTime, 0.02);
}
export function isMuted() { return !enabled; }

// ---- primitives -----------------------------------------------------------

// filtered noise with an exponential fade and an optional filter sweep
function nz(o) {
  if (!ctx || !enabled) return;
  // S stretches a sound for footage that will be sped up afterwards: three
  // times as long, a third as high, so the speed-up lands it back on pitch.
  // It is 1 everywhere except shot mode.
  const S = REC.stretch;
  const t = ctx.currentTime + (o.at || 0) * S;
  const dur = o.dur * S;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = (o.rate || 1) / S;

  const bq = ctx.createBiquadFilter();
  bq.type = o.type || 'highpass';
  bq.frequency.setValueAtTime(o.freq / S, t);
  if (o.sweepTo) bq.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweepTo / S), t + dur);
  bq.Q.value = o.q || 0.8;

  // instant attack: ramping up over even 1ms audibly blunts a transient
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(bq); bq.connect(g);
  g.connect(o.clean ? filter : punch);
  src.start(t, Math.random() * 0.6);
  src.stop(t + dur + 0.02);
}

// pitched layer with an exponential pitch drop — this is the "body" of a shot
function osc(o) {
  if (!ctx || !enabled) return;
  const S = REC.stretch;
  const t = ctx.currentTime + (o.at || 0) * S;
  const dur = o.dur * S;
  const s = ctx.createOscillator();
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f0 / S, t);
  s.frequency.exponentialRampToValueAtTime(Math.max(6, o.f1 / S), t + dur * (o.bend || 0.7));

  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  s.connect(g);
  g.connect(o.clean ? filter : punch);
  s.start(t); s.stop(t + dur + 0.02);
}

const tone = (f0, f1, dur, gain, type = 'square') => osc({ f0, f1, dur, gain, type, bend: 0.9, clean: true });

// ---- sounds ---------------------------------------------------------------
export const sfx = {
  // Five layers, in the order the ear resolves them: a full-band snap you feel
  // before you hear, a bright crack, a body whose pitch collapses in ~40ms, a
  // sub that hits your chest, and a room tail. The fast body is the difference
  // between a gunshot and a beep.
  // `t` is rounds remaining, 0..1. A thinning magazine rides up in pitch, so a
  // burst tells you it is nearly out before the counter does.
  shot(t = 1) {
    const j = rnd(0.94, 1.07) * (1 + (1 - t) ** 1.6 * 0.62);
    const body = 0.5 + 0.5 * t;   // the low end thins out as the magazine does
    nz({ dur: 0.006, gain: 1.3, type: 'highpass', freq: 200 });
    nz({ dur: 0.062, gain: 0.7, type: 'highpass', freq: 2400 * j });
    osc({ type: 'triangle', f0: 430 * j, f1: 48, dur: 0.045, gain: 0.9, bend: 1 });
    osc({ type: 'sine', f0: 112 * j, f1: 34, dur: 0.13, gain: 0.55 * body });
    nz({ dur: 0.22, gain: 0.16, type: 'lowpass', freq: 1200, sweepTo: 320 });
  },

  // same shot with the tail cut off, so a burst stays tight instead of smearing
  smg(t = 1) {
    const j = rnd(0.9, 1.13) * (1 + (1 - t) ** 1.6 * 0.7);
    const body = 0.45 + 0.55 * t;
    nz({ dur: 0.005, gain: 1.0, type: 'highpass', freq: 300 });
    nz({ dur: 0.036, gain: 0.5, type: 'highpass', freq: 3000 * j });
    osc({ type: 'square', f0: 490 * j, f1: 92, dur: 0.03, gain: 0.62, bend: 1 });
    osc({ type: 'sine', f0: 132 * j, f1: 46, dur: 0.06, gain: 0.32 * body });
  },

  // the heaviest single round: more snap, deeper sub, a room that hangs
  revolver(t = 1) {
    const j = rnd(0.96, 1.05) * (1 + (1 - t) ** 1.6 * 0.55);
    const body = 0.5 + 0.5 * t;
    nz({ dur: 0.008, gain: 1.4, type: 'highpass', freq: 150 });
    nz({ dur: 0.075, gain: 0.8, type: 'highpass', freq: 1800 * j });
    osc({ type: 'sawtooth', f0: 350 * j, f1: 38, dur: 0.07, gain: 1.0, bend: 1 });
    osc({ type: 'sine', f0: 86 * j, f1: 26, dur: 0.3, gain: 0.7 * body });
    nz({ dur: 0.5, gain: 0.24, type: 'lowpass', freq: 900, sweepTo: 220 });
  },

  // widest and lowest — the snap is broadband and the tail runs long
  shotgun(t = 1) {
    const j = rnd(0.97, 1.03) * (1 + (1 - t) ** 1.6 * 0.5);
    const body = 0.5 + 0.5 * t;
    nz({ dur: 0.011, gain: 1.5, type: 'highpass', freq: 120 });
    nz({ dur: 0.13, gain: 0.6, type: 'bandpass', freq: 1600 * j, q: 0.4 });
    osc({ type: 'sawtooth', f0: 265 * j, f1: 30, dur: 0.09, gain: 1.0, bend: 1 });
    osc({ type: 'sine', f0: 66, f1: 22, dur: 0.42, gain: 0.8 * body });
    nz({ dur: 0.7, gain: 0.34, type: 'lowpass', freq: 820, sweepTo: 180 });
  },

  // melee: air moving, no impact — the impact is whatever it lands on
  swing() {
    nz({ dur: 0.2, gain: 0.26, type: 'bandpass', freq: 380, sweepTo: 2600, q: 1.4 });
  },

  // a body dropping: low thud, wet transient, no ring
  kill() {
    nz({ dur: 0.05, gain: 0.3, type: 'highpass', freq: 1700 });
    nz({ dur: 0.24, gain: 0.36, type: 'lowpass', freq: 430, sweepTo: 160 });
    osc({ type: 'sine', f0: 155, f1: 32, dur: 0.3, gain: 0.55 });
    osc({ type: 'triangle', f0: 92, f1: 26, dur: 0.22, gain: 0.3 });
  },

  knockdown() {
    nz({ dur: 0.16, gain: 0.26, type: 'lowpass', freq: 600, sweepTo: 220 });
    osc({ type: 'sine', f0: 118, f1: 44, dur: 0.17, gain: 0.34 });
  },

  execute() {
    nz({ dur: 0.28, gain: 0.34, type: 'lowpass', freq: 320, sweepTo: 120 });
    osc({ type: 'square', f0: 84, f1: 30, dur: 0.32, gain: 0.34 });
    osc({ type: 'sine', f0: 52, f1: 22, dur: 0.42, gain: 0.4 });
  },

  dash() {
    nz({ dur: 0.19, gain: 0.24, type: 'bandpass', freq: 600, sweepTo: 3000, q: 1.1 });
    osc({ type: 'sine', f0: 620, f1: 220, dur: 0.12, gain: 0.07 });
  },

  pickup() {
    osc({ type: 'square', f0: 700, f1: 700, dur: 0.045, gain: 0.13, bend: 1, clean: true });
    osc({ type: 'square', f0: 1150, f1: 1150, dur: 0.06, gain: 0.11, bend: 1, at: 0.05, clean: true });
  },

  throwIt() {
    nz({ dur: 0.16, gain: 0.2, type: 'bandpass', freq: 900, sweepTo: 2400, q: 1.6 });
    osc({ type: 'triangle', f0: 280, f1: 660, dur: 0.11, gain: 0.09 });
  },

  alert() {
    tone(860, 860, 0.05, 0.11);
    setTimeout(() => tone(1180, 1180, 0.055, 0.1), 70);
  },

  shout() {
    osc({ type: 'sawtooth', f0: 250, f1: 330, dur: 0.12, gain: 0.15, bend: 0.9 });
    setTimeout(() => osc({ type: 'sawtooth', f0: 210, f1: 155, dur: 0.15, gain: 0.11, bend: 0.9 }), 95);
  },

  // a door taking a shoulder: timber crack over a big low hit
  slam() {
    nz({ dur: 0.05, gain: 0.7, type: 'highpass', freq: 1500 });
    nz({ dur: 0.4, gain: 0.34, type: 'lowpass', freq: 520, sweepTo: 150 });
    osc({ type: 'sawtooth', f0: 140, f1: 32, dur: 0.34, gain: 0.45 });
    osc({ type: 'sine', f0: 58, f1: 24, dur: 0.44, gain: 0.42 });
  },

  block() {
    nz({ dur: 0.07, gain: 0.34, type: 'highpass', freq: 3000 });
    osc({ type: 'square', f0: 1250, f1: 620, dur: 0.09, gain: 0.15 });
    osc({ type: 'triangle', f0: 2400, f1: 1500, dur: 0.06, gain: 0.08 });
  },

  shieldBreak() {
    nz({ dur: 0.42, gain: 0.5, type: 'highpass', freq: 1400, sweepTo: 4200 });
    osc({ type: 'square', f0: 430, f1: 70, dur: 0.34, gain: 0.32 });
    osc({ type: 'sine', f0: 96, f1: 30, dur: 0.4, gain: 0.36 });
  },

  glass() {
    nz({ dur: 0.36, gain: 0.36, type: 'highpass', freq: 3600 });
    [2700, 3500, 2150, 4100].forEach((f, i) =>
      setTimeout(() => osc({ type: 'triangle', f0: f * rnd(0.9, 1.1), f1: f * 0.55, dur: 0.1, gain: 0.08 }), i * 38));
  },

  splinter() {
    nz({ dur: 0.05, gain: 0.75, type: 'highpass', freq: 900 });
    nz({ dur: 0.2, gain: 0.3, type: 'bandpass', freq: 1400, q: 0.7 });
    osc({ type: 'square', f0: 210, f1: 60, dur: 0.09, gain: 0.35, bend: 1 });
  },

  explosion() {
    nz({ dur: 0.016, gain: 1.35, type: 'highpass', freq: 120 });
    nz({ dur: 0.45, gain: 0.5, type: 'lowpass', freq: 760, sweepTo: 130 });
    osc({ type: 'sawtooth', f0: 118, f1: 26, dur: 0.32, gain: 0.72 });
    osc({ type: 'sine', f0: 48, f1: 18, dur: 0.58, gain: 0.62 });
  },

  empty() { osc({ type: 'square', f0: 210, f1: 150, dur: 0.035, gain: 0.1 }); },

  die() {
    nz({ dur: 0.55, gain: 0.5, type: 'lowpass', freq: 700, sweepTo: 120 });
    osc({ type: 'sawtooth', f0: 200, f1: 26, dur: 0.6, gain: 0.34 });
    osc({ type: 'sine', f0: 70, f1: 20, dur: 0.7, gain: 0.4 });
  },

  clear() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => osc({ type: 'triangle', f0: f, f1: f, dur: 0.24, gain: 0.13, bend: 1, clean: true }), i * 75));
  },

  status() {
    [880, 1320].forEach((f, i) =>
      setTimeout(() => osc({ type: 'square', f0: f, f1: f, dur: 0.09, gain: 0.1, bend: 1, clean: true }), i * 80));
  },

  focusIn() { osc({ type: 'sine', f0: 300, f1: 120, dur: 0.3, gain: 0.1, clean: true }); },
  focusOut() { osc({ type: 'sine', f0: 120, f1: 320, dur: 0.16, gain: 0.07, clean: true }); },
};
