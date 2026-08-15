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
 * 计算格子的"拥挤度"：统计 8 邻域内蛇身格子的数量（不含头尾）。
 * 拥挤度越高，Dijkstra 边权越大，算法越倾向绕开。
 */
function crowdPenalty(cell, snapshot) {
    if (!snapshot.body || snapshot.body.length <= 2) return 0;
    const bodySet = new Set();
    const protectedBody = snapshot.body.slice(1, -1); // 不含头和尾
    for (const seg of protectedBody) {
        bodySet.add(`${seg.x},${seg.y}`);
    }

    let count = 0;
    for (const d of DIR_LIST) {
        const v = DIR_VECTORS[d];
        const nx = cell.x + v.x;
        const ny = cell.y + v.y;
        if (bodySet.has(`${nx},${ny}`)) {
            count += 1;
        }
    }
    return count;
}

/**
 * Dijkstra 算法：带权最短路径搜索。
 * 边权 = 1 + crowdPenalty * CROWD_WEIGHT，距离蛇身越近代价越高。
 * 使用最小堆（按累积代价排序），无启发式。
 *
 * 返回 { path: [dir, ...], distance: number } 或 null。
 */
function dijkstraFindPath(snapshot, start, target, engine, { isTargetTail = false, crowdWeight = 0.5 } = {}) {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return null;
    }

    if (start.x === target.x && start.y === target.y) {
        return { path: [], distance: 0 };
    }

    // 最小堆：按 cost 升序
    const heap = [{ cell: start, cost: 0, parent: null, dir: null }];
    const bestCost = new Map();
    bestCost.set(getKey(start), 0);

    function heapPush(entry) {
        heap.push(entry);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heap[p].cost <= heap[i].cost) break;
            [heap[p], heap[i]] = [heap[i], heap[p]];
            i = p;
        }
    }

    function heapPop() {
        if (heap.length === 1) return heap.pop();
        const top = heap[0];
        heap[0] = heap.pop();
        let i = 0;
        const len = heap.length;
        while (true) {
            let smallest = i;
            const left = (i << 1) + 1;
            const right = (i << 1) + 2;
            if (left < len && heap[left].cost < heap[smallest].cost) smallest = left;
            if (right < len && heap[right].cost < heap[smallest].cost) smallest = right;
            if (smallest === i) break;
            [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
            i = smallest;
        }
        return top;
    }

    while (heap.length > 0) {
        const current = heapPop();
        const key = getKey(current.cell);

        // 到达目标
        if (current.cell.x === target.x && current.cell.y === target.y) {
            const path = [];
            let cur = current;
            while (cur.parent) {
                path.unshift(cur.dir);
                cur = cur.parent;
            }
            return { path, distance: path.length };
        }

        // 已有更优代价的路径到达此节点
        if (current.cost > (bestCost.get(key) ?? Infinity)) continue;

        for (const dir of DIR_LIST) {
            const vec = DIR_VECTORS[dir];
            const next = { x: current.cell.x + vec.x, y: current.cell.y + vec.y };
            const nextKey = getKey(next);

            let walkable = engine.isCellWalkable(next, snapshot, { allowTail: true });

            if (!walkable && isTargetTail && snapshot.body.length > 0) {
                const tail = snapshot.body[0];
                if (next.x === tail.x && next.y === tail.y) {
                    walkable = true;
                }
            }

            if (!walkable) continue;

            // 边权 = 基础 1 + 拥挤惩罚
            const penalty = crowdPenalty(next, snapshot) * crowdWeight;
            const edgeWeight = 1 + penalty;
            const newCost = current.cost + edgeWeight;

            const prev = bestCost.get(nextKey);
            if (prev !== undefined && newCost >= prev) continue;

            bestCost.set(nextKey, newCost);
            heapPush({ cell: next, cost: newCost, parent: current, dir });
        }
    }

    return null;
}

/**
 * 沿路径完整模拟，返回走完后的快照。
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
 * BFS 寻路（用于追尾保命，不需要加权）。
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
 * Dijkstra 策略工厂函数。
 *
 * 核心逻辑：
 *   1. Dijkstra 加权最短路径搜索食物——边权 = 1 + 近身惩罚，
 *      蛇会绕开拥挤区域走"宽阔"路线。
 *   2. 模拟沿路径吃完，Dijkstra/BFS 检查能否到达蛇尾。
 *   3. 若安全吃到 → 执行路径第一步。
 *   4. 若不安全 → BFS 追尾保命。
 *   5. 追尾也失败 → 选最宽敞方向兜底。
 *
 * 全程寻路使用 Dijkstra（优先队列 + 累积代价，无启发式）。
 */
export function createDijkstraStrategy(engine) {
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

            // ---- 第一优先级：Dijkstra 安全吃食物 ----
            if (food) {
                const foodResult = dijkstraFindPath(state, head, food, engine);

                if (foodResult && foodResult.path.length > 0) {
                    const afterMeal = simulateFullPath(engine.cloneState(), foodResult.path, engine);

                    if (afterMeal) {
                        const mealHead = afterMeal.body[afterMeal.body.length - 1];
                        const mealTail = afterMeal.body[0];

                        const tailResult = dijkstraFindPath(afterMeal, mealHead, mealTail, engine, { isTargetTail: true });

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
            return { strategy: 'dijkstra' };
        },
    };
}
