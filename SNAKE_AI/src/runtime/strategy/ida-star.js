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

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

const MAX_NODES = 50000;

/**
 * IDA* 搜索：迭代加深 A*。
 *
 * 与 A* 的区别：不使用优先队列，而是 DFS + 代价阈值迭代。
 * 每轮设 threshold = f_limit，DFS 只扩展 f(n) = g(n) + h(n) <= threshold 的节点。
 * 若本轮未找到目标，下一轮 threshold = 本轮超出阈值的最小 f 值。
 *
 * 返回 { path: [dir, ...], distance: number } 或 null。
 */
function idaStarFindPath(snapshot, start, target, engine, { isTargetTail = false } = {}) {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return null;
    }

    if (start.x === target.x && start.y === target.y) {
        return { path: [], distance: 0 };
    }

    let threshold = manhattan(start, target);
    let nodeCount = 0;

    while (nodeCount < MAX_NODES) {
        const visited = new Set();
        visited.add(getKey(start));

        const result = dfsSearch(
            snapshot, start, target, engine,
            0, threshold, visited, null, null,
            isTargetTail,
        );
        nodeCount += result.visited || 0;

        if (result.found !== undefined) {
            // 重建路径
            const path = [];
            let cur = result.found;
            while (cur.parent) {
                path.unshift(cur.dir);
                cur = cur.parent;
            }
            return { path, distance: path.length };
        }

        if (result.nextThreshold === Infinity) {
            return null; // 不可达
        }

        threshold = result.nextThreshold;
    }

    return null; // 超过节点上限，放弃 IDA*
}

/**
 * IDA* 的 DFS 子过程。
 * 返回 { found: node | undefined, nextThreshold: number }。
 */
function dfsSearch(snapshot, cell, target, engine, g, threshold, visited, parent, dir, isTargetTail) {
    const f = g + manhattan(cell, target);

    if (f > threshold) {
        return { found: undefined, nextThreshold: f, visited: 0 };
    }

    if (cell.x === target.x && cell.y === target.y) {
        return { found: { cell, parent, dir }, nextThreshold: threshold, visited: 1 };
    }

    let nextThreshold = Infinity;
    let visitCount = 1;

    for (const d of DIR_LIST) {
        const vec = DIR_VECTORS[d];
        const next = { x: cell.x + vec.x, y: cell.y + vec.y };
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

        const node = { cell: next, parent: null, dir: d };
        const result = dfsSearch(
            snapshot, next, target, engine,
            g + 1, threshold, visited, node, d,
            isTargetTail,
        );
        visitCount += result.visited || 0;

        if (result.found !== undefined) {
            // 回链上溯
            result.found.parent = { cell, parent, dir };
            result.visited = visitCount;
            return result;
        }

        if (result.nextThreshold < nextThreshold) {
            nextThreshold = result.nextThreshold;
        }

        visited.delete(key); // 回溯
    }

    return { found: undefined, nextThreshold, visited: visitCount };
}

/**
 * 沿路径完整模拟。
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
 * BFS 寻路（追尾保命）。
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
 * IDA* 策略工厂函数。
 *
 * 核心逻辑：
 *   1. IDA* 搜索最短路径去食物——DFS + 迭代加深阈值，
 *      不用优先队列，内存占用远小于 A*。
 *   2. 模拟吃完，检查能否到达蛇尾。
 *   3. 安全则执行。不安全则 BFS 追尾保命。
 *   4. 追尾失败选面积最大的方向兜底。
 */
export function createIDAStarStrategy(engine) {
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

            // ---- 第一优先级：IDA* 安全吃食物 ----
            if (food) {
                const foodResult = idaStarFindPath(state, head, food, engine);

                if (foodResult && foodResult.path.length > 0) {
                    const afterMeal = simulateFullPath(engine.cloneState(), foodResult.path, engine);

                    if (afterMeal) {
                        const mealHead = afterMeal.body[afterMeal.body.length - 1];
                        const mealTail = afterMeal.body[0];

                        const tailResult = idaStarFindPath(afterMeal, mealHead, mealTail, engine, { isTargetTail: true });

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

            // ---- 最后保底：面积最大方向 ----
            if (!chosenDir) {
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

                if (bestDir) chosenDir = bestDir;
            }

            if (chosenDir && engine.setDirection(chosenDir)) {
                const alive = engine.step();
                if (!alive) engine.reset();
            } else {
                engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'ida-star' };
        },
    };
}
