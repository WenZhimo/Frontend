// Talking to the board. Everything here fails soft: the game is a 404 page
// first, so a leaderboard that is down, blocked or simply absent must never
// stop anyone playing. Every call resolves to null rather than throwing.
//
// The API lives on the same origin in production. Anywhere else there is no
// API at all unless one is named with ?api=..., which keeps development runs
// out of the real board.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const sameOrigin = typeof location !== 'undefined' && /(^|\.)iskra\.graphics$/.test(location.hostname);
export const API = sameOrigin ? '' : (params.get('api') || null);
export const online = API !== null;

// A player id, not an account: it exists so one person holds one row on a
// board instead of filling it, and it never leaves this browser except as an
// opaque string.
export function playerId() {
  try {
    let id = localStorage.getItem('overprint.player');
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))]
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('overprint.player', id);
    }
    return id;
  } catch { return null; }
}

export function playerName() {
  try { return localStorage.getItem('overprint.name') || ''; } catch { return ''; }
}

export function setPlayerName(n) {
  try { localStorage.setItem('overprint.name', n); } catch { /* private mode */ }
}

async function call(path, init) {
  if (!online) return null;
  try {
    const res = await fetch(API + path, { ...init, cache: 'no-store' });
    const body = await res.json();
    return res.ok ? body : { error: body.error || `http ${res.status}` };
  } catch { return null; }
}

export function fetchBoard(board, limit = 8) {
  return call(`/api/board?board=${encodeURIComponent(board)}&limit=${limit}`);
}

export function submitRun(board, run, name) {
  const player = playerId();
  if (!player) return Promise.resolve(null);
  return call('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ board, player, name, ...run }),
  });
}
