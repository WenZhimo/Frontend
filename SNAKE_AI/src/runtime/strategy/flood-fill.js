import { DIRECTIONS } from '../core/engine.js';

const DIR_VECTORS = {
    [DIRECTIONS.NORTH]: { x: 0, y: -1 },
    [DIRECTIONS.EAST]:  { x: 1, y: 0 },
    [DIRECTIONS.SOUTH]: { x: 0, y: 1 },
    [DIRECTIONS.WEST]:  { x: -1, y: 0 },
};

const OPPOSITES = {
    [DIRECTIONS.NORTH]: DIRECTIONS.SOUTH,
    [DIRECTIONS.EAST]:  DIRECTIONS.WEST,
    [DIRECTIONS.SOUTH]: DIRECTIONS.NORTH,
    [DIRECTIONS.WEST]:  DIRECTIONS.EAST,
};

const DIR_LIST = Object.values(DIRECTIONS);

function getKey(cell) {
    return `${cell.x},${cell.y}`;
}

/**
 * BFS flood fill：从 start 出发统计可达格子总数（连通面积）。
 */
function bfsArea(snapshot, start, engine) {
    const queue = [start];
    const visited = new Set();
    visited.add(getKey(start));

    let headIdx = 0;
    while (headIdx < queue.length) {
        const current = queue[headIdx];
        headIdx += 1;

        for (const dir of DIR_LIST) {
            const vec = DIR_VECTORS[dir];
            const next = { x: current.x + vec.x, y: current.y + vec.y };

            if (visited.has(getKey(next))) continue;
            if (!engine.isCellWalkable(next, snapshot, { allowTail: true })) continue;

            visited.add(getKey(next));
            queue.push(next);
        }
    }

    return queue.length;
}

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Flood Fill 策略工厂函数。
 *
 * 核心逻辑：
 *   1. 对每个可行方向，模拟走一步后 BFS 计算连通面积。
 *   2. 选面积最大的方向。面积相同时选离食物近的。
 *   3. 不做全局路径规划，仅基于"哪里最宽敞"做局部决策。
 */
export function createFloodFillStrategy(engine) {
    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            if (!head) {
                engine.step();
                return;
            }

            const food = state.food;
            const candidates = [];

            for (const dir of DIR_LIST) {
                if (state.direction && OPPOSITES[state.direction] === dir && state.body.length > 1) {
                    continue;
                }

                const vec = DIR_VECTORS[dir];
                const next = { x: head.x + vec.x, y: head.y + vec.y };

                if (!engine.isCellWalkable(next, state, { allowTail: true })) continue;

                const sim = engine.simulateStep(state, dir);
                if (!sim.ok) continue;

                const simHead = sim.snapshot.body[sim.snapshot.body.length - 1];
                const area = bfsArea(sim.snapshot, simHead, engine);
                const dist = food ? manhattan(next, food) : 0;

                candidates.push({ direction: dir, area, distance: dist });
            }

            if (candidates.length === 0) {
                engine.reset();
                return;
            }

            // 综合评分：面积权重 + 食物距离权重。分数越高越好。
            // 离食物越近分数越高（最大加成分数为 50），确保蛇会主动接近食物。
            candidates.sort((a, b) => {
                const scoreA = a.area + 50 / (a.distance + 1);
                const scoreB = b.area + 50 / (b.distance + 1);
                return scoreB - scoreA;
            });

            const best = candidates[0];

            if (engine.setDirection(best.direction)) {
                const alive = engine.step();
                if (!alive) {
                    engine.reset();
                }
            }
        },

        getMeta() {
            return { strategy: 'flood-fill' };
        },
    };
}
