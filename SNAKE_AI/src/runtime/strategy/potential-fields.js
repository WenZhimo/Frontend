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

/**
 * 势场法策略工厂函数。
 *
 * 核心逻辑（向量合成法）：
 *   1. 在蛇头处计算合力向量：
 *      - 食物引力向量：指向食物，大小 = K_ATTRACT / dist²
 *      - 蛇身斥力向量：远离每节身体，大小 = K_REPEL / dist²
 *      - 墙壁斥力向量：远离每面墙，大小 = K_WALL / wallDist²
 *   2. 对每个可行方向，计算方向单位向量与合力向量的点积。
 *   3. 选点积最大的方向（即最接近合力指向的方向）。
 *
 * 与标量势能法的区别：向量合成能正确处理力的方向，
 * 不会在障碍物附近出现局部平衡点导致蛇原地打转。
 */
export function createPotentialFieldsStrategy(engine) {
    const K_ATTRACT = 40;
    const K_REPEL = 4;
    const K_WALL = 3;

    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            if (!head) {
                engine.step();
                return;
            }

            const food = state.food;
            const body = state.body;
            const columns = state.columns;
            const rows = state.rows;

            // ---- 计算合力向量 ----
            let fx = 0;
            let fy = 0;

            // 食物引力：指向食物
            if (food) {
                const dx = food.x - head.x;
                const dy = food.y - head.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.01) {
                    const mag = K_ATTRACT / (dist * dist);
                    fx += (dx / dist) * mag;
                    fy += (dy / dist) * mag;
                }
            }

            // 蛇身斥力：远离每节身体（不含头和尾）
            const protectedBody = body.slice(1, -1);
            for (const seg of protectedBody) {
                const dx = head.x - seg.x;
                const dy = head.y - seg.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > 0.01) {
                    const dist = Math.sqrt(distSq);
                    const mag = K_REPEL / distSq;
                    fx += (dx / dist) * mag;
                    fy += (dy / dist) * mag;
                }
            }

            // 墙壁斥力：远离每面墙（墙越近推力越大）
            const wallLeft = head.x;
            const wallRight = columns - 1 - head.x;
            const wallTop = head.y;
            const wallBottom = rows - 1 - head.y;

            if (wallLeft < 3) {
                fx += K_WALL / Math.max(0.3, wallLeft * wallLeft);
            }
            if (wallRight < 3) {
                fx -= K_WALL / Math.max(0.3, wallRight * wallRight);
            }
            if (wallTop < 3) {
                fy += K_WALL / Math.max(0.3, wallTop * wallTop);
            }
            if (wallBottom < 3) {
                fy -= K_WALL / Math.max(0.3, wallBottom * wallBottom);
            }

            // ---- 选评分最高的可行方向 ----
            // 评分 = 合力点积 + 食物距离奖励
            // 点积衡量方向与合力的对齐度，食物奖励确保不因局部斥力忽略食物
            const candidates = [];

            for (const dir of DIR_LIST) {
                if (state.direction && OPPOSITES[state.direction] === dir && body.length > 1) {
                    continue;
                }

                const vec = DIR_VECTORS[dir];
                const next = { x: head.x + vec.x, y: head.y + vec.y };

                if (!engine.isCellWalkable(next, state, { allowTail: true })) continue;

                // 点积：方向向量与合力向量的对齐程度
                const dot = vec.x * fx + vec.y * fy;

                // 食物距离奖励：朝食物走时加分
                let foodBias = 0;
                if (food) {
                    const currDist = Math.abs(head.x - food.x) + Math.abs(head.y - food.y);
                    const nextDist = Math.abs(next.x - food.x) + Math.abs(next.y - food.y);
                    foodBias = (currDist - nextDist) * 50;
                }

                candidates.push({ direction: dir, score: dot + foodBias });
            }

            if (candidates.length === 0) {
                engine.reset();
                return;
            }

            candidates.sort((a, b) => b.score - a.score);

            const best = candidates[0];

            if (engine.setDirection(best.direction)) {
                const alive = engine.step();
                if (!alive) engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'potential-fields' };
        },
    };
}
