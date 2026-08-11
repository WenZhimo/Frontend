(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });

  const COLS = 126;
  const ROWS = 60;
  const FILES = "abcdefgh";
  const TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  const VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
  const TAG = { pawn: "P", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" };
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    page: "#020306",
    ink: "#080b11",
    ink2: "#0b0f17",
    cellA: "#202735",
    cellB: "#151b25",
    grid: "#111722",
    line: "#747b8c",
    dim: "#626b7e",
    muted: "#7a8397",
    header: "#b3b8c8",
    white: "#eef7ff",
    codex: "#9bf6ff",
    codexAlt: "#dffcff",
    kimi: "#f6a33b",
    kimiAlt: "#ffd269",
    warmDim: "#956d44",
    coolDim: "#5aafc7",
    blue: "#6ed5ec",
    red: "#ff4e59",
    black: "#020306",
  };

  const screen = {
    ch: Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
    bg: Array(COLS * ROWS),
  };

  const dotLayer = {
    mask: new Uint8Array(COLS * ROWS),
    power: new Float32Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
  };

  const left = { x: 1, y: 1, w: 77, h: 58 };
  const right = { x: 80, y: 1, w: 45, h: 58 };
  const board = { x: 9, y: 5, sw: 9, sh: 6, w: 72, h: 48 };
  const DOT_W = 2;
  const DOT_H = 4;
  const BRAILLE_BASE = 0x2800;
  const BRAILLE_FULL = String.fromCharCode(BRAILLE_BASE + 0xff);
  const BRAILLE_DUST = String.fromCharCode(BRAILLE_BASE + 0x09);

  const script = [
    ["codex", "e2", "e4"],
    ["kimi", "e7", "e5"],
    ["codex", "g1", "f3"],
    ["kimi", "b8", "c6"],
    ["codex", "f1", "b5"],
    ["kimi", "a7", "a6"],
    ["codex", "b5", "c6", "x"],
    ["kimi", "d7", "c6", "x"],
    ["codex", "d2", "d4"],
    ["kimi", "e5", "d4", "x"],
    ["codex", "f3", "d4", "x"],
    ["kimi", "g8", "f6"],
    ["codex", "b1", "c3"],
    ["kimi", "f8", "b4"],
    ["codex", "c1", "g5"],
    ["kimi", "d8", "b6"],
    ["codex", "d1", "d2"],
    ["kimi", "b6", "b2", "x"],
    ["codex", "d4", "b5"],
    ["kimi", "a6", "b5", "x"],
    ["codex", "c3", "b5", "x"],
    ["kimi", "b4", "d2", "x"],
    ["codex", "e1", "d2", "x"],
    ["kimi", "c6", "b5", "x"],
    ["codex", "g5", "h4"],
    ["kimi", "f6", "e4", "x"],
    ["codex", "d2", "c1"],
    ["kimi", "e8", "g8"],
    ["codex", "h4", "g5"],
    ["kimi", "h7", "h6"],
    ["codex", "g5", "d8"],
    ["kimi", "b7", "c6", "x"],
    ["codex", "d8", "f6"],
    ["kimi", "g7", "f6", "x"],
    ["codex", "b5", "d6", "+"],
    ["kimi", "g8", "h8"],
    ["codex", "a1", "d1"],
    ["kimi", "c8", "g4"],
    ["codex", "d1", "d7", "x+"],
    ["kimi", "h8", "g8"],
    ["codex", "d7", "f7", "+"],
    ["kimi", "g8", "h8"],
    ["codex", "f7", "f5", "+"],
    ["kimi", "h8", "g8", "", "king"],
    ["codex", "a2", "a4", "", "pawn"],
    ["kimi", "a6", "a5", "", "pawn"],
    ["codex", "a1", "a3", "", "rook"],
    ["kimi", "b6", "b2", "x", "queen"],
    ["codex", "d6", "f7", "+", "knight"],
    ["kimi", "g8", "f7", "x", "king"],
    ["codex", "d1", "d7", "+", "rook"],
    ["kimi", "f7", "g6", "", "king"],
    ["codex", "c6", "e5", "+", "knight"],
    ["kimi", "g6", "f5", "", "king"],
    ["codex", "g2", "g4", "+", "pawn"],
    ["kimi", "f5", "f4", "x", "king"],
    ["codex", "e5", "d3", "+", "knight"],
    ["kimi", "f4", "g4", "x", "king"],
    ["codex", "d7", "g7", "x+", "rook"],
    ["kimi", "g4", "f5", "", "king"],
    ["codex", "g7", "f7", "+", "rook"],
    ["kimi", "f5", "g6", "", "king"],
    ["codex", "d3", "e5", "+", "knight"],
    ["kimi", "g6", "g5", "", "king"],
    ["codex", "h2", "h4", "+", "pawn"],
    ["kimi", "g5", "h5", "", "king"],
    ["codex", "f7", "f5", "#", "rook"],
  ].map(([side, from, to, flag, type]) => ({ side, from, to, flag: flag || "", type: type || "" }));

  const pieceMasks = buildPieceMasks({
    pawn: [
      "      ####      ",
      "     ######     ",
      "     ######     ",
      "      ####      ",
      "     ######     ",
      "    ########    ",
      "    ########    ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      "                ",
    ],
    rook: [
      "  ###  ##  ###  ",
      " ############## ",
      " ############## ",
      "   ##########   ",
      "   ##########   ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      " ############## ",
      " ############## ",
      "                ",
    ],
    knight: [
      "      #######   ",
      "    ##########  ",
      "   ###########  ",
      "  #######  ###  ",
      "  ####     ###  ",
      "  ###    ####   ",
      "       #####    ",
      "      #####     ",
      "    ##########  ",
      "  ############  ",
      "  ############  ",
      "                ",
    ],
    bishop: [
      "       ##       ",
      "      ####      ",
      "     ######     ",
      "    ########    ",
      "      ####      ",
      "     ####       ",
      "    ########    ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      "                ",
    ],
    queen: [
      "  ##   ##   ##  ",
      " #### #### #### ",
      " ############## ",
      "  ############  ",
      "   ##########   ",
      "   ##########   ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      " ############## ",
      " ############## ",
      "                ",
    ],
    king: [
      "       ##       ",
      "     ######     ",
      "       ##       ",
      "    ########    ",
      "   ##########   ",
      "    ########    ",
      "   ##########   ",
      "  ############  ",
      "  ############  ",
      " ############## ",
      " ############## ",
      "                ",
    ],
  });

  let dpr = 1;
  let cw = 1;
  let ch = 1;
  let fontSize = 16;
  let pieces = [];
  let captured = { codex: [], kimi: [] };
  let fragments = [];
  let ripples = [];
  let active = null;
  let moveCursor = 0;
  let ply = 0;
  let nextMoveAt = 0;
  let paused = false;
  let lastFrame = 0;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const hash = (n) => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  function buildPieceMasks(source) {
    const masks = {};
    Object.entries(source).forEach(([name, lines]) => {
      const width = Math.max(...lines.map((line) => line.length));
      const rows = [];
      lines.forEach((line) => {
        const padded = line.padEnd(width, " ");
        rows.push(padded, padded);
      });
      masks[name] = {
        width,
        height: rows.length,
        rows,
      };
    });
    return masks;
  }

  function braille(mask) {
    return String.fromCharCode(BRAILLE_BASE + (mask & 0xff));
  }

  function brailleBit(sx, sy) {
    const col = ((sx % DOT_W) + DOT_W) % DOT_W;
    const row = ((sy % DOT_H) + DOT_H) % DOT_H;
    if (col === 0) return [0x01, 0x02, 0x04, 0x40][row];
    return [0x08, 0x10, 0x20, 0x80][row];
  }

  function textureBraille(seed, density, bias = 0) {
    let mask = 0;
    for (let row = 0; row < DOT_H; row += 1) {
      for (let col = 0; col < DOT_W; col += 1) {
        const h = hash(seed + row * 23 + col * 97 + bias);
        if (h < density) mask |= brailleBit(col, row);
      }
    }
    if (!mask) mask = hash(seed + 701) > 0.5 ? 0x01 : 0x08;
    return braille(mask);
  }

  function idx(x, y) {
    return y * COLS + x;
  }

  function put(x, y, c, fg = color.muted, bg = null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const i = idx(x, y);
    screen.ch[i] = c;
    screen.fg[i] = fg;
    if (bg) screen.bg[i] = bg;
  }

  function text(x, y, value, fg = color.muted, bg = null) {
    Array.from(String(value)).forEach((char, i) => put(x + i, y, char, fg, bg));
  }

  function fillArea(x, y, w, h, bg, fg = color.muted, c = " ") {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        const i = idx(col, row);
        screen.ch[i] = c;
        screen.fg[i] = fg;
        screen.bg[i] = bg;
      }
    }
  }

  function box({ x, y, w, h }, bg) {
    fillArea(x, y, w, h, bg);
    for (let col = x; col < x + w; col += 1) {
      put(col, y, "-", color.line, bg);
      put(col, y + h - 1, "-", color.line, bg);
    }
    for (let row = y; row < y + h; row += 1) {
      put(x, row, "|", color.line, bg);
      put(x + w - 1, row, "|", color.line, bg);
    }
    put(x, y, "+", color.line, bg);
    put(x + w - 1, y, "+", color.line, bg);
    put(x, y + h - 1, "+", color.line, bg);
    put(x + w - 1, y + h - 1, "+", color.line, bg);
  }

  function clearDotLayer() {
    dotLayer.mask.fill(0);
    dotLayer.power.fill(0);
    dotLayer.fg.fill(null);
  }

  function clearScreen() {
    fillArea(0, 0, COLS, ROWS, color.page, color.muted, " ");
    box(left, color.ink);
    box(right, color.ink2);
    clearDotLayer();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * nextDpr) || canvas.height !== Math.round(rect.height * nextDpr)) {
      dpr = nextDpr;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    cw = rect.width / COLS;
    ch = rect.height / ROWS;
    fontSize = Math.min(ch * 0.9, cw * 1.42);
    ctx.font = `700 ${fontSize}px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = false;
  }

  function square(name) {
    return { file: FILES.indexOf(name[0]), rank: 8 - Number(name[1]) };
  }

  function boardPos(file, rank) {
    return {
      x: board.x + file * board.sw + Math.floor(board.sw / 2),
      y: board.y + rank * board.sh + Math.floor(board.sh / 2),
    };
  }

  function piece(id, side, type, file, rank) {
    return { id, side, type, file, rank, seed: id.length * 67 + file * 11 + rank * 29 };
  }

  function reset(now = performance.now()) {
    pieces = [];
    fragments = [];
    ripples = [];
    captured = { codex: [], kimi: [] };
    active = null;
    moveCursor = 0;
    ply = 0;
    nextMoveAt = now + 900;
    for (let file = 0; file < 8; file += 1) {
      pieces.push(piece(`kimi-${TYPES[file]}-${file}`, "kimi", TYPES[file], file, 0));
      pieces.push(piece(`kimi-pawn-${file}`, "kimi", "pawn", file, 1));
      pieces.push(piece(`codex-pawn-${file}`, "codex", "pawn", file, 6));
      pieces.push(piece(`codex-${TYPES[file]}-${file}`, "codex", TYPES[file], file, 7));
    }
  }

  function findPiece(file, rank, skip = null) {
    return pieces.find((p) => p !== skip && p.file === file && p.rank === rank);
  }

  function startMove(now) {
    if (paused || active || moveCursor >= script.length) return;
    const move = script[moveCursor];
    const from = square(move.from);
    const to = square(move.to);
    let moving = findPiece(from.file, from.rank);
    if (!moving) {
      moving = piece(`ghost-${moveCursor}`, move.side, move.type || "pawn", from.file, from.rank);
      pieces.push(moving);
    }
    const target = findPiece(to.file, to.rank, moving);
    active = {
      move,
      moving,
      target,
      from,
      to,
      start: now,
      duration: reducedMotion ? 120 : 240,
      lastTrail: now,
    };
    ripple(boardPos(from.file, from.rank), move.side, 0.75);
    if (target) ripple(boardPos(to.file, to.rank), target.side, 1.05);
  }

  function finishMove(now) {
    const { move, moving, target, to } = active;
    if (target) {
      pieces = pieces.filter((p) => p !== target);
      captured[moving.side].push(target.type);
      shatter(boardPos(to.file, to.rank), target.side, 36, 1.2);
    }
    moving.file = to.file;
    moving.rank = to.rank;
    moveCursor += 1;
    ply += 1;
    if (move.flag.includes("#")) shatter(boardPos(to.file, to.rank), moving.side, 62, 1.35);
    active = null;
    nextMoveAt = now + 165;
  }

  function update(now, dt) {
    if (!paused) {
      if (now >= nextMoveAt) startMove(now);
      if (active) {
        const t = clamp((now - active.start) / active.duration, 0, 1);
        const pos = activeCharPosition(smooth(t));
        if (now - active.lastTrail > 42 && !reducedMotion) {
          trail(pos, active.move.side);
          active.lastTrail = now;
        }
        if (t >= 1) finishMove(now);
      }
      fragments = fragments.filter((g) => {
        g.x += (g.vx * dt) / 16.67;
        g.y += (g.vy * dt) / 16.67;
        g.vx *= 0.945;
        g.vy *= 0.945;
        return now - g.born < g.life;
      });
      ripples = ripples.filter((r) => now - r.born < r.life);
    }
  }

  function activeCharPosition(t) {
    const from = boardPos(active.from.file, active.from.rank);
    const to = boardPos(active.to.file, active.to.rank);
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
  }

  function shatter(origin, side, count, speed = 1) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const a = hash(now + i * 17) * Math.PI * 2;
      const v = (0.35 + hash(i * 41 + now) * 1.05) * speed;
      fragments.push({
        x: origin.x + (hash(i) - 0.5) * 5,
        y: origin.y + (hash(i * 3) - 0.5) * 4,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.72,
        born: now,
        life: 420 + hash(i * 9) * 540,
        side,
        kind: "shatter",
      });
    }
  }

  function trail(origin, side) {
    const now = performance.now();
    for (let i = 0; i < 10; i += 1) {
      fragments.push({
        x: origin.x + (hash(i + now) - 0.5) * 7,
        y: origin.y + (hash(i * 5 + now) - 0.5) * 5,
        vx: (hash(i * 2 + now) - 0.5) * 0.28,
        vy: (hash(i * 7 + now) - 0.5) * 0.18,
        born: now,
        life: 260 + hash(i * 11) * 300,
        side,
        kind: "trail",
      });
    }
  }

  function ripple(origin, side, strength) {
    ripples.push({ x: origin.x, y: origin.y, side, strength, born: performance.now(), life: 660 });
  }

  function draw(now) {
    clearScreen();
    drawBoard(now);
    drawTerminalEffects(now);
    drawPieces(now);
    flushDotLayer();
    drawPanel();
    render();
  }

  function drawBoard(now) {
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const x0 = board.x + file * board.sw;
        const y0 = board.y + rank * board.sh;
        const bg = (file + rank) % 2 === 0 ? color.cellA : color.cellB;
        const tint = rank <= 2 ? color.warmDim : rank >= 5 ? color.coolDim : color.dim;
        const density = rank <= 1 || rank >= 6 ? 0.34 : 0.22;
        fillArea(x0, y0, board.sw, board.sh, bg, tint, " ");

        for (let yy = 0; yy < board.sh; yy += 1) {
          for (let xx = 0; xx < board.sw; xx += 1) {
            const seed = file * 127 + rank * 71 + xx * 19 + yy * 37;
            const glyph = textureBraille(seed, density);
            put(x0 + xx, y0 + yy, glyph, tint, bg);
          }
        }
      }
    }

    for (let i = 0; i <= 8; i += 1) {
      const gx = board.x + i * board.sw;
      const gy = board.y + i * board.sh;
      for (let y = board.y; y < board.y + board.h; y += 1) put(gx, y, textureBraille(gx * 31 + y * 11, 0.12), "#101722");
      for (let x = board.x; x < board.x + board.w; x += 1) put(x, gy, textureBraille(x * 17 + gy * 23, 0.12), "#101722");
    }

    const side = active?.move.side || script[moveCursor]?.side || "codex";
    text(board.x + 2, board.y - 2, `${side === "codex" ? ">  " : "   "}CODEX`, side === "codex" ? color.codexAlt : color.dim);
    text(board.x + 18, board.y - 2, `${side === "kimi" ? ">  " : "   "}KIMI`, side === "kimi" ? color.kimiAlt : color.dim);

    for (let rank = 0; rank < 8; rank += 1) text(board.x - 3, board.y + rank * board.sh + 1, String(8 - rank), color.dim);
    for (let file = 0; file < 8; file += 1) text(board.x + file * board.sw + 4, board.y + board.h + 1, FILES[file], color.dim);

    if (moveCursor >= script.length) {
      text(board.x, board.y + board.h + 3, "CHECKMATE  CODEX WINS", color.red);
    } else {
      const next = script[moveCursor]?.side || "codex";
      text(board.x, board.y + board.h + 3, `${next.toUpperCase()} to move`, next === "codex" ? color.codex : color.kimi);
    }
  }

  function drawPieces(now) {
    const moving = active?.moving || null;
    pieces.forEach((p) => {
      if (p !== moving) drawPieceAt(p, boardPos(p.file, p.rank), now, 1);
    });
    if (active) {
      const t = clamp((now - active.start) / active.duration, 0, 1);
      if (active.target && t < 0.7) {
        drawPieceAt(active.target, boardPos(active.to.file, active.to.rank), now, 1 - clamp((t - 0.22) / 0.48, 0, 1));
      }
      drawPieceAt(active.moving, activeCharPosition(smooth(t)), now, 0.78 + Math.sin(t * Math.PI) * 0.22);
    }
  }

  function drawPieceAt(p, pos, now, alpha = 1) {
    const mask = pieceMasks[p.type] || pieceMasks.pawn;
    const fg = p.side === "codex" ? color.white : color.kimi;
    const alt = p.side === "codex" ? color.codexAlt : color.kimiAlt;
    const x0 = Math.round(pos.x * DOT_W - mask.width / 2);
    const y0 = Math.round(pos.y * DOT_H - mask.height / 2);

    for (let y = 0; y < mask.height; y += 1) {
      const row = mask.rows[y];
      for (let x = 0; x < mask.width; x += 1) {
        if (row[x] === " ") continue;
        const noise = hash(x * 13 + y * 29 + p.seed);
        const keep = alpha * (0.88 + hash(p.seed + x * 5 + y * 7) * 0.1);
        if (noise > keep) continue;
        const edge = isMaskEdge(mask, x, y);
        const power = clamp(alpha * (edge ? 0.76 : 0.98), 0.2, 1);
        setSubPx(x0 + x, y0 + y, noise > 0.56 ? alt : fg, power);
      }
    }
  }

  function isMaskEdge(mask, x, y) {
    const at = (xx, yy) => yy >= 0 && yy < mask.height && xx >= 0 && xx < mask.width && mask.rows[yy][xx] !== " ";
    return !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
  }

  function drawTerminalEffects(now) {
    ripples.forEach((r) => {
      const age = (now - r.born) / r.life;
      const radius = lerp(1.4, 10 * r.strength, smooth(age));
      const thickness = lerp(0.7, 0.22, age);
      const cx = r.x * DOT_W;
      const cy = r.y * DOT_H;
      const fg = r.side === "codex" ? color.codex : color.kimiAlt;
      const minX = Math.floor((r.x - radius - 2) * DOT_W);
      const maxX = Math.ceil((r.x + radius + 2) * DOT_W);
      const minY = Math.floor((r.y - radius * 0.62 - 2) * DOT_H);
      const maxY = Math.ceil((r.y + radius * 0.62 + 2) * DOT_H);

      for (let sy = minY; sy <= maxY; sy += 1) {
        for (let sx = minX; sx <= maxX; sx += 1) {
          const dx = (sx - cx) / DOT_W;
          const dy = ((sy - cy) / DOT_H) / 0.62;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - radius) > thickness) continue;
          if (hash(sx * 7 + sy * 17 + Math.floor(age * 29)) > 0.72 - age * 0.38) continue;
          setSubPx(sx, sy, fg, clamp((1 - age) * 0.72, 0.12, 0.78));
        }
      }
    });

    fragments.forEach((g, i) => {
      const age = (now - g.born) / g.life;
      const fg = g.side === "codex" ? color.codex : color.kimiAlt;
      const radius = g.kind === "trail" ? 3 : 1;
      const cx = Math.round(g.x * DOT_W);
      const cy = Math.round(g.y * DOT_H);
      for (let sy = -radius; sy <= radius; sy += 1) {
        for (let sx = -radius; sx <= radius; sx += 1) {
          const d = Math.sqrt(sx * sx + sy * sy);
          if (d > radius + 0.3) continue;
          if (hash(i * 31 + sx * 11 + sy * 19 + Math.floor(age * 23)) > 0.84 - age * 0.32) continue;
          setSubPx(cx + sx, cy + sy, fg, clamp((1 - age) * (g.kind === "trail" ? 0.45 : 0.7), 0.1, 0.78));
        }
      }
    });
  }

  function setSubPx(sx, sy, fg, power = 1) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    if (sx < board.x * DOT_W || sy < board.y * DOT_H || sx >= (board.x + board.w) * DOT_W || sy >= (board.y + board.h) * DOT_H) return;
    const x = Math.floor(sx / DOT_W);
    const y = Math.floor(sy / DOT_H);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const bit = brailleBit(sx, sy);
    const i = idx(x, y);
    dotLayer.mask[i] |= bit;
    if (power >= dotLayer.power[i]) {
      dotLayer.power[i] = power;
      dotLayer.fg[i] = fg;
    }
  }

  function flushDotLayer() {
    for (let y = board.y; y < board.y + board.h; y += 1) {
      for (let x = board.x; x < board.x + board.w; x += 1) {
        const i = idx(x, y);
        const mask = dotLayer.mask[i];
        if (!mask) continue;
        put(x, y, glyphForMask(mask, dotLayer.power[i]), dotLayer.fg[i] || color.white);
      }
    }
  }

  function glyphForMask(mask, power) {
    if (power < 0.28 && mask !== 0xff) {
      mask &= 0x49;
      if (!mask) mask = 0x01;
    }
    return braille(mask);
  }

  function drawPanel() {
    const x = right.x + 3;
    const gameDone = moveCursor >= script.length;
    const side = active?.move.side || script[moveCursor]?.side || "codex";
    const diff = gameDone ? 13 : captured.codex.reduce((sum, p) => sum + VALUE[p], 0) - captured.kimi.reduce((sum, p) => sum + VALUE[p], 0);

    text(x, 3, "v MATCH", color.header);
    text(x, 6, `${side === "codex" && !gameDone ? "> " : "  "}CODEX`, color.codex);
    text(x + 20, 6, "white", color.dim);
    text(x + 33, 6, "3", color.white);
    text(x + 36, 6, "won", color.dim);
    text(x, 8, `${side === "kimi" && !gameDone ? "> " : "  "}KIMI`, color.kimi);
    text(x + 20, 8, "black", color.dim);
    text(x + 33, 8, "0", color.white);
    text(x + 36, 8, "won", color.dim);
    text(x, 13, "ply", color.dim);
    text(x + 6, 13, String(ply), color.white);
    text(x + 15, 13, "move", color.dim);
    text(x + 22, 13, String(ply ? Math.ceil(ply / 2) : 0), color.white);
    text(x, 15, gameDone ? "checkmate - CODEX wins" : `${side.toUpperCase()} to move`, gameDone ? color.red : side === "codex" ? color.codex : color.kimi);

    text(x, 21, "v MATERIAL", color.header);
    if (diff === 0) {
      text(x, 24, `level   ${BRAILLE_DUST.repeat(16)}`, color.dim);
    } else {
      const leading = diff > 0 ? "CODEX" : "KIMI";
      const bar = clamp(Math.round(Math.abs(diff)), 2, 16);
      text(x, 24, `${leading} ${diff > 0 ? "+" : "-"}${Math.abs(diff)}`, diff > 0 ? color.codex : color.kimi);
      text(x, 26, BRAILLE_FULL.repeat(bar) + BRAILLE_DUST.repeat(16 - bar), color.blue);
      text(x, 28, `ahead by ${Math.abs(diff)} points`, color.dim);
    }

    text(x, 34, "v MOVES", color.header);
    if (ply === 0) {
      text(x, 37, "no moves yet", color.dim);
    } else {
      const visible = script.slice(0, moveCursor).map((m, i) => ({ ...m, ply: i + 1 })).reverse().slice(0, 10);
      visible.forEach((m, i) => {
        const row = 37 + i * 2;
        const moveNo = Math.ceil(m.ply / 2);
        const type = movedTypeFor(m);
        const action = m.flag.includes("x") ? "x" : "->";
        text(x + 1, row, `${moveNo}.`, color.dim);
        text(x + 6, row, m.side.toUpperCase(), m.side === "codex" ? color.codex : color.kimi);
        text(x + 18, row, TAG[type] || "P", color.white);
        text(x + 22, row, `${m.from}${action}${m.to}`, color.dim);
        text(x + 36, row, m.flag, m.flag.includes("#") ? color.red : color.white);
      });
    }

    for (let y = 2; y < 42; y += 1) put(right.x + right.w - 2, y, BRAILLE_FULL, color.blue, "#003852");
    for (let y = 42; y < right.y + right.h - 2; y += 1) put(right.x + right.w - 2, y, BRAILLE_DUST, "#13222a", color.black);
    text(x, 57, "1 2 3 fold   jk scroll   r reload", color.dim);
  }

  function movedTypeFor(move) {
    const to = square(move.to);
    const exact = pieces.find((p) => p.file === to.file && p.rank === to.rank && p.side === move.side);
    return exact?.type || move.type || "pawn";
  }

  function render() {
    ctx.fillStyle = color.page;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.font = `700 ${fontSize}px ${FONT}`;
    ctx.textBaseline = "middle";

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = idx(x, y);
        ctx.fillStyle = screen.bg[i] || color.ink;
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
      }
    }

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = idx(x, y);
        const c = screen.ch[i];
        if (!c || c === " ") continue;
        ctx.fillStyle = screen.fg[i] || color.muted;
        ctx.fillText(c, x * cw + cw * 0.02, y * ch + ch * 0.55);
      }
    }
  }

  function frame(now) {
    resize();
    const dt = Math.min(50, lastFrame ? now - lastFrame : 16);
    lastFrame = now;
    update(now, dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (event.key === " ") paused = !paused;
    if (event.key.toLowerCase() === "r") reset(performance.now());
  });

  reset(performance.now());
  requestAnimationFrame(frame);
})();

