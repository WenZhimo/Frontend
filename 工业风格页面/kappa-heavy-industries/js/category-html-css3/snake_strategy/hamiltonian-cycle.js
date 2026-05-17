import { DIRECTIONS } from '../snake_core/engine.js';

function buildRowEvenCycle(columns, rows) {
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

function buildHamiltonianCycle(columns, rows) {
    if (rows % 2 === 0) {
        return buildRowEvenCycle(columns, rows);
    }

    if (columns % 2 === 0) {
        const transposed = buildRowEvenCycle(rows, columns);
        return transposed.map((cell) => ({ x: cell.y, y: cell.x }));
    }

    return null;
}

function getDirectionFromTo(from, to) {
    if (!from || !to) return null;
    if (to.x === from.x + 1 && to.y === from.y) return DIRECTIONS.EAST;
    if (to.x === from.x - 1 && to.y === from.y) return DIRECTIONS.WEST;
    if (to.x === from.x && to.y === from.y - 1) return DIRECTIONS.NORTH;
    if (to.x === from.x && to.y === from.y + 1) return DIRECTIONS.SOUTH;
    return null;
}

function buildCycleCache(columns, rows) {
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
        nextMap,
        orderMap,
    };
}

export function createHamiltonianCycleStrategy(engine) {
    let cache = null;

    function ensureCache(state) {
        const signature = `${state.columns}x${state.rows}`;
        if (cache && cache.signature === signature) return cache;
        cache = buildCycleCache(state.columns, state.rows);
        return cache;
    }

    function tick() {
        const state = engine.getState();
        const head = state.head || state.body[state.body.length - 1];
        if (!head) {
            engine.step();
            return;
        }

        const cycleCache = ensureCache(state);
        if (!cycleCache) {
            for (const direction of Object.values(DIRECTIONS)) {
                if (engine.canMove(direction)) {
                    engine.setDirection(direction);
                    engine.step();
                    return;
                }
            }
            engine.reset();
            return;
        }

        const nextCell = cycleCache.nextMap.get(`${head.x},${head.y}`);
        const nextDirection = getDirectionFromTo(head, nextCell);
        if (nextDirection) {
            engine.setDirection(nextDirection);
            if (engine.step()) return;
        }

        engine.reset();
    }

    return {
        tick,
        getMeta() {
            return { strategy: 'hamiltonian-cycle' };
        },
    };
}
