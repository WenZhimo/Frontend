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
 * BFS 从 start 到 target，返回最短距离（步数）。不可达返回 Infinity。
 * 不返回路径，只需要距离。
 */
function bfsDistance(snapshot, start, target, engine, { isTargetTail = false } = {}) {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return Infinity;
    }

    if (start.x === target.x && start.y === target.y) {
        return 0;
    }

    const queue = [{ cell: start, dist: 0 }];
    const visited = new Set();
    visited.add(getKey(start));

    let headIdx = 0;
    while (headIdx < queue.length) {
        const current = queue[headIdx];
        headIdx += 1;

        for (const dir of DIR_LIST) {
            const vec = DIR_VECTORS[dir];
            const next = { x: current.cell.x + vec.x, y: current.cell.y + vec.y };
            const key = getKey(next);

            if (visited.has(key)) continue;

            let walkable = engine.isCellWalkable(next, snapshot, { allowTail: true });

            if (!walkable && isTargetTail && snapshot.body.length > 0) {
                const tail = snapshot.body[0];
                if (next.x === tail.x && next.y === tail.y) {
                    walkable = true;
                }
            }

            if (!walkable) continue;

            if (next.x === target.x && next.y === target.y) {
                return current.dist + 1;
            }

            visited.add(key);
            queue.push({ cell: next, dist: current.dist + 1 });
        }
    }

    return Infinity;
}

/**
 * BFS 找路径（用于追尾时返回完整路径）。
 */
function bfsFindPath(snapshot, start, target, engine, { isTargetTail = false } = {}) {
    if (!target || start.x === target.x && start.y === target.y) {
        return { path: [], distance: 0 };
    }

    const queue = [{ cell: start, parent: null, dir: null }];
    const visited = new Set();
    visited.add(getKey(start));

    let headIdx = 0;
    while (headIdx < queue.length) {
        const current = queue[headIdx];
        headIdx += 1;

        for (const dir of DIR_LIST) {
            const vec = DIR_VECTORS[dir];
            const next = { x: current.cell.x + vec.x, y: current.cell.y + vec.y };
            const key = getKey(next);

            if (visited.has(key)) continue;

            let walkable = engine.isCellWalkable(next, snapshot, { allowTail: true });

            if (!walkable && isTargetTail && snapshot.body.length > 0) {
                const tail = snapshot.body[0];
                if (next.x === tail.x && next.y === tail.y) {
                    walkable = true;
                }
            }

            if (!walkable) continue;

            visited.add(key);

            const entry = { cell: next, parent: current, dir };

            if (next.x === target.x && next.y === target.y) {
                const path = [];
                let cur = entry;
                while (cur.parent) {
                    path.unshift(cur.dir);
                    cur = cur.parent;
                }
                return { path, distance: path.length };
            }

            queue.push(entry);
        }
    }

    return null;
}

/**
 * BFS 面积兜底：选可达格子最多的方向。
 */
function pickMaxAreaDir(state, engine) {
    const head = state.head || state.body[state.body.length - 1];
    if (!head) return null;

    let bestDir = null;
    let bestArea = -1;

    for (const dir of DIR_LIST) {
        if (state.direction && OPPOSITES[state.direction] === dir && state.body.length > 1) continue;

        const vec = DIR_VECTORS[dir];
        const next = { x: head.x + vec.x, y: head.y + vec.y };
        if (!engine.isCellWalkable(next, state, { allowTail: true })) continue;

        const sim = engine.simulateStep(state, dir);
        if (!sim.ok) continue;

        const simHead = sim.snapshot.body[sim.snapshot.body.length - 1];
        // 快速面积估算：BFS 距离
        let area = 0;
        const queue = [simHead];
        const visited = new Set();
        visited.add(getKey(simHead));
        let hi = 0;
        while (hi < queue.length) {
            const cur = queue[hi]; hi += 1;
            for (const d of DIR_LIST) {
                const v = DIR_VECTORS[d];
                const nb = { x: cur.x + v.x, y: cur.y + v.y };
                if (visited.has(getKey(nb))) continue;
                if (!engine.isCellWalkable(nb, sim.snapshot, { allowTail: true })) continue;
                visited.add(getKey(nb));
                queue.push(nb);
            }
        }
        area = queue.length;

        if (area > bestArea) {
            bestArea = area;
            bestDir = dir;
        }
    }

    return bestDir;
}

/**
 * Longest Path 策略工厂函数。
 *
 * 核心逻辑：
 *   1. 对每个可行方向，模拟一步后 BFS 检查食物是否仍可达。
 *   2. 在食物仍可达的方向中，选 BFS 距离食物**最远**的方向——故意走远路拖延时间。
 *   3. 若没有方向能保持食物可达，BFS 追尾。
 *   4. 若追尾失败，选面积最大的方向兜底。
 *
 * 策略始终在"食物仍可达"的约束内绕最远的路，
 * 不涉及哈密尔顿环等全局规划。
 */
export function createLongestPathStrategy(engine) {
    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            if (!head) {
                engine.step();
                return;
            }

            const food = state.food;
            const tail = state.body[0];
            const foodCandidates = [];
            const boardSize = state.columns * state.rows;
            const snakeRatio = state.body.length / boardSize;
            // 蛇短时走最短路径（不拖延），蛇长时走最长路径（拖延保命）
            const useLongest = snakeRatio > 0.4;

            // 收集所有能保持食物可达的方向
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

                if (food) {
                    const dist = bfsDistance(sim.snapshot, simHead, food, engine);
                    if (dist !== Infinity) {
                        foodCandidates.push({ direction: dir, distance: dist });
                    }
                }
            }

            // 有方向能保持食物可达
            if (foodCandidates.length > 0) {
                if (useLongest) {
                    // 蛇已较长：选距离最远的（绕路拖延）
                    foodCandidates.sort((a, b) => b.distance - a.distance);
                } else {
                    // 蛇还短：选距离最近的（直接去吃）
                    foodCandidates.sort((a, b) => a.distance - b.distance);
                }
                const best = foodCandidates[0];

                if (engine.setDirection(best.direction)) {
                    const alive = engine.step();
                    if (!alive) engine.reset();
                }
                return;
            }

            // 食物不可达 → BFS 追尾
            const tailResult = bfsFindPath(state, head, tail, engine, { isTargetTail: true });
            if (tailResult && tailResult.path.length > 0) {
                if (engine.setDirection(tailResult.path[0])) {
                    const alive = engine.step();
                    if (!alive) engine.reset();
                }
                return;
            }

            // 追尾失败 → 面积兜底
            const fallback = pickMaxAreaDir(state, engine);
            if (fallback && engine.setDirection(fallback)) {
                const alive = engine.step();
                if (!alive) engine.reset();
            } else {
                engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'longest-path' };
        },
    };
}
