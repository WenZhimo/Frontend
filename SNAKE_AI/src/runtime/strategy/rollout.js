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

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 在快照上执行随机模拟直到死亡或达到 maxSteps。
 * 返回 { steps, foodEaten }。
 */
function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * ε-greedy 模拟：80% 概率朝食物方向走，20% 随机。
 * 这样 rollout 才能实际吃到食物，产生有意义的评分信号。
 */
function rollout(snapshot, engine, maxSteps) {
    let curr = snapshot;
    let steps = 0;
    let foodEaten = 0;
    let lastDir = curr.direction || DIRECTIONS.EAST;
    const EPSILON = 0.2;

    while (steps < maxSteps) {
        const head = curr.body[curr.body.length - 1];
        if (!head) break;

        const validDirs = [];
        const greedyDirs = [];
        const food = curr.food;

        for (const dir of DIR_LIST) {
            if (lastDir && OPPOSITES[lastDir] === dir && curr.body.length > 1) continue;
            const vec = DIR_VECTORS[dir];
            const next = { x: head.x + vec.x, y: head.y + vec.y };
            if (!engine.isCellWalkable(next, curr, { allowTail: true })) continue;
            validDirs.push(dir);
            // 贪心：距离食物最短的方向
            if (food) {
                const dist = manhattan(next, food);
                greedyDirs.push({ dir, dist });
            }
        }

        if (validDirs.length === 0) break;

        let chosen;
        if (Math.random() < EPSILON || !food || greedyDirs.length === 0) {
            // 探索：随机
            chosen = randomChoice(validDirs);
        } else {
            // 利用：选离食物最近的
            greedyDirs.sort((a, b) => a.dist - b.dist);
            chosen = greedyDirs[0].dir;
            // 确保 chosen 在 validDirs 中
            if (!validDirs.includes(chosen)) {
                chosen = randomChoice(validDirs);
            }
        }

        const sim = engine.simulateStep(curr, chosen);
        if (!sim.ok) break;

        curr = sim.snapshot;
        lastDir = chosen;
        steps += 1;
        if (sim.grew) foodEaten += 1;
    }

    return { steps, foodEaten };
}

/**
 * Rollout 策略工厂函数。
 *
 * 核心逻辑：
 *   1. 对每个可行方向，运行 N 次（~40）随机模拟（rollout）到死亡或步数上限。
 *   2. 统计每次模拟的存活步数和吃苹果数。
 *   3. 评分 = 平均存活步数 + 平均吃苹果数 × FOOD_BONUS。
 *   4. 选评分最高的方向执行。
 *
 * 不做树结构，不做 UCB，纯随机采样取平均。
 */
export function createRolloutStrategy(engine) {
    const NUM_ROLLOUTS = 25;
    const MAX_STEPS = 100;
    const FOOD_BONUS = 80;

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

                let totalSteps = 0;
                let totalFood = 0;

                for (let i = 0; i < NUM_ROLLOUTS; i += 1) {
                    const result = rollout(sim.snapshot, engine, MAX_STEPS);
                    totalSteps += result.steps;
                    totalFood += result.foodEaten;
                }

                const avgSteps = totalSteps / NUM_ROLLOUTS;
                const avgFood = totalFood / NUM_ROLLOUTS;
                const score = avgSteps + avgFood * FOOD_BONUS;

                candidates.push({ direction: dir, score });
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
            return { strategy: 'rollout' };
        },
    };
}
