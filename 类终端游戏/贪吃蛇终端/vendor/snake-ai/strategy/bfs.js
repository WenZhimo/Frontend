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
 * 标准 BFS，在快照上从 start 寻路到 target。
 * 返回 { path: [dir, ...], distance: number }，不可达则返回 null。
 *
 * 与 A* 不同：BFS 使用简单队列（FIFO），无启发式函数，
 * 逐层均匀扩展，天然保证无权图上的最短路径。
 */
function bfsFindPath(snapshot, start, target, engine, { isTargetTail = false } = {}) {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return null;
    }

    if (start.x === target.x && start.y === target.y) {
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

            // 若目标为蛇尾且当前刚好是尾巴位置，视作可通过
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
 * BFS 从 start 出发，返回可达格子数量（用于评估自由度）。
 * 相比 countOpenNeighbors 只看相邻四格，BFS 能感知更大范围的连通区域。
 */
function bfsReachableCount(snapshot, start, engine) {
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

/**
 * 沿路径完整模拟，返回走完后的快照，中途失败返回 null。
 */
function simulateFullPath(snapshot, path, engine) {
    let curr = snapshot;
    for (const dir of path) {
        const res = engine.simulateStep(curr, dir);
        if (!res.ok) return null;
        curr = res.snapshot;
    }
    return curr;
}

/**
 * 将方向按 BFS 可达区域大小降序排列，选择最"宽敞"的方向。
 * 当吃食物不安全且追尾也失败时的最后保底。
 */
function pickDirectionWithMostSpace(state, engine) {
    const head = state.head || state.body[state.body.length - 1];
    if (!head) return null;

    let bestDir = null;
    let bestArea = -1;

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
        const area = bfsReachableCount(sim.snapshot, simHead, engine);

        if (area > bestArea) {
            bestArea = area;
            bestDir = dir;
        }
    }

    return bestDir;
}

/**
 * BFS 策略工厂函数。
 *
 * 核心逻辑（全部基于 BFS）：
 *   1. BFS 寻找头部到食物的最短路径。
 *   2. 模拟沿路径吃完食物，再从吃完后的位置 BFS 检查能否到达蛇尾。
 *   3. 若能安全吃到 → 执行最短路径的第一步。
 *   4. 若不能安全吃到 → BFS 寻路跟踪蛇尾保命。
 *   5. 若追尾也失败 → BFS 评估各方向可达面积，选最宽敞的方向。
 *
 * 全部寻路 / 评估均使用标准 BFS（FIFO 队列、无启发式），
 * 不涉及 A*、哈密尔顿环或神经网络等其它算法。
 */
export function createBFSStrategy(engine) {
    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            if (!head) {
                engine.step();
                return;
            }

            const food = state.food;
            let chosenDir = null;

            // ---- 第一优先级：BFS 安全吃食物 ----
            if (food) {
                const foodResult = bfsFindPath(state, head, food, engine);

                if (foodResult && foodResult.path.length > 0) {
                    // 模拟吃完食物后的状态
                    const afterMeal = simulateFullPath(engine.cloneState(), foodResult.path, engine);

                    if (afterMeal) {
                        const mealHead = afterMeal.body[afterMeal.body.length - 1];
                        const mealTail = afterMeal.body[0];

                        // BFS 检查吃完后能否到达自己的尾巴
                        const tailResult = bfsFindPath(afterMeal, mealHead, mealTail, engine, { isTargetTail: true });

                        if (afterMeal.body.length <= 2 || tailResult) {
                            chosenDir = foodResult.path[0];
                        }
                    }
                }
            }

            // ---- 第二优先级：BFS 追尾保命 ----
            if (!chosenDir) {
                const tail = state.body[0];
                const tailResult = bfsFindPath(state, head, tail, engine, { isTargetTail: true });

                if (tailResult && tailResult.path.length > 0) {
                    chosenDir = tailResult.path[0];
                }
            }

            // ---- 最后保底：BFS 评估最宽敞方向 ----
            if (!chosenDir) {
                chosenDir = pickDirectionWithMostSpace(state, engine);
            }

            if (chosenDir && engine.setDirection(chosenDir)) {
                const alive = engine.step();
                if (!alive) {
                    engine.reset();
                }
            } else {
                engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'bfs' };
        },
    };
}
