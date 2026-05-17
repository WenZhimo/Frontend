import { DIRECTIONS } from '../snake_core/engine.js';

const DIRECTION_ORDER = Object.values(DIRECTIONS);
const OPPOSITES = {
    [DIRECTIONS.NORTH]: DIRECTIONS.SOUTH,
    [DIRECTIONS.EAST]: DIRECTIONS.WEST,
    [DIRECTIONS.SOUTH]: DIRECTIONS.NORTH,
    [DIRECTIONS.WEST]: DIRECTIONS.EAST,
};

function getSnapshotHead(snapshot) {
    return snapshot.head || snapshot.body[snapshot.body.length - 1] || null;
}

function countFutureMoves(engine, snapshot) {
    let legalMoves = 0;

    for (const direction of DIRECTION_ORDER) {
        if (engine.simulateStep(snapshot, direction).ok) {
            legalMoves += 1;
        }
    }

    return legalMoves;
}

export function buildRowEvenCycle(columns, rows) {
    const path = [{ x: 0, y: 0 }];

    for (let y = 0; y < rows; y += 1) {
        if (y === 0) {
            for (let x = 1; x < columns; x += 1) {
                path.push({ x, y });
            }
            continue;
        }

        if (y % 2 === 1) {
            for (let x = columns - 1; x >= 1; x -= 1) {
                path.push({ x, y });
            }
        } else {
            for (let x = 1; x < columns; x += 1) {
                path.push({ x, y });
            }
        }
    }

    for (let y = rows - 1; y >= 1; y -= 1) {
        path.push({ x: 0, y });
    }

    return path;
}

export function buildHamiltonianCycle(columns, rows) {
    if (rows % 2 === 0) {
        return buildRowEvenCycle(columns, rows);
    }

    if (columns % 2 === 0) {
        const transposed = buildRowEvenCycle(rows, columns);
        return transposed.map((cell) => ({ x: cell.y, y: cell.x }));
    }

    return null;
}

export function getDirectionFromTo(from, to) {
    if (!from || !to) return null;
    if (to.x === from.x + 1 && to.y === from.y) return DIRECTIONS.EAST;
    if (to.x === from.x - 1 && to.y === from.y) return DIRECTIONS.WEST;
    if (to.x === from.x && to.y === from.y - 1) return DIRECTIONS.NORTH;
    if (to.x === from.x && to.y === from.y + 1) return DIRECTIONS.SOUTH;
    return null;
}

export function buildCycleCache(columns, rows) {
    const cycle = buildHamiltonianCycle(columns, rows);
    if (!cycle) return null;

    const nextMap = new Map();
    const orderMap = new Map();
    cycle.forEach((cell, index) => {
        orderMap.set(`${cell.x},${cell.y}`, index);
        const next = cycle[(index + 1) % cycle.length];
        nextMap.set(`${cell.x},${cell.y}`, next);
    });

    return {
        signature: `${columns}x${rows}`,
        cycle,
        total: cycle.length,
        nextMap,
        orderMap,
    };
}

export function cycleDistance(fromIndex, toIndex, total) {
    return (toIndex - fromIndex + total) % total;
}

export function chooseFallbackDirection(engine, state) {
    let bestCandidate = null;

    for (const direction of DIRECTION_ORDER) {
        if (state.direction && OPPOSITES[state.direction] === direction && state.body.length > 1) {
            continue;
        }

        const simulated = engine.simulateStep(state, direction);
        if (!simulated.ok) continue;

        const nextHead = getSnapshotHead(simulated.snapshot);
        const wallDistance = nextHead
            ? Math.min(
                nextHead.x,
                state.columns - 1 - nextHead.x,
                nextHead.y,
                state.rows - 1 - nextHead.y,
            )
            : 0;
        const futureMoves = countFutureMoves(engine, simulated.snapshot);
        const continueBonus = direction === state.direction ? 1 : 0;
        const score = futureMoves * 100 + continueBonus * 10 + wallDistance;

        if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { direction, score };
        }
    }

    return bestCandidate?.direction || null;
}
