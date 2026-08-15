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

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * 统计某个格子在快照中拥有多少个可通行的相邻格子（不含自身）。
 * 蛇尾视为可通行（allowTail = true），因为下一步蛇尾会移开。
 */
function countOpenNeighbors(cell, snapshot, engine) {
    let count = 0;
    for (const dir of Object.values(DIRECTIONS)) {
        const vec = DIR_VECTORS[dir];
        const neighbor = { x: cell.x + vec.x, y: cell.y + vec.y };
        if (engine.isCellWalkable(neighbor, snapshot, { allowTail: true })) {
            count += 1;
        }
    }
    return count;
}

/**
 * 贪心策略工厂函数。
 *
 * 核心逻辑：
 *   1. 收集所有不反向、不立即撞墙的可行方向。
 *   2. 模拟执行该方向一步，统计移动后蛇头周围的可通行格子数。
 *   3. 过滤掉移动后 openNeighbors === 0 的死胡同方向（除非蛇长 ≤ 2）。
 *   4. 在剩余候选中，贪心选择到食物曼哈顿距离最近的方向；
 *      距离相同时，优先选 openNeighbors 更多的方向。
 *   5. 若所有方向都被过滤，则退回全部可行方向中贪心选择。
 *
 * 策略本质始终是"朝食物走最近的"，安全修正仅做最轻量的
 * 一步前瞻过滤，不涉及 A* 寻路、哈密尔顿环等全局规划。
 */
export function createGreedyStrategy(engine) {
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

            for (const dir of Object.values(DIRECTIONS)) {
                // 不反向
                if (state.direction && OPPOSITES[state.direction] === dir && state.body.length > 1) {
                    continue;
                }

                const vec = DIR_VECTORS[dir];
                const next = { x: head.x + vec.x, y: head.y + vec.y };

                if (!engine.isCellWalkable(next, state, { allowTail: true })) {
                    continue;
                }

                // 模拟一步，检查移动后蛇头周围的自由度
                const sim = engine.simulateStep(state, dir);
                if (!sim.ok) {
                    continue;
                }

                const simHead = sim.snapshot.body[sim.snapshot.body.length - 1];
                const openNeighbors = countOpenNeighbors(simHead, sim.snapshot, engine);
                const dist = food ? manhattan(next, food) : 0;

                candidates.push({ direction: dir, distance: dist, openNeighbors });
            }

            if (candidates.length === 0) {
                engine.reset();
                return;
            }

            // 过滤掉一步后就被困死的方向（除非蛇很短，容错）
            const safeCandidates = candidates.filter(
                (c) => c.openNeighbors > 0 || state.body.length <= 2,
            );

            const pool = safeCandidates.length > 0 ? safeCandidates : candidates;

            // 贪心排序：主键 = 到食物的距离（越近越好），次键 = 自由度（越多越好）
            pool.sort((a, b) => a.distance - b.distance || b.openNeighbors - a.openNeighbors);

            const best = pool[0];

            if (engine.setDirection(best.direction)) {
                const alive = engine.step();
                if (!alive) {
                    engine.reset();
                }
            }
        },

        getMeta() {
            return { strategy: 'greedy' };
        },
    };
}
