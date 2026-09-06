// Infinite-mode run seeds. By default every new run uses today's local date as
// the seed base, plus an incrementing run number. Supplying ?seed=... or setting
// a custom seed on the title screen replaces the date base without changing the
// run-number rule.
const DAY_KEY = 'overprint.seedBase';
const RUN_KEY = 'overprint.runNo';

function params() {
  return new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
}

export function dayStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function hashSeed(value) {
  const text = String(value || '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h & 0x7fffffff;
}

export function seedBase() {
  const fromUrl = params().get('seed');
  if (fromUrl && fromUrl.trim()) return fromUrl.trim();
  try {
    const saved = localStorage.getItem(DAY_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch { /* private mode */ }
  return dayStamp();
}

export function customSeedBase() {
  const base = seedBase();
  return base === dayStamp() ? '' : base;
}

export function setSeedBase(value) {
  const clean = String(value || '').trim();
  try {
    if (clean) localStorage.setItem(DAY_KEY, clean);
    else localStorage.removeItem(DAY_KEY);
  } catch { /* private mode */ }
  return previewRunSeed();
}

function runNo() {
  try { return Math.max(0, Number(localStorage.getItem(RUN_KEY) || 0) | 0); }
  catch { return 0; }
}

function seedFor(nextRunNo) {
  const base = seedBase();
  return { base, runNo: nextRunNo, seed: hashSeed(`${base}:${nextRunNo}`) };
}

export function previewRunSeed() {
  return seedFor(runNo() + 1);
}

export function nextRunSeed() {
  const next = runNo() + 1;
  try { localStorage.setItem(RUN_KEY, String(next)); } catch { /* private mode */ }
  return seedFor(next);
}

export const BOARDS = {
  endless: { id: 'endless', label: '无限模式', seed: () => previewRunSeed().seed },
};

export function pickBoard() {
  return BOARDS.endless;
}

export function currentBoard() {
  return BOARDS.endless;
}

// mm:ss.cc — hundredths, because the point of a run clock is to look fast.
// Monospaced, so nothing shifts as the digits roll.
export function clock(sec) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
}

// Kept for the old win/leaderboard surface. Infinite mode no longer ends a
// normal run, but recording helpers can still ask for a best safely.
function key(board) { return `overprint.pb.${board.id}`; }

export function loadBest(board) {
  try { return JSON.parse(localStorage.getItem(key(board)) || 'null'); }
  catch { return null; }
}

export function saveBest(board, run) {
  const prev = loadBest(board);
  if (prev && prev.time <= run.time) return prev;
  const rec = { time: run.time, score: run.score, day: dayStamp() };
  try { localStorage.setItem(key(board), JSON.stringify(rec)); } catch { /* private mode */ }
  return rec;
}
