import { createAStarSafeStrategy } from './astar-safe.js';
import { createHamiltonianCycleStrategy } from './hamiltonian-cycle.js';
import { createHamiltonianShortcutStrategy } from './hamiltonian-shortcuts.js';
import { createSnakeAIStrategy } from './snakeai-nn.js';
import { createGreedyStrategy } from './greedy.js';
import { createBFSStrategy } from './bfs.js';
import { createFloodFillStrategy } from './flood-fill.js';
import { createLongestPathStrategy } from './longest-path.js';
import { createDijkstraStrategy } from './dijkstra.js';
import { createPotentialFieldsStrategy } from './potential-fields.js';
import { createRolloutStrategy } from './rollout.js';
import { createIDAStarStrategy } from './ida-star.js';
import { createVoronoiStrategy } from './voronoi.js';
import { createMinimaxStrategy } from './minimax.js';
import { createMCTSStrategy } from './mcts.js';

export const STRATEGY_MANIFEST = {
    'astar-safe': {
        label: 'A* SAFE',
        description: '使用最短路径去苹果，虚拟模拟吃完后的未来状态，并检查蛇头是否仍能到达蛇尾；若不安全则转入追尾保命模式。',
        factory: createAStarSafeStrategy,
    },
    'hamiltonian-cycle': {
        label: 'HAMILTONIAN',
        description: '严格沿哈密尔顿环巡航，绝对稳定，但遇到近处苹果也不会主动抄近路。',
        factory: createHamiltonianCycleStrategy,
    },
    'hamiltonian-shortcuts': {
        label: 'HAMILTONIAN+',
        description: '在哈密尔顿环基础上尝试安全抄近道，只要不会破坏拓扑安全，就会更积极地接近苹果。',
        factory: createHamiltonianShortcutStrategy,
    },
    'snakeai-nn-phone': {
        label: 'SNAKEAI 手机',
        description: '使用为手机 19.5:9 棋盘训练的 SnakeAI 神经网络模型，并强制切换到 26×12 棋盘。',
        factory: (engine, options = {}) => createSnakeAIStrategy(engine, {
            ...options,
            profileId: 'phone',
            modelUrl: '/data/models/profiles/phone.json',
        }),
    },
    'greedy': {
        label: 'GREEDY',
        description: '贪心策略：每步在安全方向中选离苹果曼哈顿距离最近的，仅做一步前瞻过滤死胡同，不做全局规划。',
        factory: createGreedyStrategy,
    },
    'bfs': {
        label: 'BFS',
        description: 'BFS 策略：广度优先搜索最短路径吃苹果，虚拟模拟吃完后 BFS 检查能否到达蛇尾；不安全则 BFS 追尾保命，最后 BFS 面积评估兜底。',
        factory: createBFSStrategy,
    },
    'flood-fill': {
        label: 'FLOOD FILL',
        description: 'Flood Fill 策略：每步 BFS 计算各方向连通面积，永远朝最宽敞区域走；面积相同时优先走近的食物。',
        factory: createFloodFillStrategy,
    },
    'longest-path': {
        label: 'LONGEST PATH',
        description: '最长路径策略：在保持食物可达的前提下，故意绕远路拖延时间等蛇尾腾出空间；食物不可达时追尾保命。',
        factory: createLongestPathStrategy,
    },
    'dijkstra': {
        label: 'DIJKSTRA',
        description: 'Dijkstra 策略：带权最短路径——靠近蛇身的格子代价更高，蛇会绕开拥挤区域走宽敞路线；不安全则追尾保命。',
        factory: createDijkstraStrategy,
    },
    'potential-fields': {
        label: 'POTENTIAL',
        description: '势场法策略：食物引力 + 蛇身斥力 + 墙壁斥力合成势场，每步朝势场最高的方向移动。',
        factory: createPotentialFieldsStrategy,
    },
    'rollout': {
        label: 'ROLLOUT',
        description: 'Rollout 策略：每方向运行 40 次随机模拟到死亡，统计平均存活步数与吃苹果数，选评分最高的方向。',
        factory: createRolloutStrategy,
    },
    'ida-star': {
        label: 'IDA*',
        description: 'IDA* 策略：迭代加深 A*——用 DFS + 阈值迭代替代优先队列，内存友好；其余安全判定等同 A* SAFE。',
        factory: createIDAStarStrategy,
    },
    'voronoi': {
        label: 'VORONOI',
        description: 'Voronoi 策略：多源 BFS 计算蛇头领地面积（比身体各段更近的格子数），选领地最大的方向，保持最大活动空间。',
        factory: createVoronoiStrategy,
    },
    'minimax': {
        label: 'MINIMAX',
        description: 'Minimax 策略：3 层博弈树搜索——蛇为 max 玩家，环境为 min 玩家，叶子用面积/食物距离/安全度评估。',
        factory: createMinimaxStrategy,
    },
    'mcts': {
        label: 'MCTS',
        description: 'MCTS 策略：蒙特卡洛树搜索——200 轮 Selection/Expansion/Simulation/Backpropagation，UCB1 平衡探索利用，选访问最多的方向。',
        factory: createMCTSStrategy,
    },
    'snakeai-nn-pc': {
        label: 'SNAKEAI PC',
        description: '使用为 PC 16:9 棋盘训练的 SnakeAI 神经网络模型，并强制切换到 32×18 棋盘。',
        factory: (engine, options = {}) => createSnakeAIStrategy(engine, {
            ...options,
            profileId: 'pc',
            modelUrl: '/data/models/profiles/pc.json',
        }),
    },
    'snakeai-nn-tablet': {
        label: 'SNAKEAI 平板',
        description: '使用为平板 4:3 棋盘训练的 SnakeAI 神经网络模型，并强制切换到 32×24 棋盘。',
        factory: (engine, options = {}) => createSnakeAIStrategy(engine, {
            ...options,
            profileId: 'tablet',
            modelUrl: '/data/models/profiles/tablet.json',
        }),
    },
};

export function listStrategies() {
    return Object.entries(STRATEGY_MANIFEST).map(([id, meta]) => ({ id, ...meta }));
}

export function pickRandomStrategy(ids = Object.keys(STRATEGY_MANIFEST)) {
    const available = ids.filter((id) => STRATEGY_MANIFEST[id]);
    if (available.length === 0) {
        throw new Error('No available snake strategies');
    }
    const index = Math.floor(Math.random() * available.length);
    return available[index];
}

export async function createStrategyById(id, engine, options = {}) {
    const meta = STRATEGY_MANIFEST[id];
    if (!meta) {
        throw new Error(`Unknown snake strategy: ${id}`);
    }

    return {
        id,
        label: meta.label,
        description: meta.description,
        runner: meta.factory(engine, options),
    };
}
