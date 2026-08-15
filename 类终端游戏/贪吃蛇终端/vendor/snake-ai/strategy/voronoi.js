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
 * 计算蛇头在快照中的 Voronoi 领地面积。
 *
 * 方法：从蛇头 BFS，对每个到达的格子，检查它到蛇头（BFS 距离）
 * 是否小于到任何蛇身段（曼哈顿距离）。若是，则属于蛇头的领地。
 */
function voronoiArea(snapshot, head, engine) {
    if (!snapshot.body || snapshot.body.length === 0) return 0;

    const bodySegments = snapshot.body.slice(0, -1); // 不含头
    if (bodySegments.length === 0) {
        // 没有身体，所有可达格子都属于头部领地
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
        return area;
    }

    // 多源 BFS：从蛇头和所有身体段同时出发
    // 用距离图记录谁先到达
    const sources = [];
    sources.push({ cell: head, type: 'head', dist: 0 });
    for (const seg of bodySegments) {
        sources.push({ cell: seg, type: 'body', dist: 0 });
    }

    const distMap = new Map(); // key -> { dist, owner }
    const queue = [...sources];
    let headIdx = 0;

    for (const src of sources) {
        distMap.set(getKey(src.cell), { dist: 0, owner: src.type });
    }

    while (headIdx < queue.length) {
        const current = queue[headIdx];
        headIdx += 1;

        for (const d of DIR_LIST) {
            const v = DIR_VECTORS[d];
            const next = { x: current.cell.x + v.x, y: current.cell.y + v.y };
            const key = getKey(next);

            if (distMap.has(key)) continue;

            // 仅 BFS 通过可行走格子（对 body 源也如此，以便正确计算领地）
            if (!engine.isCellWalkable(next, snapshot, { allowTail: true })) continue;

            const entry = { dist: current.dist + 1, owner: current.owner };
            distMap.set(key, entry);
            queue.push({ cell: next, ...entry });
        }
    }

    // 统计属于蛇头的格子数
    let territory = 0;
    for (const [, entry] of distMap) {
        if (entry.owner === 'head') {
            territory += 1;
        }
    }

    return territory;
}

/**
 * Voronoi 策略工厂函数。
 *
 * 核心逻辑：
 *   1. 对每个可行方向，模拟一步后计算蛇头的 Voronoi 领地面积。
 *      ——即蛇头 BFS 比蛇身各段先到达的格子数。
 *   2. 选领地面积最大的方向（蛇头控制最多空间）。
 *   3. 领地相同时选离食物近的方向。
 */
export function createVoronoiStrategy(engine) {
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
                const territory = voronoiArea(sim.snapshot, simHead, engine);
                const dist = food ? manhattan(next, food) : 0;

                candidates.push({ direction: dir, territory, distance: dist });
            }

            if (candidates.length === 0) {
                engine.reset();
                return;
            }

            // 主键：领地大优先；次键：离食物近
            candidates.sort((a, b) => b.territory - a.territory || a.distance - b.distance);

            const best = candidates[0];

            if (engine.setDirection(best.direction)) {
                const alive = engine.step();
                if (!alive) engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'voronoi' };
        },
    };
}
