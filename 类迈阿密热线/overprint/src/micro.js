// ---------------------------------------------------------------------------
// Micrographics: the instrument vocabulary the HUD is drawn in — hairline
// strokes, square-ended bars, tick scales, rings and register marks. Nothing here
// is decorative for its own sake; each primitive carries a reading.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

// A hard-edged bar. The world this sits over is built entirely from rectangles,
// hairlines and crop marks — a rounded pill reads as borrowed from somewhere
// else, so every quantity here is a plain bar with square ends.
export function bar(g, x, y, w, h, fill = false) {
  if (fill) g.fillRect(x, y, w, h);
  else g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

// a track with a filled portion
export function gauge(g, x, y, w, h, t, trackColor, fillColor) {
  g.strokeStyle = trackColor;
  g.lineWidth = 1;
  bar(g, x, y, w, h);
  if (t > 0.001) {
    g.fillStyle = fillColor;
    g.fillRect(x + 1.5, y + 1.5, Math.max(0, (w - 3) * t), h - 3);
  }
}

// ruled ticks, longer every `major`
export function tickScale(g, x, y, w, n, len = 4, major = 5) {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const px = x + (w * i) / n;
    const l = i % major === 0 ? len * 1.9 : len;
    g.moveTo(px, y);
    g.lineTo(px, y + l);
  }
  g.stroke();
}

// six-point asterisk
export function starMark(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.stroke();
}

export function ring(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
}

export function dashRing(g, x, y, r, segs = 12, duty = 0.55) {
  g.beginPath();
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU;
    g.arc(x, y, r, a0, a0 + (TAU / segs) * duty);
    const a1 = a0 + (TAU / segs) * duty;
    g.moveTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
  }
  g.stroke();
}

// register cross: gapped crosshair inside a ring
export function registerMark(g, x, y, r) {
  g.beginPath();
  g.moveTo(x - r * 1.7, y); g.lineTo(x - r * 0.55, y);
  g.moveTo(x + r * 0.55, y); g.lineTo(x + r * 1.7, y);
  g.moveTo(x, y - r * 1.7); g.lineTo(x, y - r * 0.55);
  g.moveTo(x, y + r * 0.55); g.lineTo(x, y + r * 1.7);
  g.stroke();
  ring(g, x, y, r);
}

// corner bracket, the frame the reference hangs its blocks in
export function bracket(g, x, y, sx, sy, len = 9) {
  g.beginPath();
  g.moveTo(x + sx * len, y); g.lineTo(x, y); g.lineTo(x, y + sy * len);
  g.stroke();
}

export function rule(g, x0, y, x1) {
  g.beginPath();
  g.moveTo(x0, y); g.lineTo(x1, y);
  g.stroke();
}

// ---------------------------------------------------------------------------
// The magazine, drawn as the thing it is. A row of identical bars tells you a
// number; a drum with six chambers tells you what you are holding.
// `loaded` chambers are solid, the rest are empty outlines.
// ---------------------------------------------------------------------------
export function magazine(g, x, y, w, h, feed, loaded, capacity, inkStrong, inkFaint) {
  g.lineWidth = 1;

  if (feed === 'drum') {
    // revolver cylinder, seen from behind: six case heads in a ring
    const R = h / 2 - 1;
    const cx = x + R + 1, cy = y + h / 2;
    datum(g, cx + R + 7, x + w, cy, inkFaint);
    g.strokeStyle = inkFaint;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    const cr = R * 0.26;
    for (let i = 0; i < capacity; i++) {
      const a = (i / capacity) * TAU - Math.PI / 2;
      round(g, cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58,
            cr, i < loaded, inkStrong, inkFaint);
    }
    g.strokeStyle = inkFaint;
    g.beginPath(); g.arc(cx, cy, R * 0.15, 0, TAU); g.stroke();
    return;
  }

  if (feed === 'barrel') {
    // two shells seen from behind, side by side on the same rail
    const R = h / 2 - 1;
    const cy = y + h / 2, step = R * 2.4;
    const x0 = x + R + 1;
    datum(g, x0 + (capacity - 1) * step + R + 7, x + w, cy, inkFaint);
    for (let i = 0; i < capacity; i++) {
      round(g, x0 + i * step, cy, R, i < loaded, inkStrong, inkFaint);
    }
    return;
  }

  // box magazine, also seen from behind: the column of case heads runs the
  // length of the case. A pistol feeds a single straight stack; an SMG holds
  // twice as many by staggering them into two rows, so the drawing does too.
  // Every round keeps a hairline of daylight around it — nothing overlaps.
  const zig = feed === 'stagger';
  const span = w - 8;
  let r, pitch, off;
  if (zig) {
    // consecutive rounds sit a pitch apart and half a row apart; both the
    // along-row and the across-row gap have to stay clear of two radii
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

  // the case around them: walls, a feed lip at the muzzle end, a floorplate
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
  g.beginPath();                                   // floorplate
  g.moveTo(Math.round(x + w) - 4.5, by);
  g.lineTo(Math.round(x + w) - 4.5, by + bodyH);
  g.stroke();

  // the stack empties from the feed lip, so what is left sits on the follower
  const x0 = x + 4 + (zig ? pitch : pitch / 2);
  for (let i = 0; i < capacity; i++) {
    round(g, x0 + i * pitch, cy + (zig ? (i % 2 ? off : -off) : 0),
          r, i >= capacity - loaded, inkStrong, inkFaint);
  }
}

// one round seen from behind: the case rim, and the primer in the middle of
// it. Loaded rounds carry the primer; a spent slot is just the empty hole.
function round(g, cx, cy, r, loaded, inkStrong, inkFaint) {
  if (!loaded) {                       // an empty slot is just the hole
    g.strokeStyle = inkFaint;
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    return;
  }
  // a live round is two solid marks with clean paper between them: the case
  // head as a heavy ring, the primer as a dot in the middle of it
  const lw = Math.max(1.4, r * 0.42);
  g.strokeStyle = inkStrong;
  g.lineWidth = lw;
  g.beginPath(); g.arc(cx, cy, r - lw / 2, 0, TAU); g.stroke();
  g.lineWidth = 1;
  g.fillStyle = inkStrong;
  g.beginPath(); g.arc(cx, cy, Math.max(0.9, r * 0.3), 0, TAU); g.fill();
}

// the rail a compact feed device sits on: the band is always the full width,
// so what the device does not use is drawn as an extension line rather than
// left as a hole in the panel
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
