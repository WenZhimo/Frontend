export const DIRECTIONS = {
    NORTH: 'north',
    EAST: 'east',
    SOUTH: 'south',
    WEST: 'west',
};

const DIR_VECTORS = {
    [DIRECTIONS.NORTH]: { x: 0, y: -1 },
    [DIRECTIONS.EAST]: { x: 1, y: 0 },
    [DIRECTIONS.SOUTH]: { x: 0, y: 1 },
    [DIRECTIONS.WEST]: { x: -1, y: 0 },
};

const OPPOSITES = {
    [DIRECTIONS.NORTH]: DIRECTIONS.SOUTH,
    [DIRECTIONS.EAST]: DIRECTIONS.WEST,
    [DIRECTIONS.SOUTH]: DIRECTIONS.NORTH,
    [DIRECTIONS.WEST]: DIRECTIONS.EAST,
};

function getCellKey(cell) {
    return `${cell.x},${cell.y}`;
}

function clampCell(cell, columns, rows) {
    return {
        x: Math.min(columns - 1, Math.max(0, cell.x)),
        y: Math.min(rows - 1, Math.max(0, cell.y)),
    };
}

export function createSnakeEngine({ columns, rows, growthStep = 1 } = {}) {
    let state = {
        columns: Math.max(6, columns || 12),
        rows: Math.max(6, rows || 8),
        growthStep,
        direction: DIRECTIONS.EAST,
        length: 1,
        score: 0,
        body: [],
        food: null,
    };

    function randomCell() {
        return {
            x: Math.floor(Math.random() * state.columns),
            y: Math.floor(Math.random() * state.rows),
        };
    }

    function spawnFood() {
        const occupied = new Set(state.body.map(getCellKey));
        const attempts = state.columns * state.rows;
        for (let i = 0; i < attempts; i += 1) {
            const nextFood = randomCell();
            if (!occupied.has(getCellKey(nextFood))) {
                state.food = nextFood;
                return nextFood;
            }
        }
        state.food = null;
        return null;
    }

    function reset() {
        state.length = 1;
        state.score = 0;
        state.direction = DIRECTIONS.EAST;
        state.body = [];
        spawnFood();
    }

    function resize(columns, rows) {
        state.columns = Math.max(6, columns || state.columns);
        state.rows = Math.max(6, rows || state.rows);
        state.body = state.body.map((cell) => clampCell(cell, state.columns, state.rows));
        state.body = state.body.filter((cell, index, arr) => arr.findIndex((other) => other.x === cell.x && other.y === cell.y) === index);
        if (state.body.length === 0) {
            state.length = 1;
        } else {
            state.length = Math.max(1, Math.min(state.length, state.body.length));
        }
        if (!state.food || state.food.x >= state.columns || state.food.y >= state.rows) {
            spawnFood();
        }
    }

    function getHead(snapshot = state) {
        return snapshot.body[snapshot.body.length - 1] || null;
    }

    function isCellInside(cell, snapshot = state) {
        return cell.x >= 0 && cell.y >= 0 && cell.x < snapshot.columns && cell.y < snapshot.rows;
    }

    function isCellWalkable(cell, snapshot = state, { allowTail = true } = {}) {
        if (!isCellInside(cell, snapshot)) return false;
        const body = snapshot.body;
        const protectedBody = allowTail && body.length > 0 ? body.slice(0, body.length - 1) : body;
        return !protectedBody.some((segment) => segment.x === cell.x && segment.y === cell.y);
    }

    function canMove(direction) {
        const head = getHead();
        if (!head) return true;
        const vector = DIR_VECTORS[direction];
        if (!vector) return false;
        const next = { x: head.x + vector.x, y: head.y + vector.y };
        return isCellWalkable(next, state, { allowTail: true });
    }

    function setDirection(direction) {
        if (!DIR_VECTORS[direction]) return false;
        if (state.direction && OPPOSITES[state.direction] === direction && state.body.length > 1) {
            return false;
        }
        state.direction = direction;
        return true;
    }

    function appendCell(cell) {
        const head = getHead();
        if (head && head.x === cell.x && head.y === cell.y) return;

        state.body.push(cell);
        if (state.food && cell.x === state.food.x && cell.y === state.food.y) {
            state.length += state.growthStep;
            state.score += 1;
            spawnFood();
        }
        if (state.body.length > state.length) {
            state.body = state.body.slice(state.body.length - state.length);
        }
    }

    function step() {
        const head = getHead();
        if (!head) {
            const start = state.food ? { ...state.food } : { x: 0, y: 0 };
            appendCell(clampCell(start, state.columns, state.rows));
            return true;
        }

        const vector = DIR_VECTORS[state.direction];
        if (!vector) return false;
        const next = { x: head.x + vector.x, y: head.y + vector.y };
        if (!isCellWalkable(next, state, { allowTail: true })) {
            return false;
        }
        appendCell(next);
        return true;
    }

    function cloneState() {
        return {
            columns: state.columns,
            rows: state.rows,
            growthStep: state.growthStep,
            direction: state.direction,
            length: state.length,
            body: state.body.map((cell) => ({ ...cell })),
            food: state.food ? { ...state.food } : null,
        };
    }

    function simulateStep(snapshot, direction) {
        const vector = DIR_VECTORS[direction];
        if (!vector) return { ok: false, snapshot };

        const nextSnapshot = {
            ...snapshot,
            body: snapshot.body.map((cell) => ({ ...cell })),
            food: snapshot.food ? { ...snapshot.food } : null,
        };

        const head = getHead(nextSnapshot);
        const next = head ? { x: head.x + vector.x, y: head.y + vector.y } : { x: 0, y: 0 };
        if (!isCellWalkable(next, nextSnapshot, { allowTail: true })) {
            return { ok: false, snapshot };
        }

        nextSnapshot.body.push(next);
        let grew = false;
        if (nextSnapshot.food && next.x === nextSnapshot.food.x && next.y === nextSnapshot.food.y) {
            nextSnapshot.length += nextSnapshot.growthStep;
            nextSnapshot.food = null;
            grew = true;
        }
        if (nextSnapshot.body.length > nextSnapshot.length) {
            nextSnapshot.body = nextSnapshot.body.slice(nextSnapshot.body.length - nextSnapshot.length);
        }
        nextSnapshot.direction = direction;
        return { ok: true, snapshot: nextSnapshot, grew };
    }

    function getState() {
        return {
            ...state,
            body: state.body.map((cell) => ({ ...cell })),
            food: state.food ? { ...state.food } : null,
            head: getHead() ? { ...getHead() } : null,
        };
    }

    reset();

    return {
        reset,
        resize,
        getState,
        cloneState,
        setDirection,
        canMove,
        step,
        spawnFood,
        getHead,
        isCellWalkable,
        simulateStep,
        getDirectionVector(direction) {
            return DIR_VECTORS[direction];
        },
    };
}
