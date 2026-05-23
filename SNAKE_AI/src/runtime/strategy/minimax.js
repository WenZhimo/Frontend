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

/**
 * 叶子节点启发式评估。
 * 综合可达面积、食物距离、安全方向数。
 */
function evaluateState(snapshot, engine) {
    const head = snapshot.body[snapshot.body.length - 1];
    if (!head) return -999;

    // 可达面积
    let area = 0;
    const queue = [head];
    const visited = new Set();
    visited.add(getKey(head));
    let hi = 0;
    while (hi < queue.length) {
        const cur = queue[hi]; hi += 1;
        area += 1;
        for (const d of DIR_LIST) {
            const v = DIR_VECTORS[d];
            const nb = { x: cur.x + v.x, y: cur.y + v.y };
            if (visited.has(getKey(nb))) continue;
            if (!engine.isCellWalkable(nb, snapshot, { allowTail: true })) continue;
            visited.add(getKey(nb));
            queue.push(nb);
        }
    }

    // 食物距离（越近越好）
    let foodScore = 0;
    if (snapshot.food) {
        const dist = manhattan(head, snapshot.food);
        foodScore = -dist; // 负值，距离越近（小）→ 分数越高
    }

    // 安全方向数
    let safeMoves = 0;
    for (const d of DIR_LIST) {
        const v = DIR_VECTORS[d];
        const nb = { x: head.x + v.x, y: head.y + v.y };
        if (engine.isCellWalkable(nb, snapshot, { allowTail: true })) {
            safeMoves += 1;
        }
    }

    // 综合评分：食物距离最重要，面积和安全度作为辅助
    return area * 3 + foodScore * 8 + safeMoves * 2;
}

/**
 * Minimax 递归搜索。
 * depth: 剩余搜索深度。
 * isMax: true 表示蛇的回合（选最大），false 表示环境的回合（选最小）。
 *
 * 简化处理：
 * - 蛇的回合：尝试 4 个方向，选评估值最大的
 * - 环境的回合：仅模拟一步（食物随机/尾收缩），选评估值最小的
 */
function minimax(snapshot, engine, depth, isMax) {
    const head = snapshot.body[snapshot.body.length - 1];
    if (!head) return -9999;

    // 终止条件
    if (depth === 0) {
        return evaluateState(snapshot, engine);
    }

    if (isMax) {
        // 蛇的回合：尝试各方向
        let bestValue = -Infinity;
        let hasMove = false;

        for (const dir of DIR_LIST) {
            if (snapshot.direction && OPPOSITES[snapshot.direction] === dir && snapshot.body.length > 1) {
                continue;
            }

            const vec = DIR_VECTORS[dir];
            const next = { x: head.x + vec.x, y: head.y + vec.y };

            if (!engine.isCellWalkable(next, snapshot, { allowTail: true })) continue;

            const sim = engine.simulateStep(snapshot, dir);
            if (!sim.ok) continue;

            hasMove = true;
            const value = minimax(sim.snapshot, engine, depth - 1, false) + (sim.grew ? 500 : 0);
            if (value > bestValue) bestValue = value;
        }

        if (!hasMove) return -9999; // 无路可走
        return bestValue;
    } else {
        // 环境的回合（简化：仅在当前方向上再走一步，
        // 或模拟食物不可达等负面情况）
        // 实际做法：取所有可能移动中最差的结果
        let worstValue = Infinity;
        let hasMove = false;

        for (const dir of DIR_LIST) {
            if (snapshot.direction && OPPOSITES[snapshot.direction] === dir && snapshot.body.length > 1) {
                continue;
            }

            const vec = DIR_VECTORS[dir];
            const next = { x: head.x + vec.x, y: head.y + vec.y };

            if (!engine.isCellWalkable(next, snapshot, { allowTail: true })) continue;

            const sim = engine.simulateStep(snapshot, dir);
            if (!sim.ok) continue;

            hasMove = true;
            const value = minimax(sim.snapshot, engine, depth - 1, true) + (sim.grew ? 500 : 0);
            if (value < worstValue) worstValue = value;
        }

        if (!hasMove) return -9999;
        return worstValue;
    }
}

/**
 * Minimax 策略工厂函数。
 *
 * 核心逻辑：
 *   1. 构建深度 D 的博弈树（默认 3 层）。
 *   2. 蛇是 max 玩家，环境（蛇身移动/食物位置）是 min 玩家。
 *   3. 叶子节点用启发式评估：可达面积 + 食物距离 + 安全方向数。
 *   4. 用 minimax 反向传播，选根节点最优方向。
 */
export function createMinimaxStrategy(engine) {
    const SEARCH_DEPTH = 3;

    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            if (!head) {
                engine.step();
                return;
            }

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

                const value = minimax(sim.snapshot, engine, SEARCH_DEPTH - 1, false);
                candidates.push({ direction: dir, value });
            }

            if (candidates.length === 0) {
                engine.reset();
                return;
            }

            candidates.sort((a, b) => b.value - a.value);

            const best = candidates[0];

            if (engine.setDirection(best.direction)) {
                const alive = engine.step();
                if (!alive) engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'minimax' };
        },
    };
}
