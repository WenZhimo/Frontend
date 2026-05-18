const DEFAULT_RAY_ORDER = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
];

const DIRECTION_ORDER = ['north', 'south', 'west', 'east'];
const DIRECTION_VECTORS = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 },
};

function inferTailDirection(body, fallbackDirection) {
    if (!body || body.length < 2) return fallbackDirection;
    const tail = body[0];
    const neck = body[1];
    const dx = neck.x - tail.x;
    const dy = neck.y - tail.y;

    for (const direction of Object.keys(DIRECTION_VECTORS)) {
        const vector = DIRECTION_VECTORS[direction];
        if (vector.x === dx && vector.y === dy) {
            return direction;
        }
    }

    return fallbackDirection;
}

function encodeDirection(direction) {
    return DIRECTION_ORDER.map((candidate) => (candidate === direction ? 1 : 0));
}

export function buildSnakeAIFeatures(state, model = {}) {
    const rayOrder = model.rayOrder || DEFAULT_RAY_ORDER;
    const appleAndSelfVision = model.metadata?.appleAndSelfVision || model.appleAndSelfVision || 'distance';
    const body = state.body || [];
    const head = state.head || body[body.length - 1] || null;
    const direction = state.direction || 'east';

    if (!head) {
        return [...new Array(24).fill(0), ...encodeDirection(direction), ...encodeDirection(direction)];
    }

    const columns = state.columns;
    const rows = state.rows;
    const food = state.food;
    const bodyCells = new Set(body.slice(0, -1).map((segment) => `${segment.x},${segment.y}`));
    const features = [];

    for (const [dx, dy] of rayOrder) {
        let x = head.x;
        let y = head.y;
        let distance = 0;
        let appleSignal = 0;
        let selfSignal = 0;

        while (true) {
            x += dx;
            y += dy;
            distance += 1;

            if (x < 0 || y < 0 || x >= columns || y >= rows) {
                features.push(1 / distance);
                features.push(appleSignal);
                features.push(selfSignal);
                break;
            }

            if (!appleSignal && food && food.x === x && food.y === y) {
                appleSignal = appleAndSelfVision === 'binary' ? 1 : 1 / distance;
            }

            if (!selfSignal && bodyCells.has(`${x},${y}`)) {
                selfSignal = appleAndSelfVision === 'binary' ? 1 : 1 / distance;
            }
        }
    }

    const tailDirection = inferTailDirection(body, direction);
    features.push(...encodeDirection(direction));
    features.push(...encodeDirection(tailDirection));
    return features;
}
