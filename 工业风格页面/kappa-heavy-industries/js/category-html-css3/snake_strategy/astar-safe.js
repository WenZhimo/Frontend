import { DIRECTIONS } from '../snake_core/engine.js';

// 计算曼哈顿距离作为 A* 的启发式函数 (Heuristic)
function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// 核心 A* 寻路算法
function findPath(snapshot, start, target, engine, isTargetTail = false) {
    // open 列表存储待评估的节点
    const open = [{
        cell: start,
        g: 0,
        h: manhattan(start, target),
        parent: null,
        dir: null
    }];
    const closed = new Set(); // 记录已访问的坐标
    const getKey = (c) => `${c.x},${c.y}`;

    while (open.length > 0) {
        // 根据 f 值 (g + h) 升序排序，f 相同时按 h 升序
        open.sort((a, b) => (a.g + a.h) - (b.g + b.h) || a.h - b.h);
        const current = open.shift();
        const key = getKey(current.cell);

        // 到达目标
        if (current.cell.x === target.x && current.cell.y === target.y) {
            const path = [];
            let curr = current;
            while (curr.parent) {
                path.unshift(curr.dir);
                curr = curr.parent;
            }
            return path;
        }

        if (closed.has(key)) continue;
        closed.add(key);

        // 遍历四个方向
        for (const dir of Object.values(DIRECTIONS)) {
            const vec = engine.getDirectionVector(dir);
            const nextCell = { x: current.cell.x + vec.x, y: current.cell.y + vec.y };
            const nextKey = getKey(nextCell);

            if (closed.has(nextKey)) continue;

            // 检查目标格子是否可通行
            let walkable = engine.isCellWalkable(nextCell, snapshot, { allowTail: true });

            // 如果目标就是尾巴，且当前坐标恰好是真实尾巴位置，则强制标记为可通行
            if (!walkable && isTargetTail && snapshot.body.length > 0) {
                const tail = snapshot.body;
                if (nextCell.x === tail.x && nextCell.y === tail.y) {
                    walkable = true;
                }
            }

            if (walkable) {
                const g = current.g + 1;
                const h = manhattan(nextCell, target);
                open.push({ cell: nextCell, g, h, parent: current, dir });
            }
        }
    }
    return null; // 无路可走
}

// 模拟走完一整条路径，返回走完后的状态快照
function simulatePath(snapshot, path, engine) {
    let curr = snapshot;
    for (const dir of path) {
        const res = engine.simulateStep(curr, dir);
        if (!res.ok) return null; // 路径在推演中途失效（通常不会发生，但为了安全起见）
        curr = res.snapshot;
    }
    return curr;
}

// 保命退路策略：当找不到食物或者吃食物必死时，寻找能活下去的一步
function getSafeFallbackMove(snapshot, engine) {
    const head = snapshot.head || snapshot.body[snapshot.body.length - 1];
    if (!head) return null;

    let bestMove = null;
    let maxSpace = -1;

    for (const dir of Object.values(DIRECTIONS)) {
        const vec = engine.getDirectionVector(dir);
        const next = { x: head.x + vec.x, y: head.y + vec.y };

        if (engine.isCellWalkable(next, snapshot, { allowTail: true })) {
            // 尝试模拟走这一步
            const sim = engine.simulateStep(snapshot, dir);
            if (sim.ok) {
                const simHead = sim.snapshot.body[sim.snapshot.body.length - 1];
                const simTail = sim.snapshot.body;

                // 走完这一步后，是否还能找到自己的尾巴？
                const pathToTail = findPath(sim.snapshot, simHead, simTail, engine, true);
                if (sim.snapshot.length <= 2 || pathToTail) {
                    // 如果能找到尾巴，这是一个安全的退路，优先选择绕远路（路径越长，拖延的时间越久）
                    const space = pathToTail ? pathToTail.length : 1;
                    if (space > maxSpace) {
                        maxSpace = space;
                        bestMove = dir;
                    }
                }
            }
        }
    }

    // 如果连能找到尾巴的安全路线都没了，那就只能走一步算一步（随便挑一个没撞墙的）
    if (!bestMove) {
        for (const dir of Object.values(DIRECTIONS)) {
            const vec = engine.getDirectionVector(dir);
            const next = { x: head.x + vec.x, y: head.y + vec.y };
            if (engine.isCellWalkable(next, snapshot, { allowTail: true })) {
                return dir;
            }
        }
    }

    return bestMove;
}

// 暴露给 registry.js 的策略工厂函数
export function createAStarSafeStrategy(engine, options = {}) {
    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            // 如果蛇还没出生，先让引擎走一步生成
            if (!head) {
                engine.step();
                return;
            }

            let nextDirection = null;

            if (state.food) {
                // 1. A* 寻路规划：寻找去食物的最短路径
                const pathToFood = findPath(state, head, state.food, engine, false);

                if (pathToFood && pathToFood.length > 0) {
                    // 2. 虚拟模拟 (Virtual Move)
                    const virtualState = simulatePath(engine.cloneState(), pathToFood, engine);

                    if (virtualState) {
                        const virtualHead = virtualState.body[virtualState.body.length - 1];
                        const virtualTail = virtualState.body;

                        // 3. 生存判定：吃完食物后，能否找到自己的尾巴？
                        const pathToTail = findPath(virtualState, virtualHead, virtualTail, engine, true);

                        // 如果蛇长度 <= 2（刚开始阶段），或者能找到尾巴，说明吃苹果是安全的
                        if (virtualState.length <= 2 || pathToTail) {
                            nextDirection = pathToFood;
                        }
                    }
                }
            }

            // 4. 保底策略 (Fallback)：吃不到苹果，或者吃苹果有去无回
            if (!nextDirection) {
                nextDirection = getSafeFallbackMove(state, engine);
            }

            // 执行移动
            if (nextDirection) {
                engine.setDirection(nextDirection);
            }

            const alive = engine.step();

            // 如果这一步撞死了，重置游戏
            if (!alive) {
                engine.reset();
            }
        }
    };
}