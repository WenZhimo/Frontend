const FILES = "abcdefghi";
const WIDTH = 9;
const HEIGHT = 10;
const VALUE = {
  king: 1000,
  advisor: 2,
  elephant: 2,
  horse: 4,
  rook: 9,
  cannon: 4.5,
  soldier: 1,
};
const SYMBOL_TO_TYPE = {
  k: "king",
  a: "advisor",
  b: "elephant",
  e: "elephant",
  n: "horse",
  h: "horse",
  r: "rook",
  c: "cannon",
  p: "soldier",
  s: "soldier",
};
const TYPE_TO_SYMBOL = {
  king: "k",
  advisor: "a",
  elephant: "b",
  horse: "n",
  rook: "r",
  cannon: "c",
  soldier: "p",
};

function hashUint32(value, salt = 0) {
  const textValue = String(value);
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (let i = 0; i < textValue.length; i += 1) {
    h ^= textValue.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function createRng(seed, stream) {
  let state = hashUint32(`${seed}|${stream}`, 0x9e3779b9) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inBoard(file, rank) {
  return file >= 0 && file < WIDTH && rank >= 0 && rank < HEIGHT;
}

function indexOf(file, rank) {
  return rank * WIDTH + file;
}

function squareName(file, rank) {
  return `${FILES[file]}${rank}`;
}

function parseSquare(square) {
  return { file: FILES.indexOf(square[0]), rank: Number(square[1]) };
}

function sideFromFen(fen) {
  return String(fen).split(" ")[1] === "b" ? "black" : "red";
}

function otherSide(side) {
  return side === "red" ? "black" : "red";
}

function inPalace(side, file, rank) {
  if (file < 3 || file > 5) return false;
  return side === "red" ? rank >= 0 && rank <= 2 : rank >= 7 && rank <= 9;
}

function crossedRiver(side, rank) {
  return side === "red" ? rank >= 5 : rank <= 4;
}

function parseFen(fen) {
  const board = Array(WIDTH * HEIGHT).fill(null);
  const rows = String(fen).split(" ")[0].split("/");
  rows.forEach((row, rowIndex) => {
    let file = 0;
    const rank = 9 - rowIndex;
    Array.from(row).forEach((char) => {
      if (/\d/.test(char)) {
        file += Number(char);
        return;
      }
      const lower = char.toLowerCase();
      const side = char === lower ? "black" : "red";
      board[indexOf(file, rank)] = {
        side,
        type: SYMBOL_TO_TYPE[lower] || "soldier",
      };
      file += 1;
    });
  });
  return board;
}

function boardToFen(board, side, previousFen) {
  const rows = [];
  for (let rank = 9; rank >= 0; rank -= 1) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < WIDTH; file += 1) {
      const piece = board[indexOf(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      const symbol = TYPE_TO_SYMBOL[piece.type] || "p";
      row += piece.side === "red" ? symbol.toUpperCase() : symbol;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  const parts = String(previousFen).split(" ");
  const fullMove = Number(parts[5]) || 1;
  const nextFullMove = side === "red" ? fullMove : fullMove + 1;
  return `${rows.join("/")} ${otherSide(side) === "black" ? "b" : "w"} - - 0 ${nextFullMove}`;
}

function cloneBoard(board) {
  return board.map((piece) => (piece ? { ...piece } : null));
}

function makeMove(board, move) {
  const next = cloneBoard(board);
  next[indexOf(move.to.file, move.to.rank)] = next[indexOf(move.from.file, move.from.rank)];
  next[indexOf(move.from.file, move.from.rank)] = null;
  return next;
}

function countBetween(board, from, to) {
  if (from.file !== to.file && from.rank !== to.rank) return -1;
  const df = Math.sign(to.file - from.file);
  const dr = Math.sign(to.rank - from.rank);
  let file = from.file + df;
  let rank = from.rank + dr;
  let count = 0;
  while (file !== to.file || rank !== to.rank) {
    if (board[indexOf(file, rank)]) count += 1;
    file += df;
    rank += dr;
  }
  return count;
}

function findKing(board, side) {
  for (let rank = 0; rank < HEIGHT; rank += 1) {
    for (let file = 0; file < WIDTH; file += 1) {
      const piece = board[indexOf(file, rank)];
      if (piece?.side === side && piece.type === "king") return { file, rank };
    }
  }
  return null;
}

function pieceAttacks(board, from, piece, target) {
  const dx = target.file - from.file;
  const dy = target.rank - from.rank;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (piece.type === "king") {
    if (from.file === target.file && countBetween(board, from, target) === 0) return true;
    return adx + ady === 1 && inPalace(piece.side, target.file, target.rank);
  }
  if (piece.type === "advisor") return adx === 1 && ady === 1 && inPalace(piece.side, target.file, target.rank);
  if (piece.type === "elephant") {
    if (adx !== 2 || ady !== 2) return false;
    if (piece.side === "red" && target.rank > 4) return false;
    if (piece.side === "black" && target.rank < 5) return false;
    return !board[indexOf(from.file + dx / 2, from.rank + dy / 2)];
  }
  if (piece.type === "horse") {
    if (!((adx === 1 && ady === 2) || (adx === 2 && ady === 1))) return false;
    const leg = adx === 2
      ? { file: from.file + Math.sign(dx), rank: from.rank }
      : { file: from.file, rank: from.rank + Math.sign(dy) };
    return !board[indexOf(leg.file, leg.rank)];
  }
  if (piece.type === "rook") return (from.file === target.file || from.rank === target.rank) && countBetween(board, from, target) === 0;
  if (piece.type === "cannon") return (from.file === target.file || from.rank === target.rank) && countBetween(board, from, target) === 1;
  if (piece.type === "soldier") {
    const forward = piece.side === "red" ? 1 : -1;
    if (dx === 0 && dy === forward) return true;
    return crossedRiver(piece.side, from.rank) && adx === 1 && dy === 0;
  }
  return false;
}

function isInCheck(board, side) {
  const king = findKing(board, side);
  if (!king) return true;
  const enemy = otherSide(side);
  for (let rank = 0; rank < HEIGHT; rank += 1) {
    for (let file = 0; file < WIDTH; file += 1) {
      const piece = board[indexOf(file, rank)];
      if (piece?.side === enemy && pieceAttacks(board, { file, rank }, piece, king)) return true;
    }
  }
  return false;
}

function pushMove(board, moves, side, from, to) {
  if (!inBoard(to.file, to.rank)) return;
  const target = board[indexOf(to.file, to.rank)];
  if (target?.side === side) return;
  moves.push({ from, to, capture: target || null });
}

function generatePseudoMoves(board, side) {
  const moves = [];
  for (let rank = 0; rank < HEIGHT; rank += 1) {
    for (let file = 0; file < WIDTH; file += 1) {
      const piece = board[indexOf(file, rank)];
      if (piece?.side !== side) continue;
      const from = { file, rank };
      if (piece.type === "king") {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([df, dr]) => {
          const to = { file: file + df, rank: rank + dr };
          if (inPalace(side, to.file, to.rank)) pushMove(board, moves, side, from, to);
        });
        for (let r = rank + (side === "red" ? 1 : -1); r >= 0 && r < HEIGHT; r += side === "red" ? 1 : -1) {
          const seen = board[indexOf(file, r)];
          if (!seen) continue;
          if (seen.side !== side && seen.type === "king") pushMove(board, moves, side, from, { file, rank: r });
          break;
        }
      } else if (piece.type === "advisor") {
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([df, dr]) => {
          const to = { file: file + df, rank: rank + dr };
          if (inPalace(side, to.file, to.rank)) pushMove(board, moves, side, from, to);
        });
      } else if (piece.type === "elephant") {
        [[2, 2], [2, -2], [-2, 2], [-2, -2]].forEach(([df, dr]) => {
          const to = { file: file + df, rank: rank + dr };
          const eye = { file: file + df / 2, rank: rank + dr / 2 };
          if (!inBoard(to.file, to.rank) || board[indexOf(eye.file, eye.rank)]) return;
          if (side === "red" && to.rank > 4) return;
          if (side === "black" && to.rank < 5) return;
          pushMove(board, moves, side, from, to);
        });
      } else if (piece.type === "horse") {
        [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]].forEach(([df, dr]) => {
          const leg = Math.abs(df) === 2 ? { file: file + Math.sign(df), rank } : { file, rank: rank + Math.sign(dr) };
          if (!inBoard(leg.file, leg.rank) || board[indexOf(leg.file, leg.rank)]) return;
          pushMove(board, moves, side, from, { file: file + df, rank: rank + dr });
        });
      } else if (piece.type === "rook" || piece.type === "cannon") {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([df, dr]) => {
          let jumped = false;
          for (let f = file + df, r = rank + dr; inBoard(f, r); f += df, r += dr) {
            const target = board[indexOf(f, r)];
            if (piece.type === "rook") {
              if (!target) moves.push({ from, to: { file: f, rank: r }, capture: null });
              else {
                if (target.side !== side) moves.push({ from, to: { file: f, rank: r }, capture: target });
                break;
              }
            } else if (!jumped) {
              if (!target) moves.push({ from, to: { file: f, rank: r }, capture: null });
              else jumped = true;
            } else if (target) {
              if (target.side !== side) moves.push({ from, to: { file: f, rank: r }, capture: target });
              break;
            }
          }
        });
      } else if (piece.type === "soldier") {
        const forward = side === "red" ? 1 : -1;
        pushMove(board, moves, side, from, { file, rank: rank + forward });
        if (crossedRiver(side, rank)) {
          pushMove(board, moves, side, from, { file: file + 1, rank });
          pushMove(board, moves, side, from, { file: file - 1, rank });
        }
      }
    }
  }
  return moves;
}

function generateLegalMoves(board, side) {
  return generatePseudoMoves(board, side).filter((move) => !isInCheck(makeMove(board, move), side));
}

function moveText(move) {
  return `${squareName(move.from.file, move.from.rank)}${squareName(move.to.file, move.to.rank)}`;
}

function material(board, side) {
  return board.reduce((sum, piece) => sum + (piece ? (piece.side === side ? 1 : -1) * (VALUE[piece.type] || 0) : 0), 0);
}

function scoreMove(board, move, side, player, context, index) {
  const moving = board[indexOf(move.from.file, move.from.rank)];
  const target = move.capture;
  const after = makeMove(board, move);
  const perspective = material(after, side);
  const capture = target ? (VALUE[target.type] || 0) * 120 : 0;
  const center = 18 - Math.abs(move.to.file - 4) * 5 - Math.abs(move.to.rank - 4.5) * 3;
  const advance = side === "red" ? move.to.rank - move.from.rank : move.from.rank - move.to.rank;
  const cannon = moving?.type === "cannon" ? 26 : 0;
  const hunter = target ? 55 : 0;
  const quiet = target ? -32 : 18;
  const trader = target ? (VALUE[target.type] || 0) * 35 - (VALUE[moving?.type] || 0) * 10 : -6;
  const river = (side === "red" ? move.to.rank >= 5 : move.to.rank <= 4) ? 34 : 0;
  const sharp = target ? 80 : advance * 16;
  const engineStyle = perspective * 10;
  const styleScores = { river, cannon, center, trader, hunter, quiet, sharp, engine: engineStyle };
  const style = styleScores[player.style] || 0;
  const rng = context.mode === "deterministic"
    ? createRng(context.seed, `worker-${player.name}-${context.ply}-${index}-${moveText(move)}`)
    : Math.random;
  return perspective * 8 + capture + center + advance * 12 + style + rng() * 14;
}

function chooseMove(board, side, player, context) {
  const moves = generateLegalMoves(board, side);
  if (!moves.length) return null;
  const scored = moves
    .map((move, index) => ({ move, score: scoreMove(board, move, side, player, context, index) }))
    .sort((a, b) => b.score - a.score);
  const topCount = context.mode === "deterministic" ? 3 : 6;
  const choices = scored.slice(0, Math.min(topCount, scored.length));
  const rng = context.mode === "deterministic"
    ? createRng(context.seed, `choice-${player.name}-${context.ply}-${choices.length}`)
    : Math.random;
  return choices[Math.max(0, Math.min(choices.length - 1, Math.floor(rng() * choices.length)))];
}

self.onmessage = (event) => {
  const context = event.data || {};
  try {
    const player = context.player || {};
    const side = context.side || sideFromFen(context.fen);
    const board = parseFen(context.fen);
    const legal = generateLegalMoves(board, side);
    if (!legal.length) {
      const inCheck = isInCheck(board, side);
      self.postMessage({
        ok: true,
        choice: null,
        terminal: inCheck
          ? { type: "checkmate", winner: otherSide(side) }
          : { type: "no-legal-moves", message: "draw - no legal moves" },
      });
      return;
    }
    const selected = chooseMove(board, side, player, context);
    if (!selected) {
      self.postMessage({ ok: true, choice: null });
      return;
    }
    const nextBoard = makeMove(board, selected.move);
    const nextFen = boardToFen(nextBoard, side, context.fen);
    const nextSide = otherSide(side);
    self.postMessage({
      ok: true,
      choice: {
        text: moveText(selected.move),
        score: selected.score,
        nextFen,
        check: isInCheck(nextBoard, nextSide),
      },
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || String(error) });
  }
};
