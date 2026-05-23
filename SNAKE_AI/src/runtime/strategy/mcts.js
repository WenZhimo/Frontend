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
 * MCTS 树节点。
 */
function createNode(snapshot, parent, direction) {
    return {
        snapshot,
        parent,
        direction,
        children: [],
        visits: 0,
        wins: 0,
        untriedDirs: null, // 延迟计算
    };
}

/**
 * 随机模拟（rollout），返回得分。
 * 得分 = 存活步数 + 吃苹果数 × 100。
 */
function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * ε-greedy 模拟：80% 朝食物，20% 随机。
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
            if (food) {
                greedyDirs.push({ dir, dist: manhattan(next, food) });
            }
        }

        if (validDirs.length === 0) break;

        let chosen;
        if (Math.random() < EPSILON || !food || greedyDirs.length === 0) {
            chosen = randomChoice(validDirs);
        } else {
            greedyDirs.sort((a, b) => a.dist - b.dist);
            chosen = greedyDirs[0].dir;
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

    return steps + foodEaten * 100;
}

/**
 * UCB1 公式。
 */
function ucb1(node, parentVisits, explorationConstant) {
    if (node.visits === 0) return Infinity;
    const exploit = node.wins / node.visits;
    const explore = explorationConstant * Math.sqrt(Math.log(parentVisits) / node.visits);
    return exploit + explore;
}

/**
 * 获取节点的未尝试方向列表。
 */
function getUntriedDirs(node, engine) {
    if (node.untriedDirs) return node.untriedDirs;

    const snapshot = node.snapshot;
    const head = snapshot.body[snapshot.body.length - 1];
    if (!head) {
        node.untriedDirs = [];
        return node.untriedDirs;
    }

    const dirs = [];
    for (const dir of DIR_LIST) {
        if (snapshot.direction && OPPOSITES[snapshot.direction] === dir && snapshot.body.length > 1) {
            continue;
        }
        const vec = DIR_VECTORS[dir];
        const next = { x: head.x + vec.x, y: head.y + vec.y };
        if (!engine.isCellWalkable(next, snapshot, { allowTail: true })) continue;

        const sim = engine.simulateStep(snapshot, dir);
        if (!sim.ok) continue;

        dirs.push(dir);
    }

    node.untriedDirs = dirs;
    return dirs;
}

/**
 * Selection：从根出发，沿 UCB1 最大路径前进，直到到达可扩展或终端的节点。
 */
function select(node, engine, explorationConstant) {
    while (true) {
        const untried = getUntriedDirs(node, engine);

        if (untried.length > 0 || node.children.length === 0) {
            // 有未尝试方向或没有子节点 → 在此扩展
            return node;
        }

        // 全部子节点已尝试 → 选 UCB1 最好的
        let bestChild = null;
        let bestUcb = -Infinity;
        for (const child of node.children) {
            const ucb = ucb1(child, node.visits, explorationConstant);
            if (ucb > bestUcb) {
                bestUcb = ucb;
                bestChild = child;
            }
        }

        if (!bestChild) return node;
        node = bestChild;
    }
}

/**
 * Expansion：从未尝试方向中随机选一个，生成新子节点。
 */
function expand(node, engine) {
    const untried = getUntriedDirs(node, engine);
    if (untried.length === 0) return null;

    const dir = untried[Math.floor(Math.random() * untried.length)];
    const sim = engine.simulateStep(node.snapshot, dir);
    if (!sim.ok) return null;

    const child = createNode(sim.snapshot, node, dir);
    node.children.push(child);
    // 从 untried 中移除已选方向
    node.untriedDirs = untried.filter((d) => d !== dir);

    return child;
}

/**
 * Backpropagation：从叶子节点向上更新访问次数和得分。
 */
function backpropagate(node, score) {
    let cur = node;
    while (cur) {
        cur.visits += 1;
        cur.wins += score;
        cur = cur.parent;
    }
}

/**
 * MCTS 策略工厂函数。
 *
 * 核心逻辑（标准 MCTS 四阶段）：
 *   1. Selection：从根节点沿 UCB1 最大路径向下选到可扩展节点。
 *   2. Expansion：从未尝试方向中随机选一个，生成新子节点。
 *   3. Simulation：从新节点出发随机 rollout 到终止或达到步数上限。
 *   4. Backpropagation：将模拟得分反向传播到根路径上所有节点。
 *   重复 ITERATIONS 次后，选根节点下访问次数最多的方向执行。
 */
export function createMCTSStrategy(engine) {
    const ITERATIONS = 100;
    const MAX_ROLLOUT_STEPS = 60;
    const EXPLORATION_CONSTANT = 1.4;

    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];

            if (!head) {
                engine.step();
                return;
            }

            // 检查根节点是否有合法移动
            let hasMove = false;
            for (const dir of DIR_LIST) {
                if (state.direction && OPPOSITES[state.direction] === dir && state.body.length > 1) continue;
                const vec = DIR_VECTORS[dir];
                const next = { x: head.x + vec.x, y: head.y + vec.y };
                if (engine.isCellWalkable(next, state, { allowTail: true })) {
                    hasMove = true;
                    break;
                }
            }

            if (!hasMove) {
                engine.reset();
                return;
            }

            const root = createNode(state, null, null);

            for (let i = 0; i < ITERATIONS; i += 1) {
                // Selection
                const leaf = select(root, engine, EXPLORATION_CONSTANT);

                // 检查是否终端（无合法移动）
                const leafHead = leaf.snapshot.body[leaf.snapshot.body.length - 1];
                let leafHasMove = false;
                if (leafHead) {
                    for (const dir of DIR_LIST) {
                        const vec = DIR_VECTORS[dir];
                        const nb = { x: leafHead.x + vec.x, y: leafHead.y + vec.y };
                        if (engine.isCellWalkable(nb, leaf.snapshot, { allowTail: true })) {
                            leafHasMove = true;
                            break;
                        }
                    }
                }

                if (!leafHasMove) {
                    backpropagate(leaf, 0);
                    continue;
                }

                // Expansion
                const child = expand(leaf, engine);
                const simNode = child || leaf;

                // Simulation
                const score = rollout(simNode.snapshot, engine, MAX_ROLLOUT_STEPS);

                // Backpropagation
                backpropagate(simNode, score);
            }

            // 选访问次数最多的子节点
            let bestChild = null;
            let bestVisits = -1;

            for (const child of root.children) {
                if (child.visits > bestVisits) {
                    bestVisits = child.visits;
                    bestChild = child;
                }
            }

            if (bestChild && bestChild.direction) {
                if (engine.setDirection(bestChild.direction)) {
                    const alive = engine.step();
                    if (!alive) engine.reset();
                }
            } else {
                engine.reset();
            }
        },

        getMeta() {
            return { strategy: 'mcts' };
        },
    };
}
